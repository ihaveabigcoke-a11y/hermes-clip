import {newProduction,applyProduction} from '../../lib/lab/production.ts';
import {formulaStoryboard} from '../../lib/lab/formula-storyboard.ts';
import {viralFormulas} from '../../lib/lab/viral-formulas.ts';

// Synthetic records only; even the approved takes below are metadata fixtures.
export function formulaProduction({approved=false,pinned=false}={}) {
  let p=newProduction('Formula draft fixture','draft_product',1),sequence=0;
  const apply=(action,input)=>{p=applyProduction(p,action,input,'fixture_'+(++sequence),1000+sequence);};
  apply('formula_draft',formulaStoryboard({},p,viralFormulas[0],'LED'));
  if(approved){
    for(const scene of p.scenes){
      apply('storyboard',{sceneId:scene.id});
      apply('attach',{sceneId:scene.id,attemptId:null,take:{assetId:'asset_'+scene.id,name:'fixture.mp4',type:'video/mp4',size:100,sha256:'a'.repeat(64),metadata:{width:720,height:1280,duration:scene.duration,verifiedBy:'container'}}});
      apply('review',{sceneId:scene.id,takeId:p.scenes.find(s=>s.id===scene.id).takes[0].id,review:'approved',notes:'Synthetic fixture'});
    }
  }
  if(pinned)apply('pin_formula',{bodyId:p.bodies[0].id,items:p.scenes.map(scene=>({sceneId:scene.id,takeId:scene.takes[0].id}))});
  return p;
}

export function formulaRecords(p=formulaProduction()) {
  return [{id:'draft_product',kind:'product',revision:1,updatedAt:1000,data:{name:'Draft product'}},
    {id:'draft_project',kind:'production',revision:1,updatedAt:1000,data:p}];
}
