import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runInNewContext} from 'node:vm';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {Integrations} from '../src/integrations.mjs';
import {sendMuseChat} from '../src/muse-chat-ipc.mjs';
import {referenceChatAttachments} from '../src/muse-chat-attachments.mjs';

const run = promisify(execFile), sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const outputs=resolve('outputs');await mkdir(outputs,{recursive:true});
  const root=await mkdtemp(join(outputs,'t22-fixture-')),store=new Store(':memory:');store.set('muse_paused',false);
  t.after(async()=>{store.close();assert.ok(root.startsWith(join(outputs,'t22-fixture-')));await rm(root,{recursive:true,force:true});});
  const dir=join(root,'integrations','sample');await mkdir(dir,{recursive:true});await mkdir(join(root,'references'));
  const paths=[join(dir,'sparse.jpg'),join(dir,'dense.png')];
  for(const path of paths)await run('ffmpeg',['-v','error','-nostdin','-f','lavfi','-i','color=red:s=16x16','-frames:v','1',path],{windowsHide:true,timeout:15000});
  store.set('profiles',[{id:'profile',enabled:true,proxy:{server:''}}]);
  store.set('adapter',{enabled:true,startUrl:'https://muse.ai/',resultIdAttribute:'data-message-id',submitName:'Send',prompt:'textarea',loggedIn:'textarea',upload:'input[type="file"]',timeoutSeconds:10});
  store.set('generation_batch',{id:'batch',startedAt:1,perProfileLimit:3,submittedByProfile:{profile:1}});
  const events=[],worker=new Worker(store,root,{},{}),state={url:'about:blank',uploadError:false,notReady:false};
  const page={
    url:()=>state.url,goto:async url=>{state.url=url;},waitForLoadState:async()=>{},close:async()=>events.push(['close']),
    getByRole:(_role,{name})=>({waitFor:async()=>{},click:async()=>events.push(['click',name])}),
    locator:selector=>({
      waitFor:async()=>{if(selector.includes('Send')){events.push(['ready']);if(state.notReady)throw Error('Not ready');}},
      isVisible:async()=>true,inputValue:async()=>'',evaluateAll:async()=>[],
      fill:async value=>events.push(['fill',value]),
      setInputFiles:async files=>{events.push(['files',files]);if(state.uploadError)throw Error('Browser upload error');},
    }),
  };
  worker.context=async()=>({newPage:async()=>page});worker.connectVpn=async()=>{};worker.setProfileVisibility=async()=>{};
  worker.measureQuota=async()=>({state:'available',weeklyRemainingPercent:50});
  const chat=new MuseChat(worker),begin=chat.beginSubmit.bind(chat);
  chat.beginSubmit=row=>{events.push(['beginSubmit']);return begin(row);};
  chat.readResponse=async(_page,row)=>chat.save({...row,state:'done',response:'analysis',providerId:'answer',providerUrl:'https://muse.ai/thread/fixture'});
  const request={requestId:'r1',profileId:'profile',projectId:'reference_sample',prompt:'Analyze sheets'};
  const structure={contactSheetPath:paths[0],contactSheetSha256:sha(await readFile(paths[0])),contactSheets:{dense:[{path:paths[1],sha256:sha(await readFile(paths[1]))},{path:'not-uploaded.jpg'}]}};
  const bytes=Buffer.from(JSON.stringify(structure)),structurePath=join(dir,'structure.json');await writeFile(structurePath,bytes);
  store.set('integration-jobs',[{id:'sample',kind:'reference-structure',state:'done',projectId:'product',path:structurePath,structureSha256:sha(bytes)}]);
  return {root,dir,paths,store,worker,chat,request,events,state,structure,integrations:new Integrations(store,root)};
}

test('chat uses real adapter upload before prompt, accounting and Send; receipt hashes each image and deduplicates',async t=>{
  const f=await fixture(t),result=await f.chat.send({...f.request,attachments:f.paths});
  assert.equal(result.state,'done');
  assert.deepEqual(f.events.find(e=>e[0]==='files')[1],f.paths);
  const stages=f.events.map(e=>e[0]);
  assert.deepEqual(stages,['fill','files','ready','fill','beginSubmit','click','close']);
  assert.equal(f.events[0][1],'');assert.ok(f.events[3][1].endsWith(f.request.prompt));
  const hashes=await Promise.all(f.paths.map(async path=>sha(await readFile(path))));
  assert.deepEqual(result.attachments.map(r=>r.sha256),hashes);
  assert.equal(result.fingerprint,sha(JSON.stringify({...f.request,parentId:null,attachments:hashes})));
  assert.equal(f.store.batch().submittedByProfile.profile,2);
  assert.deepEqual(await f.chat.send({...f.request,attachments:f.paths}),result);
  assert.equal(f.events.filter(e=>e[0]==='click').length,1);
  await run('ffmpeg',['-y','-v','error','-nostdin','-f','lavfi','-i','color=blue:s=16x16','-frames:v','1',f.paths[0]],{windowsHide:true});
  await assert.rejects(f.chat.send({...f.request,attachments:f.paths}),/nội dung khác/);
  assert.equal(f.events.filter(e=>e[0]==='click').length,1);
});

