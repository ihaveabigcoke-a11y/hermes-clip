import {z} from 'zod';
import {VIETNAM_TIME_ZONE,vietnamDay,type LabRecord} from './domain.ts';
import {selectionEntries} from './daily-selection.ts';
import {renderPlanSchema,renderDuration} from './render-plan.ts';

export const officeGroups={queued:'Hàng chờ',sending:'Đang gửi',generating:'Đang tạo',checking:'Kiểm / nhập',library:'Đã vào Thư viện',manual:'Chờ file tay',attention:'Cần đối soát',failed:'Lỗi',stopped:'Đã dừng',refused:'Muse từ chối/giới hạn',unmapped:'Chưa phân loại'} as const;
export type OfficeGroup=keyof typeof officeGroups;
export function groupOf(run:{state:string;assetId?:string|null;importError?:unknown;errorKind?:string}) : OfficeGroup {
  if(run.errorKind==='refused')return 'refused';
  if(run.importError)return 'attention';
  if(['ready','received'].includes(run.state))return run.assetId?'library':'checking';
  if(run.state==='queued')return 'queued';
  if(['preflight','preparing','prepared','submitting'].includes(run.state))return 'sending';
  if(['submitted','waiting','running'].includes(run.state))return 'generating';
  if(['downloading','validating'].includes(run.state))return 'checking';
  if(run.state==='manual_waiting')return 'manual';
  if(['needs_attention','unknown','importError','unmatched'].includes(run.state))return 'attention';
  if(run.state==='failed')return 'failed';
  if(run.state==='cancelled')return 'stopped';
  return 'unmapped';
}
const iso=(value:unknown)=>{if(value==null)return null;const date=new Date(value as any);return Number.isFinite(date.getTime())?date.toISOString():null;};
const number=(value:any)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const identifier=(value:any)=>typeof value==='string'&&/^[a-zA-Z0-9_:.\-]{1,200}$/.test(value)?value:null;
const stateOf=(value:any)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value)?value:'unknown';
const safeName=(value:any)=>String(value??'Chưa biết').replace(/\b[A-Z]:[\\/][^\s]+|\\\\[^\s]+|\/(?:Users|home|tmp|var)\/[^\s]+/gi,'[đã ẩn đường dẫn]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[đã ẩn]').replace(/(?:sk-|ghp_|Bearer\s+)[\w-]+/gi,'[đã ẩn]').slice(0,160);
const provider=(value:any)=>['muse','manual','codex','grok-cli','fal','openmontage'].includes(value)?value:null;
const note=(state:string,assetId:string|null=null)=>officeGroups[groupOf({state,assetId})];

