import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,copyFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {MuseAdapter} from '../src/muse.mjs';
import {Worker} from '../src/worker.mjs';
import {Store} from '../src/store.mjs';
import {useBundle} from '../src/muse-bundle.mjs';
import {BUNDLE_FRAME_BYTES,BUNDLE_FRAME_MIN_DIFFERENCE,bundleMidpointFrame,assertDistinctBundleFrames} from '../src/muse-bundle-visual.mjs';
import {runMediaTool} from '../src/compress.mjs';

const config={startUrl:'https://muse.ai/',loggedIn:'textarea',resultCards:'[data-message-id][data-message-has-presentation="true"]',resultIdAttribute:'data-message-id',submitName:'Send',downloadButtonName:'Download',timeoutSeconds:30};
const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'auto_'+i,sceneRevision:1,name:'Scene '+i,prompt:'Approved scene '+i,mediaType:'video',ratio:'9:16',duration:1,references:[]});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function fakeSubmit(t,{readyAt=[3000,6000,10000],timeoutSeconds=30,counts,streaming=false}={}){
  let now=0,sent=false;const arrivals=[],checkpoints=[],polls=[];
  t.mock.method(Date,'now',()=>now);
  const adapter=new MuseAdapter({...config,timeoutSeconds});adapter.mediaType='video';adapter.expectedScenes=[0,1,2].map(request);adapter.bundleAppearance=true;
  adapter.onBundleCard=(index,id)=>{if(!arrivals.some(a=>a.id===id))arrivals.push({index,id,at:now});};
  const page={url:()=>config.startUrl,locator:selector=>({evaluateAll:async fn=>{
    if(selector!==config.resultCards)return [];
    const rows=sent?[0,1,2].map(i=>({getAttribute:()=>`r${i}`,innerText:'Generating',querySelectorAll:()=>Array(counts?.(i,now)??(now>=readyAt[i]?1:0)).fill({})})):[];
    return fn(now>0?rows.reverse():rows,'data-message-id');
  }}),getByRole:(_,{name})=>({click:async()=>{assert.equal(name,'Send');sent=true;},isVisible:async()=>streaming}),waitForTimeout:async ms=>{assert.ok(ms>=500&&ms<=1000);polls.push(ms);now+=ms;}};
  return {adapter,page,arrivals,polls,checkpoints,now:()=>now,run:()=>adapter.submit(page,async(state,patch)=>checkpoints.push({state,patch}))};
}

test('T-036 placeholders keep ordinals; videos arriving 3–10 seconds later download at their first ready poll',async t=>{
  const f=fakeSubmit(t,{readyAt:[10000,3000,6000],streaming:true});
  assert.equal(await f.run(),'r0');
  assert.deepEqual(f.adapter.bundleProviderIds,['r0','r1','r2']);
  assert.deepEqual(f.arrivals,[{index:1,id:'r1',at:3000},{index:2,id:'r2',at:6000},{index:0,id:'r0',at:10500}]);
  assert.equal(f.checkpoints.filter(c=>c.state==='submitting').length,1);
  assert.equal(f.adapter.timings.observedCardCount,3);assert.equal(f.adapter.timings.observedClipCount,3);
});

test('T-036 finished chat still waits past 15 seconds up to the configured timeout',async t=>{
  const f=fakeSubmit(t,{readyAt:[3000,6000,21000]});await f.run();assert.equal(f.now(),21000);assert.equal(f.arrivals.length,3);
});

test('T-036 incomplete placeholders time out without reporting an order failure, preserving observed IDs',async t=>{
  const f=fakeSubmit(t,{readyAt:[3000,Infinity,Infinity],timeoutSeconds:20});
  await assert.rejects(f.run(),e=>e.code==='MUSE_BUNDLE_TIMEOUT'&&e.providerIds.join(',')==='r0,r1,r2');
  assert.ok(f.now()>=20000&&f.now()<20750);assert.equal(f.arrivals.length,1);
});

test('T-036 multi-video card is rejected immediately while other placeholders are waiting',async t=>{
  const f=fakeSubmit(t,{counts:i=>i===1?2:0});await assert.rejects(f.run(),{code:'MUSE_BUNDLE_UNMAPPED'});assert.equal(f.now(),0);assert.equal(f.arrivals.length,0);
});

