import {z} from 'zod';
import {hookDraftInput,planHookDrafts} from './hook-matrix.ts';
import {vietnamDay,type LabRecord} from './domain.ts';
import {suggestProductKey} from './daily-selection.ts';
export function exportLabel(product:LabRecord,hook:number,technique:string,account:string,now:number){
 const clean=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').replace(/[^a-zA-Z0-9-]/g,'-').replace(/-+/g,'-').slice(0,48)||'draft';
 return `${clean(product.data.productKey||suggestProductKey(product.data.name))}_H${hook}-${clean(technique)}_${clean(account)}_${vietnamDay(now).replaceAll('-','').slice(2)}`;
}
export const distributionInput=hookDraftInput.and(z.object({variantId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional()}));
export function planDistribution(records:LabRecord[],raw:unknown,now=Date.now()):LabRecord[]{
 const input=distributionInput.parse(raw);if(!input.accountIds.length)throw Error('Thêm tài khoản trước khi chia video.');
 const project=records.find(r=>r.id===input.projectId&&r.kind==='production'),product=records.find(r=>r.kind==='product'&&r.id===project?.data.productId);
 if(!project||!product)throw Error('Chọn sản phẩm và ba MP4.');
 const variants=project.data.variants.filter((v:any)=>v.comparisonGroupId===input.sourceGroupId);
 if(input.variantId&&!variants.some((v:any)=>v.id===input.variantId))throw Error('Video không thuộc lượt đang chọn.');
 const all=planHookDrafts(records,input,now),result:LabRecord[]=[];
 for(const [index,accountId] of input.accountIds.entries()){
  const variant=variants.find((v:any)=>v.id===input.variantId)??variants[index%3],draft=all.find(r=>r.data.accountId===accountId&&r.data.variantId===variant.id)!;
  if(records.some(r=>r.id===draft.id)){result.push(draft);continue;}
  const account=records.find(r=>r.id===accountId)!,hook=variants.findIndex((v:any)=>v.id===variant.id)+1,name=exportLabel(product,hook,variant.hookTechnique??['problem','absurd','curiosity'][hook-1],account.data.handle||account.data.name,now);
  const data:Record<string,any>={...draft.data,name};if(data.utmLink){const u=new URL(data.utmLink);u.searchParams.set('utm_content',name);u.searchParams.set('utm_medium','organic');data.utmLink=u.href;}
  result.push({...draft,data});
 }
 return result;
}
