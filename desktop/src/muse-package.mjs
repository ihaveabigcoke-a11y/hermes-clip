import {z} from 'zod';
import {createHash} from 'node:crypto';
import {assertMuseNewTask} from './muse-pause.mjs';
const input=z.object({projectId:z.string().regex(/^[\w-]{1,120}$/),revision:z.number().int().positive().optional()});
const activeStates=['preflight','prepared','preparing','submitting','submitted','waiting','downloading','validating'];
const uncertainStates=['needs_attention','unknown'];
// Only an explicitly started package may retry a job proven never submitted.
export const neverSubmitted=job=>!job.submitBatchId&&!job.providerId&&!job.providerUrl&&!job.output&&!(job.history??[]).some(h=>['submitting','submitted','waiting','downloading','validating','ready'].includes(h.state));
export class MusePackage {
 constructor({worker,manual,domain}){Object.assign(this,{worker,manual,domain});this.busy=false;}
 async preview(raw){
  const d=input.parse(raw),records=await this.manual.records(),project=records.find(r=>r.kind==='production'&&r.id===d.projectId),p=project?.data,product=records.find(r=>r.id===p?.productId&&r.kind==='product');
  if(!project||(d.revision!==undefined&&project.revision!==d.revision)||!product||product.data.archived||product.revision!==p.productRevision)throw Error('Dự án hoặc sản phẩm đã đổi. Tải lại trước khi gửi.');
  const jobs=this.worker.store.jobs(),scenes=[],queued=[],retryable=[],blocked=new Set(),pending=new Set();
  for(const scene of p.scenes){
   const all=jobs.filter(j=>j.request.projectId===project.id&&j.request.sceneId===scene.id);
   // A manual fallback mark does not authorize resending an unresolved request.
   if(all.some(j=>uncertainStates.includes(j.state)))blocked.add(scene.id);
   if(!scene.storyboardApproved||scene.mediaType!=='video'||scene.takes.some(t=>t.sceneRevision===scene.revision&&t.review!=='rejected'))continue;
   const matching=all.filter(j=>j.request.sceneRevision===scene.revision).sort((a,b)=>b.createdAt-a.createdAt);
   if(all.some(j=>activeStates.includes(j.state))){pending.add(scene.id);continue;}
   if(blocked.has(scene.id))continue;
   const latest=matching[0];
   if(latest?.state==='ready'){blocked.add(scene.id);continue;} // Download/import must be reconciled, never regenerate.
   if(latest?.state==='queued'&&(this.worker.approvedIds??[]).includes(latest.id)){pending.add(scene.id);continue;}
   if(latest&&latest.request.productRevision!==product.revision){blocked.add(scene.id);continue;}
   if(latest&&['failed','cancelled'].includes(latest.state)&&!neverSubmitted(latest)&&latest.reconciled!==true){blocked.add(scene.id);continue;}
   if(latest&&!['queued','failed','cancelled'].includes(latest.state)){blocked.add(scene.id);continue;}
   const reason=this.domain.sceneGate(p,scene);if(reason)throw Error(reason);
   if(scene.duration>8)throw Error('Gói Muse: mỗi lượt tối đa 8 giây. Chia lượt tạo trong Khung content.');
   if((scene.mediaProvider??p.mediaProvider)==='manual')throw Error('Chọn Muse cho dự án/cảnh trước khi gửi gói.');
   if(!latest)scenes.push(scene);
   else if(latest.state==='queued')queued.push(latest);
   else retryable.push(latest);
  }
  return {project,product,records,scenes,queued,retryable,public:{projectId:project.id,revision:project.revision,count:scenes.length+queued.length+retryable.length,newCount:scenes.length,queuedCount:queued.length,retryableCount:retryable.length,pending:pending.size,blocked:blocked.size,night:this.worker.night.status()}};
 }
 async start(raw){if(this.busy)throw Error('Đang chuẩn bị gói Muse.');this.busy=true;
  try{
   if(!raw.revision)throw Error('Xem số lượt và phiên bản gói trước khi gửi.');
   assertMuseNewTask(this.worker.store);const plan=await this.preview(raw);
   if(plan.project.data.paused||plan.records.some(r=>r.kind==='settings'&&r.data.paused))throw Error('Đang tạm dừng giao việc. Mở lại trước khi tạo gói.');
   if(plan.public.blocked)throw Error('Có kết quả Muse cần kiểm trong dự án. Đối soát trước khi gửi gói mới.');
   if(!plan.public.count)throw Error('Không có lượt mới đã duyệt; giữ job cũ để đối soát.');
   if(!this.worker.config()?.enabled)throw Error('Cấu hình luồng Muse trước khi gửi.');
   this.worker.night.begin();this.worker.night.assertRoom(plan.public.count);
   const requests=[];
   for(const scene of plan.scenes){const references=[];
    for(const pin of scene.references){const ref=plan.project.data.references.find(r=>r.id===pin.id&&r.version===pin.version),asset=plan.records.find(r=>r.kind==='asset'&&r.id===ref?.assetId);if(!asset?.data.type.startsWith('image/')||!asset.data.sha256)throw Error('Tham chiếu phải là ảnh đã kiểm.');
     const response=await this.manual.request('/api/assets/'+asset.id);if(!response.ok)throw Error('Không đọc được ảnh tham chiếu.');const bytes=new Uint8Array(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.data.sha256)throw Error('Ảnh tham chiếu sai hash.');references.push({id:ref.id,version:ref.version,role:ref.role,type:asset.data.type,sha256:asset.data.sha256,bytes});}
    requests.push({projectId:plan.project.id,productId:plan.product.id,productRevision:plan.product.revision,sceneId:scene.id,sceneRevision:scene.revision,name:scene.name,mediaType:scene.mediaType,ratio:scene.ratio,duration:scene.duration,prompt:[`Create a vertical 9:16 video, exactly ${scene.duration} seconds.`,scene.prompt,scene.action&&'Action: '+scene.action,scene.camera&&'Camera: '+scene.camera,scene.voice&&'Audio: '+scene.voice,'Do not add text overlays; text is added during editing. Preserve the reference product.'].filter(Boolean).join('\n'),references});
   }
   // Revalidate source and receipts after I/O, before enqueue/retry/start.
   const current=await this.preview(raw);
   const signature=p=>JSON.stringify({scenes:p.scenes.map(s=>s.id),queued:p.queued.map(j=>j.id),retry:p.retryable.map(j=>j.id),blocked:p.public.blocked});
   if(signature(current)!==signature(plan))throw Error('Hàng chờ Muse đã đổi. Tải lại trước khi tiếp tục.');
   const jobIds=plan.queued.map(j=>j.id);
   for(const old of plan.retryable){const job=await this.worker.retry(old.id);jobIds.push(job.id);}
   for(const request of requests){const result=await this.worker.enqueue(request);if(result.job.state==='queued')jobIds.push(result.job.id);}
   const started=await this.worker.start({count:jobIds.length,jobIds,maxConcurrent:1});
   if(started===false)throw Error('Muse đã dừng trước khi giao việc. Nháp được giữ để tiếp tục.');
   return {jobIds,count:jobIds.length,night:this.worker.night.status()};
  }finally{this.busy=false;}
 }
}
