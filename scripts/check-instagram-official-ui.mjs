// T-004: source UI with synthetic records; all page requests stay intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {INSTAGRAM_BROWSER_WARNING} from '../desktop/src/instagram-policy.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-004-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-004');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-004-ui-'));
const {emptyProduct}=await import(pathToFileURL(join(build,'server/lib/lab/domain.mjs')));
const {instagramOverviewFixture}=await import('../tests/fixtures/instagram-overview.mjs');
const {buildUtmLink}=await import(pathToFileURL(join(build,'server/lib/lab/utm.mjs')));
const fixture=instagramOverviewFixture();
const records=fixture.records.filter(row=>row.kind!=='production').map(row=>row.kind==='product'?{...row,data:{...emptyProduct,...row.data}}:row);
for(const plan of records.filter(row=>row.kind==='content_plan'))Object.assign(plan.data,{
  ctaKeyword:'LINK',caption:'Fixture caption',hook:'Fixture hook',script:'Fixture script',landingBaseUrl:'https://example.com/product',utmHookId:plan.id,
  utmLink:buildUtmLink('https://example.com/product',{productSlug:'fixture',accountHandle:plan.data.accountId,planId:plan.id,ctaKeyword:'LINK'}),
  utmClicks:2,utmClicksSource:'Fixture analytics',utmClicksPeriod:'2026-11',utmClicksObservedAt:new Date(fixture.at).toISOString(),
});
const profiles=records.filter(row=>row.kind==='social_account').map((row,i)=>({id:row.id,apiMode:'api',apiAppId:'123',apiUserId:String(100+i),hasApiToken:true,session:'signed_in',handle:row.data.handle,accountType:'BUSINESS',proxy:{server:'',username:'',hasPassword:false},open:false,busy:false}));
let browserEnabled=false,stopped=true,saves=0,checks=0,enableCalls=0;
const comments={intervalMs:180000,rules:[],rows:[{commentId:'501',keyword:'LINK',state:'sent',messageId:'mid.fixture',error:''}],polls:[],totals:[{productId:'fixture_product',ctaComments:18,dmSent:12}]};
const status=()=>({profiles,jobs:[],active:null,browserEnabled,api:{enabled:true,resumableEnabled:false,videoUrlEnabled:true},metrics:{rows:[]},comments:{...comments,stopped}});
const errors=[],external=[],measurements=[];
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
    const url=new URL(route.request().url()),json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if(url.origin!=='http://127.0.0.1:4174'){external.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab')return json({records});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Fixture only'});
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.exposeBinding('fixtureIgStatus',()=>status());
  await page.exposeBinding('fixtureIgSave',(_source,value)=>{saves++;assert.equal(value.apiMode,'api');assert.equal(value.apiToken,'synthetic-ui-token');return value.id;});
  await page.exposeBinding('fixtureIgCheck',(_source,{id})=>{checks++;const row=profiles.find(row=>row.id===id);return {handle:row.handle,accountType:'BUSINESS'};});
  await page.exposeBinding('fixtureIgBrowser',(_source,value)=>{if(value.enabled){assert.equal(value.confirmation,INSTAGRAM_BROWSER_WARNING);enableCalls++;}browserEnabled=value.enabled;return status();});
  await page.exposeBinding('fixtureIgStop',()=>{stopped=true;return comments;});
  await page.addInitScript(()=>{
    localStorage.setItem('product-lab-mode','real');const preferences={};
    window.productLabDesktop={
      status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
      loadUiState:async({key})=>preferences[key]??null,saveUiState:async({key,value})=>{preferences[key]=value;},
      manualMediaStatus:async()=>({inbox:'D:/Fixture/Inbox',scenes:[],unmatched:[],errors:[]}),
      assistantSettings:async()=>({}),integrationStatus:async()=>({jobs:[],config:null}),researchStatus:async()=>({runs:[]}),
      codexTextSettings:async()=>({enabled:false,executable:'',profile:''}),museChatList:async()=>[],
      instagramStatus:()=>window.fixtureIgStatus(),instagramSaveProfile:value=>window.fixtureIgSave(value),
      instagramCheck:value=>window.fixtureIgCheck(value),instagramConfigureBrowser:value=>window.fixtureIgBrowser(value),instagramDmEmergencyStop:()=>window.fixtureIgStop(),
      museChatSend:async()=>{throw Error('Must not call Muse');},instagramOpen:async()=>{throw Error('Must not open Instagram');},
    };
  });
  await page.goto('http://127.0.0.1:4174/?view=settings');
  const settings=page.getByRole('region',{name:'Cài đặt Instagram'});
  const toggle=page.getByRole('switch',{name:'Bật Instagram trình duyệt'});
  await toggle.waitFor();assert.equal(await toggle.isChecked(),false);
  page.once('dialog',dialog=>dialog.dismiss());await toggle.click();assert.equal(enableCalls,0);
  page.once('dialog',dialog=>dialog.accept());await toggle.click();await page.waitForFunction(()=>document.querySelector('[aria-label="Bật Instagram trình duyệt"]').checked);
  assert.equal(enableCalls,1);await toggle.click();
  const account=page.getByRole('region',{name:'API Account 1',exact:true});
  const token=account.getByLabel('Access token',{exact:true});assert.equal(await token.getAttribute('type'),'password');
  await token.fill('synthetic-ui-token');await account.getByRole('button',{name:'Lưu API Account 1',exact:true}).click();
  await account.getByText('Đã lưu API; token được mã hóa bằng kho hệ điều hành.').waitFor();assert.equal(await token.inputValue(),'');assert.equal(saves,1);
  await account.getByRole('button',{name:'Kiểm tra kết nối Account 1',exact:true}).click();await account.getByText('@fixture_1 · BUSINESS').waitFor();assert.equal(checks,1);
  for(const [width,height]of [[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4174/?view=settings');await toggle.waitFor();await page.evaluate(()=>document.fonts.ready);
    await settings.scrollIntoViewIfNeeded();await page.screenshot({path:join(out,`T-004-instagram-settings-${width}.png`),animations:'disabled',fullPage:true});
    await page.getByRole('button',{name:'Tắt khẩn cấp mọi DM'}).click();await page.getByText('DM: Đang tắt',{exact:true}).waitFor();
    assert.equal(await toggle.isChecked(),false);
    await page.goto('http://127.0.0.1:4174/?view=social');await page.locator('.instagram-overview-table').waitFor();await page.evaluate(()=>document.fonts.ready);
    for(const label of ['Comment CTA (API)','DM đã gửi','Click UTM'])await page.getByRole('columnheader',{name:label,exact:true}).waitFor();
    const row=page.locator('.instagram-overview-table tbody tr').first();assert.match(await row.innerText(),/18/);assert.match(await row.innerText(),/12/);
    const measure=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(measure.scrollWidth<=width);measurements.push(measure);
    await page.screenshot({path:join(out,`T-004-instagram-products-${width}.png`),animations:'disabled',fullPage:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(join(out,'T-004-ui.json'),JSON.stringify({fixtureOnly:true,providerCalls:0,measurements,saves,checks,enableCalls,errors},null,2));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
