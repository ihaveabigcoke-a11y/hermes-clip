import {z} from 'zod';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {assertMuseNewTask} from './muse-pause.mjs';
import {museMediaPrompt} from './muse-video-prompt.mjs';
import {lastVideoFrame,videoSeam} from './long-video-frames.mjs';

const id=z.string().regex(/^[\w-]{1,120}$/);
const startInput=z.object({projectId:id,revision:z.number().int().positive(),requestId:id.max(80)});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const signature=value=>hash(JSON.stringify(canonical(value)));
const running=new Set(['running','composing']);
const failed=new Set(['failed','cancelled','needs_attention','unknown']);
const safe=error=>String(error?.message??error).replace(/https?:\/\/\S+/g,'[URL]').slice(0,600);
const approvedName=name=>['cho','duc','chim'].includes(String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').trim().toLowerCase());

// One persisted sequence, one worker job at a time. No provider implementation
// here: uploads, VPN, quota, pacing and delivery go through the existing Worker.
export class LongVideo {
  constructor({worker,manual,integrations,local,domain,changed=()=>{},now=Date.now,wait=delay,extract=lastVideoFrame,seam=videoSeam}){
    Object.assign(this,{worker,manual,integrations,local,domain,changed,now,wait,extract,seam});
    this.starting=false;this.tasks=new Map();
    // Restart never authorizes another send. Existing receipts remain recoverable.
    for(const run of this.runs())if(running.has(run.state))this.save({...run,state:'stopped',reason:'App đã đóng giữa chuỗi. Giữ các cảnh và đối soát lượt cũ; không tự gửi lại.',endedAt:now()});
  }
  runs(){return this.worker.store.get('long_video_runs',[]);}
  find(runId){const run=this.runs().find(r=>r.id===runId);if(!run)throw Error('Không tìm thấy chuỗi Video dài.');return run;}
  save(run){this.worker.store.set('long_video_runs',[...this.runs().filter(r=>r.id!==run.id),run]);this.changed();return run;}
  patch(runId,patch){return this.save({...this.find(runId),...patch});}
  public(run){return {id:run.id,projectId:run.projectId,state:run.state,reason:run.reason??null,createdAt:run.createdAt,endedAt:run.endedAt??null,count:run.scenes.length,jobIds:run.jobIds,completed:run.outputs.map(({assetId,sha256,duration,index})=>({assetId,sha256,duration,index})),seams:run.seams,output:run.output?{assetId:run.output.assetId,sha256:run.output.sha256,name:run.output.name,duration:run.output.metadata.duration}:null};}
  status({projectId}){id.parse(projectId);return this.runs().filter(r=>r.projectId===projectId).map(r=>this.public(r));}
  async current(projectId){
    const records=await this.manual.records(),project=records.find(r=>r.kind==='production'&&r.id===projectId),product=records.find(r=>r.kind==='product'&&r.id===project?.data.productId);
    if(!project||!product||product.data.archived||product.revision!==project.data.productRevision)throw Error('Dự án hoặc sản phẩm đã đổi; đồng bộ trước khi chạy.');
    if(project.data.paused||records.some(r=>r.kind==='settings'&&r.data.paused))throw Error('Đang tạm dừng giao việc.');
    return {records,project,product};
  }
  async plan(raw){
    const d=startInput.parse(raw),state=await this.current(d.projectId);
    if(state.project.revision!==d.revision)throw Error('Dự án đã đổi. Tải lại và xem cảnh trước khi chạy.');
    const scenes=this.domain.longVideoScenes(state.project.data);
    if(state.project.data.mediaProvider==='manual')throw Error('Dự án đang chọn nhập tay; chọn Muse trước khi chạy.');
    return {...state,scenes,settingsSignature:signature(state.project.data.longVideo)};
  }
  eligible(){return this.worker.profiles().filter(p=>approvedName(p.name)&&p.enabled&&p.vpnEnabled&&p.health==='ready'&&p.session==='signed_in'&&p.quota?.state==='available'&&!this.worker.night.profileStatus(p.id).stopped&&!p.busy);}
  assertIdle(){if(this.worker.active.size||this.worker.approvedIds.length||this.worker.chatting.size)throw Error('Chờ lượt Muse đang chạy xong trước khi bắt đầu Video dài.');}
  async start(raw){
    const d=startInput.parse(raw),existing=this.runs().find(r=>r.id===d.requestId);
    if(existing){if(existing.projectId!==d.projectId)throw Error('Mã chạy thuộc dự án khác.');return this.public(existing);}
    if(this.starting||this.tasks.size||this.worker.longVideoOwner)throw Error('Một chuỗi Video dài đang chạy.');
    this.starting=true;
    try{
      assertMuseNewTask(this.worker.store);this.assertIdle();
      const plan=await this.plan(d);
      if(this.runs().some(r=>r.projectId===d.projectId&&r.state==='stopped'))throw Error('Chuỗi cũ đã dừng. Giữ cảnh đã xong và đối soát; không tự gửi lại chuỗi.');
      if(!this.worker.config()?.enabled)throw Error('Luồng Muse chưa sẵn sàng.');
      if(!this.eligible().length)throw Error('Cần Cho, Duc hoặc Chim sẵn sàng và bật VPN. Chi không nhận video.');
      const scenes=[];
      for(const [index,scene] of plan.scenes.entries()){
        const references=[];
        for(const pin of scene.references??[]){
          const ref=plan.project.data.references.find(r=>r.id===pin.id&&r.version===pin.version),asset=plan.records.find(r=>r.kind==='asset'&&r.id===ref?.assetId);
          if(!asset?.data.type.startsWith('image/')||!asset.data.sha256)throw Error('Ảnh tham chiếu chưa được kiểm.');
          if(['first_frame','last_frame'].includes(ref.role))throw Error('Gói Video dài tự nối khung; bỏ ảnh đầu/cuối cố định khỏi cảnh đã chọn.');
          const bytes=new Uint8Array(await (await this.manual.request('/api/assets/'+asset.id)).arrayBuffer());
          if(hash(bytes)!==asset.data.sha256)throw Error('Ảnh tham chiếu đã đổi checksum.');
          references.push({id:ref.id,version:ref.version,role:ref.role,type:asset.data.type,sha256:asset.data.sha256,assetId:asset.id});
        }
        const prompt=museMediaPrompt([`Create a vertical 9:16 video, exactly ${scene.duration} seconds.`,scene.prompt,scene.action&&'Action: '+scene.action,scene.camera&&'Camera: '+scene.camera,scene.voice&&'Audio: '+scene.voice,index>0&&'Use the attached FIRST FRAME as the exact opening composition. Continue its subject, lighting and camera position naturally.','Keep natural sound. Do not add text overlays.'].filter(Boolean).join('\n'),'video');
        scenes.push({name:scene.name,prompt,duration:scene.duration,references,keepCharacter:scene.keepCharacter===true});
      }
      // I/O above cannot authorize a stale project or overlap another flow.
      const latest=await this.plan(d);if(latest.settingsSignature!==plan.settingsSignature)throw Error('Cài đặt đã đổi.');
      this.assertIdle();this.worker.night.begin();this.worker.night.assertRoom(scenes.length);
      const run=this.save({id:d.requestId,projectId:d.projectId,productId:plan.product.id,productRevision:plan.product.revision,settingsSignature:plan.settingsSignature,scenes,state:'running',createdAt:this.now(),jobIds:[],outputs:[],seams:[],requests:[],frames:[]});
      this.worker.longVideoOwner=run.id;
      const task=this.execute(run.id).catch(error=>this.stop(run.id,safe(error))).finally(()=>{if(this.worker.longVideoOwner===run.id)this.worker.longVideoOwner=null;this.tasks.delete(run.id);});
      this.tasks.set(run.id,task);return this.public(run);
    }finally{this.starting=false;}
  }
  async assertRequest(request){
    const run=this.find(request.longVideo?.runId),expected=run.requests[request.longVideo?.index];
    if(run.state!=='running'||this.worker.longVideoOwner!==run.id||!expected)throw Error('Chuỗi đã dừng; không gửi thêm cảnh.');
    const simplify=r=>({...r,references:r.references.map(({bytes,path,...ref})=>ref)});
    if(signature(simplify(request))!==signature(simplify(expected)))throw Error('Lượt gửi không khớp cảnh đã duyệt của chuỗi.');
    const {project,product}=await this.current(run.projectId);
    if(!project.data.longVideo?.enabled||signature(project.data.longVideo)!==run.settingsSignature||product.revision!==run.productRevision)throw Error('Cài đặt hoặc sản phẩm đã đổi; dừng chuỗi và giữ cảnh đã xong.');
  }
  async upload(output,commandId){
    const form=new FormData();
    if(this.local?.registerPreparedMedia)form.append('preparedToken',this.local.registerPreparedMedia({...output,type:'video/mp4'}));
    else form.append('file',new File([output.bytes??await readFile(output.path)],output.name,{type:'video/mp4'}));
    form.append('commandId',commandId);
    const asset=await (await this.manual.request('/api/assets',{method:'POST',body:form})).json();
    if(asset.sha256!==output.sha256)throw Error('Checksum nhập file không khớp.');
    return asset.id;
  }
  async importJob(jobId){
    const job=this.worker.store.job(jobId),run=this.find(job.request.longVideo.runId);
    if(!run.jobIds.includes(jobId))throw Error('Clip không thuộc chuỗi đã duyệt.');
    const assetId=job.uploadedAssetId??await this.upload({...job.output,...await this.worker.output(jobId)},'desktop_'+jobId);
    this.worker.acknowledge(jobId,assetId);
    const index=job.request.longVideo.index,latest=this.find(run.id);
    if(!latest.outputs.some(output=>output.index===index))this.patch(run.id,{outputs:[...latest.outputs,{...job.output,assetId,index,duration:job.output.metadata.duration}].sort((a,b)=>a.index-b.index)});
    return assetId;
  }
  async waitJob(runId,jobId){
    const deadline=this.now()+((this.worker.config()?.timeoutSeconds??300)+300+this.worker.night.settings().intervalSeconds)*1000;
    while(this.now()<deadline){
      const job=this.worker.store.job(jobId);
      if(failed.has(job.state))throw Error(job.failureDetail||job.history.at(-1)?.note||'Cảnh lỗi; chuỗi đã dừng.');
      if(this.find(runId).state!=='running')throw Error('Chuỗi đã dừng.');
      if(job.state==='ready'&&!this.worker.active.size){if(job.importError)throw Error(job.importError);return job;}
      if(this.worker.paused||(job.state==='queued'&&!this.worker.approvedIds.includes(jobId)))throw Error('Đã dừng giao việc; cảnh còn lại chưa gửi.');
      await this.wait(250);
    }
    throw Error('Quá thời gian chờ cảnh. Giữ lượt cũ để đối soát; không gửi lại.');
  }
  async execute(runId){
    const clips=[],directory=join(this.worker.root,'long-video',runId);
    for(let index=0;index<this.find(runId).scenes.length;index++){
      let run=this.find(runId);if(run.state!=='running')return;
      const scene=run.scenes[index],references=[];
      for(const ref of scene.references){const {assetId,...rest}=ref;const bytes=new Uint8Array(await (await this.manual.request('/api/assets/'+assetId)).arrayBuffer());if(hash(bytes)!==ref.sha256)throw Error('Ảnh tham chiếu đã đổi checksum.');references.push({...rest,bytes});}
      if(index){const frame=run.frames[index-1];references.push({id:`frame_${index}`,version:1,role:'first_frame',type:'image/png',sha256:frame.sha256,bytes:new Uint8Array(await readFile(frame.path))});}
      const request={projectId:run.projectId,productId:run.productId,productRevision:run.productRevision,sceneId:`lv_${run.id}_${index}`.slice(0,120),sceneRevision:1,name:scene.name,mediaType:'video',ratio:'9:16',duration:scene.duration,prompt:scene.prompt,references,longVideo:{runId,index}};
      if(scene.keepCharacter){if(!this.worker.resolveCharacterReferences)throw Error('Thư viện nhân vật chưa sẵn sàng.');request.references=await this.worker.resolveCharacterReferences(request.prompt,references);}
      run=this.patch(runId,{requests:[...run.requests,{...request,references:request.references.map(({bytes,...r})=>r)}]});
      await this.assertRequest(request);this.worker.night.assertRoom(1);
      const profiles=this.eligible().sort((a,b)=>(this.worker.night.profileStatus(a.id).nextSubmitAt??0)-(this.worker.night.profileStatus(b.id).nextSubmitAt??0));
      if(!profiles.length)throw Error('Hồ sơ chưa sẵn sàng; dừng chuỗi, không đổi hồ sơ để né lỗi.');
      const {job}=await this.worker.enqueue(request,{profileId:profiles[0].id});
      this.patch(runId,{jobIds:[...this.find(runId).jobIds,job.id]});
      if(job.state!=='queued')throw Error('Lượt đã tồn tại; đối soát, không gửi lại.');
      if(await this.worker.start({count:1,jobIds:[job.id],maxConcurrent:1,sequenceId:runId})===false)throw Error('Đã dừng trước khi gửi cảnh.');
      const ready=await this.waitJob(runId,job.id),result=await this.worker.output(job.id);
      if(!ready.output?.fullDecode||ready.output.sha256!==result.sha256)throw Error('Clip chưa qua kiểm tra đầy đủ.');
      const assetId=ready.uploadedAssetId??await this.importJob(job.id);
      const output={...ready.output,assetId,index,duration:ready.output.metadata.duration};
      run=this.find(runId);
      if(!run.outputs.some(item=>item.index===index))run=this.patch(runId,{outputs:[...run.outputs,output]});
      clips.push({bytes:result.bytes,sha256:result.sha256,duration:output.duration});
      if(index){const seam=await this.seam(run.outputs[index-1],output,directory,index);this.patch(runId,{seams:[...this.find(runId).seams,seam]});}
      if(index<run.scenes.length-1){const frame=await this.extract(output,directory,index);this.patch(runId,{frames:[...this.find(runId).frames,frame]});}
    }
    const run=this.find(runId);if(run.state!=='running')return;
    this.patch(runId,{state:'composing'});
    const render=await this.integrations.compose({planVersion:1,projectId:run.projectId,variantId:runId,ratio:'9:16',clips,overlays:[]});
    const output=await this.integrations.output(render.id),assetId=await this.upload(output,'long_'+runId);
    this.patch(runId,{state:this.find(runId).state==='composing'?'done':'stopped',output:{...output,bytes:undefined,assetId,renderId:render.id},endedAt:this.now()});
  }
  stop(runId,reason='Đã dừng chuỗi; giữ các cảnh đã xong.'){
    const run=this.find(runId);if(!running.has(run.state))return this.public(run);
    if(this.worker.longVideoOwner===runId)this.worker.pause();
    return this.public(this.patch(runId,{state:'stopped',reason,endedAt:this.now()}));
  }
  shutdown(){for(const run of this.runs())if(running.has(run.state))this.stop(run.id,'App đang đóng; giữ cảnh và đối soát trước khi gửi mới.');}
}
