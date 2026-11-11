# Nhãn AI khi đăng Instagram — T09

Checkpoint source ngày 12/11/2026, clone `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. **CHƯA kiểm trên Instagram thật.** Chưa triển khai vào bản cài Windows; không mở Electron/Muse/Instagram, không truy cập AppData, profile, phiên hay SQLite của người dùng trong task này. Không thay đổi dependency, `data/`, `evidence/`, input đêm hoặc `desktop/local-dist/`.

## Vị trí trong luồng đăng

1. `InstagramPublisher.enqueue` trong `desktop/src/instagram.mjs` lấy snapshot qua `InstagramWorkspace.snapshot`: tài khoản, revision, video/checksum, caption và cấu hình nhãn.
2. `InstagramBrowsers` trong `desktop/src/instagram-browser.mjs` quản lý cửa sổ/profile; không phải nơi điền nội dung hay bấm nhãn. T09 không sửa file này.
3. `InstagramAdapter.prepare` trong `desktop/src/instagram-adapter.mjs` đọc danh sách bài trước lượt đăng → Create/Post → chọn video qua input trong dialog → xử lý thông báo Reel/crop → Next đến màn caption → điền và so khớp caption.
4. **Ngay tại màn caption có nút Share, sau chọn video và trước Share:** gọi `ensureInstagramAiLabel` để tìm, bật và đọc lại trạng thái công tắc. Có thể mở Advanced settings trong cùng dialog. Chỉ trả kết quả chuẩn bị khi xác nhận được nhãn hoặc cấu hình là `off`.
5. `InstagramAdapter.publish` kiểm lại nhãn ở chế độ chỉ đọc trước callback `beforeShare`, rồi kiểm lại sau callback kiểm tra snapshot/tài khoản và ghi checkpoint `submitting`, ngay trước **một** lệnh `.click()` Share hiện có. Nếu trạng thái bị đổi lúc chờ callback, dừng, không bật lại rồi tự thử Share.
6. Receipt, permalink, chống trùng fingerprint, snapshot tài khoản/video/caption và đối soát kết quả sau Share giữ cơ chế cũ. Kiểm nhãn không phải bằng chứng bài đã đăng hoặc bằng chứng Meta lưu nhãn phía server.

## Cấu hình và dữ liệu cũ

`content_plan.data.aiLabel` nhận `required | off | null`, optional trong schema. Bản ghi cũ thiếu trường vẫn parse được; không ghi lại hàng loạt. Khi tạo snapshot cho lượt đăng, thiếu/null được giải quyết thành `required`. Mặc định này áp dụng cho luồng Muse và cả video cũ chưa rõ nguồn; không suy đoán nguồn từ caption hoặc tên file. Form Sửa kế hoạch nội dung có lựa chọn **Nhãn AI khi đăng**, mặc định **Bắt buộc bật nhãn AI**.

`snapshot.aiLabel` cố định cấu hình của lượt đăng. Trước upload và trước Share, revalidation so cả revision, tài khoản, checksum, caption và cấu hình nhãn; sửa plan không thay cấu hình âm thầm cho lượt đang chờ. Snapshot job cũ thiếu/null vẫn yêu cầu nhãn khi chuẩn bị/đăng. Job đã published không được gán ngược bằng chứng đã bật nhãn.

`off` phải được chọn tường minh. Chế độ này không tìm công tắc, không mở Advanced settings, không bật/tắt nhãn và không chặn Share do nhãn; các gate cũ vẫn chạy. Không dùng `off` để vượt qua lỗi selector cho video Muse cần nhãn. Câu caption “AI-generated concept” không thay thế nhãn Instagram.

## Selector và chiến lược fail closed

Mã nằm trong `desktop/src/instagram-ai-label.mjs`:

- Giới hạn trong đúng **một dialog đang hiển thị** (`getByRole('dialog').filter({visible: true})`) có đúng một button tên `Share` hoặc `Chia sẻ`.
- Tìm `getByRole('switch', {name})` hoặc `getByRole('checkbox', {name})`; tên đầy đủ khớp, không phân biệt hoa/thường: `Label as made with AI`, `Made with AI`, `Label as AI-generated`, `Gắn nhãn là được tạo bằng AI`, `Gắn nhãn là do AI tạo`, `Được tạo bằng AI`.
- Chỉ khi chuẩn bị và chưa có công tắc: tìm đúng một button `Advanced settings` hoặc `Cài đặt nâng cao`; mở nếu chưa có `aria-expanded="true"`, chờ tối đa 3 giây để công tắc xuất hiện. Không dò các nút khác hay bấm bằng tọa độ.
- Native `input[type=checkbox]`: đọc thuộc tính DOM `checked`, không nhận `indeterminate`. Custom switch/checkbox: chỉ nhận `aria-checked="true"` hoặc `"false"`; thiếu/mixed là chưa rõ. Không suy từ màu sắc, icon, caption, URL, cookie hay sự tồn tại của chữ AI.
- Công tắc đã bật thì không click. Công tắc tắt thì chỉ click một lần trong prepare; đọc lại có giới hạn thời gian, không click lần hai nếu chưa xác nhận. Trước Share chỉ đọc, không tự sửa.
- Không thấy, nhiều kết quả, công tắc ẩn/disabled, trạng thái chưa rõ, click không đổi trạng thái, bị tháo khỏi DOM, lỗi locator hoặc thay đổi trước Share đều chặn. Chữ AI nằm cạnh một switch không có accessible name liên kết cũng chặn, không đoán bằng ancestor chung.

Các tên/role này là giả thuyết adapter có kiểm bằng fixture, **không phải DOM trích từ Instagram thật**. Instagram có thể đổi tên, ngôn ngữ, layout hoặc chỉ hỗ trợ nhãn ở một số giao diện/tài khoản. Khi không khớp, phải dừng để kiểm thủ công; không thêm fallback “cứ đăng”.

## Trạng thái bị chặn và giới hạn phục hồi

Lỗi nhãn có mã `INSTAGRAM_AI_LABEL_REQUIRED`. Publisher lưu `state=needs_attention`, `attentionReason=ai_label`, `aiLabelCheck={mode,status:'blocked',reason,checkedAt}`, thông báo **“Cần đối soát/thao tác tay”** và history. `submittingAt=null` cho biết gate này dừng trước lệnh Share, kể cả khi callback vừa ghi checkpoint submitting. Trường hợp thật sự đã bấm Share mà kết quả không rõ vẫn giữ timestamp và đối soát như trước.

Thành công chuẩn bị lưu `aiLabelCheck.status=confirmed` và nguồn `composer_toggle`; `off` lưu `skipped`. Đây chỉ là quan sát UI tại thời điểm kiểm. Job chặn giữ snapshot và chống trùng, không tự retry khi poll/restart, không cho nút Thử lại, và không chạy bộ tìm bài đăng với mốc thời gian giả. UI cho mở trình duyệt để kiểm. Bản nháp chỉ còn nếu Instagram/browser vẫn giữ nó; không hứa phục hồi draft sau restart.

T09 chưa thêm luồng giải phóng job chặn/tiếp tục một draft thủ công. Nếu gặp gate này khi vận hành sau này, giữ job/receipt/snapshot, kiểm draft và cập nhật selector hoặc lập bước xử lý riêng; không sửa SQLite, đổi trạng thái bằng tay hay đổi `required` sang `off` để gửi lại. Việc đăng thủ công thực sự cần quyền theo tài khoản/nội dung của người dùng; không thuộc lượt kiểm sáng mai bên dưới.

## Bằng chứng và lệnh kiểm offline

`desktop/test/instagram-ai-label.test.mjs` dùng HTML tĩnh `page.setContent`, Chrome headless mới với thư mục tạm trong `outputs/`, không persistent profile; chuyển TEMP/TMP/APPDATA/LOCALAPPDATA của tiến trình kiểm vào thư mục riêng, chặn mọi request và chặn DNS. File upload là byte giả để kiểm DOM, không phải video hợp lệ hay kết quả Muse. Receipt/permalink là fixture; không fetch URL đó.

Test gọi thật `InstagramAdapter.prepare`/`publish` và `InstagramPublisher` với session/workspace/media validation giả, Store trong bộ nhớ. Có kiểm switch, checkbox, tiếng Việt, Advanced settings, delay, không có/ẩn/trùng/disabled/unknown/mixed, click không hiệu lực, DOM biến mất, trạng thái đổi ngay trước Share, lưu chặn qua restart, chống gửi lại, null/legacy và off. Test workspace/schema/API kiểm round-trip cấu hình, revision và snapshot. Test UI render offline kiểm nhãn tiếng Việt theo cấu hình và không khẳng định nhãn cho bài lịch sử.

Chạy từ root clone, dependency sẵn có; không cài thêm:

```powershell
New-Item -ItemType Directory -Force outputs/night-t09/tmp | Out-Null
$env:TEMP = (Resolve-Path outputs/night-t09/tmp).Path
$env:TMP = $env:TEMP
# Mặc định fixture dùng C:/Program Files/Google/Chrome/Application/chrome.exe.
# Có thể đặt HERMES_TEST_CHROME thành executable Chrome đã cài ở vị trí khác.
node --test desktop/test/instagram-ai-label.test.mjs desktop/test/instagram-workspace.test.mjs desktop/test/instagram.test.mjs
npm test
npm run typecheck
npm run test:api
npm run test:desktop
$env:HERMES_LOCAL_BUILD_DIR = Join-Path (Get-Location) 'outputs/night-t09/build'
npm run local:build
```

Log mới ở `ops/night/out/T09-*.log`; kết quả cuối được ghi trong checkpoint context. `local:build` phải có override như trên để không ghi `desktop/local-dist`. Desktop baseline trước T09: 218 đạt, 1 skip OpenMontage vì thiếu môi trường tích hợp.

## Người dùng kiểm sáng mai — chỉ draft, không Share

1. Tự mở đúng tài khoản Instagram đã duyệt, kiểm username. Không bấm **Đăng video/Đăng sau khi đăng nhập** trong Hermes để kiểm nháp: luồng đó có thể đi tiếp đến Share khi đủ gate, không có chế độ dry-run mới trong T09.
2. Trong Instagram, tự tạo Reel nháp với một video đã duyệt, qua crop/edit đến màn nhập caption. Không bấm Share ở bất kỳ bước nào. Nếu nền tảng tự lưu draft, giữ lại draft theo lựa chọn của người dùng.
3. Tìm **Label as made with AI** (hoặc tên tương ứng), kể cả trong Advanced settings. Bật công tắc; xác nhận trạng thái On. Nếu không thấy, dừng tại đây, ghi “giao diện chưa có công tắc” và không đăng.
4. Đọc accessible name, role và `aria-checked` hoặc native `checked` của **riêng công tắc** bằng DevTools/Accessibility. Ghi lại tên giao diện, ngôn ngữ, vị trí trước Share và trạng thái trước/sau. Có thể cung cấp đoạn HTML tối thiểu đã bỏ tên tài khoản/dữ liệu cá nhân; không xuất cookie, network headers, profile, proxy hoặc toàn trang chứa dữ liệu mới.
5. Dừng trước Share; đóng/lưu draft theo UI. So selector với tài liệu và bổ sung fixture nếu DOM thật khác. Lượt thao tác nháp này chỉ xác minh vị trí/toggle, chưa chứng minh automation end-to-end hoặc nhãn trên bài đã đăng. Mọi lượt đăng thử sau đó là phạm vi riêng cần người dùng duyệt.

Blocker nghiệm thu dịch vụ: cấm truy cập mạng/tài khoản thật trong đêm; chưa có DOM thật của nhãn để xác nhận selector. Phần source và fixture offline vẫn có thể hoàn thành độc lập.
