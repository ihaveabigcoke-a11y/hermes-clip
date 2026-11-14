import test from 'node:test';
import assert from 'node:assert/strict';
import {runVideoFlow,productVideoLibrary,videoRecovery,resumableVideoProject,museVideoLabel} from '../lib/lab/auto-video.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {emptyProduct} from '../lib/lab/domain.ts';

test('T-031: a validated video overrides a stale failure inherited by a historical retry without rewriting its receipt',()=>{
 const status={musePaused:false,generationReady:true,profiles:[{id:'Cho',name:'Cho',enabled:true,health:'ready',quota:{state:'available'}}],jobs:[{profileId:'Cho',createdAt:1,state:'ready',failureCode:'MUSE_NO_MEDIA',errorKind:'refused',output:{sha256:'a'.repeat(64)},request:{mediaType:'video'}}]};
 const before=structuredClone(status);
 assert.equal(museVideoLabel(status),'Muse sẵn sàng');assert.deepEqual(status,before);
 status.jobs[0].output=null;assert.equal(museVideoLabel(status),'Cho: Muse chưa trả video');
});

test('T-030: readiness uses the latest video outcome per profile without clearing a restriction with another profile or an image',()=>{
 const profile=(id)=>({id,name:id,enabled:true,health:'ready',quota:{state:'available'}});
 const status={musePaused:false,generationReady:true,profiles:[profile('Chi'),profile('Cho')],jobs:[]};
 assert.equal(museVideoLabel(status),'Muse sẵn sàng');
 status.jobs.push({id:'refusal',profileId:'Chi',createdAt:10,state:'needs_attention',failureCode:'MUSE_NO_MEDIA',providerResponse:'Video generation is unavailable for this account in this country/region',request:{mediaType:'video'}});
 const before=structuredClone(status);
 assert.equal(museVideoLabel(status),'Chi: Muse hạn chế tạo video theo vùng/quyền');
 assert.deepEqual(status,before);
 status.jobs.push({profileId:'Cho',createdAt:20,state:'ready',output:{sha256:'a'.repeat(64)},request:{mediaType:'video'}});
 status.jobs.push({profileId:'Chi',createdAt:30,state:'ready',output:{sha256:'b'.repeat(64)},request:{mediaType:'image'}});
 status.jobs.push({profileId:'Chi',createdAt:40,state:'queued',request:{mediaType:'video'}});
 status.profiles[0].enabled=false;
 assert.equal(museVideoLabel(status),'Chi: Muse hạn chế tạo video theo vùng/quyền');
 status.jobs.push({profileId:'Chi',createdAt:50,state:'ready',output:{sha256:'c'.repeat(64)},request:{mediaType:'video'}});
 assert.equal(museVideoLabel(status),'Muse sẵn sàng');
 status.jobs.push({profileId:'Chi',createdAt:60,state:'needs_attention',failureCode:'MUSE_NO_MEDIA',providerResponse:'Want a still image instead?',request:{mediaType:'video'}});
 assert.equal(museVideoLabel(status),'Chi: Muse chưa trả video');
 assert.equal(museVideoLabel({...status,musePaused:true}),'Muse đang tạm dừng');
 assert.equal(museVideoLabel({...status,profiles:[]}),'Muse chưa sẵn sàng');
 assert.equal(museVideoLabel(null),'Đang kiểm tra Muse');
});

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

test('Explicit Muse mode escapes manual scenes and never silently exports manual packs',async()=>{
 for(const paused of [false,true]){
 const product={id:'p',kind:'product',revision:1,data:{...emptyProduct,name:'Fixture'}};
 let project={id:'auto_existing',kind:'production',revision:1,data:newProduction('Existing','p',1)};
 project.data=applyProduction(project.data,'scene',{id:'auto_0',name:'Hook',prompt:'Show the product',mediaType:'video',ratio:'9:16',duration:8,referenceIds:[]},'scene',1);
 project.data=applyProduction(project.data,'storyboard',{sceneId:'auto_0'},'board',1);
 project.data=applyProduction(project.data,'media_provider',{sceneId:'auto_0',provider:'manual'},'manual',1);
 let starts=0;const request=async(path,body)=>{if(!body)return {records:[product,project]};project={...project,revision:project.revision+1,data:applyProduction(project.data,body.action,body.input,body.commandId,2)};return {record:project};};
 const result=await runVideoFlow({mediaMode:'muse',productId:'p',projectId:project.id,request,maxPolls:0,upload:()=>assert.fail('No media yet'),bridge:{status:async()=>({musePaused:paused,generationReady:!paused,jobs:[]}),musePackagePreview:async()=>({count:1,blocked:0,night:{remaining:null}}),musePackageStart:async()=>{starts++;},manualMediaExport:()=>assert.fail('Muse mode must not request user files')}});
 assert.equal(result.state,paused?'blocked':'waiting');assert.equal(starts,paused?0:1);assert.equal(project.data.scenes[0].mediaProvider,paused?'manual':'muse');assert.equal(project.data.exports.length,0);
 }
});
test('Video project recovery ignores stale localStorage and reuses the existing automatic project',()=>{
 const product={id:'p',revision:2},current={id:'current',kind:'production',updatedAt:10,data:{productId:'p',productRevision:2,scenes:[{id:'auto_0'}]}},old={...current,id:'old',data:{...current.data,productRevision:1}};
 assert.equal(resumableVideoProject([old,current],product,'old').id,'current');assert.equal(resumableVideoProject([old],product,'old'),null);
});

