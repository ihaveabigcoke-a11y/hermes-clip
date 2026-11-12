// T23: real source UI with synthetic records; all browser requests intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T23-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const out=join(root,'ops/night/out'),temp=join(root,'outputs/T23-browser');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {candidateSchema,researchBatchSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const at='2026-11-12T00:00:00Z';
const candidates=Array.from({length:10},(_,i)=>candidateSchema.parse({
 id:'fixture'+i,name:['Generic reflective strap','Generic pet brush','Generic bag clip','Generic grooming glove','Generic travel pouch','Generic cable ties','Generic sink strainer','Generic night band','Generic shoe pouch','Legacy fixture'][i],
 supplierUrl:'https://supplier.example/item/'+i,evidenceNotes:'Synthetic UI fixture only; no supplier contacted.',cost:i===4?9:4,shipping:2,currency:'USD',costCurrency:i===1?'CNY':'USD',shippingCurrency:'USD',verdict:'reject',verdictReason:'Saved user decision: keep unchanged.',matchType:'exact_sku',visualPayoff:'A visible before-and-after result',
 logisticsFlags:{brandRisk:false,ipRisk:i===3,sizeFit:i===3},ipNotes:i===3?'Compare the original design.':null,
 usRetail:i===5||i===9?null:{low:24.99,high:24.99,currency:'USD',sources:[{url:'https://retail.example/item/'+i,title:'Generic US retail · fixture',price:24.99,observedAt:at}]},
 listingCheck:i===9?null:{status:['ok','ok','ok','ok','ok','ok','blocked','unavailable','failed'][i],sourceUrl:'https://supplier.example/item/'+i,fetchedAt:at,title:'Synthetic listing',productCountReliable:true,productCountOnPage:i===2?12:1},
}));
let records=[{id:'t23_fixture',kind:'research_batch',revision:1,updatedAt:Date.parse(at),data:researchBatchSchema.parse({name:'T23 · DỮ LIỆU GIẢ LẬP · 10 ứng viên',maxLandedCostUsd:7,candidates,notes:'[Muse fixture_only] · No external research.'})}];
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
 await page.goto('http://127.0.0.1:4174/?view=research&ops_id=t23_fixture');
 await page.locator('.research-candidate-table tbody tr').nth(9).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.match(await page.locator('.research-candidate-table tbody tr').first().innerText(),/\$24,99 → ≤ \$6,25–\$8,33/);
 assert.equal(await page.locator('.research-retail-cell').nth(5).innerText(),'—');
 for(const width of [1366,1080]){
  await page.setViewportSize({width,height:900});
  await page.locator('.research-candidate-table').evaluate(element=>{element.parentElement.scrollLeft=0;element.scrollIntoView({block:'start'});});
  const geometry=await page.locator('.research-candidate-table').evaluate(table=>({pageWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,tableWidth:table.getBoundingClientRect().width,scrollWidth:table.parentElement.clientWidth,maxRowHeight:Math.max(...Array.from(table.tBodies[0].rows,row=>row.getBoundingClientRect().height))}));
  assert.ok(geometry.pageWidth<=width,JSON.stringify(geometry));assert.ok(geometry.maxRowHeight<=120,JSON.stringify(geometry));measurements.push(geometry);
  await page.screenshot({path:join(out,`T23-table-${width}.png`),animations:'disabled'});
 }
 for(const width of [1366,1080]){
  await page.setViewportSize({width,height:900});
  await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[0].name,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  for(const label of ['Đã quan sát','Suy luận','Chưa biết'])assert.equal(await dialog.getByRole('heading',{name:label,exact:true}).count(),1);
  assert.equal(await dialog.locator('p').filter({hasText:'Gợi ý kết luận:'}).locator('.badge').innerText(),'Thử');assert.match(await dialog.innerText(),/Trần người dùng: \$7,00/);
  assert.equal(posts.length,0);
  await page.screenshot({path:join(out,`T23-check-${width}.png`),animations:'disabled'});
  await dialog.getByRole('button',{name:'Sao chép câu hỏi',exact:true}).click();
  await dialog.getByRole('status').filter({hasText:'Đã sao chép'}).waitFor();
  assert.match(await page.evaluate(()=>window.__copied),/unit price at your MOQ/);
  const links=await dialog.getByRole('link').evaluateAll(links=>links.map(link=>({href:link.href,target:link.target,rel:link.rel})));
  assert.ok(links.some(link=>link.href.includes('country=US')));
  for(const link of links){assert.equal(new URL(link.href).protocol,'https:');assert.equal(link.target,'_blank');assert.ok(link.rel.includes('noopener'));}
  const boxes=await dialog.locator('.button-row a').evaluateAll(links=>links.map(link=>{const r=link.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));
  for(let i=1;i<boxes.length;i++)if(boxes[i].top===boxes[i-1].top)assert.ok(boxes[i].left-boxes[i-1].right>=10,'Manual check links need a visible gap');
  if(width===1080){await dialog.getByRole('heading',{name:'Link tự kiểm',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'T23-questions-links-1080.png'),animations:'disabled'});}
  await page.keyboard.press('Escape');
 }
 await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[3].name,exact:true}).click();
 await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').locator('p').filter({hasText:'Gợi ý kết luận:'}).locator('.badge').innerText(),'Giữ');
 await page.getByRole('button',{name:'Sao chép câu hỏi',exact:true}).click();
 await page.waitForFunction(()=>window.__copied.includes('design differ'));
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[4].name,exact:true}).click();
 await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').locator('p').filter({hasText:'Gợi ý kết luận:'}).locator('.badge').innerText(),'Loại');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[0].name,exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Sửa ứng viên',exact:true}).click();
 const form=page.getByRole('dialog');await form.getByLabel('Giá bán lẻ thấp',{exact:true}).waitFor();
 assert.equal(await form.getByLabel('Giá bán lẻ thấp',{exact:true}).inputValue(),'24.99');
 await form.getByLabel('Giá bán lẻ thấp',{exact:true}).fill('25');await form.getByLabel('Giá bán lẻ cao',{exact:true}).fill('35');
 await form.getByLabel('Rủi ro bằng sáng chế / kiểu dáng',{exact:true}).selectOption('true');
 await form.getByLabel('Ghi chú IP',{exact:true}).fill('Manual fixture design observation');
 await form.getByRole('button',{name:'Thêm nguồn bán lẻ',exact:true}).click();
 await form.getByLabel('URL nguồn 2',{exact:true}).fill('http://retail.example/unsafe');
 await form.getByLabel('Tiêu đề nguồn 2',{exact:true}).fill('Second generic source');
 await form.getByLabel('Giá nguồn 2 (USD)',{exact:true}).fill('30');
 await form.getByLabel('Ngày đọc nguồn 2',{exact:true}).fill('2026-11-12');
 await form.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
 await form.getByRole('alert').filter({hasText:'HTTPS'}).waitFor();assert.equal(posts.length,0);
 await form.getByLabel('URL nguồn 2',{exact:true}).fill('https://retail.example/item/manual');
 await form.getByRole('button',{name:'Thêm nguồn bán lẻ',exact:true}).click();await form.getByRole('button',{name:'Thêm nguồn bán lẻ',exact:true}).click();
 assert.equal(await form.getByRole('button',{name:'Thêm nguồn bán lẻ',exact:true}).isDisabled(),true);
 await form.getByRole('button',{name:'Bỏ nguồn 4',exact:true}).click();await form.getByRole('button',{name:'Bỏ nguồn 3',exact:true}).click();
 assert.equal(posts.length,0,'Editing sources must not submit the form');
 await form.getByLabel('Giá bán lẻ thấp',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:join(out,'T23-form-1080.png'),animations:'disabled'});
 await form.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(posts.length,1);const saved=records[0].data.candidates[0];
 assert.equal(saved.usRetail.low,25);assert.equal(saved.usRetail.high,35);assert.equal(saved.usRetail.sources.length,2);assert.equal(saved.usRetail.sources[1].observedAt,at);
 assert.equal(saved.logisticsFlags.ipRisk,true);assert.equal(saved.ipNotes,'Manual fixture design observation');
 assert.equal(saved.verdict,'reject');assert.deepEqual(saved.listingCheck,candidates[0].listingCheck);assert.equal(records[0].data.maxLandedCostUsd,7);
 await page.reload();await page.locator('.research-candidate-table tbody tr').nth(9).waitFor();
 await page.getByRole('button',{name:'Kiểm sản phẩm '+candidates[0].name,exact:true}).click();await page.getByRole('dialog').waitFor();
 assert.match(await page.getByRole('dialog').innerText(),/Manual fixture design observation/);
 await page.getByRole('dialog').getByRole('button',{name:'Sửa ứng viên',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Để giá bán lẻ chưa biết',exact:true}).click();
 assert.equal(posts.length,1,'Resetting retail must not submit the form');
 await page.getByRole('dialog').getByLabel('Rủi ro bằng sáng chế / kiểu dáng',{exact:true}).selectOption('');
 await page.getByRole('dialog').getByLabel('Ghi chú IP',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:join(out,'T23-ip-form-1080.png'),animations:'disabled'});
 await page.getByRole('dialog').getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.equal(records[0].data.candidates[0].usRetail,null);assert.equal(records[0].data.candidates[0].logisticsFlags.ipRisk,null);
 await page.getByLabel('Giá vốn + ship tối đa (USD)',{exact:true}).fill('11');
 await page.getByRole('button',{name:'Bắt đầu nghiên cứu',exact:true}).click();await page.getByRole('alert').filter({hasText:'Fixture reply unavailable'}).waitFor();
 await page.getByRole('button',{name:'Bắt đầu nghiên cứu',exact:true}).click();
 const requests=await page.evaluate(()=>window.__researchRequests);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].maxLandedCostUsd,11);
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 const report={fixtureOnly:true,networkRequestsSent:0,measurements,apiFixturePosts:posts.length,checks:['retail column and unknown dash','table scroll contained at 1366 and 1080','three evidence sections','try/hold/reject suggestions','saved decision unchanged','clipboard English and IP questions','HTTPS links through existing external-link handler','retail/IP manual save and reload','HTTPS validation','four-source limit','null restored without zero','local receipt preserved','launcher retry keeps ceiling and request'],consoleErrors:errors};
 await writeFile(join(out,'T23-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
