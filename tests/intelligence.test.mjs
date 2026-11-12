import test from 'node:test';import assert from 'node:assert/strict';
import {structuredStoryboard,promptWarnings,productionInsights} from '../lib/lab/intelligence.ts';import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {formulaStoryboard} from '../lib/lab/intelligence.ts';
import {viralFormulas,workspaceFormulas,viralFormulaRecordId,formulasForProduct} from '../lib/lab/viral-formulas.ts';
test('storyboard preserves unknowns and only maps product references from this project',()=>{const p=newProduction('P','product',1);p.references=[{id:'r',version:1,role:'product',name:'Product',assetId:'a',sourceUrl:'',notes:'',createdAt:0}];const rows=structuredStoryboard({name:'Thing'},p,{idea:'Show a morning product use',sceneCount:4,duration:5,ratio:'9:16',cta:'Learn more'});assert.equal(rows.length,4);assert.deepEqual(rows[0].referenceIds,['r']);assert.match(rows[0].prompt,/unknown/);assert.equal(rows[0].role,'hook');assert.equal(rows[3].role,'cta');assert.equal(p.scenes.length,0);});
test('prompt checks expose ratio/time conflict and unsupported strong claims',()=>{const p=newProduction('P','product',1),w=promptWarnings({prompt:'16:9, 10 seconds. 100% guaranteed',ratio:'9:16',duration:5,references:[]},p);assert.equal(w.length,4);});
test('every formula seed maps exactly one scene per beat into a 10–18s English draft and alternate hook',()=>{
  const p=newProduction('P','product',1,'vi-VN'),before=structuredClone(p);
  for(const formula of viralFormulas){
    const draft=formulaStoryboard({},p,formula,'led');
    assert.equal(draft.rows.length,formula.beats.length);
    assert.deepEqual(draft.rows.map(row=>row.role),formula.beats.map(beat=>beat.role));
    const total=draft.rows.reduce((n,row)=>n+row.duration,0);
    assert.ok(total>=10&&total<=18,formula.id+': '+total);
    assert.ok(total>=formula.durationSec.min&&total<=formula.durationSec.max);
    for(const row of [...draft.rows,draft.alternateHook]){
      assert.equal(row.ratio,'9:16');assert.equal(row.mediaType,'video');assert.ok(row.duration>=1);
      assert.ok(row.overlayText.length>0&&row.overlayText.length<=60);assert.doesNotMatch(row.overlayText,/[\r\n{}]/);
      assert.match(row.prompt,/Content language: English/);assert.match(row.prompt,/"allowedClaims":null/);
      assert.match(row.prompt,/"invariants":null/);assert.match(row.prompt,/Do not invent measurements, demonstrations, testimonials/);
    }
    const expectedCta={
      'problem-vs-result-cta':'Comment "LED" for the link','pov-share-bait':'Comment "LED" for the link',
      'do-not-show':'Comment "LED" for the link','think-vs-actually':'Comment "LED" to get yours!',
      'audience-callout':'Would you try it? Comment "LED"','emotional-story-pov':'Comment "LED" if you want one',
    };
    assert.equal(draft.ctaKeyword,'LED');assert.equal(draft.ctaText,expectedCta[formula.id]);
    assert.equal(draft.alternateHook.duration,draft.rows[0].duration);
    assert.notEqual(draft.alternateHook.prompt,draft.rows[0].prompt);
    assert.deepEqual(draft.alternateHook.referenceIds,draft.rows[0].referenceIds);
  }
  assert.deepEqual(p,before);
  const draft=formulaStoryboard({},p,viralFormulas[0]);
  assert.equal(draft.rows[0].overlayText,viralFormulas[0].labelVariants.problem[0]);
  assert.equal(draft.alternateHook.overlayText,viralFormulas[0].labelVariants.problem[1]);
});
test('formula generation uses latest workspace version, product facts and only current product references',()=>{
  const custom={...viralFormulas[0],id:'custom',version:2,name:'Saved formula',labelVariants:{problem:['A custom POV','Another custom POV']}};
  const records=[{id:viralFormulaRecordId({...custom,version:1}),kind:'viral_formula',data:{...custom,version:1}},
    {id:viralFormulaRecordId(custom),kind:'viral_formula',data:custom}];
  const formula=formulasForProduct(['night_glow'],workspaceFormulas(records)).find(f=>f.id==='custom');
  const p=newProduction('P','product',1);
  p.references=[{id:'r',version:1,role:'product'},{id:'r',version:2,role:'product'},{id:'person',version:1,role:'person'}];
  const draft=formulaStoryboard({invariants:'Black housing; natural LED glow',allowedClaims:'Visible red light'},p,formula,'LED');
  assert.equal(draft.formulaVersion,2);assert.equal(draft.formulaId,'custom');assert.equal(draft.rows[0].overlayText,'A custom POV');
  assert.match(draft.rows[0].prompt,/Black housing; natural LED glow/);assert.match(draft.rows[0].prompt,/Visible red light/);
  assert.deepEqual(draft.rows[0].referenceIds,['r']);
  assert.throws(()=>formulaStoryboard({},p,formula,'LED LIGHT'));
  assert.throws(()=>formulaStoryboard({},p,{...formula,durationSec:{min:30,max:60}}),/10–18/);
  const long=formulaStoryboard({},p,{...formula,labelVariants:{problem:['a'.repeat(200)]}});
  assert.equal(long.rows[0].overlayText.length,60);
  const cta=formulaStoryboard({},p,{...formula,labelVariants:{cta:['Comment "{WORD}" to get yours!']}},'LED');
  assert.equal(cta.ctaText,'Comment "LED" to get yours!');assert.equal(cta.rows.at(-1).overlayText,cta.ctaText);
  const unsafe=formulaStoryboard({},p,{...formula,labelVariants:{problem:['My dad loves it'],cta:['I bought it; Comment "{WORD}"']}},'LED');
  assert.equal(unsafe.rows[0].overlayText,'The problem');assert.equal(unsafe.ctaText,'Comment "LED" for the link');
});
const warningScene=(patch={})=>({role:'hook',overlayText:'The problem',prompt:'A steady product shot.',ratio:'9:16',duration:3,references:[],...patch});
const warnings=(patch,product={})=>promptWarnings(warningScene(patch),newProduction('P','product',1),product);
test('hook overlay warning distinguishes missing/blank hook from body, CTA and populated hook',()=>{
  for(const overlayText of [undefined,null,'','  '])assert.ok(warnings({overlayText}).some(w=>w.includes('thiếu chữ')));
  for(const patch of [{role:'body',overlayText:null},{role:'cta',overlayText:null},{overlayText:'POV: your routine'}])
    assert.ok(!warnings(patch).some(w=>w.includes('thiếu chữ')));
});
test('testimonial warning catches prompt or overlay without flagging POV or prohibitions',()=>{
  const expected='Có dạng lời chứng thực; FTC cấm testimonial giả, kể cả do AI tạo. Dùng dạng POV.';
  for(const copy of ['My dad fell','MY MOM uses this','I bought one','It changed my life','I tried this']){
    assert.ok(warnings({prompt:copy}).includes(expected),copy);assert.ok(warnings({overlayText:copy}).includes(expected),copy);
  }
  for(const copy of ['POV: you help a parent','Show an ordinary family routine.','Do not write "my dad fell" or "I bought this".','Avoid fabricated testimonials.','I bought this is not an allowed line.'])
    assert.ok(!warnings({prompt:copy,overlayText:copy}).includes(expected),copy);
  assert.ok(warnings({prompt:'Avoid fake claims, but I bought this.'}).includes(expected));
});
test('effect warning checks declarations, word boundaries, negation and each requested effect independently',()=>{
  const expected='Hiệu ứng có thể vượt sản phẩm thật';
  for(const copy of ['Show a laser beam.','Add neon trails.','Make the product glow.','A glowing collar.']){
    assert.ok(warnings({prompt:copy}).includes(expected),copy);assert.ok(warnings({overlayText:copy}).includes(expected),copy);
  }
  for(const copy of ['No laser, neon trail or glow.','Avoid glow.','Product does not glow.','Laser is not supported.','Show a closed box.','A laser-free scene.','The afterglow of sunset.'])
    assert.ok(!warnings({prompt:copy,overlayText:copy}).includes(expected),copy);
  assert.ok(!warnings({prompt:'Show a natural LED glow.'},{invariants:'A natural LED glow'}).includes(expected));
  assert.ok(!warnings({prompt:'Show a laser beam.'},{allowedClaims:'Laser beam projects a line'}).includes(expected));
  assert.ok(!warnings({prompt:'Neon trail.'},{allowedClaims:'A neon trail'}).includes(expected));
  assert.ok(warnings({prompt:'Laser and glow.'},{allowedClaims:'Laser beam'}).includes(expected));
  assert.ok(warnings({prompt:'Show a glow.'},{invariants:'No glow'}).includes(expected));
  assert.ok(warnings({prompt:'No glow, but add a laser.'}).includes(expected));
});
test('measurement groups do not mix body, locale or cohort and unknown usage is explicit',()=>{const p=newProduction('P','product',1);p.variants=[{id:'v1',name:'A',bodyId:'b1',locale:'en-US',hook:null,cta:null,caption:'',createdAt:0},{id:'v2',name:'B',bodyId:'b1',locale:'en-GB',hook:null,cta:null,caption:'',createdAt:0}];p.measurements=p.variants.map(v=>({variantId:v.id,views:1000,clicks:5,sessions:4,orders:0,delivered:0,returned:0,netRevenue:0,totalCosts:0,source:'cohort one',notes:'',updatedAt:0}));const d=productionInsights(p);assert.equal(Object.keys(d.groups).length,2);assert.match(d.measurements[0].suggestion,/Giả thuyết/);});
test('desktop receipt is idempotent, preserves take and rejects stale scene/product',()=>{let p=newProduction('P','product',1);p=applyProduction(p,'scene',{id:'s',name:'Scene',prompt:'Product shot',ratio:'9:16',duration:5},'scene');p=applyProduction(p,'storyboard',{sceneId:'s'},'review');const receipt={sceneId:'s',sceneRevision:1,productRevision:1,jobId:'local_job',providerId:'muse_result',take:{assetId:'asset',name:'file.mp4',type:'video/mp4',size:100,sha256:'a'.repeat(64),metadata:{width:720,height:1280,duration:5,verifiedBy:'container'}}};p=applyProduction(p,'worker_result',receipt,'desktop_job');assert.equal(p.scenes[0].takes[0].review,'pending');assert.equal(p.scenes[0].attempts[0].usageUsd,null);assert.equal(applyProduction(p,'worker_result',receipt,'desktop_job').scenes[0].takes.length,1);assert.equal(applyProduction(p,'worker_result',receipt,'different_command').scenes[0].takes.length,1);assert.throws(()=>applyProduction(p,'worker_result',{...receipt,sceneRevision:2},'bad_scene'));assert.throws(()=>applyProduction(p,'worker_result',{...receipt,productRevision:2},'bad_product'));});
