# T14 — sửa trạng thái nguồn và heuristic của T11

Checkpoint ngày 12/11/2026, Asia/Saigon. Checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, working tree sạch trước task. Bản cài Windows chỉ được xác định từ context; không mở bản cài, AppData, profile, DB thật hay dịch vụ ngoài. Một worker, không commit/push; runner kiểm và commit sau.

## Hợp đồng sau sửa

1. `unavailable` biểu thị Agent Reach chưa sẵn sàng, không mở được executable, thiếu cấu hình lúc gọi hoặc chưa xác nhận lệnh đọc qua help. UI hiện **Nguồn: chưa kiểm được (công cụ)**. Help/công cụ lỗi có chữ HTTP 403 vẫn thuộc lỗi công cụ. `blocked` dành cho dấu hiệu CAPTCHA, HTTP 403/429, xác minh người dùng hoặc yêu cầu đăng nhập trong phản hồi nguồn; lỗi mạng/JSON và các lỗi khác là `failed`. Bỏ suy đoán website chặn chỉ từ chuỗi chung “access denied”. Search tiếp tục độc lập khi chỉ thiếu lệnh đọc; health báo công cụ chưa sẵn sàng thì không gọi provider. Hàng đợi, quota, argv cố định và shell=false giữ nguyên.
2. Quét HTML thuần, không chạy script: loại URL sản phẩm hiện tại (kể cả query/hash theo dõi) và khối related/recommend/you may also like/相关推荐/猜你喜欢 nhận diện từ class/id/aria-label hoặc tiêu đề khối. Hỗ trợ wrapper quanh tiêu đề. `productCountReliable` mới mặc định null; chỉ giá trị true cùng ít nhất 6 sản phẩm mới hiện chip showroom. Plain text/Markdown, nhãn gợi ý mất ranh giới, HTML không cân bằng hoặc bản ghi cũ thiếu cờ chỉ gợi ý trong chi tiết. Số sản phẩm chưa quan sát được giữ null. Fixture listing đơn có 7 sản phẩm liên quan không thành showroom; fixture showroom 12 sản phẩm vẫn gắn cờ.
3. Giá thập phân đơn hoặc khoảng `a-b`, `a~b` (cả dấu gạch dài) được so sánh cùng tiền tệ, gồm cả hai đầu mút. Giá Muse trong khoảng không bị cảnh báo lệch; ngoài khoảng thì cảnh báo. Tiền tệ khác/không rõ hoặc số không phân tích chắc chắn vẫn yêu cầu đối chiếu, không quy đổi, không thay giá Muse/MOQ.
4. `£` và entity `&pound;` được hiểu là GBP. `currencyDetected` vẫn là ký hiệu như hợp đồng cũ. Bare `¥` chỉ giữ ký hiệu với CNY khi host là root/subdomain của 1688.com, alibaba.com, aliexpress.com/aliexpress.us, taobao.com hoặc tmall.com; không nhận tên miền giả dạng suffix. Host khác trả `currencyDetected:null` và `currencyNote:"¥ không rõ CNY/JPY"`, vẫn giữ nguyên chuỗi giá. `CN¥` rõ nghĩa không phụ thuộc domain. `currencyNote` mới mặc định null.
5. `SourceCheckControls` dùng hàm thuần quyết định poll: chỉ job `source-check` của đợt đang hiển thị có state queued/running mới gọi status mỗi 10 giây. Vẫn refresh ban đầu, khi workspace đổi và sau thao tác; tránh các refresh nền chồng nhau. Kết quả/receipt và phần hiển thị chi tiết giữ nguyên. Chọn phương án giảm polling, chưa thay payload của `integrationStatus` vì các màn khác còn dùng result.
6. `runJson` cộng `Buffer.byteLength` của chunk mới, không đo lại toàn bộ stdout. Dừng nhận thêm chunk sau khi kết thúc; giữ UTF-8 decoder, timeout, kill cây tiến trình, no-shell và trần 4 MiB kể cả khi caller yêu cầu cao hơn.

Schema vẫn nhận bản ghi cũ, `listingCheck`/nguồn phụ optional/null; hai trường mới thiếu thì null. Không migration hay ghi đè receipt cũ. Dữ liệu cũ bị ghi `blocked` do thiếu CLI cần một lần kiểm lại sau khi công cụ sẵn sàng để có trạng thái mới; không tự sửa lịch sử hoặc replay job.

