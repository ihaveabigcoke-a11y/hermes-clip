@AGENTS.md

> Quyết định trực tiếp mới nhất 13/11/2026: Office nằm ngay trong Hermes Clip. Không dùng repo production-office, không áp patch mẫu. T-010 = chọn theo ngày + buildOfficeView; T-011 = hai màn trong app. Không ghi live/snapshot.json hoặc snapshot ra AppData. Giữ dữ liệu, nhóm trạng thái và đơn vị đếm bên dưới. Mốc dừng: fixture 3/3 · 4 active và một lượt media local thật đổi nhóm trên màn Tín hiệu. Không push/merge.

# CLAUDE.md — Hermes Clip (`ihaveabigcoke-a11y/hermes-clip`)

File này dành cho Codex khi build repo Hermes Clip. **`AGENTS.md` vẫn có hiệu lực**: chỉ một agent, giữ dữ liệu gốc, không chạy script có tác động bên ngoài, null không phải 0, test phù hợp, báo cáo tách đã kiểm / chưa kiểm. Chỉ đạo trực tiếp mới nhất của người dùng có ưu tiên; các mô tả lịch sử dưới đây không mở rộng phạm vi. Ai làm boss (Claude hay Codex) theo dòng `Chế độ:` trong `STATUS.md` của repo văn phòng `D:/agent-office/ngh-ch-ti-p-agent-office`, xem `CHE-DO-VAN-PHONG.md`. Ở chế độ `CLAUDE-BOSS`, Codex chỉ làm đúng đề được giao. Giữ Muse tạm dừng và chính sách hiện có; không đổi hạn mức trong T-010/T-011.

## 1. Mục tiêu kinh doanh
- Mỗi ngày chọn **3 sản phẩm**. **Người dùng tự xếp hạng** theo ba tiêu chí: nỗi đau của khách, khả năng chứng minh công dụng bằng hình, khả năng bán có lời (vốn + ship về Mỹ ≤ 20 USD, giá bán khoảng ×3–4). App chỉ hiện dữ liệu giúp xếp, không chấm điểm thay. Ưu tiên đưa **một** sản phẩm vào sản xuất trước. Đợt mới vẫn hiện cùng những sản phẩm từ hôm trước còn việc.
- Video có cảnh mở bắt mắt trong **2 giây đầu**. Drama đến từ tình huống hoặc bằng chứng nhìn thấy được, không đến từ lời kể.
- Với mỗi sản phẩm ưu tiên: làm **một thân video**, rồi thử **ba hook**. Giữ nguyên giá, CTA và trang bán trong một lượt so sánh. Ghi rõ `sản phẩm × hook × tài khoản × bài đăng` để khi có dữ liệu thì đọc được hành vi hỏi mua, bấm link và đặt hàng.
- Chỉ tăng sản lượng sau khi đã có tín hiệu mua, đủ để xem chi phí và lợi nhuận thật.

## 2. Trách nhiệm của repo này
- Là **app vận hành thật** và là **nguồn dữ liệu gốc**: SQLite, media, phiên bản, bản xuất, biên nhận. Mọi thao tác tạo, duyệt, xuất và đăng diễn ra ở đây.
- **Cung cấp trạng thái cho hai màn Office trong app** theo "Hợp đồng tích hợp" (mục 8). Office chỉ đọc.
- Không biến Office thành nơi ra lệnh. Không thêm endpoint ghi nào cho Office.

## 3. Bản đồ dữ liệu đã kiểm trong source (`adf48c9` trên GitHub)
> Theo `STATUS.md` văn phòng (01:13 13/11), `main` trên máy người dùng là **`17cb38c`**, chưa push. Bản đó đã có: T-005 (chọn 3 sản phẩm thì tự tạo hồ sơ), T-006 (nén file), **T-007 (kịch bản v2)** và **T-008 (rea-video, đọc ảnh)**. Bảng dưới viết theo `adf48c9`. Trước khi làm, đọc lại các file ở HEAD và ghi những chỗ đã đổi, nhất là `formula-storyboard.ts` và luồng Video mẫu.

