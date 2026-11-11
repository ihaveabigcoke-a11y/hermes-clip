# MeosuQTShop và Hermes Clip

Cập nhật 10/11/2026. Bản tham chiếu MeosuVideoQTshop-v5.2 trên máy người dùng. Phân tích phục vụ tái triển khai hành vi trên source Hermes hiện có.

## Bằng chứng khảo sát

Khảo sát ngày 08/11 đã thực hiện các lượt tạo media trên tài khoản do người dùng đăng nhập. Báo cáo HERMES-MEOSU-REPORT.md và meosu-survey/media-validation.json lưu trong checkpoint workspace. Khảo sát mới mở lại 11 mục điều hướng, thu điều khiển và screenshot. UI tự gọi POST nhận diện tên nhân vật khi mở màn hình tạo, các yêu cầu còn lại trong lượt khảo sát mới là GET. Các lượt tạo mới phải có bằng chứng riêng.

JavaScript giao diện chứa 8977 lời gọi decoder đã phân tích. Các hàm đọc được gồm create, createFrames, createWithConvs, openMerge, amSendRaw, wrOpen, afStart, afResume và cfPoll. Các điểm gọi tương ứng bao gồm /api/tasks, /api/accounts, /api/am/send, /api/writer/generate, /api/autofilm và /api/chainfilm. Bản exe có marker Nuitka. Source backend gốc chưa được phục hồi. Mô tả backend dưới đây là suy luận từ contract UI và những hành vi đã quan sát.

## Luồng suy ra

1. UI lưu cấu hình soạn, project và danh sách prompt. Tham chiếu được ghép theo từng prompt, dùng chung hoặc phối người mẫu/sản phẩm.
2. API local lưu task và phân phối qua tài khoản browser. Trạng thái/log được UI polling.
3. Kết quả Muse gắn hội thoại, media và tài khoản. File local có thư viện và preview riêng.
4. Writer tạo text để đưa vào form. Tạo media là bước tiếp theo.
5. Video nối cảnh quản lý tiến độ riêng và dùng khung cuối làm tham chiếu. Ghép thư viện lấy file đã tải.
6. Clone trong bản tham chiếu dùng Gemini để phân tích video. All Media truy vấn lịch sử Muse ngoài các job do app tự tạo.

## Đối chiếu chức năng

| Nhóm Meosu | Hermes hiện tại | Bằng chứng và khoảng trống |
| --- | --- | --- |
| Profile, đăng nhập, VPN, quota | Chromium profile riêng, Touch VPN, đọc Usage Muse | Đợt 11/11 đã gửi và nhận media thật qua ba profile ss, DD, 3CC. Phiên, VPN và quota đã đo. Danh tính tài khoản Muse trên từng profile chưa được đối chiếu độc lập |
| Tạo ảnh/video nền | Worker gửi, chờ, tải, kiểm tra file, nhập take | Các file Treat Trader thật từ lượt trước, video 720×1280 10 giây được phát lại |
| Writer ngay trong form | Nút Viết bằng Muse đưa phản hồi vào prompt nháp | Lượt nghiệm thu mới ghi trong writer-runtime.json |
| Research | Muse tìm nguồn, JSON schema, tự lưu ứng viên | Lượt Muse thật có thread và một ứng viên. Giá vốn/ship chưa biết giữ null, nguồn cần duyệt |
| Chat và hội thoại tiếp | Chat Muse theo project/profile, lịch sử SQLite | Đã thử thật ở lượt chat trước. Recovery và chống gửi lặp có regression |
| Soạn nội dung/landing | Muse tạo bản nháp, mở form có schema và CAS | Landing được kiểm tra riêng qua writer-runtime.json. Thu tiền còn chờ tài khoản và điều kiện thương mại |
| Người mẫu | Chọn reference Người mẫu + Sản phẩm, gửi vai trò theo thứ tự upload | Kiểm tra form và adapter bằng fixture. Kết quả nhận diện người/sản phẩm còn cần media thật |
| Ảnh đầu–cuối | Vai trò Ảnh đầu/Ảnh cuối, kiểm tra cặp và cảnh video, đính kèm vai trò trong prompt | Đợt 11/11 đã gửi cặp dùng cùng ảnh dây dắt với tên file riêng, tải/import MP4 thật 720×1280 10 giây. Toàn bộ móc và tay cầm nằm trong các khung đã kiểm. Muse vẫn thêm phóng gần, chưa nghiệm thu hai khung khác nhau hoặc bám chính xác đầu/cuối |
| Lưu template | Khung prompt từ concept sản phẩm | Đường hiện có. Thư viện template độc lập và phối ảnh luân phiên theo lô còn thiếu |
| Hàng đợi | Duyệt snapshot, pause/resume, đối soát, retry, lịch sử take | Suite worker có các trường hợp lỗi và legacy. Crash trong lúc nhà cung cấp đang xử lý chưa thử chủ động |
| Thư viện, tải và ghép | Take đã tải, chọn thứ tự body/variant, FFmpeg/OpenMontage | Đã chạy thật trích frame và ghép file từ các lượt trước |
| All Media | Có lịch sử và media của Hermes | Đồng bộ toàn bộ lịch sử của tài khoản Muse còn thiếu |
| Remix video | Reference chính hiện nhận ảnh | Upload video reference và nghiệm thu Remix còn thiếu |
| Clone | Có trích khung hình video local | Phân tích video bằng Muse và chuyển thành cảnh còn thiếu |
| Video dài tự nối | Có storyboard nhiều cảnh và ghép take | Tự trích khung cuối, chạy cảnh kế tiếp và phục hồi chuỗi còn thiếu |
| Characters, giọng, face swap | Có reference theo vai trò và notes | Thư viện nhân vật riêng, @mention, face swap/lip-sync chưa nghiệm thu |
| Proxy, điều phối tài khoản, remote worker | Có proxy/profile và khóa công việc local | Bulk proxy, remote worker và nhiều tài khoản thật còn thiếu |
| Cài đặt, hướng dẫn | Cấu hình Muse, dữ liệu local, tích hợp media | Cập nhật app tự động và hướng dẫn tương đương toàn bộ Meosu còn thiếu |

