# T06 · Mẫu kịch bản theo công thức: Vấn đề → Vs → Kết quả → CTA từ khóa

Phụ thuộc: T05.

## Bối cảnh
- `lib/lab/intelligence.ts` → `structuredStoryboard` đang sinh cảnh hook/body/cta chung chung.
- `lib/lab/visual-hooks.ts` có ba kiểu hook A/B/C.
- `lib/lab/production.ts` có scene `role: hook|body|cta`; production có `bodies` và `variants`, đã hỗ trợ A/B hook trên cùng một thân video.
- Video tham khảo dùng chữ một dòng trên màn hình và CTA "Comment WORD". Hermes chưa có chỗ lưu hai thứ này.

## Mục tiêu
1. Trường optional mới, tương thích ngược:
   - Scene: `overlayText` (tiếng Anh, 1 dòng, tối đa khoảng 60 ký tự).
   - Production hoặc variant: `ctaKeyword` (một từ in hoa, ví dụ `LED`) và `ctaText` (ví dụ `Comment "LED" for the link`).
2. Trong khu "Mẫu kịch bản" hoặc "Mẫu prompt" của Tạo nội dung (`components/lab/production-desk.tsx`, `production.tsx`, `production-intelligence.tsx`): thêm lựa chọn tạo kịch bản từ một công thức trong thư viện T05.
   - Sinh các cảnh theo beat của công thức: vai trò, thời lượng, `overlayText` gợi ý theo `labelVariants`, prompt tiếng Anh dùng `invariants` và `allowedClaims` của sản phẩm (giữ các câu chặn bịa claim như `structuredStoryboard`).
   - Mặc định 9:16, tổng 10–18 giây.
   - Kết quả là **cảnh nháp**, chưa duyệt, không gửi Muse.
3. Tạo nhanh 2 biến thể hook trên cùng thân video và cùng `ctaKeyword` (dùng `bodies`/`variants` có sẵn). Mỗi biến thể chỉ đổi cảnh hook.
4. Bổ sung `promptWarnings` (`lib/lab/intelligence.ts`):
   - Hook thiếu `overlayText`.
   - Prompt hoặc overlay có lời chứng thực ngôi thứ nhất (my dad, my mom, I bought, changed my life…) → cảnh báo "Có dạng lời chứng thực; FTC cấm testimonial giả, kể cả do AI tạo. Dùng dạng POV."
   - Prompt mô tả hiệu ứng không có trong `invariants`/`allowedClaims` (ví dụ laser, neon trail, glow) khi sản phẩm không khai báo → cảnh báo "Hiệu ứng có thể vượt sản phẩm thật".

## Giữ nguyên
- Không chạy cảnh nháp. Duyệt kịch bản vẫn bắt buộc trước khi gửi Muse.
- Revision và snapshot duyệt hiện có.

## Nghiệm thu
- Test thuần: sinh cảnh từ công thức seed đúng số beat, đúng vai trò, tổng thời lượng trong 10–18s; hai biến thể chỉ khác cảnh hook; ba cảnh báo mới bắt đúng ví dụ dương và không bắt nhầm ví dụ âm.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run local:build` qua.
