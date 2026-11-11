# Hermes Clip — dọn ổ đĩa và nghiên cứu 10 sản phẩm

Bản cài đã sửa và mở lại ngày 11/11/2026. Chỉ một agent. Đo cuối: 2026-11-11T11:09:45.605Z.

## Kết quả dung lượng

Đã giải phóng **2.976.159.255 byte (2.976 GB / 2.77 GiB)** từ file thừa đã xác minh. Xóa 8.770 file cache/build; 602 bản sao media được chuyển sang hardlink, giữ nguyên mọi đường dẫn và nội dung. Không xóa video gốc, SQLite, ảnh tham chiếu, file xuất, hồ sơ Muse hoặc cấu hình proxy.

| Mốc đo ổ C | Byte trống | Quy đổi |
|---|---:|---:|
| Lần đo đầu trong phiên, trước khảo sát | 84.907.868.160 | 84.908 GB / 79.08 GiB |
| Ngay trước dọn | 85.609.570.304 | 85.610 GB / 79.73 GiB |
| Ngay sau dọn | 88.594.579.456 | 88.595 GB / 82.51 GiB |
| Sau build, kiểm thử và mở lại app | 88.204.103.680 | 88.204 GB / 82.15 GiB |

Mức tăng trống ngay trong lượt dọn là 2.985.009.152 byte. Con số này có cả cấp phát cụm NTFS và hoạt động nền của máy, nên báo riêng với tổng byte các file đã xử lý. Windows thường hiển thị GiB dưới nhãn GB. Không có phép đo trước đó đủ để xác định toàn bộ mức giảm từ khoảng 120 xuống 80 GB là do Hermes.

| Nhóm đã xử lý | Số file | Byte file được thu hồi |
|---|---:|---:|
| Bản build giao diện cũ tái tạo được | 501 | 21.874.062 (0.022 GB) |
| Cache riêng Hermes/Chromium | 8.269 | 426.777.418 (0.427 GB) |
| Bản sao media trong dữ liệu kiểm thử → hardlink | 585 | 2.447.296.343 (2.447 GB) |
| Bản tải Muse đã nhập → hardlink | 17 | 80.211.432 (0.080 GB) |

Danh sách đầy đủ đường dẫn, thao tác, dung lượng và checksum: [DANH-SACH-DA-DON.csv](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/outputs/Hermes-Clip-Storage-Research-2026-11-11/DANH-SACH-DA-DON.csv>). Bằng chứng xóa/hợp nhất: [cleanup-result.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/cleanup-result.json>). Một file cache journal thay đổi kích thước trong lúc đo được bỏ qua. Trước xử lý đã đối chiếu DB, checksum, đường dẫn không qua junction, tiến trình đang dùng và khóa file.

## Thư mục lớn và công dụng

| Đường dẫn tuyệt đối | Trước: tổng độ dài file | Sau: byte file duy nhất | Công dụng / xử lý |
|---|---:|---:|---|
| C:\Users\ADMIN\Documents\ChatGPT\ECOM BẰNG VIDEO AI\.product-lab-repair | 4.476 GB | 2.138 GB | Bản sao source, checkpoint và dữ liệu kiểm thử; media đã dùng hardlink |
| C:\Users\ADMIN\Downloads\Product-Lab-Local\Product-Lab-Local | 1.023 GB | 1.005 GB | Source/binary đang chạy; Electron, FFmpeg và tích hợp |
| C:\Users\ADMIN\AppData\Roaming\product-lab-desktop | 0.709 GB | 0.243 GB | SQLite, phiên đăng nhập, hồ sơ, media và cache Electron |
| C:\Users\ADMIN\AppData\Roaming\product-lab-desktop\worker\workspace\media | 0.088 GB | 0.088 GB | Ảnh/video Thư viện gốc, được giữ |
| C:\Users\ADMIN\AppData\Roaming\product-lab-desktop\worker\outputs | 0.080 GB | 0.080 GB | Kết quả Muse; nay dùng chung byte với Thư viện |
| C:\Users\ADMIN\AppData\Roaming\product-lab-desktop\worker\profiles | 0.387 GB | 0.081 GB | Hồ sơ Muse/Chromium; giữ cookies, đăng nhập, proxy |
| C:\Users\ADMIN\AppData\Local\ms-playwright | 0.753 GB | 0.753 GB | Chromium dùng chung; bản 1248 đang được dùng |
| C:\Users\ADMIN\AppData\Local\npm-cache | 0.737 GB | 0.737 GB | Cache npm dùng chung; không xóa |
| C:\Users\ADMIN\AppData\Local\Temp | 0.724 GB | 0.906 GB | Temp Windows dùng chung; không xóa phần chưa biết nguồn |

“Byte file duy nhất” đã loại trùng NTFS file ID trong từng thư mục, chưa phải số cụm vật lý trên ổ. Không cộng các dòng cha/con hoặc hai thư mục dùng chung hardlink. Properties của thư mục có thể vẫn cộng các đường dẫn như những file riêng dù ổ đĩa đã thu hồi dung lượng.

