# Product Lab Local · Chí Đức

Giao diện đã build sẵn, SQLite và media trên máy của mày. App không cần mở site hoặc đăng nhập ChatGPT. Muse vẫn cần Internet và đăng nhập trực tiếp trong browser profile.

## Chạy trên Windows

1. Giải nén cả thư mục vào một chỗ cố định, ví dụ `C:\Product-Lab-Local`. Đừng chạy ZIP trực tiếp.
2. Cài Node.js **24 LTS trở lên** từ https://nodejs.org/en/download.
3. Mở `START-LOCAL.cmd`. Lần đầu script cài đúng dependency đã khóa và Chromium. Các lần sau dùng lại dependency đã có.
4. FFmpeg và ffprobe phải có trên PATH trước khi chạy job hoặc ghép video. Thiếu chúng vẫn mở app và đăng nhập Muse được. Có thể dùng trình quản lý gói của mày để cài FFmpeg, rồi mở lại terminal/app.

Đây là gói source có giao diện đã biên dịch; không phải EXE Windows đã ký. Không cần cài dependency web để mở app. Windows Electron GUI và tài khoản Muse thật còn cần kiểm tra trên máy của mày.

## Gắn Muse

1. Vào **Tài khoản → Desktop & profile**, hoặc **Tạo video → Desktop worker**.
2. **Trang Muse** đã điền sẵn `https://muse.ai/` theo URL mày chọn, chỉ trong lần khởi tạo local chưa có cấu hình. Cấu hình đã lưu được giữ nguyên. Nếu có link trực tiếp tới màn hình tạo video, có thể sửa ở đây.
3. Thêm **Profile**. Proxy có thể để trống. Không nhập mật khẩu Muse vào form profile.
4. Bấm **Mở Muse**, tự đăng nhập trong cửa sổ Chromium. Phiên được lưu riêng trên máy.
5. **Luồng Muse** chỉ được bật sau khi xác minh giao diện thật: vị trí prompt/upload, nút tạo, mã kết quả riêng và nút tải. Nếu Muse có bộ chọn model/tỷ lệ/thời lượng riêng, cần map và kiểm tra chúng trước khi chạy tự động. Hiện adapter chỉ điền prompt/reference; không tự đoán các bộ chọn đó.
6. Đóng profile trước khi đổi URL/proxy/luồng. Đổi URL Muse tắt luồng cũ và buộc kiểm tra lại phiên.
7. Duyệt storyboard, chọn cảnh, thêm job nháp vào worker. **Duyệt & chạy** yêu cầu xác nhận số lượt/quota trước khi gửi.

**Còn thiếu để chạy Muse thật:** phiên đăng nhập trên máy, màn hình và luồng tạo/tải đã được quan sát, model/tỷ lệ/thời lượng thực tế và một lượt chạy nghiệm thu. Trang công khai hiện dừng ở đăng nhập; chức năng tạo video trong tài khoản chưa được kiểm chứng ở đây. Đăng nhập tài khoản không tự chứng minh adapter đã kết nối. Không có job trả phí nào được chạy sẵn trong gói.

## Dữ liệu và file

- Bấm **Thư mục dữ liệu** trong Desktop & profile để mở đúng thư mục workspace đang dùng.
- Hồ sơ, storyboard, báo cáo và metadata lưu trong `workspace.sqlite`; ảnh/video trong `media/`. Đóng app trước khi sao lưu toàn bộ thư mục workspace.
- Profile đăng nhập Muse và cấu hình proxy nằm riêng trong dữ liệu ứng dụng; chúng không có trong ZIP này.
- Dự án `TEST LOCAL · Treat Trader` được thêm **chỉ khi workspace local hoàn toàn trống**: một sản phẩm chưa kiểm sample, một ảnh tham chiếu từ hãng và bốn cảnh nháp. Giá/chi phí là giả định QA; không có doanh số giả hoặc video quảng cáo giả.
- Workspace trên site cũ được giữ nguyên. Gói này chưa tự nhập dữ liệu hoặc file từ site. Dữ liệu local mới cũng không tự đồng bộ lên site.
- Cần Internet cho lần cài dependency đầu tiên, Muse và các công cụ nghiên cứu ngoài máy. Hồ sơ/ảnh/file đã lưu vẫn đọc và sửa local.

## Chỉnh source trên local

Source web giữ nguyên trong `app/`, `components/`, `lib/`; desktop và server local ở `desktop/`. Để build lại giao diện/API local, cài dependency root bằng pnpm theo `pnpm-lock.yaml`, rồi chạy `npm run local:build`. Để test: `npm run local:test` và `npm test`. Đóng gói source ZIP bằng `npm run local:package` cần Python 3; việc mở app không cần Python. Mở app dùng `START-LOCAL.cmd` hoặc `cd desktop` rồi `npm start`.

`npm run start:hosted` trong thư mục desktop là chế độ tương thích cũ, mở site. Chế độ mặc định `npm start` dùng giao diện, SQLite và media local.

## Những việc chưa được chứng minh

Test HTTP local đã kiểm tra lưu/khởi động lại, asset/range, scope phiên local, host/origin và cổng duyệt của API gốc. Test worker/FFmpeg không thay thế kiểm thử Windows GUI, proxy của mày hoặc một job Muse thật. Lip-sync, độ giống sản phẩm và chi phí Muse cần đối soát thực tế. Khi kết quả gửi chưa rõ, worker dừng để đối soát thay vì bấm gửi lại.
