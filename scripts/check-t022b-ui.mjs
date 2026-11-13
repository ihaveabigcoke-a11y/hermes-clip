import assert from 'node:assert/strict';import {officeUI} from './office-ui.mjs';import {importModule} from '../desktop/test/helpers/local-server.mjs';
const {emptyProduct}=await importModule('lib/lab/domain.ts');const records=[{id:'empty_product',kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Hồ sơ chưa có dữ liệu'}}];
await officeUI('T-022b',records,async({page,origin,screenshot})=>{
 page.setDefaultTimeout(12000);const checked=[];
 for(const [view,extra,expected] of [['products','&product=empty_product&product_tab=finance','Chưa biết'],['competitors','','Chưa có đề xuất từ các tham chiếu đã lưu.'],['results','&entry=manual','Chưa có bài đã đăng.'],['experiments','','Chưa có quyết định.'],['office','','Chưa có sản phẩm phù hợp'],['signals','','Không có lượt trong bộ lọc này'],['guide','','Một ngày với Hermes']]){
  await page.goto(origin+'/?view='+view+extra);await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở không gian làm việc…'));const main=page.locator('#lab-main');const text=await main.innerText();assert.doesNotMatch(text,/undefined|NaN|\[object Object\]|Kịch bản|Mẫu kịch bản/);
  await main.getByText(expected,{exact:false}).first().waitFor();
  if(view==='products'){assert.equal(/\b0(?:[,.]0+)?\b/.test(await page.getByRole('tabpanel').innerText()),false);await page.getByRole('tab',{name:'Đối thủ',exact:true}).click();await page.getByText('Chưa có video đối thủ. Chọn Sửa hồ sơ để thêm.',{exact:true}).waitFor();}
  if(view==='results'){assert.equal(await page.getByRole('button',{name:'Xem trước bài này'}).isDisabled(),true);await page.getByText('Chưa đặt ngưỡng · Đặt ngưỡng trong Cài đặt',{exact:true}).waitFor();}
  if(view==='experiments')assert.equal(await page.getByRole('button',{name:'Lưu quyết định'}).isDisabled(),true);
  for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot(view+'-empty-'+width);}
  checked.push(view);
 }
 return {emptyViews:checked,unknownPreserved:true,vietnameseLabels:true};
});
