// T-011: synthetic selection fixture + a real local ManualMedia import/attach.
// A new isolated database/browser profile is used. No installed data, accounts or paid services.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {importModule,startLocalServer,sessionCookie} from '../desktop/test/helpers/local-server.mjs';
import {officeFixture} from '../tests/fixtures/office-view.mjs';
import {Store} from '../desktop/src/store.mjs';
import {ManualMedia,probeManualMedia} from '../desktop/src/manual-media.mjs';

const out=resolve('outputs/T-011-acceptance');await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(out,'isolated-'));
const {emptyProduct,schemas}=await importModule('lib/lab/domain.ts');
const {newProduction}=await importModule('lib/lab/production.ts');
const f=officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction},Date.now());
const seed=join(temp,'seed.json');await writeFile(seed,JSON.stringify({records:f.records}));
const store=new Store(':memory:');for(const job of f.jobs)store.put({...job,fingerprint:job.id});store.set('muse_paused',true);
let local,browser,chrome,manual,override=null;const errors=[],external=[],shots=[],checks=[];
const log=openSync(join(out,'chrome.log'),'w');
try {
 local=await startLocalServer({root:join(temp,'workspace'),seedPath:seed,workerStore:store});
 manual=new ManualMedia({store,local}); // No trashItem: the new acceptance source is preserved.
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${join(temp,'chrome')}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore',log,log],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
 let port;for(let i=0;i<120;i++){try{port=(await readFile(join(temp,'chrome/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
 assert.ok(port,'Chrome did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addCookies([{name:sessionCookie,value:local.session,url:local.origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==local.origin){external.push('external request blocked');return route.abort();}
   if(url.pathname==='/api/lab'&&url.searchParams.get('view')==='office'&&override){
     if(override==='offline')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic disconnect"}'});
     const response=await route.fetch(),data=await response.json();
     if(override==='stale')data.view.generatedAt=new Date(Date.now()-600000).toISOString();
     if(override==='schema')data.view.version=999;
     if(override==='nested')data.view.runs[0].lastEvent.note={invalid:true};
     return route.fulfill({response,json:data});
   }
   return route.continue();
 });
 await context.addInitScript(()=>{
   if(!localStorage.getItem('product-lab-mode'))localStorage.setItem('product-lab-mode','real');const preferences={};
   window.productLabDesktop={status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},manualMediaStatus:async()=>({inbox:'Isolated acceptance',scenes:[],unmatched:[],errors:[]}),assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),museChatList:async()=>[],codexTextSettings:async()=>({enabled:false})};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const refresh=()=>page.evaluate(()=>window.dispatchEvent(new Event('product-lab:workspace-changed')));
 const screenshot=async(name,fullPage=false)=>{
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
   const width=page.viewportSize().width;const file=`${name}-${width}.png`;await page.screenshot({path:join(out,file),fullPage});shots.push(file);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page-wide horizontal overflow');
 };
 for(const width of [1366,1920]) {
   await page.setViewportSize({width,height:900});await page.goto(local.origin+'/?view=office');
   await page.getByTestId('office-counts').getByText('Hôm nay 3/3 · Đang triển khai 4',{exact:true}).waitFor();
   assert.equal(await page.locator('.office-product').count(),3);assert.deepEqual(await page.locator('.office-product').evaluateAll(nodes=>nodes.map(n=>n.dataset.productId)),['product_1','product_2','product_3']);
   assert.equal(await page.locator('.sidebar a[href="?view=products"]').count(),1);await page.getByTestId('office-counts').getByText('Hôm nay 3/3 · Đang triển khai 4',{exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Phòng sản xuất',exact:true}).count(),1);
   await screenshot('production-today',true);
   await page.getByRole('button',{name:'Đang triển khai 4',exact:true}).click();assert.equal(await page.locator('.office-product').count(),4);await screenshot('production-active',true);
   await page.getByLabel('Tìm sản phẩm theo tên hoặc mã').fill('SP-04');assert.equal(await page.locator('.office-product').count(),1);await page.getByText('Túi đeo chạy bộ',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Xóa lọc',exact:true}).click();
   const yesterday=f.records.find(r=>r.id==='selection_3').data.selectionDay;await page.getByLabel('Lọc sản phẩm theo ngày chọn').fill(yesterday);assert.equal(await page.locator('.office-product').count(),1);await page.getByRole('button',{name:'Xóa lọc',exact:true}).click();
   await page.locator('.office-product').first().getByRole('button',{name:'Xem các lượt của sản phẩm'}).click();
   await page.waitForURL('**/?view=signals');assert.equal(await page.getByLabel('Lọc lượt theo sản phẩm').inputValue(),'product_1');
   await page.goto(local.origin+'/?view=signals');await page.locator('.office-run').first().waitFor();assert.equal(await page.locator('.office-run').count(),8);await screenshot('signals',true);
   await page.getByLabel('Lọc lượt theo trạng thái').selectOption('attention');assert.equal(await page.locator('.office-run').count(),1);
   await page.getByLabel('Lọc lượt theo sản phẩm').selectOption('product_2');assert.equal(await page.locator('.office-run').count(),0);
   await page.getByLabel('Lọc lượt theo sản phẩm').selectOption('product_1');assert.equal(await page.locator('.office-run').count(),1);await page.locator('.office-run').click();
   const dialog=page.getByRole('dialog');await dialog.getByText('job:run_2',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Sao chép ID',exact:true}).waitFor();assert.equal(await dialog.locator('.office-timeline li').count(),2);await screenshot('run-detail');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.getByLabel('Lọc lượt theo trạng thái').selectOption('unmapped');assert.equal(await page.locator('.office-run').count(),1);assert.equal(await page.locator('.office-run-main small').textContent(),'Chưa biết · Lượt media');
   checks.push({width,today:3,active:4,productSearch:true,dayFilter:true,combinedFilters:true,unmappedVisible:true});
 }
 console.log('T-011 layouts and filters passed at 1366/1920');
 await page.setViewportSize({width:1366,height:900});await page.getByLabel('Lọc lượt theo trạng thái').selectOption('');await page.getByLabel('Lọc lượt theo sản phẩm').selectOption('');
 override='stale';await refresh();await page.getByText('Dữ liệu cũ',{exact:true}).waitFor();await page.getByText(/10 phút trước/).waitFor();await screenshot('stale');
 override='offline';await refresh();await page.getByText('Mất kết nối',{exact:true}).waitFor();assert.equal(await page.locator('.office-run').count(),8);await screenshot('disconnected');
 override='schema';await page.getByRole('button',{name:'Thử lại',exact:true}).click();await delay(250);await page.getByText('Mất kết nối',{exact:true}).waitFor();assert.equal(await page.locator('.office-run').count(),8);
 override='nested';await page.getByRole('button',{name:'Thử lại',exact:true}).click();await delay(250);assert.equal(await page.locator('.office-run').count(),8);
 override=null;await refresh();await page.getByText('Trực tiếp',{exact:true}).waitFor();
 // Actual file handling: make a new MP4, probe/compress/import through ManualMedia,
 // then attach it with the existing production command and observe the UI polling it.
 const post=async(path,body)=>(await manual.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 let seq=0;const command=async(action,input)=>{const p=(await manual.records()).find(r=>r.id==='production_1');return (await post('/api/production',{id:p.id,revision:p.revision,commandId:'acceptance_'+(++seq),action,input})).record;};
 await command('scene',{id:'local_acceptance',name:'MP4 kiểm local',prompt:'A blue studio backdrop. Local acceptance only.',mediaType:'video',ratio:'9:16',duration:1,referenceIds:[]});
 await command('storyboard',{sceneId:'local_acceptance'});
 await manual.configure({inbox:join(temp,'new-inbox')});
 const source=join(manual.inbox(),'local-acceptance.mp4');
 execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p',source],{windowsHide:true,stdio:'pipe'});
 const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex'),sourceHash=await hash(source),probe=await probeManualMedia(source);
 const receipt=await manual.importFile(source,manual.catalog(await manual.records()));assert.equal(receipt.state,'unmatched');assert.ok(receipt.assetId);
 const runId='manual:'+receipt.sha256,selector=`.office-run[data-run-id="${runId}"]`;
 await page.locator(selector+'[data-group="attention"]').waitFor({timeout:15000});
 const before=await (await manual.request('/api/lab?view=office')).json();await writeFile(join(out,'before.json'),JSON.stringify(before.view,null,2));await screenshot('manual-before',true);
 const changedAt=Date.now();await manual.assign({sha256:receipt.sha256,projectId:'production_1',sceneId:'local_acceptance'});
 await page.locator(selector+'[data-group="library"]').waitFor({timeout:60000});const elapsedMs=Date.now()-changedAt;assert.ok(elapsedMs<=60000);
 const after=await (await manual.request('/api/lab?view=office')).json();await writeFile(join(out,'after.json'),JSON.stringify(after.view,null,2));await screenshot('manual-after',true);
 const actual=after.view.runs.find(r=>r.id===runId);assert.equal(actual.group,'library');assert.equal(actual.state,'received');assert.ok(actual.outputs.assetId);assert.ok(actual.outputs.takeId);assert.ok(actual.lastEvent.at);assert.equal(actual.needsAction,null);assert.equal(await hash(source),sourceHash);
 await page.evaluate(()=>localStorage.setItem('product-lab-mode','demo'));await page.reload();await page.getByText('Dữ liệu mô phỏng',{exact:true}).waitFor();assert.equal(await page.locator(selector).count(),0);await screenshot('demo');
 await page.evaluate(()=>localStorage.setItem('product-lab-mode','real'));await page.reload();await page.locator(selector+'[data-group="library"]').waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const result={passed:true,checks,screenshots:shots,pageErrors:errors,externalRequests:external,connectionTests:['stale 10 minutes','disconnected preserves last view','invalid version preserves last view','malformed nested data preserves last view','reconnect','demo/local separation'],localMedia:{realPipeline:true,isolatedDatabase:true,syntheticNewMp4:true,realExternalService:false,runId,before:'attention',after:'library',elapsedMs,sourceUnchanged:true,sourceSha256:sourceHash,metadata:probe.metadata,assetId:actual.outputs.assetId,takeId:actual.outputs.takeId}};
 await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,png:shots.length,localMediaElapsedMs:elapsedMs,sourceUnchanged:true,pageErrors:0,externalRequests:0}));
}finally{await browser?.close();chrome?.kill();closeSync(log);await manual?.close();await local?.close();store.close();}
