# F02 — `night-review.mjs`: cờ "Mặc định 0" bỏ qua tài liệu và báo cáo (sửa T24)

## Bối cảnh
T24 (commit bc31c49) thêm `scripts/night-review.mjs`. Cờ "Mặc định 0 ngoài test" đang quét **mọi** file trong diff, kể cả tài liệu (`scripts/night-review.mjs:172-183`):
```js
for (const path of files) {
  ...
  if (!testPath(path) && /(?:\?\?|\|\|)\s*0(?![\w.]|[eE][+-])|\.default\s*\(\s*0\s*\)/.test(line.slice(1))) zeroes.push(path + ':' + lineNumber);
```
Ở `:170` đã có danh sách `codeFiles` loại `ops/night/out/`, `docs/` và `*.md|txt|log|png|jpg`, nhưng cờ không dùng danh sách này. Trong `ops/night/out/AUTO-REVIEW.md` đêm nay có hai dương tính giả:
- T24 bị gắn cờ `docs/NIGHT-REVIEW.md:24`;
- T20 bị gắn cờ `ops/night/out/CHANGES-3.md:115`.

Hai cờ này chỉ là chữ trong tài liệu, không phải code. Chúng làm người review phải mở file vô ích.

## Mục tiêu
- Cờ "Mặc định 0" chỉ xét file thuộc `codeFiles` (cùng tiêu chí ở `:170`) và không phải file test.
- Các cờ khác giữ nguyên phạm vi: "dòng test bị xóa", "Đường cấm", dependency, Muse workflows.

## Giữ nguyên
- Mọi lệnh git chỉ đọc, chặn `--out`, dòng đối chiếu HEAD/nhánh/stash.
- Định dạng bảng và mục của `AUTO-REVIEW.md`.
- `package.json` (không thêm dependency).

## Nghiệm thu
- `tests/night-review.test.mjs` thêm một test với repo fixture: một commit thêm `x ?? 0` vào `docs/a.md`, vào `ops/night/out/T99.md` và vào `lib/a.ts`. Kết quả chỉ có cờ `lib/a.ts:<dòng>`, không có cờ cho hai file `.md`.
- 9 test cũ của `tests/night-review.test.mjs` vẫn đạt, không nới assertion.
- `npm test` đạt.

Không làm ngoài phạm vi.
