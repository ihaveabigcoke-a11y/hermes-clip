# T11 — kiểm nguồn và tín hiệu Agent Reach sau research

**Cập nhật 12/11 — T14:** ghi chú dưới đây giữ nguyên bằng chứng lịch sử T11. Trạng thái thiếu công cụ/lệnh đọc, showroom, khoảng giá/tiền tệ, polling và giới hạn stdout đã được sửa theo [checkpoint T14](T14-SOURCE-STATUS-HEURISTICS.md). Thiếu CLI hiện là `unavailable`, không còn `blocked`; receipt cũ chỉ được thay bằng lần kiểm mới, không sửa dữ liệu thật trong clone đêm.

Checkpoint source trên `C:/HermesNight/hermes-clip`, nhánh `night-20261111`. Chưa triển khai vào bản cài Windows. Bản cài thật chỉ được xác định theo context hiện hành; không mở bản cài, AppData, profile, DB thật hoặc cấu hình tài khoản trong lượt đêm.

## Thay đổi

- `ResearchRunner.apply()` xếp tác vụ sau khi lưu merge thành công. Luồng áp dụng hội thoại Muse trong UI cũng gọi IPC bằng ID đợt đã lưu; worker đọc lại bản ghi, không nhận argv/candidate tùy ý từ renderer. Lỗi xếp tác vụ không đổi kết quả Muse thành thất bại.
- `ResearchSources` dùng hàng đợi trong `Integrations`, chung khóa `busy` với research/tham chiếu/montage/doctor. Tối đa 10 ID ứng viên cho một lần kiểm tự động của đợt, tối đa ba lệnh/ứng viên; các receipt tiếp theo chỉ thêm ứng viên chưa từng xếp. Không reset bộ đếm khi thay ID, resume hoặc restart. Nút kiểm lại là một lần chạy tay mới, tối đa 10×3, không gọi Muse.
- Lưu ý định trước khi gọi provider. Restart đổi cả `queued` và `running` thành `interrupted`; giữ receipt/file đã có, không nạp lại callback và không tự replay. Đóng app ngừng nhận việc và ngừng các lệnh kế tiếp. Tác vụ tích hợp vẫn giữ giới hạn lịch sử 100 như trước.
- Mỗi nguồn lỗi mạng/JSON → `failed`; CAPTCHA/HTTP 403/429 hoặc thiếu lệnh đọc đã xác nhận → `blocked`. Các nguồn và ứng viên khác tiếp tục. Trạng thái `done` của tác vụ nghĩa là đã kết thúc xử lý; `result.candidates[].status` phân biệt `ok`, `partial`, `blocked`, `failed`. Lỗi lưu record được giữ trong receipt, không báo candidate đã được cập nhật.
- Candidate thêm `listingCheck` optional/null: trạng thái, thời điểm, URL đã đọc, tiêu đề, chuỗi giá/ký hiệu tiền, MOQ, dòng ship, số thẻ/link sản phẩm tìm thấy, đường dẫn file, cờ so sánh và lỗi. Không thay `cost`, `minimumOrder`, `shipping`, tiền tệ hay `matchType` của Muse. Giá khác/giá theo khoảng/tiền tệ khác chỉ cảnh báo cần đối chiếu, không quy đổi. Từ sáu thẻ/link trở lên cảnh báo **có thể** là showroom hoặc danh sách gợi ý.
- `competition.youtubeShorts` và `competition.webReferences` optional/null, có nguồn/thời điểm/file riêng. Giữ nguyên số ads/Reels, nguồn và kỳ đo của Muse. YouTube chỉ đếm video URL nhận diện được, bỏ trùng ID; số kết quả rỗng, views/ngày không được trả về vẫn null. Views 0 được provider trả rõ vẫn giữ 0. Không suy chuỗi “1.2M” hoặc ngày tương đối thành số/ngày chính xác. Truy vấn “shorts” chưa chứng minh video là Shorts hay đúng SKU; nhãn rõ **YouTube Shorts, không phải Instagram**, không gán vào `similarReels30d`.
- Parser thuần, không LLM, không chạy HTML. Đọc tối đa 200 KiB UTF-8/file; stdout subprocess giữ trần 4 MiB, timeout mỗi lệnh dữ liệu 45 giây, shell tắt và kill cây tiến trình như hợp đồng cũ. Raw lưu tại `worker/integrations/<job-id>/<index>-{listing,youtube,web}.txt`, file tìm kiếm là JSON text có thể bị cắt ở giới hạn. Receipt cũ và file lần kiểm trước không bị xóa.
- Lưu candidate bằng CAS: đọc record mới, chỉ ghép khối nguồn; retry tối đa bốn lần khi HTTP 409. Nếu tên/URL nguồn đã đổi thì giữ receipt và báo lỗi, không gắn kết quả vào sản phẩm khác. Muse không được tự tạo receipt local qua nội dung JSON.
- UI giữ bảng/theme/font: thêm chip nguồn, số kết quả Shorts, chi tiết nguồn/cờ/giá/ship/MOQ và link tham khảo; nút **Kiểm lại nguồn**, checkbox **Tự kiểm nguồn bằng Agent Reach sau research**. Mặc định lấy `doctor().reach.ready`; lựa chọn bật/tắt rõ của người dùng được giữ qua lần doctor tiếp theo. URL đã sửa sau khi kiểm có nhãn cần kiểm lại.

## Hợp đồng CLI và blocker