Thư viện gốc chỉ khoảng **88 MB**; chưa phải nguồn chiếm hàng chục GB. File đã xuất được giữ độc lập. Không phát hiện app tạo thêm một bộ video preview: danh sách nay dùng JPEG 320 px, chọn xem mới tải video gốc. Các bản ghép chủ động là file xuất, không coi là rác.

Cache dùng chung: Playwright 0,753 GB gồm chromium-1248, headless-1248, ffmpeg-1013 và winldd-1007, khớp browsers.json của bản cài; giữ nguyên. npm 0,737 GB cũng giữ nguyên vì không riêng Hermes. Không tìm thấy cache Electron dùng chung tại Local/electron trong lần quét. Electron binary 0,375 GB trong bản cài là dependency đang chạy, không phải bộ cài cũ.

Các vị trí lớn khác, chưa quy cho Hermes Clip và **không dọn**:

| Đường dẫn | Dung lượng đo được | Ghi nhận |
|---|---:|---|
| C:/Users/ADMIN/Documents/Codex/2026-11-03/l-m-he | 21,581 GB | Dự án khác; chưa xác định phần tăng theo thời gian |
| C:/Users/ADMIN/AppData/Local/Claude-3p | 11,465 GB | Thư mục ứng dụng khác, gồm vm_bundles |
| C:/Users/ADMIN/AppData/Local/hermes/models | 5,627 GB | Không phải đường dẫn dữ liệu Hermes Clip đang cấu hình |
| C:/Users/ADMIN/AppData/Local/Google/Chrome | 5,458 GB | Browser dùng chung, không phải các profile Muse riêng của Clip |
| C:/Users/ADMIN/AppData/Local/CocCoc | 4,653 GB | Browser khác |

Temp còn khoảng 0,906 GB, có file .tmp chưa rõ nguồn và log Word; giữ nguyên. Chi tiết khảo sát ngoài Clip: [user-disk.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/user-disk.json>). Khảo sát chưa xác minh nguồn tăng của toàn ổ C, hệ thống Windows hoặc các ngày trước; không coi các số trên là nguyên nhân đã chứng minh của mức giảm 40 GB.

## Nguyên nhân đã xác minh và bản sửa

Đã tích hợp 35 file source/test/tài liệu, cùng 43 file build. Backup và manifest nằm trong thư mục checkpoint; thay đổi đều đã đưa vào bản cài Downloads/Product-Lab-Local/Product-Lab-Local.

1. **Bản sao QA lặp lại:** các script chụp/kiểm thử chép cả kho media qua từng snapshot. 585 file trùng checksum chiếm 2,447 GB. Đã chia sẻ byte bằng hardlink và sửa 10 helper snapshot để không tiếp tục chép media. Snapshot chỉ được đọc media; nội dung mới dùng khóa file mới.
2. **Muse → Thư viện lưu hai lần:** 17 kết quả đã nhập tạo thêm 80,2 MB. Giờ kiểm checksum và dùng chung file bất biến, không ghi đè file cũ. Tải/nhập lại cùng receipt không tạo thêm phiên bản; hai lượt tạo độc lập vẫn giữ hai mục lịch sử, có thể dùng chung byte khi nội dung thật sự giống nhau.
3. **Tải tạm:** tải vào file riêng, xác minh kích thước/checksum rồi công bố file đích. Xóa artifact tải của Playwright sau xử lý. Khi mở app, chỉ dọn mẫu file tạm do Hermes đặt tên, quá 24 giờ và không được job tham chiếu; không quét xóa mọi .tmp. File kết quả chưa đối soát được giữ.
4. **Cache/nhật ký:** Electron 64 MiB cho cache đĩa và cache media; Chromium 128 MiB mỗi loại/profile; Code Cache 64 MiB/profile, các cache GPU liên quan 16 MiB; thumbnail 128 MiB. Profile chỉ dọn cache khi đóng. Nhật ký bảo trì xoay ở 4 MiB, giữ 3 bản cũ; không ghi liên tục khi không có gì cần dọn. Lịch sử tác vụ trong SQLite không bị cắt.
5. **Xem video:** Thư viện, danh sách phiên bản và các danh sách tham chiếu/bản xuất dùng ảnh thu nhỏ; video gốc mở khi chọn phát. Ba thumbnail thật kiểm tra chỉ khoảng 3–16 KB. Không tạo video preview thứ hai. Xóa bản chép nguồn dựng sau khi kết quả đã kiểm tra thành công; giữ bản xuất.
6. **Ổ gần đầy:** chặn nhận/chạy công việc ghi file khi không còn tối thiểu 2 GiB cộng mức dự phòng của thao tác. Hàng đợi nêu lý do; job đã gửi, receipt, file cần đối soát vẫn được giữ. Không thử làm đầy ổ thật. Giới hạn tập trung trong desktop/src/storage-policy.mjs và khóa cấu hình storage_policy; chưa thêm màn chỉnh dung lượng vào UI.

## Kiểm tra thực tế và giới hạn

