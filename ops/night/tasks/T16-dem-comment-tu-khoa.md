# T16 · Đếm comment theo từ khóa CTA (tín hiệu muốn mua)

## Bối cảnh
- CTA của format video là "Comment LED / RUN / HELP…". Người dùng đo bằng comment có từ khóa, DM và chia sẻ.
- Hiện app chỉ có tổng số comment từ Insights. `classifyComment` trong `lib/lab/domain.ts` vẫn là quy tắc cũ cho sản phẩm tóc ("tóc xoăn").
- T06 có thể đã thêm `ctaKeyword` cho production hoặc variant. Nếu chưa có, thêm `ctaKeyword` optional vào `content_plan`.
- Chưa đọc được nội dung comment tự động. Đêm nay **không** gọi Instagram.

## Mục tiêu
1. Hàm thuần `countKeywordComments(comments, keyword)`:
   - Không phân biệt hoa thường, bỏ dấu câu/emoji.
   - Khớp từ đứng riêng ("LED", "led!", "LED 🙏") nhưng không khớp khi chỉ là một phần của từ khác ("ledger").
   - Trả về `{total, matched, matchedUniqueUsers, examples[≤5]}`.
2. Trong chi tiết bài đăng (Instagram panel), thêm ô **"Dán comment"**:
   - Người dùng dán text copy từ Instagram, mỗi dòng một comment, nếu có thì dạng "username comment".
   - App lưu bản đo có nguồn `manual_paste` và thời điểm, rồi tính số khớp từ khóa.
   - Không ghi đè số liệu Insights. Null khác 0.
3. Bảng tài khoản × nội dung (T07, nếu đã có) thêm cột "Comment từ khóa" và "Tỷ lệ comment từ khóa / lượt xem". Không có dữ liệu thì hiển thị "—".
4. Cập nhật hoặc thay `classifyComment` cho ngách mới (hỏi giá, hỏi ship, hỏi link, từ khóa CTA), giữ tương thích nơi đang gọi.

## Nghiệm thu
- Test thuần cho khớp từ khóa (dương, âm, emoji, hoa thường, trùng người dùng).
- Test lưu và đọc bản đo `manual_paste`, không đè Insights.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
