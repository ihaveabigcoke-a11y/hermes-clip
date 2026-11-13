"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Search,RefreshCw} from 'lucide-react';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {buildResearchQuery,defaultResearchCriteria,defaultResearchExclusions} from '@/lib/lab/research-view';
import {resolveProvider, textProviderReceipts, type ProviderReceipt} from '@/desktop/src/provider-routing.mjs';
import {Button,Badge} from './primitives';
type Run={id:string;batchId:string;state:string;count:number;step:number;error:string;sourceCheckError?:string;createdAt:number;reconciled?:boolean};
type UncertainChat={requestId:string;projectId:string;state:string;reconciled?:boolean};
export default function ResearchLauncher({disabled,onOpen,actions,scope}:{disabled:boolean;scope?:string;onOpen:(id:string)=>void;actions?:(context:Record<string,unknown>,invalid:boolean,onMuse:()=>Promise<void>,previous:ProviderReceipt[])=>ReactNode}){
 const {status:workerStatus}=useDesktopStatus();
 const musePaused=workerStatus?.musePaused!==false;
 const museReady=resolveProvider({kind:'research',status:workerStatus}).ready;
 const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [chats,setChats]=useState<UncertainChat[]>([]);
 const [criteria,setCriteria]=useState(defaultResearchCriteria),[maximum,setMaximum]=useState('20'),[niche,setNiche]=useState(''),[exclusions,setExclusions]=useState(defaultResearchExclusions);
 const lock=useRef(false),request=useRef<{requestId:string;query:string;maxLandedCostUsd:number}|null>(null);
 let query='',queryError='';
 try {query=buildResearchQuery({criteria,maxLandedCost:maximum,niche,exclusions});} catch (failure) {queryError=(failure as Error).message;}
 useEffect(()=>{let live=true;const refresh=async()=>{try{const api=desktopBridge();if(api?.researchStatus){const [value,history]=await Promise.all([api.researchStatus(),api.museChatList?.({})]);if(live){setRuns(value.runs);setChats(history??[]);}}}catch(e){if(live)setError((e as Error).message);}};
 void refresh();const timer=setInterval(refresh,3000);window.addEventListener('product-lab:workspace-changed',refresh);return()=>{live=false;clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};},[]);
 useEffect(()=>{if(request.current&&runs.some(run=>run.id===request.current?.requestId))request.current=null;},[runs]);
 const latest=runs[0],active=runs.some(r=>['queued','running'].includes(r.state));
 async function start(){if(lock.current||queryError)return;lock.current=true;setBusy(true);setError('');
 try{const api=desktopBridge();if(!api?.researchStart)throw Error('Mở Hermes Clip desktop để nghiên cứu bằng hồ sơ Muse.');request.current??={requestId:crypto.randomUUID(),query,maxLandedCostUsd:Number(maximum)};const row=await api.researchStart(request.current);setRuns(old=>[row,...old.filter(r=>r.id!==row.id)]);onOpen(row.batchId);request.current=null;}
 catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function recover(){if(!latest||lock.current)return;lock.current=true;setBusy(true);setError('');try{await desktopBridge()!.researchResume({id:latest.id});}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function skip(kind:'run'|'chat',id:string){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const api=desktopBridge()!;
   if(kind==='run')await api.researchSkipReconciliation({id});else await api.museChatSkipReconciliation({requestId:id});
   const [value,history]=await Promise.all([api.researchStatus(),api.museChatList({})]);setRuns(value.runs);setChats(history);
   window.dispatchEvent(new Event('product-lab:workspace-changed'));
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 const uncertainRuns=runs.filter(row=>!row.reconciled&&['unknown','needs_attention'].includes(row.state));
 const uncertainChats=chats.filter(row=>!row.reconciled&&['unknown','needs_attention'].includes(row.state));
 const states:Record<string,string>={queued:'Chờ nghiên cứu',running:'Đang tìm nguồn và số liệu',done:'Đã có 10 ứng viên',partial:'Chưa đủ 10 ứng viên',needs_attention:'Cần đối soát',unknown:'Cần đối soát'};
 const latestError=latest?.reconciled?'':latest?.error;
 const fieldsDisabled=disabled||busy||active||!!request.current;
 return <section className="research-launcher" aria-label="Bắt đầu nghiên cứu sản phẩm">
  <div className="research-start-row"><label className="field">Tiêu chí nghiên cứu<textarea rows={3} value={criteria} maxLength={1500} onChange={e=>setCriteria(e.target.value)} disabled={fieldsDisabled}/></label>
   {!actions&&<Button busy={busy} disabled={!museReady||disabled||busy||active||!!queryError} onClick={start}><Search size={17}/>{musePaused?'Muse đang tạm dừng':'Bắt đầu nghiên cứu'}</Button>}</div>
  <div className="research-structured-fields">
   <label className="field">Giá vốn + ship tối đa (USD)<input type="number" min="0.01" max="1000000000" step="0.01" value={maximum} onChange={e=>setMaximum(e.target.value)} disabled={fieldsDisabled}/></label>
   <label className="field">Ngách hoặc đối tượng<input value={niche} maxLength={180} placeholder="Ví dụ: night runners, pet owners" onChange={e=>setNiche(e.target.value)} disabled={fieldsDisabled}/></label>
   <label className="field">Loại trừ<textarea rows={2} value={exclusions} maxLength={300} onChange={e=>setExclusions(e.target.value)} disabled={fieldsDisabled}/></label>
  </div>
  {actions?.({query, maxLandedCostUsd:Number(maximum), market:'United States', locale:'en-US'},!!queryError||busy||active||!!request.current,start,textProviderReceipts({kind:'research',scope,runs}))}
  <p>Prompt bằng tiếng Anh. Mặc định loại pin lithium lớn, chất lỏng, hàng có thương hiệu và hàng theo đời xe. {query&&`${query.length}/1500 ký tự sau khi ghép.`}</p>
  {queryError&&<p className="inline-error" role="alert">{queryError}</p>}
  {request.current&&error&&<div><p>Yêu cầu chưa rõ kết quả. Đối soát cùng mã và tiêu chí đã lưu.</p><Button tone="neutral" disabled={!museReady||disabled||busy||active} onClick={()=>void start()}>Đối soát cùng mã yêu cầu</Button></div>}
  {musePaused&&<p className="field-help">Muse đang tạm dừng, bật lại ở Tài khoản Muse</p>}
  <p>Muse chạy nền, tìm tối đa 10 ứng viên có nguồn cho thị trường Mỹ và tự lưu kết quả. Giữ app mở và máy thức; có thể chuyển sang màn khác. Hermes không giới hạn số lượt theo hồ sơ.</p>
  {latest&&<div className="research-run-progress" role="status"><Badge tone={latest.state==='done'?'success':'neutral'}>{latest.reconciled?'Đã bỏ qua':states[latest.state]??latest.state}</Badge><span>{latest.count}/10 sản phẩm · {latest.step} lượt hoàn tất</span><progress max={10} value={latest.count} aria-label="Số ứng viên đã lưu"/>
   <Button tone="ghost" onClick={()=>onOpen(latest.batchId)}>Xem kết quả</Button>{!latest.reconciled&&['needs_attention','partial'].includes(latest.state)&&<Button tone="neutral" disabled={musePaused||busy||active} onClick={recover}><RefreshCw size={15}/>Đọc lại kết quả</Button>}{latest.reconciled&&<span>Đã bỏ qua đối soát · Không gửi lại</span>}</div>}
  {(uncertainRuns.length>0||uncertainChats.length>0)&&<section aria-label="Kết quả Muse cần đối soát">
   <p>Kết quả Muse cũ chưa rõ; app sẽ không gửi lại</p>
   {uncertainRuns.map(row=><div className="button-row" key={row.id}><span>Đợt {row.batchId} · Cần đối soát</span><Button tone="ghost" onClick={()=>onOpen(row.batchId)}>Xem đợt</Button><Button tone="neutral" disabled={disabled||busy||active} onClick={()=>skip('run',row.id)}>Bỏ qua, không đối soát</Button></div>)}
   {uncertainChats.map(row=><div className="button-row" key={row.requestId}><span>Chat {row.requestId} · {row.projectId} · Cần đối soát</span><Button tone="neutral" disabled={disabled||busy||active} onClick={()=>skip('chat',row.requestId)}>Bỏ qua, không đối soát</Button></div>)}
  </section>}
  {(error||latestError)&&<p className="inline-error" role="alert">{error||latestError}</p>}
  {latest?.sourceCheckError&&<p className="inline-error">Kết quả Muse đã lưu, chưa xếp được tác vụ kiểm nguồn: {latest.sourceCheckError}. Mở đợt rồi bấm Kiểm lại nguồn.</p>}
 </section>;
}
