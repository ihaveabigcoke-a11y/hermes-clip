import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {ResearchRunner} from '../src/research-runner.mjs';
import {startLocalServer} from '../local/server.mjs';
async function fixture(run){
 const root=await mkdtemp(join(tmpdir(),'hermes-research-'));const store=new Store(join(root,'worker.sqlite'));
 const local=await startLocalServer({root:join(root,'workspace'),seedPath:join(root,'no-seed.json')});
 const worker={store,root,profiles:()=>[{id:'profile',enabled:true,busy:false}],contexts:new Map(),active:new Map(),chatting:new Set()};
 const chats=new Map();let sends=0,recovers=0;
 const chat={get:id=>chats.get(id),send:async payload=>{sends++;const value={...payload,state:'done',providerUrl:'https://muse.ai/thread/research',response:JSON.stringify({summary:'Observed fixture sources',candidates:Array.from({length:10},(_,i)=>({name:'Fixture product '+i,supplierUrl:'https://example.com/item/'+i,evidenceNotes:'Fixture evidence',imageUrl:'https://example.com/photo/'+i+'.jpg',marketEvidence:[{label:'Reviews',value:i,unit:'reviews',market:'US',period:'Cumulative',sourceUrl:'https://example.com/item/'+i,observedAt:'2026-11-11T00:00:00Z'}]}))})};chats.set(payload.requestId,value);return value;},recover:async({requestId})=>{recovers++;return chats.get(requestId);}};
 const runner=new ResearchRunner({worker,chat,local});
 try{await run({root,store,local,worker,chats,chat,runner,counts:()=>({sends,recovers})});}finally{await runner.running?.promise;await local.close();store.close();await rm(root,{recursive:true,force:true});}
}
test('background research persists ten numeric/photo candidates without renderer and duplicate start does not resend',()=>fixture(async({runner,counts})=>{
 const a=runner.start({requestId:'one',query:'Find products'});assert.equal(runner.start({requestId:'one',query:'Find products'}).id,a.id);
 assert.throws(()=>runner.start({requestId:'two',query:'Find products'}),/đang nghiên cứu/);await runner.running.promise;
 assert.equal(runner.rows()[0].state,'done');const records=await runner.records();const batch=records.find(r=>r.id===a.batchId);
 assert.equal(batch.data.candidates.length,10);assert.equal(batch.data.selectedIds.length,0);assert.equal(batch.data.candidates[0].marketEvidence[0].value,0);assert.equal(counts().sends,1);
 assert.equal(runner.start({requestId:'one'}).state,'done');assert.equal(counts().sends,1);
}));
test('restart after completed response imports the existing receipt without submitting again',()=>fixture(async({runner,store,chats,chat,worker,local,counts})=>{
 const response=await chat.send({requestId:'research_resume_0',projectId:'research_resume',profileId:'profile'});
 store.set('research_runs',[{id:'resume',batchId:'research_resume',profileId:'profile',query:'Find products',state:'running',createdAt:Date.now(),step:0,count:0,requestIds:[response.requestId]}]);
 const resumed=new ResearchRunner({worker,chat,local});resumed.boot();await resumed.running.promise;
 assert.equal(resumed.rows()[0].state,'done');assert.equal(counts().sends,1);assert.equal(counts().recovers,0);
}));
test('uncertain research is reconciled once, kept blocked, and never automatically resent',()=>fixture(async({runner,store,chats,counts})=>{
 chats.set('research_uncertain_0',{requestId:'research_uncertain_0',state:'needs_attention',error:'Delivery uncertain'});
 store.set('research_runs',[{id:'uncertain',batchId:'research_uncertain',profileId:'profile',query:'Find products',state:'running',createdAt:Date.now(),step:0,count:0,requestIds:['research_uncertain_0']}]);
 runner.boot();await runner.running.promise;assert.equal(runner.rows()[0].state,'needs_attention');assert.equal(counts().sends,0);assert.equal(counts().recovers,1);
 runner.boot();assert.equal(runner.running,null);
}));

test('resume at exhausted step replays completed receipts locally without a new Muse send',()=>fixture(async({runner,store,chat,counts})=>{
 const receipt=await chat.send({requestId:'research_legacy_0',projectId:'research_legacy',profileId:'profile'});
 store.set('research_runs',[{id:'legacy',batchId:'research_legacy',profileId:'profile',query:'Find products',state:'partial',createdAt:Date.now(),step:3,count:0,requestIds:[receipt.requestId]}]);
 runner.resume({id:'legacy'});await runner.running.promise;
 assert.equal(runner.rows()[0].count,10);assert.equal(runner.rows()[0].state,'done');
 assert.deepEqual(counts(),{sends:1,recovers:0});
}));
test('profile quota is not reset by research and malformed output is retained for inspection',()=>fixture(async({runner,store,chat,counts})=>{
 store.set('generation_batch',{id:'batch',submittedByProfile:{profile:3}});assert.throws(()=>runner.start({requestId:'limited'}),/còn lượt/);assert.equal(store.batch().id,'batch');
 store.set('generation_batch',{id:'batch',submittedByProfile:{profile:0}});
 chat.send=async payload=>({...payload,state:'done',response:'invalid JSON'});
 runner.start({requestId:'invalid'});await runner.running.promise;assert.equal(runner.rows()[0].state,'needs_attention');assert.match(runner.rows()[0].error,/cấu trúc/);
}));
