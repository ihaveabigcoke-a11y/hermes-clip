# M-20261114-muse-flow

Làm video tiếp tục dự án tự động hiện có và chuyển cảnh thiếu từ nhập tay sang Muse khi người dùng bấm. Nháp chưa gửi được tiếp tục; không tự xuất gói manual khi Muse lỗi. Kết quả chưa rõ được giữ và có nút Kiểm tra kết quả Muse để nhận clip về muộn từ hội thoại cũ, không gửi mới. Giữ receipt, clip và bản xuất cũ.

Chờ phản hồi có media tới hết timeout cấu hình; không kết luận không media chỉ vì lời báo đang tạo đã ổn định 15 giây. Từ chối rõ vẫn trả lỗi sớm. Công tắc Muse do người dùng kiểm soát: lỗi một lượt không tự tắt; quota/phiên/captcha và chống gửi trùng vẫn chặn dispatch. Có nút tiếp tục sau khi kiểm tra, không cần tắt/bật công tắc.

Đã kiểm: typecheck, 272 domain + 29 API + 504 desktop = 805 đạt, 0 lỗi/0 skip. Focused 45 đã nằm trong tổng. scripts/check-muse-flow-ui.mjs đạt 3 trạng thái, 8 ảnh 1366/1920, không request ngoài/lỗi console. Muse giả cấp 5 clip; công cụ local thật xuất 3 MP4 720×1280 chung thân từ dự án manual có sẵn, 1 click; bấm lại không gửi/dựng thêm.

Tự review hermes-night-review Office mode tại văn phòng REVIEW-M-20261114-muse-flow.md. Không có reviewer độc lập. Build/launcher và Muse thật sẽ ghi sau khi commit cây sạch; không coi fixture là bằng chứng dịch vụ thật. Không đăng/DM/paid API, không công khai dữ liệu phiên mới. Không trực tiếp đọc/ghi AppData.
