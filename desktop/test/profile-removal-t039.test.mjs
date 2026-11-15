import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,symlink,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {profileRemovalStatus} from '../src/profile-removal.mjs';

async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'hermes-T039-')),store=new Store(join(root,'temporary.sqlite'));
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  const worker=new Worker(store,root,{launchPersistentContext(){throw Error('T-039 forbids Muse/browser access');}},{});
  const chat=new MuseChat(worker);
  store.set('profiles',['a','b'].map(id=>({id,name:'Hồ sơ '+id,enabled:true,proxy:{},session:'signed_in'})));
  store.set('muse_paused',false);
  store.set('manual_receipts',[{id:'retain-receipt'}]);
  for(const id of ['a','b']){await mkdir(join(root,'profiles',id),{recursive:true});await writeFile(join(root,'profiles',id,'session-fixture'),'session '+id);}
  for(const name of ['video.mp4','reference.png','export.mp4'])await writeFile(join(root,name),'retained '+name);
  const records=[{id:'p',kind:'production',data:{scenes:[{id:'s',museReconciledAt:null}]}}];
  worker.readProductionForProfileRemoval=id=>records.find(r=>r.id===id);
  worker.readProductionRecord=async id=>records.find(r=>r.id===id);
  const job=(patch={})=>{const j=store.enqueue({projectId:'p',sceneId:'s',references:[]},crypto.randomUUID()).job;return store.put({...j,profileId:'a',state:'needs_attention',providerResponse:'Keep exact old response',...patch});};
  const remove=(patch={})=>worker.deleteProfile({id:'a',confirmName:'Hồ sơ a',...patch});
  return {root,store,worker,chat,job,remove,records};
}

for(const enabled of [true,false])for(const musePaused of [true,false])for(const paused of [true,false]){
  test(`T-039 idle deletion: enabled=${enabled}, Muse paused=${musePaused}, worker paused=${paused}`,async t=>{
    const {root,store,worker,remove}=await fixture(t);
    worker.updateProfile('a',{enabled});store.set('muse_paused',musePaused);worker.paused=paused;
    worker.active.set('b','unrelated-job');
    const keep=store.get('profiles')[1];
    assert.deepEqual(profileRemovalStatus(worker,'a'),{deleteBlockedReason:'',deleteCanSkip:false});
    assert.deepEqual(await remove(),{deleted:true,cleanupPending:false});
    assert.deepEqual(store.get('profiles'),[keep]);assert.equal(store.get('muse_paused'),musePaused);assert.equal(worker.paused,paused);
    assert.equal(worker.active.get('b'),'unrelated-job');
    assert.equal(await readFile(join(root,'profiles','b','session-fixture'),'utf8'),'session b');
    assert.equal(await readFile(join(root,'video.mp4'),'utf8'),'retained video.mp4');
    await assert.rejects(stat(join(root,'profiles','a')),/ENOENT/);
  });
}

test('T-039 each in-memory lock blocks both deletion paths with a specific reason and next step',async t=>{
  const {worker,store,remove}=await fixture(t);
  for(const [key,reason] of [['active',/đang gửi hoặc lấy kết quả/],['chatting',/Hội thoại Muse đang xử lý/],['checking',/kiểm tra phiên/],['connectingVpn',/kết nối VPN/],['opening',/đang mở/],['closing',/đang đóng/],['deleting',/đang được xóa/],['contexts',/Đóng trình duyệt bằng nút/]]){
    const lock=worker[key];lock instanceof Set?lock.add('a'):lock.set('a',{});
    const status=profileRemovalStatus(worker,'a');assert.equal(status.deleteCanSkip,false);assert.match(status.deleteBlockedReason,reason);assert.match(status.deleteBlockedReason,/Chờ|Đóng/);
    for(const skipUnreconciled of [false,true])await assert.rejects(remove({skipUnreconciled}),reason);
    assert.equal(store.get('profiles').length,2);lock.delete('a');
  }
});

test('T-039 queued and in-flight jobs cannot be bypassed even if worker is paused or reconciled is forged',async t=>{
  const {worker,job,store,remove}=await fixture(t),j=job();
  for(const state of ['queued','preflight','prepared','submitting','submitted','waiting','downloading','validating']){
    store.put({...j,state,reconciled:true});const before=store.jobs();
    assert.equal(profileRemovalStatus(worker,'a').deleteCanSkip,false);
    for(const skipUnreconciled of [false,true])await assert.rejects(remove({skipUnreconciled}),state==='queued'?/Mở Hàng đợi, hủy/:/Chờ tác vụ kết thúc/);
    assert.deepEqual(store.jobs(),before);
  }
});

