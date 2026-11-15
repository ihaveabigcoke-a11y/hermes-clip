// Actual startup recovery/IPC in an isolated fixture. No real Muse or installed data.
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
import {runMediaTool} from '../desktop/src/compress.mjs';
import {validateMedia} from '../desktop/src/media.mjs';
import {createHash} from 'node:crypto';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';

const source=resolve('.'),out=resolve('outputs/T-050-launcher');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-'));await mkdir(join(qa,'worker'));
const seed=join(qa,'seed.json');await writeFile(seed,JSON.stringify({records:[]}));
const local=await startLocalServer({root:join(qa,'worker/workspace'),seedPath:seed});await local.close();
const config={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:900,reviewed:true};
const profiles=['Duc','Cho','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'signed_in',health:'ready',quota:{state:'available',weeklyRemainingPercent:80},checkedAt:1}));
const fixture=new Store(join(qa,'worker/worker.sqlite')),now=Date.now();
fixture.set('adapter',config);fixture.set('profiles',profiles);fixture.set('muse_paused',false);fixture.set('hermes_vpn_migrated',true);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const request=(sceneId,name)=>({projectId:'project',productId:'product',productRevision:1,sceneId,sceneRevision:1,name,prompt:MUSE_VIDEO_COMMAND+'\nA synthetic shot.',mediaType:'video',ratio:'9:16',duration:1,references:[]});
const old=fixture.enqueue(request('old','Receipt cũ'),'old').job;fixture.put({...old,state:'ready',providerResponse:'Old immutable receipt',importedAt:123,uploadedAssetId:'old_asset'});
const lost=fixture.enqueue(request('lost','Cảnh mất dấu'),'lost').job;
fixture.put({...lost,state:'waiting',heartbeatAt:now-901000,profileId:'Duc',providerId:'result_lost',providerUrl:'https://muse.ai/thread/fixture_lost',providerResponse:'Keep uncertain receipt'});
const saved=fixture.enqueue(request('saved','Cảnh đã lưu'),'saved').job;
const outputPath=join(qa,'worker',saved.id+'.mp4');
await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=red:s=90x160:r=24:d=1','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',outputPath]);
const output={path:outputPath,name:saved.id+'.mp4',...await validateMedia(outputPath,saved.request)};
fixture.put({...saved,state:'validating',output,profileId:'Cho',providerId:'result_saved',providerUrl:'https://muse.ai/thread/fixture_saved',providerResponse:'Keep saved receipt'});
const receipts=fixture.jobs(),original=hash(fixture.job(old.id));fixture.close();
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
 const origin=new URL(page.url()).origin;await page.goto(origin+'/?view=queue');
 await page.getByText('0 đang chạy · không giới hạn lượt trong Hermes',{exact:true}).waitFor();
 const filters=page.getByRole('group',{name:'Lọc trạng thái tác vụ'});
 assert.equal(await filters.getByRole('button',{name:/^Đang chạy\s*0$/}).count(),1);
 assert.equal(await filters.getByRole('button',{name:/^Xong\s*2$/}).count(),1);
 await page.getByRole('button',{name:'Chi tiết Cảnh mất dấu',exact:true}).click();
 const details=page.getByRole('complementary',{name:'Chi tiết tác vụ'});
 await details.getByText('Lỗi: mất dấu',{exact:true}).waitFor();
 assert.equal(await details.getByRole('button',{name:'Tạo lại',exact:true}).isDisabled(),true);
 const rejected=await page.evaluate(async id=>{try{await window.productLabDesktop.retry({id});return false;}catch(error){return /đối soát/.test(error.message);}},lost.id);assert.equal(rejected,true);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await details.getByRole('button',{name:'Tạo lại',exact:true}).scrollIntoViewIfNeeded();const name='queue-'+width+'.png';await page.screenshot({path:join(out,name),fullPage:true});shots.push(name);}
 await page.reload();await page.getByText('0 đang chạy · không giới hạn lượt trong Hermes',{exact:true}).waitFor();
 const after=await page.evaluate(()=>window.productLabDesktop.status());
 assert.equal(after.jobs.find(j=>j.id===saved.id).state,'ready');assert.equal(after.jobs.find(j=>j.id===lost.id).label,'Lỗi: mất dấu');
 assert.equal(after.active,0);assert.equal(after.budget,0);assert.equal(after.musePaused,false);assert.equal(after.jobs.length,3);
 assert.deepEqual(after.profiles.map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled})),profiles.map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled})));assert.deepEqual(errors,[]);

} finally {
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'Close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
const persisted=new Store(join(qa,'worker/worker.sqlite'));
try{
 assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.get('muse_paused'),false);assert.deepEqual(persisted.get('adapter'),config);
 assert.equal(hash(persisted.job(old.id)),original);
 for(const before of receipts){const after=persisted.job(before.id);assert.equal(hash([after.request,after.providerId,after.providerUrl,after.providerResponse,after.output]),hash([before.request,before.providerId,before.providerUrl,before.providerResponse,before.output]));}
 assert.equal(persisted.job(saved.id).state,'ready');assert.equal(persisted.job(lost.id).failureCode,'WORKER_LOST');
}finally{persisted.close();}
const result={passed:true,actualLauncher:true,isolatedWorkspace:true,realIPC:true,recoveredSavedOutput:true,retryRejected:true,headerMatchesCards:true,receiptsUnchanged:true,profilesUnchanged:true,museSends:0,shots,errors};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
