import test from 'node:test';
import assert from 'node:assert/strict';
import {planHookDrafts,hookMatrix,comparisonDrift,latestPostSignals} from '../lib/lab/hook-matrix.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {getRenderPlan} from '../lib/lab/render-plan.ts';
import {emptyProduct} from '../lib/lab/domain.ts';
import {contentPlanSchema} from '../lib/lab/operations.ts';
import {hookFixture} from './fixtures/hook-matrix.mjs';
const fixture=()=>hookFixture({newProduction,applyProduction,getRenderPlan,emptyProduct});
test('T-017: 3 hooks × 3 accounts creates 9 drafts with stable snapshot and distinct T17 UTM',()=>{
 const f=fixture(),before=structuredClone(f.records),drafts=planHookDrafts(f.records,f.input,2000);assert.equal(drafts.length,9);assert.deepEqual(f.records,before);
 assert.equal(new Set(drafts.map(r=>r.data.utmLink)).size,9);for(const r of drafts){assert.equal(r.data.status,'draft');assert.equal(r.data.offerPrice,34);assert.equal(r.data.ctaKeyword,'PAWS');assert.equal(r.data.landingBaseUrl,f.input.landingBaseUrl);assert.equal(r.data.aiLabel,undefined);assert.ok(r.data.variantId&&r.data.assetId);}
 const matrix=hookMatrix([...f.records,...drafts],'matrix_product','matrix_batch');assert.equal(matrix.cells.length,9);assert.ok(matrix.cells.every(c=>c.signals.orders===null&&c.signals.dms===null&&c.drift.length===0));
 assert.deepEqual(planHookDrafts([...f.records,...drafts],{...f.input,batchId:'different_retry'},3000),drafts);
 const changed=structuredClone(drafts[0]);changed.data.ctaKeyword='DOG';assert.deepEqual(comparisonDrift(changed),['CTA']);changed.data.offerPrice=35;assert.deepEqual(comparisonDrift(changed),['CTA','giá']);
});
test('T-017: old records parse; no account/landing/price stays unknown, not guessed',()=>{
 const f=fixture();f.records[0].data.price=null;const drafts=planHookDrafts(f.records,{...f.input,accountIds:[],landingBaseUrl:null});assert.equal(drafts.length,3);for(const r of drafts){assert.equal(r.data.accountId,'');assert.equal(r.data.utmLink,null);assert.equal(r.data.offerPrice,null);}
 assert.equal(contentPlanSchema.parse({name:'Old draft',productId:'matrix_product'}).comparison,undefined);
});
test('T-017: reject stale revision, foreign accounts, missing/unverified/tampered or stale render and bad URLs',()=>{
 for(const change of [f=>f.input.revision++,f=>f.input.accountIds=['foreign'],f=>f.input.accountIds=['account_1','account_1'],f=>f.input.landingBaseUrl='http://example.com',f=>f.records[1].data.exports[0].verified=false,f=>f.records.find(r=>r.id==='render_1').data.sha256='a'.repeat(64),f=>f.records[1].data.renderPlans.at(-1).segments[0].inSec=.2]){const f=fixture();change(f);assert.throws(()=>planHookDrafts(f.records,f.input));}
 const f=fixture(),drafts=planHookDrafts(f.records,f.input);f.records[0].data.price=35;assert.throws(()=>planHookDrafts([...f.records,...drafts],f.input),/Điều kiện/);
});
test('T-017: matrix uses latest observedAt and distinguishes unknown from zero',()=>{
 const f=fixture(),draft=planHookDrafts(f.records,f.input)[0],rows=[{id:'old',kind:'social_metric',updatedAt:999,data:{planId:draft.id,observedAt:'2026-11-11T00:00:00Z',views:10,shares:4}},{id:'new',kind:'social_metric',updatedAt:1,data:{planId:draft.id,observedAt:'2026-11-12T00:00:00Z',views:null,shares:0}}];
 const m=latestPostSignals(rows,draft);assert.equal(m.views,null);assert.equal(m.shares,0);assert.equal(m.keywordComments,null);
});

test('T022 explicit latest unknown does not reuse older keyword or UTM totals',()=>{
 const f=fixture(),plan=planHookDrafts(f.records,f.input)[0];plan.data.utmClicks=77;
 const old={id:'comments',kind:'keyword_comment_measurement',updatedAt:1,data:{planId:plan.id,observedAt:'2026-11-11T00:00:00Z',matched:9}};
 const latest={id:'latest',kind:'social_metric',updatedAt:2,data:{planId:plan.id,observedAt:'2026-11-12T00:00:00Z',keywordComments:null,utmClicks:null}};
 assert.equal(latestPostSignals([old,latest],plan).keywordComments,null);assert.equal(latestPostSignals([old,latest],plan).utmClicks,null);
 latest.data.keywordComments=0;latest.data.utmClicks=0;assert.equal(latestPostSignals([old,latest],plan).keywordComments,0);assert.equal(latestPostSignals([old,latest],plan).utmClicks,0);
});
