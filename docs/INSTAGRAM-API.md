# Instagram API — T-004, 12/11/2026

Source mở rộng adapter T18, **mặc định API**, dành cho Instagram Business/Creator qua **Instagram API with Instagram Login** (`graph.instagram.com`). **Chưa kiểm với tài khoản thật**, cho tới khi người dùng tạo Meta App và cấp quyền. Không dùng cookie hoặc token Facebook Page làm token Instagram Login. Không tự chuyển sang trình duyệt khi API lỗi.

## Cấu hình và bước người dùng cần làm trên Meta Developer

1. Tạo Meta App với use case Instagram, thêm **Instagram API with Instagram Login**, giữ Development khi thử nghiệm. Tài khoản phải là Business/Creator. Thêm tester/role cho đúng tài khoản và chấp nhận lời mời theo dashboard Meta hiện hành.
2. Xin các quyền: **`instagram_business_basic`**, **`instagram_business_content_publish`**, **`instagram_business_manage_comments`**, **`instagram_business_manage_messages`**. Với Insights, đối chiếu quyền bổ sung mà dashboard/tài liệu của version yêu cầu (`instagram_business_manage_insights`: **chưa kiểm chứng**). Không coi danh sách scope đã yêu cầu là bằng chứng token được cấp đủ quyền.
3. Cấu hình Instagram Business Login, redirect URI HTTPS chính xác, privacy policy và data deletion URL theo dashboard. Khi phục vụ tài khoản ngoài role/tester, hoàn tất App Review/Advanced Access và xác minh doanh nghiệp nếu Meta yêu cầu. Không mở rộng quyền từ một tài khoản/bài sang các tài khoản/bài khác.
4. Dùng login/token generator chính thức để lấy Instagram User access token và `user_id`. App secret giữ ở môi trường tin cậy; **không nhập secret vào Hermes, Git hoặc báo cáo**. Hermes hiện nhận token đã cấp, chưa có OAuth callback, tự đổi token dài hạn hay refresh. Token hết hạn cần cấp lại.
5. Trong **Cài đặt → Instagram**, từng tài khoản: nhập Meta App ID, Instagram `user_id`, access token → **Lưu API** → **Kiểm tra kết nối**. Nút kiểm gọi `GET /me`, đối chiếu handle với tài khoản đã chọn; hiển thị handle và account type do API trả. Nếu thiếu account type thì hiển thị chưa rõ, không đoán Business. Chỉ báo kết nối từ phản hồi API, không từ việc có token.
6. Sau review source/build và kiểm offline, chủ động chọn nội dung/tài khoản cụ thể để nghiệm thu thật. Không đăng thật hoặc gửi DM thật chỉ để kiểm thiết lập.

Token đi qua IPC vào Electron `safeStorage` (cơ chế secret mã hóa proxy hiện có). SQLite chỉ giữ ciphertext; thiếu kho mã hóa thì từ chối lưu, không fallback plaintext. Status không trả token/ciphertext. Ô token trống giữ token cũ; “Xóa token” xóa bản lưu cục bộ, thu hồi tại Meta làm riêng. App ID là định danh công khai, lưu cấu hình thường. Không ghi request/response raw hoặc exception fetch vào log.

API bật mặc định. `HERMES_INSTAGRAM_API_ENABLED=0` là công tắc kỹ thuật tắt API; không cần đặt `=1`. Version mặc định ghim `v25.0`, có thể cấu hình `HERMES_INSTAGRAM_API_VERSION` sau khi đối chiếu Meta. Đây không phải tuyên bố đã nghiệm thu version trên tài khoản thật. Proxy/Touch VPN cũ chỉ dùng cho trình duyệt, không áp vào API.

## Đăng Reel và receipt

- Trong **Instagram → sản phẩm → Sửa nội dung**, lưu **URL video công khai cho Instagram API**: HTTPS của đúng video đã chọn/duyệt, không localhost hoặc token trong URL. Người dùng phải đưa file lên chỗ lưu trữ được phép và xác minh URL trả đúng file; app không tự cài server/upload ra dịch vụ khác. Checksum chỉ chứng minh file local, **chưa chứng minh bytes tại URL công khai**. Đổi URL phải lưu lại kế hoạch trước khi bấm đăng.
- Luồng: `POST /{user_id}/media` (`media_type=REELS`, `video_url`, caption) → đọc container tới FINISHED → `POST /{user_id}/media_publish` → đọc media/permalink. Giữ snapshot, fingerprint, revision, account, checksum và revalidate trước publish. Không tự đăng nếu chưa có yêu cầu người dùng.
- Receipt ghi **trước** tác động đầu tiên; lưu container ID, media ID và trạng thái từng bước. Mất phản hồi, crash hoặc lỗi sau create giữ **Cần đối soát**, không tự tạo container/publish lại. `PUBLISHED` thiếu media ID không đủ chứng minh permalink.
- Kiểm tra kết quả chỉ đọc lại bằng chứng đúng tài khoản, media ID, caption, timestamp và permalink. Nhãn AI `required` vẫn chặn vì chưa xác minh API hỗ trợ; không âm thầm bỏ nhãn hoặc chuyển browser.
- T18 có mã resumable để đối chiếu/fixture cũ; **main không bật đường này** và không dùng biến `HERMES_INSTAGRAM_API_RESUMABLE`. Hỗ trợ resumable với Instagram Login chưa kiểm chứng; không dùng để tránh yêu cầu URL công khai.

