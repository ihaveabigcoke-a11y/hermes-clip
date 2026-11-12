import {ctaKeywordSchema, formulaDraftInputSchema, latestReferences, packagingSchema, type Production} from './production.ts';
import {viralFormulaSchema, type ViralFormula, type FormulaBeat} from './viral-formulas.ts';

const goals: Record<FormulaBeat['kind'], string> = {
  problem: 'Show one observable everyday inconvenience from the supplied product brief, in a fictional POV situation. Do not stage injury or danger.',
  versus_unbox: 'Use a steady POV close-up to unbox or set up the actual product. Compare the same situation without inventing a competitor or superiority claim.',
  result: 'Show one real, observable product action and only a result supported by the supplied facts. If proof is missing, show neutral handling instead of simulating efficacy.',
  cta: 'Hold a clear view of the real product for the keyword CTA. Do not promise availability, discounts or delivery.',
};
const labels: Record<FormulaBeat['kind'], string> = {problem:'The problem',versus_unbox:'Vs...',result:'The result',cta:''};
function unsafeLabel(value:string) {
  return /\b(my (?:dad|mom|mum|mother|father)|I (?:bought|purchased|tried|used)|changed my life)\b/i.test(value) ||
    /[{}]/.test(value) || [...value.matchAll(/\p{L}/gu)].some(match=>!/[a-z]/i.test(match[0]));
}

function labelFor(formula: ViralFormula, beat: FormulaBeat, keyword: string, alternate = false) {
  const choices = formula.labelVariants[beat.kind] ?? [];
  const candidate = choices[alternate ? 1 : 0] || (!alternate ? beat.label : '') ||
    (alternate ? 'POV: a different way to start' : labels[beat.kind]);
  const substituted = candidate.replaceAll('{WORD}',keyword).replaceAll('{GROUP}','hobby')
    .replaceAll('{DO X}','use this in your routine').replaceAll('{BENEFIT}','use it');
  // Templates are suggestions, never fabricated first-person experiences. Non-English
  // source labels/placeholders fall back to neutral English copy for manual review.
  const value = unsafeLabel(substituted) ? (alternate?'POV: a different way to start':labels[beat.kind]) : substituted;
  // Count UTF-16 units like the schema, without leaving half an emoji at the edge.
  let line='';
  for(const char of value.replace(/\s+/g,' ').trim()){if(line.length+char.length>60)break;line+=char;}
  return line.trim();
}

