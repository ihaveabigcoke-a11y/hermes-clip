# Những thay đổi trong đêm 11–12/11/2026

Source trên nhánh `night-20261111` đã có 13 task triển khai còn hiệu lực, đến commit `5f1d4bb`; T10 này bổ sung tài liệu tổng kết. **Bản cài Windows đang dùng chưa nhận các thay đổi đêm.** Không có sản phẩm thật nào được lưu trữ, Reel nào được gỡ, bài nào được đăng hoặc tiền nào được thu trong lượt tổng kết.

Các bước bấm dưới đây dành cho sáng mai, **sau khi source đã được review, build và triển khai vào đúng bản cài**. Không mở thêm clone dùng chung dữ liệu với app đang chạy. Có thể xem ngay ảnh kiểm thử liên kết bên dưới; ảnh dùng dữ liệu giả, không phải giao diện tài khoản thật.

## Quyết định kinh doanh đã ghi lại

- Lưu trữ ba sản phẩm thương hiệu cũ, giữ toàn bộ lịch sử và media.
- Chọn sản phẩm có giá vốn + ship Mỹ ≤ 20 USD khi có báo giá đủ căn cứ. Không tự quy đổi CNY/USD; số chưa biết vẫn để thiếu. Giá bán x3–x4 còn là giả thuyết.
- Thử 1 sản phẩm × 3 tài khoản với nội dung khác nhau. Đo bằng comment từ khóa, DM, chia sẻ và bấm link.
- DM đi qua công cụ chính thức dùng API của Meta. Landing nhận email/đặt chỗ trước, chỉ thu pre-order sau cho sản phẩm thắng.

**Chưa làm trong các task này:** đếm riêng comment chứa từ khóa, tích hợp DM Meta, phễu landing hai bậc hoặc cổng thu tiền. Cũng chưa tạo/đăng nhập ba tài khoản hay chứng minh sản phẩm thắng. Xem [context cập nhật](../../../docs/context/01-BOI-CANH-VA-TRANG-THAI.md) để phân biệt quyết định với phần đã triển khai.

## Từng task và cách tự kiểm

### T01 — Giá vốn và ship có tiền tệ riêng · `709280e`

Ứng viên nhận CNY, giữ đơn vị từng khoản. Chỉ cộng vốn + ship khi đủ số và cùng tiền tệ; không đổi số thiếu thành 0.

- File chính: [operations.ts](../../../lib/lab/operations.ts), [muse-workflows.ts](../../../lib/lab/muse-workflows.ts), [research-candidates.tsx](../../../components/lab/research-candidates.tsx). [Checkpoint T01](../../../docs/context/T01-RESEARCH-CURRENCIES.md).
- Kiểm sáng mai: **Nghiên cứu → đợt có sẵn → Xem → Sửa ứng viên**. Trên hồ sơ thử riêng, nhập vốn CNY, ship USD: mỗi khoản giữ đúng đơn vị, tổng báo khác tiền tệ/chưa đủ số. Để ship trống phải thấy “Chưa biết”, không phải 0. Form hiện tại đã có phần bổ sung T13.

### T02 — Quyết định và độ tin cậy của nghiên cứu · `7286960`

Thêm thử/giữ/loại, lý do, đúng SKU hay tương tự, cảnh kết quả, rủi ro và cạnh tranh có nguồn. Nguồn dùng chung hoặc chỉ số cấp trang được cảnh báo; prompt ưu tiên listing riêng và ngưỡng 20 USD.

- File chính: [research-quality.ts](../../../lib/lab/research-quality.ts), [operations.ts](../../../lib/lab/operations.ts), [research-candidates.tsx](../../../components/lab/research-candidates.tsx). [Checkpoint T02](../../../docs/context/T02-RESEARCH-QUALITY.md).
- Kiểm sáng mai: **Nghiên cứu → Xem** một ứng viên có các trường mới; kiểm lý do, SKU, rủi ro, nguồn và kỳ đo. Với đợt có hai sản phẩm dùng chung nguồn phải thấy “Dùng chung trang nguồn”; chỉ số bị lặp cấp trang có nhãn “Số liệu cấp trang · không dùng để so”. Bản ghi cũ thiếu trường vẫn mở được. Không cần chạy Muse mới để kiểm hiển thị.

