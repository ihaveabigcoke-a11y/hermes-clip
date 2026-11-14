import test from 'node:test';
import assert from 'node:assert/strict';
import {runVideoFlow,productVideoLibrary,videoRecovery} from '../lib/lab/auto-video.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {emptyProduct} from '../lib/lab/domain.ts';

test('T-026f: explicit refusal routes to manual and preserves receipt; unknown submission requires reconciliation',async()=>{
 for(const failureCode of ['MUSE_REFUSED','MUSE_NO_MEDIA',null]){
  const product={id:'p',kind:'product',revision:1,createdAt:1,updatedAt:1,data:{...emptyProduct,name:'Fixture',ctaKeyword:'GLOW'}};
  let project,paused=false;const commands=[],packs=[],job={id:'job_1',request:{projectId:'auto_test',sceneId:'auto_0'},state:'needs_attention',failureCode};
  const request=async(path,body)=>{
   if(!body)return {records:[product,...(project?[project]:[])]};
   commands.push(body);const data=body.action==='create'?newProduction(body.input.name,product.id,product.revision):applyProduction(project.data,body.action,body.input,body.commandId,123);
   project={id:body.id,kind:'production',revision:(project?.revision??0)+1,createdAt:1,updatedAt:123,data};return {record:project};
  };
  const result=await runVideoFlow({productId:'p',projectId:'auto_test',request,upload:()=>assert.fail('No upload on refusal'),bridge:{status:async()=>({musePaused:paused,generationReady:true,jobs:paused?[job]:[]}),musePackagePreview:async()=>({count:5,blocked:0,night:{remaining:12,stopped:false}}),musePackageStart:async()=>{paused=true;throw Error('Fake provider stop');},museNightStatus:async()=>({stopped:true}),manualMediaExport:async p=>packs.push(p)},wait:async()=>{}});
  assert.equal(result.state,'manual');assert.equal(packs.length,1);
  assert.equal(packs[0].sceneIds.length,failureCode?5:4);
  assert.equal(commands.filter(c=>c.action==='skip_reconciliation').length,failureCode?1:0);
  assert.equal(project.data.scenes[0].mediaProvider,failureCode?'manual':undefined);
  assert.equal(job.state,'needs_attention');assert.equal(job.id,'job_1');
 }
});

test('T-026i: refresh renders three new techniques with byte-identical body segments and does not rerender on retry',async()=>{
 const {publishFixture}=await import('./fixtures/publish-board.mjs');
 const {planDistribution}=await import('../lib/lab/publish-board.ts');
 const {planHookRefresh}=await import('../lib/lab/result-cards.ts');
 const {getRenderPlan}=await import('../lib/lab/render-plan.ts');
 const f=publishFixture(),plans=planDistribution(f.records,f.input),sourceBefore=structuredClone(f.project);
 let project=planHookRefresh([...f.records,...plans],{planId:plans[0].id,revision:1,id:'refresh_auto'}),starts=0;
 const rendered=[],oldBody=structuredClone(project.data.reuseBodyPlan.segments.slice(1));
 const request=async(path,body)=>{
  if(!body)return {records:[...f.records,project]};
  assert.equal(body.revision,project.revision);
  const input=body.action==='export'?{...body.input,verified:true,sha256:'a'.repeat(64)}:body.input;
  project={...project,revision:project.revision+1,data:applyProduction(project.data,body.action,input,body.commandId)};
  return {record:project};
 };
 const bridge={status:async()=>({musePaused:false,generationReady:true,jobs:[]}),musePackagePreview:async()=>({count:3,blocked:0,night:{remaining:12,stopped:false}}),musePackageStart:async()=>{
  starts++;
  for(const scene of project.data.scenes.filter(s=>s.role==='hook')){
   project={...project,revision:project.revision+1,data:applyProduction(project.data,'attach',{sceneId:scene.id,attemptId:null,take:{assetId:'new_'+scene.id,name:'new.mp4',type:'video/mp4',size:100,sha256:'b'.repeat(64),metadata:{width:720,height:1280,duration:8,verifiedBy:'container'}}},'attach_'+scene.id)};
  }
 },renderPlannedVideo:async()=>{const plan=getRenderPlan(project.data,project.id,project.data.variants.at(-1).id);rendered.push(plan);return {sha256:'a'.repeat(64)};}};
 const options={productId:f.product.id,projectId:project.id,request,bridge,upload:async()=>({id:'output_'+rendered.length,sha256:'a'.repeat(64)}),wait:async()=>{}};
 assert.equal((await runVideoFlow(options)).state,'done');assert.equal(rendered.length,3);
 for(const plan of rendered)assert.deepEqual(plan.segments.slice(1),oldBody);
 assert.equal(new Set(project.data.variants.map(v=>v.hookTechnique)).size,3);
 assert.deepEqual(f.project,sourceBefore);
 assert.equal((await runVideoFlow(options)).state,'done');assert.equal(starts,1);assert.equal(rendered.length,3);
});

