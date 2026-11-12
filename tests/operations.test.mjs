import test from 'node:test';
import './hook-matrix.test.mjs';
import './text-exchange.test.mjs';
import './t005-research.test.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidateSchema, candidateCurrency, landedCost, researchBatchSchema, socialMetricSchema, landingPageSchema, landingHtml, socialTotals, contentPlanSchema} from '../lib/lab/operations.ts';
import {listingStatus,markupCheck,suggestVerdict,supplierQuestions,manualCheckLinks} from '../lib/lab/product-check.ts';
import {formatMoney} from '../lib/lab/domain.ts';
import {mergeMuseResearch, parseMuseResponse, museTaskPrompt} from '../lib/lab/muse-workflows.ts';
import {instagramProductSummary,instagramAccountContentRows,visibleInstagramProducts} from '../lib/lab/instagram-summary.ts';
import {instagramOverviewFixture} from './fixtures/instagram-overview.mjs';
import {annotateResearchQuality, sharedSourceWarning, pageLevelEvidenceWarning} from '../lib/lab/research-quality.ts';
import {draftReferenceVideo, referenceVideoDraftSchema, videoStructureSchema, referenceMusePrompt} from '../lib/lab/viral-reference.ts';
import {formulaTaxonomy, formulaProductTraits, viralFormulas, referenceVideoSchema} from '../lib/lab/viral-formulas.ts';
import {researchCoverage,hasIndividualListing,landedCostBadge,researchRisks,buildResearchQuery,defaultResearchCriteria,defaultResearchExclusions} from '../lib/lab/research-view.ts';
import {planResearchSelection,saveResearchSelection} from '../lib/lab/research-selection.ts';
import {formulaAnalysisPrompt,parseFormulaAnalysis,matchFormula,proposeFormulaChanges} from '../lib/lab/formula-analysis.ts';
import {analysisReferences,analysisResponse,structureFor} from './fixtures/formula-analysis.mjs';
import {countKeywordComments,parseCommentPaste} from '../lib/lab/keyword-comments.ts';
import {keywordCommentMeasurementSchema} from '../lib/lab/operations.ts';
import {keywordCommentViewRate} from '../lib/lab/instagram-summary.ts';
import {buildUtmLink,planUtmContext} from '../lib/lab/utm.ts';

test('API metrics and publish provenance are optional for legacy records and preserve reach separately from viewers',()=>{
  const legacy={planId:'plan',observedAt:'2026-11-12T00:00:00Z',views:null,likes:0,comments:null,saves:null,shares:null,profileVisits:null,linkClicks:null,sourceUrl:'https://instagram.com/reel/test/'};
  const parsed=socialMetricSchema.parse(legacy);
  assert.equal(parsed.source,'manual');assert.equal(parsed.reach,undefined);assert.equal(parsed.views,null);assert.equal(parsed.likes,0);
  const api=socialMetricSchema.parse({...legacy,source:'api',reach:0});
  assert.equal(api.reach,0);assert.equal(api.viewers,null);assert.equal(api.source,'api');
  assert.equal(socialMetricSchema.safeParse({...legacy,source:'api',reach:-1}).success,false);
  const plan={name:'API plan',productId:'product',accountId:'account',status:'published_browser',postUrl:legacy.sourceUrl};
  assert.equal(contentPlanSchema.parse(plan).publishSource,undefined);
  assert.equal(contentPlanSchema.parse({...plan,publishSource:'api'}).publishSource,'api');
});

test('UTM links contain all attribution parameters and preserve existing query values and fragment',()=>{
  const input={productSlug:'Night light',accountHandle:'@Shop.One',planId:'plan_1',hookId:'hook_A',ctaKeyword:'LED'};
  const original=structuredClone(input);
  const url=new URL(buildUtmLink('https://shop.example/product?ref=partner&tag=one&tag=two&empty=&offer=a%26b#join',input));
  assert.equal(url.origin+url.pathname,'https://shop.example/product');assert.equal(url.hash,'#join');
  assert.equal(url.searchParams.get('ref'),'partner');assert.deepEqual(url.searchParams.getAll('tag'),['one','two']);
  assert.equal(url.searchParams.get('empty'),'');assert.equal(url.searchParams.get('offer'),'a&b');
  assert.equal(url.searchParams.get('utm_source'),'instagram');assert.equal(url.searchParams.get('utm_medium'),'dm');
  assert.equal(url.searchParams.get('utm_campaign'),'night-light');assert.equal(url.searchParams.get('utm_content'),'shop.one-hook-a');
  assert.equal(url.searchParams.get('utm_term'),'led');assert.deepEqual(input,original);
  const changed=new URL(buildUtmLink(url.href.replace('utm_source=instagram','utm_source=old')+'&utm_source=duplicate',input));
  assert.deepEqual(changed.searchParams.getAll('utm_source'),['instagram']);
});

test('UTM slugs remove Vietnamese accents, normalize whitespace and fall back to plan ID for a missing hook',()=>{
  const input={productSlug:'  Đèn ngủ ĐỎ – tiện ích! ',accountHandle:'@Cửa_Hàng.Đẹp',planId:'Kế hoạch 02',hookId:'Mở đầu Á',ctaKeyword:'ĐẶT CHỖ'};
  const url=new URL(buildUtmLink('https://shop.example',input));
  assert.equal(url.searchParams.get('utm_campaign'),'den-ngu-do-tien-ich');
  assert.equal(url.searchParams.get('utm_content'),'cua_hang.dep-mo-dau-a');
  assert.equal(url.searchParams.get('utm_term'),'dat-cho');
  for(const hookId of [undefined,null,'','  '])assert.equal(new URL(buildUtmLink('https://shop.example',{...input,hookId})).searchParams.get('utm_content'),'cua_hang.dep-ke-hoach-02');
  assert.equal(buildUtmLink('https://shop.example',input),buildUtmLink('https://shop.example',{...input,productSlug:input.productSlug.normalize('NFD')}));
});

test('UTM links distinguish account/hook pairs, including dots versus underscores in Instagram handles',()=>{
  const links=[];
  for(const accountHandle of ['shop.one','shop_one','shoptwo'])for(const hookId of ['hook_A','hook_B'])
    links.push(buildUtmLink('https://shop.example',{productSlug:'Light',accountHandle,planId:'plan',hookId,ctaKeyword:'LED'}));
  assert.equal(new Set(links).size,6);
});

test('UTM rejects non-HTTPS URLs, credentials and missing attribution instead of inventing values',()=>{
  const input={productSlug:'Light',accountHandle:'shop',planId:'plan',hookId:'a',ctaKeyword:'LED'};
  for(const base of ['http://shop.example','javascript:alert(1)','data:text/plain,x','file:///landing.html','//shop.example','/landing','not a URL','https://user:secret@shop.example'])
    assert.throws(()=>buildUtmLink(base,input),/HTTPS/);
  for(const patch of [{productSlug:''},{accountHandle:'@'},{ctaKeyword:'🙏'},{hookId:null,planId:''}])
    assert.throws(()=>buildUtmLink('https://shop.example',{...input,...patch}),/Thiếu/);
});

test('UTM plan fields are optional/null for legacy records and reject unsafe stored links',()=>{
  const legacy={name:'Old plan',productId:'p'};
  const parsed=contentPlanSchema.parse(legacy);
  for(const key of ['utmLink','landingBaseUrl','utmHookId'])assert.equal(parsed[key],undefined);
  const empty=contentPlanSchema.parse({...legacy,utmLink:null,landingBaseUrl:null,utmHookId:null});
  assert.equal(empty.utmLink,null);assert.equal(empty.landingBaseUrl,null);assert.equal(empty.utmHookId,null);
  const utmLink=buildUtmLink('https://shop.example/?keep=1',{productSlug:'Light',accountHandle:'shop',planId:'plan',hookId:'a',ctaKeyword:'LED'});
  const saved=contentPlanSchema.parse({...legacy,utmLink,landingBaseUrl:'https://shop.example/?keep=1',utmHookId:'a'});
  assert.deepEqual(contentPlanSchema.parse(JSON.parse(JSON.stringify(saved))),saved);
  for(const field of ['utmLink','landingBaseUrl'])for(const value of ['http://shop.example','javascript:alert(1)'])
    assert.equal(contentPlanSchema.safeParse({...legacy,[field]:value}).success,false);
});

test('UTM context follows saved product/account/export; ambiguous A/B never silently picks the first hook',()=>{
  const {records,product}=instagramOverviewFixture(),plan=records.find(row=>row.id==='plan_1_1');
  const project=records.find(row=>row.id===plan.data.productionId),first=project.data.variants[0];
  records.push({id:'landing',kind:'landing_page',data:{productId:product.id,ctaUrl:'https://shop.example/landing'}});
  let context=planUtmContext(records,plan);
  assert.equal(context.account.id,'account_1');assert.equal(context.landing.data.ctaUrl,'https://shop.example/landing');assert.equal(context.hookId,first.id);
  project.data.variants.push({id:'hook_b',name:'B',ctaKeyword:'RUN'});
  assert.equal(planUtmContext(records,plan).hookId,first.id);
  plan.data.assetId='';assert.equal(planUtmContext(records,plan).hookId,'');
  plan.data.utmHookId='hook_b';assert.equal(planUtmContext(records,plan).hookId,'hook_b');
  plan.data.utmHookId='';assert.equal(planUtmContext(records,plan).hookId,'');
  delete plan.data.utmHookId;plan.data.productionId='';assert.equal(planUtmContext(records,plan).variants.length,2);
  records.push({...project,id:'ambiguous'});assert.equal(planUtmContext(records,plan).variants.length,0);
  plan.data.accountId='missing';assert.equal(planUtmContext(records,plan).account,undefined);
  plan.data.accountId='account_1';records.find(row=>row.id==='account_1').data.productId='other';
  assert.equal(planUtmContext(records,plan).account,undefined);
});

