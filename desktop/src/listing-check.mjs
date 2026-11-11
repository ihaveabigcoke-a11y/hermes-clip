// Pure heuristics over untrusted public page text. No scripts, browser or LLM.
export const RAW_LIMIT = 200 * 1024;
export function boundedText(value, limit = RAW_LIMIT) {
 const bytes = Buffer.from(String(value ?? ''), 'utf8');
 return bytes.length <= limit ? bytes.toString('utf8') : bytes.subarray(0, limit).toString('utf8').replace(/\uFFFD$/, '');
}
const clean = value => String(value ?? '').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
 const code = Number.parseInt(hex || dec, hex ? 16 : 10);
 return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/&(nbsp|amp|lt|gt|quot|yen|euro);/gi, (_, key) => ({nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', yen:'¥', euro:'€'}[key.toLowerCase()]));
const plain = value => clean(value).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim();
const short = value => value ? plain(value).slice(0, 500) || null : null;
export function accessBlocked(value) {
 return /captcha|access denied|access forbidden|verify (?:that )?you are human|sign in to continue|log in to continue|登录后查看|访问受限|验证码|\b(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:403|429)\b|\b403\s+forbidden|too many requests/i.test(String(value));
}
export function pageText(response) {
 const result = response?.result ?? response;
 if (typeof result === 'string') return boundedText(result);
 for (const key of ['html', 'markdown', 'content', 'text']) {
  if (typeof result?.[key] === 'string' && result[key].trim()) {
   return boundedText((typeof result.title === 'string' ? `Title: ${result.title}\n` : '') + result[key]);
  }
 }
 throw Error('Agent Reach chưa trả nội dung trang đọc được.');
}
export function extractListing(raw, {fetchedAt, rawPath, sourceUrl}) {
 const html = boundedText(raw);
 const text = plain(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, '\n'));
 const blocked = accessBlocked(text);
 const title = short(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ?? html.match(/^(?:Title:\s*|#\s+)(.+)$/im)?.[1]);
 const priceText = short(text.match(/(?:CN¥|US\$|¥|\$|₫|€)\s*\d[\d.,]*(?:\s*[-–~]\s*(?:CN¥|US\$|¥|\$|₫|€)?\s*\d[\d.,]*)?|\d[\d.,]*\s*(?:₫|€)/)?.[0]);
 const currencyDetected = priceText?.match(/CN¥|US\$|¥|\$|₫|€/)?.[0] ?? null;
 const moqText = short(text.match(/(?:Min(?:imum)?\.?\s*order(?:\s*quantity)?|MOQ|起订(?:量)?)\s*[:：]?\s*\d[\d,]*(?:\s*(?:pieces?|pcs|件))?|\d[\d,]*\s*(?:件起批|件起订|pieces?\s*\(?min\.?\s*order\)?)/i)?.[0]);
 const shippingText = short(text.split(/\r?\n/).find(line => /\b(?:shipping|ships?\s+(?:to|from)|delivery|freight)\b|运费|发货|包邮/i.test(line)));
 const cards = [...html.matchAll(/<[^>]+\bclass\s*=\s*["'][^"']*\b(?:product-card|product-item|offer-card|offer-item)\b[^"']*["'][^>]*>/gi)].length;
 const ids = new Set([...html.matchAll(/\bdata-(?:product|offer)-id\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));
 const links = new Set([...html.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/(?:offer\/\d+\.html|item\/\d+\.html|products\/[^\s"'<>?#]+)/gi)].map(m => m[0].replace(/^https?:\/\/[^/]+/, '')));
 const productCountOnPage = Math.max(cards, ids.size, links.size) || null;
 return {status: blocked ? 'blocked' : text ? 'ok' : 'failed', fetchedAt, title,
  priceText: blocked ? null : priceText, currencyDetected: blocked ? null : currencyDetected,
  moqText: blocked ? null : moqText, shippingText: blocked ? null : shippingText,
  productCountOnPage: blocked ? null : productCountOnPage, rawPath, sourceUrl};
}
export function listingWarnings(candidate, check) {
 if (check.status !== 'ok') return [check.status === 'blocked' ? 'Không đọc được trang (bị chặn).' : 'Không đọc được trang (lỗi đọc hoặc mất mạng).'];
 const warnings = [];
 if (check.productCountOnPage >= 6) warnings.push(`Trang nguồn có ${check.productCountOnPage} sản phẩm → có thể là showroom hoặc danh sách gợi ý; cần đối chiếu listing riêng.`);
 const symbols = {CNY:['¥','CN¥'], USD:['US$','$'], VND:['₫'], EUR:['€']};
 const currency = candidate.costCurrency ?? candidate.currency;
 // Compare only one unambiguous numeric price in the same stated currency. No FX.
 const prices = check.priceText?.match(/\d[\d.,]*/g) ?? [];
 const numeric = prices.length === 1 && /^\d+(?:\.\d{1,2})?$/.test(prices[0]) ? Number(prices[0]) : null;
 if (candidate.cost != null && check.priceText && (!symbols[currency]?.includes(check.currencyDetected) || numeric === null || numeric !== candidate.cost)) {
  warnings.push(`Muse ghi giá ${candidate.cost} ${currency}, trang nguồn hiện ${check.priceText}; cần đối chiếu SKU/MOQ và tiền tệ, chưa quy đổi.`);
 }
 const moq = check.moqText?.match(/\d[\d,]*/)?.[0];
 if (candidate.minimumOrder != null && moq && Number(moq.replaceAll(',', '')) !== candidate.minimumOrder) {
  warnings.push(`Muse ghi MOQ ${candidate.minimumOrder}, trang nguồn hiện ${check.moqText}.`);
 }
 return warnings;
}
export function publicUrl(value) {
 try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048 ? url.href : null; } catch { return null; }
}
const observedCount = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e12 ? value : null;
function published(value) {
 if (typeof value !== 'string') return null;
 const iso = /^\d{8}$/.test(value) ? `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}T00:00:00Z` : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value+'T00:00:00Z' : value;
 return /^\d{4}-\d{2}-\d{2}T/.test(iso) && Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : null;
}
export function youtubeObservation(items, query, observedAt, rawPath) {
 const seen=new Set();
 const results = items.filter(item => {
  const value = publicUrl(item.url ?? item.webpage_url);
  if(!value)return false;
  const url=new URL(value);
  if(!/^(?:www\.)?(?:youtube\.com|youtu\.be)$/.test(url.hostname))return false;
  const id=url.hostname.endsWith('youtu.be')?url.pathname.slice(1):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/shorts\/([\w-]+)\/?$/)?.[1];
  if(!id||!/^[\w-]+$/.test(id)||seen.has(id))return false;
  seen.add(id);return true;
 }).slice(0, 10);
 const views = results.map(item => observedCount(item.view_count ?? item.views)).filter(v => v !== null);
 const dates = results.map(item => published(item.publishedAt ?? item.upload_date ?? item.published_at)).filter(Boolean).sort();
 return {status:'ok', resultCount:results.length || null, maxViews:views.length ? Math.max(...views) : null,
  newestPublishedAt:dates.at(-1) ?? null, observedAt, sourceUrl:'https://www.youtube.com/results?search_query='+encodeURIComponent(query),
  rawPath, matchType:'similar', period:'Kết quả tìm kiếm tại thời điểm đọc; không phải kỳ 30 ngày.',
  note:'YouTube Shorts, không phải Instagram. Truy vấn “shorts”; chưa xác minh từng video là Shorts hay đúng SKU. Không phải tổng thị trường.'};
}
export function webObservation(items, query, observedAt, rawPath) {
 const links = [...new Set(items.map(item => publicUrl(item.url)).filter(Boolean))].slice(0, 5);
 return {status:'ok', links:links.length ? links : null, observedAt, sourceUrl:links[0] ?? null, rawPath,
  query, note:'Link từ tìm kiếm web để tham khảo; chưa mở TikTok/Reels, không phải số cạnh tranh Instagram.'};
}
