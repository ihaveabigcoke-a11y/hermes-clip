import {emptyProduct} from '../../lib/lab/domain.ts';
import {formulaProduction} from './formula-production.mjs';

// Synthetic fixture shaped after the read-only 2026-11-11/workspace-records.json:
// product -> production + social_account -> content_plan -> social_metric.
// No real account, receipt, image, video or supplier data is copied.
export const nextRecord = (kind, id, data, updatedAt=1000) => ({kind,id,data,revision:1,updatedAt});
export function nextStepFixture() {
  const product=nextRecord('product','next_product',{
    ...emptyProduct,name:'Next step fixture',cost:4,shipping:2,currency:'USD',
    sampleCheck:{receivedAt:'2026-11-12',matchesVideo:true,notes:'Synthetic check'},
  });
  const p=formulaProduction({approved:true,pinned:true});
  p.productId=product.id;
  const production=nextRecord('production','next_production',p);
  const account=nextRecord('social_account','next_account',{productId:product.id,name:'Fixture account',handle:'fixture_only',archived:false});
  const plan=nextRecord('content_plan','next_plan',{name:'Fixture plan',productId:product.id,productionId:production.id,accountId:account.id,status:'published_browser',postUrl:'https://www.instagram.com/reel/fixture_only/'});
  return {product,production,account,plan,records:[product,production,account,plan]};
}