test('T-036 browser DOM placeholders are observed before video elements, even with Stop absent',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();let routed=0;
  await page.route('**/*',route=>{routed++;return route.fulfill({contentType:'text/html',body:'<textarea></textarea><button>Send</button>'});});await page.goto(config.startUrl);
  await page.clock.install();await page.clock.pauseAt(new Date());
  await page.evaluate(()=>{document.querySelector('button').onclick=()=>{
    for(let i=0;i<3;i++){const card=document.createElement('div');card.dataset.messageId='r'+i;card.dataset.messageHasPresentation='true';document.body.append(card);
      setTimeout(()=>card.append(document.createElement('video')),[10000,3000,6000][i]);}
  };});
  let elapsed=0;t.mock.method(Date,'now',()=>elapsed);
  t.mock.method(page,'waitForTimeout',async ms=>{elapsed+=ms;await page.clock.runFor(ms);});
  const adapter=new MuseAdapter(config);adapter.mediaType='video';adapter.expectedScenes=[0,1,2].map(request);adapter.bundleAppearance=true;const arrivals=[];
  adapter.onBundleCard=(index,id)=>{if(!arrivals.some(a=>a.id===id))arrivals.push({index,id,elapsed});};
  await adapter.submit(page,async()=>{});
  assert.deepEqual(arrivals,[{index:1,id:'r1',elapsed:3000},{index:2,id:'r2',elapsed:6000},{index:0,id:'r0',elapsed:10500}]);
  assert.deepEqual(adapter.bundleProviderIds,['r0','r1','r2']);assert.equal(routed,1,'Only the local fake document was requested');
});

test('T-036 RGB midpoint guard rejects mean difference <= 2.5%, including the exact boundary, and checks every pair',()=>{
  assert.equal(BUNDLE_FRAME_MIN_DIFFERENCE,0.025);assert.equal(BUNDLE_FRAME_BYTES,3072);
  const black=Buffer.alloc(BUNDLE_FRAME_BYTES),boundary=Buffer.alloc(BUNDLE_FRAME_BYTES,6),far=Buffer.alloc(BUNDLE_FRAME_BYTES,200);
  boundary.fill(7,0,BUNDLE_FRAME_BYTES*0.375); // mean 6.375 / 255 = exactly 0.025
  assert.throws(()=>assertDistinctBundleFrames([black,boundary,far]),{code:'MUSE_BUNDLE_SIMILAR'});
  boundary[boundary.length-1]++;
  assert.equal(assertDistinctBundleFrames([black,boundary,far]).differences.length,3);
  assert.throws(()=>assertDistinctBundleFrames([black,far,Buffer.alloc(BUNDLE_FRAME_BYTES,198)]),e=>e.code==='MUSE_BUNDLE_SIMILAR'&&/2\/3/.test(e.message));
  assert.throws(()=>assertDistinctBundleFrames([black,far,Buffer.alloc(0)]),/Thiếu khung/);
});

async function createClip(root,name,color){
  const path=join(root,name+'.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=${color}:s=720x1280:r=24:d=1`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',path]);return path;
}
function bundleWorker(store,root){
  const worker=new Worker(store,root,{},{}),jobs=[0,1,2].map(i=>store.enqueue(request(i),'t036_'+i).job),leader=jobs[0];
  store.set('muse_paused',false);store.set('profiles',[{id:'p',enabled:true,health:'ready',quota:{state:'available'}},{id:'q',enabled:true,health:'ready',quota:{state:'available'}}]);store.set('adapter',{...config,enabled:true});
  store.put({...leader,bundleMapping:'appearance-v1',bundleJobIds:jobs.map(j=>j.id)});for(const j of jobs.slice(1))store.put({...j,bundleParentId:leader.id});store.transition(leader.id,'preflight',{profileId:'p'});
  worker.night.begin();worker.paused=false;worker.context=async()=>({pages:()=>[],newPage:async()=>({url:()=>config.startUrl,screenshot:async()=>{}})});worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};
  return {worker,jobs,leader};
}

