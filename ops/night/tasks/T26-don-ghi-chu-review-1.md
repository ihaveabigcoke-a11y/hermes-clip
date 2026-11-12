# T26 · Dọn ghi chú review đêm trước (phần 1)

Các mục dưới đây lấy từ review nhánh này (T14, T13, T03, T09 và commit `9a5a3e6`). Mỗi mục nhỏ, phải có test.

## 1. Phát hiện trang "Access Denied" bị chặn (ghi chú T14)
- `desktop/src/listing-check.mjs` → `accessBlocked`: T14 đã bỏ các mẫu `access denied|access forbidden|访问受限`.
- Hậu quả: trang chặn kiểu Akamai không ghi mã 403/429 sẽ thành `status: 'ok'`, và hiện chip "Nguồn: đã đọc" dù không có giá.
- **Sửa:** đưa các mẫu này trở lại, nhưng chỉ xét trong `<title>` và khoảng 2 KB chữ hiển thị đầu trang.
- **Test:**
  - Fixture Akamai "Access Denied" (không có mã) → `blocked`.
  - Listing thật có cụm "access denied" trong mô tả ở cuối trang → không `blocked`.

## 2. Tài liệu nhãn AI đúng mặc định mới (sau commit `9a5a3e6`)
- Mặc định hiện là **không gắn nhãn**. Chỉ khi chọn rõ "Bắt buộc bật nhãn AI" thì mới fail closed.
- Sửa câu chữ ở `docs/INSTAGRAM-AI-LABEL.md` và `docs/context/T09-INSTAGRAM-AI-LABEL.md` (nếu có) cho khớp. Không đổi code nhãn AI.

## 3. Phí/buffer khi tiền tệ trộn (ghi chú T13)
- `fees`/`buffer` vẫn tính theo tiền tệ chung của sản phẩm.
- Khi `costCurrency` hoặc `shippingCurrency` khác tiền tệ chung mà `fees`/`buffer` khác 0 hoặc null, form sản phẩm cần hiện gợi ý: "Phí và dự phòng tính theo {tiền tệ chung}".
- Chỉ hiển thị gợi ý, không đổi phép tính.
- Test hàm điều kiện hiển thị.

## 4. Nhận diện ghi chú Muse bằng cờ rõ ràng (ghi chú T03 b)
- `lib/lab/product-stage.ts` đang nhận diện ghi chú Muse chưa kiểm bằng tiền tố chuỗi `"Muse đề xuất · cần kiểm tra nguồn"`.
- **Sửa:**
  - Nếu ứng viên/sản phẩm đã có trường nguồn gốc rõ ràng (ví dụ `researchOrigin`), dùng trường đó trước.
  - Nếu chưa có, thêm cờ optional khi promote ứng viên Muse.
  - Giữ tiền tố chuỗi làm fallback cho bản ghi cũ.
- **Test:**
  - Sản phẩm có cờ Muse, ghi chú đã sửa chữ → vẫn bậc 0.
  - Bản ghi cũ chỉ có tiền tố → vẫn bậc 0.
  - Ghi chú người dùng tự nhập → bậc 1.

## Nghiệm thu
- Mỗi mục có test như trên. Không xóa test cũ, không nới assertion.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
