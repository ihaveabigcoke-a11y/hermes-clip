# T19 · Thống nhất cách test desktop (bỏ hook nạp module)

## Bối cảnh (từ review đêm 11/11)
- Test desktop phụ thuộc `desktop/local-dist`, mà task đêm bị cấm ghi vào đó.
- T02 và T11 lách bằng `module.registerHooks` để chuyển import `local-dist/...` sang source `.ts`. Cách này giòn: cần đúng phiên bản Node.
- T05 tạo `scripts/build-local-server.mjs`: build server từ source vào `outputs/local-api-test-*`.

## Mục tiêu
1. Một helper test dùng chung, ví dụ `desktop/test/helpers/local-server.mjs`. Helper build một lần mỗi lượt test bằng `scripts/build-local-server.mjs` vào thư mục tạm (`outputs/`), rồi cho test import module server và domain từ đó.
2. Chuyển các test đang dùng `module.registerHooks` (tìm bằng grep) sang helper này. Bỏ `registerHooks`.
3. Không đổi assertion nào. Chỉ đổi cách nạp module.
4. `npm run local:build` và `desktop/local-dist` giữ nguyên chức năng.

## Nghiệm thu
- `grep -r registerHooks desktop/test tests` không còn kết quả (trừ comment giải thích nếu cần).
- Số test trong `npm run test:desktop` không giảm (ghi số trước/sau vào báo cáo).
- `npm test`, `npm run typecheck`, `npm run test:api`, `npm run test:desktop`, `npm run local:build` không hỏng thêm.
