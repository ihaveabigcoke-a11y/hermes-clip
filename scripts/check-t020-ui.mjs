import assert from 'node:assert/strict';import {officeUI} from './office-ui.mjs';import {importModule} from '../desktop/test/helpers/local-server.mjs';import {journeyFixture} from '../tests/fixtures/product-journey.mjs';
const p=await importModule('lib/lab/production.ts'),{emptyProduct}=await importModule('lib/lab/domain.ts'),{getRenderPlan}=await importModule('lib/lab/render-plan.ts'),{planHookDrafts}=await importModule('lib/lab/hook-matrix.ts');
const f=journeyFixture({...p,emptyProduct,getRenderPlan,planHookDrafts},9);
f.records.unshift({id:'another_product',kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Sản phẩm khác'}});
await officeUI('T-020',f.records,async({page,origin,screenshot})=>{
 page.setDefaultTimeout(12000);await page.goto(origin+'/?view=products&product='+f.product.id);const card=page.getByRole('region',{name:'Bước tiếp theo',exact:true});await card.getByRole('heading',{name:'Nhập số liệu cho lượt so sánh'}).waitFor();assert.equal(await card.getByRole('link').count(),1);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('profile-'+width);}
 await card.getByRole('link').click();await page.getByRole('heading',{name:'Nhập số liệu tay nhanh'}).waitFor();assert.equal(await page.getByLabel('Sản phẩm so hook').inputValue(),f.product.id);assert.ok(f.plans.some(p=>p.id===new URL(page.url()).searchParams.get('plan'))||await page.getByLabel('Bài đăng nhập số').inputValue()===f.plans[0].id);
 await page.goto(origin+'/?view=office');await page.locator('[data-product-id="'+f.product.id+'"]').waitFor();await page.getByRole('region',{name:'Bước tiếp theo'}).getByRole('heading',{name:'Nhập số liệu cho lượt so sánh'}).waitFor();for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('office-'+width);}
 await page.getByRole('region',{name:'Bước tiếp theo'}).getByRole('link').click();await page.getByRole('heading',{name:'Nhập số liệu tay nhanh'}).waitFor();assert.equal(await page.getByLabel('Sản phẩm so hook').inputValue(),f.product.id);
 await page.goto(origin+'/?view=experiments&product='+f.product.id);await page.getByRole('heading',{name:'Quyết định theo sản phẩm'}).waitFor();assert.equal(await page.getByLabel('Sản phẩm quyết định').inputValue(),f.product.id);return {singleAction:true,productScopedNavigation:true};
});
