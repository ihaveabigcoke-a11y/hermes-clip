import {z} from 'zod';
import {variantItems,type Production} from './production.ts';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const renderPlanSchema=z.object({
  productionId:id,variantId:id,bodyId:id,ratio:z.literal('9:16'),size:z.tuple([z.literal(720),z.literal(1280)]),audio:z.literal('keep'),
  segments:z.array(z.object({shotId:id.nullable(),sceneId:id,takeId:id,assetId:id,sha256:z.string().regex(/^[a-f0-9]{64}$/),inSec:z.number().finite().nonnegative(),outSec:z.number().finite().positive().max(120)})).min(1).max(30),
  overlays:z.array(z.object({text:z.string().trim().min(1).max(120).refine(t=>!/[{}\\\r]/.test(t)&&t.split('\n').length<=2,'Chữ đè không chứa mã ASS, tối đa hai dòng.'),fromSec:z.number().finite().nonnegative(),toSec:z.number().finite().positive(),role:z.enum(['label','cta']),style:z.literal('white-outline-top')})).max(80),
}).superRefine((p,c)=>{
 const duration=p.segments.reduce((n,s)=>n+s.outSec-s.inSec,0);
 if(duration>120||p.segments.some(s=>s.outSec-s.inSec<.04))c.addIssue({code:'custom',message:'Đoạn cần ít nhất 0,04 giây, tổng không quá 120 giây.'});
 if(p.overlays.some(o=>o.toSec<=o.fromSec||o.toSec>duration+.001))c.addIssue({code:'custom',message:'Chữ đè phải nằm trong timeline thực tế.'});
});
export type RenderPlan=z.infer<typeof renderPlanSchema>;
export const renderDuration=(p:RenderPlan)=>p.segments.reduce((n,s)=>n+s.outSec-s.inSec,0);
export function validateRenderPlan(p:Production,raw:unknown):RenderPlan {
 const plan=renderPlanSchema.parse(raw),v=p.variants.find(v=>v.id===plan.variantId),items=variantItems(p,plan.variantId);
 if(v?.bodyId!==plan.bodyId||items.length!==plan.segments.length)throw Error('Plan không khớp biến thể/thân video.');
 items.forEach(({scene,take},i)=>{const s=plan.segments[i];if(scene.ratio!=='9:16'||s.sceneId!==scene.id||s.takeId!==take.id||s.assetId!==take.assetId||s.sha256!==take.sha256||(s.shotId!==null&&s.shotId!==scene.id)||s.outSec>(take.metadata.duration??0)+.001)throw Error('Nguồn, hash hoặc đoạn cắt không khớp take đã duyệt.');});
 if(v?.comparisonGroupId){const peers=p.variants.filter(x=>x.comparisonGroupId===v.comparisonGroupId&&x.id!==v.id);for(const peer of peers){const other=p.renderPlans?.find(x=>x.variantId===peer.id);if(other&&JSON.stringify(other.segments.slice(1))!==JSON.stringify(plan.segments.slice(1)))throw Error('Ba hook dùng chung đoạn thân. Tạo nhóm so sánh mới nếu cần đổi thân.');if(other&&JSON.stringify(other.overlays)!==JSON.stringify(plan.overlays))throw Error('Giữ cùng chữ/CTA trong nhóm ba hook.');if(other&&Math.abs(other.segments[0].outSec-other.segments[0].inSec-plan.segments[0].outSec+plan.segments[0].inSec)>.001)throw Error('Ba hook cần cùng thời lượng để giữ mốc thân và CTA.');}}
 return plan;
}
export function getRenderPlan(p:Production,productionId:string,variantId:string):RenderPlan {
 const old=p.renderPlans?.find(x=>x.variantId===variantId);if(old){if(old.productionId!==productionId)throw Error('Plan thuộc dự án khác.');return validateRenderPlan(p,old);}
 const v=p.variants.find(x=>x.id===variantId);if(!v)throw Error('Không tìm thấy biến thể.');
 const items=variantItems(p,variantId);let at=0;const overlays:RenderPlan['overlays']=[];
 const segments=items.map(({scene,take})=>{const duration=Math.min(take.metadata.duration!,scene.duration),text=scene.overlay?.text??scene.overlayText;if(text?.trim())overlays.push({text,fromSec:at,toSec:at+duration,role:'label',style:'white-outline-top'});at+=duration;return {shotId:scene.id,sceneId:scene.id,takeId:take.id,assetId:take.assetId,sha256:take.sha256,inSec:0,outSec:duration};});
 if(v.ctaPlacement==='overlay'&&v.ctaText?.trim())overlays.push({text:v.ctaText,fromSec:Math.max(0,at-5),toSec:at,role:'cta',style:'white-outline-top'});
 return validateRenderPlan(p,{productionId,variantId,bodyId:v.bodyId,ratio:'9:16',size:[720,1280],audio:'keep',segments,overlays});
}