test('T-039 explicit name and boolean confirmation required; skipped receipts/history survive, B stays byte-for-byte',async t=>{
  const {root,worker,store,job,chat,remove,records}=await fixture(t);
  const ja=job(),jb=job({profileId:'b'});
  const ca=chat.save({requestId:'ca',projectId:'p',profileId:'a',state:'unknown',response:'old text'});
  const cb=chat.save({requestId:'cb',projectId:'p',profileId:'b',state:'needs_attention',response:'B text'});
  for(const key of ['research_runs','product_deployments'])store.set(key,[{id:'ra',profileId:'a',state:'paused',items:[{receipt:'preserve'}]},{id:'rb',profileId:'b',state:'needs_attention'}]);
  const keep=structuredClone(store.get('profiles')[1]),projects=structuredClone(records),batch=store.newBatch();
  assert.equal(profileRemovalStatus(worker,'a').deleteCanSkip,true);
  await assert.rejects(remove(),/Bỏ qua và xóa/);
  await assert.rejects(remove({skipUnreconciled:'true'}),/không hợp lệ/);
  await assert.rejects(remove({skipUnreconciled:true,confirmName:'sai'}),/đúng tên/);
  assert.deepEqual(store.job(ja.id),ja);assert.deepEqual(chat.get('ca'),ca);
  assert.deepEqual(await remove({skipUnreconciled:true}),{deleted:true,cleanupPending:false});
  const saved=store.job(ja.id);assert.equal(saved.state,ja.state);assert.equal(saved.providerResponse,ja.providerResponse);assert.equal(saved.reconciliation,'skipped');assert.equal(saved.reconciled,true);
  assert.deepEqual(saved.history.slice(0,-1),ja.history);assert.match(saved.history.at(-1).note,/Bỏ qua và xóa/);
  assert.deepEqual(store.job(jb.id),jb);assert.deepEqual(chat.get('cb'),cb);assert.equal(chat.get('ca').response,ca.response);assert.equal(chat.get('ca').reconciliation,'skipped');
  for(const key of ['research_runs','product_deployments']){const rows=store.get(key);assert.equal(rows[0].reconciliation,'skipped');assert.deepEqual(rows[0].items,[{receipt:'preserve'}]);assert.deepEqual(rows[1],{id:'rb',profileId:'b',state:'needs_attention'});}
  assert.deepEqual(store.get('profiles'),[keep]);assert.deepEqual(records,projects);assert.deepEqual(store.batch(),batch);
  assert.equal(store.get('muse_paused'),false);assert.deepEqual(store.get('manual_receipts'),[{id:'retain-receipt'}]);
  for(const name of ['video.mp4','reference.png','export.mp4'])assert.equal(await readFile(join(root,name),'utf8'),'retained '+name);
  assert.deepEqual(store.get('deleted_profiles')[0].skipped,{jobs:[ja.id],chats:['ca'],runs:[{key:'research_runs',id:'ra'},{key:'product_deployments',id:'ra'}]});
  await assert.rejects(worker.retry(ja.id),/Đã bỏ qua/);await assert.rejects(worker.resume(ja.id),/Đã bỏ qua/);
  await assert.rejects(remove({skipUnreconciled:true}),/không còn/);
});

test('T-039 chat state matrix blocks running, allows explicit skip for unknown and retains settled chats',async t=>{
  const {worker,chat,remove}=await fixture(t);
  for(const state of ['preparing','waiting','unknown','needs_attention','done','failed']){
    chat.save({requestId:'c',projectId:'p',profileId:'a',state});const status=profileRemovalStatus(worker,'a');
    if(['preparing','waiting'].includes(state)){assert.equal(status.deleteCanSkip,false);await assert.rejects(remove({skipUnreconciled:true}),/Chờ hội thoại kết thúc/);}
    else if(['unknown','needs_attention'].includes(state)){assert.equal(status.deleteCanSkip,true);await assert.rejects(remove(),/đối soát/);chat.save({...chat.get('c'),reconciled:true});assert.equal(profileRemovalStatus(worker,'a').deleteBlockedReason,'');}
    else assert.equal(status.deleteBlockedReason,'');
  }
});

test('T-039 run state matrix and paused-but-still-running workflow never permit a skip',async t=>{
  const {worker,store,remove}=await fixture(t);
  for(const key of ['research_runs','product_deployments']){
    for(const state of ['queued','running','paused','partial','unknown','needs_attention','done','cancelled','failed','ready_for_review','unexpected']){
      store.set(key,[{id:'r',profileId:'a',state}]);const status=profileRemovalStatus(worker,'a');
      if(['queued','running','unexpected'].includes(state)){assert.equal(status.deleteCanSkip,false);await assert.rejects(remove({skipUnreconciled:true}),/đợt|Đợt/);}
      else if(['paused','partial','unknown','needs_attention'].includes(state))assert.equal(status.deleteCanSkip,true);
      else assert.equal(status.deleteBlockedReason,'');
    }
    store.set(key,[{id:'r',profileId:'a',state:'paused'}]);const runner={running:{id:'r'},rows:()=>store.get(key)};worker.profileRunners.add(runner);
    await assert.rejects(remove({skipUnreconciled:true}),/Chờ đợt dừng hẳn/);runner.running=null;assert.equal(profileRemovalStatus(worker,'a').deleteCanSkip,true);
    worker.profileRunners.delete(runner);store.set(key,[]);
  }
});

