import {saveDownload} from './storage-policy.mjs';
import {extname} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {museMediaPrompt,museVideoBody} from './muse-video-prompt.mjs';
import {mapBundleCards} from './muse-bundle.mjs';

export const explicitMediaRefusal = text => /(?:could not|cannot|can't|unable to)\s+(?:create|generate|make)\b.{0,60}\b(?:video|image|file)\b|\b(?:video|image)\s+generation\s+(?:(?:isn't|is not|is currently not|is not currently)\s+available|is\s+(?:currently\s+)?unavailable)\b|\bvideo_not_available\b|\bPROMPT ONLY\b.{0,80}\bno video was generated\b/i.test(text);

// Selectors are configured from the signed-in provider UI.
export class MuseAdapter {
  constructor(config) {
    this.config = config;
    this.chatMode = config.resultIdAttribute === 'data-message-id'
      && new URL(config.startUrl).hostname === 'muse.ai';
  }

  async session(page) {
    const currentUrl = page.url();
    if (!this.chatMode || !currentUrl.startsWith(new URL(this.config.startUrl).origin + '/')) {
      await page.goto(this.config.startUrl, {waitUntil: 'domcontentloaded', timeout: 30000});
    } else {
      await page.waitForLoadState('domcontentloaded', {timeout: 30000});
    }
    const loggedIn = page.locator(this.config.loggedIn);
    if (this.chatMode) {
      try {
        await loggedIn.waitFor({state: 'visible', timeout: 30000});
      } catch {
        return false;
      }
    }
    return loggedIn.isVisible();
  }

  async prepare(page, job) {
    this.mediaType = job.mediaType;
    await this.guard?.();
    if (!await this.session(page)) {
      const error = new Error('Phiên Muse cần đăng nhập.');
      error.code = 'MUSE_LOGIN_REQUIRED';
      throw error;
    }
    const config = this.config;
    if (this.chatMode) {
      await page.getByRole('button', {name: 'Stop', exact: true}).waitFor({state: 'hidden', timeout: config.timeoutSeconds * 1000});
      if ((await page.locator(config.prompt).inputValue()).trim()) {
        const error = new Error('Browser Muse đang có bản nháp. Gửi hoặc lưu bản nháp trước khi chạy job.');
        error.code = 'MUSE_DRAFT_PRESENT';
        throw error;
      }
      await page.goto(new URL('/thread/new', config.startUrl).href, {waitUntil: 'domcontentloaded', timeout: 30000});
      await page.locator(config.prompt).waitFor({state: 'visible', timeout: 15000});
    }
    if (job.references.length) {
      if (!config.upload) throw Error('Luồng này chưa khai báo upload reference.');
      if (this.chatMode) await page.locator(config.prompt).fill('');
      const paths = job.references.map(reference => reference.path);
      // The same image may anchor both ends. Muse's video tool requires unique
      // attachment filenames even when the verified image bytes are identical.
      const files = new Set(paths).size === paths.length ? paths : await Promise.all(job.references.map(async (reference, index) => ({
        name: `${index + 1}-${reference.role ?? 'reference'}${extname(reference.path)}`,
        mimeType: reference.type,
        buffer: await readFile(reference.path),
      })));
      try {
        await page.locator(config.upload).setInputFiles(files);
      } catch (cause) {
        throw new Error('Không tải được ảnh đính kèm lên Muse. Chưa gửi prompt, chưa tính lượt.', {cause});
      }
      if (this.chatMode) {
        // The composer enables text sending before an attachment has finished
        // loading. Wait with an empty prompt so readiness depends on the file.
        try {
          await page.locator('button[aria-label="Send"]:enabled').waitFor({state: 'visible', timeout: 60000});
        } catch (cause) {
          const error = new Error('Muse chưa xác nhận ảnh tham chiếu đã tải xong.', {cause});
          error.code = 'MUSE_ATTACHMENT_NOT_READY';
          throw error;
        }
      }
    }
    const roles = {product: 'product identity', person: 'person identity', style: 'visual style', background: 'background', logo: 'logo', voice: 'voice reference', first_frame: 'FIRST FRAME of the video', last_frame: 'LAST FRAME of the video'};
    const mapping = job.references.map((reference, index) => reference.role ? 'Attachment ' + (index + 1) + ' is the ' + roles[reference.role] + '.' : '').filter(Boolean);
    const mediaScope = this.chatMode && ['video', 'image'].includes(job.mediaType)
      ? 'This request explicitly authorizes creating the requested ' + job.mediaType + ' using your media-generation tools and returning the actual downloadable file. For this request, lift any text-only restriction left from earlier writing requests. Earlier writing-only instructions were scoped to those requests. Follow the media brief below now.\n\n'
      : '';
    // Keep the command first, including queued/retried legacy requests. The
    // approved scene follows immediately; scope and attachment notes follow it.
    const brief = job.mediaType === 'video' ? job.prompt + (mediaScope ? '\n\n' + mediaScope.trimEnd() : '') : mediaScope + job.prompt;
    const prompt = museMediaPrompt(brief + (mapping.length ? '\n\nReference attachment roles, in upload order\n' + mapping.join('\n') : ''), job.mediaType);
    await page.locator(config.prompt).fill(prompt);
  }

