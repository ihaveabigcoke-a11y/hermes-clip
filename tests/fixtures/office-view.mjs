export function officeFixture({emptyProduct,researchBatchSchema,newProduction},now=Date.parse('2026-11-13T09:00:00+07:00')) {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(now));
  const yesterday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(now-86400000));
  const names=['Đèn đọc sách','Giá đỡ điện thoại','Hộp chia ngăn','Túi đeo chạy bộ'];
  const records=[];
  for(let i=0;i<4;i++) {
    const id='product_'+(i+1),selectedDay=i===3?yesterday:day;
    records.push({id,kind:'product',revision:1,createdAt:now-86400000,updatedAt:now,data:{...emptyProduct,name:names[i],productKey:'SP-0'+(i+1)}});
    records.push({id:'selection_'+i,kind:'product_selection',revision:1,createdAt:now,updatedAt:now,data:{selectionDay:selectedDay,batchId:i===3?'yesterday':'today',candidateId:'candidate_'+i,productId:id,rank:i===3?1:i+1,reason:'Người dùng xếp',active:true}});
  }
  const batch=researchBatchSchema.parse({name:'Đợt nghiên cứu hôm nay',selectionDay:day,candidates:names.slice(0,3).map((name,i)=>({id:'candidate_'+i,name,supplierUrl:'https://supplier.invalid/item/'+i,evidenceNotes:"Fixture only; not a real supplier quote.",cost:null,shipping:null,price:null})),selectedIds:['candidate_0','candidate_1','candidate_2'],selectionLinks:names.slice(0,3).map((_,i)=>({candidateId:'candidate_'+i,productId:'product_'+(i+1)}))});
  records.push({id:'today',kind:'research_batch',revision:1,createdAt:now,updatedAt:now,data:batch});
  records.push({id:'production_1',kind:'production',revision:1,createdAt:now,updatedAt:now,data:newProduction('Đèn đọc sách · bản thử','product_1',1)});
  const jobs=['queued','validating','needs_attention','ready','unexpected_state','cancelled','failed','running'].map((state,i)=>({id:'run_'+i,state,provider:i===4?null:'muse',request:{projectId:'production_1',productId:'product_1',sceneId:'scene_'+i},createdAt:now-10000,updatedAt:now,uploadedAssetId:state==='ready'?'asset_verified':null,history:[{at:now-10000,state:'queued',note:'Local draft'},{at:now,state,note:'A raw diagnostic is deliberately not exposed'}]}));
  return {records,jobs,manual:{receipts:[],exports:{},codes:{scenes:{}}},integrations:[],now};
}
