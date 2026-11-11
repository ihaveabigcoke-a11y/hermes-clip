import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateSchema, researchBatchSchema, socialMetricSchema, landingPageSchema, landingHtml, socialTotals} from '../lib/lab/operations.ts';
import {mergeMuseResearch, parseMuseResponse, museTaskPrompt} from '../lib/lab/muse-workflows.ts';
import {instagramProductSummary} from '../lib/lab/instagram-summary.ts';

test('Muse research imports provenance once and retains manual selection and unknown prices', () => {
  const batch = researchBatchSchema.parse({name: 'Pet products', candidates: [candidate('existing')], selectedIds: ['existing']});
  const chat = {requestId: 'request1', profileId: 'profile1', providerUrl: 'https://muse.ai/thread/test', response: JSON.stringify({summary: 'Review source', candidates: [{name: 'Treat pouch', supplierUrl: 'https://shop.example/pouch', evidenceNotes: 'Supplier listing', cost: null}]})};
  const imported = mergeMuseResearch(batch, chat);
  assert.equal(imported.candidates.length, 2);
  assert.equal(imported.candidates[1].cost, null);
  assert.match(imported.candidates[1].evidenceNotes, /cần kiểm tra nguồn/);
  assert.deepEqual(imported.selectedIds, ['existing']);
  assert.equal(mergeMuseResearch(imported, chat), imported);
  assert.equal(mergeMuseResearch(imported, {...chat, requestId: 'another'}).candidates.length, 2);
});

test('Muse research rejects overflow and malformed model actions without partial updates', () => {
  const batch = researchBatchSchema.parse({name: 'Full batch', candidates: Array.from({length: 10}, (_, index) => candidate('c' + index))});
  const chat = {requestId: 'request2', profileId: 'p', providerUrl: null, response: JSON.stringify({summary: '', candidates: [{name: 'New product', supplierUrl: 'https://shop.example/new', evidenceNotes: 'Listing'}]})};
  assert.throws(() => mergeMuseResearch(batch, chat), /10 ứng viên/);
  assert.equal(batch.candidates.length, 10);
  assert.throws(() => parseMuseResponse('content', '{"action":"publish"}'), /cấu trúc/);
  assert.throws(() => parseMuseResponse('research', JSON.stringify({summary: '', candidates: [{name: 'Bad', supplierUrl: 'javascript:alert(1)', evidenceNotes: 'x'}]})), /cấu trúc/);
});

test('Muse structured drafts accept fenced JSON and preserve commercial fields outside model scope', () => {
  const content = {name: 'Treat pouch', hook: 'Keep treats close', script: 'Show the product', caption: 'Product study'};
  assert.deepEqual(parseMuseResponse('content', '```json\n' + JSON.stringify(content) + '\n```'), content);
  assert.throws(() => parseMuseResponse('landing', JSON.stringify({headline: 'Product', description: 'Details', benefits: '', limitations: '', ctaUrl: 'https://checkout.example'})), /cấu trúc/);
  assert.match(museTaskPrompt('research', {market: 'United States'}), /unknown costs and shipping null/);
});

const candidate = id => candidateSchema.parse({id, name: 'Sourced product', supplierUrl: 'https://supplier.example/product', evidenceNotes: 'Listing reviewed'});

