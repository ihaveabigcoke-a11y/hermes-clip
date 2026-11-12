# T10 · Cập nhật tài liệu và tổng kết đêm

Làm cuối cùng. Chỉ sửa tài liệu, không sửa code.

1. `AGENTS.md`: thêm mục ngắn "Chạy đêm". Codex vẫn là **một worker duy nhất**, được runner `ops/night/RUN-NIGHT.ps1` gọi tuần tự từng task. Runner tự chạy kiểm tra và commit. Vẫn cấm sub-agent và orchestrator tự dựng bên trong Codex. Giữ mọi quy tắc cũ.
2. `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`: thêm mục "Cập nhật đêm <ngày>":
   - Liệt kê các task đã có commit trên nhánh này (đọc `git log`).
   - Ghi rõ phần chưa kiểm giao diện thật hoặc Instagram thật.
   - Quyết định mới của người dùng: bỏ 3 sản phẩm thương hiệu cũ (lưu trữ, không xóa); ngưỡng giá vốn + ship ≤ 20 USD; giá bán x3–x4 là giả thuyết; 1 sản phẩm × 3 tài khoản, nội dung khác nhau; đo bằng comment từ khóa, DM, chia sẻ, bấm link; DM dùng công cụ chính thức qua API của Meta; landing đi hai bậc (email/đặt chỗ trước, pre-order thu tiền sau cho sản phẩm thắng).
3. `ops/night/out/CHANGES.md`: tóm tắt cho người dùng bằng tiếng Việt dễ đọc, gồm:
   - Mỗi task: làm được gì, file chính, cách tự kiểm vào sáng mai (bấm vào đâu, thấy gì).
   - Việc người dùng cần làm tay: lưu trữ 3 sản phẩm cũ trong app; gỡ Reel Ruffwear trên Instagram nếu muốn; kiểm nhãn AI với bài nháp.

## Nghiệm thu
- Không có thay đổi ngoài `AGENTS.md`, `docs/`, `ops/night/out/`.
