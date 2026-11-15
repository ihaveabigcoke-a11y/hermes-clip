// Source-built UI with synthetic status/records. No Muse, real profiles or installed DB.
import assert from 'node:assert/strict';
import {officeUI} from './office-ui.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
const now=Date.now();
const product={id:'fixture_product',kind:'product',revision:1,createdAt:now,updatedAt:now,data:{...emptyProduct,name:'Ấm đun kiểm thử',productKey:'AM-THU',ctaKeyword:'WARM',cost:4,shipping:2,price:24}};
const names=['Chờ gửi','Đang chờ clip','Muse chưa có file','Đã nhận clip','Đã dừng','Cần đối soát','Lỗi nhập file'];
const jobs=['queued','waiting','failed','ready','cancelled','needs_attention','ready'].map((state,i)=>({
 id:'job_'+(i+1),queueNumber:i+1,state,label:['Chờ gửi','Đang chờ kết quả','Lỗi','Đã vào Thư viện','Đã dừng','Cần kiểm tra','File đã tải · lỗi nhập'][i],createdAt:now-i*1000,
 profileId:i%2?'Cho':'Duc',request:{projectId:'fixture_project',productId:product.id,sceneId:'scene_'+i,productRevision:1,sceneRevision:1,name:names[i],prompt:MUSE_VIDEO_COMMAND+'\n'+(i===2?'A BLUE kettle turns on a table.':'A product close-up.'),mediaType:'video',ratio:'9:16',duration:8},
 history:[{at:now,state,note:i===2?'Muse trả lời nhưng không có file.':'Dữ liệu kiểm thử'}],
 ...(i===2?{failureDetail:'Muse trả lời nhưng không có file.\nhttps://fixture.invalid/video?signature=private token=secret'}:{}),...(i===6?{importError:'Không nhập được file.'}:{})
}));
const profiles=['Chi','Cho','Duc','Chim'].map(name=>({id:name,name,enabled:true,health:'ready',session:'signed_in',quota:{state:'available'},dispatch:{stopped:name==='Chi'},vpnEnabled:true,busy:false}));
const fixture={musePaused:false,generationReady:true,profiles,jobs,active:1,paused:true,batch:null,budget:0,freeRamGb:8,museNight:{stopped:false,remaining:null}};
const measurement={measuredAt:now-60000,elapsedMs:85344,sceneCount:5,hookCount:3,profileIds:['Cho','Duc','Chim']};
await officeUI('T-043',[product],async({page,origin,screenshot})=>{
 page.setDefaultTimeout(12000);
 await page.context().addInitScript(({fixture,measurement})=>{
  window.qaStatus=fixture;window.qaMeasurement=measurement;window.qaSends=0;
  const old=window.productLabDesktop;
  window.productLabDesktop={...old,status:async()=>structuredClone(window.qaStatus),warmMuseProfiles:async()=>[],
   loadUiState:async p=>p.key==='videoMeasurement'?window.qaMeasurement:old.loadUiState(p),
   musePackageStart:async()=>{window.qaSends++;throw Error('Fixture blocks all sends');}};
 },{fixture,measurement});
 await page.goto(origin+'/?view=queue');await page.getByRole('heading',{name:'Hàng đợi Muse',exact:true}).waitFor();
 const filters=page.getByRole('group',{name:'Lọc trạng thái tác vụ'}),rows=page.locator('.queue-rows > li'),search=page.getByPlaceholder('Tìm prompt, #N, sản phẩm, cảnh hoặc hồ sơ…');
 for(const [name,count] of [['Tất cả',7],['Đang chạy',1],['Lỗi',1],['Xong',1]]){
  const tab=filters.getByRole('button',{name:new RegExp('^'+name+'\\s*'+count+'$')});await tab.click();assert.equal(await rows.count(),count);assert.equal(await tab.getAttribute('aria-pressed'),'true');
 }
 await filters.getByRole('button',{name:/^Tất cả/}).click();await search.fill('blue kettle');assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/#3/);
 assert.match(await rows.innerText(),/Muse trả lời nhưng không có file/);assert.doesNotMatch(await rows.innerText(),/signature|private|secret|https:/);
 await search.fill('#2');assert.equal(await rows.count(),1);assert.match(await rows.innerText(),/Đang chờ clip/);
 await search.fill('#99');assert.equal(await rows.count(),0);await search.fill('');
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Chi tiết Muse chưa có file',exact:true}).click();
  assert.ok(await page.locator('.queue-error-summary').first().evaluate(e=>e.getBoundingClientRect().height<30));
  await screenshot('queue-'+width);
 }
 await page.goto(origin+'/?view=production');const preview=page.locator('#video-send-preview');await preview.waitFor();
 await page.waitForFunction(()=>document.querySelector('#video-send-preview')?.textContent.includes('~85 s'));
 assert.equal(await preview.innerText(),'3 hook · 5 thẻ cần tạo → Cho / Duc / Chim · 3 hồ sơ, dự kiến ~85 s');
 assert.equal(await page.getByRole('button',{name:'Làm video',exact:true}).getAttribute('aria-describedby'),'video-send-preview');
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('video-'+width);}
 await page.evaluate(()=>{window.qaStatus.profiles.find(p=>p.name==='Duc').dispatch.stopped=true;window.dispatchEvent(new Event('product-lab:workspace-changed'));});
 await page.waitForFunction(()=>document.querySelector('#video-send-preview')?.textContent.includes('Cho / Chim · 2 hồ sơ'));
 assert.doesNotMatch(await preview.innerText(),/~|Duc|\/ Chi /);
 // Reload with no measurement: no default zero or invented 85 seconds.
 await page.context().addInitScript(()=>{window.qaMeasurement=null;});await page.reload();await preview.waitFor();
 await page.waitForFunction(()=>document.querySelector('#video-send-preview')?.textContent.includes('Cho / Duc / Chim'));
 assert.doesNotMatch(await preview.innerText(),/~|dự kiến|0 s/);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:1080});await screenshot('video-no-measurement-'+width);}
 assert.equal(await page.evaluate(()=>window.qaSends),0);
 return {queueCounts:{all:7,active:1,failed:1,done:1},profileCounts:[3,2],estimateFromFixtureMs:85344,unknownEstimateHidden:true,museSends:0};
});
