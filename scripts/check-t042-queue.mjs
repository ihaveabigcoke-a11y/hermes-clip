// T-042: real Windows launcher/UI/IPC, synthetic workspace, zero Muse/network sends.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {Store} from '../desktop/src/store.mjs';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const out=resolve('outputs/T-042-ui');await mkdir(out,{recursive:true});
const qa=await mkdtemp(join(out,'isolated-')),hook=join(qa,'debug.cjs'),root=join(qa,'worker');await mkdir(root);
await writeFile(hook,`if(process.versions.electron&&process.type==='browser')setImmediate(()=>{
 const {app,session}=require('electron'),fs=require('fs'),path=require('path');
 fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'electron.pid'),String(process.pid));
 app.commandLine.appendSwitch('remote-debugging-port','0');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
 app.commandLine.appendSwitch('disable-background-networking');app.commandLine.appendSwitch('host-resolver-rules','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1');
 app.on('browser-window-created',(_event,win)=>win.webContents.once('did-finish-load',()=>fs.writeFileSync(path.join(process.env.PRODUCT_LAB_QA_USER_DATA,'loaded'),'ready')));
 app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,done)=>{const u=new URL(d.url);done({cancel:!['127.0.0.1','localhost'].includes(u.hostname)&&!['devtools:','file:','data:','blob:'].includes(u.protocol)});}));
});`);
const store=new Store(join(root,'worker.sqlite'));
const profiles=['Chi','Cho','Duc'].map((name,i)=>({id:'qa_'+i,name,accountLabel:'Kiểm thử',enabled:true,proxy:{server:'',username:''},vpnEnabled:true,session:'unknown',health:'unknown',checkedAt:null}));
store.set('profiles',profiles);store.set('muse_paused',false);store.set('hermes_vpn_migrated',true);
const specs=[['Lỗi trước khi gửi','failed'],['Đã dừng trước khi gửi','cancelled'],['Cần đối soát','needs_attention'],['Lỗi sau khi gửi','failed'],['Cảnh cần sửa','failed']];
const originals=specs.map(([name,state],i)=>{
 const request={projectId:'fixture',productId:'fixture_product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name,mediaType:'video',ratio:'9:16',duration:8,prompt:MUSE_VIDEO_COMMAND+'\nA product turns on a table.',references:[]};
 const job=store.enqueue(request,'fixture_'+i).job;
 return store.put({...job,state,createdAt:Date.now()-i*1000,...(i===2||i===3?{providerUrl:'https://muse.invalid/thread/fixture',providerResponse:'Synthetic receipt awaiting reconciliation'}:{})});
});const oldHashes=originals.map(hash);store.close();
const log=openSync(join(out,'launcher.log'),'w');
const launcher=spawn('powershell.exe',['-NoProfile','-Command',"& '"+resolve('START-HERMES-CLIP.cmd').replaceAll("'","''")+"'"],{cwd:process.cwd(),windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PRODUCT_LAB_QA_USER_DATA:qa,NODE_OPTIONS:'--require='+hook.replaceAll('\\','/'),PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',HERMES_INSTAGRAM_API_ENABLED:'0',HERMES_MUSE_ONLY:'1'}});
let browser,success=false;const errors=[],external=[],screens=[];
try{
 let port;for(let i=0;i<300;i++){if(launcher.exitCode!==null)break;try{port=(await readFile(join(qa,'DevToolsActivePort'),'utf8')).split('\n')[0];await readFile(join(qa,'loaded'));break;}catch{await delay(200);}}
 assert.ok(port,'QA launcher did not start; read launcher.log');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=browser.contexts()[0],page=context.pages().find(p=>p.url().includes('127.0.0.1'));assert.ok(page);page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});const origin=new URL(page.url()).origin;
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push('blocked');return route.abort();}return route.continue();});
 await page.goto(origin+'/?view=queue');await page.getByRole('heading',{name:'Hàng đợi Muse',exact:true}).waitFor();
 const status=()=>page.evaluate(()=>window.productLabDesktop.status());
 const filters=page.getByRole('group',{name:'Lọc trạng thái tác vụ'});
 const checkDetailButtons=()=>page.locator('.queue-detail-body > .button-row').evaluate(row=>{const bounds=row.getBoundingClientRect();return [...row.children].every(button=>{const r=button.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1&&r.height>=32;});});
 await page.getByRole('button',{name:'Chi tiết Lỗi sau khi gửi',exact:true}).click();
 assert.equal(await page.getByRole('checkbox',{name:'Chọn việc Lỗi sau khi gửi',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('checkbox',{name:'Chọn việc Cần đối soát',exact:true}).isDisabled(),true);
 assert.match(await page.getByRole('complementary',{name:'Chi tiết tác vụ'}).innerText(),/Lượt cũ chưa đối soát/);
 await filters.getByRole('button',{name:/Lỗi \/ đã dừng/}).click();
 await page.getByRole('checkbox',{name:'Chọn việc Lỗi trước khi gửi',exact:true}).check();
 await page.getByRole('checkbox',{name:'Chọn việc Đã dừng trước khi gửi',exact:true}).check();
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await checkDetailButtons(),true,'Detail actions must wrap within the card');
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'queue-'+width+'.png'),fullPage:true});screens.push('queue-'+width+'.png');
 }
 await page.getByRole('button',{name:'Tạo lại (2)',exact:true}).click();await page.getByText('Đã tạo 2 việc mới. Duyệt và chạy để gửi Muse.',{exact:true}).waitFor();
 let current=await status();assert.equal(current.jobs.length,7);assert.equal(current.paused,true);assert.equal(current.active,0);
 const first=current.jobs.find(j=>j.retryOf===originals[0].id);assert.ok(first);
 await page.getByRole('button',{name:'Chi tiết Lỗi trước khi gửi',exact:true}).click();
 await page.getByRole('button',{name:'Việc gốc: '+originals[0].id,exact:true}).click();
 assert.match(await page.getByRole('complementary',{name:'Chi tiết tác vụ'}).innerText(),/Lỗi trước khi gửi/);
 await page.getByRole('button',{name:'Chi tiết Cảnh cần sửa',exact:true}).click();await page.getByRole('button',{name:'Sửa & chạy lại',exact:true}).click();
 const body=page.getByRole('textbox',{name:'Mô tả cảnh',exact:true});await body.fill(MUSE_VIDEO_COMMAND+'\nA close-up of the handle.');
 assert.equal(await body.inputValue(),'A close-up of the handle.');
 assert.equal(await page.getByRole('note',{name:'Câu lệnh tạo video cố định'}).getByText(MUSE_VIDEO_COMMAND,{exact:true}).count(),1);
 assert.equal(await page.getByRole('note',{name:'Câu lệnh tạo video cố định'}).locator('input,textarea,[contenteditable=true]').count(),0);
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:1080});await page.evaluate(()=>window.scrollTo(0,window.scrollY+document.querySelector('.queue-workspace').getBoundingClientRect().top-160));
  await page.locator('.queue-detail').evaluate(el=>{const form=el.querySelector('form.queue-detail-section');el.scrollTop+=form.getBoundingClientRect().top-el.getBoundingClientRect().top-20;});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await checkDetailButtons(),true);
  assert.equal(await page.locator('.queue-detail').evaluate(el=>{const form=el.querySelector('form.queue-detail-section'),r=form.getBoundingClientRect(),b=el.getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom;}),true,'Complete editor, fixed command and Save action must be visible together');
  const saveBounds=await page.getByRole('button',{name:'Lưu & chạy lại',exact:true}).boundingBox();assert.ok(saveBounds.y>=0&&saveBounds.y+saveBounds.height<=1080);
  await page.screenshot({path:join(out,'edit-'+width+'.png')});screens.push('edit-'+width+'.png');
 }
 await page.getByRole('button',{name:'Lưu & chạy lại',exact:true}).click();await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('dialog').getByRole('heading').innerText(),'Duyệt lượt gửi Muse');
 current=await status();assert.equal(current.jobs.length,8);assert.equal(current.paused,true);assert.equal(current.active,0);assert.equal(current.budget,0);
 const edited=current.jobs.find(j=>j.retryOf===originals[4].id);assert.equal(edited.request.prompt,MUSE_VIDEO_COMMAND+'\nA close-up of the handle.');
 // Close the approval without sending; reload verifies durable UI state and IPC persistence.
 await page.keyboard.press('Escape');await page.reload();await page.getByRole('heading',{name:'Hàng đợi Muse',exact:true}).waitFor();
 const rejected=await page.evaluate(async id=>{try{await window.productLabDesktop.retryMany({requestId:'unsafe',items:[{id}]});return false;}catch(e){return /đối soát/.test(e.message);}},originals[3].id);assert.equal(rejected,true);
 current=await status();assert.equal(current.jobs.length,8);assert.equal(current.musePaused,false);assert.equal(current.paused,true);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);success=true;
}finally{
 await browser?.close().catch(()=>{});closeSync(log);
 const pid=Number(await readFile(join(qa,'electron.pid'),'utf8').catch(()=>'0'));
 if(pid)await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction Stop; if(-not $p.CloseMainWindow()){throw 'QA close rejected'}; if(-not $p.WaitForExit(1000)){$p.Refresh();$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'QA still running'}}`],{windowsHide:true});
 launcher.unref();
}
assert.equal(success,true);const persisted=new Store(join(root,'worker.sqlite'));
try{assert.equal(persisted.get('muse_paused'),false);assert.deepEqual(persisted.get('profiles'),profiles);assert.equal(persisted.jobs().length,8);assert.deepEqual(originals.map(j=>hash(persisted.job(j.id))),oldHashes);assert.equal(persisted.batch(),null);}finally{persisted.close();}
const result={passed:true,actualLauncher:true,actualElectron:true,isolatedWorkspace:true,realMuse:false,installedDataAccess:false,screens,errors,external,persistedAfterClose:true,originalReceiptHashesPreserved:true};
await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
