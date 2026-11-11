# Hermes Clip — hướng dẫn làm việc

- Chỉ dùng một agent Codex. Không spawn sub-agent, phân vai hoặc khởi chạy hệ thống điều phối cũ.
- Đọc README.md và docs/context/01-BOI-CANH-VA-TRANG-THAI.md trước. Brief lịch sử gồm yêu cầu, giả thuyết và câu hỏi; không tự biến mọi ý thành phạm vi triển khai.
- Xác định checkout và bản cài thực sự đang chạy. Repository này là source để phát triển; dữ liệu của bản cài Windows không nằm trong Git.
- Giữ SQLite, phiên Muse/Instagram, proxy, ảnh tham chiếu, video gốc, phiên bản, file xuất và receipt. Không đưa DB, phiên hoặc credentials vào Git/báo cáo. Ngày 11/11/2026, người dùng đã duyệt giữ repo public và công khai snapshot records, hội thoại Muse, receipt và media đã kiểm tại data/ và evidence/. Quyền này không cho phép xuất cookie, khóa, cấu hình proxy chứa mật khẩu hoặc toàn bộ AppData; không suy rộng sang dữ liệu nhạy cảm mới phát sinh.
- Sửa source và build; không chỉ sửa file trong desktop/local-dist. Tự quyết chi tiết kỹ thuật thông thường trong phạm vi người dùng giao.
- Tối đa 3 lượt Muse/profile/đợt. Tác vụ có kết quả chưa rõ phải đối soát trước khi gửi lại. Không tự reset bộ đếm để né hạn mức.
- Sản phẩm là đơn vị quản lý chính. Không đổi unknown/null thành 0; dữ liệu nghiên cứu phải nêu nguồn, kỳ đo và đúng SKU hay sản phẩm tương tự.
- Quyền đăng hoặc nhận tiền phải theo tài khoản/nội dung/phạm vi người dùng đã duyệt. Không tự suy rộng từ một bài đã đăng sang mọi sản phẩm.
- Test phù hợp với thay đổi. Phân biệt kiểm tra bằng fixture với tài khoản/dịch vụ/file thật. Không giảm assertion hoặc báo kết nối thành công từ URL/cookie.
- Ghi checkpoint và blocker; tiếp tục phần độc lập. Báo cáo cuối nêu thay đổi, bằng chứng, phần chưa kiểm chứng và cách chạy tiếp.
- Giữ theme/font/workflow ngoài phạm vi sửa. Tài liệu có trạng thái cũ phải được đọc cùng bản context mới nhất.

Không tự chạy các script cũ có hành động bên ngoài chỉ vì chúng có trong repo. Người dùng đang phát triển desktop Windows; bản source này không biến dịch vụ Muse hoặc Instagram thành API không cần đăng nhập.
