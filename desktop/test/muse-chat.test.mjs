import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {MuseAdapter} from '../src/muse.mjs';

function fixture(t) {
  const store = new Store(':memory:');store.set('muse_paused',false);
  t.after(() => store.close());
  store.set('profiles', [{id: 'profile', enabled: true, proxy: {server: ''}}]);
  store.set('adapter', {enabled: true, startUrl: 'https://muse.ai/', resultIdAttribute: 'data-message-id', submitName: 'Send'});
  const worker = new Worker(store, 'fixture', {}, {});
  const counts = {clicks: 0, closed: 0};
  const page = {url: () => 'https://muse.ai/thread/thread-1',
    locator: () => ({evaluateAll: async () => []}),
    getByRole: () => ({click: async () => counts.clicks++}),
    close: async () => counts.closed++};
  worker.context = async () => ({newPage: async () => page});
  worker.connectVpn = async () => {};
  worker.setProfileVisibility = async () => {};
  worker.measureQuota = async () => ({state: 'available', weeklyRemainingPercent: 50});
  t.mock.method(MuseAdapter.prototype, 'prepare', async () => {});
  const chat = new MuseChat(worker);
  t.mock.method(chat, 'readResponse', async (_page, row) => chat.save({...row, state: 'done', response: 'A product script', providerId: 'message-1'}));
  const request = {requestId: 'request-1', profileId: 'profile', projectId: 'general', prompt: 'Write a script'};
  return {store, worker, chat, page, counts, request};
}

test('Muse chat sends once, persists response and shares batch accounting', async t => {
  const {chat, store, worker, request, counts} = fixture(t);
  const result = await chat.send(request);
  assert.equal(result.state, 'done');
  assert.equal(counts.clicks, 1);
  assert.equal(counts.closed, 1);
  assert.equal(worker.chatting.size, 0);
  assert.equal(store.batch().submittedByProfile.profile, 1);
  assert.deepEqual(await chat.send(request), result);
  assert.equal(counts.clicks, 1);
  assert.equal(chat.list({projectId: 'general'}).length, 1);
  assert.equal(chat.list({projectId: 'other'}).length, 0);
  await assert.rejects(chat.send({...request, prompt: 'Different prompt'}), /nội dung khác/);
  assert.equal(new MuseChat(worker).get(request.requestId).response, result.response);
});

test('writing mode is scoped to one request and leaves later media requests available', async t => {
  const {chat} = fixture(t);
  const prompt = 'Write a video concept in English';
  const sent = chat.textPrompt(prompt);
  assert.ok(sent.startsWith('For this request only'));
  assert.match(sent,/Do not remember it as a restriction on future requests/);
  assert.match(sent,/later request explicitly asking to create an image or video/);
  assert.ok(sent.endsWith(prompt));
});

test('existing Muse thread waits for the acknowledged parent and snapshots only history before it',async t=>{
 const {chat}=fixture(t);let hydrated=false;
 const parent={state:'done',providerId:'parent-response',response:'Saved parent response'};
 const messages=[{id:'u1',role:'user',text:'first'},{id:'parent-response',role:'assistant',text:parent.response},{id:'u2',role:'user',text:'follow-up'}];
 const page={waitForFunction:async(_fn,id)=>{assert.equal(id,parent.providerId);hydrated=true;},locator:()=>({evaluateAll:async()=>{assert.ok(hydrated);return messages;}})};
 assert.deepEqual(await chat.historyThroughParent(page,parent),{oldUserIds:['u1'],oldAssistantIds:['parent-response']});
 messages[1].text='Edited parent';await assert.rejects(chat.historyThroughParent(page,parent),/đã thay đổi/);
});

