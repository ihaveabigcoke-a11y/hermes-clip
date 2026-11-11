"use client";

import {useEffect, useMemo, useRef, useState} from 'react';
import type {LabRecord} from '@/lib/lab/domain';
import {desktopBridge, fetchAssetBytes} from '@/lib/lab/desktop-client';
import {formulaVersions} from '@/lib/lab/viral-formulas';
import {draftReferenceVideo, referenceDraftRecordId, referenceMusePrompt, referenceVideoDraftSchema, type ReferenceVideoDraft} from '@/lib/lab/viral-reference';
import {Button} from './primitives';

type Props = {records: LabRecord[]; disabled?: boolean; onSaveDraft: (draft: ReferenceVideoDraft, revision: number) => Promise<unknown>};
type Analysis = {jobId: string; projectId: string; name: string; sourceSha256: string; sourceUrl: string | null; structure: unknown; subtitles: {path: string}[]};
const roleLabels = {hook:'Mở đầu',body:'Nội dung',cta:'Kêu gọi hành động'};
const kindLabels = {problem:'Vấn đề',versus_unbox:'So sánh / mở hộp',result:'Kết quả',cta:'Kêu gọi hành động'};

export function ReferenceDraftPreview({draft, contactUrl}: {draft: ReferenceVideoDraft; contactUrl?: string}) {
  return <div>
    {contactUrl && <img src={contactUrl} alt="Các khung hình video mẫu, đọc từ trái sang phải và từ trên xuống dưới" style={{maxWidth:'100%',maxHeight:600,objectFit:'contain'}}/>}
    <p>{draft.durationSec ?? 'Chưa biết'} giây · {draft.cuts ?? 'Chưa biết'} lần cắt
      {draft.structure && <> · {draft.structure.width ?? '?'} × {draft.structure.height ?? '?'} · {draft.structure.aspectRatio ?? 'Chưa biết tỷ lệ'}</>}</p>
    <p>Nhịp cảnh gợi ý, cần duyệt ý nghĩa từng cảnh. Chữ chưa đọc được để trống.</p>
    <ol>{draft.beats?.map((beat,index)=><li key={index}>
      {roleLabels[beat.role]} · {kindLabels[beat.kind]} · {beat.fromSec.toFixed(2)}–{beat.toSec.toFixed(2)} giây · {beat.label || 'Chưa có nhãn chữ'}
    </li>)}</ol>
  </div>;
}

