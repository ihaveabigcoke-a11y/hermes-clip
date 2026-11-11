// Offline UI fixture only. Every page request is fulfilled from local build/memory
// or aborted; no server, login, real profile, user DB or service is involved.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {instagramOverviewFixture} from '../tests/fixtures/instagram-overview.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/night-t07/build');
assert.ok(build.startsWith(join(root,'outputs')+sep),'Build must stay inside outputs/.');
const temp=join(root,'outputs/night-t07/browser'),out=join(root,'ops/night/out');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
const fixture=instagramOverviewFixture(),at=fixture.at;
let records=fixture.records.map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row.kind==='production'?{...row,data:{...newProduction('Fixture video',fixture.product.id,1),...row.data,
  variants:row.data.variants.map(variant=>({name:'Fixture variant',bodyId:'body',hook:null,cta:null,locale:'en-US',caption:'Fixture',createdAt:at,...variant})),
  exports:row.data.exports.map(entry=>({id:'export_'+row.id,filename:'fixture.mp4',createdAt:at,...entry})),
}}:row);
const product=records.find(row=>row.kind==='product');
for(const [id,name,archived] of [['archived','Archived fixture',true],['local_qa_product','Treat Trader fixture',false],['qa_name','TEST LOCAL fixture',false]])records.push({...product,id,data:{...product.data,name,archived}});
const writes=[],blocked=[],errors=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.origin!=='http://127.0.0.1:4177'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab'){
      if(request.method()==='GET')return json({records});
      const body=request.postDataJSON();writes.push(body);
      const previous=records.find(row=>row.id===body.id);
      assert.equal(body.kind,'product');assert.equal(body.id,product.id);assert.equal(body.revision,previous.revision);
      const record={...previous,data:body.data,revision:previous.revision+1,updatedAt:at};
      records=records.map(row=>row.id===body.id?record:row);return json({record});
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
  const open=path=>page.goto('http://127.0.0.1:4177/'+path);
  await open('?view=social');
  const overview=page.locator('.instagram-overview-table');
  await overview.getByRole('button',{name:'Mở rộng Fixture product',exact:true}).waitFor();
  assert.equal(await overview.locator(':scope > tbody > tr').count(),1);
  assert.equal(await overview.getByRole('columnheader',{name:'Vào profile',exact:true}).count(),1);
  assert.equal(await overview.getByRole('columnheader',{name:'Bấm link',exact:true}).count(),1);
  const expand=overview.getByRole('button',{name:'Mở rộng Fixture product',exact:true});await expand.click();
  const table=page.locator('.instagram-content-table');await table.locator('tbody tr').nth(5).waitFor();
  assert.equal(await table.locator('tbody tr').count(),6);
  assert.equal(await table.locator('tbody tr').nth(5).locator('.instagram-total').allTextContents().then(values=>values.join(',')),'—,—,—,—,—,—,—');
  assert.equal(await table.locator('tbody tr').nth(0).locator('.instagram-total').last().textContent(),'0');
  const viewportChecks=[];
  for(const width of [1920,1366,800,390]){
    await page.setViewportSize({width,height:width===390?844:1080});await page.evaluate(()=>document.fonts.ready);
    await overview.scrollIntoViewIfNeeded();
    await page.screenshot({path:join(out,`T07-instagram-${width}.png`)});
    const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
    if(!noOverflow)console.log(JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth).slice(0,15).map(el=>({tag:el.tagName,className:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))}))));
    assert.ok(noOverflow,'Page overflow at '+width);
    viewportChecks.push({width,noPageOverflow:true});
  }
  await page.setViewportSize({width:1920,height:1080});
  await overview.getByRole('button',{name:'Thu gọn Fixture product',exact:true}).click();assert.equal(await table.count(),0);
  const toggle=page.getByRole('switch',{name:'Hiện sản phẩm đã lưu trữ',exact:true});await toggle.check();
  assert.equal(await overview.locator(':scope > tbody > tr').count(),4);assert.match(page.url(),/ig_showArchived=true/);
  await page.reload();await overview.getByRole('button',{name:'Xem sản phẩm Archived fixture',exact:true}).waitFor();assert.equal(await toggle.isChecked(),true);
  await overview.getByRole('button',{name:'Xem sản phẩm Archived fixture',exact:true}).click();
  await page.getByRole('heading',{name:'Archived fixture',exact:true}).waitFor();
  await page.getByRole('button',{name:'Tất cả sản phẩm',exact:true}).click();
  await overview.getByRole('button',{name:'Xem sản phẩm Fixture product',exact:true}).click();
  await table.locator('tbody tr').nth(5).waitFor();
  await table.locator('tbody tr').nth(2).getByRole('button',{name:'Hook 1',exact:true}).click();
  await page.locator('.instagram-plan-button[aria-pressed="true"]').waitFor();
  assert.match(await page.locator('.instagram-publish-detail').textContent(),/Hook 1/);
  assert.equal(await page.getByLabel('Tài khoản đăng',{exact:true}).inputValue(),'account_2');
  assert.equal(writes.length,0);
  // Existing archive action: cancel is read-only; confirmation changes only the product flag.
  await open('?view=products');
  await page.getByRole('button',{name:'Lưu trữ Fixture product',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Giữ sản phẩm',exact:true}).click();assert.equal(writes.length,0);
  await page.getByRole('button',{name:'Lưu trữ Fixture product',exact:true}).click();
  const before=structuredClone(records);
  await dialog.getByRole('button',{name:'Lưu trữ sản phẩm',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(writes.length,1);assert.deepEqual(writes[0].data,{...product.data,archived:true});
  assert.deepEqual(records.filter(row=>row.id!==product.id),before.filter(row=>row.id!==product.id));
  await open('?view=social');await page.getByText('Không có sản phẩm phù hợp',{exact:true}).waitFor();
  await page.getByRole('switch',{name:'Hiện sản phẩm đã lưu trữ',exact:true}).check();
  await page.getByRole('button',{name:'Xem sản phẩm Fixture product',exact:true}).click();await table.locator('tbody tr').nth(5).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,networkRequestsSent:0,viewportChecks,writes:writes.length,checks:['expand/collapse six posts','null and zero','archive/QA filter + URL persistence','open archived product','select content','cancel archive writes nothing','confirm archive retains related records','archived product retains all six posts'],consoleErrors:errors};
  await writeFile(join(out,'T07-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