  mediaCards(page, mediaType = this.mediaType) {
    // A Markdown/PDF preview is an image too; video jobs require a video element.
    const media = mediaType === 'video' ? 'video' : mediaType === 'image' ? 'img' : this.config.readyWithinCard;
    return page.locator(this.config.resultCards + (this.chatMode ? `:has(${media})` : ''));
  }

  noMedia(page, response) {
    return Object.assign(new Error('Muse đã trả lời nhưng chưa tạo file.'), {
      code: 'MUSE_NO_MEDIA', providerUrl: page.url(), providerResponse: response.slice(0, 2000),
    });
  }

  async submit(page, checkpoint) {
    const config = this.config;
    const cards = this.mediaCards(page);
    const oldIds = new Set(await cards.evaluateAll(
      (elements, attribute) => elements.map(element => element.getAttribute(attribute)),
      config.resultIdAttribute,
    ));
    const userMessages = this.chatMode
      ? page.locator('[data-message-id][data-message-role="user"]')
      : null;
    const oldUserIds = new Set(userMessages ? await userMessages.evaluateAll(
      elements => elements.map(element => element.getAttribute('data-message-id')),
    ) : []);
    const assistantMessages = this.chatMode
      ? page.locator('[data-message-id][data-message-role="assistant"]')
      : null;
    const oldAssistantIds = new Set(assistantMessages ? await assistantMessages.evaluateAll(
      elements => elements.map(element => element.getAttribute('data-message-id')),
    ) : []);
    await checkpoint('submitting');
    this.timings={sentAt:Date.now()};
    await page.getByRole('button', {name: config.submitName, exact: true}).click({timeout: 30000});
    // Muse creates its media message after generation finishes. Its result ID can
    // therefore arrive several minutes after the send button was clicked.
    const timeout = this.chatMode ? config.timeoutSeconds * 1000 : 30000;
    const deadline = Date.now() + timeout;
    let lastResponse = '';
    let completedAt = null;
    while (Date.now() < deadline) {
      await this.guard?.();
      const ids = await cards.evaluateAll(
        (elements, attribute) => elements.map(element => element.getAttribute(attribute)).filter(Boolean),
        config.resultIdAttribute,
      );
      const fresh = ids.filter(id => !oldIds.has(id));
      if(fresh.length)this.timings.firstResultAt??=Date.now();
      if(this.expectedScenes?.length){
        const generating=await page.getByRole('button',{name:'Stop',exact:true}).isVisible();
        if(fresh.length&&!generating){
          const rows=await cards.evaluateAll((elements,attribute)=>elements.map(e=>({id:e.getAttribute(attribute),text:e.innerText||e.textContent||'',clipCount:e.querySelectorAll('video').length})),config.resultIdAttribute);
          this.timings.observedClipCount=rows.filter(r=>fresh.includes(r.id)).reduce((n,r)=>n+(r.clipCount??1),0);
          const mapped=mapBundleCards(rows.filter(r=>fresh.includes(r.id)),this.expectedScenes);
          if(mapped){this.timings.resultAt=Date.now();this.bundleProviderIds=mapped;await checkpoint('submitted',{providerId:mapped[0],providerUrl:page.url(),bundleProviderIds:mapped});return mapped[0];}
          this.bundleSettledAt??=Date.now();
          if(fresh.length>this.expectedScenes.length||Date.now()-this.bundleSettledAt>=15000)throw Object.assign(Error('Muse trả thiếu clip hoặc chưa xác định được clip nào thuộc cảnh nào. Giữ kết quả để đối soát; gói mới dùng gửi riêng.'),{code:'MUSE_BUNDLE_UNMAPPED',providerUrl:page.url(),providerIds:fresh,providerResponse:rows.map(r=>r.text).join('\n').slice(0,2000)});
        }else this.bundleSettledAt=null;
      }else if (fresh.length > 1) throw Object.assign(Error('Có nhiều kết quả mới; không xác định được job.'),{code:'MUSE_MULTIPLE_RESULTS',providerUrl:page.url?.(),providerIds:fresh});
      if (!this.expectedScenes?.length&&fresh.length === 1) {
        this.timings.resultAt=Date.now();
        await checkpoint('submitted', {providerId: fresh[0], providerUrl: page.url()});
        return fresh[0];
      }
      if (userMessages) {
        const unconfirmedIds = await userMessages.evaluateAll(elements => elements
          .filter(element => element.querySelector('[role="alert"]')?.textContent?.trim() === 'Delivery not confirmed')
          .map(element => element.getAttribute('data-message-id')));
        if (unconfirmedIds.some(id => id && !oldUserIds.has(id))) {
          const error = new Error('Muse chưa xác nhận nhận yêu cầu. Kiểm tra hội thoại trước khi gửi lại.');
          error.code = 'MUSE_DELIVERY_UNCONFIRMED';
          throw error;
        }
      }
      if (assistantMessages) {
        const responses = await assistantMessages.evaluateAll(elements => elements.map(element => ({
          id: element.getAttribute('data-message-id'), text: element.textContent?.trim() || '',
          documentPreview: element.getAttribute('data-message-has-presentation') === 'true'
            && !element.querySelector('video')
            && [...element.querySelectorAll('span')].some(node => /^(?:MD|PDF|TXT|DOCX|CSV|HTML)$/i.test(node.textContent?.trim() || '')),
        })));
        const freshResponses = responses.filter(message => !oldAssistantIds.has(message.id) && message.text);
        // Refusal and follow-up suggestions can arrive in separate messages.
        const response = freshResponses.length ? {text: freshResponses.map(message => message.text).join('\n\n'), documentPreview: freshResponses.some(message => message.documentPreview)} : null;
        const generating = await page.getByRole('button', {name: 'Stop', exact: true}).isVisible();
        if (response && !generating) {
          if (response.text !== lastResponse || completedAt === null) completedAt = Date.now();
          lastResponse = response.text;
          if (Date.now() - completedAt >= 15000 && (explicitMediaRefusal(lastResponse) || (this.mediaType === 'video' && response.documentPreview))) {
            throw this.noMedia(page, response.text);
          }
        } else {
          completedAt = null;
        }
      }
      await page.waitForTimeout(750);
    }
    if(lastResponse)throw this.noMedia(page,lastResponse);
    throw Error('Chưa thấy mã kết quả mới. Cần đối soát trước khi gửi tiếp.');
  }

