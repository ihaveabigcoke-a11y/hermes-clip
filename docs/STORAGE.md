# Lưu trữ Hermes Clip Local

Nguồn chạy mặc định: Downloads/Product-Lab-Local/Product-Lab-Local. Dữ liệu thật lấy từ Electron userData (AppData/Roaming/product-lab-desktop), không lấy từ thư mục build. Worker dùng worker.sqlite; workspace dùng worker/workspace/workspace.sqlite. Giữ nguyên tất cả SQLite, phiên/proxy, ảnh tham chiếu, output cần đối soát và file xuất.

File media mới là bất biến. Tải Muse ghi một file tạm riêng, xác minh checksum rồi công bố file đích; xóa artifact Playwright sau đó. Kho local dùng hard link cho các file cùng nội dung đã xác minh, giữ mỗi asset key và lịch sử job độc lập. Xóa một asset không xóa dữ liệu còn được link khác dùng. Không chỉnh nội dung media tại chỗ; xuất luôn dùng file mới. Upload lặp cùng bytes có ID theo hash nội dung và owner, còn commandId giữ idempotency từng lượt. File xuất là lựa chọn người dùng, không được tự dọn.

Hàng đợi, upload, render và nghiên cứu mới giữ ít nhất 2 GiB dung lượng dự phòng. Không hủy hoặc gửi lại tác vụ đã gửi khi thiếu chỗ. Thumbnail là JPEG 320px, tối đa 128 MiB; không tạo video preview. Chromium HTTP/media cache đặt 128 MiB mỗi hồ sơ; Electron đặt 64 MiB. Code cache được thu gọn khi mở hồ sơ đang đóng; đây không phải hạn mức cho cookies, IndexedDB hay dữ liệu phiên. Các giới hạn cache Chromium là hướng dẫn cho Chromium, không là quota toàn bộ profile. App không ghi nhật ký mỗi vòng poll khi rảnh.

Các mức trong storage-policy.mjs có thể được cấu hình qua khóa storage_policy của Worker Store, với cùng tên trong STORAGE_DEFAULTS. Đây là cấu hình kỹ thuật, chưa có form trong Cài đặt. Log bảo trì xoay ở 4 MiB, giữ 3 bản cũ; lịch sử nghiệp vụ không bị dọn. Khi khởi động và mỗi giờ, chỉ file *.hermes-part-UUID hơn 24 giờ, không nằm trong tham chiếu job, mới được thu hồi. Không quét các file .tmp không rõ nguồn. File hoàn chỉnh và file lỗi cần kiểm tra vẫn được giữ.

Kiểm thử nên dùng một fixture nhỏ tự hủy trong finally. Nếu kiểm tra dữ liệu thật cần snapshot, dùng SQLite backup API và hard link cho media bất biến, không chép toàn bộ profile/cache. Giữ ảnh chụp và JSON kết quả, không tạo nhiều snapshot media mới theo timestamp để theo dõi lúc rảnh.