### T03 — Bước tiến độ sản phẩm đúng dữ liệu · `f45e8f6`

Tiến độ dựa trên nội dung, bài đã đăng và số liệu liên kết đúng sản phẩm. Chỉ có URL nhà cung cấp hoặc ghi chú Muse chưa kiểm không làm sản phẩm tăng bậc.

- File chính: [product-stage.ts](../../../lib/lab/product-stage.ts), [app.tsx](../../../components/lab/app.tsx). [Checkpoint T03](../../../docs/context/T03-PRODUCT-STAGE.md).
- Kiểm sáng mai: **Tổng quan → Từ ý tưởng đến bằng chứng**, trước khi lưu trữ sản phẩm cũ. Nếu dữ liệu vẫn như snapshot 11/11, Treat Trader ở “Đo nhu cầu”, ChomChom/Ruffwear ở “Nội dung”; sản phẩm mới chỉ có supplier URL ở “Ý tưởng”. Nếu dữ liệu đã đổi, đối chiếu record hiện tại; nhãn tiến độ không chứng minh có đơn hàng.

### T04 — Bảng nghiên cứu gọn và chọn tạo hồ sơ · `758c8b2`

Bảng có ảnh, SKU, vốn + ship, ngưỡng 20 USD, cảnh kết quả, rủi ro và quyết định. Tick chọn tạo hồ sơ chống trùng, tối đa ba lựa chọn; bỏ tick giữ hồ sơ đã tạo. Form nghiên cứu có tiêu chí tự do và tiêu chí có cấu trúc.

- File chính: [research-candidates.tsx](../../../components/lab/research-candidates.tsx), [research-launcher.tsx](../../../components/lab/research-launcher.tsx), [research-selection.ts](../../../lib/lab/research-selection.ts). [Checkpoint T04](../../../docs/context/T04-RESEARCH-COMPARISON.md).
- Kiểm sáng mai: **Nghiên cứu → mở đợt có sẵn**, xem dòng độ đầy đủ và các cột; **Xem** mở chi tiết. Với dữ liệu thử riêng, tick một ứng viên rồi bỏ/chọn lại: chỉ một hồ sơ sản phẩm, không bị xóa. Cửa sổ hẹp cuộn ngang trong bảng. Mở form để xem nút chính **Bắt đầu nghiên cứu**, chưa cần gửi lượt Muse. [Ảnh bảng offline](T04-research-table-1080.png), [ảnh form](T04-research-form-1080.png).

### T05 — Thư viện công thức video · `593e429`

Có sáu công thức và 12 video tham khảo từ đầu vào, xem beat, hook, CTA và giới hạn nội dung. API lưu phiên bản công thức riêng, giữ lịch sử; chưa có màn sửa công thức chính. T06 bổ sung áp dụng vào kịch bản, T12 bổ sung tham chiếu nháp.

- File chính: [viral-formulas.ts](../../../lib/lab/viral-formulas.ts), [viral-formulas.seed.json](../../../lib/lab/viral-formulas.seed.json), [viral-formulas.tsx](../../../components/lab/viral-formulas.tsx). [Checkpoint T05](../../../docs/VIRAL-FORMULAS.md).
- Kiểm sáng mai: **Nghiên cứu → Công thức video**, mở các công thức để xem đủ 12 ví dụ trong thư viện mặc định; CTA có mốc “3–0 giây trước khi hết video”. Đây là mẫu cấu trúc, chưa có số liệu chứng minh viral/doanh số; không có nút tự cập nhật công thức chính từ video.

### T06 — Hai mở đầu A/B từ công thức · `3a80892`

Soạn cảnh nháp tiếng Anh 9:16, tổng 10–18 giây, gợi ý chữ trên video và CTA từ khóa. Hai hook dùng chung body/CTA; lưu nháp không tự duyệt, gửi Muse hay xuất video. Overlay mới là dữ liệu/gợi ý, chưa tự render lên file.

