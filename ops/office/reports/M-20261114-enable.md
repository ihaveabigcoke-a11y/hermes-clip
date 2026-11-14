# M-20261114-enable — khôi phục bật Muse và trần nội bộ tùy chọn

Người dùng trực tiếp yêu cầu bật Muse và sửa lỗi giới hạn. Bản trước chỉ giải thích lỗi; stop của phiên vẫn khóa công tắc. Bản này thêm Bật lại Muse có xác nhận, giữ biên nhận/lượt đã gửi/kết quả và ghi lịch sử resume. Worker giữ tạm dừng hàng chờ đến khi người dùng chọn tác vụ mới; không mở browser hoặc gửi lại job cũ khi bật.

Cài đặt cho chọn Không giới hạn lượt trong Hermes (null). Gói và Làm video hiểu null là không áp trần nội bộ; số 0 của trần hữu hạn vẫn chặn. Giữ nhịp tối thiểu 60 giây, hạn mức dịch vụ, captcha, đăng nhập, cảnh báo và đối soát. Không tự đổi giới hạn đã lưu; thao tác chọn null được thực hiện theo yêu cầu người dùng trong app.

Đã kiểm: 21 kiểm riêng; typecheck, 268 domain + 29 API + 498 desktop; OpenMontage skip được chạy riêng 1/1 đạt = 796 kiểm khác nhau đạt. Lần OpenMontage đầu chọn nhầm đường dẫn executable, sửa môi trường rồi đạt; không sửa assertion. UI fixture 10 PNG 1366/1920: bật/tắt, stop tới muộn, bật lại, lưu null sau reload, 0 gửi/0 browser/receipt nguyên vẹn.

Không sửa data/evidence/lockfile/dependency; không gọi dịch vụ thật trong test. AppData/DB/profile thật không được mở bằng công cụ kiểm. Bằng chứng local ở outputs/M-20261114-enable-checks và outputs/M-20261114-enable-ui. Review văn phòng REVIEW-M-20261114-enable.md; SHA/build, kiểm launcher QA và trạng thái bật app thật sẽ ghi tại STATUS. Không push.

Chưa kiểm: tạo clip mới từ Muse sau thay đổi; quyền video/khu vực của dịch vụ không thay bởi bản sửa này.
