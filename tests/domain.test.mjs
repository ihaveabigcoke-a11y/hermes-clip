import test from 'node:test';
import assert from 'node:assert/strict';
import {schemas,emptyProduct,unitMargin,productGate,metricAdvice,makeBriefs,classifyComment,formatMoney,productFromCandidate,productCurrency,productFinancials,productMarginLabel,productFeeCurrencyHint} from '../lib/lab/domain.ts';
import {candidateSchema} from '../lib/lab/operations.ts';
import {productStage} from '../lib/lab/product-stage.ts';
import {readFileSync} from 'node:fs';
import {
  parseViralFormulaSeed, viralFormulaSeed, viralFormulas, referenceVideos, referenceVideoSchema,
  validateFormula, formulasForProduct, formulaVersions, workspaceFormulas, viralFormulaRecordId,
  referencesForFormula, formatBeatTime, formulaTaxonomy,
} from '../lib/lab/viral-formulas.ts';

const formula = viralFormulas.find(row => row.id === 'problem-vs-result-cta');
const formulaRecord = data => ({id: viralFormulaRecordId(data), kind: 'viral_formula', data});
test('formula seed preserves the supplied taxonomy and all 12 references with explicit time origins', () => {
  const input = JSON.parse(readFileSync(new URL('../ops/night/input/formula-seed.json', import.meta.url), 'utf8'));
  const source = JSON.parse(readFileSync(new URL('../lib/lab/viral-formulas.seed.json', import.meta.url), 'utf8'));
  assert.deepEqual(source, input);
  assert.deepEqual(source.taxonomy, formulaTaxonomy);
  assert.deepEqual(parseViralFormulaSeed(source), viralFormulaSeed);
  assert.equal(viralFormulas.length, 6);
  assert.equal(referenceVideos.length, 12);
  for (const row of viralFormulas) {
    assert.equal(validateFormula(row).success, true);
    assert.equal(row.version, input.version);
    assert.equal(row.updatedAt, input.createdAt);
    assert.ok(row.beats.every(beat => beat.fromSec < beat.toSec));
  }
  const cta = formula.beats.at(-1);
  assert.equal(cta.timeOrigin, 'end');
  assert.equal(cta.fromSec, -3);
  assert.equal(cta.toSec, 0);
  assert.equal(formatBeatTime(cta), '3–0 giây trước khi hết video');
  assert.equal(formatBeatTime(formula.beats[0]), '0–4 giây từ đầu video');
  assert.deepEqual(referencesForFormula(viralFormulas.find(row => row.id === 'pov-share-bait')).map(row => row.id), ['V1', 'V10']);
  assert.ok(Object.isFrozen(formula.beats[0]));
  assert.throws(() => {formula.beats[0].label = 'mutated';}, TypeError);
});
test('formula validation rejects reversed/mixed times, wrong taxonomy and broken seed links', () => {
  const beat = formula.beats[0];
  for (const patch of [
    {fromSec: 4, toSec: 4}, {fromSec: 5, toSec: 4}, {fromSec: -1}, {toSec: Infinity},
    {timeOrigin: 'end', fromSec: -3, toSec: 0}, {role: 'other'}, {kind: 'other'},
    {role: 'cta'},
  ]) assert.equal(validateFormula({...formula, beats: [{...beat, ...patch}]}).success, false);
  assert.equal(validateFormula({...formula, beats: [{...formula.beats.at(-1), toSec: 1}]}).success, false);
  for (const patch of [{hookType: 'invented'}, {fitProductTraits: ['invented']}, {version: 0}, {version: 1.5}, {updatedAt: 'yesterday'}, {labelVariants: {invented: ['text']}}])
    assert.equal(validateFormula({...formula, ...patch}).success, false);
  const original = JSON.parse(readFileSync(new URL('../lib/lab/viral-formulas.seed.json', import.meta.url), 'utf8'));
  for (const change of [
    seed => {seed.formulas[0].beats[3].fromEndSec = 0;},
    seed => {seed.formulas[0].beats[3].fromSec = 1;},
    seed => {seed.formulas[0].references.push('missing');},
    seed => {seed.references[0].formulaId = 'missing';},
    seed => {seed.references.push(seed.references[0]);},
    seed => {seed.formulas.push(seed.formulas[0]);},
    seed => {seed.taxonomy.roles.reverse();},
  ]) {const source = structuredClone(original); change(source); assert.throws(() => parseViralFormulaSeed(source));}
});
test('night glow traits suggest problem-vs-result-cta without invented fit for unknown traits', () => {
  assert.deepEqual(formulasForProduct(['night_glow']).map(row => row.id), ['problem-vs-result-cta']);
  assert.equal(formulasForProduct(['night_glow', 'visual_payoff_one_frame', 'pet'])[0].id, formula.id);
  assert.deepEqual(formulasForProduct([]), []);
  assert.deepEqual(formulasForProduct(['unclassified']), []);
  const traits = Object.freeze(['night_glow', 'night_glow']);
  assert.deepEqual(formulasForProduct(traits), formulasForProduct(['night_glow']));
});
test('formula/reference defaults preserve unknown values and legacy product records', () => {
  const oldFormula = {...formula}; delete oldFormula.version; delete oldFormula.updatedAt;
  delete oldFormula.durationSec; delete oldFormula.cuts;
  const parsed = schemas.viral_formula.parse(oldFormula);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.updatedAt, null);
  assert.equal(parsed.durationSec, null);
  assert.equal(parsed.cuts, null);
  const unknown = referenceVideoSchema.parse({id: 'new', product: 'Unknown reference'});
  for (const key of ['durationSec', 'cuts', 'formulaId', 'hookText', 'ctaText']) assert.equal(unknown[key], null);
  assert.equal(referenceVideoSchema.parse({...unknown, cuts: 0}).cuts, 0);
  assert.equal(referenceVideoSchema.safeParse({...unknown, cuts: -1}).success, false);
  assert.equal(referenceVideoSchema.safeParse({...unknown, durationSec: 0}).success, false);
  assert.equal(schemas.product.safeParse({...emptyProduct, name: 'Old product'}).success, true);
});
test('workspace overlays formula pairs and selects latest versions without mutating seed or records', () => {
  const overlay = {...formula, name: 'Workspace v1'};
  const next = {...formula, name: 'Workspace v2', version: 2};
  const added = {...formula, id: 'new-formula', name: 'New formula'};
  const records = [formulaRecord(next), formulaRecord(overlay), formulaRecord(added),
    {id: 'product', kind: 'product', data: next}, {id: 'bad', kind: 'viral_formula', data: {}},
    {id: 'forged', kind: 'viral_formula', data: {...next, version: 99}}];
  const before = structuredClone(records);
  const versions = formulaVersions(records).filter(row => row.id === formula.id);
  assert.deepEqual(versions.map(row => row.version), [2, 1]);
  assert.equal(versions[1].name, 'Workspace v1');
  assert.equal(workspaceFormulas(records).find(row => row.id === formula.id).name, 'Workspace v2');
  assert.deepEqual(workspaceFormulas([...records].reverse()), workspaceFormulas(records));
  assert.equal(workspaceFormulas(records).length, viralFormulas.length + 1);
  assert.equal(formulasForProduct(['night_glow'], workspaceFormulas(records)).find(row => row.id === formula.id).version, 2);
  assert.deepEqual(records, before);
  assert.notEqual(formula.name, overlay.name);
});
const product={id:'p1',kind:'product',revision:1,updatedAt:0,data:{...emptyProduct,name:'Đèn thử',price:30,cost:12,shipping:4,fees:2,buffer:3,proofNotes:'Đã thử công tắc và ánh sáng với sample.'}};
const ex={id:'e1',kind:'experiment',revision:1,updatedAt:0,data:{productId:'p1'}};

