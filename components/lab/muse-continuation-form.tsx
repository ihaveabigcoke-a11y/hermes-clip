"use client";
import {useRef, useState} from 'react';
import type {DesktopJob, DesktopStatus} from '@/lib/lab/desktop-client';
import {continueBlockedReason} from '@/desktop/src/job-continue.mjs';
import {Modal, Button} from './primitives';

export type ContinuePayload = {id:string;requestId:string;profileId:string;description:string;mediaType:'image'|'video';references:{id:string;version:number;type:string;sha256:string;bytes:Uint8Array}[]};

export function MuseContinuationForm({job,status,busy,onClose,onSend}:{job:DesktopJob;status:DesktopStatus|null;busy:boolean;onClose:()=>void;onSend:(payload:ContinuePayload)=>Promise<unknown>}) {
  const [description,setDescription]=useState('');
  const [mediaType,setMediaType]=useState<'image'|'video'>(job.request.mediaType);
  const [files,setFiles]=useState<File[]>([]);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const operation=useRef<{key:string;id:string}|null>(null),lock=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const profile=status?.profiles.find(p=>p.id===job.profileId);
  const blocked=status?.musePaused!==false?'Muse đang tạm dừng.':continueBlockedReason(job,profile,mediaType,status?.jobs);
  async function send() {
    if(lock.current||busy||blocked)return;
    lock.current=true;setSending(true);setError('');
    try {
      const references=await Promise.all(files.map(async(file,index)=>{
        const bytes=new Uint8Array(await file.arrayBuffer());
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        return {id:'reference_'+index,version:1,type:file.type,sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''),bytes};
      }));
      const key=JSON.stringify({description,mediaType,references:references.map(({bytes,...r})=>r)});
      if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
      const result=await onSend({id:job.id,requestId:operation.current.id,profileId:job.profileId!,description,mediaType,references});
      if(!result)throw Error('Chưa xác nhận được lượt gửi tiếp. Giữ nguyên nội dung để kiểm tra lại.');
      onClose();
    } catch(e) {setError((e as Error).message);} finally {lock.current=false;setSending(false);}
  }
  return <Modal open title="Tiếp tục hội thoại này" description={'Việc #'+(job.queueNumber??'—')+' · '+(profile?.name??'Hồ sơ đã xóa')} locked={sending||busy} onClose={onClose}>
    <form onSubmit={e=>{e.preventDefault();void send();}}>
      <div className="modal-body" style={{display:'grid',gap:16}}>
      <label className="field" style={{display:'grid',gap:8}}>Muốn Muse làm tiếp gì?<textarea aria-label="Muốn Muse làm tiếp gì?" value={description} onChange={e=>setDescription(e.target.value)} maxLength={8000} rows={5} required disabled={sending||busy}/></label>
      <fieldset disabled={sending||busy} style={{border:0,padding:0}}><legend>Tạo ra</legend><div className="button-row">{(['image','video'] as const).map(type=><Button key={type} type="button" tone="neutral" aria-pressed={mediaType===type} onClick={()=>setMediaType(type)}>{mediaType===type?'✓ ':''}{type==='image'?'Ảnh':'Video'}</Button>)}</div></fieldset>
      <div className="field" style={{display:'grid',gap:8}}><span>Ảnh tham chiếu (tối đa 4)</span><div><Button type="button" tone="neutral" disabled={sending||busy||files.length>=4} onClick={()=>fileInput.current?.click()}>Chọn ảnh</Button></div><input hidden ref={fileInput} aria-label="Ảnh tham chiếu (tối đa 4)" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={sending||busy} onChange={e=>{
        const next=Array.from(e.target.files??[]);e.target.value='';
        if(files.length+next.length>4){setError('Chọn tối đa 4 ảnh tham chiếu.');return;}
        if(next.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size===0||file.size>8*1024*1024)){setError('Ảnh PNG, JPEG hoặc WebP, tối đa 8 MB mỗi ảnh.');return;}
        setFiles([...files,...next]);setError('');
      }}/></div>
      {files.length>0&&<ul>{files.map((file,index)=><li key={index}>{file.name} <Button type="button" tone="ghost" disabled={sending||busy} onClick={()=>setFiles(files.filter((_,i)=>i!==index))}>Bỏ ảnh {index+1}</Button></li>)}</ul>}
      {(error||blocked)&&<p role="alert" className="inline-error">{error||blocked}</p>}
      </div>
      <footer className="form-actions"><Button type="button" tone="ghost" disabled={sending||busy} onClick={onClose}>Hủy</Button><Button type="submit" disabled={sending||busy||!!blocked||!description.trim()}>{sending?'Đang gửi…':'Gửi tiếp'}</Button></footer>
    </form>
  </Modal>;
}
