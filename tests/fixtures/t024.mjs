import {journeyFixture} from './product-journey.mjs';
export function todayFixture(domain, now=Date.now()) {
  const f=journeyFixture(domain,9);
  f.records=f.records.filter(r=>r.kind!=='content_plan'||r.data.accountId==='account_1');
  f.product.data.name='Đèn vòng cổ thú cưng';
  const product=(id,name,data={})=>({id,kind:'product',revision:1,updatedAt:now,data:{...domain.emptyProduct,name,...data}});
  const first=product('today_first','Túi đựng đồ đi bộ');
  const second=product('today_second','Đèn đọc sách',{productKey:'READING',brandName:'Read',boxText:'Read light'});
  const plans=f.records.filter(r=>r.kind==='content_plan');
  // Two measured posts, all other plans remain drafts; journey remains at the publishing step.
  plans.forEach((p,i)=>{if(i>=2){p.data.status='draft';p.data.postUrl='';}});
  const measurements=plans.slice(0,2).map((p,i)=>({id:'today_measure_'+i,kind:'social_metric',revision:1,updatedAt:now,data:{planId:p.id,accountId:p.data.accountId,source:'manual',sourceUrl:p.data.postUrl,sourceLabel:'Instagram Insights · fixture',observedAt:new Date(now-3600000*(i+1)).toISOString(),views:[1200,800][i],likes:[90,40][i],comments:[18,9][i],keywordComments:[12,8][i],dms:[4,2][i],utmClicks:[3,2][i],orders:i===0?0:null}}));
  const records=[...f.records,first,second,{id:'today_selection',kind:'product_selection',revision:1,updatedAt:now,data:{productId:second.id,selectionDay:'2026-11-13',batchId:'today_batch',candidateId:'second',rank:2,active:true,reason:'Fixture'}},...measurements];
  return {...f,records,first,second,measurements};
}
