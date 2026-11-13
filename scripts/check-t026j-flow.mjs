import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {officeUI} from './office-ui.mjs';
import {emptyProduct} from '../lib/lab/domain.ts';
import {getRenderPlan} from '../lib/lab/render-plan.ts';
import {ManualMedia} from '../desktop/src/manual-media.mjs';
import {Store} from '../desktop/src/store.mjs';
import {Integrations} from '../desktop/src/integrations.mjs';
const exec=promisify(execFile),out=resolve('outputs/T-026j-flow-media');await mkdir(out,{recursive:true});
const ffmpeg=resolve('desktop/tools/ffmpeg/bin/ffmpeg.exe'),sources=[];
for(let i=0;i<5;i++){const path=join(out,'scene-'+i+'.mp4');await exec(ffmpeg,['-y','-v','error','-f','lavfi','-i',`color=c=${['0x71622e','0x316674','0x573d71','0x385b45','0x6d4b38'][i]}:s=720x1280:r=24:d=8`,'-f','lavfi','-i',`sine=frequency=${300+i*100}:duration=8`,'-vf',`drawbox=x=${100+i*50}:y=200:w=150:h=350:color=0xd4ff3a:t=fill`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path],{windowsHide:true});sources.push(await readFile(path));}
const p={id:'flow_product',kind:'product',revision:1,createdAt:Date.now(),updatedAt:Date.now(),data:{...emptyProduct,name:'Đèn kiểm thử',productKey:'DEN-THU',ctaKeyword:'GLOW',cost:4,shipping:2,price:24,purchaseUrl:'https://shop.invalid/lamp',imageUrl:'https://fixture.invalid/lamp.svg'}};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#333c37"/><path d="M200 80h80l40 80H160zM240 160v70m-50 0h100" fill="#c8ef54" stroke="#c8ef54" stroke-width="12"/></svg>';
for(const mode of ['full']){const store=new Store(':memory:');store.set('muse_paused',false);await officeUI('T-026j-flow'+(mode==='full'?'':'-'+mode),mode==='empty'?[]:[p,{id:'workspace',kind:'settings',revision:1,createdAt:Date.now(),updatedAt:Date.now(),data:{budgetUsd:0,paused:false,providerName:'',providerDocs:'',notes:'',resultThresholds:{minViews:100,minKeywordComments:10}}}],async({page,origin,screenshot,local})=>{
 await page.route('https://fixture.invalid/lamp.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 const cookies=await page.context().cookies(),headers={Cookie:cookies.map(c=>c.name+'='+c.value).join('; '),Origin:origin};
 const request=async(path,body)=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.ok(res.ok,JSON.stringify(data));return data;};
 const upload=async(bytes,name)=>{const form=new FormData();form.append('file',new File([bytes],name,{type:'video/mp4'}));const response=await fetch(origin+'/api/assets',{method:'POST',headers,body:form});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;};
 await mkdir(join(out,'render-'+mode),{recursive:true});const integrations=new Integrations(store,join(out,'render-'+mode));integrations.loadInstalledConfig(JSON.parse(await readFile('desktop/.integrations/config.json','utf8')));
 const manualService=new ManualMedia({store,local});let starts=0,renderCount=0,manual=[];
 await page.exposeFunction('fakeFlowStart',async({projectId})=>{starts++;if(mode==='refused'){const request={projectId,sceneId:'auto_0',productId:p.id,name:'Fixture refused',mediaType:'video'};const {job}=store.enqueue(request,'refused-fixture');store.put({...job,state:'needs_attention',failureCode:'MUSE_REFUSED',history:[...job.history,{at:Date.now(),state:'submitted',note:'Fake submitted'},{at:Date.now(),state:'needs_attention',note:'Fake refusal'}]});store.set('muse_paused',true);throw Error('Muse từ chối (fixture)');}let project=(await request('/api/lab')).records.find(r=>r.id===projectId);
 for(const scene of project.data.scenes.filter(s=>!s.takes.some(t=>t.sceneRevision===s.revision&&t.review!=='rejected'))){const i=Number(scene.id.replace('auto_',''));const asset=await upload(sources[i],'fixture-'+i+'.mp4');project=(await request('/api/production',{id:projectId,revision:project.revision,commandId:projectId+'_take'+i,action:'attach',input:{sceneId:'auto_'+i,attemptId:null,assetId:asset.id}})).record;}
 return {count:5};});
 await page.exposeFunction('fakeFlowRender',async({projectId,variantId})=>{renderCount++;const rows=(await request('/api/lab')).records,pr=rows.find(r=>r.id===projectId),plan=getRenderPlan(pr.data,projectId,variantId),clips=[];
 for(const s of plan.segments){const a=rows.find(r=>r.id===s.assetId);clips.push({bytes:new Uint8Array(await(await fetch(origin+'/api/assets/'+a.id,{headers})).arrayBuffer()),sha256:s.sha256,duration:a.data.metadata.duration,inSec:s.inSec,outSec:s.outSec});}
 const job=await integrations.compose({planVersion:1,projectId,variantId,ratio:'9:16',clips,overlays:plan.overlays});const result=await integrations.output(job.id);return {...result,preparedToken:local.registerPreparedMedia(result),bytes:Array.from(result.bytes),renderPlan:plan};});
 await page.exposeFunction('fakeFlowManual',async input=>{manual.push(input);return manualService.exportPack(input);});
 await page.exposeFunction('fakeFlowJobs',async()=>store.jobs());
 await page.addInitScript(({mode})=>{const base=window.productLabDesktop;let refused=false;Object.assign(base,{status:async()=>({musePaused:refused,generationReady:true,profiles:[],jobs:await window.fakeFlowJobs(),active:0,paused:false,batch:null}),musePackagePreview:async()=>({count:5,blocked:0,night:{stopped:false,remaining:12}}),musePackageStart:async input=>{try{return await window.fakeFlowStart(input);}catch(e){refused=true;throw e;}},museNightStatus:async()=>({stopped:refused,remaining:12}),manualMediaExport:input=>window.fakeFlowManual(input),renderPlannedVideo:async input=>{const r=await window.fakeFlowRender(input);return {...r,bytes:new Uint8Array(r.bytes)};}});}, {mode});
 try{await page.goto(origin+'/?view=production');await page.locator('[data-screen=video]').waitFor();
 if(mode!=='empty'){
 await page.locator('[data-screen=video]').getByRole('button',{name:'Làm video',exact:true}).click();
 if(mode==='full')await page.waitForFunction(()=>document.querySelectorAll('[data-video-exports] video').length===3||!!document.querySelector('[data-screen=video] [role=alert]'),null,{timeout:180000});
 else await page.waitForFunction(()=>document.querySelector('[data-screen=video]').innerText.includes('Chờ file tay'),null,{timeout:20000});
 }
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('video-'+mode+'-'+width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 const rows=(await request('/api/lab')).records,project=rows.find(r=>r.kind==='production');
 if(mode==='full'){assert.equal(await page.locator('[data-screen=video] [role=alert]').count(),0,await page.locator('[data-screen=video]').innerText());assert.equal(project.data.exports.length,3);assert.equal(new Set(project.data.variants.map(v=>v.hookTechnique)).size,3);await writeFile(join(out,'acceptance-records.json'),JSON.stringify(rows));const plans=project.data.exports.map(e=>e.renderPlan);assert.deepEqual(plans[0].segments.slice(1),plans[1].segments.slice(1));assert.deepEqual(plans[1].segments.slice(1),plans[2].segments.slice(1));for(const e of project.data.exports){assert.match(e.filename,/^DEN-THU_H[123]-(problem|absurd|curiosity)_draft_\d{6}\.mp4$/);assert.ok(e.verified&&e.sha256&&e.assetId);}await page.locator('[data-screen=video]').getByRole('button',{name:'Làm video',exact:true}).click();await page.waitForTimeout(1500);assert.equal(starts,1);assert.equal(renderCount,3);}
if(mode==='full'){
 const sourceBefore=structuredClone((await request('/api/lab')).records.find(r=>r.id===project.id));
 await page.goto(origin+'/?view=social&product='+p.id);await page.getByRole('button',{name:'Tài khoản',exact:true}).click();
 let dialog=page.getByRole('dialog');await dialog.getByLabel('Tên',{exact:true}).fill('Kênh QA');await dialog.getByLabel('Tên tài khoản',{exact:true}).fill('qa_fixture');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Chia đều',exact:true}).click();await page.locator('[data-plan]').first().waitFor();
 await page.locator('[data-plan]').first().locator('.compact-card-open').click();dialog=page.getByRole('dialog');
 await dialog.getByLabel('URL bài đăng',{exact:true}).fill('https://www.instagram.com/reel/QA_REFRESH_ONLY/');
 const posted=new Date(Date.now()-49*3600000+7*3600000).toISOString().slice(0,16);await dialog.getByLabel('Đăng lúc · giờ Việt Nam').fill(posted);await dialog.getByRole('button',{name:'Lưu URL'}).click();await dialog.waitFor({state:'hidden'});
 await page.goto(origin+'/?view=results');await page.locator('[data-result]').first().locator('.compact-card-open').click();dialog=page.getByRole('dialog');
 await dialog.getByLabel('Lượt xem',{exact:true}).fill('100');await dialog.getByLabel('Comment đúng từ khoá',{exact:true}).fill('0');await dialog.getByRole('button',{name:'Lưu',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Đổi hook',exact:true}).click();await page.waitForURL('**view=production**');
 await page.waitForFunction(()=>document.querySelectorAll('[data-video-exports] video').length===3||!!document.querySelector('[data-screen=video] [role=alert]'),null,{timeout:180000});
 assert.equal(await page.locator('[data-screen=video] [role=alert]').count(),0,await page.locator('[data-screen=video]').innerText());
 const after=(await request('/api/lab')).records,fresh=after.find(r=>r.kind==='production'&&r.data.refreshSourcePlanId);
 assert.ok(fresh);assert.equal(fresh.data.exports.length,3);assert.deepEqual(after.find(r=>r.id===project.id),sourceBefore);
 for(const exported of fresh.data.exports){assert.deepEqual(exported.renderPlan.segments.slice(1),sourceBefore.data.exports[0].renderPlan.segments.slice(1));const asset=after.find(r=>r.id===exported.assetId);assert.ok(asset.data.metadata.width===720&&asset.data.metadata.height===1280);assert.ok(Math.abs(asset.data.metadata.duration-15)<=.1);}
 assert.equal(new Set(fresh.data.variants.map(v=>v.hookTechnique)).size,3);assert.equal(starts,2);assert.equal(renderCount,6);
 for(const [index,name] of ['Phóng đại vấn đề','Tự chế ngớ ngẩn','Gây tò mò'].entries()){
  await page.getByLabel('Hook',{exact:true}).selectOption(String(index));
  assert.equal(await page.locator('.compact-track').first().locator('.compact-shot span').first().innerText(),name,'Selected hook must match its variant even after refresh reorders scenes');
 }
 await page.getByLabel('Hook',{exact:true}).selectOption('0');
 for(const [width,height] of [[1366,768],[1920,1080]]){await page.setViewportSize({width,height});await screenshot('refresh-three-mp4-'+width);}
 await page.locator('[data-screen=video]').getByRole('button',{name:'Làm video',exact:true}).click();await page.waitForTimeout(1200);assert.equal(starts,2);assert.equal(renderCount,6);
 await writeFile(join(out,'refresh-proof.json'),JSON.stringify({passed:true,fixture:true,fakeMuse:true,localMontage:true,refreshClicks:1,starts,renderCount,originalUnchanged:true,bodySegmentsIdentical:true,newExports:fresh.data.exports,sourceProjectId:sourceBefore.id},null,2));
}
 if(mode==='refused'){assert.equal(manual.length,1);assert.equal(project.data.scenes.filter(s=>s.mediaProvider==='manual').length,5);assert.equal(project.data.exports.length,0);assert.equal(starts,1);assert.equal(store.jobs()[0].state,'needs_attention');assert.ok(project.data.scenes[0].museReconciledAt);const office=await request('/api/lab?view=office');assert.equal(office.view.runs.filter(r=>r.group==='manual').length,5);await page.goto(origin+'/?view=signals');await page.getByText('Chờ file tay',{exact:true}).first().waitFor();await screenshot('refusal-signals-1920');await page.goto(origin+'/?view=production');}
 if(mode==='empty')assert.equal(await page.locator('[data-screen=video] .compact-muse').innerText(),'Muse sẵn sàng');
 await page.evaluate(()=>{window.productLabDesktop.status=async()=>({musePaused:true,generationReady:false,profiles:[],jobs:[],active:0,paused:true,batch:null});});await page.waitForTimeout(5100);assert.equal((await page.locator('[data-screen=video]').innerText()).split('Muse đang tạm dừng').length-1,1);
 await writeFile(join(out,'result-'+mode+'.json'),JSON.stringify({mode,starts,renderCount,manual,exports:project?.data.exports??[]},null,2));
 return {mode,clicksToThreeMP4:mode==='full'?1:null,realLocalRender:mode==='full',fakeMuse:true,starts,renderCount,refusalManual:mode==='refused'};
 }finally{store.close();}
},{workerStore:store});}
