Đọc CLAUDE.md (mục tiêu, phạm vi đợt đầu, hợp đồng tích hợp với Office) trước khi làm.

# Hermes Clip — hướng dẫn làm việc

- Chỉ dùng một agent Codex. Không spawn sub-agent, phân vai hoặc khởi chạy hệ thống điều phối cũ.
- Đọc README.md và docs/context/01-BOI-CANH-VA-TRANG-THAI.md trước. Brief lịch sử gồm yêu cầu, giả thuyết và câu hỏi; không tự biến mọi ý thành phạm vi triển khai.
- Xác định checkout và bản cài thực sự đang chạy. Repository này là source để phát triển; dữ liệu của bản cài Windows không nằm trong Git.
- Giữ SQLite, phiên Muse/Instagram, proxy, ảnh tham chiếu, video gốc, phiên bản, file xuất và receipt. Không đưa DB, phiên hoặc credentials vào Git/báo cáo. Ngày 11/11/2026, người dùng đã duyệt giữ repo public và công khai snapshot records, hội thoại Muse, receipt và media đã kiểm tại data/ và evidence/. Quyền này không cho phép xuất cookie, khóa, cấu hình proxy chứa mật khẩu hoặc toàn bộ AppData; không suy rộng sang dữ liệu nhạy cảm mới phát sinh.
- Sửa source và build; không chỉ sửa file trong desktop/local-dist. Tự quyết chi tiết kỹ thuật thông thường trong phạm vi người dùng giao.
- Cập nhật theo yêu cầu người dùng ngày 12/11/2026: bỏ giới hạn 3 lượt Muse/profile/đợt trong Hermes. Bộ đếm chỉ ghi lịch sử, không chặn gửi và không cần reset để chạy tiếp. Vẫn kiểm hạn mức thực tế, phiên và lỗi từ Muse; giữ giới hạn thử lại hữu hạn và đối soát kết quả chưa rõ trước khi gửi lại.
- Sản phẩm là đơn vị quản lý chính. Không đổi unknown/null thành 0; dữ liệu nghiên cứu phải nêu nguồn, kỳ đo và đúng SKU hay sản phẩm tương tự.
- Quyền đăng hoặc nhận tiền phải theo tài khoản/nội dung/phạm vi người dùng đã duyệt. Không tự suy rộng từ một bài đã đăng sang mọi sản phẩm.
- Test phù hợp với thay đổi. Phân biệt kiểm tra bằng fixture với tài khoản/dịch vụ/file thật. Không giảm assertion hoặc báo kết nối thành công từ URL/cookie.
- Ghi checkpoint và blocker; tiếp tục phần độc lập. Báo cáo cuối nêu thay đổi, bằng chứng, phần chưa kiểm chứng và cách chạy tiếp.
- Giữ theme/font/workflow ngoài phạm vi sửa. Tài liệu có trạng thái cũ phải được đọc cùng bản context mới nhất.

Không tự chạy các script cũ có hành động bên ngoài chỉ vì chúng có trong repo. Người dùng đang phát triển desktop Windows; bản source này không biến dịch vụ Muse hoặc Instagram thành API không cần đăng nhập.

## Skills trong repo

Codex/Claude phải đọc `SKILL.md` tương ứng trước khi làm việc đó:

- [.claude/skills/viral-formula-analyzer](.claude/skills/viral-formula-analyzer/SKILL.md): khi phân tích video mẫu, hook, chữ/CTA hoặc cập nhật công thức; Hermes có tính năng tương ứng ở T21/T22.
- [.claude/skills/hermes-product-check](.claude/skills/hermes-product-check/SKILL.md): khi kiểm ứng viên, listing, vốn + ship, giá bán lẻ Mỹ và rủi ro sản phẩm; Hermes có tính năng tương ứng ở T23.
- [.claude/skills/hermes-night-review](.claude/skills/hermes-night-review/SKILL.md): khi review/tổng kết commit đêm hoặc chuẩn bị áp vào app chính; Hermes có script kiểm máy móc tương ứng ở T24, vẫn cần review nội dung.

## Chạy đêm

- Codex vẫn là **một worker duy nhất**, làm trong clone riêng trên nhánh `night-*`, được runner `ops/night/RUN-NIGHT.ps1` gọi tuần tự từng task. Cấm sub-agent, phân vai và orchestrator tự dựng bên trong Codex; không gọi lại runner từ task.
- Runner tự chạy kiểm tra và commit sau khi kiểm. Worker không tự commit, push hoặc đổi nhánh; ghi checkpoint, blocker và báo cáo cuối đúng mã task để runner đối chiếu.
- Giữ mọi quy tắc ở trên và giới hạn riêng của từng task đêm. Xác định bản cài từ context, không mở bản cài hay truy cập AppData/profile/SQLite thật; không gọi dịch vụ ngoài. Đọc đầu vào tại `ops/night/input/`, ghi báo cáo tại `ops/night/out/` theo phạm vi được giao.
