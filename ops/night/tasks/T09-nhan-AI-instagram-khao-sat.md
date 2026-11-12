# T09 · Nhãn AI khi đăng Instagram (chỉ khảo sát code + chuẩn bị, KHÔNG mở Instagram)

## Bối cảnh
- Meta yêu cầu gắn nhãn khi đăng video trông như thật được tạo hoặc chỉnh bằng AI, và có thể phạt nếu không gắn. Instagram cho bật "Label as made with AI" khi tạo Reel.
- Script đăng hiện tại (`desktop/src/instagram.mjs`, `instagram-browser.mjs`, `instagram-adapter.mjs`) không bật nhãn này. Caption chỉ ghi "AI-generated concept".

## Mục tiêu (đêm nay)
1. Đọc luồng đăng và chỉ ra chính xác bước nào (sau chọn video, trước Share) cần bật nhãn AI.
2. Thêm cấu hình `aiLabel` cho mỗi lượt đăng hoặc content_plan, mặc định `required` cho nội dung tạo bằng Muse.
3. Viết phần điều khiển trình duyệt để tìm và bật công tắc nhãn AI theo cách **fail closed**: không tìm thấy hoặc không xác nhận được công tắc đã bật thì **dừng trước Share**, ghi trạng thái "cần đối soát/thao tác tay". Không được đăng khi không có nhãn.
4. Test bằng DOM fixture tự dựng (HTML tĩnh trong test), không truy cập instagram.com.
5. Ghi `docs/INSTAGRAM-AI-LABEL.md`: selector hoặc chiến lược đang dùng, vì sao chưa kiểm chứng trên Instagram thật, và cách người dùng kiểm vào sáng mai với một bài nháp, không bấm Share.

## Giữ nguyên
- Một lượt Share duy nhất, snapshot tài khoản/video/caption, đối soát khi không rõ.
- Không đổi hành vi đăng nếu `aiLabel` là `off`.

## Nghiệm thu
- Test fixture: có công tắc → bật → tiếp tục; không có công tắc → dừng trước Share với trạng thái đúng.
- `npm run test:desktop` không hỏng thêm.
- Báo cáo ghi rõ "CHƯA kiểm trên Instagram thật".
