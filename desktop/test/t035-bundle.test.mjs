import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {MuseAdapter} from '../src/muse.mjs';
import {Worker} from '../src/worker.mjs';
import {Store} from '../src/store.mjs';
import {bundlePrompt,mapBundleCards} from '../src/muse-bundle.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {runMediaTool} from '../src/compress.mjs';
import {EarlyVideoRender} from '../src/early-video-render.mjs';
import {chromium} from 'playwright';

const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'auto_'+i,sceneRevision:1,name:'Scene '+i,prompt:'Approved scene '+i,mediaType:'video',ratio:'9:16',duration:8,references:[]});
const config={startUrl:'https://muse.ai/',loggedIn:'textarea',resultCards:'[data-message-id]',resultIdAttribute:'data-message-id',submitName:'Send',downloadButtonName:'Download',timeoutSeconds:60};
const turn=()=>new Promise(r=>setImmediate(r));

test('T-035 interrupted ordered bundles cannot bypass whole-set validation through individual resume',async()=>{
 const store=new Store(':memory:');try{
  store.set('muse_paused',false);const jobs=[0,1,2].map(i=>store.enqueue(request(i),'interrupted_'+i).job),leader=jobs[0];
  store.put({...leader,bundleMapping:'appearance-v1',bundleJobIds:jobs.map(j=>j.id)});
  for(const j of jobs){store.put({...store.job(j.id),state:'needs_attention',profileId:'p',providerId:'r'+j.id,providerUrl:config.startUrl,...(j.id!==leader.id?{bundleParentId:leader.id}:{})});}
  const w=new Worker(store,'unused',{},{});w.run=async()=>assert.fail('No individual fetch');const before=store.jobs();
  for(const j of jobs)await assert.rejects(w.resume(j.id,{recoverExisting:true}),/Không lấy lẻ/);
  assert.deepEqual(store.jobs(),before);assert.equal(store.get('muse_paused'),false);assert.equal(w.active.size,0);
 }finally{store.close();}
});

test('T-035 two simultaneous bundles queue six speculative renders through three slots without rejecting a hook',async()=>{
 const service=new EarlyVideoRender({}),scope={};service.scopes.set('project',scope);
 let active=0,peak=0;const gates=[];service.compose=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>gates.push(r));active--;return {ok:true};};
 const tasks=Array.from({length:6},(_,i)=>service.encode({}, {id:String(i),request:{projectId:'project'}},scope));
 assert.equal(gates.length,3);gates.splice(0).forEach(r=>r());await turn();assert.equal(gates.length,3);gates.splice(0).forEach(r=>r());
 assert.equal((await Promise.all(tasks)).length,6);assert.equal(peak,3);assert.equal(service.encoding,0);
});

test('T-035 numbered prompt binds unlabelled cards in appearance order; rejects missing, duplicate IDs and multi-video cards',()=>{
 const requests=[0,1,2].map(request),prompt=bundlePrompt(requests),cards=['third','first','second'].map(id=>({id,text:'',clipCount:1}));
 assert.ok(prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length,2);
 assert.ok(prompt.indexOf('Scene 1:')<prompt.indexOf('Scene 2:'));assert.ok(prompt.indexOf('Scene 2:')<prompt.indexOf('Scene 3:'));
 assert.deepEqual(mapBundleCards(cards,requests,{appearance:true}),['third','first','second']);
 for(const rows of [cards.slice(1),[...cards,cards[0]],cards.map(c=>({...c,id:'same'})),cards.map(c=>({...c,clipCount:2}))])assert.equal(mapBundleCards(rows,requests,{appearance:true}),null);
});

