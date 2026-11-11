// Pure heuristics over untrusted public page text. No scripts, browser or LLM.
export const RAW_LIMIT = 200 * 1024;
export function boundedText(value, limit = RAW_LIMIT) {
 const bytes = Buffer.from(String(value ?? ''), 'utf8');
 return bytes.length <= limit ? bytes.toString('utf8') : bytes.subarray(0, limit).toString('utf8').replace(/\uFFFD$/, '');
}
const clean = value => String(value ?? '').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
 const code = Number.parseInt(hex || dec, hex ? 16 : 10);
 return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}).replace(/&(nbsp|amp|lt|gt|quot|yen|euro|pound);/gi, (_, key) => ({nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', yen:'¥', euro:'€', pound:'£'}[key.toLowerCase()]));
const plain = value => clean(value).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim();
const short = value => value ? plain(value).slice(0, 500) || null : null;
export function accessBlocked(value, {isPage = true} = {}) {
 const raw = String(value);
 // Generic denial wording can also occur in a product description. Inspect
 // only the title and the first 2 KiB of page text, excluding non-content HTML.
 const content = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
 if (/captcha|verify (?:that )?you are human|sign in to continue|log in to continue|login required|authentication required|登录后查看|请登录|验证码|\b(?:HTTP(?:\/\d(?:\.\d)?)?|status(?: code)?)\s*[:=]?\s*(?:403|429)\b|\b403\s+forbidden|too many requests/i.test(plain(content))) return true;
 // A tool/file error with generic denial wording is not evidence of a blocked page.
 if (!isPage) return false;
 const title = plain(content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
 const visible = plain(content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')).replace(/\s+/g, ' ').trim();
 return /\baccess\s+(?:denied|forbidden)\b|访问受限/i.test(title + '\n' + boundedText(visible, 2 * 1024));
}
const currencySymbols = {CNY:['¥','CN¥'], USD:['US$','$'], VND:['₫'], EUR:['€'], GBP:['£']};
function sourceCurrency(symbol, sourceUrl) {
 if (symbol !== '¥') return Object.keys(currencySymbols).find(code => currencySymbols[code].includes(symbol)) ?? null;
 try {
  const host = new URL(sourceUrl).hostname;
  return ['1688.com','alibaba.com','aliexpress.com','aliexpress.us','taobao.com','tmall.com'].some(domain => host === domain || host.endsWith('.'+domain)) ? 'CNY' : null;
 } catch { return null; }
}
const relatedLabel = /(?:^|[\s_-])(?:related|recommend(?:ed|ation|ations)?)(?=$|[\s_-])|you[\s_-]+may[\s_-]+also[\s_-]+like|相关推荐|猜你喜欢/i;
const productPath = /^\/(?:offer\/\d+\.html|item\/\d+\.html|products\/[^/?#]+)\/?$/i;
const attributes = tag => Object.fromEntries([...tag.matchAll(/\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), clean(m[2] ?? m[3] ?? m[4])]));
function productKey(value, sourceUrl) {
 try { const url = new URL(clean(value), sourceUrl); return /^https?:$/.test(url.protocol) && productPath.test(url.pathname) ? url.hostname+url.pathname.replace(/\/$/,'') : null; } catch { return null; }
}
// A small, conservative structural scan, not a browser/HTML renderer. Ambiguous
// markup or plain/Markdown text may suggest a showroom only in the details.
export function listingProducts(raw, sourceUrl) {
 const html = raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
 const root = {tag:'root',children:[],parent:null,text:''}, stack = [root], nodes = [];
 let reliable = true, cursor = 0;
 for (const token of html.matchAll(/<\/?[a-z][^>]*>/gi)) {
  stack.at(-1).text += html.slice(cursor,token.index);cursor = token.index+token[0].length;
  const tag = token[0].match(/^<\/?([\w-]+)/)[1].toLowerCase();
  if (token[0].startsWith('</')) {
   if (stack.at(-1).tag !== tag) reliable = false;
   const index = stack.findLastIndex(node => node.tag === tag);
   if (index > 0) { for (const node of stack.splice(index)) node.end = token.index; }
   continue;
  }
  const attrs = attributes(token[0]), parent = stack.at(-1);
  const node = {tag,attrs,parent,children:[],text:'',start:token.index+token[0].length,end:html.length,excluded:false};
  parent.children.push(node);nodes.push(node);
  if (relatedLabel.test([attrs.class,attrs.id,attrs['aria-label']].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g,'$1-$2'))) node.excluded=true;
  if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !token[0].endsWith('/>')) stack.push(node);
 }
 stack.at(-1).text += html.slice(cursor);
 if (stack.length > 1 || relatedLabel.test(clean(root.text))) reliable = false;
 for (const node of nodes) {
  if (!/^(?:h[1-6]|p|strong|span|div)$/.test(node.tag)) continue;
  // Only short labels, never a whole container full of product descriptions.
  if (node.end-node.start > 1000) continue;
  if (node.children.some(child => !/^(?:span|strong|em|b|i)$/.test(child.tag))) continue;
  const label = plain(html.slice(node.start,node.end));
  if (label.length > 100 || !relatedLabel.test(label)) continue;
  // A heading may sit in its own wrapper; exclude the enclosing region that
  // actually contains products, not just the heading's immediate parent.
  let region=node.parent,found=false;
  while(region && !/^(?:root|html|body|main)$/.test(region.tag)) {
   if (/^(?:section|aside|div)$/.test(region.tag) && /data-(?:product|offer)-id|\b(?:product-card|product-item|offer-card|offer-item)\b|\/(?:item|offer)\/\d+\.html|\/products\//i.test(html.slice(region.start,region.end))) {region.excluded=true;found=true;break;}
   region=region.parent;
  }
  if (!found && !node.excluded) reliable = false;
 }
 const current = productKey(sourceUrl,sourceUrl), links = new Set(), ids = new Set();
 let cards = 0;
 for (const node of nodes) {
  node.excluded ||= node.parent.excluded === true;
  if (node.excluded) continue;
  // A provider may flatten a recommendation region so its boundaries disappear.
  if (relatedLabel.test(clean(node.text))) reliable = false;
  const key = node.tag === 'a' ? productKey(node.attrs.href,sourceUrl) : null;
  if (key && key !== current) links.add(key);
  const card = /(?:^|\s)(?:product-card|product-item|offer-card|offer-item)(?:\s|$)/.test(node.attrs.class ?? '');
  const id = node.attrs['data-product-id'] ?? node.attrs['data-offer-id'];
  if (!card && !id) continue;
  const cardLinks = [...html.slice(node.start,node.end).matchAll(/<a\b[^>]*>/gi)].map(m => productKey(attributes(m[0]).href,sourceUrl)).filter(Boolean);
  if (cardLinks.length && cardLinks.every(link => link === current)) continue;
  if (id && current?.match(/\/(?:offer|item)\/(\d+)\.html$/)?.[1] === id) continue;
  if (card) cards++;
  if (id) ids.add(id);
 }
 if (!nodes.length) {
  reliable = false;
  for (const m of html.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/(?:offer\/\d+\.html|item\/\d+\.html|products\/[^\s"'<>?#)]+)/gi)) {
   const key = productKey(m[0],sourceUrl);if (key && key !== current) links.add(key);
  }
 }
 return {productCountOnPage:Math.max(cards,ids.size,links.size)||null, productCountReliable:reliable};
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
 const blocked = accessBlocked(html);
 const title = short(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ?? html.match(/^(?:Title:\s*|#\s+)(.+)$/im)?.[1]);
 const priceText = short(text.match(/(?:CN¥|US\$|¥|\$|₫|€|£)\s*\d[\d.,]*(?:\s*[-–~]\s*(?:CN¥|US\$|¥|\$|₫|€|£)?\s*\d[\d.,]*)?|\d[\d.,]*(?:\s*(?:₫|€|£)?\s*[-–~]\s*\d[\d.,]*)?\s*(?:₫|€|£)/)?.[0]);
 const symbol = priceText?.match(/CN¥|US\$|¥|\$|₫|€|£/)?.[0] ?? null;
 const ambiguousYen = symbol === '¥' && sourceCurrency(symbol,sourceUrl) === null;
 const currencyDetected = ambiguousYen ? null : symbol;
 const currencyNote = ambiguousYen ? '¥ không rõ CNY/JPY' : null;
 const moqText = short(text.match(/(?:Min(?:imum)?\.?\s*order(?:\s*quantity)?|MOQ|起订(?:量)?)\s*[:：]?\s*\d[\d,]*(?:\s*(?:pieces?|pcs|件))?|\d[\d,]*\s*(?:件起批|件起订|pieces?\s*\(?min\.?\s*order\)?)/i)?.[0]);
 const shippingText = short(text.split(/\r?\n/).find(line => /\b(?:shipping|ships?\s+(?:to|from)|delivery|freight)\b|运费|发货|包邮/i.test(line)));
 const {productCountOnPage,productCountReliable} = listingProducts(html,sourceUrl);
 return {status: blocked ? 'blocked' : text ? 'ok' : 'failed', fetchedAt, title,
  priceText: blocked ? null : priceText, currencyDetected: blocked ? null : currencyDetected,
  currencyNote: blocked ? null : currencyNote, productCountReliable: blocked ? null : productCountReliable,
  moqText: blocked ? null : moqText, shippingText: blocked ? null : shippingText,
  productCountOnPage: blocked ? null : productCountOnPage, rawPath, sourceUrl};
}
export function listingWarnings(candidate, check) {
 if (check.status !== 'ok') return [check.status === 'unavailable' ? 'Chưa kiểm được nguồn (công cụ chưa sẵn sàng hoặc chưa xác nhận lệnh đọc).' : check.status === 'blocked' ? 'Không đọc được trang (bị chặn).' : 'Không đọc được trang (lỗi đọc hoặc mất mạng).'];
 const warnings = [];
 if (check.productCountOnPage >= 6) warnings.push(check.productCountReliable === true
  ? `Trang nguồn có ${check.productCountOnPage} sản phẩm ngoài vùng gợi ý → có thể là showroom; cần đối chiếu listing riêng.`
  : `Trang nguồn có ${check.productCountOnPage} dấu hiệu sản phẩm; chưa tách được vùng gợi ý, chỉ gợi ý có thể là showroom trong chi tiết.`);
 const currency = candidate.costCurrency ?? candidate.currency;
 // Compare one price or an inclusive range in the same currency. No FX.
 const prices = check.priceText?.match(/\d[\d.,]*/g) ?? [];
 const numbers = prices.every(price => /^\d+(?:\.\d{1,2})?$/.test(price)) ? prices.map(Number) : [];
 const range = numbers.length === 1 ? [numbers[0],numbers[0]] : numbers.length === 2 && /[-–~]/.test(check.priceText) && numbers[0] <= numbers[1] ? numbers : null;
 const symbols = check.priceText?.match(/CN¥|US\$|¥|\$|₫|€|£/g) ?? [];
 const sameCurrency = symbols.length > 0 && symbols.every(symbol => sourceCurrency(symbol,check.sourceUrl) === currency);
 if (candidate.cost != null && check.priceText && (!sameCurrency || !range || candidate.cost < range[0] || candidate.cost > range[1])) {
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
