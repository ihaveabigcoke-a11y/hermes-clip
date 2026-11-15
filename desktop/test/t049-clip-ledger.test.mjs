import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {retryBlockedReason} from '../src/job-retry.mjs';
import {mediaIdeas} from '../../lib/lab/media-catalog.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,
  name:'Cảnh '+i,prompt:MUSE_VIDEO_COMMAND+'\nA product scene.',mediaType:'video',ratio:'9:16',duration:1,references:[]});
const output=bytes=>({sha256:hash(bytes),metadata:{width:720,height:1280,duration:1},fullDecode:true});
function oldJob(store,bytes='old'){
  const job=store.enqueue(request('old'),'old').job;
  return store.put({...job,state:'ready',output:output(bytes),uploadedAssetId:'old_asset',importedAt:123,
    providerId:'old_provider',providerUrl:'https://fixture.invalid/thread/old',providerResponse:'Old receipt'});
}

test('T-049 additive migration, take backfill and restart preserve every existing job/receipt byte',async t=>{
  const root=await mkdtemp(join(tmpdir(),'t049-migration-'));
  const path=join(root,'fixture.sqlite'),legacy=new DatabaseSync(path);
  legacy.exec('CREATE TABLE kv(k TEXT PRIMARY KEY,v TEXT NOT NULL); CREATE TABLE jobs(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,body TEXT NOT NULL)');
  const body=JSON.stringify({id:'old',request:request('old'),provider:'muse',state:'ready',output:output('old'),uploadedAssetId:'asset',history:[{note:'Receipt unchanged'}]});
  legacy.prepare('INSERT INTO jobs VALUES(?,?,?)').run('old','old',body);legacy.prepare('INSERT INTO kv VALUES(?,?)').run('legacy','{"unchanged":true}');legacy.close();
  let store=new Store(path);store.seedMuseClips();assert.equal(store.db.prepare('SELECT body FROM jobs').get().body,body);
  const take={id:'take',provider:'muse',attemptId:'attempt',assetId:'orphan_asset',createdAt:100,sha256:hash('orphan'),compression:{sourceSha256:hash('raw orphan')}};
  const records=[{id:'older_project',kind:'production',data:{scenes:[{id:'older_scene',attempts:[{id:'attempt',requestId:'missing_job',provider:'muse'}],takes:[take,{...take,id:'manual',provider:'manual',sha256:hash('manual')}]}]}}];
  const before=structuredClone(records);store.seedMuseClips(records);store.seedMuseClips(records);assert.deepEqual(records,before);
  assert.equal(store.db.prepare('SELECT count(*) n FROM muse_clip_hashes').get().n,3);store.close();
  store=new Store(path);t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});assert.deepEqual(store.get('legacy'),{unchanged:true});assert.equal(store.db.prepare('SELECT body FROM jobs').get().body,body);
  const fresh=store.enqueue(request('new'),'new').job;
  assert.throws(()=>store.claimMuseClips([{job:fresh,output:output('raw orphan')}]),e=>e.code==='MUSE_OLD_CLIP'&&e.duplicateOf.takeId==='take'&&e.duplicateOf.assetId==='orphan_asset');
  store.claimMuseClips([{job:fresh,output:output('manual')}]);
});

test('T-049 atomic bundle claims, concurrent connections and idempotent variants keep one owner',async t=>{
  const root=await mkdtemp(join(tmpdir(),'t049-race-'));
  const path=join(root,'fixture.sqlite'),store=new Store(path),other=new Store(path);t.after(async()=>{other.close();store.close();await rm(root,{recursive:true,force:true});});
  const old=oldJob(store);store.seedMuseClips();
  const a=store.enqueue(request('a'),'a').job,b=store.enqueue(request('b'),'b').job;
  assert.throws(()=>store.claimMuseClips([{job:a,output:output('new')},{job:b,output:output('old')}]),{code:'MUSE_OLD_CLIP'});
  assert.equal(store.duplicateMuseClip(b,output('new')),null,'Rejected bundle rolls back all its reservations');
  store.claimMuseClips([{job:a,output:output('new')},{job:a,output:output('variant')}]);
  store.claimMuseClips([{job:a,output:output('new')}]);
  assert.throws(()=>other.claimMuseClips([{job:b,output:output('new')}]),{code:'MUSE_OLD_CLIP'});
  assert.throws(()=>other.claimMuseClips([{job:{...a,request:request('another_scene')},output:output('variant')}]),{code:'MUSE_OLD_CLIP'});
  assert.deepEqual(store.job(old.id),old);
  store.put({...a,state:'failed',reconciled:true});const retry=store.retry(a.id);
  assert.throws(()=>store.claimMuseClips([{job:retry,output:output('new')}]),{code:'MUSE_OLD_CLIP'});
});

