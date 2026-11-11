type Row = {id:string;kind:string;data:Record<string,any>;updatedAt:number};
type Job = {state:string;updatedAt:number;snapshot:{planId:string;productId:string;accountId?:string;assetId?:string};postUrl:string;syncError?:string};
export const instagramTableMetricKeys = ['views','likes','comments','saves','shares','profileVisits','linkClicks'] as const;
export const summaryMetricKeys = [...instagramTableMetricKeys,'follows'] as const;
export type SummaryMetric = typeof summaryMetricKeys[number];
export type MetricTotal = {value:number|null;known:number;total:number;approximate:boolean};
type Post = {plan:Row;planIds:string[];metric:Row|null;url:string;accountId:string|null;assetId:string|null};

export function visibleInstagramProducts<T extends Row>(products:T[],showArchived=false):T[] {
  return products.filter(product=>product.kind==='product'&&(showArchived||(!product.data.archived
    &&product.id!=='local_qa_product'&&!/^TEST LOCAL/i.test(String(product.data.name??'').trim()))));
}

function newerMetric(a:Row,b:Row) {
  return Date.parse(a.data.observedAt)-Date.parse(b.data.observedAt)||a.updatedAt-b.updatedAt;
}

function postKey(value:unknown) {
  try {const url=new URL(String(value));const match=url.pathname.match(/^\/(?:p|reel|reels)\/([a-zA-Z0-9_-]+)\/?$/);
    return ['instagram.com','www.instagram.com'].includes(url.hostname)&&url.protocol==='https:'&&match?match[1]:null;
  }catch{return null;}
}
export function instagramProductSummary(records:Row[],productId:string,jobs:Job[]=[]){
  const plans=records.filter(r=>r.kind==='content_plan'&&r.data.productId===productId);
  const accounts=records.filter(r=>r.kind==='social_account'&&r.data.productId===productId&&!r.data.archived);
  const posts=new Map<string,Post>();
  for(const plan of plans){
    const publishedJob=jobs.filter(j=>j.snapshot.productId===productId&&j.snapshot.planId===plan.id&&j.state==='published')
      .sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(!['published_browser','published_manual'].includes(plan.data.status)&&!publishedJob)continue;
    const url=publishedJob?.postUrl||plan.data.postUrl||'';
    const accountId=publishedJob?.snapshot.accountId||plan.data.accountId||null;
    const assetId=publishedJob?.snapshot.assetId||plan.data.assetId||null;
    const key=postKey(url);
    const candidates=records.filter(r=>r.kind==='social_metric'&&r.data.planId===plan.id&&Number.isFinite(Date.parse(r.data.observedAt))
      &&!!key&&postKey(r.data.sourceUrl)===key&&(!r.data.accountId||r.data.accountId===accountId))
      .sort((a,b)=>newerMetric(b,a));
    const metric=candidates[0]??null;
    const existing=posts.get(key??plan.id);
    if(existing){
      existing.planIds.push(plan.id);
      // Keep the account/content identity with the winning observation, including aliases.
      if(metric&&(!existing.metric||newerMetric(metric,existing.metric)>0))Object.assign(existing,{plan,metric,url,accountId,assetId});
    }else posts.set(key??plan.id,{plan,planIds:[plan.id],metric,url,accountId,assetId});
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

function savedCtaKeyword(records:Row[],post:Post):string|null {
  const projects=records.filter(r=>r.kind==='production'&&r.data.productId===post.plan.data.productId
    &&(post.plan.data.productionId?r.id===post.plan.data.productionId:r.data.contentPlanId===post.plan.id));
  if(projects.length!==1)return null;
  const project=projects[0].data;
  let variants=Array.isArray(project.variants)?project.variants:[];
  if(post.assetId){
    const exports=(project.exports??[]).filter((entry:any)=>entry.kind==='render'&&entry.assetId===post.assetId);
    if(exports.length)variants=variants.filter((variant:any)=>exports.some((entry:any)=>entry.variantId===variant.id));
    else variants=variants.filter((variant:any)=>{
      const body=(project.bodies??[]).find((body:any)=>body.id===variant.bodyId);
      return [variant.hook,...(body?.items??[]),variant.cta].some(item=>item?.takeId&&(project.scenes??[]).some((scene:any)=>
        scene.id===item.sceneId&&scene.takes?.some((take:any)=>take.id===item.takeId&&take.assetId===post.assetId)));
    });
  }
  // A shared body or an unselected A/B draft is usable only if every matching variant agrees.
  const keywords=variants.map((variant:any)=>typeof variant.ctaKeyword==='string'?variant.ctaKeyword.trim():null);
  return keywords.length>0&&keywords[0]&&keywords.every((keyword:string|null)=>keyword===keywords[0])?keywords[0]:null;
}

/** One row per public post, ordered by account × content; aliases never add another row. */
export function instagramAccountContentRows(records:Row[],productId:string,jobs:Job[]=[]){
  return instagramProductSummary(records,productId,jobs).posts.map(post=>({...post,
    account:records.find(r=>r.kind==='social_account'&&r.id===post.accountId&&r.data.productId===productId)??null,
    ctaKeyword:savedCtaKeyword(records,post),
  })).sort((a,b)=>(a.account?.data.name??a.accountId??'').localeCompare(b.account?.data.name??b.accountId??'','vi')
    ||(a.accountId??'').localeCompare(b.accountId??'')||String(a.plan.data.name??a.plan.id).localeCompare(String(b.plan.data.name??b.plan.id),'vi'));
}
