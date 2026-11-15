// Actual launcher/IPC in an isolated workspace. shell.openPath is a recorded test double.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';
import {startLocalServer} from '../desktop/local/server.mjs';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';

const source=resolve('.'),out=resolve('outputs/T-049-launcher');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-'));await mkdir(join(qa,'worker'));
const seed=join(qa,'seed.json');await writeFile(seed,JSON.stringify({records:[]}));
const local=await startLocalServer({root:join(qa,'worker/workspace'),seedPath:seed});await local.close();
const config={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:900,reviewed:true};
const profiles=['Duc','Cho','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'signed_in',health:'ready',quota:{state:'available',weeklyRemainingPercent:80},checkedAt:1}));
const fixture=new Store(join(qa,'worker/worker.sqlite')),now=Date.now();
fixture.set('adapter',config);fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);
const {job}=fixture.enqueue({projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Đèn bàn kiểm thử T-049',prompt:MUSE_VIDEO_COMMAND+'\nAn approved product shot.',mediaType:'video',ratio:'9:16',duration:8,references:[]},'t049');
fixture.put({...job,state:'failed',reconciled:true,failureCode:'MUSE_OLD_CLIP',duplicateOf:{jobId:'source',projectId:'source_project',sceneId:'source_scene',number:1,queueNumber:1,assetId:null,takeId:null,sha256:'a'.repeat(64)},profileId:'Duc',providerUrl:'https://muse.ai/thread/fixture_049',errorKind:'refused',errorMessage:"You've reached the video generation limit in the past 24 hours.",failedAt:now});
const receipts=fixture.jobs();fixture.close();
const hook=join(qa,'debug.cjs');
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session,shell}=require('electron'),fs=require('fs'),path=require('path'),qa=process.env.PRODUCT_LAB_QA_USER_DATA;
 fs.writeFileSync(path.join(qa,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 let opens=0;shell.openPath=async directory=>{fs.appendFileSync(path.join(qa,'open-paths.jsonl'),JSON.stringify(directory)+'\\n');return ++opens===2?'fixture open failure':'';};
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(qa,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+join(source,'START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:source,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser;const errors=[],shots=[];
try {
 let port;for(let i=0;i<250;i++){if(launcher.exitCode!==null)break;try{await readFile(join(qa,'loaded'));port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not load');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const page=browser.contexts()[0].pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const origin=new URL(page.url()).origin;await page.goto(origin+'/?view=accounts');await page.getByText('Cấu hình Muse và dữ liệu',{exact:true}).click();
 const input=page.getByLabel('Thời gian chờ tối đa mỗi lượt (giây)');assert.equal(await input.inputValue(),'900');
 await input.fill('1200');await page.getByRole('button',{name:'Lưu thời gian chờ',exact:true}).click();await page.getByText('Đã lưu thời gian chờ tối đa mỗi lượt.',{exact:true}).waitFor();
 const rejected=await page.evaluate(async()=>{const api=window.productLabDesktop,status=await api.status();try{await api.saveAdapter({...status.adapter,timeoutSeconds:1801});return false;}catch(e){return /Thời gian chờ phải là số nguyên từ 60 đến 1800 giây/.test(e.message);}});assert.equal(rejected,true);
 const exported=await page.evaluate(()=>window.productLabDesktop.status());assert.equal(exported.exportDirectory,join(qa,'worker/outputs'));
 await page.getByRole('button',{name:'Mở thư mục xuất',exact:true}).click();await page.getByRole('button',{name:'Mở thư mục xuất',exact:true}).click();await page.getByText('Không mở được thư mục xuất. Vui lòng thử lại.',{exact:true}).waitFor();
 await page.reload();await page.getByText('Cấu hình Muse và dữ liệu',{exact:true}).click();assert.equal(await input.inputValue(),'1200');
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await input.scrollIntoViewIfNeeded();const name='accounts-'+width+'.png';await page.screenshot({path:join(out,name)});shots.push(name);}
 await page.goto(origin+'/?view=queue');await page.getByRole('button',{name:'Chi tiết Đèn bàn kiểm thử T-049',exact:true}).click();await page.getByRole('button',{name:'Sao chép link',exact:true}).scrollIntoViewIfNeeded();
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await page.getByRole('button',{name:'Sao chép link',exact:true}).scrollIntoViewIfNeeded();const name='queue-'+width+'.png';await page.screenshot({path:join(out,name)});shots.push(name);}
 assert.equal(await page.getByRole('link',{name:'Trùng clip cũ #1',exact:true}).getAttribute('href'),'?view=production&production=source_project&stage=scenes&desk_scene=source_scene');
 const after=await page.evaluate(()=>window.productLabDesktop.status());assert.equal(after.jobs[0].label,'Trùng clip cũ #1');assert.equal(after.musePaused,false);assert.equal(after.active,0);assert.equal(after.budget,0);assert.equal(after.jobs.length,1);assert.equal(after.adapter.timeoutSeconds,1200);assert.deepEqual(after.profiles.map(p=>({id:p.id,enabled:p.enabled})),profiles.map(p=>({id:p.id,enabled:p.enabled})));assert.deepEqual(errors,[]);
} finally {
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'Close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
const persisted=new Store(join(qa,'worker/worker.sqlite'));
try{assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.deepEqual(persisted.jobs(),receipts);assert.deepEqual(persisted.get('adapter'),{...config,timeoutSeconds:1200});}finally{persisted.close();}
const paths=(await readFile(join(qa,'open-paths.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(paths,[join(qa,'worker/outputs'),join(qa,'worker/outputs')]);assert.ok((await stat(paths[0])).isDirectory());
const result={passed:true,actualLauncher:true,isolatedWorkspace:true,realIPC:true,shellOpenPath:'test double: success + failure',exportDirectoryVerified:true,timeoutPersistedAfterClose:true,receiptsUnchanged:true,profilesUnchanged:true,museSends:0,shots,errors};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
