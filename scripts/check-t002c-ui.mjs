// T-002c: synthetic UI only; intercepted requests, temporary browser profile, no real services.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';
import {instagramOverviewFixture} from '../tests/fixtures/instagram-overview.mjs';
import {researchResult} from '../tests/fixtures/text-exchange.mjs';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-002c-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-002c');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-002c-ui-'));
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction,applyProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
let production=newProduction('Video giới thiệu · dữ liệu kiểm thử','video_product',1);
for(const [index,name] of ['Mở đầu · ánh sáng ban đêm','Cận cảnh chất liệu','Kết quả nhìn thấy','Lời kêu gọi hành động'].entries()) {
  const id='scene_'+index;
  production=applyProduction(production,'scene',{id,name,prompt:'Show the reflective strap on a runner at dusk. Keep the product design consistent. Natural lighting, steady camera, no exaggerated claims.',ratio:'9:16',duration:8,mediaType:'video',referenceIds:[]},'create_'+id);
  production=applyProduction(production,'storyboard',{sceneId:id},'approve_'+id);
}
const {researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
let records=[{id:'video_product',kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Reflective Strap · mẫu kiểm thử'}},{id:'fixture_project',kind:'production',revision:1,updatedAt:1,data:production}];
records.push({id:'fixture_batch',kind:'research_batch',revision:1,updatedAt:1,data:researchBatchSchema.parse({name:'T-002c · Đợt giả lập'})});
records.push(...instagramOverviewFixture().records.filter(row=>row.kind!=='production').map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row));
const manual={inbox:'D:\\Media-fixture\\Inbox',scenes:production.scenes.map((scene,index)=>({projectId:'fixture_project',sceneId:scene.id,code:`P12-S0${index+1}`,state:['Chờ xuất prompt','Đã xuất','Chờ file','Đã nhận'][index]})),unmatched:[],errors:[]};
const errors=[],external=[],measurements=[];
// Mount TextExchange alone so unrelated screen timers cannot mask regressions.
const exchangeEntry=join(temp,'exchange.tsx');
await writeFile(exchangeEntry,`
import React from 'react';
import {createRoot} from 'react-dom/client';
import TextExchange from '${join(root,'components/lab/text-exchange.tsx').replaceAll('\\','/')}';
const root=createRoot(document.getElementById('root'));
root.render(<TextExchange kind="research" scope="fixture_batch" context={{}} target="Fixture import" disabled={false} demo={false}
  onMuse={async()=>{window.__textCalls.muse++;}} onApply={async()=>{window.__textCalls.apply++;}}/>);
`);
await writeFile(join(temp,'index.html'),'<html><body><div id="root"></div><script type="module" src="./exchange.tsx"></script></body></html>');
await viteBuild({configFile:false,root:temp,base:'/text-fixture/',publicDir:false,plugins:[react()],resolve:{alias:{'@':root}},build:{outDir:join(temp,'bundle')}});

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
    if(url.pathname.startsWith('/text-fixture/')) {
      const file=resolve(temp,'bundle',url.pathname.slice('/text-fixture/'.length)||'index.html');assert.ok(file.startsWith(join(temp,'bundle')+sep));
      return route.fulfill({body:await readFile(file),contentType:file.endsWith('.js')?'text/javascript':'text/html'});
    }
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
  await context.addInitScript(({manual,researchResult,sceneRevision})=>{
    localStorage.setItem('product-lab-mode','real');
    window.__manualCalls={export:0,open:0,muse:0};window.__manual=manual;
    let paused=true;const preferences={};
    window.__textCalls={status:0,settings:0,current:0,legacy:0,research:0,codex:0,muse:0,apply:0};
    window.__textEnabled=false;window.__textReady=false;
    const jobs=[{id:'fixture_old_job',state:'needs_attention',label:'Cần đối soát',createdAt:100,provider:'muse',providerId:'fixture_result',profileId:'fixture_profile',
      request:{projectId:'fixture_project',sceneId:'scene_0',sceneRevision,productId:'video_product',productRevision:1,
        mediaType:'video',ratio:'9:16',duration:8,name:'Mở đầu · ánh sáng ban đêm',references:[]},
      history:[{at:100,state:'needs_attention',note:'Kết quả giả lập chưa rõ; cần đối soát.'}]}];
    window.productLabDesktop={
      status:async()=>{window.__textCalls.status++;return {musePaused:!window.__textReady,profiles:window.__textReady?[{id:'fixture',enabled:true,health:'ready',session:'signed_in',quota:{state:'available',weeklyRemainingPercent:50}}]:[],jobs,active:0,paused:true,generationReady:window.__textReady,batch:null};},
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      manualMediaStatus:async()=>manual,
      manualMediaExport:async()=>{window.__manualCalls.export++;return {path:'D:\\Fixture\\exports\\prompt-packs\\P12-20261112-1905',scenes:manual.scenes.map(row=>row.code)};},
      manualMediaOpen:async()=>{window.__manualCalls.open++;return manual.inbox;},
      setMusePaused:async({paused:value})=>{paused=value;},
      manualMediaConfigure:async({inbox})=>{manual.inbox=inbox;},
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),
      researchStatus:async()=>{window.__textCalls.research++;return {runs:[]};},instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
      museChatSend:async()=>{window.__manualCalls.muse++;throw Error('Must not call Muse');},
      museChatList:async({projectId=''}={})=>{window.__textCalls[projectId.startsWith('task_research_')?'legacy':'current']++;return [];},
      codexTextSettings:async()=>{window.__textCalls.settings++;return {enabled:window.__textEnabled};},
      codexTextRun:async()=>{window.__textCalls.codex++;return {text:JSON.stringify(researchResult)};},
    };
  },{manual,researchResult,sceneRevision:production.scenes[0].revision});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  // Fake timers exercise the mounted component, including its desktop status hook.
  await page.clock.install();
  await page.goto('http://127.0.0.1:4174/text-fixture/');
  await page.getByRole('status').filter({hasText:'Mặc định: Nhập JSON'}).waitFor();
  await page.waitForFunction(()=>window.__textCalls.research===1&&window.__textCalls.settings===1);
  const mounted=await page.evaluate(()=>({...window.__textCalls}));
  assert.deepEqual(mounted,{status:1,settings:1,current:1,legacy:1,research:1,codex:0,muse:0,apply:0});
  await page.clock.runFor(10000);
  assert.deepEqual(await page.evaluate(()=>window.__textCalls),mounted,'10 seconds idle must make zero IPC calls');
  await page.evaluate(()=>window.dispatchEvent(new Event('product-lab:workspace-changed')));
  await page.waitForFunction(()=>window.__textCalls.research===2);
  assert.deepEqual(await page.evaluate(()=>window.__textCalls),{...mounted,status:2,current:2,legacy:2,research:2});
  await page.evaluate(()=>{window.__textEnabled=true;window.dispatchEvent(new Event('product-lab:codex-settings-changed'));});
  await page.getByRole('status').filter({hasText:'Mặc định: Codex CLI'}).waitFor();
  await page.getByRole('button',{name:'Chạy Codex CLI',exact:true}).click();
  // Inspect with Node's clock before resuming browser time. This distinguishes
  // an already-open, prefilled dialog from a dialog waiting on a frozen timer.
  const dialogSnapshot=()=>page.evaluate(()=>{
    const input=document.querySelector('[role="dialog"] textarea');
    return {calls:{...window.__textCalls},dialog:!!input,visible:!!input&&input.getBoundingClientRect().height>0,
      labelText:input?.labels?.[0]?.textContent??null,value:input?.value??null};
  });
  let beforeResume;
  for(let i=0;i<20;i++){
    beforeResume=await dialogSnapshot();
    if(beforeResume.visible&&beforeResume.value)break;
    await delay(50);
  }
  beforeResume.exactLabelMatches=await page.getByLabel('Dán JSON',{exact:true}).count();
  await writeFile(join(out,'T-002c-codex-dialog-before-resume.json'),JSON.stringify(beforeResume,null,2));
  // Fake time belongs only to the polling check; let portal/focus timers run normally.
  await page.clock.resume();
  await page.waitForFunction(()=>window.__textCalls.codex===1);
  const dialog=page.getByRole('dialog',{name:'Nhập kết quả research',exact:true});
  await dialog.waitFor();
  // A wrapping label includes the textarea's initial JSON text in Playwright's
  // label text. Match its stable prefix, then verify the actual returned value.
  const jsonInput=dialog.getByLabel(/^Dán JSON/);
  await jsonInput.waitFor();
  assert.deepEqual(JSON.parse(await jsonInput.inputValue()),researchResult);
  const codexDialog=await jsonInput.evaluate(el=>({visible:el.getBoundingClientRect().height>0,
    labelText:el.labels?.[0]?.textContent,valueLength:el.value.length}));
  codexDialog.exactLabelMatches=await page.getByLabel('Dán JSON',{exact:true}).count();
  codexDialog.beforeResume=beforeResume;
  codexDialog.cause=beforeResume.visible&&beforeResume.value&&beforeResume.exactLabelMatches===0
    ?'exact label includes initial textarea JSON; dialog was already visible before clock.resume'
    :!beforeResume.visible?'dialog became visible after clock.resume; before/after captured':'dialog visible; see captured selector diagnostics';
  await writeFile(join(out,'T-002c-codex-dialog.json'),JSON.stringify(codexDialog,null,2));
  assert.equal(await page.evaluate(()=>window.__textCalls.research),3,'read immediately before fake CLI');
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.waitForFunction(()=>window.__textCalls.apply===1);
  assert.equal(await page.evaluate(()=>window.__textCalls.research),4,'read immediately before import');
  await page.evaluate(()=>{window.__textReady=true;window.dispatchEvent(new Event('product-lab:workspace-changed'));});
  await page.getByRole('status').filter({hasText:'Mặc định: Muse'}).waitFor();
  await page.getByRole('button',{name:'Bắt đầu bằng Muse',exact:true}).click();
  await page.waitForFunction(()=>window.__textCalls.muse===1);
  assert.equal(await page.evaluate(()=>window.__textCalls.research),6,'read immediately before fake Muse action');
  const textCalls=await page.evaluate(()=>window.__textCalls);

  for(const [width,height] of [[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4174/?view=production&production=fixture_project');
    const skip=page.getByRole('button',{name:'Bỏ qua, không đối soát',exact:true});
    await skip.waitFor();await skip.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.getByRole('status').filter({hasText:'Cần đối soát'}).count());
    for(const id of ['muse','grok-cli','fal'])assert.equal(await page.getByLabel('Nhà cung cấp cảnh',{exact:true}).locator(`option[value="${id}"]`).evaluate(o=>o.disabled),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`T-002c-tao-video-${width}.png`),animations:'disabled'});

    await page.goto('http://127.0.0.1:4174/?view=research&ops_id=fixture_batch');
    const exchange=page.locator('.text-exchange');await exchange.waitFor();await exchange.scrollIntoViewIfNeeded();
    assert.match(await exchange.innerText(),/Mặc định: Nhập JSON/);
    assert.doesNotMatch(await exchange.innerText(),/Mặc định: (import:json|codex|muse)/);
    await page.screenshot({path:join(out,`T-002c-nghien-cuu-${width}.png`),animations:'disabled'});
    await exchange.screenshot({path:join(out,`T-002c-nhap-ket-qua-${width}.png`),animations:'disabled'});

    await page.goto('http://127.0.0.1:4174/?view=social');
    const region=page.getByRole('region',{name:'Bảng tổng quan Instagram theo sản phẩm'});
    await region.waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.doesNotMatch(await page.locator('.operations-panel').innerText(),/Muse đang tạm dừng, bật lại ở Tài khoản Muse/);
    assert.ok(await page.getByText('Cuộn ngang để xem DM đã gửi, Click UTM, Cập nhật và Chi tiết →',{exact:true}).isVisible());
    await page.screenshot({path:join(out,`T-002c-instagram-${width}.png`),animations:'disabled'});
    const before=await region.evaluate(el=>({left:el.querySelector('tbody th').getBoundingClientRect().left,width:el.clientWidth,scrollWidth:el.scrollWidth}));
    await region.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    const measure=await region.evaluate(el=>({left:el.querySelector('tbody th').getBoundingClientRect().left,scrollLeft:el.scrollLeft,
      pageWidth:document.documentElement.scrollWidth,width:innerWidth,position:getComputedStyle(el.querySelector('tbody th')).position,
      lastRight:el.querySelector('thead th:last-child').getBoundingClientRect().right,regionRight:el.getBoundingClientRect().right}));
    assert.equal(measure.position,'sticky');assert.ok(Math.abs(measure.left-before.left)<=1);assert.ok(measure.pageWidth<=width);
    assert.ok(measure.lastRight<=measure.regionRight+1);
    if(width===1366)assert.ok(measure.scrollLeft>0,'1366px must scroll inside the table');
    measurements.push({width,before,after:measure});
    await page.screenshot({path:join(out,`T-002c-instagram-cot-cuoi-${width}.png`),animations:'disabled'});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={fixtureOnly:true,externalRequests:external,errors,textCalls,codexDialog,measurements,
    checks:['TextExchange mounted render labels','fake timers 10 seconds: zero IPC','workspace-changed: one receipt refresh','fresh check before CLI, import and Muse','scene needs reconciliation with skip button','Instagram sticky product column and local horizontal scrolling']};
  await writeFile(join(out,'T-002c-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
