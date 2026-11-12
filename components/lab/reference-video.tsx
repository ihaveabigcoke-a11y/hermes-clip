"use client";

import {useEffect, useMemo, useRef, useState} from 'react';
import type {LabRecord} from '@/lib/lab/domain';
import {desktopBridge, fetchAssetBytes} from '@/lib/lab/desktop-client';
import {useDesktopStatus} from '@/lib/lab/use-desktop-status';
import {referenceMusePrompt, parseReferenceMuseResponse} from '@/lib/lab/reference-muse';
import type {Chat} from './muse-chat';
import {formulaVersions, workspaceFormulas, type ViralFormula} from '@/lib/lab/viral-formulas';
import {draftReferenceVideo, referenceVideoDraftSchema, type ReferenceVideoDraft, type VideoStructure} from '@/lib/lab/viral-reference';
import {formulaAnalysisPrompt, parseFormulaAnalysis, matchFormula, proposeFormulaChanges, type FormulaAnalysis, type FormulaChange} from '@/lib/lab/formula-analysis';
import {Button} from './primitives';

type Props = {records: LabRecord[]; disabled?: boolean; onSaveDraft: (draft: ReferenceVideoDraft, revision: number) => Promise<unknown>;
  onSaveFormula?: (formula: ViralFormula) => Promise<unknown>};
type Analysis = {jobId: string; projectId: string; name: string; sourceSha256: string; sourceUrl: string | null; structure: unknown; subtitles: {path: string}[]};
const roleLabels = {hook:'Mở đầu',body:'Nội dung',cta:'Kêu gọi hành động'};
const kindLabels = {problem:'Vấn đề',versus_unbox:'So sánh / mở hộp',result:'Kết quả',cta:'Kêu gọi hành động'};
const hookLabels = {problem_label:'Nhãn vấn đề',pov_share_bait:'Góc nhìn gợi chia sẻ',do_not_show:'Đừng cho nhóm này xem',
  think_vs_actually:'Tưởng vậy nhưng thực tế',authority_check:'Kiểm tra bởi người có thẩm quyền',audience_callout:'Gọi đúng nhóm khách',emotional_story:'Câu chuyện cảm xúc'};
const sourceLabels = {overlay:'Chữ trên hình',caption:'Caption bài gốc',filename:'Tên file gốc',none:'Không có'};
const changeLabels = {new:'Công thức mới',candidate:'Ứng viên công thức', 'add-label-variant':'Thêm biến thể nhãn', 'add-cta-pattern':'Thêm mẫu CTA'};

