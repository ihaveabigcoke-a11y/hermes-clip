// Synthetic artwork and isolated local workspace only. All external requests blocked.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
import {newProduction} from '../lib/lab/production.ts';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
const now=Date.now(),product={id:'fixture_product',kind:'product',revision:1,createdAt:now,updatedAt:now,data:{...emptyProduct,name:'Cốc giữ nhiệt minh hoạ',productKey:'COC-THU'}};
const production={id:'fixture_project',kind:'production',revision:1,createdAt:now,updatedAt:now,data:newProduction('Nhân vật kiểm thử',product.id,1,'en-US')};
await officeUI('T-045',[product,production],async({page,origin,screenshot,out,local})=>{
  page.setDefaultTimeout(12000);
  await page.goto(origin+'/?view=characters');await page.getByRole('heading',{name:'Nhân vật',exact:true,level:2}).waitFor();
  assert.ok(await page.getByRole('link',{name:'Nhân vật',exact:true}).count());
  await screenshot('characters-empty-1366');
  const pictures=await page.evaluate(()=>['mascot','product','alternate'].map((kind,i)=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const c=canvas.getContext('2d');
    c.fillStyle=['#e7edcf','#cfdedc','#e6d8c5'][i];c.fillRect(0,0,640,480);
    c.fillStyle='#23322c';c.beginPath();c.ellipse(320,409,128,17,0,0,Math.PI*2);c.fill();
    if(kind==='product'){c.fillStyle='#485e54';c.fillRect(249,145,142,245);c.fillStyle='#243b30';c.fillRect(242,125,156,30);c.fillStyle='#e3ebbf';c.fillRect(265,185,110,105);c.fillStyle='#385643';c.font='bold 26px sans-serif';c.textAlign='center';c.fillText('HERMES',320,244);}
    else{c.fillStyle='#f2b84e';c.beginPath();c.ellipse(320,311,96,98,0,0,Math.PI*2);c.fill();for(const x of [242,398]){c.beginPath();c.arc(x,150,42,0,Math.PI*2);c.fill();}c.beginPath();c.ellipse(320,214,113,105,0,0,Math.PI*2);c.fill();c.fillStyle='#f7dfaf';c.beginPath();c.ellipse(320,253,59,39,0,0,Math.PI*2);c.fill();c.fillStyle='#332c23';for(const x of [278,362]){c.beginPath();c.arc(x,210,9,0,Math.PI*2);c.fill();}c.beginPath();c.ellipse(320,243,15,10,0,0,Math.PI*2);c.fill();c.strokeStyle='#332c23';c.lineWidth=5;c.beginPath();c.arc(320,256,18,0,Math.PI);c.stroke();}
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  const images=pictures.map((base64,i)=>({name:'fixture-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')}));
  async function create(name,kind,files){await page.getByRole('button',{name:'Thêm nhân vật',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Tên',{exact:true}).fill(name);await dialog.getByLabel('Loại',{exact:true}).selectOption(kind);assert.match(await dialog.innerText(),/Không dùng ảnh người thật/);assert.doesNotMatch(await dialog.innerText(),/Người mẫu/);await dialog.getByLabel('Thêm ảnh nhân vật').setInputFiles(files);await page.waitForFunction(n=>document.querySelectorAll('.character-edit-images img').length===n,files.length);await dialog.getByRole('button',{name:'Lưu nhân vật',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('heading',{name:'@'+name,exact:true}).waitFor();}
  await create('Bông','mascot',[images[0],images[2]]);await create('Cốc','product',[images[1]]);
  // Duplicate names are rejected and the draft remains available.
  await page.getByRole('button',{name:'Sửa Cốc',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Tên',{exact:true}).fill('bông');await dialog.getByRole('button',{name:'Lưu nhân vật',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'đã tồn tại'}).waitFor();await dialog.getByLabel('Tên',{exact:true}).fill('Cốc');await dialog.getByLabel('Ghi chú (tuỳ chọn)').fill('Mẫu sản phẩm dùng để kiểm giao diện.');await dialog.getByRole('button',{name:'Lưu nhân vật',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('heading',{name:'@Bông',exact:true}).waitFor();assert.equal(await page.locator('.character-card').count(),2);
  for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('.character-cover img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));assert.equal(await page.locator('.character-cover img').evaluateAll(images=>images.every(image=>image.naturalWidth===640)),true);await screenshot('characters-'+width);}
  await page.getByRole('button',{name:'Sửa Bông',exact:true}).click();for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await screenshot('characters-edit-'+width);}await page.getByRole('dialog').getByRole('button',{name:'Huỷ',exact:true}).click();
  await page.getByRole('button',{name:'Xoá Cốc',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Huỷ',exact:true}).click();assert.equal(await page.locator('.character-card').count(),2);
  await page.getByRole('button',{name:'Xoá Cốc',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Xoá nhân vật',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.character-card').length===1);
  await page.goto(origin+'/?view=production&stage=scenes&production=fixture_project');await page.locator('#desk-prompt:visible').waitFor();const toggle=page.getByRole('checkbox',{name:'Giữ nguyên nhân vật',exact:true});assert.equal(await toggle.isChecked(),false);await page.locator('#desk-prompt:visible').fill('@Bông turns on a table.');await page.locator('.character-chips img').waitFor();await toggle.check();assert.match(await page.locator('.character-chips').innerText(),/2 ảnh/);
  await page.locator('#desk-prompt:visible').fill('@Không_có turns.');await page.locator('.character-prompt [role="alert"]').filter({hasText:'Không tìm thấy'}).waitFor();await page.locator('#desk-prompt:visible').fill('@Bông turns on a table.');
  await page.setViewportSize({width:1366,height:1080});await page.locator('.character-prompt:visible').scrollIntoViewIfNeeded();await screenshot('video-character-chip-1366');
  await page.getByRole('button',{name:'Lưu cảnh nháp',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#desk-prompt')?.value==='');
  const saved=await page.evaluate(async()=>await(await fetch('/api/lab')).json());const scene=saved.records.find(r=>r.id==='fixture_project').data.scenes[0];assert.equal(scene.keepCharacter,true);assert.ok(scene.prompt.startsWith(MUSE_VIDEO_COMMAND));assert.equal(scene.prompt.split(MUSE_VIDEO_COMMAND).length-1,1);
  const before=await page.evaluate(async()=>await(await fetch('/api/characters')).json());await writeFile(join(out,'fixture-library.json'),JSON.stringify(before,null,2));
  return {crud:true,reload:true,duplicateRejected:true,deleteConfirmed:true,defaultOff:true,unicodeChip:true,unknownWarning:true,savedSceneOptIn:true,realMuse:false,workspaceFixture:local.root};
});
