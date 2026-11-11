import { z } from "zod";

export const sampleCheckSchema = z.object({
  receivedAt: z.union([z.string().date(), z.string().datetime({offset: true})]).nullable().default(null),
  colorSizeMatches: z.boolean().nullable().optional(),
  matchesVideo: z.boolean().nullable().default(null),
  packagingIntact: z.boolean().nullable().optional(),
  notes: z.string().trim().max(2000).default(""),
  photos: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(20).optional(),
});

export function sampleCheckWarning(product: Record<string, any>): string | null {
  if (product.sampleCheck?.matchesVideo === true) return null;
  return product.sampleCheck?.matchesVideo === false
    ? "Chưa kiểm mẫu đạt yêu cầu: mẫu thật được ghi nhận không khớp hiệu ứng trong video. Xem lại nội dung và mẫu trước khi mở pre-order thu tiền."
    : "Chưa kiểm mẫu: chưa xác nhận mẫu thật khớp hiệu ứng trong video. Kiểm màu/kích thước, hiệu ứng và đóng gói trước khi mở pre-order thu tiền.";
}
