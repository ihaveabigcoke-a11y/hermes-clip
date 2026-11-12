import {viralFormulaSchema,type ViralFormula} from './viral-formulas.ts';
import type {ReferenceVideoDraft} from './viral-reference.ts';
const median=(values:number[])=>{const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
export function proposeReaFormulas(references:ReferenceVideoDraft[],versions:ViralFormula[]){
  return versions.filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i).flatMap(base=>{
    const seen=new Set<string>();
    const group=references.filter(r=>{const key=r.sourceSha256??r.id;if(r.hookType!==base.hookType||r.reaVideo?.readStatus!=='complete'||seen.has(key))return false;seen.add(key);return true;});
    if(group.length<2)return [];
    const duration=median(group.map(r=>r.reaVideo!.durationSec)),shotCount=median(group.map(r=>r.reaVideo!.shots.length));
    const ctaTimes=group.flatMap(r=>r.reaVideo!.overlays.filter(o=>r.ctaText?.trim()&&o.text.includes(r.ctaText.trim())).map(o=>o.fromSec));
    const exemplar=[...group].sort((a,b)=>Math.abs(a.reaVideo!.durationSec-duration)-Math.abs(b.reaVideo!.durationSec-duration))[0];
    // T-007 supports 1–2.5 s editing shots. Measured timings remain untouched in references;
    // formula timings are explicitly adapted to these production constraints.
    const source=exemplar.reaVideo!;
    if(base.storyboardVersion!==2)return [];
    // Preserve T-007's minimum payoff/story-card constraints. The median is evidence,
    // not permission to turn a five-shot sample into an invalid production draft.
    const baseDuration=base.beats.flatMap(b=>b.shots??[]).reduce((n,s)=>n+s.duration,0);
    const target=Math.max(10,Math.min(18,duration)),scale=target/baseDuration;
    let elapsed=0;
    const beats=base.beats.map(beat=>{const fromSec=elapsed;const shots=beat.shots!.map(s=>({...s,duration:Math.round(Math.max(1,Math.min(2.5,s.duration*scale))*8)/8}));
      elapsed=Number((elapsed+shots.reduce((n,s)=>n+s.duration,0)).toFixed(3));return {...beat,shots,fromSec,toSec:elapsed};});
    // Timing adaptation is optional: keep the known-valid base rhythm if bounds
    // would make T-007 unusable. Measurements remain exact alongside the draft.
    const payoff=beats.filter(b=>b.phase==='result'||b.phase==='feature_tour').flatMap(b=>b.shots??[]).reduce((n,s)=>n+s.duration,0);
    const useAdapted=elapsed<=18&&elapsed>=10&&payoff>=4;
    const version=1+Math.max(...versions.filter(f=>f.id===base.id).map(f=>f.version),...references.flatMap(r=>r.proposedFormula?.id===base.id?[r.proposedFormula.version]:[]));
    const formula=viralFormulaSchema.parse({...base,storyboardVersion:2,version,beats:useAdapted?beats:base.beats,pacingSource:undefined,updatedAt:null,
      referenceSource:{jobId:exemplar.integrationJobId,analysis:source},
      durationSec:{min:duration,max:duration},cuts:{min:Math.floor(shotCount)-1,max:Math.ceil(shotCount)-1},references:group.map(r=>r.id),
      guardrails:[...base.guardrails.slice(0,38),'Timing adapted from measured references; review every shot before approval.']});
    return [{formula,referenceIds:group.map(r=>r.id),medianDuration:duration,medianShots:shotCount,medianCta:ctaTimes.length?median(ctaTimes):null}];
  });
}
