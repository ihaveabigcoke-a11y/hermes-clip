# T-026h — tự review Office mode

Đạt phần Kết quả: thumbnail + đúng ba số, trống là —; nhập nhanh lưu bản đo mới có nguồn/thời điểm, giữ lịch sử. Form đầy đủ/CSV ở Nhập nhiều. Ngưỡng tuyệt đối do người dùng đặt trong Cài đặt, mặc định thiếu thì không kết luận. Sau 48 giờ: đủ cả hai → Đẩy, dưới cả hai → Bỏ, còn lại → Đổi hook. Thiếu thời điểm đăng hoặc số cũng không kết luận. Quy tắc phân nhánh này ghi vào Cần anh chốt, có tooltip.

Đổi hook tạo dự án mới chứa ba prompt mở đầu khác nhau và bản sao nguyên các cảnh/take/đoạn thân đã kiểm, có liên kết nguồn; dự án cũ không sửa. T-026f sẽ tiếp tục từ dự án này tới file MP4 ở lượt thử cuối; chưa đánh dấu luồng render mới đã đạt ở phần h.

Đã kiểm: typecheck; 263 domain + 29 API + 489 desktop = 781 đạt/1 skip. UI đầy/trống/chưa ngưỡng, 6 PNG 1366/1920 ở outputs/T-026h*-ui; 0 request ngoài/pageerror/tràn trang. Kiểm 0 khác null, ghi thêm bản đo, ba nhãn và không nhãn, giữ nguyên dữ liệu trước refresh. Main agent tự review diff/ảnh, không reviewer độc lập. Protected paths/dependencies và assertion cũ không đổi; HEAD/nhánh/stash giữ nguyên khi review.

Chưa kiểm: Insights/tài khoản thật, chất lượng hook, render sau đổi hook (phụ thuộc f). Ảnh và dữ liệu là fixture. Chưa chứng nhận xếp hạng tối ưu cho nhiều tài khoản/đợt; rà lại phép nhóm hook trong T-026i.
