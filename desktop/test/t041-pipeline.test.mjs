import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {Worker} from '../src/worker.mjs';
import {Store} from '../src/store.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {EarlyVideoRender} from '../src/early-video-render.mjs';
import {Integrations} from '../src/integrations.mjs';
import {validateMedia} from '../src/media.mjs';
import {runMediaTool,captureMediaTool} from '../src/compress.mjs';
import {MediaSlots,mediaConcurrency} from '../src/media-capacity.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';

const config={enabled:true,startUrl:'https://muse.ai/',prompt:'textarea',loggedIn:'textarea',resultCards:'[data-message-role="assistant"]',resultIdAttribute:'data-message-id',submitName:'Send',downloadButtonName:'Download',timeoutSeconds:30};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const turn=()=>new Promise(r=>setImmediate(r));
const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'auto_'+i,sceneRevision:1,name:'Hook '+i,prompt:MUSE_VIDEO_COMMAND+'\nApproved hook '+i,mediaType:'video',ratio:'9:16',duration:8,references:[]});

test('T-041 CPU slots queue work, release after rejection, never exceed the CPU budget',async()=>{
 assert.deepEqual([1,2,4,6,20].map(mediaConcurrency),[1,1,2,3,3]);
 const slots=new MediaSlots(2),gates=[];let active=0,peak=0;
 const tasks=Array.from({length:5},(_,i)=>slots.run(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>gates.push(r));active--;if(i===1)throw Error('fixture');return i;}));
 const settled=Promise.allSettled(tasks);
 assert.equal(gates.length,2);gates.splice(0).forEach(r=>r());await turn();assert.equal(gates.length,2);gates.splice(0).forEach(r=>r());await turn();assert.equal(gates.length,1);gates.splice(0).forEach(r=>r());
 assert.equal((await settled).filter(x=>x.status==='fulfilled').length,4);assert.equal(peak,2);assert.equal(slots.active,0);
});

test('T-041 warm-up prepares a blank composer without sends; blocked/busy/off profiles and user drafts stay untouched',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());store.set('muse_paused',false);
 const w=new Worker(store,'unused',{},{},()=>4*1024**3),profiles=['Cho','Duc','Chim','Chi','off','busy'].map((name,i)=>({id:name,name,enabled:name!=='off',health:'ready',proxy:{server:'',username:''},vpnEnabled:true,vpn:{state:'connected'},quota:{state:'available'},session:'signed_in'}));
 store.set('profiles',profiles);store.set('adapter',config);w.night.begin();w.night.outcome('refusal',{code:'MUSE_REFUSED'},'Chi');w.active.set('busy','job');
 const calls=[];w.checkProfile=async(id,{keepWarm})=>{assert.equal(keepWarm,true);calls.push(id);};
 await w.warmProfiles();assert.deepEqual(calls,['Cho','Duc','Chim']);assert.deepEqual(store.get('profiles'),profiles);assert.equal(store.get('muse_paused'),false);assert.equal(w.night.status().submitted,0);
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();let navigation=0;
 await page.route('**/*',route=>{navigation++;return route.fulfill({contentType:'text/html',body:'<textarea></textarea><button>Send</button>'});});
 await page.goto('https://muse.ai/thread/old');const adapter=new MuseAdapter(config);
 await adapter.prepareComposer(page);assert.equal(new URL(page.url()).pathname,'/thread/new');const warmNavigations=navigation;
 await adapter.prepare(page,request(0));assert.equal(navigation,warmNavigations,'No new navigation on click');assert.ok((await page.locator('textarea').inputValue()).startsWith(MUSE_VIDEO_COMMAND));
 await page.locator('textarea').fill('User draft');await assert.rejects(adapter.prepareComposer(page),{code:'MUSE_DRAFT_PRESENT'});assert.equal(await page.locator('textarea').inputValue(),'User draft');assert.equal(navigation,warmNavigations);
 // Exercise the worker's real warm lifecycle using an isolated browser context.
 const warmContext=await browser.newContext();await warmContext.route('**/*',route=>route.fulfill({contentType:route.request().url().includes('ipify')?'application/json':'text/html',body:route.request().url().includes('ipify')?'{"ip":"192.0.2.1"}':'<textarea></textarea><button>Send</button>'}));
 w.context=async()=>warmContext;w.contexts.set('Cho',warmContext);w.connectVpn=async()=>{};w.measureQuota=async()=>{};w.setProfileVisibility=async()=>{};w.checkProfile=Worker.prototype.checkProfile;
 await w.checkProfile('Cho',{keepWarm:true});const first=w.warmPages.get('Cho');assert.ok(w.isWarm('Cho'));assert.equal(new URL(first.url()).pathname,'/thread/new');assert.equal(await first.locator('textarea').inputValue(),'');
 await w.checkProfile('Cho',{keepWarm:true});assert.equal(first.isClosed(),true);assert.equal(warmContext.pages().length,1);assert.equal(w.night.status().submitted,0);assert.equal(store.get('muse_paused'),false);assert.ok(store.get('profiles').filter(p=>p.id!=='off').every(p=>p.enabled&&p.vpnEnabled));
});

