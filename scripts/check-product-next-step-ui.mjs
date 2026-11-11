// T15: source-built UI + synthetic records, intercepted requests only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {nextStepFixture,nextRecord} from '../tests/fixtures/product-next-step.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T15-local-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const out=join(root,'ops/night/out'),temp=join(root,'outputs/T15-browser');
await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {schemas}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const base=nextStepFixture();
const product=(id,name,patch={})=>nextRecord('product',id,{...base.product.data,name,...patch});
const supplier=product('supplier_product','Supplier fixture',{cost:null,sampleCheck:null});
const sample=product('sample_product','Sample fixture',{sampleCheck:null});
const fresh=product('fresh_product','Fresh fixture');
const review=product('review_product','Review fixture');
const social=product('social_product','Social fixture');
const latest=nextRecord('production','latest_project',{...structuredClone(base.production.data),productId:review.id,name:'Latest fixture'},3000);
latest.data.scenes[0].takes[0].review='pending';
const older=nextRecord('production','older_project',{...structuredClone(base.production.data),productId:review.id,name:'Older fixture'},1000);
const socialProject=nextRecord('production','social_project',{...structuredClone(base.production.data),productId:social.id,name:'Social fixture'},2000);
const socialAccount=nextRecord('social_account','social_account',{...base.account.data,productId:social.id});
const landing=nextRecord('landing_page','landing_sample',{productId:sample.id,headline:'Sample fixture',description:'Synthetic preview only.',benefits:'',limitations:'',imageAssetId:'',ctaLabel:'Learn more',ctaUrl:''});
let records=[supplier,sample,fresh,review,social,older,latest,socialProject,socialAccount,landing,nextRecord('asset','sample_photo',{name:'Physical sample fixture.png',type:'image/png',size:1})];
const posts=[],blocked=[],errors=[],measurements=[];
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
  await go('view=products');await card('Supplier fixture').waitFor();
  assert.match(await card('Supplier fixture').innerText(),/Bước tiếp theo: Hỏi giá nhà cung cấp/);
  assert.match(await card('Sample fixture').innerText(),/Bước tiếp theo: Kiểm mẫu thật/);
  assert.match(await card('Fresh fixture').innerText(),/Bước tiếp theo: Tạo kịch bản theo công thức/);
  assert.match(await card('Fresh fixture').innerText(),/Đã kiểm mẫu sản phẩm/);
  assert.match(await card('Sample fixture').innerText(),/Chờ kiểm mẫu sản phẩm/);
  assert.match(await card('Review fixture').innerText(),/Bước tiếp theo: 1 cảnh cần xem lại phiên bản/);
  assert.match(await card('Social fixture').innerText(),/Bước tiếp theo: Đăng bài đã duyệt/);
  for(const [width,height] of [[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
    const measure=await page.evaluate(()=>({width:innerWidth,pageWidth:document.documentElement.scrollWidth,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width}));
    assert.ok(measure.pageWidth<=width);assert.equal(measure.sidebar,232);measurements.push(measure);
    await page.screenshot({path:join(out,`T15-products-${width}x${height}.png`),animations:'disabled'});
  }
  await card('Supplier fixture').getByRole('button',{name:'Hỏi giá nhà cung cấp · Supplier fixture'}).click();
  let dialog=page.getByRole('dialog');assert.equal(await dialog.getByLabel('Tên sản phẩm',{exact:true}).inputValue(),'Supplier fixture');
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await card('Sample fixture').getByRole('button',{name:'Kiểm mẫu thật · Sample fixture'}).click();dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Hiệu ứng như video',{exact:true}).inputValue(),'unknown');
  assert.equal(await dialog.getByLabel('Ngày nhận mẫu',{exact:true}).inputValue(),'');
  await dialog.getByLabel('Ngày nhận mẫu',{exact:true}).fill('2026-11-12');
  await dialog.getByLabel('Đúng màu/kích thước',{exact:true}).selectOption('true');
  await dialog.getByLabel('Hiệu ứng như video',{exact:true}).selectOption('false');
  await dialog.getByLabel('Ghi chú kiểm mẫu',{exact:true}).fill('Physical sample differs; fixture only.');
  await dialog.getByLabel('Ảnh mẫu trong Thư viện (không bắt buộc)',{exact:true}).selectOption('sample_photo');
  await dialog.getByLabel('Hiệu ứng như video',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:join(out,'T15-sample-check.png'),animations:'disabled'});
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(posts.at(-1).data.sampleCheck,{receivedAt:'2026-11-12',colorSizeMatches:true,matchesVideo:false,notes:'Physical sample differs; fixture only.',photos:['sample_photo']});
  assert.match(await card('Sample fixture').innerText(),/Kiểm mẫu thật/);
  await card('Fresh fixture').getByRole('button',{name:'Tạo kịch bản theo công thức · Fresh fixture'}).click();dialog=page.getByRole('dialog');
  await dialog.waitFor();assert.equal(await dialog.getByLabel('Sản phẩm',{exact:true}).inputValue(),fresh.id);
  assert.equal(new URL(page.url()).searchParams.get('view'),'production');
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await go('view=products');await card('Review fixture').getByRole('button',{name:'1 cảnh cần xem lại phiên bản · Review fixture'}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('production')==='latest_project');
  assert.equal(new URL(page.url()).searchParams.get('stage'),'library');
  assert.equal(await page.getByLabel('Dự án đang làm').inputValue(),'latest_project');
  await go('view=products');await card('Social fixture').getByRole('button',{name:'Đăng bài đã duyệt · Social fixture'}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('ops_id')==='social_product');
  assert.equal(new URL(page.url()).searchParams.get('view'),'social');
  await go('view=landing&ops_id=sample_product');
  await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).waitFor();
  assert.match(await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).innerText(),/không khớp/);
  assert.equal(await page.getByRole('button',{name:'Xuất HTML trên máy'}).isEnabled(),true);
  await page.screenshot({path:join(out,'T15-landing-warning.png'),animations:'disabled'});
  await page.getByRole('button',{name:'Sửa nội dung trang'}).click();
  assert.match(await page.getByRole('dialog').innerText(),/Chưa kiểm mẫu/);
  await page.getByRole('dialog').getByRole('button',{name:'Hủy',exact:true}).click();
  records=records.map(r=>r.id===sample.id?{...r,data:{...r.data,sampleCheck:{...r.data.sampleCheck,matchesVideo:true}}}:r);
  await go('view=landing&ops_id=sample_product');await page.getByRole('button',{name:'Sửa nội dung trang'}).waitFor();
  assert.equal(await page.getByRole('status').filter({hasText:'Chưa kiểm mẫu'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Xuất HTML trên máy'}).isEnabled(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(posts.length,1);
  await writeFile(join(out,'T15-ui.json'),JSON.stringify({fixtureOnly:true,measurements,productSaves:posts.length,errors,blocked,checks:['five next-step cards','supplier editor','sample tri-state/date/notes/photos save','new project product selection','latest production deep link','social product deep link','landing warning false/true and non-blocking controls']},null,2)+'\n');
  console.log('T15 offline UI checks passed; one synthetic product save, no external request.');
} finally {await browser.close();}
