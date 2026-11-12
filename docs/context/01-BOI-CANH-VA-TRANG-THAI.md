# Hermes Clip — bối cảnh và trạng thái (source cập nhật đến đêm 3, 12/11/2026)

## Cập nhật T-004 — Instagram Login và comment → DM (12/11/2026)

Sửa trực tiếp app chính trên `main`, tag `before-T-004`, không commit/đổi nhánh/PR. Mặc định dùng adapter API T18 mở rộng; token mã hóa bằng safeStorage, cấu hình theo tài khoản ở Cài đặt. Trình duyệt Instagram mặc định tắt, thiếu/null cũng tắt, chỉ bật tay sau cảnh báo; main dùng boot API riêng. Giữ profile/job/receipt và Muse Bật/Tạm dừng, routing T-002b.

Reel qua URL HTTPS công khai (không bật resumable Instagram Login chưa xác minh), receipt ghi trước tác động/chống trùng; Insights thiếu giữ null. Comment poll 3 phút khi app mở, duyệt theo bài/tài khoản/sản phẩm, private reply một lần/comment ID, giới hạn nội bộ và tắt khẩn cấp. Không xác minh follow thì không gửi link khi có điều kiện follow. Bảng thêm CTA/DM và click UTM từ bản đo analytics có nguồn/kỳ đo, không có tracking server. Codex giữ provider/config/login/env người dùng và có profile tùy chọn; không chạy CLI thật.

**Chưa kiểm với tài khoản thật** cho tới khi người dùng tạo Meta App/cấp quyền. Meta docs trực tiếp bị fetch/429; endpoint/field cần nghiệm thu. Build riêng outputs/T-004-build và fixture đạt; full suite/Chrome vẫn có blocker sandbox. Không mở AppData/SQLite/profile/media thật, không ghi desktop/local-dist. Đọc [báo cáo T-004](../../ops/office/reports/T-004.md), [hướng dẫn API](../INSTAGRAM-API.md) và [Codex](../RESEARCH-WITHOUT-MUSE.md) trước khi chạy tiếp; các đoạn T18/browser mặc định bên dưới là lịch sử.

## Cập nhật T-002b vòng 2 — sửa theo duyệt A–F (12/11/2026)

Giới hạn chặn Codex/JSON theo đúng scope/đợt research; có Bỏ qua, không đối soát cho run/chat trên Nghiên cứu, lưu bền và không gửi lại kết quả cũ. Pause xóa quyền duyệt hàng chờ, job đang chạy vẫn hoàn tất; bật lại cần bấm Chạy/start. Quyền tiếp tục gắn job/profile và thu hồi sau khi hoàn tất, timer không được dùng cho profile/job khác. Nhập research báo số mới/trùng; landing đã lưu import:<tool>, bổ sung kiểm UI. Test nhãn AI bỏ timeout riêng 180 ms để dùng mặc định app 3 giây, không đổi app/assertion. Chi tiết test, blocker sandbox và cách chạy tiếp ở [báo cáo vòng 2](../../ops/office/reports/T-002b.md). Không triển khai bản cài, không dữ liệu/dịch vụ thật, không commit.

## Cập nhật source T-002b — công tắc Muse và tự chọn nhà cung cấp (12/11/2026)

Sửa trực tiếp app chính trên main, không đổi nhánh/commit. Công tắc Muse ở đầu Tài khoản và Cài đặt, mặc định Tạm dừng, bật có xác nhận. Tạm dừng chặn tác vụ mới; media/chat đang chạy tiếp tục và nhập kết quả. Bỏ đóng context/route chặn HTTP/serviceWorkers:block của T-002. Research lưu lượt đang chạy rồi dừng trước lượt tiếp theo.

Một resolver dùng chung theo ready của thẻ kết nối: Muse sẵn sàng → mặc định Muse; không sẵn sàng → media manual, text Codex đã bật hoặc nhập JSON. Lựa chọn cảnh ưu tiên hơn dự án/tự động. Job Muse chưa rõ kết quả giữ Cần đối soát, không chuyển worker; lưu/hiện provider thực thi. Không xóa màn/bảng/file Muse hay reset quota. Hành vi đóng context trong mục T-002 lịch sử bên dưới đã được thay thế.

Typecheck/build riêng outputs/T-002b-build đạt; 74 test tập trung đạt. Full suite còn spawn EPERM; Chrome IPC Access is denied nên chưa có 12 PNG. Script fixture đã sẵn. Chưa áp vào bản cài/dữ liệu thật, chưa gọi Muse/Codex/Instagram/API trả phí. Xem [báo cáo T-002b](../../ops/office/reports/T-002b.md) và [hướng dẫn](../MANUAL-MEDIA.md) trước chạy tiếp.

