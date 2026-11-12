import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {runMuseTask, assertMuseAvailable} from '../src/muse-pause.mjs';
import {importModule} from './helpers/local-server.mjs';
const {ResearchRunner}=await importModule('desktop/src/research-runner.mjs');

test('Muse defaults paused: profile, VPN, media, chat, recovery and research make zero calls and retain old records',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-pause-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const counts={browser:0,vpn:0,chat:0,network:0};
  t.mock.method(globalThis,'fetch',async()=>{counts.network++;throw Error('Paused Muse must never fetch');});
  const worker=new Worker(store,root,{launchPersistentContext:async()=>{counts.browser++;throw Error('Must never open');}},{});
  worker.vpn.ensure=async()=>{counts.vpn++;throw Error('Must never connect');};
  store.set('profiles',[{id:'one',name:'Fixture',enabled:true,proxy:{server:''}}]);store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});
  const job=store.enqueue({sceneId:'one',references:[]},'old');store.put({...job.job,state:'ready',providerId:'old_receipt',output:{path:'preserved.mp4'}});
  const chat=new MuseChat(worker);chat.save({requestId:'old_chat',projectId:'fixture',state:'done',response:'Preserve old response'});
  const actions=[()=>worker.context('one'),()=>worker.openProfile('one'),()=>worker.openVpn('one'),()=>worker.connectVpn('one',{}),()=>worker.measureQuota('one',{}),()=>worker.checkProfile('one'),()=>worker.checkAllProfiles(),()=>worker.openResult({id:job.job.id}),()=>worker.recheckResult({id:job.job.id}),()=>worker.enqueue({}),()=>worker.enqueueAndRun({}),()=>worker.start({count:1}),()=>worker.run(job.job.id,'one'),()=>worker.resume(job.job.id),()=>chat.send({}),()=>chat.open({requestId:'old_chat'}),()=>chat.recover({requestId:'old_chat'})];
  for(const action of actions)await assert.rejects(action,{code:'MUSE_PAUSED'});
  const research=new ResearchRunner({worker,chat:{send:async()=>counts.chat++},local:{}});
  store.set('research_runs',[{id:'old_run',state:'queued'}]);research.boot();assert.equal(research.running,null);
  assert.throws(()=>research.start({requestId:'new'}),{code:'MUSE_PAUSED'});
  assert.throws(()=>research.resume({id:'old_run'}),{code:'MUSE_PAUSED'});
  await assert.rejects(research.run('old_run'),{code:'MUSE_PAUSED'});
  worker.paused=false;worker.approvedIds=[job.job.id];worker.tick();
  assert.deepEqual(counts,{browser:0,vpn:0,chat:0,network:0});
  assert.equal(store.jobs().length,1);assert.equal(store.job(job.job.id).providerId,'old_receipt');assert.equal(store.job(job.job.id).output.path,'preserved.mp4');
  assert.equal(chat.get('old_chat').response,'Preserve old response');assert.equal(store.batch(),null);assert.equal(store.get('research_runs')[0].state,'queued');
  assert.equal(worker.status().musePaused,true);assert.equal(worker.status().generationReady,false);
});

async function dispatchFixture(t) {
  const root=await mkdtemp(join(tmpdir(),'hermes-dispatch-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{},{}),counts={prepare:0,submit:0,fetch:0,import:0},runs=[];
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:50}}]);
  store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});
  const page={url:()=> 'https://muse.invalid',screenshot:async()=>{}};
  worker.contexts.set('one',{pages:()=>[page]});
  worker.checkToolchain=async()=>true;worker.connectVpn=async()=>{};worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>null;
  worker.validateOutput=async()=>({sha256:'a'.repeat(64),size:3,metadata:{width:90,height:160,duration:8}});
  worker.receiveOutput=async()=>counts.import++;
  const run=worker.run.bind(worker);worker.run=(...args)=>{const result=run(...args);runs.push(result);return result;};
  const submitted=Promise.withResolvers(),finish=Promise.withResolvers();
  t.mock.method(MuseAdapter.prototype,'prepare',async()=>counts.prepare++);
  t.mock.method(MuseAdapter.prototype,'submit',async(_page,checkpoint)=>{counts.submit++;checkpoint('submitting');checkpoint('submitted',{providerId:'fixture-result'});submitted.resolve();});
  t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{counts.fetch++;await finish.promise;checkpoint('waiting');checkpoint('downloading');await writeFile(path,'abc');return path;});
  const enqueue=sceneId=>store.enqueue({sceneId,mediaType:'video',references:[]},sceneId).job;
  return {worker,store,counts,runs,submitted,finish,enqueue};
}

