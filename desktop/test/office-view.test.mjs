import test from 'node:test';
import assert from 'node:assert/strict';
import {importModule} from './helpers/local-server.mjs';
import {officeFixture} from '../../tests/fixtures/office-view.mjs';
const {buildOfficeView,groupOf}=await importModule('lib/lab/office-view.ts');
const {emptyProduct,schemas}=await importModule('lib/lab/domain.ts');
const {newProduction}=await importModule('lib/lab/production.ts');
const fixture=()=>officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction});

test('T022 Office keeps imported metric values and verified render provenance without transient jobs',async()=>{
 const {hookFixture}=await import('../../tests/fixtures/hook-matrix.mjs');
 const production=await importModule('lib/lab/production.ts'),{getRenderPlan}=await importModule('lib/lab/render-plan.ts');
 const f=hookFixture({...production,emptyProduct,getRenderPlan});
 f.records.push({id:'measurement',kind:'social_metric',revision:1,updatedAt:1,data:{planId:'post',observedAt:'2026-11-13T00:00:00Z',source:'manual',keywordComments:0,dms:3,shares:null,utmClicks:5,orders:null}});
 let v=buildOfficeView(f.records,[],{},[]);assert.equal(v.exports.filter(e=>e.verified).length,3);
 assert.deepEqual([v.measurements[0].keywordComments,v.measurements[0].dms,v.measurements[0].shares,v.measurements[0].utmClicks,v.measurements[0].orders],[0,3,null,5,null]);
 f.records[1].data.exports[0].sha256='f'.repeat(64);v=buildOfficeView(f.records,[],{},[]);assert.equal(v.exports.filter(e=>e.verified).length,2);
 f.records.find(r=>r.id==='render_1').data.metadata.duration=90;assert.equal(buildOfficeView(f.records,[],{},[]).exports.filter(e=>e.verified).length,1);
});
test('T-010: today three, yesterday one active, separate selection totals, pure projection',()=>{
 const f=fixture(),before=structuredClone(f),view=buildOfficeView(f.records,f.jobs,f.manual,f.integrations,f.now);
 assert.equal(view.selection.days.find(d=>d.day===view.today).productIds.length,3);assert.equal(view.products.filter(p=>p.active).length,4);
 assert.deepEqual(view.selection.totals,{selectionsAllDays:4,distinctProducts:4});assert.deepEqual(view.products.slice(0,3).map(p=>p.priorityRank),[1,2,3]);
 assert.equal(view.products[3].lastSelectedDay,'2026-11-12');assert.deepEqual(f,before);
 assert.equal(view.runs.find(r=>r.id==='job:run_4').provider,null);assert.equal(view.runs.find(r=>r.id==='job:run_4').group,'unmapped');
 assert.equal(view.exports.length,0);assert.equal(view.posts.length,0);
});
test('T-010: all ten groups, original states, ready without asset never counts as library',()=>{
 const cases={queued:'queued',preflight:'sending',preparing:'sending',prepared:'sending',submitting:'sending',submitted:'generating',waiting:'generating',running:'generating',downloading:'checking',validating:'checking',ready:'checking',received:'checking',manual_waiting:'manual',needs_attention:'attention',unknown:'attention',importError:'attention',unmatched:'attention',failed:'failed',cancelled:'stopped',not_yet_mapped:'unmapped'};
 for(const [state,group] of Object.entries(cases))assert.equal(groupOf({state}),group,state);
 assert.equal(groupOf({state:'ready',assetId:'asset'}),'library');assert.equal(groupOf({state:'received',assetId:'asset'}),'library');
 assert.equal(groupOf({state:'ready',assetId:'asset',importError:'failure'}),'attention');
});
test('T-010: history limited to 20, null metrics, four units and no private raw fields',()=>{
 const f=fixture();f.jobs[0].request.prompt='PRIVATE_PROMPT';f.jobs[0].providerResponse='PRIVATE_RESPONSE';f.jobs[0].output={path:'C:\\PRIVATE_PATH\\test.mp4'};
 f.jobs[0].history=Array.from({length:30},(_,i)=>({at:f.now-30+i,state:'queued',note:'SECRET_NOTE user@example.invalid sk-secret-token'}));
 f.records.push({id:'m1',kind:'social_metric',data:{planId:'post',observedAt:new Date(f.now).toISOString(),shares:null,source:'api',period:'lifetime'}});
 f.records.push({id:'m2',kind:'keyword_comment_measurement',data:{planId:'post',observedAt:new Date(f.now).toISOString(),matched:0,rawText:'PRIVATE_COMMENTS',source:'manual_paste'}});
 const view=buildOfficeView(f.records,f.jobs,f.manual,f.integrations,f.now),text=JSON.stringify(view);
 assert.equal(view.runs[0].history.length,20);for(const value of ['PRIVATE_PROMPT','PRIVATE_RESPONSE','PRIVATE_PATH','SECRET_NOTE','PRIVATE_COMMENTS','example.invalid','sk-secret'])assert.ok(!text.includes(value),value);
 assert.equal(view.measurements[0].shares,null);assert.equal(view.measurements[0].dms,null);assert.equal(view.measurements[0].utmClicks,null);assert.equal(view.measurements[1].keywordComments,0);
 assert.equal(view.runs[0].state,'queued');assert.equal(view.measurements[0].period,'lifetime');
});
test('T-010: manual unmatched to received preserves run ID and outputs; native compose done stays visible',()=>{
 const f=fixture(),receipt={sha256:'a'.repeat(64),state:'unmatched',createdAt:f.now,assetId:null};
 f.manual.receipts=[receipt];const before=buildOfficeView(f.records,[],f.manual,[],f.now).runs[0];
 receipt.state='received';receipt.assetId='asset';receipt.projectId='production_1';receipt.sceneId='scene';receipt.receivedAt=f.now+2000;
 const after=buildOfficeView(f.records,[],f.manual,[{id:'compose',kind:'compose',state:'done',projectId:'production_1',createdAt:f.now}],f.now+2000).runs;
 assert.equal(before.group,'attention');assert.equal(after[0].id,before.id);assert.equal(after[0].group,'library');assert.equal(after[0].outputs.assetId,'asset');assert.equal(after[0].needsAction,null);
 assert.deepEqual(after[0].history.map(h=>h.state),['unmatched','received']);assert.equal(after[1].group,'unmapped');assert.equal(after[1].state,'done');
});