## Cập nhật source T-003 — JSON và Codex CLI cho research/nội dung (12/11/2026)

Sửa trực tiếp checkout app chính trên `main`, không đổi nhánh/commit. Research có nhập JSON/file (gồm JSON một sản phẩm từ `hermes-product-check`) và copy prompt trung lập. Content/landing nhập thành nháp đúng sản phẩm. Giữ null, nguồn, tiền tệ và metadata gốc của skill; không tự chọn sản phẩm. Codex CLI tùy chọn mặc định tắt, không shell, có timeout/giới hạn đầu ra; chỉ kiểm bằng fixture, **chưa chạy CLI thật**. Muse vẫn mặc định tạm dừng, media manual T-002 giữ nguyên.

Build kiểm riêng `outputs/T-003-build`, không ghi `desktop/local-dist` hoặc mở AppData/SQLite/profile thật. Typecheck và build đã đạt; full suite/PNG còn blocker sandbox (spawn EPERM, Chrome IPC Access is denied). Xem [báo cáo T-003](../../ops/office/reports/T-003.md) cho số test cuối và [cách dùng/chạy tiếp](../RESEARCH-WITHOUT-MUSE.md). Không coi source này là bản cài đã được nghiệm thu.

## Cập nhật T-002 — Muse tạm dừng, media manual (12/11/2026)

Theo người dùng, tài khoản Muse bị khóa ngày 12/11. Source tại `D:/hermes-wt/T-002`, nhánh `codex/T-002-media-manual`, mặc định **Tạm dừng Muse** và nhà cung cấp **manual**. Giữ profile/phiên/job/receipt cũ; worker không mở profile, gửi chat/research/media hoặc đọc lại từ Muse khi tạm dừng. Thêm xuất gói prompt cho cảnh đã duyệt và hộp nhận file có ffprobe/checksum, phiên bản chờ duyệt, chống trùng và gắn cảnh tay. Các hướng dẫn dùng Muse bên dưới là trạng thái lịch sử, không phải yêu cầu chạy trong lúc tài khoản bị khóa.

Chưa áp vào bản cài Windows. Typecheck/build output riêng đạt; 11 test T-002 đạt (MP4/PNG thật do FFmpeg tạo, dịch vụ Muse giả lập đếm 0 lời gọi). Ba suite chuẩn bị môi trường chặn `spawn EPERM`; Chrome IPC bị `Access is denied`, chưa có PNG 1366/1920. Chưa nghiệm thu Electron hoặc file tải thật từ Flow/Gemini. Xem [checkpoint T-002](../../ops/night/out/T-002.md) và [hướng dẫn manual](../MANUAL-MEDIA.md), không coi full suite/UI đã đạt.

## Cập nhật đêm 3 — tổng kết T20 (12/11/2026)

Đối chiếu tại checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, HEAD `a5113d63f2982293961d893893d262c08af84caa`. Đây là source trong clone đêm; bản cài được nhận diện theo context là `C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local`, chưa mở hoặc triển khai trong T20. Bằng chứng của bản cài ngày 11/11 ở các mục dưới vẫn là lịch sử.

Đã đọc `git log --oneline origin/main..HEAD`, đặc tả, báo cáo tại `ops/night/out/reports/`, checkpoint và các diff liên quan. Trong phạm vi đêm 3 sau task pack `76fba38`, có **11 task có commit triển khai và báo cáo `done`**:

