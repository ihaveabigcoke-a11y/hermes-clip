# T04 — so sánh 10 ứng viên, chọn và tạo hồ sơ

Ngày 12/11/2026. Checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. Đây là source clone đêm; không triển khai vào bản cài Windows. Đã đọc README, AGENTS và context 01/02. Không truy cập dữ liệu bản cài, phiên người dùng hoặc dịch vụ Muse/Instagram.

## Thay đổi

- Bảng có ảnh 64 px, tên tối đa hai dòng; SKU, vốn + ship, giá bán giả định, cảnh kết quả một dòng, cờ rủi ro, thử/giữ/loại và cảnh báo T02. Một nút Xem; thumbnail cũng mở cùng modal. MOQ, quốc gia, phân tích dài, số liệu/nguồn/kỳ đo vẫn trong modal. Bảng cuộn ngang trên cửa sổ nhỏ; giữ theme/font.
- Dùng `landedCost` T01. Badge ≤ 20 USD gồm đúng 20 và số 0 đã biết; > 20 USD khi vượt. Thiếu khoản hoặc không so được bằng USD → Chưa đủ số, giữ số và tiền tệ từng khoản, không quy đổi. Ngưỡng so sánh bảng cố định 20 USD theo task; ngân sách form là tiêu chí riêng của lượt nghiên cứu mới.
- Độ đầy đủ tính trên toàn bộ đợt, kể cả khi lọc Đã chọn. Đếm vốn, ship, exact_sku, listing riêng, chỉ số có nguồn/ngày/kỳ đo không bị T02 đánh dấu cấp trang. Mẫu số là số ứng viên thực có, đầy đợt là 10. Dòng này luôn dùng màu trung tính.
- Listing riêng là dấu hiệu theo dạng đường dẫn product/item/offer/dp hoặc kết quả đọc cùng URL có bộ đếm đáng tin bằng 1; loại URL dùng chung/showroom đã nhận diện. UI ghi rõ đây chưa phải xác minh SKU/báo giá. Không suy rằng một URL độc nhất bất kỳ là listing riêng.
- Checkbox truyền trạng thái mong muốn, không toggle mù. Lưu batch với revision trước rồi gọi `promote` bằng `researchProductId`. Lặp chọn giữ cùng ID và không ghi đè hồ sơ đã sửa. Bỏ tick chỉ lưu selectedIds. Giới hạn 3 vẫn ở UI, hàm thuần và schema/API. Chế độ mẫu cũng trả hồ sơ cũ khi promote lặp.
- CAS lỗi dừng trước promote. Promote lỗi giữ lựa chọn, báo tải lại để đối soát; ứng viên đã chọn thiếu hồ sơ có nút Hoàn tất chọn. Nếu hồ sơ đã được tạo nhưng mất phản hồi, tải lại nhận đúng hồ sơ đó, không tạo ID khác/rollback/xóa.
- Một nút chính Bắt đầu nghiên cứu; tạo đợt thủ công đổi thành Tạo đợt nhập tay, nút phụ. Tiêu chí textarea + ngân sách mặc định 20 USD + ngách/đối tượng + loại trừ mặc định tiếng Anh. Ghép thành query tối đa 1500 ký tự, chặn quá giới hạn thay vì cắt mất tiêu chí. Prompt chung cho phép ngân sách người dùng thay mặc định. Retry chưa rõ kết quả giữ cả requestId và query, khóa sửa tiêu chí trong lúc đối soát. Không thay quota, runner hay receipt.

## Kiểm tra

Baseline: domain 121/121; API 14/14; desktop 212 đạt, 1 skip OpenMontage. Không nới hoặc bỏ assertion cũ.

| Lệnh | Kết quả T04 |
|---|---|
| `npm test` | 126/126 |
| `npm run test:api` | 15/15, SQLite fixture trong bộ nhớ |
| `npm run test:desktop` | 214 đạt, 1 skip OpenMontage, 0 fail |
| `node --test desktop/test/research-sources-ui.test.mjs` | 8/8 sau lần sửa UI cuối |
| `npm run typecheck` | Qua |
| `npm run local:build` | Qua với `HERMES_LOCAL_BUILD_DIR=outputs/t04-build`; 22 API modules |
| `node scripts/check-research-ui.mjs` | UI build offline; hàng tối đa 108,6875 px ở 1920×1080; không lỗi JS |
| `git diff --check` | Qua |

Test thuần bao gồm null/undefined/0, CNY/khác tiền tệ, ngưỡng 20, số liệu cấp trang, listing dùng chung, giới hạn 3, chọn lặp, CAS lỗi, promote chưa rõ phản hồi, query quá dài và ngân sách tùy chỉnh. API test gọi đúng route promote, giữ hồ sơ đã sửa qua chọn lặp/bỏ chọn/chọn lại. UI fixture kiểm thao tác chọn, giới hạn, lọc, modal, mất phản hồi sau khi đã tạo hồ sơ, lỗi trước khi tạo rồi Hoàn tất chọn, cùng requestId/query khi retry.

Ảnh từ build: [bảng 1080p](../../ops/night/out/T04-research-table-1080.png), [form 1080p](../../ops/night/out/T04-research-form-1080.png), cùng ảnh rộng 1366/800/390. [Số đo UI](../../ops/night/out/T04-ui-check.json). Screenshot dùng 10 ứng viên giả lập và ảnh SVG ghi FIXTURE; API/IPC chỉ giả lập trong bộ nhớ, mọi request trang được phục vụ từ file/fixture hoặc chặn. Chrome cài sẵn chạy headless với thư mục tạm riêng trong outputs, không dùng profile người dùng. Không thêm dependency hoặc module.registerHooks.

## Chưa kiểm chứng và chạy tiếp

Chưa kiểm giao diện thật trên bản cài Electron với dữ liệu người dùng, Windows DPI khác, Muse/Instagram thật hoặc chất lượng listing thực. Skip OpenMontage vì thiếu môi trường tích hợp như baseline. Build vẫn có cảnh báo cỡ bundle/font giải quyết lúc chạy; font local trong bản build đã tải trong kiểm UI. Không có blocker cho phạm vi source T04.

Chạy lại từ root clone bằng PowerShell:

```powershell
$env:TEMP = Join-Path (Get-Location) 'outputs/t04-temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path (Get-Location) 'outputs/npm-cache'
$env:npm_config_update_notifier = 'false'
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
$env:HERMES_LOCAL_BUILD_DIR = Join-Path (Get-Location) 'outputs/t04-build'
npm run local:build
node scripts/check-research-ui.mjs
```

Sau review source, kiểm bản cài theo quyền người dùng và đối soát hồ sơ cũ/receipt trước khi thử một lượt nghiên cứu thật. Không tự chạy dịch vụ hoặc gửi lại yêu cầu chưa rõ trạng thái.
