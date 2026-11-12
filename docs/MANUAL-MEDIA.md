# Media thủ công và công tắc Muse — T-002 / T-002b

## T-006 — file mới được nén (12/11/2026)

Source T-006 thay quy tắc giữ gốc Hộp nhận bên dưới: file mới được nén và giải mã kiểm tra trước khi nhập. Receipt giữ `sourceSha256` của gốc và `sha256` của bản lưu, kích thước trước/sau. Chống nhập lại theo checksum gốc. Sau khi nhập **và gắn take thành công**, Electron gọi `shell.trashItem` đưa gốc vào Thùng rác Windows; file chưa gắn cảnh, nén lỗi hoặc nguồn đã thay đổi thì giữ lại. Receipt cũ không bị áp quy tắc này. Thùng rác vẫn khôi phục được; số tiết kiệm trên app không có nghĩa Windows đã thu hồi dung lượng Thùng rác.

MP4/WebM/MOV mới → H.264/AAC/faststart, cạnh dài tối đa 1280; giữ nguồn nhỏ hơn, không hạ nguồn 9:16 đạt 720×1280 xuống dưới mức này. Clip ≤15 giây phải dưới 6×1024×1024 byte, nếu không thì từ chối nhập. Video dài giữ bitrate khoảng 2 Mbps, có thể vượt 6 MB và có nhãn trên take. PNG/JPEG/WebP mới → WebP q82, cạnh dài tối đa 2048; giữ byte gốc nếu chuyển đổi không nhỏ hơn. Giới hạn đầu vào Hộp nhận/tải tay vẫn 25 MB video, 8 MB ảnh. Hosted không có FFmpeg giữ hành vi cũ.

Ảnh tham chiếu trong gói prompt mới dùng bản nén, không sửa asset tham chiếu. Render mới chỉ được dọn sau khi `media` đã khớp checksum; render cũ giữ nguyên. Muse vẫn mặc định tạm dừng; đường tải mới khi bật lại đã nối nén, nhưng chưa nghiệm thu dịch vụ thật. SQLite, profile, cấu hình, khóa và receipt không nén.

Kiểm và cách chạy tiếp: [báo cáo T-006](../ops/office/reports/T-006.md). Build kiểm ở `outputs/T-006-build`, chưa thay `desktop/local-dist`. Các đoạn T-002 bên dưới là lịch sử trước T-006.

Thay đổi source ngày 12/11/2026; chưa triển khai vào bản cài Windows.

## Cách dùng

1. Công tắc **Muse: Bật / Tạm dừng** ở đầu **Tài khoản Muse** và trong **Cài đặt → Nhà cung cấp media** luôn dùng cùng trạng thái desktop. Mặc định **Tạm dừng**, kể cả dữ liệu cũ thiếu giá trị; lưu qua lần khởi động lại. Bật phải xác nhận “Muse chạy bằng trình duyệt tự động; tài khoản có thể bị khoá. Bật?”. Chọn đường dẫn tuyệt đối cho **Hộp nhận media**, bấm **Lưu hộp nhận media**.
2. Trong **Tạo video**, mặc định **Tự động theo trạng thái Muse**: Muse Bật + luồng đã cấu hình + ít nhất một profile bật, health ready, signed_in, quota available, còn hạn mức và dưới 3 lượt/đợt → dùng Muse; còn lại → manual. Giá trị null không tự thành 0. Chọn riêng **manual** hoặc **muse** cho cảnh sẽ ưu tiên hơn lựa chọn dự án và trạng thái tự động. Đổi mặc định dự án giữ các lựa chọn riêng; chọn **Tự động** ở cảnh để bỏ override. Muse bị khóa khi tạm dừng; grok-cli/fal vẫn tắt. Nếu muốn tiếp tục nhận file thủ công sau khi bật Muse, chọn manual rõ ràng cho cảnh/dự án.
3. Lưu prompt tiếng Anh, ảnh tham chiếu và duyệt kịch bản. Với luồng manual mới, dùng video **9:16, 8 giây**. Cảnh cũ giữ nguyên thông số; kiểm/sửa và duyệt lại trước khi xuất nếu cần. Gói giữ nguyên nội dung đã duyệt, không tự dịch hoặc gọi AI.
4. Bấm **Xuất gói prompt**. App xuất tất cả cảnh manual đã duyệt của dự án vào `workspace/exports/prompt-packs/P<n>-yyyyMMdd-HHmm/`. Đường dẫn đầy đủ hiện trên màn hình. Thư mục gồm `README-VI.txt`, `<MÃ-CẢNH>.txt` và ảnh `<MÃ-CẢNH>-ref-<n>.<ext>` đã kiểm checksum. Gói đã có trong cùng phút được giữ nguyên; xuất lại vào phút tiếp theo.
5. Tự mở Flow/Gemini hoặc Grok, đọc README, thêm ảnh và dán prompt. Tải file hoàn tất rồi bấm **Mở hộp nhận media**, chép file vào thư mục đó. Ví dụ `P12-S03-take2.mp4`; lấy mã thật từ danh sách cảnh hoặc tên file prompt.
6. Khi app đang mở, bộ theo dõi quét mỗi 2 giây, chờ hai lần quan sát có cùng kích thước/ngày sửa. File khớp đúng một mã cảnh manual được nhập thành phiên bản **chờ duyệt**. File không khớp, khớp nhiều cảnh hoặc cảnh đang dùng nhà cung cấp khác vào **Chưa gắn cảnh**; chọn cảnh rồi bấm **Gắn vào cảnh**.
7. Xem lại và duyệt phiên bản bằng luồng hiện có trước khi ghép/xuất. Không tự đăng hoặc nhận tiền.

