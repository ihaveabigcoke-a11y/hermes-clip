# F03 — Tổng quan đếm "đã kiểm mẫu" phải dùng `sampleCheckState` (sửa tiếp F01/T15)

## Bối cảnh
F01 (commit 731c060) thêm `sampleCheckState(product)` ở `lib/lab/sample-check.ts:12-17`. Badge thẻ sản phẩm (`components/lab/app.tsx:913`) và bộ lọc (`app.tsx:1071-1072`) đã dùng hàm này. Màn Tổng quan thì vẫn đọc cờ cũ `sampleVerified`:

- `app.tsx:1175`, chọn sản phẩm cho thẻ "BƯỚC TIẾP THEO · KIỂM CHỨNG":
  ```ts
  const needsProof = products.find((p) => !p.data.sampleVerified);
  ```
- `app.tsx:1256`:
  ```tsx
  {products.filter((p) => p.data.sampleVerified).length} đã kiểm mẫu sản phẩm
  ```
- `app.tsx:1384`:
  ```tsx
  {products.filter((p) => !p.data.sampleVerified).length} sản phẩm chờ bằng chứng
  ```

Hậu quả là các số không khớp nhau:
- Sản phẩm `legacy` (`sampleVerified: true`, không có `sampleCheck`) được Tổng quan đếm là "đã kiểm". Nhưng bộ lọc "Đã kiểm mẫu sản phẩm" không lấy nó, và bước tiếp theo vẫn là "Kiểm mẫu thật".
- Sản phẩm có `sampleCheck.matchesVideo === false` mà `sampleVerified: true` cũng bị tính sai như vậy.
- Thẻ "KIỂM CHỨNG" có thể bỏ sót đúng những sản phẩm đó.

## Mục tiêu
- Ba chỗ trên dùng `sampleCheckState(p.data)`:
  - "đã kiểm": chỉ `=== "verified"`;
  - "chờ bằng chứng" và `needsProof`: `!== "verified"`.
- Số trên Tổng quan phải bằng số dòng mà bộ lọc "Đã kiểm mẫu sản phẩm" và "Chờ kiểm mẫu sản phẩm" trả về.
- Tìm thêm trong `components/` và `lib/` các chỗ khác còn đọc trực tiếp `sampleVerified` để quyết định đã kiểm hay chưa. Đổi những chỗ đó theo cùng cách. Không đổi checkbox ở form (`app.tsx:169`) và schema. Ghi danh sách chỗ đã đổi vào báo cáo.

## Giữ nguyên
- Schema `sampleVerified` và `sampleCheck`. Không migration, không ghi lại dữ liệu cũ.
- `sampleCheckState`, `sampleCheckWarning`, `productNextStep` và badge, bộ lọc của F01.
- Câu chữ tiếng Việt (giữ dấu), CSS, font, theme, bố cục Tổng quan.

## Nghiệm thu
- Thêm test (render desktop, hoặc mở rộng `scripts/check-product-next-step-ui.mjs`) với 4 sản phẩm: một `verified`, một `legacy`, một `failed` (`matchesVideo: false` và `sampleVerified: true`), một `unchecked`. Tổng quan phải hiện "1 đã kiểm mẫu sản phẩm" và "3 sản phẩm chờ bằng chứng". Thẻ "KIỂM CHỨNG" phải trỏ tới một sản phẩm không `verified`.
- Các test F01 trong `tests/guidance.test.mjs` vẫn đạt nguyên văn.
- `npm test`, `npm run test:api`, `npm run test:desktop` và typecheck đều đạt. Không xóa hoặc nới assertion nào.

Không làm ngoài phạm vi.