test('showroom products sharing one source survive import and legacy receipt recovery without duplicates', () => {
  const chat = {requestId:'showroom',profileId:'p',providerUrl:null,response:JSON.stringify({summary:'Shared showroom',candidates:Array.from({length:10},(_,i)=>({name:'Product '+i,supplierUrl:'https://supplier.example/showroom',evidenceNotes:'Distinct product '+i}))})};
  const full = mergeMuseResearch(researchBatchSchema.parse({name:'Showroom'}), chat);
  assert.equal(full.candidates.length,10);
  const legacy={...full,candidates:full.candidates.slice(0,1),selectedIds:[full.candidates[0].id]};
  legacy.candidates[0]={...legacy.candidates[0],name:'My edited product name'};
  const recovered=mergeMuseResearch(legacy,chat);
  assert.equal(recovered.candidates.length,10);
  assert.equal(recovered.candidates[0].name,'My edited product name');
  assert.deepEqual(recovered.selectedIds,legacy.selectedIds);
  assert.equal(recovered.notes,full.notes);
  assert.equal(mergeMuseResearch(recovered,chat),recovered);
  assert.equal(mergeMuseResearch(full,{...chat,requestId:'other'}).candidates.length,10);
});
test('research bounds and unknown pricing retain explicit uncertainty', () => {
  const candidates = Array.from({length: 10}, (_, index) => candidate('c' + index));
  assert.equal(candidates[0].cost, null);
  assert.equal(researchBatchSchema.safeParse({name: 'Batch', candidates, selectedIds: ['c0','c1','c2']}).success, true);
  for (const data of [
    {candidates: [...candidates, candidate('c11')]}, {candidates, selectedIds: ['c0','c1','c2','c3']},
    {candidates, selectedIds: ['c0','c0']}, {candidates, selectedIds: ['foreign']}, {candidates: [candidate('c0'),candidate('c0')]},
  ]) assert.equal(researchBatchSchema.safeParse({name: 'Batch', ...data}).success, false);
  assert.equal(candidateSchema.safeParse({...candidates[0], supplierUrl: 'https://user:secret@example.com'}).success, false);
});
test('totals use latest cumulative snapshot per post and isolate accounts', () => {
  const plan = {id: 'post', kind: 'content_plan', data: {accountId: 'account'}, updatedAt: 1};
  const metric = (id, at, views) => ({id, kind: 'social_metric', updatedAt: 1, data: socialMetricSchema.parse({planId: 'post', observedAt: at, views, likes: 1, comments: 2, shares: 3, saves: 4, profileVisits: 5, linkClicks: 6, sourceUrl: 'https://instagram.com/p/test'})});
  const rows = [plan, metric('old','2026-11-09T00:00:00Z',100), metric('new','2026-11-10T00:00:00Z',150)];
  assert.equal(socialTotals(rows, 'account').views, 150);
  assert.equal(socialTotals(rows, 'account').measuredPosts, 1);
  assert.equal(socialTotals(rows, 'other').views, null);
});
test('unavailable metrics remain null and partial coverage never becomes a zero total',()=>{
  const metric=socialMetricSchema.parse({planId:'p',observedAt:'2026-11-11T09:00:00Z',sourceUrl:'https://www.instagram.com/reel/a/',views:null,likes:0,comments:0,saves:0,shares:0,profileVisits:null,linkClicks:null});
  assert.equal(metric.views,null);assert.equal(metric.likes,0);assert.equal(metric.source,'manual');
  assert.equal(socialMetricSchema.safeParse({...metric,views:-1}).success,false);
  assert.equal(socialMetricSchema.safeParse({...metric,likes:'0'}).success,false);
  const plan={id:'p',kind:'content_plan',data:{accountId:'a',status:'published_browser'},updatedAt:1};
  const rows=[plan,{id:'m',kind:'social_metric',data:metric,updatedAt:1}];
  assert.equal(socialTotals(rows,'a').views,null);assert.equal(socialTotals(rows,'a').likes,0);
  rows.push({...plan,id:'another'});assert.equal(socialTotals(rows,'a').likes,null);
});

test('product overview aggregates multiple accounts and latest snapshots without counting duplicate public posts',()=>{
  const plan=(id,accountId,code,productId='product')=>({id,kind:'content_plan',updatedAt:1,data:{productId,accountId,status:'published_browser',postUrl:`https://www.instagram.com/reel/${code}/`}});
  const metric=(id,planId,code,views,at=1)=>({id,kind:'social_metric',updatedAt:at,data:{planId,sourceUrl:`https://instagram.com/p/${code}/`,observedAt:new Date(at*1000).toISOString(),views,likes:0,comments:2,saves:1,shares:0,follows:0}});
  const records=[plan('p1','a1','one'),plan('p2','a2','two'),plan('alias','a1','one'),plan('other','a1','foreign','another-product'),
    metric('old','p1','one',20),metric('new','p1','one',50,3),metric('two','p2','two',70,2),metric('duplicate','alias','one',40,2),metric('foreign','other','foreign',999)];
  const summary=instagramProductSummary(records,'product');
  assert.equal(summary.publishedPosts,2);assert.equal(summary.measuredPosts,2);assert.equal(summary.totals.views.value,120);
  assert.equal(summary.totals.likes.value,0);assert.equal(summary.oldestMeasuredAt,2000);assert.equal(summary.newestMeasuredAt,3000);
  assert.equal(summary.drafts,0);
});

