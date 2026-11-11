# T11 · Agent Reach vào luồng research: tự kiểm listing và lấy tín hiệu cạnh tranh (miễn phí)

Phụ thuộc: T02 (trường `competition`, `matchType`, cờ chất lượng).

## Bối cảnh (có trong source)
- Agent Reach (`Panniantong/Agent-Reach`, MIT) đã được ghim trong `desktop/integrations-lock.json` và gọi qua `desktop/src/integrations.mjs`:
  - `Integrations.reach(args)`: chạy subprocess không qua shell; trên Windows chạy `python -m agent_reach.cli`.
  - `research()`: hiện chỉ làm **một** truy vấn, tối đa 5 kết quả, lưu JSON với nhãn "unreviewed". Kết quả **không** nối vào đợt research của Muse.
- `desktop/src/research-runner.mjs` chạy research bằng Muse rồi `mergeMuseResearch`.
- Ngân sách gần 0 USD: **chỉ dùng kênh miễn phí, không key**:
  - `web`: đọc trang và tìm kiếm.
  - `youtube`: search, info, subtitles.
  - Không dùng chuyển giọng nói thành chữ (cần Groq/OpenAI).
  - Không dùng kênh cần đăng nhập (reddit, instagram, twitter, facebook, xiaohongshu): dễ làm khóa tài khoản đang dùng để đăng bài.
- Trong sandbox đêm nay **không có mạng**. Mọi test dùng runner giả như `desktop/test/integrations.test.mjs` đang làm. Phần chạy thật kiểm vào sáng mai.

## Mục tiêu
1. **Kiểm listing tự động sau mỗi đợt Muse.** Sau khi `mergeMuseResearch` lưu xong, worker xếp một tác vụ nền tuần tự, mỗi ứng viên một lần:
   - Gọi Agent Reach đọc `supplierUrl`, ví dụ `read <url>` hoặc lệnh đọc của kênh `web`. Đọc `agent-reach --help` / `channels` trong checkout đã ghim để chọn đúng lệnh; nếu bản ghim không có lệnh đọc thì ghi blocker. Timeout khoảng 45 giây, nội dung giữ tối đa khoảng 200 KB.
   - Trích xuất bằng hàm thuần (regex hoặc heuristic, không gọi LLM):
     - tiêu đề trang;
     - chuỗi giá và ký hiệu tiền (¥, CN¥, US$, $, ₫, €);
     - MOQ (`Min. order`, `MOQ`, `起订`, `件起批`, `pieces`);
     - dòng nói về ship;
     - số lượng thẻ sản phẩm trên trang (nhiều sản phẩm → khả năng là showroom).
   - Lưu vào candidate một khối `listingCheck`: `{status: ok|blocked|failed, fetchedAt, title, priceText, currencyDetected, moqText, shippingText, productCountOnPage, rawPath}`. File thô lưu trong thư mục tác vụ tích hợp hiện có.
   - **Không ghi đè** `cost`/`minimumOrder` của Muse. Chỉ so sánh rồi gắn cờ: "Muse ghi X, trang nguồn hiện Y", "Trang nguồn có N sản phẩm → showroom", "Không đọc được trang (bị chặn)".
2. **Tín hiệu cạnh tranh và viral miễn phí cho mỗi ứng viên:**
   - `youtube search "<tên ngắn của sản phẩm> shorts"` (giới hạn khoảng 10): lưu số kết quả, lượt xem lớn nhất và ngày mới nhất nếu Agent Reach trả về. Đổ vào `competition` (từ T02) với `sourceUrl`/`observedAt`; nhãn rõ "YouTube Shorts, không phải Instagram".
   - `web search "<tên sản phẩm> tiktok OR reels"` (giới hạn 5): lưu link làm bằng chứng tham khảo.
   - Không có kết quả thì giữ `null`, không ghi 0.
3. **Giới hạn và trạng thái:**
   - Một tác vụ tích hợp tại một thời điểm (giữ `busy`).
   - Tối đa 10 ứng viên × 3 lệnh mỗi đợt.
   - Mất mạng hoặc bị chặn → trạng thái `failed`/`blocked` cho từng ứng viên, không chặn cả đợt.
   - Restart giữa chừng → đánh dấu `interrupted`, không chạy lại tự động (giữ hợp đồng hiện có).
   - Nút "Kiểm lại nguồn" để chạy lại tay.
4. **UI (bảng của T04 nếu đã có):** cột hoặc chip "Nguồn: đã đọc / bị chặn / showroom", và số Shorts tương tự. Modal chi tiết hiển thị `listingCheck` cùng cờ lệch so với Muse.
5. Cấu hình: bật/tắt "Tự kiểm nguồn bằng Agent Reach sau research" (mặc định bật nếu Agent Reach sẵn sàng theo `doctor()`).

## Giữ nguyên
- Mọi ràng buộc an toàn subprocess hiện có trong `integrations.mjs`: argv cố định, không shell, giới hạn kích thước và thời gian, kill cây tiến trình khi timeout.
- Không cài thêm dependency. Không đụng kênh cần đăng nhập.

## Nghiệm thu
- Test với runner giả:
  - Đúng argv cho read, youtube search, web search.
  - Một trang 1688/AliExpress giả trích ra giá ¥ và MOQ.
  - Trang showroom giả có 12 sản phẩm → cờ showroom.
  - Lệch giá giữa Muse và trang → cờ lệch.
  - Lỗi mạng → `failed`, đợt vẫn lưu.
  - Restart → `interrupted`, không replay.
- `npm run test:desktop`, `npm test`, `npm run typecheck`, `npm run local:build` không hỏng thêm.
- Báo cáo ghi lệnh cụ thể để người dùng chạy thử thật vào buổi sáng, ví dụ chạy kiểm nguồn cho đợt `research_51dba84b…`.
