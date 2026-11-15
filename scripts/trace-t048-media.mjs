// Local media only; no Worker, browser profile or Muse adapter is constructed.
// Usage: node --experimental-strip-types scripts/trace-t048-media.mjs LABEL
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {availableParallelism} from 'node:os';
import {Store} from '../desktop/src/store.mjs';
import {pathToFileURL} from 'node:url';
const moduleRoot=process.env.HERMES_TRACE_SOURCE_ROOT?pathToFileURL(resolve(process.env.HERMES_TRACE_SOURCE_ROOT)+'/'):new URL('../desktop/src/',import.meta.url);
const {Integrations}=await import(new URL('integrations.mjs',moduleRoot));
const {validateMedia}=await import(new URL('media.mjs',moduleRoot));
const {withMediaTrace,traceMedia}=await import(new URL('media-trace.mjs',moduleRoot));
import {runVideoFlow,autoVideoShots} from '../lib/lab/auto-video.ts';
import {emptyProduct} from '../lib/lab/domain.ts';
import {getRenderPlan} from '../lib/lab/render-plan.ts';
import {startLocalServer,sessionCookie} from '../desktop/local/server.mjs';

const label=process.argv[2],poll=process.argv.includes('--poll');assert.match(label??'',/^[\w-]+$/);
const out='D:/hermes-wt/artifacts/T-048',root=join(out,label);await mkdir(out,{recursive:true});await mkdir(root);
process.env.PATH=resolve('desktop/tools/ffmpeg/bin')+';'+process.env.PATH;
const installed=JSON.parse((await readFile('desktop/.integrations/config.json','utf8')).replace(/^\uFEFF/,''));
const store=new Store(':memory:'),integrations=new Integrations(store,root);
store.set('muse_paused',false); // Isolated fixture flag; no provider worker exists.
integrations.saveConfig({python:installed.python,montage:installed.montage,reach:installed.reach});
const sources=await Promise.all([
 ...[0,1,2].map(i=>`D:/hermes-wt/artifacts/T-041/auto_T041_1_auto_${i}.mp4`),
 ...[0,1].map(i=>`D:/hermes-wt/artifacts/T-038/auto_T038_1_auto_${i}.mp4`),
].map(async path=>{const bytes=await readFile(path);return {path,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),duration:8};}));
const product={id:'T048_product',kind:'product',revision:1,createdAt:1,updatedAt:1,data:{...emptyProduct,name:'Local replay',productKey:'T048',ctaKeyword:'GLOW'}};
const seed=join(root,'seed.json');await writeFile(seed,JSON.stringify({records:[product]}));
const local=await startLocalServer({root:join(root,'workspace'),seedPath:seed,workerStore:store});
const headers={Cookie:sessionCookie+'='+local.session,Origin:local.origin};
const events=[],sink=e=>events.push(e);let measuring=false;
const request=async(path,body)=>{
 const run=async()=>{const r=await fetch(local.origin+path,{method:body?'POST':'GET',headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
 return measuring?withMediaTrace(sink,'selection',()=>traceMedia('api_'+(body?.action??'read'),run)):run();
};
let project;
const command=async(action,input)=>{const result=await request('/api/production',{id:'T048_project',revision:project?.revision??0,action,input,commandId:'setup_'+action+'_'+(input.sceneId??'')});project=result.record;};
try{
 await command('create',{name:'Local replay',productId:product.id,locale:'en-US'});
 await command('import',{rows:autoVideoShots(product)});
 const assets=[];
 for(const [i,source] of sources.entries()){
  await command('storyboard',{sceneId:'auto_'+i});
  const form=new FormData();form.append('file',new File([source.bytes],'clip_'+i+'.mp4',{type:'video/mp4'}));
  const r=await fetch(local.origin+'/api/assets',{method:'POST',headers,body:form});const asset=await r.json();assert.ok(r.ok,JSON.stringify(asset));assets.push(asset);
  if(!poll||i>=3)await command('attach',{sceneId:'auto_'+i,attemptId:null,assetId:asset.id});
 }
 const inputs=[0,1,2].map(i=>({planVersion:1,projectId:project.id,variantId:project.id+'_v'+i,ratio:'9:16',clips:[sources[i],sources[3],sources[4]].map((s,j)=>({...s,inSec:0,outSec:[4,4,7][j]})),overlays:[{text:'Vs…',fromSec:4,toSec:8,role:'label',style:'white-outline-top'},{text:'Comment GLOW',fromSec:12,toSec:15,role:'cta',style:'white-outline-top'}]}));
 const started=performance.now();measuring=true;
 // Replay T-041's overlap: speculative compose, request validation and plan writes.
 const startRender=()=>inputs.map((input,i)=>withMediaTrace(sink,'H'+(i+1),()=>traceMedia('render_total',()=>integrations.compose(input))));
 let renderTasks=process.argv[3]==='validate-first'?null:startRender();
 const checking=sources.slice(0,3).map((source,i)=>withMediaTrace(sink,'request_H'+(i+1),()=>traceMedia('request_validation',()=>validateMedia(source.path,{mediaType:'video',ratio:'9:16',duration:8}))));
 await Promise.all(checking);
 renderTasks??=startRender();
 const selectionAt=performance.now(),selected=[],imports=[],flowEvents=[];
 const attachHooks=async()=>{
  for(let i=0;i<3;i++){
   project=(await request('/api/lab')).records.find(r=>r.id===project.id);
   await command('attach',{sceneId:'auto_'+i,attemptId:null,assetId:assets[i].id});imports[i]=performance.now();
  }
 };
 const result=await runVideoFlow({productId:product.id,projectId:project.id,request,
  onTiming:event=>flowEvents.push(event),
  bridge:{status:async()=>({musePaused:false,generationReady:true,jobs:[]}),museNightStatus:async()=>({stopped:false}),musePackagePreview:async()=>({count:3,blocked:0,night:{remaining:null,stopped:false}}),musePackageStart:attachHooks,renderPlannedVideo:async input=>{
   const index=Number(input.variantId.split('_v').at(-1));selected.push({hook:index+1,elapsedMs:performance.now()-(imports[index]??selectionAt)});
   const record=(await request('/api/lab')).records.find(r=>r.id===project.id),plan=getRenderPlan(record.data,record.id,input.variantId);
   const job=await renderTasks[index];return {...await integrations.output(job.id),renderPlan:plan};
  }},upload:async result=>{
   const form=new FormData();form.append('file',new File([result.bytes],result.name,{type:'video/mp4'}));form.append('preparedToken',local.registerPreparedMedia(result));
   const r=await fetch(local.origin+'/api/assets',{method:'POST',headers,body:form});const asset=await r.json();assert.ok(r.ok,JSON.stringify(asset));return asset;
  }});
 assert.equal(result.state,'done');
 const jobs=await Promise.all(renderTasks);assert.equal(new Set(jobs.map(j=>j.output.sha256)).size,3);
 for(const j of jobs){assert.ok(j.output.fullDecode);assert.equal(j.output.metadata.width,720);assert.equal(j.output.metadata.height,1280);assert.ok(j.output.size<=6*1024**2);assert.ok(Math.abs(j.output.audio.duration-j.output.audio.videoDuration)<=.1);assert.ok(j.request.overlays.some(o=>o.text==='Comment GLOW'&&o.toSec===15));}
 const report={label,poll,flowEvents,threads:process.env.HERMES_COMPOSE_THREADS??'default',order:process.argv[3]??'overlap',cores:availableParallelism(),sources:sources.map(({path,sha256})=>({path,sha256})),elapsedMs:performance.now()-started,selected,events,outputs:jobs.map(j=>({path:j.path,sha256:j.output.sha256,size:j.output.size,metadata:j.output.metadata,audio:j.output.audio,fullDecode:j.output.fullDecode,bridge:j.result.timings}))};
 await writeFile(join(root,'trace.json'),JSON.stringify(report,null,2));
 const seconds=n=>(n/1000).toFixed(3),range=xs=>`${seconds(Math.min(...xs))}–${seconds(Math.max(...xs))}`;
 const render=events.filter(e=>e.stage==='render_total').map(e=>e.finishedAt-e.startedAt),queue=events.filter(e=>e.stage==='slot_wait').map(e=>e.finishedAt-e.startedAt);
 const line=`${label}: dựng ${range(render)}s; chọn đoạn ${range(selected.map(s=>s.elapsedMs))}s; chờ slot max ${seconds(Math.max(...queue))}s; tổng ${seconds(report.elapsedMs)}s. 3 hash khác, 720×1280, tiếng/CTA, full decode đạt.`;
 await appendFile(join(out,'progress.md'),'\n'+new Date().toISOString()+' '+line+'\n');console.log(line);
}finally{await local.close();store.close();}
