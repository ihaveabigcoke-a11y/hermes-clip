import {z} from 'zod';
import {ratios,latestReferences,takeGate,type Production,type Scene} from './production.ts';
export {formulaStoryboard} from './formula-storyboard.ts';
export const briefSchema=z.object({idea:z.string().trim().min(10,'Mô tả ý tưởng ít nhất 10 ký tự.').max(2000),sceneCount:z.number().int().min(3).max(8),ratio:z.enum(ratios),duration:z.number().min(1).max(120),cta:z.string().trim().max(500).default('Learn more on the product page.')});
export function structuredStoryboard(product:Record<string,any>,p:Production,brief:z.infer<typeof briefSchema>){const b=briefSchema.parse(brief),refs=latestReferences(p).filter(r=>r.role==='product').map(r=>r.id),facts={product:product.name||'unknown',sku:product.sku||'unknown',customer:product.customer||'unknown',problem:product.problem||'unknown',allowedClaims:product.allowedClaims||'unknown — do not invent claims',invariants:product.invariants||'unknown — use approved product references',locale:p.locale};return Array.from({length:b.sceneCount},(_,i)=>{const role=i===0?'hook':i===b.sceneCount-1?'cta':'body',goal=role==='hook'?`Create an original opening based on: ${b.idea}`:role==='cta'?`Close with the user's CTA: ${b.cta}`:`Show one clear product action addressing the stated customer problem. Shot ${i} of ${b.sceneCount-2}.`;return {name:`${role==='hook'?"Mở đầu":role==='cta'?'CTA':"Nội dung chính"} · ${i+1}`,role:role as Scene['role'],mediaType:'video' as const,ratio:b.ratio,duration:b.duration,referenceIds:refs,action:goal,camera:i===0?'Medium shot, restrained camera movement.':'One steady close-up; avoid changing product parts.',voice:'',prompt:[`SCENE ${i+1}. ${goal}`,`Target: ${b.ratio}, ${b.duration} seconds. Content language: ${p.locale}.`,JSON.stringify(facts),`Keep product shape, markings, material, packaging and part state consistent with approved references. Unknown facts stay unknown. Do not invent measurements, demonstrations, testimonials, logos or performance guarantees.`,role==='cta'?b.cta:'No unsupported text or factual claim.'].join('\n')};});}
// Heuristic copy review, not proof that a claim or testimonial is valid. Keep
// negative instructions separate from affirmative clauses ("no glow, but laser").
function affirmativeMention(text:string, pattern:RegExp) {
  return text.split(/[.!?;\n]+|\b(?:but|however)\b/i).some(clause => {
    for(const match of clause.matchAll(new RegExp(pattern.source,'gi'))) {
      const before=clause.slice(0,match.index), after=clause.slice((match.index??0)+match[0].length);
      if(/\b(?:no|not|never|without|avoid|exclude|omit|do not|don['’]t|cannot|can['’]t)\b[^:;.!?]*$/i.test(before))continue;
      if(/^(?:[- ]free\b|\s+(?:(?:is|are)\s+)?(?:not|never|absent|unsupported)\b)/i.test(after))continue;
      if(/^\s+this\s+is\s+not\s+(?:an?\s+)?(?:allowed|permitted)\b/i.test(after))continue;
      return true;
    }
    return false;
  });
}
export function promptWarnings(
  s:Pick<Scene,'prompt'|'ratio'|'duration'|'references'> & Partial<Pick<Scene,'role'|'overlayText'>>,
  p:Production, product:Record<string,unknown> = {},
) {
  const w:string[]=[];
  const stated=[...s.prompt.matchAll(/\b(9:16|16:9|1:1|4:3|3:4)\b/g)].map(m=>m[1]);
  if(stated.some(x=>x!==s.ratio))w.push('Prompt nêu tỷ lệ khác cấu hình. Sửa trước khi gửi.');
  const durations=[...s.prompt.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:seconds?|giây)\b/gi)].map(m=>Number(m[1]));
  if(durations.some(x=>Math.abs(x-s.duration)>.25))w.push('Prompt có thời lượng khác cấu hình; kiểm tra lại ý nghĩa từng số.');
  if(!s.references.length)w.push('Chưa gắn ảnh sản phẩm chuẩn; khó kiểm soát SKU.');
  if(/100\s*%|guaranteed|cam kết|chữa khỏi/i.test(s.prompt))w.push('Có câu bảo đảm mạnh; kiểm tra bằng chứng và công dụng được phép.');
  if(s.references.some(pin=>!p.references.some(r=>r.id===pin.id&&r.version===pin.version)))w.push('Thiếu phiên bản tham chiếu đã ghim.');
  if(s.role==='hook'&&!s.overlayText?.trim())w.push('Cảnh mở đầu thiếu chữ trên màn hình (overlayText).');
  const copy=s.prompt+'\n'+(s.overlayText??'');
  if(affirmativeMention(copy,/\b(?:my\s+(?:dad|mom|mum|father|mother)|I\s+(?:bought|purchased|tried|used)|changed\s+my\s+life)\b/))
    w.push('Có dạng lời chứng thực; FTC cấm testimonial giả, kể cả do AI tạo. Dùng dạng POV.');
  const declared=[product.invariants,product.allowedClaims].filter(value=>typeof value==='string').join('\n');
  const effects=[/\blasers?\b/,/\bneon[ -]+trails?\b/,/\bglow(?:s|ing)?\b/];
  if(effects.some(effect=>affirmativeMention(copy,effect)&&!affirmativeMention(declared,effect)))
    w.push('Hiệu ứng có thể vượt sản phẩm thật');
  return w;
}
export function productionInsights(p:Production){const takes=p.scenes.flatMap(s=>s.takes.map(t=>({s,t}))),attempts=p.scenes.flatMap(s=>s.attempts),approved=takes.filter(({s,t})=>t.review==='approved'&&!takeGate(p,s,t)),approvedAttemptIds=new Set(approved.map(({t})=>t.attemptId).filter(Boolean)),knownUsage=attempts.filter(a=>a.usageUsd!==null),measurements=p.measurements.map(m=>{const v=p.variants.find(v=>v.id===m.variantId);let suggestion="Thu thập thêm dữ liệu cùng nhóm đo lường trước khi chọn biến thể.";if(m.views>=1000&&m.clicks<20)suggestion="Giả thuyết tiếp: thử mở đầu/lợi ích cụ thể hơn, giữ nội dung chính và kêu gọi hành động.";else if(m.clicks>=20&&m.sessions>=20&&m.orders===0)suggestion="Giả thuyết tiếp: kiểm tra đề xuất bán hàng/trang sản phẩm và tracking; chưa thể quy lỗi cho video.";else if(m.orders>0)suggestion='Có tín hiệu đơn hàng. Đối soát chi phí, giao/hoàn rồi thử một thay đổi mỗi lượt.';return {...m,name:v?.name??m.variantId,bodyId:v?.bodyId??'',locale:v?.locale??'',ctr:m.views?m.clicks/m.views:null,conversion:m.sessions?m.orders/m.sessions:null,suggestion};});return {attempts:attempts.length,takes:takes.length,approved:approved.length,approvedAttempts:approvedAttemptIds.size,manualTakes:takes.filter(({t})=>!t.attemptId).length,knownUsage:knownUsage.reduce((n,a)=>n+a.usageUsd!,0),unknownUsage:attempts.length-knownUsage.length,measurements,groups:measurements.filter(m=>m.views>0).reduce<Record<string,string[]>>((groups,m)=>{const key=JSON.stringify([m.bodyId,m.locale,m.source]);(groups[key]??=[]).push(m.variantId);return groups;},{})};}
