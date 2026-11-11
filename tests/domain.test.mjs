import test from 'node:test';
import assert from 'node:assert/strict';
import {schemas,emptyProduct,unitMargin,productGate,metricAdvice,makeBriefs,classifyComment,formatMoney} from '../lib/lab/domain.ts';
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
