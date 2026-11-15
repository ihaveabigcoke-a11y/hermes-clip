import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {retryBlockedReason} from '../src/job-retry.mjs';

const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name:'Cảnh '+i,mediaType:'video',ratio:'9:16',duration:8,prompt:'A product turns on a table.',references:[]});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function old(store,i,patch={}){const j=store.enqueue(request(i),'fixture_'+i).job;return store.put({...j,state:i%2?'cancelled':'failed',...patch});}
async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'hermes-t042-')),store=new Store(':memory:');
  store.set('muse_paused',false);store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});
  store.set('profiles',['Chi','Cho','Duc','Dừng'].map((name,i)=>({id:'profile_'+i,name,enabled:true,health:'ready',proxy:{server:''},vpnEnabled:true,quota:{state:'available',weeklyRemainingPercent:100}})));
  const worker=new Worker(store,root,{},{},()=>8*1024**3);
  try{await fn(worker,store,root);}finally{store.close();await rm(root,{recursive:true,force:true});}
}

test('T-042 bulk creates N independent jobs with parent links, one command and immutable old receipts',()=>fixture(async(worker,store)=>{
  const originals=Array.from({length:5},(_,i)=>old(store,i,{request:{...request(i),prompt:i%2?MUSE_VIDEO_COMMAND+'\n'+MUSE_VIDEO_COMMAND+'\nBody '+i:'Body '+i},
    reconciled:true,providerId:'old_'+i,providerResponse:'Synthetic old receipt',output:{path:'old.mp4',sha256:'a'.repeat(64)},timings:{submittedAt:123},importedAt:456,importError:'old error',usage:2}));
  const before=originals.map(hash),switches=hash(store.get('profiles'));
  const payload={requestId:'batch_1',items:originals.map(j=>({id:j.id}))};
  const created=await worker.retryMany(payload);
  assert.equal(created.length,5);assert.equal(new Set(created.map(j=>j.id)).size,5);assert.equal(store.jobs().length,10);
  created.forEach((j,i)=>{assert.notEqual(j.id,originals[i].id);assert.equal(j.retryOf,originals[i].id);assert.equal(j.retryRootId,originals[i].id);
    assert.equal(j.state,'queued');assert.ok(j.request.prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(j.request.prompt.split(MUSE_VIDEO_COMMAND).length,2);
    assert.equal(j.providerId,null);assert.equal(j.output,null);assert.equal(j.timings,null);assert.equal(j.importedAt,undefined);assert.equal(j.importError,undefined);assert.equal(j.usage,null);});
  assert.deepEqual(originals.map(j=>hash(store.job(j.id))),before);assert.equal(hash(store.get('profiles')),switches);assert.equal(store.get('muse_paused'),false);assert.equal(worker.paused,true);
  assert.deepEqual((await worker.retryMany(payload)).map(j=>j.id),created.map(j=>j.id));assert.equal(store.jobs().length,10);
  await assert.rejects(worker.retryMany({...payload,items:[{id:originals[0].id,body:'Different'}]}),/nội dung khác/);
}));

test('T-042 any uncertain receipt rejects the whole batch, including cancelled, skipped and bundle children',()=>fixture(async(worker,store)=>{
  const safe=old(store,0);
  const cases=[{state:'needs_attention'},{state:'unknown'},{state:'failed',providerId:'result'},
    {state:'cancelled',history:[{state:'submitting',at:1,note:'lost'}]},
    {state:'failed',failureCode:'MUSE_DELIVERY_UNCONFIRMED'},
    {state:'failed',providerResponse:'Unconfirmed'},
    {state:'failed',reconciled:true,reconciliation:'skipped'}];
  for(const [i,patch] of cases.entries()){
    const blocked=old(store,i+1,patch),before=hash(store.jobs());
    assert.ok(retryBlockedReason(blocked));
    await assert.rejects(worker.retryMany({requestId:'blocked_'+i,items:[{id:safe.id},{id:blocked.id}]}),/đối soát|bỏ qua/i);
    assert.equal(hash(store.jobs()),before);assert.equal(store.get('job_retry_operations',null),null);
  }
  const leader=old(store,50,{providerId:'parent-result'}),child=old(store,51,{bundleParentId:leader.id});
  await assert.rejects(worker.retryMany({requestId:'child',items:[{id:child.id}]}),/đối soát/);
  worker.night.begin();await worker.night.admit(safe.id,()=>true,'profile_1');
  await assert.rejects(worker.retryMany({requestId:'receipt-only',items:[{id:safe.id}]}),/đối soát/);
}));

test('T-042 editor changes only body on a new job; invalid input and capacity roll back the entire batch',()=>fixture(async(worker,store)=>{
  const source=old(store,0),before=hash(source);
  const created=await worker.retryMany({requestId:'edit',items:[{id:source.id,body:MUSE_VIDEO_COMMAND+'\nA close-up of the handle.'}]});
  assert.equal(created[0].request.prompt,MUSE_VIDEO_COMMAND+'\nA close-up of the handle.');
  assert.deepEqual({...created[0].request,prompt:source.request.prompt},source.request);assert.equal(hash(store.job(source.id)),before);
  assert.notEqual(created[0].fingerprint,source.fingerprint);
  for(const items of [[{id:source.id,body:' '}],[{id:source.id,body:MUSE_VIDEO_COMMAND}],[{id:source.id,body:'ok',ratio:'1:1'}],[{id:source.id},{id:source.id}],[{id:source.id},{id:'missing'}]]){
    const count=store.jobs().length;await assert.rejects(worker.retryMany({requestId:'invalid',items}));assert.equal(store.jobs().length,count);
  }
  for(let i=store.jobs().length;i<499;i++)old(store,'cap_'+i);
  await assert.rejects(worker.retryMany({requestId:'full',items:[{id:source.id},{id:created[0].id}]}),/500/);assert.equal(store.jobs().length,499);
}));

test('T-042 fake Muse dispatch respects 60s, excludes enabled Chi and stopped/disabled profiles, preserves switches and receipts',async t=>fixture(async(worker,store)=>{
  let now=Date.now();worker.night=new MuseNight(store,{now:()=>now,sleep:async ms=>{now+=ms;}});worker.night.configure({intervalSeconds:60,sessionLimit:null});worker.night.begin();
  worker.night.outcome('refusal',Object.assign(Error('Synthetic service stop'),{code:'MUSE_REFUSED'}),'profile_3');
  const originals=[0,1,2].map(i=>old(store,i));
  const chi=old(store,3,{profileId:'profile_0'}),stopped=old(store,4,{profileId:'profile_3'});
  store.set('profiles',[...store.get('profiles'),{...store.get('profiles')[1],id:'off',name:'Tắt',enabled:false}]);
  const off=old(store,5,{profileId:'off'}),sources=[...originals,chi,stopped,off],before=sources.map(hash);
  const switches=store.get('profiles').map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled}));
  const created=await worker.retryMany({requestId:'dispatch',items:sources.map(j=>({id:j.id}))});
  const sends=[],page={url:()=>'',screenshot:async()=>{}};
  worker.context=async()=>({pages:()=>[],newPage:async()=>page});worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};worker.checkToolchain=async()=>{};
  worker.validateOutput=async()=>({sha256:'b'.repeat(64),metadata:{duration:8}});
  t.mock.method(MuseAdapter.prototype,'prepare',async(_,r)=>{assert.ok(r.prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(r.prompt.split(MUSE_VIDEO_COMMAND).length,2);});
  t.mock.method(MuseAdapter.prototype,'submit',async(_,checkpoint)=>{await checkpoint('submitting');const receipt=worker.night.current().submissions.at(-1);sends.push({...receipt});await checkpoint('submitted',{providerId:'result_'+sends.length,providerUrl:'https://muse.invalid/thread/result'});});
  t.mock.method(MuseAdapter.prototype,'fetch',async(_,j,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');return path;});
  await worker.start({count:created.length,maxConcurrent:1,jobIds:created.map(j=>j.id)});
  for(let i=0;i<500&&(worker.active.size||worker.approvedIds.length);i++)await new Promise(r=>setImmediate(r));
  assert.equal(worker.active.size,0);assert.equal(sends.length,3);assert.ok(sends.every(s=>s.profileId==='profile_1'));
  assert.ok(sends[1].at-sends[0].at>=60000);assert.ok(sends[2].at-sends[1].at>=60000);
  assert.ok(created.slice(0,3).every(j=>store.job(j.id).state==='ready'));assert.ok(created.slice(3).every(j=>store.job(j.id).state==='queued'));
  assert.deepEqual(sources.map(j=>hash(store.job(j.id))),before);assert.deepEqual(store.get('profiles').map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled})),switches);
  assert.equal(store.get('muse_paused'),false);assert.equal(worker.night.profileStatus('profile_3').stopped,true);
}));
