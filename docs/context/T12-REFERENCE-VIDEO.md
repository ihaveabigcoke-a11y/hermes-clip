# T12 — phân tích video mẫu local, 12/11/2026

## Checkout và phạm vi

Source tại `C:/HermesNight/hermes-clip`, nhánh `night-20261111`; không triển khai vào bản cài Windows. Chỉ một worker. Không chạy Electron, Muse, Instagram, browser thật, request ra Internet, cài dependency, commit/push hoặc sửa dữ liệu đầu vào. Mọi thư mục tạm của lệnh kiểm nằm ở `test-results/t12/tmp`, không dùng AppData. Build đặt ở `outputs/t12-build`, không sửa `desktop/local-dist`.

Đã đọc lại phần triển khai dở tại commit đã revert `a83d5b9`; dùng ba module tham khảo làm điểm xuất phát rồi bổ sung và kiểm toàn bộ wiring, UI, API, giới hạn tiến trình và test. `runJson` dùng chung không thay đổi.

## Thay đổi và hợp đồng

- Luồng mới `integrationAnalyzeStructure` dùng FFmpeg trực tiếp, độc lập với luồng 6 frame OpenMontage cũ. Nguồn là MP4 từ Thư viện hoặc file người dùng chọn; tối đa 25 MiB / 180 giây. Kiểm SHA-256, probe kích thước/tỷ lệ (có rotation/SAR), chỉ dùng demuxer MOV/MP4 và protocol `file,pipe`. Phát hiện cảnh bằng `select='gt(scene,0.3)',showinfo` sau khi chuẩn hóa mốc đầu.
- Mỗi 0,8 giây lấy một JPEG 160×160 có padding, tối đa 225 ảnh; ghép `tile` thành contact sheet tối đa 2400×2400. JPEG phải qua kiểm magic, ffprobe và full decode. Lưu `source.mp4`, frame, `contact-sheet.jpg` và `structure.json` cùng thư mục tác vụ; receipt giữ checksum của JSON, ảnh và nguồn. Khi mở lại, IPC kiểm project, trạng thái done, confinement bằng realpath và checksum. Không nhận đường dẫn tùy ý từ renderer.
- Dùng cùng hợp đồng `Integrations.task`: một tác vụ một lúc, trạng thái lỗi/gián đoạn được giữ, restart không replay. `reference-structure` là loại tác vụ tích hợp; luồng OpenMontage cũ vẫn hoạt động như trước.
- Hàm thuần `draftReferenceVideo` chọn công thức theo traits hoặc mặc định `problem-vs-result-cta`, chia nhịp theo tỷ lệ thời gian rồi kéo về mốc cắt gần đó. Đây là gợi ý thời gian, chưa xác minh ý nghĩa cảnh. Hook/CTA/nhãn chữ để trống; phân loại nội dung chưa biết giữ null.
- Record mới `reference_video_draft` tách khỏi `viral_formula`. ID chuẩn, kiểm schema, CAS/revision và owner isolation của API vẫn áp dụng. Không tạo/sửa phiên bản công thức chính. Trường mới optional/default null; ReferenceVideo cũ vẫn parse được. UI mở lại bản nháp giữ snapshot phiên bản, nhãn và phân loại đã lưu; chỉ chọn công thức khác mới dựng lại nhịp.
- Prompt Muse tiếng Anh nêu contact sheet, thứ tự ô, timestamps, cuts và toàn bộ taxonomy cố định (roles, beatKinds, hookTypes, ctaTypes, productTraits). Chỉ chép chữ đọc được; unknown=null, không suy diễn công dụng, doanh số hoặc nội dung quảng cáo. Chỉ chuẩn bị chuỗi, không gửi Muse.
- Khối Công thức video có nút **Phân tích video mẫu**, chọn sản phẩm/tham chiếu chung, MP4 trong Thư viện/file local, xem contact sheet, số cắt/thời lượng/tỷ lệ, beat nháp, sửa hook/CTA và **Lưu thành tham chiếu nháp**. Có lịch sử phân tích và danh sách nháp đã lưu. Theme/font giữ nguyên.

## YouTube — chuẩn bị, chưa nghiệm thu online

Khả năng được kiểm bằng `youtube --help`, `youtube info --help` khi có cấu hình Agent Reach và `yt-dlp --ignore-config --help` (hoặc `python -m yt_dlp` trong môi trường đã cấu hình). Không dò URL để đoán lệnh, không cài thêm backend. Chỉ hỗ trợ link HTTPS `/shorts/<ID 11 ký tự>`; bỏ tracking và chặn userinfo/host/port khác.

