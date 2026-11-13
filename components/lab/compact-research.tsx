"use client";
import {useState,type ReactNode} from 'react';
import {Search,Check,Package,Scale} from 'lucide-react';
import type {LabRecord} from '@/lib/lab/domain';
import {formatMoney} from '@/lib/lab/domain';
import {landedCost,candidateCurrency,type Candidate} from '@/lib/lab/operations';
import {planDailySelection,selectionEntries,candidateProductId} from '@/lib/lab/daily-selection';
import {Button,Modal,api} from './primitives';
import {Hint} from './visual';
import './compact-flow.css';
export default function CompactResearch({records,demo,onRecords,onNavigate,details}:{records:LabRecord[];demo:boolean;onRecords:(rows:LabRecord[])=>void;onNavigate:(url:string)=>void;details:ReactNode}){
 const batches=records.filter(r=>r.kind==='research_batch').sort((a,b)=>b.updatedAt-a.updatedAt);
 const [batchId,setBatchId]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const batch=batches.find(b=>b.id===batchId)??batches[0],candidates=(batch?.data.candidates??[]) as Candidate[];
 const selected=selectionEntries(records);
 async function choose(c:Candidate){if(busy||!batch)return;setBusy(c.id);setError('');try{const input={batchId:batch.id,candidateId:c.id,revision:batch.revision,checked:true,autoIdentity:true};const rows=demo?planDailySelection(records,input):(await api('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'select_daily',input})})).records;onRecords(rows);onNavigate('?view=overview');}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 return <section className="compact-flow" data-screen="research"><header className="compact-heading"><h1>Săn sản phẩm</h1><Hint>Giá phải có nguồn và kỳ đo. Ô chưa biết giữ —. Chốt tự đặt mã và thứ tự, có thể chỉnh sau.</Hint><Button onClick={()=>setOpen(true)}><Search size={17}/>Săn sản phẩm</Button></header>{error&&<p className="inline-error" role="alert">{error}</p>}
 <div className="compact-toolbar"><select aria-label="Đợt nghiên cứu" value={batch?.id??''} onChange={e=>setBatchId(e.target.value)}>{!batches.length&&<option value="">Chưa có đợt</option>}{batches.map(b=><option value={b.id} key={b.id}>{b.data.name}</option>)}</select><Button tone="neutral" onClick={()=>setOpen(true)}><Scale size={16}/>So sánh</Button></div>
 <div className="compact-cards">{candidates.map(c=>{const cost=landedCost(c),choice=selected.some(s=>s.productId===candidateProductId(batch,c.id)),label={try:'Đáng thử',hold:'Cân nhắc',reject:'Bỏ'}[c.verdict??'hold'];return <article className={'compact-card tone-'+(c.verdict==='try'?'green':c.verdict==='reject'?'red':'amber')} key={c.id} data-candidate={c.id}><div className="compact-picture">{c.imageUrl?<img src={c.imageUrl} alt={c.name} loading="lazy" referrerPolicy="no-referrer"/>:<Package size={52}/>}</div><h2>{c.name}</h2><div className="compact-prices"><span title="Giá vốn + ship">{cost.amount==null?'—':formatMoney(cost.amount,cost.currency)}</span><span aria-hidden="true">→</span><span title="Giá bán gợi ý">{c.price==null?'—':formatMoney(c.price,candidateCurrency(c,'price'))}</span></div><div className="compact-card-actions"><span className="compact-status">{label}</span><Button tone="neutral" disabled={!!busy} onClick={()=>void choose(c)}><Check size={14}/>{choice?'Đã chốt':'Chốt'}</Button></div></article>;})}</div>{!candidates.length&&<div className="compact-empty"><Search size={60}/><span>Chưa có ứng viên</span></div>}
 <Modal open={open} title="Nguồn & so sánh" onClose={()=>setOpen(false)}><div className="modal-body compact-advanced">{details}</div></Modal></section>;
}
