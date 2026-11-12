# T02 · Research: trường quyết định, brief theo công thức video, phát hiện số liệu giả

Phụ thuộc: T01.

## Vấn đề (có bằng chứng trong `data/research/2026-11-11/candidates-1745.json`)
- Cả 10 ứng viên dùng chung một `supplierUrl` showroom (`yiwusealand.com/trending-products-amazon-fba-ecommerce.html`). 10/10 không có giá vốn và ship.
- Ba sản phẩm khác nhau cùng hiện "20.000 sản phẩm trở lên · 4,9/5". Cả ba lấy từ **một** bài review về lược chải lông (atlas770.com). Đây là số liệu cấp trang, không phải tín hiệu của từng sản phẩm.
- Sản phẩm tìm ra là đồ gia dụng phổ thông, không có cảnh "kết quả" để quay. Không khớp công thức video người dùng muốn làm (xem `ops/night/input/formula-seed.json`).

## Mục tiêu
1. Thêm trường optional cho mỗi candidate (mặc định `null` hoặc mảng rỗng; tên do bạn chọn):
   - `verdict`: `"try" | "hold" | "reject" | null`, kèm `verdictReason`.
   - `matchType`: `"exact_sku" | "similar" | "unknown"`, cho biết listing và số liệu là đúng SKU hay sản phẩm tương tự.
   - `visualPayoff`: mô tả một khung hình "kết quả" quay được, ví dụ "dây dắt phát sáng xanh trong đêm".
   - `aiFidelityRisks`: chi tiết dễ bị AI làm sai (chữ/logo, bộ phận nhỏ, vật liệu trong suốt, cơ chế chuyển động).
   - `logisticsFlags`: các cờ `battery`, `liquid`, `fragile`, `sizeFit`, `vehicleFit`, `bulky`, `brandRisk` (boolean hoặc null).
   - `competition`: `{ activeAdsObserved: number|null, similarReels30d: number|null, observedAt, sourceUrl, note }`. Meta Ad Library API không trả quảng cáo thương mại chỉ chạy ở Mỹ, nên đây là số Muse quan sát trên trang web; ghi rõ nguồn, không bịa.
2. Cập nhật prompt `research` trong `lib/lab/muse-workflows.ts` (tiếng Anh, ngắn gọn để giảm lỗi JSON):
   - Ưu tiên sản phẩm có "visual payoff" quay được trong một khung hình, hợp format Problem → Vs → Result → CTA, như đồ phát sáng an toàn ban đêm hoặc đồ cho thú cưng và tình huống cụ thể. Lấy gợi ý từ `ops/night/input/formula-seed.json` (`productTraits`).
   - Mục tiêu giá vốn + ship tới Mỹ ≤ 20 USD. Không có báo giá thì để null, không đoán.
   - Mỗi ứng viên phải có listing riêng. Không dùng một trang showroom chung cho nhiều sản phẩm.
   - Không gắn số liệu của một bài review hoặc một trang cho nhiều sản phẩm.
   - Điền `verdict` và `matchType`; tách rõ đã quan sát, suy luận và chưa biết.
3. Bộ kiểm chất lượng thuần (không gọi mạng), chạy khi merge kết quả Muse và khi hiển thị:
   - Phát hiện `supplierUrl` trùng giữa ≥2 ứng viên khác tên → cảnh báo "Dùng chung trang nguồn".
   - Phát hiện marketEvidence trùng (cùng `value` + `unit` + `sourceUrl`) ở ≥2 ứng viên → đánh dấu chỉ số đó là "Số liệu cấp trang · không dùng để so".
   - Không xóa dữ liệu, chỉ gắn cờ.
4. Brief: `desktop/src/research-runner.mjs` có câu `priority` tiếng Việt. Cập nhật cho khớp mục 2, giữ tối đa 3 lượt và chọn tối đa 3.

## Giữ nguyên
- Giới hạn 10 ứng viên, chọn tối đa 3, cách tiếp tục bằng receipt, chống gửi trùng.
- Batch cũ vẫn parse và hiển thị được.

## Nghiệm thu
- Test: batch `candidates-1745.json` (đọc từ `data/`, không sửa) cho ra cảnh báo dùng chung trang nguồn và đánh dấu đúng ba chỉ số 20000/4.9 là cấp trang.
- Test: candidate có đủ trường mới parse được; candidate cũ parse được.
- Test: prompt research chứa yêu cầu listing riêng, ngưỡng 20 USD, visual payoff; độ dài prompt không tăng quá 40% so với hiện tại (ghi số ký tự trước/sau vào báo cáo).
- `npm test`, `npm run typecheck`, `npm run test:desktop` không hỏng thêm.
