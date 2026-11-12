import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {startLocalServer,sessionCookie,getTestBuild,outputs} from './helpers/local-server.mjs';
import {t005Batch} from '../../tests/fixtures/t005-research.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {moduleUrl}=await getTestBuild();
const {productFromCandidate}=await import(moduleUrl('lib/lab/domain.ts'));
const {researchBatchSchema,researchProductId}=await import(moduleUrl('lib/lab/operations.ts'));
const {default:ResearchCandidates}=await import(moduleUrl('components/lab/research-candidates.tsx'));

test('T-005: render missing/ready profiles, bulk controls, field errors, and research provenance',()=>{
  const record={id:'fixture',kind:'research_batch',revision:1,updatedAt:1,data:t005Batch(researchBatchSchema)};
  const original=structuredClone(record);
  const render=records=>renderToStaticMarkup(React.createElement(ResearchCandidates,{record,records,disabled:false,onEdit(){},onSelect(){},onComplete(){},onDeploy(){},
    promotionErrors:{candidate_1:'Vấn đề / ý tưởng video (problem): Tối đa 1000 ký tự. Ghi chú bằng chứng (proofNotes): Tối đa 2000 ký tự.'}}));
  const missing=render([record]);assert.match(missing,/3 sản phẩm chưa tạo hồ sơ/);assert.match(missing,/>Hoàn tất tạo hồ sơ<\/button>/);
  assert.match(missing,/problem/);assert.match(missing,/proofNotes/);assert.match(missing,/0\/3 hồ sơ sẵn sàng/);
  assert.match(missing,/<button[^>]*disabled=""[^>]*>Triển khai 0 sản phẩm →<\/button>/);
  assert.equal((missing.match(/>Hoàn tất chọn<\/button>/g)??[]).length,3);
  assert.match(missing,/Nguồn research: Muse/);assert.doesNotMatch(missing,/Nhà cung cấp: muse/);
  const products=record.data.candidates.slice(0,3).map(candidate=>({id:researchProductId(record.id,candidate.id),kind:'product',revision:1,updatedAt:1,data:productFromCandidate(record.id,record.data,candidate)}));
  const ready=render([record,...products]);assert.match(ready,/✓ 3\/3 hồ sơ sẵn sàng/);
  assert.doesNotMatch(ready,/Hoàn tất tạo hồ sơ|Hoàn tất chọn|Tối đa 1000/);
  const deployButton=ready.match(/<button[^>]*>Triển khai 3 sản phẩm →<\/button>/)?.[0];
  assert.ok(deployButton);assert.match(deployButton,/class="[^"]*\blab-button primary\b[^"]*"/);assert.doesNotMatch(deployButton,/disabled=""/);
  assert.deepEqual(record,original);
});

test('T-005: three selected candidates and three empty projects survive fixture SQLite restart with durable dedupe',async()=>{
  const root=await mkdtemp(join(resolve(outputs),'T-005-db-'));let server, providerRequests=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,...args)=>{if(!server||new URL(url).origin!==server.origin){providerRequests++;throw Error('External requests forbidden');}return originalFetch(url,...args);};
  const request=async(path,payload)=>{
    const response=await fetch(server.origin+path,{method:payload?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:response.status,...await response.json()};
  };
  try {
    server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    const batch=t005Batch(researchBatchSchema),batchRecord=await request('/api/lab',{kind:'research_batch',id:'fixture',revision:0,data:batch});
    assert.equal(batchRecord.status,200);
    for(const candidate of batch.candidates.slice(0,3)) {
      const productId=researchProductId('fixture',candidate.id);
      const promoted=await request('/api/lab',{kind:'product',id:productId,revision:0,action:'promote',data:productFromCandidate('fixture',batch,candidate)});
      assert.equal(promoted.status,200);assert.match(promoted.record.data.proofNotes,/đã rút gọn/);
      const create=suffix=>request('/api/production',{id:candidate.id+suffix,revision:0,commandId:candidate.id+suffix,action:'create',input:{name:candidate.name,productId,locale:'en-US',reuseProduct:true}});
      const pair=await Promise.all([create('_tab1'),create('_tab2')]);pair.forEach(result=>assert.equal(result.status,200,JSON.stringify(result)));
      assert.equal(pair[0].record.id,pair[1].record.id);
    }
    const before=(await request('/api/lab')).records;
    await server.close();server=await startLocalServer({root,seedPath:join(root,'no-seed.json')});
    for(const candidate of batch.candidates.slice(0,3)) {
      const repeated=await request('/api/production',{id:candidate.id+'_restart',revision:0,commandId:candidate.id+'_restart',action:'create',input:{name:candidate.name,productId:researchProductId('fixture',candidate.id),locale:'en-US',reuseProduct:true}});
      assert.equal(repeated.status,200);assert.equal(repeated.deduplicated,true);
      assert.deepEqual(repeated.record.data.scenes,[]);assert.deepEqual(repeated.record.data.exports,[]);
    }
    const after=(await request('/api/lab')).records;assert.deepEqual(after,before);
    assert.equal(after.filter(row=>row.kind==='product').length,3);assert.equal(after.filter(row=>row.kind==='production').length,3);
    assert.deepEqual(after.find(row=>row.kind==='research_batch'),batchRecord.record);assert.equal(providerRequests,0);
  }finally{globalThis.fetch=originalFetch;await server?.close();await rm(root,{recursive:true,force:true});}
});
