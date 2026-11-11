import test from 'node:test';
import assert from 'node:assert/strict';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {workflowGuidance} from '../lib/lab/workflow-guidance.ts';
import {productNextStep,latestProductProduction} from '../lib/lab/product-next-step.ts';
import {schemas} from '../lib/lab/domain.ts';
import {productStage} from '../lib/lab/product-stage.ts';
import {sampleCheckWarning} from '../lib/lab/sample-check.ts';
import {nextStepFixture,nextRecord} from './fixtures/product-next-step.mjs';

test('product next step 1: ask supplier first for missing costs or mismatched currencies',()=>{
  const {product,records}=nextStepFixture();
  for(const patch of [{cost:null},{shipping:null},{costCurrency:'CNY',shippingCurrency:'USD'},{currency:null},{cost:NaN},{cost:-1}]) {
    const step=productNextStep({...product,data:{...product.data,...patch,sampleCheck:null}},records);
    assert.equal(step.stage,'supplier');assert.equal(step.title,'Hỏi giá nhà cung cấp');assert.equal(step.actionView,'products');
    assert.match(step.detail,/thiếu|chưa rõ|khác tiền tệ/);
  }
  assert.equal(productNextStep({...product,data:{...product.data,cost:0,shipping:0}},records).stage,'metrics');
  assert.equal(productNextStep({...product,data:{...product.data,costCurrency:'CNY',shippingCurrency:'CNY'}},records).stage,'metrics','only cost + shipping currencies must match; no conversion');
  const legacy={...product,data:{...product.data,cost:0,researchOrigin:{batchId:'b',candidateId:'c'},proofNotes:'cost chưa biết, hồ sơ tạm ghi 0'}};
  assert.equal(productNextStep(legacy,records).stage,'supplier');
});
test('product next step 2: require explicit sample/video confirmation even with legacy verification',()=>{
  const {product,records}=nextStepFixture();
  for(const sampleCheck of [undefined,null,{}, {matchesVideo:null},{matchesVideo:false}]){
    const step=productNextStep({...product,data:{...product.data,sampleVerified:true,sampleCheck}},records);
    assert.equal(step.stage,'sample');assert.equal(step.title,'Kiểm mẫu thật');assert.equal(step.actionView,'products');
    if(sampleCheck?.matchesVideo===false)assert.match(step.detail,/không khớp/);
  }
});
test('product next step 3: no production points to formula script creation',()=>{
  const {product,production}=nextStepFixture();
  for(const records of [[],[{...production,data:{...production.data,productId:'other'}}],[{...production,data:{...production.data,archived:true}}]]){
    assert.deepEqual(productNextStep(product,records),{stage:'production',title:'Tạo kịch bản theo công thức',detail:'Chưa có dự án sản xuất cho sản phẩm. Tạo dự án, rồi chọn Mẫu prompt để soạn kịch bản nháp theo công thức.',actionView:'production'});
  }
});
test('product next step 4: latest active project uses workflow guidance before account/publish',()=>{
  const {product,production,records}=nextStepFixture();
  const latest=structuredClone(production);latest.id='latest';latest.updatedAt=2000;
  latest.data.scenes[0].takes[0].review='pending';
  const foreign={...production,id:'foreign',updatedAt:4000,data:{...production.data,productId:'other'}};
  const archived={...production,id:'archived',updatedAt:5000,data:{...production.data,archived:true}};
  const all=[...records,latest,foreign,archived],before=structuredClone(all);
  assert.equal(latestProductProduction(product,all).id,latest.id);
  const expected=workflowGuidance(latest.data,product.revision);
  assert.deepEqual(productNextStep(product,all),{stage:expected.stage,title:expected.title,detail:expected.detail,actionView:'production'});
  assert.equal(expected.stage,'library');assert.deepEqual(all,before);
  latest.data.scenes[0].attempts.push({id:'attempt',requestId:'fixture_request',sceneRevision:1,snapshot:'{}',status:'unknown',providerJobId:'',usageUsd:null,createdAt:1000});
  assert.equal(productNextStep(product,all).stage,'queue');
  assert.equal(productNextStep({...product,revision:2},all).stage,'references');
});
test('product next step 5: account must belong to product, be active and have a username',()=>{
  const {product,production,account}=nextStepFixture();
  for(const data of [null,{...account.data,archived:true},{...account.data,productId:'other'},{...account.data,handle:''}]){
    const step=productNextStep(product,[production,...(data?[{...account,data}]:[])]);
    assert.equal(step.stage,'account');assert.equal(step.title,'Gắn tài khoản');assert.equal(step.actionView,'social');
  }
});
test('product next step keeps rejected hook takes in production guidance even when another variant is ready',()=>{
  const {product,production,records}=nextStepFixture();
  production.data.scenes.find(scene=>scene.role==='hook').takes[0].review='rejected';
  const guidance=workflowGuidance(production.data,product.revision);
  assert.ok(guidance.approved<guidance.total);
  assert.equal(guidance.stage,'variants');
  assert.deepEqual(productNextStep(product,records),{stage:guidance.stage,title:guidance.title,detail:guidance.detail,actionView:'production'});
});
test('product next step 6: planned/draft/foreign/archived posts are not published',()=>{
  const {product,production,account,plan}=nextStepFixture();
  for(const data of [null,{...plan.data,status:'planned'},{...plan.data,status:'draft'},{...plan.data,archived:true},{...plan.data,productId:'other'}]){
    const step=productNextStep(product,[production,account,...(data?[{...plan,data}]:[])]);
    assert.equal(step.stage,'publish');assert.equal(step.title,'Đăng bài đã duyệt');assert.equal(step.actionView,'social');
  }
});
test('product next step 7: published evidence leads to metrics; missing measurements remain missing',()=>{
  const {product,plan,records}=nextStepFixture();
  for(const status of ['published','published_manual','published_browser']){
    plan.data.status=status;const step=productNextStep(product,records);
    assert.equal(step.stage,'metrics');assert.equal(step.title,'Đọc số liệu / so hook');assert.equal(step.actionView,'social');assert.match(step.detail,/chưa có bản đo/);
  }
  const metric=nextRecord('social_metric','metric',{planId:plan.id,observedAt:'2026-11-12T00:00:00Z',views:0,likes:null});
  assert.match(productNextStep(product,[...records,{...metric,data:{...metric.data,planId:'other'}}]).detail,/chưa có bản đo/);
  assert.match(productNextStep(product,[...records,metric]).detail,/Đã có bài đăng và bản đo/);
  assert.equal(metric.data.likes,null);assert.equal(metric.data.views,0);
});
test('missing or malformed production data reports what is missing, never claims ready to publish',()=>{
  const {product,production,records}=nextStepFixture();
  production.data={productId:product.id};
  assert.equal(productNextStep(product,records).title,'Kiểm tra dữ liệu dự án');
  production.data=newProduction('Empty',product.id,product.revision);
  assert.equal(productNextStep(product,records).stage,'scenes');
});
test('sample checklist is optional for legacy products; null, false, dates and asset IDs round trip',()=>{
  const {product}=nextStepFixture();const legacy={...product.data};delete legacy.sampleCheck;
  assert.equal(schemas.product.parse(legacy).sampleCheck,undefined);
  assert.equal(schemas.product.parse({...legacy,sampleCheck:null}).sampleCheck,null);
  const sampleCheck={receivedAt:'2026-11-12',matchesVideo:false,colorSizeMatches:null,packagingIntact:true,notes:'Physical sample differs',photos:['asset_photo']};
  assert.deepEqual(schemas.product.parse({...legacy,sampleCheck}).sampleCheck,sampleCheck);
  assert.deepEqual(schemas.product.parse({...legacy,sampleCheck:{}}).sampleCheck,{receivedAt:null,matchesVideo:null,notes:''});
  for(const patch of [{receivedAt:'not-a-date'},{matchesVideo:'true'},{colorSizeMatches:0},{photos:['../secret']},{notes:'x'.repeat(2001)}])assert.equal(schemas.product.safeParse({...legacy,sampleCheck:{...sampleCheck,...patch}}).success,false);
  assert.match(sampleCheckWarning(legacy),/^Chưa kiểm mẫu/);
  assert.match(sampleCheckWarning({sampleCheck}),/không khớp/);
  assert.equal(sampleCheckWarning({sampleCheck:{matchesVideo:true}}),null);
  assert.equal(productStage(product,[]),1);
});
const scene=()=>applyProduction(newProduction('Test','product',1),'scene',{id:'scene_one',name:'Body',prompt:'Show product',role:'body',mediaType:'video',ratio:'9:16',duration:5,referenceIds:[]},'scene');
test('guidance prioritizes revision and unknown submits before spending or review',()=>{const p=scene();p.scenes[0].attempts.push({status:'unknown'});assert.equal(workflowGuidance(p,2).stage,'references');assert.equal(workflowGuidance(p,1).stage,'queue');assert.equal(workflowGuidance(p,1).unknown,1);});
test('draft, storyboard and missing media lead to distinct next actions',()=>{assert.equal(workflowGuidance(newProduction('Test','product',1),1).stage,'scenes');const p=scene();assert.match(workflowGuidance(p,1).title,/kịch bản/);p.scenes[0].storyboardApproved=true;assert.equal(workflowGuidance(p,1).stage,'desktop');});
test('a formally approved wrong-aspect take is never counted as valid',()=>{const p=scene(),s=p.scenes[0];s.storyboardApproved=true;s.takes.push({review:'approved',sceneRevision:1,type:'video/mp4',metadata:{width:832,height:1104,duration:5}});const g=workflowGuidance(p,1);assert.equal(g.approved,0);assert.equal(g.stage,'library');assert.equal(g.total,1);s.takes.push({...s.takes[0],review:'pending'});assert.match(workflowGuidance(p,1).title,/^1 cảnh/);});
