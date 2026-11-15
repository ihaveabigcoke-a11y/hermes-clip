import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {retryBlockedReason} from '../src/job-retry.mjs';
import {isRunningJob,jobHeartbeatTimeout} from '../src/job-status.mjs';
import {matchesQueueFilter,queueAction} from '../../lib/lab/queue-view.ts';
import {runMediaTool} from '../src/compress.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const request=id=>({projectId:'project',productId:'product',productRevision:1,sceneId:id,sceneRevision:1,name:id,mediaType:'video',ratio:'9:16',duration:1,prompt:'Synthetic fixture',references:[]});
function running(store,id,patch={}){const j=store.enqueue(request(id),id).job;return store.put({...j,state:'waiting',providerId:'provider_'+id,providerUrl:'https://muse.invalid/thread/fixture',...patch});}
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'t050-')),store=new Store(join(root,'fixture.sqlite')),stores=[store];t.after(async()=>{for(const s of stores)s.close();await rm(root,{recursive:true,force:true});});return {root,store,stores};}

test('T-050 killing the fake worker and reopening completes verified bytes, blocks unknown retries and preserves old receipts',{timeout:30000},async t=>{
  const {root,store,stores}=await fixture(t);
  const old=store.enqueue(request('old'),'old').job;store.put({...old,state:'ready',providerResponse:'Old receipt unchanged',importedAt:123,uploadedAssetId:'old_asset'});
  const oldBody=store.db.prepare('SELECT body FROM jobs WHERE id=?').get(old.id).body;
  await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=red:s=90x160:r=24:d=1','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',join(root,'source.mp4')]);
  const child=fork(new URL('./fixtures/t050-worker.mjs',import.meta.url),[root],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  t.after(()=>{if(child.exitCode===null)child.kill();});let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  const [{ids,sends}]=await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error(errors);})]);
  const receipts=Object.fromEntries(Object.values(ids).map(id=>{const j=store.job(id);return [id,hash([j.request,j.providerId,j.providerUrl,j.providerResponse,j.output])];}));
  const exited=once(child,'exit');child.kill();await exited;
  assert.equal(sends,2);assert.equal(store.job(ids.saved).state,'validating');
  const reopened=new Store(join(root,'fixture.sqlite'));stores.push(reopened);
  const worker=new Worker(reopened,root,{},{}),status=worker.status();
  assert.equal(reopened.job(ids.saved).state,'ready');assert.equal(status.active,0);assert.ok(status.jobs.every(j=>!isRunningJob(j)));
  assert.equal(reopened.job(ids.waiting).state,'needs_attention');assert.match(retryBlockedReason(reopened.job(ids.waiting)),/đối soát/);
  await assert.rejects(worker.retry(ids.waiting),/đối soát/);
  assert.equal(reopened.db.prepare('SELECT body FROM jobs WHERE id=?').get(old.id).body,oldBody);
  for(const id of Object.values(ids)){const j=reopened.job(id);assert.equal(hash([j.request,j.providerId,j.providerUrl,j.providerResponse,j.output]),receipts[id]);}
  assert.equal(hash(await readFile(reopened.job(ids.saved).output.path)),reopened.job(ids.saved).output.sha256);
  assert.equal(reopened.get('muse_paused'),false);assert.ok(reopened.get('profiles').every(p=>p.enabled&&p.vpnEnabled));
  const stable=hash(reopened.jobs());reopened.recover();assert.equal(hash(reopened.jobs()),stable);
});

test('T-050 configured heartbeat deadline, restart before deadline, idle runners and bundle counts share the store snapshot',async t=>{
  const {root,store}=await fixture(t),worker=new Worker(store,root,{},{});store.set('adapter',{timeoutSeconds:60});
  assert.equal(jobHeartbeatTimeout(null),900000);assert.equal(jobHeartbeatTimeout({timeoutSeconds:1800}),1800000);
  const now=Date.now(),jobs=['a','b','c'].map(id=>running(store,id,{heartbeatAt:now}));
  worker.active.set('one',jobs[0].id);assert.equal(worker.status().active,3);
  store.recover({restart:false,now:now+59999});assert.ok(store.jobs().every(isRunningJob));
  store.heartbeat([jobs[1].id],now+50000);store.recover({restart:false,now:now+60000});
  assert.equal(store.job(jobs[0].id).failureCode,'WORKER_LOST');assert.equal(store.job(jobs[1].id).state,'waiting');
  const lost=store.job(jobs[0].id);assert.equal(matchesQueueFilter(lost,'failed'),true);assert.equal(matchesQueueFilter(lost,'active'),false);assert.equal(queueAction(lost),'resume');
  assert.throws(()=>store.retryMany([{id:lost.id}]),/mất dấu.*đối soát/);
  const before=hash(lost);store.heartbeat([lost.id],now+65000);assert.equal(hash(store.job(lost.id)),before);
  store.recover({restart:true,now:now+65000});assert.equal(store.job(jobs[1].id).failureCode,'WORKER_INTERRUPTED');
  store.recover({restart:false,now:now+110000});assert.equal(store.job(jobs[1].id).failureCode,'WORKER_LOST');
  const status=worker.status();assert.equal(status.active,0);assert.equal(worker.active.size,1);assert.ok(status.jobs.every(j=>j.label==='Lỗi: mất dấu'));
  assert.equal(status.active,status.jobs.filter(j=>matchesQueueFilter(j,'active')).length);
});

