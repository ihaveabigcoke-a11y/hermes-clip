import test from 'node:test';
import assert from 'node:assert/strict';
import {schemas,productFromCandidate} from '../lib/lab/domain.ts';
import {researchBatchSchema,researchProductId} from '../lib/lab/operations.ts';
import {completeResearchProfiles,deployResearchProducts,researchSelection,saveResearchSelection} from '../lib/lab/research-selection.ts';
import {t005Batch} from './fixtures/t005-research.mjs';

test('T-005: valid candidates at text/ID boundaries promote without changing the full source',()=>{
  const batch=t005Batch(researchBatchSchema), original=structuredClone(batch);
  for(const candidate of [batch.candidates[0],{...batch.candidates[0],id:'a'.repeat(120),name:'N'.repeat(120),evidenceNotes:'😀'.repeat(1500),risks:'R'.repeat(2000),contentAngle:'😀'.repeat(1000)}]) {
    const source=structuredClone(candidate), batchId='b'.repeat(120);
    const product=schemas.product.parse(productFromCandidate(batchId,batch,candidate));
    assert.ok(product.problem.length<=1000);assert.ok(product.proofNotes.length<=2000);
    for(const key of ['problem','proofNotes'])assert.match(product[key],/…\[đã rút gọn, xem đầy đủ ở ứng viên research\]$/);
    assert.deepEqual(product.researchOrigin,{batchId,candidateId:candidate.id});
    assert.equal(product.cost,null);assert.equal(product.shipping,null);assert.deepEqual(candidate,source);
    assert.match(researchProductId(batchId,candidate.id),/^[a-zA-Z0-9_-]{1,120}$/);
    assert.notEqual(researchProductId(batchId,candidate.id),researchProductId(batchId,candidate.id+'z'));
  }
  const short={...batch.candidates[0],evidenceNotes:'Full note',risks:'Full risk',contentAngle:'Full angle'};
  assert.equal(productFromCandidate('batch',batch,short).proofNotes,'Full note\nFull risk');
  assert.equal(productFromCandidate('batch',batch,short).problem,'Full angle');
  assert.equal(researchProductId('batch','candidate'),'research_batch_candidate');
  assert.deepEqual(batch,original);
});

test('T-005: complete all three, retry uncertain replies, preserve existing profiles and selection',async()=>{
  const batch={id:'batch',kind:'research_batch',revision:1,updatedAt:1,data:t005Batch(researchBatchSchema)};
  const original=structuredClone(batch), records=[batch];let attempts=0, fail=true;
  const persist=async(kind,id,data,revision,action)=>{
    attempts++;assert.equal(kind,'product');assert.equal(action,'promote');
    let record=records.find(row=>row.id===id);
    if(!record){record={id,kind,data:schemas.product.parse(data),revision:1,updatedAt:1};records.push(record);}
    if(fail&&id.endsWith('candidate_2'))throw Error('Mất phản hồi sau lưu');
    return record;
  };
  const errors=await completeResearchProfiles(batch,[],persist);
  assert.match(errors.candidate_2,/Mất phản hồi/);assert.equal(attempts,3);assert.equal(records.length,4);
  fail=false;records[1].data.name='Tên do người dùng sửa';
  assert.deepEqual(await completeResearchProfiles(batch,[],persist),{});assert.equal(records.length,4);
  assert.equal(records[1].data.name,'Tên do người dùng sửa');assert.equal(attempts,6);
  await completeResearchProfiles(batch,records,persist);assert.equal(attempts,6);
  assert.equal(researchSelection(batch,records).ready.length,3);assert.deepEqual(batch,original);
});

test('T-005: promote errors name every field, keep selection, and continue independent rows',async()=>{
  const record={id:'errors',kind:'research_batch',revision:1,updatedAt:1,data:t005Batch(researchBatchSchema)};
  const calls=[];
  const persist=async(kind,id)=>{calls.push(id);if(id.endsWith('candidate_2'))throw Object.assign(Error('Kiểm tra các trường được đánh dấu.'),{fields:{problem:'Tối đa 1000 ký tự.',proofNotes:'Tối đa 2000 ký tự.'}});return {id,kind,data:{},revision:1,updatedAt:1};};
  const errors=await completeResearchProfiles(record,[],persist);
  assert.equal(calls.length,3);assert.deepEqual(Object.keys(errors),['candidate_2']);
  assert.match(errors.candidate_2,/Vấn đề \/ ý tưởng video \(problem\)/);assert.match(errors.candidate_2,/Ghi chú bằng chứng \(proofNotes\)/);
  await assert.rejects(saveResearchSelection(record,'candidate_2',true,persist),/proofNotes/);
  assert.equal(record.data.selectedIds.length,3);
});

test('T-005: deploy uses create only, auto provider, actual created count, and continues after a partial failure',async()=>{
  const products=[1,2,3].map(i=>({id:`p${i}`,kind:'product',data:{name:`Product ${i}`,locale:'en-US'},revision:1,updatedAt:1}));
  const projects=[];let fail=true, calls=0;
  const create=async envelope=>{
    calls++;assert.equal(envelope.action,'create');assert.equal(envelope.input.reuseProduct,true);
    assert.equal(envelope.input.mediaProvider,undefined);assert.equal(envelope.input.creativeId,undefined);
    if(fail&&envelope.input.productId==='p2')throw Error('Fixture failure');
    const existing=projects.find(row=>row.data.productId===envelope.input.productId);if(existing)return {record:existing,deduplicated:true};
    const record={id:envelope.id,kind:'production',revision:1,updatedAt:1,data:envelope.input};projects.push(record);return {record};
  };
  const partial=await deployResearchProducts(products,create);assert.equal(partial.created,2);assert.equal(partial.errors.length,1);assert.equal(calls,3);
  fail=false;const completed=await deployResearchProducts(products,create);assert.equal(completed.created,1);assert.equal(completed.projects.length,3);
  assert.equal((await deployResearchProducts(products,create)).created,0);assert.equal(projects.length,3);
});
