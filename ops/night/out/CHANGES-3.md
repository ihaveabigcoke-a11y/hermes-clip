# Đêm 3 — những gì đã đổi và cách tự kiểm

Bản tổng kết T20 ngày **12/11/2026**, giờ Asia/Saigon. Source ở `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, HEAD khi đối chiếu `a5113d6`. Có **11 task có commit và báo cáo done** trong nhóm T15–T19, T21–T27. Các thay đổi **chưa được áp vào bản cài Windows**; kiểm tự động/fixture không thay nghiệm thu trên app và tài khoản thật.

Nguồn: `git log --oneline origin/main..HEAD`, danh sách file/diff commit, đặc tả task, [báo cáo từng task](reports/) và checkpoint bên dưới. [REPORT.md](REPORT.md) hiện là báo cáo lượt trước kết thúc **02:21 ngày 12/11**, chỉ liệt kê đến T10 của lượt đó. Không có dòng FAILED/SKIPPED của đêm 3 để trích lý do; chưa đối soát runner.log của đêm 3. **T25: chưa có dữ liệu** — không thấy đặc tả, báo cáo hay commit trong checkout, nên không tự gán FAILED/SKIPPED. Báo cáo T15 là lượt `a2`; chưa xác minh trạng thái lượt trước.

Các bước tự kiểm dưới đây dành cho **sau khi source đã được review, build và áp vào đúng bản cài**. Bản cài được nhận diện từ context là `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local`; T20 không mở nó. Giữ dữ liệu, media, phiên bản và receipt, không chạy hai bản dùng chung dữ liệu. Có thể kiểm các thao tác local trước, rồi mới thử một lượt Muse đã chọn.

## T15 · Biết sản phẩm cần làm gì tiếp — `d00d5f4`

- **Làm được:** thẻ sản phẩm có bước tiếp theo và nút đi đúng hồ sơ/dự án/Instagram; thêm checklist mẫu và cảnh báo “Chưa kiểm mẫu” ở landing. Bản ghi cũ vẫn đọc được; cảnh báo không tự bật hay chặn một cổng thu tiền.
- **File chính:** `lib/lab/product-next-step.ts`, `lib/lab/sample-check.ts`, `components/lab/app.tsx`, `components/lab/sample-check-fields.tsx`. [Checkpoint/bằng chứng](T15.md).
- **Chưa kiểm chứng:** mẫu/ảnh thật, Electron/DPI, thanh toán; chưa có checkout thu tiền để kiểm cảnh báo tại đó.
- **Cách tự kiểm sau khi áp vào app:** vào **Sản phẩm**, đọc bước trên thẻ rồi bấm **Tiếp tục**: phải mở đúng sản phẩm và bước đang thiếu. Bấm tên sản phẩm để mở hồ sơ, tìm **Kiểm mẫu thật trước pre-order**, nhập ngày/ghi chú và ba mục màu–kích thước, hiệu ứng, đóng gói; lưu rồi mở lại phải còn đúng. Chỉ đánh dấu Đạt theo mẫu đã kiểm; khi “Hiệu ứng như video” còn Chưa kiểm/Không đạt, landing phải hiện cảnh báo.

## T16 · Đếm comment chứa từ khóa CTA — `763a5e0`

- **Làm được:** nhập comment dán tay, đếm đúng từ riêng như `LED`/`led!` nhưng không đếm `ledger`; lưu bản đo có thời điểm/nguồn và lịch sử riêng với Insights. Bảng có số comment từ khóa và tỷ lệ trên lượt xem; thiếu dữ liệu hiện “—”. Đây là phần comment đã dán, không phải số người mua.
- **File chính:** `lib/lab/keyword-comments.ts`, `components/lab/instagram-keyword-comments.tsx`, `lib/lab/instagram-summary.ts`, `app/api/lab/route.ts`. [Checkpoint/bằng chứng](T16.md).
- **Chưa kiểm chứng:** dữ liệu copy từ Instagram thật và Electron; chưa tự lấy nội dung comment hoặc gửi DM.
- **Cách tự kiểm sau khi áp vào app:** **Instagram → sản phẩm → Nội dung → bài đã đăng → Dán comment**. Chọn **Chỉ nội dung comment** hoặc **Username rồi đến comment**, nhập đúng từ khóa, bỏ dòng ngày giờ/nút trả lời và đối chiếu xem trước với phần đã copy. Bấm **Lưu bản đo comment**, mở lại phải có lịch sử; **Tổng quan** phải hiện số mới, còn tổng bình luận Insights giữ nguyên. Nếu comment khớp thiếu username thì số người duy nhất là chưa biết; ở 1366 px có thể cần cuộn bảng sang phải để thấy tỷ lệ.

## T17 · Link UTM riêng cho tài khoản × hook — `f446325`

- **Làm được:** tạo/lưu/sao chép link HTTPS với UTM theo sản phẩm, tài khoản, hook và CTA; giữ query/hash cũ. URL gợi ý lấy từ nút CTA của nháp landing, cần kiểm lại đó có phải trang muốn gửi hay không.
- **File chính:** `lib/lab/utm.ts`, `components/lab/plan-utm-link.tsx`, `components/lab/instagram-overview.tsx`. [Checkpoint/bằng chứng](T17.md).
- **Chưa kiểm chứng:** clipboard Windows, landing/Analytics thật và việc gửi link bằng Meta DM.
- **Cách tự kiểm sau khi áp vào app:** **Instagram → sản phẩm → Nội dung → mở kế hoạch**, nhập **Link landing gốc**, chọn **Biến thể / hook cho link** và CTA; bấm **Tạo và lưu link UTM** rồi **Sao chép link UTM**. Dán vào ô văn bản để kiểm đủ năm tham số, `utm_source=instagram`, `utm_medium=dm`; mở lại kế hoạch phải còn link. Đổi hook A/B rồi tạo lại phải đổi `utm_content`; bảng Tổng quan có link rút gọn, rê chuột thấy URL đầy đủ. Tạo link chưa chứng minh đã đo lượt bấm.

## T18 · Instagram API thử nghiệm, mặc định tắt — `a5113d6`

- **Làm được:** thêm client/adapter API, cấu hình từng tài khoản và token mã hóa; lưu receipt trước tác động, giữ “Cần đối soát” khi kết quả chưa rõ. Insights ghi nguồn `api`, giữ null/0 và reach riêng; client đọc comment có phân trang. Tài khoản cũ vẫn dùng trình duyệt.
- **File chính:** `desktop/src/instagram-api.mjs`, `desktop/src/instagram-api-adapter.mjs`, `components/lab/instagram-panel.tsx`, [docs/INSTAGRAM-API.md](../../../docs/INSTAGRAM-API.md). [Checkpoint/bằng chứng](T18.md).
- **Chưa kiểm chứng:** endpoint/version/quyền Meta hiện hành, app/token, upload thật, safeStorage/Electron. Resumable có cờ riêng tắt; chưa có OAuth/refresh token tự động, comments chưa nối T16, chưa có private reply/DM. Mất phản hồi publish chưa có media ID vẫn phải đối soát, chưa có UI gắn ID để giải quyết.
- **Cách tự kiểm sau khi áp vào app:** **Instagram → sản phẩm → Tài khoản → biểu tượng cấu hình kết nối**: phải thấy **Cách kết nối** mặc định **Trình duyệt (mặc định)** và thông báo API đang tắt. Chỉ khi đã làm các bước Meta trong tài liệu, xác minh endpoint/quyền/version và bật cờ thử nghiệm mới chọn API, lưu cấu hình rồi bấm **Kiểm tra API** để đọc đúng danh tính. Mở lại form token phải trống. Bài kiểm này không cần bấm Đăng; cấu hình token không cấp quyền đăng nội dung khác.

## T19 · Test desktop/API dùng source build tạm — `097830b`

- **Làm được:** bỏ `registerHooks`, dùng helper build chung trong `outputs/`, không phụ thuộc build cũ ở `desktop/local-dist`. Checkpoint ghi giữ điều kiện của 543 assertion cũ; desktop từ 243 đạt + 1 skip thành 247 đạt + 1 skip tại T19, thêm bốn test helper.
- **File chính:** `desktop/test/helpers/local-server.mjs`, `scripts/build-local-server.mjs`, `scripts/run-source-tests.mjs`, `desktop/test/local-server-helper.test.mjs`. [Checkpoint/bằng chứng](T19.md).
- **Chưa kiểm chứng:** Node 24; lượt kiểm trước dùng Node 26.13.0. OpenMontage live vẫn skip do môi trường.
- **Cách tự kiểm sau khi áp vào app:** task này không thêm nút hoặc màn hình. Người phát triển chạy `npm run test:api` và `npm run test:desktop` trong checkout kiểm thử; phải dùng build tạm từ source, không cần chép build vào `desktop/local-dist`. Các màn app phải giữ hành vi vốn có; đây là cải thiện cách kiểm code.

## T21 · Phân tích video mẫu và lưu công thức có duyệt — `e7e8234`

- **Làm được:** tạo thêm sheet dày 4 khung/giây, tối đa 120 khung/tấm; nhập caption/tên file; parse JSON, đối chiếu số đo, khớp công thức và đề xuất cập nhật. Một mẫu lạ chỉ là ứng viên; cần ít nhất hai mẫu cùng cấu trúc mới đề xuất công thức mới. Chỉ lưu tham chiếu/phiên bản khi người dùng bấm.
- **File chính:** `desktop/src/reference-structure.mjs`, `lib/lab/formula-analysis.ts`, `lib/lab/viral-reference.ts`, `components/lab/reference-video.tsx`. [Checkpoint/bằng chứng](T21.md).
- **Chưa kiểm chứng:** video người dùng, độ đọc chữ và clipboard thật; không có transcript âm thanh. Caption dài có thể bị trích đoạn trong prompt, bản nháp vẫn giữ đầy đủ. T21 tự đo/cấu trúc local; phần nhận định hình ảnh cần kết quả AI, được T22 nối Muse.
- **Cách tự kiểm sau khi áp vào app:** **Nghiên cứu → Công thức video → Phân tích video mẫu**, chọn MP4 rồi **Phân tích MP4**: phải thấy thời lượng, sheet thưa/dày và ô caption/tên file. Dùng **Sao chép prompt phân tích** để phân tích thủ công cùng các sheet, rồi **Dán kết quả JSON**; phải thấy hook, beat, CTA/nguồn và cảnh báo. **Lưu tham chiếu** chỉ lưu bản tham chiếu; **Tạo phiên bản công thức mới** là thao tác riêng, giữ phiên bản trước.

## T22 · Gửi ảnh phân tích qua Muse — `a357801`

- **Làm được:** nút **Phân tích bằng Muse** gửi sheet thưa + sheet dày đầu tiên qua adapter upload hiện có; điền kết quả để duyệt, không tự lưu. Có sửa JSON cùng hội thoại và đọc lại receipt khi chưa rõ; lỗi chuẩn bị/upload không gửi prompt hoặc trừ lượt theo fixture.
- **File chính:** `desktop/src/muse-chat.mjs`, `desktop/src/muse-chat-attachments.mjs`, `components/lab/reference-video.tsx`, [docs/MUSE-ANALYSIS.md](../../../docs/MUSE-ANALYSIS.md). [Checkpoint/bằng chứng](T22.md).
- **Chưa kiểm chứng:** Muse thật, selector upload, ảnh phía nhà cung cấp và quota thực. Video dài chỉ gửi sheet dày đầu tiên; chưa đủ để kết luận không có chữ/CTA ở phần còn lại.
- **Cách tự kiểm sau khi áp vào app:** tại phần phân tích T21, dùng **một video 6–20 giây**, chọn profile đã đăng nhập còn lượt rồi bấm **Phân tích bằng Muse đúng một lần**. Phải thấy hai ảnh trong tin nhắn phía Muse, nhận bảng phân tích chờ duyệt và bộ đếm tăng đúng một lượt. Chỉ **Lưu tham chiếu** nếu kết quả đúng. Nếu mất phản hồi, bấm **Đọc lại kết quả**, không gửi lại; nếu JSON sai, giữ receipt và dừng bài kiểm một lượt vì **Gửi tiếp yêu cầu sửa JSON** sẽ tốn thêm lượt.

## T23 · Kiểm ứng viên từ dữ liệu đã lưu — `0aad44c`

- **Làm được:** thêm giá bán lẻ Mỹ có nguồn/ngày, cờ IP, trạng thái listing gộp, mức vốn + ship theo giả thuyết ×3–4 và gợi ý Thử/Giữ/Loại. Chia **Đã quan sát / Suy luận / Chưa biết**, có câu hỏi supplier và link tự kiểm. Gợi ý không đổi quyết định người dùng; thiếu giữ null, không quy đổi CNY/USD.
- **File chính:** `lib/lab/product-check.ts`, `components/lab/product-check.tsx`, `components/lab/product-check-fields.tsx`, `lib/lab/muse-workflows.ts`. [Checkpoint/bằng chứng](T23.md).
- **Chưa kiểm chứng:** báo giá/SKU/ship, giá bán lẻ, quyền IP, Agent Reach và clipboard/mở link thật. Bấm kiểm chỉ phân tích dữ liệu đã lưu, không tự xác minh thị trường hoặc lợi nhuận.
- **Cách tự kiểm sau khi áp vào app:** **Nghiên cứu → bảng ứng viên → Kiểm sản phẩm** ở một hàng. Phải thấy ba phần trên, lý do và dữ liệu còn thiếu; giá thiếu hiện “—”, khác tiền tệ không được coi là đạt ngưỡng USD. Bấm **Sao chép câu hỏi** để kiểm câu hỏi tiếng Anh. Đối chiếu nguồn/giá/ngày đã mở, nhập bằng chứng đúng vào form rồi mở kiểm lại; quyết định cũ của người dùng phải giữ nguyên.

## T24 · Báo cáo kiểm máy móc commit đêm — `bc31c49`

- **Làm được:** script đọc báo cáo tại từng commit T/F, nhận report only/revert, đối soát log đúng SHA và gắn cờ diff cần đọc. Chỉ ghi file báo cáo được chỉ định; không sửa Git hay triển khai app.
- **File chính:** `scripts/night-review.mjs`, `tests/night-review.test.mjs`, [docs/NIGHT-REVIEW.md](../../../docs/NIGHT-REVIEW.md). [Checkpoint/bằng chứng](T24.md).
- **Chưa kiểm chứng:** tích hợp cuối đêm với runner.log thật; kiểm máy móc không kết luận nghiệp vụ đúng hoặc đủ quyền triển khai.
- **Cách tự kiểm sau khi áp vào app:** task này không có nút trong Hermes. Trong checkout, chạy `node scripts/night-review.mjs --base 76fba38 --out ops/night/out/AUTO-REVIEW.md`, rồi mở file: phải có dòng từng commit, trạng thái, cờ và xác nhận HEAD/nhánh/stash trước–sau. Khi có thư mục log đúng đêm mới thêm `--runs`; thiếu log phải ghi chưa xác minh exit code. T20 đã chạy cùng phạm vi, output riêng ở [T20-AUTO-REVIEW.md](T20-AUTO-REVIEW.md).

## T26 · Sửa bốn ghi chú review cũ — `5b3681b`

- **Làm được:** nhận trang chặn “Access Denied/Forbidden/访问受限” trong title/đầu trang; giải thích phí/dự phòng theo tiền tệ chung khi trộn tiền; ghi chú Muse có nguồn gốc vẫn chưa thành bằng chứng chỉ vì sửa chữ. Tài liệu nhãn AI khớp mặc định tắt, chỉ lựa chọn bắt buộc mới chặn khi chưa xác nhận nhãn.
- **File chính:** `desktop/src/listing-check.mjs`, `lib/lab/product-stage.ts`, `components/lab/primitives.tsx`, [docs/INSTAGRAM-AI-LABEL.md](../../../docs/INSTAGRAM-AI-LABEL.md). [Checkpoint/bằng chứng](T26.md).
- **Chưa kiểm chứng:** listing thật, Electron và Instagram; nhận diện trang chặn mới chỉ kiểm HTML fixture.
- **Cách tự kiểm sau khi áp vào app:** mở **hồ sơ Sản phẩm** có tiền tệ vốn/ship khác tiền tệ chung, phí hoặc dự phòng còn thiếu/khác 0: phải thấy “Phí và dự phòng tính theo …”. Với sản phẩm research chưa có bằng chứng/nội dung, chỉ sửa chữ ghi chú phải vẫn ở **Ý tưởng**; có bằng chứng/mẫu thật mới tăng bậc kiểm chứng. Mở cấu hình nội dung Instagram để kiểm nhãn mặc định tắt, không cần đăng. Khi kiểm listing được phép sau này, trang bị chặn phải hiện bị chặn, không hiện “đã đọc”.

## T27 · Bản nháp chưa chọn video và bảng Nghiên cứu — `02db982`

- **Làm được:** bản nháp A/B chưa chọn take hiện **Chờ chọn take** ở các phần liên quan và bị chặn xuất/ghép, không tự lấy video khác. Bảng Nghiên cứu giữ chọn/tên/quyết định/thao tác trong vùng nhìn ở 1366 px; cột phụ vẫn có thể cuộn, 1920 px không cuộn ngang trong fixture.
- **File chính:** `lib/lab/production.ts`, `lib/lab/package.ts`, `lib/lab/workflow-guidance.ts`, `app/workbench.css`. [Checkpoint và ảnh trước/sau](T27.md).
- **Chưa kiểm chứng:** Electron/DPI Windows, media thật; chưa chụp lại màn dưới 1200 px trong task này.
- **Cách tự kiểm sau khi áp vào app:** **Tạo nội dung → Mẫu prompt**, tạo nháp A/B nhưng chưa chọn take; mở phần biến thể/kiểm trước xuất, phải thấy **Chờ chọn take**, nút xuất/ghép bị khóa. Chọn đủ take đã duyệt rồi kiểm lại. Mở **Nghiên cứu** tại 1366×768 và 1920×1080: chọn, quyết định và nút thao tác phải luôn thấy; cột phụ ở 1366 vẫn được cuộn.

## Việc người dùng phải làm tay

1. **Thử “Phân tích bằng Muse” với một video mẫu — T22.** Dùng video 6–20 giây, một profile còn hạn mức, dự kiến tốn **1 lượt**. Xem đủ hai ảnh phía Muse và đối chiếu kết quả với video; tối đa 3 lượt/profile/đợt, không reset bộ đếm. Làm theo [hướng dẫn một lượt](../../../docs/MUSE-ANALYSIS.md); chưa rõ thì đọc lại receipt.
2. **Thử “Kiểm sản phẩm” với một ứng viên — T23.** Đối chiếu listing đúng SKU, báo giá/ship, giá generic ở Mỹ và ngày/nguồn; kiểm ba phần quan sát–suy luận–chưa biết. ×3–4 là giả thuyết, thiếu số giữ null; người dùng tự chốt Thử/Giữ/Loại.
3. **Tạo Meta app nếu muốn dùng API — T18.** Làm trong Development cho tài khoản chuyên nghiệp của mình, xác minh quyền/token/version/endpoint theo [hướng dẫn](../../../docs/INSTAGRAM-API.md) trước khi bật cờ. Giữ token ngoài repo/báo cáo. API hiện chưa có DM tự động.
4. **Bật tự động trả lời comment bằng tin nhắn trong Business Suite.** Chọn đúng tài khoản → Hộp thư/Inbox → Tự động hóa/Automations; nếu có mẫu comment → tin nhắn, đặt đúng từ khóa CTA và nội dung tiếng Anh với link UTM đã kiểm. Tên menu/khả năng hỗ trợ cần kiểm trên tài khoản thật; nếu không có mẫu này, ghi là chưa hỗ trợ, không coi Hermes đã làm thay. Tự thử một comment trong phạm vi đã duyệt, kiểm người nhận và link trước khi mở rộng. Không dùng trả lời tức thì cho tin nhắn đến làm bằng chứng luồng comment → tin nhắn đã chạy.
5. **Lưu trữ ba sản phẩm cũ:** Treat Trader, ChomChom Roller, Ruffwear Front Range Flex Leash. Vào **Sản phẩm → Lưu trữ → Lưu trữ sản phẩm** cho từng sản phẩm; chuyển bộ lọc **Đang lưu trữ** để kiểm còn hồ sơ/media/lịch sử. Lưu trữ không xóa và không gỡ Reel đã đăng. Đêm nay chưa thao tác trên ba hồ sơ thật.
6. **Kiểm `agent-reach --help` của bản tích hợp thật.** Chạy help local trong đúng môi trường đã cài, đọc các lệnh thực sự được hỗ trợ; nếu dùng Python module thì theo [checkpoint Agent Reach](../../../docs/context/T11-AGENT-REACH-RESEARCH.md). Sau đó mới dùng **Kiểm tra công cụ** trong Hermes. Có help hoặc trạng thái công cụ chưa chứng minh đã đọc được listing/YouTube thật; chưa xác nhận lệnh đọc thì giữ “chưa kiểm được (công cụ)”.

## Bằng chứng kiểm và giới hạn tổng kết

Kết quả dưới đây **đọc lại từ báo cáo từng task**, không phải T20 chạy lại các suite. “Đạt + skip” của desktop luôn gồm **1 skip OpenMontage live** do môi trường. Các báo cáo đều ghi typecheck và build output riêng đạt; không build vào `desktop/local-dist` trong task đêm.

| Task | `npm test` đạt | `test:api` đạt | `test:desktop` đạt + skip |
| --- | ---: | ---: | ---: |
| T19 | 136 | 16 | 247 + 1 |
| T23 | 144 | 17 | 249 + 1 |
| T21 | 152 | 18 | 255 + 1 |
| T22 | 152 | 18 | 269 + 1 |
| T24 | 161 | 18 | 269 + 1 |
| T26 | 163 | 18 | 274 + 1 |
| T27 | 166 | 19 | 274 + 1 |
| T15 | 176 | 20 | 274 + 1 |
| T16 | 183 | 22 | 276 + 1 |
| T17 | 189 | 23 | 278 + 1 |
| T18 | 190 | 24 | 317 + 1 |

T21 có FFmpeg thật trên video tổng hợp (6 giây: 24 frame dày; 31 giây: 120 + 4 frame); UI của các task dùng fixture offline; Muse/Meta dùng page/fetch giả. Không lấy các kết quả này làm bằng chứng đã kiểm dịch vụ, mẫu hay video của người dùng.

T20 đã chạy kiểm máy móc 11 commit, đối chiếu các cờ với diff liên quan và kiểm tài liệu. Cờ T19 gồm đường nạp test/font và phần hook bị bỏ; ngưỡng assertion font vẫn giữ. T26 đổi kỳ vọng tiến độ khi sửa ghi chú Muse theo quy tắc mới và thêm ca bằng chứng/nguồn gốc. Các cờ `?? 0` được đọc trong ngữ cảnh revision, số lượt/sheet, fixture hoặc ví dụ tài liệu; số ký tự file Muse ở T23 không phải độ dài riêng prompt (checkpoint ghi prompt 3.625 → 3.945, +8,83%). Đây chưa phải nghiệm thu độc lập toàn bộ logic của 11 task.

T20 chưa có blocker cho tài liệu; còn thiếu bảng/log runner đêm 3 và nghiệm thu app/dịch vụ thật. [Checkpoint T20](T20.md) ghi lệnh kiểm đã chạy và phạm vi file. HEAD, nhánh và stash không đổi; worker không commit/push. Runner sẽ kiểm lại và commit tài liệu theo quy trình.
