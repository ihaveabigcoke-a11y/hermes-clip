// Synthetic clips + actual local merge API/FFmpeg. No service calls or installed data.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {libraryFixture,digest} from '../desktop/test/fixtures/t051-library.mjs';
import {probeMedia,captureMediaTool} from '../desktop/src/compress.mjs';
const out=resolve('outputs/T-051-ui'),f=await libraryFixture(join(out,'fixtures'));
const status={profiles:[{id:'Duc',name:'Duc',enabled:true,vpnEnabled:true,health:'ready',proxy:{server:'',username:''},quota:{state:'available'},vpn:{state:'connected'}}],jobs:f.jobs,musePaused:false,generationReady:true,active:0,budget:0,paused:true,batch:null,freeRamGb:8};
await officeUI('T-051',f.records,async({page,origin,screenshot,local})=>{
 await mkdir(join(local.root,'media/local-owner'),{recursive:true});for(const m of f.media)await writeFile(join(local.root,'media',m.key),Buffer.from(m.base64,'base64'));
 await page.context().addInitScript(status=>{window.qaStatus=status;window.qaSends=0;window.productLabDesktop={...window.productLabDesktop,status:async()=>window.qaStatus,enqueue:async()=>{window.qaSends++;throw Error('No sends');}};},status);
 await page.goto(origin+'/?view=library');
 const merge=page.getByRole('button',{name:'Ghép (0)',exact:true});await merge.waitFor();assert.equal(await merge.isDisabled(),true);
 for(const name of ['Clip dọc có tiếng','Clip vuông im lặng','Clip ngang có tiếng'])await page.getByRole('checkbox',{name:'Chọn ghép '+name,exact:true}).check();
 await page.getByRole('button',{name:'Ghép (3)',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Tên file',{exact:true}).fill('Bản ghép thử nghiệm');
 await dialog.getByRole('button',{name:'Đưa clip 3 lên',exact:true}).click();assert.match(await dialog.locator('li').nth(1).innerText(),/Clip ngang/);
 await dialog.getByRole('button',{name:'Đưa clip 2 xuống',exact:true}).click();assert.match(await dialog.locator('li').nth(1).innerText(),/Clip vuông/);
 await dialog.getByRole('button',{name:'Bỏ clip 3',exact:true}).click();assert.equal(await dialog.locator('li').count(),2);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('merge-'+width);}
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/library/merge')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Ghép và lưu',exact:true}).click();const response=await pending;assert.equal(response.status(),200);const result=await response.json();
 await page.locator(`video[src="/api/assets/${result.assetId}"]`).waitFor();await page.getByText('Bản ghép',{exact:true}).waitFor();
 const mergedVideo=page.locator(`video[src="/api/assets/${result.assetId}"]`);await mergedVideo.evaluate(async v=>{v.muted=true;await v.play();});await page.waitForFunction(id=>document.querySelector(`video[src="/api/assets/${id}"]`)?.currentTime>0,result.assetId);await mergedVideo.evaluate(v=>v.pause());
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await screenshot('saved-'+width);}
 const fetched=await page.request.get(origin+'/api/assets/'+result.assetId);assert.equal(fetched.status(),200);const saved=join(out,'merged.mp4');await writeFile(saved,await fetched.body());const probe=await probeMedia(saved);
 assert.deepEqual([probe.width,probe.height],[720,1280]);const sum=f.records[0].data.metadata.duration+f.records[1].data.metadata.duration;assert.ok(Math.abs(probe.duration-sum)<=.1);
 await captureMediaTool('ffmpeg',['-v','error','-xerror','-i',saved,'-map','0:v','-map','0:a','-f','null','-']);
 await page.getByRole('button',{name:'Đóng hộp thoại',exact:true}).click();await page.getByRole('button',{name:'Xem Clip vuông im lặng',exact:true}).click();
 await page.getByRole('button',{name:'Xem gốc–kết quả cạnh nhau',exact:true}).click();
 const videos=page.locator('.library-comparison-players video');assert.equal(await videos.count(),2);assert.deepEqual(await videos.evaluateAll(rows=>rows.map(v=>v.getAttribute('src'))),['/api/assets/clip0','/api/assets/clip1']);
 for(const v of await videos.all()){await v.evaluate(async video=>{video.muted=true;await video.play();});}
 await page.waitForFunction(()=>[...document.querySelectorAll('.library-comparison-players video')].every(v=>v.currentTime>0));for(const v of await videos.all())await v.evaluate(video=>video.pause());
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});const boxes=await videos.evaluateAll(rows=>rows.map(v=>{const b=v.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width};}));assert.ok(boxes[1].x>boxes[0].x+boxes[0].w);assert.ok(Math.abs(boxes[0].y-boxes[1].y)<3);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('comparison-'+width);}
 await page.reload();await page.getByRole('button',{name:'Xem gốc–kết quả cạnh nhau',exact:true}).waitFor();
 for(const [i,m] of f.media.entries())assert.equal(digest(await (await page.request.get(origin+'/api/assets/clip'+i)).body()),digest(Buffer.from(m.base64,'base64')));
 assert.deepEqual(await page.evaluate(()=>window.qaStatus),status);assert.equal(await page.evaluate(()=>window.qaSends),0);
 return {merge:result,duration:probe.duration,expectedDuration:sum,frame:[probe.width,probe.height],fullDecode:true,originalHashesPreserved:true,comparisonPlayback:true,museSends:0};
});