test('T-039 asynchronous path checks recheck activity; transaction failure rolls back skip and removal together',async t=>{
  const {worker,store,job,remove,root}=await fixture(t);const j=job();
  const deleting=remove({skipUnreconciled:true});worker.active.set('a',j.id);
  await assert.rejects(deleting,/đang gửi/);worker.active.clear();assert.equal(worker.deleting.size,0);
  const set=store.set.bind(store);store.set=(key,value)=>{if(key==='profiles')throw Error('fixture transaction failure');return set(key,value);};
  await assert.rejects(remove({skipUnreconciled:true}),/fixture transaction failure/);store.set=set;
  assert.deepEqual(store.job(j.id),j);assert.deepEqual(store.get('deleted_profiles',[]),[]);assert.equal(store.get('profiles').length,2);
  assert.equal(await readFile(join(root,'profiles','a','session-fixture'),'utf8'),'session a');
});

test('T-039 missing directory permits config removal; invalid and reserved IDs cannot escape profiles',async t=>{
  const {worker,store,remove,root}=await fixture(t);
  for(const id of ['../video.mp4','..','a/b','a\\b','C:\\outside','CON','nul','LPT1','']){
    store.set('profiles',[{id,name:'Invalid',proxy:{}}]);await assert.rejects(worker.deleteProfile({id,confirmName:'Invalid',skipUnreconciled:true}),/Mã hồ sơ không hợp lệ/);
    assert.equal(await readFile(join(root,'video.mp4'),'utf8'),'retained video.mp4');
  }
  store.set('profiles',[{id:'missing',name:'Missing',proxy:{}}]);assert.equal((await remove({id:'missing',confirmName:'Missing'})).deleted,true);
});

for(const kind of ['target-file','target-junction','parent-junction'])test(`T-039 reject ${kind} without changing config or outside files`,async t=>{
  const {root,store,remove,job}=await fixture(t);const j=job();
  const outside=join(root,'retained-sibling');await mkdir(outside);await writeFile(join(outside,'sentinel'),'must remain');
  if(kind==='parent-junction'){await rename(join(root,'profiles'),join(root,'original-profiles'));await symlink(outside,join(root,'profiles'),'junction');}
  else {await rename(join(root,'profiles','a'),join(root,'original-a'));if(kind==='target-file')await writeFile(join(root,'profiles','a'),'not a folder');else await symlink(outside,join(root,'profiles','a'),'junction');}
  await assert.rejects(remove({skipUnreconciled:true}),/liên kết|không xác định/);
  assert.equal(store.get('profiles').length,2);assert.deepEqual(store.job(j.id),j);assert.deepEqual(store.get('deleted_profiles',[]),[]);
  assert.equal(await readFile(join(outside,'sentinel'),'utf8'),'must remain');
});

test('T-039 nested junction is unlinked without traversing into media',async t=>{
  const {root,remove}=await fixture(t),outside=join(root,'media');await mkdir(outside);await writeFile(join(outside,'sentinel'),'retained media');
  await symlink(outside,join(root,'profiles','a','linked-media'),'junction');
  assert.equal((await remove()).deleted,true);assert.equal(await readFile(join(outside,'sentinel'),'utf8'),'retained media');
});

test('T-039 Windows case aliases cannot delete another profile session',{skip:process.platform!=='win32'},async t=>{
  const {store,remove,root}=await fixture(t);store.set('profiles',[...store.get('profiles'),{id:'A',name:'Alias',proxy:{}}]);
  await assert.rejects(remove({skipUnreconciled:true}),/chung tên thư mục/);assert.equal(store.get('profiles').length,3);
  assert.equal(await readFile(join(root,'profiles','a','session-fixture'),'utf8'),'session a');
});

test('T-039 Windows locked session reports partial cleanup honestly, keeping media and other profiles',{skip:process.platform!=='win32'},async t=>{
  const {root,store,remove}=await fixture(t),path=join(root,'profiles','a','session-fixture');
  const child=spawn('powershell.exe',['-NoProfile','-Command',`$f=[IO.File]::Open('${path.replaceAll("'","''")}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite); Write-Output 'locked'; $null=[Console]::In.ReadLine(); $f.Dispose()`],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=once(child,'exit');
  try{
    const [message]=await once(child.stdout,'data');assert.match(String(message),/locked/);
    const result=await remove();assert.equal(result.deleted,true);assert.equal(result.cleanupPending,true);assert.match(result.message,/Windows chưa cho xóa hết/);assert.match(result.message,/Đóng cửa sổ/);
    assert.equal(store.get('profiles').length,1);assert.equal(store.get('profiles')[0].id,'b');assert.equal(store.get('muse_paused'),false);
    assert.equal(await readFile(join(root,'video.mp4'),'utf8'),'retained video.mp4');
    assert.equal(await readFile(join(root,'profiles','b','session-fixture'),'utf8'),'session b');
  }finally{child.stdin.end('\n');await exited;}
});
