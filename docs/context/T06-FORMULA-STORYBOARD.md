# T06 — Kịch bản công thức, overlay và CTA từ khóa

Checkpoint 12/11/2026 · Asia/Saigon. Source: `C:/HermesNight/hermes-clip`, nhánh `night-20261111`; một worker, không agent phụ. Bản cài Windows được xác định theo context, không mở hoặc triển khai vào bản cài, không đọc AppData/phiên/DB người dùng.

## Hành vi trước → sau

Trước đây mẫu kịch bản chỉ có hook/body/CTA chung; công thức T05 chỉ xem trong Nghiên cứu. Nay **Tạo nội dung → Mẫu prompt → Mẫu kịch bản từ công thức** cho chọn công thức mới nhất từ `workspaceFormulas(records)`, nhập từ khóa rồi **Soạn hai mở đầu A/B**. `formulasForProduct` nhận thư viện workspace, không ngầm dùng riêng seed. Các bản công thức đã lưu cũng có trong lựa chọn khi sản phẩm chưa có traits; không tự suy traits hoặc hiệu quả bán hàng.

Preview nêu thời lượng, chữ gợi ý, prompt và cảnh báo. **Lưu cảnh nháp và hai biến thể** lưu cả nhóm bằng một command/revision; không tự duyệt, tạo attempt, gửi Muse hoặc ghép video. Hai variant dùng đúng một body và một cảnh CTA; chỉ cảnh hook khác. Trong **Ghép và xuất**, sau khi duyệt kịch bản/video từng cảnh, **Chọn video đã duyệt cho A/B** yêu cầu chọn đúng một take cho mỗi cảnh. Take đã ghim không tự đổi khi có take mới; sửa cảnh vẫn làm mất hiệu lực duyệt/export như trước.

## Hợp đồng dữ liệu và sinh cảnh

- `Scene.overlayText`: optional/null, trim, một dòng, tối đa 60 đơn vị UTF-16. Generator đề xuất tiếng Anh, không để nửa surrogate emoji ở ranh giới. Có ô sửa trong **Chỉnh sửa cảnh** và hiển thị ở preview. Sửa overlay tăng revision và cần duyệt lại; snapshot attempt/take giữ overlay cũ. Snapshot cũ thiếu overlay không lấy nhầm chữ mới của cảnh.
- Variant có `ctaKeyword`, `ctaText` optional/null; keyword là một từ A–Z, tối đa 20 chữ cái. Generator chuẩn hóa đầu vào thành in hoa, mặc định `LINK`; CTA lấy mẫu Comment từ `labelVariants.cta`/`ctaPatterns`, thay `{WORD}`, hoặc dùng `Comment "WORD" for the link`. Lưu cùng keyword/text ở A/B. `formulaId`/`formulaVersion` optional ghi nguồn đúng phiên bản đã chọn; thư viện đổi version không sửa bản nháp đã lưu.
- Item của body/hook/CTA cho phép `takeId: null` khi là nháp. **Không** tự chọn take mới nhất. Command `body`/`variant` thông thường vẫn chỉ nhận ID take đã duyệt; `resolveItems` và các đường xuất chặn null. Command mới `pin_formula` chỉ ghim cả nhóm sau khi xác minh đủ take, vai trò, tỷ lệ, review và revision. Không ghi đè nhóm đã ghim.
- `formulaStoryboard` thuần, không I/O: một cảnh cho mỗi beat, đúng role/kind; thêm một hook B dùng cùng thời lượng/tham chiếu. Chỉ gắn phiên bản mới nhất của ảnh tham chiếu vai trò product. Prompt dùng dữ liệu invariants/allowedClaims; thiếu là null, giữ câu chặn bịa claim/đo đạc/testimonial/công dụng. Không tự dựng kết quả khi thiếu proof, không thêm nguy hiểm hay chứng thực cơ quan nhà nước.
- Thời lượng: lấy giao khoảng công thức với 10–18 giây, chọn trung điểm; giữ ít nhất 1 giây/cảnh, phân bổ phần còn lại theo độ dài beat, làm tròn 0,1 giây. CTA mốc từ cuối được dùng làm trọng số độ dài, không cộng timeline chồng lấn. UI nói rõ đã điều chỉnh thành cảnh nối tiếp. Công thức không thể chứa vừa 18 giây hoặc thiếu cấu trúc một hook/nội dung/tối đa một CTA cuối sẽ báo lỗi, không lưu nửa nhóm.
- Công thức `do-not-show` seed có hai beat, không có CTA riêng: vẫn sinh đúng hai beat mỗi biến thể; CTA keyword lưu trong caption/metadata chung, không tự thêm beat thứ ba. Các công thức còn lại dùng cảnh CTA đã có. Nhãn giữ nguồn `labelVariants` theo beat; placeholder được điền bằng gợi ý trung tính. Nhãn chứa lời chứng thực/placeholder chưa giải quyết/chữ cái ngoài ASCII chuyển sang gợi ý POV tiếng Anh trung tính. Guardrails gốc hiển thị để người dùng đối chiếu; prompt dùng hướng dẫn tiếng Anh theo taxonomy, không tự dịch chi tiết goal/guardrail tùy biến.

