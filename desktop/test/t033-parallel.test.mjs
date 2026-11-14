import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {Integrations} from '../src/integrations.mjs';
import {bundlePrompt,mapBundleCards} from '../src/muse-bundle.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';

const profiles=()=>['a','b','c'].map(id=>({id,name:id,enabled:true,health:'ready',proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:100}}));
const request=i=>({projectId:'p',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name:'Scene '+i,prompt:'An approved shot '+i,mediaType:'video',ratio:'9:16',duration:8,references:[]});
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'hermes-t033-')),store=new Store(':memory:');try{store.set('muse_paused',false);store.set('profiles',profiles());store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});await fn(store,root);}finally{store.close();await rm(root,{recursive:true,force:true});}}

test('T-033: separate profiles send together, same profile waits 60s, cap and duplicate checks are atomic',()=>fixture(async store=>{
 let now=Date.parse('2026-11-15T03:00:00+07:00'),wake;
 const n=new MuseNight(store,{now:()=>now,sleep:()=>new Promise(r=>wake=r)});n.configure({intervalSeconds:60,sessionLimit:4});n.begin();
 await Promise.all(['a','b','c'].map(p=>n.admit('first_'+p,()=>true,p)));
 assert.equal(new Set(n.current().submissions.map(s=>s.at)).size,1);
 const pending=n.admit('second_a',()=>true,'a');await new Promise(r=>setImmediate(r));assert.equal(n.status().submitted,3);assert.ok(wake);
 now+=60000;wake();await pending;assert.equal(n.status().submitted,4);assert.equal(n.current().submissions[3].at-n.current().submissions[0].at,60000);
 await assert.rejects(n.admit('over',()=>true,'b'),{code:'MUSE_NIGHT_LIMIT'});
 n.configure({intervalSeconds:60,sessionLimit:null});await assert.rejects(n.admit('first_a',()=>true,'c'),{code:'MUSE_DELIVERY_UNCONFIRMED'});
 assert.equal(new MuseNight(store,{now:()=>now}).profileStatus('a').nextSubmitAt,now+60000);
}));

test('T-033 fake Muse: refusal or two errors keep every switch on and another profile can complete',async t=>{
 for(const code of ['MUSE_NO_MEDIA','MUSE_CAPTCHA','MUSE_LOGIN_REQUIRED','TIMEOUT'])await fixture(async(store,root)=>{
  const w=new Worker(store,root,{},{},()=>8*1024**3);let now=Date.now();w.night=new MuseNight(store,{now:()=>now,sleep:async ms=>now+=ms});w.night.begin();w.paused=false;
  let fail=true;const page={url:()=>'',screenshot:async()=>{}};w.context=async()=>({pages:()=>[],newPage:async()=>page});w.setProfileVisibility=async()=>{};w.measureQuota=async()=>{};w.checkToolchain=async()=>{};
  w.validateOutput=async()=>({sha256:'a'.repeat(64),metadata:{duration:8}});
  const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async()=>{}),submit=t.mock.method(MuseAdapter.prototype,'submit',async(_,checkpoint)=>{await checkpoint('submitting');if(fail)throw Object.assign(Error('Exact provider reason'),{code,providerResponse:'Exact provider reason'});await checkpoint('submitted',{providerId:'result',providerUrl:'https://muse.invalid/thread/result'});}),fetch=t.mock.method(MuseAdapter.prototype,'fetch',async(_,job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');return path;});
  try{
   for(let i=0;i<(code==='TIMEOUT'?2:1);i++){const j=store.enqueue(request(i),'bad_'+i).job;store.transition(j.id,'preflight',{profileId:'a'});await w.run(j.id,'a');assert.equal(store.job(j.id).state,'needs_attention');}
   assert.equal(w.night.profileStatus('a').stopped,true);assert.equal(w.night.profileStatus('a').lastReason,'Exact provider reason');assert.equal(w.night.status().stopped,false);
   assert.equal(store.get('muse_paused'),false);assert.ok(w.profiles().every(p=>p.enabled));
   fail=false;const next=store.enqueue(request(9),'other').job;await w.start({count:1,maxConcurrent:3,jobIds:[next.id]});
   for(let i=0;i<100&&store.job(next.id).state!=='ready';i++)await new Promise(r=>setImmediate(r));
   assert.equal(store.job(next.id).state,'ready');assert.notEqual(store.job(next.id).profileId,'a');assert.equal(w.night.profileStatus('a').stopped,true);assert.ok(w.profiles().every(p=>p.enabled));assert.equal(store.get('muse_paused'),false);
  }finally{prepare.mock.restore();submit.mock.restore();fetch.mock.restore();}
 });
});

test('T-033 bundle mapping rejects missing, duplicate or unlabelled clips and keeps the command first',()=>{
 const requests=[0,1,2].map(request),cards=requests.map((r,i)=>({id:'result_'+i,text:'Video SCENE_'+r.sceneId}));
 const prompt=bundlePrompt(requests);assert.ok(prompt.startsWith(MUSE_VIDEO_COMMAND+'\nMake 3 separate videos, one per scene below.'));assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length,2);
 assert.deepEqual(mapBundleCards(cards.toReversed(),requests),['result_0','result_1','result_2']);
 assert.equal(mapBundleCards(cards.slice(1),requests),null);assert.equal(mapBundleCards(cards.map(c=>({...c,text:'Video'})),requests),null);assert.equal(mapBundleCards(cards.map(c=>({...c,id:'same'})),requests),null);
});

