# T09 — chốt nhãn AI trước Share, 12/11/2026

Checkpoint source: `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, checkout sạch lúc bắt đầu. Bản cài hiện hành được xác định từ context là source dưới `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local`; không kiểm tiến trình hay truy cập bản cài/dữ liệu người dùng trong task đêm. Một worker; không commit/push/đổi nhánh, cài dependency, mở Electron/dịch vụ thật, đọc AppData/profile/SQLite thật hoặc sửa vùng bị cấm.

## Đã hoàn thành

- `content_plan.aiLabel` optional/null, enum `required | off`. **Cập nhật 12/11/2026 (commit `9a5a3e6`, quyết định của người dùng): mặc định hiệu lực là `off`** khi đóng snapshot, bao gồm Muse và dữ liệu cũ; chỉ `required` tường minh mới bật nhãn và chặn trước Share. Form mặc định “Không gắn nhãn AI (mặc định)”; preview ghi rõ chế độ, không khẳng định nhãn cho bài lịch sử.
- `InstagramWorkspace` cố định cấu hình vào snapshot và đối chiếu lại trước khi đăng cùng revision/tài khoản/video/caption. Không đổi fingerprint chống trùng hoặc số lần Share.
- `InstagramAdapter.prepare` bật nhãn sau khi chọn video/Next/điền caption, tại màn có Share. Module `instagram-ai-label.mjs` tìm công tắc theo accessible role/name, mở Advanced settings có tên khớp khi cần, click tối đa một lần, đọc native checked hoặc aria-checked để xác nhận.
- `publish` kiểm ở chế độ chỉ đọc trước callback kiểm tài khoản/workspace và ngay sau callback, trước lệnh Share duy nhất. Thiếu/mơ hồ/disabled/unknown/không đổi trạng thái/thay đổi trước Share đều dừng. `off` không tương tác với nhãn, giữ đường đăng cũ.
- Lỗi nhãn lưu `needs_attention`, `attentionReason=ai_label`, reason/timestamp kiểm, history tiếng Việt “Cần đối soát/thao tác tay”, `submittingAt=null` vì chưa gọi Share. Job giữ snapshot, khóa gửi lại qua enqueue/retry/restart; không dò bài đã đăng cho lượt chưa gửi. UI mở trình duyệt để kiểm. Chưa thêm thao tác giải phóng/tiếp tục job chặn; không sửa DB để vượt gate.
- [INSTAGRAM-AI-LABEL.md](../INSTAGRAM-AI-LABEL.md) ghi vị trí chèn trong luồng, selector/giới hạn, cách chạy offline và hướng dẫn người dùng kiểm draft sáng mai, không bấm Share hoặc nút đăng tự động của Hermes.

## Kiểm tra mới

| Lệnh | Kết quả |
|---|---|
| Baseline `npm run test:desktop` | 218 đạt, 1 skip OpenMontage, 0 fail |
| `node --test desktop/test/instagram-ai-label.test.mjs desktop/test/instagram-workspace.test.mjs desktop/test/instagram.test.mjs` | 40/40 đạt, gồm 22 ca mới của module/DOM/publisher và một ca workspace mới |
| `node --test desktop/test/instagram-overview-ui.test.mjs` | 5/5 đạt, gồm một ca preview mới |
| `npm test` | 136/136 đạt |
| `npm run test:api` | 16/16 đạt |
| `npm run typecheck` | Đạt |
| `npm run test:desktop` sau sửa | 242 đạt, 1 skip OpenMontage, 0 fail; thêm 24 test desktop |
| `npm run local:build` với `HERMES_LOCAL_BUILD_DIR=outputs/night-t09/build` | Đạt, UI và 22 module API; không ghi `desktop/local-dist` |
| `git diff --check` | Đạt |

Log tại `ops/night/out/T09-baseline-desktop.log`, `T09-instagram-tests.log`, `T09-ui.log`, `T09-domain.log`, `T09-api.log`, `T09-typecheck.log`, `T09-desktop.log`, `T09-build.log` (log chạy local bị Git ignore). Build giữ cảnh báo font ở thời điểm compile trước bước copy font và cảnh báo chunk lớn; không đổi font/theme. OpenMontage skip đã có ở baseline, không nới assertion.

DOM fixture là HTML tĩnh trên Chrome headless mới, TEMP/TMP và APPDATA/LOCALAPPDATA riêng dưới `outputs/`, mọi request bị abort, DNS bị chặn. Adapter prepare/publish thật chạy với session, workspace, receipt, video bytes và media validation giả; Store trong bộ nhớ. Không có video Muse thật, cookie hay tài khoản thật. API dùng SQLite/R2 fixture cô lập; UI kiểm render source offline, không phải GUI bản cài.

## Chưa kiểm chứng / blocker

**CHƯA kiểm trên Instagram thật.** Không có DOM thật để xác nhận accessible names/roles, vị trí Advanced settings, hành vi từng ngôn ngữ/tài khoản hoặc nhãn được lưu phía Meta. Đây là giới hạn được yêu cầu cho T09, không chặn hoàn tất phần source/fixture. Chưa triển khai bản cài Windows. Gate giữ job cần xử lý thay vì tự gửi tiếp; việc tiếp tục sau xử lý thủ công cần phạm vi riêng.

## Bước tiếp

1. Người dùng theo mục kiểm sáng mai trong tài liệu, chỉ tạo draft và kiểm toggle trước Share; không dùng nút Đăng của Hermes làm dry-run.
2. Đối chiếu DOM tối thiểu đã loại dữ liệu cá nhân; nếu selector khác, bổ sung fixture rồi sửa adapter, giữ fail closed.
3. Chỉ lên kế hoạch nghiệm thu đăng thật sau khi có quyền tài khoản/nội dung riêng; không suy quyền từ task T09.
