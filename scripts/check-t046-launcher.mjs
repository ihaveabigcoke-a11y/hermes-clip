// Actual Windows launcher and IPC; isolated workspace, no provider sends.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';

const source=resolve('.'),out=resolve('outputs/T-046-launcher');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-'));await mkdir(join(qa,'worker'));
const ui=JSON.parse(await readFile('outputs/T-046-ui/result.json','utf8'));
assert.ok(resolve(ui.workspaceFixture).startsWith(resolve('outputs/T-046-ui')+sep));
await cp(ui.workspaceFixture,join(qa,'worker/workspace'),{recursive:true});
const fixture=new Store(join(qa,'worker/worker.sqlite'));
const profiles=['Cho','Duc','Chim','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'signed_in',health:'ready',quota:{state:'available',weeklyRemainingPercent:80},checkedAt:1}));
fixture.set('adapter',{enabled:true,startUrl:'https://fixture.invalid'});fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);fixture.close();
const hook=join(qa,'debug.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron'),fs=require('fs'),path=require('path');
 fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+join(source,'START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:source,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser;const errors=[];let result;
try{
 let port;for(let i=0;i<250;i++){if(launcher.exitCode!==null)break;try{await readFile(join(qa,'loaded'));port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not load');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const page=browser.contexts()[0].pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 result=await page.evaluate(async()=>{
   const bridge=window.productLabDesktop,before=await bridge.status();
   let project=(await(await fetch('/api/lab')).json()).records.find(r=>r.id==='project');
   const response=await fetch('/api/production',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:project.id,revision:project.revision,commandId:'qa_default_off',action:'long_video_settings',input:{...project.data.longVideo,enabled:false}})});
   if(!response.ok)throw Error('Could not save fixture settings');project=(await response.json()).record;
   let stopped=false;try{await bridge.longVideoStart({projectId:'project',revision:project.revision,requestId:'qa_off'});}catch(e){stopped=e.message.includes('đang tắt');}
   const runs=await bridge.longVideoStatus({projectId:'project'}),after=await bridge.status();
   return {before:{musePaused:before.musePaused,profiles:before.profiles.map(p=>({id:p.id,enabled:p.enabled}))},after:{musePaused:after.musePaused,profiles:after.profiles.map(p=>({id:p.id,enabled:p.enabled})),active:after.active,budget:after.budget,jobs:after.jobs.length},stopped,runs};
 });
 assert.equal(result.stopped,true);assert.deepEqual(result.runs,[]);assert.equal(result.after.active,0);assert.equal(result.after.jobs,0);assert.equal(result.after.budget,0);assert.equal(result.before.musePaused,result.after.musePaused);assert.deepEqual(result.before.profiles,result.after.profiles);
 const origin=new URL(page.url()).origin;await page.goto(origin+'/?view=production&stage=scenes&production=project');await page.getByRole('button',{name:'Cài đặt dự án',exact:true}).click();
 assert.equal(await page.getByRole('checkbox',{name:'Video dài',exact:true}).isChecked(),false);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:join(out,'default-off-'+width+'.png')});}
 await page.getByRole('button',{name:'Đóng',exact:true}).click();await page.reload();assert.equal((await page.evaluate(()=>window.productLabDesktop.longVideoStatus({projectId:'project'}))).length,0);assert.deepEqual(errors,[]);
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'Close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
const persisted=new Store(join(qa,'worker/worker.sqlite'));
try{assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.equal(persisted.jobs().length,0);assert.equal(persisted.get('long_video_runs',[]).length,0);}finally{persisted.close();}
await writeFile(join(out,'result.json'),JSON.stringify({passed:true,actualLauncher:true,isolatedWorkspace:true,realIPC:true,offRejectedBeforeQueue:true,museSends:0,persistedAfterClose:true,screens:[1366,1920],errors,...result},null,2));
console.log(JSON.stringify({passed:true,actualLauncher:true,realIPC:true,offRejectedBeforeQueue:true,museSends:0}));