- File chính: [formula-storyboard.ts](../../../lib/lab/formula-storyboard.ts), [production-intelligence.tsx](../../../components/lab/production-intelligence.tsx), [production.ts](../../../lib/lab/production.ts). [Checkpoint T06](../../../docs/context/T06-FORMULA-STORYBOARD.md).
- Kiểm sáng mai: **Tạo nội dung → Mẫu prompt → Mẫu kịch bản từ công thức**, chọn công thức, nhập từ khóa rồi **Soạn hai mở đầu A/B**. Xem thời lượng, hook khác nhau và cảnh báo; **Lưu cảnh nháp và hai biến thể** phải giữ trạng thái nháp. Chỉ thử lưu trên sản phẩm thử phù hợp; chưa chọn đủ video đã duyệt thì không xuất được.

### T07 — Instagram theo tài khoản và nội dung · `95c35ad`

Bảng con theo tài khoản × nội dung có CTA, thời gian đo và link bài; thêm Vào profile/Bấm link. Giữ số thiếu là “—”, chống cộng trùng permalink. Mặc định ẩn sản phẩm lưu trữ/QA và có công tắc hiện lại. Bình luận vẫn là tổng bình luận, chưa đếm riêng từ khóa hoặc DM.

- File chính: [instagram-summary.ts](../../../lib/lab/instagram-summary.ts), [instagram-overview.tsx](../../../components/lab/instagram-overview.tsx), [instagram-panel.tsx](../../../components/lab/instagram-panel.tsx). [Checkpoint T07](../../../docs/context/T07-INSTAGRAM-OVERVIEW.md).
- Kiểm sáng mai: **Kinh doanh → Instagram → Mở rộng** một sản phẩm có bài đã đăng. Kiểm đúng tài khoản, nội dung, CTA và lần đo; thiếu CTA liên kết phải là “—”. Bật **Hiện sản phẩm đã lưu trữ** để xem lại sản phẩm cũ/QA. So sánh hook trong cùng tài khoản, cùng từ khóa CTA. [Ảnh offline 1920 px](T07-instagram-1920.png).

### T08 — Những thao tác UI nhỏ · `5dfa6a5`

Chặn lưu prompt rỗng, tên cảnh hai dòng, Duyệt/Từ chối nằm đầu preview, ẩn lời mời mẫu khi đã có sản phẩm. Thẻ sản phẩm hiển thị tiền tệ/tiến độ/tài khoản; sidebar rộng hơn. Giữ tên “Người mẫu” vì chế độ này dùng ảnh person + product; giữ font/theme.

- File chính: [ui-state.ts](../../../lib/lab/ui-state.ts), [production-desk.tsx](../../../components/lab/production-desk.tsx), [app.tsx](../../../components/lab/app.tsx), [workbench.css](../../../app/workbench.css). [Checkpoint T08](../../../docs/context/T08-SMALL-UI.md).
- Kiểm sáng mai: **Tạo nội dung**, để prompt trống: nút lưu nháp bị khóa và có lời nhắc. **Xem trước** thấy Duyệt/Từ chối/Tải file trước khi cuộn. **Hàng đợi** đọc được tên cảnh; **Sản phẩm** không còn lời mời khám phá mẫu nếu đã có sản phẩm. Thu cửa sổ để kiểm nhãn/nút. [Ảnh preview](T08-preview-1536.png), [ảnh sản phẩm](T08-products-1920.png).

### T09 — Kiểm nhãn AI trước khi đăng · `5f1d4bb`

**Cập nhật sau đêm (commit `9a5a3e6`, theo quyết định của bạn): nhãn AI mặc định TẮT**, kể cả bản ghi cũ thiếu trường. Chỉ khi chọn “Bắt buộc bật nhãn AI”, adapter mới bật/đọc lại nhãn trước Share; không xác nhận được thì dừng ở “Cần đối soát/thao tác tay”, không tự gửi lại. Chưa có luồng tiếp tục job bị chặn nhãn.

