// T-002b: both switch states across three screens, source UI with synthetic records; all page requests stay intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-002b-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'outputs/T-002b-artifacts');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-002b-ui-'));
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction,applyProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
let production=newProduction('Video giới thiệu · dữ liệu kiểm thử','fixture_product',1);
for(const [index,name] of ['Mở đầu · ánh sáng ban đêm','Cận cảnh chất liệu','Kết quả nhìn thấy','Lời kêu gọi hành động'].entries()) {
  const id='scene_'+index;
  production=applyProduction(production,'scene',{id,name,prompt:'Show the reflective strap on a runner at dusk. Keep the product design consistent. Natural lighting, steady camera, no exaggerated claims.',ratio:'9:16',duration:8,mediaType:'video',referenceIds:[]},'create_'+id);
  production=applyProduction(production,'storyboard',{sceneId:id},'approve_'+id);
}
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
    let paused=localStorage.getItem('fixture:muse-paused')!=='false';const preferences={};
    window.productLabDesktop={
      status:async()=>({musePaused:paused,profiles:[{id:'fixture',name:'Hồ sơ kiểm thử',enabled:true,health:'ready',session:'signed_in',proxy:{server:'',username:'',hasPassword:false},quota:{state:'available',weeklyUsedPercent:20,weeklyRemainingPercent:80,additionalTokens:0},busy:false,open:false,vpnEnabled:false}],jobs:[],active:0,paused:true,generationReady:!paused,batch:null,budget:0,freeRamGb:8,adapter:{enabled:true,startUrl:'https://muse.invalid'},connection:{startUrl:'https://muse.invalid'}}),
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      manualMediaStatus:async()=>manual,
      manualMediaExport:async()=>{window.__manualCalls.export++;return {path:'D:\\Fixture\\exports\\prompt-packs\\P12-20261112-1905',scenes:manual.scenes.map(row=>row.code)};},
      manualMediaOpen:async()=>{window.__manualCalls.open++;return manual.inbox;},
      setMusePaused:async({paused:value})=>{paused=value;localStorage.setItem('fixture:muse-paused',String(value));},
      manualMediaConfigure:async({inbox})=>{manual.inbox=inbox;},
      codexTextSettings:async()=>({enabled:false,executable:''}),saveCodexTextSettings:async()=>({enabled:false}),
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),
      researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
      museChatSend:async()=>{window.__manualCalls.muse++;throw Error('Must not call Muse');},
      museChatList:async()=>[],
    };
  },manual);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/?view=production&production=fixture_project');
  await page.locator('.desk-job').nth(3).waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('button',{name:'Xuất gói prompt',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Đã xuất 4 cảnh'}).waitFor();
  await page.getByRole('button',{name:'Mở hộp nhận media',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Chờ file trong Hộp nhận media'}).waitFor();
  for(const paused of [true,false]){
    await page.setViewportSize({width:1366,height:768});
    await page.goto('http://127.0.0.1:4174/?view=accounts');
    const toggle=page.getByRole('switch',{name:'Muse: Bật / Tạm dừng',exact:true});
    await toggle.waitFor();await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);
    if(!paused){
      await toggle.click();
      await page.getByText('Muse chạy bằng trình duyệt tự động; tài khoản có thể bị khoá. Bật?',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('fixture:muse-paused')),null);
      await page.getByRole('button',{name:'Giữ Tạm dừng',exact:true}).click();assert.equal(await toggle.isChecked(),false);
      await toggle.click();await page.getByRole('button',{name:'Bật Muse',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[role="switch"]').checked);
    }
    for(const [view,label] of [['accounts','tai-khoan-muse'],['settings','cai-dat'],['production','tao-video']]){
      await page.setViewportSize({width:1366,height:768});
      await page.goto('http://127.0.0.1:4174/?view='+view+'&production=fixture_project');
      if(view==='production')await page.locator('.desk-job').nth(3).waitFor();
      else {await page.getByRole('switch',{name:'Muse: Bật / Tạm dừng',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);}
      await page.evaluate(()=>document.fonts.ready);
      if(view!=='production'){
        const switchControl=page.getByRole('switch',{name:'Muse: Bật / Tạm dừng',exact:true});
        assert.equal(await switchControl.isChecked(),!paused);
        assert.equal(await switchControl.getAttribute('aria-checked'),String(!paused));
        assert.equal(await page.locator('.muse-switch-card').count(),1);
        assert.equal(await page.locator('.muse-switch-card [role="status"]').innerText(),paused?'Muse: Đang tạm dừng':'Muse: Đang bật');
        assert.equal(await switchControl.evaluate(element=>element.closest('.account-toggle')!==null),true);
      }
      for(const [width,height] of [[1366,768],[1920,1080]]){
        await page.setViewportSize({width,height});
        if(view==='accounts'){
          // Measure before any scrollIntoView/click can hide a placement regression.
          const placement=await page.evaluate(()=>{
            const card=document.querySelector('.muse-switch-card'),control=card.querySelector('[role="switch"]');
            const rect=card.getBoundingClientRect(),toggle=control.getBoundingClientRect(),style=getComputedStyle(card),switchStyle=getComputedStyle(control);
            const content=document.querySelector('.desktop-console').cloneNode(true);
            content.querySelectorAll('button:disabled,[aria-disabled="true"]').forEach(element=>element.remove());
            return {top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,toggleTop:toggle.top,toggleBottom:toggle.bottom,
              border:parseFloat(style.borderTopWidth),appearance:switchStyle.appearance,toggleWidth:toggle.width,toggleHeight:toggle.height,
              helpCount:(content.textContent.match(/bật lại ở Tài khoản Muse/g)??[]).length};
          });
          assert.ok(placement.top>=48&&placement.bottom<=height&&placement.left>=0&&placement.right<=width,JSON.stringify(placement));
          assert.ok(placement.toggleTop>=placement.top&&placement.toggleBottom<=placement.bottom);
          assert.ok(placement.border>=1,'Muse switch must be inside a bordered card');
          assert.equal(placement.appearance,'none');assert.equal(placement.toggleWidth,40);assert.equal(placement.toggleHeight,24);
          assert.ok(placement.helpCount<=1,'Repeated paused help outside disabled controls: '+placement.helpCount);
          if(paused)for(const name of ['Kiểm tra phiên và hạn mức','Đo hạn mức','Mở Chrome']){
            const button=page.getByRole('button',{name,exact:true});assert.equal(await button.isDisabled(),true);
            assert.equal(await button.getAttribute('title'),'Muse đang tạm dừng, bật lại ở Tài khoản Muse');
          }
          measurements.push({view,paused,width,height,switchPlacement:placement});
        }
        if(view==='settings')await page.getByRole('switch',{name:'Muse: Bật / Tạm dừng',exact:true}).scrollIntoViewIfNeeded();
        if(view==='production'){
          const selector=page.getByLabel('Nhà cung cấp cảnh',{exact:true});assert.equal(await selector.inputValue(),'auto');
          assert.equal(await selector.locator('option[value="muse"]').evaluate(option=>option.disabled),paused);
          for(const id of ['grok-cli','fal'])assert.equal(await selector.locator('option[value="'+id+'"]').evaluate(option=>option.disabled),true);
          assert.match(await page.locator('.desk-job-list').innerText(),new RegExp(paused?'manual':'muse'));
          if(paused)for(const state of ['Chờ xuất prompt','Đã xuất','Chờ file','Đã nhận'])assert.ok((await page.locator('.desk-job-list').innerText()).includes(state));
        }
        const measure=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert.ok(measure.scrollWidth<=width,JSON.stringify(measure));measurements.push({view,paused,...measure});
        await page.screenshot({path:join(out,'T-002b-'+label+'-'+width+'-'+(paused?'tam-dung':'bat')+'.png'),animations:'disabled'});
      }
      assert.equal(await page.evaluate(()=>window.__manualCalls.muse),0);
    }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={fixtureOnly:true,networkRequestsToProviders:0,measurements,errors,checks:['12 screenshots: three screens, two widths, two states','enable requires confirmation; cancel keeps paused','switch synchronized after navigation/reload with aria-checked','shared bordered Muse card and existing account-toggle style','account switch fully visible at 1366x768 before scrolling','at most one paused help outside disabled controls; disabled controls have title','automatic media manual to Muse','disabled options via DOM property','no external provider calls']};
  await writeFile(join(out,'T-002b-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
