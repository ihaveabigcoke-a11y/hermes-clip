import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {profileRemovalBlocker} from '../src/profile-removal.mjs';

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'hermes-profile-skip-')),store=new Store(':memory:');
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{launchPersistentContext(){throw Error('No browser allowed');}},{});
  store.set('profiles',[{id:'banned',name:'ss',enabled:false,proxy:{}},{id:'keep',name:'Keep',enabled:true,proxy:{}}]);
  store.set('muse_paused',false);store.set('manual_receipts',[{id:'keep-receipt'}]);
  for(const id of ['banned','keep']){await mkdir(join(root,'profiles',id),{recursive:true});await writeFile(join(root,'profiles',id,'synthetic-session'),'keep');}
  await writeFile(join(root,'retained.mp4'),'synthetic-media');
  const records=[{id:'project',kind:'production',data:{scenes:[{id:'scene',museReconciledAt:1000}]}}];
  worker.readProductionForProfileRemoval=id=>records.find(r=>r.id===id);
  const enqueue=(patch={})=>{
    const job=store.enqueue({projectId:'project',sceneId:'scene',references:[]},crypto.randomUUID()).job;
    return store.put({...job,profileId:'banned',state:'needs_attention',createdAt:999,...patch});
  };
  return {root,store,worker,records,enqueue};
}

test('profile removal: explicit scene skips allow only that profile, preserving jobs, receipts, media and Muse switch',async t=>{
  const {root,store,worker,records,enqueue}=await fixture(t);
  enqueue();enqueue({state:'unknown',createdAt:1000});enqueue({profileId:'keep'});
  const jobs=structuredClone(store.jobs()),before=structuredClone(records),keep=store.get('profiles')[1];
  assert.equal(worker.profiles().find(p=>p.id==='banned').deleteBlockedReason,'');
  await assert.rejects(worker.deleteProfile({id:'banned',confirmName:'wrong'}),/đúng tên/);
  assert.deepEqual(await worker.deleteProfile({id:'banned',confirmName:'ss'}),{deleted:true,cleanupPending:false});
  assert.deepEqual(store.get('profiles'),[keep]);assert.deepEqual(store.jobs(),jobs);assert.deepEqual(records,before);
  assert.deepEqual(store.get('manual_receipts'),[{id:'keep-receipt'}]);assert.equal(store.get('muse_paused'),false);
  assert.equal(await readFile(join(root,'retained.mp4'),'utf8'),'synthetic-media');
  assert.equal(await readFile(join(root,'profiles','keep','synthetic-session'),'utf8'),'keep');
  await assert.rejects(stat(join(root,'profiles','banned')),/ENOENT/);
});

test('profile removal: newer, untimed, foreign-scene/provider and active jobs still block despite an old skip',async t=>{
  const {root,store,worker,enqueue}=await fixture(t),job=enqueue();
  for(const patch of [
    {createdAt:1001},{createdAt:null},{createdAt:undefined},{provider:'manual'},
    {request:{...job.request,sceneId:'other'}},{request:{...job.request,projectId:'other'}},
    ...['queued','preflight','prepared','submitting','submitted','waiting','downloading','validating'].map(state=>({state})),
    {profileId:'keep',preferredProfileId:'banned',createdAt:1001},
  ]){
    store.put({...job,...patch});const before=store.jobs();
    assert.match(profileRemovalBlocker(worker,'banned'),/đối soát/);
    await assert.rejects(worker.deleteProfile({id:'banned',confirmName:'ss'}),/đối soát/);
    assert.deepEqual(store.jobs(),before);assert.equal(store.get('profiles').length,2);
    assert.equal(await readFile(join(root,'profiles','banned','synthetic-session'),'utf8'),'keep');
  }
});

test('profile removal: absent or unreadable authoritative skip fails closed, including a forged job flag',async t=>{
  const {worker,enqueue}=await fixture(t);enqueue({reconciled:true});
  for(const reader of [undefined,()=>{throw Error('Unreadable');},()=>null,()=>({id:'other',kind:'production'}),
    ()=>({id:'project',kind:'asset'}),()=>({id:'project',kind:'production',data:{scenes:[]}}),
    ()=>({id:'project',kind:'production',data:{scenes:[{id:'scene',museReconciledAt:null}]}})]){
    worker.readProductionForProfileRemoval=reader;
    assert.match(profileRemovalBlocker(worker,'banned'),/đối soát/);
    await assert.rejects(worker.deleteProfile({id:'banned',confirmName:'ss'}),/đối soát/);
  }
});

test('profile removal: final check rereads the scene and retains files if the skip is no longer authoritative',async t=>{
  const {root,store,worker,enqueue,records}=await fixture(t);enqueue();let reads=0;
  worker.readProductionForProfileRemoval=()=>++reads===1?records[0]:null;
  await assert.rejects(worker.deleteProfile({id:'banned',confirmName:'ss'}),/đối soát/);
  assert.equal(reads,2);assert.equal(store.get('profiles').length,2);assert.equal(worker.deleting.size,0);
  assert.equal(await readFile(join(root,'profiles','banned','synthetic-session'),'utf8'),'keep');
});
