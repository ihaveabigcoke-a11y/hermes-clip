# T01 — CNY và tiền tệ riêng cho ứng viên nghiên cứu

Ngày: 11/11/2026, Asia/Saigon. Checkout: `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. Chỉ sửa source trong clone task đêm; không chạy hay cập nhật bản cài người dùng. Không commit/push; runner kiểm và commit sau.

## Hợp đồng sau thay đổi

- Candidate nhận USD, VND, GBP, EUR và CNY. `currency` vẫn là tiền tệ giá bán.
- `costCurrency` và `shippingCurrency` optional, chấp nhận null. Thiếu hoặc null nghĩa là kế thừa `currency` chung của bản ghi; không ghi đè số tiền hoặc bổ sung tỷ giá.
- `candidateCurrency(candidate, field)` dùng chung cho việc hiển thị từng khoản và tính tổng vốn + ship. Bảng so sánh và chi tiết vẫn dùng `formatMoney`; số chưa biết vẫn hiện “Chưa biết”.
- `landedCost(candidate)` trả `{amount, currency, reason}`. Chỉ cộng khi đủ cả hai số và tiền tệ hiệu lực giống nhau, không phụ thuộc tiền tệ giá bán. Khi không tính được, amount/currency là null; reason là `thiếu ship`, `thiếu giá vốn` hoặc `khác tiền tệ`. Kiểm tra thiếu số trước kiểm tra tiền tệ. Số 0 đã biết vẫn hợp lệ.
- Prompt research mô tả mã tiền tệ theo từng con số, bỏ ví dụ USD cố định, yêu cầu tiền tệ đúng listing/báo giá và cấm quy đổi/cộng các tiền tệ khác nhau. Với số đã biết, Muse phải ghi rõ mã riêng; chỉ dùng null khi số tương ứng chưa biết.
- Giữ nguyên thuật toán `mergeMuseResearch`, giới hạn số ứng viên/lựa chọn và receipt chống áp dụng trùng.

## Kiểm tra offline

Baseline trước sửa: `npm test` 78/78; `npm run typecheck` đạt.

Sau sửa:

- `npm test`: 84/84 đạt, không fail/skip. Sáu test mới kiểm CNY/các mã cũ, fixture cũ, landed cost, chọn tiền tệ hiển thị, merge/replay nhiều tiền tệ và prompt.
- Fixture chỉ đọc từ `data/research/2026-11-11/all-batches.json`, `candidates-1745.json`, `candidates-earlier.json`: 5 batch trong snapshot tổng; 7 lượt parse batch, 43 lượt parse candidate gồm hai batch lặp ở snapshot riêng. Mọi trường cũ được đối chiếu, không sửa fixture.
- `npm run typecheck`: đạt.
- `npm run test:api`: 10/10 đạt, gồm test mới tạo/sửa candidate có các tiền tệ riêng, giữ shipping null. API dùng SQLite trong bộ nhớ và bộ lưu file giả lập, không dùng DB thật.
- `node outputs/night-t01/build-check.mjs`: đạt; build UI và 17 module API/domain. Script kiểm tra là bản sao của `scripts/build-local.mjs`, chỉ thay biểu thức root/output; đầu ra ở `outputs/night-t01/build`. Không sửa source build hay `desktop/local-dist`. Vite còn cảnh báo đường dẫn font lúc bundle (font được copy ở bước sau) và chunk lớn.
- `git diff --check`: đạt.

TEMP/TMP của test được trỏ vào `outputs/night-t01/tmp`; npm cache nằm dưới `outputs/night-t01`. Khi chạy lại, đặt `npm_config_offline=true` và `npm_config_update_notifier=false`.

## Giới hạn và bước tiếp

Không có blocker cho phạm vi schema/prompt/hiển thị T01. Chưa kiểm UI thật, Muse thật hoặc toàn bộ desktop suite. Không gọi Muse/Instagram, không mở Electron/profile hay đọc dữ liệu bản cài.

Không chạy nguyên lệnh `npm run local:build`: script này xóa/ghi `desktop/local-dist`, bị quy tắc task đêm cấm. Đã kiểm build cùng source với output riêng như trên; runner có thể chạy build chuẩn ở bước kiểm của runner.

Ngoài phạm vi T01: form nhập ứng viên và hồ sơ sản phẩm vẫn dùng lựa chọn/tiền tệ chung cũ. Luồng `promote` trong `components/lab/operations.tsx` chuyển các số trực tiếp sang schema sản phẩm, chưa bảo toàn tiền tệ riêng; sản phẩm cũng chưa nhận CNY. Cần task riêng xử lý form và chuyển ứng viên nhiều tiền tệ sang hồ sơ sản phẩm trước khi sử dụng luồng đó với dữ liệu mới. T01 không thay đổi workflow này hay tự quy đổi các số để đi qua nó.

Checkpoint là diff source và các test trên nhánh hiện tại. Đầu ra kiểm tra trong `outputs/` bị Git ignore. Không thay dữ liệu, receipt, media hay phiên. Bản cài Windows chưa nhận thay đổi; khi được phép triển khai, build từ source rồi kiểm bảng/chi tiết với một ứng viên vốn CNY, ship USD, bán USD và một batch cũ.
