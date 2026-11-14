import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MusePackage} from '../src/muse-package.mjs';
import {renderFixture} from '../../tests/fixtures/render-plan.mjs';
import {sceneGate} from '../../lib/lab/production.ts';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
test('T-023 package preview counts before send, retains unknown jobs and rejects excess/stale/paused requests',async()=>{
 const store=new Store(':memory:');try{
 const p=renderFixture().production;p.scenes.forEach(s=>s.takes=[]);
 let records=[{id:'render_project',kind:'production',revision:1,data:p},{id:p.productId,kind:'product',revision:1,data:{}}],calls=0;
 const worker={store,night:new MuseNight(store),config:()=>({enabled:true}),approvedIds:[],enqueue:async request=>{calls++;return store.enqueue(request,request.sceneId);},start:async({jobIds})=>{worker.approvedIds.push(...jobIds);return true;}};store.set('muse_paused',false);
 const service=new MusePackage({worker,manual:{records:async()=>records},domain:{sceneGate}});
 assert.equal((await service.preview({projectId:'render_project'})).public.count,5);assert.equal(calls,0);
 await assert.rejects(service.start({projectId:'render_project',revision:2}),/đổi/);assert.equal(calls,0);
 p.paused=true;await assert.rejects(service.start({projectId:'render_project',revision:1}),/tạm dừng/);p.paused=false;
 const result=await service.start({projectId:'render_project',revision:1});assert.equal(result.count,5);assert.equal(calls,5);
 for(const job of store.jobs()){assert.ok(job.request.prompt.startsWith(MUSE_VIDEO_COMMAND+'\nCreate a vertical'));assert.equal(job.request.prompt.split(MUSE_VIDEO_COMMAND).length,2);}
 await assert.rejects(service.start({projectId:'render_project',revision:1}),/Không có lượt mới/);assert.equal(calls,5);
 const job=store.jobs()[0];store.put({...job,state:'needs_attention'});assert.equal((await service.preview({projectId:'render_project'})).public.blocked,1);
 }finally{store.close();}
});

test('Muse package resumes queued and retries only demonstrably unsent failures without losing old receipts',async()=>{
 const store=new Store(':memory:');try{
 const p=renderFixture().production;p.scenes.forEach(s=>s.takes=[]);
 const records=[{id:'render_project',kind:'production',revision:1,data:p},{id:p.productId,kind:'product',revision:1,data:{}}];
 const worker={store,approvedIds:[],night:new MuseNight(store),config:()=>({enabled:true}),enqueue:async request=>store.enqueue(request,request.sceneId),retry:async id=>store.retry(id),start:async({jobIds})=>{worker.approvedIds.push(...jobIds);return true;}};
 store.set('muse_paused',false);const service=new MusePackage({worker,manual:{records:async()=>records},domain:{sceneGate}});
 for(const [index,state] of ['queued','cancelled','failed'].entries()){const scene=p.scenes[index],j=store.enqueue({projectId:'render_project',productId:p.productId,productRevision:1,sceneId:scene.id,sceneRevision:scene.revision},scene.id).job;store.put({...j,state});}
 const originals=structuredClone(store.jobs()),preview=(await service.preview({projectId:'render_project'})).public;
 assert.equal(preview.count,5);assert.equal(preview.queuedCount,1);assert.equal(preview.retryableCount,2);assert.equal(preview.newCount,2);
 const result=await service.start({projectId:'render_project',revision:1});assert.equal(result.count,5);assert.equal(store.jobs().length,7);
 for(const old of originals)assert.deepEqual(store.job(old.id),old);
 assert.equal((await service.preview({projectId:'render_project'})).public.count,0);
 for(const state of ['needs_attention','failed']){const job=store.jobs()[0];store.put({...job,state,submitBatchId:'sent',history:[{state:'submitting'}]});assert.equal((await service.preview({projectId:'render_project'})).public.blocked,1);await assert.rejects(service.start({projectId:'render_project',revision:1}),/Đối soát/);}
 }finally{store.close();}
});