test('T-036 real FFmpeg midpoint check accepts distinct clips; different SHA files with near-identical pictures reject the whole fake-Muse bundle',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-t036-visual-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const clips=[];for(const [name,color] of [['red','red'],['near','0xfc0101'],['blue','blue'],['green','lime']])clips.push(await createClip(root,name,color));
  const original=await Promise.all(clips.map(path=>readFile(path)));assert.equal(new Set(original.map(hash)).size,4);
  const frames=await Promise.all(clips.map(p=>bundleMidpointFrame(p,1)));
  assert.throws(()=>assertDistinctBundleFrames([frames[0],frames[1],frames[2]]),{code:'MUSE_BUNDLE_SIMILAR'});
  for(const scenario of ['distinct','similar']){
    const store=new Store(':memory:'),{worker,jobs,leader}=bundleWorker(store,root),received=[],rendered=[];let discarded=false;
    worker.onReadyOutput=async j=>{assert.equal(received.length,0);await assert.rejects(worker.output(j.id),/Chưa có file/);rendered.push(j.id);};worker.onRejectedBundle=()=>discarded=true;worker.receiveOutput=async id=>received.push(id);
    const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async()=>{});
    const submit=t.mock.method(MuseAdapter.prototype,'submit',async function(_,checkpoint){await checkpoint('submitting');this.timings={resultAt:Date.now()};for(const i of [1,2,0])this.onBundleCard(i,'r'+i,config.startUrl);await checkpoint('submitted',{bundleProviderIds:['r0','r1','r2']});});
    const fetch=t.mock.method(MuseAdapter.prototype,'fetch',async function(_,job,checkpoint,path){await checkpoint('waiting');await checkpoint('downloading');const i=jobs.findIndex(j=>j.id===job.id),source=clips[(scenario==='distinct'?[0,2,3]:[0,1,2])[i]];await copyFile(source,path);this.compression={sourceSha256:hash(await readFile(source))};return path;});
    try{
      await worker.run(leader.id,'p');assert.equal(submit.mock.callCount(),1);assert.equal(worker.night.status().submitted,1);assert.equal(rendered.length,3);
      if(scenario==='distinct'){
        assert.deepEqual(received,jobs.map(j=>j.id));assert.equal(discarded,false);
        for(const j of jobs){const saved=store.job(j.id);assert.equal(saved.state,'ready');assert.equal(saved.providerId,'r'+jobs.indexOf(j));assert.equal(saved.output.bundleVisualCheck.differences.length,3);}
      }else{
        assert.equal(received.length,0);assert.equal(discarded,true);assert.equal(store.get('muse_bundle_order_failed'),true);
        for(const j of jobs){const saved=store.job(j.id);assert.equal(saved.state,'failed');assert.equal(saved.failureCode,'MUSE_BUNDLE_SIMILAR');assert.match(saved.failureDetail,/khung giữa.*2,5%/);assert.ok((await readFile(saved.failedFilePath)).length>0);assert.equal(saved.uploadedAssetId,null);await assert.rejects(worker.output(j.id),/Chưa có file/);}
      }
      assert.equal(store.get('muse_paused'),false);assert.ok(store.get('profiles').every(p=>p.enabled));
    }finally{prepare.mock.restore();submit.mock.restore();fetch.mock.restore();store.close();}
  }
  assert.deepEqual(await Promise.all(clips.map(path=>readFile(path))),original,'Input media stays byte-identical');
});

test('T-036 network, timeout and refusal fail only this run; mapping failures set the flag; refusal stops sending on that profile without changing switches',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-t036-errors-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const code of ['ECONNRESET','TimeoutError','MUSE_BUNDLE_TIMEOUT','MUSE_REFUSED','MUSE_BUNDLE_UNMAPPED','MUSE_BUNDLE_DUPLICATE','MUSE_BUNDLE_SIMILAR'])for(const previous of [false,true]){
    const store=new Store(':memory:'),{worker,jobs,leader}=bundleWorker(store,root);store.set('muse_bundle_order_failed',previous);store.set('muse_bundle_order_verified',true);const profiles=store.get('profiles'),received=[];let discarded=false;
    worker.receiveOutput=async id=>received.push(id);worker.onRejectedBundle=()=>discarded=true;
    const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async()=>{}),submit=t.mock.method(MuseAdapter.prototype,'submit',async function(_,checkpoint){await checkpoint('submitting');throw Object.assign(Error('Fixture '+code),{code,providerUrl:config.startUrl,providerIds:['r0']});});
    try{
      await worker.run(leader.id,'p');const mapping=['MUSE_BUNDLE_UNMAPPED','MUSE_BUNDLE_DUPLICATE','MUSE_BUNDLE_SIMILAR'].includes(code);
      assert.equal(store.get('muse_bundle_order_failed'),mapping?true:previous);assert.equal(store.get('muse_bundle_order_verified'),true);
      assert.equal(useBundle(store,'auto',2,[0,1,2].map(request)),!(mapping||previous));
      assert.equal(received.length,0);assert.equal(discarded,true);assert.equal(submit.mock.callCount(),1);assert.equal(worker.night.status().submitted,1);
      for(const j of jobs){assert.equal(store.job(j.id).failureCode,code);assert.equal(store.job(j.id).state,'needs_attention');}
      assert.equal(store.get('muse_paused'),false);
      assert.deepEqual(store.get('profiles'),profiles.map(p=>p.id==='p'?{...p,session:'signed_in',checkedAt:store.get('profiles')[0].checkedAt}:p));
      assert.ok(Number.isFinite(store.get('profiles')[0].checkedAt));assert.equal(worker.night.profileStatus('q').stopped,false);
      if(code==='MUSE_REFUSED'){assert.equal(worker.night.profileStatus('p').stopped,true);await assert.rejects(worker.night.admit('retry',()=>true,'p'),{code:'MUSE_NIGHT_STOP'});assert.equal(worker.night.status().submitted,1);}
      if(code==='MUSE_BUNDLE_TIMEOUT')assert.deepEqual(store.job(leader.id).unmappedProviderIds,['r0']);
    }finally{prepare.mock.restore();submit.mock.restore();store.close();}
  }
});

