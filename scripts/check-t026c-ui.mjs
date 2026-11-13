import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {officeFixture} from '../tests/fixtures/office-view.mjs';
const {emptyProduct,schemas}=await importModule('lib/lab/domain.ts'),{newProduction}=await importModule('lib/lab/production.ts');
const f=officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction},Date.now());
for(const p of f.records.filter(r=>r.kind==='product'))p.data.imageUrl='/fixture-product.svg';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#353b31"/><circle cx="240" cy="150" r="86" fill="none" stroke="#d4ff3a" stroke-width="22"/><rect x="210" y="110" width="60" height="80" rx="12" fill="#66784e"/></svg>';
for(const empty of [false,true])await officeUI('T-026c'+(empty?'-empty':''),empty?[]:f.records,async({page,origin,screenshot})=>{
 await page.route('**/fixture-product.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.goto(origin+'/?view=overview');await page.locator('[data-screen=today]').waitFor();
 if(!empty){
  assert.equal(await page.locator('[data-today-product]').count(),4);assert.equal(await page.locator('.compact-progress li').count(),20);
  await page.getByRole('button',{name:'Đưa Đèn đọc sách xuống',exact:true}).click();
  assert.equal(await page.locator('[data-today-product]').first().getAttribute('data-today-product'),'product_2');
  await page.reload();await page.locator('[data-screen=today]').waitFor();assert.equal(await page.locator('[data-today-product]').first().getAttribute('data-today-product'),'product_2');
  assert.ok(await page.locator('[data-screen=today] img').first().evaluate(i=>i.complete&&i.naturalWidth>0));
 }else assert.equal(await page.locator('[data-today-product]').count(),0);
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('today-'+(empty?'empty':'full')+'-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 if(!empty){await page.locator('[data-today-product]').first().getByRole('button',{name:'Làm tiếp',exact:false}).click();assert.equal(new URL(page.url()).searchParams.get('product'),'product_2');assert.equal(new URL(page.url()).searchParams.get('view'),'production');}
 return {empty,orderPersisted:!empty,selected:empty?0:3,earlier:empty?0:1};
});
