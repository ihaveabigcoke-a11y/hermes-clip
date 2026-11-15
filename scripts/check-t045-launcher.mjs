// Run the actual launcher from a source-built QA package. Never close the user's app.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,symlink,lstat} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';

const source=resolve('.'),pack=resolve('outputs/T-045-package'),out=resolve('outputs/T-045-launcher');
assert.ok(pack.startsWith(join(source,'outputs')+sep));await mkdir(out,{recursive:true});
await lstat(join(pack,'desktop/local-dist/ui/index.html')); // Must be built from source first.
for(const path of ['desktop/src','desktop/local','desktop/setup-local.mjs','desktop/package.json','desktop/integrations-lock.json','START-HERMES-CLIP.cmd'])await cp(join(source,path),join(pack,path),{recursive:true});
for(const path of ['desktop/node_modules','node_modules','desktop/tools'])if(!await lstat(join(pack,path)).catch(()=>null))await symlink(join(source,path),join(pack,path),'junction');
const qa=await mkdtemp(join(out,'isolated-'));await mkdir(join(qa,'worker'));
const uiResult=JSON.parse(await readFile('outputs/T-045-ui/result.json','utf8'));
assert.ok(resolve(uiResult.workspaceFixture).startsWith(resolve('outputs/T-045-ui')+sep));
await cp(uiResult.workspaceFixture,join(qa,'worker/workspace'),{recursive:true});
const fixture=new Store(join(qa,'worker/worker.sqlite'));
const profiles=['Cho','Duc','Chim','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'unknown',health:'unknown',checkedAt:null}));
fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);fixture.close();
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
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+join(pack,'START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:pack,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser;const errors=[],external=[];
try{
 let port;for(let i=0;i<250;i++){if(launcher.exitCode!==null)break;try{await readFile(join(qa,'loaded'));port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not load');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=browser.contexts()[0],page=context.pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const origin=new URL(page.url()).origin;await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked external');return route.abort();}return route.continue();});
 const before=await page.evaluate(()=>window.productLabDesktop.status());
 await page.goto(origin+'/?view=characters');await page.getByRole('heading',{name:'@Bông',exact:true}).waitFor();
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'characters-'+width+'.png')});}
 const queued=await page.evaluate(async()=>{
   const request=async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error);return data;};
   let project=(await(await fetch('/api/lab')).json()).records.find(r=>r.id==='fixture_project');
   for(const [action,input] of [['media_provider',{provider:'muse',sceneId:project.data.scenes[0].id}],['storyboard',{sceneId:project.data.scenes[0].id}]])project=(await request('/api/production',{id:project.id,revision:project.revision,commandId:'t045_'+action,action,input})).record;
   const s=project.data.scenes[0],payload={projectId:project.id,productId:project.data.productId,productRevision:project.data.productRevision,sceneId:s.id,sceneRevision:s.revision,name:s.name,mediaType:'video',ratio:s.ratio,duration:s.duration,prompt:s.prompt,references:[],keepCharacter:s.keepCharacter};
   const result=await window.productLabDesktop.enqueue(payload);
   let blocked=false;try{await window.productLabDesktop.enqueue({...payload,prompt:'@Không_có turns.'});}catch(e){blocked=String(e.message).includes('Không tìm thấy');}
   return {job:result.job,blocked};
 });
 assert.equal(queued.job.state,'queued');assert.equal(queued.job.request.references.length,2);assert.equal(queued.blocked,true);
 await page.reload();await page.getByRole('heading',{name:'@Bông',exact:true}).waitFor();
 const after=await page.evaluate(()=>window.productLabDesktop.status());assert.equal(after.active,0);assert.equal(after.budget,0);assert.equal(after.jobs.length,1);assert.equal(after.jobs[0].state,'queued');assert.equal(after.musePaused,before.musePaused);assert.deepEqual(after.profiles,before.profiles);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'Close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
const persisted=new Store(join(qa,'worker/worker.sqlite'));
try{assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.equal(persisted.jobs().length,1);assert.equal(persisted.jobs()[0].state,'queued');assert.equal(persisted.batch(),null);}finally{persisted.close();}
const result={passed:true,actualLauncher:true,isolatedPackage:true,isolatedWorkspace:true,ipcQueuedTwoImages:true,unknownBlocked:true,museSends:0,switchesPreserved:true,persistedAfterClose:true,screens:[1366,1920],errors,external};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