- File chính: [instagram-ai-label.mjs](../../../desktop/src/instagram-ai-label.mjs), [instagram-adapter.mjs](../../../desktop/src/instagram-adapter.mjs), [instagram.mjs](../../../desktop/src/instagram.mjs). [Checkpoint T09](../../../docs/context/T09-INSTAGRAM-AI-LABEL.md).
- Kiểm sáng mai: **Instagram → chọn sản phẩm/nội dung → Sửa kế hoạch nội dung → Nhãn AI khi đăng** phải mặc định “Không gắn nhãn AI (mặc định)”. Chỉ khi định dùng chế độ bắt buộc mới cần kiểm công tắc thật bằng **bài nháp tạo thủ công trong Instagram**, theo phần việc làm tay bên dưới. Không dùng nút Đăng của Hermes để thử nháp: luồng đó có thể Share khi đủ điều kiện. **Chưa kiểm trên Instagram thật.**

### T10 — Tài liệu tổng kết · đang chờ runner kiểm/commit

Thêm quy tắc chạy đêm một worker, cập nhật quyết định người dùng, đối chiếu lịch sử commit và hướng dẫn kiểm sáng mai. Chỉ sửa ba file tài liệu.

- File chính: [AGENTS.md](../../../AGENTS.md), [context](../../../docs/context/01-BOI-CANH-VA-TRANG-THAI.md), [CHANGES.md](CHANGES.md).
- Kiểm sáng mai: mở mục **Chạy đêm**, **Cập nhật đêm 12/11/2026** và báo cáo này; mỗi task có commit/checkpoint hoặc ghi rõ chưa commit. T10 chưa triển khai bản cài, chưa chạy lại bộ test ứng dụng; chỉ kiểm tài liệu/phạm vi thay đổi.

### T11 — Kiểm listing và nguồn tham khảo · `74c88f7`

Thêm kiểm nguồn sau research hoặc bấm kiểm lại; kết quả có URL/thời điểm/receipt riêng, không ghi đè giá hay số liệu Muse. Kết quả YouTube được ghi rõ không phải Instagram. Clone thiếu Agent Reach nên chưa xác minh CLI ghim, listing hoặc tìm kiếm thật.

- File chính: [research-sources.mjs](../../../desktop/src/research-sources.mjs), [listing-check.mjs](../../../desktop/src/listing-check.mjs), [research-sources.tsx](../../../components/lab/research-sources.tsx). [Checkpoint T11](../../../docs/context/T11-AGENT-REACH-RESEARCH.md); đọc cùng T14.
- Kiểm sáng mai: **Nghiên cứu và dựng video → Kiểm tra công cụ**, xem công cụ có sẵn. Chỉ sau khi xác nhận công cụ và quyền kiểm mạng, vào đợt có sẵn → **Kiểm lại nguồn**; mở **Xem** để đọc nguồn/thời điểm và cảnh báo. Nếu thiếu công cụ phải thấy “Nguồn: chưa kiểm được (công cụ)” theo T14; không coi đó là website đã chặn và không cần gửi thêm Muse.

### T12 — Phân tích video mẫu thành tham chiếu nháp · `c66140b`

MP4 local/Thư viện được FFmpeg đọc thời lượng, tỷ lệ, cắt cảnh, frame mỗi 0,8 giây và tạo ảnh tổng hợp (contact sheet). Cho chỉnh hook/CTA rồi lưu tham chiếu nháp riêng. Prompt Muse chỉ được chuẩn bị thành chữ; chưa OCR, gửi Muse hoặc sửa công thức chính. Tải Shorts hiện “Chưa hỗ trợ” vì thiếu Agent Reach/yt-dlp trong clone.

- File chính: [reference-structure.mjs](../../../desktop/src/reference-structure.mjs), [reference-youtube.mjs](../../../desktop/src/reference-youtube.mjs), [reference-video.tsx](../../../components/lab/reference-video.tsx), [viral-reference.ts](../../../lib/lab/viral-reference.ts). [Checkpoint T12](../../../docs/context/T12-REFERENCE-VIDEO.md).
- Kiểm sáng mai: **Nghiên cứu → Công thức video → Phân tích video mẫu**, chọn MP4 được phép dùng, tối đa 25 MiB/180 giây. Xem ảnh tổng hợp, thời lượng/tỷ lệ và số cắt; sửa chữ rồi **Lưu thành tham chiếu nháp**, mở lại để đối chiếu. Công thức chính phải còn nguyên. Nút **Kiểm tra hỗ trợ YouTube** chỉ xác nhận khả năng công cụ, chưa chứng minh tải thật.

