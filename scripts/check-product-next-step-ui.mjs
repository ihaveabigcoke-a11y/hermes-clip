// T15/F01/F03: source-built UI + synthetic records, intercepted requests only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {nextStepFixture,nextRecord} from '../tests/fixtures/product-next-step.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const checkId=process.env.HERMES_UI_CHECK_ID||'T15';
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||`outputs/${checkId}-local-build`);
assert.ok(build.startsWith(join(root,'outputs')+sep));
const out=join(root,'ops/night/out'),temp=join(root,`outputs/${checkId}-browser`);
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {schemas}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {productNextStep,latestProductProduction}=await import('../lib/lab/product-next-step.ts');
const {sampleCheckState}=await import('../lib/lab/sample-check.ts');
const base=nextStepFixture();
const product=(id,name,patch={})=>nextRecord('product',id,{...base.product.data,name,...patch});
const supplier=product('supplier_product','Supplier fixture',{cost:null,sampleCheck:null});
const sample=product('sample_product','Sample fixture',{sampleCheck:null});
const fresh=product('fresh_product','Fresh fixture');
const review=product('review_product','Review fixture');
const social=product('social_product','Social fixture');
const legacy=product('legacy_product','Legacy fixture',{sampleVerified:true});
delete legacy.data.sampleCheck;
const legacyNull=product('legacy_null_product','Legacy null fixture',{sampleVerified:true,sampleCheck:null});
const failed=product('failed_product','Failed fixture',{sampleVerified:true,sampleCheck:{matchesVideo:false}});
const latest=nextRecord('production','latest_project',{...structuredClone(base.production.data),productId:review.id,name:'Latest fixture'},3000);
latest.data.scenes[0].takes[0].review='pending';
const older=nextRecord('production','older_project',{...structuredClone(base.production.data),productId:review.id,name:'Older fixture'},1000);
const socialProject=nextRecord('production','social_project',{...structuredClone(base.production.data),productId:social.id,name:'Social fixture'},2000);
const socialAccount=nextRecord('social_account','social_account',{...base.account.data,productId:social.id});
const landing=nextRecord('landing_page','landing_sample',{productId:sample.id,headline:'Sample fixture',description:'Synthetic preview only.',benefits:'',limitations:'',imageAssetId:'',ctaLabel:'Learn more',ctaUrl:''});
let records=[supplier,sample,fresh,review,social,legacy,legacyNull,failed,older,latest,socialProject,socialAccount,landing,nextRecord('asset','sample_photo',{name:'Physical sample fixture.png',type:'image/png',size:1})];
const posts=[],blocked=[],errors=[],measurements=[],overviewChecks=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(url.origin!=='http://127.0.0.1:4174'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab'){
      if(request.method()==='GET')return json({records});
      const body=request.postDataJSON();posts.push(body);assert.equal(body.kind,'product');
      const previous=records.find(record=>record.id===body.id);assert.equal(body.revision,previous.revision);
      const record={...previous,data:schemas.product.parse(body.data),revision:previous.revision+1};
      records=records.map(r=>r.id===record.id?record:r);return json({record});
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture endpoint unavailable'},404);
    const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);
    assert.ok(file.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Missing fixture asset'});}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('product-lab-mode','real'));
  const go=async query=>{await page.goto('http://127.0.0.1:4174/?'+query);await page.locator('.loading-region').waitFor({state:'hidden'});};
  const card=name=>page.locator('.product-card').filter({has:page.locator('h3',{hasText:name})});
  // T-020/T-024 replaced five card actions with the ten-step journey.
  // Retain the legacy evidence assertions against its domain projection; verify the current UI separately.
  for(const [row,title] of [[supplier,'Hỏi giá nhà cung cấp'],[sample,'Kiểm mẫu thật'],[fresh,'Tạo kịch bản theo công thức'],[review,'1 cảnh cần xem lại phiên bản'],[social,'Đăng bài đã duyệt'],[legacy,'Kiểm mẫu thật'],[legacyNull,'Kiểm mẫu thật'],[failed,'Kiểm mẫu thật']])assert.equal(productNextStep(row,records).title,title);
  assert.equal(sampleCheckState(fresh.data),'verified');for(const row of [sample,failed])assert.notEqual(sampleCheckState(row.data),'verified');for(const row of [legacy,legacyNull])assert.equal(sampleCheckState(row.data),'legacy');
  await go('view=products');await card('Supplier fixture').waitFor();
  for(const row of [supplier,sample,fresh,review,social,legacy,legacyNull,failed])assert.match(await card(row.data.name).innerText(),/Gán mã và tự xếp hạng/);
  const filter=page.locator('.list-toolbar').getByLabel('Lọc trạng thái');
  await filter.selectOption('verified');assert.deepEqual((await page.locator('.product-card h3').allTextContents()).sort(),['Fresh fixture','Review fixture','Social fixture']);
  await filter.selectOption('unverified');assert.deepEqual((await page.locator('.product-card h3').allTextContents()).sort(),['Failed fixture','Legacy fixture','Legacy null fixture','Sample fixture','Supplier fixture']);await filter.selectOption('all');
  for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);const measure=await page.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,sidebar:document.querySelector(".sidebar").getBoundingClientRect().width}));assert.ok(measure.pageWidth<=width);assert.equal(measure.sidebar,232);measurements.push(measure);await page.screenshot({path:join(out,checkId+'-products-'+width+'x'+height+'.png'),animations:'disabled'});}
  await card('Supplier fixture').getByRole('button',{name:'Gán mã và tự xếp hạng',exact:true}).click();
  await page.waitForURL(u=>u.searchParams.get('view')==='research');assert.equal(new URL(page.url()).searchParams.get('product'),supplier.id);
  await go('view=products&product='+supplier.id);await page.getByRole('tablist',{name:'Hồ sơ sản phẩm'}).waitFor();
  await page.getByRole('button',{name:'Sửa hồ sơ',exact:true}).click();let dialog=page.getByRole('dialog');assert.equal(await dialog.getByLabel('Tên sản phẩm',{exact:true}).inputValue(),'Supplier fixture');await dialog.getByRole('button',{name:'Hủy',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await go('view=products&product='+sample.id+'&product_tab=supply');await page.getByRole('tabpanel').getByText('Chưa kiểm đủ',{exact:true}).waitFor();await page.getByRole('button',{name:'Sửa hồ sơ',exact:true}).click();dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Hiệu ứng như video',{exact:true}).inputValue(),'unknown');assert.equal(await dialog.getByLabel('Ngày nhận mẫu',{exact:true}).inputValue(),'');
  await dialog.getByLabel('Ngày nhận mẫu',{exact:true}).fill('2026-11-12');await dialog.getByLabel('Đúng màu/kích thước',{exact:true}).selectOption('true');await dialog.getByLabel('Hiệu ứng như video',{exact:true}).selectOption('false');await dialog.getByLabel('Ghi chú kiểm mẫu',{exact:true}).fill('Physical sample differs; fixture only.');await dialog.getByLabel('Ảnh mẫu trong Thư viện (không bắt buộc)',{exact:true}).selectOption('sample_photo');await dialog.getByLabel('Hiệu ứng như video',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(out,checkId+'-sample-check.png'),animations:'disabled'});
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(posts.at(-1).data.sampleCheck,{receivedAt:'2026-11-12',colorSizeMatches:true,matchesVideo:false,notes:'Physical sample differs; fixture only.',photos:['sample_photo']});
  await page.getByRole('tabpanel').getByText('Chưa kiểm đủ',{exact:true}).waitFor();
  await go('view=production&new_product='+fresh.id);dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByLabel('Sản phẩm',{exact:true}).inputValue(),fresh.id);await dialog.getByRole('button',{name:'Hủy',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(latestProductProduction(review,records).id,'latest_project');await go('view=production&production=latest_project&stage=library');assert.equal(await page.getByLabel('Dự án đang làm').inputValue(),'latest_project');
  await go('view=social&ops_id='+social.id);assert.equal(new URL(page.url()).searchParams.get('ops_id'),'social_product');await page.getByRole('heading',{name:'Social fixture',exact:true}).waitFor();
  await go('view=landing&ops_id=sample_product');
  await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).waitFor();
  assert.match(await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).innerText(),/không khớp/);
  assert.equal(await page.getByRole('button',{name:'Xuất HTML trên máy'}).isEnabled(),true);
  await page.screenshot({path:join(out,`${checkId}-landing-warning.png`),animations:'disabled'});
  await page.getByRole('button',{name:'Sửa nội dung trang'}).click();
  assert.match(await page.getByRole('dialog').innerText(),/Chưa kiểm mẫu/);
  await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).click();
  records=records.map(r=>r.id===sample.id?{...r,data:{...r.data,sampleCheck:{...r.data.sampleCheck,matchesVideo:true}}}:r);
  await go('view=landing&ops_id=sample_product');await page.getByRole('button',{name:'Sửa nội dung trang'}).waitFor();
  assert.equal(await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Xuất HTML trên máy'}).isEnabled(),true);
  // Exactly four states; the verified product deliberately has the old flag false.
  // Put legacy and failed first in turn so neither can be skipped by needsProof.
  const unchecked=product('unchecked_product','Unchecked fixture',{sampleCheck:null});
  for(const waiting of [[legacy,failed,unchecked],[failed,legacy,unchecked]]){
    records=[fresh,...waiting];
    await go('view=overview');
    await page.locator('[data-metric-index="0"]').waitFor();assert.equal(await page.locator('[data-metric-index="0"]').innerText(),'4');
    assert.equal(await page.locator('[data-today-product]').count(),4);
    const verifiedText='1 đã kiểm mẫu sản phẩm',waitingText='3 sản phẩm chờ bằng chứng';
    assert.equal(records.filter(r=>sampleCheckState(r.data)==='verified').length,1);assert.equal(records.filter(r=>sampleCheckState(r.data)!=='verified').length,3);
    await go('view=products&product='+waiting[0].id+'&product_tab=supply');await page.getByRole('tabpanel').getByText('Chưa kiểm đủ',{exact:true}).waitFor();await page.getByRole('button',{name:'Sửa hồ sơ',exact:true}).click();const proofDialog=page.getByRole('dialog');assert.equal(await proofDialog.getByLabel('Tên sản phẩm',{exact:true}).inputValue(),waiting[0].data.name);await proofDialog.getByRole('button',{name:'Hủy',exact:true}).click();await proofDialog.waitFor({state:'hidden'});
    await go('view=products');await card('Fresh fixture').waitFor();
    await filter.selectOption('verified');
    const verifiedNames=await page.locator('.product-card h3').allTextContents();
    assert.deepEqual(verifiedNames,['Fresh fixture']);
    assert.equal(verifiedText,`${verifiedNames.length} đã kiểm mẫu sản phẩm`);
    await filter.selectOption('unverified');
    const waitingNames=(await page.locator('.product-card h3').allTextContents()).sort();
    assert.deepEqual(waitingNames,['Failed fixture','Legacy fixture','Unchecked fixture']);
    assert.equal(waitingText,`${waitingNames.length} sản phẩm chờ bằng chứng`);
    overviewChecks.push({verifiedText,waitingText,focusProduct:waiting[0].id,verifiedNames,waitingNames});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(posts.length,1);
  await writeFile(join(out,`${checkId}-ui.json`),JSON.stringify({fixtureOnly:true,measurements,overviewChecks,productSaves:posts.length,errors,blocked,checks:['legacy five-step domain assertions retained','ten-step card navigation','legacy/failed/unknown sample distinction and profile checks','sample state filters','supplier editor','sample tri-state/date/notes/photos save','new project product selection','latest production deep link','social product deep link','landing warning false/true and non-blocking controls','today active products and both sample filters','legacy/failed profile editor preserves selected product']},null,2)+'\n');
  console.log(`${checkId} offline UI checks passed; one synthetic product save, no external request.`);
} finally {await browser.close();}
