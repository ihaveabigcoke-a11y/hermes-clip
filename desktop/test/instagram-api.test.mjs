import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {InstagramApi, mapApiInsights} from '../src/instagram-api.mjs';
import {InstagramApiAdapter} from '../src/instagram-api-adapter.mjs';
import {InstagramPublisher} from '../src/instagram.mjs';

const token = 'synthetic-private-token-T18';
const secret = {encrypt:async value => Buffer.from(value).toString('base64'),decrypt:async value => Buffer.from(value,'base64').toString()};
const response = (body, status = 200) => ({ok:status === 200,status,json:async () => body});
const video = Buffer.from('offline MP4 stand-in: validateMedia is independently tested');
const sha256 = createHash('sha256').update(video).digest('hex');
const media = () => ({id:'300',username:'owner',caption:'A close look.',media_type:'VIDEO',media_product_type:'REELS',permalink:'https://www.instagram.com/reel/abc/',timestamp:new Date().toISOString()});

async function fixture(t, options = {}) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const calls = [], syncs = [], measurements = [];
  const account = {id:'account',data:{name:'Instagram test',productId:'product',handle:'owner'}};
  const snapshot = {planId:'plan',revision:1,accountId:'account',productId:'product',assetId:'asset',accountRevision:1,
    name:'Video test',path:'fixture.mp4',sha256,caption:'A close look.',expectedHandle:'owner',duration:10,ratio:'9:16'};
  const workspace = {account:async () => account,snapshot:async input => ({...snapshot,...input}),revalidate:async value => value,
    syncPublished:async job => syncs.push(job),metricTarget:async () => ({planId:'plan',accountId:'account',postUrl:media().permalink,expectedHandle:'owner'}),
    saveMetrics:async (_target, value) => {measurements.push(value); return value;}};
  let hook = null;
  const fetch = async (url, init) => {
    const u = new URL(url), key = init.method + ' ' + u.pathname;
    calls.push({key,url,init});
    assert.equal(u.searchParams.has('access_token'),false);
    assert.equal(init.redirect,'error');
    assert.ok(init.signal);
    if (hook) {const custom = await hook(key, init); if (custom) return custom;}
    if (u.pathname.endsWith('/me')) return response({user_id:'100',username:'owner'});
    if (u.pathname.endsWith('/content_publishing_limit')) return response({data:[{quota_usage:0,config:{quota_total:100,quota_duration:86400}}]});
    if (key === 'POST /v99.0/100/media') return response({id:'200',uri:'https://rupload.facebook.com/ig-api-upload/v99.0/200'});
    if (u.hostname === 'rupload.facebook.com') return response({success:true});
    if (key === 'GET /v99.0/200') return response({status_code:'FINISHED'});
    if (u.pathname.endsWith('/media_publish')) return response({id:'300'});
    if (key === 'GET /v99.0/300') return response(media());
    if (key === 'GET /v99.0/100/media') return response({data:[media()]});
    if (u.pathname.endsWith('/insights')) return response({data:[{name:'views',period:'lifetime',values:[{value:0}]},{name:'reach',period:'lifetime',values:[{value:4}]}]});
    throw Error('Unexpected fixture endpoint');
  };
  const apiAdapter = new InstagramApiAdapter({secret,fetch,enabled:true,version:'v99.0',resumableEnabled:true,readVideo:async () => video,delay:async () => {},...options});
  const publisher = new InstagramPublisher({store,root:'fixture',browser:{},secret,workspace,apiAdapter,validate:async () => ({sha256})});
  publisher.stopped = true;
  publisher.browsers.page = async () => {throw Error('API must never open a browser');};
  publisher.browsers.context = async () => {throw Error('API metrics must never open a browser');};
  await publisher.saveProfile({id:'account',apiMode:'api',apiUserId:'100',apiToken:token,vpnEnabled:false});
  return {store,publisher,workspace,apiAdapter,snapshot,calls,syncs,measurements,hook:value => {hook = value;},
    request:{requestId:'request',planId:'plan',revision:1,accountId:'account',assetId:'asset'}};
}
async function drain(p) {p.stopped = false; p.drain(); while (p.running) await p.running;}
const mutations = f => f.calls.filter(call => call.init.method === 'POST');
test('T-004: Instagram Login URL container publishes once without resumable upload or browser',async t=>{
  const f=await fixture(t,{resumableEnabled:false});f.snapshot.apiVideoUrl='https://example.com/approved.mp4';
  f.hook((key,init)=>{if(key==='POST /v99.0/100/media'){
    assert.equal(init.body.get('video_url'),f.snapshot.apiVideoUrl);assert.equal(init.body.has('upload_type'),false);return response({id:'200'});
  }});
  const job=await f.publisher.enqueue(f.request);await drain(f.publisher);
  assert.equal(f.publisher.job(job.id).state,'published');assert.equal(f.publisher.job(job.id).proof.postUrl,media().permalink);
  await f.publisher.enqueue(f.request);await drain(f.publisher);assert.equal(mutations(f).length,2);
  assert.equal(f.calls.some(call=>call.url.includes('rupload')),false);
});

