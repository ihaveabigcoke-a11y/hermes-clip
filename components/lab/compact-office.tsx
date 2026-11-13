"use client";
import {useEffect,useState} from 'react';
import {Clock3,Loader2,FileInput,ShieldAlert,TriangleAlert,CheckCircle2,RefreshCw,Package} from 'lucide-react';
import type {LabRecord} from '@/lib/lab/domain';
import {buildOfficeView,parseOfficeView,freshness,type OfficeView} from '@/lib/lab/office-view';
import {Button,Modal} from './primitives';
import {ProductThumbnail} from './today';
import {Hint} from './visual';
import './compact-flow.css';
export const compactTime=(value:string|number|null)=>{
 if(value==null)return '—';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return `${parts.hour}:${parts.minute} · ${parts.day}/${parts.month}`;
};
const groups=[{id:'queued',label:'Hàng chờ',icon:Clock3,color:'gray'},{id:'generating',label:'Đang tạo',icon:Loader2,color:'blue'},{id:'manual',label:'Chờ file tay',icon:FileInput,color:'amber'},{id:'attention',label:'Cần đối soát',icon:ShieldAlert,color:'amber'},{id:'failed',label:'Lỗi',icon:TriangleAlert,color:'red'},{id:'library',label:'Đã vào Thư viện',icon:CheckCircle2,color:'green'}];
const groupOf=(g:string)=>['sending','checking'].includes(g)?'generating':['refused','unmapped'].includes(g)?'attention':g==='stopped'?'queued':g;
export default function CompactSignals({records,demo}:{records:LabRecord[];demo:boolean}){
 const [view,setView]=useState<OfficeView|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(''),[filter,setFilter]=useState(''),[tick,setTick]=useState(Date.now()),[retry,setRetry]=useState(0);
 useEffect(()=>{let stopped=false,busy=false;const controller=new AbortController();
  const read=async()=>{if(busy||stopped)return;busy=true;try{const next=demo?buildOfficeView(records,[],{},[],Date.now()):await (async()=>{const r=await fetch('/api/lab?view=office',{signal:controller.signal,credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Mất kết nối');return parseOfficeView((await r.json() as {view:unknown}).view);})();if(!stopped){setView(next);setError('');setTick(Date.now());}}catch{if(!stopped)setError('Mất kết nối');}finally{busy=false;}};
  void read();const timer=setInterval(()=>{setTick(Date.now());void read();},5000);window.addEventListener('product-lab:workspace-changed',read);return()=>{stopped=true;controller.abort();clearInterval(timer);window.removeEventListener('product-lab:workspace-changed',read);};
 },[records,demo,retry]);
 const runs=(view?.runs??[]).filter(r=>!filter||groupOf(r.group)===filter).slice().sort((a,b)=>Number(!!b.needsAction)-Number(!!a.needsAction)||Date.parse(b.updatedAt??'')-Date.parse(a.updatedAt??''));
 const current=view?.runs.find(r=>r.id===selected);
 const name=(id:string|null)=>records.find(r=>r.id===id)?.data.name??'Chưa gắn sản phẩm';
 const state=error||(demo?'Dữ liệu mô phỏng':view&&freshness(tick,view.generatedAt)==='stale'?'Dữ liệu cũ':'');
 const target=(r:OfficeView['runs'][number])=>'?'+new URLSearchParams({view:r.group==='attention'?'queue':'production',...(r.productionId?{production:r.productionId}:{}),...(r.sceneId?{desk_scene:r.sceneId}:{}),stage:'scenes'});
 return <section className="compact-flow" data-screen="signals"><header className="compact-heading"><h1>Tín hiệu & Phòng chờ</h1><Hint>Chọn trạng thái để lọc. Bấm thẻ để xem lịch sử và xử lý ở cảnh tương ứng.</Hint><Button onClick={()=>setRetry(n=>n+1)} aria-label="Làm mới"><RefreshCw size={18}/></Button></header>
 {state&&<p role="status" className="compact-warning">{state}</p>}
 <div className="compact-groups">{groups.map(g=><button key={g.id} className={'tone-'+g.color} aria-pressed={filter===g.id} onClick={()=>setFilter(filter===g.id?'':g.id)}><g.icon size={24}/><strong data-content-value>{view?.runs.filter(r=>groupOf(r.group)===g.id).length??'—'}</strong><span>{g.label}</span></button>)}</div>
 <div className="compact-cards">{runs.map(r=>{const product=records.find(p=>p.id===r.productId),g=groups.find(g=>g.id===groupOf(r.group))??groups[3];return <article key={r.id} data-run-id={r.id} data-group={r.group} className={'compact-card tone-'+g.color}><button className="compact-card-open" onClick={()=>setSelected(r.id)} aria-label={'Chi tiết '+name(r.productId)}><div className={'compact-picture '+(!r.outputs.assetId?'pending-picture':'')}>{r.outputs.assetId?<img src={'/api/assets/'+r.outputs.assetId+'?thumbnail=1'} alt="Khung đầu clip"/>:product?<ProductThumbnail product={product} records={records}/>:<Package size={52}/>}</div><h2>{name(r.productId)}</h2><span className="compact-status"><g.icon size={15}/>{g.label}</span><time dateTime={r.updatedAt??undefined}>{compactTime(r.lastEvent.at)}</time></button>{r.needsAction&&<a className="lab-button neutral" href={target(r)}>{r.group==='failed'?'Thử lại':r.group==='refused'||r.group==='manual'?'Chuyển sang đường tay':'Đối soát'}</a>}</article>;})}</div>
 {!runs.length&&<div className="compact-empty"><Package size={60}/><span>Chờ lượt</span></div>}
 <Modal open={!!current} title={current?name(current.productId):'Lượt chạy'} onClose={()=>setSelected('')}><div className="modal-body">{current&&<><p>{current.provider??'—'} · {compactTime(current.updatedAt)}</p>{current.needsAction&&<p role="status">{current.needsAction.reason}</p>}<ol className="office-timeline">{current.history.map((h:{at:string|null;note:string},i:number)=><li key={i}><time>{compactTime(h.at)}</time><strong>{h.note}</strong></li>)}</ol><a className="lab-button neutral" href={target(current)}>Mở cảnh</a></>}</div></Modal></section>;
}
