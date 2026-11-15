// Source UI + production API + Worker with fake Muse only. No external traffic.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {officeUI} from './office-ui.mjs';
import {Store} from '../desktop/src/store.mjs';
import {Worker} from '../desktop/src/worker.mjs';
import {ManualMedia} from '../desktop/src/manual-media.mjs';
import {importWorkerOutput} from '../desktop/local/import-worker.mjs';
import {prepareContinuationScene} from '../desktop/src/muse-continuation.mjs';
import {MuseAdapter} from '../desktop/src/muse.mjs';
import {runMediaTool} from '../desktop/src/compress.mjs';
import {config,fakePage} from '../desktop/test/fixtures/t052-muse.mjs';
import {libraryFixture,digest} from '../desktop/test/fixtures/t051-library.mjs';
const root=await mkdtemp(join(tmpdir(),'t052-ui-')),f=await libraryFixture(root),store=new Store(':memory:');
store.set('adapter',config);store.set('muse_paused',false);store.set('profiles',['Duc','Cho','Chi'].map(name=>({id:name,name,enabled:true,health:'ready',session:'signed_in',proxy:{server:''},vpnEnabled:true,quota:{state:'available'}})));
const worker=new Worker(store,root,{},{},()=>8*1024**3),pages=[];worker.checkToolchain=async()=>{};worker.measureQuota=async()=>{};worker.setProfileVisibility=async()=>{};
worker.context=async id=>{assert.equal(id,'Duc');return {pages:()=>[],newPage:async()=>{const page=fakePage();pages.push(page);return page;}};};
for(const [i,job] of f.jobs.entries())store.put({...job,fingerprint:job.id,provider:'muse',providerUrl:i===2?'https://evil.test/thread/no':'https://muse.ai/thread/fixture_'+i,output:{path:f.paths[i],name:'old.mp4',sha256:f.records[i].data.sha256,metadata:f.records[i].data.metadata},request:{...job.request,references:[]}});
const oldJobs=JSON.stringify(store.jobs()),original=store.job('job0');
const png=join(root,'fresh.png');await runMediaTool('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=yellow:s=90x160','-frames:v','1',png]);
const originalFetch=MuseAdapter.prototype.fetch;
MuseAdapter.prototype.fetch=async(_page,_job,checkpoint,path)=>{await checkpoint('waiting');await checkpoint('downloading');await copyFile(png,path);return path;};
try {await officeUI(process.env.HERMES_UI_TASK||'T-052',f.records,async({page,origin,local,screenshot})=>{
  // Seeded assets via local server, no installation data.
  await mkdir(join(local.root,'media/local-owner'),{recursive:true});
  worker.root=dirname(local.root);
  for(const item of f.media)await writeFile(join(local.root,'media',item.key),Buffer.from(item.base64,'base64'));
  const manual=new ManualMedia({store,local});worker.readMediaRecords=()=>manual.records();worker.validateMediaProvider=(r,o)=>manual.assertMuseScene(r,o);
  worker.prepareContinuationRequest=(s,r,id)=>prepareContinuationScene(manual,s,r,id);worker.receiveOutput=id=>importWorkerOutput(local,worker,id);
  await page.exposeFunction('qaContinue',payload=>worker.continueConversation({...payload,references:payload.references.map(r=>({...r,bytes:new Uint8Array(r.bytes)}))}));
  await page.exposeFunction('qaStatus',()=>worker.status());
  await page.context().addInitScript(()=>{const old=window.productLabDesktop;window.productLabDesktop={...old,status:()=>window.qaStatus(),continueConversation:p=>window.qaContinue({...p,references:p.references.map(r=>({...r,bytes:[...r.bytes]}))})};});
  await page.goto(origin+'/?view=queue');await page.getByRole('heading',{name:'Hàng đợi Muse',exact:true}).waitFor();
  const badRow=page.locator('.queue-row').filter({hasText:'Clip ngang có tiếng'});assert.equal(await badRow.getByRole('button',{name:'Tiếp tục hội thoại này'}).count(),0);
  await page.getByRole('button',{name:'Chi tiết Clip dọc có tiếng',exact:true}).click();
  await page.locator('.queue-detail').getByRole('button',{name:'Tiếp tục hội thoại này',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Tiếp tục hội thoại này'});
  assert.equal(await dialog.getByRole('button',{name:'Gửi tiếp',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:'Hủy',exact:true}).click();assert.equal(pages.length,0);
  await page.locator('.queue-detail').getByRole('button',{name:'Tiếp tục hội thoại này',exact:true}).click();
  await dialog.getByLabel('Muốn Muse làm tiếp gì?').fill('Tạo ảnh sản phẩm trên bàn, ánh sáng ấm.');await dialog.getByRole('button',{name:'Ảnh',exact:true}).click();
  await dialog.getByLabel('Ảnh tham chiếu (tối đa 4)').setInputFiles([{name:'reference.png',mimeType:'image/png',buffer:await readFile(png)}]);
  const hint=dialog.locator('#muse-continuation-language-hint');
  assert.equal(await hint.innerText(),'Nên gõ tiếng Anh để Muse hiểu chính xác (tiếng Việt vẫn được, Muse tự chuyển ý).');
  assert.equal(await dialog.getByLabel('Muốn Muse làm tiếp gì?').getAttribute('aria-describedby'),'muse-continuation-language-hint');
  for(const width of [1366,1920]){
    await page.setViewportSize({width,height:width===1366?900:1080});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const textBox=await dialog.getByLabel('Muốn Muse làm tiếp gì?').boundingBox(),hintBox=await hint.boundingBox();
    assert.ok(hintBox&&textBox&&hintBox.y>=textBox.y+textBox.height&&hintBox.x>=0&&hintBox.x+hintBox.width<=width);
    assert.equal(await hint.isVisible(),true);await dialog.getByRole('button',{name:'Gửi tiếp',exact:true}).click({trial:true});
    await screenshot('continue-form-'+width);
  }
  await dialog.getByRole('button',{name:'Gửi tiếp',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('.queue-rows')?.textContent.includes('Tiếp tục · Clip dọc có tiếng'));
  const deadline=Date.now()+20000;while(worker.active.size||worker.pendingTicks.size){assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,20));}
  const created=store.jobs().find(j=>j.continueOf);assert.equal(created.state,'ready');assert.ok(created.importedAt,created.importError);assert.equal(created.profileId,'Duc');assert.equal(created.providerUrl,original.providerUrl);assert.equal(created.request.mediaType,'image');assert.notEqual(created.request.sceneId,original.request.sceneId);
  await page.evaluate(()=>window.dispatchEvent(new Event('product-lab:workspace-changed')));
  await page.getByRole('button',{name:'Chi tiết Tiếp tục · Clip dọc có tiếng',exact:true}).click();
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?900:1080});await screenshot('continued-'+width);}
  await page.locator('.queue-detail').getByRole('button',{name:/↳ #1/}).click();assert.match(await page.locator('.queue-detail h3').innerText(),/Clip dọc có tiếng/);
  await page.reload();await page.getByRole('button',{name:'Chi tiết Tiếp tục · Clip dọc có tiếng',exact:true}).click();assert.equal(await page.locator('.queue-detail').getByRole('button',{name:/↳ #1/}).count(),1);
  assert.equal(JSON.stringify(store.jobs().filter(j=>!j.continueOf)),oldJobs);assert.equal(pages.length,1);assert.equal(pages[0].sent,1);assert.deepEqual(pages[0].navigation,[original.providerUrl]);assert.equal(store.get('muse_paused'),false);assert.ok(store.get('profiles').every(p=>p.enabled&&p.vpnEnabled));
  const records=await manual.records(),project=records.find(r=>r.id==='project');assert.equal(project.data.scenes.length,4);assert.deepEqual(project.data.scenes.slice(0,3),f.records.find(r=>r.id==='project').data.scenes);
  return {fakeMuseSends:1,realMuseSends:0,continuedImageImported:true,originalJobsUnchanged:true,chipNavigation:true,switchesUnchanged:true};
},{workerStore:store});} finally {await worker.close();store.close();MuseAdapter.prototype.fetch=originalFetch;}