/** No I/O, no mutation and no raw diagnostic, prompt, profile or account fields. */
export function buildOfficeView(records:LabRecord[],workerStore:any=[],manual:any={},integrations:any[]=[],now=Date.now()) {
  const jobs=Array.isArray(workerStore)?workerStore:workerStore.jobs??[];
  const receipts=manual.receipts??[],packs=manual.exports??{},codes=manual.codes?.scenes??{};
  const projects=records.filter(r=>r.kind==='production'),assets=records.filter(r=>r.kind==='asset');
  const projectOf=(id:any)=>projects.find(p=>p.id===id);
  const runs:any[]=[];
  function run(raw:any,kind:'media'|'compose',id:string,source:any,projectId:any,sceneId:any,variantId:any,assetId:any,takeId:any) {
    const state=stateOf(raw.state),output=identifier(assetId),group=groupOf({state,assetId:output,importError:raw.importError,errorKind:raw.errorKind});
    const history=(raw.history??[{at:raw.createdAt,state}]).slice(-20).map((h:any)=>({at:iso(h.at),state:stateOf(h.state),note:note(stateOf(h.state),h.state===state?output:null)}));
    const updatedAt=iso(raw.updatedAt??raw.receivedAt??raw.finishedAt??raw.createdAt);
    const lastEvent={at:updatedAt,note:group==='refused'?'Muse từ chối/giới hạn':raw.importError?'File đã tạo nhưng chưa nhập được. Mở lượt gốc để đối soát.':note(state,output)};
    if(!history.length||history.at(-1)?.state!==state||history.at(-1)?.at!==updatedAt)history.push({at:updatedAt,state,note:lastEvent.note});
    const project=projectOf(projectId);
    runs.push({id,kind,productId:identifier(project?.data.productId??raw.request?.productId),productionId:identifier(projectId),sceneId:identifier(sceneId),variantId:identifier(variantId),provider:provider(source),state,group,createdAt:iso(raw.createdAt),updatedAt,lastEvent,history:history.slice(-20),needsAction:['attention','failed','manual','unmapped','refused'].includes(group)?{reason:group==='refused'?'Muse đã từ chối/giới hạn; dừng đêm này và dùng manual.':group==='attention'?(raw.importError?'File đã có nhưng chưa nhập được vào Thư viện.':state==='unmatched'?'File chưa khớp cảnh; cần gắn trong Hộp nhận media.':'Kết quả chưa rõ; đối soát trước khi tạo lại.'):group==='manual'?'Đang chờ file tải về được gắn vào cảnh.':group==='failed'?'Lượt kết thúc lỗi; mở tác vụ gốc để xem chi tiết.':'Trạng thái chưa có quy tắc phân loại.'}:null,outputs:{assetId:output,takeId:identifier(takeId)}});
  }
  for(const job of jobs) {
    const p=projectOf(job.request?.projectId),scene=p?.data.scenes?.find((s:any)=>s.id===job.request?.sceneId);
    const take=scene?.takes?.find((t:any)=>t.jobId===job.id||t.assetId===job.uploadedAssetId);
    run(job,'media','job:'+identifier(job.id),job.provider,job.request?.projectId,job.request?.sceneId,job.request?.variantId,job.uploadedAssetId,take?.id);
  }
  for(const receipt of receipts) {
    const projectId=receipt.projectId??receipt.intent?.projectId,sceneId=receipt.sceneId??receipt.intent?.sceneId;
    const take=projectOf(projectId)?.data.scenes?.find((s:any)=>s.id===sceneId)?.takes?.find((t:any)=>t.sha256===receipt.sha256);
    run({...receipt,history:[{at:receipt.createdAt,state:'unmatched'},...(receipt.receivedAt?[{at:receipt.receivedAt,state:receipt.state}]:[])]},'media','manual:'+identifier(receipt.sha256),'manual',projectId,sceneId,null,receipt.assetId,take?.id);
  }
  for(const [key,code] of Object.entries(codes)) {
    let ids;try{ids=JSON.parse(key);}catch{continue;}
    if(!Array.isArray(ids)||ids.length!==2)continue;
    const [projectId,sceneId]=ids,pack=packs[String(code)];if(!pack)continue;
    const scene=projectOf(projectId)?.data.scenes?.find((s:any)=>s.id===sceneId);
    if(scene?.revision!==pack.revision||receipts.some((r:any)=>r.state==='received'&&r.projectId===projectId&&r.sceneId===sceneId&&r.sceneRevision===pack.revision))continue;
    run({state:'manual_waiting',createdAt:pack.at},'media','manual:pending:'+identifier(String(code)),'manual',projectId,sceneId,null,null,null);
  }
  for(const job of integrations.filter(j=>j.kind==='compose')) {
    const asset=assets.find(a=>a.data.sha256===job.output?.sha256&&job.output?.sha256);
    // Keep the native state (including done/interrupted) visible even if unmapped.
    run(job,'compose','compose:'+identifier(job.id),'openmontage',job.projectId,null,job.request?.variantId,asset?.id,null);
  }
  const selections=selectionEntries(records);
  const days=new Map<string,{day:string;batchId:string;productIds:string[]}>();
  for(const s of selections){const key=s.selectionDay+':'+s.batchId;const day=days.get(key)??{day:s.selectionDay,batchId:s.batchId,productIds:[]};if(!day.productIds.includes(s.productId))day.productIds.push(s.productId);days.set(key,day);}
  const exports=projects.flatMap(p=>(p.data.exports??[]).map((e:any)=>{
    const asset=assets.find(a=>a.id===e.assetId),m=asset?.data.metadata;
    const plan=renderPlanSchema.safeParse(e.renderPlan);
    const durable=e.verified===true&&e.sha256===asset?.data.sha256&&m?.verifiedBy==='container'&&plan.success&&plan.data.productionId===p.id&&plan.data.variantId===e.variantId&&Math.abs(m.duration-renderDuration(plan.data))<=.1;
    const legacy=e.verified===undefined&&integrations.some(j=>j.kind==='compose'&&j.state==='done'&&j.output?.sha256===asset?.data.sha256&&j.output?.metadata?.width===720&&j.output?.metadata?.height===1280);
    const verified=e.kind==='render'&&asset?.data.type==='video/mp4'&&!!asset?.data.sha256&&m?.width===720&&m?.height===1280&&Number.isFinite(m?.duration)&&m.duration>0&&(durable||legacy);
    return {id:identifier(e.id),productId:p.data.productId,productionId:p.id,variantId:identifier(e.variantId),kind:e.kind,assetId:identifier(e.assetId),sha256:asset?.data.sha256??null,verified,createdAt:iso(e.createdAt)};
  }));
  const posts=records.filter(r=>r.kind==='content_plan').map(r=>({id:r.id,productId:identifier(r.data.productId),variantId:identifier(r.data.variantId),accountId:identifier(r.data.accountId),assetId:identifier(r.data.assetId),status:stateOf(r.data.status),utmHookId:identifier(r.data.utmHookId),plannedDate:r.data.plannedDate??null,productionId:identifier(r.data.productionId)}));
  const products=records.filter(r=>r.kind==='product').map(p=>{
    const selected=selections.filter(s=>s.productId===p.id),related=projects.filter(pr=>pr.data.productId===p.id),productRuns=runs.filter(r=>r.productId===p.id);
    const hasTake=related.some(pr=>pr.data.scenes?.some((s:any)=>s.takes?.length));
    const stage=p.data.archived?'dropped':posts.some(post=>post.productId===p.id&&post.status.startsWith('published'))||exports.some(e=>e.productId===p.id&&e.verified)?'publish':hasTake?'review':productRuns.length?'media':related.length?'script':'research';
    return {id:p.id,key:p.data.productKey??null,name:safeName(p.data.name),stage,firstSelectedDay:selected[0]?.selectionDay??null,lastSelectedDay:selected.at(-1)?.selectionDay??null,selectionCount:selected.length,active:stage!=='dropped',priorityRank:selected.at(-1)?.rank??null,openActions:productRuns.filter(r=>r.needsAction).length,updatedAt:iso(p.updatedAt),competitorVideos:[]};
  });
  const measurements=records.filter(r=>['social_metric','keyword_comment_measurement'].includes(r.kind)).map(r=>({id:r.id,postId:identifier(r.data.planId),observedAt:iso(r.data.observedAt),source:stateOf(r.data.source),period:r.kind==='social_metric'?(r.data.period??null):null,keywordComments:r.kind==='keyword_comment_measurement'?number(r.data.matched):number(r.data.keywordComments),dms:number(r.data.dms),shares:number(r.data.shares),utmClicks:number(r.data.utmClicks),orders:number(r.data.orders)}));
  return {schema:'hermes-office-view',version:1,generatedAt:new Date(now).toISOString(),source:{app:'hermes-clip',commit:null,timezone:VIETNAM_TIME_ZONE},today:vietnamDay(now),selection:{limitPerDay:3,days:[...days.values()],totals:{selectionsAllDays:selections.length,distinctProducts:new Set(selections.map(s=>s.productId)).size}},products,runs,exports,posts,measurements};
}
export type OfficeView=ReturnType<typeof buildOfficeView>;

