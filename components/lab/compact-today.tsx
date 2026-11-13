"use client";
import {useMemo,useState,useEffect} from 'react';
import {ArrowRight,ArrowUp,ArrowDown,Package,Search} from 'lucide-react';
import type {LabRecord} from '@/lib/lab/domain';
import {vietnamDay} from '@/lib/lab/domain';
import {selectionEntries} from '@/lib/lab/daily-selection';
import {buildOfficeView} from '@/lib/lab/office-view';
import {ProductThumbnail} from './today';
import {Button} from './primitives';
import {Hint} from './visual';
import './compact-flow.css';
export function compactProductStage(product:LabRecord,records:LabRecord[]){
 const projects=records.filter(r=>r.kind==='production'&&r.data.productId===product.id);
 const project=projects.slice().sort((a,b)=>b.updatedAt-a.updatedAt)[0];
 const clips=projects.some(p=>p.data.scenes?.some((s:any)=>s.takes?.some((t:any)=>t.type==='video/mp4')));
 const renders=buildOfficeView(records,[],{},[],Date.now()).exports.some(e=>e.productId===product.id&&e.verified);
 const published=records.some(r=>r.kind==='content_plan'&&r.data.productId===product.id&&r.data.status?.startsWith('published')&&r.data.postUrl);
 const stage=published?5:renders?4:clips?3:project?.data.scenes?.length?2:1;
 return {stage,href:'?'+new URLSearchParams({view:stage>=5?'results':stage>=4?'social':'production',product:product.id,...(project?{production:project.id}:{}),...(stage===4?{ops_id:product.id}:{})})};
}
export default function CompactToday({records,onNavigate}:{records:LabRecord[];onNavigate:(href:string)=>void}){
 const day=vietnamDay(),key='hermes-today-order:'+day;
 const [order,setOrder]=useState<string[]>([]),[dragged,setDragged]=useState('');
 useEffect(()=>{try{const value=JSON.parse(localStorage.getItem(key)??'[]');if(Array.isArray(value)&&value.every(x=>typeof x==='string'))setOrder(value);}catch{}},[key]);
 const products=records.filter(r=>r.kind==='product'&&!r.data.archived);
 const selected=selectionEntries(records).filter(s=>s.selectionDay===day).map(s=>s.productId);
 const today=products.filter(p=>selected.includes(p.id)).sort((a,b)=>{const rank=(id:string)=>order.includes(id)?order.indexOf(id):selected.indexOf(id)+3;return rank(a.id)-rank(b.id);}).slice(0,3);
 const earlier=products.filter(p=>!selected.includes(p.id)&&!['done','dropped'].includes(p.data.stage??''));
 const move=(from:string,to:string)=>{if(from===to)return;const next=today.map(p=>p.id),i=next.indexOf(from),j=next.indexOf(to);if(i<0||j<0)return;next.splice(i,1);next.splice(j,0,from);setOrder(next);localStorage.setItem(key,JSON.stringify(next));};
 const card=(p:LabRecord,i:number,reorder:boolean)=>{const next=compactProductStage(p,records);return <article className="compact-card" key={p.id} data-today-product={p.id} draggable={reorder} onDragStart={()=>setDragged(p.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>{move(dragged,p.id);setDragged('');}}><div className="compact-picture"><ProductThumbnail product={p} records={records}/></div><h2>{p.data.name}</h2><ol className="compact-progress" aria-label={'Tiến độ '+p.data.name}>{['Chốt','Khung','Clip','MP4','Đăng'].map((s,n)=><li key={s} data-done={n<next.stage}><span/>{s}</li>)}</ol><div className="compact-card-actions"><Button tone="neutral" onClick={()=>onNavigate(next.href)}>Làm tiếp<ArrowRight size={15}/></Button>{reorder&&<span className="compact-reorder"><button aria-label={'Đưa '+p.data.name+' lên'} disabled={i===0} onClick={()=>move(p.id,today[i-1].id)}><ArrowUp size={14}/></button><button aria-label={'Đưa '+p.data.name+' xuống'} disabled={i===today.length-1} onClick={()=>move(p.id,today[i+1].id)}><ArrowDown size={14}/></button></span>}</div></article>;};
 return <section className="compact-flow" data-screen="today"><header className="compact-heading"><h1>Hôm nay</h1><Hint>Kéo thẻ để đổi thứ tự; dùng phím qua nút lên/xuống. Thứ tự được giữ trên máy này.</Hint><Button onClick={()=>onNavigate('?view=research')}><Search size={17}/>Chọn sản phẩm</Button></header><div className="compact-cards">{today.map((p,i)=>card(p,i,true))}</div>{!today.length&&<div className="compact-empty"><Package size={60}/><span>Chưa chọn hôm nay</span></div>}{earlier.length>0&&<><h2 className="compact-subheading">Đang làm dở</h2><div className="compact-cards">{earlier.map((p,i)=>card(p,i,false))}</div></>}</section>;
}
