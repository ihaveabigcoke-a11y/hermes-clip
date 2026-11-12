// T-003: offline research import UI; no provider, real profile or database.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-003-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'outputs/T-003-artifacts');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-003-ui-'));

const {emptyProduct,schemas}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const {skillProduct,researchResult,contentResult,landingResult}=await import('./../tests/fixtures/text-exchange.mjs');
let records=[{id:'fixture_batch',kind:'research_batch',revision:1,updatedAt:1,data:researchBatchSchema.parse({name:'T-003 · Dữ liệu giả lập'})},
 ...['a','b'].map(id=>({id:'product_'+id,kind:'product',revision:1,updatedAt:1,data:{...emptyProduct,name:'Fixture product '+id}}))];
const errors=[],external=[],measurements=[],writes=[];
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
    const request=route.request(),url=new URL(request.url());
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(url.origin!=='http://127.0.0.1:4174'){external.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab'){
      if(request.method()==='GET')return json({records});
      const body=request.postDataJSON(),previous=records.find(r=>r.id===body.id);
      if((previous?.revision??0)!==body.revision)return json({error:'Fixture CAS'},409);
      const data=schemas[body.kind].parse(body.data);
      const record={id:body.id,kind:body.kind,data,revision:(previous?.revision??0)+1,updatedAt:2};
      records=[record,...records.filter(r=>r.id!==body.id)];writes.push(body);return json({record});
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture only'},404);
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  await context.addInitScript(()=>{
    localStorage.setItem('product-lab-mode','real');window.__providerCalls={muse:0,codex:0};window.__copied='';
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});
    const preferences={};
    window.productLabDesktop={
      status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      codexTextSettings:async()=>({enabled:false,executable:''}),
      codexTextRun:async()=>{window.__providerCalls.codex++;throw Error('CLI fixture stays off');},
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),
      researchStatus:async()=>({runs:[]}),instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
      museChatSend:async()=>{window.__providerCalls.muse++;throw Error('Must not call Muse');},museChatList:async()=>[],
    };
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/?view=research&ops_id=fixture_batch');
  await page.getByRole('button',{name:'Nhập kết quả research',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.getByRole('button',{name:'Chạy Codex CLI',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Copy prompt research',exact:true}).click();
  assert.match(await page.evaluate(()=>window.__copied),/remainingSlots/);assert.doesNotMatch(await page.evaluate(()=>window.__copied),/\bMuse\b/);
  await page.getByRole('button',{name:'Nhập kết quả research',exact:true}).click();
  await page.getByLabel('Công cụ tạo JSON',{exact:true}).fill('Claude');
  await page.getByLabel('Dán JSON',{exact:true}).fill(JSON.stringify({...skillProduct,listingStatus:'showroom'}));
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'candidates.0.cost'}).waitFor();assert.equal(writes.length,0);
  await page.getByLabel('Chọn file JSON (tối đa 384 KB)',{exact:true}).setInputFiles({name:'skill.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(skillProduct))});
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.locator('.research-candidate-table tbody tr').waitFor();assert.equal(records.find(r=>r.id==='fixture_batch').data.candidates.length,1);
  assert.match(await page.locator('.research-candidate-table').innerText(),/Giữ/);assert.match(await page.locator('.research-candidate-table').innerText(),/Dễ vỡ/);
  await page.getByRole('button',{name:'Nhập kết quả research',exact:true}).click();
  await page.getByLabel('Dán JSON',{exact:true}).fill(JSON.stringify({...researchResult,candidates:researchResult.candidates.slice(1)}));
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.locator('.research-candidate-table tbody tr').nth(9).waitFor();
  const batch=records.find(r=>r.id==='fixture_batch').data;assert.equal(batch.candidates.length,10);assert.deepEqual(batch.selectedIds,[]);
  assert.equal(batch.candidates[1].cost,null);assert.equal(batch.candidates[0].costCurrency,'CNY');
  for(const [width,height] of [[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));
    const measure=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(measure.scrollWidth<=width,JSON.stringify(measure));measurements.push(measure);
    await page.screenshot({path:join(out,`T-003-nghien-cuu-${width}.png`),fullPage:true,animations:'disabled'});
  }
  // Bind imported copy to product B even when product A also exists.
  await page.goto('http://127.0.0.1:4174/?view=social&ops_id=product_b');
  await page.getByRole('button',{name:'Nhập kết quả nội dung',exact:true}).click();
  await page.getByLabel('Dán JSON',{exact:true}).fill(JSON.stringify(contentResult));
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.getByRole('dialog').filter({hasText:'Thêm kế hoạch nội dung'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:/^Lưu/}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(records.find(r=>r.kind==='content_plan').data.productId,'product_b');
  await page.goto('http://127.0.0.1:4174/?view=landing&ops_id=product_b');
  await page.getByRole('button',{name:'Nhập kết quả landing',exact:true}).click();
  await page.getByLabel('Dán JSON',{exact:true}).fill(JSON.stringify(landingResult));
  await page.getByRole('button',{name:'Kiểm tra và nhập JSON',exact:true}).click();
  await page.getByRole('dialog').filter({hasText:'Nội dung landing page tiếng Anh'}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:/^Lưu/}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(records.find(r=>r.kind==='landing_page').data.productId,'product_b');
  assert.deepEqual(await page.evaluate(()=>window.__providerCalls),{muse:0,codex:0});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const report={fixtureOnly:true,networkRequestsToProviders:0,measurements,errors,checks:['JSON file/paste and field errors','ten candidates; null/CNY preserved; none selected','verdict/logistics badges','Codex off and Muse paused','content/landing bound to product B as drafts']};
  await writeFile(join(out,'T-003-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
