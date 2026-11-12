# Hermes Clip — bàn giao một main agent, 13/11/2026

Người dùng yêu cầu Codex tự tiếp quản boss, tự thực hiện và tự review các job, chỉ một main agent. Quy tắc này thay các đoạn thuê worker, boss phụ và hai boss trong prompt/CLAUDE cũ. Không chạy `codex exec`, runner đêm hay một hệ thống điều phối khác để làm thay công việc. Có thể dùng các tiến trình test, build, FFmpeg và Python local thông thường.

## Nguồn sự thật và checkout

- App: `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local`, nhánh `main`. Launcher `START-HERMES-CLIP.cmd` nạp `desktop/src` và `desktop/local-dist`.
- Văn phòng: `D:/agent-office/ngh-ch-ti-p-agent-office`. Đọc `AGENTS.md`, `HANDOVER.md`, phần mới nhất của `STATUS.md`, rồi đề bài `tasks/`.
- Prompt tiếp quản: `D:/agent-office/CODEX-BOSS-PROMPT.md`.
- Đọc README và context hiện hành trong app trước khi sửa. `git log`, `git status` và diff là bằng chứng code; một dấu đánh dấu trong bảng tiến độ không đủ chứng minh dịch vụ thật hoạt động.
- T-001–T-008 đã triển khai. T-006 `85fbc66`, T-007 `2c2e876`, T-008 `bd8aba9`. T-009 sửa phần nhận cấu hình rea-video khi nâng cấp tại `e47b51d`, rồi chốt bàn giao.

## Cách chạy một việc

1. Xác định đúng checkout, tiến trình Electron và file khóa `.git/office-locks`. Không sửa file có WIP hay khóa của phiên khác. Không kết luận một khóa rỗng là tiến trình còn chạy.
2. Ghi đề bài và tiêu chí kiểm vào `tasks/T-xxx-*.md`; chỉ áp yêu cầu thực tế, không biến toàn bộ ý tưởng lịch sử thành phạm vi.
3. App tắt, Git sạch → đặt tag `before-T-xxx` nếu chưa có → ghi khóa file của chính phiên. Không di chuyển tag cũ.
4. Một main agent sửa source, chạy test phù hợp, tự review diff theo `.claude/skills/hermes-night-review/SKILL.md` (Office mode). Báo rõ đây là tự review, không bịa một reviewer độc lập.
5. Commit cục bộ theo đúng path. Không `add -A`, stash, checkout/reset/clean hoặc thay nhánh app. Có WIP người khác thì chỉ kiểm riêng phần mình; full suite/build đợi cây sạch.
6. Chạy bộ kiểm bên dưới, build bằng `pnpm local:build` khi app tắt; không `pnpm build`. Lỗi mới phải phân biệt với lỗi sandbox, không hạ assertion.
7. Ghi HEAD, giờ build, lệnh, log và điều chưa kiểm vào STATUS; nhả khóa mình tạo. Không push/merge trừ khi người dùng yêu cầu trực tiếp trong phiên đang làm.

## Lệnh kiểm Windows

Trong PowerShell ở thư mục app, bổ sung FFmpeg portable cho phiên hiện tại:

```powershell
$env:PATH = (Join-Path (Get-Location) 'desktop/tools/ffmpeg/bin') + ';' + $env:PATH
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:desktop
pnpm local:build
```

Kiểm `$LASTEXITCODE` sau từng lệnh; lệnh trước lỗi thì xử lý trước khi tuyên bố đạt. Node có thể cần quyền khởi tạo tiến trình ngoài sandbox. Không dùng `--test-isolation=none` để biến một lượt fail do môi trường thành nghiệm thu full suite. Test local dùng fixture; không trỏ fixture vào dữ liệu người dùng.

## Rea-video đã cài trên máy này

- Python: `desktop/.integrations/.rea-venv/Scripts/python.exe` (3.12.14); Python mặc định là 3.15 nên không dùng mặc định cho rea-video.
- Checkout: `desktop/.integrations/rea-video`, revision trong `desktop/integrations-lock.json`.
- Cache: `desktop/.integrations/rea-models` (~216 MB cho ba model đã tải), tái dùng giữa các job. Không đưa venv, model hay config local vào Git.
- `.integrations/config.json` đã có `reaPython` và `reaVideo`. Lần mở app sau, chỉ các trường thiếu trong cấu hình tích hợp cũ được bổ sung; không thay cấu hình đã chọn. Nếu đã lưu một đường dẫn riêng trong Cài đặt đọc ảnh, lựa chọn đó vẫn được giữ.
- Đường mặc định của sản phẩm vẫn là Codex CLI theo T-008. Phiên nghiệm thu này chọn **Nhập tay trong DB fixture** để không chạy thêm agent. Không thay lựa chọn hay khóa của dữ liệu thật.
- Khi cần cài lại, dùng Python 3.10–3.14. Trên máy này có Python 3.12 trong `.integrations/.venv`; có thể đưa `Scripts` của venv này lên PATH cho phiên setup. Đọc script trước khi chạy, vì `SETUP-INTEGRATIONS.ps1` cài cả Agent Reach/OpenMontage và cần mạng. Không tự mua API hoặc tự bật Gemini.

## Đã kiểm và giới hạn

Lượt này kiểm full suite sau sửa, rea-video thật trên một MP4 snapshot, xuất/nhập review CLI thật và checksum nguồn. Báo cáo ở [T-009](../../ops/office/reports/T-009.md); log/media test riêng trong `outputs/office-20261113`, không đưa dữ liệu runtime vào Git.

Chưa nghiệm thu Electron trên dữ liệu thật, Codex/Gemini VLM thật, Meta/DM thật, Flow/Gemini file mới và Thùng rác Windows thật. Giữ các mục này là **chưa kiểm**, không âm thầm chạy tài khoản. OCR có thể nhận chữ in trên sản phẩm là overlay; người dùng cần review trước dùng mẫu. Một lượt kiểm trên sản phẩm cũ trong snapshot không chọn lại sản phẩm đó làm pilot.

Muse tạm dừng; Instagram browser tắt; quyền đăng/DM/tiền theo đúng tài khoản và nội dung đã duyệt. Không đọc DB/profile/AppData thật, không xuất cookie/key/proxy password. Quyền public snapshot ngày 11/11 không mở rộng sang dữ liệu mới. Unknown giữ `null` và phải có nguồn/kỳ đo/SKU. Giữ theme/font, media gốc và receipt.

Nếu có lỗi cần quay lại, lập một revert commit đúng phạm vi, giữ WIP và dữ liệu. Không dùng reset cứng. Sửa/báo blocker rồi tiếp tục phần độc lập. Không cần chờ Claude Pro hoặc duy trì boss phụ để vận hành quy trình này.