## Insights và bảng sản phẩm

API lấy `views,reach,saved,shares,comments,likes`, kỳ `lifetime`. Mapper giữ plays nếu phản hồi dùng tên cũ; `saved` → saves, reach không thay viewers. Thiếu/khác kỳ/sai kiểu/không rõ giữ `null`; số 0 tường minh giữ 0. Không gọi lại mù bằng metric khác khi Meta từ chối. Có source, permalink, tài khoản và thời điểm đo; lịch API độc lập với công tắc trình duyệt.

Bảng gộp các tài khoản của một sản phẩm, mỗi permalink lấy bản đo mới nhất. Comment CTA và DM tính theo comment ID duy nhất từ khi bật quy tắc; không cộng số paste T16 vào quan sát API. Tổng comment đã thấy **không khẳng định đã đọc toàn bộ lịch sử**; nhật ký có trạng thái đọc đủ/chưa đủ.

Click UTM không được Instagram cung cấp và không suy từ DM. Ở **Nội dung → Link UTM → Nhập số click từ analytics landing**, nhập số riêng cho đúng link, nguồn và kỳ đo. Bảng lấy bản mới nhất mỗi URL UTM, chỉ cộng khi đủ dữ liệu và cùng kỳ; thiếu thì “—”. Đây là nhập bản đo từ analytics, **chưa có tích hợp tự đọc analytics hoặc redirect tracking server**. Đổi link bằng T17 làm trống bản đo cũ. Hàm tạo link T17 dùng chung với DM tại `desktop/src/utm.mjs`, không có hai bản logic tạo UTM.

## Comment → DM trên desktop

- Không có URL HTTPS công khai cho webhook ở app local: dùng **poll mỗi 3 phút khi app mở**. Không cài server/tunnel, không công khai local HTTP API, không nhận webhook chưa ký. Máy ngủ/tắt app thì dừng; khi mở lại chỉ có thể xử lý comment còn trong cửa sổ 7 ngày. Poll tối đa 10 trang × 100 comment mỗi bài/lượt; lỗi/cursor lặp/trần trang hiện “chưa đọc đủ”, không tuyên bố đã đồng bộ toàn bộ.
- Cài đặt chỉ liệt kê bài đã đăng, sản phẩm và tài khoản hoạt động. Người dùng duyệt riêng bài/tài khoản, từ khóa, mẫu có `{link}` và link preview. Dùng UTM theo tài khoản × hook; một từ khóa 2–40 chữ/số. Giữ quy tắc CTA của `d1b57b1`: từ 4–5 ký tự chỉ nhận đúng từ, số nhiều s/es hoặc đảo hai chữ liền nhau; từ ≥6 mới cho thêm một lỗi chèn/xóa/thay chữ. Từ ngắn phải khớp chính xác. Không phản hồi comment của chính tài khoản.
- Bật DM mặc định **tắt**. Bật mỗi quy tắc có xác nhận; đổi revision nội dung/tài khoản/cấu hình API/link thì cần duyệt lại. **Tắt khẩn cấp mọi DM** chặn mọi lần gửi tiếp theo ngay; không thu hồi request đã gửi lên Meta. Tắt một quy tắc không cần kết nối mạng. Sau tắt khẩn cấp, duyệt/lưu quy tắc bật sẽ cho chạy lại các quy tắc đang được duyệt (hộp xác nhận nêu rõ).
- Giới hạn nội bộ 20 DM/giờ/tài khoản, cách ít nhất 10 giây, không phải quota Meta được cam kết. Khi gặp rate limit, backoff 1 giờ. Comment chưa thử gửi vì giới hạn có thể chờ lượt poll sau. **Lượt đã gửi POST dù lỗi/timeout không tự retry**.
- Ghi claim `sending` trước POST private reply `/{user_id}/messages`, JSON `recipient.comment_id` + `message.text`; cần `message_id` để xác nhận sent. Khóa bền theo comment ID qua restart, không xóa receipt để gửi lại. Timeout/thất lạc → Cần đối soát; không có nút ép gửi lại. Không gửi follow-up hoặc public reply.
- **Follow mặc định yêu cầu xác minh. Polling này chưa xác minh được follow, nên giữ `follow_unknown` và KHÔNG gửi link.** Người dùng muốn gửi cho mọi người comment CTA phải chủ động bỏ điều kiện follow và duyệt. Không lặp lỗi fail-open của OpenReply. Chưa có callback nút follow hay lấy hồ sơ khách để suy follow.
- T-002c vòng 2: lưu một quy tắc bật/đã duyệt tạo revision mới và cho poll lại ở nhịp kế tiếp. Comment `follow_unknown` của đúng plan/account/product được xét lại khi xuất hiện trong kết quả poll, dùng CTA/mẫu/điều kiện follow mới; vẫn đòi follow thì vẫn không gửi. Giữ thời điểm comment gốc để kiểm cửa sổ **dưới 7 ngày**, không gia hạn khi lưu quy tắc. Giữ trần trang poll đã nêu trên; không khẳng định đã đọc lại mọi comment ngoài trần đó. `sending`, `sent`, `needs_attention`, `error` và receipt có dấu vết gửi không được xét lại. Một comment tối đa một DM; giới hạn tốc độ và tắt khẩn cấp vẫn áp dụng. Lưu quy tắc tắt không gửi gì. Không sửa/xóa receipt cũ để tái gửi.
- Nhật ký lưu ID comment, keyword, thời điểm, product/account/plan, trạng thái, mã message và lỗi đã làm sạch; không lưu nội dung DM của khách, không đọc inbox. UI xem 200 mục gần nhất; receipt chống trùng không cắt theo giới hạn này.