test('fee currency hint covers mixed cost/shipping with unknown or nonzero fees and buffer without changing amounts', () => {
  for (const currency of ['USD', 'VND', 'GBP', 'EUR', 'CNY']) {
    const other = currency === 'CNY' ? 'USD' : 'CNY';
    for (const field of ['costCurrency', 'shippingCurrency']) {
      for (const [fees, buffer] of [[2, 0], [0, 3], [2, 3], [null, 0], [0, null], [null, null], [undefined, undefined]]) {
        const data = {...product.data, currency, [field]: other, fees, buffer};
        const before = structuredClone(data);
        assert.equal(productFeeCurrencyHint(data), `Phí và dự phòng tính theo ${currency}`);
        assert.equal(unitMargin(data), null);
        assert.deepEqual(data, before);
      }
      assert.equal(productFeeCurrencyHint({...product.data, currency, [field]: other, fees: 0, buffer: 0}), null);
    }
    for (const overrides of [{}, {costCurrency: null, shippingCurrency: null}, {costCurrency: currency, shippingCurrency: currency}]) {
      for (const fees of [0, 2, null]) {
        assert.equal(productFeeCurrencyHint({...product.data, currency, fees, ...overrides}), null);
      }
    }
  }
  assert.equal(productFeeCurrencyHint({}), null);
});

