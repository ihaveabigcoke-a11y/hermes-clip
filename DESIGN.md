---
version: alpha
name: Hermes Clip
description: Bàn làm việc tạo media sản phẩm, với prompt, hàng đợi và preview trong cùng một màn hình.
colors:
  primary: "#d4ff3a"
  background: "#0c0d11"
  surface: "#161820"
  ink: "#f3f4f6"
  muted: "#b3b5c2"
  sidebar: "#121317"
  border: "#727888"
  success: "#6ee7b7"
  warning: "#f5cb77"
  danger: "#fda4af"
  accent: "#262d19"
  raised: "#232634"
  on-primary: "#121317"
  success-soft: "#142f28"
  warning-soft: "#332b19"
  danger-soft: "#371e28"
  scroll-thumb: "#727888"
  scroll-hover: "#b3b5c2"
  secondary: "#e2ff80"
  secondary-soft: "#262d19"
  primary-text: "#d4ff3a"
  focus: "#d4ff3a"
  subtle-border: "#2b2e3b"
typography:
  sans:
    fontFamily: "Be Vietnam Pro, Segoe UI, sans-serif"
  display:
    fontFamily: "Sora, Avenir Next, sans-serif"
  mono:
    fontFamily: "IBM Plex Mono, monospace"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  page: "16px"
  gap: "12px"
omitted:
  - section: components
    reason: "Các thành phần chuẩn được mô tả trong phần Components và triển khai bằng shared primitives."
---

# Hermes Clip

## Nghiên cứu nền và dữ liệu có nguồn, 11/11/2026

Nghiên cứu có nút Bắt đầu nghiên cứu ở đầu màn hình. Một đợt chạy trong tiến trình desktop, tự lưu qua SQLite, không phụ thuộc modal hay màn hình đang mở. Giữ app mở và máy thức. Tối đa ba yêu cầu trên một hồ sơ trong đợt, dùng chung hạn mức với Muse Chat và tạo media. App lưu ý định gửi trước thao tác; khi gián đoạn chỉ đối soát yêu cầu cũ, không tự gửi lại yêu cầu chưa rõ kết quả.

Bảng so sánh tối đa 10 sản phẩm dùng ảnh từ nguồn hàng, giá vốn theo MOQ, giá bán giả định, tín hiệu thị trường và khách hàng tiềm năng. Chi tiết dùng bảng số liệu gồm đơn vị, địa bàn, kỳ đo, URL và ngày đọc. Số liệu do Muse thu thập được ghi rõ nguồn gốc, không mặc định là nguồn đã được xác minh độc lập. Chỗ thiếu ảnh/số liệu có nhãn rõ, không điền số 0 hoặc tạo ảnh thay thế. Ghi chú dài nằm trong mục thu gọn. Không tự chọn hoặc tạo hồ sơ sản phẩm.

Theme, font và tokens hiện có được giữ. Bảng cuộn ngang trong vùng riêng, các thao tác vẫn truy cập được ở 390px. Thư viện dùng thumbnail JPEG có cache giới hạn trong desktop; video gốc chỉ mở khi xem chi tiết. Hàng đợi hiển thị lý do thiếu dung lượng, giữ tác vụ đã gửi để đối soát.

## Overview

Tài liệu được khôi phục từ `app/lab-tokens.css`, `app/globals.css`, `app/workbench.css` và giao diện local ngày 08/11/2026. CSS hiện có là nguồn token của bản đóng gói. Test contracts đối chiếu các màu được ghi tại đây với CSS.

Người dùng quản lý sản phẩm, prompt và các file được tạo bằng Muse trên Windows. Giao diện dùng tiếng Việt và hiển thị prompt nguyên bản. Màn hình sản xuất giữ cấu hình, hàng đợi và preview cạnh nhau. Nhật ký tiến trình nằm dưới ba vùng này, theo video MeosuQT người dùng cung cấp.

## Colors

