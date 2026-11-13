// T-005: source UI, synthetic records, intercepted HTTP and a temporary Chrome profile.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {t005Batch} from '../tests/fixtures/t005-research.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-005-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-005');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-005-ui-'));
const {schemas}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
const {researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const batch=t005Batch(researchBatchSchema),original=structuredClone(batch);
let records=[],failPromote=true,promoteCalls=0,createCalls=0,labReads=0;
const errors=[],external=[],measurements=[],screenshots=[];
const reset=()=>{records=[{id:'fixture_batch',kind:'research_batch',revision:1,updatedAt:1,data:structuredClone(batch)}];promoteCalls=0;createCalls=0;};
reset();
const chromeLog=openSync(join(out,'chrome-fixture.log'),'w');
const processHandle=spawn(process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--no-sandbox','--disable-gpu',`--user-data-dir=${temp}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
  '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
  '--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND','about:blank',
],{stdio:['ignore',chromeLog,chromeLog],windowsHide:true,env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp,TEMP:temp,TMP:temp}});
let launchError;processHandle.on('error',error=>{launchError=error;});
let browser;
try {
  let port;
  for(let attempt=0;attempt<100;attempt++) {
    if(launchError)throw launchError;
    try{port=(await readFile(join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}
  }
  if(!port)throw Error('Chrome fixture did not start; see chrome-fixture.log.');
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()),json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(url.origin!=='http://127.0.0.1:4174'){external.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab') {
      if(route.request().method()==='GET'){labReads++;return json({records});}
      const body=route.request().postDataJSON();assert.equal(body.kind,'product');assert.equal(body.action,'promote');promoteCalls++;
      if(failPromote)return json({error:'Kiểm tra các trường được đánh dấu.',fields:{problem:'Tối đa 1000 ký tự.',proofNotes:'Tối đa 2000 ký tự.'}},422);
      const existing=records.find(row=>row.id===body.id);if(existing)return json({record:existing,deduplicated:true});
      const data=schemas.product.parse(body.data);assert.match(data.problem,/đã rút gọn/);assert.match(data.proofNotes,/đã rút gọn/);
      const record={id:body.id,kind:'product',data,revision:1,updatedAt:2};records.push(record);return json({record});
    }
    if(url.pathname==='/api/production') {
      const body=route.request().postDataJSON();createCalls++;assert.equal(body.action,'create');assert.equal(body.input.reuseProduct,true);
      assert.equal(body.input.mediaProvider,undefined);assert.equal(body.input.creativeId,undefined);
      const existing=records.find(row=>row.kind==='production'&&row.data.productId===body.input.productId);
      if(existing)return json({record:existing,deduplicated:true});
      const record={id:body.id,kind:'production',revision:1,updatedAt:3,data:newProduction(body.input.name,body.input.productId,1,body.input.locale)};
      records.push(record);return json({record});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Fixture only'});
    const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(file.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  await context.addInitScript(()=>{
    localStorage.setItem('product-lab-mode','real');window.__t005ProviderCalls=0;
    const forbidden=async()=>{window.__t005ProviderCalls++;throw Error('No provider calls in T-005');},preferences={};
    window.productLabDesktop={
      status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      manualMediaStatus:async()=>({inbox:'Fixture only',scenes:[],unmatched:[],errors:[]}),
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),
      instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
      museChatList:async()=>[],codexTextSettings:async()=>({enabled:false}),
      museChatSend:forbidden,researchStart:forbidden,codexTextRun:forbidden,enqueue:forbidden,manualMediaExport:forbidden,
    };
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const researchUrl='http://127.0.0.1:4174/?view=research&ops_id=fixture_batch';
  const complete=()=>page.getByRole('button',{name:'Hoàn tất tạo hồ sơ',exact:true});
  const deploy=()=>page.getByRole('button',{name:'Triển khai 3 sản phẩm →',exact:true});
  async function waitFor(check,label){for(let i=0;i<100;i++){if(check())return;await delay(50);}assert.fail(label);}
  async function layoutSnapshot(state) {
    return page.evaluate(state=>{
      const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const describe=element=>element?{tag:element.tagName,id:element.id,className:String(element.className),...rect(element),
        ...Object.fromEntries(['position','zIndex','overflowX','overflowY','visibility','opacity','pointerEvents','backgroundColor','transform','contain'].map(key=>[key,getComputedStyle(element)[key]]))}:null;
      const inspect=element=>{
        const r=rect(element),cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
        const points=[[cx,cy],[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+3,r.bottom-3],[r.right-3,r.bottom-3]];
        return {text:element.textContent,element:describe(element),inViewport:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
          points:points.map(([x,y])=>{const hit=document.elementFromPoint(x,y);return {x,y,exact:hit===element,owned:!!hit&&(hit===element||element.contains(hit)),hit:describe(hit),stack:document.elementsFromPoint(x,y).slice(0,6).map(describe)};}),
          ancestors:(()=>{const rows=[];for(let parent=element.parentElement;parent;parent=parent.parentElement)rows.push(describe(parent));return rows;})()};
      };
      // Disabled controls intentionally have pointer-events:none. Their bounds
      // are checked below; hit-test every actionable control and all error text.
      const selector=state==='tao-video'?'#production-project':'.research-selection-heading strong,.research-selection-heading p,.research-selection-action .research-warning,.research-selection-action .inline-error,.research-selection-bar button:not(:disabled)';
      return {state,width:innerWidth,height:innerHeight,scrollX,scrollY,scrollWidth:document.documentElement.scrollWidth,
        targets:[...document.querySelectorAll(selector)].filter(element=>element.getClientRects().length).map(inspect),
        project:state==='tao-video'?document.querySelector('#production-project')?.selectedOptions[0]?.textContent:null};
    },state);
  }
  async function settleLayout(state) {
    // scrollIntoViewIfNeeded only guarantees geometry. Wait for scrolling/layout
    // to stop across painted frames before hit-testing or taking the screenshot.
    await page.evaluate(async state=>{
      const target=document.querySelector(state==='tao-video'?'#production-project':'.research-selection-bar');
      let previous='',stable=0;
      const start=performance.now();
      while(performance.now()-start<3000){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const r=target.getBoundingClientRect(),key=JSON.stringify([scrollX,scrollY,r.x,r.y,r.width,r.height]);
        stable=key===previous?stable+1:0;previous=key;
        if(stable>=4&&performance.now()-start>=200)return;
      }
      throw Error('Layout/scroll did not settle within 3 seconds.');
    },state);
  }
  function assertUncovered(snapshot) {
    assert.ok(snapshot.targets.length,'No targets to inspect');
    for(const target of snapshot.targets){
      assert.ok(target.inViewport,`Outside viewport: ${target.text}`);
      assert.ok([target.element,...target.ancestors].every(element=>element.visibility==='visible'&&Number(element.opacity)>0),`Invisible: ${target.text}`);
      assert.ok(target.points.every(point=>point.owned),`Covered/clipped: ${target.text}; see DOM JSON for hit element and ancestor styles`);
      if(target.text==='Hoàn tất tạo hồ sơ')assert.equal(target.points[0].exact,true,'elementFromPoint at button center must return the button itself');
    }
    if(snapshot.state==='thieu-ho-so'){
      assert.equal(snapshot.targets.filter(target=>target.text==='Hoàn tất tạo hồ sơ').length,1);
      assert.equal(snapshot.targets.filter(target=>target.element.className.includes('inline-error')).length,3);
      assert.ok(snapshot.targets.some(target=>target.text.includes('3 sản phẩm chưa tạo hồ sơ')));
    }
    if(snapshot.state==='tao-video'){
      assert.equal(snapshot.scrollY,0,'Capture Tạo video at the top of the page');
      assert.ok(snapshot.project?.includes(batch.candidates[0].name),'First product must be visible in the project selector');
    }
  }
  async function capture(state,width) {
    await page.evaluate(()=>document.fonts.ready);
    if(state==='tao-video')await page.evaluate(()=>{
      for(let element=document.querySelector('.production-workbench');element;element=element.parentElement)element.scrollTo({top:0,left:0,behavior:'instant'});
      window.scrollTo({top:0,left:0,behavior:'instant'});
    });
    else await page.locator('.research-selection-bar').evaluate(element=>element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
    const before=await layoutSnapshot(state);
    await writeFile(join(out,`T-005-${state}-${width}-dom-before.json`),JSON.stringify(before,null,2));
    await settleLayout(state);
    const settled=await layoutSnapshot(state);
    await writeFile(join(out,`T-005-${state}-${width}-dom-settled.json`),JSON.stringify(settled,null,2));
    try { assertUncovered(settled); }
    catch(error){await page.screenshot({path:join(out,`T-005-${state}-${width}-blocked.png`),animations:'disabled'});throw error;}
    if(state==='thieu-ho-so')await complete().click({trial:true,timeout:3000});
    const measure=await page.evaluate(state=>({state,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      buttons:[...document.querySelectorAll(state==='tao-video'?'.production-projectbar button':'.research-selection-bar button')].filter(button=>button.offsetParent).map(button=>{
        const rect=button.getBoundingClientRect();return {text:button.textContent,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,background:getComputedStyle(button).backgroundColor};
      })}),state);
    assert.ok(measure.scrollWidth<=width,JSON.stringify(measure));
    assert.ok(measure.buttons.every(button=>button.left>=0&&button.right<=width),JSON.stringify(measure));
    if(state!=='tao-video')assert.ok(measure.buttons.every(button=>button.top>=0&&button.bottom<=measure.height),JSON.stringify(measure));
    const filename=`T-005-${state}-${width}.png`;await page.screenshot({path:join(out,filename),animations:'disabled'});
    const after=await layoutSnapshot(state);
    await writeFile(join(out,`T-005-${state}-${width}-dom-after.json`),JSON.stringify(after,null,2));
    assertUncovered(after);
    screenshots.push(filename);measurements.push(measure);
  }
  for(const [width,height] of [[1366,768],[1920,1080]]) {
    reset();failPromote=true;await page.setViewportSize({width,height});await page.goto(researchUrl);
    await page.locator('.research-selection-bar .inline-error').nth(2).waitFor();
    assert.equal(promoteCalls,3);assert.equal(await complete().isEnabled(),true);
    assert.match(await page.locator('.research-selection-bar').innerText(),/problem/);assert.match(await page.locator('.research-selection-bar').innerText(),/proofNotes/);
    assert.ok((await page.locator('.research-candidate-table').innerText()).includes('Nguồn research: Muse'));
    await capture('thieu-ho-so',width);
    const reads=labReads;await page.evaluate(()=>window.dispatchEvent(new Event('product-lab:workspace-changed')));
    await waitFor(()=>labReads>reads,'reload requested');await delay(250);
    assert.equal(promoteCalls,3,'reload must not loop automatic retries');
    failPromote=false;await complete().evaluate(button=>{button.click();button.click();});await deploy().waitFor();
    await page.getByText('✓ 3/3 hồ sơ sẵn sàng',{exact:true}).waitFor();
    assert.equal(await complete().count(),0);assert.equal(records.filter(row=>row.kind==='product').length,3);
    assert.equal(promoteCalls,6,'one bulk click attempts each missing row once');
    await capture('san-sang',width);await deploy().evaluate(button=>{button.click();button.click();});
    await page.waitForURL(url=>url.searchParams.get('view')==='production');
    if(await page.getByRole('dialog').isVisible())await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();await page.locator('#production-project').waitFor({state:'visible'});assert.equal(new URL(page.url()).searchParams.get('view'),'production');
    const firstProduct=records.find(row=>row.kind==='product');
    const firstProject=records.find(row=>row.kind==='production'&&row.data.productId===firstProduct.id);
    assert.equal(await page.locator('#production-project').inputValue(),firstProject.id);
    assert.equal(records.filter(row=>row.kind==='production').length,3);
    const provider=page.getByLabel('Nhà cung cấp cả dự án',{exact:true});
    assert.equal(await provider.inputValue(),'auto');
    for(const id of ['muse','grok-cli','fal'])assert.equal(await provider.locator(`option[value="${id}"]`).evaluate(option=>option.disabled),true);
    assert.match(await page.getByRole('status').filter({hasText:'Đã tạo 3 dự án video.'}).innerText(),/Bước tiếp: viết cảnh → duyệt → Xuất gói prompt cho Flow\/Gemini/);
    await capture('tao-video',width);
    await page.goto(researchUrl);await deploy().click();await page.waitForURL(url=>url.searchParams.get('view')==='production');if(await page.getByRole('dialog').isVisible())await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();await page.locator('#production-project').waitFor({state:'visible'});
    assert.equal(records.filter(row=>row.kind==='production').length,3);assert.equal(promoteCalls,6);
    assert.ok(records.filter(row=>row.kind==='production').every(row=>row.data.scenes.length===0));
    assert.deepEqual(records.find(row=>row.kind==='research_batch').data,original);
    assert.equal(await page.evaluate(()=>window.__t005ProviderCalls),0);
    // A fresh screen with no simulated failures automatically completes all 3.
    reset();failPromote=false;await page.goto(researchUrl);
    await page.getByText('✓ 3/3 hồ sơ sẵn sàng',{exact:true}).waitFor();assert.equal(promoteCalls,3);
  }
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await writeFile(join(out,'T-005-ui.json'),JSON.stringify({fixtureOnly:true,providerCalls:0,screenshots,measurements,errors,
    checks:['auto promote three','one attempt per mount despite reload','field-specific errors','bulk completion','double click and reopen dedupe','navigate first project','zero scenes or provider calls',
      'scroll/layout stable before capture','warning and every error uncovered at center and corners','complete button exact elementFromPoint center and Playwright actionability at 1366/1920','production captured at page top with first product selected']},null,2));
  console.log(`PASS: ${screenshots.length} screenshots; fixture UI assertions passed.`);
}catch(error){await writeFile(join(out,'T-005-ui-blocker.json'),JSON.stringify({fixtureOnly:true,error:error.message,screenshots,errors,external},null,2));throw error;}
finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
