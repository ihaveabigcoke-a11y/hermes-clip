import { z } from "zod";

export const sampleCheckSchema = z.object({
  receivedAt: z.union([z.string().date(), z.string().datetime({offset: true})]).nullable().default(null),
  colorSizeMatches: z.boolean().nullable().optional(),
  matchesVideo: z.boolean().nullable().default(null),
  packagingIntact: z.boolean().nullable().optional(),
  notes: z.string().trim().max(2000).default(""),
  photos: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(20).optional(),
});

export function sampleCheckState(product: Record<string, any>): "verified" | "failed" | "legacy" | "unchecked" {
  if (product.sampleCheck?.matchesVideo === true) return "verified";
  if (product.sampleCheck?.matchesVideo === false) return "failed";
  if (product.sampleCheck == null && product.sampleVerified === true) return "legacy";
  return "unchecked";
}

export function sampleCheckWarning(product: Record<string, any>): string | null {
  const state = sampleCheckState(product);
  if (state === "verified") return null;
  return state === "failed"
    ? "Chưa kiểm mẫu đạt yêu cầu: mẫu thật được ghi nhận không khớp hiệu ứng trong video. Xem lại nội dung và mẫu trước khi mở pre-order thu tiền."
    : "Chưa kiểm mẫu: chưa xác nhận mẫu thật khớp hiệu ứng trong video. Kiểm màu/kích thước, hiệu ứng và đóng gói trước khi mở pre-order thu tiền.";
}