Theo gói Stitch người dùng gửi ngày 10/11/2026, bản xem trước dùng graphite #0c0d11, panel #161820, chữ #f3f4f6 và nhấn xanh chanh #d4ff3a. Chữ trên nền nhấn dùng #121317. Viền control #727888 hỗ trợ nhận biết vùng nhập, divider dùng #2b2e3b. CSS app/lab-tokens.css là nguồn token chuẩn theo Model B. DESIGN.md phản chiếu các giá trị và test contracts kiểm tra đồng bộ.

## Typography

Be Vietnam Pro dùng cho nội dung và điều khiển. Sora dùng cho tiêu đề theo stylesheet hiện có. Nhật ký dùng font mono của app, thời gian định dạng tiếng Việt với múi giờ Asia/Ho_Chi_Minh.

## Layout

Desktop giữ ba vùng cấu hình, hàng đợi và preview. Màn hình hẹp dùng các nút chuyển vùng hiện có. Nhật ký có vùng cuộn riêng, dòng dài xuống hàng và tự cuộn khi người dùng đang ở cuối.

## Elevation & Depth

Vùng làm việc phân cách bằng đường viền và nền token. Dialog dùng shared Modal với lớp phủ hiện có.

## Shapes

Điều khiển và vùng nội dung dùng bán kính 6, 8 và 12 px theo token hiện có.

## Components

Button, Badge, Modal, RecordForm, SearchBox và Pagination thuộc `components/lab/primitives.tsx`. RowActions và lựa chọn theo trang thuộc `workbench-controls.tsx`. Luồng lưu production dùng API revision và command ID. Tiến trình desktop dùng `useDesktopStatus` và WorkerActivity.

Nút Lưu nháp để duyệt ghi cảnh và mở preview. Người dùng duyệt storyboard riêng rồi chọn Chạy cảnh. Khi chạy, app đối chiếu revision đã lưu và gửi đúng snapshot đã duyệt. Trạng thái bận chặn bấm lặp. Kết quả hợp lệ tự nhập về cảnh và cập nhật preview. Phiên hết hạn được hiển thị cùng nút mở profile để đăng nhập.

## Interaction and content

Thông báo tiến trình dựa trên checkpoint thực tế, có thời gian và tên profile. Chỉ hiển thị thông tin có trong dữ liệu. Kết quả cần xem nội dung trước khi duyệt. Lỗi gửi chưa rõ kết quả giữ mã job để đối soát.

Nhãn điều khiển dùng động từ tiếng Việt. Trạng thái có chữ và semantic HTML. Dùng focus, busy, disabled và reduced-motion từ các thành phần hiện có.

## Hermes Clip desktop

Bảng màu graphite và xanh chanh lấy từ bản dark trong gói Stitch người dùng cung cấp. globals.css và workbench.css ánh xạ token vào shared primitives. Desktop BrowserWindow dùng cùng màu background để tránh flash khi khởi động. Font tiếng Việt và bố cục ba vùng theo thành phần hiện hành.

DesktopConsole quản lý profile, Touch VPN và hạn mức. Form profile dùng RecordForm, Modal và profileInput. Button và Badge là thành phần chung. Hạn mức chỉ lấy từ phản hồi Muse của phiên đang đăng nhập, hiển thị trạng thái, nguồn và thời điểm đo. Popup select do hệ điều hành quản lý theo các form hiện có.

## Research and content operations

Nghiên cứu sản phẩm lưu tối đa 10 ứng viên có nguồn mỗi đợt và tối đa 3 lựa chọn. Nội dung & Instagram gắn hồ sơ tài khoản, kế hoạch và số liệu thủ công với sản phẩm. Landing page lưu nội dung và xuất HTML tự chứa ảnh để xem local. Thông tin giá chưa biết có giá trị null trong nghiên cứu và hồ sơ sản phẩm. Các phép tính tài chính yêu cầu đủ dữ liệu và giữ trạng thái chưa xác định khi còn ô trống.

Giao diện dùng tiếng Việt, nội dung marketing dùng en-US theo quyết định người dùng. OperationsPanel dùng Button, Badge, RecordForm, Modal và Pagination của primitives.tsx. API lab dùng kiểm tra quyền workspace, schema và revision hiện có. Bản ghi thiếu hoặc lỗi được giữ trong form cùng thông báo sửa. Số liệu cộng dồn giữ một bản hiện hành theo bài, nguồn và thời điểm đo đi kèm. Profile được ghi thủ công có trạng thái API chưa kết nối.

