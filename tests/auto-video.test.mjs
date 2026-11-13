import test from 'node:test';
import assert from 'node:assert/strict';
import {runVideoFlow} from '../lib/lab/auto-video.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {emptyProduct} from '../lib/lab/domain.ts';

test('T-026f: explicit refusal routes to manual and preserves receipt; unknown submission requires reconciliation',async()=>{
 for(const failureCode of ['MUSE_REFUSED',null]){
  const product={id:'p',kind:'product',revision:1,createdAt:1,updatedAt:1,data:{...emptyProduct,name:'Fixture',ctaKeyword:'GLOW'}};
  let project,paused=false;const commands=[],packs=[],job={id:'job_1',request:{projectId:'auto_test',sceneId:'auto_0'},state:'needs_attention',failureCode};
  const request=async(path,body)=>{
   if(!body)return {records:[product,...(project?[project]:[])]};
   commands.push(body);const data=body.action==='create'?newProduction(body.input.name,product.id,product.revision):applyProduction(project.data,body.action,body.input,body.commandId,123);
   project={id:body.id,kind:'production',revision:(project?.revision??0)+1,createdAt:1,updatedAt:123,data};return {record:project};
  };
  const result=await runVideoFlow({productId:'p',projectId:'auto_test',request,upload:()=>assert.fail('No upload on refusal'),bridge:{status:async()=>({musePaused:paused,generationReady:true,jobs:paused?[job]:[]}),musePackagePreview:async()=>({count:5,blocked:0,night:{remaining:12,stopped:false}}),musePackageStart:async()=>{paused=true;throw Error('Fake provider stop');},museNightStatus:async()=>({stopped:true}),manualMediaExport:async p=>packs.push(p)},wait:async()=>{}});
  assert.equal(result.state,'manual');assert.equal(packs.length,1);
  assert.equal(packs[0].sceneIds.length,failureCode?5:4);
  assert.equal(commands.filter(c=>c.action==='skip_reconciliation').length,failureCode?1:0);
  assert.equal(project.data.scenes[0].mediaProvider,failureCode?'manual':undefined);
  assert.equal(job.state,'needs_attention');assert.equal(job.id,'job_1');
 }
});
