import { z } from "zod";

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

export const candidateSchema = z.object({
  id: identifier,
  name: z.string().trim().min(2).max(120),
  supplierUrl: sourceLink,
  supplierCountry: text(80),
  evidenceUrl: optionalLink,
  evidenceNotes: z.string().trim().min(1, "Ghi điều đã kiểm tra tại nguồn.").max(3000),
  contentAngle: text(2000),
  risks: text(2000),
  cost: amount,
  shipping: amount,
  price: amount,
  currency: z.enum(["USD", "VND", "GBP", "EUR"]).default("USD"),
  imageUrl: optionalLink,
  imageSourceUrl: optionalLink,
  marketEvidence: z.array(z.object({
    label: z.string().trim().min(1).max(100), value: z.number().finite().min(0).max(1e12),
    unit: z.string().trim().min(1).max(40), market: text(100), period: text(100),
    sourceUrl: sourceLink, observedAt: z.string().datetime(),
  })).max(8).default([]),
  minimumOrder: z.number().int().positive().max(1e9).nullable().default(null),
  targetCustomer: text(500),
  marketAssessment: text(1200),
});
export const researchBatchSchema = z.object({
  name: z.string().trim().min(2).max(140),
  market: z.string().trim().min(2).max(100).default("United States"),
  locale: z.string().trim().min(2).max(40).default("en-US"),
  candidates: z.array(candidateSchema).max(10).default([]),
  selectedIds: z.array(identifier).max(3, "Mỗi đợt chọn tối đa 3 sản phẩm.").default([]),
  notes: text(20000),
}).superRefine((value, ctx) => {
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
  name: z.string().trim().min(2).max(150),
  productId: identifier,
  accountId: z.union([z.literal(""), identifier]).default(""),
  productionId: z.union([z.literal(""), identifier]).default(""),
  assetId: z.union([z.literal(""), identifier]).default(""),
  hook: text(600),
  script: text(6000),
  caption: text(2200),
  plannedDate: z.union([z.literal(""), z.string().date()]).default(""),
  status: z.enum(["draft", "planned", "published_manual", "published_browser"]).default("draft"),
  postUrl: optionalLink,
  notes: text(),
}).superRefine((value, ctx) => {
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
  interactions: count.nullable().default(null),
  reelInteractions: count.nullable().default(null),
  accountsEngaged: count.nullable().default(null),
  profileActivity: count.nullable().default(null),
  follows: count.nullable().default(null),
  source: z.enum(['manual', 'instagram_browser']).default('manual'),
  accountId: z.union([z.literal(''), identifier]).default(''),
  handle: z.string().regex(/^[a-zA-Z0-9._]{0,30}$/).default(''),
  insightsUrl: optionalLink,
  approximate: z.array(z.enum(['views','likes','comments','saves','shares','profileVisits','linkClicks','viewers','interactions','reelInteractions','accountsEngaged','profileActivity','follows'])).default([]),
  sourceUrl: sourceLink,
  notes: text(),
});
export const landingPageSchema = z.object({
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
  landing_page: landingPageSchema,
};
export type ResearchBatch = z.infer<typeof researchBatchSchema>;
export type Candidate = z.infer<typeof candidateSchema>;

export function researchProductId(batchId: string, candidateId: string) {
  // Both IDs are generated once and reused for retries and duplicate clicks.
  return `research_${batchId}_${candidateId}`;
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
