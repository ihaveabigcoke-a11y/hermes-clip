import {createHash, randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {InstagramBrowsers} from './instagram-browser.mjs';
import {InstagramAdapter, instagramPostUrl} from './instagram-adapter.mjs';
import {validateMedia} from './media.mjs';
import {InstagramMetrics} from './instagram-metrics.mjs';
import {InstagramApiAdapter} from './instagram-api-adapter.mjs';
import {browserEnabled, assertBrowserEnabled, apiMode, INSTAGRAM_BROWSER_WARNING} from './instagram-policy.mjs';
import {InstagramComments} from './instagram-comments.mjs';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const publishInput = z.object({requestId: id, planId: id, revision: z.number().int().positive(), accountId: id, assetId: id});
const pendingStates = new Set(['queued', 'waiting_login']);
const activeStates = new Set(['preparing', 'uploading', 'submitting']);

export class InstagramPublisher {
  constructor({store, root, browser, secret, workspace, adapter = new InstagramAdapter(), validate = validateMedia, apiOptions = {}, apiAdapter = new InstagramApiAdapter({secret, ...apiOptions})}) {
    this.store = store;
    this.root = root;
    this.workspace = workspace;
    this.adapter = adapter;
    this.apiAdapter = apiAdapter;
    this.validate = validate;
    this.browsers = new InstagramBrowsers({store, root, browser, secret});
    this.active = null;
    this.running = null;
    this.stopped = false;
    this.timer = null;
    this.checks = new Map();
    this.metrics = new InstagramMetrics(this);
    this.comments = new InstagramComments(this);
    for (const job of this.jobs()) {
      if (job.state === 'submitting' || job.snapshot.apiMode === 'api' && job.apiReceipt && activeStates.has(job.state)) this.update(job.id, {state: 'needs_attention', error: 'App đã đóng trong lúc đăng. Kiểm tra kết quả trước khi gửi tiếp.'});
      else if (activeStates.has(job.state)) this.update(job.id, {state: 'failed', error: 'App đã đóng trước bước chia sẻ. Có thể thử lại lượt này.'});
    }
  }
  jobs() { return this.store.get('instagram_jobs', []); }
  job(id) {
    const job = this.jobs().find(job => job.id === id);
    if (!job) throw Error('Không tìm thấy lượt đăng Instagram.');
    return job;
  }
  update(id, patch) {
    const previous = this.job(id);
    const updatedAt = Date.now();
    const note = patch.note ?? patch.error;
    const history = note ? [...previous.history, {at: updatedAt, state: patch.state ?? previous.state, note}].slice(-100) : previous.history;
    const job = {...previous, ...patch, updatedAt, history};
    this.store.set('instagram_jobs', this.jobs().map(row => row.id === id ? job : row));
    return job;
  }
  publicJob(job) {
    const {path, assetKey, ...snapshot} = job.snapshot;
    return {...job, snapshot};
  }
  status() {
    return {profiles: this.browsers.status(), jobs: this.jobs().map(job => this.publicJob(job)), active: this.active, metrics:this.metrics.status(), api:this.apiAdapter.status(), browserEnabled:browserEnabled(this.store), browserRunning:browserEnabled(this.store)&&!this.browserBootHold, comments:this.comments.status()};
  }
  boot() { this.stopped = false; this.browserBootHold = true; this.schedule(); }
  async configureBrowser({enabled, confirmation}) {
    if (typeof enabled !== 'boolean' || enabled && confirmation !== INSTAGRAM_BROWSER_WARNING) throw Error('Cần xác nhận đúng cảnh báo trong Cài đặt → Instagram.');
    this.store.set('instagram_browser_enabled', enabled);
    if (enabled) this.start();
    else await Promise.allSettled([...this.browsers.contexts.values()].map(context => context.close()));
    return this.status();
  }
  start() {
    this.browserBootHold = false;
    this.stopped = false;
    this.schedule();
    this.drain();
  }
  schedule() {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pulse().catch(() => {}).finally(() => this.schedule());
    }, 4000);
    this.timer.unref?.();
  }
  async pulse() {
    for (const profile of this.browsers.rows()) {
      if (this.stopped) return;
      if (apiMode(profile) || !browserEnabled(this.store) || this.browserBootHold) continue;
      if (this.browsers.contexts.has(profile.id) && (!profile.vpnEnabled || profile.vpn?.state === 'connected') && !this.browsers.busy.has(profile.id) && !this.browsers.opening.has(profile.id) && !this.browsers.pageOpening.has(profile.id)) {
        await this.check({id: profile.id}).catch(() => {});
      }
    }
    this.drain();
    if(this.workspace.metricPlans)await this.metrics.tick();
    await this.comments.tick();
  }
  async saveProfile(payload) {
    const account = await this.workspace.account(id.parse(payload.id));
    if (this.checks.has(account.id)) throw Error('Chờ kiểm tra tài khoản kết thúc trước khi sửa kết nối.');
    if (this.jobs().some(job => job.snapshot.accountId === account.id && (pendingStates.has(job.state) || activeStates.has(job.state)))) {
      throw Error('Hủy các lượt đang chờ của hồ sơ trước khi sửa kết nối.');
    }
    if (payload.apiMode === 'browser') assertBrowserEnabled(this.store);
    const options = Object.fromEntries(['vpnEnabled','proxy','apiMode','apiAppId','apiUserId','apiToken','clearApiToken']
      .filter(key => payload[key] !== undefined).map(key => [key, payload[key]]));
    return this.browsers.save(account, options);
  }
  async open({id: profileId}) {
    const account = await this.workspace.account(id.parse(profileId));
    if (!this.browsers.profile(profileId)) await this.browsers.save(account);
    if (apiMode(this.browsers.profile(profileId))) {await this.check({id:profileId}); return true;}
    assertBrowserEnabled(this.store);
    if (this.browsers.busy.has(profileId)) {await this.browsers.visibility(profileId, true); return true;}
    await this.browsers.page(profileId);
    await this.browsers.visibility(profileId, true);
    await this.check({id: profileId});
    return true;
  }
  async check({id: profileId}) {
    id.parse(profileId);
    if (this.browsers.saving.has(profileId)) throw Error('Chờ lưu cấu hình tài khoản hoàn tất.');
    if (this.checks.has(profileId)) return this.checks.get(profileId);
    if (this.browsers.busy.has(profileId)) return this.browsers.status().find(profile => profile.id === profileId);
    const pending = (async () => {
      const account = await this.workspace.account(profileId);
      if (apiMode(this.browsers.profile(profileId))) {
        try {
          const state = await this.apiAdapter.session(this.browsers.profile(profileId), account.data.handle);
          this.browsers.update(profileId, {...state,checkedAt:Date.now(),error:''});
          return state;
        } catch(error) {
          this.browsers.update(profileId,{session:error.code==='login_required'?'login_required':'unknown',checkedAt:Date.now(),
            error:error.instagramApiSafe?error.message:'Chưa kiểm tra được kết nối Instagram API.'});
          throw error;
        }
      }
      assertBrowserEnabled(this.store);
      const page = await this.browsers.page(profileId);
      const state = await this.adapter.session(page);
      const previous = this.browsers.profile(profileId);
      this.browsers.update(profileId, {...state, handle: state.handle || previous.handle, userId: state.userId || previous.userId,
        checkedAt: Date.now(), error: state.session === 'unknown' ? 'Chưa xác nhận được phiên. Hoàn tất đăng nhập trong trình duyệt.' : ''});
      return state;
    })().finally(() => this.checks.delete(profileId));
    this.checks.set(profileId, pending);
    return pending;
  }

  async enqueue(payload) {
    const input = publishInput.parse(payload);
    const oldRequest = this.jobs().find(job => job.requestId === input.requestId);
    if (oldRequest) {
      if (['planId', 'accountId', 'assetId', 'revision'].some(key => oldRequest.snapshot[key] !== input[key])) throw Error('Mã lượt đăng đã được dùng cho nội dung khác.');
      return this.publicJob(oldRequest);
    }
    const snapshot = await this.workspace.snapshot(input);
    const blocked = () => this.jobs().find(job => job.snapshot.planId === input.planId && !['failed', 'cancelled'].includes(job.state));
    if (blocked()) return this.publicJob(blocked());
    const fingerprint = createHash('sha256').update(JSON.stringify([snapshot.accountId, snapshot.sha256, snapshot.caption])).digest('hex');
    const duplicate = this.jobs().find(job => job.fingerprint === fingerprint && !['cancelled', 'failed'].includes(job.state));
    if (duplicate) return this.publicJob(duplicate);
    if (this.jobs().length >= 500) throw Error('Lịch sử đã có 500 lượt đăng. Sao lưu trước khi mở rộng.');
    if (!this.browsers.profile(input.accountId)) await this.browsers.save(await this.workspace.account(input.accountId));
    const race = blocked() ?? this.jobs().find(job => job.fingerprint === fingerprint && !['cancelled', 'failed'].includes(job.state));
    if (race) return this.publicJob(race);
    const now = Date.now();
    const profile = this.browsers.profile(input.accountId);
    snapshot.apiMode = profile.apiMode ?? 'api';
    if (snapshot.apiMode === 'browser') assertBrowserEnabled(this.store);
    if (snapshot.apiMode === 'api') Object.assign(snapshot, {apiUserId:profile.apiUserId,apiConfigRevision:profile.apiConfigRevision ?? 0});
    const job = {id: randomUUID(), requestId: input.requestId, fingerprint, snapshot, state: 'queued',
      createdAt: now, updatedAt: now, userId: profile.userId, handle: profile.handle, beforeLinks: [],
      submittingAt: null, postUrl: '', error: '', syncError: '', proof: null,
      history: [{at: now, state: 'queued', note: 'Đã nhận yêu cầu đăng video và chú thích đã chọn.'}]};
    this.store.set('instagram_jobs', [...this.jobs(), job]);
    this.drain();
    return this.publicJob(job);
  }

  drain() {
    if (this.stopped || this.active || this.metrics.active) return;
    const job = this.jobs().find(job => (job.snapshot.apiMode === 'api' || browserEnabled(this.store) && !this.browserBootHold) && (job.state === 'queued' || job.state === 'waiting_login'
      && this.browsers.contexts.has(job.snapshot.accountId) && this.browsers.profile(job.snapshot.accountId)?.session === 'signed_in'));
    if (!job) return;
    this.active = job.id;
    this.running = this.run(job.id).finally(() => {this.active = null; this.running = null; this.drain();});
  }

  async run(jobId) {
    let page;
    const accountId = this.job(jobId).snapshot.accountId;
    await this.checks.get(accountId)?.catch(() => {});
    if (this.stopped || this.job(jobId).state === 'cancelled') return;
    if (this.job(jobId).snapshot.apiMode !== 'api' && !browserEnabled(this.store)) return;
    this.browsers.busy.add(accountId);
    try {
      if (this.job(jobId).snapshot.apiMode === 'api' && this.job(jobId).apiReceipt) throw Error('Lượt API đã có receipt; cần đối soát, không gửi lại.');
      this.update(jobId, {state: 'preparing', error: '', note: 'Đang kiểm tra tài khoản và file video.'});
      const snapshot = await this.workspace.revalidate(this.job(jobId).snapshot);
      const media = await this.validate(snapshot.path, {mediaType: 'video', ratio: snapshot.ratio, duration: snapshot.duration});
      if (media.sha256 !== snapshot.sha256) throw Error('Checksum video không khớp file đã chọn.');
      if (this.stopped) throw Error('App đang đóng. Lượt đăng dừng trước bước chia sẻ.');
      if (this.job(jobId).snapshot.apiMode === 'api') {
        const frozen = this.job(jobId).snapshot;
        const beforePublish = async () => {
          const profile = this.browsers.profile(accountId);
          if (profile.apiMode !== 'api' || profile.apiUserId !== frozen.apiUserId || (profile.apiConfigRevision ?? 0) !== frozen.apiConfigRevision)
            throw Error('Cấu hình API đã thay đổi từ lúc chọn lượt đăng.');
          if (this.stopped) throw Error('App đang đóng; dừng lượt API.');
          await this.workspace.revalidate(frozen);
        };
        await beforePublish();
        const proof = await this.apiAdapter.publish({profile:this.browsers.profile(accountId),job:this.job(jobId),
          update:patch => this.update(jobId,patch),beforePublish,stopped:() => this.stopped});
        await this.complete(jobId,proof);
        return;
      }
      page = await this.browsers.page(accountId, true);
      assertBrowserEnabled(this.store);
      const session = await this.adapter.session(page);
      const previous = this.browsers.profile(accountId);
      this.browsers.update(accountId, {...session, handle: session.handle || previous.handle, userId: session.userId || previous.userId, checkedAt: Date.now(), error: ''});
      if (session.session !== 'signed_in') {
        this.update(jobId, {state: 'waiting_login', note: 'Đăng nhập Instagram trong cửa sổ hồ sơ. App sẽ tiếp tục lượt này.'});
        await this.browsers.visibility(accountId, true);
        return;
      }
      if (this.job(jobId).userId && this.job(jobId).userId !== session.userId) throw Error('Hồ sơ đang đăng nhập tài khoản khác tài khoản đã chọn cho lượt đăng.');
      if (snapshot.expectedHandle && snapshot.expectedHandle.toLowerCase() !== session.handle.toLowerCase()) throw Error('Tên người dùng đang đăng nhập khác tên đã ghi trong hồ sơ. Đăng nhập đúng tài khoản hoặc sửa hồ sơ trước khi chọn lại lượt đăng.');
      this.update(jobId, {handle: session.handle, userId: session.userId, state: 'uploading', note: 'Đang tải video và điền chú thích lên Instagram.'});
      await this.browsers.visibility(accountId, false);
      if (this.stopped) throw Error('App đang đóng. Lượt đăng dừng trước bước chia sẻ.');
      const prepared = await this.adapter.prepare(page, this.job(jobId));
      this.update(jobId, prepared);
      const job = this.job(jobId);
      job.submittingAt = Date.now();
      const proof = await this.adapter.publish(page, job, async () => {
        assertBrowserEnabled(this.store);
        if (this.stopped || this.job(jobId).state === 'cancelled') throw Error('Lượt đăng đã dừng trước bước chia sẻ.');
        await this.workspace.revalidate(job.snapshot);
        const current = await this.adapter.session(page);
        if (current.session !== 'signed_in' || current.userId !== job.userId) throw Error('Phiên Instagram đã thay đổi. Đăng nhập lại đúng tài khoản.');
        this.update(jobId, {state: 'submitting', submittingAt: job.submittingAt, note: 'Đang chia sẻ video. App đang chờ Instagram xác nhận.'});
      });
      if (proof) await this.complete(jobId, proof);
      else this.update(jobId, {state: 'needs_attention', error: 'Instagram chưa trả đủ bằng chứng bài đã đăng. Chọn Kiểm tra kết quả.'});
    } catch (error) {
      const current = this.job(jobId);
      if (current.state !== 'cancelled' && current.state !== 'published') {
        const aiLabelBlocked = error.code === 'INSTAGRAM_AI_LABEL_REQUIRED';
        const uncertain = aiLabelBlocked || !!current.apiReceipt || current.state === 'submitting' || current.state === 'needs_attention';
        this.update(jobId, {state: uncertain ? 'needs_attention' : 'failed',
          ...(aiLabelBlocked ? {attentionReason: 'ai_label', aiLabelCheck: error.aiLabelCheck, submittingAt: null} : {}),
          error: current.snapshot.apiMode === 'api' && !error.code ? 'Lượt Instagram API bị gián đoạn. Kiểm tra cấu hình hoặc đối soát receipt trước khi tiếp tục.' : /locator\.|page\.|browserType\.|Timeout/.test(error.message)
            ? 'Instagram chưa hoàn tất bước hiện tại. Mở trình duyệt để kiểm tra rồi dùng thao tác phù hợp trong app.' : error.message});
        if (page && !page.isClosed()) {
          const directory = join(this.root, 'instagram', 'diagnostics');
          await mkdir(directory, {recursive: true});
          const path = join(directory, jobId + '.png');
          await page.screenshot({path}).then(() => this.update(jobId, {diagnosticPath: path})).catch(() => {});
        }
      }
    } finally { this.browsers.busy.delete(accountId); }
  }

  async complete(jobId, proof) {
    const postUrl = instagramPostUrl(proof.postUrl);
    if (!postUrl || !proof.handle || proof.handle.toLowerCase() !== this.job(jobId).handle.toLowerCase()) throw Error('Kết quả Instagram chưa khớp tài khoản.');
    const job = this.update(jobId, {state: 'published', postUrl, proof, error: '', publishedAt: Date.now(), note: 'Instagram đã xác nhận bài đăng.'});
    try { await this.workspace.syncPublished(job); this.update(jobId, {syncError: ''}); this.metrics.due(job.snapshot.planId); }
    catch (error) { this.update(jobId, {syncError: error.message}); }
  }
  async reconcile({id: jobId}) {
    const job = this.job(id.parse(jobId));
    if (job.state === 'published') {await this.workspace.syncPublished(job); this.update(jobId, {syncError: ''}); return this.publicJob(this.job(jobId));}
    if (job.state !== 'needs_attention') throw Error('Lượt này chưa cần đối soát sau khi chia sẻ.');
    if (job.attentionReason === 'ai_label' && job.submittingAt == null) {
      throw Error('Lượt này đã dừng trước Share vì nhãn AI. Cần đối soát/thao tác tay trên bản nháp; không có bài đã gửi để tự đối soát.');
    }
    const accountId = job.snapshot.accountId;
    if (this.browsers.busy.has(accountId) || this.checks.has(accountId)) throw Error('Chờ thao tác của hồ sơ kết thúc.');
    this.browsers.busy.add(accountId);
    try {
      if (job.snapshot.apiMode === 'api') {
        const proof = await this.apiAdapter.reconcile(this.browsers.profile(accountId),job,patch => this.update(jobId,patch));
        if (proof) await this.complete(jobId,proof);
        else this.update(jobId,{error:'Cần đối soát receipt API. Chưa có media ID/bằng chứng đúng bài; không tự publish lại.'});
        return this.publicJob(this.job(jobId));
      }
      const page = await this.browsers.page(accountId, true);
      const proof = await this.adapter.reconcile(page, job);
      if (proof) await this.complete(jobId, proof);
      else this.update(jobId, {error: 'Chưa tìm thấy đúng bài đăng để xác nhận. Mở Instagram và kiểm tra lịch sử của tài khoản.'});
      return this.publicJob(this.job(jobId));
    } finally { this.browsers.busy.delete(accountId); }
  }
  retry({id: jobId}) {
    const job = this.job(id.parse(jobId));
    if (job.state !== 'failed' || job.apiReceipt) throw Error('Chỉ thử lại khi lượt đã dừng trước bước chia sẻ.');
    this.update(jobId, {state: 'queued', error: '', note: 'Đã đưa lượt đăng trở lại hàng chờ.'});
    this.drain();
    return this.publicJob(this.job(jobId));
  }
  cancel({id: jobId}) {
    const job = this.job(id.parse(jobId));
    if (!pendingStates.has(job.state)) throw Error('Chỉ hủy lượt đang chờ hoặc chờ đăng nhập.');
    return this.publicJob(this.update(jobId, {state: 'cancelled', error: '', note: 'Đã hủy lượt đăng trước khi chia sẻ.'}));
  }
  async shutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await Promise.allSettled([...this.browsers.opening.values()]);
    await Promise.allSettled([...this.browsers.contexts.values()].map(context => context.close()));
    await this.running;
    await this.metrics.running?.catch(()=>{});
    await this.comments.running?.catch(()=>{});
  }
}