test('recovery repairs pre-hydration history only for one exact follow-up, without another Send or batch increment',async t=>{
 const {chat,worker,page,request,counts,store}=fixture(t);
 const parent=await chat.send(request);const clicks=counts.clicks;const batch=store.batch();
 const follow={...request,requestId:'follow',parentId:parent.requestId,prompt:'Refine the sourced products',state:'needs_attention',providerUrl:parent.providerUrl,oldUserIds:[],oldAssistantIds:[]};
 chat.save(follow);page.goto=async()=>{};
 t.mock.method(MuseAdapter.prototype,'session',async()=>true);
 t.mock.method(chat,'historyThroughParent',async()=>({oldUserIds:['old-user'],oldAssistantIds:[parent.providerId]}));
 let fresh=[{id:'old-user',text:'old'},{id:'new-user',text:chat.textPrompt(follow.prompt)}];
 page.locator=()=>({evaluateAll:async()=>fresh});
 const recovered=await chat.recover({requestId:follow.requestId});
 assert.equal(recovered.state,'done');assert.deepEqual(recovered.oldUserIds,['old-user']);assert.equal(counts.clicks,clicks);assert.deepEqual(store.batch(),batch);
 chat.save({...follow,requestId:'ambiguous'});fresh.push({id:'another',text:'User typed independently'});
 const ambiguous=await chat.recover({requestId:'ambiguous'});assert.equal(ambiguous.state,'needs_attention');assert.match(ambiguous.error,/đúng tin nhắn/);assert.equal(counts.clicks,clicks);
});

test('local chat catalog covers every scope and pins persist without submitting', async t => {
  const {chat, request, store, counts} = fixture(t);
  await chat.send(request);
  await chat.send({...request, requestId:'request-2', projectId:'another-project'});
  assert.equal(chat.list({}).length, 2);
  assert.equal(chat.list({projectId:'general'}).length, 1);
  const before = store.batch();
  chat.pin({requestId:request.requestId, pinned:true});
  assert.equal(new MuseChat(chat.worker).get(request.requestId).pinned, true);
  assert.deepEqual(store.batch(), before);
  assert.equal(counts.clicks, 2);
  assert.throws(() => chat.pin({requestId:'missing', pinned:true}), /Không tìm/);
});

test('opening a saved thread uses its owning profile and rejects invalid URLs or busy profiles', async t => {
  const {chat, worker, request} = fixture(t);
  await chat.send(request);
  const visited = [];
  const page = {url: () => 'about:blank', goto: async url => visited.push(url), bringToFront: async () => {}};
  worker.context = async profileId => {assert.equal(profileId, request.profileId); return {pages:()=>[],newPage:async()=>page};};
  worker.setProfileVisibility = async (profileId, visible) => {assert.equal(profileId, request.profileId); assert.equal(visible, true);};
  await chat.open({requestId:request.requestId});
  assert.deepEqual(visited, ['https://muse.ai/thread/thread-1']);
  assert.equal(worker.chatting.size, 0);
  worker.chatting.add(request.profileId);
  await assert.rejects(chat.open({requestId:request.requestId}), /đang xử lý/);
  worker.chatting.delete(request.profileId);
  chat.save({...chat.get(request.requestId), providerUrl:'https://evil.invalid/thread/abc'});
  await assert.rejects(chat.open({requestId:request.requestId}), /địa chỉ/);
  assert.equal(visited.length, 1);
});

test('Muse task scopes retain full project IDs without merging similar long IDs', async t => {
  const {chat,request} = fixture(t);
  const project = 'task_research_' + 'a'.repeat(119);
  await chat.send({...request,projectId:project+'x'});
  await chat.send({...request,requestId:'request-2',projectId:project+'y'});
  assert.equal(chat.list({projectId:project+'x'}).length,1);
  assert.equal(chat.list({projectId:project+'y'})[0].requestId,'request-2');
});

test('Muse chat excludes video, profile checks and profile close while opening', async t => {
  const {chat, worker, request, counts} = fixture(t);
  let release;
  const context = worker.context;
  worker.context = () => new Promise(resolve => { release = () => resolve(context()); });
  const sending = chat.send(request);
  assert.equal(worker.profiles()[0].busy, true);
  await assert.rejects(worker.checkProfile('profile'), /đang chat/);
  await assert.rejects(worker.closeProfile('profile'), /chat Muse/);
  assert.throws(() => worker.newBatch(), /chat Muse/);
  await assert.rejects(chat.send({...request, requestId: 'request-2'}), /đang xử lý/);
  release();
  await sending;
  assert.equal(counts.clicks, 1);
});