test('API Reel freezes account/video/caption, writes receipt before effects and publishes once in exact order', async t => {
  const f = await fixture(t); const job = await f.publisher.enqueue(f.request);
  f.hook(async (key, init) => {
    const current = f.publisher.job(job.id);
    if (key === 'POST /v99.0/100/media') {
      assert.equal(current.apiReceipt.phase,'creating'); assert.equal(current.apiReceipt.containerId,null);
      assert.equal(init.body.get('caption'),f.snapshot.caption); assert.equal(init.body.get('media_type'),'REELS');
      assert.equal(init.body.get('upload_type'),'resumable'); assert.equal(init.headers.Authorization,'Bearer ' + token);
    }
    if (key.startsWith('POST /ig-api-upload')) {
      assert.equal(current.apiReceipt.containerId,'200'); assert.equal(current.apiReceipt.phase,'uploading');
      assert.deepEqual(init.body,video); assert.equal(init.headers.offset,'0'); assert.equal(init.headers.file_size,String(video.length));
      assert.equal(init.headers.Authorization,'OAuth ' + token);
    }
    if (key.endsWith('/media_publish')) {assert.equal(current.state,'submitting'); assert.equal(current.apiReceipt.phase,'publishing'); assert.equal(init.body.get('creation_id'),'200');}
  });
  await drain(f.publisher);
  assert.deepEqual(f.calls.map(call => call.key),['GET /v99.0/me','GET /v99.0/100/content_publishing_limit','POST /v99.0/100/media',
    'POST /ig-api-upload/v99.0/200','GET /v99.0/200','GET /v99.0/me','POST /v99.0/100/media_publish','GET /v99.0/300']);
  assert.equal(f.publisher.job(job.id).state,'published'); assert.equal(f.publisher.job(job.id).proof.source,'api');
  assert.equal(job.snapshot.apiMode,'api'); assert.equal(job.snapshot.apiUserId,'100'); assert.equal(job.snapshot.path,undefined);
  assert.equal(f.publisher.job(job.id).apiReceipt.mediaId,'300'); assert.equal(f.syncs.length,1);
  await f.publisher.reconcile({id:job.id}); await f.publisher.enqueue(f.request);
  assert.equal(mutations(f).length,3); assert.equal(f.syncs.length,2);
});

test('API container errors, expired/unknown state and bounded processing never publish', async t => {
  for (const status_code of ['ERROR','EXPIRED','UNKNOWN','IN_PROGRESS']) await t.test(status_code, async t => {
    const f = await fixture(t,{pollAttempts:2}); f.hook(key => key === 'GET /v99.0/200' ? response({status_code}) : null);
    const job = await f.publisher.enqueue(f.request); await drain(f.publisher);
    assert.equal(f.publisher.job(job.id).state,'needs_attention'); assert.equal(f.publisher.job(job.id).apiReceipt.containerId,'200');
    assert.equal(f.calls.some(call => call.key.endsWith('/media_publish')),false);
    assert.throws(() => f.publisher.retry({id:job.id}),/Chỉ thử lại/);
  });
});

