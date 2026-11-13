// T-007: source UI with synthetic records; all page requests stay intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-007-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-007');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-007-ui-'));
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
      const body=route.request().postDataJSON();assert.ok(['media_provider','formula_draft'].includes(body.action));
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
      status:async()=>({musePaused:paused,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
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
  await page.locator('.compose-shortcuts').getByRole('button',{name:'Khung content',exact:true}).click();
  const composer=page.getByRole('region',{name:'Khung content từ công thức'});
  await composer.waitFor();
  assert.equal(await page.locator('#formula-keyword').inputValue(),'');
  await page.getByRole('button',{name:'Soạn hai mở đầu A/B',exact:true}).click();
  assert.match(await composer.getByRole('alert').innerText(),/từ khóa CTA/);
  await page.locator('#formula-keyword').fill('BIKE');
  await page.locator('#formula-brand').fill('FIXTURE');await page.locator('#formula-box').fill('Night Ride Kit');
  await page.locator('.formula-example').first().click();
  await page.getByRole('button',{name:'Soạn hai mở đầu A/B',exact:true}).click();
  assert.equal(await page.locator('.formula-shot-table tbody tr').count(),11);
  assert.equal(await composer.getByRole('alert').count(),0);
  const screenshots=[];
  for(const [width,height] of [[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
    await page.locator('#formula-keyword').scrollIntoViewIfNeeded();
    await page.locator('#formula-keyword').click({trial:true});
    await page.screenshot({path:join(out,'T-007-form-'+width+'.png'),animations:'disabled'});screenshots.push('T-007-form-'+width+'.png');
    await page.locator('.formula-shot-table').scrollIntoViewIfNeeded();
    const measure=await page.evaluate(()=>{
      const el=document.querySelector('.formula-shot-table'),r=el.getBoundingClientRect();
      const dialog=el.closest('[role="dialog"]'),d=dialog.getBoundingClientRect();
      const times=[...el.querySelectorAll('td.formula-shot-time')].map(cell=>{
        const label=cell.querySelector('.formula-time-label'),style=getComputedStyle(label),cellStyle=getComputedStyle(cell);
        const rect=label.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);
        const lines=new Set([...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>Math.round(r.top))).size;
        return {text:label.textContent,height:rect.height,lineHeight:parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.5,
          lines,whiteSpace:cellStyle.whiteSpace,width:rect.width,availableWidth:cell.clientWidth-parseFloat(cellStyle.paddingLeft)-parseFloat(cellStyle.paddingRight)};
      });
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        dialog:{width:d.width,left:d.left,right:d.right,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth},
        table:{left:r.left,right:r.right,width:r.width},rows:el.querySelectorAll('tbody tr').length,times,visibleText:dialog.innerText};
    });
    measurements.push(measure);
    await writeFile(join(out,`T-007-layout-${width}.json`),JSON.stringify(measure,null,2));
    assert.ok(measure.scrollWidth<=width);assert.ok(measure.table.left>=0&&measure.table.right<=width);assert.equal(measure.rows,11);
    assert.ok(measure.dialog.left>=0&&measure.dialog.right<=width,'Dialog must fit the viewport');
    assert.ok(measure.dialog.scrollWidth<=measure.dialog.clientWidth+1,'Dialog must not overflow horizontally');
    if(width===1920)assert.ok(measure.dialog.width>=1000,JSON.stringify(measure.dialog));
    assert.doesNotMatch(measure.visibleText,/beat_/,'Visible dialog must not expose internal beat IDs');
    assert.equal(measure.times.length,11);
    assert.ok(measure.times.some(time=>time.text==='3,5–4,9 s'),'Use Vietnamese decimal separators and seconds');
    for(const time of measure.times) {
      assert.equal(time.whiteSpace,'nowrap',JSON.stringify(time));
      // Table cells share the height of the multiline description; measure the text inside each cell.
      assert.equal(time.lines,1,JSON.stringify(time));
      assert.ok(time.height<=time.lineHeight+1,JSON.stringify(time));
      assert.ok(time.width<=time.availableWidth+1,JSON.stringify(time));
    }
    const promptDetails=page.locator('.formula-shot-table tbody details');
    await promptDetails.evaluateAll(details=>details.forEach(detail=>{detail.open=true;}));
    assert.doesNotMatch(await page.getByRole('dialog').innerText(),/beat_/,'Expanded prompts must not expose internal beat IDs');
    await promptDetails.evaluateAll(details=>details.forEach(detail=>{detail.open=false;}));
    await page.screenshot({path:join(out,'T-007-shots-'+width+'.png'),animations:'disabled'});screenshots.push('T-007-shots-'+width+'.png');
  }
  await page.locator('#formula-placement').selectOption('caption');
  assert.equal(await page.locator('.formula-shot-table').count(),0,'changing input invalidates the preview');
  await page.getByRole('button',{name:'Soạn hai mở đầu A/B',exact:true}).click();
  await page.getByRole('button',{name:'Lưu cảnh nháp và hai biến thể',exact:true}).click();
  await composer.getByRole('status').waitFor();
  const saved=records[1].data;assert.equal(saved.scenes.length,16);assert.equal(saved.variants.length,2);
  assert.ok(saved.scenes.filter(s=>s.storyboardVersion===2).every(s=>s.voice===''&&!s.ctaOverlay));
  assert.deepEqual(await page.evaluate(()=>window.__manualCalls),{export:0,open:0,muse:0});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(join(out,'T-007-ui.json'),JSON.stringify({fixtureOnly:true,screenshots,measurements,errors,providerCalls:0},null,2));
  console.log('PASS: '+screenshots.length+' PNG; composer preview, validation, caption and save checked.');
}catch(error){await writeFile(join(out,'T-007-ui-blocker.json'),JSON.stringify({fixtureOnly:true,error:error.message,errors,external},null,2));throw error;
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
