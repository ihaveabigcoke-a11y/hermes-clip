# Hermes Clip — bối cảnh và trạng thái ngày 11/11/2026

## Cập nhật source đêm T04 — bảng so sánh và chọn tạo hồ sơ

Clone `night-20261111` đã thu gọn bảng nghiên cứu với cột SKU, vốn + ship, ngưỡng 20 USD, cảnh kết quả, rủi ro, quyết định và cảnh báo T02. Tick chọn lưu lựa chọn rồi gọi API `promote` chống trùng; bỏ chọn giữ hồ sơ, lỗi giữa chừng có đường đối soát/hoàn tất chọn. Form có textarea và tiêu chí cấu trúc, giữ một nút chính Bắt đầu nghiên cứu. Domain 126/126, API 15/15, desktop 214 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. UI build với fixture offline đo hàng 101–109 px ở 1920×1080; ảnh và báo cáo trong `ops/night/out/T04-*`. Chưa triển khai hoặc kiểm bản cài/dịch vụ thật. Xem [checkpoint T04](T04-RESEARCH-COMPARISON.md) cho quy tắc độ đầy đủ, retry, bằng chứng và cách chạy tiếp.

## Cập nhật source đêm T12 — phân tích video mẫu và tham chiếu nháp

Clone `night-20261111` đã có luồng FFmpeg local từ MP4 Thư viện/file chọn: duration, resolution/tỷ lệ, cuts ngưỡng 0,3, frame mỗi 0,8 giây, contact sheet JPEG và `structure.json` có confinement/checksum. Khối Công thức video cho xem/điền chữ rồi lưu `reference_video_draft` riêng qua API có CAS, chưa sửa công thức chính. Prompt Muse chỉ tạo chuỗi theo taxonomy. YouTube có capability gate/help và adapter tải/subtitles, nhưng clone thiếu Agent Reach/yt-dlp nên nút hiện chưa hỗ trợ; chỉ kiểm argv bằng fake runner, không gọi mạng. Domain 121/121, API 14/14, desktop 212 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. Chưa triển khai bản cài hoặc kiểm GUI/file/dịch vụ thật. Xem [checkpoint T12](T12-REFERENCE-VIDEO.md) cho hợp đồng, bằng chứng, blocker và cách chạy tiếp.

## Cập nhật source đêm T06 — kịch bản công thức và hai mở đầu A/B

Clone `night-20261111` đã nối thư viện T05 (gồm phiên bản công thức người dùng lưu) vào **Tạo nội dung → Mẫu prompt**. Sinh cảnh nháp tiếng Anh 9:16 tổng 10–18 giây, overlay một dòng và CTA keyword; lưu hai hook dùng chung body/CTA, không tự duyệt hoặc gửi Muse. Overlay/CTA optional; giữ revision, snapshot và chặn xuất khi chưa chọn đủ take đã duyệt. Thêm cảnh báo hook thiếu chữ, testimonial và hiệu ứng ngoài invariants/allowedClaims. Domain 117/117, API 13/13, desktop 197 đạt/1 skip OpenMontage, TypeScript và build output riêng đạt. Chưa triển khai bản cài/kiểm GUI hay dịch vụ thật; chưa tự render overlay. Xem [checkpoint T06](T06-FORMULA-STORYBOARD.md) cho hợp đồng, test, giới hạn và cách chạy tiếp. Ghi chú T05 “chưa tự áp công thức vào kịch bản” mô tả trạng thái trước T06.

## Cập nhật source đêm T14 — phân biệt lỗi công cụ và giảm cảnh báo nguồn sai

Đã sửa review T11 trên clone `night-20261111`: công cụ thiếu/chưa xác nhận lệnh đọc → `unavailable`, chip “Nguồn: chưa kiểm được (công cụ)”; `blocked` dành cho CAPTCHA/403/429/yêu cầu đăng nhập. Bộ đếm showroom loại URL hiện tại và vùng gợi ý; kết quả không tách rõ vùng chỉ gợi ý trong chi tiết. Giá khoảng so sánh gồm hai đầu mút; thêm GBP và giữ ¥ ngoài domain supplier đã biết là null kèm ghi chú CNY/JPY. Poll nguồn 10 giây chỉ khi đợt đang chờ/chạy; stdout đếm byte từng chunk, giữ trần 4 MiB. Domain 108/108, API 12/12, desktop 195 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. Chưa triển khai bản cài hay kiểm dịch vụ/GUI thật. Xem [checkpoint T14](T14-SOURCE-STATUS-HEURISTICS.md); phần T11 ghi thiếu CLI thành `blocked` là trạng thái lịch sử đã được sửa.

