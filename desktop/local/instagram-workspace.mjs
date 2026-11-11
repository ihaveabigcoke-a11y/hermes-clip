import {readFile, realpath} from 'node:fs/promises';
import {join, relative, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {sessionCookie} from './server.mjs';
import {instagramAiLabelMode} from '../src/instagram-ai-label.mjs';

export class InstagramWorkspace {
  constructor(local, changed = () => {}) { this.local = local; this.changed = changed; }

  async request(path, options = {}) {
    const response = await fetch(this.local.origin + path, {...options,
      headers: {Cookie: `${sessionCookie}=${this.local.session}`, Origin: this.local.origin, ...options.headers},
      signal: AbortSignal.timeout(30000)});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Chưa đọc được dữ liệu Instagram trong app.');
    return data;
  }
  async records() { return (await this.request('/api/lab')).records; }
  async metricPlans() {
    const records=await this.records();
    return records.filter(record=>record.kind==='content_plan'&&['published_browser','published_manual'].includes(record.data.status)
      && records.some(account=>account.id===record.data.accountId&&account.kind==='social_account'&&!account.data.archived)
      && records.some(product=>product.id===record.data.productId&&product.kind==='product'&&!product.data.archived));
  }
  async metricTarget(planId) {
    const plan=(await this.metricPlans()).find(plan=>plan.id===planId);
    if(!plan)throw Error('Chọn bài đã đăng thuộc sản phẩm và hồ sơ đang hoạt động.');
    const account=await this.account(plan.data.accountId);
    if(account.data.productId!==plan.data.productId)throw Error('Tài khoản và sản phẩm không khớp.');
    return {planId,accountId:account.id,postUrl:plan.data.postUrl,expectedHandle:account.data.handle||''};
  }
  async saveMetrics(target,measurement) {
    const current=await this.metricTarget(target.planId);
    if(current.accountId!==target.accountId||current.postUrl!==target.postUrl||measurement.sourceUrl!==target.postUrl)
      throw Error('Bài đăng hoặc hồ sơ đã thay đổi trong lúc cập nhật số liệu.');
    const records=await this.records();
    const previous=records.find(record=>record.id==='social_metric_'+target.planId);
    if(previous&&Date.parse(previous.data.observedAt)>Date.parse(measurement.observedAt))throw Error('Đã có số liệu mới hơn. Giữ bản đo hiện tại.');
    const result=await this.request('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'social_metric',
      id:'social_metric_'+target.planId,revision:previous?.revision??0,data:{...measurement,planId:target.planId,accountId:target.accountId}})});
    this.changed();return result.record;
  }
  async account(id) {
    const records = await this.records();
    const account = records.find(record => record.id === id && record.kind === 'social_account');
    const product = records.find(record => record.id === account?.data.productId && record.kind === 'product');
    if (!account || account.data.archived || !product || product.data.archived) throw Error('Hồ sơ hoặc sản phẩm đã được lưu trữ.');
    return account;
  }

  async snapshot({planId, revision, accountId, assetId}) {
    const records = await this.records();
    const plan = records.find(record => record.id === planId && record.kind === 'content_plan');
    if (!plan || plan.revision !== revision) throw Error('Nội dung đã thay đổi. Tải lại rồi chọn video để đăng.');
    if (['published_manual', 'published_browser'].includes(plan.data.status)) throw Error('Nội dung này đã có bài đăng.');
    const product = records.find(record => record.id === plan.data.productId && record.kind === 'product');
    const account = records.find(record => record.id === accountId && record.kind === 'social_account');
    if (!product || product.data.archived || !account || account.data.archived || account.data.productId !== product.id) {
      throw Error('Chọn hồ sơ Instagram đang hoạt động của sản phẩm này.');
    }
    const production = records.find(record => record.kind === 'production' && record.data.productId === product.id
      && (record.id === plan.data.productionId || !plan.data.productionId && record.data.contentPlanId === plan.id));
    const scene = production?.data.scenes.find(scene => scene.takes.some(take => take.assetId === assetId));
    const take = scene?.takes.find(take => take.assetId === assetId);
    const asset = records.find(record => record.kind === 'asset' && record.id === assetId);
    if (!scene || !take || !asset || asset.data.type !== 'video/mp4') throw Error('Chọn video MP4 thuộc dự án của nội dung này.');
    if (take.review === 'rejected') throw Error('Phiên bản này được đánh dấu cần sửa. Chọn phiên bản phù hợp trước khi đăng.');
    if (!plan.data.caption?.trim()) throw Error('Lưu chú thích cho video trước khi đăng.');
    if (!asset.data.sha256 || !/^[a-f0-9]{64}$/.test(asset.data.sha256)) throw Error('Video chưa có checksum để kiểm tra.');
    const path = await this.mediaPath(asset.data.key);
    const bytes = await readFile(path);
    if (bytes.length > 25 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== asset.data.sha256) {
      throw Error('File video trên máy không khớp dữ liệu đã lưu.');
    }
    return {planId, revision, name: plan.data.name, productId: product.id, accountId,
      accountRevision: account.revision, expectedHandle: account.data.handle || '', productionId: production.id, sceneId: scene.id, takeId: take.id,
      assetId, assetKey: asset.data.key, sha256: asset.data.sha256, path, caption: plan.data.caption,
      aiLabel: instagramAiLabelMode(plan.data.aiLabel),
      duration: take.metadata.duration, width: take.metadata.width, height: take.metadata.height, ratio: scene.ratio, review: take.review};
  }

  async mediaPath(key) {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.mp4$/.test(key)) throw Error('File video chưa có đường dẫn hợp lệ.');
    const root = await realpath(join(this.local.root, 'media'));
    const path = await realpath(join(root, key));
    const subpath = relative(root, path);
    if (isAbsolute(subpath) || subpath === '..' || subpath.startsWith('..\\') || subpath.startsWith('../')) throw Error('File nằm ngoài thư viện của app.');
    return path;
  }

  async revalidate(snapshot) {
    const current = await this.snapshot(snapshot);
    if (current.accountRevision !== snapshot.accountRevision || current.sha256 !== snapshot.sha256 || current.caption !== snapshot.caption
      || current.aiLabel !== instagramAiLabelMode(snapshot.aiLabel)) {
      throw Error('Hồ sơ hoặc nội dung đã thay đổi trong lúc chờ. Chọn lại nội dung cần đăng.');
    }
    return current;
  }

  async syncPublished(job) {
    const records = await this.records();
    const plan = records.find(record => record.id === job.snapshot.planId && record.kind === 'content_plan');
    if (plan?.data.status === 'published_browser' && plan.data.postUrl === job.postUrl) return;
    if (!plan || plan.revision !== job.snapshot.revision) throw Error('Bài đã đăng, nhưng nội dung trong app đã đổi. Xem liên kết trong lịch sử đăng.');
    await this.request('/api/lab', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      kind: 'content_plan', id: plan.id, revision: plan.revision,
      data: {...plan.data, accountId: job.snapshot.accountId, assetId: job.snapshot.assetId, status: 'published_browser', postUrl: job.postUrl},
    })});
    this.changed();
  }
}
