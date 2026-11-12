import {ctaKeywordSchema, formulaDraftInputSchema, latestReferences, type Production} from './production.ts';
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
export function formulaStoryboard(product: Record<string,unknown>, p: Production, input: ViralFormula, keyword = 'LINK') {
  const formula = viralFormulaSchema.parse(input);
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
