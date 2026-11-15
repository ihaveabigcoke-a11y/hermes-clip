"use client";
import {useEffect,useState,useRef} from 'react';
import {Plus,Pencil,Trash2,X,Images} from 'lucide-react';
import {Button,Modal,Empty,api} from './primitives';
import {characterKey,characterMentions,characterSelection} from '@/desktop/src/characters.mjs';
import './characters.css';

type Character={id:string;name:string;kind:string;notes:string;assetIds:string[];revision:number};
const kinds=[['product','Sản phẩm'],['mascot','Linh vật'],['illustration','Hoạt hình / minh hoạ']];
const blank=()=>({name:'',kind:'mascot',notes:'',assetIds:[] as string[]});
function useCharacters(enabled=true){
  const [rows,setRows]=useState<Character[]>([]),[error,setError]=useState('');
  useEffect(()=>{if(!enabled)return;let alive=true;const read=()=>{void api('/api/characters').then(r=>{if(alive){setRows(r.characters);setError('');}}).catch(()=>{if(alive)setError('Chưa đọc được thư viện nhân vật.');});};read();window.addEventListener('hermes-characters-changed',read);return()=>{alive=false;window.removeEventListener('hermes-characters-changed',read);};},[enabled]);
  return {rows,error};
}
export function CharacterPromptOptions({prompt,enabled,onChange,referenceCount=0,demo=false}:{prompt:string;enabled:boolean;onChange:(value:boolean)=>void;referenceCount?:number;demo?:boolean}){
  const names=characterMentions(prompt),{rows,error}=useCharacters(!demo&&(enabled||names.length>0));
  let warning=enabled?error:'';
  if(enabled&&!warning)try{characterSelection(prompt,true,rows,referenceCount);}catch(e){warning=(e as Error).message;}
  return <div className="character-prompt"><label className="character-switch"><input type="checkbox" checked={enabled} onChange={e=>onChange(e.target.checked)}/>Giữ nguyên nhân vật</label>
    {!!names.length&&<div className="character-chips" aria-label="Nhân vật trong prompt">{names.map((name:string)=>{const row=rows.find(row=>characterKey(row.name)===characterKey(name));return <span key={name} data-missing={!row||undefined}>{row&&<img src={'/api/assets/'+row.assetIds[0]} alt=""/>}@{row?.name??name}{enabled&&row&&<small>{row.assetIds.length} ảnh</small>}</span>;})}</div>}
    {warning&&<small role="alert" className="inline-error">{warning}</small>}
  </div>;
}
export default function Characters({demo=false}:{demo?:boolean}){
  const {rows,error:loadError}=useCharacters(!demo),[editing,setEditing]=useState<Character|null>(null),[open,setOpen]=useState(false),[draft,setDraft]=useState(blank),[deleting,setDeleting]=useState<Character|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  const changed=()=>window.dispatchEvent(new Event('hermes-characters-changed'));
  function edit(row?:Character){setEditing(row??null);setDraft(row?{name:row.name,kind:row.kind,notes:row.notes,assetIds:[...row.assetIds]}:blank());setError('');setOpen(true);}
  async function upload(files:File[]){
    if(!files.length||lock.current)return;
    if(files.length+draft.assetIds.length>3){setError('Mỗi nhân vật có từ 1 đến 3 ảnh.');return;}
    if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||!f.size||f.size>8*1024*1024)){setError('Chọn PNG, JPG hoặc WebP, tối đa 8 MB mỗi ảnh.');return;}
    lock.current=true;setBusy(true);setError('');
    try{for(const file of files){const body=new FormData();body.append('file',file);const result=await api('/api/assets',{method:'POST',body});setDraft(d=>({...d,assetIds:[...new Set([...d.assetIds,result.id])]}));}}
    catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  async function save(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await api('/api/characters',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,...(editing?{id:editing.id,revision:editing.revision}:{})})});changed();setOpen(false);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
  async function remove(){if(!deleting||lock.current)return;lock.current=true;setBusy(true);setError('');try{await api('/api/characters',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:deleting.id,revision:deleting.revision})});changed();setDeleting(null);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
  return <section className="characters-page"><header className="production-heading"><div><h2>Nhân vật</h2><p>Sản phẩm, linh vật và nhân vật minh hoạ.</p></div><Button disabled={demo} onClick={()=>edit()}><Plus size={16}/>Thêm nhân vật</Button></header>
    {(loadError||demo)&&<p role="status">{demo?'Mở dữ liệu của bạn để quản lý nhân vật.':loadError}</p>}
    {rows.length?<div className="character-grid">{rows.map(row=><article className="character-card" key={row.id}><div className="character-cover"><img src={'/api/assets/'+row.assetIds[0]} alt={'Ảnh của '+row.name}/></div><div className="character-card-body"><h3>@{row.name}</h3><small>{kinds.find(([key])=>key===row.kind)?.[1]}</small>{row.notes&&<p>{row.notes}</p>}<div className="character-thumbnails">{row.assetIds.map((id,i)=><img key={id} src={'/api/assets/'+id} alt={`${row.name} · ảnh ${i+1}`}/>)}</div><div className="character-actions"><Button tone="neutral" onClick={()=>edit(row)} aria-label={'Sửa '+row.name}><Pencil size={15}/>Sửa</Button><Button tone="ghost" onClick={()=>{setError('');setDeleting(row);}} aria-label={'Xoá '+row.name}><Trash2 size={15}/>Xoá</Button></div></div></article>)}</div>:!loadError&&<Empty title="Chưa có nhân vật" text="Thêm ảnh để dùng @tên trong prompt."/>}
    <Modal open={open} onClose={()=>setOpen(false)} locked={busy} title={editing?'Sửa nhân vật':'Thêm nhân vật'} description="Không dùng ảnh người thật">
      <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="modal-body character-form">
        <label>Tên<input aria-label="Tên" required maxLength={40} value={draft.name} placeholder="Bông" onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/><small>Dùng dấu gạch dưới thay khoảng trắng.</small></label>
        <label>Loại<select aria-label="Loại" value={draft.kind} onChange={e=>setDraft(d=>({...d,kind:e.target.value}))}>{kinds.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
        <label>Ghi chú (tuỳ chọn)<textarea aria-label="Ghi chú (tuỳ chọn)" maxLength={2000} rows={3} value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></label>
        <label><span className="character-image-label"><Images size={16} aria-hidden="true"/>Ảnh (1–3)</span><span className="lab-button neutral">Chọn ảnh</span><input className="sr-only" aria-label="Thêm ảnh nhân vật" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={draft.assetIds.length>=3||busy} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void upload(files);}}/></label>
        <div className="character-edit-images">{draft.assetIds.map((id,i)=><div key={id}><img src={'/api/assets/'+id} alt={'Ảnh nhân vật '+(i+1)}/><Button type="button" tone="ghost" aria-label={'Bỏ ảnh '+(i+1)} onClick={()=>setDraft(d=>({...d,assetIds:d.assetIds.filter(x=>x!==id)}))}><X size={16}/></Button></div>)}</div>
        {error&&<p role="alert" className="inline-error">{error}</p>}
      </fieldset><footer className="form-actions"><Button type="button" tone="neutral" disabled={busy} onClick={()=>setOpen(false)}>Huỷ</Button><Button type="submit" busy={busy} disabled={!draft.assetIds.length}>Lưu nhân vật</Button></footer></form>
    </Modal>
    <Modal open={!!deleting} onClose={()=>setDeleting(null)} locked={busy} title={'Xoá @'+(deleting?.name??'')} description="Nhân vật sẽ không còn dùng được bằng @tên. Ảnh và các lượt đã gửi vẫn được giữ."><div className="modal-body">{error&&<p role="alert" className="inline-error">{error}</p>}</div><footer className="form-actions"><Button tone="neutral" disabled={busy} onClick={()=>setDeleting(null)}>Huỷ</Button><Button busy={busy} onClick={()=>void remove()}>Xoá nhân vật</Button></footer></Modal>
  </section>;
}