Lock giữ nguyên Agent Reach `422478ae0264d2236bf7ebd1c3b11a69aaafa4a3`. Clone đêm **không có** `desktop/.integrations/Agent-Reach`, venv hoặc bản sao CLI trong `ops/night/input/` (input chỉ có `formula-seed.json`). Không tải source, cài dependency hay đọc cấu hình bản cài để bù thiếu. Do đó **chưa xác minh được lệnh đọc và envelope thật của revision này**; không kết luận bản ghim có hay không có lệnh đọc.

`doctor()` được bổ sung đọc trợ giúp local, tối đa 64 KiB/lượt và 15 giây/lượt. Chỉ nhận hai dạng cố định `read URL` hoặc `web read URL` nếu trợ giúp liệt kê `read` và trợ giúp lệnh xác nhận đối số URL; chỉ thêm `--timeout 45` nếu help có tùy chọn này. Thiếu/không hiểu help → không gửi lệnh đọc URL, lưu blocker từng ứng viên; phần search độc lập vẫn dùng hợp đồng đã có trong source:

```text
youtube search "<product name> shorts" --limit 10 --timeout 45 --backend public-web
web search "<product name> tiktok OR reels" --limit 5 --timeout 45
```

Không thêm kênh đăng nhập, info/subtitles/transcription, cookie import, trình duyệt hoặc key/API trả phí. Lệnh search kế thừa backend public-web/web của tích hợp hiện có; cần đối chiếu backend miễn phí thực tế và dạng metadata khi thử bản ghim sáng mai. Không dùng fixture làm bằng chứng về khả năng đọc 1688/AliExpress hay kết quả tìm kiếm thật.

## Kiểm tra offline

Baseline: `npm test` 89/89, `npm run typecheck` đạt, `npm run test:desktop` 153 đạt/1 skip/0 fail.

Sau sửa:

- `npm test`: **91/91**, gồm tương thích bản ghi cũ, null/0, nguồn riêng và chống Muse giả receipt local.
- `npm run typecheck`: đạt.
- `npm run test:api`: **10/10**.
- `npm run test:desktop`: **175 đạt, 1 skip, 0 fail** trước khi bổ sung ca luồng áp dụng Muse thủ công; lần cuối với API build riêng: **176 đạt, 1 skip, 0 fail**. Skip OpenMontage live do thiếu biến cấu hình, giống baseline.
- 23 ca desktop mới: parser giá ¥/MOQ/CN¥/US$/$/₫/€, 12 thẻ sản phẩm, lệch giá/MOQ, byte cap, metadata thiếu/0, help web/root read, argv Windows `python -m agent_reach.cli`, đúng ba lệnh dữ liệu, giới hạn 30, mạng lỗi/blocked/JSON sai, busy/chống trùng, CAS, đổi nguồn, restart, opt-out, shutdown và hai luồng lưu Muse. Ba ca UI trong số này render React thật bằng SSR, kiểm chip/scope/null/cờ và escape HTML; không mở browser/tải ảnh.
- `node outputs/night-t11/build-check.mjs`: đạt, UI + 18 module API/domain. Script dùng nguyên build hiện hành, chỉ đổi root/output đã kiểm sang `outputs/night-t11/build`. Không chạy nguyên `npm run local:build` vì script đó xóa/ghi `desktop/local-dist`, bị quy tắc đêm cấm. Vite còn cảnh báo font URL/chunk lớn như baseline.
- Desktop kiểm thêm module API vừa biên dịch bằng `NODE_OPTIONS=--import file:///C:/HermesNight/hermes-clip/outputs/night-t11/test-build-register.mjs`. Test research vẫn kiểm source schema như T02.
- `git diff --check`: đạt. Log/build tạm ở `outputs/night-t11/`, bị Git ignore. TEMP/TMP/npm cache nằm trong thư mục task này; npm offline, update notifier tắt. SQLite test là fixture mới, không phải DB người dùng.

## Tiếp tục sáng mai

Sau khi review và build source vào bản được phép triển khai, kiểm checkout/CLI tại root bản đó trong PowerShell (không chạy trong lượt đêm):

```powershell
git -C desktop/.integrations/Agent-Reach rev-parse HEAD
$reachPython = (Resolve-Path desktop/.integrations/.venv/Scripts/python.exe).Path
& $reachPython -m agent_reach.cli --help
& $reachPython -m agent_reach.cli web --help
```

Hash phải khớp lock. Nếu CLI không có lệnh đọc tương ứng hoặc envelope khác, giữ `blocked`/`failed`, đối chiếu source ghim trước khi sửa adapter; không cài backend/key hoặc dùng phiên đăng nhập để vượt chặn.

Trong app: **Nghiên cứu và dựng video → Kiểm tra công cụ**, rồi mở đợt cần kiểm → **Kiểm lại nguồn**. Có thể chạy lệnh sau trong console renderer của chính bản desktop đã cập nhật để chọn duy nhất đợt `research_51dba84b…` bằng prefix, không gửi Muse:

```javascript
const api = window.productLabDesktop;
const {records} = await (await fetch('/api/lab', {credentials:'same-origin'})).json();
const matches = records.filter(r => r.kind === 'research_batch' && r.id.startsWith('research_51dba84b'));
if (matches.length !== 1) throw Error('Chọn lại ID đợt chính xác trong Nghiên cứu.');
await api.checkIntegrations();
const job = await api.researchCheckSources({batchId: matches[0].id});
console.log(job?.id); // Xem tiến độ và lỗi từng ứng viên trong app.
```

Nghiệm thu thật còn thiếu: help/envelope pinned CLI, backend miễn phí, network/anti-bot của listing, Shorts/web thật, tương tác modal/nút và cửa sổ Windows. Không cần gửi thêm Muse chỉ để kiểm nguồn của một đợt có sẵn; không có quyền đăng Instagram hoặc reset quota từ task này.
