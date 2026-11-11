# Instagram theo sản phẩm

## Số liệu tự động — cập nhật 11/11/2026

Hermes đọc Insights bằng hồ sơ Instagram của sản phẩm, tự cập nhật sau khi đăng và mỗi 30 phút khi app đang mở. Khởi động lại tiếp tục lịch đã lưu. Có nút Cập nhật ngay; không cần nhập số liệu. App không chạy lịch khi đã tắt hoặc máy ngủ, và đợi hồ sơ đang dùng ở phía trước rảnh trước khi tự đọc.

Mỗi lần đo kiểm đúng tài khoản và bài, mở tab riêng, lấy số liệu cộng dồn rồi đóng tab. Hồ sơ được mở tạm để đo sẽ tự đóng sau khi đọc; hồ sơ đã mở từ trước được giữ. Đo và đăng dùng chung khóa, không mở luồng đăng mới. Hết phiên cần người dùng đăng nhập; lỗi thông thường thử lại có giãn cách và dừng sau ba lần liên tiếp, có thể dùng Cập nhật ngay để tiếp tục.

Các chỉ số Instagram hiển thị như lượt xem, thích, bình luận, lưu, chia sẻ, theo dõi và người xem được lưu cùng thời điểm/nguồn. Dấu -- hoặc chỉ số không xuất hiện là null (Chưa có dữ liệu), số 0 thật vẫn là 0, số rút gọn có dấu ≈. Không suy đoán lượt bấm liên kết, doanh thu hoặc chỉ số tài khoản từ số liệu bài. Khi lỗi, giữ nguyên bản đo trước. Mỗi bài có một bản cộng dồn hiện tại, không cộng lại mỗi lần đo; tổng thiếu dữ liệu không hiển thị thành 0. Bản nhập thủ công trước đây vẫn được giữ đến lần đo thật tiếp theo.

Checkpoint instagram-metrics-20261111 có kết quả đọc Insights thật, kiểm thử DOM/GUI có fixture, test scheduler/schema/API, baseline và các bản sao lưu tích hợp. Các đoạn mô tả số liệu thủ công bên dưới thuộc lịch sử trước lần cập nhật này.

## Nghiệm thu thật 11/11/2026, 15:46

Sau khi người dùng duyệt, Treat Trader đã đăng lên @nao.mirita: https://www.instagram.com/reel/DfmDwT_Btcx/. Đối soát trang bài khớp tác giả, caption, thời điểm, video 720×1280 dài 10.026666 giây. Cùng một job published, một lần Share, content_plan published_browser và không có syncError. Restart giữ account/VPN/kết quả; đóng browser vẫn xem video và permalink trong app. Hai sản phẩm còn lại chưa đăng và chưa gắn hồ sơ Instagram.

Sửa từ thực tế gồm submenu Post, input video đúng composer, URL có username, chờ grid/metadata/menu tài khoản và đối soát tự động khi dialog success thiếu link. 220 test đạt trước sửa cuối về chờ session; sau đó 16 test Instagram và hai Chromium DOM harness đạt. Hai harness dùng fixture chặn mạng ngoài, không tính là bài thật. Bằng chứng tại checkpoint instagram-20261111 trong workspace chat: live-publication-verification.json, publish-current.json, published-native-verification.json và các install manifest. Các mô tả chưa nghiệm thu bên dưới là phạm vi đợt kiểm thử ban đầu.

Một main agent triển khai ngày 11/11/2026. Dùng Chromium riêng cho từng hồ sơ, cùng cơ chế lưu phiên và Touch VPN/proxy như tài khoản Muse. Không cần cấu hình Meta API cho luồng này.

## Cách sử dụng

1. Mở **Instagram** trong nhóm Kinh doanh, chọn sản phẩm.
2. Bấm **Thêm hồ sơ**, đặt tên rồi lưu. App mở trình duyệt để đăng nhập. Username dự kiến không bắt buộc; nếu điền, lượt đăng sẽ kiểm tra đúng username này.
3. Hoàn tất đăng nhập, kể cả 2FA hoặc xác minh do Instagram yêu cầu. App kiểm tra phiên và hiển thị username nhận diện được. Hồ sơ đóng chỉ hiển thị phiên lưu trên máy, không khẳng định đăng nhập hiện tại.
4. Chọn nội dung, video và tài khoản của sản phẩm. Kiểm tra video và chú thích hiển thị rồi bấm **Đăng video**. Nếu chưa đăng nhập, nút **Đăng sau khi đăng nhập** lưu đúng yêu cầu, mở hồ sơ và tự tiếp tục khi đăng nhập xong.
5. App thu nhỏ trình duyệt, tải MP4, chọn tỷ lệ gốc khi có công cụ cắt, điền chú thích và Chia sẻ. Kết quả nằm ngay nội dung và trong **Lượt đăng** của sản phẩm.

