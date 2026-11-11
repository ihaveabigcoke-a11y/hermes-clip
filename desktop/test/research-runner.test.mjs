import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerHooks} from 'node:module';
import {Store} from '../src/store.mjs';
import {Integrations} from '../src/integrations.mjs';
import {startLocalServer} from '../local/server.mjs';
// Exercise current research source, including API validation, even when local-dist
// belongs to an earlier build. Other local API modules still use the desktop build.
const researchSources=new Map(['operations','muse-workflows'].map(name=>[
 new URL('../local-dist/server/lib/lab/'+name+'.mjs',import.meta.url).href,
 new URL('../../lib/lab/'+name+'.ts',import.meta.url).href,
]));
registerHooks({resolve(specifier,context,next){
 const url=specifier.startsWith('.')||specifier.startsWith('file:')?new URL(specifier,context.parentURL).href:null;
 if(researchSources.has(url))return {url:researchSources.get(url),shortCircuit:true};
 return next(specifier,context);
}});
const {ResearchRunner}=await import('../src/research-runner.mjs');
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

test('research sends the formula brief, stops at three turns and stores decisions and cross-response warnings',()=>fixture(async({runner,chat,counts})=>{
 const send=chat.send,submitted=[];
 chat.send=async payload=>{
  submitted.push(payload);
  const receipt=await send(payload);
  const row=JSON.parse(receipt.response).candidates[0];
  row.name='Night glow product '+submitted.length;
  row.verdict='hold';row.verdictReason='Shipping quote unknown';row.matchType='similar';
  row.visualPayoff='A green leash glowing on a night walk';row.aiFidelityRisks=['Clasp motion'];
  row.logisticsFlags={battery:true,liquid:false};
  row.competition={activeAdsObserved:null,similarReels30d:null};
  receipt.response=JSON.stringify({summary:'Fixture web observation',candidates:[row]});
  return receipt;
 };
 runner.start({requestId:'formula'});await runner.running.promise;
 assert.equal(counts().sends,3);assert.equal(runner.rows()[0].step,3);assert.equal(runner.rows()[0].state,'partial');
 for(const [index,payload] of submitted.entries()){
  const context=JSON.parse(payload.prompt.slice(payload.prompt.lastIndexOf('\n')+1));
  assert.equal(context.remainingSlots,10-index);
  assert.match(context.priority,/visual payoff/);assert.match(context.priority,/Problem → Vs → Result → CTA/);
  assert.match(context.priority,/≤ 20 USD/);assert.match(context.priority,/listing riêng/);
  assert.match(context.priority,/Tối đa 3 lượt/);assert.match(context.priority,/chọn tối đa 3/);
  assert.equal(payload.parentId,index?submitted[index-1].requestId:null);
 }
 const batch=(await runner.records()).find(r=>r.id==='research_formula').data;
 assert.equal(batch.candidates.length,3);assert.deepEqual(batch.selectedIds,[]);
 for(const row of batch.candidates){
  assert.equal(row.verdict,'hold');assert.equal(row.verdictReason,'Shipping quote unknown');assert.equal(row.matchType,'similar');
  assert.equal(row.visualPayoff,'A green leash glowing on a night walk');assert.deepEqual(row.aiFidelityRisks,['Clasp motion']);
  assert.equal(row.logisticsFlags.battery,true);assert.equal(row.logisticsFlags.fragile,null);
  assert.equal(row.competition.activeAdsObserved,null);assert.equal(row.competition.similarReels30d,null);
  assert.deepEqual(row.qualityWarnings,['shared_supplier_url']);assert.equal(row.marketEvidence[0].pageLevel,true);
  assert.equal(row.marketEvidence[0].value,0);assert.equal(row.cost,null);assert.equal(row.shipping,null);
 }
 runner.resume({id:'formula'});await runner.running.promise;
 assert.equal(counts().sends,3);assert.equal((await runner.records()).find(r=>r.id==='research_formula').data.candidates.length,3);
}));

test('saved Muse batches trigger source checks once without spending a Muse turn; network failures stay local',()=>fixture(async({root,store,worker,chat,local,counts})=>{
 let calls=0;
 const integrations=new Integrations(store,root,async()=>{calls++;throw Error('Network unavailable');});
 integrations.saveConfig({python:'python',reach:'agent-reach',montage:root});
 store.set('integration-health',{reach:{ready:true,listingRead:{command:['read'],timeoutFlag:false}}});
 const runner=new ResearchRunner({worker,chat,local,integrations});
 runner.start({requestId:'sources'});await runner.running.promise;await integrations.idle();
 assert.equal(runner.rows()[0].state,'done');assert.equal(counts().sends,1);assert.equal(calls,30);
 const record=(await runner.records()).find(r=>r.id==='research_sources');
 assert.equal(record.data.candidates.length,10);assert.equal(record.data.candidates[0].listingCheck.status,'failed');
 assert.equal(record.data.candidates[0].competition.youtubeShorts.resultCount,null);
 assert.deepEqual(record.data.selectedIds,[]);assert.equal(record.data.candidates[0].cost,null);
 await runner.apply('sources',chat.get('research_sources_0'));await integrations.idle();assert.equal(calls,30);assert.equal(counts().sends,1);
 assert.equal(await runner.queueSources({batchId:'research_sources'}),null);assert.equal(calls,30);
}));

test('manual Muse import can queue source checks using a saved batch ID and honors the auto preference',()=>fixture(async({root,store,worker,chat,local})=>{
 let calls=0;const integrations=new Integrations(store,root,async()=>{calls++;return {ok:true,items:[]};});
 integrations.saveConfig({python:'python',reach:'agent-reach',montage:root});
 store.set('integration-health',{reach:{ready:true}});
 const runner=new ResearchRunner({worker,chat,local,integrations});
 await runner.save({id:'manual_batch',kind:'research_batch',revision:0,data:{name:'Manual fixture',candidates:[{id:'one',name:'Leash fixture',supplierUrl:'https://example.test/item',evidenceNotes:'Muse saved'}]}});
 integrations.saveSourceCheckPreference({enabled:false});assert.equal(await runner.queueSources({batchId:'manual_batch'}),null);assert.equal(calls,0);
 integrations.saveSourceCheckPreference({enabled:true});await runner.queueSources({batchId:'manual_batch'});await integrations.idle();assert.equal(calls,2);
 const record=(await runner.records()).find(r=>r.id==='manual_batch');assert.equal(record.data.candidates[0].listingCheck.status,'unavailable');
 assert.equal(await runner.queueSources({batchId:'manual_batch'}),null);assert.equal(calls,2);
}));
