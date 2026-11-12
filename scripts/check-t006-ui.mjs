// T-006: source UI with synthetic records; all page requests stay intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-006-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-006');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-006-ui-'));
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction,applyProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
let production=newProduction('Video giới thiệu · dữ liệu kiểm thử','fixture_product',1);
for(const [index,name] of ['Mở đầu · ánh sáng ban đêm','Cận cảnh chất liệu','Kết quả nhìn thấy','Lời kêu gọi hành động'].entries()) {
  const id='scene_'+index;
  production=applyProduction(production,'scene',{id,name,prompt:'Show the reflective strap on a runner at dusk. Keep the product design consistent. Natural lighting, steady camera, no exaggerated claims.',ratio:'9:16',duration:8,mediaType:'video',referenceIds:[]},'create_'+id);
  production=applyProduction(production,'storyboard',{sceneId:id},'approve_'+id);
}
production=applyProduction(production,'manual_result',{sceneId:'scene_0',sceneRevision:1,take:{assetId:'fixture_asset',name:'P12-S01-compressed.mp4',type:'video/mp4',size:5138022,sha256:'b'.repeat(64),metadata:{width:720,height:1280,duration:8,verifiedBy:'container'},compression:{version:1,sourceSha256:'a'.repeat(64),sha256:'b'.repeat(64),sourceSize:19293798,size:5138022,mode:'encoded',overLimit:false,maxBytes:6291456}}},'fixture_manual');
let records=[{id:'fixture_product',kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Reflective Strap · mẫu kiểm thử'}},{id:'fixture_project',kind:'production',revision:1,updatedAt:1,data:production}];
const manual={inbox:'D:\\Media-fixture\\Inbox',scenes:production.scenes.map((scene,index)=>({projectId:'fixture_project',sceneId:scene.id,code:`P12-S0${index+1}`,state:['Chờ xuất prompt','Đã xuất','Chờ file','Đã nhận'][index]})),unmatched:[],errors:[]};
const errors=[],external=[],measurements=[];
// CDP transport avoids named child pipes on restricted Windows hosts.
const chromeLog=openSync(join(out,'chrome-fixture.log'),'w');
const processHandle=spawn(process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${temp}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
  '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
  '--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND','about:blank',
],{stdio:['ignore',chromeLog,chromeLog],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
processHandle.on('exit',(code,signal)=>console.log('Chrome exit:',code,signal));
let launchError;processHandle.on('error',error=>{launchError=error;});
let browser;
try {
  let port;
  for(let attempt=0;attempt<100;attempt++) {
    if(launchError)throw launchError;
    try{port=(await readFile(join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}
  }
  if(!port)throw Error('Chrome fixture did not start.');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()),json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if(url.origin!=='http://127.0.0.1:4174'){external.push(url.href);return route.abort();}
    if(url.pathname==='/api/assistant')return json({connected:false});
    if(url.pathname==='/api/lab')return json({records});
    if(url.pathname==='/api/production') {
      const body=route.request().postDataJSON();assert.equal(body.action,'media_provider');
      const previous=records[1];assert.equal(body.revision,previous.revision);
      const record={...previous,data:applyProduction(previous.data,body.action,body.input,body.commandId),revision:previous.revision+1};records[1]=record;
      return json({record});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Fixture only'});
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  await context.addInitScript(manual=>{
    localStorage.setItem('product-lab-mode','real');
    window.__manualCalls={export:0,open:0,muse:0};window.__manual=manual;
    let paused=true;const preferences={};
    window.productLabDesktop={
      status:async()=>({compression:{enabled:true,maxBytes:6291456,savedBytes:14155776},musePaused:paused,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      manualMediaStatus:async()=>manual,
      manualMediaExport:async()=>{window.__manualCalls.export++;return {path:'D:\\Fixture\\exports\\prompt-packs\\P12-20261112-1905',scenes:manual.scenes.map(row=>row.code)};},
      manualMediaOpen:async()=>{window.__manualCalls.open++;return manual.inbox;},
      setMusePaused:async({paused:value})=>{paused=value;},
      manualMediaConfigure:async({inbox})=>{manual.inbox=inbox;},
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),
      researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
      museChatSend:async()=>{window.__manualCalls.muse++;throw Error('Must not call Muse');},
      museChatList:async()=>[],
    };
  },manual);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/?view=production&production=fixture_project');
  await page.locator('.desk-job').nth(3).waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4174/?view=production&production=fixture_project');
    const note=page.getByTestId('compression-note').first();await note.waitFor();await note.scrollIntoViewIfNeeded();
    assert.match(await note.innerText(),/18,4 MB/);assert.match(await note.innerText(),/4,9 MB/);
    await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`T-006-take-${width}.png`),animations:'disabled'});
    await page.goto('http://127.0.0.1:4174/?view=settings');
    const settings=page.getByTestId('compression-settings');await settings.waitFor();await settings.scrollIntoViewIfNeeded();
    assert.match(await settings.innerText(),/6 MB/);assert.match(await settings.innerText(),/13,5 MB/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`T-006-settings-${width}.png`),animations:'disabled'});
    measurements.push({width,height,takeNoteVisible:true,settingsVisible:true});
  }
  assert.equal(await page.evaluate(()=>window.__manualCalls.muse),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={fixtureOnly:true,networkRequestsToProviders:0,measurements,errors,checks:['compression note on take','compression setting and savings','no external requests','1366 and 1920 viewport without overflow']};
  await writeFile(join(out,'T-006-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
