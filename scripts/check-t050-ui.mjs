// Real store/worker projection + isolated source UI. No provider/browser session.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {Store} from '../desktop/src/store.mjs';
import {Worker} from '../desktop/src/worker.mjs';
import {MUSE_VIDEO_COMMAND} from '../desktop/src/muse-video-prompt.mjs';
import {isRunningJob} from '../desktop/src/job-status.mjs';
const root=resolve('outputs/T-050-ui');await mkdir(root,{recursive:true});
const store=new Store(':memory:'),worker=new Worker(store,root,{},{}),now=Date.now();
store.set('muse_paused',false);store.set('adapter',{enabled:true,timeoutSeconds:60});
store.set('profiles',[{id:'one',name:'Hồ sơ kiểm thử',enabled:true,vpnEnabled:true,proxy:{server:'',username:''},health:'ready'}]);
const jobs=['Cảnh chờ một','Cảnh chờ hai','Cảnh đã lưu'].map((name,i)=>{
  const j=store.enqueue({projectId:'project',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name,prompt:MUSE_VIDEO_COMMAND+'\nA synthetic scene.',mediaType:'video',ratio:'9:16',duration:1,references:[]},'t050_'+i).job;
  return store.put({...j,state:i===2?'ready':'waiting',profileId:'one',providerId:'result_'+i,providerUrl:'https://muse.invalid/thread/fixture',heartbeatAt:now});
});
const old=store.job(jobs[2].id),switches=store.get('profiles');
try{await officeUI('T-050',[],async({page,origin,screenshot})=>{
  await page.context().exposeFunction('qaWorkerStatus',()=>worker.status());
  await page.context().addInitScript(()=>{window.productLabDesktop={...window.productLabDesktop,status:()=>window.qaWorkerStatus()};});
  await page.goto(origin+'/?view=queue');await page.getByText('2 đang chạy · không giới hạn lượt trong Hermes',{exact:true}).waitFor();
  const filters=page.getByRole('group',{name:'Lọc trạng thái tác vụ'});
  assert.equal(await filters.getByRole('button',{name:/^Đang chạy\s*2$/}).count(),1);
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await screenshot('running-'+width);}
  store.recover({restart:false,now:now+60000});
  await page.reload();await page.getByText('0 đang chạy · không giới hạn lượt trong Hermes',{exact:true}).waitFor();
  assert.equal(await filters.getByRole('button',{name:/^Đang chạy\s*0$/}).count(),1);
  assert.equal(await filters.getByRole('button',{name:/^Lỗi\s*2$/}).count(),1);
  await page.getByRole('button',{name:'Chi tiết Cảnh chờ một',exact:true}).click();
  const details=page.getByRole('complementary',{name:'Chi tiết tác vụ'});
  assert.equal(await details.getByRole('button',{name:'Tạo lại',exact:true}).isDisabled(),true);
  assert.equal(await details.getByRole('button',{name:'Lấy tiếp kết quả cũ',exact:true}).isEnabled(),true);
  await details.getByText('Lỗi: mất dấu',{exact:true}).waitFor();
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await details.getByRole('button',{name:'Tạo lại',exact:true}).scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot('lost-'+width);}
  const status=worker.status();assert.equal(status.active,status.jobs.filter(isRunningJob).length);assert.deepEqual(store.job(old.id),old);assert.deepEqual(store.get('profiles'),switches);assert.equal(store.get('muse_paused'),false);
  return {storeHeaderMatchesCards:true,retryDisabled:true,oldResultUnchanged:true,switchesUnchanged:true,museSends:0};
});}finally{store.close();}
