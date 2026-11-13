import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {MuseNight,assertMusePage} from '../src/muse-night.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
test('T-023 fake clock: 12 submits across profiles, spacing, concurrency, restart and no duplicate send',async()=>{
 const store=new Store(':memory:');let now=Date.parse('2026-11-13T03:00:00+07:00');const clock={now:()=>now,sleep:async ms=>{now+=ms;}};
 try{const night=new MuseNight(store,clock);night.begin();const results=await Promise.allSettled(Array.from({length:13},(_,i)=>night.admit('job_'+i)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,12);assert.equal(night.status().remaining,0);
 const sends=night.current().submissions;for(let i=1;i<sends.length;i++)assert.ok(sends[i].at-sends[i-1].at>=60000);
 const restarted=new MuseNight(store,clock);restarted.begin();assert.equal(restarted.status().submitted,12);await assert.rejects(restarted.admit('new'),{code:'MUSE_NIGHT_LIMIT'});
 assert.throws(()=>night.configure({intervalSeconds:59}));night.configure({intervalSeconds:90});assert.equal(night.status().intervalSeconds,90);
 }finally{store.close();}
});
test('T-023 refusal and two errors latch; timeout cannot be resubmitted; successful outcome resets error streak',async()=>{
 for(const code of ['MUSE_NO_MEDIA','MUSE_LOGIN_REQUIRED','MUSE_CAPTCHA','MUSE_ACCOUNT_WARNING','MUSE_QUOTA_EXHAUSTED']){
  const store=new Store(':memory:');try{const night=new MuseNight(store);night.begin();await night.admit('one');night.outcome('one',{code});assert.equal(night.status().stopped,true);assert.throws(()=>night.assertRoom());assert.equal(new MuseNight(store).begin().stopped,true);}finally{store.close();}
 }
 const store=new Store(':memory:');try{let now=Date.now();const night=new MuseNight(store,{now:()=>now,sleep:async ms=>now+=ms});night.begin();await night.admit('timeout');night.outcome('timeout',Error('timeout'));await assert.rejects(night.admit('timeout'),{code:'MUSE_DELIVERY_UNCONFIRMED'});assert.equal(night.status().submitted,1);night.outcome('ok');night.outcome('error1',Error('x'));assert.equal(night.status().stopped,false);night.outcome('error2',Error('y'));assert.equal(night.status().stopped,true);night.outcome('error2',Error('duplicate'));assert.equal(night.status().errors,3);}finally{store.close();}
});
test('T-023 captcha and account notice detection ignores prompt text',async()=>{
 const page=(captcha,notices)=>({locator:selector=>selector.startsWith('iframe')?{first:()=>({isVisible:async()=>captcha})}:{allTextContents:async()=>notices}});
 await assert.rejects(assertMusePage(page(true,[])),{code:'MUSE_CAPTCHA'});await assert.rejects(assertMusePage(page(false,['Account suspended'])),{code:'MUSE_ACCOUNT_WARNING'});await assertMusePage(page(false,[]));
});
test('T-023 fake Muse worker: refusal pauses without profile failover; timeout retains needs_attention',async t=>{
 for(const code of ['MUSE_NO_MEDIA','TIMEOUT']){
  const root=await mkdtemp(join(tmpdir(),'hermes-night-fake-')),store=new Store(':memory:');
  try{
   const worker=new Worker(store,root,{},{});store.set('muse_paused',false);store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});store.set('profiles',[{id:'one',name:'Fake',enabled:true,proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:100}}]);worker.night.begin();worker.paused=false;
   const page={url:()=>'',screenshot:async()=>{}};worker.context=async()=>({pages:()=>[],newPage:async()=>page});worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>({state:'available'});
   const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async()=>{});const submit=t.mock.method(MuseAdapter.prototype,'submit',async(_,checkpoint)=>{await checkpoint('submitting');throw Object.assign(Error('fake failure'),{code});});
   const job=store.enqueue({projectId:'p',sceneId:'s',references:[]},'fake').job;store.transition(job.id,'preflight',{profileId:'one'});await worker.run(job.id,'one');
   assert.equal(submit.mock.callCount(),1);assert.equal(store.job(job.id).state,'needs_attention');assert.equal(worker.night.status().submitted,1);assert.equal(worker.night.status().stopped,code==='MUSE_NO_MEDIA');assert.equal(worker.approvedIds.length,0);
   if(code==='MUSE_NO_MEDIA'){assert.equal(store.get('muse_paused'),true);await assert.rejects(worker.setMusePaused({paused:false}));}
   prepare.mock.restore();submit.mock.restore();
  }finally{store.close();await rm(root,{recursive:true,force:true});}
 }
});

test('T-026f: configurable session limit persists without clearing receipts or stop latch',async()=>{
 const store=new Store(':memory:');try{let now=Date.now();const n=new MuseNight(store,{now:()=>now,sleep:async ms=>now+=ms});n.configure({intervalSeconds:60,sessionLimit:2});n.begin();await n.admit('a');await n.admit('b');assert.throws(()=>n.assertRoom(),{code:'MUSE_NIGHT_LIMIT'});n.configure({intervalSeconds:60,sessionLimit:5});assert.equal(n.status().remaining,3);assert.equal(new MuseNight(store).status().submitted,2);n.outcome('a',{code:'MUSE_REFUSED'});n.configure({intervalSeconds:60,sessionLimit:10});assert.throws(()=>n.assertRoom(),{code:'MUSE_NIGHT_STOP'});assert.throws(()=>n.configure({intervalSeconds:59,sessionLimit:10}));}finally{store.close();}
});
