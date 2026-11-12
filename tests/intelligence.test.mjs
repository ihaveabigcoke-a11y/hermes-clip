import test from 'node:test';import assert from 'node:assert/strict';
import {structuredStoryboard,promptWarnings,productionInsights} from '../lib/lab/intelligence.ts';import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {formulaStoryboard} from '../lib/lab/intelligence.ts';
import {viralFormulas,workspaceFormulas,viralFormulaRecordId,formulasForProduct} from '../lib/lab/viral-formulas.ts';
import {viralFormulasV2,formulaVersions,viralFormulaSchema,referenceVideos} from '../lib/lab/viral-formulas.ts';
import {formulaDraftInputSchema} from '../lib/lab/production.ts';
import {ctaKeywordSuggestions} from '../lib/lab/formula-storyboard.ts';

const v2Options=f=>({ctaKeyword:'bike',situation:f.situationExamples[0],packaging:{brandName:'FIXTURE',boxText:'Night Ride Kit'}});
test('T-007 round 3: reference-adapted formulas have distinct pacing and retain every seed shot duration',()=>{
  const expected={
    'problem-vs-result-cta':{counts:[3,3,5],total:14.3,cta:9.8},
    'pov-share-bait':{counts:[2,3,4],total:13.3,cta:7.4},
    'do-not-show':{counts:[3,3,3],total:14,cta:9.6},
    'think-vs-actually':{counts:[2,3,3],total:11.8,cta:7.4},
    'audience-callout':{counts:[3,2,4,4],total:16.1,cta:11.1},
    'emotional-story-pov':{counts:[2,3,5],total:14.5,cta:9.5},
  };
  const configurations=new Set(),p=newProduction('Pacing','p',1);
  for(const f of viralFormulasV2){
    const target=expected[f.id],d=formulaStoryboard({},p,f,v2Options(f));
    assert.deepEqual(f.beats.map(b=>b.shots.length),target.counts);
    assert.deepEqual(d.rows.map(r=>r.duration),f.beats.flatMap(b=>b.shots.map(s=>s.duration)));
    assert.equal(d.rows.length,target.counts.reduce((a,b)=>a+b,0));
    assert.equal(d.rows.at(-1).toSec,target.total);
    assert.equal(Number(d.rows.reduce((n,r)=>n+r.duration,0).toFixed(3)),target.total);
    assert.deepEqual(f.durationSec,{min:target.total,max:target.total});
    assert.ok(new Set(d.rows.map(r=>r.duration)).size>=3,'Each formula needs varied shot lengths');
    configurations.add(d.rows.length+':'+d.rows.at(-1).toSec);
    let cursor=0;
    for(const beat of f.beats){
      assert.ok(beat.shots.length>=1&&beat.shots.length<=6);
      assert.equal(beat.fromSec,cursor);
      cursor=Number((cursor+beat.shots.reduce((n,s)=>n+s.duration,0)).toFixed(3));
      assert.equal(beat.toSec,cursor);assert.equal(beat.overlay.fromSec,beat.fromSec);assert.equal(beat.overlay.toSec,beat.toSec);
    }
    const cta=d.rows.find(r=>r.ctaOverlay).ctaOverlay;
    assert.equal(cta.fromSec,target.cta);assert.equal(cta.toSec,target.total);
    assert.equal(Number((cta.toSec-cta.fromSec).toFixed(3)),f.ctaTiming.fromEndSec);
    assert.equal(f.pacingSource.timing,'adapted');assert.ok(f.pacingSource.notes.length>30);
    for(const sample of f.pacingSource.samples){const id='V'+Number(sample.slice(1));assert.ok(referenceVideos.some(r=>r.id===id));assert.ok(f.references.includes(id));}
    assert.deepEqual(viralFormulaSchema.parse(JSON.parse(JSON.stringify(f))).pacingSource,f.pacingSource);
    const result=d.rows.filter(r=>r.phase==='result');
    if(f.resultStyle==='spectacle'){
      assert.ok(result.length>=3&&result.length<=6);assert.equal(new Set(result.map(r=>r.camera)).size,result.length);
    }
    if(f.resultStyle==='feature_tour'){
      const hook=d.rows.filter(r=>r.phase==='hook'),unbox=d.rows.filter(r=>r.phase==='unbox'),tour=d.rows.filter(r=>r.phase==='feature_tour');
      assert.equal(hook.length,3);assert.ok(tour.length>=6&&tour.length<=8);assert.equal(result.length,0);
      const duration=rows=>rows.reduce((n,r)=>n+r.duration,0);
      assert.ok(duration(tour)>duration(hook)+duration(unbox));assert.ok(tour.every(r=>r.duration<=1.5));
      assert.equal(new Set(tour.map(r=>r.action)).size,tour.length);
    }
  }
  assert.ok(configurations.size>=3);assert.equal(configurations.size,6);
});
test('T-007: six v2 formulas retain v1 and default to v2 unless a user version exists',()=>{
  assert.equal(viralFormulasV2.length,6);assert.equal(formulaVersions().length,12);
  assert.ok(workspaceFormulas().every(f=>f.version===2&&f.storyboardVersion===2));
  for(const f of [...viralFormulas,...viralFormulasV2])assert.equal(viralFormulaSchema.safeParse(f).success,true);
  const saved={...viralFormulas[0],name:'User keeps v1'};
  assert.equal(workspaceFormulas([{id:viralFormulaRecordId(saved),kind:'viral_formula',data:saved}]).find(f=>f.id===saved.id).name,saved.name);
  assert.deepEqual(ctaKeywordSuggestions({name:'NOT-A-KEYWORD',traits:['cycling','running','pet','senior']}),['BIKE','RUN','PAWS','HELP']);
});
test('T-007: all v2 timelines have 8+ short shots, timed overlays and CTA inside the final payoff',()=>{
  const p=newProduction('V2','p',1),before=structuredClone(p);
  for(const f of viralFormulasV2)for(const ctaPlacement of ['overlay','caption']) {
    const d=formulaStoryboard({name:'Fixture',invariants:'Actual product emits light'},p,f,{...v2Options(f),ctaPlacement});
    const total=d.rows.reduce((n,s)=>n+s.duration,0),cuts=new Set([0,...d.rows.map(r=>r.toSec)]);
    assert.ok(d.rows.length>=8);assert.ok(total>=10&&total<=18);assert.ok(d.rows.every(s=>s.duration>=1&&s.duration<=2.5&&s.role!=='cta'));
    const payoff=d.rows.filter(s=>s.phase===(f.resultStyle==='feature_tour'?'feature_tour':'result'));
    assert.ok(payoff.length>=(f.resultStyle==='feature_tour'?6:3));assert.ok(payoff.length<=(f.resultStyle==='feature_tour'?8:6));
    for(const row of [...d.rows,d.alternateHook]) {
      assert.equal(row.voice,'');assert.equal(row.ratio,'9:16');assert.ok(row.camera&&row.subjects&&row.setting);
      assert.ok(row.constraints.length<=3);const visuals=row.prompt.split('\n').length;assert.ok(visuals/(visuals+row.constraints.length)>=0.6);
      assert.doesNotMatch(row.prompt,/narration|neutral handling|AI label|AI-generated/i);
      assert.ok(cuts.has(row.overlay.fromSec)&&cuts.has(row.overlay.toSec));assert.equal(row.overlay.position,'top-center');
      assert.ok([1,2].includes(row.overlay.lines));assert.ok(row.overlay.text.split('\n').length<=row.overlay.lines);
      assert.ok(row.generationUnit.fromSec<=row.fromSec&&row.generationUnit.toSec>=row.toSec);
      assert.ok(row.generationUnit.toSec-row.generationUnit.fromSec<=8);assert.equal(row.generationUnit.duration,8);
    }
    if(ctaPlacement==='overlay') {
      const overlay=d.rows.find(s=>s.ctaOverlay).ctaOverlay;
      assert.ok(overlay.fromSec>=payoff[0].fromSec);assert.equal(overlay.toSec,payoff.at(-1).toSec);
      assert.ok(overlay.toSec-overlay.fromSec>=4&&overlay.toSec-overlay.fromSec<=6);
      assert.ok(d.rows.filter(s=>s.ctaOverlay).every(s=>s.fromSec>=overlay.fromSec&&s.toSec<=overlay.toSec));
    } else assert.ok(d.rows.every(s=>!s.ctaOverlay));
    assert.equal(d.ctaKeyword,'BIKE');assert.equal(d.alternateHook.duration,d.rows[0].duration);
    if(f.resultStyle==='story_cards') {
      assert.ok(d.rows.every(r=>r.metadata.dramatization===true));
      for(const card of f.storyCards)assert.ok(payoff.some(r=>r.overlay.text.includes(card)));
      assert.match(payoff[0].subjects,/neighbour/);assert.doesNotMatch(JSON.stringify(d),/my dad/i);
    }
    if(f.resultStyle==='feature_tour')assert.ok(d.rows.every(r=>r.beatKind!=='result'));
    assert.ok(f.labelVariants.problem.some(label=>/\p{Extended_Pictographic}/u.test(label)));
  }
  assert.deepEqual(p,before);
});
test('T-007: required inputs fail clearly; malformed timing, grouping and CTA are rejected at the command boundary',()=>{
  const f=viralFormulasV2[0],p=newProduction('V2','p',1),options=v2Options(f);
  for(const [patch,message] of [[{ctaKeyword:''},/từ khóa CTA/],[{situation:''},/tình huống/],[{packaging:{brandName:'',boxText:'Kit'}},/Chưa đặt tên bao bì/],[{packaging:{brandName:'X',boxText:''}},/chữ trên hộp/]])assert.throws(()=>formulaStoryboard({},p,f,{...options,...patch}),message);
  assert.throws(()=>formulaStoryboard({},p,viralFormulas[0]),/Từ khóa/);
  const d=formulaStoryboard({},p,f,options);
  for(const mutate of [
    d=>delete d.ctaKeyword,d=>delete d.situation,d=>delete d.packaging,d=>d.rows[0].duration=3,
    d=>d.rows[1].fromSec=0,d=>d.rows[0].role='cta',d=>d.rows[0].voice='Spoken text',
    d=>d.rows[0].constraints.push('Fourth line'),d=>d.rows[0].overlay.toSec=2.1,
    d=>delete d.rows[0].generationUnit,d=>d.rows[0].generationUnit.toSec=99,
    d=>d.rows[1].setting='Different setting',d=>d.ctaPlacement='caption',
    d=>d.rows.find(r=>r.ctaOverlay).ctaOverlay.fromSec=0,
  ]) {const bad=structuredClone(d);mutate(bad);assert.equal(formulaDraftInputSchema.safeParse(bad).success,false);}
});
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
  const draft=formulaStoryboard({},p,viralFormulas[0],'LED');
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
  const long=formulaStoryboard({},p,{...formula,labelVariants:{problem:['a'.repeat(200)]}},'LED');
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
