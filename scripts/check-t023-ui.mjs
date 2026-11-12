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

const out=resolve('outputs/T-023-ui');await mkdir(out,{recursive:true});
const temp=await mkdtemp(join(out,'isolated-'));
const {emptyProduct}=await importModule('lib/lab/domain.ts');
const evidence=JSON.parse(await readFile('outputs/T-012-render/result.json','utf8'));
const names=['hook1','hook2','hook3','body1','body2'],sources={},assets=[],media=[];
for(const [index,s] of evidence.sources.entries()){
 const id='asset_'+names[index],key='local-owner/'+id+'.mp4',bytes=await readFile(s.path);
 sources[names[index]]={sha256:s.sha256,size:bytes.length};media.push({key,base64:bytes.toString('base64')});
 assets.push({id,kind:'asset',revision:1,updatedAt:Date.now(),data:{key,name:names[index]+'.mp4',type:'video/mp4',size:bytes.length,sha256:s.sha256,metadata:{width:720,height:1280,duration:3,verifiedBy:'container'}}});
}
const f=renderFixture(sources);f.production.scenes.forEach(s=>s.takes=[]);const records=[{id:'render_product',kind:'product',revision:1,updatedAt:Date.now(),data:{...emptyProduct,name:'Render fixture',price:null,cost:null,shipping:null}},{id:'render_project',kind:'production',revision:1,updatedAt:Date.now(),data:f.production},...assets];
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
   window.productLabDesktop={status:async()=>({musePaused:false,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},manualMediaStatus:async()=>({inbox:'Fixture only',scenes:[],unmatched:[],errors:[]}),assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),museChatList:async()=>[],codexTextSettings:async()=>({enabled:false}),museNightStatus:async()=>({remaining:12,limit:12,submitted:0,successful:0,errors:0,intervalSeconds:60,stopped:false,stopReason:null}),saveMusePacing:async p=>({remaining:12,limit:12,submitted:0,successful:0,errors:0,stopped:false,stopReason:null,...p}),musePackagePreview:async p=>({projectId:p.projectId,revision:1,count:5,blocked:0,night:{remaining:12,limit:12,submitted:0,intervalSeconds:60,stopped:false,stopReason:null}})};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const shots=[];
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:900});await page.goto(local.origin+'/?view=production&production=render_project&stage=scenes');
  await page.getByRole('button',{name:'Tạo bằng Muse',exact:true}).waitFor();await page.getByText('5 lượt sẽ gửi · Đêm còn 12/12 lượt · Giãn 60 giây',{exact:true}).waitFor();
  let file=`package-${width}.png`;await page.screenshot({path:join(out,file),fullPage:true});shots.push(file);
  await page.goto(local.origin+'/?view=settings');await page.getByLabel('Giãn nhịp Muse',{exact:true}).waitFor();assert.equal(await page.getByLabel('Giãn nhịp Muse',{exact:true}).inputValue(),'60');
  file=`settings-${width}.png`;await page.screenshot({path:join(out,file),fullPage:true});shots.push(file);
 }
 const sample={id:'refused_fixture',provider:'muse',request:{projectId:'render_project',productId:'render_product',sceneId:'hook1'},state:'failed',errorKind:'refused',createdAt:Date.now(),history:[]};store.put({...sample,fingerprint:sample.id});
 await page.goto(local.origin+'/?view=signals');await page.locator('[data-group="refused"]').waitFor();await page.getByLabel('Lọc lượt theo trạng thái').selectOption('refused');assert.equal(await page.locator('.office-run').count(),1);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:900});const file=`signals-refused-${width}.png`;await page.screenshot({path:join(out,file),fullPage:true});shots.push(file);}
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await writeFile(join(out,'result.json'),JSON.stringify({passed:true,fixture:true,realMuse:false,shots,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,shots}));
}finally{if(browser){try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch{}await browser.close().catch(()=>{});}closeSync(log);await local?.close();store.close();}
