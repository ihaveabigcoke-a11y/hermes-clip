# T08 — sửa UI nhỏ, 12/11/2026 (giờ Việt Nam)

Checkpoint: source ở `C:/HermesNight/hermes-clip`, nhánh `night-20261111`; không triển khai vào bản cài Windows. Một worker, không commit/push, không mở Electron/dịch vụ thật, không đọc AppData/profile/SQLite thật. Build ở `outputs/night-t08/build`, browser fixture và file tổng hợp ở `outputs/night-t08/browser`. Không sửa dependency, dữ liệu đầu vào, `data/`, `evidence/` hay `desktop/local-dist/`.

## Thay đổi theo yêu cầu

1. **Lưu cảnh nháp:** hàm thuần `canSaveSceneDraft` chặn chuỗi rỗng/khoảng trắng và form bị khóa; dùng cả trên nút lẫn submit handler. Hint “Nhập prompt để lưu cảnh nháp.” liên kết bằng `aria-describedby`. Bổ sung `busy` vào trạng thái khóa chung.
2. **Hàng đợi:** thẻ cảnh trong ProductionDesk dùng tối đa hai dòng, có `title` đầy đủ; nhãn trạng thái tổng quát là “Tất cả”. Thu nhỏ thumbnail/ô chọn ở 1250–1600 px để tên cảnh không bị ép còn vài ký tự. QueueBoard vốn đã có hai dòng và title của cảnh; giữ quy tắc đó, xác định `white-space: normal`, thêm title cho tên sản phẩm.
3. **Xem trước:** chuyển cụm nút chính lên ngay dưới tiêu đề, ngoài vùng cuộn; thêm Duyệt/Từ chối cạnh Tải file. Hai nút mở hộp duyệt hiện có với kết luận tương ứng; lưu vẫn dùng revision/command ID và các gate của domain, từ chối vẫn cần lý do. Thư viện tiếp tục dùng hộp duyệt cũ.
4. **Người mẫu:** giữ nguyên. `mode === 'model'` yêu cầu hai tham chiếu vai trò `person` và `product`; đây là người làm mẫu cùng sản phẩm, không phải template. Template là tính năng riêng “Mẫu prompt”.
5. **Banner:** workspace đã tải và có bất kỳ sản phẩm nào (kể cả lưu trữ) không hiện lời mời khám phá mẫu. Không phụ thuộc bộ lọc danh sách. Chế độ demo vẫn có nút quay về dữ liệu của người dùng. Nút dùng shared Button `neutral`, không có màu lime chính; không thêm preference/schema.
6. **Sản phẩm:** bỏ eyebrow riêng của màn này, gộp thông tin/lời mời mẫu thành một dòng thông tin. Thẻ thêm vốn + ship theo từng tiền tệ, số tài khoản chưa lưu trữ liên kết đúng sản phẩm, và tên bước từ `productStage` T03. Null, trường cũ bị thiếu và giá 0 giả do promote lịch sử giữ “chưa biết”; 0 thật vẫn hiển thị 0. Ảnh rộng hết thẻ, cao tối đa 160 px.
7. **Sidebar:** tăng từ 180 lên 232 px ở desktop và đồng bộ lề nội dung. Giữ toàn bộ nhãn hiện có, font-family, cỡ chữ và token màu. Không đổi `ui-copy.mjs` vì không rút nhãn.

## Kiểm tra và bằng chứng

| Lệnh | Kết quả mới |
|---|---|
| `npm test` | 135/135 đạt; baseline 132/132. Ba test mới cho disabled, banner, dữ liệu trên thẻ. |
| `npm run typecheck` | Đạt. |
| `npm run test:api` | 15/15 đạt. |
| `npm run test:desktop` | 218 đạt, 1 skip OpenMontage do thiếu môi trường tích hợp. |
| `$env:HERMES_LOCAL_BUILD_DIR = Join-Path (Get-Location).Path 'outputs/night-t08/build'; npm run local:build` | Đạt, UI và 22 module API từ source; có cảnh báo bundle lớn hiện hữu. |
| `node scripts/check-small-ui.mjs` | 12 nhóm kiểm tra UI offline đạt; không lỗi JavaScript, không request ngoài. |
| `git diff --check` | Đạt. |

Test UI dùng Chrome headless với browser tạm trong `outputs/`; mọi request được fulfill từ file build/bộ nhớ hoặc abort, không chạy server thật. Ảnh là seed của repo, video xám 720×1280/10 giây do FFmpeg tạo riêng cho fixture. Metadata fixture không phải receipt/file media của người dùng. Hộp duyệt được kiểm cả hủy (không ghi), chọn Duyệt, chọn Từ chối và lưu Từ chối có lý do vào record trong bộ nhớ. Không gửi Muse, không đăng Instagram.

Đã xem trực tiếp ảnh fixture cho cả bảy mục: màn soạn video/ảnh và nút lưu rỗng, thẻ hàng đợi, nút duyệt ở đầu khung, nhãn Người mẫu, banner rỗng/có sản phẩm, thẻ sản phẩm và sidebar mở Kinh doanh. Preview đo ở 1920×1080, 1536×864, 1366×1080, 800×1080, 390×844: Duyệt/Từ chối/Tải file đều ở trong viewport với scrollTop=0. Màn Sản phẩm kiểm ở 1920/1366/800/390 px, không tràn trang; nhãn sidebar desktop một dòng và footer thẻ sản phẩm ở trong viewport.

Bằng chứng mới: [kết quả UI](../../ops/night/out/T08-ui-check.json), [soạn video](../../ops/night/out/T08-compose-1920.png), [preview ảnh](../../ops/night/out/T08-preview-1920.png), [preview 1536×864](../../ops/night/out/T08-preview-1536.png), [hàng đợi](../../ops/night/out/T08-queue-1920.png), [sản phẩm](../../ops/night/out/T08-products-1920.png), [workspace trống](../../ops/night/out/T08-empty-products-1920.png). Các ảnh kích thước khác và log `T08-*.log` nằm trong `ops/night/out/`. Không có ảnh đầu vào riêng của T08 trong `ops/night/input/`; không coi ảnh fixture là ảnh bản cài thật.

## Giới hạn và chạy tiếp

Không có blocker triển khai source T08. Chưa kiểm Electron native, DPI Windows thật, dữ liệu/người dùng đang chạy hoặc Muse/Instagram thật theo quy tắc task đêm. 1536×864 là viewport fixture, không phải bằng chứng Windows scaling 125%. Skip OpenMontage không thuộc chức năng T08.

Runner có thể kiểm lại các lệnh trên rồi commit theo quy trình. Khi kiểm sáng hôm sau, dùng source đã build và kiểm một phiên bản Chờ duyệt của người dùng ở cửa sổ 1080p: nút mở đúng hộp duyệt, tên/sidebar không cắt và thẻ sản phẩm đủ dữ liệu. Triển khai bản cài là bước riêng. Rollback chỉ cần hoàn tác thay đổi source T08 qua runner; không có migration hoặc thay đổi dữ liệu thật cần khôi phục.