## Cập nhật source đêm T13 — promote và form tiền tệ

Clone `night-20261111` đã sửa giới hạn còn lại của T01: sản phẩm nhận CNY và tiền tệ riêng optional/null cho giá vốn, ship; promote giữ nguyên số và đơn vị từng khoản. Form ứng viên/sản phẩm hiển thị CNY và lựa chọn kế thừa tiền tệ chung. Khi khác tiền tệ, biên là null và UI hiện “Khác tiền tệ · chưa tính biên”; không quy đổi tỷ giá. Domain 107/107, API 12/12, desktop 183 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. Chưa triển khai bản cài hay kiểm GUI thật. Xem [checkpoint T13](T13-PROMOTE-CURRENCIES.md) cho hợp đồng, bằng chứng và cách kiểm tiếp.

## Cập nhật source đêm T05 — thư viện công thức video

Clone `night-20261111` đã có seed source 6 công thức/12 video tham khảo với taxonomy cố định, Zod validation, gợi ý theo traits và khối chỉ đọc **Công thức video** trong Nghiên cứu. API lưu `viral_formula` thành record phiên bản bất biến trong workspace; seed không ghi đè dữ liệu người dùng. CTA dùng mốc từ cuối rõ ràng. Test offline/API/desktop fixture và build riêng đã qua; chưa triển khai bản cài, chưa phân tích MP4/OCR/Muse thật hay tự áp công thức vào kịch bản. Xem [checkpoint và hợp đồng T05](../VIRAL-FORMULAS.md) cho quy ước, bằng chứng và lộ trình cập nhật sau này.

Sửa hồi quy runner ngày 12/11: test HTTP local tự biên dịch API và JSON seed từ source bằng bộ biên dịch dùng chung với build, không còn import server từ `local-dist` cũ. `npm run test:desktop` thường qua 180 test, 1 skip OpenMontage; ca chặn import server build sẵn qua 10/10. Domain 103/103, API 11/11, typecheck và build riêng đạt. Chi tiết giới hạn tái hiện lỗi và log trong checkpoint T05.

## Cập nhật source đêm T03 — bước tiến độ của sản phẩm

Pipeline Tổng quan đã dùng hàm thuần theo `production`, plan đã đăng và `social_metric` nối đúng sản phẩm; giữ tương thích experiment/creative/metric cũ. URL supplier và ghi chú Muse chưa kiểm không tự tăng bậc. Fixture và snapshot chỉ đọc cho Treat Trader → Đo nhu cầu, ChomChom/Ruffwear → Nội dung. Source chưa triển khai vào bản cài; xem [checkpoint T03](T03-PRODUCT-STAGE.md) cho quy tắc, kiểm tra và giới hạn.

## Cập nhật source đêm T11 — kiểm nguồn Agent Reach

Đã nối hàng đợi kiểm listing/tín hiệu YouTube/web sau khi lưu research Muse, giữ nguyên số liệu Muse, thêm nút kiểm lại và trạng thái/cờ trong bảng/chi tiết. Test dùng runner giả, build trong output riêng; chưa triển khai bản cài. Clone đêm thiếu checkout/venv Agent Reach nên chưa xác minh CLI đọc của revision ghim; runtime chỉ gọi đọc khi help local xác nhận, thiếu thì ghi `blocked`. Xem [checkpoint T11](T11-AGENT-REACH-RESEARCH.md) cho hợp đồng, bằng chứng, blocker và lệnh thử sáng mai.

## Cập nhật source đêm T02 — quyết định và chất lượng nghiên cứu

Clone `night-20261111` đã thêm trường quyết định/đối chiếu SKU, cảnh kết quả, rủi ro AI/vận chuyển và cạnh tranh quan sát cho candidate. Prompt/brief ưu tiên Problem → Vs → Result → CTA, listing riêng và mục tiêu vốn + ship Mỹ ≤ 20 USD có báo giá. Bộ kiểm thuần gắn cảnh báo nguồn chung/số liệu cấp trang khi merge và hiển thị, giữ dữ liệu cũ, lựa chọn và receipt. Đây là thay đổi source chưa triển khai vào bản cài. Xem [checkpoint T02](T02-RESEARCH-QUALITY.md) cho hợp đồng, kết quả fixture và giới hạn kiểm chứng.

## Cập nhật source đêm T01 — tiền tệ nghiên cứu

