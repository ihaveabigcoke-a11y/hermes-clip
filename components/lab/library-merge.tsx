"use client";
import {useRef,useState} from 'react';
import type {MediaEntry} from '@/lib/lab/media-catalog';
import {Button,Modal} from './primitives';

export function LibraryMerge({entries,onChange,onClose,onDone}:{entries:MediaEntry[];onChange:(keys:string[])=>void;onClose:()=>void;onDone:(assetId:string)=>void}){
 const [name,setName]=useState('Video ghép'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef({signature:'',id:''}),lock=useRef(false);
 const total=entries.every(e=>e.take.metadata.duration!==null)?entries.reduce((sum,e)=>sum+e.take.metadata.duration!,0):null;
 function move(index:number,offset:number){const keys=entries.map(e=>e.key);[keys[index],keys[index+offset]]=[keys[index+offset],keys[index]];onChange(keys);}
 async function submit(){
  if(lock.current||entries.length<2)return;lock.current=true;setBusy(true);setError('');
  const input={projectId:entries[0].project.id,name,clips:entries.map(e=>({sceneId:e.scene.id,takeId:e.take.id}))},signature=JSON.stringify(input);
  if(signature!==request.current.signature)request.current={signature,id:crypto.randomUUID()};
  try{
   const response=await fetch('/api/library/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,requestId:request.current.id})});
   if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('Ghép video cần bản Hermes trên máy đã cập nhật.');
   const result=await response.json() as {error?:string;assetId?:string};if(!response.ok)throw Error(result.error||'Chưa ghép được video.');
   if(!result.assetId)throw Error('Chưa nhận được file đã lưu. Thử lại với cùng lựa chọn.');
   onDone(result.assetId);
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 return <Modal open title="Ghép" description="Sắp thứ tự các clip và lưu thành một video mới trong cùng dự án." locked={busy} onClose={onClose}>
  <div className="library-merge-form">
   <p><strong>{entries[0]?.project.data.name}</strong> · {entries.length} clip · {total===null?'Chưa rõ thời lượng':`${Number(total.toFixed(2))} giây`}</p>
   <ol className="library-merge-list">{entries.map((e,index)=><li key={e.key}>
    <div><strong>{index+1}. {e.scene.name}</strong><small>{e.take.name} · {e.take.metadata.duration??'—'}s · {e.take.metadata.width}×{e.take.metadata.height}</small></div>
    <div className="button-row"><Button tone="neutral" disabled={busy||index===0} aria-label={`Đưa clip ${index+1} lên`} onClick={()=>move(index,-1)}>↑</Button><Button tone="neutral" disabled={busy||index===entries.length-1} aria-label={`Đưa clip ${index+1} xuống`} onClick={()=>move(index,1)}>↓</Button><Button tone="ghost" disabled={busy} aria-label={`Bỏ clip ${index+1}`} onClick={()=>onChange(entries.filter(item=>item.key!==e.key).map(item=>item.key))}>Bỏ</Button></div>
   </li>)}</ol>
   <label className="field">Tên file<input value={name} maxLength={140} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <p className="field-help">{entries[0]?`Khung clip đầu: ${entries[0].take.metadata.width}×${entries[0].take.metadata.height}. `:''}Clip khác được vừa khung, có viền nếu cần. Giữ tiếng gốc; clip không tiếng được chèn im lặng. Giữ nguyên mọi bản gốc.</p>
   {error&&<p role="alert" className="inline-error">{error}</p>}
   {busy&&<p role="status">Đang ghép và kiểm tra video…</p>}
   <div className="button-row"><Button disabled={busy||entries.length<2||!name.trim()} onClick={()=>void submit()}>Ghép và lưu</Button><Button tone="neutral" disabled={busy} onClick={onClose}>Đóng</Button></div>
  </div>
 </Modal>;
}