test('T-002b B: pause clears approval; active job completes; enable waits for explicit start',async t=>{
  const {worker,store,counts,runs,submitted,finish,enqueue}=await dispatchFixture(t);
  const first=enqueue('first'),second=enqueue('second');
  await worker.setMusePaused({paused:false});
  await worker.start({count:2,jobIds:[first.id,second.id],maxConcurrent:1});
  await submitted.promise;assert.equal(counts.submit,1);assert.deepEqual(worker.approvedIds,[second.id]);
  await worker.setMusePaused({paused:true});
  assert.equal(worker.paused,true);assert.deepEqual(worker.approvedIds,[]);assert.equal(worker.budget,0);
  finish.resolve();await runs[0];
  assert.equal(store.job(first.id).state,'ready');assert.ok(store.job(first.id).importedAt);
  await worker.setMusePaused({paused:false});worker.tick();
  assert.equal(worker.paused,true);assert.equal(counts.submit,1);assert.equal(runs.length,1);assert.equal(store.job(second.id).state,'queued');
  await worker.start({count:1,jobIds:[second.id]});await runs[1];
  assert.equal(store.job(second.id).state,'ready');assert.deepEqual(counts,{prepare:2,submit:2,fetch:2,import:2});
});

test('T-002b D: paused then enabled then explicit start submits exactly one legacy Muse job',async t=>{
  const {worker,store,counts,runs,finish,enqueue}=await dispatchFixture(t);
  const job=enqueue('resume');finish.resolve();
  await assert.rejects(worker.start({count:1,jobIds:[job.id]}),{code:'MUSE_PAUSED'});assert.equal(counts.submit,0);
  await worker.setMusePaused({paused:false});worker.tick();assert.equal(counts.submit,0);
  await worker.start({count:1,jobIds:[job.id]});await runs[0];worker.tick();
  assert.equal(store.job(job.id).state,'ready');assert.deepEqual(counts,{prepare:1,submit:1,fetch:1,import:1});
  assert.equal(store.batch().submittedByProfile.one,1);
});

test('T-002b C: inherited timers cannot open another profile, measure its quota or admit new work after pause',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const worker=new Worker(store,'outputs/T-002b-timer-fixture',{},{}),context={};
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''}}]);worker.contexts.set('one',context);
  await worker.setMusePaused({paused:false});
  const entered=Promise.withResolvers(),release=Promise.withResolvers(),afterTask=Promise.withResolvers(),afterCheck=Promise.withResolvers();
  const completed=runMuseTask(store,{jobId:'first',profileId:'one'},async()=>{
    const timer=new Promise((resolve,reject)=>setTimeout(()=>release.promise.then(async()=>{
      for(const action of [()=>worker.context('two'),()=>worker.measureQuota('two',{}),()=>worker.connectVpn('two',{}),()=>worker.enqueue({}),()=>worker.start({count:1}),()=>worker.run('second','one'),()=>new MuseChat(worker).send({})])
        await assert.rejects(action,{code:'MUSE_PAUSED'});
      assert.throws(()=>assertMuseAvailable(store,{jobId:'second',profileId:'one'}),{code:'MUSE_PAUSED'});
      assertMuseAvailable(store,{jobId:'first',profileId:'one'});
      assert.equal(await worker.context('one'),context);
    }).then(resolve,reject),0));
    // Retain the inherited context after the admitted job finishes as well.
    setTimeout(()=>afterTask.promise.then(async()=>{
      await assert.rejects(worker.context('one'),{code:'MUSE_PAUSED'});
    }).then(afterCheck.resolve,afterCheck.reject),0);
    entered.resolve();await timer;
  });
  await entered.promise;await worker.setMusePaused({paused:true});release.resolve();await completed;
  afterTask.resolve();await afterCheck.promise;
});

test('pause persists without closing contexts or changing legacy browser options',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-pause-context-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  let closed=0,opened=0,routes=0;
  const context={on(){},route:async()=>routes++,close:async()=>closed++};
  const worker=new Worker(store,root,{launchPersistentContext:async(_path,options)=>{opened++;assert.equal(options.serviceWorkers,undefined);return context;}},{});
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''}}]);
  await worker.setMusePaused({paused:false});await worker.context('one');
  await worker.setMusePaused({paused:true});
  assert.equal(closed,0);assert.equal(routes,0);assert.equal(opened,1);
  assert.equal(new Worker(store,root,{},{}).status().musePaused,true);
  await assert.rejects(worker.context('one'),{code:'MUSE_PAUSED'});
  await worker.setMusePaused({paused:false});assert.equal(await worker.context('one'),context);assert.equal(opened,1);
});

