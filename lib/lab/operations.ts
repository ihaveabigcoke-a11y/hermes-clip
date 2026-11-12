import { z } from "zod";
import { ctaKeywordSchema } from './production.ts';
import { isHttpsLink } from './utm.ts';
import { countKeywordComments, parseCommentPaste } from './keyword-comments.ts';

export const commentKeywordSchema = z.string().trim().toUpperCase().pipe(ctaKeywordSchema);

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const text = (max = 2000) => z.string().trim().max(max).default("");
export const sourceLink = z.string().trim().max(2048).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}, "Điền URL HTTPS đầy đủ, không chứa thông tin đăng nhập.");
const optionalLink = z.union([z.literal(""), sourceLink]).default("");
const amount = z.number().finite().min(0).max(1e9).nullable().default(null);
const count = z.number().int().min(0).max(1e12);
export const candidateCurrencySchema = z.enum(["USD", "VND", "GBP", "EUR", "CNY"]);
const nullableText = (max: number) => z.string().trim().max(max).nullable().default(null);
const logisticsFlag = z.boolean().nullable().default(null);
const observationStatus = z.enum(['ok', 'unavailable', 'blocked', 'failed']);
const observedAt = z.string().datetime({offset: true});
const observationFile = z.string().max(2048).nullable().default(null);
export const usRetailSchema = z.object({
  low: amount, high: amount,
  currency: z.literal('USD').nullable().default(null),
  sources: z.array(z.object({
    url: sourceLink, title: nullableText(300), price: amount,
    observedAt: observedAt.nullable().default(null),
  })).max(4).default([]),
}).superRefine((value, ctx) => {
  if (value.low != null && value.high != null && value.low > value.high)
    ctx.addIssue({code: 'custom', path: ['high'], message: 'Giá cao phải lớn hơn hoặc bằng giá thấp.'});
});
export const listingCheckSchema = z.object({
  status: observationStatus, fetchedAt: observedAt,
  title: nullableText(500), priceText: nullableText(500), currencyDetected: nullableText(20),
  moqText: nullableText(500), shippingText: nullableText(500),
  productCountOnPage: count.nullable().default(null), rawPath: observationFile,
  productCountReliable: z.boolean().nullable().default(null), currencyNote: nullableText(500),
  sourceUrl: sourceLink, warnings: z.array(z.string().max(1200)).max(6).default([]),
  error: nullableText(1000),
});
const youtubeShortsSchema = z.object({
  status: observationStatus, resultCount: z.number().int().min(1).max(10).nullable().default(null),
  maxViews: count.nullable().default(null), newestPublishedAt: observedAt.nullable().default(null),
  sourceUrl: sourceLink, observedAt, rawPath: observationFile,
  matchType: z.literal('similar'), period: z.string().max(500), note: z.string().max(1200), error: nullableText(1000),
});
const webReferencesSchema = z.object({
  status: observationStatus, links: z.array(sourceLink).min(1).max(5).nullable().default(null),
  sourceUrl: sourceLink.nullable().default(null), observedAt, rawPath: observationFile,
  query: z.string().max(300), note: z.string().max(1200), error: nullableText(1000),
});

