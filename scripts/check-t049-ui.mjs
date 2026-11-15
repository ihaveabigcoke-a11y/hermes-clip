// Isolated fixture UI: synthetic media, no Muse/browser account access.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {officeUI} from './office-ui.mjs';
import {runMediaTool} from '../desktop/src/compress.mjs';
import {newProduction,applyProduction,productionSchema} from '../lib/lab/production.ts';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';

const now=Date.now(),out=resolve('outputs/T-049-ui');await mkdir(out,{recursive:true});
const clip=join(out,'fixture.mp4'),thumb=join(out,'fixture.png');
await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=0x669944:s=90x160:r=24:d=1','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',clip]);
await runMediaTool('ffmpeg',['-y','-v','error','-i',clip,'-frames:v','1',thumb]);
const bytes=await readFile(clip),png=await readFile(thumb),sha256=createHash('sha256').update(bytes).digest('hex');
let production=newProduction('Dự án kiểm thử','product',1);
production=applyProduction(production,'scene',{id:'scene',name:'Clip nguồn',prompt:'A synthetic product shot.',duration:1,ratio:'9:16',mediaType:'video',referenceIds:[]},'scene');
production=applyProduction(production,'storyboard',{sceneId:'scene'},'approved');
const scene=production.scenes[0];
scene.attempts=[{id:'attempt',requestId:'old',sceneRevision:scene.revision,status:'local_complete',provider:'muse',snapshot:'{}',providerJobId:'provider_old',usageUsd:null,createdAt:now}];
scene.takes=[1,2].map(i=>({id:'take'+i,attemptId:'attempt',assetId:'clip'+i,name:'Biến thể '+i,type:'video/mp4',sha256,size:bytes.length,
  provider:'muse',metadata:{width:90,height:160,duration:1,verifiedBy:'container'},sceneRevision:scene.revision,review:'pending',notes:'',createdAt:now+i}));
productionSchema.parse(production);
const records=[{id:'product',kind:'product',revision:1,updatedAt:now,data:{name:'Sản phẩm kiểm thử',archived:false}},
  {id:'project',kind:'production',revision:1,updatedAt:now,data:production}];
const request={projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:scene.revision,name:'Clip nguồn',prompt:MUSE_VIDEO_COMMAND+'\nA synthetic shot.',mediaType:'video',ratio:'9:16',duration:1};
const old={id:'old',queueNumber:1,state:'ready',label:'Đã vào Thư viện',createdAt:now,profileId:'Duc',providerId:'provider_old',providerUrl:'https://muse.ai/thread/fixture',uploadedAssetId:'clip1',importedAt:now,request,output:null,history:[]};
const duplicate={...old,id:'duplicate',queueNumber:2,state:'failed',label:'Trùng clip cũ #1',createdAt:now+1,uploadedAssetId:null,importedAt:null,request:{...request,sceneId:'new',name:'Cảnh nhận clip cũ'},
  reconciled:true,failureCode:'MUSE_OLD_CLIP',failureDetail:'Trùng clip cũ #1. Giữ biên nhận; chọn tạo lại hoặc nhập tay.',
  duplicateOf:{jobId:'old',projectId:'project',sceneId:'scene',queueNumber:1,number:1,assetId:'clip1',takeId:'take1',sha256},providerResponse:'Biên nhận kiểm thử vẫn được giữ.',history:[{at:now,state:'failed',note:'Trùng clip cũ #1'}]};
const fixture={profiles:[{id:'Duc',name:'Duc',enabled:true,vpnEnabled:true,health:'ready',proxy:{server:'',username:''},quota:{state:'available'},vpn:{state:'connected'}}],
  jobs:[duplicate,old],musePaused:false,generationReady:true,active:0,budget:0,paused:true,batch:null,freeRamGb:8};
await officeUI('T-049',records,async({page,origin,screenshot})=>{
  await page.context().addInitScript(fixture=>{window.qaStatus=fixture;window.qaSends=0;window.productLabDesktop={...window.productLabDesktop,status:async()=>window.qaStatus,enqueue:async()=>{window.qaSends++;throw Error('No sends');}};},fixture);
  await page.route('**/api/assets/clip*',route=>route.fulfill({contentType:route.request().url().includes('thumbnail')?'image/png':'video/mp4',body:route.request().url().includes('thumbnail')?png:bytes}));
  await page.goto(origin+'/?view=queue');await page.getByRole('button',{name:'Chi tiết Cảnh nhận clip cũ',exact:true}).click();
  const link=page.getByRole('link',{name:'Trùng clip cũ #1',exact:true});assert.equal(await link.getAttribute('href'),'?view=library&lib_asset=clip1');
  assert.equal(await page.getByRole('complementary',{name:'Chi tiết tác vụ'}).getByRole('button',{name:'Tạo lại',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('link',{name:'nhập tay',exact:true}).count(),1);
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await link.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('duplicate-'+width);}
  await link.click();await page.getByLabel('Phiên bản',{exact:true}).waitFor();assert.equal(await page.getByLabel('Phiên bản',{exact:true}).locator('option').count(),2);
  const video=page.locator('video[src="/api/assets/clip1"]');await video.evaluate(async v=>{await v.play();});await page.waitForFunction(()=>document.querySelector('video[src="/api/assets/clip1"]')?.currentTime>0);await video.evaluate(v=>v.pause());
  await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();
  await page.getByText('Lọc chi tiết',{exact:true}).click();
  await page.getByLabel('Hiện mọi phiên bản',{exact:true}).check();await page.getByText('1 ý tưởng · 2 biến thể',{exact:true}).waitFor();
  assert.equal(await page.locator('.workspace-media-grid .media-card').count(),1);assert.equal(await page.locator('.library-count').innerText(),'1');
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await page.locator('.workspace-media-grid .media-card').hover();await page.waitForTimeout(350);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('ideas-'+width);}
  assert.equal(await page.evaluate(()=>window.qaSends),0);assert.deepEqual(await page.evaluate(()=>window.qaStatus),fixture);
  return {sourceLink:true,sourcePlayback:true,twoVariantsOneIdea:true,switchesAndReceiptsUnchanged:true,museSends:0};
});
