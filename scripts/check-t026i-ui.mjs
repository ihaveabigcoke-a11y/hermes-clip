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

const out=resolve('outputs/T-026i-measure'),now=Date.now();await mkdir(out,{recursive:true});
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
const measurement=[];
for(const mode of ['empty','full'])await officeUI('T-026i-'+mode,mode==='full'?records:[],async({page,origin,local,screenshot})=>{
 if(mode==='full'){
  for(const a of videoRecords.filter(r=>r.kind==='asset')){const dest=join(local.root,'media',a.data.key);await mkdir(dirname(dest),{recursive:true});await copyFile(join(source,'media',a.data.key),dest);}
  const dest=join(local.root,'media',imageRecord.data.key);await mkdir(dirname(dest),{recursive:true});await copyFile(frame,dest);
 }
 await page.route('**/api/lab?view=office',r=>r.fulfill({json:{view:buildOfficeView(mode==='full'?records:[],mode==='full'?f.jobs:[],{},[],now)}}));
 for(const [view,screen] of screens){
  await page.goto(origin+'/?view='+view+'&product='+product.id);await page.locator('[data-screen='+screen+']').waitFor();
  if(mode==='full'&&screen==='publish')await page.getByLabel('Sản phẩm',{exact:true}).selectOption(product.id);
  if(screen==='signals')await page.waitForFunction(()=>document.querySelector('.compact-groups strong')?.textContent!=='—');
  for(const [width,height] of [[1366,768],[1920,1080]]){
   await page.setViewportSize({width,height});
   const scope=page.locator('[data-screen='+screen+']');
   if(mode==='full')await scope.locator('img,video').first().waitFor();
   await scope.locator('img').evaluateAll(async images=>Promise.all(images.filter(i=>i.checkVisibility()).map(i=>i.decode().catch(()=>{}))));
   await scope.locator('video').evaluateAll(async videos=>{
    await Promise.all(videos.filter(v=>v.checkVisibility()).map(v=>v.readyState>=1?null:new Promise(resolve=>{
     v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000);
    })));
   });
   const result=await page.evaluate(screen=>{
    const root=document.querySelector('[data-screen='+screen+']');
    function visibleText(root,omitData=false){
     const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),chunks=[];let node;
     while(node=walker.nextNode()){
      const p=node.parentElement;if(!node.textContent.trim()||!p||p.closest('script,style,svg,.sr-only,.skip-link')||(omitData&&p.closest('[data-content-value]')))continue;
      if(p.tagName==='OPTION'){if(!p.selected||!p.parentElement.checkVisibility())continue;}else if(!p.checkVisibility())continue;
      let closed=false;for(let el=p;el&&el!==root;el=el.parentElement){if(el.tagName==='DETAILS'&&!el.open&&!el.querySelector(':scope>summary')?.contains(p)){closed=true;break;}}if(closed)continue;
      const style=getComputedStyle(p);if(style.clipPath==='inset(50%)'||style.clip==='rect(0px, 0px, 0px, 0px)')continue;
      chunks.push(node.textContent.trim());
     }
     return chunks.join(' ').replace(/\s+/g,' ').trim();
    }
    const text=visibleText(root),fixedText=visibleText(root,true),shellText=visibleText(document.querySelector('.sidebar'));
    const words=s=>(s.match(/[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*/gu)||[]).length;
    const media=[...root.querySelectorAll('img,video')].filter(e=>e.checkVisibility());
    const thumbnails=media.filter(e=>e.tagName==='IMG'?e.complete&&e.naturalWidth>0:e.readyState>=1&&e.videoWidth>0);
    return {text,words:words(text),fixedWords:words(fixedText),fixedIncludingMenu:words(visibleText(document.body,true)),shellText,shellWords:words(shellText),totalWords:words(text)+words(shellText),thumbnails:thumbnails.length,brokenMedia:media.length-thumbnails.length,primary:[...root.querySelectorAll('.lab-button.primary')].filter(e=>e.checkVisibility()).length,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,musePaused:(text.match(/Muse đang tạm dừng/g)||[]).length};
   },screen);
   if(mode==='full'){result.fixedWords=null;result.fixedIncludingMenu=null;}
   measurement.push({mode,screen,width,...result});
   assert.equal(result.horizontalOverflow,false,screen);assert.equal(result.primary,1,screen+' primary');
   if(mode==='empty')assert.ok(result.fixedIncludingMenu<=40,screen+' fixed words including menu='+result.fixedIncludingMenu);
   else {assert.ok(result.thumbnails>=1,screen+' must load a real fixture image/video');assert.equal(result.brokenMedia,0,screen+' broken fixture media');}
   if(screen==='video')assert.equal(result.musePaused,1);
   await screenshot(screen+'-'+mode+'-'+width);
  }
 }
 await writeFile(join(out,'measure-'+mode+'.json'),JSON.stringify(measurement.filter(x=>x.mode===mode),null,2));
 return {mode,measurements:measurement.filter(x=>x.mode===mode).map(({text,shellText,...r})=>r)};
});
await writeFile(join(out,'measurement.json'),JSON.stringify({fixture:true,externalServices:false,method:'Visible text nodes, selected option only, closed details/tooltips excluded. Fixed words INCLUDE shared navigation. Only six run counter values are data-content-value and excluded from fixed words. Raw counts also reported.',rows:measurement},null,2));