test('Muse chat fourth attempt cannot click Send or increment the batch', async t => {
  const {chat, store, request, counts} = fixture(t);
  store.set('generation_batch', {id: 'batch', perProfileLimit: 3, submittedByProfile: {profile: 3}});
  const result = await chat.send(request);
  assert.equal(result.state, 'failed');
  assert.equal(counts.clicks, 0);
  assert.equal(store.batch().submittedByProfile.profile, 3);
});

test('Muse chat checkpoints before click and keeps an uncertain send for recovery', async t => {
  const {chat, page, store, request} = fixture(t);
  page.getByRole = () => ({click: async () => {
    assert.equal(chat.get(request.requestId).state, 'waiting');
    assert.equal(store.batch().submittedByProfile.profile, 1);
    throw Error('Connection lost after click');
  }});
  const result = await chat.send(request);
  assert.equal(result.state, 'needs_attention');
  assert.deepEqual(await chat.send(request), result);
  page.goto = async () => {};
  t.mock.method(MuseAdapter.prototype, 'session', async () => true);
  const recovered = await chat.recover({requestId: request.requestId});
  assert.equal(recovered.state, 'done');
  assert.equal(store.batch().submittedByProfile.profile, 1);
});

test('Muse chat restart preserves uncertainty and never schedules a new send', t => {
  const {chat, worker, request, counts} = fixture(t);
  chat.save({...request, state: 'waiting'});
  chat.save({...request, requestId: 'preflight', state: 'preparing'});
  const recovered = new MuseChat(worker);
  assert.equal(recovered.get(request.requestId).state, 'needs_attention');
  assert.equal(recovered.get('preflight').state, 'failed');
  assert.equal(counts.clicks, 0);
});

test('Muse chat validates account/thread scope and external recovery URLs', async t => {
  const {chat, request, counts} = fixture(t);
  chat.save({...request, requestId: 'parent', projectId: 'other', state: 'done'});
  await assert.rejects(chat.send({...request, parentId: 'parent'}), /profile khác/);
  for (const url of ['https://example.com/thread/123', 'https://muse.ai/thread/new', 'https://user:pass@muse.ai/thread/abc', 'https://muse.ai/settings']) {
    assert.throws(() => chat.threadUrl(url));
  }
  assert.equal(chat.threadUrl('https://muse.ai/thread/abc'), 'https://muse.ai/thread/abc');
  assert.equal(counts.clicks, 0);
});

test('Muse chat blocks unknown quota and reserves no attempt', async t => {
  const {chat, worker, store, request, counts} = fixture(t);
  worker.measureQuota = async () => ({state: 'unavailable'});
  assert.equal((await chat.send(request)).state, 'failed');
  assert.equal(store.batch(), null);
  assert.equal(counts.clicks, 0);
});

test('Muse chat reader waits for completed stable text and excludes old responses', async t => {
  const store = new Store(':memory:');store.set('muse_paused',false);
  t.after(() => store.close());
  const chat = new MuseChat(new Worker(store, 'fixture', {}, {}));
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const row = {requestId: 'r', profileId: 'p', projectId: 'g', state: 'waiting', oldAssistantIds: ['old'], oldUserIds: ['old-user'], providerUrl: 'https://muse.ai/thread/id'};
  chat.save(row);
  const page = {url: () => row.providerUrl,
    locator: selector => ({evaluateAll: async () => selector.includes('assistant')
      ? [{id: 'old', text: 'Ignore this'}, {id: 'new', text: now < 2000 ? 'partial' : 'Final response'}]
      : [{id: 'old-user', alert: 'Delivery not confirmed'}, {id: 'new-user'}]}),
    getByRole: () => ({isVisible: async () => now < 2000}),
    waitForTimeout: async duration => {now += duration;}};
  const result = await chat.readResponse(page, row);
  assert.equal(result.response, 'Final response');
  assert.equal(result.providerId, 'new');
  assert.ok(now >= 4500);
});