Gemini local giữ khóa qua safeStorage Windows và IPC chỉ trả hasKey. Model và giới hạn lượt/ngày do người dùng nhập. Trạng thái đã nhận kết quả dựa trên assistant_run hoàn tất với cấu hình hiện hành. Cấu hình ban đầu tắt gọi model.

| Capability | Canonical owner | Source | Variants | Verification |
| --- | --- | --- | --- | --- |
| Table Selection | workbench-controls.tsx | Workflow production hiện có | Chọn theo trang | Desktop regression |
| Select/Listbox | RecordForm và select có label | DESIGN.md | Popup native Windows | GUI keyboard và màn hình hẹp |
| Date | RecordForm | operations.ts | Nhập ISO, múi giờ rõ cho thời điểm đo | Schema và API |
| Form | primitives.tsx RecordForm | Schema domain và operations | Thêm, sửa | API và GUI |
| Scrollbar | globals.css | lab-tokens.css | Cuộn nội dung và preview | GUI hẹp |
| Toast | Notice trong LabApp | primitives.tsx | Thành công, lỗi, thông tin | GUI lưu dữ liệu |
| CRUD | lab route và server.save | CAS SQL owner/revision | Lưu nháp và cập nhật | operations-api.test.mjs |

## Muse tasks, 10/11/2026

Research, content drafts, landing copy and analysis use MuseChatPanel and the signed-in desktop profile. Research responses pass the operations schema and persist through the workspace revision API. Imported suggestions retain a Muse provenance label and require source review. Importing the same request twice keeps the original candidates. Selection and product promotion remain explicit user actions. Content and landing responses open RecordForm drafts. Commercial fields stay user-controlled.

Chat sends have a stable request ID, profile lock and shared three-turn batch limit. Uncertain delivery exposes recovery against the stored conversation. Results survive app restart. The theme uses lab-tokens.css through globals.css and workbench.css, with native dark select popups, shared focus styling and the existing Vietnamese fonts.

The creation pane exposes Muse writing directly. First/last-frame references and model/product references pass explicit attachment roles to Muse. Frame pairs require video plus exactly one of each role. Scene approval and output review use the existing domain gates. Legacy queued jobs deduplicate against their previous fingerprint when role metadata is added.

## Điều hướng và soạn media, 10/11/2026

Theo yêu cầu người dùng, menu chính ưu tiên Tạo video, Tạo ảnh, Chat Muse, Thư viện, Nghiên cứu, Sản phẩm và Tài khoản Muse. Nhóm Kinh doanh ở dưới có thể thu gọn, chứa Tổng quan, Concept đã lưu, Thử nghiệm nội dung, Số liệu, Instagram và Landing page. Cài đặt và Hướng dẫn nằm cuối sidebar. Route studio giữ dữ liệu concept hiện có và dùng nhãn Concept đã lưu.

ProductionStudio sở hữu bốn bước chính gồm Tạo & duyệt, Ảnh tham chiếu, Thư viện và Ghép & xuất. Select Công cụ dự án dùng popup native Windows, đưa tới storyboard/hook, phân tích, lịch sử, nhóm cảnh đã duyệt, quản lý tác vụ, hiệu suất và ghi chú khảo sát. Soạn storyboard nằm trong Kịch bản & hook. Nhật ký chạy tiếp tục nằm dưới vùng soạn, hàng đợi và preview.

ProductionDesk giữ prompt, chế độ và reference theo dự án và loại media. Chế độ Tự do nhận ảnh tùy chọn. Chuyển chế độ giữ ảnh đã chọn. Callback sau khi lưu reference chọn ảnh mới vào đúng nháp. Picker reference dùng asset ảnh có metadata và tối đa 8 MB. Nháp chat được giữ trong MuseChatPanel khi chuyển màn hình, polling dừng khi panel ẩn. Reload và Back/Forward đọc stage từ URL, chuyển menu media bắt đầu ở bước tương ứng.