test('keyword comments match entire words, ignoring case/punctuation/emoji without joining word parts',()=>{
  const positive=['LED','led!','LED 🙏','Please, LeD.','🔥LED🔥','ＬＥＤ','(LED) LED','🏃‍♂️LED','❤️LED❤️','LED1️⃣','#️⃣LED'];
  const negative=['ledger','sled','LEDs','LED123','123LED','le🙏d','l.e.d','đènLED','LEDđèn'];
  const result=countKeywordComments([...positive,...negative],'led');
  assert.equal(result.total,20);assert.equal(result.matched,11);assert.equal(result.matchedUniqueUsers,null);
  assert.deepEqual(result.examples,positive.slice(0,5));
  assert.deepEqual(countKeywordComments(['ledger'],'LED'),{total:1,matched:0,matchedUniqueUsers:0,examples:[]});
  assert.equal(countKeywordComments(['LED'],'🙏').matched,0);
  assert.equal(countKeywordComments(['RUN!','runner','runway'],'RUN').matched,1);
  assert.equal(countKeywordComments(['helpful','HELP 🙏'],'HELP').matched,1);
  assert.equal(countKeywordComments(['cafe\u0301!','caféine'],'café').matched,1);
});

test('unique matching usernames are case-insensitive; anonymous matches keep unique users unknown',()=>{
  const comments=[{username:'Alice',text:'LED'},{username:'@alice',text:'led!'},
    {username:'bob',text:'LED LED'},{username:null,text:'How much?'}];
  const original=structuredClone(comments);
  assert.deepEqual(countKeywordComments(comments,'LED'),{total:4,matched:3,matchedUniqueUsers:2,examples:['LED','led!','LED LED']});
  assert.deepEqual(comments,original);
  assert.equal(countKeywordComments([...comments,{text:'LED'}],'LED').matchedUniqueUsers,null);
  assert.deepEqual(countKeywordComments(['','  ','\n'],'LED'),{total:0,matched:0,matchedUniqueUsers:0,examples:[]});
});

test('paste format is explicit, supports CRLF, @handles and empty lines, and does not count usernames as CTA',()=>{
  const raw='alice LED!\r\n@ALICE led 🙏\r\n\r\nled_user hello\nbob: LED\rLED';
  assert.deepEqual(parseCommentPaste('Please LED'),[{username:null,text:'Please LED'}]);
  assert.equal(countKeywordComments(parseCommentPaste(raw,'username'),'LED').matched,4);
  assert.equal(countKeywordComments(parseCommentPaste(raw,'username'),'LED').matchedUniqueUsers,null);
  assert.deepEqual(parseCommentPaste('@alice LED\r\nbob: ledger','username'),[{username:'alice',text:'LED'},{username:'bob',text:'ledger'}]);
  assert.equal(countKeywordComments(parseCommentPaste('LED hello','username'),'LED').matched,0);
  assert.equal(countKeywordComments(parseCommentPaste('LED hello','text'),'LED').matched,1);
});

test('measurement schema derives counts, limits pasted data and keeps old plans compatible',()=>{
  const input={planId:'p',accountId:'a',sourceUrl:'https://instagram.com/p/a/',source:'manual_paste',observedAt:'2026-11-12T01:00:00Z',keyword:' led ',rawText:'alice LED\nbob ledger',inputFormat:'username',matched:999,matchedUniqueUsers:999};
  const parsed=keywordCommentMeasurementSchema.parse(input);
  assert.equal(parsed.keyword,'LED');assert.equal(parsed.matched,1);assert.equal(parsed.matchedUniqueUsers,1);assert.equal(parsed.total,2);
  assert.deepEqual(keywordCommentMeasurementSchema.parse(parsed),parsed);
  for(const patch of [{rawText:''},{rawText:' \r\n '},{rawText:'a'.repeat(100001)},{keyword:'LED RUN'},{keyword:'🙏'},{source:'instagram_browser'},{inputFormat:'guess'},{observedAt:'bad'}])
    assert.equal(keywordCommentMeasurementSchema.safeParse({...input,...patch}).success,false);
  const old={name:'Old plan',productId:'p'};
  assert.equal(contentPlanSchema.parse(old).ctaKeyword,undefined);
  assert.equal(contentPlanSchema.parse({...old,ctaKeyword:null}).ctaKeyword,null);
  assert.equal(contentPlanSchema.parse({...old,ctaKeyword:''}).ctaKeyword,null);
  assert.equal(contentPlanSchema.parse({...old,ctaKeyword:' help '}).ctaKeyword,'HELP');
});

test('keyword table takes latest matching source across aliases without adding counts or altering Insights',()=>{
  const {records,product,at}=instagramOverviewFixture();
  const plan=records.find(r=>r.id==='plan_1_1');
  const add=(id,patch={})=>records.push({id,kind:'keyword_comment_measurement',updatedAt:at,revision:1,data:keywordCommentMeasurementSchema.parse({
    planId:plan.id,accountId:plan.data.accountId,sourceUrl:plan.data.postUrl,source:'manual_paste',observedAt:new Date(at+1000).toISOString(),keyword:'LED',inputFormat:'username',rawText:'alice LED\nbob LED',...patch})});
  const row=()=>instagramAccountContentRows(records,product.id).find(r=>r.planIds.includes(plan.id));
  const before=structuredClone(records.filter(r=>r.kind==='social_metric'));
  assert.equal(row().keywordComments,null);assert.equal(row().keywordCommentRate,null);
  add('first');assert.equal(row().keywordComments,2);assert.equal(row().keywordCommentRate,.02);
  records.push({...plan,id:'alias'});
  add('latest',{planId:'alias',rawText:'alice LED',observedAt:new Date(at+2000).toISOString()});
  for(const patch of [{accountId:'account_2'},{sourceUrl:'https://instagram.com/p/foreign/'},{planId:'foreign'}])add('wrong_'+records.length,{...patch,observedAt:new Date(at+3000).toISOString(),rawText:'a LED\nb LED\nc LED'});
  assert.equal(row().keywordComments,1);assert.equal(row().keywordMeasurements.length,2);assert.equal(row().keywordMeasurement.id,'latest');
  assert.equal(instagramAccountContentRows(records,product.id).length,6);
  assert.deepEqual(records.filter(r=>r.kind==='social_metric'),before);
  plan.data.ctaKeyword='RUN';assert.equal(row().plannedCtaKeyword,'RUN');assert.equal(row().ctaKeyword,'LED');
  add('zero',{rawText:'alice ledger',observedAt:new Date(at+4000).toISOString()});
  assert.equal(row().keywordComments,0);assert.equal(row().keywordCommentRate,0);
  records.find(r=>r.id==='metric_'+plan.id).data.views=null;assert.equal(row().keywordCommentRate,null);
  records.find(r=>r.id==='metric_'+plan.id).data.views=0;assert.equal(row().keywordCommentRate,null);
});

test('keyword/view rate distinguishes missing, zero denominator and an observed zero count',()=>{
  assert.equal(keywordCommentViewRate(null,100),null);assert.equal(keywordCommentViewRate(0,null),null);
  assert.equal(keywordCommentViewRate(0,0),null);assert.equal(keywordCommentViewRate(1,0),null);
  assert.equal(keywordCommentViewRate(0,100),0);assert.equal(keywordCommentViewRate(5,200),.025);
  assert.equal(keywordCommentViewRate(1,NaN),null);assert.equal(keywordCommentViewRate(-1,100),null);
});

test('analysis prompt shares taxonomy and caps all evidence at 4000 characters with dense timing and provenance rules',()=>{
  const structure=structureFor(),prompt=formulaAnalysisPrompt({structure,caption:'Comment LED',fileName:'LED.mp4',formulas:viralFormulas});
  for(const value of [...Object.values(formulaTaxonomy).flat(),...formulaProductTraits])assert.ok(prompt.includes('"'+value+'"'));
  for(const term of ['ctaSource','effectsBeyondProduct','JSON object only','k × secondsPerFrame','fromSec','4 fps','First-person','POV','No audio transcript','verbatim','null'])assert.ok(prompt.includes(term),term);
  assert.ok(prompt.includes('Comment LED'));assert.ok(prompt.includes('fixture/dense-01.jpg'));assert.ok(prompt.length<=4000);
  const huge={...structure,cuts:Array.from({length:10000},(_,i)=>i/100),frames:Array.from({length:225},(_,i)=>({t:i*.8,path:'x'.repeat(2000)})),contactSheetPath:'x'.repeat(2000),
    contactSheets:{...structure.contactSheets,dense:Array.from({length:6},()=>({...structure.contactSheets.dense[0],path:'x'.repeat(2000)}))}};
  const long=formulaAnalysisPrompt({structure:huge,caption:'"'.repeat(2200),fileName:'x'.repeat(1000),formulas:Array.from({length:100},()=>viralFormulas[0])});
  assert.ok(long.length<=4000);assert.match(long,/truncated/);
  for(const value of [...Object.values(formulaTaxonomy).flat(),...formulaProductTraits])assert.ok(long.includes('"'+value+'"'));
  const pages=Array.from({length:6},(_,i)=>({...structure.contactSheets.dense[0],path:'x'.repeat(2000),fromSec:i*30,toSec:(i+1)*30}));
  const multipage=formulaAnalysisPrompt({structure:{...structure,durationSec:180,contactSheets:{...structure.contactSheets,dense:pages}},caption:'x'.repeat(2200),fileName:'x'.repeat(1000),formulas:viralFormulas});
  assert.ok(multipage.length<=4000);assert.ok(multipage.includes('[[0,30],[30,60],[60,90],[90,120],[120,150],[150,180]]'));
});

test('analysis JSON and fences preserve verbatim text, nulls and measured numbers; incorrect measurements produce warnings',()=>{
  const structure=structureFor(),response=analysisResponse();
  response.hookText='  The problem😕  ';response.cutCount=999;response.durationSec=999;
  const json=JSON.stringify(response),parsed=parseFormulaAnalysis(json,structure);
  assert.deepEqual(parseFormulaAnalysis('```json\n'+json+'\n```',structure),parsed);
  assert.deepEqual(parseFormulaAnalysis('```\n'+json+'\n```',structure),parsed);
  assert.equal(parsed.hookText,response.hookText);assert.equal(parsed.cutCount,structure.cutCount);assert.equal(parsed.durationSec,structure.durationSec);
  assert.ok(parsed.warnings.some(w=>w.includes('Số lần cắt')));assert.ok(parsed.warnings.some(w=>w.includes('Thời lượng')));
  assert.equal(parsed.visualPayoff,null);assert.equal(parsed.effectsBeyondProduct,null);
  const noText=parseFormulaAnalysis(JSON.stringify({...response,hookText:null,ctaText:null,ctaKeyword:null,ctaType:null,ctaSource:'none'}),structure);
  assert.equal(noText.hookText,null);assert.equal(noText.ctaType,null);assert.equal(noText.ctaSource,'none');
});

