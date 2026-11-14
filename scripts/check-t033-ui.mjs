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
const exec=promisify(execFile),out=resolve('outputs/T-033-media');await mkdir(out,{recursive:true});
const ffmpeg=resolve('desktop/tools/ffmpeg/bin/ffmpeg.exe'),sources=[];
for(let i=0;i<5;i++){const path=join(out,'scene-'+i+'.mp4');await exec(ffmpeg,['-y','-v','error','-f','lavfi','-i',`color=c=${['0x71622e','0x316674','0x573d71','0x385b45','0x6d4b38'][i]}:s=720x1280:r=24:d=8`,'-f','lavfi','-i',`sine=frequency=${300+i*100}:duration=8`,'-vf',`drawbox=x=${100+i*50}:y=200:w=150:h=350:color=0xd4ff3a:t=fill`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',path],{windowsHide:true});sources.push(await readFile(path));}
const p={id:'flow_product',kind:'product',revision:1,createdAt:Date.now(),updatedAt:Date.now(),data:{...emptyProduct,name:'Đèn kiểm thử',productKey:'DEN-THU',ctaKeyword:'GLOW',cost:4,shipping:2,price:24,imageUrl:'https://fixture.invalid/lamp.svg'}};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#333c37"/><path d="M200 80h80l40 80H160zM240 160v70m-50 0h100" fill="#c8ef54" stroke="#c8ef54" stroke-width="12"/></svg>';
for(const mode of ['full']){const store=new Store(':memory:');store.set('muse_paused',false);await officeUI('T-033'+(mode==='full'?'':'-'+mode),mode==='empty'?[]:[p],async({page,origin,screenshot,local})=>{
 await page.route('https://fixture.invalid/lamp.svg',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
 const cookies=await page.context().cookies(),headers={Cookie:cookies.map(c=>c.name+'='+c.value).join('; '),Origin:origin};
 const request=async(path,body)=>{const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.ok(res.ok,JSON.stringify(data));return data;};
 const upload=async(bytes,name)=>{const form=new FormData();form.append('file',new File([bytes],name,{type:'video/mp4'}));const response=await fetch(origin+'/api/assets',{method:'POST',headers,body:form});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;};
 await mkdir(join(out,'render-'+mode),{recursive:true});const integrations=new Integrations(store,join(out,'render-'+mode));integrations.loadInstalledConfig(JSON.parse(await readFile('desktop/.integrations/config.json','utf8')));
 const manualService=new ManualMedia({store,local});let starts=0,renderCount=0,activeRenders=0,peakRenders=0,manual=[];
 await page.exposeFunction('fakeFlowStart',async({projectId})=>{starts++;if(mode==='refused'){const request={projectId,sceneId:'auto_0',productId:p.id,name:'Fixture refused',mediaType:'video'};const {job}=store.enqueue(request,'refused-fixture');store.put({...job,state:'needs_attention',failureCode:'MUSE_REFUSED',history:[...job.history,{at:Date.now(),state:'submitted',note:'Fake submitted'},{at:Date.now(),state:'needs_attention',note:'Fake refusal'}]});store.set('muse_paused',true);throw Error('Muse từ chối (fixture)');}let project=(await request('/api/lab')).records.find(r=>r.id===projectId);
 for(let i=0;i<5;i++){const asset=await upload(sources[i],'fixture-'+i+'.mp4');project=(await request('/api/production',{id:projectId,revision:project.revision,commandId:projectId+'_take'+i,action:'attach',input:{sceneId:'auto_'+i,attemptId:null,assetId:asset.id}})).record;}
 return {count:5};});
 await page.exposeFunction('fakeFlowRender',async({projectId,variantId})=>{renderCount++;activeRenders++;peakRenders=Math.max(peakRenders,activeRenders);const rows=(await request('/api/lab')).records,pr=rows.find(r=>r.id===projectId),plan=getRenderPlan(pr.data,projectId,variantId),clips=[];
 for(const s of plan.segments){const a=rows.find(r=>r.id===s.assetId);clips.push({bytes:new Uint8Array(await(await fetch(origin+'/api/assets/'+a.id,{headers})).arrayBuffer()),sha256:s.sha256,duration:a.data.metadata.duration,inSec:s.inSec,outSec:s.outSec});}
 const job=await integrations.compose({planVersion:1,projectId,variantId,ratio:'9:16',clips,overlays:plan.overlays});const result=await integrations.output(job.id);activeRenders--;return {...result,preparedToken:local.registerPreparedMedia(result),bytes:Array.from(result.bytes),renderPlan:plan};});
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
 if(mode==='full'){assert.equal(await page.locator('[data-screen=video] [role=alert]').count(),0,await page.locator('[data-screen=video]').innerText());assert.equal(project.data.exports.length,3);assert.equal(peakRenders,3);const labels=await page.locator('[data-video-exports]').innerText();assert.ok(labels.indexOf('H1-')<labels.indexOf('H2-')&&labels.indexOf('H2-')<labels.indexOf('H3-'));assert.equal(new Set(project.data.variants.map(v=>v.hookTechnique)).size,3);await writeFile(join(out,'acceptance-records.json'),JSON.stringify(rows));const plans=project.data.exports.map(e=>e.renderPlan);assert.deepEqual(plans[0].segments.slice(1),plans[1].segments.slice(1));assert.deepEqual(plans[1].segments.slice(1),plans[2].segments.slice(1));for(const e of project.data.exports){assert.match(e.filename,/^DEN-THU_H[123]-(problem|absurd|curiosity)_draft_\d{6}\.mp4$/);assert.ok(e.verified&&e.sha256&&e.assetId);}await page.locator('[data-screen=video]').getByRole('button',{name:'Làm video',exact:true}).click();await page.waitForTimeout(1500);assert.equal(starts,1);assert.equal(renderCount,3);}
 if(mode==='refused'){assert.equal(manual.length,1);assert.equal(project.data.scenes.filter(s=>s.mediaProvider==='manual').length,5);assert.equal(project.data.exports.length,0);assert.equal(starts,1);assert.equal(store.jobs()[0].state,'needs_attention');assert.ok(project.data.scenes[0].museReconciledAt);const office=await request('/api/lab?view=office');assert.equal(office.view.runs.filter(r=>r.group==='manual').length,5);await page.goto(origin+'/?view=signals');await page.getByText('Chờ file tay',{exact:true}).first().waitFor();await screenshot('refusal-signals-1920');await page.goto(origin+'/?view=production');}
 if(mode==='empty')assert.equal(await page.locator('[data-screen=video] .compact-muse').innerText(),'Muse sẵn sàng');
 await page.evaluate(()=>{window.productLabDesktop.status=async()=>({musePaused:true,generationReady:false,profiles:[],jobs:[],active:0,paused:true,batch:null});});await page.waitForTimeout(5100);assert.equal((await page.locator('[data-screen=video]').innerText()).split('Muse đang tạm dừng').length-1,1);
 await writeFile(join(out,'result-'+mode+'.json'),JSON.stringify({mode,starts,renderCount,manual,exports:project?.data.exports??[]},null,2));
 return {mode,peakRenders,clicksToThreeMP4:mode==='full'?1:null,realLocalRender:mode==='full',fakeMuse:true,starts,renderCount,refusalManual:mode==='refused'};
 }finally{store.close();}
},{workerStore:store});}