| Task | Commit | Kết quả source |
| --- | --- | --- |
| T15 | `d00d5f4` | Bước tiếp theo trên thẻ sản phẩm, điều hướng đúng hồ sơ/dự án, checklist mẫu optional và cảnh báo landing. |
| T16 | `763a5e0` | Dán comment, đếm từ khóa CTA, lưu lịch sử riêng và tỷ lệ trên views; chưa tự lấy nội dung comment. |
| T17 | `f446325` | Tạo/lưu/sao chép link UTM HTTPS theo tài khoản × hook; URL landing gợi ý cần người dùng kiểm. |
| T18 | `a5113d6` | Adapter Instagram API và cấu hình token mã hóa, receipt/insights; mặc định tắt, chưa nghiệm thu Meta. |
| T19 | `097830b` | Test desktop/API dùng build tạm từ source, bỏ module hooks, giữ điều kiện assertion cũ. |
| T21 | `e7e8234` | Sheet dày 4 fps, caption/tên file, parse/khớp/đề xuất công thức; lưu tham chiếu và phiên bản khi người dùng bấm. |
| T22 | `a357801` | Gửi sheet thưa + sheet dày đầu tiên qua Muse, duyệt phản hồi và đọc lại receipt; chưa kiểm Muse thật. |
| T23 | `0aad44c` | Kiểm sản phẩm từ dữ liệu đã lưu: bán lẻ Mỹ, giả thuyết ×3–4, listing/IP, gợi ý và câu hỏi supplier. |
| T24 | `bc31c49` | Script đọc Git/báo cáo/log và gắn cờ để hỗ trợ review đêm; không thay review nội dung. |
| T26 | `5b3681b` | Nhận diện trang chặn, giải thích tiền tệ phí/dự phòng, tiến độ theo nguồn gốc Muse và tài liệu nhãn AI. |
| T27 | `02db982` | Bản nháp thiếu take hiện “Chờ chọn take”, chặn xuất/ghép; giữ cột thao tác Nghiên cứu trong vùng nhìn. |

**T25: chưa có dữ liệu** — không thấy đặc tả, báo cáo hoặc commit; không tự gán FAILED/SKIPPED. `ops/night/out/REPORT.md` hiện là báo cáo lượt trước kết thúc **02:21 ngày 12/11**, chỉ có T13/T14/T06/T12/T04/T07/T08/T09/T10. Chưa có bảng runner đêm 3 hoặc runner.log được đối soát trong T20 để kết luận các lần thử bị FAILED/SKIPPED. T15 có báo cáo lượt `a2`, không suy trạng thái lượt trước từ tên file.

[Tổng kết đêm 3](../../ops/night/out/CHANGES-3.md) ghi cách bấm kiểm từng task và sáu việc người dùng làm tay: thử **Phân tích bằng Muse** với một video/một lượt; **Kiểm sản phẩm** với một ứng viên; tạo Meta app nếu muốn API; thiết lập comment → tin nhắn trong Business Suite nếu tài khoản được hỗ trợ; lưu trữ ba sản phẩm cũ; kiểm `agent-reach --help` đúng bản tích hợp. Các thao tác này chưa được thực hiện trong đêm. Quyền đăng/nhắn tin/nhận tiền vẫn theo tài khoản, nội dung và phạm vi đã duyệt.

Giới hạn cần đọc cùng tài liệu cũ: T21/T22 đã bổ sung phân tích và gửi Muse cho T12; T16 đã có bộ đếm phần comment dán tay, chưa có tự đọc comment/DM. T18 mới có client đọc comment, chưa nối vào T16 hoặc gửi DM; endpoint/quyền/version và upload API cần xác minh trước khi bật, cờ resumable riêng vẫn tắt. T26 thay quy tắc “sửa ghi chú Muse là tăng bậc” bằng nguồn gốc/bằng chứng; nhãn AI mặc định vẫn tắt. Giá ×3–4 vẫn là giả thuyết, thiếu dữ liệu giữ null, không quy đổi tiền; chưa có luồng thu tiền được nghiệm thu.

Kết quả kiểm cuối được **đọc lại từ báo cáo T18**, không phải T20 chạy lại: `npm test` 190 đạt, `test:api` 24 đạt, `test:desktop` 317 đạt + 1 skip OpenMontage; typecheck và build output riêng đạt. Các task có fixture/UI offline, T21 có video FFmpeg tổng hợp; chưa chứng minh Electron/DPI, video/mẫu/tài khoản người dùng, Muse/Instagram/Meta hoặc clipboard thật. T19 chưa kiểm Node 24.

T20 chỉ sửa tài liệu: thêm mục skills vào AGENTS, tổng kết và checkpoint. Đã chạy [kiểm máy móc cho 11 commit đêm 3](../../ops/night/out/T20-AUTO-REVIEW.md), chưa cung cấp `--runs`; `done` là trạng thái báo cáo tại commit, không phải kết luận nghiệm thu toàn bộ. HEAD/nhánh/stash giữ nguyên. Xem [checkpoint T20](../../ops/night/out/T20.md) cho kiểm diff, liên kết, phạm vi và phần chưa xác minh. Runner tiếp tục kiểm và commit; T20 chưa commit/push hoặc áp vào bản cài.

## Cập nhật source đêm T18 — Instagram API có cờ, mặc định tắt

