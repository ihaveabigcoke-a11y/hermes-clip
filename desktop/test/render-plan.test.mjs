import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlanAss} from '../src/render-plan.mjs';
import {composeInput} from '../src/integrations.mjs';
test('T-012 ASS times/style and injection rejected',()=>{
 const ass=renderPlanAss([{text:'Comment GLOW',fromSec:1.25,toSec:3.5}]);
 assert.match(ass,/Arial,70/);assert.match(ass,/0:00:01.25,0:00:03.50/);assert.match(ass,/Comment GLOW/);
 for(const text of ['{\\pos(0,0)}attack','bad\\Nescape','bad\rline'])assert.throws(()=>renderPlanAss([{text,fromSec:0,toSec:1}]));
});
test('T-012 desktop rejects bad cuts, overlay outside timeline, nonfinite inputs',()=>{
 const raw={projectId:'p',variantId:'v',ratio:'9:16',planVersion:1,clips:[{bytes:new Uint8Array([1]),sha256:'a'.repeat(64),duration:3,inSec:.5,outSec:2}]};
 assert.equal(composeInput.parse(raw).clips[0].inSec,.5);
 for(const clip of [{inSec:2,outSec:1},{outSec:4},{inSec:NaN},{duration:Infinity}])assert.throws(()=>composeInput.parse({...raw,clips:[{...raw.clips[0],...clip}]}));
 assert.throws(()=>composeInput.parse({...raw,overlays:[{text:'x',fromSec:0,toSec:2}]}));
});
