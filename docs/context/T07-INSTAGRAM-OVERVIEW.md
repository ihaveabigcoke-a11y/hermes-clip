# T07 — Instagram theo tài khoản × nội dung, lọc sản phẩm cũ

Checkpoint 12/11/2026 · Asia/Saigon. Checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, sạch trước thay đổi. Một worker; đã đọc AGENTS, README, context 01/02 và checkpoint T06. Bản cài Windows xác định theo context, không mở hoặc truy cập dữ liệu bản cài.

## Thay đổi và hợp đồng

- Bảng tổng quan và khối số liệu sản phẩm thêm **Vào profile**, **Bấm link**. Dùng trường `profileVisits`/`linkClicks` hiện có; tổng chỉ có số khi mọi bài có số hợp lệ. Thiếu một bài thì tổng là null/— và hiển thị độ phủ, không cộng thành tổng một phần hoặc thay bằng 0. Số 0 đã đo vẫn hiện 0.
- **Mở rộng/Thu gọn** ngay trong bảng sản phẩm; cùng component được dùng trong tab Tổng quan của từng sản phẩm. Bảng con gồm tài khoản, content_plan, từ khóa CTA, bảy chỉ số và lần đo. Xếp theo tài khoản rồi tên nội dung, phân trang 10 bài. Bấm nội dung trong màn chi tiết mở đúng plan/tài khoản; có link bài đăng và thời điểm ISO trong thẻ time/tooltip, giờ hiển thị theo Asia/Ho_Chi_Minh.
- `instagramAccountContentRows` dùng các bài đã xuất bản từ `instagramProductSummary`; permalink được khử trùng trước khi chia tài khoản. Giữ lọc nguồn, tài khoản, ngày đo hợp lệ. Quan sát mới nhất theo observedAt rồi updatedAt quyết định số liệu và plan/tài khoản đại diện cho các alias. Job published có snapshot giúp đối soát URL/tài khoản/asset khi record chưa đồng bộ; job cũ thiếu trường vẫn dùng plan.
- CTA đọc từ biến thể T06 của đúng production và đúng sản phẩm: liên kết `productionId`, hoặc `contentPlanId` khi plan chưa có productionId. Ưu tiên bản render khớp asset → variant; nếu là take thì khớp take đã ghim trong hook/body/CTA. Take dùng chung hoặc plan chưa chọn asset chỉ hiện keyword khi mọi variant phù hợp đều có cùng keyword. Thiếu liên kết, thiếu keyword hoặc xung đột → null/—. Không suy từ caption hoặc lấy ngẫu nhiên variant đầu tiên. Đây là metadata đã lưu, không xác nhận CTA thực sự có trong hình/video đã đăng.
- Ghi chú cố định: **So sánh hook chỉ có ý nghĩa trong cùng tài khoản, cùng từ khóa CTA.** Có dưới bảng tổng quan và bảng con, kể cả trạng thái chưa có bài.
- Mặc định ẩn `archived`, ID `local_qa_product`, tên bắt đầu `TEST LOCAL` (bỏ khoảng trắng đầu, không phân biệt hoa/thường). Công tắc **Hiện sản phẩm đã lưu trữ** hiện cả QA; có chú thích. Bộ đếm tổng quan chỉ tính nhóm sản phẩm đang được công tắc cho phép. Trạng thái lưu trong URL `ig_showArchived`; tải lại/quay lại giữ lựa chọn. Màn Instagram nhận cả sản phẩm archived để mở chi tiết khi người dùng chọn; landing vẫn lọc archived như cũ. Không tự ẩn ChomChom/Ruffwear theo tên khi người dùng chưa lưu trữ.
- Màn Sản phẩm **đã có** nút Lưu trữ → modal xác nhận → persist product với `archived: true` và revision, cùng chức năng khôi phục. Không thêm luồng thứ hai, không sửa/xóa media hay record. Chỉ kiểm thao tác này trên fixture trong bộ nhớ.
- Không thêm trường lưu trữ/schema/migration. Records cũ thiếu production/CTA/asset/account/metric tiếp tục hiển thị an toàn. Không thay worker đo, lịch đo, đăng bài, quota, phiên hoặc receipt. Chỉ số Bình luận vẫn là tổng bình luận đã lưu; T07 chưa bổ sung đếm bình luận chứa keyword hay DM.

CSS chỉ điều chỉnh vùng bảng/công tắc và lưới tám chỉ số thành bốn cột ở màn rộng. Kiểm UI phát hiện selector `tbody th` áp nhầm lên header bảng lồng nhau gây phình cột; đã giới hạn selector vào con trực tiếp và đặt vùng cuộn Instagram làm containing block. Không thay font/theme.

## File

- `lib/lab/instagram-summary.ts`
- `components/lab/instagram-overview.tsx`
- `components/lab/instagram-panel.tsx`
- `components/lab/operations.tsx`
- `desktop/src/ui-copy.mjs`
- `app/workbench.css`
- `tests/operations.test.mjs`
- `tests/fixtures/instagram-overview.mjs` (mới)
- `desktop/test/instagram-overview-ui.test.mjs` (mới)
- `scripts/check-instagram-ui.mjs` (mới)
- `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`
- `docs/context/T07-INSTAGRAM-OVERVIEW.md` (file này)
- `ops/night/out/T07-ui-check.json`, `T07-instagram-1920.png`, `T07-instagram-1366.png`, `T07-instagram-800.png`, `T07-instagram-390.png` (mới, fixture)

