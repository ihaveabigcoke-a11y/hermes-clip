import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Integrations,runJson} from '../src/integrations.mjs';
import {ResearchSources,sourceCheckInput} from '../src/research-sources.mjs';
import {boundedText,extractListing,listingWarnings,pageText,youtubeObservation,webObservation,RAW_LIMIT} from '../src/listing-check.mjs';
import {researchBatchSchema} from '../../lib/lab/operations.ts';

const at='2026-11-11T12:00:00.000Z';
const url='https://detail.1688.com/offer/123456.html';
const page='<html><head><title>Night leash &amp; clip</title></head><body><p>¥ 12.50</p><p>Min. order: 20 pieces</p><p>Shipping to US: quote required</p></body></html>';
const candidate=(index=0)=>({id:'c'+index,name:'Night leash '+index,supplierUrl:url,evidenceNotes:'Muse fixture',cost:10,costCurrency:'CNY',minimumOrder:5,matchType:'exact_sku',competition:{activeAdsObserved:2,similarReels30d:4,sourceUrl:'https://example.test/muse',observedAt:at,note:'Muse observation'}});
const listing=raw=>extractListing(raw,{fetchedAt:at,rawPath:'fixture.txt',sourceUrl:url});
const response=async(_cmd,args)=>args.includes('read')?{ok:true,result:{html:page}}:{ok:true,items:[]};
const relatedPage=await readFile(new URL('./fixtures/listing-related.html',import.meta.url),'utf8');
const showroomPage=await readFile(new URL('./fixtures/listing-showroom.html',import.meta.url),'utf8');
async function fixture(fn,run=response,count=1){
 const root=await mkdtemp(join(tmpdir(),'hermes-sources-')),store=new Store(join(root,'state.sqlite'));
 const integrations=new Integrations(store,root,run);
 integrations.saveConfig({python:'python',reach:'agent-reach',montage:root});
 store.set('integration-health',{reach:{ready:true,listingRead:{command:['web','read'],timeoutFlag:true}}});
 let record={id:'research_fixture',kind:'research_batch',revision:1,data:researchBatchSchema.parse({name:'Source fixture',candidates:Array.from({length:count},(_,i)=>candidate(i)),selectedIds:['c0'],notes:'Muse receipt kept'})};
 const api={records:async()=>[structuredClone(record)],save:async value=>{
  assert.equal(value.revision,record.revision);record={...value,revision:value.revision+1,data:researchBatchSchema.parse(value.data)};return record;
 }};
 const sources=new ResearchSources({integrations,records:()=>api.records(),save:value=>api.save(value)});
 try{await fn({root,store,integrations,sources,api,record:()=>structuredClone(record),change:fn=>{record=fn(record);}});}
 finally{await integrations.idle();store.close();await rm(root,{recursive:true,force:true});}
}

