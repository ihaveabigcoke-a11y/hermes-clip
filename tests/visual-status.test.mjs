import test from 'node:test';
import assert from 'node:assert/strict';
import {visualStatus,visualState,visualStatusVariables} from '../lib/lab/visual-status.ts';
test('T-025: semantic status colors are shared and unknown stays neutral',()=>{
 assert.deepEqual(Object.keys(visualStatus),['active','waiting','error','empty']);
 assert.deepEqual(Object.values(visualStatus).map(s=>s.color),['#d4ff3a','#f6cc84','#ff9292','#b4b5c0']);
 for(const state of ['success','ready','approved','published','measured'])assert.equal(visualState(state),'active');
 for(const state of ['paused','queued','refused','needs_attention','draft'])assert.equal(visualState(state),'waiting');
 for(const state of ['failed','error','rejected'])assert.equal(visualState(state),'error');
 for(const state of [null,undefined,'unconfigured','not-a-known-state'])assert.equal(visualState(state),'empty');
 for(const [state,style] of Object.entries(visualStatus)){assert.equal(visualStatusVariables['--status-'+state],style.color);assert.equal(visualStatusVariables['--status-'+state+'-bg'],style.background);}
});
