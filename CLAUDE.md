@AGENTS.md
# CLAUDE.md — Hermes Clip

Cập nhật sáng 13/11/2026. Chỉ đạo người dùng 04:00 thay mốc dừng T-010/T-011. Chế độ CODEX-BOSS: một main agent làm, tự kiểm/review và commit đúng path; không spawn, push hoặc merge. Đọc AGENTS.md, README.md và docs/context/01-BOI-CANH-VA-TRANG-THAI.md trước khi sửa. Báo cáo hiện tại: docs/context/2026-11-13-OFFICE-MORNING.md và STATUS.md ở D:/agent-office/ngh-ch-ti-p-agent-office.

## Mục tiêu và quyền thao tác
- Sản phẩm là đơn vị chính. Mỗi ngày người dùng chọn ba sản phẩm và tự xếp hạng theo nỗi đau, khả năng chứng minh bằng hình và khả năng bán có lời. App không chấm điểm thay.
- Một thân video thử ba hook, giữ giá, CTA và landing trong cùng lượt so sánh. Đo sản phẩm × hook × tài khoản × bài đăng, chỉ tăng sản lượng sau tín hiệu và chi phí có căn cứ.
- Giá vốn + ship về Mỹ tham chiếu ≤20 USD, giá bán khoảng ×3–4. Khác tiền tệ thì cảnh báo, không tự quy đổi. Unknown/null giữ nguyên; ghi nguồn, kỳ đo, đúng SKU hay sản phẩm tương tự.
- Quyền đăng, DM, nhận tiền theo đúng tài khoản/nội dung/phạm vi được duyệt. Đêm này chỉ tạo draft; không đăng/DM/Meta, không dịch vụ trả phí. Không tự động hóa Flow/Gemini/Instagram web.
- Người dùng đã cho worker Muse hiện có dùng profile/phiên hiện có để nghiệm thu. Không đọc/xóa DB, cookie, khóa, proxy chứa mật khẩu hoặc dữ liệu ngoài phạm vi. Muse đã dừng sau hạn chế vùng; không thử lại đêm 13/11.

## Source, bản cài và dữ liệu
Checkout phát triển và launcher Windows: C:/Users/ADMIN/Downloads/Product-Lab-Local/Product-Lab-Local, nhánh main. START-HERMES-CLIP.cmd chạy Electron với UI/API từ desktop/local-dist. Sửa source rồi build; không vá riêng local-dist. Bản cài giữ dữ liệu ngoài Git, không coi seed/fixture là dữ liệu người dùng.

| Dữ liệu | Nơi/nguồn quản lý |
| --- | --- |
| Product, production, content_plan, social_metric, product_selection, product_decision | workspace local, lab_records; lib/lab/domain.ts, operations.ts, production.ts; desktop/local/server.mjs |
| Job, receipt, lịch sử Muse/profile | Worker Store ngoài Git; desktop/src/store.mjs và worker.mjs |
| Prompt manual, Hộp nhận, receipt | desktop/src/manual-media.mjs; manual_exports/manual_receipts/manual_codes |
| OpenMontage và receipt dựng | desktop/src/integrations.mjs, montage_bridge.py |
| Đoạn/chữ và bản xuất | production.renderPlans; production.exports kèm assetId, sha256, verified, renderPlan |
| Ba hook và nháp | production.variants.comparisonGroupId; content_plan.variantId và comparison |

Giữ media, phiên bản và receipt cũ. Không đưa DB/profile/credentials vào Git hoặc báo cáo. Snapshot công khai cũ tại data/evidence không cho phép công khai dữ liệu nhạy cảm mới.

## Các màn đã nằm trong Hermes
- Tổng quan/Phòng sản xuất, Săn sản phẩm, Đối thủ & video, Sản phẩm (chín tab).
- Khung content; Tạo media (video/ảnh); Tín hiệu & Phòng chờ; Thư viện.
- Instagram có Ma trận; Trang giới thiệu; Số liệu có nhập nhanh/CSV và so hook; Quyết định giữ lịch sử.
- Nhà cung cấp AI, Cài đặt, Hướng dẫn “Một ngày với Hermes”. Các view cũ vẫn hoạt động.
- Office nằm ngay trong app. Không dùng/clone repo production-office, không áp patch mẫu phòng ban vào repo nào. Patch người dùng chỉ để tham khảo. Không ghi snapshot ra repo ngoài.