export const candidateSchema = z.object({
  provider:z.string().regex(/^(muse|manual|codex|import:[^\r\n]{1,80})$/).optional(),
  id: identifier,
  name: z.string().trim().min(2).max(120),
  supplierUrl: optionalLink,
  source: z.string().regex(/^import:[^\r\n]{1,80}$/).optional(),
  listingStatus: z.enum(['single', 'showroom', 'not_found', 'blocked']).optional(),
  importMetadata: z.object({rawJson: z.string().max(384000)}).optional(),
  supplierCountry: text(80),
  evidenceUrl: optionalLink,
  evidenceNotes: z.string().trim().min(1, "Ghi điều đã kiểm tra tại nguồn.").max(3000),
  contentAngle: text(2000),
  risks: text(2000),
  cost: amount,
  shipping: amount,
  price: amount,
  currency: candidateCurrencySchema.default("USD"),
  // Missing/null overrides inherit the shared currency used by legacy batches.
  costCurrency: candidateCurrencySchema.nullable().optional(),
  shippingCurrency: candidateCurrencySchema.nullable().optional(),
  usRetail: usRetailSchema.nullable().optional(),
  ipNotes: nullableText(600),
  verdict: z.enum(["try", "hold", "reject"]).nullable().default(null),
  verdictReason: nullableText(1200),
  matchType: z.enum(["exact_sku", "similar", "unknown"]).nullable().default(null),
  visualPayoff: nullableText(1200),
  aiFidelityRisks: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  logisticsFlags: z.object({
    battery: logisticsFlag, liquid: logisticsFlag, fragile: logisticsFlag,
    sizeFit: logisticsFlag, vehicleFit: logisticsFlag, bulky: logisticsFlag, brandRisk: logisticsFlag,
    ipRisk: z.boolean().nullable().optional(),
  }).nullable().default(null),
  competition: z.object({
    activeAdsObserved: count.nullable().default(null),
    similarReels30d: count.nullable().default(null),
    observedAt: z.string().datetime({offset: true}).nullable().default(null),
    sourceUrl: sourceLink.nullable().default(null),
    note: nullableText(1200),
    youtubeShorts: youtubeShortsSchema.nullable().optional(),
    webReferences: webReferencesSchema.nullable().optional(),
  }).superRefine((value, ctx) => {
    if (value.activeAdsObserved !== null || value.similarReels30d !== null) {
      for (const field of ["sourceUrl", "observedAt"] as const) {
        if (!value[field]) ctx.addIssue({code: "custom", path: [field], message: "Số quan sát cần nguồn và thời điểm đọc."});
      }
    }
  }).nullable().default(null),
  listingCheck: listingCheckSchema.nullable().optional(),
  qualityWarnings: z.array(z.enum(["shared_supplier_url"])).max(1).default([]),
  imageUrl: optionalLink,
  imageSourceUrl: optionalLink,
  marketEvidence: z.array(z.object({
    label: z.string().trim().min(1).max(100), value: z.number().finite().min(0).max(1e12),
    unit: z.string().trim().min(1).max(40), market: text(100), period: text(100),
    sourceUrl: sourceLink, observedAt: z.string().datetime(),
    // Derived locally across the whole batch; absent in legacy records.
    pageLevel: z.boolean().optional(),
  })).max(8).default([]),
  minimumOrder: z.number().int().positive().max(1e9).nullable().default(null),
  targetCustomer: text(500),
  marketAssessment: text(1200),
});
export const researchBatchSchema = z.object({
  selectionDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  selectionLinks: z.array(z.object({candidateId:identifier,productId:identifier})).max(10).optional(),
  name: z.string().trim().min(2).max(140),
  market: z.string().trim().min(2).max(100).default("United States"),
  locale: z.string().trim().min(2).max(40).default("en-US"),
  maxLandedCostUsd: z.number().finite().positive().max(1e9).nullable().optional(),
  candidates: z.array(candidateSchema).max(10).default([]),
  selectedIds: z.array(identifier).max(3, "Mỗi đợt chọn tối đa 3 sản phẩm.").default([]),
  notes: text(20000),
}).superRefine((value, ctx) => {
  value.candidates.forEach((candidate, index) => {
    if (!candidate.supplierUrl && candidate.listingStatus !== 'not_found')
      ctx.addIssue({code:'custom',path:['candidates',index,'supplierUrl'],message:'Cần URL nguồn HTTPS; chỉ not_found được để trống.'});
    if (candidate.listingStatus && candidate.listingStatus !== 'single') for (const field of ['cost','shipping'] as const)
      if (candidate[field] !== null) ctx.addIssue({code:'custom',path:['candidates',index,field],message:'Listing chưa phải single: số tiền phải là null.'});
  });
  if (new Set(value.candidates.map(candidate => candidate.id)).size !== value.candidates.length)
    ctx.addIssue({code: "custom", path: ["candidates"], message: "ID ứng viên bị trùng."});
  if (new Set(value.selectedIds).size !== value.selectedIds.length || value.selectedIds.some(id => !value.candidates.some(candidate => candidate.id === id)))
    ctx.addIssue({code: "custom", path: ["selectedIds"], message: "Chọn các ứng viên khác nhau trong đợt này."});
});
export const socialAccountSchema = z.object({
  name: z.string().trim().min(2).max(120),
  productId: identifier,
  handle: z.string().trim().regex(/^[a-zA-Z0-9._]{0,30}$/, "Điền username Instagram, bỏ ký tự @.").default(""),
  contentAngle: text(2000),
  bio: text(150),
  notes: text(),
  archived: z.boolean().default(false),
});
export const contentPlanSchema = z.object({
  offerPrice:z.number().finite().nonnegative().nullable().optional(),
  offerCurrency:candidateCurrencySchema.nullable().optional(),
  comparison:z.object({groupId:identifier,sourceGroupId:identifier,ctaKeyword:commentKeywordSchema,price:z.number().finite().nonnegative().nullable(),currency:candidateCurrencySchema.nullable(),landingBaseUrl:z.string().refine(isHttpsLink).nullable(),variantId:identifier,assetId:identifier,accountId:z.union([z.literal(''),identifier])}).optional(),
  variantId:identifier.nullable().optional(),
  provider:z.string().regex(/^(muse|manual|codex|import:[^\r\n]{1,80})$/).optional(),
  name: z.string().trim().min(2).max(150),
  productId: identifier,
  accountId: z.union([z.literal(""), identifier]).default(""),
  productionId: z.union([z.literal(""), identifier]).default(""),
  assetId: z.union([z.literal(""), identifier]).default(""),
  hook: text(600),
  script: text(6000),
  caption: text(2200),
  apiVideoUrl: z.union([z.literal(''),z.string().trim().max(2048).refine(isHttpsLink,'Video cần URL HTTPS công khai.')]).optional(),
  ctaKeyword: z.preprocess(value => value === '' ? null : value, commentKeywordSchema.nullable().optional()),
  landingBaseUrl: z.preprocess(value => value === '' ? null : value,
    z.string().trim().max(2048).refine(isHttpsLink, 'Điền URL HTTPS hợp lệ, không chứa thông tin đăng nhập.').nullable().optional()),
  utmLink: z.string().trim().max(8192).refine(isHttpsLink, 'Link UTM phải dùng HTTPS.').nullable().optional(),
  utmHookId: z.string().trim().max(180).nullable().optional(),
  utmClicks: count.nullable().optional(),
  utmClicksSource: text(500).optional(),
  utmClicksPeriod: text(200).optional(),
  utmClicksObservedAt: z.string().datetime().nullable().optional(),
  // Missing/null keeps old records readable; the publishing snapshot resolves
  // it to off (user default). Only explicit "required" turns on the label check.
  aiLabel: z.enum(["required", "off"]).nullable().optional(),
  plannedDate: z.union([z.literal(""), z.string().date()]).default(""),
  status: z.enum(["draft", "planned", "published_manual", "published_browser"]).default("draft"),
  publishSource: z.enum(['browser','api']).nullable().optional(),
  postUrl: optionalLink,
  notes: text(),
}).superRefine((value, ctx) => {
  if (value.utmClicks != null && (!value.utmLink || !value.utmClicksSource?.trim() || !value.utmClicksPeriod?.trim() || !value.utmClicksObservedAt))
    ctx.addIssue({code:'custom',path:['utmClicks'],message:'Click UTM cần đúng link, nguồn analytics, kỳ đo và thời điểm đo.'});
  if (value.status !== "draft" && !value.accountId) ctx.addIssue({code: "custom", path: ["accountId"], message: "Chọn tài khoản trước khi lên kế hoạch hoặc ghi nhận bài đăng."});
  if (["published_manual", "published_browser"].includes(value.status)) {
    let valid = false;
    try {
      const url = new URL(value.postUrl);
      valid = ["instagram.com", "www.instagram.com"].includes(url.hostname) && /^\/(p|reel|reels)\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname);
    } catch { /* Validation below supplies the field error. */ }
    if (!valid) ctx.addIssue({code: "custom", path: ["postUrl"], message: "Gắn URL bài Instagram đã đăng để ghi nhận thủ công."});
  }
});
export const socialMetricSchema = z.object({
  planId: identifier,
  observedAt: z.string().datetime({offset: true}),
  views: count.nullable(),
  likes: count.nullable(),
  comments: count.nullable(),
  saves: count.nullable(),
  shares: count.nullable(),
  profileVisits: count.nullable(),
  linkClicks: count.nullable(),
  viewers: count.nullable().default(null),
  reach: count.nullable().optional(),
  interactions: count.nullable().default(null),
  reelInteractions: count.nullable().default(null),
  accountsEngaged: count.nullable().default(null),
  profileActivity: count.nullable().default(null),
  follows: count.nullable().default(null),
  source: z.enum(['manual', 'instagram_browser', 'api']).default('manual'),
  accountId: z.union([z.literal(''), identifier]).default(''),
  handle: z.string().regex(/^[a-zA-Z0-9._]{0,30}$/).default(''),
  insightsUrl: optionalLink,
  approximate: z.array(z.enum(['views','likes','comments','saves','shares','profileVisits','linkClicks','viewers','interactions','reelInteractions','accountsEngaged','profileActivity','follows'])).default([]),
  sourceUrl: sourceLink,
  notes: text(),
});
export const keywordCommentMeasurementSchema = z.object({
  planId: identifier,
  accountId: identifier,
  sourceUrl: sourceLink,
  source: z.literal('manual_paste'),
  observedAt: z.string().datetime({offset: true}),
  keyword: commentKeywordSchema,
  inputFormat: z.enum(['text', 'username']).default('text'),
  rawText: z.string().trim().min(1, 'Dán ít nhất một comment để lưu bản đo.').max(100000),
}).transform(value => ({...value, ...countKeywordComments(parseCommentPaste(value.rawText, value.inputFormat), value.keyword)}));
export const landingPageSchema = z.object({
  provider:z.string().regex(/^(muse|manual|codex|import:[^\r\n]{1,80})$/).optional(),
  productId: identifier,
  headline: z.string().trim().min(2).max(160),
  description: z.string().trim().min(2).max(5000),
  benefits: text(3000),
  limitations: text(3000),
  imageAssetId: z.union([z.literal(""), identifier]).default(""),
  ctaLabel: z.string().trim().min(1).max(80).default("Learn more"),
  ctaUrl: optionalLink,
});
export const operationSchemas = {
  research_batch: researchBatchSchema,
  social_account: socialAccountSchema,
  content_plan: contentPlanSchema,
  social_metric: socialMetricSchema,
  keyword_comment_measurement: keywordCommentMeasurementSchema,
  landing_page: landingPageSchema,
};
export type ResearchBatch = z.infer<typeof researchBatchSchema>;
export type Candidate = z.infer<typeof candidateSchema>;

