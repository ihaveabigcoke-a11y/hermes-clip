# T15 · Mỗi sản phẩm có "bước tiếp theo" và bước kiểm mẫu trước pre-order

## Bối cảnh
- Người dùng muốn nhìn mỗi sản phẩm là biết nó đang kẹt ở đâu, thay vì phải mở từng màn. Đây cũng là lý do từng nghĩ tới Agent Office.
- Đã có sẵn:
  - `lib/lab/product-stage.ts` → `productStage()` (T03);
  - `lib/lab/workflow-guidance.ts` → `workflowGuidance()` cho từng dự án video;
  - màn Sản phẩm trong `components/lab/app.tsx`.
- Video AI có thể khác sản phẩm thật. Hiện chưa có bước nào xác nhận mẫu thật trước khi mở pre-order.

## Mục tiêu
1. Hàm thuần `productNextStep(product, records)` trả về `{stage, title, detail, actionView}` theo thứ tự ưu tiên:
   1. Chưa có giá vốn + ship cùng tiền tệ → "Hỏi giá nhà cung cấp".
   2. Chưa kiểm mẫu → "Kiểm mẫu thật".
   3. Chưa có production → "Tạo kịch bản theo công thức".
   4. Có cảnh chưa duyệt hoặc cần đối soát → dùng `workflowGuidance` của production mới nhất.
   5. Chưa có tài khoản Instagram gắn sản phẩm → "Gắn tài khoản".
   6. Chưa đăng → "Đăng bài đã duyệt".
   7. Đã đăng → "Đọc số liệu / so hook".
   
   Không bịa trạng thái: thiếu dữ liệu thì nói thiếu gì.
2. Thẻ sản phẩm trong màn Sản phẩm hiển thị 1 dòng bước tiếp theo và một nút đi tới đúng view. Không redesign; dùng class sẵn có.
3. **Kiểm mẫu:** thêm vào hồ sơ sản phẩm checklist optional `sampleCheck`:
   - `{ receivedAt, matchesVideo: boolean|null, notes, photos?: assetIds[] }`
   - các mục "đúng màu/kích thước", "hiệu ứng như video", "đóng gói".
   
   Landing hoặc pre-order (nếu có trạng thái thu tiền) hiển thị cảnh báo "Chưa kiểm mẫu" khi `matchesVideo !== true`. Không chặn cứng, chỉ cảnh báo rõ.
4. Bản ghi sản phẩm cũ vẫn parse được.

## Nghiệm thu
- Test thuần cho đủ 7 nhánh của `productNextStep`, bằng fixture dựng theo `data/2026-11-11/workspace-records.json` (chỉ đọc).
- Test parse sản phẩm cũ không có `sampleCheck`.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