| Dữ liệu | Nơi lưu | File |
|---|---|---|
| Record nghiệp vụ (`product`, `production`, `research_batch`, `content_plan`, `social_metric`, `keyword_comment_measurement`, `viral_formula`, …) | `<userData>/worker/workspace/workspace.sqlite` (đã kiểm: `main.mjs` gọi `startLocalServer({root: join(userData,"worker","workspace")})`), bảng `lab_records(owner_id,id,kind,data,revision,created_at,updated_at)` | `desktop/local/server.mjs`, `lib/lab/server.ts`, `lib/lab/domain.ts` (`schemas`), `lib/lab/operations.ts` |
| Job Muse + lịch sử | `<userData>/worker/worker.sqlite`, bảng `jobs`; kv `generation_batch` | `desktop/src/store.mjs`, `desktop/src/worker.mjs`, `desktop/src/contracts.mjs` (`transitions`) |
| Gói prompt tay, Hộp nhận media, biên nhận | kv `manual_exports`, `manual_receipts`, `manual_codes`, `manual_inbox` | `desktop/src/manual-media.mjs` |
| Ghép video (OpenMontage) | kv `integration-jobs`; `Integrations.compose()` ghép **nguyên clip**, chưa cắt in/out, chưa đè chữ | `desktop/src/integrations.mjs`, `desktop/src/montage_bridge.py` |
| Gói nguồn ZIP + `render.ps1` | `production.exports[kind=package]` | `lib/lab/package.ts` |
| Thân video / biến thể hook | `production.bodies`, `production.variants` (`hook`, `cta`, `ctaKeyword`, `ctaText`, `formulaId`) | `lib/lab/production.ts` |
| Mẫu kịch bản theo công thức | `formulaStoryboard()`: 4 cảnh, prompt nhiều câu cấm, cảnh CTA riêng | `lib/lab/formula-storyboard.ts` |
| Đo số liệu | `production.measurements` (views, clicks, orders…), `social_metric`, `keyword_comment_measurement`, `content_plan.utmClicks` | `lib/lab/production.ts`, `lib/lab/operations.ts` |

Giờ Việt Nam đã có sẵn (`timeZone: "Asia/Ho_Chi_Minh"` trong `lib/lab/domain.ts`). Dùng lại, không viết hàm mới.

## 4. Giữ gì từ hai bản mẫu (và đổi tên theo quyết định 13/11)
- **"Kịch bản" đổi thành "Khung content"**: vẫn giữ, nhưng vai trò là **khung** của nội dung (cấu trúc beat, shot, chữ đè, CTA), không phải nơi viết lời thoại.
- **"Video viral" chuyển vào "Đối thủ"**: mỗi sản phẩm có danh sách **link video của sản phẩm đối thủ** (Reels/TikTok/YouTube), ở tab Đối thủ của hồ sơ và ở mục Đối thủ & quảng cáo trong Phòng Nghiên cứu. Link nào đã chạy rea-video thì nối với bản phân tích (timeline shot, chữ đè), và có nút "Dùng làm khung content" để mang sang Khung content. Thư viện công thức (12 mẫu) giữ làm nguồn dựng khung.
Bản mẫu nằm ở repo `hermes-clip-production-office`, nhánh `feat/kich-ban-v2-video-mau-tin-hieu`: các màn `references.html`, `script.html`, file `storyboard-v2.js` kèm 26 test trong `tests/storyboard-v2.test.js`. **Chưa kiểm** nhánh này đã được merge vào `main` hay chưa.
- **Video đối thủ / mẫu:** chọn một video, xem timeline shot và chữ đè, rồi bấm một nút để mang **cả mẫu lẫn sản phẩm** sang Khung content.
- **Khung content:** giữ ba hàng **Shot / Chữ đè / Lượt tạo** trên **cùng một thước giây**. Thiếu từ khoá CTA, tình huống mở đầu hoặc tên in trên hộp thì khoá nút xuất. Không nhận từ khoá `LINK`. Lượt tạo tối đa 8 giây. Không có cảnh CTA riêng: CTA là chữ đè 4–6 giây cuối cảnh kết quả, hoặc đặt ở caption.
- Số đo 12 video mẫu (đều là video AI): khoảng 41 cắt/phút, 1,5 giây/shot, không video nào có lời thoại, 6/12 có CTA đè chữ.
- Không có trường, cờ hay nhãn "AI" nào trong kịch bản, cảnh hay bản xuất. Người dùng tự chọn nhãn lúc đăng.

