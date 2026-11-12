// T-008: source UI with synthetic records; all page requests stay intercepted.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const root=process.cwd(),build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T-008-build');
const out=resolve(process.env.HERMES_ARTIFACTS||'D:/hermes-wt/artifacts/T-008');
assert.ok(build.startsWith(join(root,'outputs')+sep));
await mkdir(out,{recursive:true});await mkdir(join(root,'outputs'),{recursive:true});
const temp=await mkdtemp(join(root,'outputs/T-008-ui-'));
const {parseReaVideo}=await import(pathToFileURL(join(build,'server/lib/lab/rea-video.mjs')));
const fixture=join(root,'desktop/test/fixtures/rea-video/V01');
const data=parseReaVideo(JSON.parse(await readFile(join(fixture,'breakdown.json'),'utf8')),{timeline:JSON.parse(await readFile(join(fixture,'packaging/timeline.json'),'utf8')),readBy:'manual'});
const structure={durationSec:data.durationSec,cutCount:data.shots.length-1,cuts:data.shots.slice(1).map(s=>s.start),contactSheetPath:'fixture.jpg',frames:data.shots.map(s=>({t:s.start,path:'fixture.jpg'}))};
const reference={id:'fixture_ref',product:'Đèn xe · mẫu kiểm thử',reaVideo:data,structure,hookType:'do_not_show',integrationJobId:'fixture_ref',projectId:'formula-library',sourceSha256:'a'.repeat(64),durationSec:data.durationSec,cuts:data.shots.length-1};
let records=[{id:'reference_video_draft_fixture_ref',kind:'reference_video_draft',revision:1,updatedAt:1,data:reference}];
const manual={data,structure,reference};
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
    if(url.pathname==='/api/assistant')return json({connected:false});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:404,body:'Fixture only'});
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Fixture asset missing'});}
  });
  await context.addInitScript(fixture=>{
    localStorage.setItem('product-lab-mode','real');
    const settings={reader:'codex',model:'gemini-2.5-flash',python:'C:/Fixture/python.exe',checkout:'C:/Fixture/rea-video',geminiConfirmed:false,hasKey:false,health:{ready:false,error:'Chưa có rea-video; dùng FFmpeg local.',codex:{ready:false,error:'Codex CLI thiếu --image; dùng Nhập tay.'}}};
    window.productLabDesktop={status:async()=>({musePaused:true,profiles:[],jobs:[],active:0,paused:true,generationReady:false,batch:null}),
      loadUiState:async()=>null,saveUiState:async()=>{},researchStatus:async()=>({runs:[]}),assistantSettings:async()=>({}),codexTextSettings:async()=>({enabled:false,executable:'',profile:''}),
      integrationStatus:async()=>({jobs:[{id:'fixture_ref',kind:'reference-structure',projectId:'formula-library',state:'done',readStatus:'waiting',request:{name:'Video mẫu V01.mp4'},result:{durationSec:fixture.data.durationSec,shotCount:10,bpm:117.5}}]}),
      integrationStructure:async()=>({jobId:'fixture_ref',projectId:'formula-library',name:'Video mẫu V01.mp4',sourceSha256:'a'.repeat(64),sourceUrl:null,subtitles:[],structure:fixture.structure,reaVideo:{...fixture.data,readStatus:'waiting',readBy:null},contactSheet:{bytes:[255,216,255]}}),
      integrationAnalyzeStructure:async()=>{throw Error('Fixture must not analyze');},reaVideoSettings:async()=>settings,saveReaVideoSettings:async v=>Object.assign(settings,v),checkReaVideo:async()=>settings.health,
      reaVideoExportReview:async()=>({path:'D:/Fixture/review'}),reaVideoImportReview:async()=>({readStatus:'complete'}),museChatList:async()=>[],
      museChatSend:async()=>{throw Error('Must not call Muse');},
    };
  },manual);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const [width,height] of [[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4174/?view=research');
    await page.locator('summary').filter({hasText:'Công thức video'}).click();
    await page.getByRole('button',{name:'Phân tích video mẫu',exact:true}).click();
    await page.getByRole('button',{name:'Xem timeline',exact:true}).click();
    const timeline=page.getByRole('region',{name:'Timeline video mẫu'}).first();await timeline.waitFor();
    await timeline.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await timeline.locator('tbody tr').count(),10);
    const timelineText=await timeline.innerText();
    assert.doesNotMatch(timelineText,/static_with_subject_motion|\b[a-z]+(?:_[a-z]+)+\b/,'Timeline must display Vietnamese labels, not raw enums.');
    assert.match(timelineText,/Máy đứng yên/);
    assert.match(timelineText,/Mở đầu/);
    assert.ok(await page.getByLabel('Nhập kết quả đọc ảnh').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:join(out,'T-008-timeline-'+width+'.png'),animations:'disabled'});
    await page.goto('http://127.0.0.1:4174/?view=settings');
    const settings=page.getByRole('region',{name:'Cài đặt đọc ảnh video mẫu'});await settings.scrollIntoViewIfNeeded();
    const select=page.getByLabel('Đọc ảnh video mẫu bằng');assert.equal(await select.inputValue(),'codex');
    assert.equal(await select.locator('option[value="manual"]').evaluate(o=>o.disabled),false);
    await select.selectOption('gemini-api');assert.ok(await settings.getByText('Gói Gemini Pro trên web không phải API key.',{exact:false}).isVisible());
    assert.equal(await settings.locator('input[type=checkbox]').last().isChecked(),false);
    await page.screenshot({path:join(out,'T-008-settings-'+width+'.png'),animations:'disabled'});
    measurements.push({width,shots:10,manualAvailable:true,geminiDefaultOff:true});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(join(out,'T-008-ui.json'),JSON.stringify({fixtureOnly:true,measurements,errors,external},null,2));
}finally{await browser?.close();processHandle.kill();closeSync(chromeLog);}