Clone `night-20261111` có client fetch inject cho Instagram Login, adapter đăng/đo theo tài khoản và form cấu hình token dùng safeStorage hiện có. Mặc định vẫn browser; API cần cờ tiến trình + version tường minh, resumable upload có cờ riêng tắt và TODO đối chiếu Meta. Receipt được ghi trước create/upload/publish; lỗi sau create, mất phản hồi hoặc restart giữ cần đối soát, không tự POST lại. Khi thiếu media ID, chỉ đọc trạng thái container và giữ cần đối soát. Insights nguồn `api`, kỳ lifetime, reach optional riêng, null khác 0; comments chỉ có client đọc phân trang, chưa nối UI/DM. Status đăng cũ giữ tương thích, thêm publishSource optional. Domain 190/190, API 24/24, desktop 317 đạt + 1 skip OpenMontage, typecheck/build output riêng đạt; UI fixture cấu hình/nguồn đo đã kiểm 1366/1920. Chưa có Meta app/token thật, chưa đối chiếu tài liệu mạng, chưa triển khai bản cài hoặc kiểm API/safeStorage/Electron thật. Xem [hướng dẫn và giới hạn](../INSTAGRAM-API.md), [checkpoint T18](../../ops/night/out/T18.md).

## Cập nhật source đêm T17 — link UTM theo tài khoản × hook

Clone `night-20261111` có hàm tạo link HTTPS thuần, giữ query/hash, slug ASCII và năm tham số UTM cho Instagram DM. Chi tiết kế hoạch có URL landing gốc, chọn biến thể/hook, CTA, tạo/lưu qua revision và sao chép link đã lưu; bảng tài khoản × nội dung rút gọn link với title đầy đủ. Trường mới optional/null, kế hoạch cũ vẫn đọc được. Landing hiện chỉ có URL nút `ctaUrl`, được dùng làm gợi ý có giải thích; không suy thành URL trang đã xuất bản. Hook mặc định theo bản xuất đã gắn khi xác định duy nhất, chưa chọn dùng mã kế hoạch. Domain 189/189, API 23/23, desktop 278 đạt + 1 skip OpenMontage, typecheck/build output riêng đạt. UI fixture offline đã kiểm lưu/tải lại, lỗi lưu/clipboard, hook A/B, sửa nội dung giữ UTM và 1366/1920; clipboard dùng stub. Chưa triển khai bản cài, chưa kiểm clipboard Windows thật, landing/Analytics hoặc DM Meta thật. Xem [checkpoint, bằng chứng và cách chạy T17](../../ops/night/out/T17.md).

## Cập nhật source đêm T16 — comment từ khóa CTA từ dữ liệu dán tay

Clone `night-20261111` đã thêm **Dán comment** trong chi tiết bài đã đăng: chọn có/không username, xem trước, lưu bản đo `manual_paste` có thời điểm/nguồn/từ khóa và lịch sử riêng, không ghi đè Insights. Counter khớp từ đứng riêng, bỏ dấu câu/emoji, không phân biệt hoa thường; thiếu username ở comment khớp giữ số người duy nhất là null. Bảng T07 có comment từ khóa và tỷ lệ trên views mới nhất, không cộng trùng lượt dán, giữ CTA snapshot khi cấu hình đổi; chưa đo/thiếu views/zero denominator hiển thị —. CTA kế hoạch optional, fallback sang biến thể T06; classifier hỗ trợ hỏi giá/ship/link/CTA cho sản phẩm chung. Domain 183/183, API 22/22, desktop 276 đạt + 1 skip OpenMontage, typecheck/build output riêng đạt. UI offline đã kiểm lưu/tải lại, mất phản hồi và retry cùng ID, 1366/1920; chưa triển khai bản cài, chưa đọc comment hoặc gọi Instagram thật. Các đoạn T07/T10 bên dưới ghi chưa có bộ đếm mô tả trạng thái trước T16. Xem [checkpoint, giới hạn và cách chạy T16](../../ops/night/out/T16.md).

## Cập nhật source đêm T27 — take nháp và bảng Nghiên cứu

Clone `night-20261111` đã rà mọi chỗ đọc `takeId` trong lib/components/app/desktop. Bản nháp A/B có trạng thái **Chờ chọn take** ở kiểm trước xuất, nhóm cảnh/biến thể, guidance, hàng đợi và tổng quan Instagram; không chọn ngầm video đã duyệt. Domain/API tiếp tục từ chối xuất/ghép khi còn pin null, trước khi tải media; không đổi schema lưu trữ. Bảng Nghiên cứu giữ cột chọn/tên/quyết định/thao tác trong vùng nhìn với sidebar 232 px: 1366×768 còn cuộn cột phụ, 1920×1080 không cuộn ngang. Domain 166/166, API 19/19, desktop 274 đạt/1 skip OpenMontage, typecheck/build riêng đạt. UI fixture offline đã chụp trước/sau và kiểm nút xuất/ghép bị khóa; chưa triển khai bản cài hoặc kiểm dịch vụ thật. Xem [checkpoint, audit và ảnh T27](../../ops/night/out/T27.md).

