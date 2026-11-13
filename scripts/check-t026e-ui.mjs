import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
const {emptyProduct}=await importModule('lib/lab/domain.ts');
const p={id:'compact_product',kind:'product',revision:1,createdAt:Date.now(),updatedAt:Date.now(),data:{...emptyProduct,name:'Đèn kiểm thử',productKey:'DEN-THU',imageUrl:'https://fixture.invalid/lamp.svg',allowedClaims:'Giữ nguyên mô tả cũ',cost:4,shipping:2,price:24}};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#333c37"/><path d="M200 80h80l40 80H160zM240 160v70m-50 0h100" fill="#c8ef54" stroke="#c8ef54" stroke-width="12"/></svg>';
for(const empty of [false,true])await officeUI('T-026e'+(empty?'-empty':''),empty?[]:[p],async({page,origin,screenshot})=>{
 await page.route('https://fixture.invalid/lamp.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.goto(origin+'/?view=products');await page.locator('[data-screen=products]').waitFor();
 assert.equal(await page.locator('[data-screen=products]>details').getAttribute('open'),null);
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('products-'+(empty?'empty':'full')+'-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 if(!empty){assert.ok(await page.locator('[data-screen=products] img').first().evaluate(i=>i.complete&&i.naturalWidth>0));await page.locator('[data-screen=products] .compact-card-open').click();}else await page.locator('[data-screen=products]').getByRole('button',{name:'Thêm sản phẩm'}).click();
 const dialog=page.getByRole('dialog');assert.equal(await dialog.locator('.compact-six-fields>label,.compact-six-fields>fieldset').count(),6);
 await dialog.getByLabel('Nguồn hàng',{exact:true}).fill('Tên: Đèn mới\nẢnh: https://fixture.invalid/lamp.svg\nGiá vốn: 8 USD');await dialog.getByRole('button',{name:'Điền từ nguồn'}).click();
 await dialog.getByLabel('Link mua',{exact:true}).fill('https://shop.invalid/lamp');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const records=await page.evaluate(async()=> (await (await fetch('/api/lab')).json()).records);const saved=records.find(r=>r.kind==='product');assert.equal(saved.data.name,'Đèn mới');assert.equal(saved.data.cost,8);assert.equal(saved.data.purchaseUrl,'https://shop.invalid/lamp');assert.ok(saved.data.productKey);if(!empty)assert.equal(saved.data.allowedClaims,p.data.allowedClaims);else assert.equal(saved.data.shipping,null);
 return {empty,sixFields:true,saved:true,originalFieldsPreserved:!empty};
});
