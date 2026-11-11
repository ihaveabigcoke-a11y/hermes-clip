# Thư viện công thức video

Checkpoint T05 · 11/11/2026 · Asia/Saigon. Source trong clone `C:/HermesNight/hermes-clip`, nhánh `night-20261111`; chưa triển khai vào bản cài Windows. Bản cài được xác định theo context, không mở bản cài hoặc dữ liệu người dùng trong task đêm.

## Phạm vi đã làm

- `lib/lab/viral-formulas.seed.json` là bản sao nguyên nội dung `ops/night/input/formula-seed.json`: **6 công thức, 12 video tham khảo**. App import JSON tĩnh trong source, không đọc `ops/night/input` khi chạy. Seed được parse và đóng băng sâu; không ghi seed vào SQLite hay thay dữ liệu workspace lúc khởi động.
- `lib/lab/viral-formulas.ts` cung cấp Zod schema `viralFormulaSchema` / `referenceVideoSchema`, type `ViralFormula` / `ReferenceVideo`, `validateFormula`, `formulasForProduct`, `formulaVersions`, `workspaceFormulas`, `referencesForFormula` và `formatBeatTime`.
- Nghiên cứu có khối thu gọn **Công thức video**, chỉ đọc: phiên bản mới nhất, kiểu hook, đặc điểm sản phẩm, overlay, beat/mốc giây, nhãn/CTA, video ví dụ và guardrails. Giữ nhãn/chữ trong video gốc, kể cả ví dụ tiếng Tây Ban Nha. Nội dung bán hàng mới/prompt Muse sau này vẫn dùng tiếng Anh.
- `kind: viral_formula` dùng bảng records hiện có, không cần migration. API lưu phiên bản riêng theo owner và giữ lịch sử; không thêm màn hình sửa hay tự áp công thức vào research/kịch bản trong T05.
- Build local đóng gói thêm JSON tĩnh cạnh module server và trong bundle UI. `scripts/build-local-server.mjs` dùng chung bộ biên dịch API cho build và test HTTP cục bộ. Không thêm dependency, không thay font/theme.

Nguồn phân tích seed: frame 1,25 hình/giây và đếm cắt cảnh bằng FFmpeg theo ghi chú đầu vào; **chưa chép lời audio, chưa có báo giá, không có số liệu chứng minh viral/doanh số**. Task này kiểm cấu trúc, không phân tích lại 12 MP4 gốc. V10 trỏ tới `pov-share-bait` nhưng không nằm trong mảng references của công thức đó; hàm xem ví dụ lấy hợp của hai chiều liên kết nên vẫn hiển thị đủ V1–V12, không sửa suy luận của seed.

## Taxonomy v1 và quy ước thời gian

Không tự thêm/đổi/đồng nhất nhãn khi phân tích lần sau. Giá trị ngoài taxonomy phải được đề xuất riêng để người dùng duyệt phiên bản taxonomy mới; không âm thầm đổi nghĩa dữ liệu v1.

| Trường | Giá trị cố định |
| --- | --- |
| `role` | `hook`, `body`, `cta` |
| `kind` của beat | `problem`, `versus_unbox`, `result`, `cta` |
| `hookType` | `problem_label`, `pov_share_bait`, `do_not_show`, `think_vs_actually`, `authority_check`, `audience_callout`, `emotional_story` |
| Kiểu CTA để phân loại sau này | `comment_keyword`, `send_keyword_dm`, `link_in_bio` |
| `fitProductTraits` | `visual_payoff_one_frame`, `night_glow`, `pet`, `safety`, `running`, `cycling`, `hobby_group`, `identity`, `apparel`, `beauty`, `routine`, `family`, `senior` |

`labelVariants` chỉ dùng khóa beat kind; `ctaPatterns` giữ mẫu chữ, chưa suy kiểu CTA từ câu chữ. `authority_check` đã có trong taxonomy dù chưa có công thức riêng.

