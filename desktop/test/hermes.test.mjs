import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMuseQuota,readMuseQuota} from '../src/muse-quota.mjs';
import {TouchVpn,unpackVerifiedCrx} from '../src/touch-vpn.mjs';
import {profileInput} from '../src/shared.mjs';

test('Muse quota is read as remaining weekly capacity and additional tokens',()=>{
 const quota=parseMuseQuota('Settings\nGeneral\nUsage\nFree plan\nWeekly limit resets on Nov 15\n13% used\nAdditional tokens\nNever expires\n0% used (1B tokens left)\nUpgrade',100);
 assert.equal(quota.weeklyRemainingPercent,87);
 assert.equal(quota.additionalTokens,1000000000);
 assert.equal(quota.resetLabel,'Nov 15');
 assert.equal(quota.checkedAt,100);
 assert.equal(quota.plan,'Free plan');
});
test('missing or invalid quota stays unavailable and exhausted is zero',()=>{
 assert.equal(parseMuseQuota('Assistant says 50% used').state,'unavailable');
 assert.equal(parseMuseQuota('Usage\nFree plan\n101% used').state,'unavailable');
 assert.equal(parseMuseQuota('Usage\nFree plan\n100% used').weeklyRemainingPercent,0);
 assert.equal(parseMuseQuota('Usage\nFree plan\n0% used').weeklyRemainingPercent,100);
});
test('quota reader waits for the loaded percentage after the Usage heading',async()=>{
 const waits=[];
 const dialog={getByText:selector=>({waitFor:async()=>waits.push(String(selector))}),innerText:async()=> 'Settings\nUsage\nFree plan\n16% used'};
 const page={getByRole:role=>role==='dialog'?dialog:{click:async()=>{}},getByText:()=>({click:async()=>{}})};
 const quota=await readMuseQuota(page,{session:async()=>true});
 assert.equal(quota.weeklyRemainingPercent,84);
 assert.equal(waits.length,2);
 assert.match(waits[1],/used/);
});
test('additional tokens support compact units and absent balance',()=>{
 assert.equal(parseMuseQuota('Usage\nFree plan\n12.5% used\nAdditional tokens\n8% used (2.5M tokens left)').additionalTokens,2500000);
 assert.equal(parseMuseQuota('Usage\nFree plan\n12.5% used').additionalTokens,null);
});

test('zero weekly and additional quota is exhausted while unknown additional capacity stays unavailable', () => {
 const exhausted = parseMuseQuota('Usage\nFree plan\n100% used\nAdditional tokens\n0 tokens left');
 assert.equal(exhausted.state, 'exhausted');
 assert.equal(exhausted.additionalTokens, 0);
 assert.equal(parseMuseQuota('Usage\nFree plan\n100% used').state, 'unavailable');
 assert.equal(parseMuseQuota('Usage\nFree plan\n100% used\nAdditional tokens\n1K tokens left').state, 'available');
});
test('VPN profile preserves legacy configuration and rejects simultaneous custom proxy',()=>{
 const profile={name:'Profile',accountLabel:'',enabled:true,proxy:{server:''}};
 assert.equal(profileInput.parse(profile).vpnEnabled,false);
 assert.equal(profileInput.parse({...profile,vpnEnabled:true}).vpnEnabled,true);
 assert.equal(profileInput.safeParse({...profile,vpnEnabled:true,proxy:{server:'http://localhost:8080'}}).success,false);
});
test('VPN installer rejects unsigned data',()=>{
 assert.throws(()=>unpackVerifiedCrx(Buffer.from('not an extension')),/CRX3/);
});
test('VPN closes temporary popup and reports error if extension cannot start',async()=>{
 const vpn=new TouchVpn('/temporary');
 const context={serviceWorkers:()=>[],waitForEvent:async()=>{throw Error('Timeout');}};
 await assert.rejects(vpn.connect(context,{action:{default_popup:'panel/index.html'}}),error=>error.code==='MUSE_VPN_REQUIRED');
});