### T13 — Giữ tiền tệ khi tạo hồ sơ sản phẩm · `deb5620`

Hoàn thiện phần còn thiếu của T01: form ứng viên/sản phẩm có CNY và tiền tệ riêng cho vốn/ship; chuyển sang hồ sơ giữ nguyên số và đơn vị. Khác tiền tệ hiện “Khác tiền tệ · chưa tính biên”, không tự đổi tỷ giá.

- File chính: [domain.ts](../../../lib/lab/domain.ts), [currency-fields.ts](../../../components/lab/currency-fields.ts), [operations.tsx](../../../components/lab/operations.tsx), [primitives.tsx](../../../components/lab/primitives.tsx). [Checkpoint T13](../../../docs/context/T13-PROMOTE-CURRENCIES.md).
- Kiểm sáng mai: dùng ứng viên thử vốn CNY/ship USD/bán USD → tick chọn → **Sản phẩm → Mở hồ sơ** ở thẻ vừa tạo. Vốn vẫn là CNY, biên chưa tính; lưu/mở lại giữ lựa chọn. Thử **Theo tiền tệ chung** trên hồ sơ thử rồi kiểm một sản phẩm USD cũ. Không sửa hàng loạt hồ sơ đã tạo trước đây khi chưa đối chiếu báo giá.

### T14 — Phân biệt lỗi công cụ và cảnh báo nguồn · `11a8f94`

Thiếu công cụ là “chưa kiểm được”; CAPTCHA/403/429/đăng nhập mới là nguồn bị chặn. Loại sản phẩm liên quan khỏi bộ đếm showroom, so giá khoảng gồm hai đầu, thêm GBP; ký hiệu ¥ chưa rõ CNY/JPY giữ chưa biết. Chỉ polling khi đợt đang chờ/chạy và giới hạn đầu ra tiến trình theo byte.

- File chính: [listing-check.mjs](../../../desktop/src/listing-check.mjs), [research-sources.mjs](../../../desktop/src/research-sources.mjs), [research-sources.tsx](../../../components/lab/research-sources.tsx), [integrations.mjs](../../../desktop/src/integrations.mjs). [Checkpoint T14](../../../docs/context/T14-SOURCE-STATUS-HEURISTICS.md).
- Kiểm sáng mai: **Nghiên cứu → Xem → phần nguồn** sau một lượt kiểm được phép: listing đơn có vùng gợi ý không tự thành showroom; giá nằm trong khoảng không bị báo lệch. Chỉ khi có dữ liệu nguồn phù hợp mới kiểm được các trường hợp này trên GUI. Dữ liệu `blocked` cũ do thiếu CLI cần kiểm lại sau khi công cụ sẵn sàng; lịch sử không tự được viết lại.

## Việc người dùng cần làm tay

1. **Lưu trữ ba sản phẩm cũ trong app:** Treat Trader, ChomChom Roller, Ruffwear Front Range Flex Leash. Vào **Sản phẩm → Lưu trữ** ở từng thẻ → xác nhận **Lưu trữ sản phẩm**. Sau đó tại **Instagram**, mặc định không thấy sản phẩm; bật **Hiện sản phẩm đã lưu trữ** để kiểm vẫn còn lịch sử. Lưu trữ chỉ ẩn hồ sơ, không xóa media/receipt, không gỡ bài trên Instagram và không tự hủy lịch đo/lượt đăng đang chờ; kiểm hàng đợi trước khi thao tác.
2. **Gỡ Reel Ruffwear trên Instagram nếu muốn:** người dùng tự mở đúng tài khoản và đúng Reel, đối chiếu nội dung rồi dùng thao tác gỡ của Instagram. Tổng kết này không xác nhận Reel Ruffwear đang tồn tại trên tài khoản nào; snapshot cũ chỉ nghiệm thu một bài Treat Trader. Nếu không tìm thấy đúng Reel thì dừng, không gỡ bài khác. Codex chưa thao tác gỡ bài.
3. **Kiểm nhãn AI bằng bài nháp (chỉ cần nếu dùng chế độ “Bắt buộc bật nhãn AI”; mặc định đã tắt):** tự tạo Reel nháp trong đúng tài khoản đã duyệt, chọn video rồi tới màn caption, tìm công tắc nhãn AI (có thể trong Advanced settings), bật và đọc lại On. Nếu không thấy thì dừng và ghi lại tình trạng. **Dừng trước Share; không bấm Đăng video/Đăng sau khi đăng nhập trong Hermes để làm dry-run.** Ghi tên/ngôn ngữ/vị trí công tắc; nếu cung cấp DOM chỉ lấy đoạn tối thiểu đã bỏ dữ liệu cá nhân. Với bài đã chọn bắt buộc, không đổi sang tắt nhãn chỉ để vượt lỗi selector. [Hướng dẫn chi tiết](../../../docs/INSTAGRAM-AI-LABEL.md).