Layout sidebar desktop rộng 232 px sau T08 để nhãn hiện có cùng hàng icon. Ở 390 px, menu chính cuộn ngang, nhóm kinh doanh mở thành hai cột, Cài đặt và Hướng dẫn vẫn truy cập được. Pane media có vùng cuộn riêng từ viewport 1100×600, các màn hình biểu mẫu khác giữ cuộn trang. Màu và font tiếp tục lấy từ token chuẩn hiện có.

Kiểm tra thực tế nằm trong checkpoint ux-review-20261110, runtime-verification.json và screenshots. Lượt này kiểm tra lưu nháp/reference trên bản sao SQLite và file media thật, đồng thời đối chiếu hash dữ liệu gốc. Các thao tác Muse mới có báo cáo nghiệm thu riêng khi thực hiện.

## Bản xem trước theme Stitch ngày 10/11/2026

Bản staging áp dụng bảng màu qua shared primitives để xuất ảnh giao diện cho bộ đặc tả. Bản tối được chọn theo yêu cầu nền tối trước đó. Font Be Vietnam Pro và Sora có sẵn phù hợp với bản Stitch. Primary, focus và trạng thái chọn dùng xanh chanh. Thành công, cảnh báo và lỗi có màu ngữ nghĩa riêng kèm chữ.

Đặc tả đầy đủ và các thay đổi workflow nằm trong outputs/Hermes-Clip-Graphite-Lime-2026-11-10. Ảnh chụp staging cho thấy theme trên chức năng hiện hành. Hàng đợi toàn đợt, thư viện toàn sản phẩm và các thay đổi UX được ghi riêng theo tình trạng triển khai.

## Tích hợp desktop và typography ngày 11/11/2026

Theme Stitch được tích hợp qua app/lab-tokens.css. Tài khoản Muse dùng bảng hồ sơ riêng, còn hàng đợi có điểm vào riêng trên sidebar. Chat gồm danh sách hội thoại đã lưu trong Hermes, nội dung trò chuyện và media dự án. Thư viện đọc file trên toàn bộ sản phẩm, có caption Muse theo sản phẩm. Menu native File/Edit/View/Window được bỏ theo ảnh người dùng gửi.

Typography dùng các token text-screen 24px, text-section 18px, text-control 14px, text-body 15px và text-meta 13px trong app/lab-tokens.css. Tiêu đề dùng weight 600, điều khiển dùng 500, nội dung và thông tin phụ dùng 400. Line-height nội dung là 1.55. Font-family tiếp tục theo khai báo hiện có ở globals.css. Hướng font công nghệ cho tương lai đang chờ người dùng lựa chọn.

app/typography.css sở hữu quy tắc chữ và kích thước điều khiển cho cả Electron và web. Các file globals.css, workbench.css và studio.css tham chiếu token chữ. DesktopWindow giới hạn kích thước khởi động theo vùng làm việc Windows để hỗ trợ display scaling. Hệ ba cột và điều hướng vùng trên cửa sổ nhỏ tiếp tục theo breakpoint hiện có.

desktop/src/ui-copy.mjs sở hữu nhãn dùng chung và tên trạng thái hiển thị. Mã trạng thái, chuyển trạng thái, prompt, lời thoại và tên sản phẩm trong dữ liệu được giữ nguyên khi hiển thị. Chờ duyệt dành cho file đã kiểm tra hoặc cảnh có kết quả đang cần xem. Lượt tạo nháp vẫn cần thao tác chạy riêng. Dữ liệu lựa chọn và nháp giao diện được lưu qua UiPreferences trong SQLite, hỗ trợ cổng local thay đổi sau restart.

Kiểm chứng của lượt này nằm trong checkpoint ui-integration-20261111. Kiểm thử giao diện dùng cửa sổ Electron native ở mức phóng Windows 125%, maximized và hai kích thước thu nhỏ. Phản hồi lỗi, bấm lặp và retry chat dùng giả lập có ghi nhãn. Ba MP4 có sẵn được phát và tải lại, đối chiếu checksum với dữ liệu đã lưu.

