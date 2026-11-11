"use client";
import {useEffect,useRef,useState} from 'react';
import {Search,RefreshCw} from 'lucide-react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {buildResearchQuery,defaultResearchCriteria,defaultResearchExclusions} from '@/lib/lab/research-view';
import {Button,Badge} from './primitives';
type Run={id:string;batchId:string;state:string;count:number;step:number;error:string;sourceCheckError?:string;createdAt:number};
export default function ResearchLauncher({disabled,onOpen}:{disabled:boolean;onOpen:(id:string)=>void}){
 const [runs,setRuns]=useState<Run[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [criteria,setCriteria]=useState(defaultResearchCriteria),[maximum,setMaximum]=useState('20'),[niche,setNiche]=useState(''),[exclusions,setExclusions]=useState(defaultResearchExclusions);
 const lock=useRef(false),request=useRef<{requestId:string;query:string;maxLandedCostUsd:number}|null>(null);
 let query='',queryError='';
 try {query=buildResearchQuery({criteria,maxLandedCost:maximum,niche,exclusions});} catch (failure) {queryError=(failure as Error).message;}
 useEffect(()=>{let live=true;const refresh=async()=>{try{const api=desktopBridge();if(api?.researchStatus){const value=await api.researchStatus();if(live)setRuns(value.runs);}}catch(e){if(live)setError((e as Error).message);}};
 void refresh();const timer=setInterval(refresh,3000);window.addEventListener('product-lab:workspace-changed',refresh);return()=>{live=false;clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',refresh);};},[]);
 const latest=runs[0],active=runs.some(r=>['queued','running'].includes(r.state));
 async function start(){if(lock.current||queryError)return;lock.current=true;setBusy(true);setError('');
 try{const api=desktopBridge();if(!api?.researchStart)throw Error('Mở Hermes Clip desktop để nghiên cứu bằng hồ sơ Muse.');request.current??={requestId:crypto.randomUUID(),query,maxLandedCostUsd:Number(maximum)};const row=await api.researchStart(request.current);setRuns(old=>[row,...old.filter(r=>r.id!==row.id)]);onOpen(row.batchId);request.current=null;}
 catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function recover(){if(!latest||lock.current)return;lock.current=true;setBusy(true);setError('');try{await desktopBridge()!.researchResume({id:latest.id});}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const states:Record<string,string>={queued:'Chờ nghiên cứu',running:'Đang tìm nguồn và số liệu',done:'Đã có 10 ứng viên',partial:'Chưa đủ 10 ứng viên',needs_attention:'Cần kiểm tra'};
 const fieldsDisabled=disabled||busy||active||!!request.current;
 return <section className="research-launcher" aria-label="Bắt đầu nghiên cứu sản phẩm">
  <div className="research-start-row"><label className="field">Tiêu chí nghiên cứu<textarea rows={3} value={criteria} maxLength={1500} onChange={e=>setCriteria(e.target.value)} disabled={fieldsDisabled}/></label>
   <Button busy={busy} disabled={disabled||busy||active||!!queryError} onClick={start}><Search size={17}/>Bắt đầu nghiên cứu</Button></div>
  <div className="research-structured-fields">
   <label className="field">Giá vốn + ship tối đa (USD)<input type="number" min="0.01" max="1000000000" step="0.01" value={maximum} onChange={e=>setMaximum(e.target.value)} disabled={fieldsDisabled}/></label>
   <label className="field">Ngách hoặc đối tượng<input value={niche} maxLength={180} placeholder="Ví dụ: night runners, pet owners" onChange={e=>setNiche(e.target.value)} disabled={fieldsDisabled}/></label>
   <label className="field">Loại trừ<textarea rows={2} value={exclusions} maxLength={300} onChange={e=>setExclusions(e.target.value)} disabled={fieldsDisabled}/></label>
  </div>
  <p>Nội dung gửi Muse bằng tiếng Anh. Mặc định loại pin lithium lớn, chất lỏng, hàng có thương hiệu và hàng theo đời xe. {query&&`${query.length}/1500 ký tự sau khi ghép.`}</p>
  {queryError&&<p className="inline-error" role="alert">{queryError}</p>}
  {request.current&&error&&<p>Yêu cầu chưa rõ kết quả. Bấm lại để đối soát cùng mã và tiêu chí; không tạo lượt mới.</p>}
  <p>Muse chạy nền, tìm tối đa 10 ứng viên có nguồn cho thị trường Mỹ và tự lưu kết quả. Giữ app mở và máy thức; có thể chuyển sang màn khác. Tối đa 3 lượt mỗi hồ sơ trong một đợt.</p>
  {latest&&<div className="research-run-progress" role="status"><Badge tone={latest.state==='done'?'success':'neutral'}>{states[latest.state]??latest.state}</Badge><span>{latest.count}/10 sản phẩm · {latest.step}/3 lượt hoàn tất</span><progress max={10} value={latest.count} aria-label="Số ứng viên đã lưu"/>
   <Button tone="ghost" onClick={()=>onOpen(latest.batchId)}>Xem kết quả</Button>{['needs_attention','partial'].includes(latest.state)&&<Button tone="neutral" disabled={busy||active} onClick={recover}><RefreshCw size={15}/>Đọc lại kết quả</Button>}</div>}
  {(error||latest?.error)&&<p className="inline-error" role="alert">{error||latest?.error}</p>}
  {latest?.sourceCheckError&&<p className="inline-error">Kết quả Muse đã lưu, chưa xếp được tác vụ kiểm nguồn: {latest.sourceCheckError}. Mở đợt rồi bấm Kiểm lại nguồn.</p>}
 </section>;
}