test('product totals reject mismatched sources and account provenance, and retain unknown coverage',()=>{
  const plan={id:'p',kind:'content_plan',updatedAt:1,data:{productId:'product',accountId:'account',status:'published_browser',postUrl:'https://instagram.com/reel/right/'}};
  const base={id:'m',kind:'social_metric',updatedAt:1,data:{planId:'p',accountId:'account',sourceUrl:plan.data.postUrl,observedAt:'2026-11-11T09:00:00Z',views:null,likes:0}};
  for(const patch of [{sourceUrl:'https://instagram.com/reel/wrong/'},{accountId:'another'},{observedAt:'bad'}]){
    const summary=instagramProductSummary([plan,{...base,data:{...base.data,...patch}}],'product');assert.equal(summary.measuredPosts,0);assert.equal(summary.totals.likes.value,null);
  }
  const summary=instagramProductSummary([plan,base,{...plan,id:'unmeasured',data:{...plan.data,postUrl:'https://instagram.com/reel/second/'}}],'product');
  assert.equal(summary.totals.views.value,null);assert.deepEqual(summary.totals.likes,{value:null,known:1,total:2,approximate:false});
  assert.equal(instagramProductSummary([],'missing').totals.views.value,null);
});

test('publication status comes from the plan or confirmed publishing job, never from metric existence',()=>{
  const plan={id:'p',kind:'content_plan',updatedAt:1,data:{productId:'product',accountId:'a',status:'draft'}};
  const metric={id:'m',kind:'social_metric',updatedAt:1,data:{planId:'p',observedAt:'2026-11-11T09:00:00Z',sourceUrl:'https://www.instagram.com/reel/post/',views:100}};
  assert.equal(instagramProductSummary([plan,metric],'product').publishedPosts,0);
  const jobs=[{state:'published',updatedAt:2,snapshot:{productId:'product',planId:'p'},postUrl:'https://www.instagram.com/reel/post/'}];
  const summary=instagramProductSummary([plan,metric],'product',jobs);
  assert.equal(summary.publishedPosts,1);assert.equal(summary.totals.views.value,100);assert.equal(summary.drafts,0);
});
test('landing export escapes input and only embeds safe raster data', () => {
  const page = landingPageSchema.parse({productId: 'product', headline: '<script>alert(1)</script>', description: 'A "quote" & text', benefits: '<img onerror=x>', ctaUrl: 'https://example.com/?a=1&b=2'});
  const html = landingHtml(page, 'javascript:alert(1)');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(html.includes('a=1&amp;b=2'));
  assert.equal(landingPageSchema.safeParse({...page, ctaUrl: 'javascript:alert(1)'}).success, false);
});
test('normal production entry saves drafts and never auto-approves before sending', () => {
  const studio = readFileSync(new URL('../components/lab/production.tsx', import.meta.url), 'utf8');
  const desk = readFileSync(new URL('../components/lab/production-desk.tsx', import.meta.url), 'utf8');
  const run = studio.slice(studio.indexOf('async function runScene'), studio.indexOf('const act='));
  assert.ok(!run.includes("send('storyboard'"));
  assert.ok(run.includes('current.revision !== record.revision'));
  assert.ok(run.includes('!saved?.storyboardApproved'));
  assert.ok(desk.includes('await props.onSave({...parsed.data,id})'));
  assert.ok(!desk.includes('value="run"'));
  assert.ok(desk.includes('!s.storyboardApproved||!!pause'));
});