- Beat chuẩn luôn có `fromSec < toSec`. `timeOrigin: start` (mặc định khi thiếu) dùng giây không âm từ đầu video.
- CTA trong seed dùng `fromEndSec: 3, toEndSec: 0`. Khi nạp được đổi thành **`fromSec: -3, toSec: 0, timeOrigin: end`**; UI ghi “3–0 giây trước khi hết video”. Chỉ beat có cả `kind` và `role` là `cta` được dùng quy ước từ cuối.
- Muốn đặt vào video dài D giây: CTA chạy từ `D + fromSec` đến `D + toSec`. Không chọn D thay người dùng, không suy D từ khoảng thời lượng tham khảo.
- Beat là gợi ý dựng cảnh, không phải timeline đã render. CTA có thể chồng cảnh kết quả; các khoảng thời lượng seed không bảo đảm mọi mốc beat vừa mọi độ dài. Bước áp vào kịch bản sau này phải kiểm D và điều chỉnh rõ ràng trước khi duyệt.
- `version` thiếu mặc định 1; `updatedAt` thiếu mặc định null. Thời lượng/số cắt reference thiếu là null; số cắt 0 là giá trị biết được. Không ép chuỗi sang số hay null sang 0. Những kind cũ giữ nguyên schema và vẫn parse được.

`formulasForProduct(['night_glow'])` trả `problem-vs-result-cta`. Hàm đếm giao của tập traits chính xác, bỏ traits không biết và trùng, xếp số khớp giảm dần rồi ID; không có khớp thì trả `[]`. Đây là gợi ý độ phù hợp nội dung, không phải điểm hiệu quả. Truyền `workspaceFormulas(records)` làm đối số thứ hai để dùng phiên bản của workspace.

## Lưu công thức người dùng

Hợp đồng `POST /api/lab` hiện có, với phiên/origin của ứng dụng và dữ liệu qua Zod:

```ts
const current = workspaceFormulas(records).find(f => f.id === chosenId)!;
const draft = {
  ...current,
  version: current.version + 1,
  name: editedName,
  beats: editedBeats,
};
const checked = validateFormula(draft);
if (!checked.success) throw checked.error;
const payload = {
  kind: "viral_formula",
  id: viralFormulaRecordId(checked.data),
  revision: 0,
  data: checked.data,
};
// Chỉ gửi payload sau thao tác lưu/duyệt của người dùng.
// Gửi qua API client hiện có của app; không chạy request ngoài phiên app.
```

API tạo ID `viral_formula_<formula.id>_v<version>` và ghi thời gian lưu `updatedAt` phía server. Một record đã lưu là bất biến: gửi lại cặp `(id, version)` trả **409**, không ghi đè dù đổi request ID; gửi `revision > 0` cũng trả 409. CAS trong câu lệnh SQLite chống hai yêu cầu đồng thời. Khi kết quả request chưa rõ, đọc lại record qua GET để đối soát trước khi tạo version khác. Revision workspace và version công thức là hai khái niệm khác nhau: record mới có revision 1, lần chỉnh tiếp tạo record version mới với request revision 0.

Seed là mặc định chỉ đọc trong source. Bản workspace ưu tiên trên **cùng `(id, version)`** mà không sửa seed; khi chưa có record riêng, có thể lưu bản phủ v1. Những lần sửa tiếp phải tăng version. `formulaVersions(records)` giữ mọi cặp hợp lệ; `workspaceFormulas(records)` chọn version số lớn nhất theo id, không theo thời điểm hoặc thứ tự records. Cùng pair ở owner khác không ảnh hưởng nhau. Record sai schema hoặc sai ID chuẩn không được dùng khi hợp thư viện. Giới hạn workspace 2.000 records và kiểm owner/origin hiện có vẫn áp dụng.

References là ID phân tích video trong seed. Công thức người dùng có thể giữ ID mới cho bước phân tích sau; UI ghi rõ nếu chưa có phân tích tương ứng, không tạo video/URL giả. T05 chưa có kho ghi `ReferenceVideo` hay UI nhập/sửa; API/schema là nền móng lưu công thức. Guardrails không phải bằng chứng claim đã được xác minh.