test('analysis strict schemas reject invalid enums, extra fields, reversed/outside beats and prose envelopes',()=>{
  const response=analysisResponse(),structure=structureFor();
  const bad=[{hookType:'other'},{ctaType:'none_visible'},{ctaSource:'audio'},{productTraits:['made_up']},{unexpected:true},
    {beats:[{...response.beats[0],fromSec:2,toSec:1}]},{beats:[{...response.beats[0],fromSec:-1}]},
    {beats:[{...response.beats[0],toSec:structure.durationSec+.5001}]},{beats:[{...response.beats[0],kind:'unbox'}]},
    {beats:[{...response.beats[0],role:'opening'}]},{beats:[{...response.beats[0],extra:'invented'}]}];
  for(const patch of bad)assert.throws(()=>parseFormulaAnalysis(JSON.stringify({...response,...patch}),structure),/^Error: Phản hồi chưa đúng cấu trúc…/);
  for(const text of ['no JSON','[]','Here is the JSON '+JSON.stringify(response)])assert.throws(()=>parseFormulaAnalysis(text,structure),/Phản hồi chưa đúng cấu trúc/);
  const overlapping={...response,beats:[{...response.beats[0],fromSec:0,toSec:3},{...response.beats[1],fromSec:2,toSec:structure.durationSec+.5}]};
  assert.equal(parseFormulaAnalysis(JSON.stringify(overlapping),structure).beats.at(-1).toSec,structure.durationSec+.5);
});

test('caption and filename CTA keywords are checked case-insensitively; first-person story warns without guessing audio',()=>{
  const structure=structureFor(),response={...analysisResponse(),ctaKeyword:'LED'};
  for(const ctaSource of ['caption','filename']){
    const text=JSON.stringify({...response,ctaSource});
    const ok=parseFormulaAnalysis(text,structure,{caption:'Comment led for the link',fileName:'Comment lEd.mp4'});
    assert.equal(ok.ctaSource,ctaSource);
    for(const context of [{},{caption:'No link',fileName:'other.mp4'}]){
      const bad=parseFormulaAnalysis(text,structure,context);assert.equal(bad.ctaSource,null);assert.ok(bad.warnings.some(w=>w.includes('Không xác minh')));
    }
    assert.equal(parseFormulaAnalysis(JSON.stringify({...response,ctaSource,ctaKeyword:null}),structure,{caption:'LED',fileName:'LED.mp4'}).ctaSource,null);
  }
  const firstPerson=analysisReferences[11],parsed=parseFormulaAnalysis(JSON.stringify(analysisResponse(firstPerson)),structureFor(firstPerson));
  assert.ok(parsed.warnings.some(w=>w.includes('POV')));assert.ok(parsed.warnings.some(w=>w.includes('transcript')));
});

test('V1–V12 semantic fixtures match hook + beat sequence independent of labels/timing and latest input order',()=>{
  assert.equal(analysisReferences.length,12);
  for(const reference of analysisReferences){
    const result=matchFormula(reference,viralFormulas);
    assert.equal(result.confidence,reference.id==='V10'?'partial':'exact',reference.id);
  }
  const reference=analysisReferences[4];
  assert.equal(matchFormula(reference,viralFormulas).formulaId,'problem-vs-result-cta');
  const jitter={...reference,beats:reference.beats.map(b=>({...b,fromSec:b.fromSec+.1,toSec:b.toSec+.2,label:'Changed'}))};
  assert.deepEqual(matchFormula(jitter,[...viralFormulas].reverse()),matchFormula(reference,viralFormulas));
  assert.equal(matchFormula({...reference,beats:[...reference.beats].reverse()},viralFormulas).confidence,'partial');
  assert.equal(matchFormula({...reference,hookType:null},viralFormulas).confidence,'none');
  const version={...viralFormulas.find(f=>f.id==='problem-vs-result-cta'),version:2,hookType:'authority_check'};
  assert.equal(matchFormula(reference,[...viralFormulas,version]).confidence,'partial');
});

test('one unmatched video is candidate; two distinct sources are new, deterministically and without applying anything',()=>{
  const one=analysisReferences[9],two={...one,id:'R2'},before=JSON.stringify({one,formulas:viralFormulas});
  const candidate=proposeFormulaChanges([one],viralFormulas);
  assert.equal(candidate.length,1);assert.equal(candidate[0].change,'candidate');assert.equal(candidate[0].formula,null);assert.ok(candidate[0].reasons.includes('cần thêm 1 ví dụ'));
  const proposed=proposeFormulaChanges([one,two],viralFormulas);
  assert.equal(proposed[0].change,'new');assert.equal(proposed[0].formula.version,1);assert.deepEqual(proposed[0].formula.references,['R2','V10']);
  assert.deepEqual(proposeFormulaChanges([two,one],[...viralFormulas].reverse()),proposed);
  assert.equal(proposeFormulaChanges([one,one],viralFormulas)[0].change,'candidate');
  assert.equal(proposeFormulaChanges([{...one,sourceSha256:'a'.repeat(64)},{...two,sourceSha256:'a'.repeat(64)}],viralFormulas)[0].change,'candidate');
  assert.equal(JSON.stringify({one,formulas:viralFormulas}),before);
  assert.deepEqual(proposeFormulaChanges([{...one,hookType:null}],viralFormulas),[]);
  assert.equal(matchFormula(one,[...viralFormulas,proposed[0].formula]).confidence,'exact');
  const unknown=proposeFormulaChanges([{...one,durationSec:null,cutCount:null},two],viralFormulas)[0].formula;
  assert.equal(unknown.durationSec,null);assert.equal(unknown.cuts,null);
});

test('matched references propose label and CTA variants as append-only previews, using latest version and verified CTA source',()=>{
  const reference={...analysisReferences[4],ctaText:'DM LED for details',ctaType:'send_keyword_dm'},original=viralFormulas.find(f=>f.id==='problem-vs-result-cta');
  const latest={...original,version:4},before=JSON.stringify(latest);
  const proposals=proposeFormulaChanges([reference],[...viralFormulas,latest]);
  assert.deepEqual(proposals.map(p=>p.change),['add-label-variant','add-cta-pattern']);
  for(const proposal of proposals){assert.equal(proposal.formula.version,5);assert.equal(proposal.formula.id,original.id);}
  const cta=proposals.find(p=>p.change==='add-cta-pattern').formula;
  assert.ok(cta.ctaPatterns.includes('DM {WORD} for details'));assert.equal(JSON.stringify(latest),before);
  assert.ok(!proposeFormulaChanges([{...reference,ctaSource:null}],[latest]).some(p=>p.change==='add-cta-pattern'));
  assert.ok(!proposeFormulaChanges([reference],[cta]).some(p=>p.change==='add-cta-pattern'));
  assert.ok(!proposeFormulaChanges([reference],[proposals[0].formula]).some(p=>p.change==='add-label-variant'));
});

test('draft stores optional context and strict analysis alongside legacy beats; mismatched measured values cannot be saved',()=>{
  const structure=structureFor(),analysis=parseFormulaAnalysis(JSON.stringify(analysisResponse()),structure);
  const draft=draftReferenceVideo({id:'json_draft',product:'Sample',structure});
  const current=referenceVideoDraftSchema.parse({...draft,caption:'Comment LED',fileName:'LED.mp4',analysis});
  assert.deepEqual(current.analysis,analysis);assert.equal(current.caption,'Comment LED');assert.ok(current.structure.contactSheets);
  for(const patch of [{caption:'x'.repeat(2201)},{analysis:{...analysis,cutCount:0}},{analysis:{...analysis,durationSec:1}},
    {analysis:{...analysis,ctaSource:'caption'},caption:'Missing keyword'}])assert.equal(referenceVideoDraftSchema.safeParse({...current,...patch}).success,false);
  const legacy=referenceVideoDraftSchema.parse({id:'old',product:'Legacy'});
  assert.equal(legacy.analysis,undefined);assert.equal(legacy.caption,undefined);assert.equal(legacy.fileName,undefined);
  const sparseOnly=parseFormulaAnalysis(JSON.stringify(analysisResponse()),{...structure,contactSheets:undefined});
  assert.ok(sparseOnly.warnings.some(w=>w.includes('Chưa có sheet dày')));
});

test('content plan AI label preserves legacy records and accepts only optional/null, required or off',()=>{
  const data={name:'Muse concept',productId:'product',caption:'AI-generated concept'};
  assert.equal(contentPlanSchema.parse(data).aiLabel,undefined);
  for(const aiLabel of [null,'required','off'])assert.equal(contentPlanSchema.parse({...data,aiLabel}).aiLabel,aiLabel);
  for(const aiLabel of [false,0,'','optional'])assert.equal(contentPlanSchema.safeParse({...data,aiLabel}).success,false);
});

