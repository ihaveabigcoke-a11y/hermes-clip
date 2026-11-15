import test from 'node:test';
import assert from 'node:assert/strict';
import {museHealth,museExpiredMessage} from '../lib/lab/muse-health.ts';
const now=1_700_000_000_000,H=3600_000;
const prof=(name,o={})=>({id:name,name,enabled:true,session:'signed_in',health:'ready',...o});
test('T-054: counts and expired profile name',()=>{
 const h=museHealth({active:2,profiles:[prof('A'),prof('B',{session:'login_required',health:'login_required'}),prof('C',{enabled:false})],jobs:[{state:'failed',createdAt:now-H,history:[{at:now-H}]},{state:'failed',createdAt:now-30*H,history:[{at:now-30*H}]},{state:'queued',createdAt:now}]},now);
 assert.deepEqual([h.total,h.enabled,h.goodSession,h.running,h.errors24h],[3,2,1,2,1]);
 assert.deepEqual(h.expired,['B']);
 assert.equal(museExpiredMessage('B'),'Hồ sơ B hết phiên đăng nhập');
});
test('T-054: unknown stays null, not 0',()=>{
 const h=museHealth(null,now);
 assert.deepEqual([h.enabled,h.goodSession,h.running,h.errors24h],[null,null,null,null]);
 assert.equal(museHealth({profiles:[prof('A')]},now).errors24h,null);
});