for(const mode of ['uploadError','notReady','missingConfig'])test(`${mode}: failed receipt, unchanged batch, no beginSubmit and no Send`,async t=>{
  const f=await fixture(t),before=f.store.batch();
  if(mode==='missingConfig')f.store.set('adapter',{...f.worker.config(),upload:''});else f.state[mode]=true;
  const result=await f.chat.send({...f.request,attachments:f.paths});
  assert.equal(result.state,'failed');assert.match(result.error,/Chưa gửi prompt, chưa tính lượt/);
  assert.deepEqual(f.store.batch(),before);
  assert.equal(f.events.some(e=>['beginSubmit','click'].includes(e[0])),false);
  assert.equal(f.events.some(e=>e[0]==='fill'&&e[1]),false);
  assert.equal(f.worker.chatting.size,0);
});

test('no attachments, omitted/null parent and empty attachments retain the exact old fingerprint and receipt replay',async t=>{
  const f=await fixture(t);
  // The legacy schema wrote these five keys, in this order, trimming prompt.
  const value={requestId:'r1',profileId:'profile',projectId:'reference_sample',prompt:'Analyze sheets',parentId:null};
  const expected=sha(JSON.stringify(value));
  const result=await f.chat.send({...f.request,prompt:'  Analyze sheets  '});
  assert.equal(result.fingerprint,expected);assert.equal('attachments' in result,false);
  assert.deepEqual(await f.chat.send({...f.request,parentId:null,attachments:[]}),result);
  f.chat.save({...result,requestId:'legacy',fingerprint:sha(JSON.stringify({...value,requestId:'legacy'}))});
  assert.equal((await new MuseChat(f.worker).send({...f.request,requestId:'legacy'})).state,'done');
  assert.equal(f.events.filter(e=>e[0]==='click').length,1);
});

test('reject outside paths, sibling-prefix escape, too many files, parent attachments, disguised/corrupt images and >8 MiB before browser',async t=>{
  const f=await fixture(t),before=f.store.batch();let browsers=0;
  f.worker.context=async()=>{browsers++;throw Error('Should not open');};
  const outside=join(f.root,'outside.png');await writeFile(outside,await readFile(f.paths[1]));
  const sibling=join(f.root,'references-elsewhere');await mkdir(sibling);const escaped=join(sibling,'image.png');await writeFile(escaped,await readFile(f.paths[1]));
  await assert.rejects(f.chat.send({...f.request,attachments:[outside]}),/ngoài thư mục/);
  await assert.rejects(f.chat.send({...f.request,attachments:[escaped]}),/ngoài thư mục/);
  await assert.rejects(f.chat.send({...f.request,attachments:Array(5).fill(f.paths[0])}),/Tối đa 4/);
  await assert.rejects(f.chat.send({...f.request,parentId:'parent',attachments:f.paths}),/hội thoại mới/);
  for(const [name,bytes,pattern] of [
    ['fake.png',Buffer.from('plain text'),/JPEG hoặc PNG/],
    ['fake.txt',await readFile(f.paths[1]),/JPEG hoặc PNG/],
    ['broken.png',(await readFile(f.paths[1])).subarray(0,12),/giải mã/],
    ['large.png',Buffer.alloc(8*1024**2+1),/8 MB/],
  ]){const path=join(f.dir,name);await writeFile(path,bytes);await assert.rejects(f.chat.send({...f.request,attachments:[path]}),pattern);}
  assert.equal(browsers,0);assert.deepEqual(f.store.batch(),before);assert.equal(f.chat.get(f.request.requestId),null);
});

