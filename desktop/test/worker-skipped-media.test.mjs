import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {ManualMedia} from '../src/manual-media.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {assertMuseAvailable} from '../src/muse-pause.mjs';

const message='Đã bỏ qua kết quả Muse cũ; app sẽ không gửi lại.';
const actions={resume:(w,id)=>w.resume(id), recheckResult:(w,id)=>w.recheckResult({id}),
  run:(w,id)=>w.run(id,'profile'), runResume:(w,id)=>w.run(id,'profile',true), retry:(w,id)=>w.retry(id)};

function fixture(t) {
  const store=new Store(':memory:');t.after(()=>store.close());
  const counts={browser:0,adapter:0,reads:0};
  const worker=new Worker(store,'outputs/T-002c-worker-fixture',{
    launchPersistentContext:async()=>{counts.browser++;throw Error('No browser allowed');},
  },{});
  for(const method of ['prepare','submit','fetch','inspectResponse'])t.mock.method(MuseAdapter.prototype,method,async()=>{counts.adapter++;throw Error('No adapter allowed');});
  store.set('muse_paused',false);
  const records=[{id:'project',kind:'production',data:{scenes:[{id:'scene',museReconciledAt:1000},{id:'other'}]}},
    {id:'other-project',kind:'production',data:{scenes:[{id:'scene'}]}}];
  const manual=new ManualMedia({store,local:{origin:'http://127.0.0.1:4174',session:'fixture-session'}});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    counts.reads++;assert.equal(url,'http://127.0.0.1:4174/api/lab');assert.equal(options.headers.Origin,'http://127.0.0.1:4174');
    return Response.json({records});
  });
  // Same production record reader as main.mjs, through ManualMedia's local API.
  worker.readProductionRecord=async id=>(await manual.records()).find(row=>row.kind==='production'&&row.id===id);
  const enqueue=(patch={})=>{
    const job=store.enqueue({projectId:'project',sceneId:'scene',references:[]},crypto.randomUUID()).job;
    return store.put({...job,state:'needs_attention',createdAt:999,profileId:'profile',providerId:'preserved',
      providerUrl:'https://muse.invalid/result',providerResponse:'Preserve response',...patch});
  };
  return {store,worker,counts,records,enqueue};
}

test('T-002c: old Muse jobs reject every entry point, paused or enabled, without writes/browser/adapter',async t=>{
  const {store,worker,counts,enqueue,records}=fixture(t);
  store.set('muse_chats',[{response:'Keep history'}]);store.set('manual_receipts',[{sha256:'preserved'}]);
  const recordsBefore=structuredClone(records);
  for(const state of ['needs_attention','unknown'])for(const createdAt of [999,1000])for(const providerId of ['preserved',null]){
    const job=enqueue({state,createdAt,providerId});
    for(const paused of [false,true]){
      store.set('muse_paused',paused);
      const before=store.db.prepare('SELECT * FROM kv ORDER BY k').all(),jobs=store.jobs();
      for(const [name,action] of Object.entries(actions)){
        await assert.rejects(action(worker,job.id),{message},name);
        assert.deepEqual(store.jobs(),jobs,name+' must preserve all jobs and histories');
        assert.deepEqual(store.db.prepare('SELECT * FROM kv ORDER BY k').all(),before,name+' must preserve receipts/quota/history');
      }
    }
  }
  assert.deepEqual(records,recordsBefore);assert.equal(counts.browser,0);assert.equal(counts.adapter,0);
  assert.equal(counts.reads,80);
});

test('T-002c: jobs after the mark, another scene/project and missing timestamps are not skipped',async t=>{
  const {store,worker,counts,enqueue}=fixture(t);
  store.set('muse_paused',true);
  for(const patch of [{createdAt:1001},{createdAt:null},{request:{projectId:'project',sceneId:'other',references:[]}},
    {request:{projectId:'other-project',sceneId:'scene',references:[]}}]){
    const job=enqueue(patch);
    await worker.assertJobNotSkipped(job.id);
    for(const [name,action] of Object.entries(actions)){
      if(name==='retry')await assert.rejects(action(worker,job.id),/đối soát trước/);
      else await assert.rejects(action(worker,job.id),{code:'MUSE_PAUSED'},name+' reaches normal pause guard');
    }
  }
  assert.equal(counts.browser,0);assert.equal(counts.adapter,0);
});

test('T-002c: skip is read fresh, and missing/failed record reads stop without changing the job',async t=>{
  const {worker,store,records,enqueue,counts}=fixture(t);
  delete records[0].data.scenes[0].museReconciledAt;
  const job=enqueue();await worker.assertJobNotSkipped(job.id);
  records[0].data.scenes[0].museReconciledAt=1000;
  await assert.rejects(worker.resume(job.id),{message});
  records[0].data.scenes=[];
  await assert.rejects(worker.resume(job.id),/Không tìm thấy cảnh/);
  worker.readProductionRecord=async()=>{throw Error('Local API unavailable');};
  await assert.rejects(worker.resume(job.id),/Local API unavailable/);
  worker.readProductionRecord=undefined;
  await assert.rejects(worker.resume(job.id),/Chưa đọc được cảnh/);
  assert.deepEqual(store.job(job.id),job);assert.equal(counts.browser,0);assert.equal(counts.adapter,0);
});

test('T-002c: the skip check does not delay admission of a new job across pause',async t=>{
  const {worker,enqueue}=fixture(t),release=Promise.withResolvers();
  const job=enqueue({state:'preflight'});let admitted=false;
  worker.runAdmitted=async()=>{admitted=true;await release.promise;assertMuseAvailable(worker.store,{jobId:job.id,profileId:'profile'});};
  const running=worker.run(job.id,'profile');
  assert.equal(admitted,true);
  await worker.setMusePaused({paused:true});release.resolve();await running;
});
