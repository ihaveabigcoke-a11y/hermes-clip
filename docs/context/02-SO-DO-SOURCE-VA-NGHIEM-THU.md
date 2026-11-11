# Hermes Clip — bản đồ source để đưa đề xuất về Codex

Snapshot nguồn lấy từ bản cài Windows, không phải bản Product Lab v10 cũ trong lịch sử ChatGPT. Các đường dẫn dưới đây tương đối với root source; trong ZIP root đó là thư mục `source/`.

## Bản đồ thay đổi

| Việc muốn đánh giá | Đọc ở đâu | Hợp đồng cần giữ |
|---|---|---|
| Điều hướng, màn chính | components/lab/app.tsx, desktop/ui/main.tsx | Route, lựa chọn sản phẩm, dữ liệu thật/mẫu |
| Soạn, duyệt, cảnh và phiên bản | components/lab/production.tsx, production-desk.tsx; lib/lab/production.ts | Revision, duyệt snapshot, không chạy nháp khi chưa duyệt |
| Hàng đợi | components/lab/queue-board.tsx; lib/lab/queue-view.ts | Cần xử lý khác lịch sử; gửi không rõ phải đối soát |
| Thư viện và preview | components/lab/media-preview.tsx; lib/lab/media-catalog.ts, media-organization.ts; desktop/local/thumbnails.mjs | File gốc bất biến, bản chính/phiên bản, thumbnail không nhân bản video |
| Nghiên cứu 10 sản phẩm | components/lab/research-launcher.tsx, research-candidates.tsx; desktop/src/research-runner.mjs | Chạy nền, tối đa 3 lượt, chọn tối đa 3 ứng viên, tiếp tục cùng receipt |
| JSON và số liệu nghiên cứu | lib/lab/muse-workflows.ts, operations.ts | Chống gộp nhầm showroom URL, unknown=null, số liệu có nguồn/kỳ/phạm vi |
| Instagram tổng quan theo sản phẩm | components/lab/instagram*.tsx; lib/lab/instagram-summary.ts | Gộp đúng sản phẩm, bản đo mới nhất mỗi bài, không cộng trùng permalink |
| Instagram browser/đăng | desktop/src/instagram.mjs, instagram-browser.mjs, instagram-adapter.mjs | Snapshot tài khoản/video/caption, một lượt Share, đối soát khi không rõ |
| Đo Insights | desktop/src/instagram-metrics.mjs, instagram-insights.mjs; desktop/local/instagram-workspace.mjs | Phân biệt null/0, nguồn/thời điểm đo, không đăng bài trong lượt đo |
| Muse và profile | desktop/src/worker.mjs, muse.mjs, muse-chat.mjs, muse-quota.mjs | Quota dùng chung, khóa browser, phiên riêng, không gửi lặp |
| VPN/proxy | desktop/src/touch-vpn.mjs, proxy.mjs | Giữ cookies/phiên, cấu hình mã hóa, không đồng thời proxy và VPN |
| Electron/IPC/local API | desktop/src/main.mjs, preload.cjs; desktop/local/server.mjs, runtime.mjs; app/api/* | Origin/session, kiểm input, không mở IPC tùy ý |
| DB và nhập file | desktop/src/store.mjs; desktop/local/import-worker.mjs; app/api/assets, production, lab | CAS/revision, ownership, idempotency, receipt và lịch sử |
| Dung lượng | desktop/src/storage-policy.mjs; desktop/local/server.mjs, thumbnails.mjs | Hardlink/checksum/file bất biến; chỉ dọn cache/tạm đã biết, không xóa dữ liệu |
| Render/tích hợp | desktop/src/media.mjs, integrations.mjs, montage_bridge.py | FFmpeg/ffprobe, checksum, kiểm định dạng/tỷ lệ/thời lượng, giữ bản xuất |
| Typography/theme/copy | app/globals.css, workbench.css, studio.css, typography.css; desktop/src/ui-copy.mjs; DESIGN.md | Giữ font/theme khi không có yêu cầu đổi; nhãn thống nhất và đủ dấu |

Một số tên file/cụm wildcard cần kiểm lại trong MANIFEST.json. Không bịa số dòng; source có thể thay đổi sau snapshot.

## Luồng dữ liệu

React UI → desktop-client/preload IPC → worker/chat/research/Instagram → Playwright profile có đăng nhập → dịch vụ ngoài. Phản hồi/receipt đi vào SQLite; file tải được kiểm rồi nhập qua local API vào asset/cảnh. Thumbnail là dữ liệu tái tạo; video/ảnh gốc và lịch sử là dữ liệu cần giữ.

Web/domain API nằm dưới app/api và lib/lab. `scripts/build-local.mjs` dựng UI vào `desktop/local-dist/ui` và biên dịch API/domain sang MJS dùng bởi local server. Đọc source hiện hành, không sửa trực tiếp file build rồi coi đó là bản sửa bền vững.

## Source đã đưa vào bộ này

ZIP có source app/components/lib/hooks/drizzle/docs/scripts/tests/vendor/public, desktop/src/local/ui/test, manifests và lockfiles. Không có node_modules, integrations venv, Chrome/Electron binary, FFmpeg binary, local-dist, cache, backup, AppData hoặc media thật. SOURCE-*.txt chứa mã/tài liệu dạng đọc; seed JSON, lockfiles lớn và tài nguyên binary chỉ có trong ZIP. Danh sách chính xác ở MANIFEST.json.

`scripts/run-codex.mjs` và một số tài liệu cũ có mã/hướng dẫn runner từ lịch sử. Sự tồn tại của chúng không cho phép khởi chạy multi-agent. Quyết định mới nhất của người dùng là một main agent.

## Cách chạy và kiểm tra trên Windows

Trên máy hiện hành, mở `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local/START-HERMES-CLIP.cmd`. Không cần cài lại dependency chỉ để tiếp tục sửa.

Với bản source mới giải nén, cần Node >=24, dependency root theo pnpm-lock.yaml, dependency desktop theo package-lock.json, Chromium/Electron và FFmpeg/ffprobe. Có thể tham khảo các lệnh sau sau khi đọc scripts; bản source gọn chưa được nghiệm thu cài sạch trên máy khác:

```powershell
pnpm install --frozen-lockfile
npm run local:build
cd desktop
npm ci
npm run browser:install
npm start
```

FFmpeg/ffprobe đặt trên PATH hoặc `desktop/tools/ffmpeg/bin`. Agent Reach/OpenMontage dùng cấu hình và venv riêng; không có trong source ZIP. Source này không chứa phiên đăng nhập, vì vậy cloud/snapshot mới không được báo Muse/Instagram đã kết nối chỉ dựa vào bằng chứng từ máy gốc.

Các nhóm kiểm tra:

```powershell
npm test
npm run test:api
npm run test:desktop
npm run test:codex
npm run typecheck
npm run local:build
```

Một số test tích hợp cần đường dẫn Python/OpenMontage/Agent Reach từ cấu hình máy. 248 test đạt trong môi trường bản cài ngày 11/11; không coi đây là lời đảm bảo các test tự chạy được trong mọi môi trường. Khi thiếu dependency/GUI/tài khoản, ghi rõ blocker và vẫn chạy phần độc lập. Không sửa assertion để che lỗi.

## Bằng chứng và kiểm chứng ở lần sửa sau

`evidence/` trong ZIP chứa kết quả suite, GUI, download/import kiểm thử, idle và bản đối chiếu cuối. Đó là bằng chứng lịch sử ngày 11/11, không phải kết quả test mới của ChatGPT.

Codex cần xác nhận đúng root đang chạy, đọc hướng dẫn tại chỗ, đo baseline, giữ dữ liệu và tạo checkpoint. Sửa source trước rồi build; kiểm tra các thay đổi thích hợp với phạm vi. Đối với UI cần mở app ở cửa sổ rộng/nhỏ; đối với worker cần kiểm trạng thái trước/sau, receipt và file thật. Không restart app khi còn tác vụ đang chạy nếu chưa có cách giữ/đối soát phù hợp.

Đầu ra của ChatGPT nên có: vấn đề cụ thể; bằng chứng hiện có; lợi ích; phạm vi file dự kiến; giữ nguyên gì; tiêu chí nghiệm thu có thể đo; cách test; quyết định còn cần người dùng; rủi ro và rollback. Không chỉ đưa các câu như “tối ưu toàn bộ”, “làm giống Meosu hoàn toàn” hoặc “xong hết dự án”.
