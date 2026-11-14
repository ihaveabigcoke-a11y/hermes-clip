// Launch the actual Windows entry point with a new QA workspace. Never opens installed data.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
// The PowerShell wrapper closes Electron after this CDP process has exited.
if(process.argv.includes('--verify')){
 const output=resolve('outputs/M-20261114-enable-desktop-ui');
 const {qa}=JSON.parse(await readFile(join(output,'shutdown.json'),'utf8'));
 assert.equal(resolve(qa).startsWith(output+'\\'),true,'Only read the isolated QA workspace');
 const {Store}=await import('../desktop/src/store.mjs');
 const {MuseNight}=await import('../desktop/src/muse-night.mjs');
 const persisted=new Store(join(qa,'worker','worker.sqlite'));
 try{
  const night=new MuseNight(persisted),status=night.status();
  assert.equal(persisted.get('muse_paused'),false);assert.equal(status.limit,null);assert.equal(status.submitted,1);assert.equal(status.errors,1);assert.equal(status.stopped,false);
  assert.equal(night.current().resumptions.length,1);assert.equal(persisted.jobs()[0].providerId,'fixture-receipt');
  await writeFile(join(output,'result.json'),JSON.stringify({...JSON.parse(await readFile(join(output,'ui-result.json'),'utf8')),persistedAfterElectronClose:true},null,2));
  console.log(JSON.stringify({passed:true,persistedAfterElectronClose:true,receiptPreserved:true,unlimited:true}));
 }finally{persisted.close();}
 process.exit(0);
}
const out=resolve('outputs/M-20261114-enable-desktop-ui');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),hook=join(qa,'debug.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron');
 require('fs').writeFileSync(require('path').join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');
 app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');
 app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>setImmediate(()=>require('fs').writeFileSync(require('path').join(process.env.PRODUCT_LAB_QA_USER_DATA,'loaded'),'ready'))));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((details,done)=>{
  const u=new URL(details.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});
 }));
});`);
await mkdir(join(qa,'worker'),{recursive:true});
const {Store}=await import('../desktop/src/store.mjs');
const {MuseNight}=await import('../desktop/src/muse-night.mjs');
const fixture=new Store(join(qa,'worker','worker.sqlite'));
const night=new MuseNight(fixture);night.begin();
const old=fixture.enqueue({sceneId:'keep',references:[]},'keep').job;
fixture.put({...old,state:'needs_attention',providerId:'fixture-receipt'});
await night.admit(old.id);night.outcome(old.id,{code:'MUSE_REFUSED'});fixture.set('muse_paused',true);fixture.close();
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+resolve('START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser;const errors=[],consoleErrors=[],screens=[],external=[];
try{
 let port;for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'Launcher did not expose its QA window; see launcher.log');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];
 let initialLoaded=false;for(let i=0;i<200;i++){try{await readFile(join(qa,'loaded'));initialLoaded=true;break;}catch{await delay(100);}}assert.ok(initialLoaded,'Startup must finish before selecting the renderer');
 const page=context.pages().find(p=>p.url().includes('127.0.0.1'))??await context.waitForEvent('page');page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await page.waitForLoadState('load');await page.locator('.sidebar-navigation').waitFor();
 // A renderer can paint before the main loadURL promise finishes. Wait for the
 // actual startup navigation before navigating again (otherwise ERR_ABORTED).
 let loaded=false;for(let i=0;i<100;i++){try{await readFile(join(qa,'loaded'));loaded=true;break;}catch{await delay(100);}}
 assert.equal(loaded,true,'Electron startup navigation must complete');
 const origin=new URL(page.url()).origin;await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked external request');return route.abort();}return route.continue();});
 await page.waitForFunction(()=>!!window.productLabDesktop);assert.equal((await page.evaluate(()=>window.productLabDesktop.status())).musePaused,true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('product-lab-mode')),'real');
 assert.match(page.url(),/view=signals/);
 const labels=['Tín hiệu & Phòng chờ','Hôm nay','Săn sản phẩm','Sản phẩm','Video','Đăng','Kết quả','Cài đặt'];
 assert.deepEqual(await page.getByRole('navigation',{name:'Menu chính',exact:true}).getByRole('link').allTextContents(),labels);

 await page.goto(origin+'/?view=accounts');
 const card=page.getByRole('region',{name:'Công tắc Muse'}),control=card.getByRole('switch');await control.waitFor();
 await page.waitForFunction(()=>!document.querySelector('.muse-switch-card [role="switch"]').disabled);
 await control.click();const dialog=page.getByRole('dialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/Các lượt cũ không tự chạy lại/);
 for(const [width,height] of [[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(300);
  await page.screenshot({path:join(out,'resume-confirm-'+width+'.png')});screens.push({view:'resume-confirm',width});
 }
 await dialog.getByRole('button',{name:'Bật lại Muse',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const enabled=await page.evaluate(()=>window.productLabDesktop.status());
 assert.equal(enabled.musePaused,false);assert.equal(enabled.museNight.stopped,false);assert.equal(enabled.museNight.submitted,1);assert.equal(enabled.museNight.errors,1);
 assert.equal(enabled.active,0);assert.equal(enabled.jobs.length,1);assert.equal(enabled.jobs[0].state,'needs_attention');assert.equal(enabled.jobs[0].providerId,'fixture-receipt');
 await page.goto(origin+'/?view=settings');
 const unlimited=page.getByRole('checkbox',{name:'Không giới hạn lượt trong Hermes'});await unlimited.waitFor();await unlimited.check();
 await page.getByRole('button',{name:'Lưu giãn nhịp'}).click();
 await page.getByText('Đã gửi 1 · Thành công 0 · Lỗi 1 · Không giới hạn lượt trong Hermes').waitFor();
 await page.reload();await unlimited.waitFor();assert.equal(await unlimited.isChecked(),true);
 const final=await page.evaluate(()=>window.productLabDesktop.status());
 assert.equal(final.musePaused,false);assert.equal(final.museNight.limit,null);assert.equal(final.museNight.remaining,null);assert.equal(final.active,0);assert.deepEqual(final.jobs,enabled.jobs);
 for(const [width,height] of [[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await unlimited.scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(out,'unlimited-'+width+'.png')});screens.push({view:'unlimited',width});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'ui-result.json'),JSON.stringify({passed:true,actualLauncher:true,actualElectron:true,installedUserData:false,isolatedWorkspace:true,screens,errors,consoleErrors,external,defaultSignals:true,musePaused:false,explicitResume:true,receiptPreserved:true,unlimited:true,submitted:1},null,2));
 console.log(JSON.stringify({passed:true,menus:screens.length,errors,consoleErrors,defaultSignals:true}));
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 await writeFile(join(out,'shutdown.json'),JSON.stringify({qa,pid}));launcher.unref();
}
process.exit(0);
