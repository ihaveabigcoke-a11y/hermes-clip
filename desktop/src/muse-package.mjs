import {z} from 'zod';
import {createHash} from 'node:crypto';
import {assertMuseNewTask} from './muse-pause.mjs';
const input=z.object({projectId:z.string().regex(/^[\w-]{1,120}$/),revision:z.number().int().positive().optional()});
export class MusePackage {
 constructor({worker,manual,domain}){Object.assign(this,{worker,manual,domain});this.busy=false;}
 async preview(raw){
  const d=input.parse(raw),records=await this.manual.records(),project=records.find(r=>r.kind==='production'&&r.id===d.projectId),p=project?.data,product=records.find(r=>r.id===p?.productId&&r.kind==='product');
  if(!project||(d.revision!==undefined&&project.revision!==d.revision)||!product||product.data.archived||product.revision!==p.productRevision)throw Error('Dự án hoặc sản phẩm đã đổi. Tải lại trước khi gửi.');
  const jobs=this.worker.store.jobs(),scenes=p.scenes.filter(s=>s.storyboardApproved&&s.mediaType==='video'&&!s.takes.some(t=>t.sceneRevision===s.revision)&&!jobs.some(j=>j.request.projectId===project.id&&j.request.sceneId===s.id&&j.request.sceneRevision===s.revision));
  for(const s of scenes){const reason=this.domain.sceneGate(p,s);if(reason)throw Error(reason);if(s.duration>8)throw Error('Gói Muse: mỗi lượt tối đa 8 giây. Chia lượt tạo trong Khung content.');if((s.mediaProvider??p.mediaProvider)==='manual')throw Error('Chọn Muse cho dự án/cảnh trước khi gửi gói.');}
  const blocked=p.scenes.filter(s=>jobs.some(j=>j.request.projectId===project.id&&j.request.sceneId===s.id&&['needs_attention','unknown','submitting','submitted','waiting','downloading'].includes(j.state)));
  return {project,product,records,scenes,public:{projectId:project.id,revision:project.revision,count:scenes.length,blocked:blocked.length,night:this.worker.night.status()}};
 }
 async start(raw){if(this.busy)throw Error('Đang chuẩn bị gói Muse.');this.busy=true;
  try{
   if(!raw.revision)throw Error('Xem số lượt và phiên bản gói trước khi gửi.');
   assertMuseNewTask(this.worker.store);const plan=await this.preview(raw);
   if(plan.project.data.paused||plan.records.some(r=>r.kind==='settings'&&r.data.paused))throw Error('Đang tạm dừng giao việc. Mở lại trước khi tạo gói.');
   if(!plan.scenes.length)throw Error('Không có lượt mới đã duyệt; giữ job cũ để đối soát.');
   if(plan.public.blocked)throw Error('Có kết quả Muse chưa rõ trong dự án. Đối soát trước khi gửi gói mới.');
   if(!this.worker.config()?.enabled)throw Error('Cấu hình luồng Muse trước khi gửi.');
   this.worker.night.begin();this.worker.night.assertRoom(plan.scenes.length);
   const requests=[];
   for(const scene of plan.scenes){const references=[];
    for(const pin of scene.references){const ref=plan.project.data.references.find(r=>r.id===pin.id&&r.version===pin.version),asset=plan.records.find(r=>r.kind==='asset'&&r.id===ref?.assetId);if(!asset?.data.type.startsWith('image/')||!asset.data.sha256)throw Error('Tham chiếu phải là ảnh đã kiểm.');
     const response=await this.manual.request('/api/assets/'+asset.id);if(!response.ok)throw Error('Không đọc được ảnh tham chiếu.');const bytes=new Uint8Array(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==asset.data.sha256)throw Error('Ảnh tham chiếu sai hash.');references.push({id:ref.id,version:ref.version,role:ref.role,type:asset.data.type,sha256:asset.data.sha256,bytes});}
    requests.push({projectId:plan.project.id,productId:plan.product.id,productRevision:plan.product.revision,sceneId:scene.id,sceneRevision:scene.revision,name:scene.name,mediaType:scene.mediaType,ratio:scene.ratio,duration:scene.duration,prompt:[`Create a vertical 9:16 video, exactly ${scene.duration} seconds.`,scene.prompt,scene.action&&'Action: '+scene.action,scene.camera&&'Camera: '+scene.camera,scene.voice&&'Audio: '+scene.voice,'Do not add text overlays; text is added during editing. Preserve the reference product.'].filter(Boolean).join('\n'),references});
   }
   // Verify revision again after source I/O; enqueue is idempotent and no network send happens until start.
   await this.preview(raw);const jobIds=[];for(const request of requests){const result=await this.worker.enqueue(request);if(result.job.state==='queued')jobIds.push(result.job.id);}
   await this.worker.start({count:jobIds.length,jobIds,maxConcurrent:1});return {jobIds,count:jobIds.length,night:this.worker.night.status()};
  }finally{this.busy=false;}
 }
}
