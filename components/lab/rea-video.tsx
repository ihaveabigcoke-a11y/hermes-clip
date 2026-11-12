"use client";
import {useEffect,useState} from 'react';
import {desktopBridge} from '@/lib/lab/desktop-client';
import type {ReaVideo} from '@/lib/lab/rea-video';
import {Button} from './primitives';
import {referenceVideoDraftSchema} from '@/lib/lab/viral-reference';
export type ReaOverlaySelection={id:string;projectId:string;copies:{id:string;text:string}[]};
export function ReaOverlayPicker({records,disabled,onChange}:{records:{kind:string;data:unknown}[];disabled:boolean;onChange:(v:ReaOverlaySelection|null)=>void}){
  const [selected,setSelected]=useState(''),[copies,setCopies]=useState<Record<string,string>>({});
  const refs=records.filter(r=>r.kind==='reference_video_draft').flatMap(r=>{const p=referenceVideoDraftSchema.safeParse(r.data);return p.success&&p.data.reaVideo&&p.data.integrationJobId&&p.data.projectId?[p.data]:[];});
  const current=refs.find(r=>r.id===selected);
  const publish=(id:string,values:Record<string,string>)=>{const row=refs.find(r=>r.id===id);onChange(row?{id:row.integrationJobId!,projectId:row.projectId!,copies:row.reaVideo!.overlays.map(o=>({id:o.id,text:values[o.id]??''}))}:null);};
  return <details><summary>Chữ đè theo video mẫu</summary><p>Chọn mẫu đã lưu và điền chữ sản phẩm. FFmpeg giữ kiểu, vị trí và mốc của mẫu; timeline ghép cần cùng thời lượng mẫu. OpenMontage chưa hỗ trợ lựa chọn này.</p>
    <label className="field">Mẫu chữ đè<select value={selected} disabled={disabled} onChange={e=>{setSelected(e.target.value);setCopies({});publish(e.target.value,{});}}><option value="">Không dùng mẫu chữ đè</option>{refs.map(r=><option key={r.id} value={r.id}>{r.product} · {r.reaVideo!.durationSec} s</option>)}</select></label>
    {current?.reaVideo!.overlays.map(o=><label className="field" key={o.id}>Thay “{o.text}”<input maxLength={120} disabled={disabled} value={copies[o.id]??''} onChange={e=>{const next={...copies,[o.id]:e.target.value};setCopies(next);publish(selected,next);}}/></label>)}
  </details>;
}
export function ReaVideoSettings({demo}:{demo:boolean}){
  const [value,setValue]=useState<any>({reader:'codex',model:'gemini-2.5-flash',python:'',checkout:'',geminiConfirmed:false});
  const [key,setKey]=useState(''),[clearKey,setClearKey]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const bridge=desktopBridge();
  useEffect(()=>{if(!demo&&bridge?.reaVideoSettings)void bridge.reaVideoSettings().then(setValue).catch(()=>setMessage('Chưa đọc được cấu hình rea-video.'));},[demo,bridge]);
  const change=(k:string,v:unknown)=>setValue((s:any)=>({...s,[k]:v}));
  async function run(check=false){setBusy(true);setMessage('');try{if(check){change('health',await bridge!.checkReaVideo());}else{
    setValue(await bridge!.saveReaVideoSettings({reader:value.reader,model:value.model,python:value.python,checkout:value.checkout,geminiConfirmed:value.geminiConfirmed,key,clearKey}));setKey('');setClearKey(false);setMessage('Đã lưu cách đọc ảnh video mẫu.');
  }}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  return <section className="production-card production-card-body" aria-label="Cài đặt đọc ảnh video mẫu"><h3>Đọc ảnh video mẫu</h3>
    <p>rea-video tách shot, chữ đè và âm thanh trên máy. Lần đầu có thể cần tải model tách âm thanh khoảng 220 MB. Kết quả và video gốc được giữ.</p>
    <label className="field">Đọc ảnh video mẫu bằng<select value={value.reader} disabled={busy||demo} onChange={e=>change('reader',e.target.value)}><option value="codex">Codex CLI</option><option value="gemini-api">Gemini API</option><option value="manual">Nhập tay</option></select></label>
    <p>Codex CLI mặc định tự đọc toàn bộ ảnh shot, dùng cấu hình CLI của bạn. Không đọc được ảnh sẽ chuyển sang Nhập tay.</p>
    <label className="field">Python của rea-video<input value={value.python} disabled={busy||demo} onChange={e=>change('python',e.target.value)}/></label>
    <label className="field">Checkout rea-video đã ghim<input value={value.checkout} disabled={busy||demo} onChange={e=>change('checkout',e.target.value)}/></label>
    <details><summary>Hướng dẫn cài rea-video</summary><p>Đóng app, chạy <code>desktop/SETUP-INTEGRATIONS.ps1</code>. Chọn Python trong <code>.rea-venv/Scripts/python.exe</code> và checkout <code>rea-video</code>. Cần Python 3.10–3.14, FFmpeg và ffprobe.</p></details>
    {value.reader==='gemini-api'&&<><p>Key lấy ở Google AI Studio. Gói Gemini Pro trên web không phải API key. Khóa được lưu bằng kho mã hóa Windows.</p>
      <label className="field">Model Gemini API<input value={value.model} placeholder="gemini-2.5-flash" disabled={busy||demo} onChange={e=>change('model',e.target.value)}/></label>
      <label className="field">Khóa API Gemini<input type="password" autoComplete="off" value={key} disabled={busy||demo} placeholder={value.hasKey?'Để trống để giữ khóa đã lưu':''} onChange={e=>setKey(e.target.value)}/></label>
      <label><input type="checkbox" checked={clearKey} disabled={busy||demo} onChange={e=>setClearKey(e.target.checked)}/> Xóa khóa đã lưu</label>
      <label><input type="checkbox" checked={value.geminiConfirmed} disabled={busy||demo} onChange={e=>change('geminiConfirmed',e.target.checked)}/> Gemini API có hạn mức miễn phí và có thể tính phí khi vượt; kiểm tại AI Studio. Tôi xác nhận bật đường này.</label>
    </>}
    <Button disabled={demo||busy||!bridge?.saveReaVideoSettings} onClick={()=>void run()}>Lưu cách đọc ảnh</Button>
    <Button tone="neutral" disabled={demo||busy||!bridge?.checkReaVideo} onClick={()=>void run(true)}>Kiểm tra rea-video và cờ Codex</Button>
    {value.health&&<p>{value.health.ready?'rea-video sẵn sàng trên máy.':value.health.error} {value.health.codex?.ready?'Codex có --image và --output-schema.':value.health.codex?.error}</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
// Display labels only; keep the original values in reference data and exports.
const cameraLabels:Record<string,string>={
  static:'Máy đứng yên',
  static_with_subject_motion:'Máy đứng, chủ thể chuyển động',
  'push-in':'Đẩy máy vào',
  'pull-out':'Lùi máy ra',
  'pan / track':'Lia máy / bám theo chủ thể',
  handheld_like:'Chuyển động như máy cầm tay',
  smooth_move:'Máy chuyển động mượt',
};
const narrativeLabels:Record<string,string>={
  hook:'Mở đầu',context:'Bối cảnh',proof:'Bằng chứng',payoff:'Kết quả',
  info:'Thông tin',turn:'Chuyển ý',cta:'Kêu gọi hành động',
};
function timelineLabel(value:string|null|undefined,labels:Record<string,string>,missing:string){
  return value==null?missing:Object.hasOwn(labels,value)?labels[value]:`Khác (${value})`;
}
export function ReaTimeline({data}:{data:ReaVideo}){
  const time=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:1});
  return <div className="rea-timeline"><p>{time(data.durationSec)} giây · {data.shots.length} shot · BPM {data.audio.bpm??'Chưa biết'} · {data.readStatus==='complete'?'Xong':'Chờ đọc ảnh'}{data.readBy&&` · ${data.readBy}`}</p>
    {data.metadata.reviewError&&<p>{data.metadata.reviewError}</p>}
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Timeline video mẫu"><table className="lab-table"><thead><tr><th>Shot / giây</th><th>Máy quay / vai trò</th><th>Chữ đè có mốc</th><th>Prompt tái tạo</th></tr></thead><tbody>
      {data.shots.map((s,i)=><tr key={s.id}><td style={{whiteSpace:'nowrap'}}>{i+1} · {time(s.start)}–{time(s.end)} s</td><td>{timelineLabel(s.camera,cameraLabels,'Chưa biết')}<br/>{timelineLabel(data.narrative.find(n=>n.shotRange[0]<=i+1&&n.shotRange[1]>=i+1)?.role,narrativeLabels,'Chờ đọc ảnh')}</td><td>{data.overlays.filter(o=>o.fromSec<s.end&&o.toSec>s.start).map(o=><p key={o.id}>{o.text}<br/><small>{time(o.fromSec)}–{time(o.toSec)} s</small></p>)}</td><td><details><summary>Xem prompt</summary><p>{data.remakePrompts.find(p=>p.shotId===s.id)?.prompt??'Chờ đọc ảnh'}</p></details></td></tr>)}
    </tbody></table></div><p>Đã lọc {data.metadata.filteredOcr.length} chữ OCR ngắn hoặc độ tin cậy dưới 0,8; giữ trong metadata để đối chiếu.</p></div>;
}