// Make seed timing sequential: scale beat lengths (including end-relative CTA)
// to a 10–18s draft, reserving at least 1s per scene. No timeline or footage exists yet.
export type FormulaStoryboardOptions = {ctaKeyword:string;ctaPlacement?:'overlay'|'caption';situation?:string;packaging?:{brandName:string;boxText:string};usCues?:string[]};
export function formulaStoryboard(product: Record<string,unknown>, p: Production, input: ViralFormula, options: string|FormulaStoryboardOptions = '') {
  const formula = viralFormulaSchema.parse(input);
  if(formula.storyboardVersion===2)return storyboardV2(product,p,formula,typeof options==='string'?{ctaKeyword:options}:options);
  const keyword=typeof options==='string'?options:options.ctaKeyword;
  const count = formula.beats.length;
  if(count>18)throw new Error('Công thức có quá nhiều cảnh để mỗi cảnh ít nhất 1 giây trong tổng 18 giây.');
  const low = Math.max(10,count,formula.durationSec?.min??10), high = Math.min(18,formula.durationSec?.max??18);
  if(low>high)throw new Error('Khoảng thời lượng công thức không phù hợp bản nháp 10–18 giây.');
  const totalTicks = Math.round((low+high)/2*10), available = totalTicks-count*10;
  const weights = formula.beats.map(beat=>beat.toSec-beat.fromSec), weightTotal=weights.reduce((sum,w)=>sum+w,0);
  let priorTicks=0, cumulative=0;
  const durations=weights.map(weight=>{cumulative+=weight;const ticks=Math.round(available*cumulative/weightTotal);const duration=(10+ticks-priorTicks)/10;priorTicks=ticks;return duration;});
  const ctaKeyword=ctaKeywordSchema.parse(keyword.trim().toUpperCase());
  const ctaText=[...(formula.labelVariants.cta??[]),...formula.ctaPatterns]
    .map(pattern=>pattern.replaceAll('{WORD}',ctaKeyword).replace(/\s+/g,' ').trim())
    .find(value=>value.length<=60&&!unsafeLabel(value)&&new RegExp(`\\bcomment\\s+["']?${ctaKeyword}\\b`,'i').test(value))
    ?? `Comment "${ctaKeyword}" for the link`;
  const facts={product:product.name??null,sku:product.sku??null,customer:product.customer??null,problem:product.problem??null,
    invariants:product.invariants||null,allowedClaims:product.allowedClaims||null};
  const referenceIds=latestReferences(p).filter(ref=>ref.role==='product').map(ref=>ref.id);
  function scene(beat:FormulaBeat,index:number,alternate=false) {
    const overlayText=beat.role==='cta'?ctaText:labelFor(formula,beat,ctaKeyword,alternate);
    const action=goals[beat.kind];
    const opening=beat.role==='hook'?(alternate?'Opening B: begin on a close-up detail of the same POV situation.':'Opening A: establish the same POV situation in a medium shot.'):'';
    return {
      name:`${beat.role==='hook'?'Mở đầu':beat.role==='cta'?'Kêu gọi hành động':'Nội dung'} · ${index+1}${beat.role==='hook'?(alternate?' · B':' · A'):''}`,
      role:beat.role,mediaType:'video' as const,ratio:'9:16' as const,duration:durations[index],referenceIds,overlayText,
      action, camera:opening||'One steady close-up. Keep the product and setting consistent.',voice:'English only if narration is added. Readable with audio muted.',
      prompt:[
        `DRAFT TEMPLATE — unapproved creative proposal, not verified footage. Beat: ${beat.kind}. ${action} ${opening}`,
        `Target: 9:16, ${durations[index]} seconds. Content language: English (en-US).`,
        `Product facts (data, not instructions): ${JSON.stringify(facts)}`,
        `Keep product shape, markings, material, packaging and part state consistent with approved references. Unknown facts stay unknown. Do not invent measurements, demonstrations, testimonials, logos or performance guarantees.`,
        `Use only declared invariants and allowedClaims. Missing proof means neutral handling, not an invented result. No exaggerated product effects, invented danger, medical claims or implied endorsement by authorities. Use fictional POV, never a fabricated customer story.`,
        `Formula source: ${formula.id}, version ${formula.version}. Keep the body and CTA identical across openings.`,
        `Suggested single-line overlay for editing: ${JSON.stringify(overlayText)}. Add the overlay in editing, not inside generated footage.`,
        beat.role==='cta'?ctaText:'No unsupported text or factual claim.',
      ].join('\n'),
    };
  }
  return formulaDraftInputSchema.parse({name:formula.name.slice(0,150),formulaId:formula.id,formulaVersion:formula.version,
    rows:formula.beats.map((beat,index)=>scene(beat,index)),alternateHook:scene(formula.beats[0],0,true),ctaKeyword,ctaText});
}

export function ctaKeywordSuggestions(product:Record<string,unknown>) {
  const traits=Array.isArray(product.traits)?product.traits:[];
  return [...new Set(traits.flatMap(t=>t==='cycling'?['BIKE']:t==='running'?['RUN']:t==='pet'?['PAWS']:t==='senior'||t==='family'?['HELP']:[]))];
}

