import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {importModule} from './helpers/local-server.mjs';
import {skillProduct} from '../../tests/fixtures/text-exchange.mjs';
const {default:TextExchange,CodexTextSettings,subscribeTextReceipts}=await importModule('components/lab/text-exchange.tsx');
const {default:ResearchCandidates}=await importModule('components/lab/research-candidates.tsx');
const {parseTextExchange,mergeTextResearch}=await importModule('lib/lab/codex-exchange.ts');
const {researchBatchSchema}=await importModule('lib/lab/operations.ts');

test('T-003: render all three import/prompt entry points; CLI and setting start off without provider calls',()=>{
  let calls=0;
  for(const [kind,label] of [['research','nghiên cứu'],['content','nội dung'],['landing','trang giới thiệu']]){
    const html=renderToStaticMarkup(React.createElement(TextExchange,{kind,context:{},target:'Fixture target',disabled:false,demo:false,onApply:async()=>calls++}));
    assert.ok(html.includes('Nhập kết quả '+label));assert.ok(html.includes('Sao chép prompt '+label));assert.match(html,/<button[^>]*disabled=""[^>]*>Chạy Codex CLI<\/button>/);
    assert.match(html,/Mặc định: Nhập JSON/);assert.doesNotMatch(html,/Mặc định: (import:json|codex|muse)/);
    assert.match(html,/Fixture target/);
  }
  const html=renderToStaticMarkup(React.createElement(CodexTextSettings,{demo:false}));
  assert.match(html,/Bật Codex CLI/);assert.doesNotMatch(html,/<input[^>]*checked=/);assert.equal(calls,0);
});
test('T-003: imported candidate badges show verdict/logistics/source, missing supplier does not crash or become zero',()=>{
  const result=parseTextExchange('research',JSON.stringify({...skillProduct,cost:null,costCurrency:null,listingStatus:'not_found',supplierUrl:null}),'Claude');
  const data=mergeTextResearch(researchBatchSchema.parse({name:'UI fixture'}),result,'fixture');
  const before=structuredClone(data);
  const html=renderToStaticMarkup(React.createElement(ResearchCandidates,{record:{id:'fixture',kind:'research_batch',data},records:[],disabled:false,onEdit(){throw Error('Unexpected edit');},onSelect(){throw Error('Unexpected selection');}}));
  for(const label of ['Giữ','Dễ vỡ','import:Claude','Chưa có listing','Vốn: Chưa biết','Ship: Chưa biết'])assert.ok(html.includes(label),label);
  assert.deepEqual(data,before);
});

test('T-002c: receipt subscription is idle for 10 seconds, refreshes once per workspace event and cleans up',async t=>{
  const previousWindow=globalThis.window;
  const target=new EventTarget(),calls={current:0,legacy:0,research:0};
  const rows=[];
  globalThis.window=Object.assign(target,{productLabDesktop:{
    museChatList:async({projectId})=>{calls[projectId==='batch'?'current':'legacy']++;return [];},
    researchStatus:async()=>{calls.research++;return {runs:[{batchId:'batch',state:'needs_attention'}]};},
  }});
  t.mock.timers.enable({apis:['setInterval','setTimeout']});
  const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
  const stop=subscribeTextReceipts('research','batch',value=>rows.push(value),()=>assert.fail('Unexpected receipt failure'));
  t.after(()=>{stop();globalThis.window=previousWindow;});await flush();
  assert.deepEqual(calls,{current:1,legacy:1,research:1});assert.equal(rows.length,1);
  assert.deepEqual(rows[0],[{provider:'muse',state:'needs_attention',reconciled:false}]);
  t.mock.timers.tick(10000);await flush();
  assert.deepEqual(calls,{current:1,legacy:1,research:1});assert.equal(rows.length,1);
  target.dispatchEvent(new Event('product-lab:workspace-changed'));await flush();
  assert.deepEqual(calls,{current:2,legacy:2,research:2});assert.equal(rows.length,2);
  stop();target.dispatchEvent(new Event('product-lab:workspace-changed'));t.mock.timers.tick(10000);await flush();
  assert.deepEqual(calls,{current:2,legacy:2,research:2});assert.equal(rows.length,2);
});

test('T-002c: unmounted receipt subscription ignores pending replies and removes its listener',async t=>{
  const previousWindow=globalThis.window,target=new EventTarget(),reply=Promise.withResolvers();let calls=0,updates=0;
  globalThis.window=Object.assign(target,{productLabDesktop:{museChatList:()=>{calls++;return reply.promise;}}});
  t.after(()=>{globalThis.window=previousWindow;});
  const stop=subscribeTextReceipts('content','product',()=>updates++,()=>updates++);
  stop();reply.resolve([]);for(let i=0;i<5;i++)await Promise.resolve();
  target.dispatchEvent(new Event('product-lab:workspace-changed'));
  assert.equal(calls,1);assert.equal(updates,0);
});