test('pausing while a profile waits for close prevents reopening it',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-pause-opening-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  let opened=0,finishClose;
  const worker=new Worker(store,root,{launchPersistentContext:async()=>{opened++;throw Error('Must not reopen');}},{});
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''}}]);
  await worker.setMusePaused({paused:false});
  worker.closing.set('one',new Promise(resolve=>{finishClose=resolve;}));
  const pending=worker.context('one');
  const rejected=assert.rejects(pending,{code:'MUSE_PAUSED'});
  await worker.setMusePaused({paused:true});finishClose();await rejected;
  assert.equal(opened,0);
});

test('Muse switch survives closing and reopening the desktop SQLite fixture',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-switch-durable-')),path=join(root,'worker.sqlite');
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [previous,next] of [[true,false],[false,true],[true,false]]){
    const store=new Store(path);
    try{
      const worker=new Worker(store,root,{},{});
      assert.equal(worker.status().musePaused,previous);
      await worker.setMusePaused({paused:next});
    }finally{store.close();}
  }
});

for(const pauseAt of ['prepare','submitted','fetch'])test('running Muse job completes and imports after pause at '+pauseAt+'; enabling uses the same legacy adapter',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-pause-running-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{},{}),counts={prepare:0,submit:0,fetch:0,import:0,close:0};
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:50}}]);
  store.set('adapter',{enabled:true,startUrl:'https://muse.invalid'});
  const page={url:()=> 'https://muse.invalid',screenshot:async()=>{}};
  const context={pages:()=>[page],close:async()=>counts.close++};worker.contexts.set('one',context);
  worker.connectVpn=async()=>{};worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>null;
  worker.validateOutput=async()=>({sha256:'a'.repeat(64),size:3,metadata:{width:90,height:160,duration:8}});
  let pausedOnce=false;
  async function maybePause(stage){if(stage===pauseAt&&!pausedOnce){pausedOnce=true;await worker.setMusePaused({paused:true});
    await assert.rejects(worker.enqueue({}),{code:'MUSE_PAUSED'});await assert.rejects(worker.start({count:1}),{code:'MUSE_PAUSED'});
    await assert.rejects(new MuseChat(worker).send({}),{code:'MUSE_PAUSED'});}}
  t.mock.method(MuseAdapter.prototype,'prepare',async()=>{counts.prepare++;await maybePause('prepare');});
  t.mock.method(MuseAdapter.prototype,'submit',async(_page,checkpoint)=>{counts.submit++;checkpoint('submitting');checkpoint('submitted',{providerId:'fixture-result'});await maybePause('submitted');});
  t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{counts.fetch++;await maybePause('fetch');checkpoint('waiting');checkpoint('downloading');await writeFile(path,'abc');return path;});
  worker.receiveOutput=async id=>{counts.import++;assert.equal(store.job(id).state,'ready');};
  await assert.rejects(worker.run('unused','one'),{code:'MUSE_PAUSED'});assert.equal(counts.submit,0);
  await worker.setMusePaused({paused:false});
  const first=store.enqueue({sceneId:'first',mediaType:'video',references:[]},'first').job;store.transition(first.id,'preflight',{profileId:'one'});
  const pending=store.enqueue({sceneId:'pending',references:[]},'pending').job;
  worker.approvedIds=[pending.id];worker.paused=false;worker.active.set('one',first.id);
  await worker.run(first.id,'one');worker.active.clear();worker.tick();
  assert.equal(store.job(first.id).state,'ready');assert.ok(store.job(first.id).importedAt);assert.equal(store.job(pending.id).state,'queued');
  assert.deepEqual(counts,{prepare:1,submit:1,fetch:1,import:1,close:0});
  // Resume with an explicit run so this fixture never calls FFmpeg/browser.
  worker.paused=true;worker.approvedIds=[];await worker.setMusePaused({paused:false});store.transition(pending.id,'preflight',{profileId:'one'});
  await worker.run(pending.id,'one');
  assert.equal(store.job(pending.id).state,'ready');assert.deepEqual(counts,{prepare:2,submit:2,fetch:2,import:2,close:0});
  assert.equal(store.batch().submittedByProfile.one,2);
});
