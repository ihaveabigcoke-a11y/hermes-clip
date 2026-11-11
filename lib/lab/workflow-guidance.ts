import {takeGate,variantItems,pendingTakeSelection,type Production} from './production.ts';
export function workflowGuidance(p:Production,productRevision:number){
 const approved=p.scenes.filter(s=>s.takes.some(t=>t.review==='approved'&&!takeGate(p,s,t)));
 const unknown=p.scenes.filter(s=>s.attempts.some(a=>a.status==='unknown'));
 const review=p.scenes.filter(s=>s.takes.some(t=>t.review==='pending'));
 const unreviewed=p.scenes.filter(s=>!s.storyboardApproved);
 const outdated=p.scenes.filter(s=>s.takes.some(t=>t.review==='approved'&&!!takeGate(p,s,t))&&!approved.includes(s));
 const ready=p.variants.filter(v=>{try{variantItems(p,v.id);return true;}catch{return false;}});
 const takeSelection=pendingTakeSelection(p);
 const base={approved:approved.length,total:p.scenes.length,review:review.length,unknown:unknown.length,takeSelection};
 const next=(stage:string,title:string,detail:string,action:string)=>({...base,stage,title,detail,action});
 if(p.productRevision!==productRevision)return next('references','Hồ sơ sản phẩm đã thay đổi',"Đồng bộ phiên bản ở thông báo phía trên trước khi tiếp tục. phiên bản cũ được giữ.",'Xem reference');
 if(unknown.length)return next('queue',`${unknown.length} cảnh cần đối soát`,"Kiểm tra mã yêu cầu cũ trước khi tạo lượt tạo mới để tránh gửi trùng.",'Mở lịch sử');
 if(!p.scenes.length)return next('scenes','Bắt đầu với một cảnh nháp',"Viết prompt hoặc dùng Mẫu kịch bản. Chưa gửi Muse khi lưu nháp.",'Soạn cảnh');
 if(unreviewed.length)return next('scenes',`${unreviewed.length} kịch bản chưa duyệt`,"Chọn cảnh trong hàng đợi, kiểm tra prompt và tham chiếu trước khi giao việc.",'Xem các cảnh');
 if(review.length||outdated.length)return next('library',`${new Set([...review,...outdated].map(s=>s.id)).size} cảnh cần xem lại phiên bản`,'Kiểm tra nội dung, tỷ lệ, thời lượng và phiên bản trước khi duyệt.','Mở thư viện');
 if(p.scenes.some(s=>!s.takes.length))return next('desktop','Cảnh đã sẵn sàng nhận file',"Dùng tác vụ nền đã xác minh trên Windows hoặc gắn file thật vào cảnh.","Mở trên máy tác vụ nền");
 if(!approved.some(s=>s.role==='body'&&s.mediaType==='video'))return next('library',"Chưa có phiên bản nội dung chính hợp lệ","Cần phiên bản video vai trò Nhóm cảnh chính đã duyệt và đúng phiên bản để dựng.","Kiểm tra phiên bản");
 if(!p.bodies.length)return next('bodies','Khóa phần thân để tái sử dụng',"Chọn các phiên bản nội dung chính đã duyệt và kiểm tra thứ tự ghép.","Tạo nhóm cảnh chính");
 if(takeSelection)return next('variants',takeSelection.label,'Chọn đủ video đã duyệt cho các cảnh của bản nháp A/B. Chưa ghép hoặc xuất khi còn thiếu phiên bản.','Chọn video cho biến thể');
 if(!ready.length)return next('variants',"Chuẩn bị biến thể từ nội dung chính","Tạo mở đầu/kêu gọi hành động/ngôn ngữ hoặc kiểm tra nguồn của biến thể cần duyệt lại.",'Mở biến thể');
 if(!p.exports.some(e=>ready.some(v=>v.id===e.variantId)))return next('variants','Biến thể sẵn sàng xuất',"Xuất gói dựng hoặc dựng bằng trên máy đã kết nối; file gốc được giữ.",'Mở bản xuất');
 return next('learning','Ghi nhận kết quả thử nghiệm','Nhập số liệu có nguồn cho biến thể để chọn giả thuyết thử tiếp.','Xem hiệu suất');
}
