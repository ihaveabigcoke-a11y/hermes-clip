import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Render actual source components offline; no browser, image fetch or desktop IPC.
const root=new URL('../../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 let url;
 if(specifier.startsWith('@/'))url=new URL(specifier.slice(2),root);
 else if(specifier.startsWith('.')&&/\.tsx?$/.test(context.parentURL??''))url=new URL(specifier,context.parentURL);
 if(url){const path=fileURLToPath(url),found=[path,path+'.ts',path+'.tsx'].find(p=>existsSync(p));if(found)return {url:pathToFileURL(found).href,shortCircuit:true};}
 return next(specifier,context);
},load(url,context,next){
 if(/\.tsx?$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{fileName:fileURLToPath(url),compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
 return next(url,context);
}});
const {SourceChip,SourceDetails,ShortsSignal,shouldPollSourceChecks,SOURCE_POLL_MS}=await import('../../components/lab/research-sources.tsx');
const {default:ResearchCandidates}=await import('../../components/lab/research-candidates.tsx');
const {default:ResearchLauncher}=await import('../../components/lab/research-launcher.tsx');
const {candidateSchema,researchBatchSchema}=await import('../../lib/lab/operations.ts');
const {extractListing,listingWarnings,youtubeObservation}=await import('../src/listing-check.mjs');
const candidate=candidateSchema.parse({id:'fixture',name:'Night leash',supplierUrl:'https://example.test/item',evidenceNotes:'Muse',cost:5,costCurrency:'CNY',minimumOrder:1});
const render=(Component,candidate)=>renderToStaticMarkup(React.createElement(Component,{candidate}));

test('compact comparison renders ten rows, decision columns, honest coverage and one detail action per row',()=>{
 const candidates=Array.from({length:10},(_,i)=>({...candidate,id:'compact'+i,name:'Product '+i,cost:null,supplierUrl:'https://example.test/shared',marketEvidence:[{label:'Page reviews',value:100,unit:'reviews',market:'US',period:'Snapshot',sourceUrl:'https://example.test/review',observedAt:'2026-11-12T00:00:00Z'}]}));
 const batch={id:'compact',kind:'research_batch',revision:1,data:researchBatchSchema.parse({name:'Fixture',candidates,selectedIds:[]})};
 const html=renderToStaticMarkup(React.createElement(ResearchCandidates,{record:batch,records:[batch],disabled:false,onEdit(){},onSelect(){}}));
 assert.equal((html.match(/type="checkbox"/g)||[]).length,10);
 for(const text of ['Đối chiếu SKU','Giá vốn + ship','Cảnh kết quả','Cờ rủi ro','Thử / giữ / loại','Chất lượng nguồn','Hồ sơ vẫn giữ','Có giá vốn <strong>0/10','Có ship <strong>0/10','Có listing riêng <strong>0/10','Có chỉ số không phải cấp trang <strong>0/10'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/>Xem<\/button>/g)||[]).length,10);
 assert.doesNotMatch(html,/Xem phân tích|Chưa tính lợi nhuận|badge success/);
 assert.match(html,/Dùng chung trang nguồn/);assert.match(html,/Số liệu cấp trang/);
});

test('launcher renders multiline criteria, structured defaults and a single primary start action',()=>{
 const html=renderToStaticMarkup(React.createElement(ResearchLauncher,{disabled:false,onOpen(){}}));
 assert.equal((html.match(/<textarea/g)||[]).length,2);
 for(const text of ['Giá vốn + ship tối đa (USD)','Ngách hoặc đối tượng','Loại trừ','large lithium batteries','value="20"','Bắt đầu nghiên cứu'])assert.ok(html.includes(text),text);
 assert.equal((html.match(/lab-button primary/g)||[]).length,1);
});