Touch VPN mặc định bật với hồ sơ mới. Cấu hình bánh răng cho phép chọn proxy riêng hoặc kết nối trực tiếp. Touch VPN và proxy riêng không đồng thời. Proxy password được mã hóa bằng kho hệ điều hành; mật khẩu Instagram do người dùng nhập trực tiếp vào Instagram. Việc giữ phiên riêng không đảm bảo thay đổi fingerprint hoặc chống phát hiện.

## Trạng thái và khôi phục

- Chờ đăng → Đang kiểm tra → Chờ đăng nhập (nếu cần) → Đang tải video → Đang đăng → Đã đăng.
- Đã đăng cần phản hồi bài video khớp tài khoản/nội dung hoặc liên kết từ thông báo chia sẻ thành công. Kết quả đối soát trang bài kiểm tra tác giả, thời điểm, caption và thông số video. Không dùng URL hồ sơ hoặc cookie riêng lẻ làm bằng chứng đăng bài.
- Nếu thông báo chia sẻ không có liên kết, app tự đọc lại bài trên hồ sơ để xác nhận. Danh sách bài được chờ tải riêng với phần đầu hồ sơ; liên kết có tên tài khoản cũng được nhận diện. Chỉ ghi Đã đăng khi tìm thấy đúng một bài khớp, không bấm Chia sẻ lần nữa.
- Lỗi trước bước Chia sẻ cho phép **Thử lại lượt đăng**. Có thể hủy khi chờ đăng hoặc chờ đăng nhập.
- Lỗi từ bước Chia sẻ chuyển **Cần kiểm tra kết quả**, chỉ đối soát và mở Instagram. Không tự gửi lại; cùng một nội dung đang chờ/không rõ kết quả không tạo thêm job khi chọn video khác.
- Khởi động lại sau bước Chia sẻ giữ trạng thái cần kiểm tra. Đã đăng nhưng đồng bộ workspace lỗi có nút đồng bộ; không đăng lại.
- Video/caption/account được chụp vào snapshot. File được đối chiếu checksum và giải mã FFmpeg trước upload; revision, liên kết sản phẩm và danh tính được kiểm trước Chia sẻ. Nội dung hoặc tài khoản thay đổi trong lúc chờ sẽ dừng.

## Phạm vi và bằng chứng

Mỗi sản phẩm có nhiều hồ sơ, mỗi hồ sơ lưu trình duyệt riêng. Lượt đăng chạy tuần tự. Ngày dự kiến hiện chỉ là kế hoạch, chưa phải bộ hẹn giờ. Tối đa 500 job được giữ để tránh lịch sử không giới hạn. Video theo giới hạn thư viện hiện có: MP4 tối đa 25 MB. Số liệu vẫn nhập thủ công, chưa tự đo analytics. Một lần bấm Đăng là yêu cầu công khai video đang hiển thị; thao tác đăng nhập hoặc thêm hồ sơ không tự chọn bài để đăng.

Đợt kiểm tra 11/11: domain 73, API 9, desktop 129, runner 8 đều đạt, không skip; build và typecheck đạt. Trong 129 test desktop có 15 test Instagram về dữ liệu, idempotency, lỗi sau Share, restart, bí mật proxy và liên kết sản phẩm. Chromium DOM fixture dùng MP4 thật để thử upload, crop, hai bước Next, caption nhiều dòng, Share và receipt. Electron chạy snapshot SQLite/media thật để thử form, playback, đổi sản phẩm, trạng thái đăng và restart ở 1440/1080/800/390px. Login/publication trong hai harness này được giả lập, không phải nghiệm thu đăng Instagram thật.

Checkpoint tại `.product-lab-repair/instagram-20261111` trong workspace chat, gồm baseline, source, log, verifier và backup/install manifest. Để nghiệm thu thật: đăng nhập một hồ sơ, chọn video/caption cần công khai, thực hiện đúng một lượt và kiểm permalink trong app cùng bài trên Instagram. Nếu bị challenge, người dùng hoàn thành xác minh trong cửa sổ hồ sơ; script không vượt xác minh.