## Bằng chứng

Baseline: `npm test` **126/126**, TypeScript qua. Kết quả cuối:

| Lệnh | Kết quả |
|---|---|
| `npm test` | **132/132**, không fail/skip |
| `npm run typecheck` | Qua |
| `npm run test:api` | **15/15**, không fail/skip |
| `npm run test:desktop` | **218 đạt, 1 skip** OpenMontage thiếu môi trường, 0 fail |
| `npm run local:build` | Qua; `HERMES_LOCAL_BUILD_DIR=outputs/night-t07/build`, 22 module API |
| `node scripts/check-instagram-ui.mjs` | Qua, không lỗi JS; không gửi request mạng; 1920/1366/800/390 px không tràn trang |
| `git diff --check` | Qua |

Fixture thuần: một sản phẩm, ba tài khoản, hai bài/tài khoản, một bài có cả bảy chỉ số null; quan sát cũ/mới, zero, coverage, approximate, alias permalink, tie observedAt, sai tài khoản, job chưa đồng bộ, liên kết CTA render/take/chung/xung đột/khác sản phẩm/legacy, lọc archived/QA và bất biến đầu vào. Test render source có bốn ca, chạy trong desktop suite; biên dịch Vite SSR, không thêm module.registerHooks.

UI tương tác dùng Chrome headless cài sẵn, dữ liệu giả và thư mục tạm riêng dưới outputs; mọi request trang được fulfill từ file/memory hoặc abort, DNS ngoài bị chặn. Không dùng profile người dùng, không mở Muse/Instagram. Kiểm mở rộng/thu gọn, null/0, công tắc/lưu URL, mở sản phẩm lưu trữ, chọn đúng content/tài khoản, hủy lưu trữ không ghi, xác nhận chỉ đổi cờ của product và giữ toàn bộ records liên quan, mở lại vẫn đủ sáu bài. Một lần ghi fixture trong báo cáo là cập nhật object trong bộ nhớ, không phải lưu trữ dữ liệu người dùng.

Ảnh và số đo: [báo cáo UI](../../ops/night/out/T07-ui-check.json), [1920 px](../../ops/night/out/T07-instagram-1920.png), [1366 px](../../ops/night/out/T07-instagram-1366.png), [800 px](../../ops/night/out/T07-instagram-800.png), [390 px](../../ops/night/out/T07-instagram-390.png). Màn nhỏ cuộn ngang trong bảng.

Log ở `outputs/night-t07/{baseline-0,baseline-1,domain,typecheck,api,desktop,build,ui}.log` (Git ignore). TEMP/TMP, APPDATA/LOCALAPPDATA của tiến trình kiểm tra, npm cache/userconfig/globalconfig đều chuyển vào outputs; npm offline và tắt update notifier. Không đọc AppData thật, không sửa dependency/lockfile, input/task queue, data/evidence hoặc desktop/local-dist. Không commit/push/đổi nhánh.

Các lỗi trong quá trình kiểm đã sửa: test mới giả định formatTime có năm/dấu phân cách cố định và thứ tự attribute cũ của switch; nay kiểm timestamp ISO đầy đủ, định dạng giờ Việt Nam theo Intl và attribute hiện tại. Lỗi UI tràn ngang đã sửa ở source CSS, không nới assertion noPageOverflow. Không xóa/nới test cũ. Build còn cảnh báo kích thước bundle/font URL theo cấu hình hiện hành.

## Giới hạn và tiếp tục

Không có blocker cho T07. Chưa triển khai bản cài Electron, chưa kiểm GUI Windows/DPI thật hay số liệu Insights/CTA trên tài khoản thật. OpenMontage live skip vì thiếu môi trường tích hợp, ngoài phạm vi Instagram. Lưu trữ ở đây chỉ ẩn sản phẩm trong giao diện, không tự hủy lịch đo hay lượt đăng đang chờ.

Chạy lại trong clone bằng PowerShell, dùng output riêng để không ghi desktop/local-dist:

```powershell
$env:HERMES_LOCAL_BUILD_DIR = Join-Path (Get-Location) 'outputs/night-t07/build'
$env:TEMP = Join-Path (Get-Location) 'outputs/night-t07/temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
npm test
npm run typecheck
npm run test:api
npm run test:desktop
npm run local:build
node scripts/check-instagram-ui.mjs
```

Khi chạy qua đêm, giữ thêm cấu hình npm offline/cache và APPDATA/LOCALAPPDATA tạm như mô tả ở trên. Sau runner review/commit, nghiệm thu bản cài theo quyền người dùng: chọn Instagram → Mở rộng sản phẩm → đối chiếu CTA, thời gian đo và permalink; thử công tắc; người dùng tự xác nhận lưu trữ ba sản phẩm cũ. Rollback source bằng revert commit runner rồi build lại; không cần thay dữ liệu/DB/media.
