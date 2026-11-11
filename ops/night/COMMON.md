# Quy tắc chung cho mọi task đêm (đọc trước khi làm)

Bạn là **worker Codex duy nhất** đang chạy qua đêm theo hàng đợi task do runner `RUN-NIGHT.ps1` gọi lần lượt. Người dùng đang ngủ, không có ai để hỏi. Không spawn sub-agent, không tự lập orchestrator.

## Nơi làm việc
- Thư mục hiện tại là **bản clone riêng** của repo `hermes-clip`, trên nhánh `night-*`. Đây không phải bản cài đang chạy của người dùng.
- Đọc trước: `AGENTS.md`, `docs/context/01-BOI-CANH-VA-TRANG-THAI.md`, `docs/context/02-SO-DO-SOURCE-VA-NGHIEM-THU.md`, rồi các file liên quan đến task.
- Dữ liệu đầu vào cho các task nằm trong `ops/night/input/`.

## Tuyệt đối không
- Không đọc, sửa hoặc copy bất cứ thứ gì trong `C:/Users/ADMIN/AppData/`, profile Chromium, SQLite thật, cookie, phiên Muse/Instagram, proxy.
- Không chạy `START-*.cmd`, `npm start`, Electron, Playwright tới website thật, không mở Muse hay Instagram, không gửi request mạng ra ngoài.
- Không `git push`, không tự `git commit` (runner sẽ commit sau khi kiểm), không đổi nhánh.
- Không cài dependency mới, không sửa `pnpm-lock.yaml`, `desktop/package-lock.json`, `package.json` dependencies.
- Không sửa `data/`, `evidence/`, `ops/night/tasks/`, `ops/night/input/`, `desktop/local-dist/`.
- Không xóa test, không nới assertion để test qua. Hành vi mới phải có test mới.
- Không đổi font, theme hay bố cục lớn ngoài phạm vi task. Nhãn UI bằng tiếng Việt có dấu; prompt gửi Muse và nội dung bán hàng bằng tiếng Anh.

## Cách làm
- Giữ tương thích ngược với dữ liệu đã lưu: trường mới phải optional hoặc mặc định `null`. Bản ghi cũ không có trường mới vẫn parse được.
- `unknown` giữ là `null`, không đổi thành 0. Không tự quy đổi tiền tệ.
- Tự quyết chi tiết kỹ thuật thông thường. Khi một phần bị chặn, làm phần độc lập và ghi blocker.
- Trước khi kết thúc, tự chạy các lệnh kiểm liên quan. Runner sẽ chạy lại: `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build`. Nếu lệnh nào đã fail từ baseline thì runner bỏ qua lệnh đó, nhưng bạn không được làm lệnh đang qua bị fail.
- Làm nhỏ, đúng phạm vi. Task sau có thể dựa trên task trước đã được commit trên cùng nhánh.

## Báo cáo cuối (bắt buộc, là tin nhắn cuối cùng của bạn)
```
=== BAO CAO <TASK-ID> ===
TRANG THAI: done | partial | blocked
DA DOI: <mô tả ngắn từng thay đổi>
FILE: <danh sách file đã sửa/thêm>
TEST DA CHAY: <lệnh → kết quả>
CHUA KIEM CHUNG: <điều chưa thể kiểm, ví dụ giao diện thật, Instagram thật>
BLOCKER: <hoặc "không">
GOI Y BUOC TIEP: <tối đa 3 dòng>
```
