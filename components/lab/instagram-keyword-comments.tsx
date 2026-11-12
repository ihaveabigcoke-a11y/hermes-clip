"use client";
import {useRef,useState} from 'react';
import {type LabRecord,formatTime} from '@/lib/lab/domain';
import {countKeywordComments,parseCommentPaste,type CommentPasteFormat} from '@/lib/lab/keyword-comments';
import {commentKeywordSchema,keywordCommentMeasurementSchema} from '@/lib/lab/operations';
import {Button} from './primitives';

type Measurement={id:string;data:Record<string,any>};
type Props={plan:LabRecord;keyword:string|null;measurements:Measurement[];disabled:boolean;onSave:(id:string,data:Record<string,any>)=>Promise<LabRecord>};
export default function InstagramKeywordComments({plan,keyword,measurements,disabled,onSave}:Props){
  const [rawText,setRawText]=useState('');
  const [keywordInput,setKeywordInput]=useState<string|null>(null);
  const [inputFormat,setInputFormat]=useState<CommentPasteFormat>('text');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [saved,setSaved]=useState<Measurement|null>(null);
  const lock=useRef(false);
  // Retain the same request ID after an uncertain save; a retry cannot append twice.
  const attempt=useRef<{key:string;id:string;data:Record<string,any>}|null>(null);
  const value=keywordInput??keyword??'';
  const parsedKeyword=commentKeywordSchema.safeParse(value);
  const comments=parseCommentPaste(rawText,inputFormat);
  const preview=parsedKeyword.success&&comments.length?countKeywordComments(comments,parsedKeyword.data):null;
  const history=[...(saved&&!measurements.some(row=>row.id===saved.id)?[saved]:[]),...measurements];
  const latest=history[0];
  async function save(){
    if(lock.current||disabled||!preview)return;
    lock.current=true;setBusy(true);setError('');
    try{
      const data=keywordCommentMeasurementSchema.parse({planId:plan.id,accountId:plan.data.accountId,sourceUrl:plan.data.postUrl,
        source:'manual_paste',observedAt:new Date().toISOString(),keyword:value,inputFormat,rawText});
      const key=JSON.stringify([data.planId,data.accountId,data.sourceUrl,data.keyword,data.inputFormat,data.rawText]);
      if(attempt.current?.key!==key)attempt.current={key,id:'keyword_comments_'+crypto.randomUUID().replaceAll('-',''),data};
      const record=await onSave(attempt.current.id,attempt.current.data);
      setSaved(record);setRawText('');attempt.current=null;
    }catch(reason){setError((reason as Error).message+' Nếu kết quả lưu chưa rõ, tải lại để đối soát trước khi tạo lượt đo khác.');}
    finally{lock.current=false;setBusy(false);}
  }
  function result(data:Record<string,any>){return <p>{data.matched} / {data.total} comment khớp · Người dùng duy nhất: {data.matchedUniqueUsers??'—'}{data.matchedUniqueUsers==null?' (thiếu username ở comment khớp)':''}</p>;}
  return <section className="instagram-insights" aria-label="Comment từ khóa CTA" aria-busy={busy}>
    <h3>Comment từ khóa CTA</h3>
    <p>Lưu phần comment bạn đã sao chép. Mỗi dòng là một comment; đây là bản đo riêng, không thay tổng bình luận Insights.</p>
    <label className="field">Từ khóa CTA để đếm<input aria-label="Từ khóa CTA để đếm" value={value} maxLength={20} placeholder="LED / RUN / HELP" disabled={disabled||busy} onChange={event=>setKeywordInput(event.target.value)}/></label>
    <label className="field">Định dạng comment<select aria-label="Định dạng comment" value={inputFormat} disabled={disabled||busy} onChange={event=>setInputFormat(event.target.value as CommentPasteFormat)}>
      <option value="text">Chỉ nội dung comment</option><option value="username">Username rồi đến comment</option>
    </select></label>
    <label className="field">Dán comment<textarea aria-label="Dán comment" rows={5} maxLength={100000} value={rawText} disabled={disabled||busy} placeholder={inputFormat==='username'?'alice LED 🙏\nbob How much?':'LED 🙏\nHow much?'} onChange={event=>setRawText(event.target.value)}/></label>
    <p>Chọn “Username rồi đến comment” nếu mọi dòng có dạng “alice LED” hoặc “@alice LED”. Bỏ các dòng ngày giờ, lượt thích và nút trả lời. Kiểm tra ví dụ trước khi lưu.</p>
    {value&&!parsedKeyword.success&&<p role="status">Từ khóa cần một từ tiếng Anh, tối đa 20 chữ cái.</p>}
    {preview&&<div aria-live="polite"><strong>Xem trước · {parsedKeyword.success?parsedKeyword.data:''}</strong>{result(preview)}{preview.examples.length>0&&<ul>{preview.examples.map((text,index)=><li key={index}>{text}</li>)}</ul>}</div>}
    <Button disabled={disabled||busy||!preview} onClick={()=>void save()}>{busy?'Đang lưu…':'Lưu bản đo comment'}</Button>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {latest?<div role="status"><strong>Bản đo mới nhất · {latest.data.keyword}</strong>{result(latest.data)}<p>Nguồn: dán tay · <time dateTime={latest.data.observedAt}>{formatTime(Date.parse(latest.data.observedAt))}</time></p></div>:<p>Chưa có bản đo comment từ khóa · —</p>}
    {history.length>0&&<details><summary>Lịch sử bản đo comment ({history.length})</summary>{history.map(row=><article key={row.id}><strong>{row.data.keyword} · {formatTime(Date.parse(row.data.observedAt))} · Dán tay</strong>{result(row.data)}<details><summary>Comment đã dán</summary><pre className="muse-chat-text">{row.data.rawText}</pre></details></article>)}</details>}
  </section>;
}