## Cập nhật source đêm T26 — sửa ghi chú review T14/T13/T03/T09

Clone `night-20261111` nhận lại trang chặn “Access Denied”, “Access Forbidden”, “访问受限” trong title hoặc 2 KiB chữ đầu trang; cụm từ ở cuối mô tả và lỗi đọc file cục bộ không tự thành trang bị chặn. Form sản phẩm giải thích tiền tệ phí/dự phòng khi trộn tiền và có khoản chưa biết/khác 0; không đổi phép tính. Tiến độ ưu tiên `researchOrigin` để nhận diện ghi chú Muse dù sửa chữ, giữ tiền tố cũ làm fallback: chỉ sửa ghi chú của sản phẩm research vẫn bậc 0, thêm bằng chứng `proofUrl` hoặc xác nhận mẫu mới lên bậc 1 khi chưa có nội dung/đo nhu cầu. Không thêm schema hay migration. Hai tài liệu nhãn AI giới hạn fail closed ở lựa chọn **Bắt buộc bật nhãn AI**; mặc định vẫn không gắn nhãn, không sửa code nhãn. Xem [checkpoint và kiểm tra T26](../../ops/night/out/T26.md); chưa triển khai bản cài hoặc kiểm dịch vụ thật. Phần T03 cũ mô tả sửa ghi chú là đủ tăng bậc đã được thay bằng quy tắc nguồn gốc này.

## Cập nhật source đêm T24 — kiểm máy móc commit đêm

Clone `night-20261111` có `scripts/night-review.mjs` để runner xuất bảng theo từng commit T/F: trạng thái từ báo cáo tại commit, revert, log đúng SHA/lượt chạy và các cờ diff. Script chỉ đọc Git, chỉ ghi file output; vẫn cần review nội dung theo skill trước khi áp vào app chính. Test Git fixture đã được thêm vào `npm test`; không thay đổi app hoặc bản cài. Xem [cách chạy và giới hạn](../NIGHT-REVIEW.md), [checkpoint T24](../../ops/night/out/T24.md).

## Cập nhật source đêm T22 — gửi contact sheet qua chat Muse

Clone `night-20261111` đã nối nút **Phân tích bằng Muse** vào T21: chọn profile bật, gửi sheet thưa + sheet dày đầu tiên qua adapter upload hiện có, parse phản hồi để người dùng duyệt và chỉ lưu khi bấm. JSON sai có yêu cầu sửa cùng `parentId`; kết quả chưa rõ có đọc lại receipt, không tự gửi lại. Main chỉ nhận mã tác vụ từ renderer, kiểm cấu trúc/checksum/confinement/JPEG-PNG/symlink; chat chữ giữ fingerprint cũ. Lỗi chuẩn bị ảnh không gửi prompt hoặc trừ lượt. Chưa triển khai bản cài, chưa mở Muse/Instagram thật; bằng chứng và kết quả kiểm mới ở [checkpoint T22](../../ops/night/out/T22.md), cách thử một video/một lượt ở [MUSE-ANALYSIS.md](../MUSE-ANALYSIS.md). Phần T21 bên dưới mô tả trạng thái trước khi nối Muse.

## Cập nhật source đêm T21 — phân tích công thức từ video mẫu, chưa gọi Muse

Clone `night-20261111` đã bổ sung sheet 4 fps (11 cột, 200 px/ô, tối đa 120 frame/tấm), caption/tên file optional và bộ prompt/parse/match/đề xuất thuần theo taxonomy T05. UI cho tự gửi sheet, dán JSON, xem beat/CTA/nguồn/cảnh báo rồi lưu tham chiếu qua CAS; chỉ bấm tạo phiên bản mới mới ghi công thức append-only. Giữ dữ liệu cũ, checksum/confinement/JPEG và hợp đồng tác vụ T12. Domain 152/152, API 18/18, desktop 255 đạt/1 skip OpenMontage; typecheck, build riêng và UI offline 1366/1080 đạt. FFmpeg tổng hợp 6 giây có 24 frame dày, 31 giây chia 120+4, đếm từ ảnh giải mã. Chưa triển khai bản cài hoặc phân tích video người dùng/Muse/Instagram thật. Prompt dài có trích đoạn được đánh dấu; caption đầy đủ vẫn lưu để đối chiếu. Xem [checkpoint, giới hạn và cách chạy T21](../../ops/night/out/T21.md).

