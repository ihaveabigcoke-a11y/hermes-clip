import {type LabRecord,vietnamDay,productFinancials} from './domain.ts';
import {profileFinance} from './product-profile.ts';
import {productJourneyStep,type JourneyMedia} from './product-next-step.ts';
import {selectionEntries} from './daily-selection.ts';
import {instagramProductSummary} from './instagram-summary.ts';
import {buildOfficeView} from './office-view.ts';
import {knownCount} from './today.ts';
import {compareHooks} from './hook-analytics.ts';

export const funnelLabels=['Đã chọn','Có khung content','Có clip','Có MP4','Có bài nháp','Đã đăng'];
export function productVisualRows(records:LabRecord[],manual:JourneyMedia=null,jobs:Parameters<typeof productJourneyStep>[3]=[],includeArchived=false) {
 const selected=new Set(selectionEntries(records).map(s=>s.productId)),office=buildOfficeView(records);
 return records.filter(r=>r.kind==='product'&&(includeArchived||!r.data.archived)).map(product=>{
  const projects=records.filter(r=>r.kind==='production'&&r.data.productId===product.id&&!r.data.archived);
  const clips=new Set(projects.flatMap(p=>(p.data.scenes??[]).flatMap((s:any)=>(s.takes??[]).filter((t:any)=>t.type==='video/mp4'&&t.assetId&&t.sha256).map((t:any)=>t.sha256))));
  const exports=new Set(office.exports.filter(e=>e.productId===product.id&&e.verified).map(e=>e.sha256));
  const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===product.id&&!r.data.archived);
  const summary=instagramProductSummary(records,product.id),finance=profileFinance(product.data),price=productFinancials(product.data).price;
  const steps=[selected.has(product.id),projects.some(p=>p.data.scenes?.length>0),clips.size>0,exports.size>0,plans.length>0,summary.posts.length>0];
  return {product,name:product.data.name as string,next:productJourneyStep(product,records,manual,jobs),landed:finance.landed,currency:finance.currency,price:knownCount(price)?price:null,priceCurrency:productFinancials(product.data).currency,markup:finance.markup,clips:clips.size,mp4:exports.size,posts:summary.posts.length,views:summary.totals.views.value,steps};
 });
}
export type ProductVisualRow=ReturnType<typeof productVisualRows>[number];
export function sortProductRows(rows:ProductVisualRow[],key:string,descending=false) {
 const value=(r:ProductVisualRow):string|number|null=>key==='step'?r.next.step:key==='next'?r.next.title:(r as any)[key]??null;
 return [...rows].sort((a,b)=>{const x=value(a),y=value(b);if(x===null||y===null)return x===y?a.name.localeCompare(b.name,'vi'):x===null?1:-1;return (typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'vi',{numeric:true}))*(descending?-1:1)||a.name.localeCompare(b.name,'vi');});
}
export function productFunnel(records:LabRecord[]) {
 const rows=productVisualRows(records);
 return funnelLabels.map((label,i)=>({label,value:rows.length?rows.filter(r=>r.steps[i]).length:null}));
}
/** Actual daily observations; missing days and null observations remain gaps. */
export function dailyViews(records:LabRecord[],now=Date.now()) {
 const products=records.filter(r=>r.kind==='product'&&!r.data.archived);
 return Array.from({length:14},(_,i)=>{
  const day=vietnamDay(now-(13-i)*86400000);
  const dayRecords=records.filter(r=>r.kind!=='social_metric'||(Date.parse(r.data.observedAt)<=now&&vietnamDay(Date.parse(r.data.observedAt))===day));
  const measured=products.flatMap(p=>instagramProductSummary(dayRecords,p.id).posts).filter(p=>p.metric);
  return {day,value:measured.length&&measured.every(p=>knownCount(p.metric!.data.views))?measured.reduce((sum,p)=>sum+p.metric!.data.views,0):null};
 });
}
export function productHookRows(records:LabRecord[],threshold:number|null) {
 return records.filter(p=>p.kind==='product'&&!p.data.archived).map(product=>{
  const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===product.id&&r.data.comparison).sort((a,b)=>(b.createdAt??b.updatedAt)-(a.createdAt??a.updatedAt)||b.updatedAt-a.updatedAt);
  const groupId=plans[0]?.data.comparison.groupId??'',hooks=compareHooks(records,product.id,groupId,threshold);
  const complete=hooks.length===3&&hooks.every(h=>!h.drift&&h.keywordRate!==null);
  const max=complete?Math.max(...hooks.map(h=>h.keywordRate!)):null;
  const leading=threshold!==null&&max!==null&&max*100>=threshold&&hooks.filter(h=>h.keywordRate===max).length===1?hooks.find(h=>h.keywordRate===max)!.variantId:null;
  return {product,groupId,hooks,leading};
 });
}
