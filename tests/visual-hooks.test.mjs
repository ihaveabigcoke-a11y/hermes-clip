import test from 'node:test';
import assert from 'node:assert/strict';
import {visualHookDrafts} from '../lib/lab/visual-hooks.ts';
import {newProduction,sceneInputSchema} from '../lib/lab/production.ts';
test('three visual hypotheses create only unapproved scene drafts, with no invented product claims',()=>{
 const p=newProduction('Test project','product',1,'en-US');
 const rows=visualHookDrafts({name:'Running vest'},p,{problemVisual:'Phone bounces visibly in a running pocket.',productAction:'Place phone into the zipped front pocket.',payoffVisual:'Same runner continues with the phone in the vest.'});
 assert.equal(rows.length,3);for(const v of rows){assert.equal(sceneInputSchema.safeParse(v.scene).success,true);assert.equal(v.scene.duration,3);assert.equal(v.scene.role,'hook');assert.match(v.scene.prompt,/none verified/);assert.equal(v.scene.storyboardApproved,undefined);assert.equal(v.scene.attempts,undefined);assert.equal(v.scene.voice.includes('muted'),true);}
 assert.deepEqual(p.scenes,[]);
});