test('T-041 three independent fake Muse profiles download hidden blobs in parallel and render before import, with real FFmpeg', {timeout:120000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'hermes-t041-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=new Store(':memory:');t.after(()=>store.close());store.set('muse_paused',false);store.set('adapter',config);
 const profiles=['Cho','Duc','Chim','Chi'].map(name=>({id:name,name,enabled:true,health:'ready',session:'signed_in',proxy:{server:'',username:''},vpnEnabled:true,vpn:{state:'connected'},quota:{state:'available'}}));store.set('profiles',profiles);
 const worker=new Worker(store,root,{},{});worker.night.begin();worker.night.outcome('old',{code:'MUSE_REFUSED'},'Chi');worker.paused=false;
 const installed=JSON.parse((await readFile(resolve('desktop/.integrations/config.json'),'utf8')).replace(/^\uFEFF/,''));
 const integrations=new Integrations(store,root);integrations.saveConfig({python:installed.python,montage:installed.montage,reach:installed.reach});
 const source=[];
 for(const [i,color] of ['red','green','blue','yellow','cyan'].entries()){
  const path=join(root,'source'+i+'.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=720x1280:r=30:d=8`,'-f','lavfi','-i',`sine=frequency=${220+i*110}:sample_rate=48000:duration=8`,'-c:v','libx264','-preset','veryfast','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',path]);
  const bytes=await readFile(path);source.push({path,bytes,sha256:sha(bytes),duration:8});
 }
 const scenes=[0,1,2,3,4].map(i=>({id:'auto_'+i,revision:1,storyboardApproved:true,takes:i<3?[]:[{id:'t'+i,assetId:'a'+i,sha256:source[i].sha256,sceneRevision:1,review:'pending'}]}));
 const records=[{id:'product',kind:'product',revision:1,data:{ctaKeyword:'GLOW'}},{id:'project',kind:'production',data:{productId:'product',productRevision:1,scenes}},...[3,4].map(i=>({id:'a'+i,kind:'asset',data:{sha256:source[i].sha256,metadata:{duration:8}}}))];
 const starts=new Map(),compositions=[],imports=[];
 const early=new EarlyVideoRender({records:async()=>records,readAsset:async id=>source[Number(id.slice(1))].bytes,readOutput:id=>worker.output(id),compose:async input=>{compositions.push(input);return integrations.compose(input);},onTiming:(id,stage)=>{const at=Date.now();if(stage==='earlyRenderStartedAt')starts.set(id,at);const job=store.job(id);store.put({...job,timings:{...job.timings,[stage]:at}});}});await early.arm('project');
 worker.onReadyOutput=(job,read)=>early.start(job,read);
 worker.receiveOutput=async id=>{assert.ok(starts.has(id),'Each render starts before its library import');imports.push(id);};
 const realValidate=worker.validateOutput;
 worker.validateOutput=async(path,expected)=>{
  // Hold request validation until speculative encoding starts, proving overlap.
  const id=path.split(/[\\/]/).at(-1).replace('.mp4','');
  for(let i=0;i<200&&!starts.has(id);i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(starts.has(id),'Render overlaps request validation');
  return realValidate(path,expected);
 };
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const contexts=[];
 let fetches=0,peakFetches=0;const fetched=[];
 for(let i=0;i<3;i++){
  const context=await browser.newContext(),page=await context.newPage();contexts.push(context);
  const html=`<textarea></textarea><button id="send">Send</button><script>send.onclick=()=>{const b=Uint8Array.from(atob('${source[i].bytes.toString('base64')}'),c=>c.charCodeAt(0));const el=document.createElement('div');el.dataset.messageId='result${i}';el.dataset.messageRole='assistant';el.innerHTML='<video style="display:none"></video>';el.querySelector('video').src=URL.createObjectURL(new Blob([b],{type:'video/mp4'}));document.body.append(el);const stop=document.createElement('button');stop.textContent='Stop';document.body.append(stop);};</script>`;
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));await page.goto('https://muse.ai/thread/new');
  await page.exposeFunction('downloadGate',async()=>{fetches++;peakFetches=Math.max(peakFetches,fetches);fetched.push(i);for(let n=0;n<400&&fetched.length<3;n++)await new Promise(r=>setTimeout(r,10));assert.equal(fetched.length,3,'All transfers start before any completes');fetches--;});
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async(...args)=>{await window.downloadGate();return original(...args);};});
 }
 worker.context=async id=>contexts[profiles.findIndex(p=>p.id===id)];worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};
 const jobs=[0,1,2].map(i=>{const job=store.enqueue(request(i),'t041_'+i).job;store.transition(job.id,'preflight',{profileId:profiles[i].id});return job;});
 await Promise.all(jobs.map((job,i)=>worker.runAdmitted(job.id,profiles[i].id,false)));
 assert.equal(peakFetches,3);assert.equal(imports.length,3);assert.equal(compositions.length,3);assert.equal(worker.night.status().submitted,3);assert.deepEqual(store.get('profiles').map(p=>[p.id,p.enabled,p.vpnEnabled]),profiles.map(p=>[p.id,p.enabled,p.vpnEnabled]));assert.equal(store.get('muse_paused'),false);assert.equal(worker.night.profileStatus('Chi').stopped,true);
 for(const job of jobs){const current=store.job(job.id);assert.equal(current.state,'ready',current.failureDetail);assert.equal(current.timings.downloadMethod,'video-blob');assert.equal(current.timings.earlyRenderStartedAt,starts.get(job.id));assert.ok(current.timings.earlyRenderStartedAt<current.timings.validatedAt);}
 const results=await Promise.all(compositions.map(c=>early.get(c)));assert.equal(new Set(results.map(r=>r.output.sha256)).size,3);
 for(const [i,r] of results.entries()){
  assert.equal(r.result.engine,'hermes_ffmpeg_single_pass');assert.equal(r.output.fullDecode,true);assert.equal(r.output.metadata.width,720);assert.equal(r.output.metadata.height,1280);assert.ok(Math.abs(r.output.metadata.duration-15)<.1);assert.ok(r.output.size<=6*1024**2);assert.equal(r.output.compression.mode,'original');assert.ok(Math.abs(r.output.audio.duration-r.output.audio.videoDuration)<=.1);assert.match(await readFile(join(root,'integrations',r.id,'overlays.ass'),'utf8'),/Comment GLOW/);
  const pcm=await captureMediaTool('ffmpeg',['-hide_banner','-nostats','-v','info','-i',r.output.path,'-map','0:a:0','-af','volumedetect','-f','null','-']);
  assert.ok(Number(/mean_volume: ([-\d.]+) dB/.exec(pcm.stderr)?.[1])>-40,'Original sine audio remains audible');
  const output=await integrations.output(r.id);assert.equal(sha(output.bytes),r.output.sha256);assert.equal(sha(await readFile(source[i].path)),source[i].sha256);
  const frame=join(root,'hook'+i+'.rgb');await runMediaTool('ffmpeg',['-v','error','-ss','1','-i',r.output.path,'-vf','scale=1:1','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',frame]);
  const pixel=await readFile(frame),index=Number(compositions[i].variantId.split('_v').at(-1));assert.ok(pixel[index]>pixel[(index+1)%3]+60,'Rendered hook preserves its distinct source color');
  const cta=join(root,'cta'+i+'.rgb');await runMediaTool('ffmpeg',['-v','error','-ss','13','-i',r.output.path,'-vf','crop=720:200:0:70','-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',cta]);
  const pixels=await readFile(cta);let white=0;for(let n=0;n<pixels.length;n+=3)if(pixels[n]>220&&pixels[n+1]>220&&pixels[n+2]>220)white++;assert.ok(white>100,'CTA has visible white letters over the cyan body');
 }
 // Cached decode cannot validate different request expectations or wrong bytes.
 await assert.rejects(integrations.compose({...compositions[0],variantId:'bad_hash',clips:compositions[0].clips.map((c,i)=>i?c:{...c,bytes:source[1].bytes})}),/checksum/i);
 await assert.rejects(integrations.compose({...compositions[0],variantId:'bad_duration',clips:compositions[0].clips.map((c,i)=>i?c:{...c,duration:9})}),/thời lượng/);
 const black=join(root,'black.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=90x160:d=1','-c:v','libx264',black]);assert.match((await validateMedia(black,{mediaType:'video',ratio:'9:16',duration:1})).warning,/đoạn tối/);
 const broken=join(root,'broken.mp4');await writeFile(broken,Buffer.from('not an mp4'));await assert.rejects(validateMedia(broken,{mediaType:'video',ratio:'9:16',duration:1}));
});
