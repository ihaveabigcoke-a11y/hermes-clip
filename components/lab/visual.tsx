"use client";
import {useState,type ReactNode} from 'react';
import {Check,Clock3,AlertCircle,Minus,HelpCircle,Package,ChevronDown} from 'lucide-react';
import {visualStatus,visualState,type VisualState} from '@/lib/lab/visual-status';
const icons={check:Check,clock:Clock3,alert:AlertCircle,minus:Minus};
export function StatusMark({state,size=16}:{state?:string|null;size?:number}) {
 const value=visualStatus[visualState(state)],Icon=icons[value.icon];
 return <Icon size={size} aria-hidden="true" style={{color:value.color}}/>;
}
export function StatusLegend(){return <details className="status-legend"><summary><HelpCircle size={16}/><span>Màu trạng thái</span></summary><div>{Object.entries(visualStatus).map(([key,value])=><span key={key}><StatusMark state={key}/>{value.label}</span>)}</div></details>;}
export function Hint({children,label='Giải thích'}:{children:ReactNode;label?:string}) {
 return <details className="visual-hint"><summary aria-label={label}><HelpCircle size={16}/></summary><div className="visual-hint-content">{children}</div></details>;
}
export function ShortText({text,limit=100}:{text?:string|null;limit?:number}) {
 const [open,setOpen]=useState(false),value=text?.trim()||'—';
 if(value.length<=limit)return <span>{value}</span>;
 return <span className="short-text"><span>{open?value:value.slice(0,limit).trimEnd()+'…'}</span><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Thu gọn':'Xem thêm'}</button></span>;
}
export function ProgressRing({value,total=10,label}:{value:number;total?:number;label:string}){
 const progress=Math.min(1,Math.max(0,value/total));
 return <svg className="progress-ring" viewBox="0 0 56 56" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}><circle cx="28" cy="28" r="23" className="ring-track"/><circle cx="28" cy="28" r="23" className="ring-value" pathLength="100" strokeDasharray={`${progress*100} 100`}/><text x="28" y="32" textAnchor="middle">{value}/{total}</text></svg>;
}
export function VisualEmpty({text,action,icon}:{text:string;action?:ReactNode;icon?:ReactNode}){return <div className="visual-empty">{icon??<Package size={56}/>}<p>{text}</p>{action}</div>;}
export function VisualGroup({title,icon,summary,children,open=false}:{title:string;icon:ReactNode;summary?:string;children:ReactNode;open?:boolean}){
 return <details className="visual-group" open={open||undefined}><summary><span className="visual-group-icon">{icon}</span><span><strong>{title}</strong>{summary&&<small>{summary}</small>}</span><ChevronDown size={18}/></summary><div className="visual-group-body">{children}</div></details>;
}
