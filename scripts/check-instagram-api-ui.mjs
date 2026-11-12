// T18: isolated Chromium, synthetic IPC/records, no real profile or network.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {instagramOverviewFixture} from '../tests/fixtures/instagram-overview.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/night-t18/build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const temp=join(root,'outputs/night-t18/browser'),out=join(root,'ops/night/out');
await mkdir(temp,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {newProduction}=await import(pathToFileURL(join(build,'server/lib/lab/production.mjs')));
const fixture=instagramOverviewFixture();
const records=fixture.records.map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row.kind==='production'?{...row,data:{...newProduction('Fixture video',fixture.product.id,1),...row.data,
  variants:row.data.variants.map(variant=>({name:'Hook A',bodyId:'body',hook:null,cta:null,locale:'en-US',caption:'Fixture',createdAt:fixture.at,...variant})),
  exports:row.data.exports.map(entry=>({id:'export_'+row.id,filename:'fixture.mp4',createdAt:fixture.at,...entry})),
}}:row);
records.find(row=>row.id==='metric_plan_1_1').data={...records.find(row=>row.id==='metric_plan_1_1').data,source:'api',reach:4,viewers:null};
const profiles=[{id:'account_1',productId:fixture.product.id,name:'Account 1',handle:'',userId:'',session:'unknown',open:false,busy:false,background:false,
  checkedAt:null,error:'',vpnEnabled:false,vpn:{state:'off'},proxy:{server:'',username:'',hasPassword:false}}];
const status=()=>({profiles,jobs:[],active:null,metrics:{rows:[]},api:{enabled:false,resumableEnabled:false}});
let saves=0,tokenSaves=0,checks=0;
const errors=[],blocked=[],viewportChecks=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(url.origin!=='http://127.0.0.1:4178'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab') {assert.equal(request.method(),'GET');return json({records});}
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture only'},404);
    const file=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(file.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.exposeBinding('fixtureStatus',()=>status());
  await page.exposeBinding('fixtureSave',(_source,value)=>{
    saves++;assert.equal(value.id,'account_1');
    if(value.apiToken){assert.equal(value.apiToken,'synthetic-UI-token');tokenSaves++;}
    const previous=profiles[0];
    profiles[0]={...previous,apiMode:value.apiMode,apiUserId:value.apiUserId,
      hasApiToken:value.clearApiToken?false:value.apiToken?true:previous.hasApiToken};
    return value.id;
  });
  await page.exposeBinding('fixtureCheck',()=>{checks++;throw Error('API is disabled');});
  await page.addInitScript(()=>{
    localStorage.setItem('product-lab-mode','real');
    window.productLabDesktop={instagramStatus:()=>window.fixtureStatus(),instagramSaveProfile:value=>window.fixtureSave(value),instagramOpen:()=>window.fixtureCheck()};
  });
  const accounts='http://127.0.0.1:4178/?view=social&ops_id=fixture_product&ig_tab=accounts';
  await page.goto(accounts);
  const configure=page.getByRole('button',{name:'Cấu hình kết nối Account 1',exact:true});
  const open=async()=>{await configure.click();await page.getByRole('dialog').waitFor();};
  const dialog=page.getByRole('dialog'),mode=dialog.getByLabel('Cách kết nối',{exact:true}),token=dialog.getByLabel('Token Instagram API',{exact:true});
  await open();assert.equal(await mode.inputValue(),'browser');assert.equal(await token.inputValue(),'');
  await mode.selectOption('api');await dialog.getByLabel('Mã tài khoản Instagram API',{exact:true}).fill('100');await token.fill('synthetic-UI-token');
  assert.equal(await token.getAttribute('type'),'password');
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(tokenSaves,1);await page.reload();await configure.waitFor();
  assert.equal(await page.getByRole('button',{name:'Kiểm tra API',exact:true}).isDisabled(),true);
  await open();assert.equal(await mode.inputValue(),'api');assert.equal(await token.inputValue(),'');
  assert.match(await dialog.textContent(),/Đã mã hóa token/);
  assert.equal((await page.content()).includes('synthetic-UI-token'),false);
  for(const width of [1366,1920]){
    await page.setViewportSize({width,height:width===1366?768:1080});await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`T18-config-${width}.png`),animations:'disabled'});viewportChecks.push({width,noPageOverflow:true});
  }
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(tokenSaves,1);
  await open();await dialog.getByLabel('Xóa token API đã lưu',{exact:true}).check();await mode.selectOption('browser');
  await dialog.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(profiles[0].hasApiToken,false);assert.equal(profiles[0].apiMode,'browser');assert.equal(checks,0);
  await page.goto(accounts.replace('ig_tab=accounts','ig_tab=content'));
  const metrics=page.getByRole('region',{name:'Số liệu Instagram',exact:true});await metrics.waitFor();
  assert.match(await metrics.textContent(),/Đo từ Instagram API/);
  await metrics.getByText('Chỉ số khác và nguồn đo',{exact:true}).click();assert.match(await metrics.textContent(),/Tài khoản tiếp cận/);
  await metrics.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'T18-metrics-1920.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,externalRequestsSent:0,realTokenOrEncryption:false,saves,tokenSaves,apiChecks:checks,viewportChecks,
    checks:['legacy browser default','API config save/reload','password input and blank reopen','blank retains token','clear token','switch back to browser','disabled API check','API metric source and reach'],errors};
  await writeFile(join(out,'T18-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
