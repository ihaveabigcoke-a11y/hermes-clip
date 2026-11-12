# T07 · Instagram tổng quan: đo theo tài khoản × nội dung, ẩn sản phẩm cũ

## Bối cảnh
- Người dùng sẽ đăng 1 sản phẩm trên 3 tài khoản, mỗi tài khoản một nội dung khác nhau. Chỉ số chính: comment có từ khóa, DM, chia sẻ, lượt bấm link tới landing pre-order.
- `lib/lab/operations.ts` đã có `profileVisits`, `linkClicks`. `components/lab/instagram-overview.tsx` và `instagram-panel.tsx` chỉ hiển thị xem/thích/bình luận/lưu/chia sẻ ở mức sản phẩm.
- Ba sản phẩm cũ (Treat Trader `local_qa_product`, ChomChom, Ruffwear) sẽ bị người dùng lưu trữ. Đó là hàng có thương hiệu, chỉ dùng để kiểm kỹ thuật.

## Mục tiêu
1. Bảng tổng quan thêm cột "Vào profile" và "Bấm link". Null hiển thị "—", không đổi thành 0.
2. Mở rộng một sản phẩm: bảng con theo tài khoản × nội dung (content_plan). Có từ khóa CTA nếu đã lưu (T06), số liệu mới nhất mỗi bài, thời điểm đo. Không cộng trùng permalink (giữ `instagram-summary.ts`).
3. Ghi chú cố định dưới bảng: "So sánh hook chỉ có ý nghĩa trong cùng tài khoản, cùng từ khóa CTA."
4. Mặc định ẩn sản phẩm `archived` và sản phẩm QA (`local_qa_product`, tên bắt đầu "TEST LOCAL"). Có công tắc "Hiện sản phẩm đã lưu trữ".
5. Nếu chưa có thao tác lưu trữ sản phẩm trong màn Sản phẩm, thêm nút "Lưu trữ" có xác nhận (đặt `archived: true`, không xóa media hay record). Không tự lưu trữ dữ liệu nào trong đêm.

## Nghiệm thu
- Test thuần cho gộp theo tài khoản × nội dung với fixture có 1 sản phẩm, 3 tài khoản, 2 bài mỗi tài khoản, một bài có số liệu null.
- Test lọc archived/QA.
- `npm test`, `npm run typecheck`, `npm run local:build` qua.
