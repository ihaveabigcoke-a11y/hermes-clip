// Windows launcher + real IPC/local API with synthetic media and isolated userData.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';
import {startLocalServer} from '../desktop/local/server.mjs';
import {libraryFixture,digest} from '../desktop/test/fixtures/t051-library.mjs';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
const source=resolve(process.env.HERMES_T051_LAUNCH_ROOT||'.'),out=resolve('outputs/T-051-launcher');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),f=await libraryFixture(join(qa,'fixtures'));await mkdir(join(qa,'worker'));
const local=await startLocalServer({root:join(qa,'worker/workspace'),seedPath:f.seedPath,uiDir:join(source,'desktop/local-dist/ui'),routesPath:join(source,'desktop/local-dist/server/routes.mjs')});await local.close();
const config={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:900,reviewed:true};
const profiles=['Duc','Cho','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'signed_in',health:'ready',quota:{state:'available',weeklyRemainingPercent:80},checkedAt:1}));
const fixture=new Store(join(qa,'worker/worker.sqlite'));fixture.set('adapter',config);fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);
for(const job of f.jobs)fixture.put({...job,fingerprint:digest(Buffer.from(JSON.stringify(job.request))),providerResponse:'Preserved fixture receipt',request:{...job.request,prompt:MUSE_VIDEO_COMMAND+'\nSynthetic fixture.',references:[]}});
const before=fixture.jobs();fixture.close();
const hook=join(qa,'debug.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron'),fs=require('fs'),path=require('path'),qa=process.env.PRODUCT_LAB_QA_USER_DATA;
 fs.writeFileSync(path.join(qa,'electron.pid'),String(process.pid));app.commandLine.appendSwitch('remote-debugging-port','0');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(qa,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+join(source,'START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:source,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser,result;const errors=[],shots=[];
try{
 let port;for(let i=0;i<250;i++){if(launcher.exitCode!==null)break;try{await readFile(join(qa,'loaded'));port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not load');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const page=browser.contexts()[0].pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const origin=new URL(page.url()).origin;await page.goto(origin+'/?view=library');
 for(const name of ['Clip dọc có tiếng','Clip vuông im lặng'])await page.getByRole('checkbox',{name:'Chọn ghép '+name,exact:true}).check();
 await page.getByRole('button',{name:'Ghép (2)',exact:true}).click();await page.getByLabel('Tên file',{exact:true}).fill('Bản ghép từ launcher');
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/library/merge'));await page.getByRole('button',{name:'Ghép và lưu',exact:true}).click();const response=await pending;assert.equal(response.status(),200);result=await response.json();
 const video=page.locator(`video[src="/api/assets/${result.assetId}"]`);await video.waitFor();await video.evaluate(async v=>{v.muted=true;await v.play();});await page.waitForFunction(id=>document.querySelector(`video[src="/api/assets/${id}"]`)?.currentTime>0,result.assetId);await video.evaluate(v=>v.pause());
 await page.reload();await page.getByText('Bản ghép',{exact:true}).waitFor();
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});const name='saved-'+width+'.png';await page.screenshot({path:join(out,name),fullPage:true});shots.push(name);}
 await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await page.getByRole('button',{name:'Xem Clip vuông im lặng',exact:true}).click();await page.getByRole('button',{name:'Xem gốc–kết quả cạnh nhau',exact:true}).click();
 assert.deepEqual(await page.locator('.library-comparison-players video').evaluateAll(vs=>vs.map(v=>v.getAttribute('src'))),['/api/assets/clip0','/api/assets/clip1']);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});const name='comparison-'+width+'.png';await page.screenshot({path:join(out,name),fullPage:true});shots.push(name);}
 for(const [i,m] of f.media.entries())assert.equal(digest(await (await page.request.get(origin+'/api/assets/clip'+i)).body()),digest(Buffer.from(m.base64,'base64')));
 const after=await page.evaluate(()=>window.productLabDesktop.status());assert.equal(after.musePaused,false);assert.equal(after.jobs.length,3);assert.equal(after.active,0);assert.equal(after.budget,0);assert.deepEqual(errors,[]);
}finally{
 await browser?.close().catch(()=>{});closeSync(log);const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$taskProcess=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $taskProcess.CloseMainWindow()){throw 'Close rejected'}; if(-not $taskProcess.WaitForExit(1000)){$taskProcess.Refresh();$null=$taskProcess.CloseMainWindow();if(-not $taskProcess.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});launcher.unref();
}
const persisted=new Store(join(qa,'worker/worker.sqlite'));try{assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.deepEqual(persisted.get('adapter'),config);assert.deepEqual(persisted.jobs(),before);}finally{persisted.close();}
const report={passed:true,actualLauncher:true,isolatedWorkspace:true,realIPC:true,merge:result,receiptsUnchanged:true,profilesUnchanged:true,originalHashesPreserved:true,museSends:0,shots,errors};await writeFile(join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