test('Muse research waits through browser tool presentations and reads only the final written answer',async t=>{
 const store=new Store(':memory:');store.set('muse_paused',false);t.after(()=>store.close());
 const chat=new MuseChat(new Worker(store,'fixture',{},{}));let now=0;
 t.mock.method(Date,'now',()=>now);
 const row={requestId:'browser-research',profileId:'p',projectId:'g',state:'waiting',oldAssistantIds:[],oldUserIds:[],providerUrl:'https://muse.ai/thread/research'};chat.save(row);
 const tool={id:'browser-task:browser-task:973b222e-9fcf-5dc6-90e9-59d63bf7e958',media:true,text:'BrowserStarting'};
 const response='{"summary":"Sources reviewed","candidates":[]}';
 const page={url:()=>row.providerUrl,locator:selector=>({evaluateAll:async()=>selector.includes('assistant')
  ?[tool,...(now>=4000?[{id:'final-answer',media:false,text:response}]:[])]:[{id:'user'}]}),
  getByRole:()=>({isVisible:async()=>false}),waitForTimeout:async ms=>{now+=ms;}};
 const result=await chat.readResponse(page,row);
 assert.equal(result.state,'done');assert.equal(result.providerId,'final-answer');assert.equal(result.response,response);assert.ok(now>=6500);
 assert.equal(store.batch(),null,'Reading browser research never submits another request');
});

test('Muse research does not accept a tool card as the answer and still blocks actual generated media',async t=>{
 const store=new Store(':memory:');store.set('muse_paused',false);t.after(()=>store.close());
 const chat=new MuseChat(new Worker(store,'fixture',{},{}));let now=0;
 t.mock.method(Date,'now',()=>now);
 const row={requestId:'tool-only',profileId:'p',projectId:'g',state:'waiting',oldAssistantIds:[],oldUserIds:[],providerUrl:'https://muse.ai/thread/research'};chat.save(row);
 let message={id:'browser-task:job',media:true,text:'BrowserCompleted'};
 const page={url:()=>row.providerUrl,locator:selector=>({evaluateAll:async()=>selector.includes('assistant')?[message]:[{id:'user'}]}),
  getByRole:()=>({isVisible:async()=>false}),waitForTimeout:async ms=>{now+=ms;}};
 await assert.rejects(chat.readResponse(page,row),/120 giây/);assert.equal(chat.get(row.requestId).state,'waiting');
 now=0;message={id:'generated-image',media:true,text:'Generated image'};
 await assert.rejects(chat.readResponse(page,row),/trả media/);assert.equal(chat.get(row.requestId).state,'waiting');
});

test('background research can finish after two minutes without resubmission',async t=>{
 const store=new Store(':memory:');store.set('muse_paused',false);t.after(()=>store.close());const chat=new MuseChat(new Worker(store,'fixture',{},{}));let now=0;
 t.mock.method(Date,'now',()=>now);
 const row={requestId:'long-research',profileId:'p',projectId:'research_background',state:'waiting',oldAssistantIds:[],oldUserIds:[],providerUrl:'https://muse.ai/thread/long'};chat.save(row);
 const page={url:()=>row.providerUrl,locator:selector=>({evaluateAll:async()=>selector.includes('assistant')?(now>=180000?[{id:'final',media:false,text:'Research result'}]:[]):[{id:'user'}]}),getByRole:()=>({isVisible:async()=>now<180000}),waitForTimeout:async ms=>{now+=ms;}};
 const result=await chat.readResponse(page,row);assert.equal(result.state,'done');assert.ok(now>180000);assert.equal(store.batch(),null);
});

for(const pauseAt of ['prepare','waiting'])test('T-002b: in-flight chat finishes at '+pauseAt+' while new chat remains blocked',async t=>{
  const {chat,worker,store,request,counts}=fixture(t);
  if(pauseAt==='prepare')t.mock.method(MuseAdapter.prototype,'prepare',async()=>{await worker.setMusePaused({paused:true});});
  const original=chat.readResponse;
  t.mock.method(chat,'readResponse',async(page,row)=>{
    if(pauseAt==='waiting')await worker.setMusePaused({paused:true});
    await assert.rejects(chat.send({...request,requestId:'blocked'}),{code:'MUSE_PAUSED'});
    return original(page,row);
  });
  const result=await chat.send(request);
  assert.equal(result.state,'done');assert.equal(result.provider,'muse');assert.equal(counts.clicks,1);
  assert.equal(store.batch().submittedByProfile.profile,1);assert.equal(chat.list({projectId:'general'}).length,1);
});
