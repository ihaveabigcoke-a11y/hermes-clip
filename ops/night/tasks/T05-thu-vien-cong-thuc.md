# T05 · Thư viện công thức viral (nền móng cho việc cập nhật công thức liên tục)

## Bối cảnh
Người dùng muốn video theo công thức của 12 video tham khảo, và muốn công thức được cập nhật liên tục rồi áp vào kịch bản và research. File `ops/night/input/formula-seed.json` chứa phân tích 12 video theo một taxonomy cố định (vai trò cảnh, nhãn chữ, kiểu hook, kiểu CTA, đặc điểm sản phẩm, guardrails). Giữ taxonomy cố định để các lần phân tích sau so sánh được với nhau.

## Mục tiêu
1. Module dữ liệu có schema zod, ví dụ `lib/lab/viral-formulas.ts`:
   - Schema `ViralFormula` (id, name, beats[{role, label, fromSec, toSec, goal}], overlay, labelVariants, ctaPatterns, hookType, fitProductTraits, guardrails, references[], version, updatedAt).
   - Schema `ReferenceVideo` (id, product, hookText, ctaText, durationSec, cuts, formulaId, notes).
   - Nạp seed từ một bản sao trong source, ví dụ `lib/lab/viral-formulas.seed.json`, copy từ `ops/night/input/formula-seed.json`. Không đọc file ngoài source lúc chạy app.
   - Hàm thuần: `formulasForProduct(traits)` gợi ý công thức hợp sản phẩm; `validateFormula`.
2. Cho phép lưu công thức do người dùng thêm hoặc sửa như một record mới trong workspace (kind mới, ví dụ `viral_formula`), nếu làm được an toàn với cách lưu hiện tại (`lib/lab/domain.ts`, `app/api/lab/route.ts`). Seed là mặc định chỉ đọc; bản người dùng ghi đè theo `id` + `version`. Nếu thêm kind mới quá rủi ro trong một đêm, chỉ làm phần seed chỉ đọc và ghi blocker.
3. Màn hình xem chỉ đọc: một tab hoặc khối nhỏ trong Nghiên cứu hoặc Tạo nội dung, tên "Công thức video". Liệt kê công thức, các beat với mốc giây, ví dụ tham chiếu, guardrails. Không redesign.
4. Ghi trong code và tài liệu `docs/VIRAL-FORMULAS.md` cách cập nhật sau này (không làm đêm nay):
   - Người dùng thả video tham khảo (MP4).
   - App trích frame và đếm cắt cảnh bằng FFmpeg (đã có), OCR chữ trên màn hình, rồi nhờ Muse phân loại theo đúng taxonomy này.
   - Tạo phiên bản công thức mới để người dùng duyệt.
   - Tham khảo cách làm của `bradautomates/head-of-content` (tìm outlier + Gemini) và `loveld322/viral-video-blueprint` (PySceneDetect, faster-whisper, PaddleOCR, template.json). Chỉ mô tả, không thêm dependency.

## Nghiệm thu
- Test: seed parse được; mọi beat có `fromSec < toSec` (CTA có thể đo từ cuối video, ghi rõ quy ước); `formulasForProduct` trả công thức "problem-vs-result-cta" cho traits phát sáng ban đêm.
- `npm test`, `npm run typecheck`, `npm run local:build` qua.
