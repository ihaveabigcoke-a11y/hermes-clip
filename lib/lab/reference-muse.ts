import type {VideoStructure} from './viral-reference.ts';
import type {ViralFormula} from './viral-formulas.ts';
import {formulaAnalysisPrompt, parseFormulaAnalysis} from './formula-analysis.ts';

type Context = {structure:VideoStructure; caption:string; fileName:string; formulas:readonly ViralFormula[]};
export function referenceMusePrompt(context:Context, repair=false) {
  const {structure} = context;
  const attachedStructure = {...structure, contactSheets:structure.contactSheets
    ? {...structure.contactSheets, dense:structure.contactSheets.dense.slice(0,1)} : undefined};
  return (repair ? 'Repair your previous response as valid JSON matching the schema below. Use the same two images already attached in this thread. Do not generate media.\n' : '')
    + formulaAnalysisPrompt({...context, structure:attachedStructure})
    + '\nOnly the sparse sheet (attachment 1) and the FIRST dense sheet (attachment 2) are attached. Later dense pages are NOT attached. Do not claim to inspect those pages or conclude absent text/CTA outside the attached dense range; keep unverified fields null and explain coverage limits in notes.';
}
export function parseReferenceMuseResponse(text:string, context:Context) {
  const parsed = parseFormulaAnalysis(text,context.structure,context);
  if ((context.structure.contactSheets?.dense.length ?? 0) > 1)
    parsed.warnings.push('Muse chỉ nhận sheet thưa và sheet dày đầu tiên; chữ/CTA ngoài khoảng sheet dày này chưa được kiểm đầy đủ.');
  return parsed;
}
