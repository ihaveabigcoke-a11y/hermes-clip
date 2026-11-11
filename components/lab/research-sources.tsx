"use client";
import {useEffect,useRef,useState} from 'react';
import type {Candidate} from '@/lib/lab/operations';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {Button} from './primitives';

const states:Record<string,string>={queued:'Chờ kiểm nguồn',running:'Đang kiểm nguồn',done:'Đã kết thúc kiểm nguồn',failed:'Kiểm nguồn gặp lỗi',interrupted:'Kiểm nguồn bị gián đoạn · bấm Kiểm lại nguồn để tiếp tục'};
export const SOURCE_POLL_MS=10_000;
export function shouldPollSourceChecks(status:{jobs?:{kind:string;projectId:string;state:string}[]}|null,batchId:string){
 return status?.jobs?.some(job=>job.kind==='source-check'&&job.projectId===batchId&&['queued','running'].includes(job.state))??false;
}
export function SourceCheckControls({batchId,disabled}:{batchId:string;disabled:boolean}){
 const [status,setStatus]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const statusRef=useRef(status);statusRef.current=status;
 useEffect(()=>{
  let live=true,inFlight=false;
  setStatus(null);statusRef.current=null;
  const refresh=async()=>{if(inFlight)return;inFlight=true;try{const value=await desktopBridge()?.integrationStatus?.();if(live)setStatus(value??null);}catch(e){if(live)setError((e as Error).message);}finally{inFlight=false;}};
  void refresh();const timer=setInterval(()=>{if(shouldPollSourceChecks(statusRef.current,batchId))void refresh();},SOURCE_POLL_MS);
  window.addEventListener('product-lab:workspace-changed',refresh);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};
 },[batchId]);
 if(!status)return null;
 const jobs=(status.jobs??[]).filter((job:any)=>job.kind==='source-check'&&job.projectId===batchId);
 const active=shouldPollSourceChecks(status,batchId);
 const latest=jobs[0];
 async function act(method:string,payload:any){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await desktopBridge()![method](payload);setStatus(await desktopBridge()!.integrationStatus());}
  catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 return <div className="info-panel">
  <label><input type="checkbox" checked={status.autoSourceCheck===true} disabled={disabled||busy} onChange={event=>void act('saveSourceCheckPreference',{enabled:event.target.checked})}/> Tự kiểm nguồn bằng Agent Reach sau research</label>
  <div className="button-row"><Button tone="neutral" disabled={disabled||busy||active||!status.config} onClick={()=>void act('researchCheckSources',{batchId})}>Kiểm lại nguồn</Button>
   {latest&&<span role="status">{states[latest.state]??latest.state} · {latest.completed??0}/{latest.request.candidates?.length??0} ứng viên</span>}</div>
  {latest?.result?.candidates?.some((candidate:any)=>candidate.status!=='ok')&&<p>Một số nguồn chưa đọc được hoặc kết quả chưa lưu được. Xem chi tiết ứng viên và receipt trong Nghiên cứu và dựng video.</p>}
  {!status.health?.reach?.ready&&<p>Chưa xác minh Agent Reach. Bấm Kiểm tra công cụ trong Nghiên cứu và dựng video.</p>}
  {status.health?.reach?.listingRead?.error&&<p>{status.health.reach.listingRead.error}</p>}
  {(error||latest?.error)&&<p className="inline-error" role="alert">{error||latest?.error}</p>}
 </div>;
}
export function SourceChip({candidate}:{candidate:Candidate}){
 const check=candidate.listingCheck;
 if(check?.sourceUrl&&check.sourceUrl!==candidate.supplierUrl)return <small>Nguồn: đã đổi URL · cần kiểm lại</small>;
 return <small>{!check?'Nguồn: chưa đọc':check.status==='unavailable'?'Nguồn: chưa kiểm được (công cụ)':check.status==='blocked'?'Nguồn: bị chặn':check.status==='failed'?'Nguồn: lỗi đọc':check.productCountReliable===true&&(check.productCountOnPage??0)>=6?'Nguồn: có thể là showroom':'Nguồn: đã đọc'}</small>;
}
export function ShortsSignal({candidate}:{candidate:Candidate}){
 const count=candidate.competition?.youtubeShorts?.resultCount;
 return <small>YouTube Shorts tương tự: {count??'Chưa biết'} · kết quả tìm kiếm, không phải Instagram</small>;
}
export function SourceDetails({candidate}:{candidate:Candidate}){
 const check=candidate.listingCheck,shorts=candidate.competition?.youtubeShorts,web=candidate.competition?.webReferences;
 return <>
  <h3>Kiểm tra listing bằng Agent Reach</h3><SourceChip candidate={candidate}/>
  {check?<>
   <p>Đọc lúc {new Date(check.fetchedAt).toLocaleString('vi-VN')} · <a href={check.sourceUrl} target="_blank" rel="noreferrer">Trang đã đọc</a></p>
   <dl className="preview-facts"><div><dt>Tiêu đề trang</dt><dd>{check.title??'Chưa biết'}</dd></div><div><dt>Giá trên trang</dt><dd>{check.priceText??'Chưa biết'}</dd></div><div><dt>Ký hiệu tiền</dt><dd>{check.currencyDetected??'Chưa biết'}</dd></div><div><dt>MOQ trên trang</dt><dd>{check.moqText??'Chưa biết'}</dd></div><div><dt>Dòng vận chuyển</dt><dd>{check.shippingText??'Chưa biết'}</dd></div><div><dt>Sản phẩm trên trang</dt><dd>{check.productCountOnPage??'Chưa biết'}</dd></div></dl>
   {check.currencyNote&&<p>{check.currencyNote}</p>}
   {check.warnings?.map(warning=><p className="info-panel" key={warning}>{warning}</p>)}
   {check.error&&<p className="inline-error">{check.error}</p>}
   <p>Trích xuất tự động từ trang; cần đối chiếu đúng SKU, giá theo MOQ và đơn vị tiền. Giá/MOQ Muse vẫn được giữ.</p>
   {check.rawPath&&<details><summary>File nguồn trên máy</summary><p>{check.rawPath}</p></details>}
  </>:<p>Chưa có kết quả đọc listing.</p>}
  <h3>YouTube Shorts, không phải Instagram</h3><ShortsSignal candidate={candidate}/>
  {shorts&&<><dl className="preview-facts"><div><dt>Lượt xem lớn nhất được trả về</dt><dd>{shorts.maxViews??'Chưa biết'}</dd></div><div><dt>Video mới nhất được trả về</dt><dd>{shorts.newestPublishedAt?new Date(shorts.newestPublishedAt).toLocaleDateString('vi-VN'):'Chưa biết'}</dd></div></dl><p>{shorts.period} {shorts.note}</p><p>Đọc lúc {new Date(shorts.observedAt).toLocaleString('vi-VN')} · <a href={shorts.sourceUrl} target="_blank" rel="noreferrer">Nguồn YouTube</a></p>{shorts.error&&<p className="inline-error">{shorts.error}</p>}</>}
  {web&&<><h3>Link tham khảo TikTok / Reels từ web</h3><p>{web.note} Đọc lúc {new Date(web.observedAt).toLocaleString('vi-VN')}.</p>{web.links?.length?<ul>{web.links.map(link=><li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>)}</ul>:<p>Chưa có link tham khảo.</p>}{web.error&&<p className="inline-error">{web.error}</p>}</>}
 </>;
}
