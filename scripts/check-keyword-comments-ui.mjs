// T16: synthetic UI only. All requests are fulfilled from memory/local build
// or aborted, with a fresh browser context and no real account/profile/DB.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {instagramOverviewFixture} from '../tests/fixtures/instagram-overview.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T16-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const temp=join(root,'outputs/T16-browser'),out=join(root,'ops/night/out');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {keywordCommentMeasurementSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const {newProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
const fixture=instagramOverviewFixture();
const records=fixture.records.map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row.kind==='production'?{...row,data:{...newProduction('Fixture video',fixture.product.id,1),...row.data,
  variants:row.data.variants.map(variant=>({name:'Fixture variant',bodyId:'body',hook:null,cta:null,locale:'en-US',caption:'Fixture',createdAt:fixture.at,...variant})),
  exports:row.data.exports.map(entry=>({id:'export_'+row.id,filename:'fixture.mp4',createdAt:fixture.at,...entry})),
}}:row);
const insightsBefore=structuredClone(records.filter(row=>row.kind==='social_metric'));
const writes=[],blocked=[],errors=[];
let loseNextResponse=false;
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try{
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.origin!=='http://127.0.0.1:4177'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab'){
      if(request.method()==='GET')return json({records});
      const input=request.postDataJSON();writes.push(input);
      assert.equal(input.kind,'keyword_comment_measurement');assert.equal(input.revision,0);
      if(records.some(row=>row.id===input.id))return json({error:'Bản đo đã có. Tải lại để đối soát.'},409);
      const data=keywordCommentMeasurementSchema.parse(input.data);
      assert.equal(data.planId,'plan_1_1');assert.equal(data.accountId,'account_1');
      const record={id:input.id,kind:input.kind,revision:1,updatedAt:Date.now(),data:{...data,observedAt:new Date().toISOString()}};
      records.push(record);
      if(loseNextResponse){loseNextResponse=false;return route.abort('failed');}
      return json({record});
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture endpoint unavailable'},404);
    const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);
    assert.ok(file.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('product-lab-mode','real');
    window.productLabDesktop={instagramStatus:async()=>({profiles:[],jobs:[],active:null,metrics:{rows:[]}})};
  });
  const detail='http://127.0.0.1:4177/?view=social&ops_id=fixture_product&ig_tab=content';
  await page.goto(detail);
  const section=page.getByRole('region',{name:'Comment từ khóa CTA',exact:true});
  const paste=section.getByLabel('Dán comment',{exact:true}),save=section.getByRole('button',{name:'Lưu bản đo comment',exact:true});
  await paste.waitFor();assert.equal(await save.isDisabled(),true);
  assert.equal(await section.getByLabel('Từ khóa CTA để đếm',{exact:true}).inputValue(),'LED');
  await section.getByLabel('Định dạng comment',{exact:true}).selectOption('username');
  await paste.fill('alice LED\n@ALICE led!\nbob ledger\ncarol LED 🙏');
  await section.getByText('3 / 4 comment khớp · Người dùng duy nhất: 2',{exact:true}).waitFor();
  await section.getByLabel('Từ khóa CTA để đếm',{exact:true}).fill('LED RUN');assert.equal(await save.isDisabled(),true);
  await section.getByLabel('Từ khóa CTA để đếm',{exact:true}).fill('led');
  await save.click();await section.getByText('Lịch sử bản đo comment (1)',{exact:true}).waitFor();
  assert.equal(await paste.inputValue(),'');assert.equal(writes.length,1);
  await page.reload();await section.getByText('Lịch sử bản đo comment (1)',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
  const table=page.locator('.instagram-content-table');await table.locator('tbody tr').nth(5).waitFor();
  const first=table.locator('tbody tr').first();
  assert.match(await first.textContent(),/3Dán tay/);assert.ok((await first.locator('td').allTextContents()).includes('3%'));
  const viewportChecks=[];
  for(const width of [1920,1366]){
    await page.setViewportSize({width,height:width===1366?768:1080});await page.evaluate(()=>document.fonts.ready);
    await table.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Table page overflow '+width);
    await page.screenshot({path:join(out,`T16-table-${width}.png`)});
    if(width===1366){
      await table.evaluate(element=>{element.parentElement.scrollLeft=element.parentElement.scrollWidth;});
      const rate=await table.getByRole('columnheader',{name:'Tỷ lệ comment từ khóa / lượt xem',exact:true}).boundingBox();
      assert.ok(rate.x>=232&&rate.x+rate.width<=width,'Keyword rate is reachable by horizontal scroll');
      await page.screenshot({path:join(out,'T16-table-1366-right.png')});
      await table.evaluate(element=>{element.parentElement.scrollLeft=0;});
    }
    viewportChecks.push({view:'table',width,noPageOverflow:true});
  }
  await first.getByRole('button',{name:'Hook 1',exact:true}).click();await paste.waitFor();
  await section.getByLabel('Định dạng comment',{exact:true}).selectOption('username');
  await paste.fill('alice ledger');await save.click();await section.getByText('Lịch sử bản đo comment (2)',{exact:true}).waitFor();
  assert.match(await section.getByRole('status').textContent(),/0 \/ 1 comment khớp/);
  await section.getByLabel('Định dạng comment',{exact:true}).selectOption('text');await paste.fill('LED 🙏');
  await section.getByText('1 / 1 comment khớp · Người dùng duy nhất: — (thiếu username ở comment khớp)',{exact:true}).waitFor();
  loseNextResponse=true;await save.click();await section.getByRole('alert').waitFor();
  assert.equal(await paste.inputValue(),'LED 🙏');
  await save.click();await section.getByText(/Bản đo đã có/).waitFor();
  assert.equal(writes.length,4);assert.equal(writes[2].id,writes[3].id);
  assert.equal(records.filter(row=>row.kind==='keyword_comment_measurement').length,3);
  await page.reload();await section.getByText('Lịch sử bản đo comment (3)',{exact:true}).waitFor();
  assert.match(await section.getByRole('status').textContent(),/1 \/ 1 comment khớp/);
  assert.equal(await paste.inputValue(),'');
  for(const width of [1920,1366]){
    await page.setViewportSize({width,height:width===1366?768:1080});await section.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Detail page overflow '+width);
    await page.screenshot({path:join(out,`T16-detail-${width}.png`)});
    viewportChecks.push({view:'detail',width,noPageOverflow:true});
  }
  assert.deepEqual(records.filter(row=>row.kind==='social_metric'),insightsBefore);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,networkRequestsSent:0,viewportChecks,requests:writes.length,measurements:3,
    checks:['username parsing and duplicate users','invalid keyword and empty paste disabled','persist and reload history','3/100 view rate','zero match','anonymous unique count stays null','uncertain save retries same ID and reload reconciles','Insights unchanged'],consoleErrors:errors};
  await writeFile(join(out,'T16-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