export function FormulaAnalysisPreview({analysis, formulas}: {analysis: FormulaAnalysis; formulas: readonly ViralFormula[]}) {
  const match = matchFormula(analysis, formulas);
  return <div>
    <p>Mở đầu: {analysis.hookText ?? 'Không thấy chữ'} · {analysis.hookType ? hookLabels[analysis.hookType] : 'Chưa biết kiểu mở đầu'}</p>
    <div className="table-scroll" role="region" aria-label="Bảng beat đã phân tích" tabIndex={0}><table className="lab-table"><thead><tr><th scope="col">Thời gian (giây)</th><th scope="col">Vai trò</th><th scope="col">Loại beat</th><th scope="col">Chữ nguyên văn</th></tr></thead>
      <tbody>{analysis.beats.map((beat,i)=><tr key={i}><td>{beat.fromSec.toFixed(2)}–{beat.toSec.toFixed(2)}</td><td>{beat.role ? roleLabels[beat.role] : 'Chưa biết'}</td>
        <td>{beat.kind ? kindLabels[beat.kind] : 'Chưa biết'}</td><td style={{whiteSpace:'normal',minWidth:180}}>{beat.label ?? 'Không đọc được / không có'}</td></tr>)}</tbody></table></div>
    <p>CTA: {analysis.ctaText ?? 'Chưa thấy'} · Từ khóa: {analysis.ctaKeyword ?? 'Chưa biết'} · Nguồn CTA: {analysis.ctaSource ? sourceLabels[analysis.ctaSource] : 'Chưa xác minh'}</p>
    <p>Cảnh kết quả: {analysis.visualPayoff ?? 'Chưa xác định'}</p>
    <p>Hiệu ứng vượt sản phẩm: {analysis.effectsBeyondProduct === null ? 'Chưa xác định' : analysis.effectsBeyondProduct.join(' / ') || 'Chưa ghi nhận'}</p>
    <p>Công thức khớp: {formulas.find(f=>f.id===match.formulaId)?.name ?? 'Chưa có'} · {({exact:'Khớp đủ',partial:'Khớp một phần',none:'Chưa khớp'})[match.confidence]}</p>
    <ul>{match.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
    {!!analysis.warnings.length&&<><p>Cảnh báo</p><ul>{analysis.warnings.map(w=><li key={w}>{w}</li>)}</ul></>}
    {analysis.notes&&<p>{analysis.notes}</p>}
  </div>;
}

export function FormulaChangeProposals({changes, disabled, onCreate}: {changes: FormulaChange[]; disabled: boolean; onCreate: (formula: ViralFormula)=>void}) {
  return <div className="production-card production-card-body"><h3>Đề xuất cập nhật công thức</h3>
    <p>Tính từ phân tích đã lưu. Chỉ tạo phiên bản mới khi bạn bấm; ứng viên một video cần thêm 1 ví dụ.</p>
    {!changes.length&&<p>Chưa có đề xuất từ các tham chiếu đã lưu.</p>}
    {changes.map(change=><div key={change.key}>
      <p>{changeLabels[change.change]} · {change.formulaId ?? 'Chưa có công thức'} · {change.referenceIds.join(', ')}</p>
      <ul>{change.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
      {change.formula&&<details><summary>Xem phiên bản sẽ lưu · v{change.formula.version}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(change.formula,null,2)}</pre></details>}
      <Button disabled={disabled||!change.formula} onClick={()=>{if(change.formula)onCreate(change.formula);}}>Tạo phiên bản công thức mới</Button>
    </div>)}
  </div>;
}

export function ReferenceAnalysisInput({structure, caption, fileName, jsonText, disabled, formulas, onJson, onParse, onCopy}: {
  structure: VideoStructure; caption: string; fileName: string; jsonText: string; disabled: boolean; formulas: ViralFormula[];
  onJson: (value: string)=>void; onParse: ()=>void; onCopy: (prompt: string)=>void;
}) {
  const prompt = formulaAnalysisPrompt({structure,caption,fileName,formulas});
  return <div>
    <p>Nếu gửi thủ công, đính kèm sheet thưa và tất cả sheet dày khi gửi prompt. Prompt có thể rút gọn dữ liệu dài và đánh dấu phần rút gọn; kiểm cả caption và tên file gốc.</p>
    <p>Sheet thưa: <code style={{overflowWrap:'anywhere'}}>{structure.contactSheetPath}</code></p>
    <ul>{structure.contactSheets?.dense.map(s=><li key={s.path}>Sheet dày · {s.fromSec}–{s.toSec} giây · <code style={{overflowWrap:'anywhere'}}>{s.path}</code></li>)}</ul>
    {!structure.contactSheets?.dense.length&&<p>Phân tích cũ chưa có sheet dày. Phân tích lại MP4 trước khi kết luận không có chữ hoặc CTA.</p>}
    <Button tone="neutral" disabled={disabled} onClick={()=>onCopy(prompt)}>Sao chép prompt phân tích</Button>
    <details><summary>Prompt phân tích để sao chép thủ công</summary><textarea readOnly rows={10} aria-label="Prompt phân tích video cho Muse" value={prompt}/></details>
    <label className="field">Dán kết quả JSON<textarea aria-label="Dán kết quả JSON" rows={8} maxLength={100000} value={jsonText} disabled={disabled} onChange={e=>onJson(e.target.value)}/></label>
    <Button tone="neutral" disabled={disabled||!jsonText.trim()} onClick={onParse}>Đọc kết quả JSON</Button>
  </div>;
}

export function ReferenceDraftPreview({draft, contactUrl}: {draft: ReferenceVideoDraft; contactUrl?: string}) {
  return <div>
    {contactUrl && <img src={contactUrl} alt="Các khung hình video mẫu, đọc từ trái sang phải và từ trên xuống dưới" style={{maxWidth:'100%',maxHeight:600,objectFit:'contain'}}/>}
    <p>{draft.durationSec ?? 'Chưa biết'} giây · {draft.cuts ?? 'Chưa biết'} lần cắt
      {draft.structure && <> · {draft.structure.width ?? '?'} × {draft.structure.height ?? '?'} · {draft.structure.aspectRatio ?? 'Chưa biết tỷ lệ'}</>}</p>
    {draft.beats&&<p>Nhịp cảnh gợi ý, cần duyệt ý nghĩa từng cảnh. Chữ chưa đọc được để trống.</p>}
    <ol>{draft.beats?.map((beat,index)=><li key={index}>
      {roleLabels[beat.role]} · {kindLabels[beat.kind]} · {beat.fromSec.toFixed(2)}–{beat.toSec.toFixed(2)} giây · {beat.label || 'Chưa có nhãn chữ'}
    </li>)}</ol>
  </div>;
}

export function ReferenceMuseAnalysis({jobId, structure, caption, fileName, formulas, disabled, onBusy, onResponse}: {
  jobId:string; structure:VideoStructure; caption:string; fileName:string; formulas:ViralFormula[]; disabled:boolean;
  onBusy:(busy:boolean)=>void; onResponse:(text:string, analysis:FormulaAnalysis|null)=>void;
}) {
  const api=desktopBridge(), {status,error:statusError,refresh}=useDesktopStatus();
  const [profileId,setProfileId]=useState(''),[chat,setChat]=useState<Chat|null>(null),[error,setError]=useState('');
  const [parseFailed,setParseFailed]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const running=useRef(false),live=useRef(true),attempt=useRef<{key:string;requestId:string}|null>(null);
  const scope='reference_'+jobId, profiles=(status?.profiles??[]).filter(p=>p.enabled);
  const selectedId=profileId||profiles.find(p=>p.session==='signed_in')?.id||profiles[0]?.id||'';
  const selected=profiles.find(p=>p.id===selectedId), count=status?.batch?.submittedByProfile[selectedId]??0;
  const pending=!!chat&&['preparing','waiting','needs_attention'].includes(chat.state);
  const context={structure,caption,fileName,formulas};
  useEffect(()=>{
    live.current=true;let active=true,reading=false;
    const update=async()=>{
      if(reading||running.current||!api?.museChatList)return;
      reading=true;
      try {const rows:Chat[]=await api.museChatList({projectId:scope});if(active&&!running.current){setChat(rows.at(-1)??null);setLoading(false);}}
      catch {if(active)setError('Chưa đọc được receipt Muse. Đợi đọc lại trước khi gửi.');}
      finally {reading=false;}
    };
    void update();const timer=setInterval(update,1500);
    return()=>{active=false;live.current=false;clearInterval(timer);};
  },[api,scope]);
  function consume(result:Chat) {
    setChat(result);setUncertain(false);
    if(result.state!=='done'){setParseFailed(false);setError(result.error??'Đang chờ Muse; đọc lại kết quả trước khi gửi tiếp.');return;}
    try {const parsed=parseReferenceMuseResponse(result.response,context);onResponse(result.response,parsed);setParseFailed(false);setError('');}
    catch(e){onResponse(result.response,null);setParseFailed(true);setError((e as Error).message);}
  }
  async function run(mode:'send'|'repair'|'read') {
    if(running.current||disabled||!api)return;
    running.current=true;setBusy(true);onBusy(true);setError('');
    try {
      if(mode==='read') {
        const rows:Chat[]=await api.museChatList({projectId:scope});
        const row=attempt.current ? rows.find(r=>r.requestId===attempt.current!.requestId)??rows.at(-1) : rows.at(-1);
        if(!row){setUncertain(false);setError('Chưa có receipt. Có thể thử lại cùng mã yêu cầu.');return;}
        const result=row.state==='needs_attention'?await api.museChatRecover({requestId:row.requestId}):row;
        if(live.current)consume(result);
      } else {
        if(pending||uncertain||!selected||selected.busy||count>=3)throw Error('Chọn profile đang bật, còn lượt và không có tác vụ cần đối soát.');
        if(mode==='repair'&&(!parseFailed||chat?.state!=='done'||chat.profileId!==selectedId))throw Error('Dùng đúng profile của phản hồi trước để sửa JSON.');
        const request={projectId:scope,profileId:selectedId,prompt:referenceMusePrompt(context,mode==='repair'),
          ...(mode==='repair'?{parentId:chat!.requestId}:{referenceJobId:jobId})};
        const key=JSON.stringify(request);
        if(!attempt.current||attempt.current.key!==key)attempt.current={key,requestId:crypto.randomUUID()};
        setUncertain(true);
        const result:Chat=await api.museChatSend({...request,requestId:attempt.current.requestId});
        if(live.current)consume(result);
        if(['done','failed'].includes(result.state))attempt.current=null;
      }
      await refresh();
    } catch(e){if(live.current)setError((e as Error).message);}
    finally {running.current=false;onBusy(false);if(live.current)setBusy(false);}
  }
  const blocked=disabled||busy||loading||!api?.museChatSend;
  const cannotSend=status?.musePaused!==false||blocked||pending||uncertain||!selected||selected.busy||count>=3;
  return <div>
    {status?.musePaused!==false&&<p className="field-help">Muse đang tạm dừng, bật lại ở Tài khoản Muse</p>}
    <label className="field">Profile Muse<select aria-label="Profile Muse phân tích" disabled={blocked||pending||uncertain} value={selectedId} onChange={e=>setProfileId(e.target.value)}>
      {!profiles.length&&<option value="">Chưa có profile đang bật</option>}
      {profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {status?.batch?.submittedByProfile[p.id]??0}/3 lượt</option>)}
    </select></label>
    <p>Tốn 1 lượt Muse · gửi sheet thưa và sheet dày đầu tiên. Kết quả chỉ điền để bạn duyệt, chưa lưu.</p>
    {(structure.contactSheets?.dense.length??0)>1&&<p>Video có nhiều sheet dày; chữ/CTA ngoài sheet đầu tiên cần kiểm thêm.</p>}
    {!structure.contactSheets?.dense.length&&<p>Phân tích lại MP4 để có sheet dày trước khi gửi Muse.</p>}
    <Button disabled={cannotSend||!structure.contactSheets?.dense.length} busy={busy} onClick={()=>void run('send')}>{status?.musePaused!==false?'Muse đang tạm dừng':'Phân tích bằng Muse'}</Button>
    {parseFailed&&<Button tone="neutral" disabled={cannotSend||chat?.profileId!==selectedId} onClick={()=>void run('repair')}>Gửi tiếp yêu cầu sửa JSON</Button>}
    {parseFailed&&<p>Sửa JSON tốn thêm 1 lượt Muse trong cùng hội thoại.</p>}
    {(chat||uncertain)&&<Button tone="neutral" disabled={blocked||status?.musePaused!==false} onClick={()=>void run('read')}>{status?.musePaused!==false?'Muse đang tạm dừng':'Đọc lại kết quả'}</Button>}
    {busy&&<p role="status">Đang chờ phản hồi Muse…</p>}
    {chat?.state==='needs_attention'&&<p>Cần đối soát hội thoại trước khi gửi tiếp. Đọc lại kết quả không gửi prompt mới.</p>}
    {chat?.state==='failed'&&<p>Gửi chưa bắt đầu · chưa tính lượt cho yêu cầu này.</p>}
    {(error||statusError)&&<p role="alert" className="inline-error">{error||statusError}</p>}
  </div>;
}

