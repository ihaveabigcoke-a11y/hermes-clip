---
name: hermes-night-review
description: Review Hermes Clip night-run commits made by Codex, read-only, against each task's acceptance criteria and write REVIEW.md with verdicts and fix prompts. Use whenever the user asks to review, check or summarize what Codex did overnight, the night branch, REPORT.md, failed or stashed tasks, or before applying night work to the main app.
---
# Review Hermes Clip night commits

The night runner can mark work DONE when it isn't (it did so once after an expired key), so this review is the gate before anything reaches the user's real app. Trust diffs and task specs, not summaries.

## Stay read-only

A runner may still be using the clone (default `C:\HermesNight\hermes-clip`). Use only `git log`, `show`, `diff`, `status`, `branch --list`, `stash list` and `stash show`. Never checkout, stash push/pop, commit, reset, pull or push.

Record `git rev-parse HEAD`, the current branch and `git stash list` at the start and again at the end, and state in REVIEW.md that they match. That proves the review changed nothing.

Write only to the review folder the user names (default `E:\Hermes Night\review\REVIEW.md`), in Vietnamese, without pasting whole diffs.

## Steps

1. **Find the branch and commits.** `git -C <clone> branch --list "night-*"`, then `git -C <clone> log --oneline origin/main..<branch>`.
2. **Read the night's outputs.**
   - `ops\night\out\REPORT.md`, if present: a hint, not proof.
   - `git stash list`, to find FAILED tasks.
   - The runner logs under the pack's `runs\*\runner.log`, if the user gives the path: `codex exit` codes and 401/403 lines.
3. **Decide each task's status before judging quality.**
   - **Chưa làm** (not done), whatever REPORT.md says:
     - the commit message ends in "report only";
     - the report file lacks a `=== BAO CAO Txx ===` block with a `TRANG THAI:` line;
     - the report or log shows 401/403 or an expired key;
     - Codex exited non-zero.
   - **Đã bỏ**: a later `Revert "night Txx: ..."` commit undoes the task.
4. **For each real task commit:**
   - read the spec `ops\night\tasks\Txx-*.md`;
   - read Codex's report `ops\night\out\reports\Txx*.md`;
   - read `git show --stat <sha>`;
   - read the diff of the files that matter.
5. **Check:**
   - every acceptance criterion, one by one;
   - tests: none deleted, no assertion weakened, new behaviour has tests. Compare removed `test(`/`assert` lines in the diff;
   - unknown stays `null`, never `0` (look for `?? 0`, `|| 0`, `.default(0)`); records stored before the change still parse;
   - nothing changed in `data/`, `evidence/`, lockfiles or dependency lists;
   - scope: no redesign, fonts/theme unchanged, Vietnamese UI labels keep diacritics;
   - Muse prompts stay English and not bloated (note the character-count change);
   - every claim in Codex's report (tests added, files changed) actually appears in the diff.
6. **FAILED tasks.** `git -C <clone> stash show -p stash@{n}`. Say whether the partial work is worth salvaging and whether a task spec exists for it.

## Office mode (T-xxx tasks edited directly in the main app)

Since 12/11/2026 the office boss gives Codex T-xxx tasks (specs in the office repo's `tasks/T-xxx-*.md`) that edit the **main app folder directly**, with a tag `before-T-xxx` set before each task. Review the same way, with these substitutions:
- Range: `git log --oneline before-T-xxx..HEAD` and `git diff before-T-xxx..HEAD` in the main app folder.
- Spec: `tasks/T-xxx-*.md` in the office repo; the report is the last commit message or `ops/office/reports/T-xxx.md` if present.
- Write the verdict into the office repo's `STATUS.md` (and `REVIEW-T-xxx.md` next to it), not `E:\Hermes Night\review`.
- Do not run the read-only HEAD/stash check against a runner here: nothing else edits the folder during review. Do check that `data/`, `evidence/` and the user's AppData were not touched.

## REVIEW.md

1. Table: Task | Kết luận (Đạt / Cần sửa / Bỏ / Chưa làm) | Lý do (file + đoạn) | Việc cần sửa.
2. "Rủi ro khi áp vào app chính".
3. "Việc người dùng phải tự kiểm trên giao diện thật": what tests cannot prove, such as the real UI, Muse and Instagram.
4. A ready-to-paste Codex fix prompt for every "Cần sửa" item. Scope it to that task, list exact files and expected behaviour, and end with "Kết thúc bằng === BAO CAO Txx === và TRANG THAI".
5. One line confirming HEAD, branch and stash list were unchanged by the review.