`promptWarnings` nhận thêm hồ sơ sản phẩm để kiểm prompt và overlay: hook thiếu chữ, dạng testimonial ngôi thứ nhất, và laser/neon trail/glow chưa có trong invariants/allowedClaims. Có xử lý các câu phủ định như “No laser, neon trail or glow” và “Avoid …, but …”. Đây là heuristic từ khóa, chưa hiểu mọi phủ định, ngôn ngữ hoặc mức độ hiệu ứng; không phải xác nhận claim/testimonial hợp lệ. Mẫu câu FTC theo yêu cầu task được giữ nguyên. UI, font/theme và quyền gửi/đăng giữ nguyên.

Overlay là hướng dẫn chữ để thêm khi dựng, **chưa tự burn chữ vào video**. Manifest gói xuất giữ overlay và variant CTA cho bước dựng; prompt yêu cầu không vẽ chữ trong generation. Không có yêu cầu tự render overlay trong T06.

## File thay đổi

| File | Nhiệm vụ |
| --- | --- |
| `lib/lab/formula-storyboard.ts` (mới) | Generator thuần từ công thức, thời lượng, nhãn, CTA, prompt |
| `lib/lab/intelligence.ts` | Export generator, ba nhóm cảnh báo |
| `lib/lab/production.ts` | Schema tương thích, command nguyên khối, liên kết nháp/ghim take, snapshot |
| `lib/lab/media-catalog.ts` | Đọc overlay đúng snapshot, giữ kết quả legacy |
| `lib/lab/package.ts` | Overlay trong manifest |
| `components/lab/production-intelligence.tsx` | Lựa chọn công thức workspace, CTA, preview/lưu nháp |
| `components/lab/production-desk.tsx` | Đặt panel trong Mẫu prompt, hiển thị overlay/cảnh báo theo sản phẩm |
| `components/lab/production.tsx` | Nối command, sửa overlay, hiển thị CTA, chọn take cho A/B |
| `tests/intelligence.test.mjs` | Beat/role/thời lượng/nhãn/version/facts và cảnh báo dương/âm |
| `tests/production.test.mjs` | Chia sẻ body/CTA, gates, idempotency, chọn take, snapshot/schema cũ |
| `tests/contracts.test.mjs` | Overlay snapshot và legacy không có trường |
| `tests/production-api.test.mjs` | Route thật trên fixture: CAS, nguyên khối, replay, đọc lại, scope |
| `desktop/test/viral-formulas-ui.test.mjs` | Render source React offline, công thức lưu mới nhất, UI chỉ soạn nháp |
| `desktop/test/local.test.mjs` | Server build từ source, lưu/đọc sau restart SQLite fixture |
| `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, file này | Context và checkpoint |

Không sửa dependency/lockfile, seed, `data/`, `evidence/`, `ops/night/input/`, task queue hoặc `desktop/local-dist`. Không commit/push, chuyển branch, mở Electron/Chromium hay gọi mạng ngoài. HTTP test chỉ loopback, SQLite/R2/media là fixture; không chạy Muse/Instagram. Không thêm `module.registerHooks`; test UI mở rộng loader source đã có, test server dùng `scripts/build-local-server.mjs`.

## Kiểm tra và bằng chứng

Baseline domain **108/108**, TypeScript đạt. Kết quả cuối:

| Lệnh | Kết quả |
| --- | --- |
| `npm test` | **117/117**, 0 skip/fail |
| `npm run typecheck` | Đạt |
| `npm run test:api` | **13/13**, 0 skip/fail |
| `npm run test:desktop` | **197 đạt, 1 skip** OpenMontage do thiếu môi trường, 0 fail |
| `node outputs/night-t06/build-check.mjs` | UI + **21** module/tài nguyên server, đạt |
| `git diff --check` | Đạt |

Log ở `outputs/night-t06/{domain,typecheck,api,desktop,build}.log`, Git ignore. TEMP/TMP, npm cache/userconfig/globalconfig nằm trong output task; npm offline/update notifier tắt. Lượt đầu cấu hình nhầm npm userconfig/globalconfig cùng file làm npm từ chối khởi động; đã tách file trước baseline, không phải lỗi baseline ứng dụng.

Hai lỗi phát hiện trong lượt tập trung/full đã sửa, không xóa/nới assertion cũ: câu “I bought this is not an allowed line” bị đánh cảnh báo; kết quả `mediaInstructions` legacy vô tình thêm khóa overlay null. Thêm ca phủ định và snapshot optional để giữ hồi quy. Test cũ so sánh sâu kết quả legacy vẫn nguyên vẹn.

**Không chạy trực tiếp `npm run local:build`** vì script hiện hành xóa/ghi `desktop/local-dist`, trái quy tắc task. Dùng cùng source `scripts/build-local.mjs` qua `outputs/night-t06/prepare-build.mjs`: xác nhận root/target trong workspace, chỉ chuyển output thành `outputs/night-t06/build`, sửa đường dẫn import compiler tương ứng rồi chạy `build-check.mjs`. Server dùng compiler chuẩn `build-local-server.mjs`. Không sửa build script trong Git, không thêm loader/hook. Cảnh báo font URL/chunk >500 kB như build hiện hành; font được copy sau bundle. Runner có thể chạy lệnh chuẩn sau khi kiểm theo quy trình riêng.

## Giới hạn, blocker, tiếp tục

Không có blocker triển khai source T06. Chưa kiểm thao tác GUI Windows, ảnh/video Muse thật, Instagram hoặc triển khai bản cài. Render React tĩnh không chứng minh tương tác GUI; media được duyệt trong domain test là fixture, không chứng minh sản phẩm có công dụng thật. Không xác minh mọi biến thể tiếng Anh hoặc ngôn ngữ của label/claim người dùng; cần xem bản nháp trước khi duyệt. Quota/receipt/phiên bản cũ giữ nguyên.

Sau runner review/commit và khi được phép nghiệm thu bản cài: mở **Tạo nội dung → Mẫu prompt**, chọn seed hoặc formula đã lưu, nhập `LED`, soạn/lưu A/B. Xem các cảnh vẫn chưa duyệt; sửa overlay rồi duyệt từng cảnh trước khi chạy theo quota hiện có. Duyệt video thật, vào **Ghép và xuất → Chọn video đã duyệt cho A/B**, kiểm hai timeline dùng cùng body/CTA. Thêm chữ trong công cụ dựng và kiểm hình/âm thanh trước mọi quyết định đăng. Rollback source bằng revert commit của runner rồi build lại; không xóa records, take, media hoặc receipt.