## Luồng một video xuyên suốt
1. Tự gán productKey và rank 1–3 qua lượt chọn theo ngày Việt Nam. Mã ổn định, chọn lại dùng hồ sơ cũ.
2. Hồ sơ có từ khóa CTA, tình huống mở đầu, tên trên hộp và báo giá; Khung content dùng cùng checklist. Không nhận CTA LINK.
3. Duyệt shot/chữ/lượt tạo, tạo bằng Muse hoặc xuất gói manual; lượt tối đa 8 giây. Prompt model tiếng Anh, UI tiếng Việt có dấu.
4. Nhận clip, xem/duyệt take, khóa thân, chọn đoạn thực tế, lưu plan.
5. Ghép bằng OpenMontage hiện có, ASS trắng viền đen giữa trên, cỡ 70 px trên khung 1280; giữ tiếng gốc.
6. Xuất MP4 720×1280, thời lượng và lệch âm/hình trong ±0,1 giây; kiểm bằng validateMedia/ffprobe, lưu asset/hash/provenance.
7. Ba hook trên cùng body và đoạn thân; xuất ba MP4 rồi tạo draft theo tài khoản. UTM chỉ khi đủ tài khoản/landing.
8. Người dùng duyệt và đăng tay, ghi URL; nhập số với observedAt/nguồn, so hook rồi ghi quyết định.

Mười trạng thái productJourneyStep: thiếu mã/hạng → thiếu đầu vào → chưa gói/lượt tạo → chờ clip → chưa chọn đoạn → chưa MP4 hiện hành → chưa ba draft → chờ đăng → chờ số → chờ quyết định. Mỗi trạng thái có một CTA đúng product/project/stage trên hồ sơ và Phòng sản xuất.

## Render plan và bằng chứng
Schema optional, record cũ vẫn parse. Plan gồm productionId, variantId, bodyId, ratio 9:16, size [720,1280], segments[{sceneId,shotId|null,takeId,assetId,sha256,inSec,outSec}], overlays[{text,fromSec,toSec,role:label|cta,style:white-outline-top}], audio:keep.

Mốc shot dự kiến tách khỏi đoạn thực tế. Không ghi đè mốc dự kiến khi kéo in/out. Thân/overlay trong nhóm hook phải đồng nhất, độ dài hook bằng nhau để giữ mốc CTA. Không sửa/xóa take và render cũ. Đổi plan làm mất nhãn MP4 hiện hành đến khi dựng lại; bản cũ vẫn giữ.

“Đủ để xuất prompt” và “Đã xuất MP4” là hai trạng thái khác nhau. Chỉ MP4 có render, asset, hash và metadata kiểm container mới tính đã xuất; record/URL/cookie không chứng minh dịch vụ chạy thành công. Kiểm kỹ thuật không phải duyệt nội dung/công dụng.

Không có trường/nhãn AI trong Khung content, cảnh hoặc bản xuất. Người dùng tự chọn nhãn khi đăng. Giữ theme/font hiện có.

## Muse và phanh
Muse là đường tạo media chính; Flow/Gemini thủ công dự phòng. Nút Tạo bằng Muse cho biết số lượt sắp gửi và số lượt còn của đêm. Giãn nhịp chỉnh trong Cài đặt, mặc định và tối thiểu 60 giây; tối đa 12 lượt cho đêm nghiệm thu. Profile không có giới hạn 3 lượt; bộ đếm profile chỉ giữ lịch sử.

Từ chối/captcha/đăng xuất/cảnh báo hoặc hai lỗi liên tiếp: Tạm dừng, giữ receipt, không thử lại trong đêm; chuyển cảnh còn lại sang manual. Không gửi lại khi chưa đối soát. Hạn mức và phiên thật vẫn được kiểm. Tín hiệu tách Muse từ chối/giới hạn khỏi lỗi.

