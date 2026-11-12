import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
import {Store} from '../src/store.mjs';import {Worker} from '../src/worker.mjs';import {profileInput,jobInput,jobFingerprint,assertSender,SITE} from '../src/contracts.mjs';import {MuseAdapter} from '../src/muse.mjs';import {validateMedia,renderClips} from '../src/media.mjs';

test('opening a result uses its original profile and locks it without submitting or consuming quota', () => fixture(async (store, dir) => {
  const worker = new Worker(store, dir, {}, {});
  store.set('adapter',{startUrl:'https://muse.ai/'});
  const queued = store.enqueue(job(),'open-result').job;
  store.put({...queued,profileId:'one',providerUrl:'https://muse.ai/thread/original'});
  let navigated, visible;
  const page = {url:()=>'', goto:async url=>{assert.ok(worker.chatting.has('one')); navigated=url;}, bringToFront:async()=>{}};
  worker.context = async id => {assert.equal(id,'one'); return {pages:()=>[],newPage:async()=>page};};
  worker.connectVpn = async()=>{};
  worker.setProfileVisibility = async (id, value) => {visible={id,value};};
  assert.equal(await worker.openResult({id:queued.id}),true);
  assert.equal(navigated,'https://muse.ai/thread/original');
  assert.deepEqual(visible,{id:'one',value:true});
  assert.equal(worker.chatting.size,0);
  assert.equal(store.batch(),null);
  assert.equal(store.job(queued.id).state,'queued');
  worker.active.set('one','another');
  await assert.rejects(worker.openResult({id:queued.id}),/đang xử lý/);
  worker.active.clear();
  for (const url of ['https://other.example/thread/a','https://user:pass@muse.ai/thread/a','http://muse.ai/thread/a']) {
    store.put({...store.job(queued.id),providerUrl:url});
    await assert.rejects(worker.openResult({id:queued.id}),/đúng trang Muse/);
  }
  store.put({...store.job(queued.id),providerUrl:'https://muse.ai/thread/a'});
  page.goto = async()=>{throw Error('Disconnected');};
  await assert.rejects(worker.openResult({id:queued.id}),/Disconnected/);
  assert.equal(worker.chatting.size,0);
}));

test('RAM recovery closes only idle background profiles and dispatches the same approved job', () => fixture(async (store, dir) => {
  let freeRam = 1 * 1024 ** 3;
  const worker = new Worker(store, dir, {}, {}, () => freeRam);
  store.set('profiles',[{id:'used',enabled:true},{id:'next',enabled:true},{id:'visible',enabled:false}]);
  store.set('generation_batch',{id:'batch',startedAt:1,perProfileLimit:3,submittedByProfile:{used:3}});
  const queued = store.enqueue(job(),'ram-recovery').job;
  worker.contexts.set('used',{close:async()=>{worker.contexts.delete('used');worker.backgroundProfiles.delete('used');freeRam=3*1024**3;}});
  worker.contexts.set('spare',{close:async()=>assert.fail('Enough RAM was recovered by the first close')});
  worker.backgroundProfiles.add('spare');
  worker.contexts.set('visible',{close:async()=>assert.fail('User-visible browser must stay open')});
  worker.backgroundProfiles.add('used');
  let dispatched;
  worker.run = async(id,profileId)=>{dispatched={id,profileId};};
  worker.approvedIds=[queued.id]; worker.paused=false;
  worker.tick();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.deepEqual(dispatched,{id:queued.id,profileId:'next'});
  assert.equal(worker.contexts.has('used'),false);
  assert.equal(worker.contexts.has('visible'),true);
  assert.equal(store.jobs().length,1);
  assert.equal(store.batch().submittedByProfile.used,3);
}));

test('failed memory recovery is bounded and pause prevents dispatch during cleanup', () => fixture(async (store, dir) => {
  const worker = new Worker(store, dir, {}, {}, () => 1024**3);
  store.set('profiles',[{id:'used',enabled:true},{id:'next',enabled:true}]);
  store.set('generation_batch',{id:'batch',startedAt:1,perProfileLimit:3,submittedByProfile:{used:3}});
  const queued = store.enqueue(job(),'ram-failure').job;
  let closeCalls=0;
  worker.contexts.set('used',{close:async()=>{closeCalls++;throw Error('Close failed');}});
  worker.backgroundProfiles.add('used');
  worker.run=async()=>assert.fail('Low RAM must retain the job');
  worker.approvedIds=[queued.id];worker.paused=false;worker.tick();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(closeCalls,1);
  assert.equal(store.job(queued.id).state,'queued');
  assert.equal(worker.reclaimingMemory,false);
  worker.memoryRecoveryAttempts.clear();
  worker.contexts.set('used',{close:async()=>{worker.pause();worker.contexts.delete('used');}});
  worker.approvedIds=[queued.id];worker.paused=false;worker.tick();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(worker.paused,true);
  assert.equal(store.job(queued.id).state,'queued');
}));