test('promotion preserves each amount and its currency without converting or relabelling supplier cost', () => {
  const candidate = candidateSchema.parse({id:'mixed', name:'Supplier quote', supplierUrl:'https://example.test/item', evidenceNotes:'Exact SKU quote', risks:'Shipping estimate', cost:36.5, costCurrency:'CNY', shipping:4.25, shippingCurrency:'USD', price:19.99, currency:'USD'});
  const before = structuredClone(candidate);
  const promoted = schemas.product.parse(productFromCandidate('batch', {market:'United States', locale:'en-US'}, candidate));
  for (const field of ['cost', 'shipping', 'price', 'currency', 'costCurrency', 'shippingCurrency']) assert.equal(promoted[field], candidate[field]);
  assert.deepEqual(promoted.researchOrigin, {batchId:'batch', candidateId:'mixed'});
  assert.equal(promoted.proofNotes, 'Exact SKU quote\nShipping estimate');
  assert.equal(promoted.sampleVerified, false);
  assert.equal(promoted.fees, null);
  assert.equal(promoted.buffer, null);
  assert.equal(formatMoney(promoted.cost, productCurrency(promoted, 'cost')), formatMoney(36.5, 'CNY'));
  assert.notEqual(formatMoney(promoted.cost, productCurrency(promoted, 'cost')), formatMoney(36.5, 'USD'));
  assert.equal(unitMargin(promoted), null);
  assert.deepEqual(productFinancials(promoted), promoted);
  assert.deepEqual(candidate, before);

  const unknown = schemas.product.parse(productFromCandidate('batch', {market:'China', locale:'en-US'}, {...candidate, currency:'CNY', costCurrency:null, shippingCurrency:null, shipping:null, price:null}));
  assert.equal(unknown.currency, 'CNY');
  assert.equal(unknown.shipping, null);
  assert.equal(unknown.price, null);
  assert.equal(productCurrency(unknown, 'cost'), 'CNY');
  assert.equal(unitMargin(unknown), null);
});

test('mixed currencies block every unit margin and the commercial gate even with zero costs', () => {
  for (const patch of [
    {costCurrency:'CNY'}, {shippingCurrency:'CNY'},
    {costCurrency:'CNY', shippingCurrency:'CNY'},
    {currency:'CNY', costCurrency:'USD', shippingCurrency:'USD'},
    {cost:0, shipping:0, costCurrency:'CNY'},
  ]) {
    const mixed = schemas.product.parse({...product.data, ...patch, sampleVerified:true});
    assert.equal(unitMargin(mixed), null);
    assert.equal(productMarginLabel(mixed), 'Khác tiền tệ · chưa tính biên');
    assert.match(productGate(mixed), /Khác tiền tệ · chưa tính biên/);
  }
});

