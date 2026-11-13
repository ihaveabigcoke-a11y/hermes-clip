import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {officeFixture} from '../tests/fixtures/office-view.mjs';
const {emptyProduct,schemas}=await importModule('lib/lab/domain.ts'),{newProduction}=await importModule('lib/lab/production.ts'),{buildOfficeView}=await importModule('lib/lab/office-view.ts');
const now=Date.now(),f=officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction},now);
for(const p of f.records.filter(r=>r.kind==='product'))p.data.imageUrl='/fixture-product.svg';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#353b31"/><circle cx="240" cy="150" r="86" fill="none" stroke="#d4ff3a" stroke-width="22"/><rect x="210" y="110" width="60" height="80" rx="12" fill="#66784e"/></svg>';
await officeUI('T-026b',f.records,async({page,origin,screenshot})=>{
 let empty=false,down=false;
 await page.route('**/fixture-product.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.route('**/api/assets/*',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.route('**/api/lab?view=office',r=>r.fulfill(down?{status:503}:{json:{view:buildOfficeView(empty?[]:f.records,empty?[]:f.jobs,{},[],now)}}));
 await page.goto(origin+'/?view=signals');await page.locator('[data-screen=signals]').waitFor();await page.waitForFunction(()=>document.querySelectorAll('[data-run-id]').length>0);
 const ids=await page.locator('[data-run-id]').evaluateAll(rows=>rows.map(r=>r.dataset.runId));assert.ok(ids.length>0);
 assert.equal(await page.locator('.compact-groups button').count(),6);
 const first=page.locator('[data-run-id]').first();await first.locator('.compact-card-open').click();await page.getByRole('dialog').waitFor();assert.ok(await page.getByRole('dialog').innerText());await page.keyboard.press('Escape');
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('signals-full-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.ok(await page.locator('[data-screen=signals] img').count()>0);assert.ok(await page.locator('[data-screen=signals] img').first().evaluate(i=>i.complete&&i.naturalWidth>0));
 down=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.getByText('Mất kết nối',{exact:true}).waitFor();assert.equal(await page.locator('[data-run-id]').count(),ids.length);
 down=false;empty=true;await page.getByRole('button',{name:'Làm mới',exact:true}).click();await page.getByText('Chưa có lượt',{exact:true}).waitFor();
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('signals-empty-'+width);}
 return {runs:ids.length,groups:6,disconnectPreserves:true};
});
