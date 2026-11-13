import {type LabRecord} from './domain.ts';
import {formulasForProduct,workspaceFormulas} from './viral-formulas.ts';
import {ctaKeywordSuggestions} from './formula-storyboard.ts';
export type QuickVideoFields = {ctaKeyword:string;situation:string;brandName:string;boxText:string};
export function quickVideoSuggestions(product: LabRecord, records: LabRecord[]) {
  const p = product.data, library = workspaceFormulas(records).filter(f => f.storyboardVersion === 2);
  const formula = formulasForProduct(p.traits ?? [],library)[0] ?? library[0];
  const text = `${p.audience ?? ''} ${p.customer ?? ''} ${p.name ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const hint = /\b(pet|dog|cat|thu cung|cho|meo)\b/.test(text)?'PAWS':/bike|cycl|xe dap/.test(text)?'BIKE':/run|chay bo/.test(text)?'RUN':/di bo|walk|hik/.test(text)?'WALK':/\b(bag|tui)\b/.test(text)?'PACK':/home|nha|bep/.test(text)?'HOME':'HELP';
  const brand = p.brandName?.trim() || p.name.trim().slice(0,80);
  const values: QuickVideoFields = {ctaKeyword:p.ctaKeyword || ctaKeywordSuggestions(p)[0] || hint, situation:p.situation || formula?.situationExamples?.[0] || '',brandName:brand,boxText:p.boxText || brand};
  return {formula,values};
}
