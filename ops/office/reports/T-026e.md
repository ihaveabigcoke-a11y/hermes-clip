# T-026e — tự review Office mode

Đạt phần source: lưới ảnh, form sáu ô, mã tự sinh/sửa được và kiểm trùng trong giao dịch; giữ hồ sơ cũ, revision và dữ liệu null. Chín tab nằm trong Chi tiết đóng mặc định. Link/ghi chú video đối thủ và đường dùng nhịp từ bản rea-video có sẵn. Không xoá record.

Đã kiểm: typecheck; 261 domain + 29 API + 489 desktop đạt, 1 skip live montage. UI đầy/trống 1366/1920 ở outputs/T-026e-ui và outputs/T-026e-empty-ui; sáu nhóm trường, lưu thật qua API trên workspace fixture, ảnh tải thành công, không tràn/ngoại mạng/pageerror. Tự xem ảnh, diff; không reviewer thứ hai. Không hạ assertion; data/evidence/dependencies không đổi. HEAD/nhánh/stash không đổi trong lúc review.

Chưa kiểm: nguồn hàng/tài khoản thật, chất lượng SKU. Đường đọc nguồn hiện có chỉ tìm kiếm, chưa có endpoint đọc listing để điền hồ sơ; dùng dán nội dung có nhãn (không suy giá/ship). Giữ giới hạn này ở Cần anh chốt, không gọi dịch vụ ngoài. Đo toàn bộ chữ/shell và các màn khác ở T-026i.
