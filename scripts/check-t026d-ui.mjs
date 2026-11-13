import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
const {schemas}=await importModule('lib/lab/domain.ts');
const now=Date.now(),candidates=['Đèn đọc sách','Giá đỡ điện thoại','Hộp chia ngăn','Túi đeo chạy bộ'].map((name,i)=>({id:'candidate_'+i,name,supplierUrl:'https://supplier.invalid/item/'+i,imageUrl:'https://fixture.invalid/product.svg',evidenceNotes:'Fixture; không phải báo giá',cost:i===3?null:4,shipping:i===3?null:2,price:24,verdict:['try','hold','reject','hold'][i]}));
const batch={id:'compact_batch',kind:'research_batch',revision:1,createdAt:now,updatedAt:now,data:schemas.research_batch.parse({name:'Đợt kiểm gọn',candidates})};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#353b31"/><circle cx="240" cy="150" r="86" fill="none" stroke="#d4ff3a" stroke-width="22"/></svg>';
for(const empty of [false,true])await officeUI('T-026d'+(empty?'-empty':''),empty?[]:[batch],async({page,origin,screenshot})=>{
 await page.route('https://fixture.invalid/product.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 await page.goto(origin+'/?view=research');await page.locator('[data-screen=research]').waitFor();
 assert.equal(await page.locator('[data-candidate]').count(),empty?0:4);
 if(!empty){assert.match(await page.locator('[data-candidate=candidate_3] .compact-prices').innerText(),/—/);assert.ok(await page.locator('[data-candidate] img').first().evaluate(i=>i.complete&&i.naturalWidth>0));}
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('research-'+(empty?'empty':'full')+'-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 if(!empty){
  await page.getByRole('button',{name:'So sánh',exact:true}).click();await page.getByRole('dialog').waitFor();assert.ok(await page.getByRole('dialog').getByRole('region',{name:'Bảng 10 ứng viên'}).isVisible());await page.keyboard.press('Escape');
  await page.locator('[data-candidate=candidate_0]').getByRole('button',{name:'Chốt',exact:true}).click();await page.locator('[data-screen=today]').waitFor();
  const records=await page.evaluate(async()=> (await (await fetch('/api/lab')).json()).records);
  const product=records.find(r=>r.kind==='product'),selection=records.find(r=>r.kind==='product_selection');assert.equal(product.data.productKey,'DEN-DOC-SACH');assert.equal(selection.data.rank,1);assert.equal(selection.data.productId,product.id);
  assert.equal(await page.getByRole('dialog').count(),0);
 }
 return {empty,oneClickSelection:!empty,automaticIdentity:!empty};
});
