import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MusePackage} from '../src/muse-package.mjs';
import {renderFixture} from '../../tests/fixtures/render-plan.mjs';
import {sceneGate} from '../../lib/lab/production.ts';
test('T-023 package preview counts before send, retains unknown jobs and rejects excess/stale/paused requests',async()=>{
 const store=new Store(':memory:');try{
 const p=renderFixture().production;p.scenes.forEach(s=>s.takes=[]);
 let records=[{id:'render_project',kind:'production',revision:1,data:p},{id:p.productId,kind:'product',revision:1,data:{}}],calls=0;
 const worker={store,night:new MuseNight(store),config:()=>({enabled:true}),enqueue:async request=>{calls++;return store.enqueue(request,request.sceneId);},start:async()=>true};store.set('muse_paused',false);
 const service=new MusePackage({worker,manual:{records:async()=>records},domain:{sceneGate}});
 assert.equal((await service.preview({projectId:'render_project'})).public.count,5);assert.equal(calls,0);
 await assert.rejects(service.start({projectId:'render_project',revision:2}),/đổi/);assert.equal(calls,0);
 p.paused=true;await assert.rejects(service.start({projectId:'render_project',revision:1}),/tạm dừng/);p.paused=false;
 const result=await service.start({projectId:'render_project',revision:1});assert.equal(result.count,5);assert.equal(calls,5);
 await assert.rejects(service.start({projectId:'render_project',revision:1}),/Không có lượt mới/);assert.equal(calls,5);
 const job=store.jobs()[0];store.put({...job,state:'needs_attention'});assert.equal((await service.preview({projectId:'render_project'})).public.blocked,1);
 }finally{store.close();}
});
