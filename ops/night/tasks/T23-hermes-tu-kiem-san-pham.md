# T23 · Hermes tự kiểm sản phẩm (đưa skill hermes-product-check vào app)

Phụ thuộc: T02, T04, T13, T14 (đã commit trên nhánh này).

## Bối cảnh
- Người dùng muốn Hermes tự làm việc mà skill `.claude/skills/hermes-product-check/SKILL.md` đang làm. Đọc kỹ skill trước khi code.
- Đã có:
  - **Trường quyết định (T02):** `verdict`, `matchType`, `visualPayoff`, `aiFidelityRisks`, `logisticsFlags`, `competition`. Tên thật có thể khác; đọc `lib/lab/operations.ts` để dùng lại, **không tạo trường trùng nghĩa**.
  - **Kiểm listing (T11/T14):** trạng thái `ok/blocked/failed/unavailable`, showroom, giá dạng khoảng.
  - **Tiền tệ riêng cho vốn/ship (T13):** `landedCost` không quy đổi giữa hai loại tiền.
  - **Bảng Nghiên cứu (T04):** badge "≤ 20 USD", trần vốn+ship do người dùng nhập ở launcher.
- Còn thiếu so với skill:
  - so giá bán lẻ ở Mỹ để tính vốn+ship tối đa theo hệ số ×3–4;
  - cờ rủi ro bằng sáng chế/kiểu dáng (`ipRisk`);
  - một trạng thái listing gộp;
  - gợi ý kết luận kèm lý do;
  - câu hỏi gửi nhà cung cấp;
  - link để tự kiểm đối thủ.

## Mục tiêu
1. **Trường mới cho candidate**, đều optional/null, bản ghi cũ vẫn parse:
   - `usRetail: {low, high, currency: 'USD' | null, sources: [{url, title, price, observedAt}] ≤ 4} | null`. URL bắt buộc là `https:`.
   - `ipRisk`: boolean | null, thêm vào nhóm cờ rủi ro hiện có. Kèm `ipNotes` (string, ≤ 600).
   - Form ứng viên cho nhập tay hai trường này.
2. **Prompt research** (`lib/lab/muse-workflows.ts`):
   - Thêm yêu cầu ngắn: 2–3 giá bán lẻ ở Mỹ của **bản generic** (Walmart/Amazon/Chewy…), từ trang đã thật sự mở, kèm URL và ngày.
   - Ghi chú `ipRisk` nếu có hàng gốc mang thương hiệu, hoặc bằng sáng chế dễ trùng kiểu dáng.
   - Giữ số đếm đối thủ là null nếu không đếm được. **Không** để Muse ước lượng số quảng cáo hay số Shorts.
   - Prompt tăng ≤ 10% (ghi số ký tự trước/sau). Lọc kết quả Muse như cách T11 làm, để Muse không ghi đè được kết quả kiểm local.
3. **Module thuần `lib/lab/product-check.ts`:**
   - `listingStatus(candidate)` → `single | showroom | not_found | blocked | unavailable`, gộp từ kết quả kiểm listing và cờ dùng chung trang nguồn.
   - `markupCheck(candidate, ceilingUsd)`:
     - Giá bán lẻ điển hình = trung vị các giá USD trong `sources`, hoặc trung bình `low`/`high`.
     - Vốn+ship tối đa = `[giá/4, giá/3]`.
     - Chỉ so khi vốn+ship cùng là USD. Kết quả: `ok_x4 | ok_x3 | fail | unknown`.
     - Thêm ghi chú nếu `giá/3 < ceilingUsd`: "Giá bán lẻ Mỹ chỉ cho phép vốn+ship tối đa X USD".
     - Không quy đổi tiền.
   - `suggestVerdict(candidate, ceilingUsd)` → `{verdict: try | hold | reject, reasons[], missing[]}`:
     - `reject` khi `markupCheck = fail`.
     - `hold` khi listing không phải `single`, khi `ipRisk` hoặc `brandRisk` là true, hoặc khi thiếu dữ liệu chính.
     - `try` chỉ khi:
       - listing `single`;
       - `matchType = exact_sku`;
       - vốn+ship là USD và ≤ min(trần, giá/3);
       - có `visualPayoff`;
       - không có cờ IP/brand.
     
     Chỉ là **gợi ý**, không ghi đè quyết định người dùng.
   - `supplierQuestions(candidate)` → danh sách câu hỏi tiếng Anh:
     - listing cho đúng mẫu này;
     - giá ở MOQ, theo từng size nếu có size;
     - phí và thời gian ship về Mỹ theo kích thước hộp;
     - có gửi mẫu không;
     - ảnh/video thật;
     - nếu có `ipRisk`: thiết kế khác hàng gốc ở điểm nào.
   - `manualCheckLinks(keyword)` → các URL tự kiểm, chỉ dựng link, không fetch:
     - Meta Ad Library (country=US, keyword);
     - YouTube search `<kw> #shorts`;
     - Amazon, Walmart;
     - Google Patents.
     
     `keyword` được encode an toàn.
4. **UI:**
   - Bảng Nghiên cứu: thêm 1 cột gọn "Bán lẻ Mỹ → vốn tối đa", ví dụ "$24,99 → ≤ $6,25–8,33". Thiếu dữ liệu thì hiện "—".
   - Nút "Kiểm sản phẩm" mở modal/khối chi tiết, dùng class sẵn có:
     - ba phần **Đã quan sát / Suy luận / Chưa biết**;
     - gợi ý kết luận và lý do;
     - câu hỏi nhà cung cấp, có nút sao chép;
     - các link tự kiểm, mở bằng cơ chế mở link ngoài hiện có. Nếu chưa có cơ chế đó thì cho sao chép link.
   - Bảng ở 1366 px không được vỡ. Chụp ảnh 1366 và 1080 vào `ops/night/out/`.

## Nghiệm thu
- Test thuần:
  - đủ các nhánh của `markupCheck`: USD đủ ×4, chỉ đủ ×3, fail, khác tiền tệ → unknown, thiếu giá bán lẻ → unknown;
  - `suggestVerdict`: try, hold vì showroom, hold vì ipRisk, reject;
  - `listingStatus`: đủ 5 trạng thái;
  - câu hỏi nhà cung cấp có câu thiết kế khi có `ipRisk`;
  - link được encode, không có `javascript:`.
- Test parse: candidate cũ; candidate có trường mới; Muse không ghi được trường kiểm local.
- Test prompt: chứa yêu cầu giá bán lẻ Mỹ và giữ null cho số đối thủ; độ dài tăng ≤ 10%.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
