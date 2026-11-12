import { productFinancials, type LabRecord } from "./domain.ts";
import { candidateCurrencySchema } from "./operations.ts";
import { productionSchema } from "./production.ts";
import { workflowGuidance } from "./workflow-guidance.ts";
import { sampleCheckWarning } from "./sample-check.ts";

export type ProductNextStep = {
  stage: string;
  title: string;
  detail: string;
  actionView: "products" | "production" | "social";
};

export function latestProductProduction(product: LabRecord, records: readonly LabRecord[]) {
  return records.filter(r => r.kind === "production" && r.data.productId === product.id && !r.data.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))[0];
}

/** Advice from saved evidence only; never authorizes publication or payment. */
export function productNextStep(product: LabRecord, records: readonly LabRecord[]): ProductNextStep {
  const next = (stage: string, title: string, detail: string, actionView: ProductNextStep["actionView"]): ProductNextStep => ({stage, title, detail, actionView});
  const p = productFinancials(product.data);
  const missing = (["cost", "shipping"] as const).filter(key => typeof p[key] !== "number" || !Number.isFinite(p[key]) || p[key] < 0);
  const costCurrency = p.costCurrency ?? p.currency;
  const shippingCurrency = p.shippingCurrency ?? p.currency;
  const currenciesKnown = candidateCurrencySchema.safeParse(costCurrency).success && candidateCurrencySchema.safeParse(shippingCurrency).success;
  if (missing.length || !currenciesKnown || costCurrency !== shippingCurrency) {
    const reasons: string[] = missing.map(key => key === "cost" ? "thiếu giá vốn" : "thiếu phí ship tới Mỹ");
    if (!currenciesKnown) reasons.push("chưa rõ tiền tệ của giá vốn/ship");
    else if (costCurrency !== shippingCurrency) reasons.push(`giá vốn (${costCurrency}) và ship (${shippingCurrency}) khác tiền tệ`);
    return next("supplier", "Hỏi giá nhà cung cấp", `${reasons.join("; ")}. Bổ sung báo giá cùng tiền tệ cho đúng SKU; không tự quy đổi.`, "products");
  }
  const sampleWarning = sampleCheckWarning(p);
  if (sampleWarning) return next("sample", "Kiểm mẫu thật", sampleWarning, "products");

  const production = latestProductProduction(product, records);
  if (!production) return next("production", "Tạo kịch bản theo công thức", "Chưa có dự án sản xuất cho sản phẩm. Tạo dự án, rồi chọn Mẫu prompt để soạn kịch bản nháp theo công thức.", "production");
  const parsed = productionSchema.safeParse(production.data);
  if (!parsed.success) return next("scenes", "Kiểm tra dữ liệu dự án", "Dự án mới nhất thiếu hoặc sai dữ liệu cảnh/phiên bản. Mở dự án để kiểm tra; chưa đủ dữ liệu để hướng dẫn đăng.", "production");
  const guidance = workflowGuidance(parsed.data, product.revision);
  if (guidance.approved < guidance.total || ["references", "queue", "scenes", "library", "desktop"].includes(guidance.stage) || guidance.takeSelection)
    return next(guidance.stage, guidance.title, guidance.detail, "production");

  const related = records.filter(r => r.data.productId === product.id && !r.data.archived);
  if (!related.some(r => r.kind === "social_account" && typeof r.data.handle === "string" && r.data.handle.trim()))
    return next("account", "Gắn tài khoản", "Chưa có tài khoản Instagram đang dùng với username gắn sản phẩm. Bổ sung trong Instagram; hồ sơ đã lưu chưa chứng minh đăng nhập hay quyền đăng.", "social");
  const published = related.filter(r => r.kind === "content_plan" && ["published", "published_manual", "published_browser"].includes(r.data.status));
  if (!published.length) return next("publish", "Đăng bài đã duyệt", "Chưa ghi nhận bài đã đăng cho sản phẩm. Kiểm tra video, caption và quyền đăng trên đúng tài khoản trước khi gửi.", "social");
  const hasMetrics = records.some(r => r.kind === "social_metric" && published.some(plan => plan.id === r.data.planId));
  return next("metrics", "Đọc số liệu / so hook", hasMetrics
    ? "Đã có bài đăng và bản đo đã lưu. So hook trong cùng tài khoản, từ khóa CTA và kỳ đo; chỉ số chưa biết vẫn để trống."
    : "Đã ghi nhận bài đăng nhưng chưa có bản đo. Đọc số liệu có nguồn và kỳ đo trước khi so hook.", "social");
}