async function fixture(t,{bundle=false,rawDuplicate=false,longVideo=false}={}){
  const root=await mkdtemp(join(tmpdir(),'t049-worker-')),store=new Store(':memory:');t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{},{},()=>8*1024**3),old=oldJob(store);
  const profiles=[{id:'p',name:'Duc',proxy:{server:'',username:''},enabled:true,vpnEnabled:true,vpn:{state:'connected'},quota:{state:'available'},health:'ready'}];
  store.set('muse_paused',false);store.set('profiles',profiles);store.set('adapter',{enabled:true,startUrl:'https://fixture.invalid',timeoutSeconds:30});
  const jobs=Array.from({length:bundle?3:1},(_,i)=>store.enqueue({...request(i),...(longVideo?{longVideo:{runId:'run',index:1}}:{})},'new'+i).job);
  if(bundle){store.put({...jobs[0],bundleMapping:'appearance-v1',bundleJobIds:jobs.map(j=>j.id)});for(const job of jobs.slice(1))store.put({...job,bundleParentId:jobs[0].id});}
  store.transition(jobs[0].id,'preflight',{profileId:'p'});
  worker.context=async()=>({pages:()=>[],newPage:async()=>({url:()=> 'https://fixture.invalid/thread/new',screenshot:async()=>{}})});
  worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};
  worker.validateOutput=async path=>output(await readFile(path));worker.readBundleFrame=async path=>Buffer.alloc(3072,60*jobs.findIndex(j=>path.includes(j.id)));
  let sends=0,imports=0,early=0;const files=new Map();
  t.mock.method(MuseAdapter.prototype,'prepare',async function(_page,body){assert.equal(body.prompt.split(MUSE_VIDEO_COMMAND).length-1,1);});
  t.mock.method(MuseAdapter.prototype,'submit',async function(_page,checkpoint){
    sends++;await checkpoint('submitting');this.timings={resultAt:Date.now()};
    if(bundle){for(let i=0;i<3;i++)this.onBundleCard(i,'result'+i,'https://fixture.invalid/thread/receipt');await checkpoint('submitted',{bundleProviderIds:['result0','result1','result2']});store.put({...store.job(jobs[0].id),providerResponse:'Receipt kept'});}
    else await checkpoint('submitted',{providerId:'result',providerUrl:'https://fixture.invalid/thread/receipt',providerResponse:'Receipt kept'});
  });
  t.mock.method(MuseAdapter.prototype,'fetch',async function(_page,job,checkpoint,path){
    await checkpoint('waiting');await checkpoint('downloading');
    const i=jobs.findIndex(j=>j.id===job.id),bytes=Buffer.from(i===0?(rawDuplicate?'normalized':'old'):'new'+i);await writeFile(path,bytes);files.set(job.id,{path,bytes});
    if(rawDuplicate){this.compression={sha256:hash(bytes),sourceSha256:hash('old')};this.downloadMetadata=output(bytes).metadata;}
    return path;
  });
  worker.receiveOutput=async id=>{imports++;const file=await worker.output(id);worker.acknowledge(id,'asset_'+id);assert.equal(file.sha256,hash(files.get(id).bytes));};
  worker.onReadyOutput=()=>early++;
  await worker.runAdmitted(jobs[0].id,'p',false);
  assert.equal(sends,1);assert.equal(imports,0);assert.equal(store.get('muse_paused'),false);
  const checkedAt=store.get('profiles')[0].checkedAt;assert.ok(Number.isFinite(checkedAt));
  assert.deepEqual(store.get('profiles'),profiles.map(p=>({...p,session:'signed_in',checkedAt})));assert.deepEqual(store.job(old.id),old);
  for(const original of jobs){const job=store.job(original.id);assert.equal(job.state,'failed',job.failureDetail);assert.equal(job.failureCode,'MUSE_OLD_CLIP');assert.equal(job.duplicateOf.jobId,old.id);assert.equal(job.duplicateOf.number,1);assert.equal(job.uploadedAssetId,null);assert.equal(job.importedAt,undefined);assert.ok(job.providerId);assert.equal(job.providerUrl,'https://fixture.invalid/thread/receipt');assert.equal(retryBlockedReason(job),'');assert.deepEqual(await readFile(files.get(job.id).path),files.get(job.id).bytes);}
  assert.equal(store.job(jobs[0].id).providerResponse,'Receipt kept');assert.match(worker.status().jobs.find(j=>j.id===jobs[0].id).label,/Trùng clip cũ #1/);
  if(rawDuplicate)assert.equal(early,0,'Known raw duplicate cannot start speculative render');
  // Explicit recreation is a new draft; no automatic send. Repeated old bytes
  // stay blocked, while genuinely new bytes enter the existing import path.
  if(!longVideo){const retry=await worker.retry(jobs[0].id);assert.equal(retry.state,'queued');assert.equal(sends,1);
    const path=join(root,'fresh.mp4'),bytes=Buffer.from('fresh');await writeFile(path,bytes);files.set(retry.id,{path,bytes});
    store.put({...retry,state:'ready',output:{...output(bytes),path,name:'fresh.mp4'}});
    await worker.importReady(retry.id);assert.equal(imports,1);assert.ok(store.job(retry.id).importedAt);await worker.importReady(retry.id);assert.equal(imports,1);
  }
  return {worker,store,jobs};
}
test('T-049 fake Muse single old clip is refused, receipt/old take stay intact; new hash imports once',t=>fixture(t));
test('T-049 source hash catches an old clip even after normalization changes its bytes',t=>fixture(t,{rawDuplicate:true}));
test('T-049 fake Muse three-card bundle rejects old content before importing any member',t=>fixture(t,{bundle:true}));
test('T-049 long-video scene uses the same byte gate and never advances a duplicate to ready',async t=>{
  const {worker,jobs}=await fixture(t,{longVideo:true});await assert.rejects(worker.retry(jobs[0].id),/Video dài không thử lại/);
});