test('1688 and AliExpress page heuristics preserve currency, MOQ, title and shipping without LLM',()=>{
 const check=listing(page);
 assert.equal(check.status,'ok');assert.equal(check.title,'Night leash & clip');assert.equal(check.priceText,'¥ 12.50');assert.equal(check.currencyDetected,'¥');
 assert.equal(check.moqText,'Min. order: 20 pieces');assert.equal(check.shippingText,'Shipping to US: quote required');assert.equal(check.productCountOnPage,null);
 for(const [text,price,moq] of [['# AliExpress collar\nCN¥19.90\nMOQ: 10 pieces','CN¥19.90','MOQ: 10 pieces'],['Title: Supplier\n¥ 5\n2件起批','¥ 5','2件起批'],['# Supplier\nUS$9.50\n起订量：30件','US$9.50','起订量：30件']]){
  const parsed=listing(text);assert.equal(parsed.priceText,price);assert.equal(parsed.moqText,moq);
 }
 for(const symbol of ['¥','CN¥','US$','$','₫','€'])assert.equal(listing(symbol+'12.50').currencyDetected,symbol);
 assert.equal(listing('12.500 ₫').currencyDetected,'₫');
 assert.equal(listing('<title>Blocked</title> HTTP 403 CAPTCHA').status,'blocked');
 assert.equal(listing('<title>Model 403</title>¥403').status,'ok');
 assert.equal(listing('').status,'failed');
});
test('12 product cards flag possible showroom and price/MOQ discrepancies leave Muse untouched',()=>{
 const source=candidate(),original=structuredClone(source);
 const check=listing(page+Array.from({length:12},(_,i)=>`<div class="product-card" data-product-id="${i}"><a href="/offer/${i}.html">Product</a></div>`).join(''));
 assert.equal(check.productCountOnPage,12);
 const warnings=listingWarnings(source,check);
 assert.equal(warnings.length,3);assert.match(warnings[0],/12 sản phẩm.*showroom/);assert.match(warnings[1],/Muse ghi giá 10 CNY.*¥ 12.50/);assert.match(warnings[2],/Muse ghi MOQ 5.*20 pieces/);
 assert.deepEqual(source,original);
 assert.equal(listingWarnings({...source,cost:12.5,minimumOrder:20},listing(page)).length,0);
 assert.equal(listingWarnings({...source,cost:null,minimumOrder:null},listing(page)).length,0);
 assert.match(listingWarnings({...source,costCurrency:'USD'},listing(page))[0],/chưa quy đổi/);
});
test('raw text is capped at 200 KiB at UTF-8 boundaries and unsupported read payloads fail',()=>{
 assert.ok(Buffer.byteLength(boundedText('€'.repeat(RAW_LIMIT)))<=RAW_LIMIT);
 assert.ok(!boundedText('€'.repeat(RAW_LIMIT)).endsWith('\uFFFD'));
 assert.ok(Buffer.byteLength(pageText({ok:true,result:{title:'Title',content:'¥'.repeat(RAW_LIMIT)}}))<=RAW_LIMIT);
 assert.throws(()=>pageText({ok:true,result:{url}}),/nội dung/);
});
test('single AliExpress and 1688 listings exclude current URLs and all recommendation blocks',()=>{
 for(const [html,sourceUrl] of [[relatedPage,'https://www.aliexpress.com/item/123456.html'],[relatedPage.replaceAll('www.aliexpress.com','detail.1688.com').replaceAll('/item/','/offer/'),url]]){
  const check=extractListing(html,{fetchedAt:at,sourceUrl,rawPath:null});
  assert.equal(check.productCountOnPage,null);assert.equal(check.productCountReliable,true);
  assert.ok(!listingWarnings({...candidate(),cost:4,minimumOrder:null},check).some(w=>w.includes('showroom')));
 }
 const links=Array.from({length:8},(_,i)=>`<a href="/offer/${i}.html">Other product</a>`).join('');
 for(const label of ['Related products','Recommend','Recommendations','You may also like','相关推荐','猜你喜欢']){
  for(const html of [`<section><h2>${label}</h2>${links}</section>`,`<div class="${label.replaceAll(' ','-')}">${links}</div>`,`<section><div><h2>${label}</h2></div><div>${links}</div></section>`]){
   const check=listing(html);assert.equal(check.productCountOnPage,null,label);assert.equal(check.productCountReliable,true,label);
  }
 }
 assert.equal(listing(`<div class="relatedProducts">${links}</div>`).productCountOnPage,null);
 const five=listing(`<a href="${url}?tracking=1">Self</a><a href="/offer/123456.html#photos">Self</a>`+Array.from({length:5},(_,i)=>`<a href="/offer/${i}.html">Other</a>`).join(''));
 assert.equal(five.productCountOnPage,5);assert.equal(five.productCountReliable,true);
 assert.ok(!listingWarnings(candidate(),five).some(w=>w.includes('showroom')));
});
test('showroom fixture retains twelve products while flattened or malformed regions are uncertain',()=>{
 const showroom=listing(showroomPage);
 assert.equal(showroom.productCountOnPage,12);assert.equal(showroom.productCountReliable,true);
 assert.match(listingWarnings(candidate(),showroom)[0],/12 sản phẩm ngoài vùng gợi ý.*showroom/);
 const links=Array.from({length:12},(_,i)=>`[Product ${i}](/offer/${i}.html)`).join('\n');
 for(const html of [links,'Related products\n'+links,showroomPage.replace('<main>','<main>Related products'),showroomPage.replace('<main>','<main>Related products<section class="related-products"><a href="/offer/999.html">Related</a></section>'),showroomPage.replace('</main>','')]){
  const check=listing(html);assert.equal(check.productCountOnPage,12);assert.equal(check.productCountReliable,false);
  assert.match(listingWarnings(candidate(),check)[0],/chưa tách được vùng gợi ý/);
 }
});
test('inclusive decimal price ranges compare only outside their bounds without changing Muse values',()=>{
 for(const price of ['¥3.50-5.20','¥3.50~5.20','¥ 3.50 - ¥ 5.20','CN¥3.50~CN¥5.20']){
  const check=listing(price);assert.equal(check.priceText,price);
  for(const cost of [3.5,4,5.2])assert.deepEqual(listingWarnings({...candidate(),cost,minimumOrder:null},check),[],`${price}: ${cost}`);
  for(const cost of [0,3.49,5.21])assert.match(listingWarnings({...candidate(),cost,minimumOrder:null},check)[0],/Muse ghi giá/);
  assert.deepEqual(listingWarnings({...candidate(),cost:null,minimumOrder:null},check),[]);
  assert.match(listingWarnings({...candidate(),cost:4,costCurrency:'USD'},check)[0],/chưa quy đổi/);
 }
});
test('pounds map to GBP and bare yen is CNY only on known supplier domains',()=>{
 for(const text of ['£4.50','&pound;4.50','4.50 £','£3.50~£5.20','3.50-5.20 £','3.50 £ ~ 5.20 £']){
  const check=listing(text);assert.equal(check.currencyDetected,'£');assert.equal(check.currencyNote,null);
  assert.deepEqual(listingWarnings({...candidate(),cost:4.5,costCurrency:'GBP'},check),[]);
  assert.match(listingWarnings({...candidate(),cost:5.21,costCurrency:'GBP'},check)[0],/Muse ghi giá/);
 }
 for(const host of ['1688.com','detail.1688.com','www.alibaba.com','aliexpress.com','www.aliexpress.us','item.taobao.com','detail.tmall.com','shop.example.jp','1688.com.evil.test','fakealibaba.com']){
  const check=extractListing('¥4.50',{fetchedAt:at,sourceUrl:`https://${host}/item/123.html`,rawPath:null});
  const ambiguous=['shop.example.jp','1688.com.evil.test','fakealibaba.com'].includes(host);
  assert.equal(check.currencyDetected,ambiguous?null:'¥',host);assert.equal(check.currencyNote,ambiguous?'¥ không rõ CNY/JPY':null,host);
  assert.equal(check.priceText,'¥4.50');
  assert.equal(listingWarnings({...candidate(),cost:4.5},check).length,ambiguous?1:0);
 }
 const explicit=extractListing('CN¥4.50',{fetchedAt:at,sourceUrl:'https://example.test/item',rawPath:null});
 assert.equal(explicit.currencyDetected,'CN¥');assert.equal(explicit.currencyNote,null);
});
test('YouTube metadata has separate provenance, unknowns stay null, known zero views survive',()=>{
 const empty=youtubeObservation([], 'collar shorts',at,'raw.txt');
 assert.equal(empty.resultCount,null);assert.equal(empty.maxViews,null);assert.equal(empty.newestPublishedAt,null);
 const result=youtubeObservation([{url:'https://youtube.com/shorts/a',views:0,upload_date:'20261110'},{url:'https://www.youtube.com/watch?v=b',view_count:12000,publishedAt:'2026-11-11T00:00:00Z'},{url:'https://evil.test/fake',views:9999999}], 'collar shorts',at,'raw.txt');
 assert.equal(result.resultCount,2);assert.equal(result.maxViews,12000);assert.equal(result.newestPublishedAt,'2026-11-11T00:00:00.000Z');assert.equal(result.matchType,'similar');assert.match(result.note,/không phải Instagram/);
 assert.equal(youtubeObservation([{url:'https://youtu.be/a',views:0}], 'x',at,null).maxViews,0);
 assert.equal(youtubeObservation([{url:'https://youtu.be/a',views:'1.2M',publishedAt:'yesterday'}], 'x',at,null).maxViews,null);
 assert.equal(youtubeObservation([{url:'https://youtube.com/shorts/a'},{url:'https://youtube.com/watch?v=a'},{url:'https://youtube.com/@channel'}],'x',at,null).resultCount,1);
 assert.equal(listing('Minimum order quantity: 20 pieces').moqText,'Minimum order quantity: 20 pieces');
 assert.equal(webObservation([{url:'javascript:alert(1)'},{url:'https://user:secret@example.test'}],'x',at,null).links,null);
});
test('doctor uses bounded local help, recognizes web read and keeps default preference tied to readiness',()=>fixture(async({integrations,store})=>{
 const calls=[];
 integrations.run=async(_cmd,args,options)=>{
  calls.push({args,options});
  if(args.at(-1)==='--help')return args.includes('read')?'Usage: web read URL [--timeout SECONDS]':args[0]==='web'?'Commands:\n  read  Read a public page\n  search  Search':'Commands:\n  web\n  youtube';
  return options?.input?{ok:true,result:{ffmpeg:true,ffprobe:true}}:{ok:true,result:{version:'fixture'}};
 };
 store.set('integration-health',null);assert.equal(integrations.autoSourceCheck(),false);
 const health=await integrations.doctor();assert.equal(health.reach.ready,true);assert.deepEqual(health.reach.listingRead.command,['web','read']);assert.equal(health.reach.listingRead.timeoutFlag,true);
 assert.equal(integrations.autoSourceCheck(),true);
 for(const call of calls.filter(c=>c.args.at(-1)==='--help')){assert.equal(call.options.format,'text');assert.equal(call.options.maxBytes,65536);assert.equal(call.options.timeout,15000);}
 integrations.saveSourceCheckPreference({enabled:false});await integrations.doctor();assert.equal(integrations.autoSourceCheck(),false);
 assert.throws(()=>integrations.saveSourceCheckPreference({enabled:'true'}));
}));
test('read, youtube search and web search argv are fixed, sequential, bounded and save separate evidence',()=>fixture(async({integrations,sources,record})=>{
 const calls=[];let running=0,maximum=0;
 integrations.run=async(cmd,args,options)=>{
  running++;maximum=Math.max(maximum,running);calls.push({cmd,args,options});await Promise.resolve();running--;
  if(args[1]==='read')return {ok:true,result:{html:page}};
  return {ok:true,items:args[0]==='youtube'?[{url:'https://youtube.com/shorts/fixture',views:50,upload_date:'20261110'}]:[{url:'https://example.test/reels'}]};
 };
 const job=sources.enqueue(record());assert.equal(integrations.busy,true);await integrations.idle();
 assert.deepEqual(calls.map(c=>c.args),[['web','read',url,'--timeout','45'],['youtube','search','Night leash 0 shorts','--limit','10','--timeout','45','--backend','public-web'],['web','search','Night leash 0 tiktok OR reels','--limit','5','--timeout','45']]);
 assert.equal(maximum,1);assert.ok(calls.every(call=>call.options.timeout===45000));assert.equal(integrations.busy,false);
 const result=record(),row=result.data.candidates[0];
 assert.equal(row.cost,10);assert.equal(row.minimumOrder,5);assert.equal(row.matchType,'exact_sku');assert.deepEqual(result.data.selectedIds,['c0']);assert.equal(result.data.notes,'Muse receipt kept');
 assert.equal(row.listingCheck.status,'ok');assert.equal(row.listingCheck.warnings.length,2);assert.equal(await readFile(row.listingCheck.rawPath,'utf8'),page);
 assert.equal(row.competition.activeAdsObserved,2);assert.equal(row.competition.similarReels30d,4);assert.equal(row.competition.observedAt,at);assert.equal(row.competition.sourceUrl,'https://example.test/muse');
 assert.equal(row.competition.youtubeShorts.resultCount,1);assert.equal(row.competition.youtubeShorts.maxViews,50);assert.deepEqual(row.competition.webReferences.links,['https://example.test/reels']);
 assert.equal(integrations.job(job.id).state,'done');assert.equal(integrations.job(job.id).result.candidates[0].status,'ok');
 assert.equal(sources.enqueue(record()),null);assert.equal(calls.length,3);
 await sources.recheck({batchId:result.id});await integrations.idle();assert.equal(calls.length,6);assert.equal(integrations.jobs().length,2);
 assert.equal(await readFile(row.listingCheck.rawPath,'utf8'),page);
}));
test('10 candidates cap one automatic pass at 30 commands, even after replacement IDs',()=>fixture(async({integrations,sources,record,change})=>{
 let calls=0;integrations.run=async(...args)=>{calls++;return response(...args);};
 sources.enqueue(record());sources.enqueue(record());await integrations.idle();assert.equal(calls,30);
 change(record=>({...record,data:{...record.data,candidates:record.data.candidates.map(c=>({...c,id:c.id+'new'})),selectedIds:[]}}));
 assert.equal(sources.enqueue(record()),null);assert.equal(calls,30);
},response,10));
test('network failures persist each candidate as failed and do not stop the saved batch',()=>fixture(async({integrations,sources,record})=>{
 let calls=0;integrations.run=async()=>{calls++;throw Error('Network unavailable');};
 const job=sources.enqueue(record());await integrations.idle();assert.equal(calls,6);
 assert.equal(record().data.candidates.length,2);assert.equal(integrations.job(job.id).completed,2);
 for(const row of record().data.candidates){assert.equal(row.listingCheck.status,'failed');assert.equal(row.competition.youtubeShorts.resultCount,null);assert.equal(row.competition.webReferences.links,null);}
 assert.ok(integrations.job(job.id).result.candidates.every(c=>c.status==='failed'));assert.equal(integrations.busy,false);
},response,2));
test('missing CLI read capability is unavailable without guessing an argv; search remains independent',()=>fixture(async({integrations,store,sources,record})=>{
 store.set('integration-health',{reach:{ready:true,listingRead:{command:null,error:'No read command'}}});
 const calls=[];integrations.run=async(_cmd,args)=>{calls.push(args);return {ok:true,items:[]};};
 sources.enqueue(record());await integrations.idle();assert.equal(calls.length,2);assert.ok(calls.every(args=>args[1]==='search'));
 assert.equal(record().data.candidates[0].listingCheck.status,'unavailable');assert.match(record().data.candidates[0].listingCheck.error,/No read/);
 assert.equal(record().data.candidates[0].competition.youtubeShorts.resultCount,null);
}));
test('blocked response and rejected search envelope remain failures without fabricated counts',()=>fixture(async({integrations,sources,record})=>{
 integrations.run=async(_cmd,args)=>args[1]==='read'?{ok:true,result:{text:'HTTP 429 captcha'}}:{ok:true,items:[null]};
 sources.enqueue(record());await integrations.idle();const row=record().data.candidates[0];
 assert.equal(row.listingCheck.status,'blocked');assert.equal(row.listingCheck.priceText,null);assert.equal(row.competition.youtubeShorts.status,'failed');assert.equal(row.competition.youtubeShorts.resultCount,null);
}));
test('unready tools yield unavailable for every source and never call the provider',()=>fixture(async({integrations,store,sources,record})=>{
 store.set('integration-health',{reach:{ready:false,error:'Tool help failed: HTTP 403'}});
 let calls=0;integrations.run=async()=>{calls++;throw Error('must not invoke');};
 const job=await sources.recheck({batchId:record().id});await integrations.idle();assert.equal(calls,0);
 const row=record().data.candidates[0];
 assert.equal(row.listingCheck.status,'unavailable');assert.match(row.listingCheck.warnings[0],/công cụ/);
 assert.equal(row.competition.youtubeShorts.status,'unavailable');assert.equal(row.competition.webReferences.status,'unavailable');
 assert.equal(row.listingCheck.priceText,null);assert.equal(row.competition.youtubeShorts.resultCount,null);
 assert.equal(integrations.job(job.id).result.candidates[0].status,'unavailable');
}));
test('missing executable is a tool failure, not a website block',()=>fixture(async({integrations,sources,record,root})=>{
 const missing=join(root,'missing-agent-reach.exe');
 await assert.rejects(()=>runJson(missing,[]),error=>error.unavailable===true);
 integrations.run=()=>runJson(missing,[]);
 const job=sources.enqueue(record());await integrations.idle();
 assert.equal(record().data.candidates[0].listingCheck.status,'unavailable');
 assert.equal(integrations.job(job.id).result.candidates[0].status,'unavailable');
}));
test('only explicit page access restrictions are blocked; unrelated errors stay failed',async()=>{
 for(const message of ['HTTP 403','HTTP/1.1 429','captcha','Sign in to continue','登录后查看']){
  assert.equal(listing(message).status,'blocked',message);
  await fixture(async({integrations,sources,record})=>{
   integrations.run=async()=>{throw Error(message);};sources.enqueue(record());await integrations.idle();
   const row=record().data.candidates[0];assert.equal(row.listingCheck.status,'blocked',message);assert.equal(row.competition.youtubeShorts.status,'blocked',message);
  });
 }
 for(const message of ['Access denied opening a local file','Network unavailable','Unexpected CLI output','HTTP 500'])await fixture(async({integrations,sources,record})=>{
  integrations.run=async()=>{throw Error(message);};sources.enqueue(record());await integrations.idle();assert.equal(record().data.candidates[0].listingCheck.status,'failed',message);
 });
});
test('pending source checks share busy with all integration work and cannot duplicate a manual batch',()=>fixture(async({integrations,sources,record})=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const existing=integrations.task('reference','other',{},async()=>{await gate;return {};});
 let calls=0;integrations.run=async(...args)=>{calls++;return response(...args);};
 const job=sources.enqueue(record());assert.equal(integrations.job(job.id).state,'queued');assert.equal(calls,0);
 try{await assert.rejects(()=>sources.recheck({batchId:record().id}),/đang chờ/);await assert.rejects(()=>integrations.doctor(),/đang chạy/);}
 finally{release();await existing;await integrations.idle();}
 assert.equal(calls,3);assert.equal(integrations.job(job.id).state,'done');
}));
test('CAS retry preserves edits, selections and Muse values while saving source observations',()=>fixture(async({sources,integrations,record,api,change})=>{
 const save=api.save;let attempts=0;
 api.save=async value=>{
  if(++attempts===1){change(row=>({...row,revision:row.revision+1,data:{...row.data,notes:'User edit',selectedIds:[],candidates:row.data.candidates.map(c=>({...c,cost:12.5,minimumOrder:20}))}}));throw Object.assign(Error('Conflict'),{status:409});}
  return save(value);
 };
 sources.enqueue(record());await integrations.idle();const result=record();
 assert.equal(attempts,2);assert.equal(result.data.notes,'User edit');assert.deepEqual(result.data.selectedIds,[]);assert.equal(result.data.candidates[0].cost,12.5);assert.deepEqual(result.data.candidates[0].listingCheck.warnings,[]);
}));
test('changed listing identity keeps the original record and a failed candidate receipt',()=>fixture(async({sources,integrations,record,change})=>{
 integrations.run=async(...args)=>{change(row=>({...row,data:{...row.data,candidates:row.data.candidates.map(c=>({...c,supplierUrl:'https://example.test/new'}))}}));return response(...args);};
 const job=sources.enqueue(record());await integrations.idle();assert.equal(record().data.candidates[0].listingCheck,undefined);
 assert.equal(integrations.job(job.id).result.candidates[0].status,'failed');assert.match(integrations.job(job.id).result.candidates[0].error,/đã đổi/);
}));
test('restart interrupts queued/running source checks, preserves completed receipts and never replays',()=>fixture(async({root,store,record,api})=>{
 const request={candidates:record().data.candidates};
 store.set('integration-jobs',[{id:'old',kind:'source-check',projectId:record().id,state:'running',request,result:{candidates:[{candidateId:'c0',status:'ok'}]}},{id:'queued',kind:'source-check',projectId:'other',state:'queued',request}]);
 let calls=0;const resumed=new Integrations(store,root,async(...args)=>{calls++;return response(...args);});
 const sources=new ResearchSources({integrations:resumed,...api});
 assert.ok(resumed.jobs().every(job=>job.state==='interrupted'));assert.equal(resumed.job('old').result.candidates[0].status,'ok');
 assert.equal(sources.enqueue(record()),null);await resumed.idle();assert.equal(calls,0);
 await sources.recheck({batchId:record().id});await resumed.idle();assert.equal(calls,3);assert.equal(resumed.job('old').state,'interrupted');
}));
test('turning auto checks off suppresses enqueue but allows explicit recheck',()=>fixture(async({sources,integrations,record})=>{
 integrations.saveSourceCheckPreference({enabled:false});assert.equal(sources.enqueue(record()),null);
 await sources.recheck({batchId:record().id});await integrations.idle();assert.equal(record().data.candidates[0].listingCheck.status,'ok');
 assert.equal(sourceCheckInput.safeParse({batchId:'x',args:['reddit']}).success,false);
}));
test('help output uses the same no-shell runner with strict byte and exit limits',async()=>{
 assert.equal(await runJson(process.execPath,['-e','process.stdout.write("Commands: read")'],{format:'text',maxBytes:100}),'Commands: read');
 await assert.rejects(()=>runJson(process.execPath,['-e','process.stdout.write("x".repeat(2000))'],{format:'text',maxBytes:100}),/giới hạn/);
 await assert.rejects(()=>runJson(process.execPath,['-e','process.exit(2)'],{format:'text'}),/CLI/);
});

