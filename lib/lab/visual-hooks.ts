import {z} from 'zod';
import {latestReferences,type Production} from './production.ts';

export const visualHookBrief=z.object({
 problemVisual:z.string().trim().min(10,'Mô tả bất tiện nhìn thấy được, ít nhất 10 ký tự.').max(800),
 productAction:z.string().trim().min(10,'Mô tả một thao tác dùng sản phẩm.').max(800),
 payoffVisual:z.string().trim().min(10,'Mô tả kết quả có thể quay/chứng minh.').max(800),
});
export function visualHookDrafts(product:Record<string,any>,p:Production,input:unknown){
 const b=visualHookBrief.parse(input),referenceIds=latestReferences(p).filter(r=>r.role==='product').map(r=>r.id);
 const variants=[
  {name:'A · Bất tiện trước',hypothesis:'Người xem nhận ra bất tiện của chính mình.',beats:[`0–0.7s: close-up of the observable inconvenience: ${b.problemVisual}`,`0.7–1.8s: show its immediate consequence in the same setting.`,`1.8–3s: begin the real product action: ${b.productAction}`]},
  {name:'B · Kết quả trước',hypothesis:'Kết quả thật tạo mong muốn biết cách làm.',beats:[`0–0.7s: show the verified result: ${b.payoffVisual}`,`0.7–1.8s: cut to the observable starting problem: ${b.problemVisual}`,`1.8–3s: reveal the product action connecting the two: ${b.productAction}`]},
  {name:'C · Đối chiếu trực tiếp',hypothesis:'Cùng một tình huống, sự khác biệt đủ rõ để xem tiếp.',beats:[`0–0.7s: frame the observable problem: ${b.problemVisual}`,`0.7–1.8s: show one real product action: ${b.productAction}`,`1.8–3s: use a matched camera position to show the verified result: ${b.payoffVisual}`]},
 ];
 const previews=[
  [`0–0,7s: Cận cảnh bất tiện: ${b.problemVisual}`,`0,7–1,8s: Cho thấy hệ quả ngay trong cùng bối cảnh.`,`1,8–3s: Bắt đầu thao tác: ${b.productAction}`],
  [`0–0,7s: Cho thấy kết quả cần kiểm chứng: ${b.payoffVisual}`,`0,7–1,8s: Quay lại tình huống ban đầu: ${b.problemVisual}`,`1,8–3s: Hé lộ cách làm: ${b.productAction}`],
  [`0–0,7s: Cho thấy bất tiện: ${b.problemVisual}`,`0,7–1,8s: Một thao tác rõ ràng: ${b.productAction}`,`1,8–3s: Cùng góc quay, đối chiếu kết quả: ${b.payoffVisual}`],
 ];
 return variants.map((v,i)=>({...v,preview:previews[i],scene:{name:v.name,role:'hook' as const,mediaType:'video' as const,ratio:'9:16' as const,duration:3,referenceIds,action:v.beats.join('\n'),camera:'One readable subject; close framing. Match viewpoint for comparisons.',voice:'No narration required. Understandable with audio muted and overlays hidden.',prompt:[`TEMPLATE HYPOTHESIS — not AI-generated footage or a proven winning hook.`, `Product: ${product.name||'Unnamed product'}. Locale: ${p.locale}. Opening only: 9:16, 3 seconds.`,...v.beats,`Continue into the SAME approved body and CTA across A/B/C. Change the opening only.`,`Use approved references for shape, color and components. Allowed claims: ${product.allowedClaims||'none verified; do not add claims'}.`,`The supplied visual brief is an unverified creative proposal until checked against a real sample. Never fabricate efficacy, testimonials, danger or product features. Use real proof footage for the demonstrated result. Add captions in editing, not inside generation.`].join('\n')}}));
}
