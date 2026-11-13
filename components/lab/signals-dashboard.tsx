"use client";
import {useEffect,useState,useRef} from 'react';
import {Activity,Clock3,FileInput,Film,ShieldAlert,TriangleAlert} from 'lucide-react';
import {type OfficeView,officeGroups} from '@/lib/lab/office-view';
import {type LabRecord} from '@/lib/lab/domain';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {serviceSignals,signalToneLabels,signalTimeline,eventTypes,relativeSignalTime} from '@/lib/lab/signals';
import {SkipReconciliation} from './manual-media';
import {api} from './primitives';
import './signals-dashboard.css';
const icons={job:Activity,import:FileInput,render:Film,refused:ShieldAlert,error:TriangleAlert};
export function SignalsDashboard({view,records,demo,productId,onSelect}:{view:OfficeView;records:LabRecord[];demo:boolean;productId:string;onSelect:(id:string)=>void}) {
 const commands=useRef<Record<string,string>>({});
 const [services,setServices]=useState<any>({}),[filter,setFilter]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{
  let disposed=false,busy=false;
  async function refresh(){if(busy||disposed||demo)return;busy=true;const bridge=desktopBridge();
   const methods=[['worker','status','muse'],['manual','manualMediaStatus','manual'],['render','integrationStatus','render'],['instagram','instagramStatus','instagram']];
   const responses=await Promise.allSettled(methods.map(async([,method])=>bridge?.[method]?await bridge[method]():null));
   if(!disposed){setServices((old:any)=>{const next={...old,errors:{}};responses.forEach((result,i)=>{const [key,,id]=methods[i];if(result.status==='fulfilled')next[key]=result.value;else next.errors[id]=true;});return next;});setNow(Date.now());}busy=false;
  }
  void refresh();const timer=setInterval(()=>void refresh(),5000);window.addEventListener('product-lab:workspace-changed',refresh);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};
 },[demo]);
 const cards=serviceSignals(services,view),events=signalTimeline(view).filter(e=>(!filter||e.type===filter)&&(!productId||e.productId===productId));
 const runs=view.runs.filter(r=>(!productId||r.productId===productId)),pending=runs.filter(r=>['queued','attention','manual','refused','unmapped'].includes(r.group));
 const name=(id:string|null)=>view.products.find(p=>p.id===id)?.name??'Chưa gắn sản phẩm';
 const flow=[['queued','Hàng chờ'],['sending','Đang gửi'],['generating','Đang tạo'],['checking','Kiểm / nhập'],['library','Thư viện']];
 async function skip(run:OfficeView['runs'][number]) {
  const response=await api('/api/lab'),project=(response.records as LabRecord[]).find(p=>p.id===run.productionId);
  if(!project)throw Error('Không tìm thấy dự án; tải lại dữ liệu.');
  await api('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:project.id,revision:project.revision,commandId:commands.current[run.id]??(commands.current[run.id]='skip_'+crypto.randomUUID()),action:'skip_reconciliation',input:{sceneId:run.sceneId}})});
  window.dispatchEvent(new Event('product-lab:workspace-changed'));
 }
 return <div className="signals-dashboard">
  <div className="service-signals" aria-label="Trạng thái bốn dịch vụ">{cards.map(c=><article key={c.id} data-service={c.id} data-tone={c.tone}><header><span className="service-dot"/><h2>{c.name}</h2></header><strong>{signalToneLabels[c.tone]}</strong><p>{c.reason}</p><time dateTime={c.at?new Date(c.at).toISOString():undefined} title={c.at?new Date(c.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):undefined}>{relativeSignalTime(c.at,now)}</time></article>)}</div>
  <div className="signal-visual-layout"><section className="signal-flow-board"><header><h2>Dòng tác vụ</h2><span>Từ giao việc đến số liệu</span></header><div className="signal-flow-map"><div className="signal-origins"><small>Giao việc</small>{view.products.filter(p=>!productId||p.id===productId).slice(0,4).map(p=><a href={'?view=products&product='+encodeURIComponent(p.id)} key={p.id}>{p.name}</a>)}{!view.products.length&&<span>Chưa có sản phẩm</span>}</div><div className="signal-coordinator"><Activity size={27}/><strong>Hermes Clip</strong><small>{runs.length?runs.length+' lượt đã lưu':'Chưa có lượt chạy'}</small></div><div className="signal-flow-lanes"><small>Tạo media</small><div className="signal-flow-nodes">{flow.map(([key,label])=><div key={key}><span>{label}</span><b>{runs.length?runs.filter(r=>r.group===key).length:'—'}</b></div>)}</div><small>Phát hành & đo</small><div className="signal-flow-nodes downstream"><div><span>MP4 đã kiểm</span><b>{view.exports.length?view.exports.filter(e=>e.verified&&(!productId||e.productId===productId)).length:'—'}</b></div><div><span>Bài đã đăng</span><b>{view.posts.length?view.posts.filter(p=>p.status.startsWith('published')&&(!productId||p.productId===productId)).length:'—'}</b></div><div><span>Lần đo</span><b>{view.measurements.length?view.measurements.filter(m=>!productId||view.posts.some(p=>p.id===m.postId&&p.productId===productId)).length:'—'}</b></div></div><div className="signal-flow-exceptions"><span>Muse từ chối / giới hạn: {runs.length?runs.filter(r=>r.group==='refused').length:'—'}</span><span>Lỗi kỹ thuật: {runs.length?runs.filter(r=>r.group==='failed').length:'—'}</span></div></div></div></section>
  <section className="signal-events"><header><h2>Dòng thời gian</h2><label><span className="sr-only">Lọc loại sự kiện</span><select aria-label="Lọc loại sự kiện" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Tất cả loại</option>{Object.entries(eventTypes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></header><p className="signal-event-help">50 sự kiện gần nhất đã lưu</p><ol>{events.map(e=>{const Icon=icons[e.type as keyof typeof icons];return <li key={e.id} data-event-type={e.type} data-tone={e.tone}><Icon size={16}/><button onClick={()=>onSelect(e.runId)}><strong>{e.text}</strong><span>{name(e.productId)}</span><time title={e.at?new Date(e.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):undefined}>{relativeSignalTime(e.at,now)}</time></button></li>;})}</ol>{!events.length&&<p className="chart-empty">Chưa có sự kiện phù hợp</p>}</section></div>
  <section className="visual-panel signal-pending"><header><h2>Hàng chờ & đối soát</h2><span>{pending.length?pending.length+' lượt cần xử lý':'Chưa có lượt chờ'}</span></header><div role="region" aria-label="Bảng hàng chờ" tabIndex={0}><table><thead><tr><th>Sản phẩm / cảnh</th><th>Trạng thái</th><th>Tín hiệu gần nhất</th><th>Hành động</th></tr></thead><tbody>{pending.map(run=>{
   const project=records.find(p=>p.id===run.productionId),scene=project?.data.scenes?.find((s:any)=>s.id===run.sceneId);
   const href=run.productionId?'?'+new URLSearchParams({view:'production',production:run.productionId,stage:'scenes',...(run.sceneId?{desk_scene:run.sceneId}:{})}):'?view=queue';
   return <tr key={run.id}><th>{name(run.productId)}<small>{scene?.name??'Chưa gắn cảnh'}</small></th><td>{officeGroups[run.group as keyof typeof officeGroups]}</td><td>{relativeSignalTime(run.updatedAt?Date.parse(run.updatedAt):null,now)}</td><td><div className="button-row"><a href={href} className="lab-button neutral">{scene?'Mở cảnh':'Mở hàng đợi'}</a><SkipReconciliation blocked={!!scene&&run.provider==='muse'&&['attention','refused'].includes(run.group)&&(!scene.museReconciledAt||scene.museReconciledAt<Date.parse(run.updatedAt??''))} disabled={demo} onSkip={()=>skip(run)}/></div></td></tr>;
  })}</tbody></table></div>{!pending.length&&<p>Không có job đang chờ hoặc cần đối soát.</p>}</section>
 </div>;
}