export function candidateCurrency(candidate: Pick<Candidate, "currency" | "costCurrency" | "shippingCurrency">, field: "cost" | "shipping" | "price") {
  if (field === "cost") return candidate.costCurrency ?? candidate.currency;
  if (field === "shipping") return candidate.shippingCurrency ?? candidate.currency;
  return candidate.currency;
}

type LandedCost =
  | {amount: number; currency: Candidate["currency"]; reason: null}
  | {amount: null; currency: null; reason: "khác tiền tệ" | "thiếu ship" | "thiếu giá vốn"};

export function landedCost(candidate: Pick<Candidate, "cost" | "shipping" | "currency" | "costCurrency" | "shippingCurrency">): LandedCost {
  if (candidate.shipping == null) return {amount: null, currency: null, reason: "thiếu ship"};
  if (candidate.cost == null) return {amount: null, currency: null, reason: "thiếu giá vốn"};
  const currency = candidateCurrency(candidate, "cost");
  if (currency !== candidateCurrency(candidate, "shipping")) return {amount: null, currency: null, reason: "khác tiền tệ"};
  return {amount: candidate.cost + candidate.shipping, currency, reason: null};
}

export function researchProductId(batchId: string, candidateId: string) {
  // Both IDs are generated once and reused for retries and duplicate clicks.
  const legacy = `research_${batchId}_${candidateId}`;
  if (legacy.length <= 120) return legacy;
  // FNV-1a 128 for long imported IDs; preserve all existing, valid legacy IDs.
  let hash = BigInt('0x6c62272e07bb014262b821756295c58d');
  for (const char of JSON.stringify([batchId, candidateId])) {
    hash = BigInt.asUintN(128, (hash ^ BigInt(char.charCodeAt(0))) * BigInt('0x1000000000000000000013b'));
  }
  return `research_long_${hash.toString(16).padStart(32, '0')}`;
}

