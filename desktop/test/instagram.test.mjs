import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {InstagramPublisher} from '../src/instagram.mjs';
import {InstagramBrowsers} from '../src/instagram-browser.mjs';
import {instagramReceipt, instagramPostUrl} from '../src/instagram-adapter.mjs';

const signedIn = {session:'signed_in', handle:'hermes_test', userId:'100'};
function fixture(t) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const snapshot = {planId:'plan', revision:1, accountId:'account', productId:'product', assetId:'asset',
    accountRevision:1, name:'Video test', path:'fixture.mp4', sha256:'a'.repeat(64), caption:'A close look.', duration:10, ratio:'9:16', width:720, height:1280};
  const account = {id:'account', data:{productId:'product', name:'Instagram test'}};
  let session = signedIn;
  const calls = {shares:0, prepared:0, synced:0, visible:[]};
  const page = {isClosed:()=>true};
  const adapter = {session:async()=>session, prepare:async()=>{calls.prepared++;return {beforeLinks:['https://www.instagram.com/reel/old/']};},
    publish:async(_page,_job,before)=>{await before();calls.shares++;return {postUrl:'https://www.instagram.com/reel/abc/',handle:signedIn.handle};},
    reconcile:async()=>null};
  const workspace = {account:async()=>account,snapshot:async input=>({...snapshot,...input}),revalidate:async value=>value,syncPublished:async()=>{calls.synced++;}};
  const publisher = new InstagramPublisher({store,root:'fixture',browser:{},secret:{},workspace,adapter,validate:async()=>({sha256:snapshot.sha256})});
  publisher.stopped = true;
  publisher.browsers.page = async()=>page;
  publisher.browsers.visibility = async(id,value)=>calls.visible.push({id,value});
  store.set('instagram_profiles',[{id:'account',name:'Instagram test',productId:'product',vpnEnabled:false,proxy:{server:'',username:''},...signedIn}]);
  return {publisher,store,workspace,adapter,calls,snapshot,request:{requestId:'request',planId:'plan',revision:1,accountId:'account',assetId:'asset'},setSession:value=>{session=value;}};
}
async function drain(publisher) {publisher.stopped=false;publisher.drain();while(publisher.running) await publisher.running;}

test('Instagram freezes the request, publishes once and retries synchronization without posting again', async t=>{
  const {publisher,request,calls,workspace}=fixture(t);
  workspace.syncPublished=async()=>{calls.synced++;throw Error('Workspace unavailable');};
  const job=await publisher.enqueue(request);
  assert.equal(job.snapshot.path,undefined);
  await drain(publisher);
  assert.equal(publisher.job(job.id).state,'published');
  assert.equal(calls.shares,1);
  assert.match(publisher.job(job.id).syncError,/unavailable/);
  assert.equal((await publisher.enqueue(request)).id,job.id);
  workspace.syncPublished=async()=>{calls.synced++;};
  await publisher.reconcile({id:job.id});
  assert.equal(publisher.job(job.id).syncError,'');
  assert.equal(calls.shares,1);
  assert.equal(calls.synced,2);
  assert.throws(()=>publisher.retry({id:job.id}),/Chỉ thử lại/);
});

test('Login wait resumes the selected video after login, with no other queued content',async t=>{
  const {publisher,request,setSession,calls}=fixture(t);
  setSession({session:'login_required',handle:'',userId:''});
  const job=await publisher.enqueue(request);
  await drain(publisher);
  assert.equal(publisher.job(job.id).state,'waiting_login');assert.equal(calls.shares,0);
  assert.equal(calls.visible.at(-1).value,true);
  publisher.browsers.contexts.set('account',{});
  setSession(signedIn);
  await publisher.pulse();
  while(publisher.running) await publisher.running;
  assert.equal(publisher.job(job.id).state,'published');assert.equal(calls.shares,1);
  assert.equal(calls.visible.at(-1).value,false);
});

