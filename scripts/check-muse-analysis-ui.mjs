// Offline T22 UI exercise: source build, mocked IPC/receipts, no live services.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {analysisResponse,structureFor} from '../tests/fixtures/formula-analysis.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=join(root,'ops/night/out');
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T22-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const temp=join(root,'outputs/T22-browser');await mkdir(temp,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const module=async file=>import(pathToFileURL(join(build,'server/lib/lab/'+file+'.mjs')));
const {referenceVideoDraftSchema}=await module('viral-reference'),{researchBatchSchema}=await module('operations');
const structure=structureFor(),at=Date.parse('2026-11-12T00:00:00Z');
let records=[{id:'t22_fixture',kind:'research_batch',revision:1,updatedAt:at,data:researchBatchSchema.parse({name:'T22 · DỮ LIỆU GIẢ LẬP',candidates:[]})}];
const posts=[],errors=[],blocked=[],measurements=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try {
  const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.origin!=='http://127.0.0.1:4175'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab') {
      if(request.method()==='GET')return json({records});
      const body=request.postDataJSON();posts.push(body);assert.equal(body.kind,'reference_video_draft');
      const data=referenceVideoDraftSchema.parse(body.data),record={id:'reference_video_draft_'+data.id,kind:body.kind,data,revision:1,updatedAt:at};
      records.push(record);return json({record});
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture endpoint unavailable'},404);
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Missing fixture asset'});}
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({structure,response})=>{
    localStorage.setItem('product-lab-mode','real');window.__calls=[];window.__chats=[];window.__mode='bad-json';window.__count=0;
    const job={id:'t22_job',projectId:'formula-library',kind:'reference-structure',state:'done',request:{name:'Comment LED original.mp4'}};
    window.productLabDesktop={
      status:async()=>({version:'fixture',musePaused:false,jobs:[],paused:true,active:0,budget:0,freeRamGb:8,generationReady:true,
        profiles:[{id:'off',name:'Disabled fixture',enabled:false},{id:'on',name:'Muse fixture',enabled:true,session:'signed_in',busy:false}],batch:{id:'fixture',perProfileLimit:3,submittedByProfile:{on:window.__count}}}),
      researchStatus:async()=>({runs:[]}),integrationStatus:async()=>({busy:false,jobs:[job]}),
      integrationAnalyzeStructure:async()=>job,
      integrationStructure:async()=>({jobId:job.id,projectId:job.projectId,name:job.request.name,sourceSha256:'a'.repeat(64),sourceUrl:null,structure,subtitles:[],contactSheet:{bytes:new Uint8Array([])}}),
      museChatList:async({projectId})=>window.__chats.filter(c=>c.projectId===projectId),
      museChatSend:async request=>{
        window.__calls.push({method:'send',request});
        const row={...request,state:'waiting',response:'',providerUrl:'https://muse.ai/thread/fixture',error:null};window.__chats.push(row);
        if(window.__mode==='upload-failed'){row.state='failed';row.error='Muse chưa xác nhận ảnh đính kèm đã tải xong. Chưa gửi prompt, chưa tính lượt.';return row;}
        window.__count++;
        if(window.__hold)await new Promise(resolve=>{window.__release=resolve;});
        else await new Promise(resolve=>setTimeout(resolve,200));
        if(window.__mode==='transport'){row.state='needs_attention';throw Error('Fixture transport interrupted');}
        row.state=window.__mode==='uncertain'?'needs_attention':'done';
        row.response=window.__mode==='bad-json'?'not JSON':JSON.stringify(response);
        return row;
      },
      museChatRecover:async({requestId})=>{
        window.__calls.push({method:'recover',requestId});const row=window.__chats.find(c=>c.requestId===requestId);
        row.state='done';row.response=JSON.stringify(response);return row;
      },
    };
  },{structure,response:analysisResponse()});
  await page.goto('http://127.0.0.1:4175/?view=research&ops_id=t22_fixture');
  await page.locator('summary').filter({hasText:/^Công thức video/}).click();
  await page.getByRole('button',{name:'Phân tích video mẫu',exact:true}).click();
  await page.getByRole('button',{name:'Xem timeline',exact:true}).click();
  const send=page.getByRole('button',{name:'Phân tích bằng Muse',exact:true}),save=page.getByRole('button',{name:'Lưu tham chiếu',exact:true});
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Profile Muse phân tích"]')?.value==='on');
  assert.equal(await page.getByLabel('Profile Muse phân tích').locator('option').count(),1);
  await page.getByText('Tốn 1 lượt Muse',{exact:false}).waitFor();
  await page.evaluate(()=>{window.__hold=true;});await send.click();
  await page.waitForFunction(()=>typeof window.__release==='function');
  assert.equal(await save.isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Phân tích video mẫu',exact:true}).isDisabled(),true);
  await page.evaluate(()=>{window.__hold=false;window.__release();});
  await page.getByRole('alert').filter({hasText:'Phản hồi chưa đúng cấu trúc'}).waitFor();
  assert.equal(await save.isDisabled(),true);assert.equal(posts.length,0);
  const first=await page.evaluate(()=>window.__calls[0].request);
  assert.equal(first.referenceJobId,'t22_job');assert.equal(first.profileId,'on');assert.equal(first.projectId,'reference_t22_job');
  for(const key of ['attachments','references','path','bytes','parentId'])assert.equal(key in first,false,key);
  await page.evaluate(()=>{window.__mode='good';});
  await page.getByRole('button',{name:'Gửi tiếp yêu cầu sửa JSON',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Đã điền phân tích Muse'}).waitFor();
  const repair=await page.evaluate(()=>window.__calls[1].request);
  assert.equal(repair.parentId,first.requestId);assert.equal(repair.profileId,first.profileId);assert.equal('referenceJobId' in repair,false);
  assert.match(repair.prompt,/Repair your previous response/);assert.equal(posts.length,0);
  assert.equal(await page.evaluate(()=>window.__count),2);assert.equal(await save.isDisabled(),false);
  for(const width of [1366,1080]){
    await page.setViewportSize({width,height:900});await send.scrollIntoViewIfNeeded();
    const geometry=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth}));assert.ok(geometry.pageWidth<=width);measurements.push(geometry);
    await page.screenshot({path:join(out,`T22-analysis-${width}.png`),animations:'disabled'});
  }
  await save.click();await page.getByRole('status').filter({hasText:'Đã lưu tham chiếu nháp'}).waitFor();assert.equal(posts.length,1);
  assert.ok(records.find(r=>r.kind==='reference_video_draft').data.analysis);assert.equal(records.some(r=>r.kind==='viral_formula'),false);
  await page.evaluate(()=>{window.__mode='transport';});await send.click();
  await page.getByRole('alert').filter({hasText:'Fixture transport interrupted'}).waitFor();assert.equal(await send.isDisabled(),true);
  await page.getByRole('button',{name:'Đọc lại kết quả',exact:true}).click();
  await page.waitForFunction(()=>window.__calls.some(c=>c.method==='recover'));
  assert.equal(await page.evaluate(()=>window.__count),3);await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Phân tích bằng Muse')?.disabled);assert.equal(await send.isDisabled(),false);assert.equal(posts.length,1);
  // Reopen the same task: the receipt must remain accessible, with no send.
  await page.getByRole('button',{name:'Xem timeline',exact:true}).click();
  await page.getByRole('button',{name:'Đọc lại kết quả',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.method==='send').length),3);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,networkRequestsSent:0,measurements,apiFixturePosts:posts.length,museFixtureSends:3,museFixtureRecoveries:1,
    checks:['enabled profile only','cost disclosure','job ID only IPC','pending send locks save/collapse','parse error blocks save','repair uses same parent/profile, no upload','parse fills for review only','explicit save only','transport uncertainty blocks resend','recovery without extra turn','no three-turn cap after reconciled result','reopen receipt'],consoleErrors:errors};
  await writeFile(join(out,'T22-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {await browser.close();}
