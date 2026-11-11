// T17: synthetic UI only. Every request is fulfilled from memory/local build
// or aborted. Fresh browser storage and clipboard stub; no user DB/account.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {instagramOverviewFixture} from '../tests/fixtures/instagram-overview.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/night-t17/build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const temp=join(root,'outputs/night-t17/browser'),out=join(root,'ops/night/out');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {contentPlanSchema}=await import(pathToFileURL(join(build,'server/lib/lab/operations.mjs')));
const {newProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
const fixture=instagramOverviewFixture();
const records=fixture.records.map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row.kind==='production'?{...row,data:{...newProduction('Fixture video',fixture.product.id,1),...row.data,
  variants:row.data.variants.map(variant=>({name:'Hook A',bodyId:'body',hook:null,cta:null,locale:'en-US',caption:'Fixture',createdAt:fixture.at,...variant})),
  exports:row.data.exports.map(entry=>({id:'export_'+row.id,filename:'fixture.mp4',createdAt:fixture.at,...entry})),
}}:row);
const planId='plan_1_1',getPlan=()=>records.find(row=>row.id===planId);
const base='https://shop.example/landing?ref=partner&tag=one&tag=two#join';
records.push({id:'landing_fixture',kind:'landing_page',revision:1,updatedAt:fixture.at,data:{productId:fixture.product.id,headline:'Fixture landing',description:'English fixture',ctaUrl:base}});
const project=records.find(row=>row.id===getPlan().data.productionId);
project.data.variants.push({...project.data.variants[0],id:'hook_b',name:'Hook B'});
const unrelated=structuredClone(records.filter(row=>row.id!==planId));
const writes=[],blocked=[],errors=[],viewportChecks=[];
let rejectNextSave=false;
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
      assert.equal(input.kind,'content_plan');assert.equal(input.id,planId);
      const previous=getPlan();
      if(rejectNextSave){rejectNextSave=false;return json({error:'Dữ liệu đã thay đổi. Tải lại kế hoạch.'},409);}
      assert.equal(input.revision,previous.revision);
      const record={...previous,data:contentPlanSchema.parse(input.data),revision:previous.revision+1,updatedAt:Date.now()};
      records[records.indexOf(previous)]=record;return json({record});
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
    window.fixtureCopies=[];window.failClipboard=false;
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{
      if(window.failClipboard)throw Error('Fixture denied clipboard');window.fixtureCopies.push(value);
    }}});
  });
  const detail='http://127.0.0.1:4177/?view=social&ops_id=fixture_product&ig_tab=content';
  await page.goto(detail);
  const section=page.getByRole('region',{name:'Link UTM cho kế hoạch',exact:true});
  const landing=section.getByLabel('Link landing gốc',{exact:true}),keyword=section.getByLabel('Từ khóa CTA cho link',{exact:true});
  const generate=section.getByRole('button',{name:'Tạo và lưu link UTM',exact:true}),copy=section.getByRole('button',{name:'Sao chép link UTM',exact:true});
  const saved=section.getByLabel('Link UTM đã lưu',{exact:true});
  await landing.waitFor();assert.equal(await landing.inputValue(),base);
  assert.equal(await keyword.inputValue(),'LED');assert.equal(await copy.isDisabled(),true);
  assert.equal(await section.getByLabel('Biến thể / hook cho link',{exact:true}).inputValue(),'variant_plan_1_1');
  for(const invalid of ['http://shop.example','javascript:alert(1)']){
    await landing.fill(invalid);await generate.click();await section.getByRole('alert').waitFor();
    assert.match(await section.getByRole('alert').textContent(),/HTTPS/);assert.equal(writes.length,0);
  }
  await landing.fill(base);await keyword.fill('');await generate.click();
  assert.match(await section.getByRole('alert').textContent(),/Thiếu từ khóa CTA/);assert.equal(writes.length,0);
  await keyword.fill('LED');await generate.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Link UTM cho kế hoạch"] input[readonly]')?.value.includes('utm_source=instagram'));
  assert.equal(writes.length,1);const first=getPlan().data.utmLink,url=new URL(first);
  assert.equal(url.searchParams.get('utm_content'),'fixture_1-variant-plan-1-1');assert.equal(url.searchParams.get('utm_term'),'led');
  assert.deepEqual(url.searchParams.getAll('tag'),['one','two']);assert.equal(url.hash,'#join');
  await copy.click();assert.deepEqual(await page.evaluate(()=>window.fixtureCopies),[first]);
  await page.evaluate(()=>window.failClipboard=true);await copy.click();
  assert.match(await section.getByRole('alert').textContent(),/Chưa sao chép được/);assert.equal(await saved.inputValue(),first);
  await page.reload();await landing.waitFor();assert.equal(await saved.inputValue(),first);assert.equal(await landing.inputValue(),base);
  // Failed saves retain the prior stored link, and copying never copies an unsaved attempt.
  rejectNextSave=true;await landing.fill('https://shop.example/custom?ref=new');await generate.click();await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').textContent(),/Dữ liệu đã thay đổi/);assert.equal(getPlan().data.utmLink,first);assert.equal(await saved.inputValue(),first);
  await copy.click();assert.deepEqual(await page.evaluate(()=>window.fixtureCopies),[first]);
  await section.getByLabel('Biến thể / hook cho link',{exact:true}).selectOption('hook_b');await generate.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Link UTM cho kế hoạch"] input[readonly]')?.value.includes('fixture_1-hook-b'));
  const second=getPlan().data.utmLink;assert.notEqual(second,first);assert.equal(new URL(second).searchParams.get('ref'),'new');
  // Existing edit form retains optional tracking fields during an unrelated caption edit.
  await page.getByRole('button',{name:'Sửa nội dung',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Chú thích tiếng Anh',{exact:true}).fill('Updated English caption.');
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(getPlan().data.utmLink,second);assert.equal(getPlan().data.caption,'Updated English caption.');
  await page.reload();await landing.waitFor();assert.equal(await landing.inputValue(),'https://shop.example/custom?ref=new');assert.equal(await saved.inputValue(),second);
  for(const width of [1366,1920]){
    await page.setViewportSize({width,height:1080});await section.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Detail overflow at '+width);
    await page.screenshot({path:join(out,`T17-detail-${width}.png`)});
    await page.getByRole('button',{name:'Tổng quan',exact:true}).click();
    const table=page.locator('.instagram-content-table');await table.waitFor();
    const shortened=table.locator('span[title]').filter({hasText:second.slice(0,39)});
    assert.equal(await shortened.getAttribute('title'),second);assert.equal(await shortened.textContent(),second.slice(0,39)+'…');
    await shortened.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Table overflow at '+width);
    await page.screenshot({path:join(out,`T17-table-${width}.png`)});viewportChecks.push({width,noPageOverflow:true});
    await page.goto(detail);await landing.waitFor();
  }
  // No account guess when a legacy plan lacks a handle.
  const account=records.find(row=>row.id==='account_1'),handle=account.data.handle;account.data.handle='';
  await page.reload();await landing.waitFor();await generate.click();await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').textContent(),/Thiếu tên người dùng Instagram/);account.data.handle=handle;
  assert.equal(writes.length,4);assert.deepEqual(records.filter(row=>row.id!==planId),unrelated);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,externalRequestsSent:0,clipboard:'stub only',viewportChecks,writes:writes.length,
    checks:['landing default','export hook selection','invalid scheme and empty CTA rejected before save','save/reload','copy stored link','clipboard failure fallback','CAS failure preserves stored link','hook B and custom URL','unrelated edit retains UTM','matrix short text and full title','missing handle does not guess','unrelated records unchanged'],consoleErrors:errors};
  await writeFile(join(out,'T17-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
