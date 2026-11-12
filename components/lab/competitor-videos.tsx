"use client";
import {Button} from './primitives';
import {competitorContentLink,competitorReference,type CompetitorVideo} from '@/lib/lab/competitor-videos';
import type {LabRecord} from '@/lib/lab/domain';
export function CompetitorVideoFields({values,change,records,productId}:{values:Record<string,any>;change:(key:string,value:any)=>void;records:LabRecord[];productId:string}){
 const videos:CompetitorVideo[]=values.competitorVideos??[];
 const update=(i:number,key:string,value:any)=>change('competitorVideos',videos.map((v,n)=>n===i?{...v,[key]:value}:v));
 return <section className="field full"><h3>Video đối thủ</h3><p>Link tham khảo · tối đa 20 mục. Lưu hồ sơ trước khi dùng làm khung content.</p>
 {videos.map((v,i)=><fieldset key={i} className="production-card production-card-body"><legend>Video {i+1}</legend>
 <label className="field">Link HTTPS<input aria-label={'Link video '+(i+1)} type="url" required value={v.url} onChange={e=>update(i,'url',e.target.value)}/></label>
 <label className="field">Nền tảng<select value={v.platform} onChange={e=>update(i,'platform',e.target.value)}>{['instagram','tiktok','youtube','other'].map(p=><option key={p} value={p}>{p==='other'?'Khác':p}</option>)}</select></label>
 <label className="field">Đối thủ<input value={v.competitor??''} onChange={e=>update(i,'competitor',e.target.value||null)}/></label>
 <label className="field">Ghi chú<textarea value={v.note??''} onChange={e=>update(i,'note',e.target.value||null)}/></label>
 <label className="field">Bản phân tích video<select aria-label={'Bản phân tích '+(i+1)} value={v.referenceId??''} onChange={e=>update(i,'referenceId',e.target.value||null)}><option value="">Chưa liên kết</option>{records.filter(r=>r.kind==='reference_video_draft').map(r=><option key={r.id} value={r.id}>{r.data.product||r.id}</option>)}</select></label>
 <Button type="button" tone="ghost" onClick={()=>change('competitorVideos',videos.filter((_,n)=>n!==i))}>Xóa video {i+1}</Button>
 </fieldset>)}
 <Button type="button" tone="neutral" disabled={videos.length>=20} onClick={()=>change('competitorVideos',[...videos,{url:'',platform:'other',competitor:null,note:null,referenceId:null}])}>Thêm video đối thủ</Button>
 <CompetitorVideoList videos={videos} records={records} productId={productId}/>
 </section>;
}
export function CompetitorVideoList({videos=[],records,productId}:{videos?:CompetitorVideo[];records:LabRecord[];productId:string}){
 return <div>{videos.map((v,i)=>{const ref=competitorReference(v,records),rea=ref?.data.reaVideo;let safe=false;try{const u=new URL(v.url);safe=u.protocol==='https:'&&!u.username&&!u.password;}catch{}
 return <article className="production-card production-card-body" key={i}><strong>{v.competitor||'Đối thủ chưa biết'} · {v.platform}</strong>{safe&&<p><a href={v.url} target="_blank" rel="noopener noreferrer">Mở video đối thủ ↗</a></p>}<p>{v.note}</p>
 {rea?<p>{rea.shots.length} shot · {rea.durationSec>0?((Math.max(0,rea.shots.length-1)/rea.durationSec)*60).toLocaleString('vi-VN',{maximumFractionDigits:1}):'Chưa biết'} cắt/phút · Chữ đè: {rea.overlays.map((o:any)=>`${o.text} (${o.fromSec}–${o.toSec}s)`).join(' · ')||'Chưa ghi nhận'}</p>:<p>Chưa có phân tích rea-video.</p>}
 {ref&&<a className="text-link" href={competitorContentLink(productId,v,records)}>Dùng làm khung content</a>}
 </article>;})}</div>;
}
