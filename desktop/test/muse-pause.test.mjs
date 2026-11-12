import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
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

test('pause persists, closes existing contexts and blocks later requests through an installed route',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-pause-route-')),store=new Store(join(root,'worker.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  let route, closed=0, requests=0, blocked=0;
  const context={on(){},route:async(_pattern,handler)=>{route=handler;},close:async()=>{closed++;}};
  const worker=new Worker(store,root,{launchPersistentContext:async()=>context},{});
  store.set('profiles',[{id:'one',enabled:true,proxy:{server:''}}]);
  await worker.setMusePaused({paused:false});await worker.context('one');
  const request={continue:()=>requests++,abort:()=>blocked++};await route(request);assert.equal(requests,1);
  await worker.setMusePaused({paused:true});await route(request);
  assert.equal(requests,1);assert.equal(blocked,1);assert.equal(closed,1);
  assert.equal(new Worker(store,root,{},{}).status().musePaused,true);
  await assert.rejects(worker.context('one'),{code:'MUSE_PAUSED'});
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
