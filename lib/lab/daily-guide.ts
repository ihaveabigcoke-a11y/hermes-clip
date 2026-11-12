export function dailyGuideLinks(productId='',projectId='') {
 const link=(view:string,params:Record<string,string>={})=>'?'+new URLSearchParams({view,...(productId?{product:productId}:{}),...params});
 const production=(stage='scenes',view='production')=>link(view,projectId?{production:projectId,stage}:productId?{new_product:productId,stage}:{stage});
 return [
  {title:'Chọn ba sản phẩm và tự xếp hạng',text:'Trong Săn sản phẩm, tự gán mã productKey và hạng 1–3 khi chọn. Mã cũ dùng lại hồ sơ; app không xếp hạng thay bạn.',href:link('research'),action:'Mở Săn sản phẩm'},
  {title:'Điền đầu vào làm video',text:'Trong hồ sơ, bổ sung báo giá, từ khóa CTA, tình huống mở đầu và tên in trên hộp. Kiểm mục Sẵn sàng làm video.',href:link('products',{product_tab:'content'}),action:'Mở hồ sơ sản phẩm'},
  {title:'Làm Khung content',text:'Chọn công thức hoặc video đối thủ đã phân tích. Duyệt shot, chữ đè và lượt tạo; mỗi lượt tối đa 8 giây. Prompt gửi model viết tiếng Anh.',href:production('scenes','content'),action:'Mở Khung content'},
  {title:'Tạo bằng Muse',text:'Chọn Muse và xem số lượt sẽ gửi, số lượt còn lại rồi bấm Tạo bằng Muse. Giãn ít nhất 60 giây; đêm này tối đa 12 lượt.',href:production(),action:'Mở gói tạo bằng Muse'},
  {title:'Dùng gói prompt khi cần dự phòng',text:'Khi Muse tạm dừng, chọn manual và xuất gói prompt. Tự mở Flow, kiểm chi phí/quyền dùng rồi tạo và tải video. Hermes không điều khiển Flow.',href:production(),action:'Mở xuất gói prompt'},
  {title:'Nhận clip và duyệt take',text:'Thả MP4 vào Hộp nhận theo mã cảnh; file chưa khớp thì gắn tay. Xem hình, tiếng và công dụng trước khi duyệt. Theo dõi lượt kẹt ở Tín hiệu & Phòng chờ.',href:production(),action:'Mở Hộp nhận trong Tạo media'},
  {title:'Chọn đoạn thực tế',text:'Khóa thân video từ take đã duyệt. Trong Chọn đoạn & chữ, đặt in/out, xem đoạn rồi lưu. Mốc shot dự kiến được giữ nguyên.',href:production('variants'),action:'Mở chọn đoạn'},
  {title:'Xuất MP4',text:'Xuất MP4 theo đoạn và chữ. App cắt, ghép, đè chữ và giữ tiếng gốc; xem lại file 720×1280 đã kiểm. Gói prompt chưa phải MP4.',href:production('variants'),action:'Mở Ghép và xuất'},
  {title:'Thử ba hook trên một thân',text:'Chọn ba take mở đầu để tạo nhóm hook, giữ chung đoạn thân, giá, CTA và landing. Xuất đủ ba MP4.',href:production('variants'),action:'Mở nhóm ba hook'},
  {title:'Tạo ba bài nháp',text:'Chọn tài khoản, nhập landing rồi bấm Tạo 3 bài nháp. Mỗi tài khoản nhận ba hook; kiểm ma trận và link UTM. Chưa có tài khoản/landing thì giữ thiếu.',href:production('variants'),action:'Mở tạo bài nháp'},
  {title:'Đăng tay sau khi duyệt',text:'Kiểm đúng SKU, nội dung, tài khoản và quyền đăng. Tự đăng trong Instagram, tự chọn nhãn cần thiết, rồi ghi URL bài vào Hermes.',href:link('social',productId?{ops_id:productId,ig_tab:'content'}:{}),action:'Mở bài Instagram'},
  {title:'Nhập số rồi quyết định',text:'Dán số từ Insights, ghi nguồn/thời điểm, xem trước rồi lưu; trống là Chưa biết. So hook, sau đó tự chọn đẩy/sửa/bỏ và ghi lý do ở Quyết định. Ngưỡng chưa đặt thì chưa có kết luận tự động.',href:link('results'),action:'Mở nhập số liệu'},
  {title:'Ghi quyết định cho vòng tiếp theo',text:'Đọc số mới nhất, chi phí và phản hồi thực tế. Đặt ngưỡng tín hiệu trong Cài đặt khi đã chốt; lưu quyết định mới để giữ lịch sử.',href:link('experiments'),action:'Mở Quyết định'},
 ];
}
