import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {hookFixture} from '../tests/fixtures/hook-matrix.mjs';
const p=await importModule('lib/lab/production.ts'),{getRenderPlan}=await importModule('lib/lab/render-plan.ts'),{emptyProduct}=await importModule('lib/lab/domain.ts');
const f=hookFixture({...p,getRenderPlan,emptyProduct});
await officeUI('T-017',f.records,async({page,origin,screenshot})=>{
 await page.goto(origin+'/?view=production&production=matrix_project&stage=variants');await page.getByRole('heading',{name:'Tạo 3 bài nháp',exact:true}).waitFor();
 for(const i of [1,2,3])await page.getByLabel('Tài khoản '+i,{exact:true}).check();await page.getByLabel('Landing HTTPS (nếu đã có)').fill(f.input.landingBaseUrl);
 await page.getByRole('button',{name:'Tạo 3 bài nháp',exact:true}).click();await page.getByRole('status').filter({hasText:'Đã lưu 9 bài nháp'}).waitFor();
 assert.equal(await page.locator('.hook-matrix tbody td').count(),9);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot('matrix-'+width);}
 const edited=await page.evaluate(async()=>{const rows=(await(await fetch('/api/lab')).json()).records;const row=rows.find(r=>r.kind==='content_plan');const r=await fetch('/api/lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...row,data:{...row.data,ctaKeyword:'DOG'}})});return r.status;});assert.equal(edited,200);
 await page.reload();await page.getByRole('alert').filter({hasText:'Lệch lượt so sánh: CTA'}).waitFor();await screenshot('drift-1920');
 await page.goto(origin+'/?view=social&ops_id=matrix_product&ig_tab=matrix');await page.locator('.hook-matrix tbody td').first().waitFor();
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await screenshot('instagram-matrix-'+width);}
 const link=page.locator('.hook-matrix tbody td a').filter({hasText:'Hook · Hook 3'}).last(),target=await link.getAttribute('href'),name=await link.innerText();assert.ok(target.includes('plan='));await page.goto(origin+target);await page.locator('.instagram-publish-detail h2').filter({hasText:name}).waitFor();assert.equal(await page.locator('.instagram-plan-button[aria-pressed=true] strong').innerText(),name);
 const post=await page.evaluate(async()=>{const rows=(await(await fetch('/api/lab')).json()).records;return rows.find(r=>r.id===new URL(location.href).searchParams.get('plan'));});assert.equal(await page.locator('.instagram-video-preview video').getAttribute('src'),'/api/assets/'+post.data.assetId);assert.equal(await page.getByRole('button',{name:'Đăng qua API',exact:true}).isDisabled(),true);
 return {cells:9,drafts:9,driftWarning:true,correctRenderPreview:true};
});
