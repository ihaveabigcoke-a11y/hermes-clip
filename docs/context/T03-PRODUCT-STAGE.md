# T03 — Bước tiến độ của sản phẩm

Ngày 11/11/2026, Asia/Saigon. Checkout riêng `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. Source bản cài Windows được xác định theo context; không mở bản cài, AppData, profile, SQLite người dùng hay dịch vụ ngoài trong task đêm. Không commit/push.

## Thay đổi và quy tắc

`lib/lab/product-stage.ts` cung cấp hàm thuần `productStage(product, records)`, trả bậc cao nhất có bằng chứng trong record. `components/lab/app.tsx` dùng hàm này để chia sản phẩm vào pipeline; giữ nguyên nhãn, theme, font và bố cục.

| Bậc | Điều kiện |
| --- | --- |
| 0 — Ý tưởng | Mới có hồ sơ; URL supplier/reference hoặc plan nháp/lên lịch không tự tăng bậc. |
| 1 — Kiểm chứng | `sampleVerified === true`, hoặc `proofNotes`/`proofUrl` có nội dung. Ghi chú báo giá dùng trường `proofNotes` hiện có. |
| 2 — Nội dung | Có `production` hoặc `creative` cũ của sản phẩm. Không đòi đã kiểm mẫu/đã xuất video. |
| 3 — Đo nhu cầu | Có plan của sản phẩm ở `published_browser`, `published_manual` (nhận thêm giá trị `published`), hoặc `social_metric` nối qua `planId` của plan thuộc sản phẩm. Vẫn tính experiment cũ đang `running`, hoặc có `metric` nối qua experiment của sản phẩm. |

Hàm loại record liên kết có `archived`, giữ cách xử lý experiment/creative cũ. Plan nháp có metric vẫn đạt bậc 3 để xử lý trạng thái chưa đồng bộ; URL bài đơn thuần không đủ. Bậc này mô tả tiến độ, không chứng nhận nhu cầu mua, doanh số, quyền đăng hay quyền nhận tiền; không thay các cổng duyệt hiện có.

Điều chỉnh nhỏ so với gợi ý: `proofUrl` là trường bằng chứng hiện có nên được tính; ghi chú bắt đầu bằng **“Muse đề xuất · cần kiểm tra nguồn”** không được tính riêng là kiểm chứng. Lý do: luồng promote tự chép ghi chú nghiên cứu vào `proofNotes`, nếu tính mọi chuỗi thì sản phẩm research vẫn bị tăng bậc dù chưa có bằng chứng mới. Người dùng có thể ghi bằng chứng riêng thay ghi chú đó, thêm `proofUrl` hoặc xác nhận sample. Hàm không thẩm định tính xác thực của nội dung tự do/URL và không gọi mạng.

Không thêm trường/schema/migration; bản ghi cũ thiếu trường vẫn tính được. Hàm không mutate records, không thay null thành 0, không suy tiền tệ.

## Kiểm tra

Baseline: `npm test` **91/91**, `npm run typecheck` đạt.

- `node --experimental-strip-types --test tests/domain.test.mjs`: **24/24**. Thêm 7 ca cho fixture cấu trúc workspace (Treat Trader → 3; ChomChom/Ruffwear → 2; chỉ supplier URL → 0), bằng chứng/ghi chú Muse, trạng thái published/nháp, metric null/0, liên kết sai/sản phẩm khác, record cũ và archive, tính bất biến.
- `npm test`: **98/98**, không fail/skip.
- `npm run typecheck`: đạt.
- `npm run test:api`: **10/10**, SQLite fixture trong bộ nhớ.
- `npm run test:desktop`: **176 đạt, 1 skip, 0 fail**; OpenMontage live skip do thiếu cấu hình như baseline trước T03. API biên dịch được trỏ sang build riêng bằng resolver test; không gọi Muse/Instagram thật. Test UI/font desktop sẵn có vẫn đọc output cũ, không phải bằng chứng pipeline mới trên GUI.
- `npm run local:build`: đạt, UI + 18 module API/domain. Đặt `NODE_OPTIONS=--import file:///C:/HermesNight/hermes-clip/outputs/night-t03/build-register.mjs` chỉ chuyển khai báo output của script chuẩn sang `outputs/night-t03/build`, có kiểm đường dẫn trước khi build xóa/tạo output. Không sửa script chuẩn, không ghi `desktop/local-dist`. Vẫn có cảnh báo font URL/chunk lớn như các task trước; font được copy sau bundle.
- `node --experimental-strip-types outputs/night-t03/snapshot-check.mjs`: đối chiếu chỉ đọc `data/2026-11-11/workspace-records.json`, đúng Treat Trader **3**, ChomChom **2**, Ruffwear **2**; không có record cũ; giá trị records và SHA-256 file không đổi. Đây là kiểm snapshot, không phải lần đăng/đo thật mới.
- `git diff --check`: đạt.

Log, script kiểm và build ở `outputs/night-t03/` (Git ignore). TEMP/TMP/npm cache chuyển vào đó, npm offline, update notifier tắt. Các DB/file tạm là fixture riêng; không sửa snapshot/media/receipt/phiên. `tests/domain.test.mjs` đã nằm trong `npm test`, không đổi package/dependency/lockfile.

## Checkpoint và tiếp tục

Không có blocker triển khai source. Chưa kiểm pipeline bằng GUI Windows, chưa triển khai vào bản cài, chưa kiểm tài khoản/dịch vụ thật; các việc đó nằm ngoài quyền task đêm.

Runner kiểm diff và commit theo quy trình. Khi được phép triển khai, build source vào bản đích rồi mở **Tổng quan → Từ ý tưởng đến bằng chứng**: Treat Trader ở Đo nhu cầu, ChomChom/Ruffwear ở Nội dung, sản phẩm mới chỉ có supplier URL ở Ý tưởng. Rollback bằng revert thay đổi source/test T03 và build lại, không thay dữ liệu.
