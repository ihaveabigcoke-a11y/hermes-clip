import {landedCost, type Candidate} from './operations.ts';

export type ListingStatus = 'single' | 'showroom' | 'not_found' | 'blocked' | 'unavailable';
export const listingStatusLabels: Record<ListingStatus, string> = {
  single: 'Listing riêng', showroom: 'Trang danh mục / nguồn chung',
  not_found: 'Chưa có listing đã đọc', blocked: 'Nguồn bị chặn', unavailable: 'Chưa kiểm được nguồn',
};

/** Only a current local receipt can establish a single listing. A URL is not evidence. */
export function listingStatus(candidate: Candidate): ListingStatus {
  const check = candidate.listingCheck;
  if (candidate.qualityWarnings?.includes('shared_supplier_url')) return 'showroom';
  if (!check || check.sourceUrl !== candidate.supplierUrl) return 'not_found';
  if (check.status === 'blocked') return 'blocked';
  // A read failure is not evidence that a listing does not exist.
  if (check.status !== 'ok') return 'unavailable';
  if (check.productCountReliable !== true) return 'unavailable';
  if (check.productCountOnPage != null) {
    if (check.productCountOnPage > 1) return 'showroom';
    return check.productCountOnPage === 1 ? 'single' : 'not_found';
  }
  // T14 excludes the current SKU and recommendations from its count. Null can
  // therefore mean no other product found, not zero products. Require a read
  // title and an item path as well; never use a path without a successful read.
  try {
    if (check.title?.trim() && /\/(?:product-detail|products?|item|offer|dp)\/[^/]+/i.test(new URL(candidate.supplierUrl).pathname)) return 'single';
  } catch { /* Invalid legacy URL remains unverified. */ }
  return 'unavailable';
}

const usd = (value: number) => new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 2}).format(value);
const validPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export type MarkupResult = {
  status: 'ok_x4' | 'ok_x3' | 'fail' | 'unknown';
  typicalRetailUsd: number | null;
  maxLandedUsd: [number, number] | null;
  notes: string[];
};

/** The x3–x4 rule is a hypothesis; this is not a margin or demand estimate. */
export function markupCheck(candidate: Candidate, ceilingUsd: number): MarkupResult {
  const retail = candidate.usRetail;
  let typicalRetailUsd: number | null = null;
  if (retail?.currency === 'USD') {
    const prices = (retail.sources ?? []).map(source => source.price).filter(validPrice).sort((a, b) => a - b);
    if (prices.length) {
      const middle = Math.floor(prices.length / 2);
      typicalRetailUsd = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
    } else if (validPrice(retail.low) && validPrice(retail.high) && retail.low <= retail.high) {
      typicalRetailUsd = (retail.low + retail.high) / 2;
    }
  }
  if (typicalRetailUsd == null) return {status: 'unknown', typicalRetailUsd, maxLandedUsd: null, notes: []};
  const maxLandedUsd: [number, number] = [typicalRetailUsd / 4, typicalRetailUsd / 3];
  const notes = maxLandedUsd[1] < ceilingUsd
    ? [`Giá bán lẻ Mỹ chỉ cho phép vốn+ship tối đa ${usd(maxLandedUsd[1])} USD`] : [];
  const landed = landedCost(candidate);
  const status = landed.currency !== 'USD' || landed.amount == null ? 'unknown'
    : landed.amount <= maxLandedUsd[0] ? 'ok_x4' : landed.amount <= maxLandedUsd[1] ? 'ok_x3' : 'fail';
  return {status, typicalRetailUsd, maxLandedUsd, notes};
}