## Cập nhật source đêm T23 — tự kiểm sản phẩm từ dữ liệu đã lưu

Clone `night-20261111` đã đưa quy tắc của skill `hermes-product-check` vào form/bảng Nghiên cứu: giá bán lẻ Mỹ có nguồn, cờ IP/ghi chú, listing gộp, giả thuyết ×3–4, gợi ý Thử/Giữ/Loại, câu hỏi supplier và link tự kiểm. Gợi ý không thay quyết định người dùng; thiếu giữ null, không quy đổi tiền. Trần launcher được lưu optional trong đợt mới; đợt cũ dùng 20 USD. Prompt 3.625 → 3.945 ký tự (+8,83%). Domain 144/144, API 17/17, desktop 249 đạt/1 skip OpenMontage, typecheck và build riêng đạt. UI fixture offline có ảnh 1366/1080; chưa triển khai bản cài hoặc kiểm Muse/Instagram/nguồn bán lẻ thật. Xem [checkpoint, quy tắc listing và cách chạy T23](../../ops/night/out/T23.md).

## Cập nhật source đêm T19 — test từ build tạm dùng chung

Clone `night-20261111` đã bỏ hook nạp module trong desktop/API test. Các lệnh test dùng một build từ source tại `outputs/local-api-test-*`, dùng chung server/domain/JSON và UI cho kiểm HTTP/font, rồi dọn khi kết thúc. Không cần cập nhật `desktop/local-dist`. Desktop tăng từ 244 lên 248 test (247 đạt, 1 skip OpenMontage); domain 136/136, API 16/16, typecheck và build output riêng đạt. 543 assertion cũ giữ nguyên điều kiện; 48 file build khớp SHA-256 với baseline. Chỉ kiểm fixture trên Node 26.13.0, chưa triển khai bản cài. Xem [checkpoint và cách chạy T19](../../ops/night/out/T19.md).

## Cập nhật đêm 12/11/2026 — tổng kết T10 (lượt trước)

Tổng kết T10 cho đêm 11–12/11, giờ Asia/Saigon. Checkout `C:/HermesNight/hermes-clip`, nhánh `night-20261111`, HEAD khi bắt đầu tổng kết là `5f1d4bb`. Đây là clone phát triển; bản cài Windows được nhận diện theo mục Hệ thống hiện hành bên dưới, không mở để đối chiếu và chưa được triển khai các thay đổi đêm. Mục này cùng các checkpoint T01–T14 cập nhật trạng thái source; phần bằng chứng ngày 11/11 bên dưới vẫn là lịch sử của bản cài.

### Các task đã có commit trên nhánh

Đối chiếu `git log 0e15716..HEAD` và danh sách file của từng commit; bảng ghi các commit triển khai còn hiệu lực, không coi tên task trong nhật ký là bằng chứng chức năng đã hoàn tất.

| Task | Commit | Kết quả source và checkpoint |
| --- | --- | --- |
| T01 | `709280e` | [CNY và tiền tệ riêng của ứng viên](T01-RESEARCH-CURRENCIES.md); phần form/promote được T13 hoàn thiện. |
| T02 | `7286960` | [Quyết định, SKU, rủi ro, cảnh kết quả và cảnh báo nguồn](T02-RESEARCH-QUALITY.md). |
| T03 | `f45e8f6` | [Bước tiến độ sản phẩm theo record có bằng chứng](T03-PRODUCT-STAGE.md). |
| T04 | `758c8b2` | [Bảng so sánh nghiên cứu, tiêu chí và chọn tạo hồ sơ chống trùng](T04-RESEARCH-COMPARISON.md). |
| T05 | `593e429` | [Thư viện 6 công thức/12 video tham khảo và phiên bản bất biến](../VIRAL-FORMULAS.md). |
| T06 | `3a80892` | [Kịch bản nháp theo công thức, hai hook A/B, overlay và CTA](T06-FORMULA-STORYBOARD.md). |
| T07 | `95c35ad` | [Instagram theo tài khoản × nội dung, CTA, lọc lưu trữ và số liệu](T07-INSTAGRAM-OVERVIEW.md). |
| T08 | `5dfa6a5` | [Sửa UI nhỏ: lưu nháp, preview, hàng đợi, thẻ sản phẩm và sidebar](T08-SMALL-UI.md). |
| T09 | `5f1d4bb` | [Kiểm nhãn AI trước Share khi chọn bắt buộc; dừng nếu chưa xác nhận](T09-INSTAGRAM-AI-LABEL.md); chỉ kiểm fixture. Sau đêm: mặc định tắt (`9a5a3e6`). |
| T11 | `74c88f7` | [Kiểm listing và tham khảo YouTube/web bằng Agent Reach](T11-AGENT-REACH-RESEARCH.md); công cụ/dịch vụ thật chưa được xác minh. |
| T12 | `c66140b` | [MP4 → contact sheet/cuts → tham chiếu nháp](T12-REFERENCE-VIDEO.md); tải Shorts bị khóa khi thiếu công cụ. |
| T13 | `deb5620` | [Giữ tiền tệ khi tạo hồ sơ và sửa form](T13-PROMOTE-CURRENCIES.md); khác tiền tệ không tính biên. |
| T14 | `11a8f94` | [Sửa trạng thái công cụ, nhận diện showroom/giá và polling của T11](T14-SOURCE-STATUS-HEURISTICS.md). |

