# T22 · Gửi phân tích video mẫu qua Muse, có đính kèm contact sheet

Phụ thuộc: T21.

## Bối cảnh
- `desktop/src/muse-chat.mjs` → `MuseChat.send` hiện chỉ gửi text. Thread mới đi qua `adapter.prepare(page, {prompt, references: []})`.
- `desktop/src/muse.mjs` → `MuseAdapter.prepare` **đã biết đính kèm reference ở chat mode**, và đang được dùng cho tạo ảnh/video:
  - `config.upload` + `setInputFiles`;
  - chờ attachment xong trước khi gửi.
- Lượt Muse chỉ bị trừ ở `beginSubmit`, sau bước `prepare`.

## Mục tiêu
1. `MuseChat.send` nhận thêm `attachments` optional, chỉ cho thread mới (không có `parentId`):
   - Tối đa 4 ảnh JPEG/PNG, mỗi ảnh ≤ 8 MB.
   - Đường dẫn phải nằm trong thư mục dữ liệu tác vụ tích hợp/tham chiếu của app. Kiểm như confinement hiện có: từ chối đường dẫn ngoài thư mục, symlink và file không phải ảnh.
   - Đính kèm bằng cách truyền vào `references` của `adapter.prepare`. Không viết lại cơ chế upload.
2. **Fingerprint:**
   - Khi có attachments, fingerprint gồm sha256 của từng ảnh.
   - Khi **không có** attachments, fingerprint phải **giống hệt cách tính cũ**, để receipt và chống gửi trùng của chat cũ vẫn đúng.
3. **Fail closed, không mất lượt:**
   - Lỗi upload, attachment không hiện hoặc thiếu cấu hình `upload` → chat chuyển `failed` với lý do tiếng Việt.
   - Trường hợp này không gửi prompt và không gọi `beginSubmit`.
4. **IPC/preload:** mở đúng tham số mới qua đường gọi hiện có. Renderer không được truyền đường dẫn tùy ý: chỉ truyền id tác vụ tham chiếu, main tự lấy đường dẫn sheet từ `structure.json`.
5. **UI trong `reference-video.tsx`:** nút "Phân tích bằng Muse".
   - Chọn profile Muse đang bật.
   - Gửi prompt của T21 cùng sheet thưa và sheet dày đầu tiên.
   - Chờ phản hồi như chat thường, rồi gọi `parseFormulaAnalysis`.
   - Điền kết quả để người dùng **duyệt**, không tự lưu.
   - Lỗi parse thì hiện nút "Gửi tiếp yêu cầu sửa JSON", dùng `parentId` như luồng research.
   - Hiển thị rõ: "Tốn 1 lượt Muse".
6. Thêm `docs/MUSE-ANALYSIS.md`: cách kiểm vào buổi sáng bằng 1 video mẫu, tốn 1 lượt; cách nhận biết upload ở chat có chạy hay không.

## Giữ nguyên
- Chat text cũ không đổi hành vi.
- Luồng tạo media dùng `references` như cũ.

## Nghiệm thu
Test với page giả, theo kiểu `desktop/test/muse-chat.test.mjs` và `muse.test.mjs`:
- Có attachments → `setInputFiles` nhận đúng file, trước khi gửi.
- Upload lỗi hoặc thiếu `upload` → `failed`, lượt đợt không đổi, không bấm gửi.
- Đường dẫn ngoài thư mục, hoặc quá 4 ảnh → bị từ chối.
- Không có attachments → fingerprint bằng đúng giá trị tính theo công thức cũ.
- Wiring IPC/preload có test.

`npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.

## Chưa kiểm được đêm nay
- Muse thật: không mở Muse. Ghi vào CHUA KIEM CHUNG.
