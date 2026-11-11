# Hermes Clip — Số liệu Instagram tự động

Cập nhật 16:10 ngày 11/11/2026. Thực hiện bằng một main agent, đã tích hợp vào bản app đang dùng.

- Đã bỏ nút Nhập số liệu khỏi nội dung Instagram. App tự đọc Insights sau khi đăng và mỗi 30 phút khi đang mở, dùng đúng hồ sơ gắn với sản phẩm. Nút Cập nhật ngay là tùy chọn.
- Hiển thị số liệu cộng dồn cùng thời điểm đo, trạng thái và lịch tiếp theo. Lỗi đọc giữ bản đo cũ; không cộng trùng các lần đo. Chưa có dữ liệu khác với số 0.
- Giữ nguồn đo, liên kết bài/Insights, tài khoản và dữ liệu hiện có. Không đổi font/theme hoặc luồng tạo video.

## Đã kiểm chứng thật

Hermes tự đọc [Reel Treat Trader](https://www.instagram.com/reel/DfmDwT_Btcx/) của @nao.mirita lúc 16:03:16. Lượt này do scheduler khi mở app, không bấm cập nhật. Hồ sơ được mở tạm với Touch VPN và tự đóng sau khi đọc.

| Chỉ số | Instagram cung cấp tại lần đo |
|---|---|
| Lượt thích, bình luận, lưu, chia sẻ, theo dõi mới | 0 |
| Tương tác với Reel, hoạt động trên hồ sơ | 0 |
| Lượt xem, người xem, tổng tương tác, tài khoản tương tác | Chưa có dữ liệu |
| Truy cập hồ sơ, bấm liên kết | Không có chỉ số trên trang đang đo |

Khởi động lại bản cài giữ đúng số liệu, nguồn, thời điểm và lịch 16:33. Không phát sinh bài đăng hoặc lượt đo thừa. 37 bản ghi, 25 Muse jobs, ba profile Muse, batch và video gốc giữ nguyên. Một job Instagram vẫn published.

19 file source thay đổi và 42 file build khớp hash với bản đã kiểm. 228 test đạt, không bỏ qua test; TypeScript đạt. Ảnh native xác nhận đầy đủ cạnh phải:

![Số liệu thật sau khi mở lại Hermes](C:/Users/ADMIN/Documents/ChatGPT/ECOM%20BẰNG%20VIDEO%20AI/outputs/Hermes-Clip-Instagram-Metrics-2026-11-11/06-metrics-after-restart.png)

## Kiểm thử có giả lập và giới hạn

DOM/GUI fixture kiểm parser, tài khoản sai, phiên thay đổi, lỗi mạng giữ dữ liệu cũ, cập nhật lại, restart và cửa sổ hẹp đến 390px. Test scheduler dùng đồng hồ giả để kiểm chu kỳ 30 phút, tranh chấp với lượt đăng và dừng sau ba lỗi. Lần tự đọc đầu và restart đã kiểm trên app/tài khoản thật; chưa chờ đủ chu kỳ 30 phút để nghiệm thu lần đo định kỳ tiếp theo trên mạng thật.

App phải đang mở và máy phải thức để đo. Nếu hết phiên hoặc Instagram yêu cầu xác minh, người dùng đăng nhập lại. Những chỉ số Instagram không cung cấp vẫn hiện Chưa có dữ liệu. Hai sản phẩm chưa có bài/profile Instagram chưa thể đo thật. Lượt này không triển khai hoặc suy ra số liệu doanh thu/checkout.

## Chạy tiếp

App đang mở tại Instagram · Treat Trader. Mở lại bằng [START-HERMES-CLIP.cmd](C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local/START-HERMES-CLIP.cmd), vào Kinh doanh → Instagram → Treat Trader → nội dung đã đăng → Số liệu Instagram. Không cần nhập tay. Có thể dùng Cập nhật ngay nếu muốn đo trước lịch.

Bằng chứng và checkpoint: `.product-lab-repair/instagram-metrics-20261111/`: `live-verification.json`, `final-verification.json`, `gui-verification.json`, `insights-dom-verification.json`, `suite-verification.json`, `installed.json`, `CHECKPOINT.md`. Phiên app hiện tại nằm trong `session.json`.
