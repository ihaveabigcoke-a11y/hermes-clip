# Instagram API — thử nghiệm, mặc định tắt

T18 chỉ thêm source và kiểm bằng fetch giả. **Chưa có Meta app/token thật; chưa gọi Meta, chưa xác minh tài liệu trực tuyến hoặc triển khai vào bản cài Windows.** Tài khoản cũ mặc định `apiMode: 'browser'`, tiếp tục Playwright. Cờ API không làm cookie trình duyệt thành access token.

## Trước khi bật

Đối chiếu tài liệu Meta hiện hành cho **Instagram API with Instagram Login**, không dùng hướng dẫn Facebook Login/Page token lẫn vào luồng này:

- [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- Các mục Business Login, Content Publishing / Reels / resumable upload, Insights, Comment Moderation và API Reference bên trong tài liệu trên.

Các liên kết là điểm bắt đầu đọc, **không phải bằng chứng đã kiểm endpoint ngày 12/11/2026**. Mỗi endpoint/field trong `desktop/src/instagram-api.mjs` có `TODO META VERIFY`. Phải đối chiếu version, host, header, field, period, quyền và response trước khi bật. `v99.0` trong test là phiên bản giả, không dùng trong bản cài.

## Tạo app phát triển cho tài khoản của mình

1. Trong Meta for Developers, tạo app cho use case Instagram mà dashboard hiện hành cung cấp, giữ **Development**. Thiết lập Instagram API với Instagram Login. Luồng này dành cho tài khoản Instagram chuyên nghiệp (Business/Creator), không yêu cầu gắn Facebook Page theo mô hình Instagram Login; kiểm lại điều kiện của loại tài khoản/use case trong dashboard.
2. Thêm tài khoản chuyên nghiệp của chính mình vào role/tester được Meta hỗ trợ và chấp nhận lời mời trên Instagram. Cấu hình business login, redirect URI HTTPS chính xác và các URL policy/data deletion mà dashboard yêu cầu. Chưa bật production hay mời tài khoản ngoài phạm vi đã duyệt.
3. Yêu cầu các quyền theo tài liệu hiện hành: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_insights`, `instagram_business_manage_comments`. Quyền xuất hiện trong yêu cầu login chưa chứng minh đã được cấp: kiểm danh sách quyền trên token. Advanced Access, App Review hoặc xác minh doanh nghiệp có thể cần khi phục vụ người khác; không coi token development là quyền đăng mọi tài khoản.
4. Dùng luồng Instagram Business Login/OAuth của Meta cho tester đó (hoặc công cụ tạo token cho tester mà dashboard cung cấp). Nếu dùng authorization code, đổi code thành access token ở môi trường backend/local tin cậy theo đúng endpoint hiện hành. App secret không đưa vào renderer, repo hoặc lệnh shell/log. Đối chiếu cách đổi token dài hạn, thời hạn và refresh của loại token này. **Hermes chưa có OAuth callback, đổi/refresh token tự động.**
5. Xác minh token thuộc đúng tài khoản bằng endpoint identity của version đã chọn; lưu `user_id` của Instagram Login và username đối chiếu. Không dùng `ds_user_id` từ browser làm API ID. Giữ token kín, không chụp màn hình/token explorer URL chứa token hoặc ghi token vào báo cáo.

## Cấu hình từng tài khoản trong Hermes

Trong Instagram → sản phẩm → **Tài khoản** → nút cấu hình kết nối:

1. Chọn **Instagram API (thử nghiệm)** ở **Cách kết nối** (`apiMode: 'api'`).
2. Điền **Mã tài khoản Instagram API** (`apiUserId`) và **Token Instagram API**. Lưu. Token đi qua IPC và được mã hóa bằng Electron `safeStorage`, cùng cơ chế dùng cho mật khẩu proxy. Thiếu kho mã hóa thì từ chối lưu; không fallback plaintext. Status chỉ trả `hasApiToken`, không trả plaintext hay ciphertext. Mở form lại luôn là ô token trống; để trống giữ token cũ, chọn **Xóa token API đã lưu** để thu hồi bản lưu cục bộ. Thu hồi trên Meta làm riêng.
3. Chỉ sau khi đối chiếu tài liệu và chuẩn bị nội dung/tài khoản đã được duyệt, cấu hình môi trường tiến trình desktop: `HERMES_INSTAGRAM_API_ENABLED=1`, `HERMES_INSTAGRAM_API_VERSION=<version đã xác minh, dạng vNN.0>`. Không đặt token trong biến môi trường. Cả hai mặc định chưa bật/chưa đặt.
4. Upload video có cờ riêng `HERMES_INSTAGRAM_API_RESUMABLE=1`, mặc định tắt. Chỉ bật sau khi xác minh create container `upload_type=resumable`, URL `https://rupload.facebook.com/ig-api-upload/{version}/{container-id}`, Authorization `OAuth`, header `offset: 0`, `file_size`, body bytes và phản hồi `success: true`. URI trả về khác hợp đồng sẽ dừng, giữ container receipt. Hiện chỉ upload một lần, chưa có tự tiếp tục byte offset; không đoán/gửi lại khi mất phản hồi.
5. Bấm **Kiểm tra API** để thực sự đọc danh tính khi cờ bật; có token/URL hoặc nút hiện lên không phải bằng chứng kết nối. Chỉ bấm đăng sau khi phạm vi tài khoản/nội dung đã được duyệt. Chọn lại **Trình duyệt** để các lượt mới dùng Playwright. Snapshot lượt cũ vẫn giữ adapter đã chọn; đổi cấu hình không đổi một lượt đang cần đối soát.

Không thực hiện các bước gọi mạng này trong task đêm. Cờ tiến trình cần khởi động lại sau này khi an toàn, không khi có tác vụ đang chạy. Proxy/Touch VPN trong form chỉ áp dụng trình duyệt; API dùng kết nối fetch của tiến trình, không tự dùng proxy hay phiên browser. Chưa có retry/refresh token tự động; token hết hạn cần thay bằng token cùng tài khoản.

## Hợp đồng đăng và đối soát

- Dùng snapshot tài khoản/video/checksum/caption, revision và fingerprint chống trùng hiện có. API thêm `apiMode`, `apiUserId`, revision cấu hình; kiểm danh tính và revalidate trước container và trước publish. Video bytes được kiểm checksum lần nữa trước upload. Không có fallback tự động sang trình duyệt.
- Trước request tạo container, ghi receipt `phase: creating`. Có container ID thì lưu ngay trước upload; có media ID thì lưu ngay trước đọc permalink. Mỗi lần publish tối đa một POST `media_publish`; không tự tạo container/publish/upload lại.
- Lỗi sau khi bắt đầu create, kể cả timeout chưa nhận container ID, luôn thành `needs_attention` (**Cần đối soát**). Restart giữ trạng thái này, chặn retry/cancel và yêu cầu trùng. Container ERROR/EXPIRED/UNKNOWN hoặc chưa FINISHED sau 12 lần đọc (cách nhau 5 giây) không publish. Cần điều chỉnh poll theo tài liệu/quan sát thực tế sau này.
- **Kiểm tra kết quả** của API chỉ đọc identity, `status_code` và media đã biết. `PUBLISHED` đơn lẻ không đủ xác định permalink. Nếu publish response bị mất trước khi có media ID, giữ cần đối soát; không đoán bài từ caption/thời gian và không POST lần hai. Chưa có thao tác UI gắn media ID/xác nhận container bỏ an toàn. Trường hợp này cần bổ sung luồng đối soát thủ công có kiểm danh tính trước khi mở lại quyền gửi; không sửa DB để ép retry.
- Chỉ ghi published khi media ID/permalink/username/video/Reels/caption/timestamp khớp receipt/snapshot. Workspace giữ status cũ `published_browser` để tương thích các nơi đọc “đã đăng qua app”, thêm `publishSource: 'api'`; nguồn chính xác cũng có trong proof. Lỗi đồng bộ workspace sau khi đã publish được thử đồng bộ lại, không đăng lại.
- Kế hoạch chọn nhãn AI **required** bị chặn trước container vì chưa xác minh API gắn nhãn tương ứng. `off` giữ lựa chọn hiện tại. Không âm thầm bỏ yêu cầu nhãn để đăng qua API.
- Đọc `content_publishing_limit` với `config,quota_usage` trước tạo container; các giá trị không biết giữ null. Con số khoảng 100 bài/24 giờ chỉ là bối cảnh, không được hard-code làm quyền hay hạn mức chắc chắn của mỗi tài khoản.

## Đo và đọc comment

Adapter được chọn theo cấu hình tài khoản. Đo bằng API đọc danh tính và permalink đúng bài; dùng media ID đã lưu, hoặc tìm URL trong tối đa 5 trang media của chính tài khoản cho bài đăng bằng browser/thủ công trước đây. Không tìm thấy thì giữ bản đo cũ và báo chưa xác định được media ID.

Insights yêu cầu `views,reach,saved,shares,comments,likes` ở kỳ `lifetime`. Mapper hỗ trợ `plays` nếu dữ liệu trả về dùng tên cũ; **không tự gọi lại bằng metric khác khi API từ chối**, phải đối chiếu version. `saved` → `saves`, `reach` → trường `reach` optional riêng, không thay `viewers`. Thiếu/không hợp lệ/khác kỳ/không rõ giữ null, số 0 tường minh giữ 0. `social_metric.source = 'api'`, có `sourceUrl`, account, handle, observedAt, notes về kỳ đo; các chỉ số không hỗ trợ vẫn null. API lưu nội bộ áp kiểm account/URL như đường browser.

Client đọc comments bằng cursor, không follow `paging.next` chứa token/host lạ; phát hiện cursor lặp, giới hạn mặc định 100 trang và báo chưa đọc hết nếu chạm trần. Chỉ thêm client đọc, **chưa nối comments API vào UI T16 và chưa gửi private reply/DM**. Không mở rộng quyền đăng/nhắn tin từ việc cấu hình token.

## Kiểm offline và giới hạn

`node --test desktop/test/instagram-api.test.mjs` dùng fetch giả, SQLite `:memory:`, bytes fixture và secret codec giả trong test; không phải MP4 thật, token thật, safeStorage Windows thật hoặc nghiệm thu Meta. Test kiểm thứ tự, receipt ghi trước tác động, container lỗi, mất phản hồi từng bước, restart/chống trùng, token, nguồn đo, null/0, reach và phân trang. API/workspace test dùng build tạm từ source, giữ nguyên các test Playwright cũ.

Chưa kiểm: endpoint/version/permission đang được Meta hỗ trợ, quota thực tế, upload video thật, latency/timeout thực, token expiry/refresh, Insights có sẵn theo loại tài khoản, comment paging thực, nhãn AI API, private reply, safeStorage thực và Electron UI. Các cờ mặc định tắt giữ nguyên các giới hạn đó. Báo cáo và cách chạy lại: [T18](../ops/night/out/T18.md).