test('research coverage counts explicit zero but never missing costs, showroom or duplicate page metrics',()=>{
  const metric={label:'Reviews',value:20,unit:'reviews',market:'US',period:'At read time',sourceUrl:'https://example.test/review',observedAt:'2026-11-12T00:00:00Z'};
  const rows=Array.from({length:10},(_,i)=>candidateSchema.parse({id:'coverage'+i,name:'Product '+i,supplierUrl:i<2?'https://example.test/showroom':'https://example.test/item/'+i,evidenceNotes:'Fixture',cost:i<2?0:null,shipping:i===0?0:null,matchType:i===0?'exact_sku':'similar',marketEvidence:[{...metric,...(i===9?{value:0,sourceUrl:'https://example.test/review/unique'}:{})}]}));
  const before=structuredClone(rows);
  assert.deepEqual(researchCoverage(rows),{total:10,cost:2,shipping:1,exactSku:1,individualListing:8,productMetrics:1});
  assert.deepEqual(rows,before);
  assert.deepEqual(researchCoverage([]),{total:0,cost:0,shipping:0,exactSku:0,individualListing:0,productMetrics:0});
  assert.equal(researchCoverage([{...rows[9],marketEvidence:[{...metric,period:''}]}]).productMetrics,0);
  assert.equal(researchCoverage([{...rows[9],cost:undefined,shipping:undefined,marketEvidence:undefined}]).cost,0);
  const check={status:'ok',sourceUrl:rows[9].supplierUrl,productCountReliable:true,productCountOnPage:12};
  assert.equal(hasIndividualListing({...rows[9],listingCheck:check}),false);
  assert.equal(hasIndividualListing({...rows[9],supplierUrl:'https://example.test/showroom'}),false);
  assert.equal(hasIndividualListing({...rows[9],listingCheck:{...check,productCountOnPage:1}}),true);
});

test('landed cost badge compares only complete USD amounts at the inclusive 20 USD threshold',()=>{
  const row=candidateSchema.parse({id:'badge',name:'Fixture',supplierUrl:'https://example.test/item/a',evidenceNotes:'Quote',cost:15,shipping:5});
  assert.equal(landedCostBadge(row).label,'≤ 20 USD');
  assert.equal(landedCostBadge({...row,cost:0,shipping:0}).label,'≤ 20 USD');
  assert.equal(landedCostBadge({...row,shipping:5.01}).label,'> 20 USD');
  for(const patch of [{cost:null},{shipping:null},{cost:undefined},{currency:'CNY'},{costCurrency:'CNY'},{shippingCurrency:'GBP'}]){
    const badge=landedCostBadge({...row,...patch});assert.equal(badge.label,'Chưa đủ số');assert.equal(badge.tone,'neutral');
  }
  assert.equal(landedCostBadge({...row,currency:'CNY'}).amount,20);
  assert.equal(landedCostBadge({...row,costCurrency:'CNY'}).amount,null);
  assert.deepEqual(researchRisks(row),['Chưa rõ']);
  assert.deepEqual(researchRisks({...row,logisticsFlags:{battery:true,liquid:false}}),['Pin','Chưa rõ']);
});

test('checking twice plans the same product and selection; unchecking retains data and enforces three choices',()=>{
  const batch=researchBatchSchema.parse({name:'Selection fixture',candidates:Array.from({length:4},(_,i)=>({id:'pick'+i,name:'Product '+i,supplierUrl:'https://example.test/item/'+i,evidenceNotes:'Fixture'})),notes:'[Muse receipt_keep]'});
  const first=planResearchSelection('batch',batch,'pick0',true),again=planResearchSelection('batch',first.data,'pick0',true);
  assert.equal(again.data,first.data);assert.equal(again.productId,first.productId);assert.deepEqual(again.data.selectedIds,['pick0']);
  assert.deepEqual(batch.selectedIds,[]);assert.equal(first.data.notes,batch.notes);
  const removed=planResearchSelection('batch',again.data,'pick0',false);
  assert.equal(removed.productId,null);assert.deepEqual(removed.data.selectedIds,[]);assert.equal(removed.data.candidates,batch.candidates);
  const full={...batch,selectedIds:['pick0','pick1','pick2']};
  assert.equal(planResearchSelection('batch',full,'pick0',true).data,full);
  assert.throws(()=>planResearchSelection('batch',full,'pick3',true),/tối đa 3/);
  assert.throws(()=>planResearchSelection('batch',full,'missing',true),/không còn/);
});

test('selection stops on CAS conflict and retries promote after an uncertain response without resetting the receipt',async()=>{
  const record={id:'retry',kind:'research_batch',revision:1,data:researchBatchSchema.parse({name:'Retry fixture',candidates:[{id:'pick',name:'Product',supplierUrl:'https://example.test/item/pick',evidenceNotes:'Fixture'}],notes:'[Muse stable]'})};
  const calls=[];
  await assert.rejects(()=>saveResearchSelection(record,'pick',true,async(kind)=>{calls.push(kind);throw Error('CAS');}),/CAS/);
  assert.deepEqual(calls,['research_batch']);
  let selected;
  await assert.rejects(()=>saveResearchSelection(record,'pick',true,async(kind,id,data)=>{
    if(kind==='product')throw Error('Reply lost');
    selected={...record,data,revision:2};return selected;
  }),/chưa xác nhận hồ sơ/);
  const retried=[];
  await saveResearchSelection(selected,'pick',true,async(...args)=>{retried.push(args);return {id:args[1],kind:args[0],data:args[2],revision:1};});
  assert.equal(retried.length,1);assert.equal(retried[0][0],'product');assert.equal(retried[0][1],'research_retry_pick');assert.equal(retried[0][4],'promote');
  assert.equal(selected.data.notes,'[Muse stable]');
});

test('structured English criteria keep user budget and exclusions in the runner query without truncation',()=>{
  const input={criteria:defaultResearchCriteria,maxLandedCost:'20',niche:'night runners',exclusions:defaultResearchExclusions};
  const query=buildResearchQuery(input);
  assert.match(query,/Maximum supplier cost \+ shipping to the US: 20 USD/);assert.match(query,/Niche or target audience: night runners/);
  assert.ok(query.includes(defaultResearchExclusions));assert.ok(query.length<=1500);
  assert.match(buildResearchQuery({...input,maxLandedCost:'15.50'}),/15.5 USD/);
  assert.match(museTaskPrompt('research',{query}),/use another explicit USD maximum from the user research query/);
  for(const maxLandedCost of ['', '0','-1','NaN','Infinity','1000000001'])assert.throws(()=>buildResearchQuery({...input,maxLandedCost}),/lớn hơn 0/);
  assert.throws(()=>buildResearchQuery({...input,criteria:'x'.repeat(1500)}),/Rút gọn/);
  assert.throws(()=>buildResearchQuery({...input,criteria:' '}),/Điền tiêu chí/);
});

const referenceStructure={durationSec:6,width:90,height:160,aspectRatio:'9:16',cuts:[2,4],cutCount:2,contactSheetPath:'fixture/contact.jpg',frames:[{t:0,path:'fixture/0.jpg'},{t:.8,path:'fixture/1.jpg'}]};
test('reference draft uses template proportions and nearby cuts without inventing copy or semantic observations',()=>{
  const frozen=JSON.stringify(referenceStructure);
  const draft=draftReferenceVideo({id:'reference',product:'Unreviewed sample',structure:referenceStructure});
  assert.equal(draft.formulaId,'problem-vs-result-cta');assert.equal(draft.status,'draft');assert.equal(draft.durationSec,6);assert.equal(draft.cuts,2);
  assert.equal(draft.hookText,'');assert.equal(draft.ctaText,'');
  for(const key of ['hookType','ctaType','ctaKeyword','productTraits','sourceSha256','sourceUrl','integrationJobId','projectId'])assert.equal(draft[key],null);
  assert.ok(draft.beats.every(b=>b.label===''));assert.equal(draft.beats[0].fromSec,0);assert.equal(draft.beats.at(-1).toSec,6);
  assert.ok(draft.beats.some(b=>b.toSec===2||b.toSec===4));
  assert.equal(JSON.stringify(referenceStructure),frozen);
  const chosen={...viralFormulas[1],version:7};
  assert.equal(draftReferenceVideo({id:'custom',product:'Sample',structure:referenceStructure,formula:chosen}).formulaVersion,7);
  const legacy=referenceVideoSchema.parse({id:'old',product:'Legacy'});
  const migrated=referenceVideoDraftSchema.parse(legacy);
  assert.equal(migrated.structure,null);assert.equal(migrated.beats,null);assert.equal(migrated.durationSec,null);assert.equal(migrated.cuts,null);
});
test('draft beats remain continuous, positive and bounded for each formula, short videos and clustered cuts',()=>{
  for(const formula of viralFormulas)for(const durationSec of [.04,.2,6,180])for(const fractions of [[],[.001,.002,.999],[.1,.3,.5,.8]]){
    const cuts=fractions.map(t=>t*durationSec),structure={...referenceStructure,durationSec,cuts,cutCount:cuts.length,frames:[{t:0,path:'fixture.jpg'}]};
    const draft=draftReferenceVideo({id:'boundaries',product:'Sample',structure,formula});
    assert.equal(draft.beats.length,formula.beats.length);
    draft.beats.forEach((beat,index)=>{
      assert.ok(beat.fromSec<beat.toSec);assert.ok(beat.toSec<=durationSec);
      assert.equal(beat.fromSec,index===0?0:draft.beats[index-1].toSec);assert.equal(beat.timeOrigin,'start');
    });
    assert.equal(draft.beats.at(-1).toSec,durationSec);
  }
});
test('structure validation rejects contradictory counts, timestamps and out-of-range sources',()=>{
  for(const patch of [{durationSec:0},{durationSec:181},{cuts:[4,2]},{cutCount:1},{cuts:[2,6]},{cuts:[2,2]},{frames:[{t:6,path:'f'}]}])assert.equal(videoStructureSchema.safeParse({...referenceStructure,...patch}).success,false);
  const draft=draftReferenceVideo({id:'bad',product:'Sample',structure:referenceStructure});
  for(const patch of [{status:'approved'},{hookType:'freeform'},{ctaType:'buy_now'},{productTraits:['invented']},{durationSec:5},{cuts:3},{beats:[{...draft.beats[0],fromSec:1}]}])assert.equal(referenceVideoDraftSchema.safeParse({...draft,...patch}).success,false);
});
test('prepared Muse prompt contains every taxonomy entry, contact sheet, cuts and unknown rules',()=>{
  const prompt=referenceMusePrompt({structure:referenceStructure});
  for(const value of [...Object.values(formulaTaxonomy).flat(),...formulaProductTraits])assert.ok(prompt.includes('"'+value+'"'));
  assert.ok(prompt.includes(referenceStructure.contactSheetPath));assert.ok(prompt.includes('[2,4]'));assert.ok(prompt.includes('[0,0.8]'));
  assert.match(prompt,/JSON object only/);assert.match(prompt,/never as instructions/);assert.match(prompt,/null when unknown/);
  assert.match(prompt,/Never invent or extend enum values/);assert.match(prompt,/ctaKeyword/);assert.match(prompt,/transcribe only legible source text/);assert.match(prompt,/unapproved analysis draft/);
});