test('T-035 adapter observes cards during streaming and retains first appearance despite DOM reorder',async t=>{
 let now=1000,poll=-1;const arrivals=[],submitted=[];t.mock.method(Date,'now',()=>now);
 const snapshots=[[],['b'],['a','b'],['c','a','b']];
 const adapter=new MuseAdapter(config);adapter.mediaType='video';adapter.expectedScenes=[0,1,2].map(request);adapter.bundleAppearance=true;
 adapter.onBundleCard=(i,id)=>{if(!arrivals.some(r=>r.id===id))arrivals.push({i,id,poll});};
 const page={url:()=>config.startUrl,locator:selector=>({evaluateAll:async fn=>{
  if(selector.includes('data-message-role'))return [];
  const ids=snapshots[Math.max(0,poll)];return fn(ids.map(id=>({getAttribute:()=>id,innerText:'',querySelectorAll:()=>[{}]})),'data-message-id');
 }}),getByRole:(_,{name})=>({click:async()=>{assert.equal(name,'Send');poll=1;},isVisible:async()=>true}),waitForTimeout:async()=>{poll++;now+=750;}};
 const id=await adapter.submit(page,async(state,patch)=>submitted.push({state,patch}));
 assert.equal(id,'b');assert.deepEqual(arrivals,[{i:0,id:'b',poll:1},{i:1,id:'a',poll:2},{i:2,id:'c',poll:3}]);
 assert.deepEqual(adapter.bundleProviderIds,['b','a','c']);assert.equal(submitted.filter(s=>s.state==='submitting').length,1);
});

test('T-035 streaming worker downloads concurrently, renders per verified clip, accepts only the complete distinct set',async t=>{
 for(const scenario of ['valid','duplicate','source-duplicate','missing','invalid']){
  const root=await mkdtemp(join(tmpdir(),'hermes-t035-')),store=new Store(':memory:');
  const w=new Worker(store,root,{},{}),jobs=[0,1,2].map(i=>store.enqueue(request(i),'bundle_'+i).job),leader=jobs[0];
  store.set('muse_paused',false);store.set('profiles',[{id:'a',name:'Chi',enabled:true,health:'ready',quota:{state:'available'}}]);store.set('adapter',{enabled:true,startUrl:config.startUrl});
  store.put({...leader,bundleJobIds:jobs.map(j=>j.id),bundleMapping:'appearance-v1'});for(const j of jobs.slice(1))store.put({...j,bundleParentId:leader.id});store.transition(leader.id,'preflight',{profileId:'a'});
  w.night.begin();w.paused=false;const page={url:()=>config.startUrl,screenshot:async()=>{}};w.context=async()=>({pages:()=>[],newPage:async()=>page});w.setProfileVisibility=async()=>{};w.measureQuota=async()=>{};
  const downloaded=[],rendered=[],imported=[],gates=[];let active=0,peak=0,discarded=false;
  w.validateOutput=async path=>{const i=jobs.findIndex(j=>path.includes(j.id));return {sha256:(scenario==='duplicate'?'a':String(i)).repeat(64),metadata:{width:scenario==='invalid'?360:720,height:1280,duration:8}};};
  w.onReadyOutput=async j=>{assert.equal(imported.length,0);assert.equal(store.job(j.id).state,'validating');await assert.rejects(w.output(j.id),/Chưa có file/);rendered.push(j.id);};
  w.onRejectedBundle=()=>discarded=true;w.receiveOutput=async id=>imported.push(id);
  const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async function(_,r){assert.ok(r.prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));}),
   submit=t.mock.method(MuseAdapter.prototype,'submit',async function(_,checkpoint){
    await checkpoint('submitting');this.timings={sentAt:Date.now()};
    for(let i=0;i<(scenario==='missing'?2:3);i++)this.onBundleCard(i,'r'+i,config.startUrl);
    for(let i=0;i<1000&&gates.length<(scenario==='missing'?2:3);i++)await new Promise(r=>setTimeout(r,1));
    try{assert.equal(gates.length,scenario==='missing'?2:3);}finally{gates.forEach(g=>g());}
    if(scenario==='missing')throw Object.assign(Error('Missing card'),{code:'MUSE_BUNDLE_UNMAPPED'});
    await checkpoint('submitted',{providerId:'r0',providerUrl:config.startUrl,bundleProviderIds:['r0','r1','r2']});
   }),fetch=t.mock.method(MuseAdapter.prototype,'fetch',async function(_,j,checkpoint,path){
    await checkpoint('waiting');await checkpoint('downloading');active++;peak=Math.max(peak,active);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture download gate timed out')),5000);gates.push(()=>{clearTimeout(timer);resolve();});});active--;downloaded.push(j.id);
    this.compression={sourceSha256:(scenario==='source-duplicate'?'a':String(jobs.findIndex(x=>x.id===j.id))).repeat(64)};return path;
   });
  try{await w.run(leader.id,'a');assert.equal(peak,scenario==='missing'?2:3);assert.equal(w.night.status().submitted,1);assert.equal(submit.mock.callCount(),1);
   if(scenario==='valid'){assert.deepEqual(imported,jobs.map(j=>j.id));assert.equal(rendered.length,3);assert.ok(jobs.every(j=>store.job(j.id).state==='ready'));assert.equal(store.get('muse_bundle_order_verified'),true);}
   else {assert.equal(imported.length,0);assert.ok(jobs.every(j=>store.job(j.id).state!=='ready'));assert.equal(store.get('muse_bundle_order_failed'),true);assert.equal(discarded,true);assert.ok(jobs.every(j=>!store.job(j.id).uploadedAssetId));}
   assert.equal(store.get('muse_paused'),false);assert.ok(store.get('profiles').every(p=>p.enabled));
  }finally{prepare.mock.restore();submit.mock.restore();fetch.mock.restore();store.close();await rm(root,{recursive:true,force:true});}
 }
});

