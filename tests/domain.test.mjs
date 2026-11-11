import test from 'node:test';
import assert from 'node:assert/strict';
import {schemas,emptyProduct,unitMargin,productGate,metricAdvice,makeBriefs,classifyComment,formatMoney} from '../lib/lab/domain.ts';
import {productStage} from '../lib/lab/product-stage.ts';
const product={id:'p1',kind:'product',revision:1,updatedAt:0,data:{...emptyProduct,name:'Đèn thử',price:30,cost:12,shipping:4,fees:2,buffer:3,proofNotes:'Đã thử công tắc và ánh sáng với sample.'}};
const ex={id:'e1',kind:'experiment',revision:1,updatedAt:0,data:{productId:'p1'}};

test('unknown product costs remain unknown including legacy research zero placeholders', () => {
  assert.equal(unitMargin({...product.data, cost: null}), null);
  assert.equal(unitMargin({...emptyProduct}), null);
  assert.equal(schemas.product.safeParse({...product.data, shipping: null}).success, true);
  assert.equal(unitMargin({...product.data, cost: 0, researchOrigin: {batchId:'b',candidateId:'c'}, proofNotes:'cost chưa biết, hồ sơ tạm ghi 0'}), null);
  assert.equal(unitMargin({...product.data, cost: 0, shipping: 0, fees: 0, buffer: 0}), 30);
  assert.match(productGate({...product.data, sampleVerified: true, cost: null}), /chi phí/);
});

test('new products default to the US and English while saved and legacy market choices are preserved',()=>{
  assert.equal(emptyProduct.market,'United States');
  assert.equal(emptyProduct.locale,'en-US');
  const alternative=schemas.product.parse({...product.data,market:'France',locale:'fr-FR'});
  assert.equal(alternative.market,'France');
  assert.equal(alternative.locale,'fr-FR');
  const legacy={...product.data};
  delete legacy.market;
  delete legacy.locale;
  const parsedLegacy=schemas.product.parse(legacy);
  assert.equal(parsedLegacy.market,'');
  assert.equal(parsedLegacy.locale,'');
});
test('unit economics retains all per-order costs',()=>assert.equal(unitMargin(product.data),9));
test('sample gate cannot be passed by positive margin alone',()=>assert.match(productGate(product.data),/mẫu sản phẩm/));
test('zero margin remains blocked even with proof',()=>assert.match(productGate({...product.data,sampleVerified:true,price:21}),/lớn hơn 0/));
test('verified evidence and positive economics passes',()=>assert.equal(productGate({...product.data,sampleVerified:true}),''));
test('unsubstantiated verified sample fails schema',()=>assert.equal(schemas.product.safeParse({...product.data,sampleVerified:true,proofNotes:'',proofUrl:''}).success,false));
test('schemas strip unknown secret fields rather than saving them',()=>{const r=schemas.product.parse({...product.data,api_key:'never-store-me'});assert.equal('api_key'in r,false);});
test('unsafe URL schemes rejected',()=>assert.equal(schemas.product.safeParse({...product.data,supplierUrl:'javascript:alert(1)'}).success,false));
test('nonfinite/negative money rejected',()=>{for(const price of [NaN,Infinity,-1])assert.equal(schemas.product.safeParse({...product.data,price}).success,false);});
const metric={experimentId:'e1',views:1000,sessions:100,leads:10,orders:4,delivered:3,returned:1,netRevenue:120,totalCosts:80,sourceUrl:'',notes:''};
test('metric numerators cannot exceed their actual denominators',()=>{for(const patch of [{leads:101},{orders:101},{delivered:5},{returned:4}])assert.equal(schemas.metric.safeParse({...metric,...patch}).success,false);});
test('direct orders need not first be lead signups',()=>assert.equal(schemas.metric.safeParse({...metric,leads:0}).success,true));
test('missing/insufficient evidence is not a product failure',()=>{assert.equal(metricAdvice(undefined).label,'Chưa có dữ liệu');assert.equal(metricAdvice({...metric,sessions:10},100).label,'Chưa đủ dữ liệu');});
test('returns and unprofitable cohorts block a positive suggestion',()=>{assert.equal(metricAdvice(metric).label,'Rà soát hoàn trả');assert.equal(metricAdvice({...metric,returned:0,totalCosts:130}).label,'Kiểm tra kinh tế');});
test('briefs have six stable IDs, no synthetic testimonials and no rendered media',()=>{const a=makeBriefs(product,ex),b=makeBriefs(product,ex);assert.equal(a.length,6);assert.equal(new Set(a.map(x=>x.id)).size,6);assert.deepEqual(a.map(x=>x.id),b.map(x=>x.id));assert.ok(a.every(x=>x.data.source==='template'&&x.data.mediaUrl===''&&x.data.approvedAt===null));});
test('comment labels are multi-label, keyword intent is kept distinct',()=>{assert.deepEqual(classifyComment('Glass'),['Từ khóa / tò mò']);assert.deepEqual(classifyComment('How much and do you ship to US?'),['Hỏi giá','Hỏi giao hàng']);assert.ok(classifyComment('Is this AI?').includes('Nghi ngờ / niềm tin'));});
test('Vietnamese money is currency-specific',()=>{assert.ok(formatMoney(49,'USD').includes('US$'));assert.ok(formatMoney(49000,'VND').includes('₫'));});