test('T-050 recovery rejects missing/tampered/unvalidated files and incomplete appearance bundles',async t=>{
  const {root,store}=await fixture(t),path=join(root,'fixture.mp4');await writeFile(path,'fixture bytes');
  const output={path,name:'fixture.mp4',sha256:hash('fixture bytes'),fullDecode:true,metadata:{verifiedBy:'container'}};
  const bad=[running(store,'wrong',{output:{...output,sha256:hash('different')}}),running(store,'missing',{output:{...output,path:join(root,'absent.mp4')}}),running(store,'unchecked',{output:{...output,fullDecode:false}})];
  const parent=running(store,'parent',{output:{...output,bundleVisualCheck:{passed:true}}}),child=running(store,'child');
  store.put({...parent,bundleMapping:'appearance-v1',bundleJobIds:[parent.id,child.id]});store.put({...child,bundleParentId:parent.id});
  store.recover();for(const j of [...bad,parent,child]){assert.equal(store.job(j.id).state,'needs_attention');assert.ok(retryBlockedReason(store.job(j.id)));}
  assert.equal(await readFile(path,'utf8'),'fixture bytes');
});

test('T-050 saving outputs is atomic and terminal output survives a late heartbeat',async t=>{
  const {store}=await fixture(t);const a=running(store,'a',{state:'validating'}),b=running(store,'b',{state:'waiting'}),before=hash(store.jobs());
  const entries=[a,b].map(j=>({id:j.id,patch:{output:{sha256:hash(j.id)},note:'Verified fixture'}}));
  assert.throws(()=>store.completeOutputs(entries),/waiting → ready/);assert.equal(hash(store.jobs()),before);
  store.put({...b,state:'validating'});store.completeOutputs(entries);const after=hash(store.jobs());
  store.heartbeat([a.id,b.id]);store.recover();assert.equal(hash(store.jobs()),after);assert.ok(store.jobs().every(j=>j.state==='ready'));
});

test('T-050 local recovery cannot bypass the old-clip ledger',async t=>{
  const {root,store}=await fixture(t),path=join(root,'clip.mp4');await writeFile(path,'same bytes');
  const output={path,name:'clip.mp4',sha256:hash('same bytes'),fullDecode:true,metadata:{verifiedBy:'container'}};
  const old=running(store,'old',{state:'ready',output,importedAt:123,uploadedAssetId:'asset'});store.seedMuseClips();
  const fresh=running(store,'fresh',{output}),before=hash(store.job(old.id));store.recover();
  assert.equal(store.job(fresh.id).state,'needs_attention');assert.equal(hash(store.job(old.id)),before);assert.throws(()=>store.retry(fresh.id),/đối soát/);
});

test('T-050 another connection completing during reconciliation cannot be rewound or touched by late heartbeats',async t=>{
  const {root,store,stores}=await fixture(t),other=new Store(join(root,'fixture.sqlite'));stores.push(other);
  const job=running(store,'race',{state:'validating',heartbeatAt:1});
  let completed;
  store.verifiedSavedOutput=()=>{
    other.completeOutputs([{id:job.id,patch:{output:{sha256:hash('verified')},note:'Completed concurrently'}}]);
    completed=other.db.prepare('SELECT body FROM jobs WHERE id=?').get(job.id).body;
    return false;
  };
  store.recover({restart:false,now:Date.now()});store.heartbeat([job.id]);
  assert.equal(store.db.prepare('SELECT body FROM jobs WHERE id=?').get(job.id).body,completed);
  assert.equal(store.job(job.id).state,'ready');
});