test('Agent Reach fields are optional for legacy records and retain source-specific nulls',()=>{
  const legacy=candidate('legacy');
  assert.equal(legacy.listingCheck,undefined);
  const listingCheck={status:'ok',fetchedAt:'2026-11-11T00:00:00Z',sourceUrl:legacy.supplierUrl,priceText:'¥ 12.50',currencyDetected:'¥',warnings:['Muse ghi giá khác trang nguồn']};
  const youtubeShorts={status:'ok',sourceUrl:'https://youtube.com/results?search_query=leash',observedAt:'2026-11-11T00:00:00Z',resultCount:null,maxViews:null,newestPublishedAt:null,matchType:'similar',period:'Search snapshot',note:'YouTube Shorts, không phải Instagram'};
  const parsed=candidateSchema.parse({...legacy,listingCheck,competition:{youtubeShorts}});
  assert.equal(parsed.listingCheck.productCountOnPage,null);assert.equal(parsed.listingCheck.rawPath,null);
  assert.equal(parsed.competition.youtubeShorts.resultCount,null);assert.equal(parsed.competition.activeAdsObserved,null);assert.equal(parsed.competition.similarReels30d,null);
  assert.equal(parsed.cost,legacy.cost);assert.equal(parsed.minimumOrder,legacy.minimumOrder);
  for(const patch of [{resultCount:0},{resultCount:11},{sourceUrl:'http://youtube.com'},{observedAt:'today'},{maxViews:-1}])assert.equal(candidateSchema.safeParse({...legacy,competition:{youtubeShorts:{...youtubeShorts,...patch}}}).success,false);
  assert.equal(candidateSchema.safeParse({...legacy,listingCheck:{...listingCheck,status:'interrupted'}}).success,false);
  assert.equal(candidateSchema.parse({...parsed,competition:{...parsed.competition,youtubeShorts:{...youtubeShorts,resultCount:1,maxViews:0}}}).competition.youtubeShorts.maxViews,0);
});

test('Muse cannot forge local checks and replay preserves existing Agent Reach evidence',()=>{
  const row=candidate('candidate'),listingCheck={status:'ok',fetchedAt:'2026-11-11T00:00:00Z',sourceUrl:row.supplierUrl};
  const youtubeShorts={status:'ok',sourceUrl:'https://youtube.com/results?search_query=leash',observedAt:'2026-11-11T00:00:00Z',resultCount:2,matchType:'similar',period:'Snapshot',note:'YouTube'};
  const chat={requestId:'sources',profileId:'p',providerUrl:null,response:JSON.stringify({summary:'Provider text',candidates:[{...row,listingCheck,competition:{youtubeShorts}}]})};
  const imported=mergeMuseResearch(researchBatchSchema.parse({name:'Fixture'}),chat);
  assert.equal(imported.candidates[0].listingCheck,undefined);assert.equal(imported.candidates[0].competition.youtubeShorts,undefined);
  const checked=researchBatchSchema.parse({...imported,candidates:imported.candidates.map(c=>({...c,listingCheck,competition:{youtubeShorts}}))});
  assert.equal(mergeMuseResearch(checked,chat),checked);
  const later=mergeMuseResearch(checked,{...chat,requestId:'later',response:JSON.stringify({summary:'Second receipt',candidates:[]})});
  assert.deepEqual(later.candidates[0].listingCheck,checked.candidates[0].listingCheck);
  assert.deepEqual(later.candidates[0].competition.youtubeShorts,checked.candidates[0].competition.youtubeShorts);
});
test('source status and heuristic metadata remain compatible with older saved checks',()=>{
 const base=candidate('sources'),check={status:'ok',fetchedAt:'2026-11-11T00:00:00Z',sourceUrl:base.supplierUrl,productCountOnPage:12};
 const old=candidateSchema.parse({...base,listingCheck:check});
 assert.equal(old.listingCheck.productCountReliable,null);assert.equal(old.listingCheck.currencyNote,null);
 for(const status of ['ok','unavailable','blocked','failed']){
  const next=candidateSchema.parse({...base,listingCheck:{...check,status,currencyDetected:null,currencyNote:'¥ không rõ CNY/JPY',productCountReliable:false}});
  assert.equal(next.listingCheck.status,status);assert.equal(next.listingCheck.currencyDetected,null);assert.equal(next.listingCheck.productCountReliable,false);assert.equal(next.listingCheck.currencyNote,'¥ không rõ CNY/JPY');
 }
 assert.equal(candidateSchema.safeParse({...base,listingCheck:{...check,productCountReliable:'true'}}).success,false);
});

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

const retailFixture = (prices=[24,30,18]) => ({low:10,high:50,currency:'USD',sources:prices.map((price,i)=>({url:`https://retail.example/item/${i}`,title:'Generic version',price,observedAt:'2026-11-12T00:00:00Z'}))});
const checkFixture = patch => candidateSchema.parse({...candidate('check'),supplierUrl:'https://supplier.example/item/check',cost:4,shipping:2,matchType:'exact_sku',visualPayoff:'Visible before and after',logisticsFlags:{brandRisk:false,ipRisk:false},usRetail:retailFixture(),listingCheck:{status:'ok',sourceUrl:'https://supplier.example/item/check',fetchedAt:'2026-11-12T00:00:00Z',title:'Exact generic item',productCountReliable:true,productCountOnPage:1},...patch});

test('product check fields parse legacy/null data, retain source provenance and enforce bounds',()=>{
  const old=candidate('old_check');assert.equal(old.usRetail,undefined);assert.equal(old.ipNotes,null);
  assert.equal(candidateSchema.parse({...old,logisticsFlags:{brandRisk:false}}).logisticsFlags.ipRisk,undefined);
  const row=checkFixture({ipNotes:'Compare the branded design.'});
  assert.deepEqual(row.usRetail,retailFixture());assert.equal(row.logisticsFlags.ipRisk,false);
  assert.equal(candidateSchema.parse({...row,usRetail:null,ipNotes:null,logisticsFlags:{ipRisk:null}}).usRetail,null);
  assert.deepEqual(candidateSchema.parse({...old,usRetail:{currency:null,sources:[]}}).usRetail,{low:null,high:null,currency:null,sources:[]});
  const invalid=[{usRetail:{...retailFixture(),currency:'CNY'}},{usRetail:{...retailFixture(),low:10,high:9}},{usRetail:retailFixture([1,2,3,4,5])},{ipNotes:'a'.repeat(601)},{logisticsFlags:{ipRisk:'unknown'}}];
  for(const url of ['http://retail.example/item','javascript:alert(1)','https://user:password@retail.example/item']) invalid.push({usRetail:{...retailFixture(),sources:[{...retailFixture().sources[0],url}]}});
  for(const price of [-1,Infinity,NaN]) invalid.push({usRetail:retailFixture([price])});
  invalid.push({usRetail:{...retailFixture(),sources:[{...retailFixture().sources[0],observedAt:'yesterday'}]}});
  for(const patch of invalid) assert.equal(candidateSchema.safeParse({...row,...patch}).success,false,JSON.stringify(patch));
  assert.equal(researchBatchSchema.parse({name:'Old'}).maxLandedCostUsd,undefined);
  assert.equal(researchBatchSchema.parse({name:'New',maxLandedCostUsd:12}).maxLandedCostUsd,12);
  assert.equal(researchBatchSchema.safeParse({name:'Bad',maxLandedCostUsd:0}).success,false);
});

test('listing status covers five states, current-source checks and uncertain T14 counts',()=>{
  const row=checkFixture(),check=row.listingCheck;
  assert.equal(listingStatus(row),'single');
  assert.equal(listingStatus({...row,qualityWarnings:['shared_supplier_url']}),'showroom');
  for(const productCountOnPage of [2,6,12])assert.equal(listingStatus({...row,listingCheck:{...check,productCountOnPage}}),'showroom');
  assert.equal(listingStatus({...row,listingCheck:null}),'not_found');
  assert.equal(listingStatus({...row,listingCheck:{...check,sourceUrl:'https://supplier.example/old'}}),'not_found');
  assert.equal(listingStatus({...row,listingCheck:{...check,productCountOnPage:0}}),'not_found');
  assert.equal(listingStatus({...row,listingCheck:{...check,status:'blocked'}}),'blocked');
  for(const status of ['failed','unavailable'])assert.equal(listingStatus({...row,listingCheck:{...check,status}}),'unavailable');
  for(const productCountReliable of [null,false,undefined])assert.equal(listingStatus({...row,listingCheck:{...check,productCountReliable}}),'unavailable');
  // T14 does not count the current item or related recommendations.
  assert.equal(listingStatus({...row,listingCheck:{...check,productCountOnPage:null}}),'single');
  assert.equal(listingStatus({...row,listingCheck:{...check,productCountOnPage:null,title:null}}),'unavailable');
  assert.equal(listingStatus({...row,supplierUrl:'https://supplier.example/showroom',listingCheck:{...check,sourceUrl:'https://supplier.example/showroom',productCountOnPage:null}}),'unavailable');
});