Checkout riêng `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, đã bổ sung CNY và tiền tệ riêng cho giá vốn/ship của ứng viên; không quy đổi tỷ giá. Đây là thay đổi source, chưa áp dụng vào bản cài đang chạy. Các ghi chú snapshot về việc research chưa hỗ trợ CNY mô tả phiên bản trước T01. Xem [checkpoint T01](T01-RESEARCH-CURRENCIES.md) để biết hợp đồng dữ liệu, kết quả kiểm tra và giới hạn tạo hồ sơ sản phẩm.

## Vai trò ChatGPT và Codex

Người dùng muốn ChatGPT web hiểu sản phẩm để góp ý về workflow, UX, tính khả thi và thứ tự triển khai. Đầu ra cần chuyển được thành prompt cụ thể cho **Codex Astra Ultra** làm trên source Windows. ChatGPT không tự coi việc trao đổi ý tưởng là yêu cầu sửa code, mua công cụ, tăng tài khoản hoặc đăng nội dung.

Chỉ dùng một agent Codex duy nhất. Không spawn sub-agent, không chia vai và không xây orchestrator. Các yêu cầu multi-agent trong brief, tài liệu cũ và chat trước đã bị thay thế. Agent chính được tự quyết chi tiết kỹ thuật thông thường, sửa lỗi và test trong phạm vi được giao; lưu checkpoint, tiếp tục phần độc lập khi phần khác bị chặn.

## Sản phẩm và mục tiêu kinh doanh

Hermes Clip là desktop app Windows, phát triển từ Product Lab. Người dùng ở Việt Nam, nhắm khách hàng Mỹ, nội dung bán hàng bằng tiếng Anh. Hướng kinh doanh là tìm sản phẩm nguồn Trung Quốc, thử content AI rồi cân nhắc dropshipping/pre-order. Giá bán x3–x4 vốn và “viral thì sẽ bán được” là giả thuyết, không phải kết quả đã chứng minh.

Sản phẩm là đơn vị quản lý chính. Một sản phẩm có thể có nhiều ý tưởng, cảnh, phiên bản video và tài khoản Instagram. Instagram cần tổng quan bằng bảng theo sản phẩm, gộp các tài khoản liên quan; dữ liệu không biết phải hiện thiếu, không đổi thành 0. Người dùng muốn tự đo số liệu, không phải nhập tay.

## Workflow mong muốn và phần cần giữ

1. Người dùng bấm **Bắt đầu nghiên cứu**. Muse tìm tối đa 10 ứng viên, có ảnh, số liệu, bảng nguồn và phân tích tiềm năng. Máy/app cần hoạt động trong lúc nghiên cứu; chưa có lịch tự nghiên cứu mỗi đêm khi app tắt.
2. Người dùng chọn tối đa **3 trong 10**. App không tự chốt thay.
3. Muse nghiên cứu hướng content, viết hook/kịch bản/prompt theo sản phẩm. Người dùng duyệt kịch bản trước khi tạo.
4. Worker dùng profile Muse, tự kết nối VPN theo cấu hình, gửi prompt/reference, chờ kết quả, tải file, kiểm tra và nhập vào đúng cảnh/Thư viện. Browser chạy nền; người dùng xem kết quả trong app.
5. Duyệt phiên bản, ghép/xuất video thật. Được duyệt/xuất **thử nội bộ trước khi kiểm sample**; điều kiện đăng và bán được chốt riêng.
6. Instagram dùng profile browser riêng theo sản phẩm. Người dùng tự đăng nhập; app có script upload/đăng, đối soát chống trùng và đo số liệu. Phải xác định đúng tài khoản, nội dung và phạm vi đăng đã duyệt.
7. Landing/pre-order là bước kinh doanh phía sau. Chưa có cổng thanh toán/tài khoản nhận tiền và điều kiện giao/hoàn tiền đã chốt; không được tự bật nhận tiền.

Tối đa **3 lượt Muse mỗi profile mỗi đợt**. Trong bản hiện tại, chat/research/media cùng dùng bộ đếm này. Unlimited Codex không đồng nghĩa Muse hoặc công cụ khác miễn phí/vô hạn. Không tự reset đợt để né giới hạn.

## Hệ thống hiện hành

Source đang chạy: `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local`.

Workspace trao đổi, báo cáo và checkpoint: `C:/Users/ADMIN/Documents/ChatGPT/ECOM BẰNG VIDEO AI`. Đây không phải thư mục source app chính.

Dữ liệu thật: `C:/Users/ADMIN/AppData/Roaming/product-lab-desktop`. `worker/worker.sqlite` giữ jobs, cấu hình và lịch sử chat; `worker/workspace/workspace.sqlite` giữ records; media trong `worker/workspace/media`; profile browser ở các thư mục riêng do app quản lý. Không sửa trực tiếp DB hoặc copy đè AppData chỉ để làm UI có dữ liệu.

Electron + React/TypeScript, local HTTP API, SQLite, Playwright Chromium, FFmpeg/ffprobe. Muse là dịch vụ thực hiện research/chat/tạo nội dung mà người dùng ưu tiên. Agent Reach/OpenMontage đã được tích hợp và kiểm thử cho tìm nguồn/trích frame/ghép media; chúng không thay yêu cầu dùng Muse cho luồng AI chính.

## Trạng thái có bằng chứng

| Nhóm | Đã hoạt động | Giới hạn chứng minh |
|---|---|---|
| Windows local | App mở lại được, đọc dự án/Thư viện/Hàng đợi/Cài đặt | ChatGPT web không có các file/phiên Windows chỉ vì nhận snapshot |
| Muse | Ba profile; đăng nhập, VPN, quota; chat và nhận media thật qua worker | Tên profile khác nhau chưa tự chứng minh ba danh tính Muse độc lập; fingerprint/antidetect chưa được nghiệm thu toàn diện |
| Ba sản phẩm | Treat Trader, ChomChom Roller, Ruffwear Front Range Flex Leash; có MP4 thật 720×1280 ~10 giây, tải/nhập/phát sau restart | Có clip còn dịch góc/phóng gần so với prompt; không coi chất lượng hình ảnh đã đạt mọi yêu cầu |
| Research | Đợt 11/11 đã có 10 ứng viên, 10 ảnh tải được, bảng chỉ số/nguồn và phân tích khách hàng; nút chạy nền lưu tiến độ | Chủ yếu là số liệu sản phẩm tương tự/nguồn thứ cấp, ảnh showroom minh họa; một nguồn bộ ép tỏi HTTP 429 chưa đối chiếu; chưa xác minh lợi nhuận đúng SKU |
| Hàng đợi | Gom theo sản phẩm/cảnh, mặc định Cần xử lý; việc xong vào Lịch sử; có đối soát trạng thái không rõ | Chưa chạy mọi tình huống lỗi thực tế của nhà cung cấp; nhiều ca hồi quy dùng fixture |
| Thư viện/xuất | File thật, chọn phiên bản, bản chính, ghép bằng FFmpeg/OpenMontage và xem lại | Không tự xóa phiên bản hoặc file xuất để giảm dung lượng |
| Instagram đăng | Một Reel Treat Trader đã đăng thật vào tài khoản đã duyệt, có permalink, một job published và đối soát sau restart | Hai sản phẩm còn lại chưa có lượt đăng thật/hồ sơ được gắn; không lấy quyền đăng Treat Trader làm quyền đăng mọi sản phẩm |
| Instagram số liệu | Đọc số liệu thật của bài đã đăng; tự đo sau đăng và theo lịch 30 phút khi app mở; bảng theo sản phẩm, tránh cộng trùng | Một số số liệu chưa được Instagram cung cấp giữ null; lịch 30 phút đầy đủ phần lớn kiểm bằng fake clock, không suy thành chứng minh mọi chu kỳ thật |
| Landing/checkout | Có nháp nội dung và phần giao diện liên quan | Chưa có cổng nhận tiền, điều khoản và nghiệm thu checkout thật |

Không dùng mock, cookie đăng nhập, URL hội thoại hoặc nút bấm hiện trên UI làm bằng chứng chức năng bên ngoài thành công. Cần receipt/phản hồi/file/perm­alink hoặc số liệu đọc thật, đúng đối tượng.

## UX và nhận diện

Người dùng đã chọn theme **graphite–lime** từ bộ Stitch: nền tối, điểm nhấn vàng xanh. Giữ logo, font-family và dữ liệu trong các lượt sửa typography. Các đề xuất font công nghệ/futuristic vẫn là định hướng; không tự chọn font mới. Source hiện có Be Vietnam Pro/Sora từ theme trước, nhưng người dùng đã yêu cầu không tự thay font trong lượt typography.

Chữ: tiêu đề màn 22–24 px/600, tiêu đề khối 17–18/600, menu/nút/nhãn 14–15/500, nội dung/prompt 15/400, phụ 12–13/400, line-height 1,45–1,6. Hạn chế chữ quá nhỏ và đậm đồng loạt. Tiếng Việt ngắn, tự nhiên; dùng chung nhãn; giữ tiếng Anh của prompt, tên sản phẩm và nội dung người dùng.

Tạo nội dung, hàng đợi, chat Muse, thư viện, nghiên cứu và tài khoản Muse là phần chính. Instagram/landing nằm trong Kinh doanh phía dưới. Tránh màn hình đầy các thẻ chữ buộc đọc từ trên xuống; ưu tiên bảng so sánh, ảnh, số liệu và chi tiết khi cần. Không gom mọi hành động vào cùng một “Lịch sử”. Đã sửa vấn đề mất vùng bên phải ở cửa sổ rộng/DPI Windows.

## Tối ưu dung lượng vừa hoàn tất

Đã thu hồi 2.976.159.255 byte từ cache/build thừa và bản sao media đã xác minh. Bản sao QA chiếm 2,447 GB, cache riêng 427 MB, Muse output trùng Thư viện 80 MB, build cũ 22 MB. 602 bản sao chuyển sang hardlink, giữ nguyên đường dẫn/nội dung. Thư viện gốc khoảng 88 MB. Không có căn cứ quy toàn bộ mức giảm khoảng 40 GB của ổ C cho Clip.

Storage policy: dùng file bất biến/checksum, chống tải/nhập trùng, thu hồi tải tạm, cleanup thận trọng sau crash, cache có giới hạn, log bảo trì xoay vòng, JPEG 320 px cho danh sách, video chỉ tải khi xem, dừng nhận việc ghi mới khi thiếu ít nhất 2 GiB dự phòng. Giữ job đã gửi/receipt và file cần đối soát. Các script QA đã đổi sang dùng chung media thay vì chép cả kho.

248 tests đạt, 0 fail/skip; build và TypeScript đạt trên bản cài. Sau restart: 25 Muse jobs, 3 profile, bài Instagram đã đăng và records cũ còn đúng; 64 file cũ khớp SHA-256; 602 hardlink được đối chiếu. Ba video cũ phát thật. Tải/nhập lặp kiểm bằng Chromium/FFmpeg/API/SQLite thật với video tổng hợp, không phải lượt tải mới từ Muse.

Đo rảnh 299,9 giây/11 mẫu: dữ liệu app chỉ tăng 8.240 byte ở DIPS-wal của Chromium; media/output/thumbnail/log không tăng. Chưa có nghiệm thu rảnh cả đêm sau bản sửa này. Không diễn đạt “đã giải quyết toàn bộ 40 GB” hoặc “không bao giờ tăng nữa”.

## Khoảng trống cần gợi ý tiếp, chưa tự trở thành phạm vi triển khai

- Nghiên cứu chất lượng hơn: nguồn đúng SKU/giá theo MOQ, phí ship Mỹ, ảnh mẫu thật, số liệu phân biệt đúng sản phẩm và sản phẩm tương tự; không tạo điểm thị trường hay doanh thu giả.
- Quy trình 10 → 3 → kịch bản được duyệt → media thật → nội dung phù hợp từng sản phẩm/tài khoản; giảm thao tác thừa và giữ quyền chọn của người dùng.
- Meosu: All Media toàn tài khoản Muse, video reference/Remix, Clone qua Muse, tự lấy khung cuối nối cảnh dài, thư viện nhân vật/template, lip-sync/face swap chưa hoàn chỉnh hoặc chưa nghiệm thu. Khảo sát Meosu không đồng nghĩa đã có source backend gốc hoặc đã tích hợp toàn bộ.
- Instagram mở rộng nhiều sản phẩm cần tài khoản/quyền và lượt nghiệm thu riêng; không tự tạo tài khoản hàng loạt hoặc đăng khi chưa có nội dung/tài khoản được duyệt.
- Thanh toán pre-order ở Việt Nam bán sang Mỹ cần lựa chọn phù hợp tư cách kinh doanh, tài khoản nhận tiền, giao hàng/hoàn tiền. Khi tư vấn nhà cung cấp phải kiểm thông tin hiện hành và không giả định đủ điều kiện mở tài khoản.
- Tự động qua đêm cần xác định lịch, nguồn điện, sleep, mạng, quota và xử lý trạng thái không rõ; không hứa hoàn thành tuyệt đối vào 08:00 khi còn phụ thuộc bên ngoài.

Khi đưa ra đề xuất, tách: lỗi cần sửa; cải tiến có lợi; tính năng mới; quyết định kinh doanh chưa chốt. Ưu tiên một luồng hoàn chỉnh có bằng chứng trước khi tăng hàng loạt tài khoản hoặc sản phẩm.