const stageRecord = (kind, id, data = {}) => ({id, kind, revision: 1, updatedAt: 0, data});
const stageProduct = (id = 'new', data = {}) => stageRecord('product', id, {
  ...emptyProduct, name: id, supplierUrl: 'https://supplier.example/item', ...data,
});

test('product stages follow the current workspace record structure: Treat Trader 3, ChomChom/Ruffwear 2, new 0', () => {
  // Synthetic fixture shaped like workspace-records.json; no account, receipt or media copied.
  const products = [
    ['treat', 'Treat Trader'], ['chomchom', 'ChomChom'],
    ['ruffwear', 'Ruffwear'], ['new', 'New product'],
  ].map(([id, name]) => stageProduct(id, {name}));
  const [treat, chomchom, ruffwear] = products;
  const records = [
    ...products,
    ...[treat, chomchom, ruffwear].map(p => stageRecord('production', `production_${p.id}`, {
      productId: p.id, productRevision: 1, schemaVersion: 1, references: [], scenes: [],
    })),
    ...[treat, chomchom, ruffwear].map(p => stageRecord('content_plan', `plan_${p.id}`, {
      productId: p.id, productionId: `production_${p.id}`,
      status: p === treat ? 'published_browser' : 'draft',
      postUrl: p === treat ? 'https://www.instagram.com/reel/fixture/' : '',
    })),
    stageRecord('social_metric', 'metric_treat', {
      planId: 'plan_treat', observedAt: '2026-11-11T00:00:00Z', views: 0, likes: null,
    }),
  ];
  const before = structuredClone(records);
  assert.deepEqual(products.map(p => productStage(p, records)), [3, 2, 2, 0]);
  assert.deepEqual(records, before, 'the stage calculation must not mutate records or replace nulls');
});

test('verification stage requires sample or explicit proof, not supplier/reference links or empty fields', () => {
  for (const data of [
    {}, {referenceUrl: 'https://supplier.example/reference'},
    {proofNotes: ' \n\t', proofUrl: '  '},
    {sampleVerified: null, proofNotes: null, proofUrl: null},
    {sampleVerified: 'false'},
  ]) assert.equal(productStage(stageProduct('p', data), []), 0);
  assert.equal(productStage(stageRecord('product', 'legacy', {name: 'Legacy'}), []), 0);
  for (const data of [
    {sampleVerified: true},
    {proofNotes: 'Supplier quote received for the exact SKU on 2026-11-11.'},
    {proofUrl: 'https://supplier.example/sample-proof'},
  ]) assert.equal(productStage(stageProduct('p', data), []), 1);
});