// Validate every nested field consumed by the read-only UI before replacing its last good view.
const viewText=z.string(),viewId=viewText.min(1),viewDay=viewText.regex(/^\d{4}-\d{2}-\d{2}$/);
const viewTime=viewText.datetime({offset:true}),viewCount=z.number().int().nonnegative();
const viewEvent=z.object({at:viewTime.nullable(),state:viewText,note:viewText});
const officeViewSchema=z.object({
  schema:z.literal('hermes-office-view'),version:z.literal(1),generatedAt:viewTime,today:viewDay,
  source:z.object({app:z.literal('hermes-clip'),commit:viewText.nullable(),timezone:z.literal(VIETNAM_TIME_ZONE)}),
  selection:z.object({limitPerDay:z.literal(3),days:z.array(z.object({day:viewDay,batchId:viewId,productIds:z.array(viewId)})),totals:z.object({selectionsAllDays:viewCount,distinctProducts:viewCount})}),
  products:z.array(z.object({id:viewId,key:viewText.nullable(),name:viewText,stage:viewText,firstSelectedDay:viewDay.nullable(),lastSelectedDay:viewDay.nullable(),selectionCount:viewCount,active:z.boolean(),priorityRank:z.number().int().min(1).max(3).nullable(),openActions:viewCount,updatedAt:viewTime.nullable()})),
  runs:z.array(z.object({id:viewId,kind:z.enum(['media','compose']),productId:viewId.nullable(),productionId:viewId.nullable(),sceneId:viewId.nullable(),variantId:viewId.nullable(),provider:viewText.nullable(),state:viewText,group:z.custom<OfficeGroup>(v=>typeof v==='string'&&Object.hasOwn(officeGroups,v)),createdAt:viewTime.nullable(),updatedAt:viewTime.nullable(),lastEvent:z.object({at:viewTime.nullable(),note:viewText}),history:z.array(viewEvent).max(20),needsAction:z.object({reason:viewText}).nullable(),outputs:z.object({assetId:viewId.nullable(),takeId:viewId.nullable()})})),
  exports:z.array(z.object({id:viewId.nullable(),productId:viewId,productionId:viewId,variantId:viewId.nullable(),kind:z.enum(['package','render']),assetId:viewId.nullable(),verified:z.boolean(),createdAt:viewTime.nullable()})),
  posts:z.array(z.object({id:viewId,productId:viewId.nullable(),status:viewText})),
  measurements:z.array(z.object({id:viewId,postId:viewId.nullable(),observedAt:viewTime.nullable(),source:viewText,period:viewText.nullable(),keywordComments:viewCount.nullable(),dms:viewCount.nullable(),shares:viewCount.nullable(),utmClicks:viewCount.nullable(),orders:viewCount.nullable()})),
});
export function parseOfficeView(raw:unknown):OfficeView {
  if(!officeViewSchema.safeParse(raw).success)throw Error('Dữ liệu theo dõi không đúng phiên bản.');
  return raw as OfficeView;
}
export function freshness(now:number,generatedAt:string) {
  const time=Date.parse(generatedAt);
  if(!Number.isFinite(time)||time>now+180000)return 'disconnected';
  return now-time>180000?'stale':'live';
}
export function todayCount(view:OfficeView) {
  return new Set(view.selection.days.filter(d=>d.day===view.today).flatMap(d=>d.productIds)).size;
}
export function activeProducts(view:OfficeView) {return view.products.filter(p=>p.active);}
