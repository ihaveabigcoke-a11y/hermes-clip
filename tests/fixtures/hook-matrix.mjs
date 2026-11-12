export function hookFixture({newProduction,applyProduction,getRenderPlan,emptyProduct}) {
 let p=newProduction('Ma trận thử','matrix_product',1),n=0;const apply=(action,input)=>p=applyProduction(p,action,input,'mx_'+(++n),1000+n);
 const assets=[];
 for(const [i,sid] of ['hook1','hook2','hook3','body'].entries()){
  apply('scene',{id:sid,name:sid,role:sid==='body'?'body':'hook',prompt:'A neutral product on a table.',duration:3,ratio:'9:16'});apply('storyboard',{sceneId:sid});
  const asset={id:'asset_'+sid,kind:'asset',data:{name:sid+'.mp4',type:'video/mp4',key:'local-owner/'+sid+'.mp4',size:100,sha256:String(i+1).repeat(64),metadata:{width:720,height:1280,duration:3,verifiedBy:'container'}},revision:1,updatedAt:1};assets.push(asset);
  apply('attach',{sceneId:sid,attemptId:null,take:{assetId:asset.id,...asset.data}});apply('review',{sceneId:sid,takeId:p.scenes.at(-1).takes[0].id,review:'approved',notes:'Synthetic fixture'});
 }
 const pin=sid=>({sceneId:sid,takeId:p.scenes.find(s=>s.id===sid).takes[0].id});apply('body',{name:'Thân chung',items:[pin('body')]});apply('variant',{name:'Hook',bodyId:p.bodies[0].id,hook:pin('hook1'),cta:null,locale:'en-US',caption:'Comment PAWS for details.',ctaKeyword:'PAWS',ctaText:'Comment PAWS',ctaPlacement:'caption'});
 const plan=getRenderPlan(p,'matrix_project',p.variants[0].id);apply('render_plan',plan);apply('hook_variants',{productionId:'matrix_project',sourceVariantId:p.variants[0].id,hooks:['hook1','hook2','hook3'].map(pin)});
 const group=p.variants.at(-1).comparisonGroupId;
 for(const [i,v] of p.variants.slice(-3).entries()){
  const asset={id:'render_'+i,kind:'asset',data:{name:'hook-'+i+'.mp4',key:'local-owner/render_'+i+'.mp4',type:'video/mp4',size:100,sha256:String(i+5).repeat(64),metadata:{width:720,height:1280,duration:6,verifiedBy:'container'}},revision:1,updatedAt:1};assets.push(asset);
  apply('export',{kind:'render',filename:asset.data.name,assetId:asset.id,variantId:v.id,verified:true,sha256:asset.data.sha256,renderPlan:getRenderPlan(p,'matrix_project',v.id)});
 }
 const records=[{id:'matrix_product',kind:'product',data:{...emptyProduct,name:'Sản phẩm thử',price:34,currency:'USD'},revision:1,updatedAt:1},{id:'matrix_project',kind:'production',data:p,revision:1,updatedAt:1},...assets,...[1,2,3].map(i=>({id:'account_'+i,kind:'social_account',data:{name:'Tài khoản '+i,productId:'matrix_product',handle:'test_'+i,archived:false},revision:1,updatedAt:1}))];
 return {records,input:{projectId:'matrix_project',revision:1,sourceGroupId:group,batchId:'matrix_batch',accountIds:['account_1','account_2','account_3'],landingBaseUrl:'https://example.invalid/tag'}};
}