test('root read capability and Windows Python module argv work without touching login channels',()=>fixture(async({integrations,sources,record,root})=>{
 const calls=[];
 integrations.saveConfig({python:join(root,'Scripts','python.exe'),reach:join(root,'Scripts','agent-reach.exe'),montage:root});
 integrations.run=async(command,argv,options)=>{
  const args=argv[0]==='-m'?argv.slice(2):argv;calls.push({command,argv,args});
  if(args.at(-1)==='--help')return args[0]==='read'?'Usage: agent-reach read URL':'Commands:\n  read  Read a public URL';
  if(args[0]==='version')return {ok:true,result:{version:'fixture'}};
  if(options?.input)return {ok:true,result:{ffmpeg:true,ffprobe:true}};
  return response(command,args[0]==='read'?['web',...args]:args);
 };
 const health=await integrations.doctor();assert.deepEqual(health.reach.listingRead.command,['read']);assert.equal(health.reach.listingRead.timeoutFlag,false);
 assert.ok(!calls.some(call=>call.args.join(' ')==='web --help'));
 calls.length=0;sources.enqueue(record());await integrations.idle();
 assert.deepEqual(calls.map(c=>c.args),[['read',url],['youtube','search','Night leash 0 shorts','--limit','10','--timeout','45','--backend','public-web'],['web','search','Night leash 0 tiktok OR reels','--limit','5','--timeout','45']]);
 if(process.platform==='win32')for(const call of calls){assert.equal(call.command,join(root,'Scripts','python.exe'));assert.deepEqual(call.argv.slice(0,2),['-m','agent_reach.cli']);}
}));

test('shutdown stops remaining commands and leaves source work interrupted for manual recheck',()=>fixture(async({integrations,sources,record})=>{
 let calls=0;integrations.run=async()=>{calls++;integrations.shutdown();return {ok:true,result:{html:page}};};
 const job=sources.enqueue(record());await integrations.idle();assert.equal(calls,1);assert.equal(integrations.job(job.id).state,'interrupted');
 assert.equal(record().data.candidates[0].listingCheck,undefined);assert.equal(integrations.busy,false);
 assert.throws(()=>sources.enqueue({...record(),id:'new'}),/đang đóng/);
}));