## Quy tắc tích hợp

Hermes dùng domain và kho dữ liệu hiện có. Tất cả thao tác phát sinh qua Muse tuân thủ giới hạn 3 lượt/profile/đợt, giả định một tài khoản cho mỗi profile. Chat cũng được tính vào bộ đếm như quyết định kỹ thuật đã bàn giao ở checkpoint trước. Kết quả model được schema kiểm tra, thao tác bên ngoài và duyệt nội dung đi qua các nút của app. Nguồn, phiên đăng nhập và URL hội thoại có mức bằng chứng riêng với file hoặc phản hồi nhận được.

## Thứ tự còn lại

Hoàn tất nghiệm thu media thật cho reference đầu–cuối và người mẫu. Sau đó bổ sung video reference/Remix, phân tích reference qua Muse, chuỗi video có checkpoint và thư viện nhân vật/template. All Media và nhiều tài khoản cần kiểm tra contract provider hiện hành. Phần Instagram và thanh toán phụ thuộc tài khoản, quyền API cùng quyết định thương mại đã ghi trong PROJECT-NOTES.md.

## Đợt tối ưu điều hướng ngày 10/11/2026

Đã mở lại đủ 11 màn hình Meosu, chuyển các mode ảnh/video, mở mẫu prompt, chọn video có sẵn trong thư viện và mở hộp ghép, đọc nhân vật đã lưu, khảo sát form video dài/Remix/Clone, tải 16 hội thoại All Media và mở một hội thoại. Checkpoint ux-review-20261110 có runtime-inventory.json, meosu-functional.json và ảnh. Lượt này có 0 lần gửi tạo media hoặc text mới tới Muse. Các file thật của đợt 08/11 tiếp tục là bằng chứng cho khả năng tạo trước đó.

Hermes đặt tác vụ tạo media và tài khoản Muse lên đầu menu. Instagram/landing nằm cuối nhóm Kinh doanh có thể thu gọn. Studio cũ dùng nhãn Concept đã lưu để nhận biết dữ liệu khác với hàng đợi Muse. Tạo & duyệt, Ảnh tham chiếu, Thư viện, Ghép & xuất là các bước chính. Các công cụ phụ có selector riêng. Đã sửa mode ảnh/video dùng chung, mất nháp chat khi chuyển view, ảnh mới chưa tự chọn và stage sai sau reload/Back/Forward.

App hiện có ba profile ss, DD và 3CC. Trạng thái session/quota đọc được trong lần khảo sát. Khả năng phân phối, phục hồi lỗi và tạo media thật trên từng profile cần bằng chứng chạy riêng. Các hành vi backend Meosu tiếp tục được mô tả từ UI/API và kết quả thực tế đã ghi nhận.

## Kiểm chứng bổ sung ngày 11/11/2026

Checkpoint overnight-20261111 ghi ba sản phẩm, hai đợt chạy và bảy file mới tải/import. Ba bản giao cuối có SHA-256, ffprobe, giải mã toàn bộ và playback sau restart. Ba profile đã nhận file. Hạn mức giữ ba lượt chat/tạo media mỗi profile trong mỗi đợt.

Đã sửa thu hồi RAM từ profile nền rảnh, phản hồi chỉ có văn bản, đối soát kết quả và cặp ảnh trùng nguồn. Hàng đợi gom theo cảnh, phân loại được lưu, tác vụ lỗi đã có kết quả thay thế nằm trong Lịch sử. Thư viện có bộ lọc, bản chính và liên kết đúng phiên bản. Lỗi API đầu phiên có nút thử lại, lỗi liên kết file có thông báo.

Ba video vẫn chờ duyệt hình ảnh vì Muse thay đổi góc máy/phóng gần so với prompt. Các nhóm All Media toàn tài khoản, Remix, Clone qua Muse, tự nối cảnh, thư viện nhân vật và publisher Instagram tiếp tục thiếu phần triển khai hoặc nghiệm thu đã ghi ở bảng trên.
