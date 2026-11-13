# T-026a — thử lại cuối, đạt

Menu đúng bảy mục + Cài đặt, Tín hiệu đứng đầu và mặc định React/Electron. Công tắc Hiện màn nâng cao ở Cài đặt nhớ lựa chọn qua reload. 20 view cũ còn mở được. Không xoá code/data. Assertion startup cập nhật đúng đích mới người dùng yêu cầu, giữ phép kiểm regex chặt; không bỏ assertion.

Full suite: typecheck, 263 domain + 29 API + 489 desktop = 781 pass/1 skip. UI fixtures menu/20 routes/công tắc đạt; hai PNG outputs/T-026a-ui/menu-{1366,1920}.png. Main agent tự xem diff và ảnh theo Office mode; không reviewer thứ hai. HEAD/branch/stash không đổi trong review; data/evidence/dependency không đổi.

Lượt đầu có lỗi desktop baseline, đã revert; lỗi được sửa ở b và lần thử cuối suite xanh. Chưa thử Electron với dữ liệu thật; build cuối/launcher QA riêng ở phần tổng. SHA/push ở STATUS.
