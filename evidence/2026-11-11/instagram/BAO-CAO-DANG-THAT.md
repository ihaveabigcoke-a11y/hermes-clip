# Hermes Clip — lượt đăng Instagram thật

Cập nhật 11/11/2026, 15:46 giờ Việt Nam. Một main agent, không có sub-agent.

## Kết quả thực tế

Treat Trader đã đăng lên **@nao.mirita**: https://www.instagram.com/reel/DfmDwT_Btcx/.

- Video dọc 720×1280, bản Instagram dài 10.026666 giây. Caption đúng bản duyệt: “A close look at the brown Treat Trader pouch. AI-generated concept. #DogTreatPouch #PetAccessories #TreatTrader”.
- Instagram ghi thời điểm 15:32:07 giờ Việt Nam. Đối chiếu tác giả, caption, thời gian và metadata video từ trang bài thật, không chỉ dựa vào thông báo thành công hoặc phiên đăng nhập.
- Hermes giữ **một lượt đăng**, trạng thái **Đã đăng**, có liên kết và không có lỗi đồng bộ. Chỉ một lần bấm Chia sẻ; lỗi ban đầu nằm trước Chia sẻ và được thử lại trên cùng lượt.
- Sau restart, hồ sơ giữ phiên đăng nhập đúng tài khoản; Touch VPN tự kết nối lại. Lượt đăng và dữ liệu bài vẫn còn. Browser đã đóng sau kiểm tra, video và kết quả xem được trong app.
- Các record khác, 25 job Muse, profile/batch và media gốc giữ nguyên. Thay đổi có chủ đích: duyệt take đã được người dùng chấp thuận, thêm lượt đăng và đồng bộ nội dung sang trạng thái đã đăng.

## Lỗi đã sửa trong lúc chạy thật

1. Mở menu Post trước khi tìm composer, chỉ tải file vào input video của composer thay vì input avatar trên hồ sơ.
2. Nhận liên kết dạng `/username/reel/code/` và chuẩn hóa về permalink.
3. Chờ grid bài đăng tải xong, phân biệt hồ sơ chưa tải với hồ sơ thật sự có 0 bài. Chờ thời gian và video của trang bài xuất hiện trước đối soát.
4. Khi Instagram báo thành công nhưng không kèm link, tự tìm và đối chiếu bài thật. Chỉ nhận khi đúng một bài khớp; không bấm Share lần nữa.
5. Chờ menu tài khoản tải sau khi mở lại browser, có giới hạn 20 giây; vẫn dừng khi gặp đăng nhập/xác minh hoặc sai tài khoản.

Tích hợp vào source hiện hành, có backup/hash trong checkpoint. Giữ nguyên theme, bố cục, font và workflow khác.

## Kiểm thử và giới hạn

220 test có sẵn đạt, 0 skip ở bản 15:41; sửa chờ session sau đó được kiểm lại bằng 16 test Instagram trên bản cài và hai Chromium DOM harness. Các ca DOM dùng video MP4 thật nhưng trang/receipt giả lập và chặn mạng ngoài: upload, caption, Share, delay, URL, caption/author/time/video sai, kết quả nhiều bài và chống gửi trùng. Chúng không được tính là bài Instagram thật. Không thay UI nên không build lại; local-dist 42 file giữ nguyên.

Đã kiểm app thật sau restart: tài khoản/VPN, lịch sử Đã đăng, link, caption, video phát trong app và cạnh phải cửa sổ. Ảnh 11 và 12 là ảnh native Windows; các ảnh 01–07 cũ thuộc fixture.

Lượt này nghiệm thu một bài Treat Trader. ChomChom Roller và Front Range Flex Leash chưa có hồ sơ Instagram được gắn và chưa đăng. Analytics tự động, lịch hẹn tự đăng và checkout chưa được nghiệm thu. Không coi toàn dự án đã xong.

## Cách mở và chạy tiếp

Mở `C:\Users\ADMIN\Downloads\Product-Lab-Local\Product-Lab-Local\START-HERMES-CLIP.cmd` → **Kinh doanh → Instagram** → chọn **Treat Trader** → **Nội dung** hoặc **Lượt đăng** → **Xem trên Instagram**.

Muốn đăng nội dung mới, chọn sản phẩm, hồ sơ, video và caption rồi bấm **Đăng video**. Không tạo lại nội dung đã đăng để kiểm thử. Hai sản phẩm còn lại cần xác định hồ sơ/tài khoản đăng phù hợp.

Checkpoint: `.product-lab-repair/instagram-20261111`. Bằng chứng chính: `live-publication-verification.json`, `publish-current.json`, `published-native-verification.json`, `reconciliation-dom-verification.json`, `adapter-dom-verification.json` và các manifest trong `installations`.