Lịch sử cần đọc đúng: T12 lần đầu `a83d5b9` đã bị revert bởi `6942d89`; dùng bản triển khai lại `c66140b`. Các commit “report only” T06 `3f2bb10`, T04 `b84917d`, T07 `8207b99`, T08 `f43849c`, T09 `d4c6ee2`, T10 `55e6fa5` chỉ lưu nhật ký của lượt trước. T10 lần này mới cập nhật tài liệu, chưa có commit mới tại thời điểm tổng kết; runner sẽ kiểm và commit. Các commit task pack, cấu hình pnpm và morning report là lịch sử vận hành, không phải thêm chức năng sản phẩm.

### Quyết định mới của người dùng

- Dừng dùng ba sản phẩm thương hiệu cũ: **Treat Trader, ChomChom Roller, Ruffwear Front Range Flex Leash**. Người dùng sẽ **lưu trữ, không xóa**; giữ media, phiên bản, file xuất, lịch sử và receipt. Clone đêm chưa thao tác trên dữ liệu thật.
- Ngưỡng lựa chọn là **giá vốn + ship tới Mỹ ≤ 20 USD**, cần báo giá/phạm vi đúng SKU. Thiếu số giữ `null`; CNY hoặc hai khoản khác tiền tệ chưa đủ để kết luận đạt ngưỡng USD, không tự quy đổi. **Giá bán x3–x4 là giả thuyết**, chưa chứng minh lợi nhuận hay sức mua.
- Thử **1 sản phẩm × 3 tài khoản**, nội dung khác nhau; xác định quyền theo từng tài khoản/nội dung. Giới hạn chọn tối đa 3 ứng viên trong app vẫn giữ; kế hoạch này không tự tạo tài khoản hay cho phép đăng hàng loạt.
- Đo nhu cầu bằng **comment từ khóa, DM, chia sẻ, bấm link**. T07 đã hiển thị CTA và chỉ số đang có, nhưng Bình luận vẫn là tổng bình luận; chưa có bộ đếm comment chứa từ khóa hoặc DM. So sánh hook trong cùng tài khoản và cùng từ khóa CTA; thiếu chỉ số vẫn là thiếu.
- DM dùng **công cụ chính thức qua API của Meta**. Đây là hướng triển khai đã chọn, chưa có tích hợp DM được nghiệm thu trong đêm này; không suy thành quyền tự gửi tin nhắn.
- Landing đi **hai bậc**: nhận email/đặt chỗ trước; chỉ mở **pre-order thu tiền sau cho sản phẩm thắng**. Chưa triển khai phễu hai bậc, chưa chốt cổng nhận tiền, điều kiện giao/hoàn tiền hoặc tiêu chí thắng; không tự bật thu tiền.

### Bằng chứng, giới hạn và chạy tiếp

Checkpoint/log T09 ở HEAD ghi `npm test` 136/136, `test:api` 16/16, `test:desktop` 242 đạt/1 skip OpenMontage, typecheck đạt, build UI + 22 module API đạt với output riêng. Đây là kết quả của T09 đã đọc lại khi tổng kết, không phải các suite được chạy lại bởi T10. T04/T07/T08 có ảnh và tương tác UI offline; T09 dùng DOM giả lập; T12 dùng FFmpeg thật với video tổng hợp. Không coi chúng là nghiệm thu trên dữ liệu/file/tài khoản người dùng.