export default function ReferenceVideoPanel({records, disabled=false, onSaveDraft}: Props) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [status,setStatus]=useState<any>(null),[analysis,setAnalysis]=useState<Analysis|null>(null),[contactUrl,setContactUrl]=useState('');
  const [projectId,setProjectId]=useState('formula-library'),[assetId,setAssetId]=useState(''),[file,setFile]=useState<File|null>(null);
  const [formulaKey,setFormulaKey]=useState(''),[snapshot,setSnapshot]=useState<ReferenceVideoDraft|null>(null);
  const [title,setTitle]=useState(''),[hookText,setHookText]=useState(''),[ctaText,setCtaText]=useState('');
  const [youtubeUrl,setYoutubeUrl]=useState(''),[youtube,setYoutube]=useState<{supported:boolean;error:string|null}|null>(null);
  const mounted=useRef(true),lock=useRef(false),blobUrl=useRef(''),controller=useRef<AbortController|null>(null);
  const api=desktopBridge(),formulas=formulaVersions(records);
  const formula=formulas.find(f=>`${f.id}@${f.version}`===formulaKey)??formulas.find(f=>f.id==='problem-vs-result-cta')!;
  const saved=records.filter(r=>r.kind==='reference_video_draft').flatMap(record=>{
    const parsed=referenceVideoDraftSchema.safeParse(record.data);return parsed.success?[{record,draft:parsed.data}]:[];
  });
  // Reopening a saved draft keeps its exact formula version, labels and nulls.
  // Only explicitly choosing a template regenerates its provisional timing.
  const draft=useMemo(()=>analysis?{...(snapshot??draftReferenceVideo({id:analysis.jobId,product:title.trim()||analysis.name,
    projectId:analysis.projectId,integrationJobId:analysis.jobId,sourceSha256:analysis.sourceSha256,sourceUrl:analysis.sourceUrl,
    structure:analysis.structure,formula})),product:title.trim()||analysis.name,hookText,ctaText}:null,[analysis,title,formula,hookText,ctaText,snapshot]);
  const blocked=disabled||busy||!!status?.busy||!api?.integrationAnalyzeStructure;
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;controller.current?.abort();if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);};
  },[]);
  useEffect(()=>{
    if(!open||!api?.integrationStatus)return;
    let live=true;
    const refresh=()=>void api.integrationStatus().then(value=>{if(live)setStatus(value);}).catch(e=>{if(live)setError(e.message);});
    refresh();const timer=setInterval(refresh,5000);
    return()=>{live=false;clearInterval(timer);};
  },[open,api]);
  async function execute(fn:()=>Promise<void>) {
    if(lock.current||disabled)return;
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{await fn();}catch(e){if(mounted.current)setError((e as Error).message);}
    finally{lock.current=false;if(mounted.current){setBusy(false);if(api?.integrationStatus)setStatus(await api.integrationStatus().catch(()=>null));}}
  }
  async function show(id:string,project:string) {
    const result=await api!.integrationStructure({id,projectId:project});
    if(!mounted.current)return;
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current);
    blobUrl.current=URL.createObjectURL(new Blob([new Uint8Array(result.contactSheet.bytes)],{type:'image/jpeg'}));
    setContactUrl(blobUrl.current);setAnalysis(result);
    const previous=saved.find(row=>row.draft.integrationJobId===id)?.draft;
    setSnapshot(previous??null);
    setTitle(previous?.product??records.find(r=>r.id===project)?.data.name??result.name);
    setHookText(previous?.hookText??'');setCtaText(previous?.ctaText??'');
    setFormulaKey(previous?.formulaId?`${previous.formulaId}@${previous.formulaVersion}`:'');
  }
  async function analyze() {
    const asset=records.find(r=>r.id===assetId&&r.kind==='asset'&&r.data.type==='video/mp4');
    if(!file&&!asset)throw Error('Chọn một MP4 trong Thư viện hoặc trên máy.');
    if(file&&(file.size===0||file.size>25*1024**2||!file.name.toLowerCase().endsWith('.mp4')))throw Error('Chọn MP4 không rỗng, tối đa 25 MB.');
    const abort=new AbortController();controller.current=abort;
    const timer=setTimeout(()=>abort.abort(),60000);
    try {
      const bytes=file?new Uint8Array(await file.arrayBuffer()):await fetchAssetBytes(asset!.id,abort.signal);
      const sha256=file?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(n=>n.toString(16).padStart(2,'0')).join(''):asset!.data.sha256;
      if(!sha256)throw Error('Video Thư viện thiếu checksum.');
      const job=await api!.integrationAnalyzeStructure({projectId,assetId:file?'local_'+crypto.randomUUID():asset!.id,name:file?.name??asset!.data.name,bytes,sha256});
      await show(job.id,projectId);
    }finally{clearTimeout(timer);controller.current=null;}
  }
  return <div>
    <Button tone="neutral" disabled={disabled} onClick={()=>setOpen(!open)}>Phân tích video mẫu</Button>
    {open&&<div className="production-card production-card-body">
      <p>MP4 tối đa 25 MB / 180 giây. Mỗi 0,8 giây lấy một khung hình; phân tích chạy trên máy, chưa gửi Muse.</p>
      {!api?.integrationAnalyzeStructure&&<p>Mở bản desktop đã cập nhật để phân tích video.</p>}
      <label className="field">Sản phẩm<select value={projectId} disabled={blocked} onChange={e=>setProjectId(e.target.value)}>
        <option value="formula-library">Tham chiếu chung · chưa gắn sản phẩm</option>
        {records.filter(r=>r.kind==='product'&&!r.data.archived).map(r=><option value={r.id} key={r.id}>{r.data.name}</option>)}
      </select></label>
      <label className="field">Video trong Thư viện<select value={assetId} disabled={blocked} onChange={e=>{setAssetId(e.target.value);setFile(null);}}>
        <option value="">Chọn video</option>{records.filter(r=>r.kind==='asset'&&r.data.type==='video/mp4').map(r=><option key={r.id} value={r.id}>{r.data.name}</option>)}
      </select></label>
      <label className="field">Hoặc chọn MP4 trên máy<input type="file" accept="video/mp4,.mp4" disabled={blocked} onChange={e=>{setFile(e.target.files?.[0]??null);setAssetId('');e.target.value='';}}/></label>
      {file&&<p>Đã chọn: {file.name}</p>}
      <Button disabled={blocked||(!file&&!assetId)} busy={busy} onClick={()=>void execute(analyze)}>Phân tích MP4</Button>
      <details><summary>Nhập YouTube Shorts</summary>
        <Button tone="neutral" disabled={blocked} onClick={()=>void execute(async()=>setYoutube(await api!.integrationYoutubeStatus()))}>Kiểm tra hỗ trợ YouTube</Button>
        <p>{youtube?.supported?'Công cụ local hỗ trợ lệnh tải; chưa kiểm kết nối YouTube.':youtube?.error??'Chưa hỗ trợ · cần kiểm công cụ local.'}</p>
        <label className="field">Link YouTube Shorts<input type="url" value={youtubeUrl} disabled={blocked} onChange={e=>setYoutubeUrl(e.target.value)}/></label>
        <Button disabled={blocked||!youtube?.supported||!youtubeUrl.trim()} onClick={()=>void execute(async()=>{
          const job=await api!.integrationAnalyzeYoutube({projectId,url:youtubeUrl.trim()});await show(job.id,projectId);
        })}>Tải và phân tích Shorts</Button>
      </details>
      {error&&<p role="alert" className="inline-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {(status?.jobs??[]).filter((j:any)=>j.kind==='reference-structure').map((j:any)=><p key={j.id}>
        {j.request.name} · {({done:'Đã phân tích',running:'Đang phân tích',failed:'Cần đối soát',interrupted:'Đã gián đoạn',queued:'Đang chờ'} as Record<string,string>)[j.state]??j.state}
        {j.error&&<> · {j.error}</>} {j.state==='done'&&<Button tone="ghost" disabled={blocked} onClick={()=>void execute(()=>show(j.id,j.projectId))}>Xem phân tích</Button>}
      </p>)}
      {draft&&<>
        <label className="field">Công thức gợi ý<select value={formulaKey||`${formula.id}@${formula.version}`} disabled={blocked} onChange={e=>{setFormulaKey(e.target.value);setSnapshot(null);}}>
          {formulaKey&&!formulas.some(f=>`${f.id}@${f.version}`===formulaKey)&&<option value={formulaKey}>Giữ bản đã lưu · {snapshot?.formulaId} · v{snapshot?.formulaVersion}</option>}
          {formulas.map(f=><option key={`${f.id}@${f.version}`} value={`${f.id}@${f.version}`}>{f.name} · v{f.version}</option>)}
        </select></label>
        <ReferenceDraftPreview draft={draft} contactUrl={contactUrl}/>
        {!!analysis?.subtitles.length&&<p>Đã lưu {analysis.subtitles.length} file phụ đề cùng tác vụ.</p>}
        <label className="field">Sản phẩm / tên tham chiếu<input maxLength={3000} value={title} disabled={blocked} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="field">Chữ mở đầu · tiếng Anh<input maxLength={3000} value={hookText} disabled={blocked} onChange={e=>setHookText(e.target.value)}/></label>
        <label className="field">Chữ kêu gọi hành động · tiếng Anh<input maxLength={3000} value={ctaText} disabled={blocked} onChange={e=>setCtaText(e.target.value)}/></label>
        <details><summary>Prompt Muse chuẩn bị sẵn · chưa gửi</summary><textarea readOnly rows={10} aria-label="Prompt phân tích video cho Muse" value={referenceMusePrompt({structure:draft.structure,beats:draft.beats})}/></details>
        <Button disabled={blocked} onClick={()=>void execute(async()=>{
          const previous=saved.find(row=>row.record.id===referenceDraftRecordId(draft));
          await onSaveDraft(referenceVideoDraftSchema.parse(draft),previous?.record.revision??0);
          if(mounted.current)setNotice('Đã lưu tham chiếu nháp. Công thức chính chưa thay đổi.');
        })}>Lưu thành tham chiếu nháp</Button>
      </>}
    </div>}
    {!!saved.length&&<details><summary>Tham chiếu nháp đã lưu · {saved.length}</summary>
      {saved.map(({record,draft:reference})=><details key={record.id}><summary>{reference.product} · bản nháp</summary>
        <ReferenceDraftPreview draft={reference}/><p>Chữ mở đầu: {reference.hookText||'Chưa có'}</p><p>Chữ kêu gọi hành động: {reference.ctaText||'Chưa có'}</p>
      </details>)}
    </details>}
  </div>;
}
