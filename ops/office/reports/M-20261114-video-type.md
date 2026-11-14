# M-20261114-video-type — không nhận thumbnail tài liệu thành video

Khi Muse trả gói prompt Markdown có thumbnail, adapter cũ nhận đó là media rồi chờ nút tải video. Job video nay yêu cầu phần tử video ở submit, kiểm lại hội thoại và tải receipt cũ. Tài liệu đã kết thúc/ổn định 15 giây báo MUSE_NO_MEDIA kèm phản hồi; phản hồi đang tạo hoặc trung tính vẫn chờ clip đến timeout cấu hình. Giữ công tắc Muse và toàn bộ receipt.

Đã kiểm: typecheck; 272 domain + 29 API + 505 desktop đạt; test OpenMontage bị skip do thiếu env đã chạy riêng 1/1 đạt. Tổng 807 kiểm khác nhau đạt, không lỗi còn lại. Hai test DOM mới kiểm thumbnail MD, chế độ ảnh, receipt tài liệu không download, không gửi lần hai và clip tới muộn. Test guard cũ giữ nguyên và đạt.

scripts/check-muse-flow-ui.mjs chạy lại đạt tám ảnh 1366/1920; fixture Muse + OpenMontage thật local cho một click ra ba MP4, không nhân đôi khi bấm lại, lỗi giữ công tắc bật và không tự xuất gói manual. Ảnh và log nằm trong outputs, không đưa dữ liệu phiên thật vào Git.

Tự review Office mode ở văn phòng: REVIEW-M-20261114-video-type.md. Diff không đổi theme/font, schema, dependency/lockfile hoặc data/evidence. Quyền dùng phiên thật qua app và push đã được người dùng cấp trực tiếp. Không đọc DB/profile/cookie trực tiếp, không tắt Muse, không force-push/merge.

Kết quả Muse thật sau build ghi riêng ở STATUS văn phòng; chưa lấy fixture làm bằng chứng dịch vụ tạo được clip mới. Không gửi lại hai receipt đã có chỉ để kiểm bản sửa.