test('T-049 two alternatives of one Muse job count as one idea, distinct jobs/manual takes stay separate',()=>{
  const scene={id:'scene',attempts:[{id:'a',requestId:'job',provider:'muse'},{id:'b',requestId:'other',provider:'muse'}]};
  const entries=['one','two','three','manual'].map((key,i)=>({key,project:{id:'project'},scene,take:{provider:i===3?'manual':'muse',attemptId:i<2?'a':'b',id:key}}));
  const before=structuredClone(entries),groups=mediaIdeas(entries);assert.deepEqual(groups.map(g=>g.map(e=>e.key)),[['one','two'],['three'],['manual']]);assert.deepEqual(entries,before);
});

test('T-049 legacy sequential bundle leaves unread siblings unreconciled when its first file is old',async t=>{
  const root=await mkdtemp(join(tmpdir(),'t049-legacy-')),store=new Store(':memory:');
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{},{});oldJob(store);const jobs=[0,1,2].map(i=>store.enqueue(request(i),'legacy'+i).job);
  store.set('muse_paused',false);store.set('profiles',[{id:'p',enabled:true,quota:{state:'available'}}]);store.set('adapter',{enabled:true,startUrl:'https://fixture.invalid'});
  store.put({...jobs[0],bundleJobIds:jobs.map(j=>j.id)});for(const j of jobs.slice(1))store.put({...j,bundleParentId:jobs[0].id});store.transition(jobs[0].id,'preflight',{profileId:'p'});
  worker.context=async()=>({pages:()=>[],newPage:async()=>({url:()=>'',screenshot:async()=>{}})});worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};worker.validateOutput=async path=>output(await readFile(path));
  let imports=0,fetches=0,sends=0;worker.receiveOutput=async()=>imports++;
  t.mock.method(MuseAdapter.prototype,'prepare',async()=>{});
  t.mock.method(MuseAdapter.prototype,'submit',async function(_page,checkpoint){sends++;await checkpoint('submitting');await checkpoint('submitted',{providerId:'a',providerUrl:'https://fixture.invalid/thread/old',bundleProviderIds:['a','b','c']});});
  t.mock.method(MuseAdapter.prototype,'fetch',async function(_page,job,checkpoint,path){fetches++;await checkpoint('waiting');await checkpoint('downloading');await writeFile(path,'old');return path;});
  await worker.runAdmitted(jobs[0].id,'p',false);assert.equal(imports,0);assert.equal(fetches,1);assert.equal(sends,1);
  assert.equal(store.job(jobs[0].id).failureCode,'MUSE_OLD_CLIP');
  for(const original of jobs.slice(1)){const job=store.job(original.id);assert.equal(job.state,'needs_attention');assert.notEqual(job.reconciled,true);assert.ok(retryBlockedReason(job));assert.ok(job.providerId);}
});
