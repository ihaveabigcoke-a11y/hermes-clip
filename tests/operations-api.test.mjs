import {importApiModule} from '../desktop/test/helpers/local-server.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {call} from './runtime-fixture.mjs';
import {analysisResponse,structureFor,analysisReferences} from './fixtures/formula-analysis.mjs';
const lab=await importApiModule('app/api/lab/route.ts');
const production=await importApiModule('app/api/production/route.ts');
const {emptyProduct,productFromCandidate,unitMargin,productMarginLabel}=await importApiModule('lib/lab/domain.ts');
const {researchProductId}=await importApiModule('lib/lab/operations.ts');
const {viralFormulas, viralFormulaRecordId}=await importApiModule('lib/lab/viral-formulas.ts');
const {draftReferenceVideo, referenceDraftRecordId}=await importApiModule('lib/lab/viral-reference.ts');
const {saveResearchSelection}=await importApiModule('lib/lab/research-selection.ts');
const {parseFormulaAnalysis,proposeFormulaChanges}=await importApiModule('lib/lab/formula-analysis.ts');

async function save(kind, id, data, revision = 0, who = 'ops-owner', action = 'save') {
  const request = new Request('https://qa.invalid/api/lab', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://qa.invalid', 'oai-authenticated-user-id': who, 'oai-authenticated-user-email': who+'@example.invalid'}, body: JSON.stringify({kind, id, data, revision, action})});
  const response = await call(lab.POST, request);
  return {status: response.status, ...await response.json()};
}

test('UTM links round-trip through plan save/read/CAS without requiring a migration for legacy plans',async()=>{
  const who='utm-owner';
  const {buildUtmLink}=await importApiModule('lib/lab/utm.ts');
  const read=async()=>(await (await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'}}))).json()).records;
  assert.equal((await save('product','utm_product',{...emptyProduct,name:'Đèn ngủ'},0,who)).status,200);
  assert.equal((await save('social_account','utm_account',{name:'UTM account',productId:'utm_product',handle:'shop.one'},0,who)).status,200);
  const legacy=await save('content_plan','utm_plan',{name:'Legacy plan',productId:'utm_product',accountId:'utm_account',hook:'English hook',notes:'Keep original notes'},0,who);
  assert.equal(legacy.status,200);assert.equal(legacy.record.data.utmLink,undefined);
  const landingBaseUrl='https://shop.example/light?ref=partner#join';
  const utmLink=buildUtmLink(landingBaseUrl,{productSlug:'Đèn ngủ',accountHandle:'shop.one',planId:legacy.record.id,hookId:'hook_a',ctaKeyword:'LED'});
  const data={...legacy.record.data,utmLink,landingBaseUrl,utmHookId:'hook_a',ctaKeyword:'LED'};
  const saved=await save('content_plan',legacy.record.id,data,legacy.record.revision,who);
  assert.equal(saved.status,200);assert.deepEqual(saved.record.data,data);
  assert.deepEqual((await read()).find(row=>row.id===saved.record.id),saved.record);
  assert.equal((await save('content_plan',legacy.record.id,{...data,utmLink:null},legacy.record.revision,who)).status,409);
  for(const field of ['utmLink','landingBaseUrl'])assert.equal((await save('content_plan',saved.record.id,{...data,[field]:'javascript:alert(1)'},saved.record.revision,who)).status,422);
  assert.deepEqual((await read()).find(row=>row.id===saved.record.id),saved.record);
  const nullable=await save('content_plan','utm_nullable',{name:'Nullable plan',productId:'utm_product',utmLink:null,landingBaseUrl:null,utmHookId:null},0,who);
  assert.equal(nullable.status,200);assert.equal(nullable.record.data.utmLink,null);
});

test('manual comment measurements round-trip separately, recompute counts and preserve Insights and every previous paste',async()=>{
  const who='comment-measure-owner';
  const read=async(owner=who)=>(await (await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.invalid'}}))).json()).records;
  const persist=async(kind,id,data,revision=0)=>{const result=await save(kind,id,data,revision,who);assert.equal(result.status,200,JSON.stringify(result));return result.record;};
  await persist('product','comment_product',{...emptyProduct,name:'Comment fixture'});
  await persist('social_account','comment_account',{name:'Account fixture',productId:'comment_product'});
  const plan=await persist('content_plan','comment_post',{name:'Published fixture',productId:'comment_product',accountId:'comment_account',status:'published_manual',postUrl:'https://www.instagram.com/reel/comment_fixture/',ctaKeyword:'led'});
  assert.equal(plan.data.ctaKeyword,'LED');
  const insight=await persist('social_metric','ignored',{planId:plan.id,observedAt:'2026-11-12T00:00:00Z',views:null,likes:0,comments:500,shares:null,saves:null,profileVisits:null,linkClicks:null,source:'instagram_browser',accountId:plan.data.accountId,handle:'fixture',sourceUrl:plan.data.postUrl});
  const input={planId:plan.id,accountId:plan.data.accountId,sourceUrl:plan.data.postUrl,source:'manual_paste',observedAt:'2000-01-01T00:00:00Z',keyword:'led',inputFormat:'username',rawText:'Alice LED 🙏\n@alice led!\nBob ledger\nBob HELP',matched:999,total:999,matchedUniqueUsers:999,views:777,comments:888};
  const start=Date.now();
  const first=await persist('keyword_comment_measurement','paste_one',input);
  assert.ok(Date.parse(first.data.observedAt)>=start);assert.ok(Date.parse(first.data.observedAt)<=Date.now());
  assert.equal(first.data.source,'manual_paste');assert.equal(first.data.total,4);assert.equal(first.data.matched,2);assert.equal(first.data.matchedUniqueUsers,1);
  assert.equal(first.data.views,undefined);assert.equal(first.data.comments,undefined);assert.deepEqual(first.data.examples,['LED 🙏','led!']);
  const second=await persist('keyword_comment_measurement','paste_two',{...input,inputFormat:'text',rawText:'ledger'});
  assert.equal(second.data.matched,0);assert.equal(second.data.matchedUniqueUsers,0);
  assert.equal((await save('keyword_comment_measurement',first.id,input,0,who)).status,409);
  assert.equal((await save('keyword_comment_measurement',first.id,input,1,who)).status,409);
  assert.equal((await save('keyword_comment_measurement','foreign_paste',input,0,'comment-other')).status,422);
  for(const patch of [{planId:'missing'},{accountId:'missing'},{sourceUrl:'https://instagram.com/reel/other/'},{source:'instagram_browser'},{rawText:'  '},{keyword:'LED RUN'}])
    assert.equal((await save('keyword_comment_measurement','invalid_paste',{...input,...patch},0,who)).status,422);
  const rows=await read();assert.deepEqual(rows.find(r=>r.id===insight.id),insight);
  assert.deepEqual(rows.find(r=>r.id===first.id),first);assert.deepEqual(rows.find(r=>r.id===second.id),second);
  assert.equal(rows.filter(r=>r.kind==='keyword_comment_measurement').length,2);
  assert.equal((await read('comment-other')).some(r=>r.id===first.id),false);
  const updated=await persist('social_metric',insight.id,{...insight.data,views:1000,observedAt:'2026-11-12T02:00:00Z'},insight.revision);
  assert.equal(updated.data.comments,500);assert.deepEqual((await read()).find(r=>r.id===first.id),first);
  const planEdit=await persist('content_plan',plan.id,{...plan.data,ctaKeyword:'RUN'},plan.revision);
  assert.equal(planEdit.data.ctaKeyword,'RUN');assert.equal((await read()).find(r=>r.id===first.id).data.keyword,'LED');
});

test('manual paste refuses drafts and prevents reassigning a measured post even before Insights exist',async()=>{
  const who='comment-source-owner';
  await save('product','paste_product',{...emptyProduct,name:'Source fixture'},0,who);
  await save('social_account','paste_account',{name:'Account fixture',productId:'paste_product'},0,who);
  await save('social_account','paste_account_two',{name:'Second fixture',productId:'paste_product'},0,who);
  const data={name:'Draft fixture',productId:'paste_product',accountId:'paste_account',postUrl:'https://instagram.com/p/paste_source/'};
  const draft=await save('content_plan','paste_plan',data,0,who);assert.equal(draft.status,200);
  const input={planId:'paste_plan',accountId:'paste_account',sourceUrl:data.postUrl,source:'manual_paste',observedAt:new Date().toISOString(),keyword:'LED',rawText:'LED'};
  assert.equal((await save('keyword_comment_measurement','draft_paste',input,0,who)).status,422);
  const published=await save('content_plan','paste_plan',{...draft.record.data,status:'published_manual'},draft.record.revision,who);assert.equal(published.status,200);
  const race=await Promise.all([save('keyword_comment_measurement','same_paste',input,0,who),save('keyword_comment_measurement','same_paste',input,0,who)]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal(race.find(r=>r.status===200).record.data.matchedUniqueUsers,null);
  for(const patch of [{postUrl:'https://instagram.com/p/changed/'},{accountId:'paste_account_two'}])
    assert.equal((await save('content_plan','paste_plan',{...published.record.data,...patch},published.record.revision,who)).status,422);
});

test('product sample checklist survives API save/read/CAS; legacy product remains readable',async()=>{
  const who='sample-check-owner';
  const created=await save('product','sample_check_product',{...emptyProduct,name:'Sample fixture'},0,who);
  assert.equal(created.status,200);assert.equal(created.record.data.sampleCheck,undefined);
  const sampleCheck={receivedAt:'2026-11-12',colorSizeMatches:true,matchesVideo:false,packagingIntact:null,notes:'Fixture observation',photos:['fixture_photo']};
  const updated=await save('product',created.record.id,{...created.record.data,sampleCheck},created.record.revision,who);
  assert.equal(updated.status,200);assert.deepEqual(updated.record.data.sampleCheck,sampleCheck);assert.equal(updated.record.data.cost,null);
  assert.equal((await save('product',created.record.id,created.record.data,created.record.revision,who)).status,409);
  assert.equal((await save('product',created.record.id,{...updated.record.data,sampleCheck:{matchesVideo:'yes'}},updated.record.revision,who)).status,422);
  const response=await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'}}));
  assert.deepEqual((await response.json()).records.find(r=>r.id===created.record.id).data.sampleCheck,sampleCheck);
});

test('formula analysis context/observations round-trip through draft CAS and explicit formula append; legacy fields stay optional',async()=>{
  const who='analysis-owner',structure=structureFor(),caption='Comment LED for the link',fileName='LED.mp4';
  const analysis=parseFormulaAnalysis(JSON.stringify({...analysisResponse(),ctaSource:'caption',cutCount:999}),structure,{caption,fileName});
  const draft={...draftReferenceVideo({id:'analysis_api',product:'Fixture',structure}),caption,fileName,analysis};
  const saved=await save('reference_video_draft','ignored',draft,0,who);
  assert.equal(saved.status,200);assert.deepEqual(saved.record.data.analysis,analysis);assert.equal(saved.record.data.caption,caption);assert.equal(saved.record.data.fileName,fileName);
  assert.deepEqual(saved.record.data.structure.contactSheets,structure.contactSheets);
  const updated=await save('reference_video_draft','ignored',{...draft,fileName:'Comment LED original.mp4'},1,who);
  assert.equal(updated.status,200);assert.equal((await save('reference_video_draft','ignored',draft,1,who)).status,409);
  for(const patch of [{caption:'x'.repeat(2201)},{caption:'No keyword'},{analysis:{...analysis,cutCount:999}},{analysis:{...analysis,extra:true}}])
    assert.equal((await save('reference_video_draft','ignored',{...draft,...patch},2,who)).status,422);
  const legacy=await save('reference_video_draft','ignored',{id:'legacy_analysis',product:'Old'},0,who);
  assert.equal(legacy.status,200);assert.equal(legacy.record.data.caption,undefined);assert.equal(legacy.record.data.analysis,undefined);
  const read=async()=>(await (await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'}}))).json()).records;
  const before=await read();assert.deepEqual(before.find(r=>r.id===saved.record.id),updated.record);assert.equal(before.filter(r=>r.kind==='viral_formula').length,0);
  const proposal=proposeFormulaChanges([analysisReferences[9],{...analysisReferences[9],id:'R2'}],viralFormulas)[0];
  assert.equal(proposal.change,'new');assert.equal((await read()).filter(r=>r.kind==='viral_formula').length,0);
  const appended=await save('viral_formula','ignored',proposal.formula,0,who);assert.equal(appended.status,200);
  assert.equal((await save('viral_formula','ignored',proposal.formula,0,who)).status,409);
  assert.deepEqual((await read()).find(r=>r.id===saved.record.id),updated.record);
});

test('candidate retail/IP and user ceiling survive API saves, validation and CAS with local receipt intact',async()=>{
  const at='2026-11-12T00:00:00Z';
  const listingCheck={status:'ok',sourceUrl:'https://supplier.example/item/1',fetchedAt:at,productCountReliable:true,productCountOnPage:1};
  const row={id:'generic',name:'Generic product',supplierUrl:listingCheck.sourceUrl,evidenceNotes:'Fixture only',usRetail:{low:20,high:30,currency:'USD',sources:[{url:'https://retail.example/item/1',title:'Generic retail',price:24.99,observedAt:at}]},logisticsFlags:{brandRisk:false,ipRisk:true},ipNotes:'Compare design',listingCheck};
  const created=await save('research_batch','retail_api',{name:'Retail fixture',maxLandedCostUsd:12,candidates:[row],notes:'[Muse keep]'});
  assert.equal(created.status,200);const saved=created.record;
  assert.deepEqual(saved.data.candidates[0].usRetail,row.usRetail);assert.equal(saved.data.candidates[0].logisticsFlags.ipRisk,true);assert.equal(saved.data.maxLandedCostUsd,12);
  const edited=await save('research_batch',saved.id,{...saved.data,candidates:[{...saved.data.candidates[0],ipNotes:'Updated manual observation'}]},saved.revision);
  assert.equal(edited.status,200);assert.equal(edited.record.data.notes,'[Muse keep]');assert.deepEqual(edited.record.data.candidates[0].listingCheck,saved.data.candidates[0].listingCheck);
  assert.equal((await save('research_batch',saved.id,saved.data,saved.revision)).status,409);
  const unsafe={...edited.record.data,candidates:[{...row,usRetail:{...row.usRetail,sources:[{...row.usRetail.sources[0],url:'javascript:alert(1)'}]}}]};
  assert.equal((await save('research_batch',saved.id,unsafe,edited.record.revision)).status,422);
});

test('one check creates a profile through promote; repeat, uncheck and recheck retain the edited profile',async()=>{
  const created=await save('research_batch','one_check',{name:'One check fixture',candidates:[{id:'pick',name:'Product',supplierUrl:'https://example.test/item/pick',evidenceNotes:'Read source',cost:null}],notes:'[Muse keep_receipt]'});
  assert.equal(created.status,200);
  const persist=async(kind,id,data,revision,action)=>{const result=await save(kind,id,data,revision,'ops-owner',action);assert.equal(result.status,200,JSON.stringify(result));return result.record;};
  let batch=await saveResearchSelection(created.record,'pick',true,persist);
  assert.deepEqual(batch.data.selectedIds,['pick']);assert.equal(batch.revision,2);
  const getProduct=async()=>{
    const response=await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':'ops-owner','oai-authenticated-user-email':'ops-owner@example.invalid'}}));
    return (await response.json()).records.filter(r=>r.id===researchProductId(batch.id,'pick'));
  };
  let profiles=await getProduct();assert.equal(profiles.length,1);assert.equal(profiles[0].data.cost,null);
  const edited=await persist('product',profiles[0].id,{...profiles[0].data,name:'User edited'},profiles[0].revision);
  batch=await saveResearchSelection(batch,'pick',true,persist);
  assert.equal(batch.revision,2);assert.deepEqual(await getProduct(),[edited]);
  batch=await saveResearchSelection(batch,'pick',false,persist);
  assert.deepEqual(batch.data.selectedIds,[]);assert.deepEqual(await getProduct(),[edited]);
  batch=await saveResearchSelection(batch,'pick',true,persist);
  assert.equal(batch.data.notes,'[Muse keep_receipt]');assert.deepEqual(await getProduct(),[edited]);
});

test('reference draft API validates taxonomy, preserves unknowns, isolates owners and enforces CAS without changing formulas', async()=>{
  const draft=draftReferenceVideo({id:'sample',product:'Fixture',structure:{durationSec:6,cuts:[2,4],cutCount:2,contactSheetPath:'fixture/sheet.jpg',frames:[{t:0,path:'fixture/frame.jpg'}]}});
  const read=async who=>(await (await call(lab.GET,new Request('https://qa.invalid/api/lab',{headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'}}))).json()).records;
  const before=(await read('reference-owner')).filter(r=>r.kind==='viral_formula');
  const first=await save('reference_video_draft','ignored',draft,0,'reference-owner');
  assert.equal(first.status,200);assert.equal(first.record.id,referenceDraftRecordId(draft));assert.deepEqual(first.record.data,draft);
  const edited=await save('reference_video_draft','ignored',{...draft,hookText:'Observed English text'},1,'reference-owner');
  assert.equal(edited.status,200);assert.equal(edited.record.revision,2);assert.equal(edited.record.data.hookType,null);
  assert.equal((await save('reference_video_draft','ignored',draft,1,'reference-owner')).status,409);
  assert.deepEqual((await read('reference-owner')).find(r=>r.id===first.record.id),edited.record);
  assert.deepEqual((await read('reference-owner')).filter(r=>r.kind==='viral_formula'),before);
  assert.ok(!(await read('reference-other')).some(r=>r.id===first.record.id));
  assert.equal((await save('reference_video_draft','ignored',draft,0,'reference-other')).status,200);
  for(const patch of [{status:'approved'},{hookType:'made_up'},{ctaType:'checkout'},{durationSec:5},{productTraits:['made_up']}])assert.equal((await save('reference_video_draft','ignored',{...draft,...patch},2,'reference-owner')).status,422);
  const legacy=await save('reference_video_draft','ignored',{id:'legacy',product:'Old reference'},0,'reference-owner');
  assert.equal(legacy.status,200);assert.equal(legacy.record.data.durationSec,null);assert.equal(legacy.record.data.cuts,null);assert.equal(legacy.record.data.structure,null);
});

test('formula API appends immutable versions with canonical IDs and owner isolation', async () => {
  const formula = {...viralFormulas[0], name: 'User formula', version: 2};
  const saved = await save('viral_formula', 'ignored', formula);
  assert.equal(saved.status, 200);
  assert.equal(saved.record.id, viralFormulaRecordId(formula));
  assert.equal(saved.record.revision, 1);
  assert.equal(saved.record.data.name, formula.name);
  assert.ok(Number.isFinite(Date.parse(saved.record.data.updatedAt)));
  assert.equal((await save('viral_formula', 'another-id', {...formula, name: 'Retry overwrite'})).status, 409);
  assert.equal((await save('viral_formula', saved.record.id, {...formula, name: 'Edit in place'}, 1)).status, 409);
  const newer = await save('viral_formula', 'ignored', {...formula, version: 3, name: 'New version'});
  assert.equal(newer.status, 200);
  assert.notEqual(newer.record.id, saved.record.id);
  const foreign = await save('viral_formula', 'ignored', {...formula, name: 'Other workspace'}, 0, 'formula-other');
  assert.equal(foreign.status, 200);
  const read = async who => {
    const request = new Request('https://qa.invalid/api/lab', {headers: {'oai-authenticated-user-id': who, 'oai-authenticated-user-email': who+'@example.invalid'}});
    return (await (await call(lab.GET, request)).json()).records.filter(row => row.kind === 'viral_formula');
  };
  const own = await read('ops-owner');
  assert.deepEqual(own.find(row => row.id === saved.record.id), saved.record);
  assert.ok(own.some(row => row.id === newer.record.id));
  assert.deepEqual(await read('formula-other'), [foreign.record]);
  assert.equal((await save('viral_formula', 'ignored', {...formula, version: 4, beats: [{...formula.beats[0], toSec: 0}]})).status, 422);
  assert.equal((await save('viral_formula', 'ignored', {...formula, version: 4, hookType: 'not-taxonomy'})).status, 422);
  const race = await Promise.all([save('viral_formula', 'race1', {...formula, version: 4}), save('viral_formula', 'race2', {...formula, version: 4})]);
  assert.deepEqual(race.map(row => row.status).sort(), [200, 409]);
});

test('research API preserves independent currencies on create and later edits', async () => {
  const candidate = {id: 'mixed_currency', name: 'Supplier quote', supplierUrl: 'https://supplier.example/quote', evidenceNotes: 'Exact SKU quote', cost: 36.5, costCurrency: 'CNY', shipping: null, shippingCurrency: null, price: 19.99, currency: 'USD'};
  const created = await save('research_batch', 'currency_batch', {name: 'Currency fixture', candidates: [candidate]});
  assert.equal(created.status, 200);
  for (const [key, value] of Object.entries(candidate)) assert.deepEqual(created.record.data.candidates[0][key], value);
  const data = {...created.record.data, candidates: [{...created.record.data.candidates[0], shipping: 4.25, shippingCurrency: 'GBP'}]};
  const updated = await save('research_batch', 'currency_batch', data, created.record.revision);
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.record.data, data);
});

test('promotion API round-trips mixed and CNY currencies and preserves them on replay and product edit', async () => {
  for (const currency of ['USD', 'CNY']) {
    const batchId = 'promote_currency_' + currency;
    const candidate = {id:'quote', name:'Supplier quote', supplierUrl:'https://example.test/item', evidenceNotes:'Exact SKU quote', cost:36.5, costCurrency:'CNY', shipping:4.25, shippingCurrency:'USD', price:19.99, currency};
    const batch = await save('research_batch', batchId, {name:'Currency fixture', candidates:[candidate], selectedIds:['quote']});
    assert.equal(batch.status, 200);
    const input = productFromCandidate(batchId, batch.record.data, batch.record.data.candidates[0]);
    const id = researchProductId(batchId, 'quote');
    const created = await save('product', id, input, 0, 'ops-owner', 'promote');
    assert.equal(created.status, 200);
    assert.deepEqual(created.record.data, input);
    const replay = await save('product', id, {...input, costCurrency:'USD'}, 0, 'ops-owner', 'promote');
    assert.equal(replay.status, 200);
    assert.equal(replay.deduplicated, true);
    assert.deepEqual(replay.record, created.record);
    const update = {...created.record.data, fees:0, buffer:0};
    const edited = await save('product', id, update, created.record.revision);
    assert.equal(edited.status, 200);
    assert.deepEqual(edited.record.data, update);
    assert.equal(unitMargin(edited.record.data), null);
    assert.equal(productMarginLabel(edited.record.data), 'Khác tiền tệ · chưa tính biên');
  }
});

test('content draft without Instagram saves and replays while scheduling and foreign accounts are rejected', async () => {
  await save('product', 'draft_product', {...emptyProduct, name:'Account-free product'});
  const data = {name:'Internal caption', productId:'draft_product', accountId:'', caption:'English caption'};
  const draft = await save('content_plan', 'account_free', data);
  assert.equal(draft.status, 200);
  assert.equal(draft.record.data.accountId, '');
  assert.equal((await save('content_plan', 'account_free', {...data, status:'planned'}, 1)).status, 422);
  assert.equal((await save('content_plan', 'account_free', {...data, status:'published_manual', postUrl:'https://www.instagram.com/reel/abc/'}, 1)).status, 422);
  assert.equal((await save('content_plan', 'account_free', {...data, accountId:'foreign_account'}, 1)).status, 422);
  assert.equal((await save('content_plan', 'account_free', {...data, caption:'Updated draft'}, 1)).status, 200);
  assert.equal((await save('content_plan', 'account_free', data, 1)).status, 409);
});

test('content AI label round-trips optional/null and explicit modes through the API with revision checks', async () => {
  await save('product', 'ai_label_product', {...emptyProduct, name:'AI label fixture'});
  let revision=0;
  for(const aiLabel of [undefined,null,'required','off']){
    const data={name:'AI label draft',productId:'ai_label_product',caption:'English caption',...(aiLabel===undefined?{}:{aiLabel})};
    const result=await save('content_plan','ai_label_plan',data,revision);
    assert.equal(result.status,200); assert.equal(result.record.data.aiLabel,aiLabel);
    revision=result.record.revision;
  }
  assert.equal((await save('content_plan','ai_label_plan',{name:'AI label draft',productId:'ai_label_product',aiLabel:false},revision)).status,422);
  assert.equal((await save('content_plan','ai_label_plan',{name:'AI label draft',productId:'ai_label_product',aiLabel:'required'},revision-1)).status,409);
});
test('research selection and product promotion preserve provenance, ownership, CAS and retries', async () => {
  const candidates = Array.from({length: 4}, (_, index) => ({id: 'candidate'+index, name: 'Product '+index, supplierUrl: 'https://example.com/item/'+index, evidenceNotes: 'Read supplied source'}));
  let response = await save('research_batch', 'batch', {name: 'Sourced shortlist', candidates});
  assert.equal(response.status, 200);
  let batch = response.record;
  const productId = researchProductId('batch', 'candidate0');
  const product = {...emptyProduct, name: 'Product zero', researchOrigin: {batchId: 'batch', candidateId: 'candidate0'}};
  assert.equal((await save('product', productId, product)).status, 422);
  assert.equal((await save('research_batch', 'batch', {...batch.data, selectedIds: candidates.map(row => row.id)}, batch.revision)).status, 422);
  response = await save('research_batch', 'batch', {...batch.data, selectedIds: ['candidate0']}, batch.revision);
  assert.equal(response.status, 200); batch = response.record;
  assert.equal((await save('research_batch', 'batch', batch.data, 1)).status, 409);
  assert.equal((await save('product', productId, product, 0, 'foreign')).status, 422);
  response = await save('product', productId, product, 0, 'ops-owner', 'promote');
  assert.equal(response.status, 200);
  const retry = await save('product', productId, {...product, name: 'Should not overwrite'}, 0, 'ops-owner', 'promote');
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.record.data.name, 'Product zero');
  assert.equal(retry.record.revision, 1);
});
test('social records enforce product/account links and keep one cumulative measurement per post', async () => {
  await save('product', 'social_product', {...emptyProduct, name: 'Social product'});
  await save('product', 'other_product', {...emptyProduct, name: 'Other product'});
  const account = {name: 'Existing Instagram', handle: 'test_profile', productId: 'social_product'};
  assert.equal((await save('social_account', 'account', account)).status, 200);
  assert.equal((await save('social_account', 'account', {...account, productId: 'other_product'}, 1)).status, 422);
  const plan = {name: 'Test content', productId: 'social_product', accountId: 'account'};
  assert.equal((await save('content_plan', 'plan', {...plan, productId: 'other_product'})).status, 422);
  assert.equal((await save('content_plan', 'plan', plan, 0, 'foreign')).status, 422);
  assert.equal((await save('content_plan', 'plan', {...plan, status: 'published_manual', postUrl: 'https://instagram.com/'})).status, 422);
  assert.equal((await save('content_plan', 'plan', plan)).status, 200);
  const metric = {planId: 'plan', observedAt: '2026-11-10T00:00:00Z', views: 100, likes: 10, comments: 2, saves: 1, shares: 2, profileVisits: 3, linkClicks: 4, sourceUrl: 'https://instagram.com/p/test/'};
  assert.equal((await save('social_metric', 'ignored', metric)).status, 422);
  assert.equal((await save('content_plan', 'plan', {...plan, status: 'published_manual', postUrl: metric.sourceUrl}, 1)).status, 200);
  let result = await save('social_metric', 'ignored', metric);
  assert.equal(result.status, 200); assert.equal(result.record.id, 'social_metric_plan');
  assert.equal((await save('social_metric', 'ignored', metric)).status, 409);
  assert.equal((await save('social_metric', 'ignored', {...metric, observedAt: '2026-11-09T00:00:00Z'}, 1)).status, 422);
  result = await save('social_metric', 'ignored', {...metric, views: 200}, 1);
  assert.equal(result.status, 200); assert.equal(result.record.data.views, 200);
  const automatic={...metric,source:'instagram_browser',accountId:'account',handle:'test_profile',views:null,linkClicks:null,insightsUrl:'https://www.instagram.com/insights/media/123/'};
  assert.equal((await save('social_metric','ignored',{...automatic,sourceUrl:'https://instagram.com/p/other/'},2)).status,422);
  assert.equal((await save('social_metric','ignored',{...automatic,accountId:'other'},2)).status,422);
  result=await save('social_metric','ignored',automatic,2);
  assert.equal(result.status,200);assert.equal(result.record.data.views,null);assert.equal(result.record.data.likes,10);assert.equal(result.record.data.source,'instagram_browser');
  assert.equal((await save('content_plan', 'plan', {...plan, status: 'published_manual', postUrl: 'https://instagram.com/p/changed/'}, 2)).status, 422);
  const page = {productId: 'social_product', headline: 'Product headline', description: 'Evidence based description'};
  assert.equal((await save('landing_page', 'landing_social_product', {...page, imageAssetId: 'missing'})).status, 422);
  assert.equal((await save('landing_page', 'landing_social_product', page)).status, 200);
  assert.equal((await save('landing_page', 'landing_social_product', page)).status, 409);
});
test('content plan creates traceable unapproved scenes and rejects stale or foreign source', async () => {
  await save('product', 'handoff_product', {...emptyProduct, name: 'Handoff product'});
  await save('social_account', 'handoff_account', {name: 'Account', handle: 'qa_only', productId: 'handoff_product'});
  const source = await save('content_plan', 'handoff_plan', {name: 'Content handoff', productId: 'handoff_product', accountId: 'handoff_account', hook: 'A product detail', script: '0-5s Product on a table\n5-10s Fixed camera view'});
  const create = async (id, revision, who = 'ops-owner') => {
    const request = new Request('https://qa.invalid/api/production', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://qa.invalid', 'oai-authenticated-user-id': who, 'oai-authenticated-user-email': who+'@example.invalid'}, body: JSON.stringify({id, revision: 0, commandId: id, action: 'create', input: {name: 'Handoff', productId: 'handoff_product', locale: 'en-US', contentPlanId: source.record.id, contentPlanRevision: revision}})});
    const response = await call(production.POST, request);
    return {status: response.status, ...await response.json()};
  };
  assert.equal((await create('stale_project', 2)).status, 409);
  assert.equal((await create('foreign_project', 1, 'another-owner')).status, 422);
  const result = await create('handoff_project', 1);
  assert.equal(result.status, 200);
  assert.equal(result.record.data.contentPlanId, source.record.id);
  assert.equal(result.record.data.scenes.length, 3);
  assert.ok(result.record.data.scenes.every(scene => !scene.storyboardApproved && !scene.attempts.length));
  const replay = await create('handoff_project', 1);
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.record.data.scenes.length, 3);
});
