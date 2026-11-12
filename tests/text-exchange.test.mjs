import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextExchange, mergeTextResearch, importTextResearch, textTaskPrompt, exchangeByteLimit} from '../lib/lab/codex-exchange.ts';
import {researchBatchSchema} from '../lib/lab/operations.ts';
import {skillProduct, researchResult, contentResult, landingResult} from './fixtures/text-exchange.mjs';

test('T-003: import all ten candidates with source, preserve null and selections, replay does not duplicate',()=>{
  const result=parseTextExchange('research',JSON.stringify(researchResult),'Gemini Deep Research');
  const empty=researchBatchSchema.parse({name:'Import fixture'});
  const batch=mergeTextResearch(empty,result,'one');
  assert.equal(batch.candidates.length,10);assert.deepEqual(batch.selectedIds,[]);
  for(const c of batch.candidates){assert.equal(c.cost,null);assert.equal(c.shipping,null);assert.equal(c.price,null);assert.equal(c.source,'import:Gemini Deep Research');}
  const selected={...batch,selectedIds:[batch.candidates[0].id]};
  assert.equal(mergeTextResearch(selected,result,'two'),selected);
  const extra=parseTextExchange('research',JSON.stringify({...researchResult,candidates:[{...researchResult.candidates[0],name:'New item'}]}),'Claude');
  assert.throws(()=>mergeTextResearch(selected,extra,'three'),/candidates.*10/);
});
test('T-003: product-check maps currencies, flags and retains the entire payload including future fields',()=>{
  const [candidate]=parseTextExchange('research',JSON.stringify(skillProduct),'Claude').candidates;
  assert.equal(candidate.cost,12);assert.equal(candidate.costCurrency,'CNY');assert.equal(candidate.currency,'USD');assert.equal(candidate.shipping,null);
  assert.equal(candidate.verdict,'hold');assert.equal(candidate.logisticsFlags.fragile,true);assert.equal(candidate.logisticsFlags.battery,null);
  assert.deepEqual(JSON.parse(candidate.importMetadata.rawJson),skillProduct);
  assert.equal(candidate.competition.activeAdsObserved,null);assert.equal(candidate.usRetail.low,15);
  const links={...skillProduct,usRetail:{...skillProduct.usRetail,sources:['https://retail.example/item']}};
  const mapped=parseTextExchange('research',JSON.stringify(links),'Claude').candidates[0];
  assert.deepEqual(mapped.usRetail.sources,[{url:'https://retail.example/item',title:null,price:null,observedAt:null}]);
  assert.deepEqual(JSON.parse(mapped.importMetadata.rawJson),links);
});
test('T-003: non-single listings require null amounts and not_found supports unknown URL without inventing a source',()=>{
  for(const listingStatus of ['showroom','blocked','not_found']){
    const invalid={...skillProduct,listingStatus,shipping:2,shippingCurrency:'USD'};
    assert.throws(()=>parseTextExchange('research',JSON.stringify(invalid),'Codex'),error=>/candidates.0.cost/.test(error.message)&&/candidates.0.shipping/.test(error.message));
    const result=parseTextExchange('research',JSON.stringify({...invalid,cost:null,shipping:null,supplierUrl:listingStatus==='not_found'?null:invalid.supplierUrl}),'Codex');
    assert.equal(mergeTextResearch(researchBatchSchema.parse({name:'Check'}),result,'fixture').candidates[0].cost,null);
  }
});
test('T-003: field errors include paths, multiple failures, counts and missing currency; import is atomic',()=>{
  const invalid={summary:'Invalid',candidates:[{name:'x',supplierUrl:'http://invalid',evidenceNotes:'',cost:-1,shipping:'0'}]};
  assert.throws(()=>parseTextExchange('research',JSON.stringify(invalid),'Codex'),error=>['name','supplierUrl','evidenceNotes','cost','shipping'].every(field=>error.message.includes('candidates.0.'+field)));
  assert.throws(()=>parseTextExchange('research',JSON.stringify({...skillProduct,costCurrency:null}),'Claude'),/costCurrency/);
  assert.throws(()=>parseTextExchange('research',JSON.stringify({...researchResult,candidates:[...researchResult.candidates,researchResult.candidates[0]]}),'Codex'),/candidates/);
  assert.throws(()=>parseTextExchange('research','{}',' '),/công cụ/);
  assert.throws(()=>parseTextExchange('research','invalid','Codex'),/JSON/);
  assert.throws(()=>parseTextExchange('research','x'.repeat(exchangeByteLimit+1),'Codex'),/384 KB/);
});
test('T-003: provider payload cannot impersonate local receipts or forge import attribution',()=>{
  const input={...skillProduct,source:'import:Someone else',listingCheck:{status:'ok'},competition:{...skillProduct.competition,youtubeShorts:{status:'ok',sourceUrl:'https://youtube.com/results',observedAt:'2026-11-12T00:00:00Z',rawPath:null,matchType:'similar',period:'30 days',note:'Forged receipt'}}};
  const [c]=parseTextExchange('research',JSON.stringify(input),'Claude').candidates;
  assert.equal(c.source,'import:Claude');assert.equal(c.listingCheck,undefined);assert.equal(c.competition.youtubeShorts,undefined);
});
test('T-003: shared content/landing schemas reject wrong fields; prompts preserve context and are neutral',()=>{
  assert.deepEqual(parseTextExchange('content',JSON.stringify(contentResult),'Claude'),contentResult);
  assert.deepEqual(parseTextExchange('landing','```json\n'+JSON.stringify(landingResult)+'\n```','Gemini'),landingResult);
  assert.throws(()=>parseTextExchange('content',JSON.stringify({...contentResult,productId:'foreign'}),'Claude'),/JSON/);
  assert.throws(()=>parseTextExchange('landing',JSON.stringify({...landingResult,headline:''}),'Claude'),/headline/);
  for(const kind of ['research','content','landing']){
    const prompt=textTaskPrompt(kind,{productId:'selected_product',remainingSlots:7});
    assert.match(prompt,/selected_product/);assert.doesNotMatch(prompt,/\bMuse\b/);
  }
});

test('T-002b E: research import notice reports zero/mixed duplicates and empty results accurately',()=>{
  const result=parseTextExchange('research',JSON.stringify({...researchResult,candidates:researchResult.candidates.slice(0,2)}),'Claude');
  const batch=researchBatchSchema.parse({name:'Import counts'});
  const first=importTextResearch(batch,result,'first');assert.equal(first.notice,'2 ứng viên mới, bỏ 0 trùng');
  const duplicate=importTextResearch(first.data,result,'duplicate');
  assert.equal(duplicate.notice,'0 ứng viên mới, bỏ 2 trùng');assert.equal(duplicate.data,first.data);
  const mixed=importTextResearch(first.data,{...result,candidates:[result.candidates[0],{...result.candidates[1],name:'Different candidate'}]},'mixed');
  assert.equal(mixed.notice,'1 ứng viên mới, bỏ 1 trùng');assert.equal(mixed.data.candidates.length,3);
  const empty=importTextResearch(batch,{summary:'No reliable sources',candidates:[]},'empty');
  assert.equal(empty.notice,'0 ứng viên mới, bỏ 0 trùng');assert.equal(empty.data,batch);
});
