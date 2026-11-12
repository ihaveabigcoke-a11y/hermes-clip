import {z} from 'zod';
import {comparisonDrift} from './hook-matrix.ts';
import type {LabRecord} from './domain.ts';
export const productDecisionSchema=z.object({productId:z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),decision:z.enum(['push','revise','drop']),reason:z.string().trim().min(5,'Ghi lý do ít nhất 5 ký tự.').max(2000),decidedAt:z.string().datetime({offset:true})});
export function signalRate(numerator:unknown,denominator:unknown):number|null{return typeof numerator==='number'&&Number.isFinite(numerator)&&numerator>=0&&typeof denominator==='number'&&Number.isFinite(denominator)&&denominator>0?numerator/denominator:null;}
export function scaleSignal(rate:number|null,threshold:number|null|undefined){return threshold==null?'Chưa đặt ngưỡng':rate===null?'Chưa đủ dữ liệu':rate*100>=threshold?'Đạt ngưỡng đã đặt':'Chưa đạt ngưỡng đã đặt';}
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function latestHookMetric(records:readonly LabRecord[],plan:LabRecord){return records.filter(r=>r.kind==='social_metric'&&r.data.planId===plan.id&&Number.isFinite(Date.parse(r.data.observedAt))&&r.data.sourceUrl===plan.data.postUrl).sort((a,b)=>Date.parse(b.data.observedAt)-Date.parse(a.data.observedAt)||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id))[0]??null;}
export function compareHooks(records:readonly LabRecord[],productId:string,groupId:string,threshold:number|null=null){
 const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===productId&&r.data.comparison?.groupId===groupId);
 const conditions=(r:LabRecord)=>JSON.stringify([r.data.comparison.ctaKeyword,r.data.comparison.price,r.data.comparison.currency,r.data.comparison.landingBaseUrl]);
 const same=plans.every(p=>conditions(p)===conditions(plans[0])),accounts=[...new Set(plans.map(p=>p.data.comparison.accountId))];
 return [...new Set(plans.map(p=>p.data.comparison.variantId as string))].map(variantId=>{
  const selected=plans.filter(p=>p.data.comparison.variantId===variantId),drift=!same||selected.some(p=>comparisonDrift(p).length>0);
  const metrics=selected.map(p=>latestHookMetric(records,p)),complete=selected.length===accounts.length&&new Set(selected.map(p=>p.data.comparison.accountId)).size===accounts.length;
  const sum=(key:string)=>complete&&metrics.length&&metrics.every(m=>valid(m?.data[key]))?metrics.reduce((n,m)=>n+m!.data[key],0):null;
  const views=sum('views'),keywordComments=sum('keywordComments'),utmClicks=sum('utmClicks'),keywordRate=drift?null:signalRate(keywordComments,views),clickRate=drift?null:signalRate(utmClicks,views);
  return {variantId,name:selected[0]?.data.hook||variantId,views,keywordComments,utmClicks,orders:sum('orders'),keywordRate,clickRate,drift,signal:drift?'Lệch lượt so sánh':scaleSignal(keywordRate,threshold),observations:selected.map((p,i)=>({planId:p.id,accountId:p.data.accountId,observedAt:metrics[i]?.data.observedAt??null,source:metrics[i]?.data.source??null,sourceUrl:metrics[i]?.data.sourceUrl??null}))};
 });
}
