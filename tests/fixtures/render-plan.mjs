import {newProduction,applyProduction} from '../../lib/lab/production.ts';
import {getRenderPlan} from '../../lib/lab/render-plan.ts';
export function renderFixture(sources={}) {
 let p=newProduction('Một thân · ba hook','render_product',1),sequence=0;
 const apply=(action,input)=>p=applyProduction(p,action,input,'render_'+(++sequence),1000+sequence);
 for(const [i,id] of ['hook1','hook2','hook3','body1','body2'].entries()) {
  apply('scene',{id,name:id,prompt:'A product on a studio table. Camera stays still.',role:id.startsWith('hook')?'hook':'body',mediaType:'video',ratio:'9:16',duration:3,referenceIds:[]});
  apply('storyboard',{sceneId:id});
  apply('attach',{sceneId:id,attemptId:null,take:{assetId:'asset_'+id,name:id+'.mp4',type:'video/mp4',size:100,sha256:String(i+1).repeat(64),metadata:{width:720,height:1280,duration:3,verifiedBy:'container'},...sources[id]}});
  apply('review',{sceneId:id,takeId:p.scenes.at(-1).takes[0].id,review:'approved',notes:'Synthetic acceptance fixture'});
 }
 const pin=id=>({sceneId:id,takeId:p.scenes.find(s=>s.id===id).takes[0].id});
 apply('body',{name:'Thân chung',items:['body1','body2'].map(pin)});
 apply('variant',{name:'Bản gốc',bodyId:p.bodies[0].id,hook:pin('hook1'),cta:null,locale:'en-US',caption:'Comment GLOW for details.',ctaKeyword:'GLOW',ctaText:'Comment GLOW',ctaPlacement:'overlay'});
 const sourceVariantId=p.variants[0].id;
 const plan=getRenderPlan(p,'render_project',sourceVariantId);
 plan.segments=plan.segments.map((s,i)=>({...s,inSec:.3,outSec:i===0?1.3:1.8}));
 plan.overlays=[{text:'The result',fromSec:1,toSec:2,role:'label',style:'white-outline-top'},{text:'Comment GLOW',fromSec:2,toSec:4,role:'cta',style:'white-outline-top'}];
 apply('render_plan',plan);
 return {get production(){return p;},apply,plan,sourceVariantId,pin,makeHooks:()=>apply('hook_variants',{productionId:'render_project',sourceVariantId,hooks:['hook1','hook2','hook3'].map(pin)})};
}