## 5. Phạm vi đợt build đầu: **một video xuyên suốt**
Đi từ đầu tới cuối cho **một** sản phẩm, rồi mới mở rộng ra:

1. Chọn sản phẩm và công thức.
2. Lên shot và chữ đè.
3. Xuất prompt.
4. Nhận clip.
5. Chọn đoạn dùng được.
6. Cắt, ghép, đè chữ.
7. Xuất MP4 mở được.
8. Thay ba hook trên cùng một thân video.

**Hai trạng thái phải tách rõ:**
- **Đủ để xuất prompt:** kịch bản có đủ đầu vào bắt buộc, gói prompt sinh ra được.
- **Đã xuất MP4:** có bản xuất `kind: render`, có `assetId`, `sha256`, và qua `validateMedia`/ffprobe (720×1280, đúng thời lượng, phát lại được).

**Hai loại mốc thời gian phải tách rõ:**
- Mốc shot **dự kiến** (`plannedFrom`/`plannedTo` trong kịch bản).
- Đoạn **thực tế** chọn từ clip trả về (`takeId`, `inSec`, `outSec`).

Không sửa mốc dự kiến khi người dùng chọn đoạn thực tế.

**Dữ liệu tối thiểu để cắt và ghép.** Chốt cái này **trước** khi port toàn bộ engine kịch bản hay làm đủ 9 tab hồ sơ:
```
renderPlan {
  productionId, variantId, bodyId, ratio: "9:16", size: [720,1280],
  segments: [ { shotId|null, sceneId, takeId, assetId, sha256, inSec, outSec } ],   // theo thứ tự phát
  overlays: [ { text, fromSec, toSec, role: "label"|"cta", style: "white-outline-top" } ], // tính theo thời gian của bản ghép
  audio: "keep"  // đã chốt 13/11: giữ tiếng gốc của từng đoạn, không lót nhạc, không tắt tiếng
}
```
- Hook là đoạn đầu tiên của `segments`. Ba biến thể hook dùng chung các đoạn thân, chỉ khác đoạn hook. Giá, CTA và landing giữ nguyên.
- Bổ sung cho compose: cắt `inSec`/`outSec` và đốt chữ đè. Dùng lại `validateMedia`/`toolchain` trong `desktop/src/media.mjs` và luồng `Integrations.compose()`. Chỉ thêm một bước FFmpeg trực tiếp nếu OpenMontage không cắt được, và nói rõ lý do trong báo cáo.

**Không làm trong đợt này:** đủ 9 tab hồ sơ, đổi menu theo phòng ban. Có thể làm sau khi mốc nghiệm thu đạt. rea-video (T-008) đã có trên máy người dùng; chỉ nối link video đối thủ vào luồng đó khi làm tab Đối thủ.
- Ghép giữ **tiếng gốc**. Khi nối nhiều đoạn, tiếng phải liền mạch, không câm lệch hình. Có test: thời lượng âm thanh khớp hình trong ±0,1 giây.

