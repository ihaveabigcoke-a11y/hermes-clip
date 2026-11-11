# T02 — Quyết định, công thức video và chất lượng nghiên cứu

Ngày 11/11/2026, Asia/Saigon. Checkout riêng `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, sau T01. Chỉ một worker; không commit/push, không truy cập bản cài, AppData, phiên thật hay dịch vụ ngoài. Source bản cài được xác định theo context, không mở để đối chiếu trực tiếp trong task đêm.

## Hợp đồng và hành vi

- Candidate thêm `verdict` (`try|hold|reject|null`), `verdictReason`, `matchType` (`exact_sku|similar|unknown|null`), `visualPayoff`, `aiFidelityRisks`, `logisticsFlags`, `competition`. Các trường mới có thể thiếu; mặc định null hoặc mảng rỗng. Bản ghi cũ không tự được suy thành đúng SKU hay không có cạnh tranh.
- Các cờ logistics là `battery`, `liquid`, `fragile`, `sizeFit`, `vehicleFit`, `bulky`, `brandRisk`; từng cờ có thể là true, false hoặc null. Thiếu toàn bộ nhóm thì nhóm là null; thiếu cờ trong nhóm thì cờ là null.
- Competition chứa `activeAdsObserved`, `similarReels30d`, `observedAt`, `sourceUrl`, `note`. Hai số là số nguyên không âm hoặc null; có số (kể cả 0) phải có URL HTTPS và thời điểm quan sát. Không quy đổi tiền tệ, không thay unknown thành 0.
- `annotateResearchQuality` trong `lib/lab/research-quality.ts` là hàm thuần, không gọi mạng và không sửa input. Nguồn hàng dùng chung bởi ít nhất hai tên khác nhau được gắn `qualityWarnings: ["shared_supplier_url"]`. Chỉ số trùng `value + unit + sourceUrl` trên ít nhất hai candidate được gắn `pageLevel: true`.
- So URL bỏ fragment/dấu slash cuối nhưng giữ query nhận dạng SKU; tên được chuẩn hóa khoảng trắng/hoa thường. Kỳ đo và nhãn không tham gia khóa chỉ số theo yêu cầu T02, nhưng vẫn được giữ nguyên. Chỉ số lặp trong cùng một candidate không tự làm phát sinh cảnh báo.
- Khi dữ liệu nguồn được sửa, chỉ cờ dẫn xuất được tính lại; giá trị, nhãn, nguồn, kỳ đo và ghi chú gốc không bị xóa. Lần kiểm lại không đổi gì giữ nguyên object/array, tránh ghi lại receipt vô ích.
- Merge áp dụng kiểm tra trên toàn batch, gồm các phần từ receipt trước; replay receipt cũ chưa có cờ chỉ bổ sung cờ một lần. Giữ giới hạn 10 ứng viên, 3 lựa chọn, 3 lượt và cơ chế chống gửi/nhập trùng.
- UI kiểm toàn bộ batch trước khi lọc “Đã chọn”. Bảng và chi tiết hiện “Dùng chung trang nguồn” / “Số liệu cấp trang · không dùng để so”; chỉ số gốc vẫn đọc được. Các trường quyết định/rủi ro/cạnh tranh hiện trong chi tiết, không thêm cột lớn, không đổi theme/font.

## Prompt và brief

Đọc `ops/night/input/formula-seed.json`, dùng `productTraits`: cảnh kết quả trong một khung hình, phát sáng ban đêm/thú cưng/chạy bộ/đạp xe, nhẹ và không thương hiệu; tránh phụ thuộc size/đời xe, cồng kềnh và claim khó chứng minh. Pin/chất lỏng được ghi cờ, không tự loại toàn bộ.

Research prompt tiếng Anh yêu cầu listing riêng, không dùng chung showroom, không gán số liệu một bài review cho nhiều sản phẩm; mục tiêu vốn + ship Mỹ ≤ 20 USD nhưng phải có báo giá đúng SKU/quantity. Thiếu báo giá giữ null. Yêu cầu tách quan sát, suy luận, chưa biết và khai báo các trường mới. Competition là số Muse quan sát trên website, có nguồn/ngày/phạm vi; nhắc giới hạn Meta Ad Library API với quảng cáo thương mại chỉ chạy ở Mỹ. Không có lời gọi API cạnh tranh mới.

Độ dài `museTaskPrompt('research', {})`, gồm suffix và JSON context: **3.314 → 3.537 ký tự**, tăng **223 ký tự / 6,73%**, dưới 40%. Test cố định baseline 3.314 để ngăn tăng quá mức. Brief `priority` tiếng Việt trong runner theo cùng tiêu chí và nhắc tối đa 3 lượt/chọn tối đa 3; không đổi thuật toán quota.

## Bằng chứng offline

Baseline trước sửa: `npm test` 84/84; `npm run typecheck` đạt; `npm run test:desktop` 152 đạt, 1 skip, 0 fail.

Sau sửa:

- `node --experimental-strip-types --test tests/operations.test.mjs`: 23/23 đạt. Có 5 test mới cho schema/default/null/0, snapshot thật chỉ đọc, chất lượng và tính bất biến, merge/replay nhiều receipt, prompt và độ dài.
- `npm test`: 89/89 đạt, 0 fail/skip.
- `npm run typecheck`: đạt.
- `npm run test:api`: 10/10 đạt, SQLite fixture trong bộ nhớ, không phải DB người dùng.
- `npm run test:desktop`: 153 đạt, 1 skip, 0 fail. Test mới giả lập ba phản hồi Muse, kiểm brief, parent receipt, giới hạn lượt, lưu trường mới/cờ qua API và SQLite tạm, resume không gửi lần thứ tư. Test OpenMontage thật vẫn skip vì thiếu biến cấu hình, như baseline.
- Research runner test nạp hai module research/validation từ source TypeScript bằng resolver cục bộ trong tiến trình test, tránh kiểm nhầm `local-dist` cũ. Không thay assertion cũ. Các module API desktop khác vẫn dùng build.
- `node outputs/night-t02/build-check.mjs`: đạt, UI và 18 module API/domain. Script sao nguyên script build hiện tại, chỉ thay root/output đã kiểm nằm trong `outputs/night-t02/build`; không ghi `desktop/local-dist`. Vite còn cảnh báo đường dẫn font lúc bundle (font được copy sau) và chunk lớn như trước.
- Chạy thêm `npm run test:desktop` với `NODE_OPTIONS=--import file:///C:/HermesNight/hermes-clip/outputs/night-t02/test-build-register.mjs` để trỏ các module API biên dịch sang build riêng: 153 đạt, 1 skip, 0 fail. Research fixture vẫn đọc source như trên; không gọi dịch vụ ngoài.
- `node outputs/night-t02/render-check.mjs`: render React SSR offline của component thật từ snapshot cũ, kiểm 10 cảnh báo nguồn chung, 6 cảnh báo cấp trang trong hai chỉ số đầu mỗi hàng, unknown vẫn hiện “Chưa biết”, snapshot không bị mutate. Không mở browser hay tải ảnh nguồn. HTML tại `outputs/night-t02/research-render.html`.
- `git diff --check`: đạt.

