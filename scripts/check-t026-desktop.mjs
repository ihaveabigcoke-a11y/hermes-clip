// Launch the actual Windows entry point with a new QA workspace. Never opens installed data.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
const out=resolve('outputs/T-026-desktop-ui');await mkdir(out,{recursive:true});
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
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+resolve('START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0'}});
let browser;const errors=[],consoleErrors=[],screens=[],external=[];
try{
 let port;for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'Launcher did not expose its QA window; see launcher.log');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];
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
 for(const view of ['signals','overview','research','products','production','social','results']){
  await page.goto(origin+'/?view='+view);await page.waitForFunction(()=>document.querySelector('[data-screen]'));await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' overflow');
   await page.screenshot({path:join(out,view+'-'+width+'.png'),fullPage:true});screens.push({view,width});
  }
 }
 assert.equal((await page.evaluate(()=>window.productLabDesktop.status())).musePaused,true);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'result.json'),JSON.stringify({passed:true,actualLauncher:true,actualElectron:true,installedUserData:false,isolatedWorkspace:true,screens,errors,consoleErrors,external,defaultSignals:true,musePaused:true},null,2));
 console.log(JSON.stringify({passed:true,menus:screens.length,errors,consoleErrors,defaultSignals:true}));
}finally{
 // Close only the window launched by this check, using the normal Windows close request.
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));if(pid>0)execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Process -Id '+pid+' -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null'],{windowsHide:true,stdio:'ignore'});
 await browser?.close().catch(()=>{});closeSync(log);
}
