import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {ProductDeployment} from '../src/product-deployment.mjs';
import {importWorkerOutput} from '../local/import-worker.mjs';
import {startLocalServer,importModule} from './helpers/local-server.mjs';
const {schemas}=await importModule('lib/lab/domain.ts');
const {researchProductId}=await importModule('lib/lab/operations.ts');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPWQAAAAASUVORK5CYII=','base64');

async function fixture(work){
 const root=await mkdtemp(join(tmpdir(),'hermes-deployment-'));let store,local;
 try{
  store=new Store(join(root,'worker.sqlite'));store.set('muse_paused',false);
  store.set('profiles',[{id:'chi',name:'Chi',enabled:true,proxy:{server:'',username:''},session:'signed_in',health:'ready',quota:{state:'available'}}]);store.set('adapter',{enabled:true,startUrl:'https://muse.example.test'});store.newBatch();
  local=await startLocalServer({root:join(root,'workspace'),seedPath:join(root,'no-seed.json'),workerStore:store});
  const worker=new Worker(store,root,{}, {},()=>8*1024**3);worker.checkToolchain=async()=>{};
  const runner=new ProductDeployment({worker,local,fetchImage:async()=>png,pollMs:5,waitMs:5000});
  const batch={id:'research_test',kind:'research_batch',revision:0,data:schemas.research_batch.parse({name:'Research fixture',market:'United States',locale:'en-US',candidates:[0,1,2].map(i=>({id:'candidate'+i,name:'Product '+i,evidenceNotes:'Synthetic source for automated tests only',supplierUrl:'https://example.test/item/'+i,imageUrl:'https://example.test/item/'+i+'.png'})),selectedIds:['candidate0','candidate1','candidate2']})};
  await runner.request('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(batch)});
  const ids=[];
  for(let i=0;i<3;i++){
   const id=researchProductId(batch.id,'candidate'+i);ids.push(id);const product=schemas.product.parse({name:'Product '+i,imageUrl:'https://example.test/item/'+i+'.png',price:null,cost:null,shipping:null,fees:null,buffer:null,researchOrigin:{batchId:batch.id,candidateId:'candidate'+i}});
   await runner.request('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,kind:'product',revision:0,data:product})});
  }
  const video=join(root,'video.mp4');execFileSync(process.env.HERMES_TEST_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=90x160:r=12','-t','10','-c:v','libx264','-pix_fmt','yuv420p','-y',video],{windowsHide:true});
  const videoBytes=await readFile(video),sha256=createHash('sha256').update(videoBytes).digest('hex');let submissions=0;
  await mkdir(join(root,'outputs'),{recursive:true});
  worker.receiveOutput=id=>importWorkerOutput(local,worker,id);
  worker.run=async(id,profileId)=>{
   store.transition(id,'prepared');store.beginSubmit(id,profileId);submissions++;
   store.transition(id,'submitted',{providerId:'result-'+id,providerUrl:'https://muse.example.test/result/'+id});store.transition(id,'waiting');store.transition(id,'downloading');store.transition(id,'validating');
   const output=join(root,'outputs',id+'.mp4');await copyFile(video,output);
   store.transition(id,'ready',{output:{path:output,name:'video.mp4',sha256,size:videoBytes.length}});await worker.importReady(id);
  };
  await work({runner,worker,store,local,root,ids,batch,counts:()=>submissions});
  await runner.running?.promise;
 }finally{await local?.close();store?.close();await rm(root,{recursive:true,force:true});}
}

test('deployment: three chosen products become three real imported MP4 takes awaiting user review, replay does not send twice',()=>fixture(async({runner,store,ids,counts,worker,local})=>{
 const [run,duplicate]=await Promise.all([runner.start({batchId:'research_test',productIds:ids,profileId:'chi'}),runner.start({batchId:'research_test',productIds:ids,profileId:'chi'})]);
 assert.equal(run.id,duplicate.id);await runner.running.promise;
 assert.equal(runner.rows()[0].state,'ready_for_review',JSON.stringify(runner.rows()));assert.equal(counts(),3);assert.equal(store.batch().submittedByProfile.chi,3);
 const records=await runner.records();const productions=records.filter(r=>r.kind==='production');assert.equal(productions.length,3);
 for(const project of productions){assert.equal(project.data.scenes.length,1);assert.equal(project.data.scenes[0].takes.length,1);assert.equal(project.data.scenes[0].takes[0].review,'pending');assert.equal(project.data.scenes[0].takes[0].metadata.duration,10);}
 assert.ok(store.jobs().every(j=>j.importedAt&&j.preferredProfileId==='chi'));
 const restarted=new ProductDeployment({worker,local});assert.equal((await restarted.start({batchId:'research_test',productIds:[...ids].reverse()})).id,run.id);restarted.boot();assert.equal(restarted.running,null);assert.equal(counts(),3);
}));

test('deployment: legacy 3-count batch accepts three more videos without resetting history',()=>fixture(async({runner,store,ids,counts})=>{
 const batch=store.batch();store.set('generation_batch',{...batch,submittedByProfile:{chi:3}});
 await runner.start({batchId:'research_test',productIds:ids});await runner.running.promise;
 assert.equal(runner.rows()[0].state,'ready_for_review');assert.equal(counts(),3);assert.equal(store.batch().id,batch.id);
 assert.equal(store.batch().submittedByProfile.chi,6);assert.equal(store.batch().perProfileLimit,null);
 assert.equal((await runner.records()).filter(r=>r.kind==='production').length,3);
}));

test('deployment: promoted products without their own image reuse the exact linked candidate image and keep product data unchanged',()=>fixture(async({runner,ids,counts})=>{
 for(const id of ids){const p=(await runner.records()).find(r=>r.id===id);await runner.request('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...p,data:{...p.data,imageUrl:''}})});}
 const before=(await runner.records()).filter(r=>r.kind==='product');
 const fetched=[];runner.fetchImage=async url=>{fetched.push(url);return png;};
 await runner.start({batchId:'research_test',productIds:ids});await runner.running.promise;
 assert.equal(runner.rows()[0].state,'ready_for_review',JSON.stringify(runner.rows()));assert.equal(counts(),3);
 assert.deepEqual(fetched.sort(),[0,1,2].map(i=>'https://example.test/item/'+i+'.png'));
 assert.deepEqual((await runner.records()).filter(r=>r.kind==='product'),before);
 assert.ok(runner.rows()[0].items.every(i=>i.imageUrl.startsWith('https://example.test/item/')));
}));

test('deployment: one missing image blocks only that product; other products still import, no automatic retry',()=>fixture(async({runner,ids,counts})=>{
 runner.fetchImage=async url=>{if(url.includes('/1.png'))throw Error('Image unavailable');return png;};
 await runner.start({batchId:'research_test',productIds:ids});await runner.running.promise;
 const row=runner.rows()[0];assert.equal(row.state,'needs_attention');assert.equal(row.items.filter(i=>i.state==='ready_for_review').length,2);assert.equal(counts(),2);
 assert.match(row.items.find(i=>i.productId===ids[1]).error,/Image unavailable/);
 runner.boot();assert.equal(runner.running,null);assert.equal(counts(),2);
}));

test('deployment: uncertain submission remains the same receipt after restart and duplicate clicks',()=>fixture(async({runner,ids,counts,worker,store,local})=>{
 worker.run=async(id,profileId)=>{store.transition(id,'prepared');store.beginSubmit(id,profileId);store.transition(id,'needs_attention',{note:'Unknown delivery'});};
 const first=await runner.start({batchId:'research_test',productIds:ids.slice(0,1)});await runner.running.promise;
 assert.equal(store.jobs().length,1);const job=store.jobs()[0];assert.equal(job.state,'needs_attention');
 const resumed=new ProductDeployment({worker,local,fetchImage:async()=>png,pollMs:5,waitMs:2000});resumed.resume({id:first.id});await resumed.running.promise;
 assert.equal(store.jobs().length,1);assert.equal(store.jobs()[0].id,job.id);assert.equal(store.batch().submittedByProfile.chi,1);assert.equal(resumed.rows()[0].state,'needs_attention');
}));

test('deployment: a profile with open jobs cannot be deleted; finished profile removal keeps all media and history',()=>fixture(async({runner,ids,worker,store,root})=>{
 await mkdir(join(root,'profiles','chi'),{recursive:true});await writeFile(join(root,'profiles','chi','session-fixture'),'synthetic session');
 worker.contexts.set('chi',{});await assert.rejects(worker.deleteProfile({id:'chi',confirmName:'Chi'}),/Đóng trình duyệt/);worker.contexts.clear();
 await assert.rejects(worker.deleteProfile({id:'chi',confirmName:'wrong'}),/đúng tên/);
 await runner.start({batchId:'research_test',productIds:ids.slice(0,1)});await runner.running.promise;
 const jobs=JSON.stringify(store.jobs()),records=JSON.stringify(await runner.records());
 const result=await worker.deleteProfile({id:'chi',confirmName:'Chi'});assert.equal(result.deleted,true);assert.equal(result.cleanupPending,false);assert.equal(store.get('profiles').length,0);
 assert.equal(JSON.stringify(store.jobs()),jobs);assert.equal(JSON.stringify(await runner.records()),records);assert.ok((await stat(join(root,'video.mp4'))).size>0);
 await assert.rejects(stat(join(root,'profiles','chi')),/ENOENT/);assert.equal(store.get('deleted_profiles')[0].name,'Chi');
 await assert.rejects(worker.saveProfile({id:'chi',name:'Chi',accountLabel:'',enabled:true,proxy:{server:'',username:''}}),/đã xóa/);
}));

test('deployment: pending reconciliation blocks profile deletion and preserves its files',()=>fixture(async({runner,ids,worker,store,root})=>{
 await mkdir(join(root,'profiles','chi'),{recursive:true});await writeFile(join(root,'profiles','chi','session-fixture'),'keep');
 worker.run=async(id,profileId)=>{store.transition(id,'prepared');store.beginSubmit(id,profileId);store.transition(id,'needs_attention',{note:'Unknown delivery'});};
 await runner.start({batchId:'research_test',productIds:ids.slice(0,1)});await runner.running.promise;
 await assert.rejects(worker.deleteProfile({id:'chi',confirmName:'Chi'}),/đối soát/);
 assert.equal(await readFile(join(root,'profiles','chi','session-fixture'),'utf8'),'keep');assert.equal(store.get('profiles').length,1);
}));

test('profile deletion: delayed proxy save cannot resurrect a deleted profile',()=>fixture(async({worker,store})=>{
 let finish;worker.secret.encrypt=()=>new Promise(resolve=>{finish=resolve;});
 const saving=worker.saveProfile({id:'chi',name:'Chi',accountLabel:'',enabled:true,proxy:{server:'http://127.0.0.1:8080',username:'fixture',password:'synthetic'}});
 const rejected=assert.rejects(saving,/đã xóa/);
 await worker.deleteProfile({id:'chi',confirmName:'Chi'});finish('encrypted-fixture');await rejected;
 assert.equal(store.get('profiles').length,0);assert.equal(store.get('deleted_profiles').length,1);
}));

test('deployment: pause between products and resume keeps the already imported take',()=>fixture(async({runner,ids,worker,store,counts})=>{
 const original=worker.run.bind(worker);worker.run=async(...args)=>{await original(...args);if(counts()===1)runner.pause({id:runner.rows()[0].id});};
 const run=await runner.start({batchId:'research_test',productIds:ids});await runner.running.promise;
 assert.equal(runner.rows()[0].state,'paused');assert.equal(counts(),1);
 worker.run=original;runner.resume({id:run.id});await runner.running.promise;
 assert.equal(runner.rows()[0].state,'ready_for_review',JSON.stringify(runner.rows()));assert.equal(counts(),3);assert.equal(store.jobs().length,3);
}));
