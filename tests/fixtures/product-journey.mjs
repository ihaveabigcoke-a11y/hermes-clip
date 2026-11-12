import {hookFixture} from './hook-matrix.mjs';
export function journeyFixture(domain,step=10){
 const f=hookFixture(domain),product=f.records.find(r=>r.kind==='product'),project=f.records.find(r=>r.kind==='production'),p=project.data;
 Object.assign(product.data,{productKey:'TEST-PRODUCT',brandName:'PAW',boxText:'Paw light',ctaKeyword:'PAWS',situation:'A dark path',cost:5.2,shipping:2.6});
 f.records.push({id:'journey_selection',kind:'product_selection',revision:1,updatedAt:1,data:{productId:product.id,selectionDay:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()),batchId:'journey_batch',candidateId:'candidate',rank:1,active:true,reason:'Fixture'}});
 const plans=domain.planHookDrafts(f.records,f.input);
 for(const plan of plans){plan.data.status='published_manual';plan.data.postUrl='https://instagram.com/p/'+plan.id;}
 const metrics=plans.map((plan,i)=>({id:'journey_metric_'+i,kind:'social_metric',revision:1,updatedAt:1,data:{planId:plan.id,observedAt:'2026-11-13T00:00:00Z',source:'manual',sourceUrl:plan.data.postUrl,views:100,keywordComments:null,utmClicks:null,orders:null}}));
 const manual={scenes:p.scenes.map(s=>({projectId:project.id,sceneId:s.id,state:'Chờ file'}))};
 if(step===1)product.data.productKey=null;
 if(step===2)product.data.boxText=null;
 if(step<=4){p.scenes.forEach(s=>s.takes=[]);p.renderPlans=[];p.exports=[];p.bodies=[];p.variants=[];}
 if(step===3)manual.scenes=[];
 if(step===5){p.renderPlans=[];p.exports=[];}
 if(step===6)p.exports=[];
 if(step===8)plans.forEach(plan=>{plan.data.status='draft';plan.data.postUrl='';});
 if(step>=8)f.records.push(...plans);
 if(step===10)f.records.push(...metrics);
 return {...f,product,project,plans,metrics,manual};
}