test('source chips and Shorts cells distinguish unchecked, blocked, failed and unknown',()=>{
 assert.match(render(SourceChip,candidate),/Nguồn: chưa đọc/);
 assert.match(render(ShortsSignal,candidate),/Chưa biết/);
 assert.doesNotMatch(render(ShortsSignal,candidate),/: 0/);
 for(const [status,label] of [['unavailable','chưa kiểm được (công cụ)'],['blocked','bị chặn'],['failed','lỗi đọc']])assert.ok(render(SourceChip,{...candidate,listingCheck:{status}}).includes(label));
 assert.match(render(SourceChip,{...candidate,listingCheck:{status:'ok',sourceUrl:'https://example.test/old'}}),/đã đổi URL/);
});
test('source details show currency, discrepancies, showroom uncertainty, date and separate YouTube scope',()=>{
 const check=extractListing('<title>Source</title>¥ 10\nMOQ: 20 pieces'+Array(12).fill('<div class="product-card"></div>').join(''),{fetchedAt:'2026-11-11T00:00:00Z',rawPath:'fixture.txt',sourceUrl:candidate.supplierUrl});
 const youtubeShorts=youtubeObservation([{url:'https://youtube.com/shorts/a',views:0,upload_date:'20261111'}],'leash shorts','2026-11-11T00:00:00Z','shorts.txt');
 const row=candidateSchema.parse({...candidate,listingCheck:{...check,warnings:listingWarnings(candidate,check)},competition:{youtubeShorts}});
 const html=render(SourceDetails,row);
 assert.match(html,/có thể là showroom/);assert.match(html,/Muse ghi giá 5 CNY/);assert.match(html,/MOQ 1/);assert.match(html,/¥ 10/);
 assert.match(html,/YouTube Shorts, không phải Instagram/);assert.match(html,/không phải kỳ 30 ngày/);assert.match(html,/>0<\/dd>/);assert.match(html,/fixture.txt/);assert.match(html,/2026/);
 const before=structuredClone(row);
 const batch={id:'research_fixture',kind:'research_batch',revision:1,data:researchBatchSchema.parse({name:'Batch',candidates:[row],selectedIds:[]})};
 const table=renderToStaticMarkup(React.createElement(ResearchCandidates,{record:batch,records:[batch],disabled:false,onEdit(){},onSelect(){},onPromote(){}}));
 assert.match(table,/Nguồn: có thể là showroom/);assert.match(table,/YouTube Shorts tương tự: 1/);assert.deepEqual(row,before);
});
test('page strings render as text and can never execute retrieved HTML',()=>{
 const row={...candidate,listingCheck:{status:'ok',fetchedAt:'2026-11-11T00:00:00Z',sourceUrl:candidate.supplierUrl,title:'<script>alert(1)</script>',warnings:['<img onerror="bad()">']}};
 const html=render(SourceDetails,row);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);
});
test('uncertain and legacy product counts suggest showroom only in details, never a table chip',()=>{
 for(const productCountReliable of [undefined,null,false]){
  const check={status:'ok',fetchedAt:'2026-11-11T00:00:00Z',sourceUrl:candidate.supplierUrl,productCountOnPage:12,...(productCountReliable===undefined?{}:{productCountReliable})};
  const row=candidateSchema.parse({...candidate,listingCheck:{...check,warnings:listingWarnings(candidate,check)}});
  assert.doesNotMatch(render(SourceChip,row),/showroom/);assert.match(render(SourceDetails,row),/chưa tách được vùng gợi ý/);
 }
 const html=readFileSync(new URL('./fixtures/listing-related.html',import.meta.url),'utf8');
 const supplierUrl='https://www.aliexpress.com/item/123456.html';
 const check=extractListing(html,{sourceUrl:supplierUrl,fetchedAt:'2026-11-11T00:00:00Z',rawPath:null});
 const row=candidateSchema.parse({...candidate,supplierUrl,listingCheck:check});
 assert.match(render(SourceChip,row),/Nguồn: đã đọc/);assert.doesNotMatch(render(SourceChip,row),/showroom/);
});
test('ambiguous yen remains unknown with a CNY/JPY note in source details',()=>{
 const check=extractListing('¥4.50',{sourceUrl:candidate.supplierUrl,fetchedAt:'2026-11-11T00:00:00Z',rawPath:null});
 const row=candidateSchema.parse({...candidate,listingCheck:check});
 assert.equal(row.listingCheck.currencyDetected,null);assert.match(render(SourceDetails,row),/¥ không rõ CNY\/JPY/);
 assert.match(render(SourceDetails,row),/¥4.50/);
});
test('source controls poll every ten seconds only for queued or running jobs in this batch',()=>{
 assert.equal(SOURCE_POLL_MS,10_000);
 for(const status of [null,{}, {jobs:[]}])assert.equal(shouldPollSourceChecks(status,'batch'),false);
 for(const state of ['queued','running','done','failed','interrupted']){
  const job={kind:'source-check',projectId:'batch',state};
  assert.equal(shouldPollSourceChecks({jobs:[job]},'batch'),['queued','running'].includes(state));
  assert.equal(shouldPollSourceChecks({jobs:[job]},'other'),false);
  assert.equal(shouldPollSourceChecks({jobs:[{...job,kind:'reference'}]},'batch'),false);
 }
 assert.equal(shouldPollSourceChecks({jobs:[{kind:'source-check',projectId:'batch',state:'done'},{kind:'source-check',projectId:'batch',state:'queued'}]},'batch'),true);
});
