import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {continuationPrompt} from '../src/job-continue.mjs';
import {prepareContinuationScene} from '../src/muse-continuation.mjs';
import {newProduction,applyProduction} from '../../lib/lab/production.ts';

const hash=x=>createHash('sha256').update(x).digest('hex');
import {config,fakePage} from './fixtures/t052-muse.mjs';
const request={projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Cảnh gốc',prompt:'Original brief',mediaType:'video',ratio:'9:16',duration:8,references:[]};
const thread='https://muse.ai/thread/existing_123';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'hermes-t052-')),store=new Store(':memory:');
  store.set('muse_paused',false);store.set('adapter',config);store.set('profiles',['Cho','Duc','Chim','Chi'].map(name=>({id:name,name,enabled:true,health:'ready',session:'signed_in',vpnEnabled:true,proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:90}})));
  const worker=new Worker(store,root,{},{},()=>8*1024**3);let now=Date.now();worker.night=new MuseNight(store,{now:()=>now,sleep:async ms=>{now+=ms;}});worker.night.configure({sessionLimit:null,intervalSeconds:60});
  const old=store.enqueue(request,'original').job;const source=store.put({...old,profileId:'Duc',state:'ready',providerId:'old-result',providerUrl:thread,output:{sha256:hash('old'),path:'old.mp4',metadata:{duration:8}},importedAt:123,uploadedAssetId:'old_asset'});
  const pages=[];worker.context=async id=>{assert.equal(id,'Duc');return {pages:()=>[],newPage:async()=>{const page=fakePage();pages.push(page);return page;}};};worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};worker.checkToolchain=async()=>{};
  worker.validateOutput=async path=>({sha256:hash(await readFile(path)),metadata:{duration:8,width:720,height:1280},fullDecode:true});
  t.after(async()=>{await worker.close();store.close();await rm(root,{recursive:true,force:true});});
  const input={id:source.id,requestId:'operation',description:'Làm rõ phần tay cầm, giữ nguyên sản phẩm.',mediaType:'video',references:[]};
  return {worker,store,source,input,pages,root};
}
async function drain(worker){const deadline=Date.now()+10000;while(worker.active.size||worker.pendingTicks.size){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,5));}}

