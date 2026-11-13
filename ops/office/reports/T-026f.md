# T-026f — đạt lượt nghiệm thu cuối

Một main agent tự review theo hermes-night-review Office mode. Chuỗi Làm video dùng production commands/receipt, ba kỹ thuật problem/absurd/curiosity, cùng đoạn thân, giữ âm thanh; chọn đoạn theo khung 0–4–8–15 giây. Ba hook là ba lựa chọn trên cùng thước, không nối tiếp. Deep link có stage vẫn vào editor cũ. Trần Muse chỉnh trong Cài đặt; giữ giãn ít nhất 60 giây và phanh từ chối/hai lỗi. Mã lỗi lưu cùng receipt; từ chối rõ chuyển tay, kết quả chưa rõ vẫn cần đối soát.

Đã kiểm: typecheck; 265 domain + 29 API + 490 desktop = **784 pass, 1 skip, 0 fail**. UI nguồn build trong workspace QA riêng: 1 click Làm video → 3 MP4 720×1280, khoảng 15 giây; ba kỹ thuật khác nhau, cùng đoạn thân/hash, tên đúng mẫu; bấm lại không gửi/dựng trùng. Muse giả từ chối sau khi có dấu vết submitted → 5 cảnh manual, Tín hiệu Chờ file tay; receipt needs_attention giữ nguyên. Unit test riêng xác nhận kết quả unknown không bị đánh dấu đối soát. Không hạ assertion.

Đã đọc ảnh 1366/1920 đầy, rỗng, từ chối: outputs/T-026f-ui, T-026f-empty-ui, T-026f-refused-ui (7 PNG). Log/JSON: outputs/T-026f-retry2-suite.json, T-026f-acceptance-ui.log, T-026f-media/result-*.json. Fixture tạo MP4 kỹ thuật mới bằng FFmpeg; OpenMontage local thật. Không Muse thật hay AppData/dữ liệu người dùng. Sửa fixture mkdir/preparedToken/bộ chọn bản xuất và trạng thái bridge đầy đủ; giữ log lỗi cũ.

Rủi ro/chưa kiểm: chất lượng nội dung, SKU và Muse thật; toàn bộ luồng đổi hook qua renderer sẽ được kiểm thêm ở tổng nghiệm thu. Tên file vật lý trong IPC được review, UI dùng bridge render giả gọi OpenMontage thật. Không chứng nhận tài khoản. Không thêm dependency hoặc sửa data/evidence. HEAD 3ba68eb, branch main và stash không đổi trong lượt review; commit thực hiện sau review.