test('Lost responses at every mutation/read stage survive restart, duplicate requests and read-only reconciliation', async t => {
  for (const endpoint of ['POST /v99.0/100/media','POST /ig-api-upload/v99.0/200','GET /v99.0/200','POST /v99.0/100/media_publish','GET /v99.0/300']) await t.test(endpoint, async t => {
    const f = await fixture(t); f.hook(key => {if (key === endpoint) throw Error('Timeout ' + token);});
    const job = await f.publisher.enqueue(f.request); await drain(f.publisher);
    assert.equal(f.publisher.job(job.id).state,'needs_attention');
    assert.throws(() => f.publisher.retry({id:job.id}),/Chỉ thử lại/);
    assert.throws(() => f.publisher.cancel({id:job.id}),/Chỉ hủy/);
    const before = mutations(f).length;
    assert.equal((await f.publisher.enqueue({...f.request,requestId:'another',assetId:'other'})).id,job.id);
    const recovered = new InstagramPublisher({store:f.store,root:'fixture',browser:{},secret,workspace:f.workspace,apiAdapter:f.apiAdapter});
    assert.equal(recovered.job(job.id).state,'needs_attention');
    f.hook(key => key === 'GET /v99.0/200' ? response({status_code:'PUBLISHED'}) : null);
    await recovered.reconcile({id:job.id}); await drain(recovered);
    assert.equal(mutations(f).length,before);
    assert.equal(recovered.job(job.id).state,endpoint === 'GET /v99.0/300' ? 'published' : 'needs_attention');
    assert.equal(JSON.stringify(recovered.status()).includes(token),false);
  });
});

test('API restart preserves pre-publish receipts instead of allowing retry', async t => {
  const f = await fixture(t); const job = await f.publisher.enqueue(f.request);
  for (const state of ['preparing','uploading','submitting']) {
    f.publisher.update(job.id,{state,apiReceipt:{containerId:'200',mediaId:null,phase:'processing'}});
    const recovered = new InstagramPublisher({store:f.store,root:'fixture',browser:{},secret,workspace:f.workspace,apiAdapter:f.apiAdapter});
    assert.equal(recovered.job(job.id).state,'needs_attention'); assert.throws(() => recovered.retry({id:job.id}));
  }
  assert.equal(f.calls.length,0);
});

test('API gates, AI label, identity, quota and checksum stop before container creation', async t => {
  for (const scenario of ['disabled','upload disabled','AI label','identity','quota','checksum','workspace changed']) await t.test(scenario, async t => {
    const f = await fixture(t);
    if (scenario === 'disabled') f.apiAdapter.enabled = false;
    if (scenario === 'upload disabled') f.apiAdapter.resumableEnabled = false;
    if (scenario === 'AI label') f.snapshot.aiLabel = 'required';
    if (scenario === 'identity') f.hook(key => key.endsWith('/me') ? response({user_id:'101',username:'owner'}) : null);
    if (scenario === 'quota') f.hook(key => key.endsWith('/content_publishing_limit') ? response({data:[{quota_usage:100,config:{quota_total:100}}]}) : null);
    if (scenario === 'checksum') f.apiAdapter.readVideo = async () => Buffer.from('changed');
    if (scenario === 'workspace changed') f.workspace.revalidate = async () => {throw Error('Changed');};
    const job = await f.publisher.enqueue(f.request); await drain(f.publisher);
    assert.equal(f.publisher.job(job.id).state,'failed'); assert.equal(mutations(f).length,0);
    if (scenario.includes('disabled')) assert.equal(f.calls.length,0);
  });
});

test('Unexpected upload URI keeps the container receipt and never sends credentials to another host', async t => {
  const f = await fixture(t); f.hook(key => key === 'POST /v99.0/100/media' ? response({id:'200',uri:'https://untrusted.invalid/upload?access_token=' + token}) : null);
  const job = await f.publisher.enqueue(f.request); await drain(f.publisher);
  assert.equal(f.publisher.job(job.id).apiReceipt.containerId,'200'); assert.equal(f.publisher.job(job.id).state,'needs_attention');
  assert.equal(mutations(f).length,1); assert.equal(JSON.stringify(f.publisher.status()).includes(token),false);
});

test('Revalidation after upload and a mismatched final receipt cannot publish or complete a different snapshot', async t => {
  await t.test('workspace changed during upload',async t=>{
    const f=await fixture(t);
    f.hook(key=>{if(key.startsWith('POST /ig-api-upload'))f.workspace.revalidate=async()=>{throw Error('Caption changed');};});
    const job=await f.publisher.enqueue(f.request);await drain(f.publisher);
    assert.equal(f.publisher.job(job.id).state,'needs_attention');assert.equal(f.publisher.job(job.id).snapshot.caption,'A close look.');
    assert.equal(f.calls.some(call=>call.key.endsWith('/media_publish')),false);
  });
  for(const patch of [{caption:'Other caption'},{username:'other'},{timestamp:'2000-01-01T00:00:00Z'},{id:'301'},{media_product_type:'FEED'}]) await t.test(JSON.stringify(patch),async t=>{
    const f=await fixture(t);f.hook(key=>key==='GET /v99.0/300'?response({...media(),...patch}):null);
    const job=await f.publisher.enqueue(f.request);await drain(f.publisher);
    assert.equal(f.publisher.job(job.id).state,'needs_attention');assert.equal(f.publisher.job(job.id).apiReceipt.mediaId,'300');assert.equal(f.syncs.length,0);
    f.hook(null);await f.publisher.reconcile({id:job.id});assert.equal(f.publisher.job(job.id).state,'published');
    assert.equal(f.calls.filter(call=>call.key.endsWith('/media_publish')).length,1);
  });
});

