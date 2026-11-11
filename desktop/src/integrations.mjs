import {assertDiskSpace,storagePolicy,putImmutableMedia} from './storage-policy.mjs';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {join,dirname,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {validateMedia,toolchain} from './media.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const lock=JSON.parse(await readFile(join(here,'../integrations-lock.json'),'utf8'));
const executable=z.string().trim().min(1).max(500).refine(v=>!/[\r\n\0]/.test(v)&&!v.startsWith('-'),'Executable path is invalid.');
export const integrationConfig=z.object({python:executable,reach:executable,montage:z.string().trim().min(1).max(1000).refine(isAbsolute,'Chọn đường dẫn tuyệt đối đến OpenMontage.')});
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const source=z.object({bytes:z.instanceof(Uint8Array).refine(v=>v.length>0&&v.length<=25*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export const researchInput=z.object({projectId:id,channel:z.enum(['web','youtube','reddit','instagram']),query:z.string().trim().min(2).max(300).refine(v=>!v.startsWith('-'),'Không bắt đầu truy vấn bằng dấu gạch ngang.')});
export const referenceInput=source.extend({projectId:id,assetId:id,name:z.string().max(180)});
export const composeInput=z.object({projectId:id,variantId:id,ratio:z.enum(['9:16','16:9','1:1','4:3','3:4']),clips:z.array(source.extend({duration:z.number().positive().max(120)})).min(1).max(30)}).superRefine((v,c)=>{if(v.clips.reduce((n,x)=>n+x.bytes.length,0)>60*1024*1024)c.addIssue({code:'custom',message:'Tổng nguồn dựng tối đa 60 MB.'});});

// No shell, no caller-provided argv; kill the local subprocess tree on timeout.
export function runJson(command,args,{input,timeout=60000,cwd}={}){
 return new Promise((resolve,reject)=>{let stdout='',stderr='',done=false;const child=spawn(command,args,{cwd,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  function stop(){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{child.kill();});else try{process.kill(-child.pid,'SIGKILL');}catch{} }
  function finish(error,value){if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);}
  const timer=setTimeout(()=>{stop();finish(Error('Tác vụ quá thời gian; đã dừng tiến trình local. Kết quả trước vẫn được giữ.'));},timeout);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4*1024*1024){stop();finish(Error('Kết quả vượt giới hạn đọc.'));}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});
  child.on('error',()=>finish(Error('Không mở được công cụ. Kiểm tra đường dẫn Python/Agent Reach.')));
  child.on('close',code=>{if(done)return;let data;try{data=JSON.parse(stdout.trim());}catch{return finish(Error(`Công cụ không trả JSON hợp lệ (exit ${code}). Kiểm tra cài đặt local.`));}if(!data||typeof data!=='object'||Array.isArray(data))return finish(Error('Công cụ không trả đối tượng JSON hợp lệ. Kiểm tra cài đặt local.'));if(code!==0||data.ok!==true)return finish(Error(data.error?.hint||data.error?.message||data.error||'Công cụ báo lỗi; chưa có kết quả xác minh.'));finish(null,data);});
  child.stdin.on('error',()=>{});child.stdin.end(input?JSON.stringify(input):undefined);
 });
}

export class Integrations {
 constructor(store,root,run=runJson){this.store=store;this.root=root;this.run=run;this.busy=false;const jobs=this.jobs();if(jobs.some(j=>j.state==='running'))this.store.set('integration-jobs',jobs.map(j=>j.state==='running'?{...j,state:'interrupted',finishedAt:Date.now(),error:'Ứng dụng đã dừng giữa tác vụ. Không tự chạy lại; file cũ được giữ.'}:j));}
 config(){return this.store.get('integrations',null);}
 jobs(){return this.store.get('integration-jobs',[]);}
 status(){return {config:this.config(),health:this.store.get('integration-health',null),jobs:this.jobs().map(({frames,...j})=>({...j,frameCount:frames?.length??0})),busy:this.busy,lock};}
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

 async reach(args, options) {
  const config = this.config();
  if (!config) throw Error('Chưa có cấu hình local.');
  const sameEnvironment = isAbsolute(config.reach) && isAbsolute(config.python)
   && dirname(config.reach).toLowerCase() === dirname(config.python).toLowerCase();
  const usePython = process.platform === 'win32' && sameEnvironment && /[\\/]agent-reach\.exe$/i.test(config.reach);
  const response = await this.run(usePython ? config.python : config.reach,
   usePython ? ['-m', 'agent_reach.cli', ...args] : args, options);
  if (!response || response.ok !== true) throw Error('Agent Reach không trả kết quả hợp lệ.');
  if (args[0] === 'version') {
   if (typeof response.result?.version !== 'string' || !response.result.version.trim()) {
    throw Error('Agent Reach không trả phiên bản hợp lệ.');
   }
  } else if (args[1] === 'search') {
   if (!Array.isArray(response.items) || response.items.length > 5 ||
       response.items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw Error('Agent Reach không trả danh sách kết quả hợp lệ.');
   }
  }
  return response;
 }
 async doctor(){const c=this.config();if(!c)throw Error('Chưa có cấu hình local.');if(this.busy)throw Error('Có tác vụ đang chạy.');const checkedAt=Date.now();const [reach,montage]=await Promise.allSettled([this.reach(['version'],{timeout:15000}),this.montage('doctor')]);const health={checkedAt,reach:reach.status==='fulfilled'?{ready:true,version:reach.value.result}: {ready:false,error:reach.reason.message},montage:montage.status==='fulfilled'?{...montage.value.result,ready:montage.value.result.ffmpeg===true&&montage.value.result.ffprobe===true}:{ready:false,error:montage.reason.message}};this.store.set('integration-health',health);return health;}
 update(job){const jobs=this.jobs(),i=jobs.findIndex(x=>x.id===job.id);if(i<0){if(jobs.length>=100)throw Error('Đã chạm 100 tác vụ tích hợp local; sao lưu trước khi mở rộng.');jobs.unshift(job);}else jobs[i]=job;this.store.set('integration-jobs',jobs);return job;}
 async task(kind,projectId,request,fn){assertDiskSpace(this.root,128*1024**2,storagePolicy(this.store));if(this.busy)throw Error('Một tác vụ tích hợp đang chạy; chờ kết quả trước.');this.busy=true;let job;try{job=this.update({id:randomUUID(),kind,projectId,request,state:'running',createdAt:Date.now(),usageUsd:kind==='research'?null:0});const dir=join(this.root,'integrations',job.id);await mkdir(dir,{recursive:true});const result=await fn(dir,job);return this.update({...job,...result,state:'done',finishedAt:Date.now()});}catch(e){if(job)this.update({...job,state:'failed',finishedAt:Date.now(),error:e.message});throw e;}finally{this.busy=false;}}
 async research(input){const d=researchInput.parse(input),c=this.config();if(!c)throw Error('Chưa có cấu hình local.');return this.task('research',d.projectId,d,async dir=>{const args=[d.channel,'search',d.query,'--limit','5','--timeout','45'];if(d.channel!=='web')args.push('--backend','public-web');const r=await this.reach(args,{timeout:60000});const path=join(dir,'research.json');await writeFile(path,JSON.stringify({collectedAt:Date.now(),query:d.query,channel:d.channel,result:r,scope:'public-web',interpretation:'unreviewed'},null,2));return {path,result:r,scope:'public-web',interpretation:'unreviewed'};});}
 async analyze(input){const d=referenceInput.parse(input);return this.task('reference',d.projectId,{assetId:d.assetId,name:d.name,sha256:d.sha256},async dir=>{await toolchain();const path=join(dir,'source.mp4');await this.writeSource(d,path);const r=await this.montage('analyze',{source:path,outputDir:dir});const frames=await Promise.all(r.result.frames.map(async frame=>{const framePath=await this.confinedPath(dir,frame.path);const file=await stat(framePath);if(!file.isFile()||file.size===0||file.size>5*1024*1024)throw Error('Khung hình rỗng hoặc vượt giới hạn.');
 const frameBytes=await readFile(framePath);
 if(frameBytes.length<3||frameBytes[0]!==0xff||frameBytes[1]!==0xd8||frameBytes[2]!==0xff)throw Error('Khung hình không phải JPEG hợp lệ.');
 await validateMedia(framePath,{mediaType:'image',ratio:`${r.result.source.width}:${r.result.source.height}`});
 return {...frame,path:framePath};}));await writeFile(join(dir,'reference-analysis.json'),JSON.stringify(r.result,null,2));return {path:join(dir,'reference-analysis.json'),result:{...r.result,frames:undefined},frames};});}
 async compose(input){const d=composeInput.parse(input);return this.task('compose',d.projectId,{variantId:d.variantId,ratio:d.ratio,sources:d.clips.map(({bytes,...c})=>c)},async dir=>{await toolchain();const clips=[];for(const [i,c] of d.clips.entries()){const path=join(dir,`${i}.mp4`);await this.writeSource(c,path);await validateMedia(path,{mediaType:'video',ratio:d.ratio,duration:c.duration});clips.push({path,duration:c.duration});}const [rw,rh]=d.ratio.split(':').map(Number),width=d.ratio==='9:16'?720:d.ratio==='16:9'?1280:960,height=Math.round(width*rh/rw/2)*2;const r=await this.montage('compose',{outputDir:dir,size:[width,height],clips});const outputPath=await this.confinedPath(dir,join(dir,'output.mp4')),report=await validateMedia(outputPath,{mediaType:'video',ratio:d.ratio,duration:clips.reduce((n,c)=>n+c.duration,0)});return {path:outputPath,result:r.result,output:{path:outputPath,name:`openmontage_${jobSafe(d.variantId)}.mp4`,type:'video/mp4',...report}};});}
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
