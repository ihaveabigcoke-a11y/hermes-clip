// Synthetic records only. No account, media or service is accessed by this fixture.
export function instagramOverviewFixture() {
  const at=Date.parse('2026-11-12T01:00:00Z');
  const row=(id,kind,data)=>({id,kind,data,revision:1,updatedAt:at});
  const product=row('fixture_product','product',{name:'Fixture product'});
  const records=[product];
  for(let account=1;account<=3;account++){
    const accountId='account_'+account;
    records.push(row(accountId,'social_account',{productId:product.id,name:'Account '+account,handle:'fixture_'+account}));
    for(let content=1;content<=2;content++){
      const id=`plan_${account}_${content}`,assetId='asset_'+id;
      const postUrl=`https://www.instagram.com/reel/${id}/`;
      records.push(row(id,'content_plan',{productId:product.id,accountId,name:'Hook '+content,status:'published_manual',postUrl,productionId:'production_'+id,assetId}));
      records.push(row('production_'+id,'production',{productId:product.id,contentPlanId:id,
        variants:[{id:'variant_'+id,ctaKeyword:account===3?'LINK':'LED'}],exports:[{kind:'render',assetId,variantId:'variant_'+id}]}));
      const missing=account===3&&content===2;
      records.push(row('metric_'+id,'social_metric',{planId:id,accountId,sourceUrl:postUrl,observedAt:new Date(at).toISOString(),
        views:missing?null:100,likes:missing?null:10,comments:missing?null:2,saves:missing?null:1,shares:missing?null:0,
        profileVisits:missing?null:5,linkClicks:missing?null:0,follows:missing?null:0}));
    }
  }
  return {records,product,at};
}
