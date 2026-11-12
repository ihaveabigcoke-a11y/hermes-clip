# T27 · Dọn ghi chú review đêm trước (phần 2)

## 1. `takeId` có thể null (ghi chú T06)
- T06 nới `itemSchema` của production thành `takeId` nullable, dùng cho bản nháp A/B chưa chọn take.
- Đã có guard trong `resolveItems` và `variantForm`. Còn các chỗ đọc `bodies[].items[].takeId` khác chưa chắc an toàn: package, export, queue view, guidance, Instagram summary, API…
- **Việc:**
  - Grep **mọi** chỗ đọc `takeId` trong `lib/`, `components/`, `app/`, `desktop/`.
  - Chỗ nào chưa xử lý null thì sửa cho an toàn. Không crash, không coi null là take hợp lệ, không ghép video khi thiếu take.
  - Liệt kê các chỗ đã kiểm trong báo cáo.
- **Test:** đưa một production có bản nháp `formula_draft` (`takeId: null`) qua các hàm thuần chính: package/export, `workflowGuidance`, queue view, tóm tắt Instagram. Không throw, và có trạng thái "chờ chọn take".

## 2. Bảng Nghiên cứu ở 1366 px với sidebar 232 px (ghi chú T04 + T08)
- Sidebar rộng thêm 52 px. Bảng Nghiên cứu nhiều cột của T04 (và cột mới của T23 nếu đã có) có thể tràn ngang ở 1366 px.
- **Việc:**
  - Render UI local như cách T04/T08 đã chụp ảnh. Không mở website thật.
  - Chụp ở 1366×768 và 1920×1080.
  - Nếu cột quyết định hoặc nút chọn bị che, hoặc phải cuộn ngang mới thấy, thì sửa bằng CSS trong phạm vi bảng. Ví dụ:
    - cố định cột tên và cột quyết định;
    - gộp cột phụ dưới 1440 px;
    - giảm padding.
  - Không đổi font/theme, chỉ dùng biến `--lab-*` sẵn có.
- Lưu ảnh trước/sau vào `ops/night/out/T27-*.png`. Báo cáo ghi rõ có tràn hay không.

## Nghiệm thu
- Test cho mục 1. Nếu có đổi CSS ở mục 2 mà thêm hàm thuần thì test hàm đó.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
