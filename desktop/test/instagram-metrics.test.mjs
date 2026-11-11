import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {InstagramMetrics,METRICS_INTERVAL} from '../src/instagram-metrics.mjs';
import {instagramCount,parseInstagramInsights,metricKeys} from '../src/instagram-insights.mjs';

test('Insights parser preserves explicit zero, unknown, rounded numbers and unreported metrics',()=>{
 const result=parseInstagramInsights('0\n0:07\nViews\nViews\n--\nViewers\n--\nInteractions\nInteractions\n--\nReels interactions\n0\nLikes\n0\nComments\n0\nSaves\n0\nShares\n0\nAccounts engaged\n--\nProfile\nProfile activity\n0\nFollows\n0');
 assert.equal(result.metrics.views,null);assert.equal(result.metrics.likes,0);assert.equal(result.metrics.linkClicks,null);
 assert.equal(result.metrics.profileActivity,0);assert.equal(result.reported.length,11);
 assert.deepEqual(instagramCount('1,234'),{value:1234,approximate:false});assert.deepEqual(instagramCount('1.234'),{value:1234,approximate:false});
 assert.deepEqual(instagramCount('1,2K'),{value:1200,approximate:true});assert.equal(instagramCount('0:07'),undefined);
 assert.equal(instagramCount('1.5'),undefined);assert.equal(instagramCount('-1'),undefined);
 assert.equal(parseInstagramInsights('Likes\n12\nLikes\n34').metrics.likes,null);
 const vi=parseInstagramInsights('Lượt xem\n1,2K\nLượt thích\n1.234\nBình luận\n0');assert.equal(vi.metrics.likes,1234);assert.deepEqual(vi.approximate,['views']);
});

function fixture(t){
 const store=new Store(':memory:');t.after(()=>store.close());let now=1000000;let reads=0,closes=0,saves=0,release;
 const profile={id:'a',handle:'owner',userId:'100',session:'signed_in',checkedAt:now};
 const page={setDefaultTimeout(){},close:async()=>{}};
 const contexts=new Map();const context={newPage:async()=>page,close:async()=>{closes++;contexts.delete('a');}};
 const target={planId:'p',accountId:'a',postUrl:'https://www.instagram.com/reel/post/',expectedHandle:'owner'};
 let saved={previous:true};
 const publisher={store,stopped:false,active:null,checks:new Map(),jobs:()=>[],drain(){},browsers:{contexts,background:new Set(),busy:new Set(),opening:new Map(),pageOpening:new Map(),profile:()=>profile,
   context:async()=>{contexts.set('a',context);return context;},visibility:async()=>{}},
   workspace:{metricPlans:async()=>[{id:'p',data:{accountId:'a'}}],metricTarget:async()=>target,saveMetrics:async(_target,data)=>{saves++;saved=data;return data;}}};
 const measurement=()=>({...Object.fromEntries(metricKeys.map(key=>[key,null])),likes:0,source:'instagram_browser',sourceUrl:target.postUrl,handle:'owner',observedAt:new Date(now).toISOString()});
 const reader={read:async()=>{reads++;return measurement();}};
 const metrics=new InstagramMetrics(publisher,{reader,now:()=>now});publisher.metrics=metrics;
 return {store,publisher,metrics,reader,profile,context,target,measurement,get:()=>({now,reads,closes,saves,saved}),advance:ms=>{now+=ms;},hold:()=>{reader.read=async()=>{reads++;await new Promise(r=>{release=r;});return measurement();};},release:()=>release()};
}
test('Automatic first read and interval refresh persist cumulative data, closing only the temporary browser',async t=>{
 const f=fixture(t);await f.metrics.tick();assert.equal(f.get().reads,1);assert.equal(f.get().saved.likes,0);assert.equal(f.get().saved.views,null);assert.equal(f.get().closes,1);
 assert.equal(f.metrics.rows()[0].state,'partial');await f.metrics.tick();assert.equal(f.get().reads,1);
 f.advance(METRICS_INTERVAL);await f.metrics.tick();assert.equal(f.get().reads,2);assert.equal(f.publisher.browsers.busy.size,0);
});
test('Concurrent refreshes share one read, publishing blocks refresh and foreground browsing blocks automatic scans',async t=>{
 const f=fixture(t);f.publisher.active='publishing';assert.throws(()=>f.metrics.refresh({planId:'p'}),/Chờ thao tác/);f.publisher.active=null;
 f.publisher.browsers.contexts.set('a',f.context);await f.metrics.tick();assert.equal(f.get().reads,0);
 f.hold();const one=f.metrics.refresh({planId:'p'});assert.equal(f.metrics.refresh({planId:'p'}),one);
 while(!f.get().reads)await new Promise(r=>setImmediate(r));assert.equal(f.publisher.browsers.busy.has('a'),true);
 f.release();await one;assert.equal(f.get().reads,1);assert.equal(f.get().closes,0);assert.ok(f.publisher.browsers.contexts.has('a'));
});
test('Read failure preserves last measurement, backs off and stops after three failures; explicit refresh recovers',async t=>{
 const f=fixture(t);await f.metrics.tick();const old=f.get().saved;
 f.reader.read=async()=>{throw Error('Offline');};
 for(let i=0;i<3;i++)await assert.rejects(f.metrics.refresh({planId:'p'}),/Offline/);
 assert.equal(f.get().saved,old);assert.equal(f.metrics.rows()[0].failures,3);assert.equal(f.metrics.rows()[0].nextAttemptAt,null);
 f.advance(METRICS_INTERVAL*10);await f.metrics.tick();assert.equal(f.metrics.rows()[0].failures,3);
 f.reader.read=async()=>f.measurement();await f.metrics.refresh({planId:'p'});assert.equal(f.metrics.rows()[0].failures,0);assert.equal(f.metrics.rows()[0].state,'partial');
});
test('Missing login waits for a newly verified session, and restarted in-flight readings are recoverable',async t=>{
 const f=fixture(t);f.reader.read=async()=>{throw Object.assign(Error('Login needed'),{code:'login_required'});};
 await f.metrics.tick();assert.equal(f.metrics.rows()[0].state,'login_required');assert.equal(f.get().saves,0);
 f.advance(METRICS_INTERVAL);await f.metrics.tick();assert.equal(f.metrics.rows()[0].failures,1);
 f.profile.checkedAt=f.get().now;f.reader.read=async()=>f.measurement();f.advance(60000);await f.metrics.tick();assert.equal(f.get().saves,1);
 f.metrics.update('p',{state:'running'});const restarted=new InstagramMetrics(f.publisher,{now:()=>f.get().now});
 assert.equal(restarted.rows()[0].state,'error');assert.ok(restarted.rows()[0].nextAttemptAt>f.get().now);
});
test('A changed account/post or shutdown never saves a read or starts a new public post',async t=>{
 const f=fixture(t);f.publisher.jobs=()=>[{state:'published',snapshot:{planId:'p',accountId:'other'},postUrl:f.target.postUrl}];
 await assert.rejects(f.metrics.refresh({planId:'p'}),/không khớp/);assert.equal(f.get().reads,0);assert.equal(f.get().saves,0);
 f.publisher.jobs=()=>[];f.hold();const pending=f.metrics.refresh({planId:'p'});
 while(!f.get().reads)await new Promise(r=>setImmediate(r));f.publisher.stopped=true;f.release();
 await assert.rejects(pending,/đang đóng/);assert.equal(f.get().saves,0);assert.equal(f.publisher.browsers.busy.size,0);
});
