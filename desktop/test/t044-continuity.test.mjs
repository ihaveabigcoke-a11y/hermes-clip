import test from 'node:test';
import assert from 'node:assert/strict';
import {hookEndFrameLine,bundlePrompt} from '../src/muse-bundle.mjs';
import {MUSE_VIDEO_COMMAND,museMediaPrompt} from '../src/muse-video-prompt.mjs';
import {MusePackage} from '../src/muse-package.mjs';
import {Store} from '../src/store.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {renderFixture} from '../../tests/fixtures/render-plan.mjs';
import {sceneGate} from '../../lib/lab/production.ts';

test('T-044: end-frame snapshot targets the edit cut, preserves the approved scene, and excludes non-video hooks',()=>{
  const hook={id:'h',role:'hook',mediaType:'video',duration:8,fromSec:0,toSec:4,prompt:MUSE_VIDEO_COMMAND+'\nApproved hook.\nKeep this line.'};
  const body={id:'b',role:'body',mediaType:'video',storyboardApproved:true,prompt:MUSE_VIDEO_COMMAND+'\nHands open the box.\nClose-up on a wooden desk.'};
  const project={scenes:[hook,body]},before=structuredClone(project);
  const expected='End-frame continuity: At 4 seconds, match the opening frame of the body shot described as "Hands open the box. Close-up on a wooden desk.", with the same subject placement, camera framing, lighting and background; hold this composition until the hook ends for a seamless cut.';
  assert.equal(hookEndFrameLine(hook,project),expected);
  const prompt=museMediaPrompt(hook.prompt+'\n'+hookEndFrameLine(hook,project),'video');
  assert.equal(prompt,MUSE_VIDEO_COMMAND+'\nApproved hook.\nKeep this line.\n'+expected);
  assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length-1,1);
  assert.equal(prompt.split('\n').filter(l=>l.startsWith('End-frame continuity:')).length,1);
  assert.deepEqual(project,before);
  for(const scene of [body,{...hook,role:'cta'},{...hook,mediaType:'image'}])assert.equal(hookEndFrameLine(scene,project),'');
  body.storyboardApproved=false;
  assert.doesNotMatch(hookEndFrameLine(hook,project),/Hands open/,'unapproved body content is not injected');
});

test('T-044: selected body and source cut override scene order and nominal duration',()=>{
  const hook={id:'h',role:'hook',mediaType:'video',duration:8};
  const project={scenes:[{id:'wrong',role:'body',storyboardApproved:true,mediaType:'video',prompt:'Wrong body.'},{id:'chosen',role:'body',storyboardApproved:true,mediaType:'video',prompt:'Selected body.'}],reuseBodyPlan:{segments:[{sceneId:'old-hook',inSec:1,outSec:5},{sceneId:'chosen',inSec:2,outSec:6}]}};
  const line=hookEndFrameLine(hook,project);
  assert.match(line,/At 4 seconds/);assert.match(line,/Selected body/);assert.match(line,/selected start \(2 seconds\)/);assert.doesNotMatch(line,/Wrong body/);
  project.renderPlans=[{variantId:'v',segments:[{sceneId:'h',inSec:1,outSec:5},{sceneId:'chosen',inSec:2,outSec:6}]}];
  project.variants=[{id:'v',hook:{sceneId:'h'}}];delete project.reuseBodyPlan;
  assert.match(hookEndFrameLine(hook,project),/At 5 seconds/,'an existing hook uses its actual source cut');
});

test('T-044: real package builder adds one line per hook in parallel and bundle prompts without changing routing',async()=>{
  const store=new Store(':memory:');
  try{
    const p=renderFixture().production;p.scenes.forEach(s=>s.takes=[]);
    const before=structuredClone(p),records=[{id:'render_project',kind:'production',revision:1,data:p},{id:p.productId,kind:'product',revision:1,data:{}}];
    const worker={store,night:new MuseNight(store),config:()=>({enabled:true}),approvedIds:[],enqueue:async r=>store.enqueue(r,r.sceneId),start:async()=>true};
    store.set('muse_paused',false);
    const service=new MusePackage({worker,manual:{records:async()=>records},domain:{sceneGate}});
    await service.start({projectId:'render_project',revision:1,mode:'separate'});
    const hooks=[];
    for(const job of store.jobs()){
      const scene=p.scenes.find(s=>s.id===job.request.sceneId),prompt=job.request.prompt;
      assert.ok(prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));
      assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length-1,1);
      assert.ok(prompt.includes(scene.prompt.replace(MUSE_VIDEO_COMMAND+'\n','')));
      assert.equal(prompt.split('\n').filter(l=>l.startsWith('End-frame continuity:')).length,scene.role==='hook'?1:0);
      assert.equal(job.bundleParentId,undefined);if(scene.role==='hook')hooks.push(job.request);
    }
    assert.equal(hooks.length,3);
    const bundled=bundlePrompt(hooks);
    assert.equal(bundled.split(MUSE_VIDEO_COMMAND).length-1,1);
    for(const block of bundled.split(/Scene \d+:\n/).slice(1))assert.equal(block.split('\n').filter(l=>l.startsWith('End-frame continuity:')).length,1);
    assert.deepEqual(p,before);assert.equal(store.get('muse_paused'),false);
  }finally{store.close();}
});