test('markup compares only USD using median sources, midpoint fallback and inclusive x4/x3 boundaries',()=>{
  const row=checkFixture(),before=structuredClone(row);
  assert.deepEqual(markupCheck(row,20),{status:'ok_x4',typicalRetailUsd:24,maxLandedUsd:[6,8],notes:['Giá bán lẻ Mỹ chỉ cho phép vốn+ship tối đa 8 USD']});
  assert.equal(markupCheck({...row,cost:6},20).status,'ok_x3');
  assert.equal(markupCheck({...row,cost:6.01},20).status,'fail');
  for(const patch of [{costCurrency:'CNY'},{shippingCurrency:'CNY'},{currency:'CNY'},{cost:null},{shipping:null},{usRetail:null},{usRetail:{...row.usRetail,currency:null}},{usRetail:{low:24,high:null,currency:'USD',sources:[]}}])assert.equal(markupCheck({...row,...patch},20).status,'unknown',JSON.stringify(patch));
  assert.equal(markupCheck({...row,usRetail:retailFixture([20,null,30,40])},20).typicalRetailUsd,30);
  assert.equal(markupCheck({...row,usRetail:retailFixture([20,30])},20).typicalRetailUsd,25);
  assert.equal(markupCheck({...row,usRetail:{low:20,high:28,currency:'USD',sources:[]}},20).typicalRetailUsd,24);
  assert.equal(markupCheck({...row,usRetail:retailFixture([0])},20).typicalRetailUsd,0);
  assert.equal(markupCheck({...row,usRetail:{low:0,high:0,currency:'USD',sources:[]}},20).status,'fail');
  assert.equal(markupCheck({...row,usRetail:retailFixture([0,20,30])},20).typicalRetailUsd,20);
  assert.deepEqual(markupCheck(row,8).notes,[]);
  assert.equal(markupCheck({...row,cost:0,shipping:0},20).status,'ok_x4');
  assert.deepEqual(row,before);
});

test('verdict suggestion requires all try conditions and never overwrites the saved user choice',()=>{
  const row=checkFixture({verdict:'reject',verdictReason:'User choice'}),before=structuredClone(row);
  assert.equal(suggestVerdict(row,20).verdict,'try');assert.deepEqual(suggestVerdict(row,20).missing,[]);
  assert.equal(suggestVerdict({...row,cost:6},20).verdict,'try');
  for(const patch of [{qualityWarnings:['shared_supplier_url']},{logisticsFlags:{brandRisk:false,ipRisk:true}},{logisticsFlags:{brandRisk:true,ipRisk:false}},{logisticsFlags:{brandRisk:false,ipRisk:null}},{logisticsFlags:null},{visualPayoff:' '},{matchType:'similar'},{matchType:null},{listingCheck:null},{shippingCurrency:'CNY'},{usRetail:null},{cost:null},{shipping:null}]) {
    const result=suggestVerdict({...row,...patch},20);assert.equal(result.verdict,'hold',JSON.stringify(patch));assert.ok(result.reasons.length);
  }
  assert.equal(suggestVerdict(row,5).verdict,'hold');assert.equal(suggestVerdict(row,6).verdict,'try');
  assert.equal(suggestVerdict(row,NaN).verdict,'hold');
  assert.equal(suggestVerdict({...row,cost:6.01},20).verdict,'reject');
  assert.equal(suggestVerdict({...row,cost:7,qualityWarnings:['shared_supplier_url'],logisticsFlags:{ipRisk:true}},20).verdict,'reject');
  assert.deepEqual(row,before);
});

test('supplier questions cover MOQ, sizes, US shipping, samples, real media and conditional design evidence',()=>{
  const row=checkFixture();const questions=supplierQuestions(row);assert.equal(questions.length,5);
  for(const pattern of [/exact item/,/MOQ/,/box dimensions/,/sample/i,/real photos and videos/])assert.match(questions.join('\n'),pattern);
  assert.doesNotMatch(questions.join('\n'),/design differ/);
  const risky=supplierQuestions({...row,logisticsFlags:{sizeFit:true,ipRisk:true}});
  assert.equal(risky.length,6);assert.match(risky.join('\n'),/each size/);assert.match(risky.join('\n'),/design differ from the branded original/);
});

test('manual check links encode the entire keyword as data and only use fixed HTTPS destinations',()=>{
  const keyword='a & #đèn?/ javascript:alert(1) 🐈';const links=manualCheckLinks(keyword);
  assert.equal(links.length,5);
  const parsed=links.map(link=>new URL(link.url));
  assert.deepEqual(parsed.map(url=>url.hostname),['www.facebook.com','www.youtube.com','www.amazon.com','www.walmart.com','patents.google.com']);
  for(const url of parsed){assert.equal(url.protocol,'https:');assert.equal(url.hash,'');assert.equal(url.username,'');assert.equal(url.password,'');assert.ok(!url.href.includes('javascript:'));}
  assert.equal(parsed[0].searchParams.get('country'),'US');assert.equal(parsed[0].searchParams.get('q'),keyword);
  assert.equal(parsed[1].searchParams.get('search_query'),keyword+' #shorts');assert.equal(parsed[2].searchParams.get('k'),keyword);
  assert.equal(parsed[3].searchParams.get('q'),keyword);assert.equal(parsed[4].searchParams.get('q'),keyword);
});

test('Muse retail and IP survive merge but cannot supply local listing or derived quality and markup fields',()=>{
  const original=checkFixture({verdict:'hold'});
  const spoof={...original,id:'fake',name:'New generic',listingStatus:'single',maxLandedForMarkup:[100,200],suggestedVerdict:'try',qualityWarnings:['shared_supplier_url'],marketEvidence:[{label:'reviews',value:1,unit:'reviews',market:'US',period:'2026',sourceUrl:'https://retail.example/reviews',observedAt:'2026-11-12T00:00:00Z',pageLevel:true}]};
  const response=JSON.stringify({summary:'Fixture',candidates:[spoof]});
  const parsed=parseMuseResponse('research',response).candidates[0];
  for(const key of ['listingCheck','listingStatus','maxLandedForMarkup','suggestedVerdict'])assert.equal(parsed[key],undefined);
  assert.deepEqual(parsed.qualityWarnings,[]);assert.equal(parsed.marketEvidence[0].pageLevel,undefined);
  assert.deepEqual(parsed.usRetail,original.usRetail);assert.equal(parsed.logisticsFlags.ipRisk,false);
  const batch=researchBatchSchema.parse({name:'Retail fixture',maxLandedCostUsd:12,candidates:[original]});
  const merged=mergeMuseResearch(batch,{requestId:'retail',profileId:'fixture',providerUrl:null,response});
  assert.equal(merged.maxLandedCostUsd,12);assert.deepEqual(merged.candidates[0].listingCheck,original.listingCheck);assert.equal(merged.candidates[0].verdict,'hold');
  assert.equal(merged.candidates[1].listingCheck,undefined);assert.equal(listingStatus(merged.candidates[1]),'showroom');
});

test('product research prompt requires opened generic US retail, IP notes and null uncountable competition within ten percent growth',()=>{
  const before=3625;const prompt=museTaskPrompt('research',{});
  assert.ok(prompt.length<=Math.floor(before*1.1),`${before} -> ${prompt.length}`);
  for(const requirement of [/2–3 US retail prices of the generic version/,/Walmart\/Amazon\/Chewy/,/pages actually opened, with URL\/date/,/usRetail/,/observedAt:ISO_DATETIME/,/ipRisk/,/ipNotes <=600/,/branded original or patent\/design/,/Never estimate ads or Shorts counts/,/if uncountable keep null, not zero/])assert.match(prompt,requirement);
});

test('research decision fields parse and survive Muse merge with null distinct from observed zero', () => {
  const legacy = candidate('legacy_decision');
  for (const key of ['verdict','verdictReason','matchType','visualPayoff','logisticsFlags','competition']) assert.equal(legacy[key], null, key);
  assert.deepEqual(legacy.aiFidelityRisks, []);
  assert.deepEqual(legacy.qualityWarnings, []);
  const fields = {
    verdict: 'hold', verdictReason: 'Observed glow; shipping quote unknown.', matchType: 'similar',
    visualPayoff: 'A green glowing leash on a night walk.',
    aiFidelityRisks: ['Small clasp geometry', 'Transparent strap material'],
    logisticsFlags: {battery: true, liquid: false, fragile: null, sizeFit: false, vehicleFit: false, bulky: false, brandRisk: null},
    competition: {activeAdsObserved: 0, similarReels30d: null, observedAt: '2026-11-11T10:00:00Z', sourceUrl: 'https://example.com/ads', note: 'Web observation, US filter; Reels unavailable.'},
  };
  const parsed = candidateSchema.parse({...legacy,...fields});
  for (const [key,value] of Object.entries(fields)) assert.deepEqual(parsed[key],value);
  for (const verdict of ['try','hold','reject',null]) assert.equal(candidateSchema.parse({...parsed,verdict}).verdict,verdict);
  for (const matchType of ['exact_sku','similar','unknown',null]) assert.equal(candidateSchema.parse({...parsed,matchType}).matchType,matchType);
  const {id,...input} = parsed;
  const chat = {requestId:'decisions',profileId:'fixture',providerUrl:null,response:JSON.stringify({summary:'Review',candidates:[input]})};
  const merged = mergeMuseResearch(researchBatchSchema.parse({name:'Decisions'}),chat);
  for (const [key,value] of Object.entries(fields)) assert.deepEqual(merged.candidates[0][key],value);
  assert.equal(mergeMuseResearch(merged,chat),merged);
  assert.deepEqual(candidateSchema.parse({...legacy,competition:{}}).competition,{activeAdsObserved:null,similarReels30d:null,observedAt:null,sourceUrl:null,note:null});
  assert.ok(Object.values(candidateSchema.parse({...legacy,logisticsFlags:{}}).logisticsFlags).every(value=>value===null));
  for (const patch of [{verdict:'approved'},{matchType:'same'},{logisticsFlags:{battery:'unknown'}},{competition:{activeAdsObserved:1}},{competition:{...fields.competition,similarReels30d:-1}},{competition:{...fields.competition,activeAdsObserved:1.5}}]) {
    assert.equal(candidateSchema.safeParse({...legacy,...patch}).success,false,JSON.stringify(patch));
  }
});

