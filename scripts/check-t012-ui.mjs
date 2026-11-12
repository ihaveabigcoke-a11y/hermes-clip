// Isolated HTTP/SQLite + headless Chrome. No installed profile or external service.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {getTestBuild,importModule,startLocalServer,sessionCookie} from '../desktop/test/helpers/local-server.mjs';
import {renderFixture} from '../tests/fixtures/render-plan.mjs';
import {Integrations} from '../desktop/src/integrations.mjs';
import {getRenderPlan} from '../lib/lab/render-plan.ts';
import {Store} from '../desktop/src/store.mjs';

const out=resolve('outputs/T-012-ui');await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(out,'isolated-'));
const {emptyProduct}=await importModule('lib/lab/domain.ts');
const evidence=JSON.parse(await readFile('outputs/T-012-render/result.json','utf8'));
const names=['hook1','hook2','hook3','body1','body2'],sources={},assets=[],media=[];
for(const [index,s] of evidence.sources.entries()){
 const id='asset_'+names[index],key='local-owner/'+id+'.mp4',bytes=await readFile(s.path);
 sources[names[index]]={sha256:s.sha256,size:bytes.length};media.push({key,base64:bytes.toString('base64')});
 assets.push({id,kind:'asset',revision:1,updatedAt:Date.now(),data:{key,name:names[index]+'.mp4',type:'video/mp4',size:bytes.length,sha256:s.sha256,metadata:{width:720,height:1280,duration:3,verifiedBy:'container'}}});
}
const f=renderFixture(sources);const records=[{id:'render_product',kind:'product',revision:1,updatedAt:Date.now(),data:{...emptyProduct,name:'Render fixture',price:null,cost:null,shipping:null}},{id:'render_project',kind:'production',revision:1,updatedAt:Date.now(),data:f.production},...assets];
const seed=join(temp,'seed.json');await writeFile(seed,JSON.stringify({records,media}));
const store=new Store(':memory:');
let local,browser,chrome;const errors=[],external=[];
const log=openSync(join(out,'chrome.log'),'w');
try {
 local=await startLocalServer({root:join(temp,'workspace'),seedPath:seed,workerStore:store});
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${join(temp,'chrome')}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','about:blank'],{stdio:['ignore',log,log],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
 let port;for(let i=0;i<120;i++){try{port=(await readFile(join(temp,'chrome/DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
 assert.ok(port,'Chrome did not start');browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addCookies([{name:sessionCookie,value:local.session,url:local.origin,httpOnly:true,sameSite:'Strict'}]);
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==local.origin){external.push('external request blocked');return route.abort();}return route.continue();});
 await context.addInitScript(()=>{
   localStorage.setItem('product-lab-mode','real');const preferences={};
   window.productLabDesktop={status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},manualMediaStatus:async()=>({inbox:'Fixture only',scenes:[],unmatched:[],errors:[]}),assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),museChatList:async()=>[],codexTextSettings:async()=>({enabled:false})};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await mkdir(join(temp,'worker'),{recursive:true});
 const integrations=new Integrations(store,join(temp,'worker'));integrations.saveConfig(JSON.parse(await readFile('desktop/.integrations/config.json','utf8')));
 await page.exposeFunction('testRender',async input=>{
  const response=await fetch(local.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+local.session}}),{records}=await response.json(),record=records.find(r=>r.id===input.projectId);
  assert.equal(record.revision,input.revision);const plan=getRenderPlan(record.data,record.id,input.variantId),clips=[];
  for(const s of plan.segments){const asset=records.find(r=>r.id===s.assetId);const response=await fetch(local.origin+'/api/assets/'+s.assetId,{headers:{Cookie:sessionCookie+'='+local.session}});assert.equal(response.ok,true);clips.push({bytes:new Uint8Array(await response.arrayBuffer()),sha256:s.sha256,duration:asset.data.metadata.duration,inSec:s.inSec,outSec:s.outSec});}
  const job=await integrations.compose({planVersion:1,projectId:record.id,variantId:input.variantId,ratio:plan.ratio,clips,overlays:plan.overlays}),result=await integrations.output(job.id);
  return {...result,bytes:[],renderPlan:plan,preparedToken:local.registerPreparedMedia(result)};
 });
 await page.addInitScript(()=>{window.productLabDesktop.renderPlannedVideo=input=>window.testRender(input);});
 const shots=[];
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:900});await page.goto(local.origin+'/?view=production&production=render_project&stage=variants');
  await page.getByRole('button',{name:'Chọn đoạn & chữ',exact:true}).first().click();const dialog=page.getByRole('dialog');
  await dialog.getByText('Tổng thực tế: 4.00 giây',{exact:true}).waitFor();assert.equal(await dialog.locator('input[type=range]').count(),6);
  await dialog.getByRole('button',{name:'Xem đoạn hook1',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('.render-plan-editor video');return v?.paused&&v.currentTime>=1.3&&v.currentTime<1.6;},null,{timeout:10000});
  assert.equal(await dialog.locator('video').first().evaluate(v=>v.paused),true);
  await page.evaluate(()=>document.fonts.ready);const shot=`segments-${width}.png`;await page.screenshot({path:join(out,shot)});shots.push(shot);
  await dialog.getByRole('button',{name:'Lưu đoạn & chữ',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.getByRole('button',{name:'Xuất MP4 theo đoạn & chữ',exact:true}).first().click();await page.getByText('Đã xuất MP4',{exact:true}).first().waitFor({timeout:120000});
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});const shot=`export-${width}.png`;await page.screenshot({path:join(out,shot),fullPage:true});shots.push(shot);}
 const current=await(await fetch(local.origin+'/api/lab',{headers:{Cookie:sessionCookie+'='+local.session}})).json();const exported=current.records.find(r=>r.id==='render_project').data.exports.at(-1);assert.ok(exported.assetId&&exported.sha256&&exported.verified&&exported.renderPlan);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(join(out,'result.json'),JSON.stringify({passed:true,fixture:true,realLocalRender:true,realService:false,shots,exported,pageErrors:errors,external},null,2));console.log(JSON.stringify({passed:true,shots,sha256:exported.sha256}));
}finally{if(browser){try{await browser.contexts()[0]?.newCDPSession(await browser.contexts()[0].newPage()).then(s=>s.send('Browser.close'));}catch{}await browser.close().catch(()=>{});}closeSync(log);await local?.close();store.close();}