## Hàng đợi và thư viện sau lượt ba sản phẩm

QueueBoard gom các lượt tạo theo cảnh và sản phẩm. Mặc định mở Cần xử lý. Lượt lỗi đã có kết quả mới hơn được nhập thành công cho cùng cảnh, cùng loại media và phiên bản nội dung tương ứng sẽ nằm trong Lịch sử. Các yêu cầu chưa rõ kết quả và lỗi nhập file tiếp tục hiện để xử lý. Mọi lượt cũ vẫn truy cập được trong chi tiết cảnh. Phân loại nội dung sản phẩm hoặc kiểm thử kỹ thuật do người dùng chọn và lưu qua UiPreferences.

WorkspaceLibrary chọn một phiên bản đại diện cho mỗi cảnh, ưu tiên lựa chọn đã lưu rồi đến bản đã duyệt hợp lệ. Có thể mở toàn bộ phiên bản, xem prompt gốc, ảnh tham chiếu và caption, tải file hoặc mở đúng cảnh trong dự án. Thay đổi prompt hiện tại giữ được prompt trong snapshot của phiên bản trước. Khi duyệt kịch bản mới, nội dung đang chờ duyệt được hiển thị cùng đường xem prompt của file cũ.

MuseAdapter giữ thứ tự và vai trò ảnh đầu và cuối. Khi hai vai trò dùng cùng ảnh nguồn, file đính kèm có tên riêng và cùng dữ liệu ảnh đã kiểm checksum. Các kiểm tra thực tế, fixture và giới hạn nghiệm thu được ghi trong checkpoint overnight-20261111.

## Bảng so sánh theo sản phẩm, 11/11/2026

Theo yêu cầu người dùng, route Instagram mặc định là bảng tổng quan, một dòng cho mỗi sản phẩm, gộp mọi tài khoản. Sản phẩm mở các phần Tổng quan, Nội dung, Tài khoản và Lượt đăng; tài khoản không chiếm màn hình tổng quan. Tìm kiếm, lọc, sắp xếp và trang của bảng giữ trong URL ig_*, chọn sản phẩm dùng ops_id với Back/Forward. Tài khoản, đăng bài, đối soát và lịch đo giữ cơ chế hiện có.

instagram-summary.ts sở hữu phép tổng hợp: chỉ bài xác nhận đã đăng, mỗi permalink một lần, lấy lần đo hợp lệ mới nhất khớp bài/tài khoản. Tổng chưa đủ dữ liệu hiện dấu — cùng độ phủ; số 0 giữ nghĩa đã đo. Nguồn rút gọn dùng ≈. Thời gian tổng hợp hiển thị bản cũ nhất để tránh che dữ liệu cũ. Không thêm đồ thị xu hướng khi chưa có chuỗi số liệu lịch sử.

Nghiên cứu hiển thị tối đa 10 ứng viên bằng bảng so sánh nguồn, giá vốn/giá giả định, ý tưởng video. Chi tiết nguồn, MOQ/rủi ro và hành động tạo hồ sơ ở Modal dùng chung. Tối đa 3 lựa chọn do người dùng chốt, không tự promote sau research. Đợt mới nhất là mặc định. Muse mặc định nhận tiêu chí nguồn Trung Quốc và phân biệt giá theo tier, ship chưa rõ và lợi nhuận chưa kiểm chứng.

Native semantic table và vùng operations-table-scroll sở hữu cuộn ngang ở cửa sổ hẹp, giữ cuộn trang dọc. Bảng tổng quan 10 dòng/trang dùng Pagination; research giới hạn 10 bởi schema. Các điều khiển tiếp tục dùng Button/Badge/SearchBox/RecordForm/Modal/Pagination, select native Windows. Font và mọi token màu giữ nguyên. Thanh bộ lọc không có API từ xa; tìm kiếm local không gửi dữ liệu và không cần debounce mạng. Chi tiết vẫn dùng giới hạn chữ/line-height hiện có, không thu nhỏ font để né tràn. Bằng chứng tại checkpoint product-overview-20261111.
