# T-026g — tự review Office mode

Đạt: cột tài khoản động; Chia đều luân phiên ba hook; kéo video nguồn vào cột tạo nháp mới, giữ record cũ; không trùng cùng hook/tài khoản khi bấm lại. Có Tải MP4, Sao chép caption kèm UTM, lưu URL đã đăng tay và giờ Việt Nam. Tên nháp/utm_content khớp mẫu; CTA, giá, Link mua cùng lượt không đổi. Nút cũ nằm trong Chi tiết.

Đã kiểm: typecheck; 262 domain + 29 API + 489 desktop = 780 đạt, 1 skip live. Fixture UI năm cột, chia 5 nháp/bấm lại vẫn 5, kéo thêm hook tạo bản thứ 6 không trùng; lưu URL và timestamp đúng +07. Bốn PNG 1366/1920 đầy/trống ở outputs/T-026g-ui và T-026g-empty-ui; 0 pageerror/ngoại mạng/tràn trang. Main agent tự đọc diff và ảnh, không reviewer độc lập; HEAD/nhánh/stash giữ nguyên trong review. Protected paths/dependencies không đổi, không hạ assertion.

Chưa kiểm: clipboard và tải MP4 bằng tay trên bản cài, tài khoản Instagram thật. Nhập URL không đăng bài. Ảnh/metadata trong kiểm là fixture; không chứng nhận nội dung video. T-026f còn kẹt fixture, đã revert theo yêu cầu, sẽ quay lại cuối. SHA ở STATUS.