test('T-033 fake bundled delivery imports three identified clips but records only one send',async t=>fixture(async(store,root)=>{
 const w=new Worker(store,root,{},{});w.night.begin();w.paused=false;const jobs=[0,1,2].map(i=>store.enqueue(request(i),'bundle_'+i).job),leader=jobs[0];
 store.put({...leader,bundleJobIds:jobs.map(j=>j.id)});for(const child of jobs.slice(1))store.put({...child,bundleParentId:leader.id});store.transition(leader.id,'preflight',{profileId:'a'});
 const page={url:()=>'',screenshot:async()=>{}};w.context=async()=>({pages:()=>[],newPage:async()=>page});w.setProfileVisibility=async()=>{};w.measureQuota=async()=>{};w.validateOutput=async()=>({sha256:'b'.repeat(64),metadata:{duration:8}});const imported=[];w.receiveOutput=async id=>imported.push(id);
 const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async function(_,r){assert.ok(r.prompt.startsWith(MUSE_VIDEO_COMMAND+'\nMake 3 separate videos'));assert.equal(this.expectedScenes.length,3);}),submit=t.mock.method(MuseAdapter.prototype,'submit',async function(_,checkpoint){await checkpoint('submitting');await checkpoint('submitted',{providerId:'result_0',providerUrl:'https://muse.invalid/thread/group',bundleProviderIds:['result_0','result_1','result_2']});}),fetch=t.mock.method(MuseAdapter.prototype,'fetch',async(_,j,checkpoint,path)=>{assert.equal(j.providerId,'result_'+jobs.findIndex(x=>x.id===j.id));await checkpoint('waiting');await checkpoint('downloading');return path;});
 try{await w.run(leader.id,'a');assert.equal(submit.mock.callCount(),1);assert.deepEqual(imported,jobs.map(j=>j.id));assert.ok(jobs.every(j=>store.job(j.id).state==='ready'));assert.equal(w.night.status().submitted,1);assert.equal(store.batch().submittedByProfile.a,1);assert.ok(jobs.slice(1).every(j=>store.job(j.id).submittedViaParent===leader.id));}
 finally{prepare.mock.restore();submit.mock.restore();fetch.mock.restore();}
}));

