# T03 · Sửa bước tiến độ của sản phẩm

## Vấn đề (có bằng chứng)
- `components/lab/app.tsx` → `function stage(p)` xếp sản phẩm vào 4 bậc `stageNames = ["Ý tưởng", "Kiểm chứng", "Nội dung", "Đo nhu cầu"]`. Hàm chỉ đếm record `experiment`, `creative`, `metric` (mô hình Product Lab cũ).
- Dữ liệu thật (`data/2026-11-11/workspace-records.json`) có 0 record loại đó. Luồng hiện tại dùng `production`, `content_plan`, `social_metric`. Hệ quả: cả 3 sản phẩm đều ở bậc "Kiểm chứng", kể cả Treat Trader đã đăng thật và có số liệu.
- Bậc 1 được bật chỉ vì có `supplierUrl`, mà sản phẩm tạo từ research luôn có trường này.

## Mục tiêu
1. Tách logic ra hàm thuần có test, ví dụ trong `lib/lab/` (`productStage(product, records)`). Gợi ý bậc (bạn có thể chỉnh nếu thấy hợp lý hơn, nhưng ghi lý do):
   - 0 Ý tưởng: mới có hồ sơ.
   - 1 Kiểm chứng: có `sampleVerified` hoặc ghi chú báo giá/bằng chứng thật. **Không** tính `supplierUrl` đơn thuần.
   - 2 Nội dung: có `production` của sản phẩm.
   - 3 Đo nhu cầu: có `content_plan` đã đăng (`status` published…) hoặc có `social_metric` của plan thuộc sản phẩm.
   - Vẫn tính record cũ `experiment`/`creative`/`metric` nếu có, để không hồi quy.
2. `app.tsx` dùng hàm mới. Pipeline panel hiển thị đúng.

## Nghiệm thu
- Test với fixture dựng theo cấu trúc `workspace-records.json`: Treat Trader → bậc 3; ChomChom và Ruffwear (có production, plan nháp) → bậc 2; sản phẩm mới chỉ có supplierUrl → bậc 0.
- `npm test`, `npm run typecheck`, `npm run local:build` qua.
