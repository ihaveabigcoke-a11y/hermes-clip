# Research và nội dung không cần Muse — T-003

Source ngày 12/11/2026, cập nhật T-002b. Muse mặc định Tạm dừng; chưa triển khai build vào `desktop/local-dist`, chưa chạy Codex CLI thật.

Nút **Bắt đầu bằng…** tự dùng Muse khi Muse sẵn sàng theo cùng hàm với thẻ kết nối; khi không sẵn sàng dùng Codex nếu đã bật trong Cài đặt, nếu không mở nhập JSON. Đây là lựa chọn mặc định lúc người dùng bấm, không tự chạy công cụ khi đổi công tắc. Các nút nhập JSON/CLI riêng vẫn giữ để người dùng chọn. Khi còn tác vụ Muse đang chạy hoặc chưa rõ kết quả, khóa chuyển provider, hiện **Cần đối soát** nếu kết quả chưa rõ; không tự gửi lại. Media dùng manual khi Muse không sẵn sàng; xem [hướng dẫn media](MANUAL-MEDIA.md).

Kết quả mới lưu `provider` thực thi: `muse`, `codex`, `import:<tên>`; trường `source: import:<tên>` cũ vẫn giữ để tương thích. CLI ghi receipt local trạng thái chạy/xong/lỗi, không lưu credentials. Nội dung/landing lưu nguồn cùng bản nháp. Khi sửa hoặc thay JSON do CLI trả về, bản nhập được ghi nguồn import thay cho receipt CLI nguyên gốc.

T-002b vòng 2: receipt research chỉ chặn đúng đợt đang nhập (`taskScope`/`batchId`); đợt khác không chặn Codex/JSON. Trong **Nghiên cứu → Kết quả Muse cần đối soát**, có thể chọn **Bỏ qua, không đối soát** cho run hoặc chat chưa rõ. Cảnh báo: **Kết quả Muse cũ chưa rõ; app sẽ không gửi lại**. Quyết định lưu bền (`reconciled: true`, `reconciliation: skipped`), không xóa nội dung/receipt hay reset quota, dùng được khi Muse tạm dừng. Bỏ qua run cũng bỏ qua các chat chưa rõ thuộc chính run đó; tác vụ đang chạy không được bỏ qua. App không tự chạy provider thay thế; người dùng chủ động nhập/chạy mới sau đó.

## Nhập JSON và copy prompt

1. **Nghiên cứu**: nhập tiêu chí/ngách/trần vốn + ship, bấm **Copy prompt research**. Prompt dùng lại `museTaskPrompt`, theo số chỗ còn lại trong đợt. Dán vào công cụ đang dùng (Codex, Claude, Gemini Deep Research hoặc ChatGPT); không cần khóa API trong Hermes.
2. Bấm **Nhập kết quả research**, ghi tên công cụ, dán JSON hoặc chọn file `.json` tối đa **384.000 byte**. Nhập đối tượng JSON, bỏ phần tóm tắt bên ngoài; chấp nhận JSON trong một khối Markdown. Lỗi nêu đường dẫn, ví dụ `candidates.0.shipping`.
3. **Kiểm tra và nhập JSON** lưu vào đợt đang chọn, hoặc tạo đợt mới nếu chưa có đợt. Tối đa 10 ứng viên; không cắt danh sách để tự chọn. Nhập lại cùng tên sản phẩm + URL không thêm bản trùng; trường hợp cập nhật một ứng viên cũ, dùng **Sửa ứng viên**. Không tự chọn ba sản phẩm hoặc tạo hồ sơ từ import.
   Kết quả nhập hiển thị số mới và số trùng, ví dụ **0 ứng viên mới, bỏ 9 trùng**; không ghi lại đợt nếu không có ứng viên mới.
4. Nhận cả `{summary,candidates:[...]}` theo `researchResponse` và JSON một sản phẩm của skill `hermes-product-check`. `source` được ghi `import:<tên công cụ>`. Giữ null và mã tiền tệ; số tiền đã biết cần mã tiền tệ nguồn. `listingStatus` khác `single` bắt buộc vốn và ship là null. `not_found` được để URL null/trống, không bịa URL thay thế.
5. JSON skill gốc được lưu trong `importMetadata.rawJson`, gồm cả `maxLandedForMarkup`, câu hỏi supplier hoặc trường mới chưa có trong app. Mở **Xem → JSON gốc từ công cụ nghiên cứu** để đọc. Cờ logistics có thể là object boolean/null hoặc danh sách tên cờ; cờ không nằm trong danh sách giữ chưa rõ. Giá bán lẻ nhận nguồn dạng object hoặc URL; nếu chỉ có URL, ngày/giá tại nguồn giữ null. Nhãn verdict/logistics hiển thị trên hàng ứng viên; listing nhập không được giả làm receipt kiểm nguồn tại máy.
6. **Instagram → chọn sản phẩm** có **Nhập kết quả nội dung / Copy prompt nội dung**. **Trang giới thiệu → chọn sản phẩm** có các nút tương ứng cho landing. JSON hợp lệ mở biểu mẫu nháp của đúng sản phẩm để duyệt và lưu. Có thể gắn dự án video trong biểu mẫu nội dung; không tự sửa cảnh đã duyệt, đăng bài, xuất bản landing hay thêm điều khoản thương mại.

