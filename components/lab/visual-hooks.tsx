"use client";
import {useState} from 'react';
import {Button,Badge,Modal,RecordForm,type FieldDef} from './primitives';
import {visualHookBrief,visualHookDrafts} from '@/lib/lab/visual-hooks';
import {type Production} from '@/lib/lab/production';
import {type LabRecord} from '@/lib/lab/domain';

const fields:FieldDef[]=[{name:'problemVisual',label:'Bất tiện nhìn thấy được',type:'textarea',full:true,help:'Mô tả điều camera nhìn thấy; ví dụ điện thoại nảy trong túi khi chạy.'},{name:'productAction',label:'Một thao tác dùng sản phẩm',type:'textarea',full:true,help:'Ví dụ đặt điện thoại vào ngăn vest và kéo khóa.'},{name:'payoffVisual',label:'Kết quả có thể chứng minh',type:'textarea',full:true,help:'Phải kiểm tra với mẫu thật trước khi sản xuất; không tự thêm công dụng.'}];
export default function VisualHooks({production:p,product,disabled,onDrafts}:{production:Production;product:LabRecord;disabled:boolean;onDrafts:(rows:any[])=>Promise<any>}){
 const [open,setOpen]=useState(false),[dirty,setDirty]=useState(false),[drafts,setDrafts]=useState<ReturnType<typeof visualHookDrafts>>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="production-secondary"><header className="production-heading"><div><h2>Mở đầu bằng hình ảnh · 0–3 giây</h2><p>Dừng lướt → hiểu bất tiện → muốn xem cách giải quyết. Mỗi cảnh phải đọc được khi tắt tiếng.</p></div><Button disabled={disabled||busy} onClick={()=>setOpen(true)}>Soạn ba cách mở đầu</Button></header>
 <div className="info-panel"><strong>Cùng sản phẩm, cùng nội dung chính, cùng kêu gọi hành động</strong><p>Chỉ đổi đoạn mở đầu để so sánh. Ba phương án là khung giả thuyết từ brief, không phải dự đoán viral. Số liệu nền tảng và tín hiệu mua cần được ghi riêng theo nguồn.</p></div>
 {error&&<p className="inline-error" role="alert">{error}</p>}
 <div className="hook-cards">{drafts.map(v=><article className="production-card production-card-body" key={v.name}><header><h3>{v.name}</h3><Badge>Nháp · 3s</Badge></header><p>{v.hypothesis}</p><ol>{(v.preview??v.beats).map(b=><li key={b}>{b}</li>)}</ol></article>)}</div>
 {!drafts.length&&<div className="production-card production-card-body"><h3>Duyệt visual trước khi thêm chữ</h3><p>Khung hình đầu có chủ thể rõ không? Đến giây thứ ba, người xem có hiểu mình sẽ giải quyết điều gì không? Payoff có đúng sản phẩm thật không?</p><p>Không dùng hình ảnh kỳ lạ chỉ để giữ người xem nếu nó không dẫn về công dụng hoặc lý do muốn sở hữu sản phẩm.</p></div>}
 {!!drafts.length&&<div className="button-row"><Button disabled={disabled||busy} busy={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await onDrafts(drafts.map(v=>v.scene));setDrafts([]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Lưu ba mở đầu nháp vào Soạn và duyệt</Button><small>Chưa duyệt kịch bản, chưa gửi tạo media.</small></div>}
 <Modal open={open} title="Brief mở đầu bằng hình ảnh" description="Viết hành động cụ thể, tránh những từ chung như đẹp, xịn hoặc tiện lợi." onClose={()=>setOpen(false)} dirty={dirty} locked={busy}><RecordForm kind="production" initial={{problemVisual:'',productAction:'',payoffVisual:''}} fields={fields} validation={visualHookBrief} onDirty={setDirty} onCancel={()=>setOpen(false)} submitLabel="Xem ba phương án" onSave={async v=>{setDrafts(visualHookDrafts(product.data,p,v));setDirty(false);setOpen(false);}}/></Modal>
 </section>;
}
