import {readFileSync} from 'node:fs';

// Semantic/timing fixtures derived from the supplied V1–V12 seed, not a new
// observation of the original videos. V10's official-check hook differs from
// its historical formulaId, deliberately exercising partial matching.
const seed=JSON.parse(readFileSync(new URL('../../ops/night/input/formula-seed.json',import.meta.url),'utf8'));
export const analysisReferences=seed.references.map(reference=>{
  const formula=seed.formulas.find(f=>f.id===reference.formulaId);
  const beats=formula.beats.map((beat,i)=>({kind:beat.kind,role:beat.role,
    label:i===0?(reference.id==='V10'?null:reference.hookText):beat.kind==='cta'?reference.ctaText:beat.label||null,
    fromSec:reference.durationSec*i/formula.beats.length,toSec:reference.durationSec*(i+1)/formula.beats.length}));
  const ctaKeyword=reference.ctaText.match(/(?:comment|send|comenta)\s+["']?(\w+)/i)?.[1]??null;
  return {id:reference.id,product:reference.product,hookType:reference.id==='V10'?'authority_check':formula.hookType,
    hookText:reference.id==='V10'?null:reference.hookText,durationSec:reference.durationSec,cutCount:reference.cuts,beats,
    ctaType:reference.id==='V7'?'link_in_bio':reference.id==='V6'?'send_keyword_dm':'comment_keyword',
    ctaText:reference.ctaText,ctaKeyword,ctaSource:reference.ctaText.includes('theo tên file')?'filename':'overlay',
    visualPayoff:null,effectsBeyondProduct:null,productTraits:formula.fitProductTraits,notes:reference.notes,warnings:[]};
});
export function analysisResponse(reference=analysisReferences[4]) {
  const {id,warnings,sourceSha256,...response}=reference;
  return structuredClone(response);
}
export function structureFor(reference=analysisReferences[4]) {
  const cuts=Array.from({length:reference.cutCount},(_,i)=>reference.durationSec*(i+1)/(reference.cutCount+1));
  return {durationSec:reference.durationSec,cutCount:reference.cutCount,cuts,width:90,height:160,aspectRatio:'9:16',gridColumns:3,
    contactSheetPath:'fixture/sparse.jpg',frames:[{t:0,path:'fixture/frame.jpg'}],
    contactSheets:{sparse:{path:'fixture/sparse.jpg',fromSec:0,toSec:reference.durationSec,secondsPerFrame:.8,columns:3,rows:3},
      dense:[{path:'fixture/dense-01.jpg',fromSec:0,toSec:reference.durationSec,secondsPerFrame:.25,columns:11,rows:Math.ceil(Math.ceil(reference.durationSec*4)/11),frameCount:Math.ceil(reference.durationSec*4)}]}};
}