type OperationRecord = {id: string; kind: string; data: Record<string, any>; updatedAt: number};
export function socialTotals(records: OperationRecord[], accountId: string) {
  const plans = records.filter(record => record.kind === "content_plan" && record.data.accountId === accountId);
  const latest = new Map<string, OperationRecord>();
  for (const record of records.filter(record => record.kind === "social_metric" && plans.some(plan => plan.id === record.data.planId))) {
    const previous = latest.get(record.data.planId);
    if (!previous || Date.parse(record.data.observedAt) > Date.parse(previous.data.observedAt)) latest.set(record.data.planId, record);
  }
  const keys = ["views", "likes", "comments", "saves", "shares", "profileVisits", "linkClicks"] as const;
  const publishedPosts = plans.filter(plan => ['published_browser','published_manual'].includes(plan.data.status) || latest.has(plan.id)).length;
  const totals = {views: null, likes: null, comments: null, saves: null, shares: null, profileVisits: null, linkClicks: null,
    measuredPosts: latest.size, posts: plans.length, publishedPosts} as Record<typeof keys[number], number | null> & {measuredPosts: number; posts: number; publishedPosts: number};
  for (const key of keys) {
    const values = [...latest.values()].map(metric => metric.data[key]);
    if (values.length > 0 && values.length === publishedPosts && values.every(value => typeof value === 'number' && Number.isFinite(value)))
      totals[key] = values.reduce((sum, value) => sum + value, 0);
  }
  return totals;
}

export function landingHtml(page: z.infer<typeof landingPageSchema>, image = "") {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]!));
  const benefits = page.benefits.split(/\r?\n/).filter(Boolean).map(line => `<li>${escape(line)}</li>`).join("");
  const safeImage = /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(image) ? image : "";
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.headline)}</title><style>body{margin:0;background:#f8f7f2;color:#1a1a1a;font:18px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:48px 24px}img{max-width:100%;max-height:65vh;object-fit:contain}h1{font-size:clamp(32px,6vw,64px);line-height:1.1}p{white-space:pre-line}a{display:inline-block;background:#d4ff3a;color:#171a0b;padding:12px 20px;border-radius:8px}small{display:block;color:#62635d}</style></head><body><main>${safeImage ? `<img src="${safeImage}" alt="Product reference">` : ""}<h1>${escape(page.headline)}</h1><p>${escape(page.description)}</p>${benefits ? `<ul>${benefits}</ul>` : ""}${page.limitations ? `<p>${escape(page.limitations)}</p>` : ""}${page.ctaUrl ? `<a href="${escape(page.ctaUrl)}" rel="noopener noreferrer">${escape(page.ctaLabel)}</a>` : ""}<small>Product page draft · local preview</small></main></body></html>`;
}
