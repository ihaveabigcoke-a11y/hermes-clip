// EXPERIMENTAL / OFF by default. Every endpoint, permission, version and field
// below MUST be checked against current Meta Instagram Login documentation
// before enabling. No Facebook Page token and no browser cookies are used.
// This client has no filesystem, logger, implicit fetch or automatic retries.
const objectId = value => {
  if (typeof value !== 'string' || !/^\d{1,40}$/.test(value)) throw apiError('invalid', 'Mã đối tượng Instagram API không hợp lệ.');
  return value;
};
export function apiError(code, message) { return Object.assign(new Error(message), {code}); }
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e12 ? value : null;
const metricNames = ['views','likes','comments','saves','shares','profileVisits','linkClicks','viewers','interactions','reelInteractions','accountsEngaged','profileActivity','follows','reach'];

export function mapApiInsights(response) {
  const entries = Array.isArray(response?.data) ? response.data : [];
  const read = name => {
    const rows = entries.filter(row => row.name === name && row.period === 'lifetime');
    if (rows.length !== 1) return null;
    const row = rows[0];
    return count(row.total_value?.value ?? (row.values?.length === 1 ? row.values[0]?.value : null));
  };
  return {...Object.fromEntries(metricNames.map(key => [key, null])),
    views: read('views') ?? read('plays'), reach: read('reach'), saves: read('saved'),
    shares: read('shares'), comments: read('comments'), likes: read('likes')};
}