test('1745 snapshot flags ten shared listings, the 20000/4.9 metrics on three products and all exact repeats', () => {
  const saved = JSON.parse(readFileSync(new URL('../data/research/2026-11-11/candidates-1745.json',import.meta.url),'utf8')).record.data;
  const before = structuredClone(saved);
  // Exercise raw legacy records as the renderer sees them, without a migration or parse.
  const annotated = annotateResearchQuality(saved.candidates);
  assert.equal(annotated.length,10);
  assert.equal(sharedSourceWarning,'Dùng chung trang nguồn');
  assert.equal(pageLevelEvidenceWarning,'Số liệu cấp trang · không dùng để so');
  assert.equal(annotated.filter(c=>c.qualityWarnings?.includes('shared_supplier_url')).length,10);
  const flagged = annotated.flatMap((c,index)=>c.marketEvidence.filter(m=>m.pageLevel).map(m=>({index,value:m.value,unit:m.unit,sourceUrl:m.sourceUrl})));
  assert.deepEqual(flagged.map(({index,value})=>[index,value]),[[0,20000],[0,4.9],[1,20000],[1,4.9],[1,83],[1,1.5],[3,20000],[3,4.9],[3,83],[3,1.5]]);
  const atlasMetrics = flagged.filter(m=>m.sourceUrl==='https://www.atlas770.com/reviews/best-pet-deshedding-brush-rake/');
  assert.deepEqual(atlasMetrics.map(({index,value})=>[index,value]),[[0,20000],[0,4.9],[1,20000],[1,4.9],[3,20000],[3,4.9]]);
  assert.deepEqual(atlasMetrics.map(m=>m.unit),['sản phẩm trở lên','/ 5','sản phẩm trở lên','/ 5','sản phẩm trở lên','/ 5']);
  for (const [i,c] of annotated.entries()) {
    for (const [key,value] of Object.entries(saved.candidates[i])) {
      if(key==='marketEvidence') value.forEach((m,j)=>{for(const [field,raw] of Object.entries(m))assert.deepEqual(c.marketEvidence[j][field],raw);});
      else assert.deepEqual(c[key],value);
    }
    assert.equal(c.cost,null); assert.equal(c.shipping,null);
  }
  assert.deepEqual(saved,before);
  assert.equal(annotateResearchQuality(annotated),annotated);
  assert.deepEqual(researchBatchSchema.parse({...saved,candidates:annotated}).candidates.map(c=>c.marketEvidence),annotated.map(c=>c.marketEvidence));
});

test('quality checks distinguish names, SKU query parameters, metric units and sources without self-duplicates', () => {
  const metric = {label:'Reviews',value:0,unit:'reviews',market:'US',period:'30d',sourceUrl:'https://example.com/review',observedAt:'2026-11-11T00:00:00Z'};
  const base = {...candidate('first'),name:'Night Leash',supplierUrl:'https://example.com/item?sku=1',marketEvidence:[metric,metric]};
  assert.equal(annotateResearchQuality([base])[0],base);
  const sameName = {...base,id:'same',name:'  NIGHT   LEASH  ',marketEvidence:[]};
  assert.equal(annotateResearchQuality([base,sameName])[0],base);
  const differentSku = {...base,id:'sku2',name:'Night Collar',supplierUrl:'https://example.com/item?sku=2',marketEvidence:[{...metric,unit:'units'},{...metric,sourceUrl:'https://example.com/other'}]};
  const independent = [base,differentSku];
  assert.equal(annotateResearchQuality(independent),independent);
  const reused = {...differentSku,supplierUrl:'https://example.com/item/?sku=1#photo',marketEvidence:[{...metric,sourceUrl:metric.sourceUrl+'/#detail',period:'Cumulative'}]};
  const annotated = annotateResearchQuality([base,reused]);
  assert.ok(annotated.every(c=>c.qualityWarnings.includes('shared_supplier_url')));
  assert.ok(annotated.every(c=>c.marketEvidence.every(m=>m.pageLevel)));
  const corrected = annotateResearchQuality([annotated[0],differentSku]);
  assert.ok(corrected.every(c=>!c.qualityWarnings.length));
  assert.ok(corrected.every(c=>c.marketEvidence.every(m=>!m.pageLevel)));
  assert.ok(annotated[0].marketEvidence.every(m=>m.pageLevel));
});

test('merge detects cross-receipt duplicates, annotates old receipt replays once and preserves selection', () => {
  const source = JSON.parse(readFileSync(new URL('../data/research/2026-11-11/candidates-1745.json',import.meta.url),'utf8')).record.data;
  const rows = [source.candidates[0],source.candidates[1]];
  const makeChat = (requestId,row) => ({requestId,profileId:'fixture',providerUrl:null,response:JSON.stringify({summary:'Saved source',candidates:[row]})});
  const first = mergeMuseResearch(researchBatchSchema.parse({name:'Cross receipt'}),makeChat('first',rows[0]));
  first.selectedIds = [first.candidates[0].id];
  const chat = makeChat('second',rows[1]);
  const merged = mergeMuseResearch(first,chat);
  assert.ok(merged.candidates.every(c=>c.qualityWarnings.includes('shared_supplier_url')));
  assert.equal(merged.candidates.flatMap(c=>c.marketEvidence.filter(m=>m.pageLevel)).length,4);
  assert.deepEqual(merged.selectedIds,first.selectedIds);
  assert.equal(mergeMuseResearch(merged,chat),merged);
  const legacy = {...merged,candidates:merged.candidates.map(({qualityWarnings,...c})=>({...c,marketEvidence:c.marketEvidence.map(({pageLevel,...m})=>m)}))};
  const replay = mergeMuseResearch(legacy,chat);
  assert.deepEqual(replay,merged);
  assert.equal(mergeMuseResearch(replay,chat),replay);
});

test('research prompt fits the video formula, distinct listings and quoted 20 USD target within the T01 budget', () => {
  const prompt = museTaskPrompt('research',{});
  // Baseline measured on T01 before T02: same function/context, including JSON suffix.
  assert.ok(prompt.length <= Math.floor(3314 * 1.4),`Prompt ${prompt.length} exceeds 40% growth from 3314`);
  for (const requirement of [/one-frame visual payoff/,/Problem → Vs → Result → CTA/,/cost \+ shipping to the US <= 20 USD/,/own distinct product listing URL/,/no shared showroom pages/,/Never reuse one review\/article\/page metric across products/,/observed facts, inferences and unknowns/,/verdictReason/,/matchType/,/aiFidelityRisks/,/activeAdsObserved/,/similarReels30d/,/Meta Ad Library API/,/null, not zero/]) assert.match(prompt,requirement);
  assert.doesNotMatch(prompt,/shared showroom URL is allowed/);
});

test('research accepts CNY and independent cost/shipping currencies without changing amounts', () => {
  for (const currency of ['USD', 'VND', 'GBP', 'EUR', 'CNY']) {
    const input = {...candidate('currencies'), cost: 36.5, shipping: 4.25, price: 19.99, currency};
    assert.deepEqual(candidateSchema.parse(input), input);
  }
  const input = {...candidate('mixed'), cost: 36.5, costCurrency: 'CNY', shipping: 4.25, shippingCurrency: 'GBP', price: 19.99, currency: 'USD'};
  assert.deepEqual(candidateSchema.parse(input), input);
  for (const field of ['currency', 'costCurrency', 'shippingCurrency']) {
    assert.equal(candidateSchema.safeParse({...input, [field]: 'JPY'}).success, false, field);
  }
});

test('legacy research snapshots parse every batch and preserve all stored fields', () => {
  const read = name => JSON.parse(readFileSync(new URL('../data/research/2026-11-11/' + name, import.meta.url), 'utf8'));
  const all = read('all-batches.json');
  assert.equal(all.batches.length, 5);
  const records = [...all.batches, read('candidates-1745.json').record, read('candidates-earlier.json').record];
  assert.equal(records.reduce((total, record) => total + record.data.candidates.length, 0), 43);
  for (const record of records) {
    const before = structuredClone(record.data);
    const parsed = researchBatchSchema.parse(record.data);
    for (const [key, value] of Object.entries(before)) {
      if (key !== 'candidates') assert.deepEqual(parsed[key], value, `${record.id}.${key}`);
    }
    assert.equal(parsed.candidates.length, before.candidates.length);
    parsed.candidates.forEach((row, index) => {
      for (const [key, value] of Object.entries(before.candidates[index])) {
        assert.deepEqual(row[key], value, `${record.id}.${row.id}.${key}`);
      }
      assert.equal(row.costCurrency, undefined);
      assert.equal(row.shippingCurrency, undefined);
      for (const field of ['cost', 'shipping', 'price']) assert.equal(candidateCurrency(row, field), row.currency);
    });
    assert.deepEqual(record.data, before);
  }
});

test('landed cost adds only known same-currency amounts and does not mutate the candidate', () => {
  const input = {...candidate('landed'), cost: 36.5, shipping: 4.25, price: 19.99, costCurrency: 'CNY', shippingCurrency: 'CNY'};
  const before = structuredClone(input);
  assert.deepEqual(landedCost(input), {amount: 40.75, currency: 'CNY', reason: null});
  assert.deepEqual(input, before);
  assert.deepEqual(landedCost({...input, shippingCurrency: 'USD'}), {amount: null, currency: null, reason: 'khác tiền tệ'});
  assert.deepEqual(landedCost({...input, shipping: null}), {amount: null, currency: null, reason: 'thiếu ship'});
  assert.deepEqual(landedCost({...input, cost: null}), {amount: null, currency: null, reason: 'thiếu giá vốn'});
  assert.deepEqual(landedCost({...input, cost: null, shipping: null}), {amount: null, currency: null, reason: 'thiếu ship'});
  assert.deepEqual(landedCost({...input, cost: 0, shipping: 0}), {amount: 0, currency: 'CNY', reason: null});
  const legacy = {...candidate('legacy'), cost: 12, shipping: 0, currency: 'EUR'};
  assert.deepEqual(landedCost(legacy), {amount: 12, currency: 'EUR', reason: null});
  assert.deepEqual(landedCost({...legacy, costCurrency: null, shippingCurrency: null}), {amount: 12, currency: 'EUR', reason: null});
  assert.deepEqual(landedCost({...legacy, costCurrency: 'CNY'}), {amount: null, currency: null, reason: 'khác tiền tệ'});
});

test('research money display resolves cost, shipping and price currencies independently with legacy fallback', () => {
  const input = {...candidate('display'), cost: 36.5, shipping: 4.25, price: 19.99, costCurrency: 'CNY', shippingCurrency: 'GBP'};
  const display = field => formatMoney(input[field], candidateCurrency(input, field));
  assert.equal(display('cost'), formatMoney(36.5, 'CNY'));
  assert.equal(display('shipping'), formatMoney(4.25, 'GBP'));
  assert.equal(display('price'), formatMoney(19.99, 'USD'));
  assert.notEqual(display('cost'), formatMoney(36.5, 'USD'));
  for (const field of ['cost', 'shipping', 'price']) {
    assert.equal(candidateCurrency({...candidate('old'), currency: 'VND'}, field), 'VND');
  }
});

