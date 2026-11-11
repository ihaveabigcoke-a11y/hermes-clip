import test from 'node:test';
import assert from 'node:assert/strict';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {workflowGuidance} from '../lib/lab/workflow-guidance.ts';
const scene=()=>applyProduction(newProduction('Test','product',1),'scene',{id:'scene_one',name:'Body',prompt:'Show product',role:'body',mediaType:'video',ratio:'9:16',duration:5,referenceIds:[]},'scene');
test('guidance prioritizes revision and unknown submits before spending or review',()=>{const p=scene();p.scenes[0].attempts.push({status:'unknown'});assert.equal(workflowGuidance(p,2).stage,'references');assert.equal(workflowGuidance(p,1).stage,'queue');assert.equal(workflowGuidance(p,1).unknown,1);});
test('draft, storyboard and missing media lead to distinct next actions',()=>{assert.equal(workflowGuidance(newProduction('Test','product',1),1).stage,'scenes');const p=scene();assert.match(workflowGuidance(p,1).title,/kịch bản/);p.scenes[0].storyboardApproved=true;assert.equal(workflowGuidance(p,1).stage,'desktop');});
test('a formally approved wrong-aspect take is never counted as valid',()=>{const p=scene(),s=p.scenes[0];s.storyboardApproved=true;s.takes.push({review:'approved',sceneRevision:1,type:'video/mp4',metadata:{width:832,height:1104,duration:5}});const g=workflowGuidance(p,1);assert.equal(g.approved,0);assert.equal(g.stage,'library');assert.equal(g.total,1);s.takes.push({...s.takes[0],review:'pending'});assert.match(workflowGuidance(p,1).title,/^1 cảnh/);});