test('Different logged-in account or changed workspace cannot share a queued video',async t=>{
  const {publisher,request,setSession,calls,workspace}=fixture(t);
  const job=await publisher.enqueue(request);
  setSession({...signedIn,userId:'other'});
  await drain(publisher);assert.equal(publisher.job(job.id).state,'failed');assert.equal(calls.shares,0);
  setSession(signedIn);
  workspace.revalidate=async()=>{throw Error('Nội dung đã thay đổi');};
  publisher.retry({id:job.id});while(publisher.running)await publisher.running;
  assert.equal(publisher.job(job.id).state,'failed');assert.equal(calls.prepared,0);
});

test('Account expectation and file checksum are verified before upload',async t=>{
  const {publisher,request,workspace,snapshot,calls}=fixture(t);
  workspace.snapshot=async input=>({...snapshot,...input,expectedHandle:'different'});
  const job=await publisher.enqueue(request);await drain(publisher);
  assert.equal(publisher.job(job.id).state,'failed');assert.equal(calls.prepared,0);
  publisher.validate=async()=>({sha256:'b'.repeat(64)});
  publisher.retry({id:job.id});while(publisher.running)await publisher.running;
  assert.match(publisher.job(job.id).error,/Checksum/);assert.equal(calls.shares,0);
});

test('Uncertain share is never retried or duplicated, including changed video selections and restart',async t=>{
  const {publisher,request,adapter,calls,store,workspace}=fixture(t);
  adapter.publish=async(_page,_job,before)=>{await before();calls.shares++;throw Error('Connection lost after Share');};
  const job=await publisher.enqueue(request);await drain(publisher);
  assert.equal(publisher.job(job.id).state,'needs_attention');assert.equal(calls.shares,1);
  assert.throws(()=>publisher.retry({id:job.id}),/Chỉ thử lại/);
  assert.throws(()=>publisher.cancel({id:job.id}),/Chỉ hủy/);
  assert.equal((await publisher.enqueue({...request,requestId:'different',assetId:'other'})).id,job.id);
  const recovered=new InstagramPublisher({store,root:'fixture',browser:{},secret:{},workspace,adapter});
  assert.equal(recovered.job(job.id).state,'needs_attention');
  await publisher.reconcile({id:job.id});assert.equal(publisher.job(job.id).state,'needs_attention');
  adapter.reconcile=async()=>({postUrl:'https://www.instagram.com/reel/abc/',handle:signedIn.handle});
  await publisher.reconcile({id:job.id});assert.equal(publisher.job(job.id).state,'published');assert.equal(calls.shares,1);
});

test('Concurrent request IDs and alternate selections produce one pending plan; cancellation is final',async t=>{
  const {publisher,request,calls}=fixture(t);
  const jobs=await Promise.all([publisher.enqueue(request),publisher.enqueue({...request,requestId:'alternate',assetId:'other'})]);
  assert.equal(jobs[0].id,jobs[1].id);assert.equal(publisher.jobs().length,1);
  await assert.rejects(publisher.enqueue({...request,assetId:'other'}),/nội dung khác/);
  publisher.cancel({id:jobs[0].id});await drain(publisher);assert.equal(calls.shares,0);
});

test('Restart distinguishes before Share from uncertain Share without automatic repost',async t=>{
  const {publisher,request,store,workspace,adapter}=fixture(t);
  const job=await publisher.enqueue(request);
  publisher.update(job.id,{state:'submitting'});
  let recovered=new InstagramPublisher({store,root:'fixture',browser:{},secret:{},workspace,adapter});
  assert.equal(recovered.job(job.id).state,'needs_attention');
  publisher.update(job.id,{state:'uploading'});
  recovered=new InstagramPublisher({store,root:'fixture',browser:{},secret:{},workspace,adapter});
  assert.equal(recovered.job(job.id).state,'failed');
});

test('Session changes just before Share stop publication and release the browser lock',async t=>{
  const {publisher,request,adapter,setSession,calls}=fixture(t);
  adapter.prepare=async()=>{setSession({...signedIn,userId:'switched'});return {beforeLinks:[]};};
  const job=await publisher.enqueue(request);await drain(publisher);
  assert.equal(publisher.job(job.id).state,'failed');assert.equal(calls.shares,0);assert.equal(publisher.browsers.busy.size,0);
});

