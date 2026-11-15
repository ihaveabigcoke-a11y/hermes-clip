import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {enqueueMuseJob} from '../src/muse-enqueue-ipc.mjs';

const request={projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Scene',mediaType:'video',ratio:'9:16',duration:8,prompt:'Approved scene',references:[]};

test('T-037 IPC pins only the selected profile, survives restart and never falls back when that profile is stopped',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'t037-profile-')),store=new Store(join(dir,'fixture.sqlite'));
 try{
  store.set('muse_paused',false);
  const profiles=['other','chi'].map(id=>({id,name:id,enabled:true,proxy:{},health:'ready'}));
  store.set('profiles',profiles);
  let worker=new Worker(store,dir,{},{},()=>8*1024**3);worker.night.begin();
  const result=await enqueueMuseJob(worker,{...request,profileId:'chi'});
  assert.equal(result.job.preferredProfileId,'chi');
  assert.equal(result.job.request.profileId,undefined);
  assert.equal(result.job.state,'queued');
  worker=new Worker(store,dir,{},{},()=>8*1024**3);let dispatched=[];
  worker.run=async(id,profileId)=>{dispatched.push(profileId);};
  worker.approvedIds=[result.job.id];worker.paused=false;worker.tick();
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(dispatched,['chi']);
  const second=await enqueueMuseJob(worker,{...request,sceneId:'next',profileId:'chi'});
  worker.night.outcome('refusal',Object.assign(Error('No video'),{code:'MUSE_NO_MEDIA'}),'chi');
  worker.approvedIds=[second.job.id];worker.tick();await new Promise(r=>setImmediate(r));
  assert.deepEqual(dispatched,['chi']);assert.equal(store.job(second.job.id).state,'queued');
  assert.deepEqual(store.get('profiles'),profiles);assert.equal(store.get('muse_paused'),false);
  assert.equal(worker.night.profileStatus('other').stopped,false);assert.equal(worker.night.profileStatus('chi').stopped,true);
  const count=store.jobs().length;
  await assert.rejects(async()=>enqueueMuseJob(worker,{...request,sceneId:'bad',profileId:'../bad'}));
  await assert.rejects(enqueueMuseJob(worker,{...request,sceneId:'missing',profileId:'missing'}));
  assert.equal(store.jobs().length,count);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
