# T12 · Nạp video mẫu vào thư viện công thức (miễn phí, chạy local)

Phụ thuộc: T05 (thư viện công thức và taxonomy).

## Bối cảnh
- `desktop/src/integrations.mjs` → `analyze()` đã lấy 6 frame ở các mốc cố định từ một MP4 trong Thư viện (OpenMontage FrameSampler). Phần diễn giải vẫn để "pending".
- FFmpeg/ffprobe đã có (`desktop/src/media.mjs` → `toolchain()`).
- Agent Reach có kênh `youtube` miễn phí: info và subtitles không cần đăng nhập; tải video dùng yt-dlp đi kèm, nếu bản ghim có. Không dùng chuyển giọng nói (cần key trả phí).
- Mục tiêu dài hạn: thả video viral vào → app tự tách cấu trúc → tạo bản nháp công thức theo đúng taxonomy trong `lib/lab/viral-formulas*` → người dùng duyệt thành phiên bản mới.

## Mục tiêu (đêm nay, phần làm được không cần mạng)
1. **Phân tích cấu trúc tất định** cho một MP4 local (dùng file đã có trong Thư viện hoặc file người dùng chọn):
   - Thời lượng, độ phân giải, tỷ lệ khung.
   - Mốc cắt cảnh bằng FFmpeg `select='gt(scene,0.3)'` + `showinfo`, rồi đếm số cắt.
   - Lấy 1 frame mỗi khoảng 0,8 giây, ghép thành **contact sheet** JPEG (`tile`), giới hạn kích thước.
   - Lưu `structure.json`: `{durationSec, cuts:[sec], cutCount, contactSheetPath, frames:[{t,path}]}` trong thư mục tác vụ tích hợp, theo đúng quy tắc confinement và checksum hiện có.
2. **Bản nháp công thức:** hàm thuần dựng `ReferenceVideo` nháp từ `structure.json`:
   - Chia beat sơ bộ theo mốc cắt và tỷ lệ thời gian của công thức gần nhất (`problem-vs-result-cta` mặc định).
   - Các trường `hookText`/`ctaText` để trống cho người dùng điền, hoặc cho Muse điền ở bước sau. Không bịa.
   - Lưu thành bản nháp, chưa áp vào công thức chính.
3. **Prompt Muse sẵn để dùng sau** (chỉ tạo và test chuỗi, không gửi):
   - Nhận contact sheet và danh sách mốc cắt.
   - Yêu cầu trả JSON đúng taxonomy: `hookType`, nhãn chữ từng beat, `ctaType`, từ khóa CTA, đặc điểm sản phẩm.
   - Buộc chọn trong danh mục cố định, không viết tự do.
4. **Nhập từ link YouTube Shorts (chuẩn bị, kiểm vào sáng mai):**
   - Thêm thao tác `youtube info` + tải video qua Agent Reach hoặc yt-dlp của môi trường đã cài, nếu bản ghim hỗ trợ. Kiểm bằng `--help` local, không gọi mạng.
   - Giới hạn 25 MB / 180 giây như `referenceInput`. Tải xong đi tiếp bước 1.
   - Lấy subtitles nếu có (miễn phí) và lưu kèm.
   - Nếu bản ghim không có đường tải, ghi blocker và để nút ở trạng thái "chưa hỗ trợ".
5. UI: trong khối "Công thức video" (T05), thêm nút "Phân tích video mẫu". Hiển thị contact sheet, số cắt, thời lượng và bản nháp beat; nút "Lưu thành tham chiếu nháp".

## Giữ nguyên
- Hợp đồng tác vụ tích hợp: một tác vụ một lúc, `interrupted` khi restart, không replay, giới hạn kích thước, xác minh JPEG.
- Không cài thêm dependency.

## Nghiệm thu
- Test có FFmpeg trong môi trường test (nếu baseline có FFmpeg):
  - Tạo video tổng hợp 6 giây có 3 đoạn màu khác nhau bằng FFmpeg `lavfi`.
  - Phát hiện 2 mốc cắt (±0,3 giây); contact sheet tồn tại và là JPEG hợp lệ.
  - Không có FFmpeg → test skip có lý do rõ.
- Test thuần: dựng beat nháp từ `structure.json` mẫu; prompt Muse chứa đủ danh mục taxonomy.
- Test runner giả cho argv youtube info/tải.
- `npm run test:desktop`, `npm test`, `npm run typecheck`, `npm run local:build` không hỏng thêm.

## Ghi chú từ review đêm 11/11 (bắt buộc đọc)
- Lần chạy trước (commit `a83d5b9`) bị cắt giữa chừng vì key Codex hết hạn và đã bị **revert**. Bạn có thể xem bằng `git show a83d5b9` để tham khảo, nhưng phải làm lại đầy đủ: test, UI, wiring IPC trong `desktop/src/main.mjs` và `preload.cjs`.
- Không mở kind API mới (ví dụ `reference_video_draft`) nếu không có test API kèm theo.
- Không sửa hàm dùng chung `runJson` trừ khi thật cần. Nếu sửa thì phải có test, vì T11/T14 và mọi tác vụ tích hợp đều dùng hàm này.
- Test desktop cần server build từ source thì dùng `scripts/build-local-server.mjs` (tạo ở T05). Không thêm `module.registerHooks` mới.