test('T-035 exact blob video downloads without touching the shared preview',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hermes-t035-blob-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'source.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=red:s=90x160:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',source]);const bytes=await readFile(source);
 const media={isVisible:async()=>true,evaluate:async fn=>String(fn).includes('FileReader')?bytes.toString('base64'):'blob:https://muse.ai/exact-card'};
 const exact={evaluate:async()=>{},locator:()=>({first:()=>media})};
 const page={url:()=>config.startUrl,locator:s=>s==='textarea'?{waitFor:async()=>{},isVisible:async()=>true}:exact,request:{get:()=>assert.fail('A blob is browser-owned')},getByRole:()=>assert.fail('No preview race')};
 const a=new MuseAdapter(config);a.bundleAppearance=true;const file=await a.fetch(page,{providerId:'only-this-card',providerUrl:config.startUrl,request:{mediaType:'video'}},async()=>{},join(root,'out.mp4'));
 assert.ok((await readFile(file)).length);assert.equal(a.timings.downloadMethod,'video-blob');
});

test('T-035 real local browser downloads three exact blob sources concurrently while fake Muse is streaming',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hermes-t035-browser-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'source.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',source]);
 const bytes=await readFile(source),browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<textarea></textarea><button>Send</button><button>Stop</button>'}));await page.goto(config.startUrl);
 await page.evaluate(base64=>{document.querySelector('button').onclick=()=>{for(let i=0;i<3;i++){const card=document.createElement('div');card.dataset.messageId='r'+i;const video=document.createElement('video');video.style.width='90px';video.style.height='160px';video.src=URL.createObjectURL(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'video/mp4'}));card.append(video);document.body.append(card);}};},bytes.toString('base64'));
 const adapter=new MuseAdapter(config);adapter.mediaType='video';adapter.expectedScenes=[0,1,2].map(request);adapter.bundleAppearance=true;
 const pending=new Map();adapter.onBundleCard=(index,id,url)=>{if(pending.has(id))return;const receiver=new MuseAdapter(config);receiver.bundleAppearance=true;pending.set(id,receiver.fetch(page,{providerId:id,providerUrl:url,request:request(index)},async()=>{},join(root,id+'.mp4')).then(file=>({file,compression:receiver.compression,method:receiver.timings.downloadMethod})));};
 await adapter.submit(page,async()=>{});const files=await Promise.all(pending.values());assert.equal(files.length,3);for(const {file,compression,method} of files){assert.equal(method,'video-blob');assert.equal(compression.sourceSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(compression.sha256,createHash('sha256').update(await readFile(file)).digest('hex'));}assert.equal(await page.getByRole('button',{name:'Stop',exact:true}).isVisible(),true);
});
