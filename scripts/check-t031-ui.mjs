// Source UI + isolated fixture workspace. No real account or external service.
import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
import {newProduction,applyProduction} from '../lib/lab/production.ts';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';

const description='A dog beside an adult in a fenced garden at dusk. Keep the collar visible.';
let production=applyProduction(newProduction('Fixture video','fixture_product',1),'scene',{id:'scene',name:'Scene 1',prompt:description,mediaType:'video'},'initial');
production.scenes[0].prompt=description; // Old project, not silently migrated.
const records=[{id:'fixture_product',kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Fixture collar'}},{id:'fixture_project',kind:'production',revision:1,updatedAt:1,data:production}];
await officeUI('T-031',records,async({page,origin,screenshot})=>{
 await page.goto(origin+'/?view=production&production=fixture_project&stage=scenes');
 await page.locator('#desk-prompt:visible').waitFor();
 const command=page.getByRole('note',{name:'Câu lệnh tạo video cố định'});
 assert.equal(await command.count(),1);assert.ok((await command.innerText()).includes(MUSE_VIDEO_COMMAND));
 assert.equal(await command.locator('input,textarea,[contenteditable=true]').count(),0);
 await page.locator('#desk-prompt:visible').fill(MUSE_VIDEO_COMMAND+'\n'+description+'\n'+MUSE_VIDEO_COMMAND);
 assert.equal(await page.locator('#desk-prompt:visible').inputValue(),description+'\n');
 await page.locator('#desk-prompt:visible').fill('');assert.ok(await command.isVisible());
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('composer-'+width);}
 await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 const fixed=dialog.getByRole('note',{name:'Câu lệnh tạo video cố định'});
 assert.equal(await fixed.locator('input,textarea,[contenteditable=true]').count(),0);
 assert.equal(await dialog.locator('#field-prompt').inputValue(),description);
 await dialog.locator('#field-prompt').fill(MUSE_VIDEO_COMMAND+'\n'+MUSE_VIDEO_COMMAND+'\n'+description);
 assert.equal(await dialog.locator('#field-prompt').inputValue(),description);
 await dialog.locator('#field-mediaType').selectOption('image');assert.equal(await fixed.count(),0);
 await dialog.locator('#field-mediaType').selectOption('video');assert.equal(await fixed.count(),1);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('edit-'+width);}
 await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const current=await page.evaluate(async()=> (await(await fetch('/api/lab')).json()).records.find(r=>r.id==='fixture_project'));
 assert.equal(current.data.scenes[0].prompt,MUSE_VIDEO_COMMAND+'\n'+description);
 assert.equal(current.data.scenes[0].takes.length,0);
 return {lockedPrefix:true,legacyEditor:true,duplicatePaste:true,imageUnchanged:true,savedPrefix:true};
});
