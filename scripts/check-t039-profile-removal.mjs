// Offline launcher/IPC acceptance only. Never opens the installed userData.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';
const out=resolve('outputs/T-039-ui');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),hook=join(qa,'debug.cjs'),root=join(qa,'worker');
await mkdir(root);
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron'),fs=require('fs'),path=require('path');
 fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');
 app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');
 app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const store=new Store(join(root,'worker.sqlite'));
const profiles=[['idle','Rảnh'],['keep','Giữ nguyên'],['pending','Chưa đối soát'],['queued','Còn hàng chờ']].map(([id,name])=>({id,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:false,session:'unknown',health:'unknown',checkedAt:null}));
store.set('profiles',profiles);store.set('muse_paused',false);store.set('hermes_vpn_migrated',true);
const old=store.enqueue({projectId:'fixture',sceneId:'scene',references:[]},'pending').job;
store.put({...old,state:'needs_attention',profileId:'pending',providerResponse:'Retained synthetic receipt'});
const queued=store.enqueue({projectId:'fixture',sceneId:'queued-scene',references:[]},'queued').job;
store.put({...queued,preferredProfileId:'queued'});store.close();
for(const p of profiles){await mkdir(join(root,'profiles',p.id),{recursive:true});await writeFile(join(root,'profiles',p.id,'synthetic-session'),'retain '+p.id);}
await writeFile(join(root,'retained-video.mp4'),'synthetic retained media');
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+resolve('START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser,success=false;const errors=[],external=[],screens=[];
try{
 let port;
 for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];await readFile(join(qa,'loaded'));break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not start; read launcher.log');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=browser.contexts()[0],page=context.pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const origin=new URL(page.url()).origin;
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked');return route.abort();}return route.continue();});
 await page.goto(origin+'/?view=accounts');await page.locator('.account-row').first().waitFor();
 const rows=name=>page.locator('.account-row').filter({has:page.getByRole('heading',{name,exact:true})});
 const dialog=page.getByRole('dialog'),status=()=>page.evaluate(()=>window.productLabDesktop.status());
 const before=await status();assert.equal(before.profiles.length,4);assert.equal(before.musePaused,false);assert.equal(before.active,0);
 assert.equal(await rows('Rảnh').getByRole('button',{name:'Xóa hồ sơ',exact:true}).isEnabled(),true);
 assert.equal(await rows('Còn hàng chờ').getByRole('button',{name:'Xóa hồ sơ',exact:true}).isDisabled(),true);
 assert.match(await rows('Còn hàng chờ').getByRole('status').innerText(),/Mở Hàng đợi, hủy/);
 assert.equal(await rows('Còn hàng chờ').getByRole('button',{name:'Bỏ qua và xóa',exact:true}).count(),0);
 assert.equal(await rows('Chưa đối soát').getByRole('button',{name:'Xóa hồ sơ',exact:true}).isDisabled(),true);
 assert.equal(await rows('Chưa đối soát').getByRole('button',{name:'Bỏ qua và xóa',exact:true}).isEnabled(),true);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'accounts-'+width+'.png'),fullPage:true});screens.push('accounts-'+width);}
 await rows('Chưa đối soát').getByRole('button',{name:'Bỏ qua và xóa',exact:true}).click();await dialog.waitFor();
 assert.equal(await dialog.getByRole('heading').innerText(),'Bỏ qua và xóa hồ sơ Muse');
 assert.match(await dialog.innerText(),/Kết quả chưa tải có thể không lấy lại được/);
 await dialog.getByRole('textbox').fill('wrong');await dialog.getByRole('button',{name:'Bỏ qua và xóa',exact:true}).click();await dialog.getByText('Nhập đúng tên hồ sơ: Chưa đối soát',{exact:true}).waitFor();assert.equal((await status()).profiles.length,4);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await page.screenshot({path:join(out,'confirmation-'+width+'.png')});screens.push('confirmation-'+width);}
 await dialog.getByRole('textbox').fill('Chưa đối soát');await dialog.getByRole('button',{name:'Bỏ qua và xóa',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await rows('Rảnh').getByRole('button',{name:'Xóa hồ sơ',exact:true}).click();await dialog.getByRole('textbox').fill('Rảnh');await dialog.getByRole('button',{name:'Xóa hồ sơ',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.reload();await rows('Giữ nguyên').waitFor();const final=await status();
 assert.deepEqual(final.profiles.map(p=>p.id).sort(),['keep','queued']);assert.equal(final.musePaused,false);
 assert.deepEqual(final.profiles.find(p=>p.id==='keep'),before.profiles.find(p=>p.id==='keep'));
 assert.deepEqual(final.jobs.find(j=>j.id===queued.id),before.jobs.find(j=>j.id===queued.id));
 const skipped=final.jobs.find(j=>j.id===old.id);assert.equal(skipped.reconciled,true);assert.equal(skipped.providerResponse,'Retained synthetic receipt');assert.deepEqual(skipped.history.slice(0,-1),before.jobs.find(j=>j.id===old.id).history);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);success=true;
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid){await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'QA close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});}
 launcher.unref();
}
assert.equal(success,true);
const persisted=new Store(join(root,'worker.sqlite'));
try{assert.equal(persisted.get('muse_paused'),false);assert.deepEqual(persisted.get('profiles'),profiles.filter(p=>['keep','queued'].includes(p.id)));assert.equal(persisted.job(old.id).reconciliation,'skipped');assert.equal(persisted.get('deleted_profiles').length,2);}finally{persisted.close();}
assert.equal(await readFile(join(root,'profiles','keep','synthetic-session'),'utf8'),'retain keep');
assert.equal(await readFile(join(root,'retained-video.mp4'),'utf8'),'synthetic retained media');
for(const id of ['idle','pending'])await assert.rejects(stat(join(root,'profiles',id)),/ENOENT/);
const result={passed:true,actualLauncher:true,actualElectron:true,isolatedWorkspace:true,realMuse:false,installedDataAccess:false,screens,errors,external,persistedAfterClose:true};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