test('AbortSignal timeout at publish is uncertain and cannot POST twice',async t=>{
  const f=await fixture(t,{timeoutMs:5});
  f.hook((key,init)=>{
    if(!key.endsWith('/media_publish'))return null;
    return new Promise((resolve,reject)=>{
      const keepAlive=setTimeout(()=>reject(Error('Fixture signal did not abort')),1000);
      init.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(init.signal.reason);},{once:true});
    });
  });
  const job=await f.publisher.enqueue(f.request);await drain(f.publisher);
  assert.equal(f.publisher.job(job.id).state,'needs_attention');assert.equal(f.publisher.job(job.id).apiReceipt.phase,'publishing');
  assert.throws(()=>f.publisher.retry({id:job.id}));await drain(f.publisher);
  assert.equal(f.calls.filter(call=>call.key.endsWith('/media_publish')).length,1);
});

test('API profile writes and checks exclude each other; mode switches do not reuse browser/API identity IDs',async t=>{
  const f=await fixture(t);
  let release;
  f.hook(key=>key.endsWith('/me')?new Promise(resolve=>{release=()=>resolve(response({user_id:'100',username:'owner'}));}):null);
  const check=f.publisher.check({id:'account'});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.publisher.saveProfile({id:'account',apiToken:''}),/Chờ kiểm tra/);
  release();await check;assert.equal(f.publisher.browsers.profile('account').userId,'100');
  f.store.set('instagram_browser_enabled',true);
  await f.publisher.saveProfile({id:'account',apiMode:'browser'});assert.equal(f.publisher.browsers.profile('account').userId,'');
  f.publisher.browsers.saving.add('account');await assert.rejects(f.publisher.check({id:'account'}),/Chờ lưu/);f.publisher.browsers.saving.clear();
});

test('Token is encrypted only, retained on blank save, clearable and absent from status/check/errors/logs', async t => {
  const logs = []; for (const method of ['log','warn','error']) t.mock.method(console,method,(...args) => logs.push(args));
  const f = await fixture(t);
  assert.notEqual(f.publisher.browsers.profile('account').encryptedApiToken,token);
  assert.equal(JSON.stringify(f.publisher.browsers.rows()).includes(token),false);
  await f.publisher.saveProfile({id:'account',apiToken:''});
  assert.equal(await secret.decrypt(f.publisher.browsers.profile('account').encryptedApiToken),token);
  assert.equal(JSON.stringify(f.publisher.status()).includes('encryptedApiToken'),false);
  f.publisher.browsers.busy.add('account'); assert.equal(JSON.stringify(await f.publisher.check({id:'account'})).includes('encryptedApiToken'),false); f.publisher.browsers.busy.clear();
  f.hook(() => response({error:{code:190,message:token}},401));
  await assert.rejects(f.publisher.check({id:'account'}),error => !error.message.includes(token));
  f.hook(() => {throw Error(token);});
  await assert.rejects(f.publisher.check({id:'account'}),error => !error.message.includes(token));
  assert.equal(JSON.stringify(f.publisher.status()).includes(token),false); assert.deepEqual(logs,[]);
  await f.publisher.saveProfile({id:'account',clearApiToken:true}); assert.equal(f.publisher.status().profiles[0].hasApiToken,false);
  f.publisher.browsers.secret = {encrypt:async () => {throw Error(token);}};
  await assert.rejects(f.publisher.saveProfile({id:'account',apiToken:token}),error => !error.message.includes(token));
});

test('New profile defaults to API and does not lose API credentials on browser config save', async t => {
  const f = await fixture(t);
  await f.publisher.browsers.save({id:'old',data:{name:'Old profile',productId:'product'}},{vpnEnabled:false});
  assert.equal(f.publisher.status().profiles.find(row => row.id === 'old').apiMode,'api');
  f.store.set('instagram_browser_enabled',true);
  await f.publisher.saveProfile({id:'account',apiMode:'browser'});
  assert.equal(f.publisher.status().profiles.find(row => row.id === 'account').hasApiToken,true);
  assert.equal(f.calls.length,0);
});

