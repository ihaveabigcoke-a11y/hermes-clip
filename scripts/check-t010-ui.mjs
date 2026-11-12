// Isolated HTTP/SQLite + headless Chrome. No installed profile or external service.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {getTestBuild,importModule,startLocalServer,sessionCookie} from '../desktop/test/helpers/local-server.mjs';
import {officeFixture} from '../tests/fixtures/office-view.mjs';
import {Store} from '../desktop/src/store.mjs';

const out=resolve('outputs/T-010-ui');await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(out,'isolated-'));
const {emptyProduct,schemas}=await importModule('lib/lab/domain.ts');
const {newProduction}=await importModule('lib/lab/production.ts');
const f=officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction},Date.now());
f.records.find(r=>r.id==='today').data.candidates.push(schemas.research_batch.parse({name:'Extra fixture',candidates:[{id:'extra',name:'Giá xoay màn hình',supplierUrl:'https://supplier.invalid/extra',evidenceNotes:'Synthetic fixture only',cost:null,shipping:null,price:null}]}).candidates[0]);
const seed=join(temp,'seed.json');await writeFile(seed,JSON.stringify({records:f.records}));
const store=new Store(':memory:');
let local,browser,chrome;const errors=[],external=[];
const log=openSync(join(out,'chrome.log'),'w');
try {
 local=await startLocalServer({root:join(temp,'workspace'),seedPath:seed,workerStore:store});
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${join(temp,'chrome')}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore',log,log],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
 let port;for(let i=0;i<120;i++){try{port=(await readFile(join(temp,'chrome/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
 assert.ok(port,'Chrome did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addCookies([{name:sessionCookie,value:local.session,url:local.origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==local.origin){external.push('external request blocked');return route.abort();}return route.continue();});
 await context.addInitScript(()=>{
   localStorage.setItem('product-lab-mode','real');const preferences={};
   window.productLabDesktop={status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},manualMediaStatus:async()=>({inbox:'Fixture only',scenes:[],unmatched:[],errors:[]}),assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),museChatList:async()=>[],codexTextSettings:async()=>({enabled:false})};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(local.origin+'/?view=research&ops_id=today');
 await page.locator('.research-selection-bar').getByText('Hôm nay 3/3',{exact:true}).waitFor();
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(out,`selection-${width}.png`),fullPage:true});}
 await page.getByRole('checkbox',{name:'Chọn Hộp chia ngăn',exact:true}).click();
 await page.locator('.research-selection-bar').getByText('Hôm nay 2/3',{exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'Chọn Giá xoay màn hình',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.equal(await dialog.getByLabel('Mã sản phẩm',{exact:true}).inputValue(),'');
 assert.equal(await dialog.getByLabel('Thứ hạng hôm nay',{exact:true}).inputValue(),'');
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:join(out,`key-rank-${width}.png`)});}
 await dialog.getByLabel('Mã sản phẩm',{exact:true}).fill('SCREEN-STAND');
 await dialog.getByLabel('Thứ hạng hôm nay',{exact:true}).fill('3');
 await dialog.getByLabel('Lý do lựa chọn',{exact:true}).fill('Người dùng tự xếp; fixture kiểm giao diện.');
 await dialog.getByRole('button',{name:/Lưu/,exact:false}).click();
 await dialog.waitFor({state:'hidden'});await page.locator('.research-selection-bar').getByText('Hôm nay 3/3',{exact:true}).waitFor();
 const view=await page.evaluate(async()=> (await (await fetch('/api/lab?view=office')).json()).view);
 assert.equal(view.selection.totals.distinctProducts,4); // one today was replaced, yesterday remains
 assert.equal(view.products.filter(p=>p.key==='SCREEN-STAND').length,1);
 assert.equal(view.products.find(p=>p.key==='SCREEN-STAND').priorityRank,3);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'result.json'),JSON.stringify({passed:true,source:'isolated HTTP + SQLite; synthetic records',widths:[1366,1920],screenshots:4,pageErrors:errors,externalRequests:external,confirmedKey:'SCREEN-STAND',confirmedRank:3},null,2));
 console.log('T-010 UI passed: 4 PNG, explicit key/rank persisted through real local route, 0 page errors, 0 external requests');
}finally{await browser?.close();chrome?.kill();closeSync(log);await local?.close();store.close();}
