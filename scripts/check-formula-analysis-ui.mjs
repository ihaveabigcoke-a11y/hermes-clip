// T21 source UI with synthetic data. All requests fulfilled locally; no service
// or user's browser profile is used. Desktop IPC and clipboard are fixtures.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {analysisReferences,analysisResponse,structureFor} from '../tests/fixtures/formula-analysis.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=join(root,'ops/night/out');
const build=resolve(root,process.env.HERMES_LOCAL_BUILD_DIR||'outputs/T21-build');
assert.ok(build.startsWith(join(root,'outputs')+sep));
const temp=join(root,'outputs/T21-browser');await mkdir(temp,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.PLAYWRIGHT_BROWSERS_PATH=join(temp,'browsers');
const {chromium}=await import('../desktop/node_modules/playwright/index.mjs');
const module=async file=>import(pathToFileURL(join(build,'server/lib/lab/'+file+'.mjs')));
const {referenceVideoDraftSchema,draftReferenceVideo}=await module('viral-reference');
const {viralFormulaSchema,viralFormulaRecordId}=await module('viral-formulas');
const {researchBatchSchema}=await module('operations');
const structure=structureFor(),at=Date.parse('2026-11-12T00:00:00Z');
let records=[{id:'t21_fixture',kind:'research_batch',revision:1,updatedAt:at,data:researchBatchSchema.parse({name:'T21 · DỮ LIỆU GIẢ LẬP',candidates:[]})}];
const posts=[],errors=[],blocked=[],measurements=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.HERMES_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  env:{...process.env,APPDATA:temp,LOCALAPPDATA:temp},args:['--disable-background-networking','--disable-component-update','--disable-crash-reporter','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND']});
try{
  const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.origin!=='http://127.0.0.1:4175'){blocked.push(url.href);return route.abort();}
    if(url.pathname==='/api/lab'){
      if(request.method()==='GET')return json({records});
      const body=request.postDataJSON();posts.push(body);
      assert.ok(['reference_video_draft','viral_formula'].includes(body.kind));
      const data=(body.kind==='viral_formula'?viralFormulaSchema:referenceVideoDraftSchema).parse(body.data);
      const id=body.kind==='viral_formula'?viralFormulaRecordId(data):'reference_video_draft_'+data.id;
      const previous=records.find(r=>r.id===id);
      if(body.revision!==(previous?.revision??0)||(body.kind==='viral_formula'&&previous))return json({error:'Fixture CAS conflict'},409);
      const record={id,kind:body.kind,data,revision:(previous?.revision??0)+1,updatedAt:at};
      records=[...records.filter(r=>r.id!==id),record];return json({record});
    }
    if(url.pathname.startsWith('/api/'))return json({error:'Fixture endpoint unavailable'},404);
    const path=resolve(build,'ui',url.pathname==='/'?'index.html':'.'+url.pathname);assert.ok(path.startsWith(join(build,'ui')+sep));
    try{return route.fulfill({body:await readFile(path),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'Missing fixture asset'});}
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({structure})=>{
    localStorage.setItem('product-lab-mode','real');window.__copied='';window.__ipc=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});
    const job={id:'t21_job',projectId:'formula-library',kind:'reference-structure',state:'done',request:{name:'Comment LED original.mp4'}};
    window.productLabDesktop={
      researchStatus:async()=>({runs:[]}),integrationStatus:async()=>({busy:false,jobs:[job]}),
      integrationAnalyzeStructure:async input=>{window.__ipc.push('analyze');return job;},
      integrationStructure:async()=>({jobId:job.id,projectId:job.projectId,name:job.request.name,sourceSha256:'a'.repeat(64),sourceUrl:null,structure,subtitles:[],contactSheet:{bytes:new Uint8Array([])}}),
    };
  },{structure});
  const open=async()=>{
    await page.goto('http://127.0.0.1:4175/?view=research&ops_id=t21_fixture');
    await page.locator('summary').filter({hasText:/^Công thức video/}).click();
    await page.getByRole('button',{name:'Phân tích video mẫu',exact:true}).click();
    await page.getByRole('button',{name:'Xem phân tích',exact:true}).click();
    await page.getByLabel('Tên file gốc',{exact:true}).waitFor();
  };
  await open();assert.equal(await page.getByLabel('Tên file gốc',{exact:true}).inputValue(),'Comment LED original.mp4');
  await page.getByLabel('Caption bài gốc',{exact:true}).fill('Comment LED for the link');
  assert.equal(await page.getByLabel('Caption bài gốc',{exact:true}).getAttribute('maxlength'),'2200');
  await page.getByRole('button',{name:'Sao chép prompt phân tích',exact:true}).click();
  await page.waitForFunction(()=>window.__copied.includes('ctaSource'));assert.ok((await page.evaluate(()=>window.__copied)).length<=4000);assert.equal(posts.length,0);
  const response={...analysisResponse(),ctaSource:'caption',cutCount:999};
  await page.getByLabel('Dán kết quả JSON',{exact:true}).fill(JSON.stringify({...response,hookType:'invalid'}));
  await page.getByRole('button',{name:'Đọc kết quả JSON',exact:true}).click();await page.getByRole('alert').filter({hasText:'Phản hồi chưa đúng cấu trúc'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Lưu tham chiếu',exact:true}).isDisabled(),true);
  await page.getByLabel('Dán kết quả JSON',{exact:true}).fill('```json\n'+JSON.stringify(response)+'\n```');
  await page.getByRole('button',{name:'Đọc kết quả JSON',exact:true}).click();
  await page.getByText('Nguồn CTA:',{exact:false}).filter({hasText:'Caption bài gốc'}).waitFor();
  assert.equal(posts.length,0);assert.equal(await page.getByRole('button',{name:'Tạo phiên bản công thức mới',exact:true}).count(),0);
  for(const width of [1366,1080]){
    await page.setViewportSize({width,height:900});await page.getByText('Cảnh kết quả:',{exact:false}).scrollIntoViewIfNeeded();
    const geometry=await page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth}));assert.ok(geometry.pageWidth<=width);measurements.push(geometry);
    await page.screenshot({path:join(out,`T21-analysis-${width}.png`),animations:'disabled'});
  }
  await page.getByRole('button',{name:'Lưu tham chiếu',exact:true}).click();await page.getByRole('status').filter({hasText:'Đã lưu tham chiếu nháp'}).waitFor();
  const first=records.find(r=>r.kind==='reference_video_draft');assert.equal(first.revision,1);assert.equal(first.data.analysis.cutCount,structure.cutCount);assert.equal(first.data.analysis.ctaSource,'caption');
  assert.ok(first.data.analysis.warnings.some(w=>w.includes('Số lần cắt')));assert.equal(posts.filter(p=>p.kind==='viral_formula').length,0);
  await page.getByRole('button',{name:'Tạo phiên bản công thức mới',exact:true}).first().click();
  await page.getByRole('status').filter({hasText:'Đã tạo phiên bản'}).waitFor();assert.equal(records.filter(r=>r.kind==='viral_formula').length,1);
  const appended=records.find(r=>r.kind==='viral_formula');assert.equal(appended.data.version,2);assert.equal(posts.at(-1).revision,0);
  await page.getByLabel('Tên file gốc',{exact:true}).fill('Edited Comment LED.mp4');
  assert.equal(await page.getByRole('button',{name:'Lưu tham chiếu',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Đọc kết quả JSON',exact:true}).click();await page.getByRole('button',{name:'Lưu tham chiếu',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Đã lưu tham chiếu nháp'}).waitFor();assert.equal(records.find(r=>r.id===first.id).revision,2);
  await open();assert.equal(await page.getByLabel('Tên file gốc',{exact:true}).inputValue(),'Edited Comment LED.mp4');
  assert.equal(await page.getByLabel('Caption bài gốc',{exact:true}).inputValue(),'Comment LED for the link');
  // Simulate a concurrent save after opening: stale revision must not overwrite it.
  records=records.map(r=>r.id===first.id?{...r,revision:3}:r);
  await page.getByRole('button',{name:'Lưu tham chiếu',exact:true}).click();await page.getByRole('alert').filter({hasText:'CAS conflict'}).waitFor();
  assert.equal(posts.at(-1).revision,2);assert.equal(records.find(r=>r.id===first.id).revision,3);
  assert.deepEqual(await page.evaluate(()=>window.__ipc),[]);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={fixtureOnly:true,networkRequestsSent:0,measurements,apiFixturePosts:posts.length,formulaAppends:1,
    checks:['filename autofill/edit/reopen','caption bound','clipboard prompt <=4000','invalid JSON blocks save','fenced JSON and measured override','CTA source','no proposal from unsaved analysis','explicit append-only version','draft CAS including stale conflict','no provider/analysis IPC invoked'],consoleErrors:errors};
  await writeFile(join(out,'T21-ui-check.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
