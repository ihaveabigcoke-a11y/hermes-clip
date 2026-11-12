import {writeArchive} from './compress.mjs';
import {assertDiskSpace,storagePolicy,putImmutableMedia} from './storage-policy.mjs';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {join,dirname,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {validateMedia,toolchain} from './media.mjs';
import {analyzeLocalStructure,checkedBytes,verifyJpeg} from './reference-structure.mjs';
import {shortsUrl,youtubeCapability,downloadYoutubeReference} from './reference-youtube.mjs';
import {runReferenceCommand} from './reference-process.mjs';
import {exportReaPack,productAss,overlayCopySchema} from './rea-pack.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const lock=JSON.parse(await readFile(join(here,'../integrations-lock.json'),'utf8'));
const executable=z.string().trim().min(1).max(500).refine(v=>!/[\r\n\0]/.test(v)&&!v.startsWith('-'),'Executable path is invalid.');
export const integrationConfig=z.object({python:executable,reach:executable,montage:z.string().trim().min(1).max(1000).refine(isAbsolute,'Chọn đường dẫn tuyệt đối đến OpenMontage.'),reaPython:executable.optional(),reaVideo:z.string().refine(isAbsolute).optional()});
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const source=z.object({bytes:z.instanceof(Uint8Array).refine(v=>v.length>0&&v.length<=25*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export const researchInput=z.object({projectId:id,channel:z.enum(['web','youtube','reddit','instagram']),query:z.string().trim().min(2).max(300).refine(v=>!v.startsWith('-'),'Không bắt đầu truy vấn bằng dấu gạch ngang.')});
export const referenceInput=source.extend({projectId:id,assetId:id,name:z.string().max(180)});
export const composeInput=z.object({projectId:id,variantId:id,ratio:z.enum(['9:16','16:9','1:1','4:3','3:4']),clips:z.array(source.extend({duration:z.number().positive().max(120)})).min(1).max(30)}).superRefine((v,c)=>{if(v.clips.reduce((n,x)=>n+x.bytes.length,0)>60*1024*1024)c.addIssue({code:'custom',message:'Tổng nguồn dựng tối đa 60 MB.'});});

// No shell, no caller-provided argv; kill the local subprocess tree on timeout.
export function runJson(command,args,{input,timeout=60000,cwd,format='json',maxBytes=4*1024*1024}={}){
 maxBytes=Math.min(4*1024*1024,Math.max(1,maxBytes));
 return new Promise((resolve,reject)=>{let stdout='',stdoutBytes=0,stderr='',done=false;const child=spawn(command,args,{cwd,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  function stop(){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{child.kill();});else try{process.kill(-child.pid,'SIGKILL');}catch{} }
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);}
  const timer=setTimeout(()=>{stop();finish(Error('Tác vụ quá thời gian; đã dừng tiến trình local. Kết quả trước vẫn được giữ.'));},timeout);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',b=>{if(done)return;stdoutBytes+=Buffer.byteLength(b,'utf8');if(stdoutBytes>maxBytes){stop();finish(Error('Kết quả vượt giới hạn đọc.'));return;}stdout+=b;});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});
  child.on('error',()=>finish(Object.assign(Error('Không mở được công cụ. Kiểm tra đường dẫn Python/Agent Reach.'),{unavailable:true})));
  child.on('close',code=>{if(done)return;if(format==='text')return code===0?finish(null,stdout):finish(Error('Không đọc được trợ giúp CLI local.'));let data;try{data=JSON.parse(stdout.trim());}catch{return finish(Error(`Công cụ không trả JSON hợp lệ (exit ${code}). Kiểm tra cài đặt local.`));}if(!data||typeof data!=='object'||Array.isArray(data))return finish(Error('Công cụ không trả đối tượng JSON hợp lệ. Kiểm tra cài đặt local.'));if(code!==0||data.ok!==true)return finish(Error(data.error?.hint||data.error?.message||data.error||'Công cụ báo lỗi; chưa có kết quả xác minh.'));finish(null,data);});
  child.stdin.on('error',()=>{});child.stdin.end(input?JSON.stringify(input):undefined);
 });
}

export class Integrations {
 constructor(store,root,run=runJson,referenceRun=runReferenceCommand){this.store=store;this.root=root;this.run=run;this.referenceRun=referenceRun;this.busy=false;this.pending=[];this.current=null;this.stopped=false;const jobs=this.jobs();if(jobs.some(j=>['queued','running'].includes(j.state)))this.store.set('integration-jobs',jobs.map(j=>['queued','running'].includes(j.state)?{...j,state:'interrupted',finishedAt:Date.now(),error:'Ứng dụng đã dừng giữa tác vụ. Không tự chạy lại; file cũ được giữ.'}:j));}
 config(){return this.store.get('integrations',null);}
 jobs(){return this.store.get('integration-jobs',[]);}
 status(){return {config:this.config(),health:this.store.get('integration-health',null),autoSourceCheck:this.autoSourceCheck(),jobs:this.jobs().map(({frames,...j})=>({...j,frameCount:frames?.length??0})),busy:this.busy,lock};}
 autoSourceCheck(){return this.store.get('auto-source-check',null)??(this.store.get('integration-health',null)?.reach?.ready===true);}
 saveSourceCheckPreference(input){const value=z.object({enabled:z.boolean()}).strict().parse(input);this.store.set('auto-source-check',value.enabled);return this.status();}
 saveConfig(input){if(this.busy)throw Error('Chờ tác vụ hiện tại xong trước khi đổi cấu hình.');const value=integrationConfig.parse(input);this.store.set('integrations',value);this.store.set('integration-health',null);return true;}
 async montage(operation,extra={}) {
  const c=this.config();
  if(!c)throw Error('Cài và cấu hình hai công cụ trước.');
  const response=await this.run(c.python,[join(here,'montage_bridge.py')],{input:{checkout:c.montage,expectedCommit:lock.openMontage.commit,operation,...extra},timeout:operation==='compose'?300000:120000});
  const positiveDimension=z.number().int().positive();
  const schemas={
   doctor:z.object({ffmpeg:z.boolean(),ffprobe:z.boolean()}),
   analyze:z.object({
    source:z.object({duration:z.number().positive().max(180),width:positiveDimension,height:positiveDimension}),
    frames:z.array(z.object({path:z.string().min(1).refine(isAbsolute),timestamp_seconds:z.number().nonnegative()})).min(1).max(6)
   }).superRefine((value,context)=>{
    if(value.frames.some(frame=>frame.timestamp_seconds>value.source.duration))context.addIssue({code:'custom',message:'Khung hình vượt thời lượng nguồn.'});
   }),
   compose:z.object({output:z.string().min(1).refine(isAbsolute),engine:z.literal('openmontage_ffmpeg'),commit:z.literal(lock.openMontage.commit),cutCount:z.number().int().min(1).max(30),usageUsd:z.literal(0),creativeReview:z.literal('pending')})
  };
  if(!response||response.ok!==true||!schemas[operation]?.safeParse(response.result).success)throw Error('OpenMontage không trả kết quả hợp lệ.');
  return response;
 }

 async invokeReach(args, options) {
  const config = this.config();
  if (!config) throw Object.assign(Error('Chưa có cấu hình local.'),{unavailable:true});
  const sameEnvironment = isAbsolute(config.reach) && isAbsolute(config.python)
   && dirname(config.reach).toLowerCase() === dirname(config.python).toLowerCase();
  const usePython = process.platform === 'win32' && sameEnvironment && /[\\/]agent-reach\.exe$/i.test(config.reach);
  return this.run(usePython ? config.python : config.reach,
   usePython ? ['-m', 'agent_reach.cli', ...args] : args, options);
 }
 async reach(args, options) {
  const response = await this.invokeReach(args, options);
  if (!response || response.ok !== true) throw Error('Agent Reach không trả kết quả hợp lệ.');
  if (args[0] === 'version') {
   if (typeof response.result?.version !== 'string' || !response.result.version.trim()) {
    throw Error('Agent Reach không trả phiên bản hợp lệ.');
   }
  } else if (args[1] === 'search') {
   const limit=args[0]==='youtube'&&args[args.indexOf('--limit')+1]==='10'?10:5;
   if (!Array.isArray(response.items) || response.items.length > limit ||
       response.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw Error('Agent Reach không trả danh sách kết quả hợp lệ.');
   }
  }
  return response;
 }
 async listingCapability(){
  // Help only: never probe a URL to guess a command, never install a backend.
  const help=async args=>{const value=await this.invokeReach([...args,'--help'],{format:'text',timeout:15000,maxBytes:65536});return typeof value==='string'?value.replace(/\u001b\[[\d;]*m/g,''):'';};
  try{
   const top=await help([]);
   const hasRead=text=>/^[\s│┃]*read(?:\s|$)/m.test(text);
   const command=hasRead(top)?['read']:hasRead(await help(['web']))?['web','read']:null;
   if(!command)return {command:null,error:'CLI chưa xác nhận lệnh đọc web. Kiểm tra --help của checkout Agent Reach đã ghim.'};
   const detail=await help(command);
   if(!/\burl\b/i.test(detail))return {command:null,error:'Trợ giúp lệnh đọc chưa xác nhận đối số URL.'};
   return {command,timeoutFlag:/--timeout\b/.test(detail),error:null};
  }catch(error){return {command:null,error:error.message};}
 }
 async doctor(){
  if(!this.config())throw Error('Chưa có cấu hình local.');if(this.busy)throw Error('Có tác vụ đang chạy.');this.busy=true;
  try{
   const checkedAt=Date.now();
   const reach=await this.reach(['version'],{timeout:15000}).then(value=>({ready:true,version:value.result}),error=>({ready:false,error:error.message}));
   if(reach.ready)reach.listingRead=await this.listingCapability();
   const montage=await this.montage('doctor').then(value=>({...value.result,ready:value.result.ffmpeg===true&&value.result.ffprobe===true}),error=>({ready:false,error:error.message}));
   const health={checkedAt,reach,montage};this.store.set('integration-health',health);return health;
  }finally{this.busy=false;this.drain();}
 }
 enqueue(kind,projectId,request,fn){
  if(this.stopped)throw Error('App đang đóng.');
  assertDiskSpace(this.root,128*1024**2,storagePolicy(this.store));
  const job=this.update({id:randomUUID(),kind,projectId,request,state:'queued',createdAt:Date.now(),usageUsd:0});
  this.pending.push({job,fn});this.drain();return job;
 }
 drain(){
  if(this.busy||this.current||this.stopped||!this.pending.length)return;
  const {job,fn}=this.pending.shift();
  this.current=this.task(job.kind,job.projectId,job.request,fn,job).catch(()=>{}).finally(()=>{this.current=null;this.drain();});
 }
 async idle(){while(this.current)await this.current;}
 shutdown(){this.stopped=true;for(const {job} of this.pending)this.update({...job,state:'interrupted',finishedAt:Date.now(),error:'App đã đóng trước khi kiểm nguồn; không tự chạy lại.'});this.pending=[];}
 update(job){const jobs=this.jobs(),i=jobs.findIndex(x=>x.id===job.id);if(i<0){if(jobs.length>=100)throw Error('Đã chạm 100 tác vụ tích hợp local; sao lưu trước khi mở rộng.');jobs.unshift(job);}else jobs[i]=job;this.store.set('integration-jobs',jobs);return job;}
 async task(kind,projectId,request,fn,queuedJob){if(this.busy)throw Error('Một tác vụ tích hợp đang chạy; chờ kết quả trước.');this.busy=true;let job=queuedJob;try{assertDiskSpace(this.root,128*1024**2,storagePolicy(this.store));job=this.update({...queuedJob,id:queuedJob?.id??randomUUID(),kind,projectId,request,state:'running',createdAt:queuedJob?.createdAt??Date.now(),usageUsd:kind==='research'?null:0});const dir=join(this.root,'integrations',job.id);await mkdir(dir,{recursive:true});const result=await fn(dir,job);return this.update({...this.job(job.id),...result,state:this.stopped?'interrupted':'done',finishedAt:Date.now()});}catch(e){if(job)this.update({...this.job(job.id),state:'failed',finishedAt:Date.now(),error:e.message});throw e;}finally{this.busy=false;this.drain();}}
 async research(input){const d=researchInput.parse(input),c=this.config();if(!c)throw Error('Chưa có cấu hình local.');return this.task('research',d.projectId,d,async dir=>{const args=[d.channel,'search',d.query,'--limit','5','--timeout','45'];if(d.channel!=='web')args.push('--backend','public-web');const r=await this.reach(args,{timeout:60000});const path=join(dir,'research.json.gz');await writeArchive(path,JSON.stringify({collectedAt:Date.now(),query:d.query,channel:d.channel,result:r,scope:'public-web',interpretation:'unreviewed'},null,2));return {path,result:r,scope:'public-web',interpretation:'unreviewed'};});}
 async analyze(input){const d=referenceInput.parse(input);return this.task('reference',d.projectId,{assetId:d.assetId,name:d.name,sha256:d.sha256},async dir=>{await toolchain();const path=join(dir,'source.mp4');await this.writeSource(d,path);const r=await this.montage('analyze',{source:path,outputDir:dir});const frames=await Promise.all(r.result.frames.map(async frame=>{const framePath=await this.confinedPath(dir,frame.path);const file=await stat(framePath);if(!file.isFile()||file.size===0||file.size>5*1024*1024)throw Error('Khung hình rỗng hoặc vượt giới hạn.');
 const frameBytes=await readFile(framePath);
 if(frameBytes.length<3||frameBytes[0]!==0xff||frameBytes[1]!==0xd8||frameBytes[2]!==0xff)throw Error('Khung hình không phải JPEG hợp lệ.');
 await validateMedia(framePath,{mediaType:'image',ratio:`${r.result.source.width}:${r.result.source.height}`});
 return {...frame,path:framePath};}));await writeArchive(join(dir,'reference-analysis.json.gz'),JSON.stringify(r.result,null,2));return {path:join(dir,'reference-analysis.json.gz'),result:{...r.result,frames:undefined},frames};});}
 async compose(input){const d=composeInput.parse(input);return this.task('compose',d.projectId,{variantId:d.variantId,ratio:d.ratio,sources:d.clips.map(({bytes,...c})=>c)},async dir=>{await toolchain();const clips=[];for(const [i,c] of d.clips.entries()){const path=join(dir,`${i}.mp4`);await this.writeSource(c,path);await validateMedia(path,{mediaType:'video',ratio:d.ratio,duration:c.duration});clips.push({path,duration:c.duration});}const [rw,rh]=d.ratio.split(':').map(Number),width=d.ratio==='9:16'?720:d.ratio==='16:9'?1280:960,height=Math.round(width*rh/rw/2)*2;const r=await this.montage('compose',{outputDir:dir,size:[width,height],clips});const outputPath=await this.confinedPath(dir,join(dir,'output.mp4')),report=await validateMedia(outputPath,{mediaType:'video',ratio:d.ratio,duration:clips.reduce((n,c)=>n+c.duration,0)});return {path:outputPath,result:r.result,output:{path:outputPath,name:`openmontage_${jobSafe(d.variantId)}.mp4`,type:'video/mp4',...report}};});}
 async analyzeStructure(input){
  const d=referenceInput.parse(input);
  return this.task('reference-structure',d.projectId,{assetId:d.assetId,name:d.name,sha256:d.sha256},async dir=>{
   const path=join(dir,'source.mp4');await this.writeSource(d,path);
   return this.structureResult(dir,path,d.sha256);
  });
 }
 async structureResult(dir,path,checksum){
  if(this.rea&&await this.rea.available()){
   const {data,elapsedMs,usageUsd,...receipt}=await this.rea.analyze(dir,path,checksum);
   const frames=[];
   for(const shot of data.shots){
    const framePath=await this.confinedPath(dir,join(dir,'rea-video',shot.firstFrame??shot.frame));
    const bytes=await readFile(framePath);if(bytes.length>5*1024**2||bytes[0]!==255||bytes[1]!==216)throw Error('Ảnh shot không hợp lệ.');
    frames.push({t:shot.start,path:framePath,sha256:createHash('sha256').update(bytes).digest('hex')});
   }
   const contact=frames[0],cuts=data.shots.slice(1).map(s=>s.start);
   const structure={durationSec:data.durationSec,width:null,height:null,aspectRatio:null,cuts,cutCount:cuts.length,
    contactSheetPath:contact.path,contactSheetSha256:contact.sha256,frames,sourceSha256:checksum};
   const structurePath=join(dir,'structure.json'),bytes=Buffer.from(JSON.stringify(structure));await writeFile(structurePath,bytes,{flag:'wx'});
   await checkedBytes(dir,path,checksum,25*1024**2);
   return {path:structurePath,structureSha256:createHash('sha256').update(bytes).digest('hex'),reaPath:receipt.path,reaSha256:receipt.reaSha256,
    sourceSha256:checksum,engine:'rea-video',readStatus:data.readStatus,readBy:data.readBy,elapsedMs,usageUsd,
    result:{durationSec:data.durationSec,cutCount:cuts.length,shotCount:data.shots.length,bpm:data.audio.bpm}};
  }
  const {result,...receipt}=await analyzeLocalStructure(dir,path,checksum);
  return {...receipt,sourceSha256:checksum,engine:'ffmpeg',fallbackReason:'Chưa có rea-video; dùng FFmpeg local.',result:{durationSec:result.durationSec,cutCount:result.cutCount,width:result.width,height:result.height,aspectRatio:result.aspectRatio}};
 }
 async structure(input){
  const d=z.object({id,projectId:id}).parse(input),job=this.job(d.id);
  if(job.kind!=='reference-structure'||job.state!=='done'||job.projectId!==d.projectId)throw Error('Chưa có phân tích video của dự án này.');
  const dir=join(this.root,'integrations',job.id);
  const structure=JSON.parse((await checkedBytes(dir,job.path,job.structureSha256,1024*1024)).toString('utf8'));
  // Receipts never expose arbitrary disk paths as readable IPC arguments.
  for(const frame of structure.frames)await checkedBytes(dir,frame.path,frame.sha256,5*1024*1024);
  if(job.engine!=='rea-video')await verifyJpeg(dir,structure.contactSheetPath);
  const bytes=await checkedBytes(dir,structure.contactSheetPath,structure.contactSheetSha256,5*1024*1024);
  for(const sheet of structure.contactSheets?.dense??[]) {
   await verifyJpeg(dir,sheet.path,sheet);
   await checkedBytes(dir,sheet.path,sheet.sha256,5*1024*1024);
  }
  const reaVideo=job.reaPath?this.rea.domain.reaVideoSchema.parse(JSON.parse((await checkedBytes(dir,job.reaPath,job.reaSha256,3*1024**2)).toString('utf8'))):null;
  return {jobId:job.id,projectId:job.projectId,name:job.request.name,sourceSha256:job.sourceSha256,sourceUrl:job.sourceUrl??null,subtitles:job.subtitles??[],structure,reaVideo,contactSheet:{bytes:new Uint8Array(bytes),type:'image/jpeg'}};
 }
 async reaReview(input){
  const d=z.object({id,projectId:id,text:z.string().max(2*1024*1024).optional()}).parse(input),j=this.job(d.id);
  if(j.kind!=='reference-structure'||j.state!=='done'||j.projectId!==d.projectId||j.engine!=='rea-video')throw Error('Chưa có phân tích rea-video của dự án này.');
  if(this.busy)throw Error('Chờ tác vụ đang chạy.');this.busy=true;this.rea.busy=true;
  const directory=join(this.root,'integrations',j.id),out=join(directory,'rea-video'),started=Date.now();
  try{
   if(d.text===undefined){await this.rea.reviewTasks(out);return {path:out};}
   const previous=this.rea.domain.reaVideoSchema.parse(JSON.parse((await checkedBytes(directory,j.reaPath,j.reaSha256,3*1024**2)).toString('utf8')));
   const next=await this.rea.importReview(directory,previous,d.text);
   this.update({...j,reaPath:next.path,reaSha256:next.reaSha256,readStatus:next.data.readStatus,readBy:next.data.readBy,
    reviewElapsedMs:Date.now()-started,reviewedAt:Date.now()});return {readStatus:next.data.readStatus};
  }finally{this.busy=false;this.rea.busy=false;this.drain();}
 }
 async reaPack(input){
  const d=z.object({id,projectId:id,productName:z.string().min(1).max(150),copies:z.array(z.object({id:z.string(),text:z.string()})).max(2000)}).parse(input),j=this.job(d.id);
  if(j.kind!=='reference-structure'||j.state!=='done'||j.projectId!==d.projectId||j.engine!=='rea-video')throw Error('Chưa có mẫu rea-video của dự án này.');
  if(this.busy)throw Error('Chờ tác vụ hiện tại.');this.busy=true;
  try{const dir=join(this.root,'integrations',j.id);assertDiskSpace(this.root,128*1024**2,storagePolicy(this.store));
   const data=this.rea.domain.reaVideoSchema.parse(JSON.parse((await checkedBytes(dir,j.reaPath,j.reaSha256,3*1024**2)).toString('utf8')));
   return await exportReaPack(dir,data,d);
  }finally{this.busy=false;this.drain();}
 }
 async reaAss(input,duration){
  const d=z.object({id,projectId:id,copies:overlayCopySchema}).parse(input),j=this.job(d.id);
  if(j.kind!=='reference-structure'||j.state!=='done'||j.projectId!==d.projectId||j.engine!=='rea-video')throw Error('Mẫu chữ đè chưa sẵn sàng.');
  const dir=join(this.root,'integrations',j.id),data=this.rea.domain.reaVideoSchema.parse(JSON.parse((await checkedBytes(dir,j.reaPath,j.reaSha256,3*1024**2)).toString('utf8')));
  if(Math.abs(duration-data.durationSec)>.25)throw Error('Timeline ghép phải cùng thời lượng mẫu để giữ đúng mốc chữ đè. Chọn mẫu khác hoặc dùng gói manual để chỉnh mốc.');
  const path=await this.confinedPath(dir,join(dir,'rea-video','packaging','overlays.ass'));if((await stat(path)).size>1024**2)throw Error('ASS vượt giới hạn.');
  return productAss(await readFile(path,'utf8'),data,d.copies);
 }
 async youtubeStatus(){
  if(this.busy)throw Error('Một tác vụ tích hợp đang chạy; chờ kết quả trước.');this.busy=true;
  try{const capability=await youtubeCapability(this.referenceRun,this.config(),this.invokeReach.bind(this));return {supported:capability.supported,error:capability.error};}
  finally{this.busy=false;this.drain();}
 }
 async analyzeYoutube(input){
  const d=z.object({projectId:id,url:z.string().max(2048).transform(shortsUrl)}).parse(input);
  return this.task('reference-structure',d.projectId,{name:'YouTube Shorts',sourceUrl:d.url},async dir=>{
   const capability=await youtubeCapability(this.referenceRun,this.config(),this.invokeReach.bind(this));
   const downloaded=await downloadYoutubeReference({run:this.referenceRun,reach:this.reach.bind(this),capability,url:d.url,directory:dir});
   return {...await this.structureResult(dir,downloaded.path,downloaded.sha256),sourceUrl:downloaded.sourceUrl,subtitles:downloaded.subtitles};
  });
 }
 async writeSource(value,path){if(createHash('sha256').update(value.bytes).digest('hex')!==value.sha256)throw Error('Nguồn sai checksum; chưa gọi công cụ.');await putImmutableMedia({root:this.root,path,bytes:value.bytes,candidates:this.store.jobs().filter(j=>j.output?.sha256===value.sha256).map(j=>j.output.path),policy:storagePolicy(this.store)});}
 job(idValue){const j=this.jobs().find(j=>j.id===id.parse(idValue));if(!j)throw Error('Không tìm thấy tác vụ tích hợp.');return j;}
 async frames(idValue){const j=this.job(idValue);if(j.kind!=='reference'||j.state!=='done')throw Error('Chưa có khung hình để xem.');return Promise.all(j.frames.map(async f=>{const p=await realpath(f.path),root=await realpath(join(this.root,'integrations',j.id));if(relative(root,p).startsWith('..')||isAbsolute(relative(root,p)))throw Error('Khung hình nằm ngoài tác vụ.');if((await stat(p)).size>5*1024*1024)throw Error('Khung hình quá lớn.');return {timestamp:f.timestamp_seconds,path:p,bytes:new Uint8Array(await readFile(p)),type:'image/jpeg'};}));}
 async confinedPath(directory,path){
  const root=await realpath(directory),resolved=await realpath(path);
  const offset=relative(root,resolved);
  if(offset==='..'||offset.startsWith('../')||offset.startsWith('..\\')||isAbsolute(offset))throw Error('File nằm ngoài tác vụ.');
  return resolved;
 }
 async output(idValue){const j=this.job(idValue);if(j.kind!=='compose'||j.state!=='done'||!j.output)throw Error('Chưa có MP4 đã kiểm tra.');const outputPath=await this.confinedPath(join(this.root,'integrations',j.id),j.output.path);const bytes=new Uint8Array(await readFile(outputPath));if(createHash('sha256').update(bytes).digest('hex')!==j.output.sha256)throw Error('File đã đổi sau khi kiểm tra.');return {bytes,...j.output};}
}
const jobSafe=v=>v.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