export function suggestVerdict(candidate: Candidate, ceilingUsd: number): {
  verdict: 'try' | 'hold' | 'reject'; reasons: string[]; missing: string[];
} {
  const markup = markupCheck(candidate, ceilingUsd), listing = listingStatus(candidate), landed = landedCost(candidate);
  const reasons = [...markup.notes], missing: string[] = [];
  if (listing !== 'single') {
    reasons.push(listingStatusLabels[listing]);
    missing.push('Listing riêng đã đọc và đối chiếu với mẫu.');
  }
  if (candidate.matchType !== 'exact_sku') missing.push('Đối chiếu đúng SKU.');
  if (landed.amount == null) missing.push(`Báo giá vốn + ship: ${landed.reason}.`);
  else if (landed.currency !== 'USD') missing.push('Báo giá vốn và ship cùng là USD; không tự quy đổi.');
  if (markup.typicalRetailUsd == null) missing.push('Giá bán lẻ Mỹ của bản generic bằng USD.');
  if (!candidate.visualPayoff?.trim()) missing.push('Khung hình kết quả nhìn thấy được.');
  for (const [key, label] of [['ipRisk', 'bằng sáng chế / kiểu dáng'], ['brandRisk', 'thương hiệu']] as const) {
    if (candidate.logisticsFlags?.[key] === true) reasons.push(`Có rủi ro ${label}.`);
    else if (candidate.logisticsFlags?.[key] == null) missing.push(`Kiểm tra rủi ro ${label}.`);
  }
  const ceilingKnown = Number.isFinite(ceilingUsd) && ceilingUsd > 0;
  if (!ceilingKnown) missing.push('Trần vốn + ship hợp lệ bằng USD.');
  const overCeiling = ceilingKnown && landed.currency === 'USD' && landed.amount != null && landed.amount > ceilingUsd;
  if (overCeiling) reasons.push(`Vốn + ship vượt trần ${usd(ceilingUsd)} USD.`);
  if (markup.status === 'fail') return {verdict: 'reject', reasons: [...reasons, 'Giá bán lẻ Mỹ chưa đủ gấp 3 lần vốn + ship.'], missing};
  if (missing.length || listing !== 'single' || candidate.logisticsFlags?.ipRisk || candidate.logisticsFlags?.brandRisk || overCeiling)
    return {verdict: 'hold', reasons: [...reasons, ...(missing.length ? ['Chưa đủ dữ liệu chính để đề xuất thử.'] : [])], missing};
  return {verdict: 'try', reasons: [...reasons, `Đúng SKU, listing riêng, có cảnh kết quả; vốn + ship trong trần và đạt giả thuyết ${markup.status === 'ok_x4' ? '×4' : '×3'}.`, 'Chưa ghi nhận cờ IP hoặc thương hiệu trong dữ liệu đã lưu.'], missing};
}

export function supplierQuestions(candidate: Candidate): string[] {
  return [
    `Can you send the listing for this exact item (${candidate.name}) and confirm the SKU?`,
    `What is the unit price at your MOQ${candidate.logisticsFlags?.sizeFit ? ', broken down by each size' : ''}? Please state the MOQ and currency.`,
    'What are the shipping cost and delivery time to the US for each box size? Please include box dimensions, weight and currency.',
    'Can you send a sample? What are the sample price and shipping cost?',
    'Can you send real photos and videos of this exact item and its packaging?',
    ...(candidate.logisticsFlags?.ipRisk ? ['How does this design differ from the branded original, and what evidence supports your right to supply it?'] : []),
  ];
}

export function manualCheckLinks(keyword: string) {
  const link = (base: string, params: Record<string, string>) => {
    const url = new URL(base);
    url.search = new URLSearchParams(params).toString();
    return url.href;
  };
  return [
    {label: 'Meta Ad Library · Mỹ', url: link('https://www.facebook.com/ads/library/', {active_status: 'active', ad_type: 'all', country: 'US', q: keyword, search_type: 'keyword_unordered'})},
    {label: 'YouTube Shorts', url: link('https://www.youtube.com/results', {search_query: `${keyword} #shorts`})},
    {label: 'Amazon', url: link('https://www.amazon.com/s', {k: keyword})},
    {label: 'Walmart', url: link('https://www.walmart.com/search', {q: keyword})},
    {label: 'Google Patents', url: link('https://patents.google.com/', {q: keyword})},
  ];
}
