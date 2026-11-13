"use client";
import {useEffect,useRef,useState} from 'react';
import {type LabRecord,type Kind} from '@/lib/lab/domain';
import {quickVideoSuggestions,type QuickVideoFields} from '@/lib/lab/quick-video';
import {formulaStoryboard} from '@/lib/lab/formula-storyboard';
import {applyProduction,newProduction,productionSchema} from '@/lib/lab/production';
import {latestProductProduction} from '@/lib/lab/product-next-step';
import {Button,Modal,api} from './primitives';
type Props={product:LabRecord;records:LabRecord[];demo:boolean;offline:boolean;persist:(kind:Kind,id:string,data:Record<string,any>,revision?:number)=>Promise<LabRecord>;onRecord:(record:LabRecord)=>void;onClose:()=>void;onReady:(href:string)=>void};
export default function QuickVideo({product,records,demo,offline,persist,onRecord,onClose,onReady}:Props) {
  const {formula,values:suggestions}=quickVideoSuggestions(product,records);
  const [values,setValues]=useState(suggestions),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [readyHref,setReadyHref]=useState('');
  const readyCallback=useRef(onReady);readyCallback.current=onReady;
  useEffect(()=>{
    if(!readyHref)return;
    // Close the controlled dialog before unmounting the product profile. This
    // also lets its focus trap and portal finish their exit on a fast retry.
    const timer=setTimeout(()=>readyCallback.current(readyHref),220);
    return()=>clearTimeout(timer);
  },[readyHref]);
  const run=useRef('quick_'+crypto.randomUUID().replaceAll('-',''));
  const projectId=useRef('production_'+crypto.randomUUID().replaceAll('-',''));
  const saved=useRef<LabRecord[]>(records),locked=useRef(false),pending=useRef<any>(null);
  async function prepare() {
    if(locked.current)return;locked.current=true;setBusy(true);setError('');
    try {
      if(offline&&!demo)throw Error('Đang ngoại tuyến. Kết nối lại để lưu khung content.');
      if(!formula)throw Error('Chưa có công thức Khung content v2.');
      // Validate all four inputs before any write.
      formulaStoryboard({...product.data,...values},newProduction(product.data.name,product.id,product.revision),formula,{...values,packaging:{brandName:values.brandName,boxText:values.boxText}});
      const current:LabRecord[]=demo?saved.current:(await api('/api/lab')).records;
      let pr=current.find(r=>r.id===product.id&&r.kind==='product');
      if(!pr||pr.data.archived)throw Error('Sản phẩm không còn hiện hành. Mở lại hồ sơ để kiểm tra.');
      if(Object.entries(values).some(([key,value])=>pr!.data[key]!==value)) {
        pr=await persist('product',pr.id,{...pr.data,...values},pr.revision);
        saved.current=[pr,...current.filter(r=>r.id!==pr!.id)];
      }
      let project=latestProductProduction(pr,current);
      async function command(action:string,input:any,id:string) {
        const envelope={id:project?.id??projectId.current,revision:project?.revision??0,commandId:run.current+'_'+id,action,input};
        // Retain an uncertain command verbatim. The server receipt makes retry idempotent.
        if(!pending.current)pending.current=envelope;
        const sent=pending.current;
        let result:LabRecord;
        if(demo){const data=sent.action==='create'?newProduction(input.name,pr!.id,pr!.revision):applyProduction(productionSchema.parse(project!.data),sent.action,sent.input,sent.commandId,Date.now(),pr!.revision);result={id:sent.id,kind:'production',data,revision:sent.revision+1,updatedAt:Date.now()};}
        else result=(await api('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sent)})).record;
        pending.current=null;project=result;saved.current=[result,...saved.current.filter(r=>r.id!==result.id)];onRecord(result);
      }
      // First reconcile any command whose response was lost before scheduling the next one.
      if(pending.current)await command(pending.current.action,pending.current.input,'retry');
      if(!project)await command('create',{productId:pr.id,name:('Video · '+pr.data.name).slice(0,150),locale:'en-US',reuseProduct:true},'create');
      let p=productionSchema.parse(project!.data);
      if(p.productRevision!==pr.revision){await command('sync_product',{},'sync');p=productionSchema.parse(project!.data);}
      if(!p.receipts.includes(run.current+'_draft')) {
        const draft=formulaStoryboard(pr.data,p,formula,{...values,ctaPlacement:pr.data.ctaPlacement==='caption'?'caption':'overlay',packaging:{brandName:values.brandName,boxText:values.boxText}});
        await command('formula_draft',draft,'draft');
      }
      setReadyHref('?'+new URLSearchParams({view:'production',product:pr.id,production:project!.id,stage:'scenes'}));
    }catch(e){if((e as {status?:number}).status && (e as {status:number}).status<500)pending.current=null;setError((e as Error).message);}finally{locked.current=false;setBusy(false);}
  }
  return <Modal open={!readyHref} title="Làm video cho sản phẩm này" description={product.data.name+' · Khung content v2'} onClose={onClose} locked={busy}>
    <form onSubmit={e=>{e.preventDefault();void prepare();}}><div className="modal-body quick-video-fields"><p>Gợi ý đã điền sẵn. Sửa bốn ô dưới đây để lưu cảnh nháp và mở gói prompt.</p>
      {([['ctaKeyword','Từ khoá CTA'],['situation','Tình huống mở đầu · tiếng Anh'],['brandName','Tên in trên hộp'],['boxText','Chữ trên hộp']] as const).map(([key,label])=><label className="field" key={key}>{label}{key==='situation'?<textarea required maxLength={1000} disabled={busy||!!pending.current} value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})}/>:<input required disabled={busy||!!pending.current} maxLength={key==='ctaKeyword'?20:key==='brandName'?80:160} pattern={key==='ctaKeyword'?'[A-Z]{2,20}':undefined} value={values[key]} onChange={e=>setValues({...values,[key]:key==='ctaKeyword'?e.target.value.toUpperCase():e.target.value})}/>}</label>)}
      <small>Công thức: {formula?.name}. Gợi ý bao bì cần bạn kiểm tra với sản phẩm thật. Muse vẫn Tạm dừng.</small>{error&&<p role="alert" className="inline-error">{error}</p>}
    </div><footer className="form-actions"><Button tone="ghost" type="button" disabled={busy} onClick={onClose}>Đóng</Button><Button type="submit" busy={busy} disabled={offline&&!demo}>{Object.entries(values).every(([k,v])=>suggestions[k as keyof QuickVideoFields]===v)?'Dùng gợi ý':'Lưu và mở khung content'}</Button></footer></form>
  </Modal>;
}