test('worker reuses the profile page and imports a validated result automatically', async context => {
  await fixture(async (store, root) => {
    const worker = new Worker(store, root, {}, {});
    const page = {url: () => 'https://muse.ai/'};
    worker.measureQuota = async () => ({state: 'available', weeklyRemainingPercent: 50, additionalTokens: 0});
    worker.context = async () => ({pages: () => [page], newPage: async () => assert.fail('Existing profile page must be reused')});
    store.set('adapter', {startUrl: 'https://muse.ai/', resultIdAttribute: 'data-message-id'});
    const {job: queued} = store.enqueue({...job(), mediaType: 'image'}, 'image');
    store.transition(queued.id, 'preflight');
    context.mock.method(MuseAdapter.prototype, 'prepare', async usedPage => assert.equal(usedPage, page));
    context.mock.method(MuseAdapter.prototype, 'submit', async (_page, checkpoint) => {
      await checkpoint('submitting');
      await checkpoint('submitted', {providerId: 'generated-image', providerUrl: page.url()});
    });
    context.mock.method(MuseAdapter.prototype, 'fetch', async (_page, _job, checkpoint, path) => {
      await checkpoint('waiting');
      await checkpoint('downloading');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=90x160', '-frames:v', '1', path]);
      return path;
    });
    let imported = 0;
    worker.receiveOutput = async id => {
      assert.equal(id, queued.id);
      assert.equal(store.job(id).output.fullDecode, true);
      imported++;
    };
    await worker.run(queued.id, 'profile');
    assert.equal(store.job(queued.id).state, 'ready');
    assert.ok(store.job(queued.id).importedAt);
    assert.equal(imported, 1);
  });
});

test('scheduler can use an already-open profile under the new-browser RAM limit', async () => {
  await fixture(async (store, root) => {
    const worker = new Worker(store, root, {}, {}, () => 1024 ** 3);
    store.set('adapter', {enabled: true});
    store.set('profiles', [{id: 'profile', enabled: true, health: 'ready', checkedAt: Date.now(), proxy: {}}]);
    worker.contexts.set('profile', {});
    const {job: queued} = store.enqueue(job(), 'open-profile');
    const calls = [];
    worker.run = async id => {calls.push(id);};
    await worker.start({count: 1, maxConcurrent: 1});
    assert.deepEqual(calls, [queued.id]);
  });
});
test('profile save preserves concurrent saves and health updates during encryption', () => fixture(async (store, root) => {
  let release;
  const worker = new Worker(store, root, {}, {encrypt: () => new Promise(resolve => {release = resolve;})});
  const id = await worker.saveProfile({name:'First', accountLabel:'', enabled:true, proxy:{server:'http://host:8000'}});
  const pending = worker.saveProfile({id, name:'Edited', accountLabel:'', enabled:true, proxy:{server:'http://host:8000', password:'secret'}});
  const otherId = await worker.saveProfile({name:'Second', accountLabel:'', enabled:true, proxy:{server:''}});
  worker.updateProfile(id, {health:'ready', session:'signed_in', quota:{state:'available', weeklyRemainingPercent:76}});
  release('cipher');
  await pending;
  const profiles = store.get('profiles');
  assert.equal(profiles.length, 2);
  assert.ok(profiles.some(profile => profile.id === otherId));
  const saved = profiles.find(profile => profile.id === id);
  assert.equal(saved.name, 'Edited');
  assert.equal(saved.health, 'ready');
  assert.equal(saved.session, 'signed_in');
  assert.equal(saved.quota.weeklyRemainingPercent, 76);
  assert.equal(saved.proxy.encryptedPassword, 'cipher');
}));

test('profile save rechecks browser locks after encryption', () => fixture(async (store, root) => {
  let release;
  const worker = new Worker(store, root, {}, {encrypt: () => new Promise(resolve => {release = resolve;})});
  const id = await worker.saveProfile({name:'Original', accountLabel:'', enabled:true, proxy:{server:'http://host:8000'}});
  for (const locks of [worker.opening, worker.contexts, worker.active]) {
    const pending = worker.saveProfile({id, name:'Edited', accountLabel:'', enabled:true, proxy:{server:'http://other:8000', password:'secret'}});
    locks.set(id, {});
    const rejected = assert.rejects(pending, /Đóng browser/);
    release('cipher');
    await rejected;
    assert.equal(store.get('profiles')[0].name, 'Original');
    assert.equal(store.get('profiles')[0].proxy.server, 'http://host:8000');
    locks.delete(id);
  }
}));

