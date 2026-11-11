import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,rm,stat} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Store} from '../desktop/src/store.mjs';
import {Integrations,integrationConfig,researchInput} from '../desktop/src/integrations.mjs';
import {enablePortableMediaTools} from '../desktop/src/runtime-tools.mjs';
import {codexExchangeSchema,exchangeByteLimit} from '../lib/lab/codex-exchange.ts';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
const localPath=z.string().min(1).max(2000).refine(value=>!/[\0\r\n]/.test(value),'Invalid file path.');
const stepSchema=z.discriminatedUnion('type',[
 z.object({id,type:z.literal('doctor')}).strict(),
 z.object({id,type:z.literal('research'),channel:researchInput.shape.channel,query:researchInput.shape.query}).strict(),
 z.object({id,type:z.literal('reference'),path:localPath}).strict(),
 z.object({id,type:z.literal('compose'),ratio:z.enum(['9:16','16:9','1:1','4:3','3:4']),clips:z.array(z.object({path:localPath,duration:z.number().finite().positive().max(120)}).strict()).min(1).max(30)}).strict()
]);
export const missionSchema=z.object({id,projectId:id,steps:z.array(stepSchema).min(1).max(80)}).strict().superRefine((mission,context)=>{
 if(new Set(mission.steps.map(step=>step.id)).size!==mission.steps.length)context.addIssue({code:'custom',message:'Duplicate step IDs are not allowed.'});
});
const digest=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';

