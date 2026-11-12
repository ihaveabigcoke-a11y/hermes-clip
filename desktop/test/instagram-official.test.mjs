import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {InstagramPublisher} from '../src/instagram.mjs';
import {InstagramApi} from '../src/instagram-api.mjs';
import {InstagramComments,matchCta,followAllowsLink,COMMENTS_INTERVAL} from '../src/instagram-comments.mjs';
import {bootInstagram,INSTAGRAM_BROWSER_WARNING} from '../src/instagram-policy.mjs';
import {browserEnabled} from '../src/instagram-policy.mjs';
import {instagramUtmClicks,instagramProductSummary} from '../../lib/lab/instagram-summary.ts';

const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const token='T004-SYNTHETIC-TOKEN-NOT-A-CREDENTIAL';
function secretFixture(){
  const key=randomBytes(32);
  return {encrypt:async text=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');},
    decrypt:async text=>{const bytes=Buffer.from(text,'base64'),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString();}};
}
async function fixture(t,{store=new Store(':memory:')}={}){
  t.after(()=>store.close());const calls=[];let mode='ok',now=Date.now();
  const records=[{id:'product',kind:'product',revision:1,data:{name:'Fixture Strap'}},
    {id:'account',kind:'social_account',revision:1,data:{name:'Fixture',handle:'owner',productId:'product'}},
    {id:'plan',kind:'content_plan',revision:1,data:{name:'Hook A',productId:'product',accountId:'account',status:'published_browser',postUrl:'https://www.instagram.com/reel/fixture/',landingBaseUrl:'https://example.com/strap',utmHookId:'hookA'}}];
  const fetch=async(url,init)=>{
    const path=new URL(url).pathname;calls.push({path,method:init.method});
    assert.equal(new URL(url).hostname,'graph.instagram.com');assert.equal(init.headers.Authorization,'Bearer '+token);
    if(path.endsWith('/me'))return response({user_id:'100',username:'owner',account_type:'BUSINESS'});
    if(path.endsWith('/comments'))return response({data:[{id:'501',text:'Lnik please',username:'customer',timestamp:new Date(now-1000).toISOString()}]});
    if(path.endsWith('/messages')){
      const body=JSON.parse(init.body);assert.equal(body.recipient.comment_id.length>0,true);assert.match(body.message.text,/utm_content=owner-hooka/);
      if(mode==='uncertain')throw Error(token);
      if(mode==='expired')return response({error:{code:190,message:token}},401);
      if(mode==='rate')return response({error:{code:4,message:token}},429);
      return response({message_id:'mid.fixture',recipient_id:'999'});
    }
    throw Error('Unexpected fixture endpoint');
  };
  const workspace={records:async()=>records,account:async()=>records[1],metricPlans:async()=>[]};
  const publisher=new InstagramPublisher({store,root:tmpdir(),browser:{launchPersistentContext:async()=>{throw Error('Must not open browser');}},secret:secretFixture(),workspace,apiOptions:{fetch}});
  await publisher.saveProfile({id:'account',apiAppId:'123',apiUserId:'100',apiToken:token});
  store.set('instagram_jobs',[{id:'published',state:'published',snapshot:{planId:'plan',accountId:'account',productId:'product',apiMode:'api'},postUrl:records[2].data.postUrl,apiReceipt:{mediaId:'300'}}]);
  publisher.comments=new InstagramComments(publisher,{now:()=>now});
  const payload={planId:'plan',keyword:'LINK',template:'Your link: {link}',requireFollow:false,enabled:true,approved:true};
  return {publisher,store,records,calls,payload,setMode:value=>{mode=value;},advance:ms=>{now+=ms;},now:()=>now};
}
test('T-004: main boot defaults to zero browser opens, old jobs/profiles/metrics stay intact; manual enable requires exact warning',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());let opens=0,shares=0,reads=0;
  const profile={id:'old',apiMode:'browser',proxy:{server:'',username:''},handle:'owner',userId:'100',vpnEnabled:false};
  store.set('instagram_profiles',[profile]);store.set('instagram_metrics',[{planId:'plan',state:'ready',nextAttemptAt:0}]);
  const job={id:'job',state:'queued',history:[],snapshot:{planId:'plan',accountId:'old',path:'fixture',sha256:'sum'},handle:'owner',userId:'100'};
  store.set('instagram_jobs',[job]);
  const p=new InstagramPublisher({store,root:tmpdir(),secret:{},browser:{launchPersistentContext:async()=>{opens++;}},validate:async()=>({sha256:'sum'}),
    workspace:{metricPlans:async()=>[{id:'plan',data:{accountId:'old'}}],account:async()=>({id:'old',data:{}}),revalidate:async x=>x,syncPublished:async()=>{}},
    adapter:{session:async()=>({session:'signed_in',handle:'owner',userId:'100'}),prepare:async()=>({}),publish:async(_page,_job,before)=>{await before();shares++;return {postUrl:'https://www.instagram.com/reel/fixture/',handle:'owner'};}}});
  p.metrics.reader={read:async()=>{reads++;}};
  bootInstagram(p);await p.pulse();
  assert.equal(opens,0);assert.equal(reads,0);assert.equal(shares,0);assert.equal(p.job('job').state,'queued');assert.deepEqual(p.browsers.rows(),[profile]);
  assert.equal(p.metrics.rows()[0].state,'ready');
  await assert.rejects(p.browsers.context('old'),/đang tắt/);await assert.rejects(p.open({id:'old'}),/đang tắt/);
  await assert.rejects(p.configureBrowser({enabled:true}),/xác nhận/);
  await assert.rejects(p.configureBrowser({enabled:true,confirmation:'yes'}),/xác nhận/);
  store.set('instagram_browser_enabled',true);bootInstagram(p);await p.pulse();
  assert.equal(opens,0);assert.equal(reads,0);assert.equal(p.job('job').state,'queued');assert.equal(p.status().browserRunning,false);
  p.browsers.page=async()=>{opens++;return {isClosed:()=>true};};p.browsers.visibility=async()=>{};
  await p.configureBrowser({enabled:true,confirmation:INSTAGRAM_BROWSER_WARNING});while(p.running)await p.running;
  assert.equal(opens,1);assert.equal(shares,1);assert.equal(p.job('job').state,'published');
  await p.configureBrowser({enabled:false});await p.pulse();assert.equal(opens,1);
  assert.equal(store.get('instagram_browser_enabled'),false);await p.shutdown();
  const main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8');assert.match(main,/bootInstagram\(instagram\)/);assert.doesNotMatch(main,/instagram\?\.start\(\)/);
});
test('T-004: browser switch survives SQLite restart and missing/null values fail closed',async t=>{
  const root=await mkdtemp(join(tmpdir(),'T004-boot-'));t.after(()=>rm(root,{recursive:true,force:true}));const path=join(root,'fixture.sqlite');
  let store=new Store(path);store.set('instagram_browser_enabled',false);store.close();store=new Store(path);
  try{assert.equal(store.get('instagram_browser_enabled'),false);assert.equal(browserEnabled(store),false);
    for(const value of [null,undefined,'true',1]){store.set('instagram_browser_enabled',value??null);assert.equal(browserEnabled(store),false);}
    store.set('instagram_browser_enabled',true);assert.equal(browserEnabled(store),true);
  }finally{store.close();}
});
test('T-004: API poll + private reply idempotent across duplicate deliveries, concurrent calls and restart',async t=>{
  const f=await fixture(t);await f.publisher.comments.saveRule(f.payload);
  await f.publisher.comments.tick();await f.publisher.comments.tick();f.advance(COMMENTS_INTERVAL);await f.publisher.comments.tick();
  assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
  const row=f.publisher.comments.rows()[0];assert.equal(row.state,'sent');assert.equal(row.commentId,'501');assert.equal(row.text,undefined);
  assert.deepEqual(f.publisher.comments.totals(),[{productId:'product',ctaComments:1,dmSent:1}]);
  f.publisher.comments=new InstagramComments(f.publisher,{now:f.now});await f.publisher.comments.tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
  f.advance(11000);const rule=f.publisher.comments.rules()[0],client=await f.publisher.apiAdapter.client(f.publisher.browsers.profile('account'));
  await Promise.all([1,2].map(()=>f.publisher.comments.process(rule,{id:'502',text:'LINK',timestamp:new Date(f.now()).toISOString()},client)));
  assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,2);
});
test('T-004: unknown follow never sends link, known false blocked; exact and typo CTA boundaries',async t=>{
  assert.equal(followAllowsLink(true,null),false);assert.equal(followAllowsLink(true,undefined),false);assert.equal(followAllowsLink(true,false),false);assert.equal(followAllowsLink(true,true),true);
  for(const word of ['link','LINK!','lnik','links','nice links please'])assert.equal(matchCta(word,'LINK'),true,word);
  // Boss phụ: short CTAs no longer accept substitutions/insertions/deletions; each of these is a real
  // word a customer may write, and a false match sends an unsolicited DM.
  for(const [word,keyword] of [['pink','LINK'],['line','LINK'],['ink','LINK'],['lint','LINK'],['lik','LINK'],['liink','LINK'],['lunk','LINK'],
    ['stop','SHOP'],['show','SHOP'],['ship','SHOP'],['went','WANT'],['so pink and nice','LINK']])assert.equal(matchCta(word,keyword),false,word+'/'+keyword);
  for(const word of ['discount','discont','discuont','dicsount','discounnt','discounts'])assert.equal(matchCta(word,'DISCOUNT'),true,word);
  for(const word of ['account','discover'])assert.equal(matchCta(word,'DISCOUNT'),false,word);
  for(const word of ['blink','unlinked','random','ledu'])assert.equal(matchCta(word,'LED'),false,word);
  const f=await fixture(t);await f.publisher.comments.saveRule({...f.payload,requireFollow:true});await f.publisher.comments.tick();
  assert.equal(f.calls.some(c=>c.path.endsWith('/messages')),false);assert.equal(f.publisher.comments.rows()[0].state,'follow_unknown');
});
test('T-002c r2: saving a rule reconsiders follow_unknown once; follow defaults true and no duplicate DM after resend/restart',async t=>{
  const f=await fixture(t),comments=f.publisher.comments;
  const {requireFollow,...defaultPayload}=f.payload;
  await comments.saveRule(defaultPayload);assert.equal(comments.rules()[0].requireFollow,true);
  await comments.tick();const before=structuredClone(comments.rows()[0]);assert.equal(before.state,'follow_unknown');
  assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,0);
  f.advance(COMMENTS_INTERVAL);await comments.tick();assert.deepEqual(comments.rows()[0],before,'poll alone must not re-evaluate');
  const oldRule=comments.rules()[0];await comments.saveRule(f.payload);
  assert.equal(comments.rules()[0].revision,oldRule.revision+1);assert.deepEqual(comments.rows()[0],before,'save preserves receipt until the next poll');
  await comments.tick();assert.equal(comments.rows()[0].state,'sent');
  assert.equal(comments.rows()[0].commentAt,before.commentAt);assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
  await comments.saveRule(f.payload);await comments.tick();f.advance(COMMENTS_INTERVAL);await comments.tick();
  f.publisher.comments=new InstagramComments(f.publisher,{now:f.now});await f.publisher.comments.tick();
  assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
});
test('T-002c r2: saved rule still requiring follow or a different CTA cannot send an old comment',async t=>{
  const f=await fixture(t),comments=f.publisher.comments;
  await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();
  const first=comments.rows()[0],oldRule=comments.rules()[0];
  await comments.saveRule({...f.payload,requireFollow:true,template:'Updated copy {link}'});
  assert.equal(comments.rules()[0].approvedAt,oldRule.approvedAt,'fixture saves in the same millisecond');
  assert.equal(comments.allowed(oldRule),false,'revision invalidates an in-flight older rule even at the same timestamp');
  await comments.tick();assert.equal(comments.rows()[0].state,'follow_unknown');
  assert.equal(comments.rows()[0].ruleRevision,first.ruleRevision+1);
  await comments.saveRule({...f.payload,keyword:'SHOP'});const before=structuredClone(comments.rows());await comments.tick();
  assert.deepEqual(comments.rows(),before);assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,0);
});
test('T-002c r2: original comment age cannot be reset by saving the rule or a fresh API timestamp',async t=>{
  for(const age of [7*86400000-1,7*86400000,8*86400000])await t.test(String(age),async t=>{
    const f=await fixture(t),comments=f.publisher.comments;
    await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();const original=comments.rows()[0].commentAt;
    f.advance(age-1000);await comments.saveRule(f.payload);await comments.tick();
    assert.equal(comments.rows()[0].state,age<7*86400000?'sent':'expired');assert.equal(comments.rows()[0].commentAt,original);
    assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,age<7*86400000?1:0);
  });
});
test('T-002c r2: saving another rule never changes a follow_unknown receipt from the first rule',async t=>{
  const f=await fixture(t),comments=f.publisher.comments;
  await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();const before=structuredClone(comments.rows());
  f.records.push({...f.records[2],id:'other_plan'});
  f.store.set('instagram_jobs',[...f.publisher.jobs(),{id:'other_post',state:'published',snapshot:{planId:'other_plan',accountId:'account',productId:'product'},postUrl:f.records[2].data.postUrl,apiReceipt:{mediaId:'301'}}]);
  await comments.saveRule({...f.payload,planId:'other_plan'});await comments.tick();
  assert.deepEqual(comments.rows(),before);assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,0);
});
test('T-002c r2: saved rule cannot reconsider sending/sent/uncertain/error receipts or suspicious follow_unknown attempts',async t=>{
  for(const patch of [{state:'sending'},{state:'sent',messageId:'existing'},{state:'needs_attention'},
    {state:'error'},{state:'follow_unknown',attemptedAt:1},{state:'follow_unknown',messageId:'existing'}])await t.test(JSON.stringify(patch),async t=>{
    const f=await fixture(t),comments=f.publisher.comments;
    await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();
    comments.update('501',patch);const before=structuredClone(comments.rows());
    await comments.saveRule(f.payload);await comments.tick();
    assert.deepEqual(comments.rows(),before);assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,0);
  });
});
test('T-002c r2: reconsideration keeps emergency stop, rate limits and synchronous duplicate claim',async t=>{
  const f=await fixture(t),comments=f.publisher.comments;
  await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();
  await comments.saveRule(f.payload);comments.emergencyStop();
  const before=structuredClone(comments.rows());await comments.tick();assert.deepEqual(comments.rows(),before);
  assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,0);
  await comments.saveRule(f.payload);
  f.store.set('instagram_dm_backoff',{account:f.now()+60000});
  const comment={id:'501',text:'LINK',timestamp:new Date(f.now()-1000).toISOString()};
  let sends=0;const release=Promise.withResolvers(),client={privateReply:async()=>{sends++;await release.promise;return {messageId:'mid.once'};}};
  await comments.process(comments.rules()[0],comment,client);assert.equal(comments.rows()[0].state,'rate_wait');assert.equal(sends,0);
  f.advance(60001);
  const pending=comments.process(comments.rules()[0],comment,client);
  assert.equal(comments.rows()[0].state,'sending');assert.equal(sends,1);
  await comments.process(comments.rules()[0],comment,client);assert.equal(sends,1);
  release.resolve();await pending;assert.equal(comments.rows()[0].state,'sent');
  await comments.process(comments.rules()[0],comment,client);assert.equal(sends,1);
});
test('T-002c r2: legacy follow_unknown receipt is eligible only after explicit rule save',async t=>{
  const f=await fixture(t),comments=f.publisher.comments;
  await comments.saveRule({...f.payload,requireFollow:true});await comments.tick();
  f.store.set('instagram_dm_rules',comments.rules().map(({revision,...row})=>row));
  f.store.set('instagram_comment_replies',comments.rows().map(({ruleRevision,...row})=>row));
  const before=structuredClone(comments.rows());f.advance(COMMENTS_INTERVAL);await comments.tick();assert.deepEqual(comments.rows(),before);
  await comments.saveRule(f.payload);await comments.tick();
  assert.equal(comments.rows()[0].state,'sent');assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
});
test('T-004: uncertain response and restarted sending receipt are never retried; token errors and rate limits sanitized',async t=>{
  for(const mode of ['uncertain','expired','rate'])await t.test(mode,async t=>{
    const f=await fixture(t);f.setMode(mode);await f.publisher.comments.saveRule(f.payload);await f.publisher.comments.tick();
    assert.equal(f.publisher.comments.rows()[0].state,mode==='uncertain'?'needs_attention':'error');
    assert.equal(JSON.stringify(f.publisher.status()).includes(token),false);
    f.advance(COMMENTS_INTERVAL);await f.publisher.comments.tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/messages')).length,1);
    if(mode==='rate')assert.ok(f.store.get('instagram_dm_backoff').account>f.now());
  });
  const f=await fixture(t);await f.publisher.comments.saveRule(f.payload);
  f.publisher.comments.update('501',{state:'sending',productId:'product'});f.publisher.comments=new InstagramComments(f.publisher,{now:f.now});
  await f.publisher.comments.tick();assert.equal(f.calls.some(c=>c.path.endsWith('/messages')),false);assert.equal(f.publisher.comments.rows()[0].state,'needs_attention');
});
test('T-004: emergency stop, scope drift, unapproved rules, old comments, and per-account limits block sends',async t=>{
  const f=await fixture(t);await assert.rejects(f.publisher.comments.saveRule({...f.payload,approved:false}),/Duyệt/);
  await f.publisher.comments.saveRule(f.payload);f.publisher.comments.emergencyStop();await f.publisher.comments.tick();assert.equal(f.calls.length,0);
  await f.publisher.comments.saveRule(f.payload);f.records[2].revision++;await f.publisher.comments.tick();assert.equal(f.calls.length,0);assert.ok(f.publisher.comments.status().polls[0].error);
  f.records[2].revision--;await f.publisher.comments.saveRule(f.payload);
  const rule=f.publisher.comments.rules()[0];let sent=0;const client={privateReply:async()=>{sent++;return {messageId:'mid'};}};
  await f.publisher.comments.process(rule,{id:'1',text:'LINK',timestamp:'2000-01-01T00:00:00Z'},client);assert.equal(sent,0);
  for(let id=2;id<24;id++){await f.publisher.comments.process(rule,{id:String(id),text:'LINK',timestamp:new Date(f.now()).toISOString()},client);f.advance(11000);}
  assert.equal(sent,20);assert.equal(f.publisher.comments.rows().at(-1).state,'rate_wait');
  f.publisher.workspace.records=async()=>{throw Error('No network/workspace needed to disable');};
  await f.publisher.comments.saveRule({...f.payload,enabled:false,approved:false});assert.equal(f.publisher.comments.rules()[0].enabled,false);
});
test('T-004: fixture token absent from SQLite file/WAL, public status and captured logs on success and failures',async t=>{
  const root=await mkdtemp(join(tmpdir(),'T004-secrets-'));const path=join(root,'fixture.sqlite');
  const logs=[];
  for(const method of ['log','warn','error'])t.mock.method(console,method,(...args)=>logs.push(args));
  const f=await fixture(t,{store:new Store(path)});t.after(()=>rm(root,{recursive:true,force:true}));await f.publisher.comments.saveRule(f.payload);f.setMode('expired');await f.publisher.comments.tick();
  assert.equal(JSON.stringify(f.store.db.prepare('SELECT * FROM kv').all()).includes(token),false);
  f.store.db.exec('PRAGMA wal_checkpoint(FULL)');
  for(const file of [path,path+'-wal']){const bytes=await readFile(file).catch(()=>Buffer.alloc(0));assert.equal(bytes.includes(Buffer.from(token)),false);}
  assert.equal(JSON.stringify(logs).includes(token),false);assert.equal(JSON.stringify(f.publisher.status()).includes(token),false);
});
test('T-004: private reply endpoint fixture checks JSON and token/rate errors, GET me account type',async()=>{
  const calls=[];const client=new InstagramApi({enabled:true,version:'v25.0',token,userId:'100',fetch:async(url,init)=>{calls.push({url,init});return response({message_id:'mid.123'});}});
  await client.privateReply('501','Here is the requested link https://example.com');
  assert.equal(calls[0].url,'https://graph.instagram.com/v25.0/100/messages');assert.equal(calls[0].init.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body).recipient,{comment_id:'501'});
  for(const [status,code,expected]of [[401,190,'login_required'],[429,4,'rate_limit'],[403,10,'permission']]){
    const api=new InstagramApi({enabled:true,version:'v25.0',token,userId:'100',fetch:async()=>response({error:{code,message:token}},status)});
    await assert.rejects(api.identity(),error=>error.code===expected&&!error.message.includes(token));
  }
});
test('T-004: product totals dedupe posts across three accounts; UTM latest by URL and same period, unknown stays null',()=>{
  const records=[];
  for(let i=0;i<3;i++){
    records.push({id:'a'+i,kind:'social_account',data:{productId:'p'}});
    records.push({id:'plan'+i,kind:'content_plan',updatedAt:1,data:{productId:'p',accountId:'a'+i,status:'published_manual',postUrl:`https://www.instagram.com/reel/post${i}/`,utmLink:`https://example.com/?utm_source=instagram&utm_medium=dm&utm_content=a${i}`,utmClicks:2,utmClicksSource:'fixture analytics',utmClicksPeriod:'2026-11',utmClicksObservedAt:'2026-11-12T00:00:00Z'}});
    records.push({id:'m'+i,kind:'social_metric',updatedAt:1,data:{planId:'plan'+i,accountId:'a'+i,sourceUrl:`https://www.instagram.com/reel/post${i}/`,shares:2,observedAt:'2026-11-12T00:00:00Z'}});
  }
  records.push({...records[1],id:'alias'});
  assert.equal(instagramProductSummary(records,'p').totals.shares.value,6);assert.equal(instagramUtmClicks(records,'p').value,6);
  records[4].data.utmClicks=null;assert.equal(instagramUtmClicks(records,'p').value,null);
  records[4].data.utmClicks=2;records[4].data.utmClicksPeriod='different';assert.equal(instagramUtmClicks(records,'p').value,null);
});
