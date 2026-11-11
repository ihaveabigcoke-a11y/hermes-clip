# Kiểm máy móc commit đêm

`scripts/night-review.mjs` chuyển các bước có thể kiểm tự động của [skill hermes-night-review](../.claude/skills/hermes-night-review/SKILL.md) thành báo cáo tiếng Việt. Vẫn cần người review nội dung theo skill trước khi áp vào app chính. Cờ không phải kết luận rằng thay đổi sai; không có cờ cũng không chứng minh chức năng đạt nghiệm thu.

Chạy bằng Node có sẵn và Git trên PATH, không cần dependency mới:

```powershell
node scripts/night-review.mjs
node scripts/night-review.mjs --repo . --base origin/main --branch HEAD --out ops/night/out/AUTO-REVIEW.md --runs ops/night/runs
node --test tests/night-review.test.mjs
```

Các giá trị mặc định là `--repo .`, `--base origin/main`, `--branch HEAD`, `--out ops/night/out/AUTO-REVIEW.md`. Đường dẫn tương đối của `--out` và `--runs` tính từ `--repo`. Thư mục cha của `--out` phải tồn tại; script chỉ ghi file đó, không tạo thư mục, không sửa Git hoặc chạy test/build. Nếu muốn `git status` cũng giống hệt trước/sau, dùng output ngoài checkout hoặc file output đã tồn tại và đang được ignore/untracked. Một file output mới trong checkout sẽ xuất hiện ở status như bình thường.

Script chỉ gọi `git log`, `git show`, `git diff`, `git rev-parse`, `git branch --show-current`, `git stash list`; không dùng shell, external diff, textconv, lazy fetch hoặc optional index locks. Output không được trỏ vào metadata Git, symlink hoặc hardlink. HEAD, nhánh, stash được chụp trước/sau và ghi ở dòng cuối; nếu runner đổi Git cùng lúc, báo cáo không xác nhận trạng thái bất biến.

Mỗi commit `night Txx:` hoặc `night Fxx:` có một dòng riêng. Báo cáo được đọc bằng `git show <sha>:ops/night/out/reports/<ID>.md`; thay đổi báo cáo trong working tree hoặc commit sau không làm đổi kết luận cũ. Report only, thiếu đầu báo cáo/trạng thái, trạng thái sai hoặc dấu hiệu lỗi xác thực được ghi **Chưa làm**. Báo cáo hợp lệ giữ `done`, `partial`, `blocked`. Revert chuẩn nhận SHA trong body; nếu không có SHA, tìm commit có đúng subject gần nhất trước revert. Triển khai lại cùng mã task vẫn là dòng riêng. Spec F nằm ở `ops/night/fix/<vòng>/Fxx-*.md` và chỉ được chỉ dẫn để review thủ công.

Khi có `--runs`, script đọc các `runner.log` bên dưới thư mục đó, bỏ qua symlink. Đối chiếu theo mã task và SHA ở dòng `Txx/Fxx DONE|PARTIAL|NOCHANGE <sha>`, lấy lượt Codex cuối trước dòng đó. Lỗi của lượt trước hoặc một đêm khác không làm hỏng lượt đã sửa. Exit khác 0 hoặc dấu hiệu lỗi xác thực trong lượt khớp khiến trạng thái **Chưa làm**. Log không có SHA (ví dụ `finished with no code change`), bị cắt hoặc không tìm thấy thì ghi **chưa xác minh exit code**; không đoán theo ngày giờ.

Các cờ được tính trên diff so với parent đầu tiên (merge cũng dùng parent đầu tiên):

- Đếm dòng bị xóa trong `tests/`, `desktop/test/` có `test(`, `it(`, `describe(` hoặc `assert`; một dòng chỉ đếm một lần. Liệt kê số dòng theo file, kể cả file bị xóa/đổi tên. Đây không phải bộ phân tích AST hay kiểm assertion bị nới.
- Dòng thêm có `?? 0`, `|| 0`, `.default(0)` ngoài thư mục `test`, `tests`, `__tests__`; ghi đường dẫn và số dòng mới. Chuỗi/comment cũng có thể bị gắn cờ; cần đọc ngữ cảnh.
- Đường cấm của runner, lockfile; thay đổi giá trị dependency trong hai package manifest (không gắn cờ chỉ vì đổi thứ tự/format hoặc script).
- Số ký tự Unicode toàn file `lib/lab/muse-workflows.ts` trước/sau, không phải riêng độ dài prompt.
- File test được nhắc trong báo cáo nhưng không có trong diff; hiểu đường dẫn dấu `/`, `\` và danh sách `{a,b}` thường dùng trong báo cáo. Không suy đoán wildcard hoặc tên viết tắt tự do.

Luôn exit 0 khi review chạy được, kể cả phát hiện cờ, task chưa làm hoặc phần diff chưa đọc đủ. Báo cáo nêu phần chưa kiểm; exit 0 không phải giấy phép áp code. Exit khác 0 dành cho tham số không hợp lệ, repository không hợp lệ hoặc đường dẫn output không ghi được. Nhánh/base phải là commit tồn tại sẵn; script không fetch.

Test dùng repo Git tạm ở `outputs/`, có commit/revert/stash fixture; không thao tác các đối tượng đó trên checkout làm việc. Test chụp nội dung, mtime và mode mọi file, gồm `.git`, đồng thời đối chiếu HEAD, nhánh, stash và status trước/sau. `npm test` đã bao gồm suite này.
