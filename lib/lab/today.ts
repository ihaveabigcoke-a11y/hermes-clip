import {formatMoney, productCurrency, productFinancials, type LabRecord} from './domain.ts';
import {instagramProductSummary} from './instagram-summary.ts';
import {productJourneyStep, type JourneyMedia} from './product-next-step.ts';

export const measuredKeys = ['views','likes','comments','keywordComments','dms','utmClicks','orders'] as const;
export const knownCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function measuredPosts(records: LabRecord[]) {
  const products = records.filter(r => r.kind === 'product');
  return products.flatMap(product => instagramProductSummary(records, product.id).posts
    .filter(post => post.metric)
    .map(post => ({...post, product, account: records.find(r => r.kind === 'social_account' && r.id === post.accountId)})))
    .sort((a,b) => Date.parse(b.metric!.data.observedAt) - Date.parse(a.metric!.data.observedAt) || a.plan.id.localeCompare(b.plan.id));
}
export function todaySummary(records: LabRecord[], now = Date.now(), manual: JourneyMedia = null, jobs: Parameters<typeof productJourneyStep>[3] = []) {
  const products = records.filter(r => r.kind === 'product' && !r.data.archived);
  const projects = records.filter(r => r.kind === 'production');
  const clips = new Set<string>(), exports = new Set<string>();
  for (const project of projects) {
    for (const scene of project.data.scenes ?? []) for (const take of scene.takes ?? []) {
      if (take.type === 'video/mp4' && take.assetId && take.sha256) clips.add(take.sha256);
    }
    for (const render of project.data.exports ?? []) {
      const asset = records.find(r => r.kind === 'asset' && r.id === render.assetId);
      if (render.kind === 'render' && render.verified && render.sha256 && asset?.data.type === 'video/mp4' && asset.data.sha256 === render.sha256 && asset.data.metadata?.verifiedBy === 'container') exports.add(render.sha256);
    }
  }
  const plans = records.filter(r => r.kind === 'content_plan' && !r.data.archived);
  const published = new Set(records.filter(r => r.kind === 'product').flatMap(p => instagramProductSummary(records,p.id).posts).map(p => p.url.replace(/^https:\/\/(www\.)?instagram\.com\/(reels?|p)\//,'').replace(/\/$/,'')));
  const results = measuredPosts(records);
  const recent = results.filter(r => {const at = Date.parse(r.metric!.data.observedAt); return at <= now && at >= now - 7 * 86400000;});
  // Observations are cumulative. Do not present them as seven-day growth or fill nulls from old rows.
  const total = (key: string) => recent.length && recent.every(r => knownCount(r.metric!.data[key])) ? recent.reduce((sum,r) => sum + r.metric!.data[key],0) : null;
  return {
    counts: [products.length, clips.size, exports.size, plans.filter(p => ['draft','planned'].includes(p.data.status)).length, published.size, total('views'), total('keywordComments'), total('utmClicks')],
    tasks: products.map(product => ({product, next: productJourneyStep(product,records,manual,jobs)})).sort((a,b) => b.next.step-a.next.step || a.product.data.name.localeCompare(b.product.data.name)),
    results: results.slice(0,5),
  };
}
export function compactProductInfo(product: LabRecord) {
  const p = productFinancials(product.data);
  const missing = [['cost','giá vốn'],['shipping','ship'],['price','giá bán']].filter(([key]) => !knownCount(p[key])).map(([,label]) => label);
  if (!/^[A-Z]{2,20}$/.test(p.ctaKeyword ?? '') || p.ctaKeyword === 'LINK') missing.push('từ khóa CTA');
  if (!p.situation?.trim()) missing.push('tình huống');
  if (!p.brandName?.trim()) missing.push('tên hộp');
  if (!p.boxText?.trim()) missing.push('chữ trên hộp');
  const prices = (['cost','shipping','price'] as const).map(key => knownCount(p[key]) ? formatMoney(p[key],productCurrency(p,key)) : '—');
  return {missing, price: ['cost','shipping','price'].some(key => knownCount(p[key])) ? `${prices[0]} + ${prices[1]} → ${prices[2]}` : 'Chưa có giá'};
}