Fixture `data/research/2026-11-11/candidates-1745.json` không sửa: 10/10 ứng viên bị cảnh báo nguồn showroom. `20000` và `4.9` ở đúng ba ứng viên chỉ số 0, 1, 3 (brush, bathing kit, gloves) được gắn cờ: 6 mục số liệu. Ngoài ra `83 đánh giá` và `1,5 USD` cùng nguồn pet-wipe-gloves ở ứng viên 1 và 3 cũng trùng đúng khóa, nên có thêm 4 mục được gắn cờ. Tổng 10 mục bị cờ; các mục khác không bị gắn nhầm. Tất cả giá vốn/ship null của fixture còn nguyên.

## Checkpoint, giới hạn và cách tiếp tục

Không có blocker triển khai source T02. Chưa kiểm GUI Windows, mở modal/lọc bằng chuột, Muse thật, listing/giá hay số cạnh tranh thật. Cảnh báo chỉ phát hiện trùng theo quy tắc, không kết luận nguồn gian lận và không xác minh độ đúng của số liệu không trùng. Không sửa dữ liệu/receipt/media/phiên, không gửi request ra ngoài.

TEMP/TMP nằm tại `outputs/night-t02/tmp`; npm cache tại `outputs/night-t02/npm-cache`, `npm_config_offline=true`, `npm_config_update_notifier=false`. Logs/build/script kiểm tra nằm trong `outputs/night-t02/` bị Git ignore. Không chạy nguyên `npm run local:build` vì script xóa/ghi `desktop/local-dist`, bị quy tắc đêm cấm; build tương đương đã kiểm ở output riêng.

Runner có thể kiểm diff, chạy lại các lệnh và commit theo quy trình đêm. Khi được phép triển khai, build chuẩn từ source rồi nghiệm thu bảng/chi tiết trên Windows với batch cũ và candidate đủ trường mới. Nghiệm thu Muse thật phải theo quota/receipt hiện có; T02 không cấp quyền gửi thử hoặc reset đợt. Giới hạn promote nhiều tiền tệ ở checkpoint T01 vẫn ngoài phạm vi này.