test('T-011: parser rejects wrong schema/version; freshness boundary and duplicate-day counts',async()=>{
 const {parseOfficeView,freshness,todayCount,activeProducts}=await importModule('lib/lab/office-view.ts');
 const f=fixture(),view=buildOfficeView(f.records,[],{},[],f.now);
 assert.equal(parseOfficeView(view),view);for(const bad of [null,{}, {...view,version:2},{...view,schema:'other'},{...view,runs:[{id:'bad'}]}])assert.throws(()=>parseOfficeView(bad));
 assert.equal(freshness(f.now,view.generatedAt),'live');assert.equal(freshness(f.now+180000,view.generatedAt),'live');assert.equal(freshness(f.now+180001,view.generatedAt),'stale');assert.equal(freshness(f.now,'invalid'),'disconnected');
 view.selection.days.push(view.selection.days.find(d=>d.day===view.today));assert.equal(todayCount(view),3);assert.equal(activeProducts(view).length,4);
});


test('T-011: malformed nested API data is rejected before it can crash the last-good UI',async()=>{
 const {parseOfficeView}=await importModule('lib/lab/office-view.ts');
 const f=fixture(),view=buildOfficeView(f.records,f.jobs,f.manual,f.integrations,f.now);
 for(const mutate of [v=>v.selection.days.push(null),v=>v.selection.days[0].productIds=null,v=>v.selection.totals.distinctProducts='4',v=>v.products[0].key={},v=>v.products[0].priorityRank=4,v=>v.runs[0].lastEvent.note={},v=>v.runs[0].history=[null],v=>v.runs[0].history=Array(21).fill(v.runs[0].history[0]),v=>v.runs[0].needsAction={reason:{}},v=>v.runs[0].outputs.assetId={},v=>v.posts.push({id:'p',productId:'product_1',status:null}),v=>v.measurements.push({id:'m',keywordComments:'unknown'})]) {
   const bad=structuredClone(view);mutate(bad);assert.throws(()=>parseOfficeView(bad));
 }
 assert.equal(parseOfficeView(view),view);
});
