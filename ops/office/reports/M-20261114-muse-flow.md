# M-20261114-muse-flow

Làm video tiếp tục dự án tự động hiện có và chuyển cảnh thiếu từ nhập tay sang Muse khi người dùng bấm. Nháp chưa gửi được tiếp tục; không tự xuất gói manual khi Muse lỗi. Kết quả chưa rõ được giữ và có nút Kiểm tra kết quả Muse để nhận clip về muộn từ hội thoại cũ, không gửi mới. Giữ receipt, clip và bản xuất cũ.

Chờ phản hồi có media tới hết timeout cấu hình; không kết luận không media chỉ vì lời báo đang tạo đã ổn định 15 giây. Từ chối rõ vẫn trả lỗi sớm. Công tắc Muse do người dùng kiểm soát: lỗi một lượt không tự tắt; quota/phiên/captcha và chống gửi trùng vẫn chặn dispatch. Có nút tiếp tục sau khi kiểm tra, không cần tắt/bật công tắc.

Đã kiểm: typecheck, 272 domain + 29 API + 504 desktop = 805 đạt, 0 lỗi/0 skip. Focused 45 đã nằm trong tổng. scripts/check-muse-flow-ui.mjs đạt 3 trạng thái, 8 ảnh 1366/1920, không request ngoài/lỗi console. Muse giả cấp 5 clip; công cụ local thật xuất 3 MP4 720×1280 chung thân từ dự án manual có sẵn, 1 click; bấm lại không gửi/dựng thêm.

Tự review hermes-night-review Office mode tại văn phòng REVIEW-M-20261114-muse-flow.md. Không có reviewer độc lập. Build/launcher và Muse thật sẽ ghi sau khi commit cây sạch; không coi fixture là bằng chứng dịch vụ thật. Không đăng/DM/paid API, không công khai dữ liệu phiên mới. Không trực tiếp đọc/ghi AppData.

## Build và launcher

Source cec3004 đã push origin/main, remote SHA đối chiếu đúng. local:build đạt 14/11/2026 23:02:01 +07 trên cây sạch, app chưa chạy. Không tắt Muse/app thật để build trong phiên tiếp tục này.

scripts/check-muse-flow-desktop.ps1 chạy START-HERMES-CLIP.cmd bằng Electron thật với PRODUCT_LAB_QA_USER_DATA mới trong outputs. Đạt UI/IPC tiếp tục khi công tắc đã bật, bốn PNG 1366/1920, giữ receipt/submissions/giới hạn null qua reload và sau đóng QA êm. 0 lỗi JS/console/request ngoài. Không đóng phiên Muse người dùng. Ảnh outputs/M-20261114-muse-flow-desktop-ui.

## Chưa kiểm và blocker quyền

Muse thật chưa kiểm trên bản này. Bộ duyệt tự động từ chối mở launcher với dữ liệu AppData mặc định vì luật văn phòng cấm AppData/phiên thật trong kiểm thử. Đã hỏi người dùng ngoại lệ chỉ cho app tự dùng dữ liệu/phiên hiện có qua UI/IPC, giữ Muse bật; chưa nhận xác nhận tại checkpoint này. Không lách chặn, không coi ba MP4 fixture là video từ Muse thật. Không có lượt gửi dịch vụ thật mới trong phiên tiếp tục này.