## Codex CLI tùy chọn

Trong **Cài đặt → Research và nội dung bằng Codex CLI**, bật công tắc rồi lưu. Mặc định tắt, không cần nhập khóa API. Cài đặt không tự chạy CLI. Sau đó chủ động bấm **Chạy Codex CLI** ở research/nội dung/landing; kết quả hợp lệ đi vào hộp nhập JSON để xem và nhập như trên. Giữ màn hiện tại trong lúc chờ; nếu chuyển sản phẩm, kết quả của màn trước không được áp vào sản phẩm mới.

App tìm chương trình native trong PATH; trên Windows hỗ trợ `codex.exe` và các vị trí native của gói npm Codex. Có thể điền đường dẫn tuyệt đối tới `codex.exe`. Không chạy `.cmd`/`.ps1`, không dùng shell. Nếu chưa tìm thấy, app báo cách cài CLI, đăng nhập bằng tài khoản/gói hiện có và mở lại app. Không cam kết gói có hạn mức cụ thể hoặc không giới hạn; chưa kiểm phiên đăng nhập, phiên bản CLI hoặc entitlement thật trong T-003.

T-004: runner dùng `codex exec --json --ephemeral --skip-git-repo-check --sandbox read-only`, **không ép provider hoặc phương thức đăng nhập**. CLI đọc cấu hình/người dùng hiện có, gồm `session_gateway` trong config.toml. Giữ nguyên môi trường con, gồm `CODEX_HOME`, `HOME`/`USERPROFILE`, `OPENAI_API_KEY`/`CODEX_API_KEY` và biến provider tùy biến; không ghi các giá trị này vào log. Ô **Codex profile** để trống dùng mặc định, có giá trị thì thêm `--profile <tên>`. Prompt truyền qua stdin, không shell; cwd là thư mục tạm riêng, không phải repo. Đọc thông điệp `agent_message` cuối của stream, kiểm lại bằng schema import. Chỉ một lượt cùng lúc; giới hạn **180 giây**, tổng stdout/stderr **2 MiB**, JSON cuối **384.000 byte**. Hết thời gian/lỗi không tự gửi lại. Chỉ kiểm bằng process/file Codex giả; chưa chạy CLI thật. Cấu hình provider có thể quyết định nguồn tài khoản/hạn mức của nó, app không tự đổi lựa chọn đó.

`lib/lab/codex-exchange.ts` mở rộng hợp đồng trao đổi hiện có; `scripts/run-codex.mjs` xuất lại runner chung `runCodexText`. Mission Agent Reach/OpenMontage cũ giữ nguyên, không được tự chạy để thay cho CLI text.

## Kiểm và chạy tiếp

Tất cả test dùng fixture, SQLite trong bộ kiểm hoặc thư mục tạm/`outputs/`; không dùng dữ liệu thật. Báo cáo kết quả và blocker: [T-003](../ops/office/reports/T-003.md).

```powershell
pnpm typecheck
pnpm test
pnpm test:api
pnpm test:desktop
$env:HERMES_LOCAL_BUILD_DIR = "$PWD/outputs/T-003-build"
pnpm local:build

node --test --test-isolation=none tests/text-exchange.test.mjs desktop/test/codex-cli.test.mjs
node --test --test-isolation=none desktop/test/text-exchange-ui.test.mjs desktop/test/manual-media-ui.test.mjs desktop/test/muse-pause.test.mjs

$env:HERMES_ARTIFACTS = 'D:/hermes-wt/artifacts/T-003'
node scripts/check-text-exchange-ui.mjs
```

Script UI chặn request ngoài, chỉ dùng records giả, mock clipboard và bridge; dự kiến xuất `T-003-nghien-cuu-1366.png`, `T-003-nghien-cuu-1920.png` và `T-003-ui.json`. Chỉ coi có bằng chứng khi script chạy đạt và PNG được xem. Sandbox hiện chặn Chrome IPC và spawn test con. Không sửa assertion để làm xanh; boss chạy lại bên ngoài sandbox trước khi build thật/duyệt. Không cần chạy `codex exec` thật cho các bài kiểm này.
