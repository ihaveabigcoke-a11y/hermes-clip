import test from 'node:test';import assert from 'node:assert/strict';
import * as production from '../lib/lab/production.ts';import {emptyProduct} from '../lib/lab/domain.ts';import {getRenderPlan} from '../lib/lab/render-plan.ts';import {planHookDrafts} from '../lib/lab/hook-matrix.ts';
import {productJourneyStep} from '../lib/lab/product-next-step.ts';import {journeyFixture} from './fixtures/product-journey.mjs';
const domain={...production,emptyProduct,getRenderPlan,planHookDrafts};
for(let step=1;step<=10;step++)test('T020 journey step '+step+' has one product-scoped destination',()=>{
 const f=journeyFixture(domain,step),before=structuredClone(f.records),next=productJourneyStep(f.product,f.records,f.manual),url=new URL(next.href,'https://local.invalid');
 assert.equal(next.step,step);assert.equal(url.searchParams.get('product'),f.product.id);assert.deepEqual(f.records,before);
 if(step>=3&&step<=7)assert.equal(url.searchParams.get('production'),f.project.id);
});
test('T020 stale/unverified render and wrong product drafts cannot advance',()=>{
 for(const mutate of [f=>f.project.data.exports.forEach(e=>e.verified=false),f=>f.project.data.exports.forEach(e=>e.sha256='f'.repeat(64)),f=>f.project.data.exports.forEach(e=>e.renderPlan.segments[0].outSec=1)]){const f=journeyFixture(domain,7);mutate(f);assert.equal(productJourneyStep(f.product,f.records,f.manual).step,6);}
 const f=journeyFixture(domain,8);f.plans.forEach(r=>r.data.productId='other');assert.equal(productJourneyStep(f.product,f.records,f.manual).step,7);
 const a=journeyFixture(domain,8);a.plans[0].data.ctaKeyword='OTHER';assert.equal(productJourneyStep(a.product,a.records,a.manual).step,7);
 const b=journeyFixture(domain,10);b.metrics.forEach(r=>r.data.views=null);assert.equal(productJourneyStep(b.product,b.records,b.manual).step,9);
});
test('T020 no rank, old manual pack, changed revision and unrelated evidence stay incomplete',()=>{
 const f=journeyFixture(domain,10);f.records=f.records.filter(r=>r.kind!=='product_selection');assert.equal(productJourneyStep(f.product,f.records,f.manual).step,1);
 const g=journeyFixture(domain,4);g.manual.scenes.forEach(s=>s.state='Chờ xuất prompt');assert.equal(productJourneyStep(g.product,g.records,g.manual).step,3);
 const h=journeyFixture(domain,10);h.product.revision++;assert.equal(productJourneyStep(h.product,h.records,h.manual).step,3);
});
test('T020 current Muse jobs await clips; old scene attempts and jobs do not count',()=>{
 const f=journeyFixture(domain,3),jobs=f.project.data.scenes.map(s=>({state:'waiting',request:{projectId:f.project.id,sceneId:s.id,sceneRevision:s.revision}}));
 assert.equal(productJourneyStep(f.product,f.records,f.manual,jobs).step,4);
 f.project.data.scenes.forEach(s=>{s.attempts.push({id:'attempt_'+s.id,requestId:'request_'+s.id,sceneRevision:s.revision,status:'unknown',snapshot:'',providerJobId:'',usageUsd:null,createdAt:1});s.revision++;});
 assert.equal(productJourneyStep(f.product,f.records,f.manual,jobs).step,3);
});