## Bằng chứng đã có và giới hạn

Kết quả gần nhất thuộc T09 tại commit `5f1d4bb`, được đọc lại từ checkpoint và log local khi làm T10. **T10 không chạy lại các suite ứng dụng dưới đây.**

| Lệnh/kiểm tra của T09 | Kết quả đã ghi |
| --- | --- |
| `npm test` | 136 đạt, 0 fail |
| `npm run test:api` | 16 đạt, 0 fail; SQLite/đối tượng lưu file giả lập |
| `npm run test:desktop` | 242 đạt, 0 fail, 1 skip OpenMontage do môi trường |
| `npm run typecheck` | Đạt |
| `npm run local:build` với `HERMES_LOCAL_BUILD_DIR=outputs/night-t09/build` | Đạt, UI + 22 module API; còn cảnh báo font lúc bundle/chunk lớn |

T04/T07/T08 có báo cáo [UI nghiên cứu](T04-ui-check.json), [UI Instagram](T07-ui-check.json), [UI nhỏ](T08-ui-check.json) và ảnh offline. T09 kiểm DOM HTML tĩnh, không tài khoản/video thật. T12 dùng FFmpeg thật với video tổng hợp; tải YouTube chỉ kiểm bằng bộ chạy giả. Các log T09 local có thể không đi cùng bản Git vì bị ignore; checkpoint đã commit là nơi tra kết quả và giới hạn.

Chưa nghiệm thu Electron/DPI Windows/dữ liệu người dùng, Muse/Instagram/Insights thật, nhãn AI phía Meta, Agent Reach/YouTube thật, DM, landing hoặc thanh toán. Chưa có phép thử đăng trên ba tài khoản. Các phần source đã kiểm không thay cho những lượt nghiệm thu này.

Kiểm tài liệu T10: `git diff --check` đạt; `node --input-type=module` với đoạn kiểm chỉ đọc truyền qua stdin đạt: 96 liên kết nội bộ tồn tại, 13 commit triển khai và 6 commit chỉ có báo cáo khớp lịch sử, đủ 14 mục task có file/cách kiểm. Đối chiếu với HEAD xác nhận hướng dẫn AGENTS/context cũ còn nguyên và chỉ đúng ba file tài liệu thay đổi; UTF-8 hợp lệ, không có dấu xung đột hoặc khoảng trắng cuối dòng. Không có thay đổi code cần test hành vi mới. Runner sẽ chạy kiểm tra và commit theo quy tắc đêm; kết quả runner sau T10 chưa có trong báo cáo này.

Lưu ý lịch sử: T12 `a83d5b9` đã bị revert ở `6942d89`, bản hiện hành là `c66140b`. Các commit “report only” của T04/T06/T07/T08/T09/T10 là nhật ký lượt trước, không phải bằng chứng triển khai; T10 cũ `55e6fa5` chưa sửa tài liệu. `REPORT.md` lúc 00:47 có bảng task trống, đã cũ so với các commit source sau đó. Dùng bảng commit trong context và checkpoint tương ứng để đối chiếu.

## Tiếp tục sau khi người dùng xem lại

1. Runner kiểm/commit; review source rồi triển khai đúng bản cài trước khi làm các bước kiểm GUI trên đây.
2. Kiểm các luồng local và thực hiện ba việc làm tay; ghi kết quả thật riêng với fixture.
3. Xác minh công cụ nguồn/Shorts và draft nhãn AI; lên phạm vi riêng cho DM Meta, đo comment từ khóa và landing hai bậc trước khi đăng thử hoặc thu tiền.