Nếu help xác nhận đủ tùy chọn: giữ kết quả `youtube info` khi có, đọc metadata qua yt-dlp, chọn MP4 một file có filesize xác định ≤25 MiB và duration xác định ≤180 giây. Unknown filesize/duration bị chặn, không đổi thành 0. Tải có `--ignore-config`, `--no-cache-dir`, `--no-overwrites`, `--no-playlist`, `--max-filesize`, `--match-filters`, giới hạn thời gian/retry/stdout và tổng file trong tác vụ. Không dùng cookie, proxy, đăng nhập hoặc transcription. Giữ phụ đề tiếng Anh VTT có sẵn/tự động nếu có, kiểm định dạng/kích thước/checksum; tải xong đi qua cùng phân tích FFmpeg.

**Blocker môi trường:** clone không có checkout/venv Agent Reach và không có yt-dlp trên PATH. Lệnh kiểm help local thực tế trả `supported:false`; nút tải Shorts bị khóa, hiện **Chưa hỗ trợ**. Không khẳng định revision ghim đã hỗ trợ tải hay kết nối YouTube thành công. Argv/info/tải/subtitles và chuỗi tải → phân tích được kiểm bằng runner giả; media bước sau là video tổng hợp thật.

## Bằng chứng kiểm tra

Baseline: domain 117/117, API 13/13, desktop 197 đạt + 1 skip OpenMontage, typecheck đạt.

Kết quả sau sửa:

| Lệnh | Kết quả |
|---|---|
| `npm test` | 121 đạt, 0 fail |
| `npm run test:api` | 14 đạt, 0 fail |
| `npm run test:desktop` | 212 đạt, 0 fail, 1 skip OpenMontage như baseline |
| `npm run typecheck` | Đạt |
| `npm run local:build` với `HERMES_LOCAL_BUILD_DIR=.../outputs/t12-build` | Đạt; 22 module API; cảnh báo chunk >500 kB |
| `git diff --check` | Đạt |

Test FFmpeg thật: video lavfi 6 giây gồm đỏ/trắng/xanh, phát hiện 2 cuts tại 2/4 giây trong sai số ±0,3 giây; 8 frames tại 0…5,6 giây, contact sheet JPEG 480×480, source giữ nguyên. Video ngắn 0,2 giây vẫn có frame 0 và 0 cuts; video 180,2 giây bị chặn. Kiểm receipt sau restart, checksum sai, project khác, đường dẫn ngoài task, JPEG giả, lock và interrupted/no replay. Nếu FFmpeg/ffprobe không có trên PATH, các ca media mới skip với lý do cụ thể.

API test có create/edit, stale revision, taxonomy sai, null cũ, owner isolation và không ghi formula. Test HTTP local biên dịch từ source bằng `scripts/build-local-server.mjs`, lưu/đọc lại sau restart trên SQLite fixture riêng. UI kiểm render React offline; không thêm `module.registerHooks`. Log kiểm tại `test-results/t12/` (ignored).

## Chưa kiểm và cách tiếp tục

1. Sáng mai triển khai source/build theo quy trình của bản cài; mở Nghiên cứu → Công thức video → Phân tích video mẫu, chọn MP4 thật và kiểm UI ở cửa sổ rộng/nhỏ. T12 chưa kiểm GUI hoặc file người dùng thật.
2. Trên môi trường tích hợp đã cài, bấm Kiểm tra hỗ trợ YouTube; chỉ khi hỗ trợ mới chọn một Shorts công khai để kiểm info, tải ≤25 MiB/180 giây và phụ đề. Chưa có mạng/quyền đăng nhập nào được kiểm đêm nay.
3. Đọc và chỉnh hook/CTA rồi lưu tham chiếu nháp. Bước gửi contact sheet/prompt sang Muse và duyệt thành phiên bản công thức mới là công việc sau, chưa tự thực hiện.

## File source/test đã đổi

- `desktop/src/reference-structure.mjs`, `reference-youtube.mjs`, `reference-process.mjs`, `integrations.mjs`, `main.mjs`, `preload.cjs`.
- `lib/lab/viral-reference.ts`, `domain.ts`; `app/api/lab/route.ts`.
- `components/lab/reference-video.tsx`, `viral-formulas.tsx`, `operations.tsx`, `integrations.tsx`.
- `desktop/test/reference-video.test.mjs`, `local.test.mjs`, `viral-formulas-ui.test.mjs`; `tests/operations.test.mjs`, `operations-api.test.mjs`.
- `scripts/build-local.mjs` thêm output override bị giới hạn trong `outputs/` để kiểm build không ghi local-dist.
- Checkpoint này và mục T12 trong `01-BOI-CANH-VA-TRANG-THAI.md`.
