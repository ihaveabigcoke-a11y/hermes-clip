import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,writeFile,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const request={projectId:'fixture',sceneId:'fixture',mediaType:'video',prompt:'Fixture only.',references:[]};

test('T-057 close waits for terminal-run cleanup, cancels dispatch and permits late ticks after store close',async()=>{
 const store=new Store(':memory:'),worker=new Worker(store,tmpdir(),{},{},()=>8*1024**3);
 store.set('muse_paused',false);store.set('profiles',[{id:'fixture',name:'Fixture',enabled:true}]);
 const job=store.enqueue(request,'fixture').job;worker.diskStatus=()=>({blocked:false});
 let release,finished=false;
 const gate=new Promise(resolve=>{release=resolve;});
 worker.run=async()=>{await gate;store.put({...store.job(job.id),state:'needs_attention'});finished=true;};
 worker.paused=false;worker.approvedIds=[job.id];worker.tick();assert.equal(worker.active.size,1);
 let closed=false;const closing=worker.close().then(()=>{closed=true;});
 try{
  await Promise.resolve();assert.equal(closed,false);assert.equal(store.closed,false);assert.equal(worker.closed,true);
  worker.tick();assert.equal(worker.active.size,1);release();await closing;
  assert.equal(finished,true);assert.equal(worker.active.size,0);assert.equal(worker.pendingTicks.size,0);
  assert.equal(store.get('muse_paused'),false);assert.equal(store.get('profiles')[0].enabled,true);
  store.close();assert.equal(store.closed,true);assert.doesNotThrow(()=>worker.tick());await worker.close();store.close();
 }finally{release();await closing;store.close();}
});

test('T-057 tick skips a closed Store even without worker close, but does not hide live database errors',()=>{
 const store=new Store(':memory:'),worker=new Worker(store,tmpdir(),{},{});
 worker.paused=false;worker.approvedIds=['fixture'];
 store.db.exec('DROP TABLE kv');assert.throws(()=>worker.tick(),/no such table/);
 store.close();assert.doesNotThrow(()=>worker.tick());
});

test('T-057 shutdown reports runner cleanup errors instead of treating them as success',async()=>{
 const store=new Store(':memory:'),worker=new Worker(store,tmpdir(),{},{});
 worker.trackTick(Promise.reject(Error('fixture cleanup failure')));
 try{await assert.rejects(worker.close(),error=>error instanceof AggregateError&&error.errors[0].message==='fixture cleanup failure');}
 finally{store.close();}
});

test('T-057 repeated status/watchdog hash failures are cached; job, size, mtime and receipt changes recheck bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'t057-')),store=new Store(':memory:'),worker=new Worker(store,root,{},{});
 const originalRead=fs.readSync;let reads=0;
 fs.readSync=(...args)=>{reads++;return originalRead(...args);};syncBuiltinESMExports();
 try{
  const path=join(root,'fixture.mp4');await writeFile(path,'bad bytes');
  const base=store.enqueue(request,'lost').job;
  const output={path,size:9,sha256:hash('new bytes'),fullDecode:true,metadata:{verifiedBy:'container'}};
  let job=store.put({...base,state:'needs_attention',failureCode:'WORKER_LOST',heartbeatAt:1,updatedAt:1,output});
  worker.status();const first=reads;assert.ok(first>0);
  for(let i=0;i<5;i++){worker.status();store.recover({restart:false});}
  assert.equal(reads,first);assert.equal(store.job(job.id).state,'needs_attention');
  job=store.put({...job,updatedAt:2});worker.status();assert.ok(reads>first);let previous=reads;
  const before=await stat(path);await utimes(path,before.atime,new Date(before.mtimeMs+2000));worker.status();assert.ok(reads>previous);previous=reads;
  job=store.put({...job,output:{...output,size:10,sha256:hash('new bytes!')}});await writeFile(path,'bad bytes!');worker.status();assert.ok(reads>previous);previous=reads;
  // Repair at the same size without changing updatedAt: file metadata must invalidate the miss.
  await writeFile(path,'new bytes!');
  worker.status();assert.ok(reads>previous);assert.equal(store.job(job.id).state,'ready');
  // Receipt-only edits with the same timestamp cannot reuse a stale failure.
  job={...job,id:'receipt',output:{...job.output,sha256:hash('wrong')}};
  assert.equal(store.verifiedSavedOutput(job),false);previous=reads;
  assert.equal(store.verifiedSavedOutput(job),false);assert.equal(reads,previous);
  assert.equal(store.verifiedSavedOutput({...job,output:{...job.output,sha256:hash('new bytes!')}}),true);assert.ok(reads>previous);
 }finally{fs.readSync=originalRead;syncBuiltinESMExports();await worker.close();store.close();await rm(root,{recursive:true,force:true});}
});
