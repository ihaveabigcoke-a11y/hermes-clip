import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {Store} from '../desktop/src/store.mjs';
import {Worker} from '../desktop/src/worker.mjs';
import {safeMessage} from '../desktop/src/contracts.mjs';

const root=resolve('outputs/M-20261114-toggle-fixture');await mkdir(root,{recursive:true});
const store=new Store(':memory:');
let browserCalls=0,toggleCalls=0,refuseNext=false;
const worker=new Worker(store,root,{launchPersistentContext:async()=>{browserCalls++;throw Error('No browser is allowed for the fixture');}},{});
store.set('muse_paused',true);worker.night.begin();
const job=store.enqueue({projectId:'fixture_project',productId:'fixture_product',sceneId:'fixture_scene',sceneRevision:1,references:[],name:'Cảnh kiểm',mediaType:'video',duration:8,ratio:'9:16'},'fixture').job;
const original=structuredClone(store.job(job.id));
try{
await officeUI('M-20261114-toggle',[],async({page,origin,screenshot})=>{
 await page.exposeFunction('fixtureMuseStatus',()=>worker.status());
 await page.exposeFunction('fixtureMuseToggle',async payload=>{
  toggleCalls++;
  if(refuseNext){refuseNext=false;worker.night.outcome('fixture_refusal',{code:'MUSE_REFUSED'});}
  try{return {ok:true,value:await worker.setMusePaused(payload)};}catch(error){return {ok:false,error:safeMessage(error)};}
 });
 await page.addInitScript(()=>{Object.assign(window.productLabDesktop,{status:()=>window.fixtureMuseStatus(),setMusePaused:async payload=>{const result=await window.fixtureMuseToggle(payload);if(!result.ok)throw Error(result.error);return result.value;}});});
 await page.goto(origin+'/?view=accounts');
 const card=page.getByRole('region',{name:'Công tắc Muse'}),control=card.getByRole('switch');
 await control.waitFor();await page.waitForFunction(()=>!document.querySelector('.muse-switch-card [role=switch]').disabled);
 assert.equal(await control.isChecked(),false);
 await control.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/Các lượt cũ không tự chạy lại/);
 assert.doesNotMatch(await dialog.innerText(),/tài khoản có thể bị khoá/);
 async function capture(state){
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(500);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await screenshot(state+'-'+width);
  }
 }
 await capture('confirm');
 await dialog.getByRole('button',{name:'Bật Muse',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(await control.isChecked(),true);assert.equal(toggleCalls,1);assert.equal(store.get('muse_paused'),false);assert.deepEqual(store.job(job.id),original);assert.equal(browserCalls,0);assert.equal(worker.approvedIds.length,0);
 await control.click();await page.waitForFunction(()=>document.querySelector('.muse-switch-card [role=switch]').getAttribute('aria-checked')==='false');
 assert.equal(toggleCalls,2);assert.equal(store.get('muse_paused'),true);
 // Simulate a stop arriving after confirmation opens, as a running job ends.
 await control.click();await dialog.waitFor();refuseNext=true;
 await dialog.getByRole('button',{name:'Bật Muse',exact:true}).click();await dialog.getByRole('alert').waitFor();
 assert.match(await dialog.getByRole('alert').innerText(),/từ chối, giới hạn/);
 assert.doesNotMatch(await dialog.getByRole('alert').innerText(),/Tác vụ dừng\./);
 assert.equal(await dialog.getByRole('button',{name:'Bật Muse',exact:true}).isDisabled(),true);
 assert.equal(await card.getByRole('alert').count(),0,'Error belongs inside the open modal');
 await capture('blocked-in-modal');
 await dialog.getByRole('button',{name:'Giữ Tạm dừng'}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(await control.isDisabled(),true);assert.equal(await control.isChecked(),false);
 assert.match(await card.innerText(),/Muse từ chối\/giới hạn/);
 assert.equal(await card.getByRole('link',{name:'Xem lượt cần đối soát'}).getAttribute('href'),'?view=queue');
 await capture('stopped');
 assert.deepEqual(store.job(job.id),original);assert.equal(toggleCalls,3);assert.equal(browserCalls,0);assert.equal(worker.night.status().submitted,0);assert.equal(worker.active.size,0);assert.equal(worker.paused,true);
 return {normalToggle:true,noAutoDispatch:true,lateStopErrorInsideModal:true,stoppedCannotEnable:true,receiptPreserved:true,toggleCalls,browserCalls,submitted:0};
});
}finally{store.close();}
