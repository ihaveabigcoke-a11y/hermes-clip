import {assertMuseAvailable,assertMuseNewTask,runMuseTask} from './muse-pause.mjs';
import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {MuseAdapter} from './muse.mjs';
import {museQuotaExhausted} from './muse-quota.mjs';
import {safeMessage} from './contracts.mjs';
import {checkedChatAttachments} from './muse-chat-attachments.mjs';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const projectScope = z.string().regex(/^[a-zA-Z0-9_-]{1,240}$/);
export const chatInput = z.object({requestId: id, profileId: id, projectId: projectScope,
  prompt: z.string().trim().min(1).max(16000), parentId: id.nullable().default(null)});
const input = chatInput.extend({attachments:z.array(z.string().min(1).max(4096)).max(4, 'Tối đa 4 ảnh đính kèm.').optional()});
const assistantSelector = '[data-message-id][data-message-role="assistant"]';

export class MuseChat {
  constructor(worker) {
    this.worker = worker;
    this.store = worker.store;
    this.store.db.exec('CREATE TABLE IF NOT EXISTS muse_chats(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, body TEXT NOT NULL)');
    for (const row of this.store.db.prepare('SELECT body FROM muse_chats').all()) {
      const chat = JSON.parse(row.body);
      if (chat.state === 'preparing' || chat.state === 'waiting') {
        this.save({...chat, state: chat.state === 'preparing' ? 'failed' : 'needs_attention',
          error: 'Phiên trước bị gián đoạn. Đọc lại hội thoại Muse để đối soát.'});
      }
    }
  }

  get(requestId) {
    const row = this.store.db.prepare('SELECT body FROM muse_chats WHERE id=?').get(requestId);
    return row ? JSON.parse(row.body) : null;
  }

  list(payload) {
    const scope = z.object({projectId: projectScope.optional()}).parse(payload ?? {});
    const rows = scope.projectId
      ? this.store.db.prepare('SELECT body FROM muse_chats WHERE project_id=? ORDER BY rowid').all(scope.projectId)
      : this.store.db.prepare('SELECT body FROM muse_chats ORDER BY rowid').all();
    return rows.map(row => JSON.parse(row.body));
  }

  pin(payload) {
    const value = z.object({requestId: id, pinned: z.boolean()}).parse(payload);
    const chat = this.get(value.requestId);
    if (!chat) throw Error('Không tìm thấy hội thoại.');
    return this.save({...chat, pinned: value.pinned});
  }

  skipReconciliation(payload) {
    const chat = this.get(id.parse(payload.requestId));
    if (!chat || !['unknown', 'needs_attention'].includes(chat.state)) throw Error('Chọn hội thoại Muse có kết quả chưa rõ.');
    if (this.worker.chatting.has(chat.profileId)) throw Error('Chờ hội thoại đang chạy kết thúc.');
    if (chat.reconciled) return chat;
    return this.save({...chat, reconciled:true, reconciliation:'skipped', reconciledAt:Date.now()});
  }

  async open(payload) {
    assertMuseNewTask(this.store);
    const chat = this.get(id.parse(payload.requestId));
    if (!chat) throw Error('Không tìm thấy hội thoại.');
    const url = this.threadUrl(chat.providerUrl);
    this.lock(chat.profileId);
    try {
      const context = await this.worker.context(chat.profileId, false);
      await this.worker.connectVpn(chat.profileId, context);
      const page = context.pages().find(page => page.url() === url) ?? await context.newPage();
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
      await this.worker.setProfileVisibility(chat.profileId, true);
      await page.bringToFront();
      return true;
    } finally {
      this.worker.chatting.delete(chat.profileId);
      this.worker.tick();
    }
  }

