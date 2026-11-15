// Actual Windows launcher, isolated QA data, no external services or sends.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';
import {MuseNight} from '../desktop/src/muse-night.mjs';

const out=resolve('outputs/T-041-launcher');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),hook=join(qa,'debug.cjs');await mkdir(join(qa,'worker'));
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron'),fs=require('fs'),path=require('path');
 fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const fixture=new Store(join(qa,'worker','worker.sqlite')),night=new MuseNight(fixture);
const profiles=['Cho','Duc','Chim','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'unknown',health:'unknown',checkedAt:null}));
fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);night.begin();
for(const p of profiles)night.outcome('synthetic-'+p.id,{code:'MUSE_REFUSED'},p.id);fixture.close();
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+resolve('START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser;const errors=[],external=[];
try{
 let port;for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{await readFile(join(qa,'loaded'));port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not load');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=browser.contexts()[0],page=context.pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const origin=new URL(page.url()).origin;await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked external');return route.abort();}return route.continue();});
 const before=await page.evaluate(()=>window.productLabDesktop.status());assert.equal(before.musePaused,false);
 await page.goto(origin+'/?view=production');await page.locator('[data-screen="video"]').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.productLabDesktop.warmMuseProfiles()),[],'Stopped profiles must not open browsers');
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'video-'+width+'.png')});}
 await page.reload();await page.locator('[data-screen="video"]').waitFor();const after=await page.evaluate(()=>window.productLabDesktop.status());
 assert.equal(after.musePaused,false);assert.equal(after.museNight.submitted,0);assert.equal(after.active,0);assert.deepEqual(after.jobs,before.jobs);assert.deepEqual(after.profiles,before.profiles);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'Close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
const persisted=new Store(join(qa,'worker','worker.sqlite'));
try{assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.equal(new MuseNight(persisted).status().submitted,0);}finally{persisted.close();}
const result={passed:true,actualLauncher:true,isolatedWorkspace:true,realMuse:false,switchesPreserved:true,persistedAfterClose:true,screens:[1366,1920],errors,external};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