test('reject junction/symlink components even if their target stays inside the approved root',async t=>{
  const f=await fixture(t),link=join(f.root,'references','linked');
  await symlink(f.dir,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(f.chat.send({...f.request,attachments:[join(link,'dense.png')]}),/symlink hoặc junction/);
  assert.equal(f.events.length,0);
});

test('image mutation during browser preparation fails without consuming another turn',async t=>{
  const f=await fixture(t),before=f.store.batch();
  f.worker.measureQuota=async()=>{await writeFile(f.paths[0],'changed');return {state:'available',weeklyRemainingPercent:50};};
  const result=await f.chat.send({...f.request,attachments:f.paths});
  assert.equal(result.state,'failed');assert.deepEqual(f.store.batch(),before);
  assert.equal(f.events.some(e=>['files','beginSubmit','click'].includes(e[0])),false);
});

test('JSON repair follows the confirmed attached parent beyond three sends without uploading again',async t=>{
  const f=await fixture(t),parent=await f.chat.send({...f.request,attachments:f.paths});
  f.chat.historyThroughParent=async(_page,value)=>{assert.equal(value.state,'done');assert.ok([parent.requestId,'repair'].includes(value.requestId));return {};};
  const repair=await f.chat.send({...f.request,requestId:'repair',parentId:parent.requestId,prompt:'Repair the JSON'});
  assert.equal(repair.state,'done');assert.equal(repair.parentId,parent.requestId);
  assert.equal(f.events.filter(e=>e[0]==='files').length,1);assert.equal(f.events.filter(e=>e[0]==='click').length,2);
  assert.equal(f.store.batch().submittedByProfile.profile,3);
  const fourth=await f.chat.send({...f.request,requestId:'fourth',parentId:repair.requestId,prompt:'Repair again'});
  assert.equal(fourth.state,'done');assert.equal(fourth.parentId,repair.requestId);assert.equal(f.events.filter(e=>e[0]==='click').length,3);
  assert.equal(f.events.filter(e=>e[0]==='files').length,1);assert.equal(f.store.batch().submittedByProfile.profile,4);
});

test('IPC resolves only sparse + first dense sheet from verified structure, never renderer paths',async t=>{
  const f=await fixture(t),calls=[],chat={send:async value=>{calls.push(value);return value;}};
  const result=await sendMuseChat(chat,f.integrations,{...f.request,referenceJobId:'sample'});
  assert.deepEqual(result.attachments,f.paths);assert.equal('referenceJobId' in result,false);
  if(process.platform==='win32'){
    const job=f.integrations.job('sample');f.integrations.update({...job,path:job.path.toUpperCase()});
    assert.deepEqual(await referenceChatAttachments(f.integrations,'sample',f.request.projectId),f.paths);
  }
  assert.deepEqual(await sendMuseChat(chat,f.integrations,f.request),{...f.request,parentId:null});
  for(const extra of [{attachments:f.paths},{references:[{path:f.paths[0]}]},{path:f.paths[0]},{bytes:new Uint8Array([1])}])
    await assert.rejects(sendMuseChat(chat,f.integrations,{...f.request,...extra}));
  await assert.rejects(sendMuseChat(chat,f.integrations,{...f.request,referenceJobId:'sample',parentId:'parent'}),/hội thoại mới/);
  await assert.rejects(sendMuseChat(chat,f.integrations,{...f.request,referenceJobId:'sample',projectId:'wrong'}),/hội thoại/);
  assert.equal(calls.length,2);
  await writeFile(f.paths[1],'tampered');
  await assert.rejects(sendMuseChat(chat,f.integrations,{...f.request,referenceJobId:'sample'}),/checksum/);
  assert.equal(calls.length,2);
});

test('IPC rejects changed structure, missing dense sheet and sheets escaping their own job',async t=>{
  const f=await fixture(t),job=f.integrations.job('sample');
  await writeFile(job.path,'{}');await assert.rejects(referenceChatAttachments(f.integrations,'sample',f.request.projectId),/checksum/);
  async function replace(structure){const bytes=Buffer.from(JSON.stringify(structure));await writeFile(job.path,bytes);f.integrations.update({...job,structureSha256:sha(bytes)});}
  await replace({...f.structure,contactSheets:undefined});
  await assert.rejects(referenceChatAttachments(f.integrations,'sample',f.request.projectId),/Chưa có sheet dày/);
  const path=join(f.root,'references','other.png');await writeFile(path,await readFile(f.paths[1]));
  await replace({...f.structure,contactSheetPath:path,contactSheetSha256:sha(await readFile(path))});
  await assert.rejects(referenceChatAttachments(f.integrations,'sample',f.request.projectId),/ngoài thư mục/);
});

test('preload sends referenceJobId through existing channel; main delegates to the validating handler',async t=>{
  const f=await fixture(t),calls=[];let bridge;
  const source=await readFile(new URL('../src/preload.cjs',import.meta.url),'utf8');
  runInNewContext(source,{require:name=>{assert.equal(name,'electron');return {
    contextBridge:{exposeInMainWorld:(_name,api)=>{bridge=api;}},
    ipcRenderer:{on:()=>{},invoke:async(channel,payload)=>{calls.push(channel);try{return {ok:true,value:await sendMuseChat({send:async p=>p},f.integrations,payload)};}catch(e){return {ok:false,error:e.message};}}},
  };}});
  const result=await bridge.museChatSend({...f.request,referenceJobId:'sample'});
  assert.deepEqual(result.attachments,f.paths);assert.deepEqual(calls,['product-lab:museChatSend']);
  await assert.rejects(bridge.museChatSend({...f.request,attachments:f.paths}),/Unrecognized key/);
  const main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8');
  assert.match(main,/museChatSend: p => sendMuseChat\(museChat, integrations, p\)/);
});
