# T24 · Tự review đêm bằng script (đưa skill hermes-night-review vào repo)

## Bối cảnh
- Skill `.claude/skills/hermes-night-review/SKILL.md` mô tả cách duyệt commit Codex làm qua đêm. Đọc kỹ skill trước khi code.
- Một đêm trước, runner đã ghi DONE cho task bị cắt giữa chừng do key 403. Các file "báo cáo" lúc đó thật ra là đuôi log.
- Nhiều phần kiểm trong skill là kiểm máy móc, script làm được. Runner sẽ gọi script này cuối mỗi đêm, nếu file tồn tại.

## Mục tiêu
1. Viết `scripts/night-review.mjs`: Node thuần, không thêm dependency.
   - Lệnh: `node scripts/night-review.mjs [--repo .] [--base origin/main] [--branch HEAD] [--out ops/night/out/AUTO-REVIEW.md] [--runs <thư mục runs>]`.
   - **Chỉ đọc.** Chỉ được dùng `git log`, `git show`, `git diff`, `git rev-parse`, `git branch --show-current`, `git stash list`. Chỉ ghi đúng file `--out`.
2. Phân loại từng commit `night Txx: ...` và `night Fxx: ...` (Fxx là task sửa do boss Claude Code viết; spec nằm ở `ops/night/fix/<vòng>/Fxx-*.md`):
   - **Chưa làm** khi gặp một trong các trường hợp:
     - commit "report only";
     - `ops/night/out/reports/Txx.md` tại commit đó thiếu dòng `=== BAO CAO Txx ===` hoặc dòng `TRANG THAI:`;
     - báo cáo có 401/403/"hết hạn";
     - `runner.log` (nếu có `--runs`) ghi `codex exit` khác 0 cho lần chạy được commit.
   - **Đã bỏ** khi có commit `Revert "night Txx: ...` (hoặc `Fxx`) sau đó.
   - Còn lại: đọc giá trị `TRANG THAI` (done/partial/blocked).
3. Với mỗi task có code, ghi cờ:
   - Số dòng test bị xóa trong `tests/` và `desktop/test/`: chỉ đếm dòng có `test(`, `it(`, `describe(`, `assert`. Liệt kê file.
   - Dòng mới thêm có `?? 0`, `|| 0`, `.default(0)` ngoài thư mục test. Ghi `file:dòng`.
   - File thuộc đường cấm của runner: `data/`, `evidence/`, `ops/night/tasks|input|fix`, `ops/night/COMMON.md`, `ops/night/RUN-NIGHT.ps1`, `desktop/local-dist/`, lockfile, `.github/`, `.claude/`.
   - Đổi dependency trong `package.json` hoặc `desktop/package.json`.
   - `lib/lab/muse-workflows.ts` có đổi → ghi chênh lệch số ký tự file.
   - Báo cáo nhắc đến file test (`tests/…`, `desktop/test/…`) không có trong diff → cờ "báo cáo nhắc file không có trong diff".
4. Xuất Markdown tiếng Việt:
   - **Bảng:** Task | Commit | Trạng thái máy đọc | Cờ | Báo cáo.
   - **Chi tiết từng task.**
   - **Dòng cuối:** HEAD, nhánh và `git stash list`, chụp trước và sau khi chạy, xác nhận không đổi.
   - **Ghi rõ ở đầu file:** "Đây là kiểm máy móc. Vẫn cần review nội dung theo skill hermes-night-review trước khi áp vào app chính."
5. Script luôn exit 0 khi chạy được. Chỉ exit khác 0 khi tham số sai hoặc không phải repo git.

## Nghiệm thu
- Test `tests/night-review.test.mjs` dựng repo git tạm bằng lệnh `git` có sẵn:
  - **Task tốt:** có báo cáo hợp lệ → trạng thái done, không cờ.
  - **Task xấu:** thêm `weight(c){return c.weightKg ?? 0}`, xóa một test "unknown stays null", và báo cáo nhắc một file test không có → đủ 3 cờ.
  - **Task "report only"** có báo cáo chứa 403 → Chưa làm.
  - **Task bị revert** → Đã bỏ.
  - **Commit `night F01: ...`** được nhận như task.
  - HEAD, nhánh, stash list và `git status` không đổi sau khi chạy. Không có file nào ngoài `--out` được ghi.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
