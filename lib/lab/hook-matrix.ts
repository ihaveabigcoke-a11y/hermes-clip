import {z} from 'zod';
import {contentPlanSchema} from './operations.ts';
import {productionSchema,variantItems} from './production.ts';
import {getRenderPlan,renderDuration} from './render-plan.ts';
import {buildUtmLink,isHttpsLink} from './utm.ts';
import type {LabRecord} from './domain.ts';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const hookDraftInput=z.object({projectId:id,revision:z.number().int().positive(),sourceGroupId:id,
  batchId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),accountIds:z.array(id).max(20),
  landingBaseUrl:z.string().trim().refine(isHttpsLink,'Landing cần HTTPS hợp lệ.').nullable(),
}).superRefine((v,c)=>{if(new Set(v.accountIds).size!==v.accountIds.length)c.addIssue({code:'custom',message:'Tài khoản bị trùng.'});});

/** Pure, used inside a local SQLite transaction. No publishing or provider calls. */
export function planHookDrafts(records:readonly LabRecord[],raw:unknown,now=Date.now()):LabRecord[] {
  const d=hookDraftInput.parse(raw),project=records.find(r=>r.id===d.projectId&&r.kind==='production');
  if(!project||project.revision!==d.revision)throw Error('Dự án đã thay đổi. Tải lại trước khi tạo bài nháp.');
  const p=productionSchema.parse(project.data),product=records.find(r=>r.kind==='product'&&r.id===p.productId&&!r.data.archived);
  if(!product||product.revision!==p.productRevision)throw Error('Đồng bộ hồ sơ sản phẩm trước khi tạo bài nháp.');
  const variants=p.variants.filter(v=>v.comparisonGroupId===d.sourceGroupId);
  if(variants.length!==3)throw Error('Chọn nhóm có đúng ba hook.');
  const plans=variants.map(v=>getRenderPlan(p,project.id,v.id));
  const canonical=JSON.stringify({body:plans[0].segments.slice(1),overlays:plans[0].overlays});
  if(plans.some(plan=>JSON.stringify({body:plan.segments.slice(1),overlays:plan.overlays})!==canonical)
    ||variants.some(v=>v.bodyId!==variants[0].bodyId||!v.hook||v.ctaKeyword!==variants[0].ctaKeyword||v.ctaText!==variants[0].ctaText||v.caption!==variants[0].caption))throw Error('Ba hook phải giữ chung thân, CTA và caption.');
  const keyword=variants[0].ctaKeyword;if(!keyword)throw Error('Điền từ khóa CTA cho nhóm hook.');
  const exports=variants.map((v,i)=>{
    variantItems(p,v.id);
    const exp=[...p.exports].reverse().find(e=>e.variantId===v.id&&e.kind==='render'&&e.verified&&e.assetId&&e.sha256&&JSON.stringify(e.renderPlan)===JSON.stringify(plans[i]));
    const asset=records.find(r=>r.kind==='asset'&&r.id===exp?.assetId),m=asset?.data.metadata;
    if(!exp||!asset||asset.data.sha256!==exp.sha256||asset.data.type!=='video/mp4'||m?.verifiedBy!=='container'||m.width!==720||m.height!==1280||!Number.isFinite(m.duration)||Math.abs(m.duration-renderDuration(plans[i]))>.1)throw Error('Xuất đủ ba MP4 đã kiểm từ đoạn hiện tại trước khi tạo bài nháp.');
    return exp;
  });
  const accountIds=d.accountIds.length?d.accountIds:[''];
  const accounts=accountIds.map(aid=>{if(!aid)return null;const account=records.find(r=>r.kind==='social_account'&&r.id===aid&&!r.data.archived&&r.data.productId===product.id);if(!account)throw Error('Tài khoản không thuộc sản phẩm đang chọn.');return account;});
  const prior=records.filter(r=>r.kind==='content_plan'&&r.data.productionId===project.id&&r.data.comparison?.sourceGroupId===d.sourceGroupId);
  const first=prior[0]?.data.comparison;
  const price=typeof product.data.price==='number'?product.data.price:null,currency=product.data.currency??null;
  if(first&&(first.ctaKeyword!==keyword||first.price!==price||first.currency!==currency||first.landingBaseUrl!==d.landingBaseUrl))throw Error('Điều kiện đã đổi so với lượt so sánh. Tạo nhóm hook mới để giữ lịch sử.');
  const groupId=first?.groupId??d.batchId,result:LabRecord[]=[];
  for(const [vi,v] of variants.entries())for(const [ai,account] of accounts.entries()){
    const aid=account?.id??'',existing=prior.find(r=>r.data.variantId===v.id&&r.data.comparison.accountId===aid);
    if(existing){result.push(existing);continue;}
    const planId=`draft_${d.batchId}_${vi}_${ai}`,exp=exports[vi];
    if(records.some(r=>r.id===planId))throw Error('Mã lượt đã dùng cho nội dung khác. Tải lại trước khi tạo.');
    const utmLink=d.landingBaseUrl&&account?.data.handle?buildUtmLink(d.landingBaseUrl,{productSlug:product.data.productKey||product.data.name,accountHandle:account.data.handle,planId,hookId:v.id,ctaKeyword:keyword}):null;
    const data=contentPlanSchema.parse({name:(v.name+' · '+(account?.data.name??'Chưa gán tài khoản')).slice(0,150),productId:product.id,productionId:project.id,accountId:aid,assetId:exp.assetId,variantId:v.id,hook:p.scenes.find(s=>s.id===v.hook?.sceneId)?.name??v.name,
      script:'',caption:v.caption,ctaKeyword:keyword,landingBaseUrl:d.landingBaseUrl,utmHookId:v.id,utmLink,offerPrice:price,offerCurrency:currency,status:'draft',postUrl:'',notes:'Bản nháp từ ba hook chung thân; cần duyệt nội dung và quyền đăng.',
      comparison:{groupId,sourceGroupId:d.sourceGroupId,ctaKeyword:keyword,price,currency,landingBaseUrl:d.landingBaseUrl,variantId:v.id,assetId:exp.assetId,accountId:aid}});
    result.push({id:planId,kind:'content_plan',data,revision:1,createdAt:now,updatedAt:now});
  }
  if(records.length+result.filter(r=>!records.some(old=>old.id===r.id)).length>2000)throw Error('Workspace vượt giới hạn 2.000 bản ghi.');
  return result;
}

