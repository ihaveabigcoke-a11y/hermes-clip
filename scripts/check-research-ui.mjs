// Offline QA against local:build output. All HTTP requests are fulfilled from
// fixture memory/local files or aborted; no server, account, real profile or DB.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/t04-build');
assert.ok(build.startsWith(join(root,'outputs')+sep),'Use an isolated build under outputs/.');
const out=join(root,'ops/night/out'),temp=join(root,'outputs/t04-browser');
await mkdir(out,{recursive:true});await mkdir(temp,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {candidateSchema,researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const at=Date.parse('2026-11-12T00:00:00Z');
const names=['Reflective running band','Reusable pet hair remover','Silicone sink strainer','Clip-on bag light','Compact garment brush','Travel organizer with a long product title for checking two-line truncation','Soft pet grooming glove','Bike visibility strap','Foldable shoe pouch','Reusable cable ties'];
const candidates=names.map((name,i)=>candidateSchema.parse({id:'fixture'+i,name,supplierUrl:'https://fixture.invalid/item/'+i,evidenceNotes:'Synthetic UI fixture only',imageUrl:'https://fixture.invalid/photo.svg',cost:i===0?15:i===1?16:i===2?30:null,shipping:i<3?5:null,costCurrency:i===2?'CNY':null,price:39.99,visualPayoff:'One visible before-and-after result in a fixed camera frame',matchType:i<2?'exact_sku':'similar',verdict:['try','hold','reject'][i%3],logisticsFlags:i===0?{battery:true,liquid:true,fragile:true,sizeFit:true,vehicleFit:true,bulky:true,brandRisk:true}:null,marketEvidence:[{label:'Page reviews',value:100,unit:'reviews',period:'Snapshot',market:'US',sourceUrl:'https://fixture.invalid/reviews',observedAt:'2026-11-12T00:00:00Z'}]}));
let records=[{id:'fixture_batch',kind:'research_batch',revision:1,updatedAt:at,data:researchBatchSchema.parse({name:'T04 · DỮ LIỆU GIẢ LẬP · 10 ứng viên',candidates,notes:'[Muse fixture_receipt] · No external research was run.'})}];
const posts=[],blocked=[],errors=[];
let failNextPromotion=false;
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(url.origin==='https://fixture.invalid'&&url.pathname==='/photo.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#293037"/><path d="M18 40 L23 23 L43 26 L46 43 Z" fill="#a5b56f"/><text x="32" y="58" text-anchor="middle" font-size="8" fill="white">FIXTURE</text></svg>'});
  if(url.origin!=='http://127.0.0.1:4174'){blocked.push(url.href);return route.abort();}
  if(url.pathname==='/api/lab'){
   if(request.method()==='GET')return json({records});
   const body=request.postDataJSON();posts.push(body);
   const previous=records.find(r=>r.id===body.id);
   if(body.action==='promote'){
    assert.equal(body.kind,'product');assert.equal(body.id,'research_fixture_batch_'+body.data.researchOrigin.candidateId);
    if(previous)return json({record:previous,deduplicated:true});
    if(failNextPromotion==='before'){failNextPromotion=false;return json({error:'Fixture unavailable before save'},503);}
   }
   if((previous?.revision??0)!==(body.revision??0))return json({error:'Fixture CAS'},409);
   const record={id:body.id,kind:body.kind,data:body.data,revision:(previous?.revision??0)+1,updatedAt:at};
   records=[record,...records.filter(r=>r.id!==body.id)];
   // Model a saved product with a lost response. Reconciliation must retain it.
   if(body.action==='promote'&&failNextPromotion){failNextPromotion=false;return json({error:'Fixture lost response'},503);}
   return json({record});
  }
  if(url.pathname.startsWith('/api/'))return json({error:'Fixture has no such endpoint'},404);
  const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);
  assert.ok(file.startsWith(join(build,'ui')+sep));
  try {const body=await readFile(file);return route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
  catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('product-lab-mode','real');
  window.__researchRequests=[];
  window.productLabDesktop={researchStatus:async()=>({runs:[]}),researchStart:async input=>{window.__researchRequests.push(input);throw Error('Fixture: reply unavailable');}};
 });
 await page.goto('http://127.0.0.1:4174/?view=research&ops_id=fixture_batch');
 await page.locator('.research-candidate-table tbody tr').nth(9).waitFor();await page.evaluate(()=>document.fonts.ready);
 const heights=await page.locator('.research-candidate-table tbody tr').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
 assert.ok(heights.every(height=>height<=120),JSON.stringify(heights));
 assert.equal(await page.locator('.operations-heading .lab-button.primary').count(),0);
 assert.equal(await page.locator('.research-launcher .lab-button.primary').count(),1);
 await page.screenshot({path:join(out,'T04-research-form-1080.png')});
 await page.locator('.research-candidate-table').evaluate(element=>element.scrollIntoView({block:'start'}));
 await page.screenshot({path:join(out,'T04-research-table-1080.png')});
 const check=index=>page.getByRole('checkbox',{name:'Chọn '+names[index],exact:true});
 const setChecked=async(index,desired)=>{
  await check(index).click();
  await page.waitForFunction(({name,desired})=>Array.from(document.querySelectorAll('input[type=checkbox]')).find(input=>input.getAttribute('aria-label')===name)?.checked===desired,{name:'Chọn '+names[index],desired});
 };
 await setChecked(0,true);await page.getByText('Hồ sơ đã tạo',{exact:true}).waitFor();
 const product=records.find(r=>r.kind==='product');assert.ok(product);assert.equal(product.data.researchOrigin.candidateId,'fixture0');
 await setChecked(0,false);await page.getByText('Hồ sơ vẫn giữ',{exact:true}).waitFor();
 assert.ok(records.some(r=>r.id===product.id));
 await setChecked(0,true);await page.getByText('Hồ sơ đã tạo',{exact:true}).waitFor();
 assert.equal(records.filter(r=>r.id===product.id).length,1);
 await setChecked(1,true);await page.waitForFunction(()=>document.querySelectorAll('.research-candidate-table input:checked').length===2);
 await page.waitForFunction(()=>!document.querySelector('.research-candidate-table input').disabled);
 await setChecked(2,true);await page.waitForFunction(()=>document.querySelectorAll('.research-candidate-table input:checked').length===3);
 assert.equal(await check(3).isDisabled(),true);
 await page.getByRole('button',{name:'Xem nguồn và điều kiện '+names[0],exact:true}).click();
 await page.getByRole('dialog').waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('Nguồn hàng'));
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/Đã chọn.*3\/3/}).click();assert.equal(await page.locator('.research-candidate-table tbody tr').count(),3);
 assert.match(await page.locator('.research-data-coverage').innerText(),/Có giá vốn 3\/10/);
 await page.getByRole('button',{name:/Tất cả.*10/}).click();
 await setChecked(2,false);await page.waitForFunction(()=>document.querySelectorAll('.research-candidate-table input:checked').length===2);
 await page.waitForFunction(()=>!document.querySelector('.research-candidate-table input').disabled);
 failNextPromotion=true;await setChecked(3,true);await page.getByRole('alert').filter({hasText:'chưa xác nhận hồ sơ'}).waitFor();
 assert.equal(records.filter(r=>r.id==='research_fixture_batch_fixture3').length,1);
 // Browser reload reconciles a committed promote with a lost response.
 await page.getByRole('button',{name:'Tải lại dữ liệu',exact:true}).last().click();
 await page.waitForFunction(()=>document.querySelectorAll('.research-candidate-table input:checked').length===3);
 await setChecked(1,false);await page.waitForFunction(()=>!document.querySelector('.research-candidate-table input').disabled);
 failNextPromotion='before';await setChecked(4,true);
 await page.getByRole('button',{name:'Hoàn tất chọn',exact:true}).waitFor();
 assert.equal(records.filter(r=>r.id==='research_fixture_batch_fixture4').length,0);
 await page.getByRole('button',{name:'Hoàn tất chọn',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.research-candidate-table input').disabled);
 assert.equal(records.filter(r=>r.id==='research_fixture_batch_fixture4').length,1);
 assert.equal(await page.getByRole('button',{name:'Hoàn tất chọn',exact:true}).count(),0);
 await page.getByLabel('Ngách hoặc đối tượng',{exact:true}).fill('night runners');
 await page.getByLabel('Giá vốn + ship tối đa (USD)',{exact:true}).fill('15');
 await page.getByRole('button',{name:'Bắt đầu nghiên cứu',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Fixture: reply unavailable'}).waitFor();
 await page.getByRole('button',{name:'Bắt đầu nghiên cứu',exact:true}).click();
 const requests=await page.evaluate(()=>window.__researchRequests);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.match(requests[0].query,/15 USD/);assert.match(requests[0].query,/night runners/);
 for(const width of [1366,800,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  await page.locator('.research-candidate-table').evaluate(element=>element.scrollIntoView({block:'start'}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page overflow at '+width);
  await page.screenshot({path:join(out,`T04-research-table-${width}.png`)});
 }
 // Exercise the app's in-memory demo persist branch as well as the API wiring.
 const postCount=posts.length;
 await page.setViewportSize({width:1920,height:1080});
 await page.getByRole('button',{name:'Khám phá bản mẫu',exact:true}).click();
 await page.getByRole('button',{name:'Tạo đợt nhập tay',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Tên đợt',{exact:true}).fill('Demo selection fixture');
 await page.getByRole('dialog').getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
 await page.getByRole('button',{name:'Thêm ứng viên',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Tên sản phẩm',{exact:true}).fill('Demo fixture product');
 await page.getByRole('dialog').getByLabel('URL nguồn hàng',{exact:true}).fill('https://fixture.invalid/item/demo');
 await page.getByRole('dialog').getByLabel('Thông tin đã kiểm tra tại nguồn',{exact:true}).fill('Synthetic fixture');
 await page.getByRole('dialog').getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
 const demoCheck=page.getByRole('checkbox',{name:'Chọn Demo fixture product',exact:true});
 await demoCheck.click();await page.getByText('Hồ sơ đã tạo',{exact:true}).waitFor();
 await demoCheck.click();await page.getByText('Hồ sơ vẫn giữ',{exact:true}).waitFor();
 await demoCheck.click();await page.getByText('Hồ sơ đã tạo',{exact:true}).waitFor();
 assert.equal(await demoCheck.isChecked(),true);assert.equal(await page.locator('.operations-panel .inline-error').count(),0);assert.equal(posts.length,postCount);
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 const report={fixtureOnly:true,networkRequestsSent:0,viewport:'1920x1080',rowHeights:heights,maximumRowHeight:Math.max(...heights),apiFixturePosts:posts.length,checks:['selection promotes','uncheck keeps profile','recheck deduplicates','max three','detail modal','filter keeps full coverage','lost promote response reconciles','failed promote repaired with same selection','launcher retry uses identical request','mobile horizontal table scroll','demo selection replays without CAS error or API mutation'],consoleErrors:errors};
 await writeFile(join(out,'T04-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
