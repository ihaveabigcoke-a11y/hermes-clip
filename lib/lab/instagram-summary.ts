type Row = {id:string;kind:string;data:Record<string,any>;updatedAt:number};
type Job = {state:string;updatedAt:number;snapshot:{planId:string;productId:string};postUrl:string;syncError?:string};
export const summaryMetricKeys = ['views','likes','comments','saves','shares','follows'] as const;
export type SummaryMetric = typeof summaryMetricKeys[number];
export type MetricTotal = {value:number|null;known:number;total:number;approximate:boolean};

function postKey(value:unknown) {
  try {const url=new URL(String(value));const match=url.pathname.match(/^\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)\/?$/);
    return ['instagram.com','www.instagram.com'].includes(url.hostname)&&url.protocol==='https:'&&match?match[1]:null;
  }catch{return null;}
}
export function instagramProductSummary(records:Row[],productId:string,jobs:Job[]=[]){
  const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===productId);
  const accounts=records.filter(r=>r.kind==='social_account'&&r.data.productId===productId&&!r.data.archived);
  const posts=new Map<string,{plan:Row;planIds:string[];metric:Row|null;url:string}>();
  for(const plan of plans){
    const publishedJob=jobs.filter(j=>j.snapshot.productId===productId&&j.snapshot.planId===plan.id&&j.state==='published')
      .sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(!['published_browser','published_manual'].includes(plan.data.status)&&!publishedJob)continue;
    const url=plan.data.postUrl||publishedJob?.postUrl||'';
    const key=postKey(url);
    const candidates=records.filter(r=>r.kind==='social_metric'&&r.data.planId===plan.id&&Number.isFinite(Date.parse(r.data.observedAt))
      &&!!key&&postKey(r.data.sourceUrl)===key&&(!r.data.accountId||r.data.accountId===plan.data.accountId))
      .sort((a,b)=>Date.parse(b.data.observedAt)-Date.parse(a.data.observedAt)||b.updatedAt-a.updatedAt);
    const metric=candidates[0]??null;
    const existing=posts.get(key??plan.id);
    if(existing){
      existing.planIds.push(plan.id);
      if(metric&&(!existing.metric||Date.parse(metric.data.observedAt)>Date.parse(existing.metric.data.observedAt)))existing.metric=metric;
    }else posts.set(key??plan.id,{plan,planIds:[plan.id],metric,url});
  }
  const published=[...posts.values()];
  const totals=Object.fromEntries(summaryMetricKeys.map(key=>{
    const known=published.filter(p=>typeof p.metric?.data[key]==='number'&&Number.isFinite(p.metric.data[key])&&p.metric.data[key]>=0);
    return [key,{value:published.length>0&&known.length===published.length?known.reduce((sum,p)=>sum+p.metric!.data[key],0):null,
      known:known.length,total:published.length,approximate:known.some(p=>p.metric!.data.approximate?.includes(key))}];
  })) as Record<SummaryMetric,MetricTotal>;
  const measured=published.filter(p=>p.metric);
  const publishedIds=new Set(published.flatMap(p=>p.planIds));
  return {productId,accounts:accounts.length,plans:plans.length,drafts:plans.filter(p=>!publishedIds.has(p.id)).length,
    publishedPosts:published.length,measuredPosts:measured.length,totals,posts:published,
    oldestMeasuredAt:measured.length?Math.min(...measured.map(p=>Date.parse(p.metric!.data.observedAt))):null,
    newestMeasuredAt:measured.length?Math.max(...measured.map(p=>Date.parse(p.metric!.data.observedAt))):null};
}