export function comparisonDrift(plan:LabRecord):string[] {
  const d=plan.data,s=d.comparison;if(!s)return [];
  const fields=[['ctaKeyword','ctaKeyword','CTA'],['offerPrice','price','giá'],['offerCurrency','currency','tiền tệ'],['landingBaseUrl','landingBaseUrl','landing'],['variantId','variantId','hook'],['assetId','assetId','MP4'],['accountId','accountId','tài khoản']];
  return fields.filter(([key,snapshot])=>(d[key]??null)!==(s[snapshot]??null)).map(([, ,label])=>label);
}
const numberOrNull=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
export function latestPostSignals(records:readonly LabRecord[],plan:LabRecord) {
  const latest=(kind:string)=>records.filter(r=>r.kind===kind&&r.data.planId===plan.id&&Number.isFinite(Date.parse(r.data.observedAt))).sort((a,b)=>Date.parse(b.data.observedAt)-Date.parse(a.data.observedAt)||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id))[0];
  const metric=latest('social_metric'),comments=latest('keyword_comment_measurement');
  const keyword=comments&&(!metric||Date.parse(comments.data.observedAt)>Date.parse(metric.data.observedAt))?comments.data.matched:metric?.data.keywordComments??comments?.data.matched;
  return {views:numberOrNull(metric?.data.views),keywordComments:numberOrNull(keyword),dms:numberOrNull(metric?.data.dms),shares:numberOrNull(metric?.data.shares),utmClicks:numberOrNull(metric?.data.utmClicks??plan.data.utmClicks),orders:numberOrNull(metric?.data.orders),observedAt:metric?.data.observedAt??comments?.data.observedAt??null};
}
export function hookMatrix(records:readonly LabRecord[],productId:string,groupId:string) {
  const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===productId&&r.data.comparison?.groupId===groupId);
  const variants=[...new Set(plans.map(r=>r.data.comparison.variantId as string))],accounts=[...new Set(plans.map(r=>r.data.comparison.accountId as string))];
  return {variants,accounts,cells:variants.flatMap(variantId=>accounts.map(accountId=>{const plan=plans.find(r=>r.data.comparison.variantId===variantId&&r.data.comparison.accountId===accountId);return {variantId,accountId,plan,drift:plan?comparisonDrift(plan):[],signals:plan?latestPostSignals(records,plan):{views:null,keywordComments:null,dms:null,shares:null,utmClicks:null,orders:null,observedAt:null}};}))};
}
