import {importApiModule} from '../desktop/test/helpers/local-server.mjs';
import test from 'node:test';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {call} from './runtime-fixture.mjs';
const lab=await importApiModule('app/api/lab/route.ts');
const production=await importApiModule('app/api/production/route.ts');
const upload=await importApiModule('app/api/assets/route.ts');
const asset=await importApiModule('app/api/assets/[id]/route.ts');
const {emptyProduct}=await importApiModule('lib/lab/domain.ts');
const {formulaStoryboard}=await importApiModule('lib/lab/intelligence.ts');
const {viralFormulas}=await importApiModule('lib/lab/viral-formulas.ts');
const req=(path,owner,payload,origin='https://qa.invalid')=>new Request('https://qa.invalid'+path,{method:payload?'POST':'GET',headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.invalid',...(payload?{'Content-Type':'application/json',Origin:origin}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
async function json(handler,path,owner,payload,origin){const r=await call(handler,req(path,owner,payload,origin));return {status:r.status,data:await r.json()};}
test('formula drafts persist optional overlay/CTA and shared A/B atomically through real routes, retaining CAS and approval gates',async()=>{
  const who='formula-owner',productId='formula_product';
  assert.equal((await json(lab.POST,'/api/lab',who,{id:productId,kind:'product',revision:0,data:{...emptyProduct,name:'Fixture LED',invariants:'Black housing with LED glow',allowedClaims:'Visible light'}})).status,200);
  let project,command=0;
  const post=async(action,input,key='formula_cmd_'+(++command),revision=project?.revision??0)=>{
    const response=await json(production.POST,'/api/production',who,{id:'formula_project',revision,commandId:key,action,input});
    if(response.status===200)project=response.data.record;
    return response;
  };
  assert.equal((await post('create',{name:'Formula fixture',productId,locale:'en-US'})).status,200);
  const draft=formulaStoryboard({name:'Fixture LED'},project.data,viralFormulas[0],'LED');
  const original=structuredClone(project);
  const invalid={...draft,rows:draft.rows.map(row=>({...row,referenceIds:['foreign_ref']})),alternateHook:{...draft.alternateHook,referenceIds:['foreign_ref']}};
  assert.equal((await post('formula_draft',invalid)).status,422);
  let all=(await json(lab.GET,'/api/lab',who)).data.records;
  assert.deepEqual(all.find(row=>row.id===project.id),original);
  assert.equal((await post('formula_draft',draft,'formula_batch')).status,200);
  const persisted=structuredClone(project);
  assert.equal(project.data.scenes.length,draft.rows.length+1);assert.equal(project.data.bodies.length,1);assert.equal(project.data.variants.length,2);
  assert.equal(project.data.scenes[0].overlayText,'The problem');
  assert.equal(project.data.variants[0].ctaText,'Comment "LED" for the link');
  assert.equal(project.data.variants[0].bodyId,project.data.variants[1].bodyId);
  assert.deepEqual(project.data.variants[0].cta,project.data.variants[1].cta);
  assert.ok(project.data.scenes.every(scene=>!scene.storyboardApproved&&scene.attempts.length===0));
  const replay=await post('formula_draft',draft,'formula_batch',original.revision);
  assert.equal(replay.status,200);assert.equal(replay.data.deduplicated,true);assert.deepEqual(project,persisted);
  assert.equal((await post('formula_draft',draft,'formula_stale',original.revision)).status,409);
  for(const scene of project.data.scenes)assert.equal((await post('prepare',{sceneId:scene.id})).status,422);
  assert.equal((await post('export',{variantId:project.data.variants[0].id,filename:'draft.zip',assetId:null,kind:'package'})).status,422);
  all=(await json(lab.GET,'/api/lab',who)).data.records;
  assert.deepEqual(all.find(row=>row.id===project.id),persisted);
  assert.equal((await json(lab.GET,'/api/lab','formula-stranger')).data.records.length,0);
});
test('API rejects package and owned render exports for null draft pins with a waiting message and no persisted mutation',async()=>{
  const who='null-export-owner',productId='null_export_product';
  assert.equal((await json(lab.POST,'/api/lab',who,{id:productId,kind:'product',revision:0,data:{...emptyProduct,name:'Null pin fixture'}})).status,200);
  let project,sequence=0;
  const post=async(action,input)=>{
    const response=await json(production.POST,'/api/production',who,{id:'null_export_project',revision:project?.revision??0,commandId:'null_export_'+(++sequence),action,input});
    if(response.status===200)project=response.data.record;
    return response;
  };
  assert.equal((await post('create',{name:'Null pin fixture',productId,locale:'en-US'})).status,200);
  assert.equal((await post('formula_draft',formulaStoryboard({},project.data,viralFormulas[0],'LED'))).status,200);
  const before=structuredClone(project),dir=mkdtempSync(join(tmpdir(),'null-export-api-'));
  try{
    const file=join(dir,'synthetic.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',file]);
    const form=new FormData();form.set('file',new File([readFileSync(file)],'synthetic.mp4',{type:'video/mp4'}));
    const response=await call(upload.POST,new Request('https://qa.invalid/api/assets',{method:'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'},body:form}));
    assert.equal(response.status,200);const owned=await response.json();
    for(const variant of project.data.variants)for(const kind of ['package','render']){
      const result=await post('export',{variantId:variant.id,filename:kind==='package'?'draft.zip':'draft.mp4',assetId:kind==='package'?null:owned.id,kind});
      assert.equal(result.status,422);assert.match(result.data.error,/Chờ chọn take/);
    }
    const restored=(await json(lab.GET,'/api/lab',who)).data.records.find(record=>record.id===project.id);
    assert.deepEqual(restored,before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('real routes against isolated SQLite/R2: scope, CAS, replay, atomic import, take checks and trace',async()=>{
  const owner='qa-a',other='qa-b';let command=0;
  const post=(record,action,input,revision=record?.revision??0,commandId='command_'+(++command),who=owner)=>json(production.POST,'/api/production',who,{id:record?.id??'production_qa',revision,commandId,action,input});
  const anon=await call(lab.GET,new Request('https://qa.invalid/api/lab'));assert.equal(anon.status,401);
  const productData={...emptyProduct,name:'QA product',price:35,cost:10,shipping:5,fees:2,buffer:2,sampleVerified:true,proofNotes:'Isolated QA sample'};
  assert.equal((await json(lab.POST,'/api/lab',owner,{id:'product_qa',kind:'product',revision:0,data:productData})).status,200);
  let r=await post(null,'create',{name:'Production QA',productId:'product_qa',locale:'en-US',creativeId:''});assert.equal(r.status,200);let project=r.data.record;
  const foreign=await post(project,'pause',{paused:true},project.revision,'foreign',other);assert.equal(foreign.status,409);
  const csrf=await json(production.POST,'/api/production',owner,{id:project.id,revision:project.revision,commandId:'csrf',action:'pause',input:{paused:true}},'https://other.invalid');assert.equal(csrf.status,403);
  const scene={id:'scene_qa',name:'Body',role:'body',mediaType:'video',prompt:'Test real route',ratio:'9:16',duration:5,referenceIds:[]};
  r=await post(project,'import',{rows:[scene,{...scene,id:'scene_bad',referenceIds:['foreign_ref']}]});assert.equal(r.status,422);
  let list=await json(lab.GET,'/api/lab',owner);assert.equal(list.data.records.find(x=>x.id===project.id).data.scenes.length,0);
  r=await post(project,'scene',scene);assert.equal(r.status,200);project=r.data.record;
  r=await post(project,'storyboard',{sceneId:scene.id});project=r.data.record;
  const before=project;
  r=await post(project,'prepare',{sceneId:scene.id},project.revision,'stable_attempt');assert.equal(r.status,200);project=r.data.record;
  const replay=await post(before,'prepare',{sceneId:scene.id},before.revision,'stable_attempt');assert.equal(replay.status,200);assert.equal(replay.data.deduplicated,true);assert.equal(replay.data.record.data.scenes[0].attempts.length,1);
  assert.equal((await post(before,'pause',{paused:true})).status,409);
  const dir=mkdtempSync(join(tmpdir(),'lab-api-'));
  try{
    const file=join(dir,'source.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=5','-c:v','libx264','-pix_fmt','yuv420p',file]);
    async function sendFile(bytes,name){const form=new FormData();form.set('file',new File([bytes],name,{type:'video/mp4'}));const rq=new Request('https://qa.invalid/api/assets',{method:'POST',headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':'qa@example.invalid'},body:form});const res=await call(upload.POST,rq);return {status:res.status,data:await res.json()};}
    assert.equal((await sendFile(new TextEncoder().encode('not an image'),'bad.png')).status,422);
    assert.equal((await sendFile(readFileSync(file).subarray(0,50),'broken.mp4')).status,422);
    const uploaded=await sendFile(readFileSync(file),'real.mp4');assert.equal(uploaded.status,200);assert.equal(uploaded.data.metadata.width,90);assert.equal(uploaded.data.sha256.length,64);
    let denied=await call(asset.GET,req('/api/assets/'+uploaded.data.id,other),{params:Promise.resolve({id:uploaded.data.id})});assert.equal(denied.status,404);
    let owned=await call(asset.GET,req('/api/assets/'+uploaded.data.id,owner),{params:Promise.resolve({id:uploaded.data.id})});assert.equal(owned.status,200);assert.deepEqual(Buffer.from(await owned.arrayBuffer()),readFileSync(file));
    r=await post(project,'attach',{sceneId:scene.id,attemptId:null,assetId:uploaded.data.id,take:{metadata:{width:1,height:1}}});assert.equal(r.status,200);project=r.data.record;
    const take=project.data.scenes[0].takes[0];assert.equal(take.metadata.width,90);
    r=await post(project,'review',{sceneId:scene.id,takeId:take.id,review:'approved',notes:'Reviewed'});assert.equal(r.status,200);project=r.data.record;
    r=await post(project,'body',{name:'Body',items:[{sceneId:scene.id,takeId:take.id}]},project.revision,'body_qa');assert.equal(r.status,200);project=r.data.record;
    r=await post(project,'variant',{name:'US',bodyId:'body_qa',hook:null,cta:null,locale:'en-US',caption:''},project.revision,'variant_qa');assert.equal(r.status,200);project=r.data.record;
    r=await post(project,'export',{variantId:'variant_qa',filename:'source.zip',assetId:null,kind:'package'});assert.equal(r.status,200);project=r.data.record;
    r=await post(project,'export',{variantId:'variant_qa',filename:'fake.mp4',assetId:null,kind:'render'});assert.equal(r.status,422);
    r=await post(project,'retry',{sceneId:scene.id});assert.equal(r.status,200);project=r.data.record;assert.equal(project.data.scenes[0].takes.length,1);
    list=await json(lab.GET,'/api/lab',owner);assert.equal(list.data.records.find(x=>x.id===project.id).data.variants[0].bodyId,'body_qa');
    const foreignList=await json(lab.GET,'/api/lab',other);assert.equal(foreignList.data.records.length,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('internal review and export work before sample while ownership, media and commercial gates remain enforced', async () => {
  const owner = 'internal-owner';
  const productId = 'internal_product';
  const productData = {...emptyProduct, name:'Internal product', price:0, cost:10, sampleVerified:false};
  const savedProduct = await json(lab.POST, '/api/lab', owner, {id:productId, kind:'product', revision:0, data:productData});
  assert.equal(savedProduct.status, 200);
  let project;
  let command = 0;
  async function post(action, input, commandId = 'internal_command_' + (++command)) {
    const response = await json(production.POST, '/api/production', owner, {
      id:'internal_project', revision:project?.revision ?? 0, commandId, action, input,
    });
    if (response.status === 200) project = response.data.record;
    return response;
  }
  assert.equal((await post('create', {name:'Internal QA', productId, locale:'en-US'})).status, 200);
  const scene = {id:'internal_scene', name:'Body', role:'body', mediaType:'video', prompt:'Internal product demo', ratio:'9:16', duration:5, referenceIds:[]};
  assert.equal((await post('scene', scene)).status, 200);

  const directory = mkdtempSync(join(tmpdir(), 'internal-export-api-'));
  try {
    const file = join(directory, 'source.mp4');
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=5','-c:v','libx264','-pix_fmt','yuv420p',file]);
    const bytes = readFileSync(file);
    async function uploadClip(who) {
      const form = new FormData();
      form.set('file', new File([bytes], 'internal-source.mp4', {type:'video/mp4'}));
      const response = await call(upload.POST, new Request('https://qa.invalid/api/assets', {
        method:'POST',
        headers:{'oai-authenticated-user-id':who, 'oai-authenticated-user-email':who + '@example.invalid'},
        body:form,
      }));
      assert.equal(response.status, 200);
      return response.json();
    }
    const ownedAsset = await uploadClip(owner);
    const foreignAsset = await uploadClip('internal-other-owner');
    assert.equal((await post('attach', {sceneId:scene.id, assetId:foreignAsset.id, attemptId:null})).status, 422);
    assert.equal((await post('attach', {sceneId:scene.id, assetId:ownedAsset.id, attemptId:null})).status, 200);
    const takeId = project.data.scenes[0].takes[0].id;
    const review = {sceneId:scene.id, takeId, review:'approved', notes:'Viewed for internal testing'};
    assert.equal((await post('review', review)).status, 422);
    assert.equal((await post('storyboard', {sceneId:scene.id})).status, 200);
    assert.equal((await post('review', review)).status, 200);
    assert.equal((await post('body', {name:'Internal body', items:[{sceneId:scene.id, takeId}]}, 'internal_body')).status, 200);
    assert.equal((await post('variant', {name:'Internal US', bodyId:'internal_body', hook:null, cta:null, locale:'en-US', caption:''}, 'internal_variant')).status, 200);
    const exportRequest = {variantId:'internal_variant', filename:'internal-source.zip', assetId:null, kind:'package'};
    assert.equal((await post('export', exportRequest, 'internal_export')).status, 200);
    assert.equal((await post('export', exportRequest, 'internal_export')).data.deduplicated, true);
    assert.equal(project.data.exports.length, 1);
    assert.equal((await post('export', {variantId:'internal_variant', filename:'internal.mp4', assetId:ownedAsset.id, kind:'render'})).status, 200);
    assert.equal((await post('export', {variantId:'internal_variant', filename:'foreign.mp4', assetId:foreignAsset.id, kind:'render'})).status, 422);

    const badMediaScenes = [
      {...scene, id:'wrong_ratio_scene', ratio:'16:9'},
      {...scene, id:'wrong_duration_scene', duration:10},
    ];
    for (const invalidScene of badMediaScenes) {
      assert.equal((await post('scene', invalidScene)).status, 200);
      assert.equal((await post('storyboard', {sceneId:invalidScene.id})).status, 200);
      assert.equal((await post('attach', {sceneId:invalidScene.id, assetId:ownedAsset.id, attemptId:null})).status, 200);
      const invalidTake = project.data.scenes.find(item => item.id === invalidScene.id).takes[0];
      assert.equal((await post('review', {sceneId:invalidScene.id, takeId:invalidTake.id, review:'approved', notes:''})).status, 422);
    }
    assert.equal((await post('scene', {...scene, prompt:'Updated internal product demo'})).status, 200);
    assert.equal((await post('storyboard', {sceneId:scene.id})).status, 200);
    assert.equal((await post('review', review)).status, 422);
    assert.equal((await post('export', exportRequest)).status, 422);
    assert.equal(project.data.scenes[0].takes.length, 1);

    const experiment = await json(lab.POST, '/api/lab', owner, {
      id:'internal_experiment', kind:'experiment', revision:0,
      data:{name:'Commercial experiment', productId, market:'United States', hypothesis:'Compare product content performance', status:'running'},
    });
    assert.equal(experiment.status, 422);
    const list = await json(lab.GET, '/api/lab', owner);
    const product = list.data.records.find(record => record.id === productId);
    assert.equal(product.revision, 1);
    assert.equal(product.data.sampleVerified, false);
    assert.equal(product.data.proofNotes, '');
    assert.equal(product.data.price, 0);
    assert.equal(product.data.cost, 10);
  } finally {
    rmSync(directory, {recursive:true, force:true});
  }
});

test('worker receipt route derives metadata from owned asset and replay adds no second take',async()=>{
 const who='worker-owner',productData={...emptyProduct,name:'Worker product',price:30,cost:5,shipping:2,fees:1,buffer:1,sampleVerified:true,proofNotes:'Fixture'};
 await json(lab.POST,'/api/lab',who,{id:'worker_product',kind:'product',revision:0,data:productData});let n=0,project=null;const post=async(action,input,key)=>{const r=await json(production.POST,'/api/production',who,{id:'worker_project',revision:project?.revision??0,commandId:key||'w_'+(++n),action,input});if(r.status===200)project=r.data.record;return r;};await post('create',{name:'Worker',productId:'worker_product',locale:'en-US'});await post('scene',{id:'worker_scene',name:'Scene',prompt:'Test scene'});await post('storyboard',{sceneId:'worker_scene'});
 const dir=mkdtempSync(join(tmpdir(),'worker-api-'));try{const file=join(dir,'v.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=green:s=90x160:r=24:d=5','-c:v','libx264','-pix_fmt','yuv420p',file]);const data=new FormData();data.set('file',new File([readFileSync(file)],'worker.mp4'));const u=await call(upload.POST,new Request('https://qa.invalid/api/assets',{method:'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'},body:data}));const a=await u.json();const receipt={sceneId:'worker_scene',sceneRevision:1,productRevision:1,jobId:'local_1',providerId:'result_1',assetId:a.id,take:{metadata:{width:1,height:1}}};let r=await post('worker_result',receipt,'desktop_local_1');assert.equal(r.status,200);assert.equal(project.data.scenes[0].takes[0].metadata.width,90);assert.equal(project.data.scenes[0].takes[0].review,'pending');r=await post('worker_result',receipt,'desktop_local_1');assert.equal(r.status,200);assert.equal(project.data.scenes[0].takes.length,1);assert.equal((await post('worker_result',receipt,'identical_worker_replay')).status,200);assert.equal(project.data.scenes[0].takes.length,1);
 const replacementData=new FormData();replacementData.set('file',new File([readFileSync(file)],'other-owned.mp4'));
 const replacementResponse=await call(upload.POST,new Request('https://qa.invalid/api/assets',{method:'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'},body:replacementData}));assert.equal(replacementResponse.status,200);const replacementAsset=await replacementResponse.json();
 assert.equal((await post('worker_result',{...receipt,assetId:replacementAsset.id,providerId:'different_result'},'conflicting_worker_replay')).status,422);
 assert.equal((await post('worker_result',{...receipt,providerId:'different_result'},'conflicting_provider_replay')).status,422);
 assert.equal(project.data.scenes[0].takes.length,1);assert.equal(project.data.scenes[0].takes[0].assetId,a.id);
 const workerSnapshot=JSON.parse(project.data.scenes[0].takes[0].snapshot);assert.equal(workerSnapshot.prompt,MUSE_VIDEO_COMMAND+'\nTest scene');assert.equal(workerSnapshot.ratio,'9:16');assert.equal(workerSnapshot.duration,5);assert.equal(workerSnapshot.action,'');assert.equal(workerSnapshot.camera,'');assert.equal(workerSnapshot.voice,'');
 assert.equal((await post('worker_result',{...receipt,sceneRevision:99})).status,422);assert.equal((await post('worker_result',{...receipt,assetId:'foreign_file'})).status,422);}finally{rmSync(dir,{recursive:true,force:true});}
});
