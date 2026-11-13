import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir,stat,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {officeUI} from './office-ui.mjs';
import {officeFixture} from '../tests/fixtures/office-view.mjs';
import {emptyProduct,schemas,vietnamDay} from '../lib/lab/domain.ts';
import {newProduction} from '../lib/lab/production.ts';
import {buildOfficeView} from '../lib/lab/office-view.ts';
import {planDistribution} from '../lib/lab/publish-board.ts';

const out=resolve('outputs/T-026j-fixture'),now=Date.now();await mkdir(out,{recursive:true});
const videoRecords=JSON.parse(await readFile('outputs/T-026f-media/acceptance-records.json','utf8'));
const dirs=(await readdir('outputs/T-026f-ui',{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name.startsWith('isolated-'));
const asset=videoRecords.find(r=>r.kind==='asset');let source;
for(const dir of dirs){const path=resolve('outputs/T-026f-ui',dir.name,'workspace');try{await stat(join(path,'media',asset.data.key));source=path;break;}catch{}}
assert.ok(source,'Run check-t026f-ui first to create synthetic source media');
const frame=join(out,'fixture-frame.png');await promisify(execFile)(resolve('desktop/tools/ffmpeg/bin/ffmpeg.exe'),['-y','-v','error','-i',resolve('outputs/T-026f-media/scene-0.mp4'),'-frames:v','1',frame],{windowsHide:true});
const bytes=await readFile(frame),sha256=createHash('sha256').update(bytes).digest('hex'),imageId='t026_frame';
const imageRecord={id:imageId,kind:'asset',revision:1,createdAt:now,updatedAt:now,data:{name:'fixture-frame.png',key:'local-owner/'+imageId+'.png',type:'image/png',size:bytes.length,sha256,metadata:{width:720,height:1280,duration:null,verifiedBy:'container'}}};
const f=officeFixture({emptyProduct,researchBatchSchema:schemas.research_batch,newProduction},now);
const records=[...videoRecords,...f.records,imageRecord],product=videoRecords.find(r=>r.kind==='product'),project=videoRecords.find(r=>r.kind==='production');
for(const job of f.jobs){job.request={...job.request,projectId:project.id,productId:product.id};if(job.uploadedAssetId)job.uploadedAssetId=project.data.exports[0].assetId;}
for(const p of records.filter(r=>r.kind==='product'))p.data.imageUrl='/api/assets/'+imageId;
product.data.purchaseUrl='https://shop.invalid/lamp';
for(const b of records.filter(r=>r.kind==='research_batch'))for(const c of b.data.candidates)c.imageUrl='/api/assets/'+imageId;
const accounts=Array.from({length:5},(_,i)=>({id:'qa_account_'+i,kind:'social_account',revision:1,createdAt:now,updatedAt:now,data:{name:'Kênh '+(i+1),handle:'fixture'+i,productId:product.id,contentAngle:'',bio:'',notes:'',archived:false}}));records.push(...accounts);
const plans=planDistribution(records,{projectId:project.id,revision:project.revision,sourceGroupId:project.data.variants[0].comparisonGroupId,batchId:'qa_distribution',accountIds:accounts.map(a=>a.id),landingBaseUrl:product.data.purchaseUrl},now);
records.push(...plans.map(p=>({...p,data:{...p.data,status:'published_manual',postUrl:'https://www.instagram.com/reel/FIXTURE'+p.id+'/',postedAt:new Date(now-49*3600000).toISOString()}})));
const screens=[['signals','signals'],['overview','today'],['research','research'],['products','products'],['production','video'],['social','publish'],['results','results']];
const axePath=resolve('outputs/T-022c-audit-tool/package/axe.min.js');
for(const mode of ['empty','full'])await officeUI('T-026j-'+mode,mode==='full'?records:[],async({page,origin,local,screenshot,out})=>{
 page.setDefaultTimeout(12000);await page.emulateMedia({reducedMotion:'reduce'});const audits=[],checks=[],issues=[];
 if(mode==='full'){
  for(const a of videoRecords.filter(r=>r.kind==='asset')){const dest=join(local.root,'media',a.data.key);await mkdir(dirname(dest),{recursive:true});await copyFile(join(source,'media',a.data.key),dest);}
  const dest=join(local.root,'media',imageRecord.data.key);await mkdir(dirname(dest),{recursive:true});await copyFile(frame,dest);
 }
 await page.route('**/api/lab?view=office',r=>r.fulfill({json:{view:buildOfficeView(mode==='full'?records:[],mode==='full'?f.jobs:[],{},[],now)}}));
 const cdp=await page.context().newCDPSession(page),shots=[];
 async function capture(name){
  await page.evaluate(()=>document.fonts.ready);
  const m=await cdp.send('Page.getLayoutMetrics');
  const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:await page.evaluate(()=>innerWidth),height:m.cssContentSize.height,scale:1}});
  await writeFile(join(out,name+'.png'),Buffer.from(shot.data,'base64'));shots.push(name+'.png');
 }
 async function audit(screen){
  await page.evaluate(()=>document.fonts.ready);await page.addScriptTag({path:axePath});
  const result=await page.evaluate(async()=>{
   const a=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
   return {version:a.testEngine.version,violations:a.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:a.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))};
  });audits.push({screen,...result});await writeFile(join(out,'axe.json'),JSON.stringify(audits,null,2));
  for(const v of result.violations)issues.push({screen,axe:v.id,nodes:v.nodes});
  await writeFile(join(out,screen+'.aria.txt'),await page.locator('#lab-main').ariaSnapshot());
 }
 async function keyboard(screen){
  await page.locator('.skip-link').focus();let reached=false;
  for(let n=0;n<45;n++){await page.keyboard.press('Tab');reached=await page.evaluate(()=>document.activeElement?.matches('[data-screen] .lab-button.primary'));if(reached)break;}
  const primary=page.locator('[data-screen] .lab-button.primary:visible');
  if(await primary.isDisabled())return;
  if(!reached)issues.push({screen,keyboard:'Primary action unreachable by Tab'});
  else {const focus=await primary.evaluate(e=>{const s=getComputedStyle(e);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0||s.boxShadow!=='none';});checks.push({screen,tabToPrimary:true,focus});if(!focus)issues.push({screen,keyboard:'No visible focus'});}
 }
 for(const [view,screen] of screens){
  await page.setViewportSize({width:1366,height:768});await cdp.send('Emulation.clearDeviceMetricsOverride');await page.emulateMedia({forcedColors:'none'});
  await page.goto(origin+'/?view='+view+'&product='+product.id);await page.locator('[data-screen='+screen+']').waitFor();
  if(screen==='signals')await page.waitForFunction(()=>document.querySelector('.compact-groups strong')?.textContent!=='—');
  await page.locator('[data-screen] img').evaluateAll(async images=>Promise.all(images.filter(i=>i.checkVisibility()).map(i=>i.decode().catch(()=>{}))));
  await audit(screen);await keyboard(screen);
  if(mode==='full')for(const treatment of ['zoom200','contrast'])for(const [width,height] of [[1366,768],[1920,1080]]){
   await cdp.send('Emulation.clearDeviceMetricsOverride');await page.setViewportSize(treatment==='zoom200'?{width:Math.floor(width/2),height:Math.floor(height/2)}:{width,height});
   if(treatment==='zoom200')await cdp.send('Emulation.setDeviceMetricsOverride',{width:Math.floor(width/2),height:Math.floor(height/2),deviceScaleFactor:2,mobile:false});
   await page.emulateMedia({forcedColors:treatment==='contrast'?'active':'none'});
   // Reload after changing forced colors: this Chrome build can retain a stale
   // composited frame although matchMedia/computed colors already changed.
   if(treatment==='contrast'){
    await page.reload();await page.locator('[data-screen='+screen+']').waitFor();
    await page.locator('[data-screen] img').evaluateAll(async images=>Promise.all(images.filter(i=>i.checkVisibility()).map(i=>i.decode().catch(()=>{}))));
   }
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.evaluate(()=>({width:innerWidth,forcedColors:matchMedia('(forced-colors: active)').matches,background:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,main:!!document.querySelector('[data-screen]')?.checkVisibility(),heading:document.querySelector('[data-screen] h1')?.textContent,scrollWidth:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,90),x:Math.round(e.getBoundingClientRect().x),w:Math.round(e.getBoundingClientRect().width),scroll:e.scrollWidth,overflow:getComputedStyle(e).overflowX})).slice(0,18)}));
   checks.push({screen,treatment,width,...layout});if(layout.overflow)issues.push({screen,treatment,width,overflow:true});
   if(screen==='publish'&&treatment==='zoom200'){
    const region=page.getByRole('region',{name:'Lịch theo tài khoản',exact:true});await region.focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.compact-publish-scroll').scrollLeft>0);
    checks.push({screen,treatment,keyboardHorizontalScroll:true});
    await page.evaluate(()=>document.querySelector('.compact-publish-scroll').scrollLeft=0);
   }
   await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,left:0,behavior:'instant'});});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),treatment==='contrast');
   await capture(screen+'-'+treatment+'-'+width);
  }
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');await page.setViewportSize({width:1366,height:768});await page.emulateMedia({forcedColors:'none'});
 await page.goto(origin+'/?view=products');await page.getByRole('button',{name:'Thêm sản phẩm',exact:true}).focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await dialog.waitFor();await page.keyboard.press('Tab');
 checks.push({modalKeyboard:await dialog.evaluate(d=>d.contains(document.activeElement))});
 for(let n=0;n<22;n++){await page.keyboard.press('Tab');if(!await dialog.evaluate(d=>d.contains(document.activeElement)))issues.push({modal:'Tab escaped dialog'});}
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 if(mode==='full'){
  await page.goto(origin+'/?view=social&product='+product.id);const card=page.locator('[data-plan]').first();await card.waitFor();
  const before=await page.evaluate(async()=> (await(await fetch('/api/lab')).json()).records);
  const plan=before.find(r=>r.id===plans[0].id),asset=before.find(r=>r.id===plan.data.assetId);
  const downloaded=page.waitForEvent('download');await card.getByRole('link',{name:'Tải MP4',exact:true}).click();const download=await downloaded;
  assert.equal(download.suggestedFilename(),plan.data.name+'.mp4');const path=join(out,'downloaded.mp4');await download.saveAs(path);
  assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),asset.data.sha256);
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});
  await card.getByRole('button',{name:'Sao chép caption',exact:true}).click();
  const caption=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(caption.includes(plan.data.utmLink));assert.ok(caption.includes(product.data.ctaKeyword));
  const after=await page.evaluate(async()=> (await(await fetch('/api/lab')).json()).records);assert.deepEqual(after,before);
  checks.push({downloadHash:true,downloadFilename:true,clipboardCaptionUTM:true,noPostMutation:true});
 }
 await writeFile(join(out,'checks.json'),JSON.stringify({mode,audits,checks,issues},null,2));
 console.log(JSON.stringify({mode,issues,checks:checks.length}));assert.deepEqual(issues,[],'See checks.json');
 return {mode,shots,audits:audits.length,checks:checks.length,screenReaderTested:false,zoom:'Equivalent 200% layout viewport and raster scale',forcedColors:'Chromium emulation'};
});