## Bằng chứng offline

Log tại `outputs/night-t14/` (Git ignore). TEMP/TMP/npm cache và npm userconfig trỏ vào thư mục task; npm offline, update notifier tắt. SQLite là fixture riêng; HTTP chỉ loopback test. Không cài dependency, mở Electron hay gọi mạng ngoài.

| Lệnh | Baseline | Sau sửa |
| --- | --- | --- |
| `npm test` | 107/107 | 108/108 |
| `npm run typecheck` | Đạt | Đạt |
| `npm run test:api` | 12/12 | 12/12 |
| `npm run test:desktop` | 183 đạt, 1 skip | 195 đạt, 1 skip |
| `node outputs/night-t14/build-check.mjs` | Không chạy | Đạt: UI + 20 module API/domain |
| `git diff --check` | Sạch | Đạt |

- Thêm 12 test desktop và 1 test domain, không xóa/nới assertion. Hai kỳ vọng thiếu lệnh đọc từ T11 đổi chính xác `blocked` → `unavailable` theo hợp đồng mới, gồm luồng áp dụng Muse thủ công. Ca blocked thật vẫn được giữ và mở rộng.
- Test fixture parser kiểm AliExpress/1688 có related, heading có wrapper, class camelCase, cả 5 nhóm nhãn gợi ý, URL hiện tại với tracking/hash, showroom 12 sản phẩm và nội dung mất ranh giới. UI render React tĩnh kiểm chip và modal; không phải thao tác GUI thật.
- Khoảng giá kiểm hai đầu mút, bên trong/bên ngoài, giá 0 đã biết, null, khác tiền tệ. GBP và ¥ kiểm domain chuẩn/giả dạng, CN¥ rõ nghĩa và note UI.
- Công cụ chưa sẵn sàng/không mở được executable ghi unavailable; help lỗi có chữ 403 không trở thành website bị chặn. Fixture provider kiểm captcha/403/429/login so với mạng/JSON/lỗi khác; giữ search độc lập và trạng thái receipt.
- Poll dùng test hàm thuần queued/running/done/failed/interrupted, đợt khác và loại job khác. Không khẳng định đã kiểm timer trong Electron.
- Subprocess test thật dùng Node local: chấp nhận đúng 4 MiB; từ chối thêm 1 byte kể cả maxBytes lớn hơn; UTF-8 nhiều chunk giữ nguyên và tính giới hạn theo byte. Spy xác nhận tổng độ dài được đo đúng bằng lượng chunk mới, không tăng theo tổng stdout đã gom.
- Lần focused đầu phát hiện tên class `you-may-also-like` chưa được loại: đã sửa scanner và giữ test. Lần full desktop đầu phát hiện kỳ vọng trạng thái cũ ở luồng Muse: đã cập nhật theo T14 và full suite sau đó qua.

`build-check.mjs` được tạo bởi `node outputs/night-t14/prepare-build.mjs`: đọc nguyên `scripts/build-local.mjs`, xác nhận root/output nằm trong workspace rồi chỉ chuyển output sang `outputs/night-t14/build` và sửa đường dẫn import compiler. Server vẫn dùng `scripts/build-local-server.mjs`. Không chạy nguyên `npm run local:build` vì script đó xóa/ghi `desktop/local-dist`, trái quy tắc đêm; runner có thể chạy bước build chuẩn sau khi kiểm. Build còn cảnh báo font URL lúc bundle/chunk >500 kB như các checkpoint trước; font được copy sau bundle theo script hiện hành.

## Giới hạn và tiếp tục

Không có blocker cho source T14. OpenMontage live skip vì thiếu môi trường tích hợp, như baseline. CLI Agent Reach ghim/envelope thật, website anti-bot, YouTube/web thật, timer/chi tiết trong GUI Windows và triển khai bản cài chưa được kiểm; các fixture không chứng minh dịch vụ đã kết nối.

Sau review, runner kiểm/commit/build theo quy trình. Khi có quyền nghiệm thu bản cài, kiểm help CLI ghim rồi chạy **Kiểm tra công cụ → Kiểm lại nguồn** trên đợt đã có; kiểm trường hợp thiếu công cụ, listing đơn có related, showroom 12 sản phẩm và giá khoảng/¥ không rõ. Không cần gửi Muse mới chỉ để kiểm nguồn, không mở rộng quyền đăng Instagram.
