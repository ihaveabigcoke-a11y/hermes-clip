import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importModule,startLocalServer,sessionCookie} from './helpers/local-server.mjs';
const {planDailySelection,selectionCounts,selectionEntries,candidateProductId}=await importModule('lib/lab/daily-selection.ts');
const {schemas,emptyProduct,vietnamDay}=await importModule('lib/lab/domain.ts');
const now=Date.parse('2026-11-13T01:00:00+07:00');
const batch=(id,createdAt=now)=>({id,kind:'research_batch',revision:1,createdAt,updatedAt:now,data:schemas.research_batch.parse({name:id,candidates:[1,2,3,4].map(i=>({id:'c'+i,name:'Candidate '+i,supplierUrl:'https://supplier.invalid/'+i,evidenceNotes:"Fixture only; not a real supplier quote.",cost:null,shipping:null,price:null}))})});
const apply=(records,input,time=now)=>{const rows=planDailySelection(records,input,time);return [...rows,...records.filter(r=>!rows.some(n=>n.id===r.id))];};
test('T-010: VN midnight, required explicit key/rank and immutable product keys',()=>{
  assert.equal(vietnamDay('2026-11-12T16:59:59Z'),'2026-11-12');assert.equal(vietnamDay('2026-11-12T17:00:00Z'),'2026-11-13');
  const records=[batch('batch_one')],original=structuredClone(records),input={batchId:'batch_one',candidateId:'c1',revision:1,checked:true};
  assert.throws(()=>planDailySelection(records,input,now),/mã sản phẩm/);assert.deepEqual(records,original);
  const selected=apply(records,{...input,productKey:'SP-ONE',rank:2});
  assert.equal(selectionCounts(selected,now).count,1);assert.equal(selectionEntries(selected)[0].rank,2);
  assert.equal(selected.find(r=>r.kind==='product').data.cost,null);
  assert.throws(()=>apply(selected,{...input,revision:2,productKey:'OTHER',rank:2}),/không được thay đổi/);
});
test('T-010: same key over two days keeps one profile, edits, IDs and selectionCount=2',()=>{
  let records=[batch('first_batch'),batch('next_batch',now+86400000)];
  records=apply(records,{batchId:'first_batch',candidateId:'c1',revision:1,checked:true,productKey:'STABLE-KEY',rank:1});
  const product=records.find(r=>r.kind==='product');product.data.proofNotes='Edited by user';
  records=apply(records,{batchId:'next_batch',candidateId:'c2',revision:1,checked:true,productKey:'STABLE-KEY',rank:3},now+86400000);
  assert.equal(records.filter(r=>r.kind==='product').length,1);assert.equal(records.find(r=>r.kind==='product').id,product.id);
  assert.equal(records.find(r=>r.kind==='product').data.proofNotes,'Edited by user');
  assert.equal(selectionEntries(records).length,2);assert.equal(selectionCounts(records,now+86400000).distinctProducts,1);
  assert.equal(candidateProductId(records.find(r=>r.id==='next_batch'),'c2'),product.id);
});
test('T-010: daily cap across batches, rank conflicts, deselection preserves profile and previous day',()=>{
  let records=[batch('batch_first'),batch('batch_second')];
  for(let i=1;i<=3;i++)records=apply(records,{batchId:'batch_first',candidateId:'c'+i,revision:i,checked:true,productKey:'KEY-'+i,rank:i});
  assert.throws(()=>apply(records,{batchId:'batch_second',candidateId:'c1',revision:1,checked:true,productKey:'KEY-4',rank:1}),/đủ 3/);
  const product=records.find(r=>r.kind==='product');
  records=apply(records,{batchId:'batch_first',candidateId:'c3',revision:4,checked:false});
  assert.equal(records.filter(r=>r.kind==='product').length,3);assert.equal(selectionCounts(records,now).count,2);
  assert.throws(()=>apply(records,{batchId:'batch_second',candidateId:'c1',revision:1,checked:true,productKey:'KEY-4',rank:1}),/Thứ hạng/);
  records=apply(records,{batchId:'batch_second',candidateId:'c1',revision:1,checked:true,productKey:'KEY-4',rank:3});
  assert.equal(selectionCounts(records,now).count,3);assert.ok(records.some(r=>r.id===product.id));
});
test('T-010: old records remain readable, old date uses createdAt, selection never invents a historical day',()=>{
  const old=batch('legacy',now-86400000);old.data.selectedIds=['c1'];
  const product={id:'research_legacy_c1',kind:'product',revision:4,createdAt:old.createdAt,updatedAt:now,data:{...emptyProduct,name:'Legacy user profile',proofNotes:'Keep all fields'}};
  let records=[old,product];assert.equal(selectionEntries(records)[0].selectionDay,'2026-11-12');assert.equal(selectionEntries(records)[0].rank,null);
  records=apply(records,{batchId:'legacy',candidateId:'c1',revision:1,checked:true,productKey:'LEGACY',rank:1});
  assert.equal(selectionEntries(records).length,2);assert.equal(records.find(r=>r.id===product.id).data.proofNotes,product.data.proofNotes);
  const untouched=structuredClone(records);records=apply(records,{batchId:'legacy',candidateId:'c1',revision:2,checked:false});
  assert.equal(selectionEntries(records).length,1);assert.equal(selectionEntries(records)[0].selectionDay,'2026-11-12');
  assert.equal(records.find(r=>r.kind==='product').revision,untouched.find(r=>r.kind==='product').revision);
  const empty=batch('old_batch',now-86400000);records=apply([empty],{batchId:empty.id,candidateId:'c2',revision:1,checked:true,productKey:'NEW-TODAY',rank:1});
  assert.deepEqual(selectionEntries(records).map(s=>s.selectionDay),['2026-11-13']);
  const noDate=batch('no_date');delete noDate.createdAt;noDate.data.selectedIds=['c1'];assert.deepEqual(selectionEntries([noDate,{...product,id:'research_no_date_c1'}]),[]);
});
test('T-010: real local HTTP + SQLite serializes concurrent tabs, rolls back conflicts and survives restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-t010-selection-'));let server;
  const request=async(body,query='')=>{const response=await fetch(server.origin+'/api/lab'+query,{method:body?'POST':'GET',headers:{Cookie:sessionCookie+'='+server.session,Origin:server.origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
  try {
    server=await startLocalServer({root,seedPath:join(root,'absent.json')});
    for(const id of ['http_first','http_second'])assert.equal((await request({id,kind:'research_batch',data:batch(id).data})).status,200);
    const input={batchId:'http_first',candidateId:'c1',revision:1,checked:true,productKey:'HTTP-KEY',rank:1};
    const results=await Promise.all([request({action:'select_daily',input}),request({action:'select_daily',input})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const before=(await request()).records;
    assert.equal(before.filter(r=>r.kind==='product').length,1);assert.equal(before.filter(r=>r.kind==='product_selection').length,1);
    assert.equal((await request({action:'select_daily',input:{...input,batchId:'http_second',productKey:'DIFFERENT'}})).status,409);
    assert.deepEqual((await request()).records,before);
    const view=await request(null,'?view=office');assert.equal(view.status,200);assert.equal(view.view.selection.totals.distinctProducts,1);
    const denied=await fetch(server.origin+'/api/lab?view=office');assert.equal(denied.status,401);
    await server.close();server=await startLocalServer({root,seedPath:join(root,'absent.json')});assert.deepEqual((await request()).records,before);
  }finally{await server?.close();await rm(root,{recursive:true,force:true});}
});

test('T-010: reusing a three-choice batch on the next day keeps history and selectedIds within schema',()=>{
 let records=[batch('reuse_batch')];for(let i=1;i<=3;i++)records=apply(records,{batchId:'reuse_batch',candidateId:'c'+i,revision:i,checked:true,productKey:'DAY-'+i,rank:i});
 records=apply(records,{batchId:'reuse_batch',candidateId:'c4',revision:4,checked:true,productKey:'NEXT-DAY',rank:1},now+86400000);
 assert.equal(selectionEntries(records).length,4);assert.equal(selectionCounts(records,now+86400000).count,1);
 assert.deepEqual(schemas.research_batch.parse(records.find(r=>r.id==='reuse_batch').data).selectedIds,['c4']);
});