test('T-030: editing a scene reapproves its current revision and preserves old approval receipts on retry',async()=>{
 const product={id:'p',kind:'product',revision:1,data:{...emptyProduct,name:'Fixture'}};
 let project,starts=0;const commands=[];
 const request=async(path,body)=>{
  if(!body)return {records:[product,...(project?[project]:[])]};
  commands.push(body);
  project={id:body.id,kind:'production',revision:(project?.revision??0)+1,data:body.action==='create'?newProduction(body.input.name,product.id,1):applyProduction(project.data,body.action,body.input,body.commandId)};
  return {record:project};
 };
 const options={productId:'p',projectId:'auto_revision',request,mediaMode:'muse',maxPolls:0,upload:()=>assert.fail('No clip in this fixture'),bridge:{status:async()=>({musePaused:false,generationReady:true,jobs:[]}),musePackagePreview:async()=>{assert.ok(project.data.scenes.every(s=>s.storyboardApproved));return {count:starts?0:5,blocked:0,night:{remaining:null}};},musePackageStart:async()=>{starts++;}}};
 await runVideoFlow(options);
 // Include the legacy receipt used by installed versions before this fix.
 project.data.receipts.push(project.id+'_board_auto_0');
 const oldReceipts=[...project.data.receipts],scene=project.data.scenes[0];
 project={...project,revision:project.revision+1,data:applyProduction(project.data,'scene',{...scene,referenceIds:[],prompt:'Updated camera direction'},'edited_scene')};
 assert.equal(project.data.scenes[0].storyboardApproved,false);
 await runVideoFlow(options);
 assert.equal(project.data.scenes[0].revision,2);
 assert.equal(project.data.scenes[0].storyboardApproved,true);
 assert.ok(oldReceipts.every(id=>project.data.receipts.includes(id)));
 const approvals=commands.filter(c=>c.action==='storyboard');
 assert.equal(approvals.length,6);
 assert.equal(new Set(approvals.map(c=>c.commandId)).size,6);
 await runVideoFlow(options);
 assert.equal(commands.filter(c=>c.action==='storyboard').length,6);
 assert.equal(starts,1,'Reapproval must not manufacture another dispatch when the preview has no new job');
});

test('T-033: starts each render as its hook arrives and completes three concurrent renders with serialized writes',async()=>{
 const {publishFixture}=await import('./fixtures/publish-board.mjs');const {planDistribution}=await import('../lib/lab/publish-board.ts');const {planHookRefresh}=await import('../lib/lab/result-cards.ts');const {getRenderPlan}=await import('../lib/lab/render-plan.ts');
 const f=publishFixture(),plans=planDistribution(f.records,f.input);let project=planHookRefresh([...f.records,...plans],{planId:plans[0].id,revision:1,id:'streaming_auto'}),poll=0,active=0,peak=0;
 const starts=[],gates=[],body=structuredClone(project.data.reuseBodyPlan.segments.slice(1));
 const request=async(path,command)=>{if(!command)return {records:[...f.records,project]};assert.equal(command.revision,project.revision);const input=command.action==='export'?{...command.input,verified:true,sha256:String(starts.findIndex(v=>v===command.input.variantId)+1).repeat(64)}:command.input;project={...project,revision:project.revision+1,data:applyProduction(project.data,command.action,input,command.commandId)};return {record:project};};
 const bridge={status:async()=>({musePaused:false,generationReady:true,jobs:[]}),musePackagePreview:async()=>({count:3,blocked:0,night:{remaining:null,stopped:false}}),musePackageStart:async()=>{},museNightStatus:async()=>({stopped:false}),renderPlannedVideo:async({variantId})=>{starts.push(variantId);const plan=getRenderPlan(project.data,project.id,variantId);assert.deepEqual(plan.segments.slice(1),body);active++;peak=Math.max(peak,active);await new Promise(resolve=>{gates.push(resolve);if(gates.length===3)gates.forEach(r=>r());});active--;return {sha256:String(starts.indexOf(variantId)+1).repeat(64)};}};
 const result=await runVideoFlow({mediaMode:'muse',productId:f.product.id,projectId:project.id,request,bridge,upload:async output=>({id:'asset_'+output.sha256[0],sha256:output.sha256}),wait:async ms=>{assert.equal(ms,750);if(poll)assert.equal(starts.length,poll,'previous hook must render before the next clip arrives');const scene=project.data.scenes.find(s=>s.id==='auto_'+poll);project={...project,revision:project.revision+1,data:applyProduction(project.data,'attach',{sceneId:scene.id,attemptId:null,take:{assetId:'clip_'+poll,name:'clip.mp4',type:'video/mp4',size:100,sha256:'b'.repeat(64),metadata:{width:720,height:1280,duration:8,verifiedBy:'container'}}},'stream_'+poll)};poll++;}});
 assert.equal(result.state,'done');assert.equal(peak,3);assert.equal(project.data.exports.length,3);assert.equal(new Set(project.data.exports.map(e=>e.sha256)).size,3);
});

test('T-033: concurrent render accepts unrelated revisions only with the exact validated plan',async()=>{
 const {assertRenderRevision}=await import('../lib/lab/render-plan.ts');const {renderFixture}=await import('./fixtures/render-plan.mjs');const {plan}=renderFixture(),signature=JSON.stringify(plan);
 assert.doesNotThrow(()=>assertRenderRevision(8,8,plan));assert.doesNotThrow(()=>assertRenderRevision(9,8,plan,signature));
 assert.throws(()=>assertRenderRevision(9,8,plan),/thay đổi/);assert.throws(()=>assertRenderRevision(7,8,plan,signature),/thay đổi/);assert.throws(()=>assertRenderRevision(9,8,{...plan,overlays:[]},signature),/thay đổi/);
});
