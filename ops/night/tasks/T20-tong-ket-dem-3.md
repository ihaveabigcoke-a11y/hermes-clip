# T20 · Tổng kết đêm 3 cho người dùng và ghi skill vào AGENTS.md

Làm cuối cùng. Chỉ sửa tài liệu, không sửa code.

1. Đọc `git log --oneline origin/main..HEAD` và các báo cáo trong `ops/night/out/reports/`. Tập trung vào task của đêm nay: T15–T19, T21–T27.
2. Viết `ops/night/out/CHANGES-3.md` bằng tiếng Việt dễ đọc. Mỗi task có commit ghi:
   - làm được gì;
   - file chính;
   - chưa kiểm chứng gì;
   - **cách tự kiểm sau khi áp vào app**: bấm vào đâu, thấy gì.
   
   Task FAILED/SKIPPED thì ghi một dòng lý do, lấy từ `ops/night/out/REPORT.md` nếu có.
3. Mục "Việc người dùng phải làm tay":
   - thử "Phân tích bằng Muse" với 1 video mẫu (tốn 1 lượt, T22);
   - thử "Kiểm sản phẩm" với 1 ứng viên (T23);
   - tạo Meta app nếu muốn dùng API (T18);
   - bật tự động trả lời comment bằng tin nhắn trong Business Suite;
   - lưu trữ 3 sản phẩm cũ;
   - kiểm `agent-reach --help`.
4. `AGENTS.md`: thêm mục ngắn "Skills trong repo". Không xóa quy tắc cũ.
   - Liệt kê `.claude/skills/viral-formula-analyzer`, `.claude/skills/hermes-product-check`, `.claude/skills/hermes-night-review`, mỗi cái một dòng: khi nào đọc.
   - Ghi rõ: Codex/Claude đọc SKILL.md tương ứng trước khi làm việc đó. Hermes có tính năng tương ứng ở T21/T22, T23, T24.
5. Cập nhật mục "Cập nhật đêm" trong `docs/context/01-BOI-CANH-VA-TRANG-THAI.md` cho đêm 3.

## Nghiệm thu
- Chỉ có thay đổi trong `docs/`, `ops/night/out/` và `AGENTS.md`.
