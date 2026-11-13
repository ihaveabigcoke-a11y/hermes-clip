// Launch the actual Windows entry point with a new QA workspace. Never opens installed data.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
const out=resolve('outputs/T-024b-desktop-ui');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),hook=join(qa,'debug.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser'){
 const {app,session}=require('electron');
 require('fs').writeFileSync(require('path').join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');
 app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');
 app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((details,done)=>{
  const u=new URL(details.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});
 }));
}`);
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','START-HERMES-CLIP.cmd'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require "'+hook+'"',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0'}});
let browser;const errors=[],consoleErrors=[],screens=[],external=[];
try{
 let port;for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'Launcher did not expose its QA window; see launcher.log');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);const context=browser.contexts()[0];
 const page=context.pages().find(p=>p.url().includes('127.0.0.1'))??await context.waitForEvent('page');page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 const origin=new URL(page.url()).origin;await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked external request');return route.abort();}return route.continue();});
 await page.waitForFunction(()=>!!window.productLabDesktop);assert.equal((await page.evaluate(()=>window.productLabDesktop.status())).musePaused,true);
 await page.evaluate(()=>localStorage.setItem('product-lab-mode','real'));await page.reload();
 const nav=page.locator('.sidebar-navigation');await nav.waitFor();
 const links=await nav.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({label:n.textContent.trim(),href:n.getAttribute('href')})));
 assert.ok(links.length>=20);
 for(const item of links){
  await page.goto(origin+'/'+item.href);await page.waitForFunction(()=>!document.body.innerText.includes('Đang mở không gian làm việc…'));await page.evaluate(()=>document.fonts.ready);
  const main=page.locator('#lab-main');assert.ok((await main.innerText()).trim().length>20,item.label+' blank');
  await page.setViewportSize({width:1366,height:768});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),item.label+' overflow');
  const text=await main.innerText();assert.doesNotMatch(text,/\bbeat_\d+\b|import:json|\bundefined\b|\bNaN\b|\[object Object\]/,item.label);
  const view=new URL(page.url()).searchParams.get('view')||'today';await page.screenshot({path:join(out,view+'-1366.png'),fullPage:true});screens.push({label:item.label,view});
 }
 await page.goto(origin+'/?view=products');await page.getByRole('button',{name:'Bảng',exact:true}).click();
 await page.waitForFunction(async()=>await window.productLabDesktop.loadUiState({key:'productDisplay'})==='table');await page.reload();
 assert.equal(await page.getByRole('button',{name:'Bảng',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal((await page.evaluate(()=>window.productLabDesktop.status())).musePaused,true);
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(external,[]);
 await writeFile(join(out,'result.json'),JSON.stringify({passed:true,actualLauncher:true,actualElectron:true,installedUserData:false,isolatedWorkspace:true,screens,errors,consoleErrors,external,tablePreferencePersists:true,musePaused:true},null,2));
 console.log(JSON.stringify({passed:true,menus:screens.length,errors,consoleErrors,tablePreferencePersists:true}));
}finally{
 // Close only the window launched by this check, using the normal Windows close request.
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));if(pid>0)execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Process -Id '+pid+' -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null'],{windowsHide:true,stdio:'ignore'});
 await browser?.close().catch(()=>{});closeSync(log);
}