const job=()=>jobInput.parse({projectId:'p1',productId:'product',productRevision:1,sceneId:'s1',sceneRevision:1,name:'Scene',mediaType:'video',ratio:'9:16',duration:5,prompt:'Product demo',references:[]});
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'lab-worker-')),store=new Store(join(dir,'queue.sqlite'));store.set('muse_paused',false);try{await fn(store,dir);}finally{store.close();await rm(dir,{recursive:true,force:true});}}
test('proxy validation rejects inline secrets and accepts authenticated SOCKS5',()=>{const base={name:'Profile',accountLabel:'one',enabled:true};assert.equal(profileInput.safeParse({...base,proxy:{server:'http://host:8000',username:'name',password:'secret'}}).success,true);assert.equal(profileInput.safeParse({...base,proxy:{server:'http://name:secret@host:8000'}}).success,false);assert.equal(profileInput.safeParse({...base,proxy:{server:'socks5://host:8000',username:'name',password:'secret'}}).success,true);assert.equal(profileInput.safeParse({...base,proxy:{server:'socks5://host:8000'}}).success,true);});
test('IPC only accepts top-level exact Site origin',()=>{assert.doesNotThrow(()=>assertSender(SITE+'/?view=accounts',true));assert.throws(()=>assertSender(SITE+'.evil.test',true));assert.throws(()=>assertSender(SITE,false));});
test('durable restart blocks unknown submit and deduplicates same snapshot',()=>fixture(async(store,dir)=>{const d=job(),fp=jobFingerprint(d),j=store.enqueue(d,fp).job;store.transition(j.id,'preflight');store.transition(j.id,'prepared');store.transition(j.id,'submitting');const second=new Store(join(dir,'queue.sqlite'));try{second.recover();assert.equal(second.job(j.id).state,'needs_attention');assert.equal(second.enqueue(d,fp).deduplicated,true);assert.throws(()=>second.retry(j.id),/đối soát/);}finally{second.close();}}));
test('retry retains previous output and creates a clean independent attempt',()=>fixture(async s=>{const j=s.enqueue(job(),'x').job;s.transition(j.id,'preflight');s.transition(j.id,'failed',{output:{path:'old.mp4'},failedFilePath:'old.mp4',diagnosticPath:'old.png'});const retry=s.retry(j.id);assert.equal(s.job(j.id).output.path,'old.mp4');assert.equal(retry.output,null);assert.equal(retry.failedFilePath,null);assert.equal(retry.diagnosticPath,null);assert.notEqual(retry.id,j.id);}));
test('profile status never returns encrypted or plaintext proxy passwords; open profile locks edits',()=>fixture(async(s,dir)=>{const w=new Worker(s,dir,{}, {encrypt:async x=>'CIPHER:'+x,decrypt:async x=>x.slice(7)});const id=await w.saveProfile({name:'Profile',accountLabel:'one',enabled:true,proxy:{server:'http://host:8000',username:'user',password:'SECRET'}});assert.equal(JSON.stringify(w.status()).includes('SECRET'),false);assert.equal(w.profiles()[0].proxy.hasPassword,true);w.contexts.set(id,{});await assert.rejects(()=>w.saveProfile({id,name:'Changed',accountLabel:'',enabled:true,proxy:{server:''}}),/Đóng browser/);}));
test('scheduler freezes approved job IDs and pause does not resume on enqueue',()=>fixture(async(s,dir)=>{const w=new Worker(s,dir,{}, {},()=>8*1024**3);s.set('adapter',{enabled:true});s.set('profiles',[{id:'profile',enabled:true,health:'ready',checkedAt:Date.now()}]);const first=s.enqueue(job(),'one').job;const calls=[];let release;w.run=async id=>{calls.push(id);await new Promise(r=>release=r);};await w.start({count:1,maxConcurrent:4});s.enqueue({...job(),sceneId:'s2'},'two');assert.deepEqual(calls,[first.id]);release();await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,1);w.pause();await w.enqueue({...job(),sceneId:'s3'});assert.equal(w.paused,true);assert.equal(w.budget,0);}));
test('submit checkpoint is committed before click; exactly one new ID is captured',async()=>{const events=[],config={resultCards:'.card',resultIdAttribute:'data-job-id',submitName:'Generate'};let reads=0;const page={locator:()=>({evaluateAll:async()=>++reads===1?['old']:['old','new']}),getByRole:()=>({click:async()=>events.push('click')}),url:()=> 'https://muse.ai/chat/1'};const id=await new MuseAdapter(config).submit(page,async(s,p)=>events.push(s));assert.equal(id,'new');assert.deepEqual(events,['submitting','click','submitted']);});
test('multiple result IDs stop without selecting arbitrary output',async()=>{let reads=0;const page={locator:()=>({evaluateAll:async()=>++reads===1?[]:['a','b']}),getByRole:()=>({click:async()=>{}})};await assert.rejects(()=>new MuseAdapter({resultCards:'.card',resultIdAttribute:'data-id',submitName:'Create'}).submit(page,async()=>{}),/nhiều kết quả/);});
test('resume cannot call submit and keeps original result ID', () => fixture(async (s, dir) => {
  const j = s.enqueue(job(), 'one').job;
  for (const state of ['preflight', 'prepared', 'submitting']) s.transition(j.id, state);
  s.transition(j.id, 'submitted', {
    profileId: 'p',
    providerId: 'same-id',
    providerUrl: 'https://muse.ai/chat',
  });
  s.recover();
  const w = new Worker(s, dir, {}, {}, () => 8 * 1024 ** 3);
  let seen;
  w.run = async (id, p, resume) => {
    seen = {id, p, resume, providerId: s.job(id).providerId};
  };
  w.readProductionRecord=async id=>({id,data:{scenes:[{id:job().sceneId}]}});
  await w.resume(j.id);
  assert.deepEqual(seen, {id: j.id, p: 'p', resume: true, providerId: 'same-id'});
}));
test('actual FFmpeg decode/hash/bounds and render order; source files stay unchanged',()=>fixture(async(_s,dir)=>{const paths=['red','blue'].map((color,i)=>{const p=join(dir,i+'.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=90x160:r=24:d=5`,'-c:v','libx264','-pix_fmt','yuv420p',p]);return p;});const before=await readFile(paths[0]),report=await validateMedia(paths[0],job());assert.equal(report.fullDecode,true);assert.equal(report.metadata.duration,5);await assert.rejects(()=>validateMedia(paths[0],{...job(),duration:10}),/thời lượng/);await assert.rejects(()=>validateMedia(paths[0],{...job(),ratio:'1:1'}),/tỷ lệ/);await writeFile(join(dir,'bad.mp4'),'invalid');await assert.rejects(()=>validateMedia(join(dir,'bad.mp4'),job()));const out=join(dir,'render.mp4');await renderClips(paths.map(path=>({path,duration:5,audio:false})),'9:16',out);const pixel=sec=>execFileSync('ffmpeg',['-v','error','-ss',String(sec),'-i',out,'-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);assert.ok(pixel(1)[0]>pixel(1)[2]+100);assert.ok(pixel(6)[2]>pixel(6)[0]+100);assert.deepEqual(await readFile(paths[0]),before);}));
test('concurrent opens share one persistent context and keep proxy locked while opening',()=>fixture(async(s,dir)=>{s.set('profiles',[{id:'same',name:'Profile',enabled:true,accountLabel:'',proxy:{server:'',username:'',encryptedPassword:null}}]);let count=0,release,launched;const began=new Promise(r=>launched=r);const context={on(){}};const w=new Worker(s,dir,{launchPersistentContext:async()=>{count++;launched();await new Promise(r=>release=r);return context;}},{});const a=w.context('same'),b=w.context('same');await assert.rejects(()=>w.saveProfile({id:'same',name:'Edited',enabled:true,accountLabel:'',proxy:{server:''}}),/Đóng browser/);await began;release();assert.equal(await a,context);assert.equal(await b,context);assert.equal(count,1);}));

test('resume reserves concurrency and profile checks before changing the existing job', () => fixture(async (store, dir) => {
  const queued = store.enqueue(job(), 'resume-lock-regression').job;
  for (const state of ['preflight', 'prepared', 'submitting']) store.transition(queued.id, state);
  store.transition(queued.id, 'submitted', {profileId: 'profile', providerId: 'existing', providerUrl: 'https://muse.ai/thread/existing'});
  const worker = new Worker(store, dir, {}, {}, () => 8 * 1024 ** 3);
  let calls = 0;
  worker.readProductionRecord=async id=>({id,data:{scenes:[{id:job().sceneId}]}});
  worker.run = async (_id, _profile, resume) => { assert.equal(resume, true); calls++; };
  worker.checking.set('profile', Promise.resolve());
  await assert.rejects(worker.resume(queued.id), /kiểm tra/);
  assert.equal(store.job(queued.id).state, 'needs_attention');
  worker.checking.clear();
  worker.active.set('other-profile', 'running');
  await assert.rejects(worker.resume(queued.id), /đồng thời/);
  assert.equal(store.job(queued.id).state, 'needs_attention');
  worker.active.clear();
  worker.memory = () => 0.5 * 1024 ** 3;
  await assert.rejects(worker.resume(queued.id), /RAM/);
  assert.equal(store.job(queued.id).state, 'needs_attention');
  assert.equal(calls, 0);
  worker.memory = () => 8 * 1024 ** 3;
  await worker.resume(queued.id);
  assert.equal(calls, 1);
  assert.equal(store.job(queued.id).providerId, 'existing');
}));

test('submission checkpoint and per-profile budget commit together and survive restart', () => fixture(async (store, dir) => {
  assert.equal(store.batch(), null);
  const submitted = [];
  for (let index = 0; index < 3; index++) {
    const queued = store.enqueue({...job(), mediaType: index === 0 ? 'image' : 'video'}, 'batch-' + index).job;
    store.transition(queued.id, 'preflight');
    store.transition(queued.id, 'prepared');
    store.beginSubmit(queued.id, 'one');
    submitted.push(queued.id);
    assert.equal(store.batch().submittedByProfile.one, index + 1);
    assert.equal(store.job(queued.id).submitBatchId, store.batch().id);
  }
  const fourth = store.enqueue(job(), 'fourth').job;
  store.transition(fourth.id, 'preflight');
  store.transition(fourth.id, 'prepared');
  assert.throws(() => store.beginSubmit(fourth.id, 'one'), /3 lượt/);
  assert.equal(store.job(fourth.id).state, 'prepared');
  assert.equal(store.batch().submittedByProfile.one, 3);
  assert.throws(() => store.newBatch(), /kết thúc/);
  const reopened = new Store(join(dir, 'queue.sqlite'));
  try {
    const worker = new Worker(reopened, dir, {}, {});
    assert.equal(worker.status().batch.submittedByProfile.one, 3);
    assert.ok(submitted.every(id => reopened.job(id).state === 'needs_attention'));
    worker.pause();
    assert.equal(reopened.batch().submittedByProfile.one, 3);
    const oldBatch = reopened.batch().id;
    worker.active.set('one', 'active-job');
    assert.throws(() => worker.newBatch(), /kết thúc/);
    worker.active.clear();
    const next = worker.newBatch();
    assert.notEqual(next.id, oldBatch);
    assert.deepEqual(next.submittedByProfile, {});
    assert.equal(reopened.job(submitted[0]).submitBatchId, oldBatch);
    assert.equal(worker.paused, true);
  } finally { reopened.close(); }
}));

test('failed and repeated checkpoints cannot consume a second slot, retries get their own slot', () => fixture(async store => {
  const queued = store.enqueue(job(), 'first').job;
  assert.throws(() => store.beginSubmit(queued.id, 'one'), /chuyển/);
  assert.equal(store.batch(), null);
  store.transition(queued.id, 'preflight');
  store.transition(queued.id, 'prepared');
  store.beginSubmit(queued.id, 'one');
  assert.throws(() => store.beginSubmit(queued.id, 'one'), /chuyển/);
  assert.equal(store.batch().submittedByProfile.one, 1);
  store.transition(queued.id, 'submitted');
  store.transition(queued.id, 'waiting');
  store.transition(queued.id, 'downloading');
  store.transition(queued.id, 'validating');
  store.transition(queued.id, 'failed');
  const retry = store.retry(queued.id);
  assert.equal(retry.submitBatchId, null);
  store.transition(retry.id, 'preflight');
  store.transition(retry.id, 'prepared');
  store.beginSubmit(retry.id, 'one');
  assert.equal(store.batch().submittedByProfile.one, 2);
}));

test('resuming an existing provider result keeps the submission count', () => fixture(async (store, dir) => {
  const queued = store.enqueue(job(), 'resume-batch').job;
  store.transition(queued.id, 'preflight');
  store.transition(queued.id, 'prepared');
  store.beginSubmit(queued.id, 'one');
  store.transition(queued.id, 'submitted', {providerId: 'existing', providerUrl: 'https://muse.ai/thread/existing'});
  const worker = new Worker(store, dir, {}, {}, () => 8 * 1024 ** 3);
  worker.readProductionRecord=async id=>({id,data:{scenes:[{id:job().sceneId}]}});
  worker.run = async (_id, _profile, resume) => assert.equal(resume, true);
  await worker.resume(queued.id);
  assert.equal(store.batch().submittedByProfile.one, 1);
  await new Promise(resolve => setTimeout(resolve, 0));
}));
