import {importApiModule} from '../desktop/test/helpers/local-server.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {call} from './runtime-fixture.mjs';
const route=await importApiModule('app/api/codex/route.ts');
const lab=await importApiModule('app/api/lab/route.ts');
const production=await importApiModule('app/api/production/route.ts');
const {emptyProduct}=await importApiModule('lib/lab/domain.ts');

const report = projectId => ({schemaVersion:1,missionId:'real_report_contract',projectId,startedAt:100,finishedAt:200,status:'completed',steps:[{stepId:'research',type:'research',jobId:'local-job',channel:'web',query:'customer problems',sources:[{title:'Source',url:'https://example.org/source',excerpt:'Unreviewed excerpt'}],frameCount:0,artifactSha256:'a'.repeat(64)}]});
const request = (who,path,payload,origin='https://qa.invalid') => new Request('https://qa.invalid'+path,{method:payload?'POST':'GET',headers:{...(who?{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.invalid'}:{}),...(payload?{'Content-Type':'application/json',Origin:origin}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
async function json(handler,who,path,payload,origin){const response=await call(handler,request(who,path,payload,origin));return {status:response.status,data:await response.json()};}

test('Codex imports are owner-scoped, immutable, replay-safe and never approve media or product claims',async()=>{
  const who='codex-owner',projectId='codex_project';
  assert.equal((await json(lab.POST,who,'/api/lab',{id:'codex_product',kind:'product',revision:0,data:{...emptyProduct,name:'Unverified product',price:30,cost:8}})).status,200);
  const p=await json(production.POST,who,'/api/production',{id:projectId,revision:0,commandId:'create_codex',action:'create',input:{productId:'codex_product',name:'Codex project',locale:'en-US'}});
  assert.equal(p.status,200);
  const exchange=report(projectId),post=(user=who,input=exchange,origin)=>json(route.POST,user,'/api/codex',{exchange:input},origin);
  assert.equal((await post(null)).status,401);
  assert.equal((await post('foreign-owner')).status,404);
  assert.equal((await post(who,exchange,'https://other.invalid')).status,403);
  assert.equal((await post(who,{...exchange,projectId:'missing'})).status,404);
  assert.equal((await post(who,{...exchange,apiKey:'must-not-store'})).status,422);
  assert.equal((await post(who,{...exchange,steps:[{...exchange.steps[0],sources:[{title:'Bad',url:'javascript:alert(1)',excerpt:''}]}]})).status,422);
  const [first,second]=await Promise.all([post(),post()]);
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(first.data.record.id,second.data.record.id);
  assert.deepEqual([first.data.deduplicated,second.data.deduplicated].sort(),[false,true]);
  const replay=await post();assert.equal(replay.data.deduplicated,true);assert.equal(replay.data.record.revision,1);
  assert.equal(replay.data.record.data.interpretation,'unreviewed');
  assert.equal((await json(lab.POST,who,'/api/lab',{...replay.data.record,data:{...replay.data.record.data,interpretation:'approved'}})).status,400);
  const all=await json(lab.GET,who,'/api/lab');
  assert.equal(all.data.records.filter(r=>r.kind==='codex_run').length,1);
  assert.equal(all.data.records.find(r=>r.id===projectId).data.scenes.length,0);
  assert.equal(all.data.records.find(r=>r.kind==='product').data.sampleVerified,false);
  assert.equal(all.data.records.some(r=>r.kind==='asset'),false);
  assert.equal((await json(lab.GET,'foreign-owner','/api/lab')).data.records.length,0);
});
