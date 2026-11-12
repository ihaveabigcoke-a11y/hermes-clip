# Phân tích video mẫu qua Muse — kiểm buổi sáng

T22 nối phân tích local của T21 vào chat Muse. Chỉ source của clone đêm đã đổi; chưa triển khai bản cài Windows và **chưa kiểm Muse thật**. Các test dùng ảnh/video tổng hợp, page giả và UI offline. Chúng không chứng minh selector upload còn đúng với Muse hiện tại.

## Kiểm một video, một lượt

1. Sau khi source/build đã được triển khai theo quy trình riêng, mở đúng bản cài. Giữ DB, profile, receipt, video và bản xuất cũ. Chọn một MP4 mẫu **6–20 giây**, tối đa 25 MB, có chữ/CTA dễ đọc để toàn bộ video nằm trong sheet dày đầu tiên. Không chạy clone đêm song song với bản cài trên cùng dữ liệu.
2. Vào **Nghiên cứu → Công thức video → Phân tích video mẫu**, chọn MP4 rồi **Phân tích MP4**. Kiểm thời lượng, contact sheet và caption/tên file. Bước local không dùng lượt Muse. Bản phân tích cũ thiếu sheet dày phải phân tích lại.
3. Chọn **profile Muse đang bật**, đã đăng nhập, hạn mức còn đủ và bộ đếm đợt dưới 3. Ghi số lượt hiện tại. Bấm **Phân tích bằng Muse** đúng một lần. Nhãn ghi **Tốn 1 lượt Muse**. App gửi sheet thưa và sheet dày đầu tiên theo thứ tự đó; không gửi video gốc.
4. Đợi phản hồi. Kết quả được parse rồi điền vào phần xem trước để duyệt: hook, beat, CTA, nguồn, cảnh kết quả, cảnh báo. Kiểm với video gốc. **Chưa có bản ghi tham chiếu/công thức mới** trước khi bấm lưu. Bộ đếm phải tăng đúng 1.
5. Chỉ bấm **Lưu tham chiếu** nếu đồng ý. Việc này không gửi Muse; tạo phiên bản công thức vẫn là nút duyệt riêng. Nếu JSON sai, dừng bài kiểm một lượt và giữ receipt. Nút **Gửi tiếp yêu cầu sửa JSON** dùng `parentId`, không upload lại, nhưng **tốn thêm một lượt** nếu người dùng chủ động chọn.

## Nhận biết upload chat có chạy

- Trong **Chat Muse**, tìm hội thoại có prompt phân tích vừa gửi và mở hội thoại đã lưu bằng profile sở hữu. Tin nhắn đầu phải có **hai ảnh đính kèm**, mở ảnh để đối chiếu sheet thưa và sheet dày đầu tiên. Chỉ có URL hội thoại hoặc câu trả lời “đã xem ảnh” chưa đủ bằng chứng.
- Trước khi gửi, adapter dùng `config.upload` → `setInputFiles`, để trống ô prompt và chờ `button[aria-label="Send"]:enabled`. Chỉ sau khi sẵn sàng mới điền prompt, ghi checkpoint `beginSubmit` và bấm Send. Đây là cơ chế upload đang dùng chung với tạo media; chưa có selector thumbnail mới được xác minh trên Muse thật.
- Receipt chat có hai mục `attachments` với đường dẫn local, loại ảnh và SHA-256; đối chiếu với sheet của tác vụ. Receipt chứng minh file chuẩn bị, **không thay thế việc nhìn thấy hai ảnh trong tin nhắn phía Muse**. Không đưa phiên đăng nhập, proxy, cookie hoặc DB vào báo cáo kiểm.
- Thiếu cấu hình upload, lỗi chọn file hoặc không thấy trạng thái sẵn sàng: chat **failed / Gửi chưa bắt đầu**, lý do tiếng Việt; không có prompt được gửi, bộ đếm đợt giữ nguyên. Đối chiếu cả UI Muse và số lượt. Nếu selector hiện tại cho phép Send khi ảnh chưa hiện, dừng nghiệm thu và ghi lại selector/trạng thái để sửa, không thử hàng loạt.
- **needs_attention / Cần đối soát** hoặc mất phản hồi IPC: dùng **Đọc lại kết quả**. Không tạo yêu cầu khác để thử vận may. Đọc lại không gửi prompt và không tăng bộ đếm. Nếu vẫn không xác định được kết quả, mở hội thoại để đối soát; không reset đợt để né giới hạn.

## Hợp đồng và giới hạn

- `MuseChat.send` nhận `attachments?: string[]` ở main: tối đa 4 ảnh JPEG/PNG, mỗi ảnh ≤8 MiB, đúng chữ ký và giải mã được bằng FFmpeg. Chỉ nhận file trong `worker/integrations` hoặc `worker/references`; từ chối symlink/junction, đường dẫn ngoài thư mục, file không phải ảnh. Ảnh được kiểm lại trước upload.
- Renderer chỉ thêm `referenceJobId` vào `museChatSend` hiện có; main đọc `structure.json` đã kiểm SHA-256 của tác vụ hoàn tất, kiểm confinement/checksum hai sheet. Scope chat là `reference_<jobId>`. Payload có `attachments`, `path`, `bytes` hoặc `references` từ renderer bị từ chối. Preload chuyển payload qua kênh cũ; kiểm quyền/input vẫn ở main.
- Fingerprint chat có ảnh dùng SHA-256 từng ảnh theo thứ tự. Chat không ảnh, kể cả `attachments: []`, giữ đúng công thức cũ và không thêm trường vào receipt cũ. Chat sửa JSON dùng cùng profile/scope/parent hoàn tất, dùng chung giới hạn 3 lượt.
- Video dài hơn phạm vi sheet dày đầu tiên chỉ có mẫu thưa cho đoạn còn lại. Prompt và cảnh báo nói rõ giới hạn; không kết luận thiếu chữ/CTA từ đoạn chưa kiểm. Audio chưa có transcript. Caption dài vẫn có thể bị trích đoạn như T21.

## Kiểm source offline

```powershell
$env:TEMP = Join-Path $PWD 'outputs/t22-temp'
$env:TMP = $env:TEMP
$env:npm_config_update_notifier = 'false'
$env:npm_config_offline = 'true'
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
node --test desktop/test/muse-chat-attachments.test.mjs desktop/test/muse-chat.test.mjs desktop/test/muse.test.mjs
npm run test:desktop
$env:HERMES_LOCAL_BUILD_DIR = Join-Path $PWD 'outputs/T22-build'
npm run local:build
node scripts/check-muse-analysis-ui.mjs
```

UI script dùng Chrome cài trong Program Files (hoặc `HERMES_TEST_CHROME`), profile tạm trong `outputs`, toàn bộ request được fulfill/abort offline. Không dùng profile người dùng, Electron, AppData thật hay Muse/Instagram. Ảnh và báo cáo fixture: `ops/night/out/T22-*`.