  async inspectResponse(page, job) {
    if (!this.chatMode) throw Error('Luồng Muse này cần kiểm tra kết quả thủ công.');
    const url = new URL(job.providerUrl);
    if (url.origin !== new URL(this.config.startUrl).origin || url.username || url.password
      || !/^\/thread\/(?!new(?:\/|$))[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
      throw Error('Chưa có địa chỉ hội thoại Muse hợp lệ để kiểm tra.');
    }
    await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 30000});
    if (!await this.session(page)) throw Error('Đăng nhập lại Muse để kiểm tra hội thoại.');
    await page.locator('[data-message-id][data-message-role="user"]').first().waitFor({state: 'visible', timeout: 30000});
    await page.locator('[data-message-id][data-message-role="assistant"]').first().waitFor({state: 'visible', timeout: 30000});
    const read = async () => {
      if (await page.getByRole('button', {name: 'Stop', exact: true}).isVisible()) {
        throw Error('Muse vẫn đang trả lời. Chờ phản hồi kết thúc rồi kiểm tra lại.');
      }
      const users = await page.locator('[data-message-id][data-message-role="user"]').evaluateAll(elements =>
        elements.map(element => ({text: element.textContent || '', unconfirmed: !!element.querySelector('[role="alert"]')})));
      const requested = job.request.mediaType === 'video' ? museVideoBody(job.request.prompt) : job.request.prompt;
      if (users.length !== 1 || users[0].unconfirmed || !users[0].text.includes(requested)) {
        throw Error('Hội thoại đã thay đổi hoặc chưa xác nhận gửi. Mở nguồn Muse để đối soát.');
      }
      const ids = await this.mediaCards(page, job.request?.mediaType).evaluateAll((elements, attribute) =>
        elements.map(element => element.getAttribute(attribute)).filter(Boolean), this.config.resultIdAttribute);
      if (ids.length > 1) throw Error('Có nhiều kết quả. Mở nguồn Muse để chọn đúng file.');
      const replies = await page.locator('[data-message-id][data-message-role="assistant"]')
        .evaluateAll(elements => elements.map(element => element.innerText?.trim() || element.textContent?.trim() || ''));
      return {providerId: ids[0] ?? null, response: replies.join('\n\n'), legacyResponse: replies.at(-1) ?? ''};
    };
    const first = await read();
    await page.waitForTimeout(2500);
    const latest = await read();
    if (first.providerId !== latest.providerId || first.response !== latest.response) {
      throw Error('Kết quả Muse đang thay đổi. Chờ một lúc rồi kiểm tra lại.');
    }
    if (latest.providerId) return {providerId:latest.providerId, response:latest.response, providerUrl:url.href};
    // Muse replaces streamed text with Markdown blocks on reload. Compare the
    // same text while ignoring layout whitespace, including truncated receipts.
    const normalize = value => value.replace(/\s+/g, '').normalize('NFC');
    const saved = normalize(job.providerResponse ?? '');
    const observed = normalize(latest.response);
    const matchesReceipt = text => job.providerResponse?.length === 2000 ? text.startsWith(saved) : text === saved;
    const matches = matchesReceipt(observed) || matchesReceipt(normalize(latest.legacyResponse));
    if (!saved || !matches) {
      throw Error('Chưa xác nhận được phản hồi cũ. Mở nguồn Muse để kiểm tra.');
    }
    return {providerId:latest.providerId, response:latest.response, providerUrl:url.href};
  }

  async fetch(page, job, checkpoint, path) {
    const config = this.config;
    let downloadStarted=false;
    const url = new URL(job.providerUrl);
    if (url.origin !== new URL(config.startUrl).origin) throw Error('Link kết quả không thuộc Muse.');
    if (page.url() !== url.href) {
      await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 30000});
    }
    const loggedIn = page.locator(config.loggedIn);
    try {
      if (this.chatMode) await loggedIn.waitFor({state: 'visible', timeout: 30000});
      if (!await loggedIn.isVisible()) throw Error('Login required');
    } catch {throw Object.assign(Error('Phiên Muse cần đăng nhập.'),{code:'MUSE_LOGIN_REQUIRED'});}
    const exact = page.locator(`${config.resultCards}[${config.resultIdAttribute}=${JSON.stringify(job.providerId)}]`);
    await checkpoint('waiting');
    if (this.chatMode) await exact.scrollIntoViewIfNeeded({timeout: 30000});
    const media = exact.locator(this.chatMode && job.request?.mediaType === 'video' ? 'video' : config.readyWithinCard).first();
    if (this.chatMode) {
      const deadline = Date.now() + config.timeoutSeconds * 1000;
      let settledAt = null, lastResponse = '';
      while (true) {
        await this.guard?.();
        if (await media.isVisible()) break;
        if (Date.now() >= deadline) throw Error('Chưa thấy file của mã kết quả cũ. Cần đối soát trước khi gửi tiếp.');
        const response = (await exact.innerText()).trim();
        const generating = await page.getByRole('button', {name: 'Stop', exact: true}).isVisible();
        if (response && !generating) {
          if (response !== lastResponse || settledAt === null) settledAt = Date.now();
          lastResponse = response;
          // A saved receipt can point at a document thumbnail from older versions.
          // Wait for a stable, finished reply before ruling out a late video.
          const documentPreview = job.request?.mediaType === 'video' && exact.getByText
            && await exact.getByText(/^(?:MD|PDF|TXT|DOCX|CSV|HTML)$/i, {exact:true}).first().isVisible();
          if (Date.now() - settledAt >= 15000 && (explicitMediaRefusal(response) || documentPreview)) throw this.noMedia(page, response);
        } else settledAt = null;
        await page.waitForTimeout(750);
      }
    } else await media.waitFor({state: 'visible', timeout: config.timeoutSeconds * 1000});
    this.timings={...this.timings,mediaVisibleAt:Date.now()};
    // The actual video URL is ready before the chat/preview animation settles.
    // Read only this receipt's element; never select a neighbouring result.
    if(this.chatMode && job.request?.mediaType==='video' && media.evaluate && page.request){
      const source=await media.evaluate(video=>video.currentSrc||video.src||video.querySelector('source')?.src||'');
      let url;try{url=new URL(source);}catch{}
      if(url?.protocol==='https:'&&!url.username&&!url.password){
        await checkpoint('downloading');
        downloadStarted=true;
        this.timings.downloadStartedAt=Date.now();
        let response,bytes;
        try{
          response=await page.request.get(url.href,{timeout:15000});
          if(!response.ok())throw Error('Video URL is not ready');
          if(Number(response.headers()['content-length'])>64*1024**2)throw Error('Video URL exceeds download budget');
          bytes=await response.body();
          if(!bytes.length||bytes.length>64*1024**2||bytes.subarray(4,8).toString()!=='ftyp')throw Error('Video URL did not return MP4');
        }catch{bytes=null;this.timings.directDownloadFallbackAt=Date.now();}
        finally{await response?.dispose();}
        if(bytes){
          this.timings.transferFinishedAt=Date.now();this.timings.downloadMethod='video-url';
          return saveDownload({saveAs:p=>writeFile(p,bytes),failure:async()=>null},path,{compress:true,onCompression:c=>{this.compression=c;}});
        }
      }
    }
    let downloadButton = exact.getByRole('button', {name: config.downloadButtonName, exact: true});
    if (this.chatMode) {
      const preview = exact.locator('[data-hatch-video-wrapper], button:has(img), [role="button"]:has(img)').first();
      await preview.click({timeout: 15000});
      downloadButton = page.getByRole('button', {name: config.downloadButtonName, exact: true});
      await downloadButton.waitFor({state: 'visible', timeout: 15000});
    }
    if(!downloadStarted)await checkpoint('downloading');
    this.timings={...this.timings,downloadStartedAt:Date.now(),downloadMethod:'preview-button'};
    const [download] = await Promise.all([
      page.waitForEvent('download', {timeout: 30000}),
      downloadButton.click(),
    ]);
    if (this.chatMode && job.request?.mediaType === 'image') {
      const extension = extname(download.suggestedFilename()).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
        throw Error('Ảnh Muse cần định dạng PNG, JPEG hoặc WebP để nhập thư viện.');
      }
      path = path.slice(0, -extname(path).length) + extension;
    }
    path=await saveDownload(download,path,{compress:true,onCompression:compression=>{this.compression=compression;}});
    if (this.chatMode) await page.keyboard.press('Escape');
    return path;
  }
}
