import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProduct} from '../lib/lab/domain.ts';
import * as production from '../lib/lab/production.ts';
import {getRenderPlan} from '../lib/lab/render-plan.ts';
import {planHookDrafts} from '../lib/lab/hook-matrix.ts';
import {todayFixture} from './fixtures/t024.mjs';
import {productFunnel,productVisualRows,sortProductRows,dailyViews,productHookRows} from '../lib/lab/visual-dashboard.ts';
import {buildOfficeView} from '../lib/lab/office-view.ts';
import {serviceSignals,signalTimeline} from '../lib/lab/signals.ts';
const now=Date.parse('2026-11-13T05:00:00Z');
const fixture=()=>todayFixture({...production,emptyProduct,getRenderPlan,planHookDrafts},now);
test('T-024b funnel counts products once using selected/content/clip/verified MP4/draft/published evidence',()=>{
 const f=fixture();assert.deepEqual(productFunnel(f.records).map(r=>r.value),[2,1,1,1,1,1]);
 const bad=structuredClone(f.records);bad.filter(r=>r.kind==='asset').forEach(r=>r.data.metadata.verifiedBy='url');
 assert.equal(productFunnel(bad)[3].value,0);assert.deepEqual(productFunnel([]).map(r=>r.value),Array(6).fill(null));
});
test('T-024b product table numeric/name/stage sorting preserves null last and currency mismatch',()=>{
 const f=fixture();f.first.data.cost=4;f.first.data.shipping=2;f.first.data.price=18;f.second.data.cost=10;f.second.data.shipping=3;f.second.data.price=40;
 const rows=productVisualRows(f.records);for(const key of ['name','step','price','clips']){const sorted=sortProductRows(rows,key);assert.equal(sorted.length,3);assert.notEqual(sorted,rows);}
 assert.deepEqual(sortProductRows(rows,'price').map(r=>r.price),[18,34,40]);
 assert.deepEqual(sortProductRows(rows,'step',true).map(r=>r.next.step),[8,2,1]);
 f.second.data.shippingCurrency='CNY';const mixed=productVisualRows(f.records).find(r=>r.product.id===f.second.id);assert.equal(mixed.landed,null);assert.equal(mixed.markup,null);
 const empty=productVisualRows([{...f.first,data:{...emptyProduct,name:'Trống'}}])[0];assert.equal(empty.views,null);assert.equal(empty.price,null);
 const archived={...f.first,data:{...f.first.data,archived:true}};assert.equal(productVisualRows([archived]).length,0);assert.equal(productVisualRows([archived],null,[],true).length,1);
});
test('T-024b daily cumulative observations retain missing days, latest null and genuine zero; exclude future/wrong source',()=>{
 const f=fixture(),m=f.measurements[0],old=structuredClone(m);old.id='old';old.data.observedAt='2026-11-12T05:00:00Z';old.data.views=0;
 let points=dailyViews([...f.records,old],now);assert.equal(points.length,14);assert.equal(points.at(-1).value,2000);assert.equal(points.at(-2).value,0);assert.equal(points.at(-3).value,null);
 const newest=structuredClone(m);newest.id='null_new';newest.data.observedAt='2026-11-13T04:59:00Z';newest.data.views=null;points=dailyViews([...f.records,old,newest],now);assert.equal(points.at(-1).value,null);
 newest.data.observedAt='2026-11-14T04:59:00Z';assert.equal(dailyViews([...f.records,newest],now).at(-1).value,2000);
 newest.data.observedAt='2026-11-13T04:59:00Z';newest.data.sourceUrl='https://www.instagram.com/reel/wrong/';assert.equal(dailyViews([...f.records,newest],now).at(-1).value,2000);
 assert.ok(dailyViews([],now).every(p=>p.value===null));
});
test('T-024b three hooks: no leader without threshold, complete comparable measurements, and unique lead',()=>{
 const f=fixture();assert.equal(productHookRows(f.records,null)[0].leading,null);assert.equal(productHookRows(f.records,0)[0].leading,null);
 const plans=f.records.filter(r=>r.kind==='content_plan'),third=plans[2];third.data.status='published_manual';third.data.postUrl='https://www.instagram.com/reel/third/';
 f.records.push({id:'third_metric',kind:'social_metric',revision:1,updatedAt:now,data:{...f.measurements[0].data,planId:third.id,sourceUrl:third.data.postUrl,views:100,keywordComments:5}});
 assert.equal(productHookRows(f.records,2)[0].leading,third.data.variantId);assert.equal(productHookRows(f.records,null)[0].leading,null);
 third.data.ctaKeyword='OTHER';assert.equal(productHookRows(f.records,2)[0].leading,null);
});
test('T-024b service state colors require observed checks, not configuration/cookies',()=>{
 const view=buildOfficeView([]),base={worker:{musePaused:false,active:1,profiles:[]},manual:{inbox:'fixture',errors:[],unmatched:[]},render:{config:{},health:{checkedAt:now,montage:{ready:true}}},instagram:{api:{enabled:true},profiles:[{apiMode:'api',hasApiToken:true,health:'ready',session:'signed_in',checkedAt:now}]}};
 assert.deepEqual(serviceSignals(base,view).map(s=>s.tone),Array(4).fill('active'));
 assert.deepEqual(serviceSignals({worker:{musePaused:true},manual:{inbox:'fixture',unmatched:[{}]},render:{config:{}},instagram:{api:{enabled:true},profiles:[{apiMode:'api',hasApiToken:true}]}},view).map(s=>s.tone),Array(4).fill('waiting'));
 assert.deepEqual(serviceSignals({errors:{muse:true,manual:true,render:true,instagram:true}},view).map(s=>s.tone),Array(4).fill('error'));
 assert.deepEqual(serviceSignals({},view).map(s=>s.tone),Array(4).fill('unconfigured'));
 assert.equal(serviceSignals({instagram:{api:{enabled:true},profiles:[{apiMode:'api',hasApiToken:true,session:'signed_in'}]}},view)[3].tone,'waiting');
});
test('T-024b timeline separates refusal from technical error and caps at latest 50',()=>{
 const jobs=Array.from({length:60},(_,i)=>({id:'j'+i,provider:'muse',state:'failed',errorKind:i===59?'refused':undefined,updatedAt:now+i,createdAt:now+i,request:{},history:[{state:'failed',at:now+i}]}));
 const events=signalTimeline(buildOfficeView([],jobs,{},[],now));assert.equal(events.length,50);assert.equal(events[0].type,'refused');assert.equal(events[1].type,'error');assert.doesNotMatch(events[0].text,/kỹ thuật/);assert.equal(events.at(-1).at,now+10);
});
