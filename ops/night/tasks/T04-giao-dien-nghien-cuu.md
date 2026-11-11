# T04 · Giao diện Nghiên cứu: so được 10 ứng viên, gộp chọn và tạo hồ sơ

Phụ thuộc: T01, T02.

## Vấn đề (từ ảnh chụp của người dùng và code `components/lab/research-candidates.tsx`, `research-launcher.tsx`, phần Nghiên cứu trong `operations.tsx`/`app.tsx`)
- Mỗi hàng cao khoảng 320px, màn 1080p chỉ thấy 2,5 ứng viên.
- Cột quyết định (giá vốn + ship, đúng SKU, thử/giữ/loại, rủi ro) không có hoặc bị giấu trong modal. "Chưa tính lợi nhuận" lặp ở mọi hàng. "Xem phân tích" và nút "Xem" trùng chức năng.
- Dòng độ đầy đủ "10/10 có chỉ số kèm nguồn" tô xanh, trong khi 0/10 có giá vốn.
- Có hai nút chính cùng màu: "Tạo đợt nghiên cứu" và "Bắt đầu nghiên cứu".
- Tick "Chọn" không tạo hồ sơ sản phẩm. Phải mở modal của từng ứng viên rồi bấm "Tạo hồ sơ sản phẩm".
- Tiêu chí nghiên cứu là input một dòng, dài 1500 ký tự.

## Mục tiêu
1. Bảng gọn: mỗi hàng cao ≤ ~120px ở 1080p. Ảnh nhỏ (khoảng 64px), tên tối đa 2 dòng. Các cột:
   - Sản phẩm/nguồn
   - Đúng SKU hay tương tự
   - Giá vốn + ship (dùng `landedCost` của T01, có badge "≤ 20 USD" / "> 20 USD" / "Chưa đủ số")
   - Giá bán giả định
   - Visual payoff (1 dòng)
   - Cờ rủi ro (icon hoặc chip ngắn: pin, chất lỏng, cồng kềnh, theo đời xe, thương hiệu)
   - Thử/giữ/loại
   - Cảnh báo chất lượng từ T02
2. Dòng độ đầy đủ hiển thị: có giá vốn x/10, có ship x/10, đúng SKU x/10, có listing riêng x/10, có chỉ số không phải cấp trang x/10. Không tô xanh khi các chỉ số cốt lõi còn thiếu.
3. Gộp chọn và tạo hồ sơ: tick chọn thì tạo hồ sơ sản phẩm idempotent qua đúng API `promote` hiện có (`app/api/lab/route.ts` đã chống trùng). Bỏ tick **không** xóa hồ sơ, chỉ bỏ chọn và ghi rõ "Hồ sơ vẫn giữ".
4. Một nút chính: giữ "Bắt đầu nghiên cứu" (Muse chạy nền) là nút chính. Nút tạo đợt thủ công thành nút phụ, có nhãn rõ khác biệt.
5. Tiêu chí: đổi thành textarea. Thêm vài trường có cấu trúc, ghép vào query gửi runner: giá vốn + ship tối đa (mặc định 20 USD), ngách hoặc đối tượng, loại trừ (mặc định: pin lithium lớn, chất lỏng, hàng có thương hiệu, theo đời xe).
6. Bỏ chữ "Chưa tính lợi nhuận" lặp lại. Gộp "Xem phân tích" với "Xem".

## Giữ nguyên
- Giới hạn chọn 3, luồng receipt, modal chi tiết (có thể thu gọn), theme và font.

## Nghiệm thu
- Test logic thuần: tính độ đầy đủ, badge ngưỡng, idempotent khi tick hai lần.
- `npm run local:build` qua. Nếu dựng được UI tĩnh từ build và chụp ảnh bằng công cụ có sẵn **không cần mạng**, lưu ảnh vào `ops/night/out/`; nếu không thì ghi "chưa kiểm giao diện thật".