async function atomicJson(path,value){
 const temporary=path+'.'+randomUUID()+'.tmp';
 let handle;
 try{
  handle=await open(temporary,'wx');
  await handle.writeFile(json(value),'utf8');
  await handle.sync();
  await handle.close();handle=null;
  await rename(temporary,path);
 }finally{
  if(handle)await handle.close();
  await rm(temporary,{force:true});
 }
}
async function boundedFile(path,limit){
 const handle=await open(path,'r');
 try{
  const info=await handle.stat();
  if(!info.isFile()||info.size===0||info.size>limit)throw Error('File is empty, invalid, or exceeds its size limit.');
  const bytes=Buffer.alloc(info.size+1);
  let length=0;
  while(length<bytes.length){
   const result=await handle.read(bytes,length,bytes.length-length,null);
   if(!result.bytesRead)break;
   length+=result.bytesRead;
  }
  if(length!==info.size)throw Error('File changed while being read.');
  return bytes.subarray(0,length);
 }finally{await handle.close();}
}
async function sourceFile(path){
 const bytes=await boundedFile(path,25*1024*1024);
 return {bytes:new Uint8Array(bytes),sha256:digest(bytes)};
}
async function artifactHash(path){return digest(await boundedFile(path,25*1024*1024));}
async function frameHashes(integrations,jobId){
 const frames=await integrations.frames(jobId);
 if(!Array.isArray(frames)||!frames.length||frames.length>20)throw Error('Invalid extracted frames.');
 return frames.map(frame=>{
  if(!(frame.bytes instanceof Uint8Array)||!frame.bytes.length||frame.bytes.length>5*1024*1024||!Number.isFinite(frame.timestamp)||frame.timestamp<0)throw Error('Invalid extracted frame content.');
  return {timestamp:frame.timestamp,sha256:digest(frame.bytes)};
 });
}
function portableText(value,limit){
 if(typeof value!=='string')return '';
 // Check the whole value before truncating so a trailing credential cannot escape detection.
 const sensitive=/\b(?:secret|password|passwd|token|credential\w*|authorization|bearer|api[ _-]?key)\b|\b(?:sk|ghp|github_pat)[_-][a-zA-Z0-9_-]+|\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/i;
 const localPath=/(?:[a-z]:[\\/]|\\\\[^\s]+|(?:^|[\s"'=:(])\/(?!\/)[^\s]+|file:\/\/)/i;
 const normalizedNames=value.replace(/_/g,' ');
 const urlUserinfo=/[a-z][a-z0-9+.-]*:\/\/[^\s/?#]*@/i;
 if(sensitive.test(value)||sensitive.test(normalizedNames)||localPath.test(value)||urlUserinfo.test(value)||/https?:\/\/\S*[?#]/i.test(value))return '[redacted]';
 return value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,limit);
}
function portableSources(result){
 const sources=[];
 for(const item of Array.isArray(result?.items)?result.items:[]){
  if(sources.length===5)break;
  if(!item||typeof item.url!=='string'||item.url.length>2048)continue;
  try{
   const url=new URL(item.url);
   if(url.protocol!=='https:'||url.username||url.password||portableText(url.hostname,2048)==='[redacted]')continue;
   url.search='';
   url.hash='';
   let pathname;
   try{pathname=decodeURIComponent(url.pathname);}catch{continue;}
   const transferablePath=pathname.replace(/^\//,'');
   if(portableText(transferablePath,2048)==='[redacted]'||/^\/(?:home|Users|private|tmp|var|etc)(?:\/|$)/i.test(pathname)||/secret|password|token|credential|api[_-]?key|authorization/i.test(pathname)||pathname.split('/').some(part=>part.length>48))continue;
   sources.push({url:url.href,title:portableText(item.title,180),excerpt:portableText(item.text,300)});
  }catch{}
 }
 return sources;
}
function portableStep(step,job,receipt){
 const value={stepId:step.id,type:step.type,jobId:job.id,query:'',sources:[],frameCount:0,artifactSha256:receipt.artifactSha256};
 if(step.type==='research')return {...value,query:portableText(step.query,300),channel:step.channel,sources:portableSources(job.result)};
 const media=step.type==='reference'?job.result?.source:job.output?.metadata;
 return {...value,media:media?{width:media.width,height:media.height,duration:media.duration}:undefined,frameCount:step.type==='reference'?receipt.frames.length:0};
}
async function prepare(step,base){
 if(step.type==='reference'){
  const path=resolve(base,step.path),source=await sourceFile(path);
  return {input:{...source,assetId:step.id,name:basename(path).slice(0,180)},identity:{...step,path,sha256:source.sha256}};
 }
 if(step.type==='compose'){
  const clips=[];const identities=[];let total=0;
  for(const clip of step.clips){
   const path=resolve(base,clip.path),source=await sourceFile(path);
   total+=source.bytes.length;
   if(total>60*1024*1024)throw Error('Composition sources exceed 60 MB.');
   clips.push({...source,duration:clip.duration});identities.push({path,duration:clip.duration,sha256:source.sha256});
  }
  return {input:{variantId:step.id,ratio:step.ratio,clips},identity:{...step,clips:identities}};
 }
 return {input:step.type==='research'?{channel:step.channel,query:step.query}:{},identity:step};
}
async function reusable(receipt,fingerprint,integrations){
 if(!receipt||receipt.version!==1||receipt.fingerprint!==fingerprint)return null;
 try{
  const job=integrations.job(receipt.jobId);
  if(job.state!=='done'||job.path!==receipt.path||await artifactHash(job.path)!==receipt.artifactSha256)return null;
  if(receipt.type==='reference'&&JSON.stringify(await frameHashes(integrations,job.id))!==JSON.stringify(receipt.frames))return null;
  return job;
 }catch{return null;}
}

export async function runMission({mission,config,stateDir,missionFile,missionPath,refresh=false,createIntegrations=(store,attemptRoot,stateRoot)=>new Integrations(store,stateRoot)}={}){
 mission=missionSchema.parse(mission);
 config=integrationConfig.parse(config);
 if(typeof stateDir!=='string'||!stateDir.trim())throw Error('A state directory is required.');
 const root=resolve(stateDir),base=missionFile||missionPath?dirname(resolve(missionFile||missionPath)):process.cwd();
 await mkdir(root,{recursive:true});
 const lockPath=join(root,'runner.lock');
 let lock;
 try{lock=await open(lockPath,'wx');}catch(error){if(error.code==='EEXIST')throw Error('State directory is locked. Review the existing runner.lock after confirming its process has ended.');throw error;}
 let store;
 const startedAt=Date.now();
 const report={missionId:mission.id,projectId:mission.projectId,startedAt,status:'running',steps:[]};
 try{
  await lock.writeFile(json({pid:process.pid,startedAt,missionId:mission.id}));await lock.sync();
  store=new Store(join(root,'runner.sqlite'));
  enablePortableMediaTools(resolve(dirname(fileURLToPath(import.meta.url)),'../desktop'));
  const attemptRoot=join(root,'runs',randomUUID());
  await mkdir(attemptRoot,{recursive:true});
  const integrations=createIntegrations(store,attemptRoot,root);
  await integrations.saveConfig(config);
  const portable=[];
  for(const step of mission.steps){
   if(step.type==='doctor'){
    const health=await integrations.doctor();
    if(health?.reach?.ready!==true||health?.montage?.ready!==true)throw Error('Doctor failed: Agent Reach and OpenMontage must both be ready.');
    report.steps.push({stepId:step.id,type:step.type,health});
    await atomicJson(join(root,'run-report.json'),report);
    continue;
   }
   const prepared=await prepare(step,base);
   const fingerprint=digest(JSON.stringify({missionId:mission.id,projectId:mission.projectId,config,step:prepared.identity}));
   const key='codex-receipt:'+mission.id+':'+step.id;
   const prior=store.get(key);
   let job=refresh?null:await reusable(prior,fingerprint,integrations);
   let receipt=prior;
   const reused=Boolean(job);
   if(!job){
    store.set('codex-active',{missionId:mission.id,stepId:step.id,fingerprint,state:'running',startedAt:Date.now()});
    const input={projectId:mission.projectId,...prepared.input};
    job=step.type==='research'?await integrations.research(input):step.type==='reference'?await integrations.analyze(input):await integrations.compose(input);
    if(!job||job.state!=='done'||!id.safeParse(job.id).success||typeof job.path!=='string'||!isAbsolute(job.path))throw Error('Integration did not return a completed local job.');
    receipt={version:1,type:step.type,fingerprint,jobId:job.id,path:job.path,artifactSha256:await artifactHash(job.path),frames:step.type==='reference'?await frameHashes(integrations,job.id):[]};
    // Validate transferable metadata before committing a successful receipt.
    const candidate=portableStep(step,job,receipt);
    codexExchangeSchema.parse({schemaVersion:1,missionId:mission.id,projectId:mission.projectId,startedAt,finishedAt:Date.now(),status:'completed',steps:[candidate]});
    store.set(key,receipt);
    store.set('codex-active',{missionId:mission.id,stepId:step.id,state:'completed',finishedAt:Date.now()});
   }
   portable.push(portableStep(step,job,receipt));
   report.steps.push({stepId:step.id,type:step.type,jobId:job.id,path:job.path,artifactSha256:receipt.artifactSha256,...(reused?{reused:true}:{})});
   await atomicJson(join(root,'run-report.json'),report);
  }
  report.finishedAt=Date.now();report.status='completed';
  if(portable.length){
   const exchange=codexExchangeSchema.parse({schemaVersion:1,missionId:mission.id,projectId:mission.projectId,startedAt,finishedAt:report.finishedAt,status:'completed',steps:portable});
   if(Buffer.byteLength(json(exchange),'utf8')>exchangeByteLimit)throw Error('Portable report exceeds 384 KB. Split the mission.');
   await atomicJson(join(root,'codex-exchange.json'),exchange);
  }else await rm(join(root,'codex-exchange.json'),{force:true});
  await atomicJson(join(root,'run-report.json'),report);
  await rm(join(root,'run-error.json'),{force:true});
  return report;
 }catch(error){
  report.status='failed';report.finishedAt=Date.now();report.error=error instanceof Error?error.message:String(error);
  try{
   if(store)store.set('codex-active',{missionId:mission.id,state:'failed',finishedAt:report.finishedAt,error:report.error});
   await atomicJson(join(root,'run-error.json'),report);
   await atomicJson(join(root,'run-report.json'),report);
  }catch(reportError){throw new AggregateError([error,reportError],'Mission failed and its failure report could not be saved.');}
  throw error;
 }finally{
  try{store?.close();}finally{try{await lock.close();}finally{await rm(lockPath,{force:true});}}
 }
}

async function main(args){
 if(args.length===1&&(args[0]==='--help'||args[0]==='-h')){
  console.log('Usage: node scripts/run-codex.mjs --mission <mission.json> --config <tools.json> --state <directory> [--refresh]');return;
 }
 const options={};
 for(let index=0;index<args.length;index++){
  const flag=args[index];
  if(flag==='--refresh'){if(options.refresh)throw Error('Duplicate --refresh.');options.refresh=true;continue;}
  if(!['--mission','--config','--state'].includes(flag)||options[flag]!==undefined)throw Error('Unknown or duplicate option: '+flag);
  const value=args[++index];
  if(!value||value.startsWith('--'))throw Error('Missing value for '+flag);
  options[flag]=value;
 }
 if(!options['--mission']||!options['--config']||!options['--state'])throw Error('Required options: --mission, --config, --state. Use --help.');
 const missionFile=resolve(options['--mission']);
 const mission=JSON.parse((await boundedFile(missionFile,384000)).toString('utf8'));
 const config=JSON.parse((await boundedFile(resolve(options['--config']),16000)).toString('utf8'));
 const report=await runMission({mission,config,stateDir:options['--state'],missionFile,refresh:options.refresh});
 console.log(JSON.stringify({status:report.status,missionId:report.missionId,steps:report.steps.length}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 main(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