test('Muse research preserves mixed currencies through parsing, merge and receipt replay', () => {
  const input = {name: 'Supplier quote', supplierUrl: 'https://supplier.example/quote', evidenceNotes: 'Exact SKU quote', cost: 36.5, costCurrency: 'CNY', shipping: 4.25, shippingCurrency: 'USD', price: 19.99, currency: 'USD'};
  const response = JSON.stringify({summary: 'Independent source currencies', candidates: [input]});
  const parsed = parseMuseResponse('research', response).candidates[0];
  for (const [key, value] of Object.entries(input)) assert.deepEqual(parsed[key], value);
  const batch = researchBatchSchema.parse({name: 'Mixed currencies'});
  const chat = {requestId: 'mixed_currency', profileId: 'fixture', providerUrl: null, response};
  const merged = mergeMuseResearch(batch, chat);
  assert.equal(merged.candidates.length, 1);
  for (const key of ['cost', 'shipping', 'price', 'currency', 'costCurrency', 'shippingCurrency']) assert.equal(merged.candidates[0][key], input[key]);
  assert.deepEqual(landedCost(merged.candidates[0]), {amount: null, currency: null, reason: 'khác tiền tệ'});
  assert.equal(mergeMuseResearch(merged, chat), merged);
  assert.equal(batch.candidates.length, 0);
});

test('research prompt requires source currencies per amount without a hard-coded USD example or conversion', () => {
  const prompt = museTaskPrompt('research', {market: 'United States'});
  assert.ok(!/"currency"\s*:\s*"USD"/.test(prompt));
  assert.match(prompt, /"costCurrency":SUPPLIER_COST_CURRENCY_CODE_OR_NULL/);
  assert.match(prompt, /"shippingCurrency":SHIPPING_CURRENCY_CODE_OR_NULL/);
  assert.match(prompt, /costCurrency must match the exact supplier listing\/quote/);
  assert.match(prompt, /shippingCurrency must match the shipping quote/);
  assert.match(prompt, /currency denotes the selling-price hypothesis/);
  assert.match(prompt, /USD, VND, GBP, EUR and CNY/);
  assert.match(prompt, /Never convert currencies or add amounts in different currencies/);
});

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

test('account × content keeps six posts across three accounts, latest per post, CTA and unknown metrics',()=>{
  const {records,product,at}=instagramOverviewFixture();
  const newest=records.find(row=>row.id==='metric_plan_1_1');
  records.push({...newest,id:'older',updatedAt:at+1000,data:{...newest.data,observedAt:new Date(at-1000).toISOString(),views:999,profileVisits:999,linkClicks:999}});
  const before=structuredClone(records),rows=instagramAccountContentRows(records,product.id);
  assert.equal(rows.length,6);
  assert.deepEqual(rows.map(row=>[row.account.id,row.plan.id]),[['account_1','plan_1_1'],['account_1','plan_1_2'],['account_2','plan_2_1'],['account_2','plan_2_2'],['account_3','plan_3_1'],['account_3','plan_3_2']]);
  assert.deepEqual(rows.map(row=>row.ctaKeyword),['LED','LED','LED','LED','LINK','LINK']);
  assert.equal(rows[0].metric.id,newest.id);assert.equal(rows[0].metric.data.observedAt,newest.data.observedAt);
  assert.equal(rows[5].metric.data.views,null);assert.equal(rows[5].metric.data.profileVisits,null);assert.equal(rows[5].metric.data.linkClicks,null);
  assert.equal(rows[0].metric.data.linkClicks,0);
  const summary=instagramProductSummary(records,product.id);
  assert.deepEqual(summary.totals.profileVisits,{value:null,known:5,total:6,approximate:false});
  assert.deepEqual(summary.totals.linkClicks,{value:null,known:5,total:6,approximate:false});
  const missing=records.find(row=>row.id==='metric_plan_3_2');
  const complete=records.map(row=>row===missing?{...row,data:{...row.data,profileVisits:0,linkClicks:0,approximate:['profileVisits']}}:row);
  assert.deepEqual(instagramProductSummary(complete,product.id).totals.profileVisits,{value:25,known:6,total:6,approximate:true});
  assert.equal(instagramProductSummary(complete,product.id).totals.linkClicks.value,0);
  assert.deepEqual(records,before);
});

test('account/content deduplicates permalink aliases before grouping and keeps the winning content identity',()=>{
  const {records,product,at}=instagramOverviewFixture();
  const plan=records.find(row=>row.id==='plan_1_1'),metric=records.find(row=>row.id==='metric_plan_1_1');
  records.push({...plan,id:'alias',data:{...plan.data,name:'Alias hook',accountId:'account_2',postUrl:'https://instagram.com/p/plan_1_1/?tracking=fixture'}},
    {...metric,id:'alias_metric',updatedAt:at+10,data:{...metric.data,planId:'alias',accountId:'account_2',views:200}});
  const rows=instagramAccountContentRows(records,product.id),post=rows.find(row=>row.planIds.includes('alias'));
  assert.equal(rows.length,6);assert.equal(post.plan.id,'alias');assert.equal(post.account.id,'account_2');assert.equal(post.metric.data.views,200);
  assert.deepEqual(post.planIds,['plan_1_1','alias']);assert.equal(instagramProductSummary(records,product.id).drafts,0);
  assert.equal(rows.filter(row=>row.accountId==='account_1').length,1);
  assert.equal(rows.filter(row=>row.accountId==='account_2').length,3);
});

test('published snapshot identifies an unsynced account and ignores mismatched observations',()=>{
  const {records,product,at}=instagramOverviewFixture();
  const plan=records.find(row=>row.id==='plan_1_1'),metric=records.find(row=>row.id==='metric_plan_1_1');
  plan.data={...plan.data,status:'draft',accountId:'stale_account',assetId:'stale_asset',postUrl:'https://instagram.com/p/stale/'};
  const jobs=[{state:'published',updatedAt:at,postUrl:metric.data.sourceUrl,snapshot:{planId:plan.id,productId:product.id,accountId:'account_1',assetId:'asset_'+plan.id}}];
  records.push({...metric,id:'wrong_account',data:{...metric.data,accountId:'account_2',observedAt:new Date(at+1000).toISOString(),views:999}});
  const rows=instagramAccountContentRows(records,product.id,jobs),post=rows.find(row=>row.plan.id===plan.id);
  assert.equal(rows.length,6);assert.equal(post.account.id,'account_1');assert.equal(post.ctaKeyword,'LED');assert.equal(post.metric.id,metric.id);
  assert.equal(post.url,metric.data.sourceUrl);
});

test('CTA uses the linked T06 variant or pinned take, never an unrelated product or ambiguous keyword',()=>{
  const {records,product}=instagramOverviewFixture();
  const plan=records.find(row=>row.id==='plan_1_1'),project=records.find(row=>row.id==='production_plan_1_1');
  const keyword=()=>instagramAccountContentRows(records,product.id).find(row=>row.plan.id===plan.id).ctaKeyword;
  project.data.variants.push({id:'other_variant',ctaKeyword:'OTHER'});
  assert.equal(keyword(),'LED'); // Exact render selects one variant even if the project has others.
  project.data.exports=[];
  assert.equal(keyword(),null);
  project.data.scenes=[{id:'hook',takes:[{id:'take',assetId:plan.data.assetId}]}];
  project.data.variants[0].hook={sceneId:'hook',takeId:'take'};
  assert.equal(keyword(),'LED');
  project.data.variants[1].hook={sceneId:'hook',takeId:'take'};
  assert.equal(keyword(),null);
  project.data.variants[1].ctaKeyword='LED';assert.equal(keyword(),'LED');
  delete project.data.variants[1].ctaKeyword;assert.equal(keyword(),null);
  project.data.variants.pop();project.data.productId='another_product';assert.equal(keyword(),null);
  project.data.productId=product.id;delete plan.data.productionId;assert.equal(keyword(),'LED');
  delete plan.data.assetId;assert.equal(keyword(),'LED');
  project.data.variants.push({id:'draft_other',ctaKeyword:'OTHER'});assert.equal(keyword(),null);
  project.data.variants.pop();
  project.data.contentPlanId='unrelated_plan';assert.equal(keyword(),null);
});

test('legacy posts without production, account record or metric keep nullable fields and empty summaries',()=>{
  const plan={id:'legacy',kind:'content_plan',updatedAt:1,data:{name:'Legacy hook',productId:'product',accountId:'missing',status:'published_manual',postUrl:'https://instagram.com/p/legacy/'}};
  const rows=instagramAccountContentRows([plan],'product');
  assert.equal(rows.length,1);assert.equal(rows[0].account,null);assert.equal(rows[0].accountId,'missing');
  assert.equal(rows[0].ctaKeyword,null);assert.equal(rows[0].metric,null);
  assert.equal(instagramProductSummary([plan],'product').totals.profileVisits.value,null);
  assert.equal(instagramProductSummary([],'product').totals.linkClicks.value,null);
  assert.deepEqual(instagramAccountContentRows([plan],'other'),[]);
});

test('Instagram hides archived and QA products by default and reveals them without mutating stored records',()=>{
  const product=(id,name,archived)=>({id,kind:'product',updatedAt:1,data:{name,...(archived===undefined?{}:{archived})}});
  const products=[product('active','Active product'),product('archived','ChomChom',true),product('local_qa_product','Treat Trader'),product('test','TEST LOCAL demo'),product('case','  test local draft'),product('normal','A TEST LOCAL phrase',false)];
  const before=structuredClone(products);
  assert.deepEqual(visibleInstagramProducts(products).map(row=>row.id),['active','normal']);
  assert.deepEqual(visibleInstagramProducts(products,true),products);
  assert.deepEqual(visibleInstagramProducts([...products,{...products[0],kind:'content_plan'}],true),products);
  assert.deepEqual(products,before);
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