Mã `P<n>-S<nn>` do desktop lưu bền theo sản phẩm/cảnh, không thay khi sửa tên. Đây là mã định tuyến file trong app, không phải SKU supplier. Các cảnh ở dự án khác của cùng sản phẩm có mã khác nhau.

## Trạng thái và bảo toàn dữ liệu

- **Chờ xuất prompt**: chưa xuất phiên bản cảnh hiện tại.
- **Đã xuất**: gói của phiên bản hiện tại đã được ghi hoàn chỉnh.
- **Chờ file**: đã xuất gói và bấm mở hộp nhận.
- **Đã nhận**: đã gắn file vào phiên bản cảnh hiện tại.

File gốc không bị di chuyển hoặc xóa. Bản chép tạm được kiểm bằng ffprobe rồi nhập Thư viện. Receipt lưu SHA-256, đường dẫn nguồn, metadata và ý định gắn cảnh trước khi ghi take. Nhập lại cùng checksum không tạo take mới, kể cả đổi tên hoặc khởi động lại. Sau mất phản hồi, app đối soát take/receipt trước khi ghi tiếp. Dữ liệu Muse cũ, quota, profile và phiên đăng nhập được giữ.

Sai 9:16 chỉ cảnh báo ở bước nhập. Quy tắc duyệt/ghép hiện có vẫn kiểm thông số cảnh; cần xử lý file không khớp trước khi xuất video cuối. Loại file được hỗ trợ theo Thư viện hiện có: MP4, WebM, PNG, JPG/JPEG, WebP; video tối đa 25 MB, ảnh tối đa 8 MB. Không tự nén file quá giới hạn. Không quét thư mục con. Thư mục rỗng mặc định được tạo trong workspace; chỉ giám sát khi app đang chạy.

Tạm dừng chặn nhận/gửi tác vụ mới: mở profile mới, enqueue/start, chat/research mới. **Không đóng context, hủy request hay hủy job đang chạy.** Tác vụ đã nhận trước pause được hoàn tất gửi/lấy/kiểm/nhập kết quả theo luồng cũ; research lưu lượt đang chạy rồi dừng trước lượt kế tiếp. Vì vậy có thể còn request của tác vụ đang chạy sau pause. Trạng thái tạm dừng khi không có tác vụ đang chạy được kiểm bằng fixture với 0 lời gọi Muse. Không còn route chặn request hoặc serviceWorkers:block trong Worker. **Tạm dừng xóa quyền duyệt hàng chờ; bật lại không tự gửi. Người dùng phải bấm Chạy/start để giao tiếp.** Quyền tiếp tục chỉ áp dụng đúng job/profile đã nhận và hết hiệu lực khi job kết thúc. Không reset hạn mức.