  save(chat) {
    const value = {...chat, provider:'muse', updatedAt: Date.now()};
    this.store.db.prepare('INSERT INTO muse_chats VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(value.requestId, value.projectId, JSON.stringify(value));
    return value;
  }

  lock(profileId) {
    const worker = this.worker;
    if (!worker.store.get('profiles', []).some(profile => profile.id === profileId && profile.enabled)) {
      throw Error('Chọn profile Muse đang bật.');
    }
    if (worker.active.has(profileId) || worker.checking.has(profileId) || worker.closing.has(profileId) || worker.chatting.has(profileId)) {
      throw Error('Profile đang xử lý tác vụ. Chờ tác vụ kết thúc rồi gửi chat.');
    }
    worker.chatting.add(profileId);
  }

  beginSubmit(chat) {
    assertMuseAvailable(this.store, {jobId:chat.requestId, profileId:chat.profileId});
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      const batch = this.store.batch() ?? {id: randomUUID(), startedAt: Date.now(), perProfileLimit: 3, submittedByProfile: {}};
      const count = batch.submittedByProfile[chat.profileId] ?? 0;
      if (count >= 3) throw Error('Profile đã dùng đủ 3 lượt trong đợt. Mở đợt mới trong Tài khoản.');
      this.store.set('generation_batch', {...batch, submittedByProfile: {...batch.submittedByProfile, [chat.profileId]: count + 1}});
      const saved = this.save({...chat, state: 'waiting', submitBatchId: batch.id});
      this.store.db.exec('COMMIT');
      return saved;
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }

  async send(payload) {
    assertMuseNewTask(this.store);
    const value = input.parse(payload);
    return runMuseTask(this.store, {jobId:value.requestId, profileId:value.profileId}, () => this.sendAdmitted(value));
  }
  async sendAdmitted(payload) {
    const {attachments, ...value} = input.parse(payload);
    if (attachments?.length && value.parentId) throw Error('Chỉ đính kèm ảnh khi bắt đầu hội thoại mới.');
    const references = attachments?.length ? await checkedChatAttachments(this.worker.root, attachments) : [];
    // Keep the exact legacy object/order/defaults for text-only receipts.
    const fingerprint = createHash('sha256').update(JSON.stringify(references.length
      ? {...value, attachments:references.map(reference => reference.sha256)} : value)).digest('hex');
    const existing = this.get(value.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw Error('Mã yêu cầu đã gắn với nội dung khác.');
      return existing;
    }
    const parent = value.parentId ? this.get(value.parentId) : null;
    if (value.parentId && (!parent || parent.state !== 'done' || parent.profileId !== value.profileId || parent.projectId !== value.projectId)) {
      throw Error('Hội thoại trước chưa hoàn tất hoặc thuộc profile khác.');
    }
    const config = this.worker.config();
    if (!config?.enabled || !new MuseAdapter(config).chatMode) throw Error('Cấu hình luồng Muse trong Tài khoản trước khi chat.');
    this.lock(value.profileId);
    let page;
    try {
      let chat = this.save({...value, ...(references.length ? {attachments:references} : {}), fingerprint, state: 'preparing', createdAt: Date.now(), response: '',
        providerId: null, providerUrl: parent?.providerUrl ?? null, oldAssistantIds: [], error: null});
      if (references.length && !config.upload) throw Error('Luồng Muse chưa cấu hình tải ảnh đính kèm. Chưa gửi prompt, chưa tính lượt.');
      const context = await this.worker.context(value.profileId, true);
      await this.worker.connectVpn(value.profileId, context);
      page = await context.newPage();
      await this.worker.setProfileVisibility(value.profileId, false);
      const quota = await this.worker.measureQuota(value.profileId, context);
      if (museQuotaExhausted(quota)) throw Error('Muse đã hết hạn mức theo lần đo mới nhất.');
      if (quota?.state !== 'available' || (quota.weeklyRemainingPercent === 0 && !(quota.additionalTokens > 0))) throw Error('Chưa xác minh được hạn mức Muse. Đo lại trong Tài khoản.');
      const adapter = new MuseAdapter(config);
      if (parent) {
        await page.goto(this.threadUrl(parent.providerUrl), {waitUntil: 'domcontentloaded', timeout: 30000});
        if (!await adapter.session(page)) throw Error('Đăng nhập lại Muse trong profile đã chọn.');
        // The prompt editor appears before an existing thread's messages hydrate.
        // Wait for the acknowledged parent before freezing the pre-submit history.
        await this.historyThroughParent(page,parent);
        await page.getByRole('button', {name: 'Stop', exact: true}).waitFor({state: 'hidden', timeout: 30000});
        if ((await page.locator(config.prompt).inputValue()).trim()) throw Error('Hội thoại Muse đang có bản nháp. Lưu bản nháp trước khi chat.');
        await page.locator(config.prompt).fill(this.textPrompt(value.prompt));
      } else {
        if (references.length) {
          const current = await checkedChatAttachments(this.worker.root, attachments);
          if (current.some((reference, index) => reference.sha256 !== references[index].sha256))
            throw Error('Ảnh đính kèm đã đổi trước khi gửi. Chưa tính lượt Muse.');
        }
        await adapter.prepare(page, {prompt: this.textPrompt(value.prompt), references});
      }
      this.worker.profileHealth(value.profileId, 'ready');
      chat = this.beginSubmit({...chat, providerUrl: page.url(),
        oldUserIds: await page.locator('[data-message-id][data-message-role="user"]')
          .evaluateAll(elements => elements.map(element => element.getAttribute('data-message-id'))),
        oldAssistantIds: await page.locator(assistantSelector)
          .evaluateAll(elements => elements.map(element => element.getAttribute('data-message-id')))});
      await page.getByRole('button', {name: config.submitName, exact: true}).click({timeout: 30000});
      const result = await this.readResponse(page, chat);
      await this.worker.measureQuota(value.profileId, context);
      return result;
    } catch (error) {
      const chat = this.get(value.requestId);
      if (!chat) throw error;
      if (chat.state === 'done') return chat;
      return this.save({...chat, state: chat.state === 'preparing' ? 'failed' : 'needs_attention',
        errorCode: error.code ?? null, error: references.length && error.code === 'MUSE_ATTACHMENT_NOT_READY'
          ? 'Muse chưa xác nhận ảnh đính kèm đã tải xong. Chưa gửi prompt, chưa tính lượt.'
          : error.code === 'MUSE_CHAT_TIMEOUT' ? error.message : error.code ? safeMessage(error) : String(error.message).slice(0, 600)});
    } finally {
      await page?.close().catch(() => {});
      this.worker.chatting.delete(value.profileId);
      this.worker.tick();
    }
  }

  textPrompt(prompt) {
    return 'For this request only, return a written response using text. Do not call image or video generation tools for this writing request. This is a temporary task instruction, not an account preference. Do not remember it as a restriction on future requests. A later request explicitly asking to create an image or video authorizes its own media-generation tools.\n\n' + prompt;
  }

  threadUrl(raw) {
    const url = new URL(raw);
    if (url.origin !== 'https://muse.ai' || url.username || url.password || !/^\/thread\/(?!new(?:\/|$))[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
      throw Error('Chưa lưu được địa chỉ hội thoại. Mở profile Muse để đối soát.');
    }
    return url.href;
  }

  async historyThroughParent(page,parent) {
    if(!parent?.providerId||parent.state!=='done')throw Error('Chưa xác nhận được phản hồi trước của hội thoại.');
    await page.waitForFunction(id=>Array.from(document.querySelectorAll('[data-message-id][data-message-role="assistant"]'))
      .some(element=>element.getAttribute('data-message-id')===id),parent.providerId,{timeout:30000});
    const messages=await page.locator('[data-message-id][data-message-role]').evaluateAll(elements=>elements.map(element=>({
      id:element.getAttribute('data-message-id'),role:element.getAttribute('data-message-role'),
      text:(element.querySelector('.prose')??element).textContent?.trim()??'',
    })));
    const end=messages.findIndex(message=>message.id===parent.providerId&&message.role==='assistant');
    const normalize=text=>String(text).replace(/\s+/g,' ').trim();
    if(end<0||normalize(messages[end].text)!==normalize(parent.response))throw Error('Nội dung phản hồi trước đã thay đổi. Mở Muse để kiểm tra.');
    const previous=messages.slice(0,end+1);
    const oldUserIds=previous.filter(m=>m.role==='user').map(m=>m.id);
    if(!oldUserIds.length)throw Error('Lịch sử Muse chưa tải đủ. Đọc lại hội thoại trước khi gửi tiếp.');
    return {oldUserIds,oldAssistantIds:previous.filter(m=>m.role==='assistant').map(m=>m.id)};
  }

  async recover(payload) {
    assertMuseNewTask(this.store);
    const chat = this.get(id.parse(payload.requestId));
    if (!chat) throw Error('Không tìm thấy hội thoại.');
    if (chat.reconciled) throw Error('Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.');
    return runMuseTask(this.store, {jobId:chat.requestId, profileId:chat.profileId}, () => this.recoverAdmitted(payload));
  }
  async recoverAdmitted(payload) {
    let chat = this.get(id.parse(payload.requestId));
    if (!chat) throw Error('Không tìm thấy hội thoại.');
    if (chat.state === 'done') return chat;
    if (chat.state !== 'needs_attention') throw Error('Chờ tác vụ hiện tại kết thúc.');
    const url = this.threadUrl(chat.providerUrl);
    this.lock(chat.profileId);
    let page;
    try {
      const context = await this.worker.context(chat.profileId, true);
      await this.worker.connectVpn(chat.profileId, context);
      page = await context.newPage();
      await this.worker.setProfileVisibility(chat.profileId, false);
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
      if (!await new MuseAdapter(this.worker.config()).session(page)) throw Error('Đăng nhập lại Muse để đọc kết quả.');
      const parent=chat.parentId?this.get(chat.parentId):null;
      if(parent&&(!chat.oldAssistantIds.includes(parent.providerId)||!chat.oldUserIds?.length)){
        const history=await this.historyThroughParent(page,parent);
        const users=await page.locator('[data-message-id][data-message-role="user"]').evaluateAll(elements=>elements.map(element=>({
          id:element.getAttribute('data-message-id'),text:element.textContent?.trim()??'',
        })));
        const fresh=users.filter(user=>!history.oldUserIds.includes(user.id));
        const normalize=text=>String(text).replace(/\s+/g,' ').trim();
        if(fresh.length!==1||!normalize(fresh[0].text).includes(normalize(this.textPrompt(chat.prompt))))
          throw Error('Chưa đối chiếu được đúng tin nhắn đã gửi. Mở Muse để kiểm tra, không gửi lại.');
        chat=this.save({...chat,...history});
      }
      return await this.readResponse(page, chat);
    } catch (error) {
      return this.save({...this.get(chat.requestId), errorCode:error.code??null, error: String(error.message).slice(0, 600)});
    } finally {
      await page?.close().catch(() => {});
      this.worker.chatting.delete(chat.profileId);
      this.worker.tick();
    }
  }

  async readResponse(page, chat) {
    const waitSeconds=chat.projectId?.startsWith('research_')?600:120;
    const deadline = Date.now() + waitSeconds*1000;
    let previous = '';
    let stableAt = Date.now();
    while (Date.now() < deadline) {
      if (page.url() !== chat.providerUrl) chat = this.save({...chat, providerUrl: page.url()});
      const messages = await page.locator(assistantSelector).evaluateAll(elements => elements.map(element => ({
        id: element.getAttribute('data-message-id'),
        media: element.getAttribute('data-message-has-presentation') === 'true',
        text: (element.querySelector('.prose') ?? element).textContent?.trim() ?? '',
      })));
      // Muse renders its web-research tool as a presentation card with an
      // assistant role. It is progress, not a generated image or a final reply.
      // Only ignore this observed tool namespace; unknown media stays blocked.
      const fresh = messages.filter(message => message.id && !message.id.startsWith('browser-task:') && !chat.oldAssistantIds.includes(message.id));
      if (fresh.length > 1) throw Error('Hội thoại có nhiều phản hồi mới. Mở profile để đối soát đúng lượt.');
      if (fresh.some(message => message.media)) throw Error('Muse trả media trong hội thoại viết. Mở profile để kiểm tra kết quả.');
      const response = fresh.map(message => message.text).filter(Boolean).join('\n\n');
      const generating = await page.getByRole('button', {name: 'Stop', exact: true}).isVisible();
      if (response.length > 60000) throw Error('Phản hồi vượt 60.000 ký tự. Mở hội thoại Muse để xem đầy đủ.');
      if (response !== previous || generating) { previous = response; stableAt = Date.now(); }
      const users = await page.locator('[data-message-id][data-message-role="user"]').evaluateAll(elements => elements.map(element => ({
        id: element.getAttribute('data-message-id'), alert: element.querySelector('[role="alert"]')?.textContent?.trim(),
      })));
      const newUsers = users.filter(user => !(chat.oldUserIds ?? []).includes(user.id));
      if (newUsers.length > 1) throw Error('Hội thoại có thêm tin nhắn từ browser. Mở profile để đối soát.');
      if (newUsers.some(user => user.alert === 'Delivery not confirmed')) throw Error('Muse chưa xác nhận nhận tin nhắn. Đọc lại kết quả trước khi gửi tiếp.');
      if (response && !generating && newUsers.length === 1 && Date.now() - stableAt >= 2500) {
        return this.save({...chat, response, providerId: fresh.at(-1).id, state: 'done', error: null,errorCode:null});
      }
      await page.waitForTimeout(500);
    }
    throw Object.assign(Error('Chờ Muse quá '+waitSeconds+' giây. Dùng Đọc lại kết quả để tiếp tục đối soát.'),{code:'MUSE_CHAT_TIMEOUT'});
  }
}