## Quy trình cập nhật sau này — chưa triển khai

1. Người dùng thả MP4 tham khảo. Lưu asset gốc bất biến/checksum và nguồn, ngày quan sát; không suy quyền tái sử dụng nội dung hay thương hiệu từ việc tham khảo.
2. Dùng FFmpeg/ffprobe đã có để đọc thời lượng, trích frame có timestamp và đếm cắt cảnh. Lưu tham số/ngưỡng và phiên bản công cụ để so sánh các lần phân tích. Mức cắt cảnh là quan sát kỹ thuật; không đồng nhất với beat ngữ nghĩa.
3. OCR chữ trên frame, giữ nguyên chữ và mốc giây, phân biệt chữ quan sát được với chữ suy từ tên file/không đọc được. Nếu cần chép lời audio, giữ nguồn riêng. Chọn công cụ OCR/ASR trong task sau, không giả định đã cài.
4. Gửi bằng chứng cùng taxonomy v1 cho Muse phân loại: role/kind, nhãn, hook, CTA, traits, guardrails và liên kết reference. Prompt tiếng Anh, unknown là null; không tự tạo số liệu thị trường hay claim sản phẩm. Giữ quota tối đa 3 lượt/profile/đợt, receipt và đối soát kết quả chưa rõ trước khi gửi lại.
5. Validate JSON và các mốc thời gian; trình bày diff với phiên bản trước để người dùng duyệt. Đề xuất chưa duyệt phải nằm riêng, **không** tự ghi thành `viral_formula` được thư viện chọn mới nhất. Sau khi duyệt, lưu version mới; giữ video/phân tích/phiên bản cũ.
6. Khi nối vào research/kịch bản, ghim `formulaId` + `version` đã duyệt theo sản phẩm, kèm lý do khớp traits và guardrails. Bản công thức mới không tự đổi kịch bản đang duyệt hay media đã tạo. Các trường liên kết mới phải optional/null để giữ tương thích cũ.

Hai hướng tham khảo do brief nêu (chỉ mô tả, **không truy cập mạng hoặc xác minh revision/code của hai repo trong đêm**):