Đêm này: 1 gửi, 0 clip mới, 2 lỗi (một trước gửi). Clip thật dùng cho nghiệm thu dựng là clip Muse cũ ngày 12/11, không gọi là clip tạo mới. Ba MP4 và ba draft đã có; chưa tài khoản/landing, chưa đăng. Mục tiêu clip Muse mới còn kẹt quyền video theo vùng.

## Hợp đồng Office trong app (v1)
- Hàm thuần buildOfficeView(records, workerStore, manual, integrations, now) chiếu dữ liệu gốc. GET /api/lab?view=office dùng cùng phiên local, host/origin bảo vệ; không có endpoint ghi cho màn theo dõi.
- Local server chỉ 127.0.0.1. View không chứa cookie/key/token/email, cấu hình proxy, đường dẫn tuyệt đối hay prompt đầy đủ. Không có kênh xuất sang repo ngoài.
- Envelope schema=hermes-office-view, version=1, generatedAt, source, today; selection giữ ngày/đợt/sản phẩm/tổng; products giữ productKey/rank/stage; runs giữ nguồn, event/history tối đa 20, output IDs và needsAction; exports/posts/measurements là các đơn vị riêng.
- ID product ổn định; product_selection liên kết selectionDay, batchId, candidateId, productId, rank, reason, active. Ngày dùng vietnamDay/Asia_Ho_Chi_Minh hiện có.
- Run ID job:<id>, manual:<sha256>, compose:<id>. Nhóm queued/sending/generating/checking/library/manual/attention/failed/stopped/refused/unmapped; ready chỉ vào library khi có assetId. Trạng thái lạ phải hiện, không bỏ qua.
- Office đọc receipt render bền vững và metadata đã kiểm, đọc số nhập mới với null/0 nguyên nghĩa. Không cộng lượt media + bản xuất + bài đăng + lần đo thành một số.
- Poll 5 giây và sự kiện workspace; lỗi giữ dữ liệu gần nhất với Mất kết nối, quá 3 phút là Dữ liệu cũ. Demo luôn ghi Dữ liệu mô phỏng.

## Số liệu và quyết định
So hook dùng bản đo mới nhất theo observedAt từng bài, nguồn URL đúng bài và điều kiện so sánh không lệch. Null hoặc mẫu số 0 giữ tỷ lệ null. Bản đo mới ghi null không được lấy số cũ để lấp. Ngưỡng người dùng đặt trong Cài đặt mặc định null: “Chưa đặt ngưỡng”, không tự kết luận. Quyết định đẩy/sửa/bỏ append-only, có lý do/thời điểm.

CSV/TSV có tiêu đề Việt/Anh; số 1,234 trong CSV cần quoted, bảng tab nhận trực tiếp. Bắt buộc preview, dòng lỗi khóa toàn lô, transaction kiểm revision và chống gửi lại. Ô trống null, chuỗi 0 là số 0; giữ lịch sử và nguồn bài.

## Kiểm, review và build
Mỗi task đọc đề ở văn phòng, tag before-T-xxx, khóa đúng path; sửa/test rồi tự review hermes-night-review Office mode, commit đúng path, STATUS và nhả khóa. Không add -A/reset/clean hoặc xóa WIP. Test không hạ assertion; tách fixture, công cụ local thật và dịch vụ thật.

Chạy pnpm typecheck; pnpm test; pnpm test:api; pnpm test:desktop với desktop/tools/ffmpeg/bin trong PATH. UI kiểm 1366/1920. pnpm local:build sau hai việc và cuối đợt, cây sạch và app tắt; không pnpm build. Đóng Electron bằng CloseMainWindow, không kill. Không thay Defender/Smart App Control/registry bảo mật.

Số test/SHA/giờ build cuối ở STATUS văn phòng. Phần chưa kiểm: clip Muse mới, Meta/DM thật, Flow mới, Thùng rác thật, toàn bộ dữ liệu người dùng sau build cuối. Không lấy kết quả fixture làm chứng nhận tài khoản thật.
