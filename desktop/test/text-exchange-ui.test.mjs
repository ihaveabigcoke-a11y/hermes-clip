import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {importModule} from './helpers/local-server.mjs';
import {skillProduct} from '../../tests/fixtures/text-exchange.mjs';
const {default:TextExchange,CodexTextSettings}=await importModule('components/lab/text-exchange.tsx');
const {default:ResearchCandidates}=await importModule('components/lab/research-candidates.tsx');
const {parseTextExchange,mergeTextResearch}=await importModule('lib/lab/codex-exchange.ts');
const {researchBatchSchema}=await importModule('lib/lab/operations.ts');

test('T-003: render all three import/prompt entry points; CLI and setting start off without provider calls',()=>{
  let calls=0;
  for(const [kind,label] of [['research','research'],['content','nội dung'],['landing','landing']]){
    const html=renderToStaticMarkup(React.createElement(TextExchange,{kind,context:{},target:'Fixture target',disabled:false,demo:false,onApply:async()=>calls++}));
    assert.ok(html.includes('Nhập kết quả '+label));assert.ok(html.includes('Copy prompt '+label));assert.match(html,/<button[^>]*disabled=""[^>]*>Chạy Codex CLI<\/button>/);
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
