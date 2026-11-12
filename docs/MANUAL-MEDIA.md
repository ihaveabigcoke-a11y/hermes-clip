# Media thủ công và tạm dừng Muse — T-002

Thay đổi source ngày 12/11/2026; chưa triển khai vào bản cài Windows.

## Cách dùng

1. Trong **Cài đặt → Nhà cung cấp media**, giữ **Tạm dừng Muse** bật. Cài đặt mặc định bật cả khi database cũ chưa có giá trị này. Chọn đường dẫn tuyệt đối cho **Hộp nhận media**, bấm **Lưu hộp nhận media**.
2. Trong **Tạo video**, chọn **manual** cho cả dự án hoặc từng cảnh. Chọn cả dự án sẽ áp dụng cho mọi cảnh và xóa các lựa chọn riêng trước đó. `muse` bị khóa khi tạm dừng; `grok-cli` và `fal` chưa cho chạy.
3. Lưu prompt tiếng Anh, ảnh tham chiếu và duyệt kịch bản. Với luồng manual mới, dùng video **9:16, 8 giây**. Cảnh cũ giữ nguyên thông số; kiểm/sửa và duyệt lại trước khi xuất nếu cần. Gói giữ nguyên nội dung đã duyệt, không tự dịch hoặc gọi AI.
4. Bấm **Xuất gói prompt**. App xuất tất cả cảnh manual đã duyệt của dự án vào `workspace/exports/prompt-packs/P<n>-yyyyMMdd-HHmm/`. Đường dẫn đầy đủ hiện trên màn hình. Thư mục gồm `README-VI.txt`, `<MÃ-CẢNH>.txt` và ảnh `<MÃ-CẢNH>-ref-<n>.<ext>` đã kiểm checksum. Gói đã có trong cùng phút được giữ nguyên; xuất lại vào phút tiếp theo.
5. Tự mở Flow/Gemini hoặc Grok, đọc README, thêm ảnh và dán prompt. Tải file hoàn tất rồi bấm **Mở hộp nhận media**, chép file vào thư mục đó. Ví dụ `P12-S03-take2.mp4`; lấy mã thật từ danh sách cảnh hoặc tên file prompt.
6. Khi app đang mở, bộ theo dõi quét mỗi 2 giây, chờ hai lần quan sát có cùng kích thước/ngày sửa. File khớp đúng một mã cảnh manual được nhập thành phiên bản **chờ duyệt**. File không khớp, khớp nhiều cảnh hoặc cảnh đang dùng nhà cung cấp khác vào **Chưa gắn cảnh**; chọn cảnh rồi bấm **Gắn vào cảnh**.
7. Xem lại và duyệt phiên bản bằng luồng hiện có trước khi ghép/xuất. Không tự đăng hoặc nhận tiền.

Mã `P<n>-S<nn>` do desktop lưu bền theo sản phẩm/cảnh, không thay khi sửa tên. Đây là mã định tuyến file trong app, không phải SKU supplier. Các cảnh ở dự án khác của cùng sản phẩm có mã khác nhau.

## Trạng thái và bảo toàn dữ liệu

- **Chờ xuất prompt**: chưa xuất phiên bản cảnh hiện tại.
- **Đã xuất**: gói của phiên bản hiện tại đã được ghi hoàn chỉnh.
- **Chờ file**: đã xuất gói và bấm mở hộp nhận.
- **Đã nhận**: đã gắn file vào phiên bản cảnh hiện tại.

File gốc không bị di chuyển hoặc xóa. Bản chép tạm được kiểm bằng ffprobe rồi nhập Thư viện. Receipt lưu SHA-256, đường dẫn nguồn, metadata và ý định gắn cảnh trước khi ghi take. Nhập lại cùng checksum không tạo take mới, kể cả đổi tên hoặc khởi động lại. Sau mất phản hồi, app đối soát take/receipt trước khi ghi tiếp. Dữ liệu Muse cũ, quota, profile và phiên đăng nhập được giữ.

Sai 9:16 chỉ cảnh báo ở bước nhập. Quy tắc duyệt/ghép hiện có vẫn kiểm thông số cảnh; cần xử lý file không khớp trước khi xuất video cuối. Loại file được hỗ trợ theo Thư viện hiện có: MP4, WebM, PNG, JPG/JPEG, WebP; video tối đa 25 MB, ảnh tối đa 8 MB. Không tự nén file quá giới hạn. Không quét thư mục con. Thư mục rỗng mặc định được tạo trong workspace; chỉ giám sát khi app đang chạy.

Khi bật tạm dừng Muse, worker ngừng giao việc, chặn mở profile/VPN, gửi chat/research/media và đối soát từ dịch vụ; đóng context đang mở. Route browser kiểm lại cờ trước request mới. Công tắc không thể thu hồi request đã gửi trước lúc bật. Tắt tạm dừng không tự chạy lại hàng đợi; cần chọn nhà cung cấp Muse và chủ động chạy khi tài khoản được phép.

## Kiểm thử an toàn trong checkout

Không mở bản cài hoặc dùng AppData thật. Tất cả test manual dùng thư mục tạm, SQLite fixture và MP4/PNG tổng hợp bằng FFmpeg.

```powershell
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:desktop
$env:HERMES_LOCAL_BUILD_DIR = "$PWD/outputs/T-002-build"
pnpm local:build
```

Repo thiếu `scripts/run-framework.mjs`, nên không dùng `pnpm build` và không tạo file đó. Build kiểm thử ở `outputs/`, không ghi `desktop/local-dist`.

Chạy riêng test tính năng khi môi trường không cho Node tạo tiến trình test con:

```powershell
node --test --test-isolation=none desktop/test/manual-media.test.mjs desktop/test/manual-media-ui.test.mjs desktop/test/muse-pause.test.mjs
```

Script chụp UI fixture đã chuẩn bị, dùng source build phía trên và chặn các request ra ngoài:

```powershell
$env:HERMES_ARTIFACTS = 'D:/hermes-wt/artifacts/T-002'
node scripts/check-manual-media-ui.mjs
```

Khi chạy được, script ghi `T-002-tao-video-1366.png`, `T-002-tao-video-1920.png`, `T-002-ui.json`. Trong môi trường T-002 hiện tại, Chrome thoát vì IPC `Access is denied`; chưa có ảnh, chưa xác nhận bố cục thực tế ở hai kích thước. Xem checkpoint `ops/night/out/T-002.md` trước khi nghiệm thu.