test('Cancelling while a session check is pending cannot be overwritten by the worker',async t=>{
  const {publisher,request,calls}=fixture(t);const job=await publisher.enqueue(request);
  let release;publisher.checks.set('account',new Promise(resolve=>{release=resolve;}));
  publisher.stopped=false;publisher.drain();publisher.cancel({id:job.id});release();
  while(publisher.running)await publisher.running;
  assert.equal(publisher.job(job.id).state,'cancelled');assert.equal(calls.prepared,0);assert.equal(calls.shares,0);
});

test('Instagram receipts require recent video, matching identity and caption; untrusted URLs are rejected',()=>{
  const now=Date.now();const job={handle:'hermes_test',userId:'100',submittingAt:now,snapshot:{caption:'A close look.'}};
  const media={code:'ABC_def',media_type:2,taken_at:Math.floor(now/1000),user:{username:job.handle,pk:100},caption:{text:job.snapshot.caption}};
  assert.equal(instagramReceipt({media,status:'ok'},job).postUrl,'https://www.instagram.com/reel/ABC_def/');
  for(const patch of [{media_type:1},{taken_at:1},{taken_at:undefined},{user:{username:job.handle,pk:2}},{caption:{text:'Other'}}]) assert.equal(instagramReceipt({media:{...media,...patch}},job),null);
  assert.equal(instagramReceipt({media,status:'fail'},job),null);
  for(const url of ['https://instagram.com.attacker.test/reel/x/','http://instagram.com/reel/x/','https://user:pass@instagram.com/reel/x/','https://instagram.com/accounts/login/'])assert.equal(instagramPostUrl(url),null);
});

test('Instagram browser saves secrets privately and keeps concurrent profiles separate',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const browsers=new InstagramBrowsers({store,root:'fixture',browser:{},secret:{encrypt:async value=>'encrypted:'+value}});
  const account=id=>({id,data:{name:'Instagram '+id,productId:'product'}});
  await Promise.all(['one','two'].map(id=>browsers.save(account(id),{vpnEnabled:false,proxy:{server:'http://localhost:1234',username:'user',password:'private'}})));
  assert.equal(browsers.rows().length,2);assert.ok(!JSON.stringify(browsers.status()).includes('private'));
  await browsers.save(account('one'),{vpnEnabled:false,proxy:{server:'http://localhost:1234',username:'user',password:''}});
  assert.equal(browsers.profile('one').proxy.encryptedPassword,'encrypted:private');
  browsers.busy.add('one');await assert.rejects(browsers.save(account('one')),/Đóng trình duyệt/);
  assert.equal(browsers.status()[0].session,'unknown');
});

test('Instagram profile-prefixed post links normalize to the same canonical permalink',()=>{
  for(const prefix of ['', 'nao.mirita/']) {
    for(const type of ['reel','reels']) assert.equal(instagramPostUrl(`https://www.instagram.com/${prefix}${type}/ABC_12/?igsh=test`),'https://www.instagram.com/reel/ABC_12/');
    assert.equal(instagramPostUrl(`https://instagram.com/${prefix}p/ABC_12/`),'https://www.instagram.com/p/ABC_12/');
  }
  for(const url of ['https://www.instagram.com/accounts/reel/ABC/', 'https://www.instagram.com/user/reel/ABC/comments/', 'https://www.instagram.com/user/reels/', 'https://www.instagram.com:8443/reel/ABC/']) assert.equal(instagramPostUrl(url),null);
});

test('Opening a profile and polling while navigation loads share one Instagram tab',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const browsers=new InstagramBrowsers({store,root:'fixture',browser:{},secret:{}});
  let release;const waiting=new Promise(resolve=>{release=resolve;});let created=0;let url='about:blank';
  const page={url:()=>url,isClosed:()=>false,setDefaultTimeout:()=>{},goto:async()=>{await waiting;url='https://www.instagram.com/';}};
  const context={pages:()=>created?[page]:[],newPage:async()=>{created++;return page;}};
  browsers.context=async()=>context;
  const first=browsers.page('account');const second=browsers.page('account');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(created,1);assert.equal(browsers.pageOpening.size,1);
  release();assert.equal(await first,await second);assert.equal(await browsers.page('account'),page);
  assert.equal(created,1);assert.equal(browsers.pageOpening.size,0);
});
