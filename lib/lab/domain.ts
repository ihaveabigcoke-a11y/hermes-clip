import { z } from "zod";
import { productionSchema } from "./production.ts";
import { codexRunSchema } from "./codex-exchange.ts";
import { operationSchemas, candidateCurrencySchema, type Candidate, type ResearchBatch } from "./operations.ts";
import { viralFormulaSchema } from "./viral-formulas.ts";
import { referenceVideoDraftSchema } from "./viral-reference.ts";
import { sampleCheckSchema } from "./sample-check.ts";
import { countKeywordComments } from './keyword-comments.ts';
export { countKeywordComments } from './keyword-comments.ts';
export const kinds = [
  "product",
  "experiment",
  "creative",
  "metric",
  "cost",
  "settings",
  "job",
  "asset",
  "signal",
  "production",
  "assistant_run",
  "codex_run",
  "research_batch",
  "social_account",
  "content_plan",
  "social_metric",
  "keyword_comment_measurement",
  "landing_page",
  "viral_formula",
  "reference_video_draft",
] as const;
export type Kind = (typeof kinds)[number];
export type LabRecord = {
  id: string;
  kind: Kind;
  data: Record<string, any>;
  revision: number;
  updatedAt: number;
};
export function validationMessage(issue: {code:string;message:string;minimum?:any;maximum?:any;type?:string}) {
  if (!/^(String must|Number must|Array must|Invalid|Expected|Required|Too)/.test(issue.message)) return issue.message;
  if (issue.code === "too_small") return issue.type === "array" ? `Chọn ít nhất ${issue.minimum} mục.` : issue.type === "number" ? `Giá trị tối thiểu ${issue.minimum}.` : `Nhập ít nhất ${issue.minimum} ký tự.`;
  if (issue.code === "too_big") return `Giá trị vượt giới hạn ${issue.maximum}.`;
  return "Điền hoặc chọn một giá trị hợp lệ.";
}
const str = (max = 1000) => z.string().trim().max(max).default("");
const money = z.number().finite().min(0).max(1e9);
const link = z
  .string()
  .max(2048)
  .refine(
    (v) =>
      !v || /^https:\/\//i.test(v) || /^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(v),
    "Dùng link HTTPS hợp lệ.",
  )
  .default("");
