import test from 'node:test';
import assert from 'node:assert/strict';
import {call} from './runtime-fixture.mjs';
import * as lab from '../app/api/lab/route.ts';
import * as production from '../app/api/production/route.ts';
import {emptyProduct} from '../lib/lab/domain.ts';
import {researchProductId} from '../lib/lab/operations.ts';

async function save(kind, id, data, revision = 0, who = 'ops-owner', action = 'save') {
  const request = new Request('https://qa.invalid/api/lab', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://qa.invalid', 'oai-authenticated-user-id': who, 'oai-authenticated-user-email': who+'@example.invalid'}, body: JSON.stringify({kind, id, data, revision, action})});
  const response = await call(lab.POST, request);
  return {status: response.status, ...await response.json()};
}

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
