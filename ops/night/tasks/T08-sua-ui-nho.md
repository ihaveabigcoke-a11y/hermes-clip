# T08 · Sửa lỗi UI nhỏ đã thấy trong ảnh chụp

Chỉ sửa đúng các điểm dưới. Không redesign, không đổi font hay theme (xem `DESIGN.md`).

1. **Tạo nội dung** (`components/lab/production-desk.tsx`, `production.tsx`): nút "Lưu cảnh nháp" phải disabled khi prompt rỗng (đang 0/10.000 mà nút vẫn sáng). Thêm hint ngắn lý do.
2. **Hàng đợi** (`components/lab/queue-board.tsx`): tên thẻ đang bị cắt thành "Instagra… Create…". Cho tên hiển thị tối đa 2 dòng, có `title` đầy đủ. Ô chọn trạng thái bị cắt "Mọi trạng th": cho rộng đủ hoặc rút nhãn.
3. **Xem trước**: phiên bản "Chờ duyệt" phải có nút **Duyệt** và **Từ chối** nhìn thấy ngay trong khung, không phải cuộn. Nếu nút đang nằm ở chỗ khác, đưa lên cụm nút chính cạnh "Tải file".
4. **Nhãn "Người mẫu"** ở Chế độ tạo dễ hiểu nhầm thành người làm mẫu. Kiểm trong code xem chế độ này thực chất là gì, rồi đổi nhãn cho đúng nghĩa, ví dụ "Theo mẫu" nếu là template. Ghi lý do vào báo cáo; nếu đúng là người mẫu thì giữ nguyên.
5. **Banner "Dữ liệu của bạn · lưu trên máy này · Khám phá bản mẫu"** hiện trên mọi màn và là nút nổi nhất. Chỉ hiện khi workspace chưa có sản phẩm, hoặc cho đóng và nhớ lựa chọn bằng cơ chế preference hiện có. Nút "Khám phá bản mẫu" dùng kiểu phụ, không dùng màu lime chính.
6. **Màn Sản phẩm**: bỏ dòng eyebrow "HERMES CLIP / KHÔNG GIAN RIÊNG TƯ" (trùng breadcrumb). Gộp hai banner thông tin thành một dòng. Trên thẻ sản phẩm thêm 1 dòng: giá vốn + ship (nếu có), số tài khoản, bước tiến độ (dùng hàm T03 nếu đã có). Ảnh thẻ thấp hơn để thấy thông tin mà không cuộn.
7. **Sidebar**: nhãn "Tài khoản Muse", "Kinh doanh", "Thử nghiệm nội dung", "Trang giới thiệu" đang xuống dòng hoặc bị cắt ở 1080p. Không đổi font; tăng nhẹ chiều rộng sidebar hoặc dùng nhãn ngắn hơn đã thống nhất trong `desktop/src/ui-copy.mjs`.

## Nghiệm thu
- Test cho logic disabled (mục 1) và điều kiện hiện banner (mục 5) nếu tách được thành hàm thuần.
- `npm test`, `npm run typecheck`, `npm run local:build` qua.
- Ghi rõ trong báo cáo: điểm nào đã nhìn bằng ảnh chụp, điểm nào chưa kiểm giao diện thật.
