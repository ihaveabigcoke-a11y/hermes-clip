import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {officeUI} from './office-ui.mjs';
import {publishFixture} from '../tests/fixtures/publish-board.mjs';
const f=publishFixture();
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#354737"/><path d="M100 90h100l35 95H65zM150 185v120m-60 0h120" stroke="#d4ff3a" fill="#d4ff3a" stroke-width="14"/></svg>';
for(const empty of [false,true])await officeUI('T-026g'+(empty?'-empty':''),empty?[]:f.records,async({page,origin,screenshot})=>{
 await page.route('**/api/assets/*?thumbnail=1',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));await page.goto(origin+'/?view=social');await page.locator('[data-screen=publish]').waitFor();
 if(!empty){await page.getByRole('button',{name:'Chia đều',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-plan]').length===5);assert.equal(await page.locator('[data-account]').count(),5);assert.ok(await page.locator('[data-plan] img').first().evaluate(i=>i.complete&&i.naturalWidth>0));}
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('publish-'+(empty?'empty':'full')+'-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 if(!empty){await page.getByRole('button',{name:'Chia đều',exact:true}).click();await page.waitForTimeout(700);assert.equal(await page.locator('[data-plan]').count(),5);await page.locator('.compact-publish-tray article').nth(1).dragTo(page.locator('[data-account=account_0]'));await page.waitForFunction(()=>document.querySelectorAll('[data-plan]').length===6);
 const card=page.locator('[data-plan]').first();await card.locator('.compact-card-open').click();const d=page.getByRole('dialog');await d.getByLabel('URL bài đăng',{exact:true}).fill('https://www.instagram.com/reel/FIXTURE01/');await d.getByLabel('Đăng lúc · giờ Việt Nam').fill('2026-11-11T12:00');await d.getByRole('button',{name:'Lưu URL'}).click();await d.waitFor({state:'hidden'});const rows=await page.evaluate(async()=> (await(await fetch('/api/lab')).json()).records);const saved=rows.find(r=>r.kind==='content_plan'&&r.data.postUrl);assert.equal(saved.data.status,'published_manual');assert.equal(saved.data.postedAt,'2026-11-11T05:00:00.000Z');assert.match(saved.data.utmLink,/utm_content=/);assert.equal(new Set(rows.filter(r=>r.kind==='content_plan').map(r=>r.data.accountId+':'+r.data.variantId)).size,6);
 }
 return {empty,columns:empty?0:5,balanced:!empty,dragCreatesDraft:!empty,manualUrlSaved:!empty};
});