Job Muse unknown/needs_attention hiện **Cần đối soát** và không chuyển sang manual/Codex/JSON, kể cả người dùng đổi lựa chọn provider. Job đang chạy cũng giữ quyền xử lý, không đồng thời xuất prompt hoặc gắn take thay thế. Đối soát bằng các màn Muse cũ trước khi giao việc khác. Mỗi job/receipt/take mới lưu provider thực thi (`muse`, `manual`, `codex`, `import:<tên>` theo loại tác vụ); UI hiển thị nguồn. Bản ghi lịch sử thiếu nguồn không được tự viết lại.

Chặn media chỉ áp dụng đúng dự án/cảnh của job, không chặn cảnh khác. Với research/chat, chặn đúng scope đang nhập. Màn Nghiên cứu có **Bỏ qua, không đối soát** cho kết quả Muse chưa rõ, dùng được khi Muse tạm dừng: giữ receipt và kết quả cũ, lưu quyết định bỏ qua, không gửi lại run/chat cũ. Xem [nhập research](RESEARCH-WITHOUT-MUSE.md).

T-002c: màn **Tạo video** cũng có **Bỏ qua, không đối soát** cho cảnh Cần đối soát (commit `ab94531`). Quyết định lưu `scene.museReconciledAt`, không sửa job, receipt, attempt hoặc take. Worker đọc record production qua HTTP local trước `resume`, `recheckResult`, `run` và `retry` của job Muse chưa rõ. Job tạo tại/trước mốc bị từ chối với **Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.**, kể cả có `providerId` hoặc Muse đang bật. Job sau mốc và cảnh/dự án khác không bị mốc này chặn; các kiểm tra phiên/quota/tạm dừng vẫn giữ nguyên. Không đọc được cảnh thì dừng thao tác. Thao tác đã nhận trước pause vẫn được hoàn tất.

Khối nhập kết quả hiển thị nhãn Muse / Codex CLI / Nhập JSON / Manual. Receipt đọc khi mount/đổi scope, khi có `product-lab:workspace-changed`, và ngay trước chạy/nhập; không polling 1,5 giây trong TextExchange. Chi tiết kiểm và script ảnh fixture T-002c: [checkpoint](../ops/office/reports/T-002c.md).

## Kiểm thử an toàn trong checkout

Không mở bản cài hoặc dùng AppData thật. Tất cả test manual dùng thư mục tạm, SQLite fixture và MP4/PNG tổng hợp bằng FFmpeg.

```powershell
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:desktop
$env:HERMES_LOCAL_BUILD_DIR = "$PWD/outputs/T-002b-build"
pnpm local:build
```

Repo thiếu `scripts/run-framework.mjs`, nên không dùng `pnpm build` và không tạo file đó. Build kiểm thử ở `outputs/`, không ghi `desktop/local-dist`.

Chạy riêng test tính năng khi môi trường không cho Node tạo tiến trình test con:

```powershell
node --test --test-isolation=none desktop/test/manual-media.test.mjs desktop/test/manual-media-ui.test.mjs desktop/test/muse-pause.test.mjs desktop/test/provider-routing.test.mjs
```

Script chụp UI fixture đã chuẩn bị, dùng source build phía trên và chặn các request ra ngoài:

```powershell
$env:HERMES_ARTIFACTS = 'D:/hermes-wt/artifacts/T-002b'
node scripts/check-muse-routing-ui.mjs
```

Khi chạy được, script ghi 12 PNG `T-002b-<tao-video|tai-khoan-muse|cai-dat>-<1366|1920>-<tam-dung|bat>.png` và `T-002b-ui.json`. Script kiểm hộp xác nhận, hủy bật, đồng bộ công tắc qua điều hướng/reload, mặc định provider và chặn request ngoài. Sandbox hiện chặn Chrome IPC `Access is denied`; chưa có PNG/bằng chứng bố cục. Xem báo cáo `ops/office/reports/T-002b.md` trước nghiệm thu.
