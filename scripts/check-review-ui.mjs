// T27: real source UI with synthetic records; all browser requests intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {formulaProduction,formulaRecords} from '../tests/fixtures/formula-production.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T27-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const out=join(root,'ops/night/out'),temp=join(root,'outputs/T27-browser');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {candidateSchema,researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const at='2026-11-12T00:00:00Z';
const candidates=Array.from({length:10},(_,i)=>candidateSchema.parse({
 id:'fixture'+i,name:['Generic reflective strap','Generic pet brush','Generic bag clip','Generic grooming glove','Generic travel pouch','Generic cable ties','Generic sink strainer','Generic night band','Generic shoe pouch','Legacy fixture'][i],
 supplierUrl:'https://supplier.example/item/'+i,evidenceNotes:'Synthetic UI fixture only; no supplier contacted.',cost:i===4?9:4,shipping:2,currency:'USD',costCurrency:i===1?'CNY':'USD',shippingCurrency:'USD',verdict:'reject',verdictReason:'Saved user decision: keep unchanged.',matchType:'exact_sku',visualPayoff:'A visible before-and-after result',
 logisticsFlags:{brandRisk:false,ipRisk:i===3,sizeFit:i===3},ipNotes:i===3?'Compare the original design.':null,
 usRetail:i===5||i===9?null:{low:24.99,high:24.99,currency:'USD',sources:[{url:'https://retail.example/item/'+i,title:'Generic US retail · fixture',price:24.99,observedAt:at}]},
 listingCheck:i===9?null:{status:['ok','ok','ok','ok','ok','ok','blocked','unavailable','failed'][i],sourceUrl:'https://supplier.example/item/'+i,fetchedAt:at,title:'Synthetic listing',productCountReliable:true,productCountOnPage:i===2?12:1},
}));
let records=[{id:'t27_fixture',kind:'research_batch',revision:1,updatedAt:Date.parse(at),data:researchBatchSchema.parse({name:'T27 · DỮ LIỆU GIẢ LẬP · 10 ứng viên',maxLandedCostUsd:7,candidates,notes:'[Muse fixture_only] · No external research.'})}];
const phase=process.argv[2]||'after';
assert.ok(['before','after'].includes(phase));
const posts=[],blocked=[],errors=[],measurements=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
 const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(url.origin!=='http://127.0.0.1:4174'){blocked.push(url.href);return route.abort();}
  if(url.pathname==='/api/lab'){
   if(request.method()==='GET')return json({records});
   const body=request.postDataJSON();posts.push(body);assert.equal(body.kind,'research_batch');
   const previous=records.find(record=>record.id===body.id);assert.equal(body.revision,previous.revision);
   const data=researchBatchSchema.parse(body.data);
   const record={...previous,data,revision:previous.revision+1};records=[record];return json({record});
  }
  if(url.pathname.startsWith('/api/'))return json({error:'Fixture endpoint unavailable'},404);
  const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);
  assert.ok(file.startsWith(join(build,'ui')+sep));
  try {return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
  catch {return route.fulfill({status:404,body:'Missing fixture asset'});}
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('product-lab-mode','real');window.__copied='';window.__researchRequests=[];
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.__copied=value;}}});
  window.productLabDesktop={researchStatus:async()=>({runs:[]}),researchStart:async input=>{window.__researchRequests.push(input);throw Error('Fixture reply unavailable');}};
 });
 await page.goto('http://127.0.0.1:4174/?view=research&ops_id=t27_fixture');
 await page.locator('.research-candidate-table tbody tr').nth(9).waitFor();await page.evaluate(()=>document.fonts.ready);

 for(const [width,height] of [[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});
  const table=page.locator('.research-candidate-table');
  await table.evaluate(element=>{element.parentElement.scrollLeft=0;element.scrollIntoView({block:'start'});});
  const measure=()=>table.evaluate(table=>{
   const scroll=table.parentElement, bounds=scroll.getBoundingClientRect(), row=table.tBodies[0].rows[0];
   const cells=[0,1,8,10].map(index=>{
    const cell=row.cells[index],rect=cell.getBoundingClientRect(), x=(rect.left+rect.right)/2, y=(rect.top+rect.bottom)/2;
    return {column:index+1,left:rect.left,right:rect.right,visible:rect.left>=bounds.left&&rect.right<=bounds.right,
      unobscured:cell.contains(document.elementFromPoint(x,y))};
   });
   const button=row.cells[10].querySelector('button'), br=button.getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width,
    pageWidth:document.documentElement.scrollWidth,tableWidth:table.getBoundingClientRect().width,
    available:scroll.clientWidth,scrollLeft:scroll.scrollLeft,scrollWidth:scroll.scrollWidth,cells,maxRowHeight:Math.max(...Array.from(table.tBodies[0].rows,row=>row.getBoundingClientRect().height)),
    buttonVisible:br.left>=bounds.left&&br.right<=bounds.right&&button.contains(document.elementFromPoint((br.left+br.right)/2,(br.top+br.bottom)/2))};
  });
  const initial=await measure();measurements.push(initial);
  await page.screenshot({path:join(out,'T27-'+phase+'-'+width+'x'+height+'.png'),animations:'disabled'});
  assert.equal(initial.sidebar,232);assert.ok(initial.pageWidth<=width);assert.ok(initial.maxRowHeight<=120);
  if(phase==='after'){
   assert.ok(initial.cells.every(cell=>cell.visible&&cell.unobscured),JSON.stringify(initial));assert.ok(initial.buttonVisible);
   for(const position of [0.5,1]){
    await table.evaluate((table,fraction)=>{const s=table.parentElement;s.scrollLeft=(s.scrollWidth-s.clientWidth)*fraction;},position);
    const scrolled=await measure();measurements.push(scrolled);
    assert.ok(scrolled.cells.every(cell=>cell.visible&&cell.unobscured),JSON.stringify(scrolled));assert.ok(scrolled.buttonVisible);
   }
   await page.getByRole('button',{name:'Xem nguồn và điều kiện '+candidates[0].name,exact:true}).click();
   await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Nguồn hàng/);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[0].name,exact:true}).click();
   await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Đã quan sát/);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  }
 }
 if(phase==='after'){
  // Use the same source formula_draft command as the domain tests. No real media.
  records=formulaRecords();records[0].data={...emptyProduct,...records[0].data};
  await page.addInitScript(()=>{
   window.__renderCalls=0;
   window.productLabDesktop={
    status:async()=>({profiles:[],jobs:[],active:0,generationReady:false,batch:{id:'fixture_batch',perProfileLimit:3,submittedByProfile:{}}}),
    instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}}),
    render:async()=>{window.__renderCalls++;throw Error('Draft must not render');},
    renderOpenMontage:async()=>{window.__renderCalls++;throw Error('Draft must not render');},
   };
  });
  const open=async view=>{await page.goto('http://127.0.0.1:4174/?view='+view+'&production=draft_project');await page.evaluate(()=>document.fonts.ready);};
  await open('production&stage=variants');await page.locator('.variant-card').nth(1).waitFor();
  assert.equal(await page.locator('.variant-card header .badge').filter({hasText:'Chờ chọn take'}).count(),2);
  for(const name of ['Xuất gói nội bộ ZIP','Tải manifest JSON','Ghép MP4 trên máy','Dựng bằng OpenMontage','Gắn MP4 đã ghép']){
   const buttons=page.getByRole('button',{name,exact:true});assert.equal(await buttons.count(),2);
   for(const button of await buttons.all())assert.ok(await button.isDisabled(),name);
  }
  assert.equal(await page.getByRole('button',{name:'Tạo biến thể',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.__renderCalls),0);
  await page.screenshot({path:join(out,'T27-formula-draft.png'),animations:'disabled'});
  await open('production&stage=bodies');await page.locator('.body-card').waitFor();
  assert.match(await page.locator('.body-card').innerText(),/Chờ chọn take/);
  assert.doesNotMatch(await page.locator('.body-card').innerText(),/undefined|null|phiên bản\s*·/);
  await open('queue');await page.locator('.queue-board .info-panel').filter({hasText:'Chờ chọn take'}).waitFor();
  assert.equal(await page.locator('.queue-rows > li').count(),0);
  await open('social');await page.locator('.instagram-overview-table').waitFor();
  assert.match(await page.locator('.instagram-overview-table').innerText(),/Chờ chọn take/);
  // Approved but unselected still needs a deliberate pin, never a latest-take fallback.
  records=formulaRecords(formulaProduction({approved:true}));records[0].data={...emptyProduct,...records[0].data};
  await open('production&stage=variants');await page.locator('.variant-card').nth(1).waitFor();
  assert.equal(await page.getByRole('button',{name:'Ghép MP4 trên máy',exact:true}).first().isDisabled(),true);
  await page.getByRole('button',{name:'Chọn video đã duyệt cho A/B',exact:true}).first().click();await page.getByRole('dialog').waitFor();
  const selects=page.getByRole('dialog').locator('select');assert.equal(await selects.count(),records[1].data.scenes.length);
  for(const select of await selects.all()){assert.equal(await select.inputValue(),'');assert.equal(await select.locator('option').count(),2);}
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__renderCalls),0);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(posts.length,0);
 const report={phase,fixtureOnly:true,networkRequestsSent:0,measurements,errors,checks:phase==='after'?
  ['selection/name/decision/actions visible and hit-tested at start/middle/end scroll','detail and product-check dialogs accessible','row height <=120px','formula draft labels and disabled export/render controls','body has no phantom take text','queue notice without invented jobs','Instagram waiting notice','approved takes require explicit selection; selectors initially blank','no writes or desktop render calls']:['baseline geometry and screenshots']};
 await writeFile(join(out,'T27-ui-'+phase+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