test('Insights map lifetime views/plays, reach and saved with missing/invalid/ambiguous values as null', () => {
  const row = (name,value) => ({name,period:'lifetime',values:[{value}]});
  const data = mapApiInsights({data:[row('plays',12),row('reach',9),row('saved',0),row('shares',2),row('comments',3),row('likes',4)]});
  assert.equal(data.views,12); assert.equal(data.reach,9); assert.equal(data.viewers,null); assert.equal(data.saves,0);
  assert.equal(data.shares,2); assert.equal(data.comments,3); assert.equal(data.likes,4); assert.equal(data.linkClicks,null);
  assert.equal(mapApiInsights({data:[row('plays',12),row('views',0)]}).views,0);
  for (const value of [null,undefined,'',false,'0',-1,NaN,1.5,1e13]) assert.equal(mapApiInsights({data:[row('views',value)]}).views,null);
  assert.equal(mapApiInsights({data:[row('views',1),row('views',2)]}).views,null);
  assert.equal(mapApiInsights({data:[{...row('views',1),period:'day'}]}).views,null);
  assert.equal(mapApiInsights({data:[{name:'reach',period:'lifetime',total_value:{value:0}}]}).reach,0);
});

test('Metrics adapter persists social_metric shape, reads browser-era permalinks and never opens browser or posts', async t => {
  const f = await fixture(t); f.publisher.stopped = false;
  const result = await f.publisher.metrics.refresh({planId:'plan'});
  assert.equal(result.source,'api'); assert.equal(result.sourceUrl,media().permalink); assert.equal(result.views,0);
  assert.equal(result.likes,null); assert.equal(result.reach,4); assert.equal(result.viewers,null);
  assert.equal(f.measurements.length,1); assert.equal(mutations(f).length,0);
  f.hook(key => key === 'GET /v99.0/300' ? response({...media(),username:'other'}) : null);
  await assert.rejects(f.publisher.metrics.refresh({planId:'plan'}),/không khớp/); assert.equal(f.measurements.length,1);
});

test('Comments paginate by cursor on the fixed origin, never follow next URLs, detect loops and preserve missing username', async () => {
  const urls = [];
  const client = new InstagramApi({enabled:true,version:'v99.0',token,userId:'100',fetch:async (url,init) => {
    urls.push(url); assert.equal(init.method,'GET');
    return response(new URL(url).searchParams.has('after') ? {data:[{id:'2',text:'Second'}]} :
      {data:[{id:'1',text:'First',username:'person'}],paging:{next:'https://untrusted.invalid/?access_token=' + token,cursors:{after:'cursor+two'}}});
  }});
  const comments = []; for await (const row of client.comments('300')) comments.push(row);
  assert.deepEqual(comments.map(row => row.id),['1','2']); assert.equal(comments[1].username,null);
  assert.equal(urls.length,2); assert.ok(urls.every(url => url.startsWith('https://graph.instagram.com/v99.0/300/comments?')));
  assert.equal(new URL(urls[1]).searchParams.get('after'),'cursor+two'); assert.ok(!urls.join('').includes(token));
  const loop = new InstagramApi({enabled:true,version:'v99.0',token,userId:'100',fetch:async () => response({data:[],paging:{next:'ignored',cursors:{after:'same'}}})});
  await assert.rejects(async () => {for await (const row of loop.comments('300')) void row;},/lặp/);
});

test('Pure client defaults off, requires explicit version and never guesses quota zeros', async () => {
  let calls = 0; const fetch = async () => {calls++; return response({data:[{}]});};
  const off = new InstagramApi({fetch,token,userId:'100',version:'v99.0'});
  await assert.rejects(off.identity(),/đang tắt/); assert.equal(calls,0);
  const missingVersion = new InstagramApi({fetch,token,userId:'100',enabled:true});
  await assert.rejects(missingVersion.identity(),/phiên bản/); assert.equal(calls,0);
  const on = new InstagramApi({fetch,token,userId:'100',version:'v99.0',enabled:true});
  assert.deepEqual(await on.publishingLimit(),{quotaUsage:null,quotaTotal:null,quotaDuration:null});
});
