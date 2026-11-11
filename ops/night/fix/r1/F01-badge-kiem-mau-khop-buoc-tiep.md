# F01 — Badge "Đã kiểm mẫu" phải khớp với "Bước tiếp theo" (sửa T15)

## Bối cảnh
T15 (commit d00d5f4) thêm `productNextStep`. Hàm này coi mẫu là đã kiểm **chỉ khi** `sampleCheck.matchesVideo === true` (`lib/lab/sample-check.ts:13`):
```ts
if (product.sampleCheck?.matchesVideo === true) return null;
```
Badge trên thẻ sản phẩm vẫn dùng cờ cũ khi `sampleCheck` là null (`components/lab/app.tsx:912`):
```ts
const sampleVerified = p.data.sampleCheck == null ? p.data.sampleVerified : p.data.sampleCheck.matchesVideo === true;
```
Hậu quả: sản phẩm cũ có `sampleVerified: true` và không có `sampleCheck` thì hiện badge xanh "Đã kiểm mẫu sản phẩm" (`app.tsx:946`), nhưng dòng "Bước tiếp theo" lại bảo "Kiểm mẫu thật". Hai tín hiệu trái nhau trên cùng một thẻ. Bộ lọc "Đã kiểm mẫu / Chờ kiểm mẫu" (`app.tsx:1033-1034`) có thể bị lệch theo cùng cách.

## Mục tiêu
- Badge, bộ lọc và `productNextStep` dùng chung một nguồn sự thật. Tách một hàm thuần, ví dụ `sampleCheckState(product)` trong `lib/lab/sample-check.ts`, trả `'verified' | 'failed' | 'legacy' | 'unchecked'`:
  - `verified`: `sampleCheck.matchesVideo === true`;
  - `failed`: `sampleCheck.matchesVideo === false`;
  - `legacy`: không có `sampleCheck` (null hoặc undefined) nhưng `sampleVerified === true`;
  - `unchecked`: các trường hợp còn lại.
- `sampleCheckWarning` và `productNextStep` giữ hành vi hiện tại: chỉ `verified` mới không cảnh báo.
- Badge thẻ sản phẩm:
  - `verified` → "Đã kiểm mẫu sản phẩm" (giữ màu hiện tại);
  - `legacy` → "Đã kiểm mẫu (bản cũ) – cần xác nhận khớp video", dùng màu cảnh báo, không dùng màu xanh;
  - `failed` / `unchecked` → "Chờ kiểm mẫu sản phẩm".
- Bộ lọc "Đã kiểm mẫu sản phẩm" chỉ lấy `verified`; `legacy` rơi vào "Chờ kiểm mẫu sản phẩm".

## Giữ nguyên
- Schema `sampleCheck` và `sampleVerified`. Không migration, không ghi lại dữ liệu cũ.
- Thứ tự 7 nhánh của `productNextStep` và câu chữ cảnh báo hiện có.
- Checkbox `sampleVerified` trong form (`app.tsx:168`).
- Nút "Tiếp tục", landing warning, CSS, font, theme.

## Nghiệm thu
- `tests/guidance.test.mjs`: test `sampleCheckState` cho đủ 4 trạng thái, gồm `sampleCheck: undefined`, `null` và `{}`. Thêm một test khẳng định: với mọi trạng thái khác `verified`, `productNextStep(...).kind === 'sample'` (nếu đã có báo giá cùng tiền tệ).
- `scripts/check-product-next-step-ui.mjs` (hoặc test render desktop tương ứng): sản phẩm cũ có `sampleVerified: true` và không có `sampleCheck` thì **không** hiện chữ "Đã kiểm mẫu sản phẩm" (đúng nguyên văn), mà hiện "bản cũ".
- `npm test`, `npm run test:api`, `npm run test:desktop` và typecheck đều đạt. Không xóa hoặc nới assertion nào.

Không làm ngoài phạm vi.