| Kiểm tra | Kết quả / phạm vi bằng chứng |
|---|---|
| Khởi động lại bản cài | Dự án cũ, 25 Muse jobs, 3 hồ sơ, bài Instagram đã đăng và các record cũ giữ nguyên |
| Nội dung file | SHA-256 của 64 file ảnh/video/diagnostic cũ khớp; 602 hardlink cùng NTFS file ID với nguồn |
| Thư viện và phát video | Ba MP4 cũ 720 × 1280, 10 giây phát thật; danh sách không tải video gốc |
| Muse sau dọn | Phiên thật đăng nhập, VPN kết nối và nghiên cứu bằng Muse hoàn tất; không chỉ suy từ URL hay mock |
| Tải/nhập lại | Chromium tải thật từ HTTP kiểm thử, FFmpeg tạo/đọc MP4 thật, SQLite thật; cùng receipt một take, hai receipt giữ hai take dùng một bộ byte; mở lại vẫn đúng. Không phải lượt tải mới từ Muse thật |
| Lỗi, gần hết ổ, khôi phục | Test bằng fixture/fake dung lượng và receipt gián đoạn; không giả lập kết quả này thành nghiệm thu nhà cung cấp thật |
| Build / TypeScript / test | Build và TypeScript đạt; 248 test: 78 domain, 9 API, 153 desktop, 8 runner; 0 fail, 0 skip |
| GUI | Thư viện, Hàng đợi, Tài khoản Muse, Cài đặt, Nghiên cứu và chi tiết mở được; kiểm cửa sổ rộng và nhỏ. Đã sửa nút Xem bị tách dòng trong bảng |

Đo rảnh **299.9 giây, 11 mẫu mỗi 30 giây**. Không có Muse job/chat/research hoạt động ở các mẫu. Dữ liệu app tăng **8.240 byte**, toàn bộ ở DIPS-wal của Chromium; media, outputs, thumbnails và nhật ký tác vụ không tăng. Một số file cache đổi thời gian ghi nhưng không tăng kích thước. Ổ C trong khoảng đó giảm 0.288 GB; đây là số toàn máy trong lúc công việc kiểm thử/ứng dụng khác vẫn chạy, không gán phần giảm đó cho Hermes. Chưa chứng minh bằng một lượt đo rảnh kéo dài cả đêm.

Bằng chứng: [idle-summary.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/idle-summary.json>), [download-import-e2e.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/download-import-e2e.json>), [final-verification.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/final-verification.json>), [gui-verification.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/gui-verification.json>), [suite-verification.json](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/.product-lab-repair/storage-research-20261111/suite-verification.json>).

## Nghiên cứu: nút bắt đầu và 10 sản phẩm

Đã có nút **Bắt đầu nghiên cứu**. Runner chạy ở tiến trình desktop, lưu tiến độ/receipt, tiếp tục đối soát sau mở lại và giới hạn tối đa 3 lượt/profile/đợt. Có thể chuyển màn trong lúc chạy. Cần giữ app mở, máy thức và mạng hoạt động; không cam kết máy tắt/ngủ vẫn nghiên cứu hoặc tự chạy theo lịch mỗi đêm.

Đợt thật 17:45 ngày 11/11 đã có **10 ứng viên, 10 ảnh tải được, bảng số liệu và phân tích tiềm năng**. Đã sửa lỗi gộp tất cả sản phẩm chung showroom URL thành một; khôi phục chín mục thiếu từ phản hồi đã lưu mà không gửi thêm Muse. Không tự chọn 3 sản phẩm thay người dùng.

Chất lượng nguồn: ảnh showroom được nguồn ghi là ảnh minh họa; cần mẫu/ảnh đúng SKU trước mua. Số liệu là tín hiệu ở sản phẩm tương tự hoặc nguồn tổng hợp, không phải doanh số của đúng mẫu và không chứng minh nhu cầu riêng tại Mỹ. Đã đánh dấu rõ, để giá vốn/ship chưa biết, giữ giá bán là giả định. Một trang nguồn của bộ ép tỏi trả HTTP 429 khi đối chiếu; số ở đó được ghi chưa đối chiếu. Đây là danh sách ứng viên để chọn tiếp, chưa phải 10 sản phẩm đã kiểm chứng lợi nhuận.

## Mở app và lượt tiếp theo

Mở `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local/START-HERMES-CLIP.cmd` → **Nghiên cứu** → đợt **10 sản phẩm · 17:45:04 11/11/2026**. Bảng đã được để sẵn trong app. Bấm Xem để đọc ảnh, chỉ số, kỳ đo và nguồn; chọn tối đa 3 ứng viên.

Đợt Muse hiện đã dùng đủ 3 lượt của profile 3CC. Muốn nghiên cứu đợt tiếp theo, kiểm tra hạn mức ở Tài khoản Muse và chủ động mở đợt mới theo workflow có sẵn; không tự reset lượt để vượt giới hạn.

Ảnh: [Bảng sản phẩm](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/outputs/Hermes-Clip-Storage-Research-2026-11-11/10-research-table-final.png>), [Chi tiết nguồn và chỉ số](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/outputs/Hermes-Clip-Storage-Research-2026-11-11/08-research-detail-native.png>), [Thư viện](<C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI/outputs/Hermes-Clip-Storage-Research-2026-11-11/03-library-native.png>).
