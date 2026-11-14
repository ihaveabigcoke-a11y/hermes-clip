import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sessionCookie} from '../local/server.mjs';
import {assertMuseNewTask,museIsPaused} from './muse-pause.mjs';
import {fetchProductImage} from './product-image.mjs';
import {museMediaPrompt,museVideoBody} from './muse-video-prompt.mjs';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const input=z.object({batchId:id,productIds:z.array(id).min(1).max(3),profileId:id.optional()});
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stoppedStates=new Set(['failed','cancelled','needs_attention','unknown']);
export function deploymentImageSource(product,records){
  if(product.data.imageUrl)return String(product.data.imageUrl);
  const origin=product.data.researchOrigin;
  const batch=records.find(r=>r.kind==='research_batch'&&r.id===origin?.batchId);
  return String(batch?.data.candidates.find(c=>c.id===origin?.candidateId)?.imageUrl||'');
}
export function deploymentPrompt(product) {
  // Template derived from the chosen product. No invented performance, sales or safety claim.
  return museMediaPrompt(`Create a 10-second vertical 9:16 product showcase video using the attached product photo as the exact visual reference. Product: ${product.name}. Keep the entire product visible, with the same shape, color, markings, components and proportions as the reference. Place it on a neutral tabletop with soft studio light. Use a fixed camera and subtle natural lighting movement; do not morph or add parts. Do not invent a product demonstration, performance claim, certification, price or discount. No text, captions, logos added by you, speech or music. This is an internal product concept for a US English-speaking audience. Product details supplied by the user: ${String(product.invariants||'Match the reference photo.').slice(0,2000)}`, 'video');
}