test('T-033 montage has three independent render slots and preserves every receipt',()=>fixture(async(store,root)=>{
 const service=new Integrations(store,root),gates=[];let active=0,peak=0;
 const run=i=>service.task('compose','p',{variantId:String(i)},async dir=>{active++;peak=Math.max(peak,active);await new Promise(r=>gates.push(r));active--;return {directory:dir};});
 const tasks=[0,1,2].map(run);for(let i=0;i<200&&gates.length<3;i++)await new Promise(r=>setTimeout(r,5));assert.equal(gates.length,3);assert.equal(peak,3);
 await assert.rejects(run(4),/ba MP4/);await assert.rejects(service.task('research','p',{},async()=>{}),/tích hợp/);
 for(const resolve of gates)resolve();const results=await Promise.all(tasks);assert.equal(new Set(results.map(r=>r.directory)).size,3);assert.equal(service.jobs().filter(j=>j.state==='done').length,3);assert.equal(service.busy,false);
}));

test('T-033 package chooses three profiles or a labelled bundle and falls back for future packages after mismatch',async()=>{
 const {MusePackage}=await import('../src/muse-package.mjs');const {renderFixture}=await import('../../tests/fixtures/render-plan.mjs');const {sceneGate}=await import('../../lib/lab/production.ts');
 for(const [count,fallback,mode,sends] of [[3,false,'parallel',5],[2,false,'bundle',3],[1,false,'bundle',3],[2,true,'parallel',5]])await fixture(async store=>{
  store.set('profiles',profiles().slice(0,count));store.set('muse_bundle_unmapped',fallback);const p=renderFixture().production;p.scenes.forEach(s=>s.takes=[]);const records=[{id:'render_project',kind:'production',revision:1,data:p},{id:p.productId,kind:'product',revision:1,data:{}}];let start;
  const worker={store,night:new MuseNight(store),config:()=>({enabled:true}),profiles:()=>store.get('profiles'),enqueue:async request=>store.enqueue(request,request.sceneId),start:async options=>{start=options;return true;}};
  const service=new MusePackage({worker,manual:{records:async()=>records},domain:{sceneGate}});const result=await service.start({projectId:'render_project',revision:1});assert.equal(result.mode,mode);assert.equal(result.count,sends);assert.equal(start.maxConcurrent,Math.min(3,count));assert.equal(store.jobs().length,5);
  if(mode==='bundle'){const leader=store.jobs().find(j=>j.bundleJobIds);assert.equal(leader.bundleJobIds.length,3);assert.equal(store.jobs().filter(j=>j.bundleParentId===leader.id).length,2);}
 });
});

test('T-033 bundle cancellation and unsent validation failure cannot strand or resend a child',async()=>fixture(async(store,root)=>{
 const w=new Worker(store,root,{},{}),jobs=[0,1,2].map(i=>store.enqueue(request(i),'cancel_'+i).job),leader=jobs[0];
 store.put({...leader,bundleJobIds:jobs.map(j=>j.id)});for(const j of jobs.slice(1))store.put({...j,bundleParentId:leader.id});w.cancel(jobs[1].id);
 assert.ok(jobs.every(j=>store.job(j.id).state==='cancelled'));const retried=store.retry(leader.id);assert.equal(retried.bundleJobIds,null);assert.equal(retried.bundleParentId,null);assert.equal(store.job(leader.id).bundleJobIds.length,3);
 const other=[3,4,5].map(i=>store.enqueue(request(i),'invalid_'+i).job),parent=other[0];store.put({...parent,bundleJobIds:other.map(j=>j.id)});for(const j of other.slice(1))store.put({...j,bundleParentId:parent.id});store.transition(parent.id,'preflight',{profileId:'a'});
 w.night.begin();w.validateMediaProvider=async r=>{if(r.sceneId==='scene_4')throw Error('Scene changed before submit');};await w.run(parent.id,'a');assert.ok(other.every(j=>store.job(j.id).state==='failed'));assert.equal(w.night.status().submitted,0);assert.ok(store.get('profiles').every(p=>p.enabled));
}));
