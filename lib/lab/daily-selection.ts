import {z} from 'zod';
import {productFromCandidate, schemas, vietnamDay, type LabRecord} from './domain.ts';
import {researchProductId, type ResearchBatch} from './operations.ts';

export const dailySelectionInput = z.object({
  batchId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),candidateId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),
  revision:z.number().int().positive(),checked:z.boolean(),
  productKey:z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, 'Nhập mã 2–64 chữ in hoa, số, gạch ngang hoặc gạch dưới.').optional(),
  rank:z.number().int().min(1).max(3).optional(),reason:z.string().trim().max(1000).default(''),
});
export type SelectionEntry={selectionDay:string;batchId:string;candidateId:string;productId:string;rank:number|null;reason:string;active:boolean};
export function candidateProductId(batch: LabRecord, candidateId:string) {
  return batch.data.selectionLinks?.find((link:any)=>link.candidateId===candidateId)?.productId ?? researchProductId(batch.id,candidateId);
}
export function selectionEntries(records:LabRecord[]):SelectionEntry[] {
  const explicit=records.filter(r=>r.kind==='product_selection').map(r=>r.data as SelectionEntry);
  const entries=new Map(explicit.map(s=>[s.selectionDay+':'+s.productId,s]));
  for(const batch of records.filter(r=>r.kind==='research_batch')) {
    const day=batch.data.selectionDay ?? (batch.createdAt!=null?vietnamDay(batch.createdAt):null);
    if(!day)continue; // A missing creation timestamp is unknown, not the last edit day.
    for(const id of batch.data.selectedIds??[]) {
      if(batch.data.selectionLinks?.some((link:any)=>link.candidateId===id))continue;
      const productId=candidateProductId(batch,id),key=day+':'+productId;
      if(!entries.has(key)&&records.some(r=>r.kind==='product'&&r.id===productId))
        entries.set(key,{selectionDay:day,batchId:batch.id,candidateId:id,productId,rank:null,reason:'',active:true});
    }
  }
  return [...entries.values()].filter(s=>s.active).sort((a,b)=>a.selectionDay.localeCompare(b.selectionDay)||(a.rank??4)-(b.rank??4)||a.productId.localeCompare(b.productId));
}
export function selectionCounts(records:LabRecord[],now:number=Date.now()) {
  const entries=selectionEntries(records),today=vietnamDay(now);
  return {today,count:new Set(entries.filter(s=>s.selectionDay===today).map(s=>s.productId)).size,
    selectionsAllDays:entries.length,distinctProducts:new Set(entries.map(s=>s.productId)).size};
}
export function suggestProductKey(name:string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'D').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
}
/** Pure plan. The desktop applies every row in one BEGIN IMMEDIATE transaction. */
export function planDailySelection(records:LabRecord[],raw:unknown,now=Date.now()):LabRecord[] {
  const input=dailySelectionInput.parse(raw),day=vietnamDay(now);
  const batch=records.find(r=>r.kind==='research_batch'&&r.id===input.batchId);
  if(!batch||batch.revision!==input.revision)throw Error('Đợt đã thay đổi. Tải lại trước khi chọn.');
  const candidate=batch.data.candidates.find((c:any)=>c.id===input.candidateId);
  if(!candidate)throw Error('Ứng viên không còn trong đợt.');
  const linked=records.find(r=>r.kind==='product'&&r.id===candidateProductId(batch,input.candidateId));
  if(input.checked&&(!input.productKey||!input.rank))throw Error('Tự nhập mã sản phẩm và chọn thứ hạng 1–3 trước khi lưu.');
  if(linked?.data.productKey&&input.checked&&linked.data.productKey!==input.productKey)throw Error('Mã sản phẩm đã gán không được thay đổi.');
  const matches=records.filter(r=>r.kind==='product'&&r.data.productKey===input.productKey&&input.productKey);
  if(matches.length>1)throw Error('Mã sản phẩm bị trùng trong dữ liệu. Giữ nguyên và đối chiếu hồ sơ.');
  if(linked&&matches[0]&&linked.id!==matches[0].id)throw Error('Ứng viên đã có hồ sơ khác. Không tự gộp hoặc bỏ hồ sơ cũ.');
  const product=matches[0]??linked;
  if(input.checked&&product?.data.archived)throw Error('Hồ sơ đã lưu trữ. Mở lại hồ sơ trước khi chọn.');
  const productId=product?.id??researchProductId(batch.id,candidate.id);
  const entries=selectionEntries(records),current=entries.find(s=>s.selectionDay===day&&s.productId===productId);
  if(!input.checked&&!current)return [];
  const today=entries.filter(s=>s.selectionDay===day&&s.productId!==productId);
  if(input.checked&&today.length>=3)throw Error('Hôm nay đã chọn đủ 3 sản phẩm qua các đợt. Bỏ một lựa chọn trước.');
  if(input.checked&&today.some(s=>s.rank===input.rank))throw Error('Thứ hạng này đã có sản phẩm. Chọn hạng còn trống.');
  const changed:LabRecord[]=[];
  const saveRow=(id:string,kind:LabRecord['kind'],data:any,previous?:LabRecord)=>{
    if(!previous&&records.some(r=>r.id===id))throw Error('ID đã thuộc bản ghi khác. Giữ nguyên dữ liệu và tải lại.');
    if(previous&&JSON.stringify(previous.data)===JSON.stringify(data))return;
    changed.push({id,kind,data,revision:(previous?.revision??0)+1,createdAt:previous?.createdAt??now,updatedAt:now});
  };
  if(input.checked&&!product)saveRow(productId,'product',schemas.product.parse({...productFromCandidate(batch.id,batch.data as ResearchBatch,candidate),productKey:input.productKey}));
  else if(input.checked&&!product!.data.productKey)saveRow(productId,'product',{...product!.data,productKey:input.productKey},product);
  for(const legacy of entries.filter(s=>s.batchId===batch.id&&!(s.productId===productId&&s.selectionDay===day)&&!records.some(r=>r.kind==='product_selection'&&r.data.productId===s.productId&&r.data.selectionDay===s.selectionDay)))
    saveRow(researchProductId('selection_'+legacy.selectionDay,legacy.productId),'product_selection',legacy);
  const selectionId=researchProductId('selection_'+day,productId);
  // productId can be 120 characters. A deterministic bounded ID preserves the full ID in data.
  const previous=records.find(r=>r.kind==='product_selection'&&r.data.selectionDay===day&&r.data.productId===productId);
  const id=previous?.id??selectionId;
  saveRow(id,'product_selection',{selectionDay:day,batchId:batch.id,candidateId:candidate.id,productId,
    rank:input.rank??current?.rank??null,reason:input.checked?input.reason:current?.reason??'',active:input.checked},previous);
  const links=[...(batch.data.selectionLinks??[]).filter((l:any)=>l.candidateId!==candidate.id),{candidateId:candidate.id,productId}];
  const sameDay=entries.filter(s=>s.selectionDay===day&&s.batchId===batch.id&&s.candidateId!==candidate.id).map(s=>s.candidateId);
  const selectedIds=input.checked?[...new Set([...sameDay,candidate.id])]:sameDay;
  // Keep the original batch day; selection records carry subsequent days independently.
  saveRow(batch.id,'research_batch',{...batch.data,selectionDay:batch.data.selectionDay??(batch.createdAt!=null?vietnamDay(batch.createdAt):day),selectionLinks:links,selectedIds},batch);
  if(records.length+changed.filter(r=>!records.some(old=>old.id===r.id)).length>2000)throw Error('Workspace đã đủ 2.000 bản ghi. Chưa lưu lượt chọn.');
  return changed;
}