export class ProductDeployment {
  constructor({worker,local,changed=()=>{},fetchImage=fetchProductImage,pollMs=1000,waitMs=40*60*1000}) {
    Object.assign(this,{worker,store:worker.store,local,changed,fetchImage,pollMs,waitMs});
    this.running=null;this.starting=null;this.stopped=false;
  }
  rows(){return this.store.get('product_deployments',[]);}
  status(){return {runs:this.rows(),active:this.running?.id??null};}
  update(id,patch){const rows=this.rows(),old=rows.find(r=>r.id===id);const row={...old,...patch,id,updatedAt:Date.now()};this.store.set('product_deployments',[row,...rows.filter(r=>r.id!==id)]);this.changed();return row;}
  item(id,index,patch){const row=this.rows().find(r=>r.id===id),items=[...row.items];items[index]={...items[index],...patch};return this.update(id,{items});}
  async request(path,options={}) {
    const response=await fetch(this.local.origin+path,{...options,headers:{Cookie:sessionCookie+'='+this.local.session,Origin:this.local.origin,...options.headers},signal:AbortSignal.timeout(120000)});
    const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Chưa lưu được đợt triển khai.'),{status:response.status});return result;
  }
  async records(){return (await this.request('/api/lab')).records;}
  async command(projectId,commandId,action,input) {
    for(let attempt=0;attempt<3;attempt++){
      const record=(await this.records()).find(r=>r.id===projectId&&r.kind==='production');
      if(record?.data.receipts.includes(commandId))return record;
      try{return (await this.request('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:projectId,revision:record?.revision??0,commandId,action,input})})).record;}
      catch(e){if(e.status!==409||attempt===2)throw e;}
    }
  }
  async start(payload) {
    const value=input.parse(payload);value.productIds=[...new Set(value.productIds)].sort();
    const runId='deploy_'+hash(value.batchId+'\0'+value.productIds.join('\0'));
    const existing=this.rows().find(r=>r.id===runId);if(existing)return existing;
    if(this.starting){await this.starting;const saved=this.rows().find(r=>r.id===runId);if(saved)return saved;throw Error('Một đợt khác đang được chuẩn bị.');}
    this.starting=this.admit(value,runId);
    try{return await this.starting;}finally{this.starting=null;}
  }
  async admit(value,runId) {
    assertMuseNewTask(this.store);
    if(this.running||this.rows().some(r=>['queued','running'].includes(r.state)))throw Error('Chờ đợt triển khai hiện tại kết thúc.');
    if(!this.worker.config()?.enabled)throw Error('Cấu hình luồng Muse trước khi triển khai.');
    const records=await this.records(),batch=records.find(r=>r.id===value.batchId&&r.kind==='research_batch');
    const products=value.productIds.map(id=>records.find(r=>r.id===id&&r.kind==='product'));
    if(!batch||products.some(p=>!p||p.data.archived||p.data.researchOrigin?.batchId!==batch.id||!batch.data.selectedIds.includes(p.data.researchOrigin.candidateId)))throw Error('Triển khai chỉ dùng các sản phẩm đã chọn trong đúng đợt nghiên cứu.');
    const profiles=this.worker.profiles().filter(p=>p.enabled&&(!value.profileId||p.id===value.profileId));
    if(profiles.length!==1)throw Error('Chọn một hồ sơ Muse cho đợt triển khai.');
    const profile=profiles[0];
    if(profile.busy)throw Error('Hồ sơ Muse đang bận. Chờ tác vụ hiện tại kết thúc.');
    assertMuseNewTask(this.store);if(this.stopped)throw Error('App đang đóng.');
    const museBatch=this.store.batch()??this.store.newBatch();
    const row=this.update(runId,{batchId:value.batchId,profileId:profile.id,profileName:profile.name,museBatchId:museBatch.id,state:'queued',createdAt:Date.now(),error:'',approval:'User requested automatic preparation and generation; final video review remains manual.',items:products.map(p=>({productId:p.id,productRevision:p.revision,name:p.data.name,imageUrl:deploymentImageSource(p,records),state:'queued',error:''}))});
    this.launch(runId);return row;
  }
  launch(id){if(this.running||this.stopped||museIsPaused(this.store))return;const version=this.worker.dispatchVersion;const promise=this.run(id,version).catch(e=>this.update(id,{state:e.paused?'paused':'needs_attention',error:e.message})).finally(()=>{this.running=null;});this.running={id,promise};}
  boot(){const row=this.rows().find(r=>['queued','running'].includes(r.state));if(row)this.launch(row.id);}
  resume({id}){assertMuseNewTask(this.store);const row=this.rows().find(r=>r.id===id);if(!row)throw Error('Không tìm thấy đợt triển khai.');if(this.running)throw Error('Chờ đợt hiện tại.');if(row.state==='ready_for_review')return row;this.update(id,{state:'queued',error:''});this.launch(id);return this.rows().find(r=>r.id===id);}
  pause({id}){const row=this.rows().find(r=>r.id===id);if(!row)throw Error('Không tìm thấy đợt triển khai.');this.update(id,{state:'paused',error:'Đã tạm dừng. Tác vụ đã gửi vẫn lấy kết quả; chưa giao sản phẩm tiếp theo.'});this.worker.pause();return this.status();}
  assertContinue(row,version){
    if(this.stopped||this.worker.dispatchVersion!==version||museIsPaused(this.store)||this.rows().find(r=>r.id===row.id)?.state==='paused')throw Object.assign(Error('Đợt triển khai đã tạm dừng; dữ liệu và tác vụ đã gửi được giữ.'),{paused:true});
    if(this.store.batch()?.id!==row.museBatchId)throw Error('Đợt hạn mức Muse đã thay đổi. Không tự gửi tiếp từ đợt cũ.');
  }
  async asset(product,runId,index,sourceUrl) {
    const assetId=`upload_${runId}_image_${index}`,records=await this.records();
    const stored=records.find(r=>r.kind==='asset'&&r.id===assetId);if(stored)return {id:stored.id,...stored.data};
    const url=sourceUrl??deploymentImageSource(product,records);
    const localId=url.match(/^\/api\/assets\/([a-zA-Z0-9_-]{1,120})$/)?.[1];
    if(localId){const existing=records.find(r=>r.id===localId&&r.kind==='asset');if(!existing)throw Error('Ảnh sản phẩm đã lưu không còn tồn tại.');return {id:existing.id,...existing.data};}
    if(!url)throw Error('Sản phẩm chưa có ảnh tham chiếu. Thêm ảnh trong hồ sơ rồi tiếp tục.');
    const bytes=await this.fetchImage(url);
    const form=new FormData();form.append('file',new File([bytes],`reference-${index}.jpg`));form.append('commandId',`${runId}_image_${index}`);
    return this.request('/api/assets',{method:'POST',body:form});
  }
  async prepare(row,index,version) {
    let item=this.rows().find(r=>r.id===row.id).items[index];
    const records=await this.records(),product=records.find(r=>r.id===item.productId&&r.kind==='product');
    if(!product||product.data.archived||product.revision!==item.productRevision)throw Error('Hồ sơ sản phẩm đã thay đổi. Đối chiếu đợt trước khi gửi.');
    this.assertContinue(row,version);
    let project=item.projectId?records.find(r=>r.id===item.projectId):null;
    if(!project){project=await this.command(`${row.id}_p${index}`,`${row.id}_create${index}`,'create',{name:`Video · ${product.data.name}`.slice(0,150),productId:product.id,locale:'en-US',reuseProduct:true});this.item(row.id,index,{projectId:project.id});}
    if(project.data.paused)throw Error('Dự án đang tạm dừng. Mở lại giao việc của dự án trước khi tiếp tục.');
    if(project.data.productRevision!==product.revision)throw Error('Dự án đang dùng hồ sơ sản phẩm cũ; đồng bộ trước khi triển khai.');
    const sceneId=`${row.id}_s${index}`,refId=`${row.id}_r${index}`;
    let scene=project.data.scenes.find(s=>s.id===sceneId);
    if(!scene){
      this.item(row.id,index,{state:'preparing',step:'Đang lấy ảnh tham chiếu'});
      const imageUrl=item.imageUrl??deploymentImageSource(product,records);
      const asset=await this.asset(product,row.id,index,imageUrl);
      if(!['image/jpeg','image/png','image/webp'].includes(asset.type)||asset.size>8*1024**2)throw Error('Ảnh tham chiếu cần JPG/PNG/WebP không quá 8 MB.');
      this.assertContinue(row,version);
      project=await this.command(project.id,`${row.id}_ref${index}`,'reference',{id:refId,name:product.data.name.slice(0,150),role:'product',assetId:asset.id,sourceUrl:imageUrl.startsWith('https://')?imageUrl:'',notes:'Ảnh từ hồ sơ hoặc ứng viên nghiên cứu đã chọn; chưa tự xác nhận đúng SKU.'});
      project=await this.command(project.id,`${row.id}_scene${index}`,'scene',{id:sceneId,name:`Tự động · ${product.data.name}`.slice(0,150),role:'body',mediaType:'video',prompt:deploymentPrompt(product.data),ratio:'9:16',duration:10,referenceIds:[refId],camera:'Fixed camera',action:'Subtle lighting movement; preserve product',voice:''});
      scene=project.data.scenes.find(s=>s.id===sceneId);
    }
    if(museVideoBody(scene.prompt)!==museVideoBody(deploymentPrompt(product.data))||(item.sceneRevision&&scene.revision!==item.sceneRevision))throw Error('Cảnh tự động đã được chỉnh sửa; giữ lại để bạn kiểm tra trước khi gửi.');
    project=await this.command(project.id,`${row.id}_provider${index}`,'media_provider',{sceneId,provider:'muse'});
    // The launch click explicitly delegates script preparation. Final take.review remains pending.
    project=await this.command(project.id,`${row.id}_storyboard${index}`,'storyboard',{sceneId});
    scene=project.data.scenes.find(s=>s.id===sceneId);
    this.item(row.id,index,{sceneId,sceneRevision:scene.revision,step:'Đã chuẩn bị cảnh và ảnh'});
    const refs=[];const latest=await this.records();
    for(const pin of scene.references){
      const ref=project.data.references.find(r=>r.id===pin.id&&r.version===pin.version),asset=latest.find(r=>r.id===ref.assetId&&r.kind==='asset');
      if(!asset)throw Error('Không tìm thấy file ảnh tham chiếu.');
      const response=await fetch(this.local.origin+'/api/assets/'+asset.id,{headers:{Cookie:sessionCookie+'='+this.local.session},signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('Chưa đọc được ảnh tham chiếu.');const bytes=new Uint8Array(await response.arrayBuffer());
      refs.push({id:ref.id,version:ref.version,role:ref.role,sha256:asset.data.sha256,type:asset.data.type,bytes});
    }
    this.assertContinue(row,version);
    const job=await this.worker.enqueue({projectId:project.id,productId:product.id,productRevision:product.revision,sceneId,sceneRevision:scene.revision,name:scene.name,mediaType:'video',ratio:scene.ratio,duration:scene.duration,prompt:scene.prompt,references:refs},{profileId:row.profileId,batchId:row.museBatchId});
    this.item(row.id,index,{jobId:job.job.id,state:'queued'});return job.job;
  }
  async run(id,version) {
    const row=this.update(id,{state:'running',error:''});
    for(let index=0;index<row.items.length;index++){
      this.assertContinue(row,version);
      let item=this.rows().find(r=>r.id===id).items[index];if(item.state==='ready_for_review')continue;
      try{
        let job=item.jobId?this.store.job(item.jobId):await this.prepare(row,index,version);
        this.assertContinue(row,version);
        if(job.state==='queued'){
          this.item(id,index,{state:'running',step:'Đang giao Muse'});
          await this.worker.start({count:1,maxConcurrent:1,jobIds:[job.id]});
        }else if(job.state==='needs_attention'&&job.providerId&&job.providerUrl&&!item.recoveryAttempted){
          this.item(id,index,{recoveryAttempted:true});await this.worker.resume(job.id);
        }
        const deadline=Date.now()+this.waitMs;let observed='';
        while(true){
          job=this.store.job(job.id);
          if(job.state==='ready'){
            if(!job.importedAt)await this.worker.importReady(job.id);
            job=this.store.job(job.id);if(!job.importedAt)throw Error(job.importError||'Đã tải file nhưng chưa nhập được Thư viện.');
            this.item(id,index,{state:'ready_for_review',step:'Video đã vào Thư viện, chờ bạn duyệt',error:'',assetId:job.uploadedAssetId});break;
          }
          if(stoppedStates.has(job.state))throw Error(job.history.at(-1)?.note||'Tác vụ cần kiểm tra kết quả; chưa gửi lại.');
          this.assertContinue(row,version);
          if(job.state==='queued'&&!this.worker.approvedIds.includes(job.id))throw Error(job.history.at(-1)?.note||'Chưa thể giao việc cho Muse.');
          if(Date.now()>deadline)throw Error('Hết thời gian theo dõi lượt tạo. Giữ nguyên tác vụ để đối soát; không gửi lại.');
          if(observed!==job.state){observed=job.state;this.item(id,index,{state:'running',step:job.history.at(-1)?.note||job.state});}
          await sleep(this.pollMs);
        }
      }catch(e){if(e.paused)throw e;this.item(id,index,{state:'needs_attention',error:e.message});}
    }
    const items=this.rows().find(r=>r.id===id).items;
    this.update(id,{state:items.every(i=>i.state==='ready_for_review')?'ready_for_review':'needs_attention',finishedAt:Date.now()});
  }
  shutdown(){this.stopped=true;}
}
