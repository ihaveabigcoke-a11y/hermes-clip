# M-20261114-video-recovery — Video trống và gói prompt trùng phút

Một main Codex; yêu cầu trực tiếp sửa màn Video. Tag trước sửa: before-M-20261114-video-recovery = 9d160c4. Không push/merge.

Đã sửa:
- Export manual cùng phút dùng đường dẫn mới khi trùng; không ghi đè gói cũ, receipt trỏ gói vừa xuất.
- Thư viện Video lấy clip và render đã kiểm của mọi dự án cùng sản phẩm, ghi dự án nguồn; render cũ không tính thành bản xuất của dự án mới. Đổi sản phẩm xóa lỗi cũ, dữ liệu record mới hơn thay bản local khi nhận clip.
- MUSE_NO_MEDIA và receipt chưa rõ có thông báo riêng; liên kết Tín hiệu/Tài khoản, Xuất gói prompt và Mở Hộp nhận hiện tại màn Video. Đường dẫn gói lấy từ receipt đã lưu nên còn sau reload.

Đã kiểm:
- TypeScript đạt; domain 270, API 29, desktop 498 đạt/1 OpenMontage skip. Chạy riêng OpenMontage local 1/1 đạt: tổng 798 kiểm khác nhau đạt, không còn skip chưa kiểm.
- Focused 6 auto-video + 16 manual-media đạt (đã nằm trong full suite, không cộng trùng).
- scripts/check-video-recovery-ui.mjs: 4 lần xuất cùng phút qua hai dự án, 5 clip + 3 render cũ phát được, không sửa record cũ; reload giữ lý do/path, đổi sản phẩm không lẫn clip/thông báo. 0 Muse gửi, 0 lỗi trang/request ngoài. 4 PNG tại outputs/M-20261114-video-recovery-ui, khổ 1366/1920.
- Assertion cũ chặn export cùng phút được thay bằng kiểm hành vi mới: path riêng và byte prompt/ảnh cũ bất biến; các assertion còn lại giữ nguyên. Không đổi data/evidence/dependency/lockfile, không mở DB/profile thật.

Build và nghiệm thu launcher: ghi SHA/giờ/kết quả cuối ở STATUS văn phòng sau commit trên cây sạch/app tắt.

Chưa kiểm: video Muse mới, quyền video/khu vực, chất lượng nội dung/SKU. Không gửi lại các lượt thật trong việc sửa này. Các kiểm media trên dùng fixture và công cụ local, không chứng nhận dịch vụ Muse.

Cách dùng: Video → chọn sản phẩm → Thư viện sản phẩm để xem clip cũ. Khi chờ file, Xuất gói prompt → tạo clip theo gói → Mở Hộp nhận; sau khi nhận đủ clip, Làm video. Tài khoản Muse để kiểm phiên; bật công tắc không đảm bảo Muse sẽ trả video.