**Chưa kiểm giao diện thật trong Electron, DPI Windows, Muse, Instagram thật, Insights/nhãn AI phía Meta hoặc luồng ba tài khoản.** Clone thiếu Agent Reach/yt-dlp để nghiệm thu nguồn/Shorts; OpenMontage live còn skip do môi trường. T06 chưa render overlay tự động; T12 chưa OCR/gửi Muse/duyệt thành công thức chính; T09 chưa có luồng tiếp tục job bị chặn nhãn. Các giới hạn này còn nguyên dù phần source/fixture đã có commit.

T10 chỉ sửa tài liệu; kiểm diff, liên kết nội bộ, commit và phạm vi file. Không tự commit/push, triển khai bản cài, lưu trữ sản phẩm thật, gỡ Reel hoặc đăng thử. [Tổng kết dễ đọc và cách kiểm sáng mai](../../ops/night/out/CHANGES.md) ghi từng task và ba việc làm tay. `ops/night/out/REPORT.md` hiện là báo cáo runner cũ lúc 00:47 với bảng task trống, không dùng để phủ nhận các commit triển khai sau đó. Runner tiếp tục kiểm tra/commit theo quy trình; nghiệm thu bản cài và dịch vụ thật thực hiện sau, theo đúng quyền người dùng.

## Cập nhật source đêm T09 — nhãn AI trước Share

Clone `night-20261111` đã thêm `content_plan.aiLabel` optional/null, mặc định hiệu lực ban đầu `required` (sau đêm đổi thành **`off`** theo quyết định của người dùng, commit `9a5a3e6`; chỉ `required` tường minh mới bật nhãn), lưu snapshot và kiểm thay đổi cấu hình. Adapter bật nhãn ở màn caption sau chọn video, đọc lại trước Share; thiếu/không xác nhận được nhãn thì giữ `needs_attention` với “Cần đối soát/thao tác tay”, không gửi lại. `off` giữ hành vi đăng cũ. Domain 136/136, API 16/16, desktop 242 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. DOM fixture dùng HTML tĩnh, chặn mạng, không có tài khoản/file video thật. **CHƯA kiểm trên Instagram thật**, chưa triển khai bản cài; job chặn chưa có luồng tự tiếp tục. Xem [checkpoint T09](T09-INSTAGRAM-AI-LABEL.md) và [selector/cách kiểm draft sáng mai, không Share](../INSTAGRAM-AI-LABEL.md).

## Cập nhật source đêm T08 — sửa UI nhỏ

Clone `night-20261111` đã chặn lưu prompt rỗng, mở rộng tên cảnh hai dòng, đưa Duyệt/Từ chối lên đầu preview, ẩn lời mời mẫu khi có sản phẩm, thu gọn màn Sản phẩm và tăng sidebar 232 px. Giữ Người mẫu vì chế độ dùng tham chiếu person + product; thẻ dùng tiến độ T03, giữ null và từng tiền tệ. Domain 135/135, API 15/15, desktop 218 đạt/1 skip OpenMontage, typecheck và build output riêng đạt. UI offline qua 12 nhóm kiểm tra với ảnh 1920/1536/1366/800/390 px; chưa triển khai hoặc kiểm bản cài/dịch vụ thật. Xem [checkpoint T08](T08-SMALL-UI.md) và `ops/night/out/T08-*`.

## Cập nhật source đêm T07 — Instagram theo tài khoản × nội dung

Clone `night-20261111` đã thêm Vào profile/Bấm link, mở rộng sản phẩm thành bảng tài khoản × content_plan, CTA T06 có liên kết và bản đo mới nhất. Giữ null/0 riêng và chống trùng permalink trước khi chia tài khoản. Mặc định ẩn archived/QA, có công tắc hiện lại và mở chi tiết sản phẩm lưu trữ. Thao tác lưu trữ có xác nhận đã tồn tại ở Sản phẩm, được kiểm bằng fixture; không lưu trữ dữ liệu người dùng trong đêm. Domain 132/132, API 15/15, desktop 218 đạt/1 skip OpenMontage, typecheck và `local:build` output riêng đạt. UI fixture offline qua mở rộng/lọc/lưu trữ ở 1920/1366/800/390 px; chưa triển khai hoặc kiểm Instagram thật. Xem [checkpoint T07](T07-INSTAGRAM-OVERVIEW.md) và `ops/night/out/T07-*`.

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
