# T13 — bảo toàn tiền tệ khi promote và sửa form

Ngày 12/11/2026, Asia/Saigon. Checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. Chỉ sửa source clone đêm; bản cài Windows trong context chưa được cập nhật. Không commit/push; runner kiểm và commit sau.

## Quyết định và hợp đồng

Chọn phương án ưu tiên: sản phẩm lưu trung thực từng đơn vị tiền. Cách này giữ được báo giá CNY và giả thuyết giá bán USD khi tạo hồ sơ, không cần chặn luồng promote hoặc tự quy đổi tỷ giá.

- Product dùng cùng enum USD/VND/GBP/EUR/CNY với candidate. `costCurrency` và `shippingCurrency` optional, nhận null; thiếu/null kế thừa `currency` giá bán. Bản ghi cũ không cần migration. `fees` và `buffer` vẫn theo tiền tệ chung, được ghi rõ trong form.
- `productFromCandidate` là phép ánh xạ dùng trực tiếp trong thao tác promote. Giữ nguyên `cost`, `shipping`, `price` và tiền tệ mỗi khoản, provenance, ghi chú và trạng thái chưa kiểm mẫu. Null không bị đổi thành 0; ID/revision/action promote và cơ chế chống trùng giữ nguyên.
- `productFinancials` vẫn giữ tiền tệ và xử lý placeholder 0 lịch sử như trước. `unitMargin` kiểm tiền tệ hiệu lực trước phép trừ: khác giữa vốn, ship, bán thì trả null, kể cả khoản 0. Mọi nơi tính biên sản phẩm hiện đều đi qua hàm này. Form/thẻ sản phẩm dùng thông báo “Khác tiền tệ · chưa tính biên”; cổng thương mại không cho đi tiếp với biên khác tiền tệ.
- `formatMoney` định dạng CNY bằng Intl, không quy đổi. Null/undefined/nonfinite hiện “Chưa biết”; 0 đã biết vẫn hiện số tiền.
- Hai form dùng chung lựa chọn tiền tệ từ enum và các select “Tiền tệ giá vốn”, “Tiền tệ ship”. “Theo tiền tệ chung” hiển thị với null/thiếu; khi chọn lại, `RecordForm` lưu null thay cho chuỗi rỗng. Select không nullable vẫn giữ hành vi cũ.

Thay đổi nằm tại `lib/lab/domain.ts`, `components/lab/{app.tsx,operations.tsx,primitives.tsx,currency-fields.ts}`. Không sửa theme/font, dependency, lockfile, dữ liệu đầu vào, snapshot, receipt hay media.

## Bằng chứng kiểm tra

Log ở `outputs/night-t13/` (Git ignore). TEMP/TMP và npm cache đều trỏ vào thư mục này; npm chạy offline, tắt update notifier. Không đọc AppData/profile/DB thật, không mở Electron/Muse/Instagram hay gọi mạng ngoài.

| Lệnh | Baseline | Sau sửa |
| --- | --- | --- |
| `npm test` | 103/103 | 107/107 |
| `npm run typecheck` | Đạt | Đạt |
| `npm run test:api` | 11/11 | 12/12 |
| `npm run test:desktop` | 180 đạt, 1 skip | 183 đạt, 1 skip |
| `node outputs/night-t13/build-check.mjs` | Không chạy | Đạt: UI và 20 module API/domain |
| `git diff --check` | Sạch | Đạt |

- `tests/domain.test.mjs`: promote vốn 36,5 CNY + ship 4,25 USD + bán 19,99 USD giữ từng số/đơn vị, không định dạng vốn thành USD; CNY chung parse được; null giữ nguyên; khác tiền tệ không tính biên dù đủ chi phí hoặc khoản chi bằng 0; sản phẩm USD cũ thiếu hai trường mới vẫn có biên 9; mọi mã tiền tệ được hỗ trợ tính như cũ nếu đồng nhất.
- `tests/operations-api.test.mjs`: tạo batch đã chọn, promote với USD/CNY chung, replay không ghi đè đơn vị, sửa sản phẩm vẫn giữ tiền tệ và biên null. Dùng API với SQLite trong bộ nhớ và fixture runtime.
- `desktop/test/local.test.mjs`: build server từ source bằng `scripts/build-local-server.mjs`, lưu qua HTTP loopback/SQLite fixture riêng và khởi động lại server; dữ liệu và biên null vẫn đúng. Không dùng DB bản cài.
- `desktop/test/product-currencies-ui.test.mjs`: Vite biên dịch source UI vào thư mục tạm riêng, React render tĩnh form/select thật, kiểm CNY/GBP đang chọn và kế thừa null/thiếu. Không dùng browser, profile hoặc thêm loader hooks. Lần chạy đầu fixture thiếu context Dialog, đã bổ sung wrapper Dialog; chạy lại toàn desktop suite đạt. Assertion được giữ nguyên.
- Build-check là bản sao `scripts/build-local.mjs`, chỉ sửa root/output và đường dẫn import compiler để chạy từ `outputs/night-t13/`; output tại `outputs/night-t13/build`. Không chạy nguyên `npm run local:build` vì lệnh đó xóa/ghi `desktop/local-dist`, bị quy tắc đêm cấm. Build cùng source đã đạt; còn cảnh báo font ở lúc bundle và chunk >500 kB. Font được copy sau bundle như script chuẩn.

## Giới hạn, blocker và bước tiếp

Không có blocker cho source T13. Skip OpenMontage do thiếu môi trường tích hợp, giống baseline. Chưa kiểm GUI tương tác/cửa sổ rộng hẹp, thao tác click và lưu form trong Electron, Muse/Instagram thật, hoặc triển khai vào bản cài. Render tĩnh không phải bằng chứng GUI tương tác.

Runner có thể chạy lại các lệnh kiểm chuẩn và `npm run local:build` trong bước kiểm do runner quản lý. Khi được phép kiểm bản cài, dùng fixture vốn CNY/ship USD/bán USD: sửa từng select, chọn “Theo tiền tệ chung”, lưu và mở lại; promote rồi kiểm hồ sơ giữ CNY, hiển thị thông báo khác tiền tệ. Kiểm thêm sản phẩm USD cũ có đủ chi phí để đối chiếu biên cũ.

Checkpoint là diff source/test/tài liệu trên nhánh hiện tại. Không tự sửa sản phẩm đã promote sai trong quá khứ: cần đối chiếu báo giá/nguồn trước khi cập nhật dữ liệu thật. Các đoạn T01 nói form/promote chưa hỗ trợ được thay thế bởi checkpoint này; những giới hạn dịch vụ thật vẫn còn.
