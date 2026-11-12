# T01 · Research: hỗ trợ CNY và tiền tệ riêng cho từng con số

## Vấn đề (có bằng chứng)
- `lib/lab/operations.ts` → `candidateSchema.currency` chỉ nhận `USD | VND | GBP | EUR`. Nguồn hàng ưu tiên là Trung Quốc (1688/Alibaba/AliExpress) nên giá thường bằng CNY.
- `lib/lab/muse-workflows.ts` → prompt `research` có ví dụ JSON ghi cứng `"currency":"USD"`, mâu thuẫn với câu "Price currency must match the listing".
- `data/research/2026-11-11/data-quality.json` ghi rõ giới hạn này.
- Một ứng viên có thể có giá vốn bằng CNY, ship bằng USD và giá bán giả định bằng USD. Hiện chỉ có một trường `currency` cho cả ba.

## Mục tiêu
1. Nhận `CNY`, giữ nguyên các mã đang hỗ trợ.
2. Cho phép giá vốn, ship và giá bán mang tiền tệ riêng. Thêm trường optional, ví dụ `costCurrency` và `shippingCurrency`; giá bán dùng `currency` như hiện tại. Bạn tự chọn tên trường hợp lý. Bản ghi cũ không có trường mới thì dùng `currency` chung.
3. Sửa ví dụ JSON trong prompt research để không gợi ý USD cố định. Yêu cầu Muse ghi tiền tệ đúng như listing cho từng con số.
4. Thêm hàm thuần, ví dụ `landedCost(candidate)`. Hàm trả về tổng giá vốn + ship **chỉ khi** cả hai không null và cùng tiền tệ. Nếu khác tiền tệ hoặc thiếu số thì trả `null` kèm lý do: `"khác tiền tệ"` hoặc `"thiếu ship"`. Không quy đổi tỷ giá.
5. UI đang dùng `formatMoney` cho giá vốn, ship, giá bán (`components/lab/research-candidates.tsx`): hiển thị đúng tiền tệ của từng con số.

## Giữ nguyên
- Parse được mọi batch cũ trong `data/research/2026-11-11/*.json` (dùng chúng làm fixture test, không sửa file gốc).
- `mergeMuseResearch` và các kiểm tra hiện có.

## Nghiệm thu
- Test: một candidate CNY parse được. Candidate cũ không có trường mới parse được và giữ nguyên giá trị.
- Test `landedCost`: cùng tiền tệ → tổng đúng; khác tiền tệ → null + lý do; thiếu ship → null + lý do.
- Test prompt research không còn chuỗi `"currency":"USD"` cố định.
- `npm test`, `npm run typecheck` qua.
