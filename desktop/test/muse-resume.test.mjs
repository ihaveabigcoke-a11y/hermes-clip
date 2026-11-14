import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseNight} from '../src/muse-night.mjs';

test('Explicit Muse resume preserves receipt and audit; never opens browser or dispatches old jobs',async()=>{
 for(const code of ['MUSE_REFUSED','MUSE_LOGIN_REQUIRED','MUSE_QUOTA_EXHAUSTED','MUSE_CAPTCHA','MUSE_ACCOUNT_WARNING',null]){
  const store=new Store(':memory:');try{
   let now=Date.parse('2026-11-14T04:00:00+07:00'),calls=0;
   const clock={now:()=>now,sleep:async ms=>{now+=ms;}},worker=new Worker(store,'outputs/muse-resume-fixture',{launchPersistentContext:async()=>calls++},{});
   worker.night=new MuseNight(store,clock);worker.night.begin();
   const old=store.enqueue({sceneId:'old',references:[]},'old').job;
   store.put({...old,state:'needs_attention',providerId:'keep_receipt'});
   const queued=store.enqueue({sceneId:'queued',references:[]},'queued').job;
   await worker.night.admit(old.id);worker.night.outcome(old.id,code?{code}:Error('first'));
   if(!code)worker.night.outcome('second',Error('second'));
   const before=structuredClone(worker.night.current()),jobs=structuredClone(store.jobs());
   await assert.rejects(worker.setMusePaused({paused:false}),{code:'MUSE_NIGHT_STOP'});
   await worker.setMusePaused({paused:false,resumeStopped:true});worker.tick();
   assert.equal(worker.status().musePaused,false);assert.equal(worker.paused,true);assert.equal(calls,0);
   assert.deepEqual(worker.approvedIds,[]);assert.deepEqual(store.jobs(),jobs);
   assert.deepEqual(worker.night.current().submissions,before.submissions);assert.deepEqual(worker.night.current().outcomes,before.outcomes);
   assert.equal(worker.night.current().resumptions.length,1);assert.equal(worker.night.current().resumptions[0].stopReason,before.stopReason);
   assert.equal(worker.night.status().remaining,11);assert.equal(worker.night.current().consecutiveErrors,0);
   await worker.setMusePaused({paused:false,resumeStopped:true});assert.equal(worker.night.current().resumptions.length,1);
   const restarted=new MuseNight(store,clock);assert.equal(restarted.status().stopped,false);
   await assert.rejects(restarted.admit(old.id),{code:'MUSE_DELIVERY_UNCONFIRMED'});
   await restarted.admit(queued.id);assert.ok(restarted.current().submissions[1].at-before.submissions[0].at>=60000);
   restarted.outcome(queued.id,{code:'MUSE_QUOTA_EXHAUSTED'});assert.equal(restarted.status().stopped,true);
   assert.throws(()=>restarted.assertRoom(),{code:'MUSE_NIGHT_STOP'});
  }finally{store.close();}
 }
});

test('Resume refuses while an admitted job/chat is active and requires a real boolean confirmation',async()=>{
 const store=new Store(':memory:');try{
  const worker=new Worker(store,'outputs/muse-resume-fixture',{},{});worker.night.begin();worker.night.outcome('old',{code:'MUSE_REFUSED'});
  const before=structuredClone(worker.night.current());
  await assert.rejects(worker.setMusePaused({paused:false,resumeStopped:'true'}));
  for(const map of [worker.active,worker.chatting]){
   if(map instanceof Map)map.set('p','job');else map.add('p');
   await assert.rejects(worker.setMusePaused({paused:false,resumeStopped:true}),{code:'MUSE_RESUME_BUSY'});
   assert.deepEqual(worker.night.current(),before);assert.equal(worker.status().musePaused,true);map.clear();
  }
 }finally{store.close();}
});

test('Unlimited is null, admits beyond 12 with spacing, survives restart and never resets ledger or duplicate protection',async()=>{
 const store=new Store(':memory:');try{
  let now=Date.parse('2026-11-14T01:00:00+07:00');const clock={now:()=>now,sleep:async ms=>{now+=ms;}},night=new MuseNight(store,clock);
  night.configure({intervalSeconds:60,sessionLimit:2});night.begin();await night.admit('a');await night.admit('b');
  assert.throws(()=>night.assertRoom(),{code:'MUSE_NIGHT_LIMIT'});const old=structuredClone(night.current());
  night.configure({intervalSeconds:60,sessionLimit:null});assert.deepEqual(night.current(),old);
  assert.equal(night.status().remaining,null);assert.equal(night.status().limit,null);
  await Promise.all(Array.from({length:14},(_,i)=>night.admit('new_'+i)));
  const restarted=new MuseNight(store,clock);assert.equal(restarted.status().submitted,16);assert.equal(restarted.status().remaining,null);
  const rows=restarted.current().submissions;for(let i=1;i<rows.length;i++)assert.ok(rows[i].at-rows[i-1].at>=60000);
  await assert.rejects(restarted.admit('a'),{code:'MUSE_DELIVERY_UNCONFIRMED'});
  restarted.configure({intervalSeconds:60,sessionLimit:12});assert.equal(restarted.status().remaining,0);assert.throws(()=>restarted.assertRoom(),{code:'MUSE_NIGHT_LIMIT'});
  restarted.configure({intervalSeconds:60,sessionLimit:null});restarted.outcome('new_13',{code:'MUSE_QUOTA_EXHAUSTED'});
  assert.equal(restarted.status().stopped,true);assert.throws(()=>restarted.assertRoom(),{code:'MUSE_NIGHT_STOP'});
  assert.throws(()=>restarted.configure({intervalSeconds:59,sessionLimit:null}));
 }finally{store.close();}
});

test('Resuming clears stale dispatch approvals while leaving queued jobs and receipts recoverable',async()=>{
 const store=new Store(':memory:');try{
  const worker=new Worker(store,'outputs/muse-resume-fixture',{},{});worker.night.begin();worker.night.outcome('old',{code:'MUSE_REFUSED'});
  const job=store.enqueue({sceneId:'pending',references:[]},'pending').job;worker.approvedIds=[job.id];worker.paused=false;worker.budget=1;
  const version=worker.dispatchVersion;await worker.setMusePaused({paused:false,resumeStopped:true});worker.tick();
  assert.equal(worker.paused,true);assert.equal(worker.budget,0);assert.equal(worker.active.size,0);assert.deepEqual(worker.approvedIds,[]);
  assert.ok(worker.dispatchVersion>version);assert.equal(store.job(job.id).state,'queued');assert.equal(worker.night.status().submitted,0);
 }finally{store.close();}
});
