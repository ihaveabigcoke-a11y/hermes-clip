# T14 · Sửa T11: trạng thái nguồn và heuristic (từ review đêm 11/11)

Phụ thuộc: T11 (commit `74c88f7`). Đọc `docs/context/T11-AGENT-REACH-RESEARCH.md` và báo cáo `ops/night/out/reports/T11.md`.

## Lỗi review đã chỉ ra
1. **"Bị chặn" dùng cho cả lỗi do công cụ.** Trong `desktop/src/research-sources.mjs`, khi `--help` chưa xác nhận lệnh đọc, code ném lỗi `{blocked:true}`. Mọi ứng viên sẽ hiện "Nguồn: bị chặn", người dùng tưởng website chặn.
2. **Heuristic showroom báo nhầm.** `desktop/src/listing-check.mjs` → `productCountOnPage` đếm mọi link `/item/\d+.html`, `/offer/\d+.html`. Trang sản phẩm AliExpress/1688 thật có ≥6 link "sản phẩm liên quan", nên gần như listing nào cũng thành "có thể là showroom".
3. **Cờ lệch giá báo nhầm với giá dạng khoảng** (`listingWarnings`). Với "¥3.50-5.20", `numeric=null`, nên luôn báo lệch dù giá Muse nằm trong khoảng.
4. Map ký hiệu tiền thiếu `£`/GBP. `¥` có thể là JPY.
5. `SourceCheckControls` (`components/lab/research-sources.tsx`) gọi `integrationStatus` mỗi 3 giây, mỗi lần trả toàn bộ jobs (tối đa 100) kèm `result`.
6. `runJson` gọi `Buffer.byteLength(stdout)` cho mỗi chunk, chi phí O(n²).

## Mục tiêu
1. Tách trạng thái:
   - `unavailable`: công cụ chưa sẵn sàng hoặc chưa xác nhận lệnh. Chip "Nguồn: chưa kiểm được (công cụ)".
   - `blocked`: chỉ khi trang trả captcha, 403, 429 hoặc yêu cầu đăng nhập.
   - `failed`: lỗi khác.
   
   Cập nhật UI và test.
2. Showroom:
   - Chỉ đếm link khác URL hiện tại và nằm ngoài khối "related / recommend / you may also like / 相关推荐 / 猜你喜欢". Nếu không tách được vùng thì chỉ gợi ý trong modal, không hiện chip ở bảng.
   - Thêm fixture listing đơn có khối sản phẩm liên quan (→ không phải showroom), giữ fixture showroom 12 sản phẩm (→ vẫn bị gắn cờ).
3. Giá dạng khoảng: hiểu `a-b` và `a~b`; chỉ báo lệch khi giá Muse nằm ngoài khoảng. Thêm test.
4. Thêm `£`→GBP. `¥` chỉ hiểu là CNY khi domain là 1688/alibaba/aliexpress/taobao/tmall; ngược lại để `null` kèm ghi chú "¥ không rõ CNY/JPY".
5. Giảm tải: poll 10 giây và chỉ khi đang có job chạy, hoặc main trả bản tóm tắt không có `result`. Giữ hành vi hiển thị.
6. `runJson`: đếm byte cộng dồn. Giữ giới hạn 4 MB và có test.

## Giữ nguyên
- An toàn subprocess, argv cố định, không shell, không kênh cần đăng nhập, không thêm dependency.

## Nghiệm thu
- Test cho cả 6 mục (mục 5 có thể test hàm thuần quyết định có poll hay không).
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
