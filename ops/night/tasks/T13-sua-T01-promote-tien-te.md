# T13 · Sửa T01: promote và form tiền tệ (từ review đêm 11/11)

Phụ thuộc: T01 (commit `709280e`).

## Lỗi review đã chỉ ra
1. **Promote ghi sai đơn vị tiền.** Hàm `promote` trong `components/lab/operations.tsx` chép `cost`/`shipping` sang sản phẩm kèm `currency: candidate.currency`.
   - Ví dụ: `cost 36.5, costCurrency 'CNY', currency 'USD'` thành giá vốn sản phẩm **$36.5**.
   - Khi `currency: 'CNY'`, schema sản phẩm (`lib/lab/domain.ts`, enum không có CNY) từ chối, promote lỗi với thông báo khó hiểu.
2. **Form ứng viên** (`currencyOptions` trong `components/lab/operations.tsx`) thiếu CNY, nên ứng viên CNY hiển thị như đang chọn USD. Form không cho xem hay sửa `costCurrency`/`shippingCurrency`.

## Mục tiêu
1. **Không bao giờ đổi đơn vị tiền một cách âm thầm.** Chọn một trong hai cách (ghi lý do vào báo cáo):
   - **(Ưu tiên)** Sản phẩm mang tiền tệ trung thực:
     - Thêm `CNY` vào enum tiền tệ của sản phẩm.
     - Thêm `costCurrency`/`shippingCurrency` optional vào sản phẩm, giống candidate.
     - Promote chép đúng ba con số kèm tiền tệ của từng số.
     - `productFinancials`/`formatMoney` và mọi chỗ tính biên lợi nhuận **không** tính khi giá vốn, ship và giá bán khác tiền tệ; hiển thị "Khác tiền tệ · chưa tính biên".
   - **(Tối thiểu)** Chặn promote, báo lỗi tiếng Việt rõ ràng khi tiền tệ không khớp hoặc không thuộc enum sản phẩm.
2. Không quy đổi tỷ giá. Bản ghi sản phẩm cũ vẫn parse được.
3. Form ứng viên:
   - Thêm CNY.
   - Thêm 2 select "Tiền tệ giá vốn" và "Tiền tệ ship", có lựa chọn "Theo tiền tệ chung" (= null).
   - Hiển thị đúng giá trị đang lưu.

## Nghiệm thu
- Test: candidate `cost CNY + shipping USD + price USD` → promote giữ đúng tiền tệ từng số (hoặc bị chặn với thông báo đúng), không có `$36.5` giả.
- Test: sản phẩm khác tiền tệ thì biên lợi nhuận là null hoặc "chưa tính", không ra số.
- Test: bản ghi sản phẩm cũ (USD, không có trường mới) parse và tính biên như cũ.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