## 6. Thứ tự làm
0. **Xác minh:** HEAD, `git status` sạch, đọc `AGENTS.md` và `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, đọc code T-005 ở HEAD. Ghi lại khác biệt so với bảng ở mục 3.
1. **Đợt chọn theo ngày + hồ sơ ổn định:**
   - Thêm `selectionDay` vào `research_batch`, `productKey` vào `product` (**người dùng tự gán**, bắt buộc khi chọn vào đợt; app gợi ý từ tên nhưng không tự lưu), và bản ghi lượt chọn có `rank` 1–3 do người dùng xếp.
   - Chọn lại một sản phẩm đã có thì dùng lại hồ sơ cũ, không tạo bản sao.
   - Đếm được: **hôm nay đã chọn n/3**, **tổng lượt chọn qua các ngày**, **số sản phẩm khác nhau**.
   - Schema mới để optional/nullable, record cũ vẫn đọc được.
   - Có fixture "hôm nay 3, hôm qua 1 khác còn việc".
2. **Dữ liệu cho hai màn Office trong app** (mục 8): hàm thuần `buildOfficeView(records, workerStore, manual, integrations, now)` kèm test fixture, đọc qua route local đã xác thực. **Đây là mốc nghiệm thu đầu tiên.**
3. **Một video xuyên suốt** (mục 5):
   - `renderPlan` và màn chọn đoạn in/out trên take.
   - Cắt, ghép, đè chữ, xuất `render`.
   - Ba biến thể hook.
   - `content_plan.variantId` để nối với bài đăng.
4. Đổi tên Kịch bản → **Khung content**. Thêm **link video đối thủ** vào hồ sơ (tab Đối thủ), có nút "Dùng làm khung content". Kiểm T-007 trên máy đã giữ đủ khẳng định của 26 test trong `storyboard-v2.js` chưa; thiếu cái nào thì bổ sung. Sau đó làm hồ sơ nhiều tab, rồi menu phòng ban.

## 7. Lệnh kiểm
Đã xác minh **có trong `package.json`** (`adf48c9`). **Chưa chạy** trong lượt soạn file này; theo `STATUS.md` của office, các lệnh này đã chạy đạt trên máy người dùng ngày 12/11:
```
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:desktop        # cần ffmpeg/ffprobe trong PATH
pnpm local:build         # chỉ khi app đang tắt; KHÔNG dùng pnpm build
```
`pnpm test:integrations` cần cấu hình OpenMontage thật: chạy nếu có cấu hình, không thì ghi "skip" kèm lý do.

## 8. Hợp đồng tích hợp
## Hợp đồng tích hợp Hermes Clip → Agent Office (v1.1)

> Phần dữ liệu kế thừa hợp đồng cũ; chỉ đạo trực tiếp mới nhất chuyển hai màn vào Hermes, nên không cần đồng bộ repo Office riêng. v1.1 giữ các quyết định người dùng chốt ngày 13/11: `productKey` tự gán, tự xếp hạng, video đối thủ. View vẫn ghi `version: 1` vì chỉ thêm trường optional.

### Nguyên tắc
- **Hermes Clip là nguồn dữ liệu gốc.** Hai màn theo dõi trong app chỉ đọc; lựa chọn sản phẩm vẫn thực hiện trong màn Nghiên cứu.
- Server local nghe 127.0.0.1 ở cổng ngẫu nhiên, giữ cookie phiên và chặn host/origin lạ. Hai màn trong app dùng cùng route đã xác thực; không có kênh chia sẻ ra repo ngoài.
- Snapshot không chứa cookie, key, token, email, cấu hình proxy, đường dẫn tuyệt đối trên máy hay nội dung prompt đầy đủ.

### Cách đọc trong app (thay vận chuyển file theo chỉ đạo trực tiếp)
- `buildOfficeView(records, workerStore, manual, integrations, now)` là hàm thuần, giữ cấu trúc dữ liệu v1 phía dưới.
- Màn trong Hermes đọc qua `GET /api/lab?view=office` với cùng cookie, host và origin bảo vệ hiện có. Không có endpoint ghi dành cho màn theo dõi.
- Không ghi snapshot ra file, không cấu hình thư mục Office, không dùng repo production-office.
- Khi đang mở màn, cập nhật sau sự kiện workspace và mỗi 5 giây. Lỗi đọc giữ dữ liệu cuối với nhãn Mất kết nối; quá 3 phút là Dữ liệu cũ. Demo riêng luôn ghi Dữ liệu mô phỏng.

### Định danh (ID)
| Thực thể | ID | Hiện có trong Hermes | Cần bổ sung |
|---|---|---|---|
| Ngày chọn | `selectionDay` dạng `YYYY-MM-DD`, theo giờ `Asia/Ho_Chi_Minh` | Không. Record `research_batch` chỉ có `created_at` | Thêm `selectionDay` vào `research_batch`. Record cũ lấy ngày từ `created_at` đổi sang giờ Việt Nam |
| Đợt nghiên cứu | `batchId` = id record `research_batch` | Có | — |
| Sản phẩm | `productId` = id record `product` | Có, nhưng đang là `research_<batchId>_<candidateId>` (`lib/lab/operations.ts`), tức là gắn với đợt | Thêm `productKey` **do người dùng tự gán** (đã chốt 13/11): mã ngắn, duy nhất, không đổi, ví dụ `GLOWPAW-HARNESS`. App không tự sinh, chỉ gợi ý. Chọn lại ở đợt khác bằng cùng `productKey` thì **dùng lại hồ sơ cũ** |
| Lượt chọn | `selectionId` = `<selectionDay>:<productId>` | Không. Mới có `research_batch.selectedIds` (tối đa 3) | Bản ghi lượt chọn: `{selectionDay, batchId, productId, rank, reason}`. `rank` 1–3 do **người dùng tự xếp** (đã chốt 13/11); app không tính điểm thay |
| Dự án sản xuất | `productionId` = id record `production` (có `productId`) | Có | — |
| Cảnh / shot | `sceneId` trong `production.scenes` | Có | `shotId` khi có kịch bản v2 |
| Lượt chạy media | `runId` có tiền tố nguồn: `job:<id>` (Muse, bảng `jobs` trong `worker.sqlite`) · `manual:<sha256>` (biên nhận Hộp nhận media, kv `manual_receipts`) · `compose:<id>` (kv `integration-jobs`) | Có, nằm rải ở 3 nơi | Hàm gom về một dạng chung |
| Take / tài sản | `takeId`, `assetId` (+ `sha256`) | Có (`production.scenes[].takes`) | — |
| Thân video / biến thể hook | `bodyId`, `variantId` (`variant = hook + body + cta`) | Có (`production.bodies`, `production.variants`) | — |
| Bản xuất | `exportId` = `production.exports[].id` (`kind: package \| render`) | Có | Bản `render` phải có `assetId` + `sha256` + kết quả ffprobe thì mới tính là **đã xuất MP4** |
| Bài đăng | `postId` = id record `content_plan` (có `productId`, `accountId`, `productionId`, `assetId`, `utmHookId`, `status`) | Có | Thêm `variantId`, để nối `sản phẩm × hook × tài khoản × bài đăng` |
| Lần đo | `measurementId` = id record `social_metric` / `keyword_comment_measurement` (có `planId`) | Có | — |

### Office view v1 (dữ liệu tối thiểu)
```json
{
  "schema": "hermes-office-view",
  "version": 1,
  "generatedAt": "2026-11-13T09:00:00+07:00",
  "source": { "app": "hermes-clip", "commit": "<git sha nếu biết, không thì null>", "timezone": "Asia/Ho_Chi_Minh" },
  "today": "2026-11-13",
  "selection": {
    "limitPerDay": 3,
    "days": [ { "day": "2026-11-13", "batchId": "…", "productIds": ["…"] } ],
    "totals": { "selectionsAllDays": 0, "distinctProducts": 0 }
  },
  "products": [ {
    "id": "…", "key": "…", "name": "…", "stage": "research|script|media|review|publish|done|dropped",
    "firstSelectedDay": "…", "lastSelectedDay": "…", "selectionCount": 1,
    "active": true, "priorityRank": 1, "openActions": 2, "updatedAt": "…",
    "competitorVideos": [ { "url": "https://…", "platform": "instagram|tiktok|youtube|other", "competitor": "…|null", "referenceId": "…|null" } ]
  } ],
  "runs": [ {
    "id": "job:…|manual:…|compose:…", "kind": "media|compose",
    "productId": "…|null", "productionId": "…|null", "sceneId": "…|null", "variantId": "…|null",
    "provider": "muse|manual|codex|grok-cli|fal|openmontage|null",
    "state": "<trạng thái gốc của Hermes>", "group": "<nhóm Office, xem dưới>",
    "createdAt": "…", "updatedAt": "…",
    "lastEvent": { "at": "…", "note": "…" },
    "history": [ { "at": "…", "state": "…", "note": "…" } ],
    "needsAction": { "reason": "…" },
    "outputs": { "assetId": "…|null", "takeId": "…|null" }
  } ],
  "exports": [ { "id": "…", "productId": "…", "productionId": "…", "variantId": "…", "kind": "package|render", "assetId": "…|null", "verified": true, "createdAt": "…" } ],
  "posts": [ { "id": "…", "productId": "…", "variantId": "…|null", "accountId": "…|null", "assetId": "…|null", "status": "draft|planned|published_manual|published_browser", "utmHookId": "…|null", "plannedDate": "…|null" } ],
  "measurements": [ { "id": "…", "postId": "…", "observedAt": "…", "keywordComments": null, "dms": null, "shares": null, "utmClicks": null, "orders": null } ]
}
```
- `needsAction` là `null` khi không cần làm gì. Số chưa biết là `null`, **không bao giờ là 0**. `history` tối đa 20 mục mới nhất cho mỗi lượt.
- `priorityRank` là `rank` người dùng xếp ở lượt chọn gần nhất; `null` nếu chưa xếp.
- `competitorVideos`: link video của sản phẩm đối thủ (tab Đối thủ). `referenceId` trỏ tới bản phân tích rea-video nếu có. Office chỉ hiện link, không tải video.
- `active` = sản phẩm còn việc chưa xong (`stage` khác `done`/`dropped`), bất kể được chọn hôm nào.

### Nhóm trạng thái lượt chạy (Office hiển thị; Hermes vẫn giữ trạng thái gốc)
| Nhóm | Trạng thái gốc |
|---|---|
| `queued` Hàng chờ | `queued` |
| `sending` Đang gửi | `preflight`, `preparing`, `prepared`, `submitting` |
| `generating` Đang tạo | `submitted`, `waiting`, `running` |
| `checking` Kiểm / nhập | `downloading`, `validating`, `ready` khi chưa có `assetId` |
| `library` Đã vào Thư viện | `ready` khi đã có `assetId` (biên nhận tay: `received`) |
| `manual` Chờ file tay | gói prompt đã xuất, chưa có biên nhận `received` |
| `attention` Cần đối soát | `needs_attention`, `unknown`, `importError`, biên nhận `unmatched` |
| `failed` Lỗi | `failed` |
| `stopped` Đã dừng | `cancelled` |
| `unmapped` Chưa phân loại | mọi giá trị khác: hiện ra, không ẩn đi |

### Đơn vị đếm
Lượt media, bản xuất, bài đăng và lần đo là **bốn đơn vị khác nhau**. Không cộng chúng thành một con số chung "video". Mỗi con số trên UI ghi rõ đơn vị của nó.

### Mốc nghiệm thu đầu tiên (chung cho hai repo)
1. **Một lượt thật đổi trạng thái** trong Hermes, ví dụ thả một MP4 vào Hộp nhận media hoặc một job đi từ `validating` sang `ready`. Trong vòng 1 phút, snapshot mới có lượt đó với `group` mới, và Office hiện đúng lượt đó ở đúng nhóm, kèm sự kiện cuối và giờ cập nhật.
2. **Fixture:** hôm nay chọn 3 sản phẩm, hôm qua có 1 sản phẩm khác vẫn còn việc. Office hiện **Hôm nay 3/3** và **Đang triển khai 4**. Hermes xuất đúng `selection.days`, `products[].active` và `totals` cho fixture này.
Chỉ khi cả hai mục đạt mới mở rộng đồng bộ và giao diện.

## 9. Bằng chứng nghiệm thu (đợt đầu)
- [ ] Log 5 lệnh ở mục 7, kèm số test đạt / bỏ qua / lỗi.
- [ ] Test `buildOfficeView`: fixture "hôm nay 3, hôm qua 1 khác còn việc" ra `selection.days[today].productIds.length === 3`, có đúng 4 sản phẩm `active`, `totals.distinctProducts === 4`. Số chưa biết là `null`, không phải 0.
- [ ] Test chọn lại: cùng `productKey` ở hai ngày → một `productId`, `selectionCount === 2`.
- [ ] Test giao dịch chọn: lỗi/tranh chấp không để lại hồ sơ hoặc lượt chọn nửa chừng; màn đọc cùng dữ liệu đã lưu.
- [ ] **Chạy thật trên máy người dùng** (boss kiểm):
  - Thả 1 MP4 vào Hộp nhận media.
  - Trong ≤ 1 phút, view trong app có lượt `manual:<sha256>` chuyển nhóm.
  - Ghi bằng chứng view trước/sau và ảnh màn Tín hiệu trong app.
- [ ] Một MP4 xuất ra:
  - ffprobe ra 720×1280, thời lượng khớp `renderPlan`, có `sha256`.
  - Mở được bằng trình phát mặc định của Windows.
  - Ba biến thể hook có cùng đoạn thân (so `sha256` từng đoạn hoặc so danh sách `segments`).
- [ ] Ảnh chụp 1366 px và 1920 px cho các màn có sửa giao diện: chọn đoạn, xuất MP4, bộ đếm đợt chọn.
- [ ] Báo cáo tách **đã kiểm / chưa kiểm**. Ghi riêng những gì mới chỉ chạy bằng fixture.
