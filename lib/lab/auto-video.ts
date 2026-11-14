import {vietnamDay,type LabRecord} from './domain.ts';
import {museMediaPrompt} from '../../desktop/src/muse-video-prompt.mjs';
import {getRenderPlan} from './render-plan.ts';
import {productionSchema,sceneInputSchema} from './production.ts';
import {suggestProductKey} from './daily-selection.ts';
/** A healthy login is not evidence that the profile can return a video. */
export function museVideoLabel(status:any){
 if(!status)return 'Đang kiểm tra Muse';
 if(status.musePaused!==false)return 'Muse đang tạm dừng';
 const reasons:Record<string,string>={MUSE_NO_MEDIA:'Muse chưa trả video',MUSE_REFUSED:'Muse từ chối tạo video',MUSE_LOGIN_REQUIRED:'Cần đăng nhập Muse',MUSE_CAPTCHA:'Muse yêu cầu captcha',MUSE_ACCOUNT_WARNING:'Muse cảnh báo tài khoản',MUSE_QUOTA_EXHAUSTED:'Muse đã hết hạn mức'};
 const blocked=(status.profiles??[]).flatMap((profile:any)=>{
  const latest=(status.jobs??[]).filter((j:any)=>j.profileId===profile.id&&j.request?.mediaType==='video'&&(reasons[j.failureCode]||(j.state==='ready'&&j.output)))
   .sort((a:any,b:any)=>(b.createdAt??0)-(a.createdAt??0))[0];
  if(!latest||(latest.state==='ready'&&latest.output)||!reasons[latest.failureCode])return [];
  return [{profile,job:latest,reason:/video_not_available|(?:country|region).{0,50}(?:restrict|unavailable)|unavailable.{0,80}(?:country|region)/i.test(latest.providerResponse??'')?'Muse hạn chế tạo video theo vùng/quyền':reasons[latest.failureCode]}];
 }).sort((a:any,b:any)=>(b.job.createdAt??0)-(a.job.createdAt??0));
 if(blocked.length)return blocked.map((item:any)=>`${item.profile.name}: ${item.reason}`).join(' · ');
 if(status.museNight?.stopped)return 'Muse cần kiểm tra trước khi tiếp tục';
 return status.generationReady&&(status.profiles??[]).some((p:any)=>p.enabled&&p.health==='ready'&&p.quota?.state==='available')?'Muse sẵn sàng':'Muse chưa sẵn sàng';
}
/** Read-only library across projects; never attaches old takes to the new timeline. */
export function productVideoLibrary(records:LabRecord[],productId:string){
 const projects=records.filter(r=>r.kind==='production'&&r.data.productId===productId).sort((a,b)=>b.updatedAt-a.updatedAt);
 return {
  clips:projects.flatMap(project=>(project.data.scenes??[]).filter((s:any)=>s.mediaType==='video').flatMap((scene:any)=>(scene.takes??[]).filter((t:any)=>t.assetId).map((take:any)=>({project,scene,take})))),
  exports:projects.flatMap(project=>(project.data.exports??[]).filter((e:any)=>e.kind==='render'&&e.verified&&e.assetId).map((output:any)=>({project,output}))),
 };
}
export function videoRecovery(project:LabRecord|undefined,status:any){
 const missing=(project?.data.scenes??[]).filter((s:any)=>!s.takes.some((t:any)=>t.sceneRevision===s.revision&&t.review!=='rejected'));
 const jobs=(status?.jobs??[]).filter((j:any)=>j.request?.projectId===project?.id&&missing.some((s:any)=>s.id===j.request.sceneId&&s.revision===j.request.sceneRevision));
 const unresolved=jobs.filter((j:any)=>['unknown','needs_attention'].includes(j.state));
 const noMedia=unresolved.some((j:any)=>j.failureCode==='MUSE_NO_MEDIA');
 const attention=unresolved.some((j:any)=>!['MUSE_NO_MEDIA','MUSE_REFUSED'].includes(j.failureCode));
 const manual=missing.some((s:any)=>s.mediaProvider==='manual');
 const message=noMedia?'Muse đã trả lời nhưng chưa tạo video. Lượt cũ được giữ; xem phản hồi trước khi gửi lại.':attention?'Kết quả lượt Muse chưa rõ. Mở Tín hiệu để đối soát trước khi gửi lại.':missing.length&&manual?'Dự án đang ở chế độ nhập tay, không có tác vụ tự tạo video. Bấm Làm video để chuyển các cảnh còn thiếu sang Muse.':missing.length&&status?.musePaused?'Chưa tạo clip mới. Kiểm tra công tắc và phiên trong Tài khoản trước khi tiếp tục.':'';
 return {message,manual,attention,noMedia};
}
export function resumableVideoProject(records:LabRecord[],product:LabRecord,savedId:string|null){
 const projects=records.filter(r=>r.kind==='production'&&r.data.productId===product.id&&r.data.productRevision===product.revision&&r.data.scenes?.length&&r.data.scenes.some((s:any)=>s.id==='auto_0')&&r.data.scenes.every((s:any)=>/^auto_[0-4]$/.test(s.id)||r.data.reuseBodyPlan?.segments.slice(1).some((segment:any)=>segment.sceneId===s.id))).sort((a,b)=>b.updatedAt-a.updatedAt);
 return projects.find(p=>p.id===savedId)??projects[0]??null;
}
export const hookTechniques=['problem','absurd','curiosity'] as const;
export function videoName(product:LabRecord,hook:number,technique:string,account='draft',now=Date.now()){
 const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').replace(/[^a-zA-Z0-9-]/g,'-').replace(/-+/g,'-').slice(0,48)||'draft';
 return `${clean(product.data.productKey||suggestProductKey(product.data.name))}_H${hook}-${clean(technique)}_${clean(account)}_${vietnamDay(now).replaceAll('-','').slice(2)}`;
}
export function autoVideoShots(product:LabRecord){
 const identity=product.data.name,problem=product.data.situation||product.data.problem||'an everyday inconvenience';
 const context=`Product: ${identity}. Verified claims only: ${product.data.allowedClaims||'none supplied; show appearance and handling only'}. Preserve its physical appearance. No logos or invented performance claims. Vertical 9:16. Keep natural sound. No on-screen text.`;
 const prompts=[`Exaggerate the inconvenience through obviously staged visual comedy: ${problem}. Do not exaggerate product performance.`, `Show an absurd homemade workaround for ${problem}, visibly awkward and ineffective.`, `Start with an unexpected close-up that creates curiosity about ${identity}, then reveal the everyday context.`, `Versus: unpack and show how ${identity} is handled. Do not invent packaging text.`, `Result: show the same product clearly in its ordinary setting. Use only the supplied verified claims.`];
 return prompts.map((prompt,i)=>sceneInputSchema.extend({id:sceneInputSchema.shape.name}).parse({id:'auto_'+i,name:['Phóng đại vấn đề','Tự chế ngớ ngẩn','Gây tò mò','Mở hộp','Kết quả'][i],role:i<3?'hook':'body',prompt:museMediaPrompt(context+'\n'+prompt,'video'),ratio:'9:16',duration:8,mediaType:'video',referenceIds:[],fromSec:i<3?0:i===3?4:8,toSec:i<3?4:i===3?8:15,overlayText:i<3?null:i===3?'Vs…':null}));
}
type FlowOptions={mediaMode?:'muse'|'manual';productId:string;projectId:string;request:(path:string,body?:any)=>Promise<any>;bridge:any;upload:(result:any,signal:AbortSignal)=>Promise<{id:string;sha256:string}>;onRecord?:(r:LabRecord)=>void;onProgress?:(s:string)=>void;onTiming?:(event:{stage:string;at:number;elapsedMs:number;variantId?:string})=>void;signal?:AbortSignal;wait?:(ms:number)=>Promise<void>;maxPolls?:number;now?:()=>number};
/** Same durable production commands as the detailed editor. No publishing; retries reuse receipts. */
export async function runVideoFlow(o:FlowOptions){
 const now=o.now??Date.now,signal=o.signal??new AbortController().signal,wait=o.wait??(ms=>new Promise(r=>setTimeout(r,ms)));
 const startedAt=now();
 let records:LabRecord[]=(await o.request('/api/lab')).records;
 const product=records.find(r=>r.kind==='product'&&r.id===o.productId&&!r.data.archived);if(!product)throw Error('Chọn sản phẩm hiện hành.');
 let project=records.find(r=>r.id===o.projectId&&r.kind==='production');
 const renders=new Map<string,Promise<void>>();let renderError:unknown=null,writes:Promise<unknown>=Promise.resolve();
 const timing=(stage:string,variantId?:string)=>o.onTiming?.({stage,at:now(),elapsedMs:now()-startedAt,variantId});
 const progress=(s:string)=>o.onProgress?.(s);timing('click');
 async function stop(reason:string,state='blocked'){await Promise.all(renders.values());if(renderError)throw renderError;progress(reason);timing(state);return {state,project,reason};}
 const museOnly=o.mediaMode==='muse';
 async function refresh(){signal.throwIfAborted();records=(await o.request('/api/lab')).records;const latest=records.find(r=>r.id===o.projectId&&r.kind==='production');if(latest&&(!project||latest.revision>=project.revision))project=latest;if(project)o.onRecord?.(project);}
 async function command(action:string,input:any,key:string){
  const pending=writes.then(async()=>{for(let attempt=0;attempt<4;attempt++){
   signal.throwIfAborted();const commandId=o.projectId+'_'+key;if(project?.data.receipts.includes(commandId))return;
   const revision=project?.revision??0;
   try{const result=await o.request('/api/production',{id:o.projectId,revision,action,input,commandId});if(!project||result.record.revision>=project.revision)project=result.record;o.onRecord?.(project!);return;}
   catch(error){await refresh();if(attempt===3||project?.revision===revision)throw error;}
  }});writes=pending.catch(()=>{});return pending;
 }
 progress('Khung');
 if(!project)await command('create',{name:'Video · '+product.data.name,productId:product.id,locale:'en-US'},'create');
 if(project!.data.productId!==product.id||project!.data.productRevision!==product.revision)throw Error('Hồ sơ đã đổi; giữ lượt cũ, tạo lượt mới sau khi kiểm lại.');
 if(project!.data.scenes.some((s:any)=>!/^auto_[0-4]$/.test(s.id)&&!project!.data.reuseBodyPlan?.segments.slice(1).some((segment:any)=>segment.sceneId===s.id)))throw Error('Dự án có cảnh chỉnh tay. Mở Chi tiết để tiếp tục.');
 if(!project!.data.scenes.length){const rows=autoVideoShots(product),match=String(product.data.imageUrl??'').match(/^\/api\/assets\/([\w-]+)/),asset=match?records.find(r=>r.kind==='asset'&&r.id===match[1]&&r.data.type?.startsWith('image/')&&r.data.metadata):null;
 if(asset){await command('reference',{id:'auto_reference',name:product.data.name,role:'product',assetId:asset.id,sourceUrl:'',notes:'Ảnh đã lưu trong hồ sơ'},'reference');for(const row of rows)row.referenceIds=['auto_reference'];}
 await command('import',{rows},'shots');}
 for(const s of project!.data.scenes)if(!s.storyboardApproved)await command('storyboard',{sceneId:s.id},'board_'+s.id+'_r'+s.revision);
 const missing=()=>project!.data.scenes.filter((s:any)=>!s.takes.some((t:any)=>t.sceneRevision===s.revision&&t.review!=='rejected'));
 async function manual(){
  const status=await o.bridge.status();
  const jobs=(status.jobs??[]).filter((j:any)=>j.request?.projectId===project!.id);
  const refused=jobs.filter((j:any)=>['MUSE_REFUSED','MUSE_NO_MEDIA'].includes(j.failureCode)&&['unknown','needs_attention'].includes(j.state));
  for(const j of refused)await command('skip_reconciliation',{sceneId:j.request.sceneId},'refused_'+j.id);
  const blocked=new Set(jobs.filter((j:any)=>!refused.includes(j)&&['unknown','needs_attention','submitting','submitted','waiting','downloading'].includes(j.state)).map((j:any)=>j.request.sceneId));
  for(const j of jobs.filter((j:any)=>j.state==='queued'))await o.bridge.cancel({id:j.id});
  const scenes=missing().filter((s:any)=>!blocked.has(s.id));for(const s of scenes)if(s.mediaProvider!=='manual')await command('media_provider',{sceneId:s.id,provider:'manual'},'manual_'+s.id+'_'+project!.revision);
  const pack=scenes.length?await o.bridge.manualMediaExport({projectId:project!.id,sceneIds:scenes.map((s:any)=>s.id)}):null;
  const state=scenes.length?'manual':blocked.size?'attention':'waiting';progress(state==='manual'?'Chờ file tay':state==='attention'?'Cần đối soát':'Đang tạo');return {state,project,pack};
 }
 async function launchAvailableRenders(){
 if(renderError)throw renderError;
 progress('Chọn đoạn');
 for(const s of project!.data.scenes){const t=[...s.takes].reverse().find((t:any)=>t.sceneRevision===s.revision&&t.review!=='rejected');if(!t)continue;if(t.review!=='approved')await command('review',{sceneId:s.id,takeId:t.id,review:'approved',notes:'Chọn kỹ thuật tự động; người dùng xem nội dung ở ba MP4 trước khi đăng.'},'review_'+t.id);}
 const pin=(n:number)=>{const s=project!.data.scenes.find((s:any)=>s.id==='auto_'+n);return {sceneId:s.id,takeId:[...s.takes].reverse().find((t:any)=>t.review==='approved'&&t.sceneRevision===s.revision).id};};
 const reused=project!.data.reuseBodyPlan;const reusedBody=reused?.segments.slice(1).filter((segment:any)=>project!.data.scenes.find((s:any)=>s.id===segment.sceneId)?.role==='body').map((segment:any)=>({sceneId:segment.sceneId,takeId:segment.takeId}));const reusedCta=reused?.segments.slice(1).find((segment:any)=>project!.data.scenes.find((s:any)=>s.id===segment.sceneId)?.role==='cta');
 const neededBody=reused?.segments.slice(1).map((s:any)=>s.sceneId)??['auto_3','auto_4'];
 if(neededBody.some((id:string)=>!project!.data.scenes.find((s:any)=>s.id===id)?.takes.some((t:any)=>t.review==='approved'&&t.sceneRevision===project!.data.scenes.find((s:any)=>s.id===id).revision)))return;
 const bodyId=o.projectId+'_body';await command('body',{name:'Thân · Mở hộp → Kết quả',items:reusedBody??[pin(3),pin(4)]},'body');
 const keyword=product!.data.ctaKeyword||'HELP';
 for(let i=0;i<3;i++){
  const vid=o.projectId+'_v'+i,technique=hookTechniques[i];
  const hook=project!.data.scenes.find((s:any)=>s.id==='auto_'+i);
  if(renders.has(vid)||!hook?.takes.some((t:any)=>t.sceneRevision===hook.revision&&t.review==='approved'))continue;
  await command('variant',{name:videoName(product!,i+1,technique,'draft',project!.createdAt??now()),bodyId,hook:pin(i),cta:reusedCta?{sceneId:reusedCta.sceneId,takeId:reusedCta.takeId}:null,locale:'en-US',caption:`Comment ${keyword} for details.`,ctaKeyword:keyword,ctaText:`Comment ${keyword}`,ctaPlacement:'overlay',comparisonGroupId:o.projectId+'_group',hookTechnique:technique,formulaId:'problem-vs-result-cta',formulaVersion:2},'v'+i);
  let p=productionSchema.parse(project!.data);
  if(!p.renderPlans?.some(x=>x.variantId===vid)){
   const variant=p.variants.find(v=>v.id===vid)!;const pins=[variant.hook!,...p.bodies.find(b=>b.id===variant.bodyId)!.items];const plan:any={productionId:project!.id,variantId:vid,bodyId:variant.bodyId,ratio:'9:16',size:[720,1280],audio:'keep',segments:pins.map((pin,j)=>{const scene=p.scenes.find(s=>s.id===pin.sceneId)!,take=scene.takes.find(t=>t.id===pin.takeId)!;return {shotId:scene.id,sceneId:scene.id,takeId:take.id,assetId:take.assetId,sha256:take.sha256,inSec:0,outSec:[4,4,7][j]};})};plan.overlays=[{text:'Vs…',fromSec:4,toSec:8,role:'label',style:'white-outline-top'},{text:`Comment ${keyword}`,fromSec:12,toSec:15,role:'cta',style:'white-outline-top'}];if(reused){const duration=reused.segments[0].outSec-reused.segments[0].inSec;if(duration>8)throw Error('Hook gốc dài hơn 8 giây. Chọn đoạn trong Chi tiết.');plan.segments=[{...plan.segments[0],outSec:duration},...structuredClone(reused.segments.slice(1))];plan.overlays=structuredClone(reused.overlays);}
   await command('render_plan',plan,'plan'+i);
  }
  p=productionSchema.parse(project!.data);const plan=getRenderPlan(p,project!.id,vid);
  if(p.exports.some(e=>e.variantId===vid&&e.verified&&e.assetId&&JSON.stringify(e.renderPlan)===JSON.stringify(plan)))continue;
  const name=videoName(product!,i+1,technique,'draft',project!.createdAt??now())+'.mp4';progress('MP4 '+(i+1)+'/3');timing('render_start',vid);
  // Start encoding now; scene preparation and other encodes continue independently.
  const outputPromise=o.bridge.renderPlannedVideo({projectId:project!.id,variantId:vid,revision:project!.revision,planSignature:JSON.stringify(plan),filename:name});
  const pending=(async()=>{const output=await outputPromise;timing('render_done',vid);
  const asset=await o.upload({...output,name},signal);
  if(asset.sha256!==output.sha256)throw Error('MP4 sau nhập không khớp hash.');
  timing('export_imported',vid);await command('export',{variantId:vid,assetId:asset.id,filename:name,kind:'render',renderPlan:plan},'export'+i);
  timing('export_saved',vid);})().catch(error=>{renderError??=error;});renders.set(vid,pending);
 }
 }
 if(missing().length){
  if(!o.bridge)throw Error('Mở app desktop để tạo video.');
  let status=await o.bridge.status();
  if(o.mediaMode==='manual')return manual();
  if(status.musePaused!==false||!status.generationReady)return museOnly?stop(status.museNight?.stopReason||'Muse chưa sẵn sàng. Bật Muse và kiểm tra phiên trong Tài khoản; chưa gửi cảnh nào.') : manual();
  if(museOnly){
   // Explicit Làm video resumes Muse for missing scenes, including old manual fallbacks.
   // Provider commands never clear receipts or reconciliation marks.
   for(const s of missing())if(s.mediaProvider==='manual')await command('media_provider',{sceneId:s.id,provider:'muse'},'resume_muse_'+s.id+'_'+project!.revision);
  }else if(missing().some((s:any)=>s.mediaProvider==='manual'))return manual();
  if(project!.data.mediaProvider!=='muse')await command('media_provider',{provider:'muse'},'muse_'+project!.revision);
  const preview=await o.bridge.musePackagePreview({projectId:project!.id,mode:'auto'});
  if(preview.blocked)return stop('Có lượt Muse cần đối soát. Mở Tín hiệu để kiểm tra kết quả cũ; app chưa gửi thêm.','attention');
  if(preview.night?.stopped||(preview.night?.remaining!=null&&(preview.sendCount??preview.count)>preview.night.remaining))return museOnly?stop(preview.night?.stopReason||'Số lượt còn lại chưa đủ. Kiểm tra giới hạn trong Cài đặt; chưa gửi cảnh nào.'):manual();
  await o.bridge.prepareVideoRenders?.({projectId:project!.id});
  progress('Đang tạo');timing('dispatch_start');
  if(preview.count){try{await o.bridge.musePackageStart({projectId:project!.id,revision:project!.revision,mode:'auto'});}catch(error){status=await o.bridge.status();const night=await o.bridge.museNightStatus();if(status.musePaused||night.stopped)return museOnly?stop(night.stopReason||(error as Error).message):manual();throw error;}}
  for(let i=0;missing().length&&i<(o.maxPolls??240);i++){
   await wait(750);await refresh();timing('clips_polled');await launchAvailableRenders();progress('Đã nhận '+(project!.data.scenes.length-missing().length)+'/'+project!.data.scenes.length+' clip');if(!missing().length)break;
   status=await o.bridge.status();const night=await o.bridge.museNightStatus();if(status.musePaused||night.stopped)return museOnly?stop(night.stopReason||'Muse đã dừng. Mở Tín hiệu để xem lý do; các cảnh chưa tự chuyển sang nhập tay.'):manual();
   const jobs=(status.jobs??[]).filter((j:any)=>j.request?.projectId===project!.id);
   const rejectedBundle=jobs.find((j:any)=>['MUSE_BUNDLE_UNMAPPED','MUSE_BUNDLE_DUPLICATE','MUSE_BUNDLE_INVALID'].includes(j.failureCode));
   if(rejectedBundle&&!jobs.some((j:any)=>['queued','preflight','prepared','submitting','submitted','waiting','downloading','validating'].includes(j.state)))return stop(rejectedBundle.failureDetail||'Gói Muse thiếu hoặc trùng clip. Chưa nhận bộ video; mở Tín hiệu để đối soát.','attention');
   if(jobs.some((j:any)=>['unknown','needs_attention'].includes(j.state))&&!jobs.some((j:any)=>['queued','preflight','prepared','submitting','submitted','waiting','downloading','validating'].includes(j.state)))return stop('Thiếu '+missing().length+' clip. Hồ sơ bị từ chối đã dừng gửi; các công tắc vẫn bật. Mở Tín hiệu để đối soát, chưa gửi lại.','attention');
  }
  if(missing().length)return stop('Muse vẫn đang xử lý hoặc chưa có clip. Mở Tín hiệu xem tiến độ; bấm Làm video để tiếp tục kiểm kết quả, không tạo dự án mới.','waiting');
 }
 await launchAvailableRenders();await Promise.all(renders.values());if(renderError)throw renderError;timing('done');
 progress('Xong');return {state:'done',project};
}
