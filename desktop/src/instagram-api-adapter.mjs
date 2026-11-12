import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {InstagramApi, apiError, nextCursor, publicVideoUrl} from './instagram-api.mjs';
import {instagramPostUrl} from './instagram-adapter.mjs';

export class InstagramApiAdapter {
  constructor({secret, fetch = globalThis.fetch, enabled = true, version = 'v25.0', resumableEnabled = false,
    readVideo = readFile, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), pollAttempts = 12, timeoutMs = 30000} = {}) {
    this.secret = secret; this.fetch = fetch; this.enabled = enabled; this.version = version;
    this.resumableEnabled = resumableEnabled; this.readVideo = readVideo; this.delay = delay;
    this.pollAttempts = pollAttempts; this.timeoutMs = timeoutMs;
  }
  status() { return {enabled:this.enabled, resumableEnabled:this.resumableEnabled, videoUrlEnabled:true, version:this.version}; }
  async client(profile, upload = false) {
    if (!this.enabled) throw apiError('api_disabled', 'Instagram API đang tắt. Cần đối chiếu tài liệu Meta trước khi bật.');
    let token;
    try { token = profile?.encryptedApiToken ? await this.secret.decrypt(profile.encryptedApiToken) : null; }
    catch { throw apiError('login_required', 'Chưa giải mã được token Instagram API trên máy này.'); }
    const client = new InstagramApi({fetch:this.fetch,token,userId:profile?.apiUserId,version:this.version,
      enabled:this.enabled,resumableEnabled:this.resumableEnabled,timeoutMs:this.timeoutMs});
    client.ready(upload);
    return client;
  }
  async session(profile, expectedHandle = '') {
    const session = await (await this.client(profile)).identity();
    this.matchHandle(session.handle, expectedHandle);
    return session;
  }
  matchHandle(actual, expected) {
    if (expected && actual.toLowerCase() !== expected.toLowerCase()) throw apiError('identity', 'Tên người dùng API khác tài khoản đã chọn.');
  }
  async publish({profile, job, update, beforePublish, stopped}) {
    if (job.apiReceipt) throw apiError('api_uncertain', 'Lượt API đã có receipt; cần đối soát, không tạo container mới.');
    const videoUrl = job.snapshot.apiVideoUrl;
    if (videoUrl) publicVideoUrl(videoUrl);
    else if (!this.resumableEnabled) throw apiError('invalid', 'Lưu URL HTTPS công khai của đúng video đã duyệt trước khi đăng qua Instagram Login.');
    const client = await this.client(profile, !videoUrl);
    if (job.snapshot.aiLabel === 'required') throw apiError('ai_label', 'API chưa xác minh hỗ trợ nhãn AI bắt buộc. Dừng để kiểm tra thủ công, không tự đổi chế độ.');
    const session = await client.identity();
    this.matchHandle(session.handle, job.snapshot.expectedHandle);
    if (job.snapshot.apiUserId !== session.userId) throw apiError('identity', 'Tài khoản API đã đổi từ lúc nhận lượt đăng.');
    const quota = await client.publishingLimit();
    if (quota.quotaUsage != null && quota.quotaTotal != null && quota.quotaUsage >= quota.quotaTotal) throw apiError('quota', 'Tài khoản đã hết hạn mức đăng API trong kỳ hiện tại.');
    const video = await this.readVideo(job.snapshot.path);
    if (createHash('sha256').update(video).digest('hex') !== job.snapshot.sha256) throw apiError('checksum', 'Checksum video API không khớp snapshot đã chọn.');
    await beforePublish();
    if (stopped()) throw apiError('stopped', 'App đang đóng; dừng trước khi tạo container.');
    let receipt = {containerId:null,mediaId:null,statusCode:null,phase:'creating',startedAt:Date.now()};
    const save = patch => {receipt = {...receipt,...patch}; update({apiReceipt:receipt});};
    // Write ahead of each mutation, including the FIRST request. A crash or lost
    // response never turns this job into retryable/failed or another container.
    update({state:'uploading',handle:session.handle,userId:session.userId,apiReceipt:receipt,
      note:'Đang tạo container Instagram API; receipt được giữ để đối soát.'});
    const container = await client.createReelContainer({caption:job.snapshot.caption,videoUrl});
    save({containerId:container.containerId,phase:'created'});
    if (!container.uploadSupported) throw apiError('api_uncertain', 'Endpoint upload Meta khác hợp đồng đã kiểm; cần đối soát container.');
    if (stopped()) throw apiError('stopped', 'App đang đóng; cần đối soát container API.');
    if (!videoUrl) {
      save({phase:'uploading'});
      await client.uploadVideo(receipt.containerId, video);
    }
    save({phase:'processing'});
    let statusCode;
    for (let attempt = 0; attempt < this.pollAttempts; attempt++) {
      if (stopped()) throw apiError('stopped', 'App đang đóng; cần đối soát container API.');
      statusCode = await client.containerStatus(receipt.containerId);
      save({statusCode});
      if (statusCode === 'FINISHED') break;
      if (statusCode !== 'IN_PROGRESS') throw apiError('container', 'Container API chưa sẵn sàng hoặc đã lỗi. Cần đối soát; không publish.');
      if (attempt + 1 < this.pollAttempts) await this.delay(5000);
    }
    if (statusCode !== 'FINISHED') throw apiError('api_uncertain', 'Container API chưa xử lý xong. Cần đối soát; không publish.');
    await beforePublish();
    const current = await client.identity();
    this.matchHandle(current.handle, session.handle);
    if (stopped()) throw apiError('stopped', 'App đang đóng; cần đối soát container API.');
    save({phase:'publishing'});
    const submittingAt = Date.now();
    update({state:'submitting',submittingAt,note:'Đang publish container API một lần; không tự gửi lại.'});
    const {mediaId} = await client.publish(receipt.containerId);
    save({mediaId,phase:'published'});
    return this.proof(await client.media(mediaId), {...job,handle:session.handle,userId:session.userId,submittingAt,apiReceipt:receipt});
  }
  proof(media, job) {
    const postUrl = instagramPostUrl(media?.permalink);
    const at = Date.parse(media?.timestamp);
    if (!postUrl || media.id !== job.apiReceipt.mediaId || media.media_type !== 'VIDEO' || media.media_product_type !== 'REELS'
      || typeof media.username !== 'string' || media.username.toLowerCase() !== job.handle.toLowerCase()
      || media.caption !== job.snapshot.caption || !Number.isFinite(at) || !job.submittingAt
      || at < job.submittingAt - 120000 || at > job.submittingAt + 30 * 60000) {
      throw apiError('api_uncertain', 'Bằng chứng bài đăng API chưa khớp snapshot. Cần đối soát.');
    }
    return {postUrl,handle:job.handle,userId:job.userId,source:'api',containerId:job.apiReceipt.containerId,mediaId:job.apiReceipt.mediaId,timestamp:media.timestamp};
  }
  async reconcile(profile, job, update) {
    const client = await this.client(profile);
    if (profile.apiUserId !== job.snapshot.apiUserId) throw apiError('identity', 'Đối soát cần đúng tài khoản API trong snapshot.');
    const session = await client.identity();
    this.matchHandle(session.handle, job.handle || job.snapshot.expectedHandle);
    const receipt = job.apiReceipt;
    if (!receipt?.containerId) return null;
    const statusCode = await client.containerStatus(receipt.containerId);
    update({apiReceipt:{...receipt,statusCode}});
    if (!receipt.mediaId) return null; // PUBLISHED alone does not identify the post.
    return this.proof(await client.media(receipt.mediaId), job);
  }
  async read(profile, target, published) {
    const client = await this.client(profile);
    const session = await client.identity();
    this.matchHandle(session.handle, target.expectedHandle || published?.handle);
    if (published?.snapshot.apiMode === 'api' && published.snapshot.apiUserId !== session.userId) throw apiError('identity', 'Tài khoản API không khớp receipt bài đăng.');
    let mediaId = published?.apiReceipt?.mediaId;
    if (!mediaId) {
      let after = null; const seen = new Set();
      for (let page = 0; page < 5; page++) {
        const result = await client.mediaPage(after);
        const matches = (result.data ?? []).filter(row => instagramPostUrl(row.permalink) === target.postUrl);
        if (matches.length === 1) {mediaId = matches[0].id; break;}
        if (matches.length > 1) break;
        after = nextCursor(result);
        if (!after || seen.has(after)) break;
        seen.add(after);
      }
    }
    if (!mediaId) throw apiError('unavailable', 'Chưa xác định được media ID của bài trong tài khoản API (tối đa 5 trang).');
    const media = await client.media(mediaId);
    if (instagramPostUrl(media.permalink) !== target.postUrl || media.username?.toLowerCase() !== session.handle.toLowerCase()) throw apiError('identity', 'Bài API không khớp URL và tài khoản cần đo.');
    return {...await client.insights(mediaId),source:'api',sourceUrl:target.postUrl,insightsUrl:'',handle:session.handle,
      approximate:[],observedAt:new Date().toISOString(),notes:'Số liệu cộng dồn (lifetime) từ Instagram API tại thời điểm đo. Reach là tài khoản tiếp cận; không thay cho viewers. Chỉ số thiếu giữ null.'};
  }
}