- [bradautomates/head-of-content](https://github.com/bradautomates/head-of-content): cách tìm video outlier rồi dùng Gemini phân tích để rút mẫu nội dung. Có thể học bước chọn tham khảo và lưu nguồn/kỳ đo; Muse vẫn là luồng AI chính ở đây. Không kết luận video outlier sẽ bán được, không thêm Gemini/key/dependency.
- [loveld322/viral-video-blueprint](https://github.com/loveld322/viral-video-blueprint): tách cảnh bằng PySceneDetect, chép lời bằng faster-whisper, OCR bằng PaddleOCR và cấu trúc `template.json`. Có thể học cách lưu timestamp/quan sát có cấu trúc rồi ánh xạ vào taxonomy cố định. T05 không cài các công cụ này; việc chọn công cụ/kiểm giấy phép/chất lượng thuộc task sau.

## Kiểm tra, giới hạn và tiếp tục

Baseline đầu task: `npm test` 98/98; `npm run typecheck` đạt.

### Sửa hồi quy runner — 12/11/2026

Runner báo `desktop/test/local.test.mjs:1:1` thất bại. Test T05 trước đó import trực tiếp `desktop/local-dist/server/lib/lab/viral-formulas.mjs`, chỉ qua trong lượt kiểm riêng có loader chuyển import sang build tạm. Khi chạy lại lần này, bản build hiện có đã chứa module nên lệnh desktop thường qua 179 test, 1 skip. Log lỗi runner được cung cấp không có stack gốc; ca mô phỏng chặn import server build sẵn tái hiện `ERR_MODULE_NOT_FOUND` và cùng lỗi file test trước bản sửa.

Đã tách nguyên bộ biên dịch server khỏi `build-local.mjs` để dùng chung trong `build-local-server.mjs`. `local.test.mjs` tự biên dịch API/source JSON vào thư mục mới `outputs/local-api-test-*`, import đúng bộ đó và truyền `routesPath` cho server fixture, rồi dọn output sau test. Không cần build trước hoặc loader ngoài cho test này; không sửa `local-dist`. Giữ mọi assertion cũ và thêm test đối chiếu nguyên byte seed đã đóng gói cùng gợi ý `night_glow`. Fixture chặn toàn bộ import `local-dist/server` đã qua **10/10** sau sửa (trước sửa exit 1). UI/font/seed workspace mẫu của các test cũ vẫn lấy từ bản build sẵn như trước; không coi đây là hỗ trợ chạy toàn bộ desktop suite khi chưa có UI build.

Các kết quả dưới đây được chạy lại sau sửa; `test:desktop` chạy không có loader chuyển import hay `NODE_OPTIONS`.

| Lệnh | Kết quả T05 |
| --- | --- |
| `npm test` | 103/103 đạt, không skip; thêm seed/taxonomy/timing/traits/null/version/immutability |
| `npm run typecheck` | Đạt |
| `npm run test:api` | 11/11 đạt; SQLite/R2 fixture, thêm owner/canonical ID/CAS/phiên bản bất biến |
| `npm run test:desktop` | 180 đạt, 1 skip, 0 fail; React render offline, kiểm seed trong build mới và lưu/đọc sau restart bằng SQLite fixture |
| `npm run local:build` | Đạt; UI + 20 module/tài nguyên server, gồm JSON seed |
| `git diff --check` | Đạt |

SHA-256 của seed đầu vào, bản source và bản JSON đã build trùng nhau: `49ba48303ad1fab82603e508bae3751a6dcd0655c2b7b13ca668f5011dd81653`.

Log và output kiểm nằm trong `outputs/night-t05/` (Git ignore); log sửa hồi quy có tiền tố `retry-`. `TEMP`, `TMP`, npm cache/userconfig trỏ vào đó; npm offline và tắt update notifier. Build dùng `NODE_OPTIONS=--import file:///C:/HermesNight/hermes-clip/outputs/night-t05/build-register.mjs` chỉ chuyển output của script chuẩn sang `outputs/night-t05/build`, kiểm đường dẫn trước khi xóa/tạo output. Không ghi `desktop/local-dist`. `test-build-register.mjs` là cách kiểm của lượt trước, không dùng khi nghiệm thu lại desktop lần này. Các test UI mới render source React. Các test font/UI cũ vẫn đọc output `local-dist` cũ, không phải bằng chứng UI mới đã chạy thật. Cảnh báo font URL/chunk lớn là cảnh báo build hiện có; font được copy sau bundle.

Ca OpenMontage live skip vì thiếu cấu hình tích hợp như checkpoint trước; không phải blocker thư viện công thức. Test desktop khác chỉ dùng fixture, loopback local và media tổng hợp. Không mở Electron/Chromium, AppData, SQLite người dùng, Muse/Instagram thật; không gọi mạng ngoài. Không sửa snapshot `data/`, `evidence/`, input, phiên/credentials, lockfile/dependency; không commit/push.

Chưa kiểm giao diện thật bằng Windows GUI, MP4/OCR/Muse thật hoặc triển khai bản cài. Không có blocker triển khai source T05. Cơ chế phân tích/cập nhật tự động và màn hình chỉnh sửa là công việc sau theo phạm vi đã nêu, chưa được gọi là hoàn tất.

Runner kiểm diff rồi commit theo quy trình. Khi được phép triển khai, build từ source đã duyệt vào bản đích và mở **Nghiên cứu → Công thức video**: kiểm 6 công thức, đủ 12 ví dụ và CTA tính từ cuối. Chỉnh công thức qua luồng lưu đã duyệt/API trong môi trường kiểm riêng, tăng version rồi đọc lại sau restart. Rollback bằng revert source/test T05 và build lại; giữ nguyên records công thức đã lưu, không xóa DB hay media.