test('T-052 actual adapter continues the saved thread, excludes old cards, paces same profile and replays IPC without sending',async t=>{
  const {worker,store,source,input,pages}=await fixture(t),before=JSON.stringify(source),switches=store.get('profiles').map(p=>[p.id,p.enabled,p.vpnEnabled]);
  worker.night.begin();await worker.night.admit('earlier',()=>true,'Duc');
  t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');await writeFile(path,'new bytes');return path;});
  const result=await worker.continueConversation(input);await drain(worker);const done=store.job(result.id);
  assert.equal(done.state,'ready');assert.equal(done.continueOf,source.id);assert.equal(done.retryRootId,source.id);assert.equal(done.profileId,'Duc');assert.equal(done.providerUrl,thread);assert.equal(done.providerId,'new-result');
  assert.deepEqual(done.continuationBaseline,{mediaIds:['old-result'],userIds:['old-user'],assistantIds:['old-assistant']});
  assert.deepEqual(pages[0].navigation,[thread]);assert.equal(pages[0].sent,1);assert.ok(pages[0].prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(pages[0].prompt.split(MUSE_VIDEO_COMMAND).length,2);assert.match(pages[0].prompt,/Làm rõ phần tay cầm/);
  const ledger=worker.night.current().submissions;assert.equal(ledger.length,2);assert.equal(ledger[1].profileId,'Duc');assert.ok(ledger[1].at-ledger[0].at>=60000);
  assert.equal((await worker.continueConversation(input)).id,done.id);assert.equal(pages.length,1);assert.equal(pages[0].sent,1);
  await assert.rejects(worker.continueConversation({...input,description:'Changed'}),/nội dung khác/);
  assert.equal(JSON.stringify(store.job(source.id)),before);assert.deepEqual(store.get('profiles').map(p=>[p.id,p.enabled,p.vpnEnabled]),switches);assert.equal(store.get('muse_paused'),false);
});

test('T-052 rejects foreign profiles, stopped/deleted/Chi, invalid links and unresolved receipts before any send',async t=>{
  const {worker,store,source,input,pages}=await fixture(t);
  for(const extra of [{profileId:'Cho'},{threadUrl:'https://muse.ai/thread/other'},{threadUrl:'https://evil.test/thread/old'}])await assert.rejects(worker.continueConversation({...input,...extra}),/hồ sơ|hội thoại/i);
  for(const url of ['https://evil.test/thread/a','https://muse.ai/thread/new','https://muse.ai/thread/new/','https://muse.ai/thread/a?secret=x']){store.put({...source,providerUrl:url});await assert.rejects(worker.continueConversation(input),/link hội thoại/i);}
  for(const patch of [{state:'needs_attention'},{state:'unknown'},{state:'failed'},{reconciliation:'skipped'},{failureCode:'WORKER_LOST'}]){store.put({...source,...patch});await assert.rejects(worker.continueConversation(input),/đối soát/);}
  store.put(source);const profiles=store.get('profiles');
  store.set('profiles',profiles.filter(p=>p.id!=='Duc'));await assert.rejects(worker.continueConversation(input),/đã xóa/);
  store.set('profiles',profiles.map(p=>({...p,enabled:p.id!=='Duc'})));await assert.rejects(worker.continueConversation(input),/dừng gửi/);
  store.set('profiles',profiles.map(p=>({...p,vpnEnabled:p.id!=='Duc'})));await assert.rejects(worker.continueConversation(input),/VPN/);
  store.set('profiles',profiles);store.put({...source,profileId:'Chi'});await assert.rejects(worker.continueConversation(input),/Chi không gửi video/);store.put(source);
  const pending=store.enqueue({...request,sceneId:'pending'},'pending').job;store.put({...pending,continueThreadUrl:thread,preferredProfileId:'Duc'});await assert.rejects(worker.continueConversation(input),/đối soát/);
  store.put({...pending,state:'cancelled',reconciled:true});worker.night.begin();worker.night.outcome('refused',Object.assign(Error('Refused'),{code:'MUSE_REFUSED'}),'Duc');await assert.rejects(worker.continueConversation(input),/dừng gửi/);
  assert.equal(pages.length,0);assert.equal(store.jobs().length,2);assert.deepEqual(store.get('profiles'),profiles);assert.equal(store.get('muse_paused'),false);
});

test('T-052 image continuation accepts four verified references, rejects five/checksum and never adds video command',async t=>{
  const {worker,store,input,pages}=await fixture(t),bytes=new Uint8Array([1,2,3]);
  const ref={id:'ref',version:1,type:'image/png',bytes,sha256:hash(bytes)};
  await assert.rejects(worker.continueConversation({...input,references:Array.from({length:5},()=>ref)}));
  await assert.rejects(worker.continueConversation({...input,references:[{...ref,sha256:'f'.repeat(64)}]}),/checksum/);
  t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');await writeFile(path,'new image');return path;});
  const result=await worker.continueConversation({...input,mediaType:'image',references:Array.from({length:4},(_,i)=>({...ref,id:'ref'+i}))});await drain(worker);
  assert.equal(store.job(result.id).state,'ready');assert.equal(store.job(result.id).request.mediaType,'image');assert.doesNotMatch(pages[0].prompt,/You create a video for me/);assert.equal(pages[0].uploads[0].length,4);assert.equal(pages[0].sent,1);
});

test('T-052 duplicate SHA or Muse refusal never retries and keeps original receipt and switches',async t=>{
  for(const duplicate of [true,false]){
    const {worker,store,input,pages,source}=await fixture(t);const old=JSON.stringify(source);
    const fetch=t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');await writeFile(path,'old');return path;});
    const submit=duplicate?null:t.mock.method(MuseAdapter.prototype,'submit',async(_page,checkpoint)=>{await checkpoint('submitting');throw Object.assign(Error('Synthetic quota limit'),{code:'MUSE_REFUSED',providerResponse:'Synthetic quota limit'});});
    try {
      const result=await worker.continueConversation(input);await drain(worker);worker.tick();await drain(worker);const job=store.job(result.id);
      if(duplicate){assert.equal(job.failureCode,'MUSE_OLD_CLIP');assert.equal(job.duplicateOf.jobId,source.id);assert.equal(pages[0].sent,1);}
      else{assert.equal(job.state,'needs_attention');assert.equal(worker.night.profileStatus('Duc').stopped,true);assert.equal(submit.mock.callCount(),1);}
      assert.equal(store.jobs().length,2);assert.equal(worker.night.current().submissions.length,1);assert.equal(JSON.stringify(store.job(source.id)),old);assert.equal(store.get('muse_paused'),false);assert.ok(store.get('profiles').every(p=>p.enabled&&p.vpnEnabled));
    } finally {fetch.mock.restore();submit?.mock.restore();}
  }
});

test('T-052 rechecks profile at send, redirect after pacing cannot click, normal new-thread flow is unchanged',async t=>{
  const {worker,store,input,pages}=await fixture(t);worker.night.begin();await worker.night.admit('earlier',()=>true,'Duc');
  worker.night.sleep=async()=>{store.set('profiles',store.get('profiles').map(p=>({...p,enabled:p.id!=='Duc'})));};
  const result=await worker.continueConversation(input);await drain(worker);assert.equal(pages[0].sent,0);assert.equal(store.job(result.id).state,'failed');
  const page=fakePage(),adapter=new MuseAdapter(config);await adapter.prepare(page,request,{threadUrl:thread});
  await assert.rejects(adapter.submit(page,async()=>page.goto('https://muse.ai/thread/other')),/khác hội thoại/);assert.equal(page.sent,0);
  const regular=fakePage();await regular.goto(thread);await new MuseAdapter(config).prepare(regular,request);assert.equal(regular.navigation.at(-1),'https://muse.ai/thread/new');
  const prompt=continuationPrompt(MUSE_VIDEO_COMMAND+'\n'+MUSE_VIDEO_COMMAND+'\nA close-up','video','9:16',8);assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length,2);
});

