import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
import {journeyFixture} from '../tests/fixtures/product-journey.mjs';

// Audit dependency is isolated in outputs; it does not change package.json/lockfiles.
// npm pack axe-core@4.11.0 --pack-destination outputs/T-022c-audit-tool
// tar -xf outputs/T-022c-audit-tool/axe-core-4.11.0.tgz -C outputs/T-022c-audit-tool
const axePath=resolve(process.argv[2]??'outputs/T-022c-audit-tool/package/axe.min.js');
const p=await importModule('lib/lab/production.ts');
const {emptyProduct}=await importModule('lib/lab/domain.ts');
const {getRenderPlan}=await importModule('lib/lab/render-plan.ts');
const {planHookDrafts}=await importModule('lib/lab/hook-matrix.ts');
const f=journeyFixture({...p,emptyProduct,getRenderPlan,planHookDrafts},10);

await officeUI('T-022c',f.records,async({page,origin,out,screenshot})=>{
 page.setDefaultTimeout(12000);
 const audits=[],focusChecks=[];
 async function audit(name,scope='#lab-main'){
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  await page.addScriptTag({path:axePath});
  const result=await page.evaluate(async scope=>{
   const a=await window.axe.run(scope,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
   return {version:a.testEngine.version,violations:a.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),incomplete:a.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),passes:a.passes.length};
  },scope);
  audits.push({name,...result});
  await writeFile(join(out,'axe-results.json'),JSON.stringify(audits,null,2));
  await writeFile(join(out,name+'.aria.txt'),await page.locator(scope).ariaSnapshot());
 }
 async function focused(locator,name){
  assert.equal(await locator.evaluate(e=>e===document.activeElement),true,name+' focus');
  const style=await locator.evaluate(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {outline:s.outlineStyle,width:parseFloat(s.outlineWidth),shadow:s.boxShadow,visible:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth};});
  assert.equal(style.visible,true,name+' in viewport');
  assert.ok((style.outline!=='none'&&style.width>0)||style.shadow!=='none',name+' visible focus');
  focusChecks.push(name);
 }
 async function pictures(name){
  for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' overflow');await screenshot(name+'-'+width);}
 }
 await page.goto(origin+'/?view=products&product='+f.product.id);
 const tabs=page.getByRole('tablist',{name:'Hồ sơ sản phẩm'}),overview=tabs.getByRole('tab',{name:'Tổng quan',exact:true});
 await overview.waitFor();await overview.focus();
 const right=['Thị trường','Đối thủ','Giá & lợi nhuận','Nguồn hàng & mẫu','Bao bì & thương hiệu','Tiềm năng & rủi ro','Nội dung','Kết quả','Tổng quan'];
 for(const name of right){await page.keyboard.press('ArrowRight');const tab=tabs.getByRole('tab',{name,exact:true});await focused(tab,'tab '+name);assert.equal(await tab.getAttribute('aria-selected'),'true');}
 await page.keyboard.press('End');assert.equal(new URL(page.url()).searchParams.get('product_tab'),'results');
 await page.keyboard.press('Home');assert.equal(new URL(page.url()).searchParams.get('product_tab'),'overview');
 await page.keyboard.press('ArrowLeft');await focused(tabs.getByRole('tab',{name:'Kết quả',exact:true}),'left wrap');
 await page.keyboard.press('Tab');await focused(page.getByRole('tabpanel'),'tab panel');
 await audit('profile');await pictures('profile-keyboard');
 await page.getByRole('link',{name:'Mở bước tiếp theo →',exact:true}).focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await focused(page.getByRole('link',{name:'Mở bước tiếp theo →',exact:true}),'next step');
 await Promise.all([page.waitForURL(u=>u.searchParams.get('view')==='experiments'),page.keyboard.press('Enter')]);await page.getByLabel('Sản phẩm quyết định').waitFor();await audit('decisions');
 await page.goto(origin+'/?view=results&entry=manual');await page.getByRole('heading',{name:'Nhập số liệu tay nhanh'}).waitFor();
 const views=page.getByLabel('Lượt xem',{exact:true});await views.focus();await views.fill('100');await page.keyboard.press('Tab');await focused(page.getByLabel('Like',{exact:true}),'metric field');
 const preview=page.getByRole('button',{name:'Xem trước bài này',exact:true});await preview.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Lưu bản đo đã xem trước'}).waitFor();
 await page.setViewportSize({width:1366,height:768});const scroll=page.getByRole('region',{name:'Bảng xem trước số liệu'});await scroll.focus();await focused(scroll,'preview scroll region');await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.metric-import .profile-table').scrollLeft>0);await page.keyboard.press('Tab');await focused(page.getByRole('button',{name:'Lưu bản đo đã xem trước'}),'leave preview region');await audit('metric-preview');await pictures('metrics-keyboard');
 const summary=page.getByRole('button',{name:'Dán CSV',exact:true});await summary.focus();await page.keyboard.press('Space');const csv=page.getByLabel('CSV / bảng số liệu',{exact:true});await csv.waitFor();await page.keyboard.press('Tab');await focused(csv,'csv input');
 await csv.fill('Bài đăng,Thời điểm,Nguồn,Lượt xem\n'+f.plans[0].id+',bad,Insights,-1');await page.getByRole('button',{name:'Xem trước bảng',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('alert').filter({hasText:'Dòng 2'}).waitFor();assert.equal(await page.getByRole('button',{name:'Lưu bản đo đã xem trước'}).isDisabled(),true);await audit('metric-errors');
 await page.goto(origin+'/?view=social&ops_id='+f.product.id+'&ig_tab=matrix');const matrix=page.getByRole('region',{name:'Bảng hook × tài khoản'});await matrix.waitFor();assert.equal(await page.locator('.hook-matrix tbody td').count(),9);await matrix.focus();await page.keyboard.press('Tab');const firstLink=page.locator('.hook-matrix tbody a').first();await focused(firstLink,'matrix post link');await audit('matrix','.hook-matrix');await pictures('matrix-keyboard');await Promise.all([page.waitForURL(u=>u.searchParams.get('plan')===f.plans[0].id),page.keyboard.press('Enter')]);
 await page.goto(origin+'/?view=guide');await page.getByRole('heading',{name:'Một ngày với Hermes',exact:true}).waitFor();const selector=page.getByRole('combobox',{name:'Sản phẩm dùng trong hướng dẫn',exact:true});await selector.focus();await page.keyboard.press('Tab');await focused(page.locator('.daily-guide li a').first(),'guide first link');await audit('guide');await pictures('guide-keyboard');await Promise.all([page.waitForURL(u=>u.searchParams.get('view')==='research'),page.keyboard.press('Enter')]);
 const failures=audits.flatMap(a=>a.violations.map(v=>({screen:a.name,...v})));console.log(JSON.stringify({audits:audits.map(a=>({name:a.name,violations:a.violations.length,incomplete:a.incomplete.length})),focusChecks}));assert.deepEqual(failures,[],'axe violations; see axe-results.json');
 return {axeVersion:audits[0].version,auditStates:audits.length,violations:failures.length,focusChecks,keyboard:true,screenReaderTested:false};
});
