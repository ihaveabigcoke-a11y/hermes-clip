// UI only: isolated fixture records and fake IPC, never a provider call.
import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
const now=Date.now(),product={id:'product',kind:'product',revision:1,createdAt:now,updatedAt:now,data:{...emptyProduct,name:'Cốc kiểm thử',productKey:'COC-THU'}};
let data=newProduction('Dự án kiểm Video dài',product.id,1);
for(let i=0;i<3;i++){
  data=applyProduction(data,'scene',{id:'scene'+i,name:'Cảnh có sẵn '+(i+1),role:'hook',mediaType:'video',duration:8,ratio:'9:16',referenceIds:[],prompt:'A cup on a wooden table turns slowly in warm light. Show its round handle and unchanged plain ceramic surface while the camera moves closer. Keep the same room and natural ambient sound.'},'scene_command'+i);
  data=applyProduction(data,'storyboard',{sceneId:'scene'+i,approved:true},'approve'+i);
}
const production={id:'project',kind:'production',revision:1,createdAt:now,updatedAt:now,data};
await officeUI('T-046',[product,production],async({page,origin,screenshot,local})=>{
  await page.addInitScript(()=>{
    const runs=[];window.__longVideoCalls=[];
    window.productLabDesktop.longVideoStatus=async()=>runs;
    window.productLabDesktop.longVideoStart=async request=>{window.__longVideoCalls.push(request);const run={id:request.requestId,projectId:request.projectId,state:'running',count:3,completed:[],seams:[],output:null};runs.push(run);return run;};
    window.productLabDesktop.longVideoStop=async({id})=>{const r=runs.find(r=>r.id===id);r.state='stopped';r.reason='Kiểm thử dừng chuỗi, chưa gọi dịch vụ.';return r;};
  });
  await page.goto(origin+'/?view=production&product=product');await page.getByRole('heading',{name:'Video',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Tạo video dài/}).count(),0);
  await page.getByRole('button',{name:'Cài đặt dự án',exact:true}).click();
  const dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('checkbox',{name:'Video dài',exact:true}).isChecked(),false);
  await dialog.getByRole('checkbox',{name:'Video dài',exact:true}).check();await dialog.getByLabel('Số cảnh',{exact:true}).selectOption('3');
  for(let i=1;i<=3;i++)await dialog.getByRole('textbox',{name:'Cảnh '+i,exact:true}).fill(`Scene ${i}: a plain ceramic cup sits on a wooden table in a softly lit room. The camera moves slowly around its handle, preserving the same object, background and natural ambient sound.`);
  for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await screenshot('settings-manual-'+width);}
  await dialog.getByRole('button',{name:'Lưu cài đặt',exact:true}).click();await dialog.waitFor({state:'hidden'});
  let records=await page.evaluate(async()=>await(await fetch('/api/lab')).json());let saved=records.records.find(r=>r.id==='project');
  assert.deepEqual(saved.data.scenes,production.data.scenes);assert.equal(saved.data.longVideo.enabled,true);assert.equal(saved.data.longVideo.prompts.length,3);
  await page.reload();await page.getByRole('button',{name:'Tạo video dài · 3 lượt',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__longVideoCalls.length),0);
  await page.getByRole('button',{name:'Cài đặt dự án',exact:true}).click();await dialog.getByLabel('Cách nhập cảnh').selectOption('project');await dialog.getByLabel('Số cảnh',{exact:true}).selectOption('3');
  for(let i=1;i<=3;i++)await dialog.getByLabel('Chọn cảnh '+i,{exact:true}).selectOption('scene'+(i-1));
  for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await screenshot('settings-project-'+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await dialog.getByRole('button',{name:'Lưu cài đặt',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Tạo video dài · 3 lượt',exact:true}).click();await page.getByRole('button',{name:'Dừng chuỗi',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__longVideoCalls.length),1);assert.equal(await page.getByRole('button',{name:'Tạo video dài · 3 lượt',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Dừng chuỗi',exact:true}).click();await page.getByText('Kiểm thử dừng chuỗi, chưa gọi dịch vụ.').waitFor();
  for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await screenshot('stopped-'+width);}
  records=await page.evaluate(async()=>await(await fetch('/api/lab')).json());saved=records.records.find(r=>r.id==='project');assert.deepEqual(saved.data.scenes,production.data.scenes);assert.deepEqual(saved.data.longVideo.sceneIds,['scene0','scene1','scene2']);
  return {defaultOff:true,twoInputModes:true,persisted:true,originalScenesUnchanged:true,fakeIpcStartCount:1,realMuseSends:0,workspaceFixture:local.root};
});
