# T17 · Link UTM cho từng tài khoản × hook

## Bối cảnh
- DM tự động (Meta Business Suite) sẽ gửi link landing cho người comment từ khóa. Muốn biết lượt bấm đến từ tài khoản nào, hook nào, thì mỗi cặp phải có link riêng.
- Đã có `landing_page`, `content_plan` (gắn `accountId`, `productionId`), variant/hook trong production.

## Mục tiêu
1. Hàm thuần `buildUtmLink(baseUrl, {productSlug, accountHandle, planId, hookId, ctaKeyword})`:
   - `utm_source=instagram`, `utm_medium=dm`, `utm_campaign=<productSlug>`, `utm_content=<account>-<hook>`, `utm_term=<ctaKeyword>`.
   - Chuẩn hóa slug ASCII, giữ nguyên query sẵn có của baseUrl.
   - Từ chối baseUrl không phải `https:`.
2. Trong chi tiết content plan: ô "Link landing gốc" (lấy mặc định từ `landing_page` của sản phẩm nếu có), nút tạo link UTM, nút copy. Lưu link vào plan.
3. Hiển thị link UTM trong bảng tài khoản × nội dung (rút gọn, có `title` đầy đủ).
4. Không gọi mạng, không rút gọn link qua dịch vụ ngoài.

## Nghiệm thu
- Test thuần: đủ tham số, giữ query cũ, slug tiếng Việt có dấu thành ASCII, từ chối `http:`/`javascript:`.
- Test lưu và đọc plan có `utmLink`; plan cũ parse được.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