export class InstagramApi {
  #fetch; #token;
  constructor({fetch, token, userId, version, enabled = false, resumableEnabled = false, timeoutMs = 30000}) {
    this.#fetch = fetch; this.#token = token;
    this.userId = userId; this.version = version; this.enabled = enabled;
    this.resumableEnabled = resumableEnabled; this.timeoutMs = timeoutMs;
  }
  ready(upload = false) {
    if (!this.enabled) throw apiError('api_disabled', 'Instagram API đang tắt. Cần đối chiếu tài liệu Meta trước khi bật.');
    if (!/^v\d+\.\d+$/.test(this.version ?? '')) throw apiError('api_disabled', 'Chưa cấu hình phiên bản Instagram API đã đối chiếu.');
    if (upload && !this.resumableEnabled) throw apiError('upload_disabled', 'Upload API đang tắt; cần xác minh endpoint resumable của Meta.');
    if (typeof this.#fetch !== 'function' || typeof this.#token !== 'string' || !this.#token.trim()) throw apiError('login_required', 'Chưa có token Instagram API hợp lệ.');
    objectId(this.userId);
  }
  async #request(path, {method = 'GET', query, body, upload} = {}) {
    this.ready(!!upload);
    const url = upload ? new URL(`https://rupload.facebook.com/ig-api-upload/${this.version}/${objectId(path)}`)
      : new URL(`https://graph.instagram.com/${this.version}/${path}`);
    for (const [key, value] of Object.entries(query ?? {})) if (value != null) url.searchParams.set(key, value);
    const headers = {Authorization: `${upload ? 'OAuth' : 'Bearer'} ${this.#token}`};
    if (upload) Object.assign(headers, {'Content-Type':'application/octet-stream', offset:'0', file_size:String(body.byteLength)});
    else if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    let response, data;
    try {
      response = await this.#fetch(url.href, {method, headers, body: body ? upload ? body : new URLSearchParams(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs), redirect:'error'});
      data = await response.json();
    } catch {
      // Never expose thrown fetch messages, URLs, response bodies or token values.
      throw apiError('api_uncertain', 'Instagram API chưa trả kết quả xác định. Cần đối soát trước khi thử lại.');
    }
    if (!response.ok || data?.error) throw apiError(response.status === 401 || data?.error?.code === 190 ? 'login_required' : 'api_rejected',
      'Instagram API từ chối yêu cầu. Kiểm tra token, quyền và phiên bản API; không gửi lại lượt đăng chưa rõ.');
    if (!data || typeof data !== 'object') throw apiError('api_uncertain', 'Phản hồi Instagram API chưa đủ bằng chứng.');
    return data;
  }
  // TODO META VERIFY: GET /me fields=user_id,username (Instagram Login identity).
  async identity() {
    const row = await this.#request('me', {query:{fields:'user_id,username'}});
    const userId = objectId(row.user_id);
    if (userId !== this.userId || !/^[a-zA-Z0-9._]{1,30}$/.test(row.username ?? '')) throw apiError('identity', 'Token không khớp tài khoản API đã chọn.');
    return {userId, handle:row.username, session:'signed_in'};
  }
  // TODO META VERIFY: POST /{ig-user-id}/media, REELS + upload_type=resumable.
  async createReelContainer({caption}) {
    this.ready(true);
    const row = await this.#request(`${objectId(this.userId)}/media`, {method:'POST', body:{media_type:'REELS',upload_type:'resumable',caption}});
    const containerId = objectId(row.id);
    // Do not trust/follow an arbitrary returned upload URI or persist its query.
    const expected = `https://rupload.facebook.com/ig-api-upload/${this.version}/${containerId}`;
    return {containerId,uploadSupported:!row.uri || row.uri === expected};
  }
  // TODO META VERIFY: rupload host/path, OAuth header, offset/file_size and success.
  // One upload only. Automatic resumption/re-upload is deliberately not implemented.
  async uploadVideo(containerId, video) {
    if (!(video instanceof Uint8Array) || !video.byteLength) throw apiError('invalid', 'Video upload API phải có dữ liệu.');
    const row = await this.#request(objectId(containerId), {method:'POST',body:video,upload:true});
    if (row.success !== true) throw apiError('api_uncertain', 'Upload API chưa được xác nhận. Cần đối soát container.');
  }
  // TODO META VERIFY: GET /{container-id}?fields=status_code; terminal values.
  async containerStatus(containerId) {
    const row = await this.#request(objectId(containerId), {query:{fields:'status_code'}});
    return ['IN_PROGRESS','FINISHED','ERROR','EXPIRED','PUBLISHED'].includes(row.status_code) ? row.status_code : 'UNKNOWN';
  }
  // TODO META VERIFY: POST /{ig-user-id}/media_publish creation_id -> media id.
  async publish(containerId) {
    const row = await this.#request(`${objectId(this.userId)}/media_publish`, {method:'POST',body:{creation_id:objectId(containerId)}});
    return {mediaId:objectId(row.id)};
  }
  // TODO META VERIFY: media fields, owner username and timestamp semantics.
  async media(mediaId) {
    return this.#request(objectId(mediaId), {query:{fields:'id,username,caption,media_type,media_product_type,permalink,timestamp'}});
  }
  // TODO META VERIFY: /{ig-user-id}/media paging and the same media fields.
  async mediaPage(after = null) {
    return this.#request(`${objectId(this.userId)}/media`, {query:{fields:'id,username,caption,media_type,media_product_type,permalink,timestamp',limit:100,after}});
  }
  // TODO META VERIFY: views replaces plays in some versions; no blind fallback
  // request on permission/metric errors. Only lifetime cumulative values map.
  async insights(mediaId) {
    return mapApiInsights(await this.#request(`${objectId(mediaId)}/insights`, {query:{metric:'views,reach,saved,shares,comments,likes',period:'lifetime'}}));
  }
  // TODO META VERIFY: comment fields, cursor paging, limit and permission.
  async commentsPage(mediaId, after = null) {
    const row = await this.#request(`${objectId(mediaId)}/comments`, {query:{fields:'id,text,username,timestamp',limit:100,after}});
    if (!Array.isArray(row.data)) throw apiError('api_uncertain', 'Chưa đọc được trang comment từ API.');
    return {comments:row.data.map(item => ({id:objectId(item.id),text:typeof item.text === 'string' ? item.text : '',
      username:typeof item.username === 'string' ? item.username : null,timestamp:typeof item.timestamp === 'string' ? item.timestamp : null})),
      nextCursor:nextCursor(row)};
  }
  async *comments(mediaId, {maxPages = 100} = {}) {
    let after = null; const seen = new Set();
    for (let page = 0; page < maxPages; page++) {
      const result = await this.commentsPage(mediaId, after);
      for (const comment of result.comments) yield comment;
      after = result.nextCursor;
      if (!after) return;
      if (seen.has(after)) throw apiError('pagination', 'Cursor comment lặp lại; dừng đọc để đối soát.');
      seen.add(after);
    }
    throw apiError('pagination', 'Đã đạt giới hạn trang comment; chưa đọc hết dữ liệu.');
  }
  // TODO META VERIFY: /content_publishing_limit fields and quota_duration unit.
  // Do not hard-code the approximate 100 posts / 24 hours as an entitlement.
  async publishingLimit() {
    const row = await this.#request(`${objectId(this.userId)}/content_publishing_limit`, {query:{fields:'config,quota_usage'}});
    const value = row.data?.[0];
    return {quotaUsage:count(value?.quota_usage),quotaTotal:count(value?.config?.quota_total),quotaDuration:count(value?.config?.quota_duration)};
  }
}

export function nextCursor(row) {
  if (!row?.paging?.next) return null;
  const after = row.paging.cursors?.after;
  if (typeof after !== 'string' || !after || after.length > 4096) throw apiError('pagination', 'Trang API tiếp theo thiếu cursor hợp lệ.');
  return after; // Never follow paging.next: it can contain a token or another host.
}
