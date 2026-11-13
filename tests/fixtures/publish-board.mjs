import {emptyProduct} from '../../lib/lab/domain.ts';
import {renderFixture} from './render-plan.mjs';
export function publishFixture(now=Date.now()){
 const f=renderFixture();f.makeHooks();const product={id:'render_product',kind:'product',revision:1,createdAt:now,updatedAt:now,data:{...emptyProduct,name:'Đèn fixture',productKey:'DEN-THU',purchaseUrl:'https://shop.invalid/lamp',price:24,cost:4,shipping:2,ctaKeyword:'GLOW'}};
 const project={id:'render_project',kind:'production',revision:1,createdAt:now,updatedAt:now,data:f.production};
 const variants=project.data.variants.filter(v=>v.comparisonGroupId),assets=[];
 for(const [i,v] of variants.entries()){const plan=project.data.renderPlans.find(p=>p.variantId===v.id),assetId='export_'+i,sha256=String(i+6).repeat(64);project.data.exports.push({id:'export_record_'+i,variantId:v.id,filename:'fixture_'+i+'.mp4',assetId,createdAt:now,renderPlan:plan,sha256,verified:true,kind:'render'});assets.push({id:assetId,kind:'asset',revision:1,createdAt:now,updatedAt:now,data:{name:'fixture_'+i+'.mp4',key:'local-owner/'+assetId+'.mp4',type:'video/mp4',size:100,sha256,metadata:{width:720,height:1280,duration:4,verifiedBy:'container'}}});}
 const accounts=Array.from({length:5},(_,i)=>({id:'account_'+i,kind:'social_account',revision:1,createdAt:now,updatedAt:now,data:{name:'Kênh '+(i+1),handle:'fixture'+i,productId:product.id,contentAngle:'',bio:'',notes:'',archived:false}}));
 return {records:[product,project,...accounts,...assets],product,project,accounts,variants,input:{projectId:project.id,revision:1,sourceGroupId:variants[0].comparisonGroupId,batchId:'distribution_fixture',accountIds:accounts.map(a=>a.id),landingBaseUrl:product.data.purchaseUrl}};
}
