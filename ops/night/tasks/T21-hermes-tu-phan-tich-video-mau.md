# T21 · Hermes tự phân tích video mẫu thành công thức (phần 1: chưa gọi Muse)

Phụ thuộc: T05, T12 (đã commit trên nhánh này).

## Bối cảnh
- Người dùng muốn **Hermes tự làm** việc mà skill `.claude/skills/viral-formula-analyzer/SKILL.md` đang làm. Đọc kỹ skill này trước khi code: taxonomy, các trường của mỗi tham chiếu, cách khớp công thức, quy tắc "new" và "candidate". Script tham chiếu nằm trong cùng skill (`scripts/measure_video.py`).
- Hiện có sau T12:
  - `desktop/src/reference-structure.mjs`: thời lượng, mốc cắt, contact sheet khoảng 0,8 s/frame, `structure.json`.
  - `components/lab/reference-video.tsx`: hiển thị và lưu `reference_video_draft`.
  - Prompt Muse cho video mẫu đã có, nhưng chỉ ở dạng chuỗi.
  - `lib/lab/viral-formulas.ts`: taxonomy và seed công thức (T05). Kind `viral_formula` lưu append-only theo id+version.
- Hai bài học từ lúc test skill với video thật:
  1. Chữ hiện dưới 1 giây bị sót ở sheet thưa. Phải có sheet dày 4 fps trước khi kết luận "không có chữ / không có CTA".
  2. CTA thường chỉ nằm trong caption hoặc tên file. Ví dụ: video dây dắt chó LED có "Comment LED" trong tên file, trên hình không có. Vì vậy cần trường `ctaSource`.

## Mục tiêu
1. **Sheet dày** trong `reference-structure`:
   - Thêm contact sheet 4 fps, 11 cột, rộng 200 px, bên cạnh sheet thưa.
   - Mỗi tấm tối đa 120 frame; video dài hơn thì chia nhiều tấm.
   - Mọi tấm đi qua đúng kiểm JPEG, giới hạn kích thước và confinement hiện có.
   - `structure.json` thêm `contactSheets: {sparse: {...}, dense: [{path, fromSec, toSec, secondsPerFrame, columns, rows}]}`. Giữ `contactSheetPath` cũ để tương thích.
2. **Đầu vào thêm:**
   - "Caption bài gốc": dán tay, tối đa 2200 ký tự.
   - "Tên file gốc": tự điền từ file đã chọn, sửa được.
   
   Lưu cả hai vào bản nháp; cả hai đều optional.
3. **Module thuần `lib/lab/formula-analysis.ts`** (không gọi mạng):
   - `formulaAnalysisPrompt({structure, caption, fileName, formulas})`:
     - Tiếng Anh, yêu cầu trả **duy nhất** một object JSON.
     - Giải thích cách đọc sheet: frame k nằm ở khoảng `k × secondsPerFrame` giây.
     - Bắt chép nguyên văn chữ trên hình. Cho phép `hookText: null` khi không thấy chữ. Không đoán âm thanh, vì không có transcript.
     - Chỉ dùng taxonomy lấy từ `lib/lab/viral-formulas.ts`, không viết lại danh sách lần hai.
     - Có `ctaSource: overlay | caption | filename | none`.
     - Có `effectsBeyondProduct`.
     - Cảnh báo câu chuyện ngôi thứ nhất.
     - Dài tối đa 4000 ký tự.
     
     Nếu prompt của T12 làm cùng việc thì thay bằng hàm này, không để hai prompt song song.
   - `parseFormulaAnalysis(text, structure, {caption, fileName})`:
     - Bỏ fence ```; parse bằng zod strict với enum theo taxonomy.
     - Beat phải có `fromSec < toSec` và nằm trong `[0, durationSec + 0.5]`.
     - `durationSec` và `cutCount` **luôn lấy từ số đo**. Nếu AI trả số khác thì ghi đè và thêm cảnh báo.
     - `ctaSource: 'caption'` mà caption không chứa `ctaKeyword` (không phân biệt hoa thường) → đặt `ctaSource` = null và thêm cảnh báo. Làm tương tự cho `'filename'`.
     - Lỗi thì báo tiếng Việt: "Phản hồi chưa đúng cấu trúc…".
   - `matchFormula(reference, formulas)`:
     - Tất định, khớp theo `hookType` cộng thứ tự loại beat; lệch thời gian nhỏ không tính.
     - Trả `{formulaId | null, confidence: 'exact' | 'partial' | 'none', reasons[]}`.
   - `proposeFormulaChanges(references, formulas)`:
     - Nhóm các tham chiếu không khớp theo chữ ký (hookType + chuỗi loại beat). Nhóm từ 2 video trở lên → `new`; nhóm 1 video → `candidate`, kèm lý do "cần thêm 1 ví dụ".
     - Khớp nhưng có nhãn mới → `add-label-variant`; có kiểu CTA mới → `add-cta-pattern`.
     - Hàm chỉ đề xuất, không tự áp.
4. **UI** trong `reference-video.tsx`, dùng class sẵn có, không đổi font/theme:
   - Ô caption và ô tên file.
   - Nút "Sao chép prompt phân tích", kèm đường dẫn sheet thưa và sheet dày, để người dùng tự gửi cho Muse hoặc AI khác.
   - Ô "Dán kết quả JSON". Parse xong thì hiện:
     - hook;
     - bảng beat;
     - CTA và nguồn CTA;
     - công thức khớp cùng lý do;
     - cảnh báo.
   - Nút "Lưu tham chiếu": cập nhật `reference_video_draft` theo CAS hiện có.
   - Khối "Đề xuất cập nhật công thức", tính trên các tham chiếu đã lưu:
     - Liệt kê các thay đổi đề xuất.
     - Nút "Tạo phiên bản công thức mới" chỉ lưu khi người dùng bấm, qua API append-only của `viral_formula`. Không bao giờ tự áp.
5. Task này **không gọi Muse**. T22 sẽ làm phần gửi Muse.

## Giữ nguyên
- Hợp đồng tác vụ tích hợp hiện có: một tác vụ một lúc, `interrupted` khi restart, giới hạn kích thước, xác minh JPEG.
- Bản nháp cũ không có trường mới vẫn parse được.

## Nghiệm thu
- **Test FFmpeg**, dùng video tổng hợp của T12: sheet dày tồn tại, là JPEG hợp lệ, số frame khoảng `duration × 4` (±2). Không có FFmpeg thì skip, ghi rõ lý do.
- **Test thuần:**
  - Prompt chứa đủ taxonomy (lấy từ module), có `ctaSource`, dài ≤ 4000 ký tự.
  - Parse: JSON hợp lệ; JSON có fence; enum sai → lỗi; beat ngược → lỗi; `cutCount` bị ghi đè bằng số đo.
  - Caption không chứa từ khóa → `ctaSource` = null và có cảnh báo.
- **Test khớp và đề xuất**, dựng fixture từ các tham chiếu V1–V12 trong `ops/night/input/formula-seed.json`:
  - Một tham chiếu kiểu problem → Vs → result → CTA khớp `problem-vs-result-cta`.
  - 1 video lạ → `candidate`.
  - 2 video lạ cùng chữ ký → `new`.
- **Test API:** lưu bản nháp có trường mới; đọc bản nháp cũ.
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