test('unverified Muse promotion notes do not count as proof; recorded verification still does', () => {
  const p = stageProduct('research', {
    researchOrigin: {batchId: 'batch', candidateId: 'candidate'},
    proofNotes: '  Muse đề xuất · cần kiểm tra nguồn\nSupplier listing, cost and shipping unknown.',
  });
  assert.equal(productStage(p, []), 0);
  assert.equal(productStage({...p, data: {...p.data, sampleVerified: true}}, []), 1);
  assert.equal(productStage({...p, data: {...p.data, proofNotes: 'Sample received and checked.'}}, []), 1);
});

test('published plans advance to demand without requiring production or metrics', () => {
  const p = stageProduct();
  for (const status of ['published', 'published_manual', 'published_browser']) {
    assert.equal(productStage(p, [stageRecord('content_plan', 'plan', {productId: p.id, status})]), 3);
  }
  for (const status of [undefined, null, 'draft', 'planned', 'failed', 'published_failed']) {
    const plan = stageRecord('content_plan', 'plan', {productId: p.id, status, postUrl: 'https://www.instagram.com/reel/fixture/'});
    assert.equal(productStage(p, [plan]), 0, `plan status ${status} is not a published record`);
    assert.equal(productStage(p, [plan, stageRecord('production', 'prod', {productId: p.id})]), 2);
  }
});

test('social metrics link through the product plan even when its status is stale and counts are unknown or zero', () => {
  const p = stageProduct();
  const plan = stageRecord('content_plan', 'plan', {productId: p.id, status: 'draft'});
  for (const views of [null, 0, 42]) {
    const metric = stageRecord('social_metric', 'metric', {planId: plan.id, views, likes: null});
    assert.equal(productStage(p, [plan, metric]), 3);
    assert.equal(metric.data.views, views);
    assert.equal(metric.data.likes, null);
  }
});

test('stages ignore other products, orphan metrics and links to the wrong record kind', () => {
  const p = stageProduct();
  const records = [
    stageRecord('production', 'own_production', {productId: p.id}),
    stageRecord('content_plan', 'other_plan', {productId: 'other', status: 'published_browser'}),
    stageRecord('social_metric', 'other_metric', {planId: 'other_plan', productId: p.id}),
    stageRecord('social_metric', 'orphan', {planId: 'missing'}),
    stageRecord('social_metric', 'wrong_kind', {planId: 'own_production'}),
    stageRecord('experiment', 'other_experiment', {productId: 'other', status: 'running'}),
    stageRecord('metric', 'old_metric', {experimentId: 'other_experiment'}),
    stageRecord('metric', 'old_orphan', {experimentId: 'missing'}),
    stageRecord('creative', 'other_creative', {productId: 'other'}),
  ];
  assert.equal(productStage(p, records), 2);
  assert.equal(productStage(p, records.filter(r => r.id !== 'own_production')), 0);
});

test('legacy creative, running experiment and measured experiment retain their stages and archive behavior', () => {
  const p = stageProduct();
  const creative = stageRecord('creative', 'creative', {productId: p.id});
  const experiment = stageRecord('experiment', 'experiment', {productId: p.id, status: 'draft'});
  const metric = stageRecord('metric', 'metric', {experimentId: experiment.id});
  assert.equal(productStage(p, [experiment]), 0);
  assert.equal(productStage(p, [creative]), 2);
  assert.equal(productStage(p, [experiment, metric]), 3);
  const running = {...experiment, data: {...experiment.data, status: 'running'}};
  assert.equal(productStage(p, [running, creative]), 3);
  assert.equal(productStage(p, [{...running, data: {...running.data, archived: true}}, metric]), 0);
  assert.equal(productStage(p, [{...creative, data: {...creative.data, archived: true}}]), 0);
});
