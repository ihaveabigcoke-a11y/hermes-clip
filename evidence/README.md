# Bằng chứng Hermes Clip

Các file dưới `2026-11-11/` là **báo cáo/log/ảnh gốc của lượt chạy trước**, giữ nguyên byte. [PROVENANCE.json](2026-11-11/PROVENANCE.json) lưu đường dẫn nguồn, thời gian sửa, SHA-256 trước/sau sao chép. Thời điểm upload không phải thời điểm chạy test. Lượt bổ sung GitHub không gửi thêm Muse, không đăng bài và không sửa dữ liệu.

| Kiểm chứng | Báo cáo gốc | Phạm vi |
| --- | --- | --- |
| 248 test | [suite-verification](2026-11-11/tests/suite-verification.json), [domain 78](2026-11-11/tests/domain-complete.log), [API 9](2026-11-11/tests/api-complete.log), [desktop 153](2026-11-11/tests/desktop-complete.log), [runner 8](2026-11-11/tests/runner-complete.log) | 0 fail/skip trong môi trường Windows cũ; không phải CI mới |
| Build/TypeScript | [build-final.log](2026-11-11/tests/build-final.log), [typecheck.log](2026-11-11/tests/typecheck.log) | Log typecheck rỗng là bản gốc; riêng file rỗng không chứng minh exit code, đọc cùng báo cáo cuối |
| GUI, playback và restart | [gui-verification](2026-11-11/storage-research/gui-verification.json), [final-verification](2026-11-11/storage-research/final-verification.json), [ảnh](2026-11-11/gui/) | Ba video thật phát; dữ liệu trước/sau giữ đúng |
| Tải/nhập lặp | [download-import-e2e](2026-11-11/storage-research/download-import-e2e.json) | Chromium/FFmpeg/local API/SQLite thật với MP4 tổng hợp; không phải một lần tải Muse mới |
| Chạy rảnh | [idle-summary](2026-11-11/storage-research/idle-summary.json), [11 mẫu gốc](2026-11-11/storage-research/idle-measurement.json) | 299,9 giây; app tăng 8.240 byte, không chứng minh cả đêm |
| Dọn dung lượng | [báo cáo](2026-11-11/storage-research/BAO-CAO.md), [danh sách CSV](2026-11-11/storage-research/DANH-SACH-DA-DON.csv) | 2.976.159.255 byte; không quy toàn bộ mức giảm 40 GB cho Hermes |
| Research 17:45 | [source review](2026-11-11/storage-research/research-source-review.json), [nguồn/HTTP](2026-11-11/storage-research/source-evidence.json), [DB export](../data/research/2026-11-11/candidates-1745.json) | 10 ứng viên; ảnh minh họa/số liệu sản phẩm tương tự; một nguồn HTTP 429 |
| Research trước đó | [source-reviewed-batch](2026-11-11/earlier-research/source-reviewed-batch.json), [DB export](../data/research/2026-11-11/candidates-earlier.json) | Đợt khác, không gộp với 17:45; giữ nguyên ghi chú giá VND/giá tham khảo USD |
| Instagram đăng thật | [receipt](2026-11-11/instagram/live-publication-verification.json), [báo cáo](2026-11-11/instagram/BAO-CAO-DANG-THAT.md) | Một Reel Treat Trader; không chứng minh hai sản phẩm còn lại đã đăng |
| Đo Instagram | [live-verification](2026-11-11/instagram-metrics/live-verification.json), [sau restart](2026-11-11/instagram-metrics/final-verification.json) | Null/0 được phân biệt; kiểm chu kỳ 30 phút có phần dùng fake clock |
| Ba video | [manifest gốc](2026-11-11/three-products/manifest.json), [playback/decode](2026-11-11/three-products/delivery-verification.json), [media thật](media/README.md) | Kỹ thuật đạt; có clip còn lệch camera nên không khẳng định hình ảnh hoàn toàn đạt prompt |

Kiểm tra **mới khi bổ sung repo** ở [current/2026-11-11](current/2026-11-11/): ảnh cửa sổ app đang mở, executable/process và [hash source](current/2026-11-11/source-parity.json). Không gọi kết quả này là chạy lại 248 test.

Các path C:/... trong báo cáo gốc không tự truy cập được từ ChatGPT web. `PROVENANCE.json`, [MANIFEST.json](../MANIFEST.json) và [media-index](../data/2026-11-11/media-index.json) nối chúng với file nằm trong repo. [Trang nguồn đã lưu](2026-11-11/research-source-pages/index.json) giữ nguyên byte HTML nhưng đổi đuôi `.html.txt` để đọc thụ động; source-evidence giữ URL, HTTP status và thời điểm đã kiểm. Đây là trang lịch sử, không được mở lại trong lượt upload. Riêng ảnh sản phẩm được tải hiện tại theo [image-index](../data/research/2026-11-11/image-index.json), có thời điểm và kết quả HTTP riêng.