test('T-036 worker restart clears the temporary mapping flag but preserves receipts, profile stops, pacing and user switches',()=>{
  const store=new Store(':memory:');try{
    const {worker,leader}=bundleWorker(store,'unused');store.transition(leader.id,'failed',{note:'Existing receipt'});
    worker.night.outcome(leader.id,Object.assign(Error('Refused'),{code:'MUSE_REFUSED'}),'p');store.set('muse_bundle_order_failed',true);store.set('muse_bundle_order_verified',true);
    const jobs=store.jobs(),profiles=store.get('profiles'),night=store.get('muse_nights'),pacing=worker.night.settings();
    const restarted=new Worker(store,'unused',{},{});assert.equal(store.get('muse_bundle_order_failed'),false);assert.equal(store.get('muse_bundle_order_verified'),true);assert.deepEqual(store.jobs(),jobs);assert.deepEqual(store.get('profiles'),profiles);assert.deepEqual(store.get('muse_nights'),night);assert.deepEqual(restarted.night.settings(),pacing);assert.equal(store.get('muse_paused'),false);assert.equal(restarted.paused,true);assert.equal(restarted.active.size,0);assert.equal(restarted.night.profileStatus('p').stopped,true);
  }finally{store.close();}
});

test('T-036 direct URL fallback logs only safe reason categories, with no signed URL, token or exception text',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-t036-log-'));t.after(()=>rm(root,{recursive:true,force:true}));const source=await createClip(root,'blue','blue'),bytes=await readFile(source);
  const secret='fixture-private-token',sourceUrl='https://cdn.invalid/clip.mp4?sig='+secret;
  for(const reason of ['http_not_ready','timeout','network_or_read_failed','invalid_mp4_or_size','size_limit']){
    const logs=[],adapter=new MuseAdapter(config);adapter.onDiagnostic=message=>logs.push(message);
    const media={isVisible:async()=>true,evaluate:async()=>sourceUrl},exact={evaluate:async()=>{},locator:s=>({first:()=>s==='video'?media:{click:async()=>{}}}),getByRole:()=>({})};
    const page={url:()=>config.startUrl,locator:s=>s==='textarea'?{waitFor:async()=>{},isVisible:async()=>true}:exact,keyboard:{press:async()=>{}},getByRole:()=>({waitFor:async()=>{},click:async()=>{}}),waitForEvent:async()=>({saveAs:p=>writeFile(p,bytes),failure:async()=>null}),request:{get:async()=>{
      if(reason==='timeout'||reason==='network_or_read_failed')throw Object.assign(Error(sourceUrl+' Authorization: Bearer '+secret),{name:reason==='timeout'?'TimeoutError':'Error'});
      return {ok:()=>reason!=='http_not_ready',headers:()=>({'content-length':reason==='size_limit'?String(65*1024**2):'123'}),body:async()=>Buffer.from('not a video '+sourceUrl),dispose:async()=>{}};
    }}};
    await adapter.fetch(page,{providerId:'r0',providerUrl:config.startUrl,request:request(0)},async()=>{},join(root,reason+'.mp4'));
    assert.equal(logs.length,1);assert.ok(logs[0].includes(reason));assert.equal(adapter.timings.directDownloadFallbackReason,reason);assert.equal(adapter.timings.downloadMethod,'preview-button');assert.ok(adapter.timings.directDownloadFallbackAt);
    assert.doesNotMatch(JSON.stringify({logs,timings:adapter.timings}),/fixture-private-token|cdn\.invalid|Authorization|Bearer|sig=/);
  }
});
