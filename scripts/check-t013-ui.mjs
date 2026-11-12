import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
const {emptyProduct}=await importModule('lib/lab/domain.ts'),{newProduction}=await importModule('lib/lab/production.ts');
const product={id:'competitor_product',kind:'product',revision:1,updatedAt:Date.now(),data:{...emptyProduct,name:'Sản phẩm kiểm video',competitorVideos:[]}};
const reference={id:'reference_video_draft_ref',kind:'reference_video_draft',revision:1,updatedAt:Date.now(),data:{id:'ref',product:'Mẫu đối thủ kiểm',formulaId:'problem-vs-result-cta'}};
const project={id:'competitor_project',kind:'production',revision:1,updatedAt:Date.now(),data:newProduction('Khung kiểm',product.id,1,'en-US')};
await officeUI('T-013',[product,reference,project],async({page,origin,screenshot})=>{
 page.setDefaultTimeout(15000);
 await page.goto(origin+'/?view=products');await page.getByRole('button',{name:product.data.name,exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Thêm video đối thủ'}).click();
 await dialog.getByLabel('Link video 1',{exact:true}).fill('https://example.com/video');await dialog.getByLabel('Bản phân tích 1',{exact:true}).selectOption(reference.id);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await dialog.getByRole('link',{name:'Dùng làm khung content'}).scrollIntoViewIfNeeded();await screenshot('competitors-'+width);}
 await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:product.data.name,exact:true}).click();await page.getByRole('link',{name:'Dùng làm khung content'}).click();
 await page.getByRole('button',{name:'Khung content',exact:true}).click();await page.getByText('Mẫu đã chọn:',{exact:false}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('production'),project.id);assert.equal(new URL(page.url()).searchParams.get('reference'),reference.id);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('content-'+width);}
 return {saved:true,productAndReference:true};
});
