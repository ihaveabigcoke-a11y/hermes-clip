import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {importModule} from '../desktop/test/helpers/local-server.mjs';
const phase=process.argv[2]??'a';
const {buildOfficeView}=await importModule('lib/lab/office-view.ts');
await officeUI('T-026'+phase,[],async({page,origin,screenshot})=>{
 await page.route('**/api/lab?view=office',r=>r.fulfill({json:{view:buildOfficeView([],[],{},[],Date.now())}}));
 const visit=async query=>{await page.goto(origin+'/'+query);await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở không gian làm việc…'));};
 await visit('');
 const labels=['Tín hiệu & Phòng chờ','Hôm nay','Săn sản phẩm','Sản phẩm','Video','Đăng','Kết quả','Cài đặt'];
 assert.deepEqual(await page.getByRole('navigation',{name:'Menu chính',exact:true}).getByRole('link').allTextContents(),labels);
 assert.equal(await page.getByRole('navigation',{name:'Menu khác',exact:true}).count(),0);
 await page.getByRole('heading',{name:labels[0],exact:true}).waitFor();
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('menu-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 const legacy=['guide','content','competitors','office','signals','production','images','queue','chat','library','research','products','accounts','overview','studio','experiments','results','social','landing','settings'];
 for(const view of legacy){await visit('?view='+view);assert.equal(await page.locator('#lab-main').isVisible(),true);assert.equal(new URL(page.url()).searchParams.get('view'),view);}
 await page.getByLabel('Hiện màn nâng cao',{exact:true}).check();
 await page.reload();await page.getByLabel('Hiện màn nâng cao',{exact:true}).waitFor();assert.equal(await page.getByLabel('Hiện màn nâng cao',{exact:true}).isChecked(),true);
 await page.locator('.nav-other summary').click();assert.equal(await page.getByRole('navigation',{name:'Menu khác',exact:true}).getByRole('link').count(),12);
 await page.getByLabel('Hiện màn nâng cao',{exact:true}).uncheck();assert.equal(await page.getByRole('navigation',{name:'Menu khác',exact:true}).count(),0);
 return {menu:labels,legacyRoutes:legacy.length,preferencePersists:true};
});
