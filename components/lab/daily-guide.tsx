"use client";
import {useState} from 'react';
import type {LabRecord} from '@/lib/lab/domain';
import {dailyGuideLinks} from '@/lib/lab/daily-guide';
import {latestProductProduction} from '@/lib/lab/product-next-step';
import './daily-guide.css';
export default function DailyGuide({records}:{records:LabRecord[]}) {
 const products=records.filter(r=>r.kind==='product'&&!r.data.archived),[chosen,setChosen]=useState(()=>new URLSearchParams(location.search).get('product')??'');
 const product=products.find(p=>p.id===chosen)??products[0],project=product?latestProductProduction(product,records):null;
 return <section className="daily-guide" aria-label="Một ngày với Hermes"><h2>Một ngày với Hermes</h2><p>Làm trọn một sản phẩm trước, rồi tiếp tục các sản phẩm đã chọn. Nút Bước tiếp theo trên hồ sơ sẽ dẫn tới phần còn thiếu.</p>
 <label className="field">Sản phẩm dùng trong hướng dẫn<select value={product?.id??''} onChange={e=>{setChosen(e.target.value);const u=new URL(location.href);u.searchParams.set('product',e.target.value);history.replaceState({},'',u);}}>{!products.length&&<option value="">Chưa có sản phẩm</option>}{products.map(p=><option key={p.id} value={p.id}>{p.data.name}</option>)}</select></label>
 <aside className="info-panel" role="note"><strong>Phanh Muse</strong><p>Gặp từ chối, captcha, đăng xuất, cảnh báo tài khoản hoặc hai lỗi liên tiếp: Tạm dừng và dùng manual; không thử lại đêm đó. Kết quả chưa rõ phải đối soát trước khi gửi lại. Trạng thái đã đăng chỉ ghi sau khi có bài và URL thật.</p></aside>
 <ol>{dailyGuideLinks(product?.id,project?.id).map((step,i)=><li key={step.title} className="production-card production-card-body"><h3>{i+1}. {step.title}</h3><p>{step.text}</p><a className="office-text-button" href={step.href}>{step.action} →</a></li>)}</ol>
 </section>;
}
