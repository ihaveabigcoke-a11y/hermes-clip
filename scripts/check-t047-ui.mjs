// Synthetic status + source UI; every external request is blocked by officeUI.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
const now=Date.now(),thread='https://muse.ai/thread/fixture_047';
const adapter={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:900,reviewed:true};
const profiles=['Duc','Cho','Chi'].map(name=>({id:name,name,enabled:true,proxy:{server:'',username:''},vpnEnabled:true,vpn:{state:'connected'},session:'signed_in',health:'ready',quota:{state:'available',weeklyRemainingPercent:80},busy:false,open:false,dispatch:{stopped:name==='Duc'}}));
const jobs=[thread,null,'https://muse.ai/thread/new','https://other.invalid/thread/id'].map((providerUrl,i)=>({id:'job_'+i,queueNumber:i+1,state:'needs_attention',label:'Cần đối soát',provider:'muse',createdAt:now,profileId:'Duc',providerUrl,errorKind:'refused',errorMessage:"You've reached the video generation limit in the past 24 hours.",failedAt:now,failureDetail:'Muse giới hạn video 24 giờ.',request:{projectId:'project',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name:['Đèn bàn có hội thoại','Chưa có hội thoại','Trang tạo mới','Đường dẫn khác'][i],prompt:MUSE_VIDEO_COMMAND+'\nAn approved product shot.',mediaType:'video',ratio:'9:16',duration:8},history:[{at:now,state:'needs_attention',note:'Muse giới hạn video 24 giờ.'}]}));
const fixture={musePaused:false,adapter,connection:{startUrl:adapter.startUrl},exportDirectory:'C:\\Hermes-kiem-thu\\worker\\outputs',generationReady:true,profiles,jobs,active:0,paused:true,batch:null,budget:0,freeRamGb:8,museNight:{stopped:false,remaining:null}};
await officeUI('T-047',[],async({page,origin,out})=>{
 const shots=[];const screenshot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(out,name+'.png'),animations:'disabled'});shots.push(name+'.png');};
 page.setDefaultTimeout(12000);
 await page.context().addInitScript(fixture=>{
  window.qaStatus=structuredClone(fixture);window.qaSaves=[];window.qaOpens=0;window.qaCopied=[];window.qaSends=0;
  const saved=localStorage.getItem('qa-timeout');if(saved)window.qaStatus.adapter.timeoutSeconds=Number(saved);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.qaCopyFailure)throw Error('fixture clipboard failure');window.qaCopied.push(text);}}});
  const old=window.productLabDesktop;
  window.productLabDesktop={...old,status:async()=>structuredClone(window.qaStatus),saveAdapter:async value=>{window.qaSaves.push(value);window.qaStatus.adapter=structuredClone(value);localStorage.setItem('qa-timeout',String(value.timeoutSeconds));return true;},revealExports:async()=>{window.qaOpens++;return true;},enqueue:async()=>{window.qaSends++;throw Error('No sends allowed');}};
 },fixture);
 await page.goto(origin+'/?view=accounts');await page.getByText('Cấu hình Muse và dữ liệu',{exact:true}).click();
 const input=page.getByLabel('Thời gian chờ tối đa mỗi lượt (giây)'),save=page.getByRole('button',{name:'Lưu thời gian chờ',exact:true});
 assert.equal(await input.inputValue(),'900');
 for(const value of ['59','1801','60.5','']){await input.fill(value);await save.click();await page.getByText('Thời gian chờ phải là số nguyên từ 60 đến 1800 giây.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.qaSaves.length),0);}
 for(const value of ['60','1800','900']){await input.fill(value);await save.click();await page.getByText('Đã lưu thời gian chờ tối đa mỗi lượt.',{exact:true}).waitFor();}
 assert.deepEqual(await page.evaluate(()=>window.qaSaves.map(v=>v.timeoutSeconds)),[60,1800,900]);
 assert.deepEqual(await page.evaluate(()=>window.qaStatus.adapter),adapter);
 await page.getByRole('button',{name:'Mở thư mục xuất',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaOpens),1);assert.ok((await page.locator('body').innerText()).includes(fixture.exportDirectory));
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await input.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('accounts-'+width);}
 await input.fill('1200');await save.click();await page.getByText('Đã lưu thời gian chờ tối đa mỗi lượt.',{exact:true}).waitFor();await page.reload();await page.getByText('Cấu hình Muse và dữ liệu',{exact:true}).click();assert.equal(await input.inputValue(),'1200');
 await page.goto(origin+'/?view=queue');
 for(const name of ['Chưa có hội thoại','Trang tạo mới','Đường dẫn khác']){await page.getByRole('button',{name:'Chi tiết '+name,exact:true}).click();assert.equal(await page.getByRole('button',{name:'Sao chép link',exact:true}).count(),0);}
 await page.getByRole('button',{name:'Chi tiết Đèn bàn có hội thoại',exact:true}).click();await page.getByRole('button',{name:'Sao chép link',exact:true}).click();await page.getByText('Đã sao chép link hội thoại',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.qaCopied),[thread]);
 for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await page.getByText('Đã sao chép link hội thoại',{exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('queue-'+width);}
 await page.evaluate(()=>window.qaCopyFailure=true);await page.getByRole('button',{name:'Sao chép link',exact:true}).click();await page.getByText('Không sao chép được link hội thoại. Vui lòng thử lại.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.qaSends),0);assert.equal(await page.evaluate(()=>window.qaStatus.musePaused),false);assert.deepEqual(await page.evaluate(()=>window.qaStatus.profiles),profiles);
 return {shots,timeoutBoundsAndPersistence:true,clipboardExactValue:true,missingOrInvalidLinkHidden:true,exportPathShown:true,profilesUnchanged:true,museSends:0};
});