export default function ReferenceVideoPanel({records, disabled=false, onSaveDraft, onSaveFormula}: Props) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [status,setStatus]=useState<any>(null),[analysis,setAnalysis]=useState<Analysis|null>(null),[contactUrl,setContactUrl]=useState('');
  const [projectId,setProjectId]=useState('formula-library'),[assetId,setAssetId]=useState(''),[file,setFile]=useState<File|null>(null);
  const [formulaKey,setFormulaKey]=useState(''),[snapshot,setSnapshot]=useState<ReferenceVideoDraft|null>(null);
  const [title,setTitle]=useState(''),[hookText,setHookText]=useState(''),[ctaText,setCtaText]=useState('');
  const [caption,setCaption]=useState(''),[fileName,setFileName]=useState(''),[jsonText,setJsonText]=useState(''),[jsonDirty,setJsonDirty]=useState(false);
  const [parsedAnalysis,setParsedAnalysis]=useState<FormulaAnalysis|null>(null);
  const [draftRevision,setDraftRevision]=useState(0);
  const [youtubeUrl,setYoutubeUrl]=useState(''),[youtube,setYoutube]=useState<{supported:boolean;error:string|null}|null>(null);
  const mounted=useRef(true),lock=useRef(false),blobUrl=useRef(''),controller=useRef<AbortController|null>(null);
  const api=desktopBridge(),formulas=formulaVersions(records);
  const formula=formulas.find(f=>`${f.id}@${f.version}`===formulaKey)??formulas.find(f=>f.id==='problem-vs-result-cta')!;
  const saved=records.filter(r=>r.kind==='reference_video_draft').flatMap(record=>{
    const parsed=referenceVideoDraftSchema.safeParse(record.data);return parsed.success?[{record,draft:parsed.data}]:[];
  });
  const latest=workspaceFormulas(records);
  const proposals=proposeFormulaChanges(saved.flatMap(({draft})=>draft.analysis ? [{...draft.analysis,id:draft.id,sourceSha256:draft.sourceSha256}] : []),latest);
  // Reopening a saved draft keeps its exact formula version, labels and nulls.
  // Only explicitly choosing a template regenerates its provisional timing.
  const draft=useMemo(()=>analysis?{...(snapshot??draftReferenceVideo({id:analysis.jobId,product:title.trim()||analysis.name,
    projectId:analysis.projectId,integrationJobId:analysis.jobId,sourceSha256:analysis.sourceSha256,sourceUrl:analysis.sourceUrl,
    structure:analysis.structure,formula})),product:title.trim()||analysis.name,hookText:parsedAnalysis?.hookText??(parsedAnalysis?null:hookText),
    ctaText:parsedAnalysis?.ctaText??(parsedAnalysis?null:ctaText),caption,fileName,analysis:parsedAnalysis,
    ...(parsedAnalysis?{hookType:parsedAnalysis.hookType,ctaType:parsedAnalysis.ctaType,ctaKeyword:parsedAnalysis.ctaKeyword,productTraits:parsedAnalysis.productTraits}:{}),
  }:null,[analysis,title,formula,hookText,ctaText,snapshot,caption,fileName,parsedAnalysis]);
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
    const savedRow=saved.find(row=>row.draft.integrationJobId===id),previous=savedRow?.draft;
    setDraftRevision(savedRow?.record.revision??0);
    setSnapshot(previous??null);
    setTitle(previous?.product??records.find(r=>r.id===project)?.data.name??result.name);
    setHookText(previous?.hookText??'');setCtaText(previous?.ctaText??'');
    setCaption(previous?.caption??'');setFileName(previous?.fileName??result.name);
    setParsedAnalysis(previous?.analysis??null);setJsonDirty(false);
    if(previous?.analysis){const {warnings,...response}=previous.analysis;setJsonText(JSON.stringify(response,null,2));}else setJsonText('');
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
    <Button tone="neutral" disabled={disabled||busy} onClick={()=>setOpen(!open)}>Phân tích video mẫu</Button>
    {open&&<div className="production-card production-card-body">
      <p>MP4 tối đa 25 MB / 180 giây. Sheet thưa mỗi 0,8 giây và sheet dày 4 khung hình/giây; phân tích chạy trên máy, chưa gửi Muse.</p>
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
        <label className="field">Công thức gợi ý<select value={formulaKey||`${formula.id}@${formula.version}`} disabled={blocked||!!parsedAnalysis} onChange={e=>{setFormulaKey(e.target.value);setSnapshot(null);}}>
          {formulaKey&&!formulas.some(f=>`${f.id}@${f.version}`===formulaKey)&&<option value={formulaKey}>Giữ bản đã lưu · {snapshot?.formulaId} · v{snapshot?.formulaVersion}</option>}
          {formulas.map(f=><option key={`${f.id}@${f.version}`} value={`${f.id}@${f.version}`}>{f.name} · v{f.version}</option>)}
        </select></label>
        <ReferenceDraftPreview draft={{...draft,beats:parsedAnalysis?null:draft.beats}} contactUrl={contactUrl}/>
        {!!analysis?.subtitles.length&&<p>Đã lưu {analysis.subtitles.length} file phụ đề cùng tác vụ.</p>}
        <label className="field">Sản phẩm / tên tham chiếu<input maxLength={3000} value={title} disabled={blocked} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="field">Caption bài gốc<textarea aria-label="Caption bài gốc" maxLength={2200} rows={4} value={caption} disabled={blocked} onChange={e=>{setCaption(e.target.value);setJsonDirty(!!jsonText.trim());}}/></label>
        <label className="field">Tên file gốc<input aria-label="Tên file gốc" maxLength={1000} value={fileName} disabled={blocked} onChange={e=>{setFileName(e.target.value);setJsonDirty(!!jsonText.trim());}}/></label>
        {!parsedAnalysis&&<>
          <label className="field">Chữ mở đầu · tiếng Anh<input maxLength={3000} value={hookText} disabled={blocked} onChange={e=>setHookText(e.target.value)}/></label>
          <label className="field">Chữ kêu gọi hành động · tiếng Anh<input maxLength={3000} value={ctaText} disabled={blocked} onChange={e=>setCtaText(e.target.value)}/></label>
        </>}
        {draft.structure&&analysis&&<ReferenceMuseAnalysis key={analysis.jobId} jobId={analysis.jobId} structure={draft.structure}
          caption={caption} fileName={fileName} formulas={latest} disabled={blocked} onBusy={setBusy}
          onResponse={(text,parsed)=>{setJsonText(text);setParsedAnalysis(parsed);setJsonDirty(!parsed);setNotice(parsed?'Đã điền phân tích Muse. Kiểm tra kết quả rồi bấm Lưu tham chiếu.':'');}}/>}
        {draft.structure&&<ReferenceAnalysisInput structure={draft.structure} caption={caption} fileName={fileName} jsonText={jsonText} disabled={blocked} formulas={latest}
          onJson={value=>{setJsonText(value);setJsonDirty(!!value.trim());if(!value.trim())setParsedAnalysis(null);}}
          onCopy={prompt=>void execute(async()=>{await navigator.clipboard.writeText(prompt);setNotice('Đã sao chép prompt. Đính kèm tất cả sheet khi gửi cho AI.');})}
          onParse={()=>void execute(async()=>{setParsedAnalysis(parseFormulaAnalysis(jsonText,draft.structure!,{caption,fileName}));setJsonDirty(false);})}/>
        }
        {jsonDirty&&<p>Đọc lại kết quả JSON để đối chiếu với caption và tên file hiện tại trước khi lưu.</p>}
        {parsedAnalysis&&!jsonDirty&&<FormulaAnalysisPreview analysis={parsedAnalysis} formulas={latest}/>}
        <Button disabled={blocked||jsonDirty} onClick={()=>void execute(async()=>{
          const match=parsedAnalysis?matchFormula(parsedAnalysis,latest):null;
          const matched=match?.confidence==='exact'?latest.find(f=>f.id===match.formulaId):null;
          await onSaveDraft(referenceVideoDraftSchema.parse({...draft,...(parsedAnalysis?{formulaId:matched?.id??null,formulaVersion:matched?.version??null}:{})}),draftRevision);
          if(mounted.current){setDraftRevision(draftRevision+1);setNotice('Đã lưu tham chiếu nháp. Công thức chính chưa thay đổi.');}
        })}>Lưu tham chiếu</Button>
      </>}
    </div>}
    {!!saved.length&&<details><summary>Tham chiếu nháp đã lưu · {saved.length}</summary>
      {saved.map(({record,draft:reference})=><details key={record.id}><summary>{reference.product} · bản nháp</summary>
        <ReferenceDraftPreview draft={{...reference,beats:reference.analysis?null:reference.beats}}/>
        {reference.caption&&<p>Caption bài gốc: {reference.caption}</p>}{reference.fileName&&<p>Tên file gốc: {reference.fileName}</p>}
        {reference.analysis?<FormulaAnalysisPreview analysis={reference.analysis} formulas={latest}/>:<><p>Chữ mở đầu: {reference.hookText||'Chưa có'}</p><p>Chữ kêu gọi hành động: {reference.ctaText||'Chưa có'}</p></>}
      </details>)}
    </details>}
    <FormulaChangeProposals changes={proposals} disabled={disabled||busy||!onSaveFormula} onCreate={formula=>void execute(async()=>{
      await onSaveFormula!(formula);setNotice(`Đã tạo phiên bản ${formula.version}. Phiên bản cũ được giữ nguyên.`);
    })}/>
    {!open&&error&&<p role="alert" className="inline-error">{error}</p>}{!open&&notice&&<p role="status">{notice}</p>}
  </div>;
}