test('T-026i: rank distinct hooks by mean measured views in the same product/group; null and ties stay explicit',async()=>{
 const {publishFixture}=await import('./fixtures/publish-board.mjs');const {planDistribution}=await import('../lib/lab/publish-board.ts');const {resultHookRank}=await import('../lib/lab/result-cards.ts');
 const f=publishFixture(),plans=planDistribution(f.records,f.input),records=[...f.records,...plans];
 for(const [i,plan] of plans.entries())records.push({id:'metric_'+i,kind:'social_metric',revision:1,updatedAt:1,data:{planId:plan.id,observedAt:'2026-11-13T10:00:00Z',views:[100,50,10,100,null][i]}});
 assert.deepEqual(plans.map(p=>resultHookRank(records,p)),[1,2,3,1,null]);
 assert.equal(resultHookRank(records,{...plans[0],data:{...plans[0].data,comparison:undefined}}),null);
});

test('Muse unlimited null starts the package; finite zero remains manual; unresolved receipts still block',async()=>{
 for(const [remaining,blocked,expected] of [[null,0,'waiting'],[0,0,'manual'],[null,1,'attention']]){
  const product={id:'p',kind:'product',revision:1,createdAt:1,updatedAt:1,data:{...emptyProduct,name:'Fixture',ctaKeyword:'GLOW'}};
  let project,starts=0,manual=0;
  const request=async(path,body)=>{
   if(!body)return {records:[product,...(project?[project]:[])]};
   const data=body.action==='create'?newProduction(body.input.name,product.id,product.revision):applyProduction(project.data,body.action,body.input,body.commandId,123);
   project={id:body.id,kind:'production',revision:(project?.revision??0)+1,createdAt:1,updatedAt:123,data};return {record:project};
  };
  const result=await runVideoFlow({productId:'p',projectId:'auto_unlimited',request,upload:()=>assert.fail('No media fixture'),maxPolls:0,bridge:{status:async()=>({musePaused:false,generationReady:true,jobs:[]}),musePackagePreview:async()=>({count:5,blocked,night:{remaining,stopped:false}}),musePackageStart:async()=>{starts++;},manualMediaExport:async()=>{manual++;}},wait:async()=>{}});
  assert.equal(result.state,expected);assert.equal(starts,expected==='waiting'?1:0);assert.equal(manual,expected==='manual'?1:0);
 }
});

test('Video library preserves every project for the selected product without attaching old takes',()=>{
 const make=(id,productId,updatedAt)=>({id,kind:'production',updatedAt,data:{productId,scenes:[{id:'same_scene',name:'Clip',mediaType:'video',takes:[{id:'same_take',assetId:id+'_asset',review:'pending'}]},{id:'image',mediaType:'image',takes:[{id:'img',assetId:'img'}]}],exports:[{id:'render',kind:'render',verified:true,assetId:id+'_render'},{id:'prompt',kind:'prompt',verified:true,assetId:'not_video'},{id:'unverified',kind:'render',verified:false,assetId:'not_verified'}]}});
 const old=make('old','p',1),other=make('other','q',3),current=make('current','p',2);current.data.scenes=[];current.data.exports=[];
 const records=[old,current,other],before=structuredClone(records),library=productVideoLibrary(records,'p');
 assert.deepEqual(library.clips.map(r=>r.take.assetId),['old_asset']);assert.deepEqual(library.exports.map(r=>r.output.assetId),['old_render']);
 assert.equal(library.clips[0].project.id,'old');assert.deepEqual(records,before);assert.deepEqual(productVideoLibrary(records,'missing'),{clips:[],exports:[]});
});
test('Video recovery explains no-media, isolates products and revisions, and preserves uncertain receipts',()=>{
 const project={id:'current',data:{scenes:[{id:'scene',revision:2,mediaProvider:'manual',takes:[]}]}};
 const job={id:'j',state:'needs_attention',failureCode:'MUSE_NO_MEDIA',request:{projectId:'current',sceneId:'scene',sceneRevision:2}};
 const state={musePaused:true,jobs:[job]},before=structuredClone(state);
 assert.match(videoRecovery(project,state).message,/chưa tạo video/);assert.equal(videoRecovery(project,state).manual,true);
 assert.equal(videoRecovery(project,state).attention,false);assert.deepEqual(state,before);
 assert.equal(videoRecovery(project,{...state,jobs:[{...job,request:{...job.request,projectId:'other'}}]}).noMedia,false);
 assert.equal(videoRecovery(project,{...state,jobs:[{...job,request:{...job.request,sceneRevision:1}}]}).noMedia,false);
 assert.equal(videoRecovery(project,{...state,jobs:[{...job,failureCode:'TIMEOUT'}]}).attention,true);
 const delivered=structuredClone(project);delivered.data.scenes[0].takes=[{sceneRevision:2,review:'pending'}];
 assert.equal(videoRecovery(delivered,state).message,'');
});