export const schemas = {
  ...operationSchemas,
  viral_formula: viralFormulaSchema,
  reference_video_draft: referenceVideoDraftSchema,
  codex_run: codexRunSchema,
  production: productionSchema,
  assistant_run: z.object({configId:z.string().optional(),day:z.string(),state:z.enum(["pending","done"]),fingerprint:z.string().max(5000),rows:z.array(z.record(z.unknown())).nullable()}),
  product: z
    .object({
      name: z.string().trim().min(2, "Tên cần ít nhất 2 ký tự.").max(120),
      niche: str(80),
      sku: str(100),
      market: str(100),
      locale: str(40),
      allowedClaims: str(3000),
      invariants: str(3000),
      customer: str(600),
      problem: str(1000),
      supplierUrl: link,
      referenceUrl: link,
      imageUrl: link,
      proofUrl: link,
      proofNotes: str(2000),
      sampleVerified: z.boolean().default(false),
      sampleCheck: sampleCheckSchema.nullable().optional(),
      price: money.nullable(),
      cost: money.nullable(),
      shipping: money.nullable(),
      fees: money.nullable(),
      buffer: money.nullable(),
      currency: candidateCurrencySchema.default("USD"),
      costCurrency: candidateCurrencySchema.nullable().optional(),
      shippingCurrency: candidateCurrencySchema.nullable().optional(),
      archived: z.boolean().default(false),
      researchOrigin: z.object({batchId: z.string().max(50), candidateId: z.string().max(50)}).optional(),
    })
    .superRefine((v, c) => {
      if (v.sampleVerified && !v.proofNotes && !v.proofUrl)
        c.addIssue({
          code: "custom",
          path: ["proofNotes"],
          message: "Ghi bằng chứng hoặc thêm link demo đã kiểm tra.",
        });
    }),
  experiment: z.object({
    name: z.string().trim().min(2, "Đặt tên cho bài test.").max(140),
    productId: z.string().min(1, "Chọn sản phẩm."),
    market: z.string().trim().min(2, "Điền thị trường mục tiêu.").max(80),
    hypothesis: z
      .string()
      .trim()
      .min(10, "Viết giả thuyết cụ thể hơn, ít nhất 10 ký tự.")
      .max(2000),
    offerUrl: link,
    status: z
      .enum(["draft", "running", "paused", "review", "closed"])
      .default("draft"),
    targetSessions: z.number().int().min(1).max(1e7).default(100),
    decision: z
      .enum(["pending", "iterate", "pilot", "stop"])
      .default("pending"),
    decisionNotes: str(2000),
    archived: z.boolean().default(false),
  }),
  creative: z.object({
    name: z.string().trim().min(2).max(150),
    productId: z.string().min(1),
    experimentId: z.string().min(1),
    angle: str(100),
    hook: str(600),
    script: str(6000),
    prompt: str(10000),
    caption: str(2000),
    mediaUrl: link,
    status: z.enum(["draft", "ready", "approved"]).default("draft"),
    source: z.enum(["template", "manual", "provider"]).default("manual"),
    approvedAt: z.number().nullable().default(null),
    archived: z.boolean().default(false),
  }),
  metric: z
    .object({
      experimentId: z.string().min(1),
      views: z.number().int().min(0).max(1e12),
      sessions: z.number().int().min(0).max(1e10),
      leads: z.number().int().min(0).max(1e10),
      orders: z.number().int().min(0).max(1e10),
      delivered: z.number().int().min(0).max(1e10),
      returned: z.number().int().min(0).max(1e10),
      netRevenue: money,
      totalCosts: money,
      sourceUrl: link,
      notes: str(2000),
    })
    .superRefine((v, c) => {
      for (const [a, b] of [
        ["leads", "sessions"],
        ["orders", "sessions"],
        ["delivered", "orders"],
        ["returned", "delivered"],
      ] as const)
        if (v[a] > v[b])
          c.addIssue({
            code: "custom",
            path: [a],
            message: `Giá trị không được lớn hơn ${b === "sessions" ? "số phiên trang" : b === "orders" ? "số đơn thanh toán" : "số đơn đã giao"}.`,
          });
    }),
  cost: z.object({
    name: z.string().trim().min(2, "Ghi nội dung khoản chi.").max(140),
    category: z.enum(["sample", "video", "ads", "tool", "other"]),
    amount: money,
    notes: str(1000),
    productId: str(100),
  }),
  settings: z.object({
    budgetUsd: money,
    paused: z.boolean().default(false),
    providerName: str(100),
    providerDocs: link,
    notes: str(2000),
  }),
  job: z.object({
    creativeId: z.string(),
    creativeRevision: z.number().int().min(1),
    status: z.enum(["awaiting_provider", "cancelled"]),
    payload: z.string().max(30000),
  }),
  asset: z.object({
    key: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
  }),
  signal: z.object({
    experimentId: z.string(),
    text: z.string().trim().min(1).max(3000),
    labels: z.array(z.string().max(40)).max(8),
    source: str(100),
  }),
};
export const emptyProduct = {
  name: "",
  niche: "",
  sku: "",
  market: "United States",
  locale: "en-US",
  allowedClaims: "",
  invariants: "",
  customer: "",
  problem: "",
  supplierUrl: "",
  referenceUrl: "",
  imageUrl: "",
  proofUrl: "",
  proofNotes: "",
  sampleVerified: false,
  price: null,
  cost: null,
  shipping: null,
  fees: null,
  buffer: null,
  currency: "USD",
  costCurrency: null,
  shippingCurrency: null,
  archived: false,
};
export function productFromCandidate(batchId: string, batch: Pick<ResearchBatch, "market" | "locale">, candidate: Candidate) {
  return {
    ...emptyProduct, name: candidate.name, market: batch.market, locale: batch.locale,
    supplierUrl: candidate.supplierUrl, referenceUrl: candidate.evidenceUrl,
    price: candidate.price, cost: candidate.cost, shipping: candidate.shipping, currency: candidate.currency,
    costCurrency: candidate.costCurrency ?? null, shippingCurrency: candidate.shippingCurrency ?? null,
    problem: candidate.contentAngle,
    proofNotes: [candidate.evidenceNotes, candidate.risks].filter(Boolean).join("\n"),
    researchOrigin: {batchId, candidateId: candidate.id},
  };
}
export const emptySettings = {
  budgetUsd: 0,
  paused: false,
  providerName: "",
  providerDocs: "",
  notes: "",
};
export function productFinancials(p: Record<string, any>) {
  const values = {...p};
  for (const key of ['price', 'cost', 'shipping']) {
    if (p.researchOrigin && p[key] === 0 && String(p.proofNotes).includes(key + ' chưa biết, hồ sơ tạm ghi 0')) values[key] = null;
  }
  return values;
}
export function unitMargin(product: Record<string, any>) {
  const p = productFinancials(product);
  if (productHasMixedCurrencies(p)) return null;
  if (['price', 'cost', 'shipping', 'fees', 'buffer'].some(key => typeof p[key] !== 'number' || !Number.isFinite(p[key]))) return null;
  return (
    Math.round((p.price - p.cost - p.shipping - p.fees - p.buffer) * 100) / 100
  );
}
// Fees and buffer use the shared selling-price currency. Missing/null overrides
// inherit it, matching legacy records; amounts are never converted.
export function productCurrency(product: Record<string, any>, field: "price" | "cost" | "shipping") {
  return (field === "price" ? undefined : product[field + "Currency"]) ?? product.currency ?? "USD";
}
export function productHasMixedCurrencies(product: Record<string, any>) {
  return (["cost", "shipping"] as const).some(field => productCurrency(product, field) !== productCurrency(product, "price"));
}
export function productFeeCurrencyHint(product: Record<string, any>): string | null {
  if (!productHasMixedCurrencies(product) || (product.fees === 0 && product.buffer === 0)) return null;
  return `Phí và dự phòng tính theo ${productCurrency(product, "price")}`;
}
export function productMarginLabel(product: Record<string, any>) {
  if (productHasMixedCurrencies(product)) return "Khác tiền tệ · chưa tính biên";
  const margin = unitMargin(product);
  return margin === null ? "Chưa đủ dữ liệu" : formatMoney(margin, productCurrency(product, "price"));
}
export function productGate(p: Record<string, any>) {
  if (p.archived) return "Sản phẩm đang lưu trữ.";
  if (!p.sampleVerified)
    return "Cần kiểm mẫu sản phẩm và ghi bằng chứng trước khi chạy bài test.";
  if (productHasMixedCurrencies(p)) return "Khác tiền tệ · chưa tính biên. Cần giá và chi phí cùng tiền tệ trước khi chạy bài test thương mại.";
  const margin = unitMargin(p);
  if (margin === null) return "Điền đủ giá và chi phí trước khi chạy bài test thương mại.";
  if (margin <= 0)
    return "Biên lợi nhuận dự kiến cần lớn hơn 0 trước khi chạy bài test.";
  return "";
}
export function metricAdvice(m: Record<string, any> | undefined, target = 100) {
  if (!m)
    return {
      label: "Chưa có dữ liệu",
      tone: "neutral",
      text: "Ghi số liệu có nguồn trước khi quyết định.",
    };
  if (m.sessions < target)
    return {
      label: "Chưa đủ dữ liệu",
      tone: "warning",
      text: `Có ${m.sessions}/${target} phiên trang theo mốc đã đặt. Kiểm phân phối trước khi đánh giá sản phẩm.`,
    };
  if (m.returned > 0)
    return {
      label: "Rà soát hoàn trả",
      tone: "warning",
      text: "Kiểm tra nguyên nhân hoàn và kỳ vọng khách trước khi tăng đơn.",
    };
  if (m.orders > 0 && m.netRevenue <= m.totalCosts)
    return {
      label: "Kiểm tra kinh tế",
      tone: "warning",
      text: "Doanh thu thuần chưa vượt tổng chi phí đã nhập. Rà lại chi phí và giá.",
    };
  if (m.orders > 0)
    return {
      label: "Đối soát nhóm đo lường",
      tone: "success",
      text: "Có đơn. Cần kiểm giao hàng, hoàn trả và khả năng lặp lại trước khi mở rộng.",
    };
  if (m.leads > 0)
    return {
      label: "Có quan tâm sau giá",
      tone: "info",
      text: "Tín hiệu để cân nhắc pilot. Lead chưa phải khách đã trả tiền.",
    };
  return {
    label: "Xem lại đề xuất bán hàng",
    tone: "warning",
    text: "Đã chạm mốc quan sát nhưng chưa có lead. Rà tệp, giá, ship và độ tin cậy.",
  };
}
export function classifyComment(s: string, ctaKeyword?: string | null) {
  const t = s.toLowerCase();
  const labels: string[] = [];
  if (/price|how much|bao nhiêu|giá/.test(t)) labels.push("Hỏi giá");
  if (/ship|deliver|giao|vận chuyển/.test(t)) labels.push("Hỏi giao hàng");
  if (/\bwork\b|\bworks\b|\bfit\b|\bcompatible\b|dùng được|phù hợp/.test(t))
    labels.push("Độ phù hợp");
  if (/\blink\b|\bwhere (?:can i )?(?:buy|order)\b|đường dẫn|mua ở đâu/.test(t)) labels.push("Hỏi link");
  if (/\bai\b|fake|scam|lừa|giả/.test(t)) labels.push("Nghi ngờ / niềm tin");
  if ((ctaKeyword ? countKeywordComments([s], ctaKeyword).matched > 0 : ['LED', 'RUN', 'HELP'].some(keyword => countKeywordComments([s], keyword).matched > 0))
      || /^(glass|link|need|wow|omg)[\s!.❤❤️🔥]*$/i.test(t.trim()))
    labels.push("Từ khóa / tò mò");
  return labels.length ? labels : ["Chưa rõ"];
}
export function makeBriefs(
  product: LabRecord,
  experiment: LabRecord,
): Omit<LabRecord, "revision" | "updatedAt">[] {
  const p = product.data;
  const angles = [
    {
      name: "Vấn đề đời thường",
      hook: "Có một việc nhỏ khiến ngày nào cũng mất thời gian.",
      scene:
        "Một tình huống đời thường thể hiện vấn đề; không giả khách hàng đang chứng thực.",
    },
    {
      name: "Cách sử dụng",
      hook: "Đây là cách dùng, từ đầu đến cuối.",
      scene:
        "Cận cảnh thao tác thật của sản phẩm, giữ đúng kích thước và cơ chế đã kiểm.",
    },
    {
      name: "Một câu hỏi thật",
      hook: "Trước khi mua, có một điều cần biết.",
      scene:
        "Người dẫn giải thích một câu hỏi phổ biến, chỉ dùng thông tin có bằng chứng.",
    },
  ];
  return angles.flatMap((a, i) =>
    [0, 1].map((j) => ({
      id: `brief_${experiment.id}_${i}_${j}`,
      kind: "creative" as const,
      data: {
        name: `${a.name} · Hook ${j + 1}`,
        productId: product.id,
        experimentId: experiment.id,
        angle: a.name,
        hook: j ? a.hook + " Xem thao tác này." : a.hook,
        script: `0–3s: ${j ? "Mở bằng cận cảnh thao tác." : a.hook}\n3–8s: Nêu vấn đề: ${p.problem || "[điền vấn đề đã xác minh]"}\n8–15s: Demo ${p.name} bằng footage thật hoặc minh họa ghi rõ. Chỉ dùng kết quả trong bằng chứng.\n15–20s: Giá ${p.price} ${p.currency}; xem điều kiện ship và thông tin ở trang sản phẩm.`,
        prompt: `Video dọc 9:16, 20 giây. ${a.scene}\nSản phẩm: ${p.name}. Khách: ${p.customer || "[điền khách mục tiêu]"}.\nBằng chứng đã ghi: ${p.proofNotes || "Chưa có: không tự bịa công dụng."}\nÁnh sáng tự nhiên, chuyển động máy nhẹ, sản phẩm nhất quán. Không tạo lời chứng thực hay before/after không có bằng chứng. Gắn nhãn AI theo nền tảng khi áp dụng.`,
        caption: `${p.name} — xem giá và điều kiện giao hàng tại link.`,
        mediaUrl: "",
        status: "draft",
        source: "template",
        approvedAt: null,
        archived: false,
      },
    })),
  );
}
export function formatMoney(v: number | null | undefined, currency = "USD") {
  if (v == null || !Number.isFinite(v)) return "Chưa biết";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(v);
}
export function formatTime(v: number) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(v));
}