test('T-052 continuation creates an independent approved scene, keeps old body and reuses request receipt',async()=>{
  let data=applyProduction(newProduction('Project','product',1),'scene',{...request,id:'scene',referenceIds:[]},'old-scene');
  const before=JSON.stringify(data.scenes[0]);let revision=1;
  const manual={records:async()=>[{id:'project',kind:'production',revision,data},{id:'product',kind:'product',revision:1,data:{}}],request:async(_url,{body})=>{
    const command=JSON.parse(body);assert.equal(command.revision,revision);data=applyProduction(data,command.action,command.input,command.commandId);revision++;}};
  const result=await prepareContinuationScene(manual,{request},{...request,prompt:'Create a matching image.',mediaType:'image'},'new-image');
  assert.equal(result.sceneId,'continue_new-image');assert.equal(result.mediaType,'image');assert.equal(data.scenes[1].storyboardApproved,true);assert.equal(JSON.stringify(data.scenes[0]),before);assert.deepEqual(data.bodies,[]);
  assert.deepEqual(await prepareContinuationScene(manual,{request},{...request,prompt:'Create a matching image.',mediaType:'image'},'new-image'),result);assert.equal(data.scenes.length,2);
});

test('T-052 reconciliation reads only the new turn, refuses another user turn and missing baseline',async()=>{
  const page=fakePage(),adapter=new MuseAdapter(config);let baseline;
  await adapter.prepare(page,request,{threadUrl:thread});
  await adapter.submit(page,async(state,patch)=>{if(state==='submitting')baseline=patch.continuationBaseline;});
  const job={request,continueOf:'original',providerUrl:thread,continuationBaseline:baseline};
  assert.equal((await adapter.inspectResponse(page,job)).providerId,'new-result');
  await assert.rejects(adapter.inspectResponse(page,{...job,continuationBaseline:null}),/Thiếu mốc/);
  page.baseline.users.push('unrelated-new-user');await assert.rejects(adapter.inspectResponse(page,job),/Hội thoại đã thay đổi/);
});

test('T-052 the last allowed session slot submits once and an exhausted session cannot create another job',async t=>{
  const {worker,store,input,pages}=await fixture(t);worker.night.configure({intervalSeconds:60,sessionLimit:1});
  t.mock.method(MuseAdapter.prototype,'fetch',async(_page,_job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');await writeFile(path,'last slot new clip');return path;});
  const job=await worker.continueConversation(input);await drain(worker);assert.equal(store.job(job.id).state,'ready');assert.equal(pages[0].sent,1);
  await assert.rejects(worker.continueConversation({...input,requestId:'another'}),{code:'MUSE_NIGHT_LIMIT'});assert.equal(store.jobs().length,2);
});

test('T-052 ignores old message media that hydrates after sending, including during reconciliation',async()=>{
  const page=fakePage({lazyOldMedia:true}),adapter=new MuseAdapter(config);let baseline;
  await adapter.prepare(page,request,{threadUrl:thread});
  const providerId=await adapter.submit(page,async(state,patch)=>{if(state==='submitting')baseline=patch.continuationBaseline;});
  assert.deepEqual(baseline.mediaIds,[]);
  assert.ok(baseline.assistantIds.includes('old-result'));
  assert.equal(providerId,'new-result');
  assert.equal(page.sent,1);
  const result=await adapter.inspectResponse(page,{request,continueOf:'original',providerUrl:thread,continuationBaseline:baseline});
  assert.equal(result.providerId,'new-result');
  assert.equal(page.sent,1);
});

test('T-052 an old-card duplicate receipt cannot unlock another continuation of the unresolved turn',async t=>{
  const {worker,store,source,input,pages}=await fixture(t);
  const old=store.enqueue({...request,sceneId:'continued'},'late-card').job;
  store.put({...old,state:'failed',profileId:source.profileId,continueOf:source.id,providerUrl:thread,
    providerId:'old-result',failureCode:'MUSE_OLD_CLIP',reconciled:true,
    continuationBaseline:{mediaIds:[],userIds:['old-user'],assistantIds:['old-result']}});
  await assert.rejects(worker.continueConversation(input),/đối soát/);
  assert.equal(pages.length,0);
  assert.equal(store.jobs().length,2);
});
