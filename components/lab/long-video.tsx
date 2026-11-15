"use client";
import {useEffect,useRef,useState} from 'react';
import {type LabRecord} from '@/lib/lab/domain';
import {longVideoDefaults,longVideoScenes} from '@/lib/lab/long-video';
import {desktopBridge} from '@/lib/lab/desktop-client';
import {museVideoBody} from '@/desktop/src/muse-video-prompt.mjs';
import {Button,Modal,api} from './primitives';
import {MuseVideoCommand} from './muse-video-command';
import './long-video.css';

type Run={id:string;state:string;reason:string|null;count:number;completed:{assetId:string;index:number}[];output:{assetId:string;name:string;duration:number}|null;seams:{index:number;differencePercent:number;thresholdPercent:number;withinThreshold:boolean}[]};
export function LongVideoPanel({project,disabled=false,onRecord}:{project:LabRecord;disabled?:boolean;onRecord:(record:LabRecord)=>void}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(()=>project.data.longVideo??longVideoDefaults()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[runs,setRuns]=useState<Run[]>([]);
  const requestId=useRef<string|null>(null),lock=useRef(false);
  const enabled=project.data.longVideo?.enabled===true,active=runs.find(run=>['running','composing'].includes(run.state));
  useEffect(()=>{if(runs.some(run=>run.id===requestId.current&&run.state==='done'))requestId.current=null;},[runs]);
  useEffect(()=>{
    if(!enabled&&!open)return;
    let alive=true;
    const refresh=async()=>{try{const rows=await desktopBridge()?.longVideoStatus?.({projectId:project.id});if(alive&&rows)setRuns(rows);}catch(e){if(alive)setError((e as Error).message);}};
    void refresh();const timer=setInterval(()=>void refresh(),1500);
    return()=>{alive=false;clearInterval(timer);};
  },[project.id,enabled,open]);
  function edit(){setDraft(project.data.longVideo??longVideoDefaults());setError('');setOpen(true);}
  async function save(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(active)throw Error('Dừng chuỗi trước khi sửa cài đặt.');
      if(draft.enabled)longVideoScenes({...project.data,longVideo:draft});
      const result=await api('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:project.id,revision:project.revision,commandId:'lv_settings_'+crypto.randomUUID().replaceAll('-',''),action:'long_video_settings',input:draft})});
      onRecord(result.record);requestId.current=null;setOpen(false);
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  async function start(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const bridge=desktopBridge();if(!bridge?.longVideoStart)throw Error('Mở bản desktop đã cập nhật để chạy Video dài.');
      requestId.current??='lv_'+crypto.randomUUID().replaceAll('-','');
      const run=await bridge.longVideoStart({projectId:project.id,revision:project.revision,requestId:requestId.current});
      setRuns(old=>[...old.filter(r=>r.id!==run.id),run]);
      // A lost reply reuses this ID. Only a confirmed completed run allows a new one.
      if(run.state==='done')requestId.current=null;
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  async function stop(){if(!active)return;try{await desktopBridge()?.longVideoStop({id:active.id});setRuns(await desktopBridge()!.longVideoStatus({projectId:project.id}));}catch(e){setError((e as Error).message);}}
  const scenes=project.data.scenes.filter((s:any)=>s.storyboardApproved&&s.mediaType==='video');
  let count=0;try{count=longVideoScenes(project.data).length;}catch{}
  return <section className="long-video-panel" aria-label="Video dài">
    <Button tone="ghost" disabled={disabled||busy} onClick={edit}>Cài đặt dự án</Button>
    {enabled&&<div className="info-panel"><strong>Video dài · {count} cảnh</strong><p>Chạy tuần tự, khoảng 8–10 giây/cảnh. Đây là chế độ riêng, thời gian chờ tăng theo số cảnh.</p><div className="button-row"><Button tone="neutral" disabled={disabled||busy||!!active||runs.some(r=>r.state==='stopped')} onClick={()=>void start()}>Tạo video dài · {count} lượt</Button>{active&&<Button tone="neutral" onClick={()=>void stop()}>Dừng chuỗi</Button>}</div></div>}
    {error&&!open&&<p role="alert" className="inline-error">{error}</p>}
    {(enabled||open)&&[...runs].reverse().map(run=><article className="production-card" key={run.id}>
      <p role="status">{run.state==='done'?'Đã ghép MP4':run.state==='stopped'?'Chuỗi đã dừng':run.state==='composing'?'Đang ghép MP4':'Đang tạo cảnh'} · {run.completed.length}/{run.count}</p>
      {run.reason&&<p>{run.reason}</p>}
      <div className="button-row">{run.completed.map(clip=><a key={clip.index} href={'/api/assets/'+clip.assetId} download>Cảnh {clip.index+1}</a>)}</div>
      {run.output&&<><video style={{maxWidth:'100%',maxHeight:360}} src={'/api/assets/'+run.output.assetId} controls playsInline preload="metadata"/><p><a href={'/api/assets/'+run.output.assetId} download={run.output.name}>Tải MP4 · {Math.round(run.output.duration)} giây</a></p></>}
      {run.seams.some(s=>!s.withinThreshold)&&<p>Khung nối còn khác biệt; xem lại hình và nhân vật trước khi dùng.</p>}
    </article>)}
    {open&&<Modal open title="Cài đặt dự án" locked={busy} onClose={()=>{if(!busy)setOpen(false);}}>
      <form className="long-video-form" onSubmit={e=>{e.preventDefault();void save();}}>
        <label><input type="checkbox" checked={draft.enabled} disabled={!!active} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/> Video dài</label>
        <p>Mặc định tắt. Mỗi cảnh nên có lời/diễn tả đủ dài (từ 30 từ). Nhân vật có thể đổi nét qua nhiều cảnh.</p>
        {draft.enabled&&<><label className="field">Cách nhập cảnh<select aria-label="Cách nhập cảnh" disabled={!!active} value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value as 'manual'|'project'})}><option value="manual">Viết từng cảnh</option><option value="project">Gói cảnh của dự án</option></select></label>
          <label className="field">Số cảnh<select aria-label="Số cảnh" disabled={!!active} value={draft.mode==='manual'?draft.prompts.length:Math.max(2,draft.sceneIds.length)} onChange={e=>{const count=Number(e.target.value);setDraft({...draft,...(draft.mode==='manual'?{prompts:Array.from({length:count},(_,i)=>draft.prompts[i]??'')}:{sceneIds:Array.from({length:count},(_,i)=>draft.sceneIds[i]??'')})});}}>{[2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
          {draft.mode==='manual'?draft.prompts.map((prompt:string,index:number)=><label className="field" key={index}>Cảnh {index+1}<MuseVideoCommand/><textarea aria-label={'Cảnh '+(index+1)} rows={4} maxLength={7000} value={prompt} disabled={!!active} onChange={e=>setDraft({...draft,prompts:draft.prompts.map((text:string,i:number)=>i===index?museVideoBody(e.target.value):text)})}/><small>{prompt.trim()?prompt.trim().split(/\s+/).length:0} từ · 8 giây</small></label>):Array.from({length:Math.max(2,draft.sceneIds.length)},(_,index)=><div className="field" key={index}><label>Cảnh {index+1}<select aria-label={'Chọn cảnh '+(index+1)} disabled={!!active} value={draft.sceneIds[index]??''} onChange={e=>setDraft({...draft,sceneIds:Array.from({length:Math.max(2,draft.sceneIds.length)},(_,i)=>i===index?e.target.value:draft.sceneIds[i]??'')})}><option value="">Chọn cảnh đã duyệt</option>{scenes.map((scene:any)=><option key={scene.id} value={scene.id}>{scene.name} · {scene.duration}s</option>)}</select></label>{draft.sceneIds[index]&&<p>{museVideoBody(scenes.find((s:any)=>s.id===draft.sceneIds[index])?.prompt??'')}</p>}</div>)}
        </>}
        {error&&<p role="alert" className="inline-error">{error}</p>}
        <div className="button-row"><Button type="submit" busy={busy} disabled={disabled||!!active}>Lưu cài đặt</Button><Button type="button" tone="ghost" disabled={busy} onClick={()=>setOpen(false)}>Đóng</Button></div>
      </form>
    </Modal>}
  </section>;
}