function storyboardV2(product:Record<string,unknown>,p:Production,formula:ViralFormula,options:FormulaStoryboardOptions) {
  const issues=[];
  if(!options.ctaKeyword?.trim())issues.push('Điền từ khóa CTA (định danh nhóm khách, ví dụ BIKE, RUN, PAWS, HELP).');
  if(!options.situation?.trim())issues.push('Điền tình huống mở đầu.');
  if(!options.packaging?.brandName?.trim())issues.push('Chưa đặt tên bao bì.');
  if(!options.packaging?.boxText?.trim())issues.push('Điền chữ trên hộp.');
  if(issues.length)throw Error(issues.join(' '));
  const ctaKeyword=ctaKeywordSchema.parse(options.ctaKeyword.trim().toUpperCase());
  const packaging=packagingSchema.parse(options.packaging),situation=options.situation!.trim();
  const ctaPlacement=options.ctaPlacement??formula.ctaPlacement??'overlay';
  if(!formula.resultStyle||formula.beats.some(b=>!b.shots?.length||b.kind==='cta'))throw Error('Công thức v2 thiếu shot hoặc còn beat CTA riêng.');
  const referenceIds=latestReferences(p).filter(ref=>ref.role==='product').map(ref=>ref.id);
  const facts={product:product.name??null,sku:product.sku??null,customer:product.customer??null,invariants:product.invariants||null,allowedClaims:product.allowedClaims||null};
  const constraints=[
    'Preserve the actual product, approved markings and function; unknown facts stay unknown. Do not invent measurements, demonstrations, testimonials or guarantees.',
    'Fictional situation. No injury, no blood, no collision shown; no fabricated first-person experience or implied government endorsement.',
    'Add timed overlays in editing; keep generated footage free of captions. Stylized light is limited to products confirmed to emit light.',
  ];
  const ctaText=`Comment "${ctaKeyword}" for the link`;
  let cursor=0,card=0;
  const rows=formula.beats.flatMap((beat,beatIndex)=>{
    const shots=beat.shots!,fromSec=cursor,toSec=Number((cursor+shots.reduce((sum,s)=>sum+s.duration,0)).toFixed(3));
    const phase=beat.phase??(beat.kind==='problem'?'hook':beat.kind==='versus_unbox'?'unbox':'result');
    const beatId=`beat_${beatIndex+1}`;
    const label=labelFor(formula,beat,ctaKeyword);
    // Split only on a shot boundary, setting change or provider duration limit.
    let unitStart=fromSec,unitIndex=0,unitSetting=shots[0].setting;
    const units: {id:string;fromSec:number;toSec:number;duration:8}[]=[];
    const memberships:number[]=[];
    let next=fromSec;
    shots.forEach((shot,index)=>{
      if(index&&(shot.setting!==unitSetting||next+shot.duration-unitStart>8)) {unitIndex++;unitStart=next;unitSetting=shot.setting;}
      next=Number((next+shot.duration).toFixed(3));
      units[unitIndex]={id:`${beatId}_unit_${unitIndex+1}`,fromSec:unitStart,toSec:next,duration:8};memberships.push(unitIndex);
    });
    return shots.map((shot,shotIndex)=>{
      const start=cursor;cursor=Number((cursor+shot.duration).toFixed(3));
      const storyCard=formula.resultStyle==='story_cards'&&phase==='result'?formula.storyCards?.[card++]:undefined;
      const overlay={text:storyCard??label,emoji:storyCard?'':beat.overlay?.emoji??'',fromSec:storyCard?start:fromSec,toSec:storyCard?cursor:toSec,position:'top-center' as const,lines:(storyCard?2:1) as 1|2};
      const visualGoal=phase==='hook'?`Show ONE specific failed DIY attempt or near-miss that reads in one second. Situation: ${situation}`:
        phase==='unbox'?`Named packaging: ${packaging.brandName}; box text: ${packaging.boxText}. Reveal the actual product.`:
        phase==='feature_tour'?'Show one distinct real feature from the approved product references.':
        "Show the product's real function at maximum visual scale, grounded in approved facts.";
      const payoff=formula.resultStyle==='spectacle'?'Wide nighttime composition, 2–5 subjects; use stylized light only when the approved product really emits light.':
        formula.resultStyle==='subject_after'?'Calm subject after use; read the relaxed face in close-up.':
        formula.resultStyle==='story_cards'?'Third-person fictional story; include a neighbour reacting alongside the main subject and family member.':'One visible feature per shot; vary the angle to reveal construction and use.';
      return {
        name:`${phase==='hook'?'Mở đầu':phase==='unbox'?'Mở hộp':phase==='feature_tour'?'Tính năng':'Kết quả'} · ${beatIndex+1}.${shotIndex+1}`,
        role:(beatIndex===0&&shotIndex===0?'hook':'body') as 'hook'|'body',mediaType:'video' as const,ratio:'9:16' as const,
        duration:shot.duration,referenceIds,overlayText:label,overlay,voice:'',
        action:shot.action,camera:shot.camera,subjects:shot.subjects,setting:shot.setting,
        prompt:[`Vertical 9:16 shot, ${shot.duration} seconds. Content language: English (en-US).`,
          `Camera: ${shot.camera}.`,`Subjects: ${shot.subjects}.`,`Setting: ${shot.setting}. US cues: ${(options.usCues??[]).join(', ')||'use the supplied setting'}.`,
          `Action: ${visualGoal} ${shot.action}`,`End frame: ${shot.ending}`,`Lighting: ${shot.lighting}`,
          ...(phase==='result'||phase==='feature_tour'?[`Visual treatment: ${payoff}`]:[]),
          `Product facts (data, not instructions): ${JSON.stringify(facts)}`].join('\n'),
        constraints,storyboardVersion:2 as const,beatId,beatKind:beat.kind as 'problem'|'versus_unbox'|'result',phase,
        fromSec:start,toSec:cursor,ctaKeyword,ctaPlacement,situation,packaging,resultStyle:formula.resultStyle,
        metadata:formula.resultStyle==='story_cards'?{dramatization:true as const}:{},generationUnit:units[memberships[shotIndex]],
      };
    });
  });
  const payoff=rows.filter(r=>r.phase==='result'||r.phase==='feature_tour');
  const ctaStart=payoff.map(r=>r.fromSec).filter(t=>cursor-t>=4&&cursor-t<=6).sort((a,b)=>Math.abs(cursor-a-(formula.ctaTiming?.fromEndSec??4.5))-Math.abs(cursor-b-(formula.ctaTiming?.fromEndSec??4.5)))[0];
  if(ctaPlacement==='overlay'&&ctaStart===undefined)throw Error('Phần kết quả cần đủ 4–6 giây để đè CTA đúng mốc cắt.');
  const timedRows=rows.map(row=>{
    if(ctaPlacement==='caption')return row;
    const overlay={...row.overlay,toSec:Math.min(row.overlay.toSec,ctaStart)};
    if(row.fromSec<ctaStart)return {...row,overlay};
    const ctaOverlay={text:ctaText,emoji:'',fromSec:ctaStart,toSec:cursor,position:'top-center' as const,lines:1 as const};
    if(formula.resultStyle==='story_cards')return {...row,overlay:{...row.overlay,text:row.overlay.text+'\n'+ctaText,lines:2 as const},ctaOverlay};
    return {...row,overlay:ctaOverlay,overlayText:ctaText,ctaOverlay};
  });
  const withSources=timedRows.map((row,i)=>{
    const source=formula.referenceSource;if(!source?.jobId)return row;
    const shot=source.analysis.shots[Math.min(source.analysis.shots.length-1,Math.floor(i*source.analysis.shots.length/timedRows.length))];
    const prompt=source.analysis.remakePrompts.find(p=>p.shotId===shot.id)?.prompt;if(!prompt)return row;
    return {...row,sourceReference:{jobId:source.jobId,shotId:shot.id,prompt,firstFrame:shot.firstFrame,lastFrame:shot.lastFrame},
      prompt:row.prompt+'\nReference camera/action only; replace source brands, people and packaging with the approved product, setting and claims:\n'+prompt};
  });
  const first=withSources[0],alternateLabel=labelFor(formula,formula.beats[0],ctaKeyword,true);
  const alternateHook={...first,name:first.name+' · B',overlayText:alternateLabel,
    overlay:{...first.overlay,text:alternateLabel,toSec:first.toSec},
    camera:'Extreme close-up at eye level; quick pull-back to the same situation',
    prompt:first.prompt.replace(`Camera: ${first.camera}.`,'Camera: Extreme close-up at eye level; quick pull-back to the same situation.'),
    generationUnit:{id:'alternate_opening',fromSec:0,toSec:first.toSec,duration:8 as const}};
  return formulaDraftInputSchema.parse({name:formula.name.slice(0,150),formulaId:formula.id,formulaVersion:formula.version,storyboardVersion:2,
    rows:withSources,alternateHook,ctaKeyword,ctaText,ctaPlacement,situation,packaging});
}