test('legacy products without currency overrides still parse and calculate all per-order costs', () => {
  const legacy = {...product.data};
  delete legacy.costCurrency;
  delete legacy.shippingCurrency;
  const parsed = schemas.product.parse(legacy);
  assert.equal(parsed.costCurrency, undefined);
  assert.equal(parsed.shippingCurrency, undefined);
  assert.equal(unitMargin(parsed), 9);
  assert.equal(productMarginLabel(parsed), formatMoney(9, 'USD'));
  for (const currency of ['USD', 'VND', 'GBP', 'EUR', 'CNY']) {
    for (const overrides of [{}, {costCurrency:null, shippingCurrency:null}, {costCurrency:currency, shippingCurrency:currency}]) {
      const row = schemas.product.parse({...legacy, currency, ...overrides, sampleVerified:true});
      assert.equal(unitMargin(row), 9);
      assert.equal(productGate(row), '');
      assert.equal(productCurrency(row, 'cost'), currency);
      assert.equal(productCurrency(row, 'shipping'), currency);
    }
  }
  for (const key of ['currency', 'costCurrency', 'shippingCurrency']) {
    assert.equal(schemas.product.safeParse({...legacy, [key]:'XYZ'}).success, false);
  }
  assert.deepEqual(legacy, parsed);
});

test('money formatting distinguishes unknown amounts from known zero and CNY from USD', () => {
  for (const amount of [null, undefined, NaN, Infinity]) assert.equal(formatMoney(amount, 'CNY'), 'Chưa biết');
  assert.notEqual(formatMoney(0, 'CNY'), 'Chưa biết');
  assert.notEqual(formatMoney(36.5, 'CNY'), formatMoney(36.5, 'USD'));
  assert.equal(productMarginLabel({...product.data, shipping:null}), 'Chưa đủ dữ liệu');
});

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
test('comment intent supports generic products, links and explicit CTA while keeping the one-argument contract',()=>{
  for(const word of ['LED!','RUN 🙏','help'])assert.ok(classifyComment(word).includes('Từ khóa / tò mò'));
  assert.deepEqual(classifyComment('ledger'),['Chưa rõ']);
  assert.deepEqual(classifyComment('How much? Link please. Ship to US? LED!','LED'),['Hỏi giá','Hỏi giao hàng','Hỏi link','Từ khóa / tò mò']);
  assert.deepEqual(classifyComment('Where can I buy?'),['Hỏi link']);
  assert.ok(classifyComment('Does this fit my desk?').includes('Độ phù hợp'));
  assert.ok(classifyComment('desk!','DESK').includes('Từ khóa / tò mò'));
  assert.deepEqual(classifyComment('LED','RUN'),['Chưa rõ']);
});
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
  assert.equal(productStage({...p, data: {...p.data, proofNotes: 'Sample received and checked.'}}, []), 0);
  assert.equal(productStage({...p, data: {...p.data, proofUrl: 'https://supplier.example/sample-proof'}}, []), 1);
});

test('promoted Muse provenance survives parsing and edited notes; legacy prefixes and user proof stay distinct', () => {
  const candidate = candidateSchema.parse({id: 'muse', name: 'Fixture quote', supplierUrl: 'https://supplier.example/quote', evidenceNotes: 'An unverified Muse suggestion.'});
  const promoted = schemas.product.parse(productFromCandidate('batch', {market: 'United States', locale: 'en-US'}, candidate));
  assert.deepEqual(promoted.researchOrigin, {batchId: 'batch', candidateId: 'muse'});
  assert.equal(productStage(stageProduct('promoted', promoted), []), 0);
  const edited = schemas.product.parse({...promoted, proofNotes: 'Reworded suggestion without the old prefix.'});
  const before = structuredClone(edited);
  assert.equal(productStage(stageProduct('edited', edited), []), 0);
  assert.deepEqual(edited, before);
  for (const researchOrigin of [undefined, null]) {
    assert.equal(productStage(stageProduct('legacy', {researchOrigin, proofNotes: '  Muse đề xuất · cần kiểm tra nguồn\nOld suggestion'}), []), 0);
    assert.equal(productStage(stageProduct('manual', {researchOrigin, proofNotes: 'User recorded a supplier quote for this SKU.'}), []), 1);
  }
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