## Trình duyệt cũ

Main dùng boot riêng thay cho `instagram.start()`. Công tắc `instagram_browser_enabled` mặc định false; thiếu/null/giá trị không phải boolean true đều tắt. Khi tắt, chặn open/context/page/VPN, queued dispatch, check và lịch browser metrics; dữ liệu/profile/job/media cũ giữ nguyên. API không phụ thuộc công tắc này.

Chỉ bật tại **Cài đặt → Instagram** sau hộp xác nhận:

> Instagram trình duyệt tự động có thể khiến Meta khoá tài khoản (kể cả dây chuyền). Nên dùng API chính thức. Bật?

Công tắc lưu bền. **Mở lại app vẫn không tự chạy worker trình duyệt, kể cả đã cho phép trước đó**: Cài đặt hiện “Đã cho phép · chờ bật tay”, nút chạy lại yêu cầu cùng cảnh báo. Bật tay chạy worker cũ, có thể tiếp tục các job đang queued đã được duyệt trước đó. Khi tắt không tự hủy hàng chờ hoặc xóa profile. Hồ sơ thiếu `apiMode` mặc định API; hồ sơ đã ghi browser không bị sửa dữ liệu, nhưng worker bị chặn khi công tắc tắt.

## Hợp đồng và nguồn cần kiểm chứng

Mọi request Instagram của đường API chỉ ở `desktop/src/instagram-api.mjs`. Không có API module song song hoặc browser fallback. Nguồn đọc ngày 12/11/2026:

- [Meta Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing), [Private Replies](https://developers.facebook.com/docs/instagram-platform/private-replies), [Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).
- Truy cập Meta trực tiếp trong task bị lỗi fetch/HTTP 429. **Chưa kiểm chứng** trực tiếp endpoint/version/quyền/field tại thời điểm này. Fixture mô tả hợp đồng dự kiến, không chứng minh dịch vụ Meta chấp nhận: `/me` fields user_id,username,account_type; media create/status/publish/permalink; insights lifetime/metric; comments paging/timestamp; content_publishing_limit; messages private reply/receipt/window/rate errors.
- Đã tham khảo README [OpenReply](https://github.com/diwenne/openreply/blob/main/README.md) và [insta-p8](https://github.com/ayuuxh2/insta-p8/blob/main/README.md): keyword → queue → private reply, nhiều tài khoản và nhật ký. Không chép mã, không cài PostgreSQL/Redis/Supabase hoặc server. OpenReply công khai hành vi fail-open follow; Hermes chặn khi chưa rõ.

## Kiểm và chạy tiếp

Xem [báo cáo T-004](../ops/office/reports/T-004.md) cho lệnh, số pass/fail, log và blocker. Test dùng fetch, SQLite, secret/process/browser giả; chỉ dùng MP4 tổng hợp ở những test media sẵn có. Chưa nghiệm thu token/safeStorage Windows, upload/permalink, Insights, private reply hoặc tài khoản thật. Chưa mở bản cài, chưa thay `desktop/local-dist`.

Sau review, boss chạy các lệnh chuẩn và build override `HERMES_LOCAL_BUILD_DIR=outputs/T-004-build`; script chụp UI `node scripts/check-instagram-official-ui.mjs` với `HERMES_ARTIFACTS=D:/hermes-wt/artifacts/T-004`. Chỉ sau khi các kiểm đạt mới build bản cài và thực hiện các bước Meta/tài khoản được duyệt ở trên.
