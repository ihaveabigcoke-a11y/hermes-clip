import {z} from 'zod';
import {latestPostSignals} from './hook-matrix.ts';
import {newProduction,productionSchema,sceneInputSchema} from './production.ts';
import {getRenderPlan} from './render-plan.ts';
import type {LabRecord} from './domain.ts';
export type ResultThresholds={minViews?:number|null;minKeywordComments?:number|null};
export function resultDecision(records:LabRecord[],plan:LabRecord,thresholds:ResultThresholds={},now=Date.now()){
 const signals=latestPostSignals(records,plan),at=Date.parse(plan.data.postedAt??'');
 const ready=Number.isFinite(at)&&now-at>=48*3600000&&signals.views!==null&&signals.keywordComments!==null&&thresholds.minViews!=null&&thresholds.minKeywordComments!=null;
 const label=!ready?null:signals.views!>=thresholds.minViews!&&signals.keywordComments!>=thresholds.minKeywordComments!?'Đẩy':signals.views!<thresholds.minViews!&&signals.keywordComments!<thresholds.minKeywordComments!?'Bỏ':'Đổi hook';
 return {signals,label,tone:label==='Đẩy'?'green':label==='Bỏ'?'red':label?'amber':'gray'};
}
/** Descriptive rank across the three hooks in one product/comparison group. Not a verdict. */
export function resultHookRank(records:LabRecord[],plan:LabRecord){
 const group=plan.data.comparison?.sourceGroupId;
 if(!group||!plan.data.variantId||latestPostSignals(records,plan).views===null)return null;
 const peers=records.filter(r=>r.kind==='content_plan'&&r.data.productId===plan.data.productId&&r.data.productionId===plan.data.productionId&&r.data.comparison?.sourceGroupId===group);
 const byHook=new Map<string,number[]>();
 for(const p of peers){const views=latestPostSignals(records,p).views;if(views!==null)byHook.set(p.data.variantId,[...(byHook.get(p.data.variantId)??[]),views]);}
 if(byHook.size>3)return null;
 const means=new Map([...byHook].map(([id,values])=>[id,values.reduce((sum,v)=>sum+v,0)/values.length]));
 const own=means.get(plan.data.variantId);if(own==null)return null;
 return 1+[...means.values()].filter(v=>v>own).length;
}
export const hookRefreshInput=z.object({planId:z.string().regex(/^[\w-]{1,120}$/),revision:z.number().int().positive(),id:z.string().regex(/^[\w-]{1,80}$/)});
export function planHookRefresh(records:LabRecord[],raw:unknown,now=Date.now()):LabRecord{
 const input=hookRefreshInput.parse(raw),plan=records.find(r=>r.kind==='content_plan'&&r.id===input.planId);if(!plan||plan.revision!==input.revision)throw Error('Bài đăng đã đổi. Tải lại trước khi tạo hook.');
 const existing=records.find(r=>r.id===input.id);if(existing){if(existing.kind==='production'&&existing.data.refreshSourcePlanId===plan.id)return existing;throw Error('Mã lượt đã dùng.');}
 const source=records.find(r=>r.kind==='production'&&r.id===plan.data.productionId),product=records.find(r=>r.kind==='product'&&r.id===plan.data.productId&&!r.data.archived);
 if(!source||!product||source.data.productRevision!==product.revision)throw Error('Đồng bộ hồ sơ trước khi đổi hook.');
 const p=productionSchema.parse(source.data),bodyPlan=getRenderPlan(p,source.id,plan.data.variantId);
 if(!p.exports.some(e=>e.assetId===plan.data.assetId&&e.verified&&JSON.stringify(e.renderPlan)===JSON.stringify(bodyPlan)))throw Error('MP4 không còn khớp đoạn thân hiện hành.');
 const fresh=newProduction('Đổi hook · '+product.data.name,product.id,product.revision,'en-US');
 fresh.references=structuredClone(p.references);fresh.reuseBodyPlan=structuredClone(bodyPlan);fresh.refreshSourcePlanId=plan.id;
 const ids=new Set(bodyPlan.segments.slice(1).map(s=>s.sceneId));fresh.scenes=structuredClone(p.scenes.filter(s=>ids.has(s.id)));
 const sourceHook=p.scenes.find(s=>s.id===bodyPlan.segments[0].sceneId)!;
 ['Exaggerate the inconvenience with clearly staged comedy, never product performance.','Show an absurd ineffective homemade workaround.','Open with an unexpected close-up and reveal the context.'].forEach((technique,i)=>{
  const id='auto_'+i;if(ids.has(id))throw Error('Cảnh thân trùng mã hook mới. Giữ lượt cũ và tạo từ Chi tiết.');
  const row=sceneInputSchema.parse({name:['Phóng đại vấn đề','Tự chế ngớ ngẩn','Gây tò mò'][i],role:'hook',prompt:`Create a new opening for ${product.data.name}. ${technique} Preserve the product; do not invent claims. Context: ${sourceHook.prompt}`.slice(0,10000),ratio:'9:16',mediaType:'video',duration:8,referenceIds:[]});
  const {referenceIds,...data}=row;fresh.scenes.unshift({...data,id,revision:1,references:structuredClone(sourceHook.references),storyboardApproved:false,attempts:[],takes:[]});
 });
 fresh.receipts=[input.id+'_refresh'];fresh.events=[{id:input.id+'_refresh',at:now,action:'refresh_hooks',detail:'Giữ nguyên đoạn thân từ '+source.id}];
 return {id:input.id,kind:'production',data:productionSchema.parse(fresh),revision:1,createdAt:now,updatedAt:now};
}
