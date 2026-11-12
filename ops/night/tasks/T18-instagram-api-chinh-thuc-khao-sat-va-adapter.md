# T18 · Instagram API chính thức: adapter có cờ, mặc định TẮT (không gọi mạng)

## Bối cảnh
- Hiện đăng bài và đo số liệu bằng Playwright điều khiển trình duyệt (`desktop/src/instagram*.mjs`). Với 3 tài khoản, cách này dễ hỏng khi Instagram đổi giao diện, và dễ bị chặn.
- Meta có Instagram API cho tài khoản chuyên nghiệp: đăng Reels (container → upload → publish), đọc insights, đọc comment, trả lời riêng comment. Dùng "Instagram API with Instagram Login" thì không cần Facebook Page. Giới hạn đăng qua API khoảng 100 bài / 24 giờ mỗi tài khoản.
- Chưa có Meta app hay token. Đêm nay **không** gọi mạng, không tạo app.

## Mục tiêu
1. Module `desktop/src/instagram-api.mjs`: client thuần với `fetch` được inject, không thêm dependency. Gồm:
   - tạo container Reels;
   - upload video (resumable upload theo tài liệu, nếu không chắc endpoint thì để TODO có cờ);
   - kiểm `status_code`;
   - publish;
   - đọc insights của media (plays/views, reach, saved, shares, comments, likes);
   - đọc comments (phân trang);
   - đọc `content_publishing_limit`.
   
   Ghi rõ trong code: mỗi endpoint và field cần đối chiếu với tài liệu Meta hiện hành trước khi bật.
2. Cấu hình theo tài khoản: `apiMode: 'browser' | 'api'` (mặc định `browser`), token lưu bằng cơ chế mã hóa hiện có (như mật khẩu proxy). Không bao giờ trả token ra UI hay log.
3. Luồng đăng chọn adapter theo `apiMode`, giữ nguyên hợp đồng hiện tại: snapshot tài khoản/video/caption, một lượt publish, đối soát khi không rõ, không đăng trùng. Với API: lưu container id làm receipt; lỗi giữa chừng thì trạng thái "cần đối soát", không publish lại mù quáng.
4. Đo số liệu: adapter API trả cùng shape `social_metric` hiện có; null khác 0; ghi nguồn `api`.
5. `docs/INSTAGRAM-API.md`: các bước tạo Meta app ở chế độ phát triển cho tài khoản của chính mình, quyền cần (`instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments`), cách lấy token, cách bật `apiMode` cho từng tài khoản. Ghi rõ phần chưa kiểm chứng.

## Giữ nguyên
- Đường Playwright hiện tại và mọi test của nó. Mặc định vẫn là `browser`.

## Nghiệm thu
- Test với `fetch` giả:
  - đăng Reels thành công (đúng thứ tự call);
  - container lỗi → không publish;
  - timeout giữa chừng → "cần đối soát", không gọi publish lần hai;
  - insights map đúng, field thiếu → null;
  - comments phân trang;
  - token không xuất hiện trong `status()`/log.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
