import {landedCost, type Candidate} from './operations.ts';
import {annotateResearchQuality} from './research-quality.ts';

/** Listing-shaped URLs are a source hint, not proof of an exact SKU or a quote. */
export function hasIndividualListing(candidate: Candidate) {
  if (candidate.qualityWarnings?.includes('shared_supplier_url')) return false;
  const check = candidate.listingCheck;
  if (check?.sourceUrl === candidate.supplierUrl && check.status === 'ok' && check.productCountReliable === true && check.productCountOnPage != null)
    return check.productCountOnPage === 1;
  try {
    const path = new URL(candidate.supplierUrl).pathname;
    return /\/(?:product-detail|products?|item|offer|dp)\/[^/]+/i.test(path);
  } catch { return false; }
}

export function researchCoverage(input: Candidate[]) {
  const candidates = annotateResearchQuality(input);
  return {
    total: candidates.length,
    cost: candidates.filter(c => c.cost != null).length,
    shipping: candidates.filter(c => c.shipping != null).length,
    exactSku: candidates.filter(c => c.matchType === 'exact_sku').length,
    individualListing: candidates.filter(hasIndividualListing).length,
    productMetrics: candidates.filter(c => c.marketEvidence?.some(m => !m.pageLevel && !!m.sourceUrl && !!m.observedAt && !!m.period?.trim())).length,
  };
}

export function landedCostBadge(candidate: Candidate) {
  const total = landedCost(candidate);
  if (total.amount == null || total.currency !== 'USD') return {
    ...total, label: 'Chưa đủ số', tone: 'neutral' as const,
    explanation: total.reason ?? 'Tổng không phải USD · không tự quy đổi',
  };
  return {...total, label: total.amount <= 20 ? '≤ 20 USD' : '> 20 USD',
    tone: total.amount <= 20 ? 'success' as const : 'warning' as const, explanation: 'Giá vốn + phí giao hàng theo số đã lưu'};
}

export const logisticsLabels = {battery:'Pin', liquid:'Chất lỏng', fragile:'Dễ vỡ', sizeFit:'Kích cỡ', vehicleFit:'Đời xe', bulky:'Cồng kềnh', brandRisk:'Thương hiệu', ipRisk:'Bằng sáng chế / kiểu dáng'} as const;
export function researchRisks(candidate: Candidate) {
  const flags = candidate.logisticsFlags;
  const known = Object.entries(logisticsLabels).filter(([key]) => flags?.[key as keyof typeof logisticsLabels] === true).map(([,label]) => label);
  const unknown = Object.keys(logisticsLabels).some(key => flags?.[key as keyof typeof logisticsLabels] == null);
  return [...known, ...(unknown ? ['Chưa rõ'] : known.length ? [] : ['Không ghi nhận'])];
}

export const defaultResearchCriteria = 'Source lightweight, unbranded products from China with a clear short-video demonstration for US customers.';
export const defaultResearchExclusions = 'large lithium batteries, liquids, branded goods, vehicle-model-specific products';
export const researchQueryLimit = 1500;
export function buildResearchQuery({criteria, maxLandedCost, niche, exclusions}: {criteria:string; maxLandedCost:string; niche:string; exclusions:string}) {
  const maximum = Number(maxLandedCost);
  if (!maxLandedCost.trim() || !Number.isFinite(maximum) || maximum <= 0 || maximum > 1e9)
    throw Error('Điền mức giá vốn + ship tối đa lớn hơn 0 (USD).');
  if (criteria.trim().length < 2) throw Error('Điền tiêu chí nghiên cứu.');
  const query = [
    `Research criteria: ${criteria.trim()}`,
    `Maximum supplier cost + shipping to the US: ${maximum} USD. Use this user budget in place of the default 20 USD target; require sourced quotes, keep unknowns null and never convert currencies.`,
    niche.trim() ? `Niche or target audience: ${niche.trim()}` : '',
    exclusions.trim() ? `Exclude: ${exclusions.trim()}` : '',
  ].filter(Boolean).join('\n');
  if (query.length > researchQueryLimit) throw Error(`Tiêu chí ghép có ${query.length}/${researchQueryLimit} ký tự. Rút gọn nội dung trước khi bắt đầu.`);
  return query;
}
