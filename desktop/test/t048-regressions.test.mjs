import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {Worker as Thread} from 'node:worker_threads';
import {chromium} from 'playwright';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {Integrations} from '../src/integrations.mjs';
import {assertCompleteVideo,readCompleteVideoSource} from '../src/video-download.mjs';
import {mediaSlots,probeSlots,validationSlots,composeSlots} from '../src/media-capacity.mjs';
import {runMediaTool} from '../src/compress.mjs';
const config={enabled:true,startUrl:'https://muse.ai/',prompt:'textarea',loggedIn:'textarea',resultCards:'[data-message-role="assistant"]',resultIdAttribute:'data-message-id',downloadButtonName:'Download',submitName:'Send',timeoutSeconds:30};
const request={projectId:'p',productId:'product',productRevision:1,sceneId:'auto_0',sceneRevision:1,name:'Hook',mediaType:'video',ratio:'9:16',duration:1,prompt:'Show the product',references:[]};

test('T-048: complete immutable blob replaces a partial hidden blob before any file is accepted',async t=>{
 const root=await mkdtemp(join(tmpdir(),'t048-blob-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=join(root,'source.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=90x160:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-threads','2','-c:a','aac','-movflags','+faststart',source]);
 const bytes=await readFile(source),partial=bytes.subarray(0,bytes.length-100);
 assertCompleteVideo(bytes,bytes.length);assert.throws(()=>assertCompleteVideo(partial,partial.length),/incomplete/);assert.throws(()=>assertCompleteVideo(bytes,bytes.length+1),/incomplete/);
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<textarea></textarea><div data-message-role="assistant" data-message-id="result"><video style="display:none"></video></div>'}));
 await page.goto('https://muse.ai/thread/fixture');
 const putBlob=async data=>{await page.evaluate(base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const v=document.querySelector('video');v.src=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));v.load();},data.toString('base64'));await page.waitForFunction(()=>document.querySelector('video').currentSrc===document.querySelector('video').src);};
 await putBlob(partial);let retries=0;
 t.mock.method(page,'waitForTimeout',async()=>{retries++;await putBlob(bytes);});
 const adapter=new MuseAdapter(config),states=[],path=await adapter.fetch(page,{providerUrl:page.url(),providerId:'result',request},async state=>states.push(state),join(root,'accepted.mp4'));
 assert.equal(retries,1);assert.ok((await readFile(path)).length>0);assert.equal(adapter.timings.downloadMethod,'video-blob');assert.deepEqual(states,['waiting','downloading']);
 assert.equal(adapter.downloadMetadata.verifiedBy,'container');assert.equal(adapter.downloadMetadata.duration,1);
 // A stable URL and matching HTTP length do not make a truncated MP4 complete.
 await putBlob(partial);retries=0;page.waitForTimeout.mock.mockImplementation(async()=>{retries++;});
 await assert.rejects(readCompleteVideoSource(page.locator('video'),page,config.startUrl),error=>error.downloadReason==='incomplete_video');assert.equal(retries,2);
 // A body stream ending early must also be rejected even with complete atoms.
 await putBlob(bytes);await page.evaluate(()=>{const original=fetch;window.fetch=async(...args)=>{const response=await original(...args),blob=await response.blob();return new Response(blob,{headers:{'content-length':String(blob.size+1)}});};});
 retries=0;await assert.rejects(readCompleteVideoSource(page.locator('video'),page,config.startUrl),/Blob incomplete/);assert.equal(retries,2);
});

test('T-048: HTTPS Content-Length mismatch is retried, all responses are disposed, no partial bytes escape',async()=>{
 const box=(type,payload=Buffer.alloc(4))=>{const b=Buffer.alloc(8+payload.length);b.writeUInt32BE(b.length);b.write(type,4);payload.copy(b,8);return b;};
 const bytes=Buffer.concat([box('ftyp'),box('moov'),box('mdat')]);let calls=0,disposed=0,waits=0;
 const media={evaluate:async()=> 'https://fixture.invalid/video.mp4'},page={waitForTimeout:async()=>waits++,request:{get:async()=>{const n=++calls;return {ok:()=>true,headers:()=>({'content-length':String(bytes.length)}),body:async()=>n===1?bytes.subarray(0,-1):bytes,dispose:async()=>disposed++};}}};
 assert.deepEqual((await readCompleteVideoSource(media,page,config.startUrl)).bytes,bytes);assert.equal(calls,2);assert.equal(disposed,2);assert.equal(waits,1);
});

test('T-048: two concurrent Store connections preserve ready/output/history when an early error arrives from a stale snapshot',{timeout:15000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'t048-race-')),path=join(root,'fixture.sqlite'),store=new Store(path);
 t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
 const job=store.enqueue(request,'race').job;store.put({...job,state:'validating'});
 const source=`import {parentPort,workerData} from 'node:worker_threads';import {Store} from ${JSON.stringify(new URL('../src/store.mjs',import.meta.url).href)};const s=new Store(workerData.path);const stale=s.job(workerData.id);parentPort.postMessage(stale.state);parentPort.once('message',()=>{s.recordEarlyRenderError(stale.id,Error('x'.repeat(900)));parentPort.postMessage('patched');s.close();});`;
 const thread=new Thread(new URL('data:text/javascript,'+encodeURIComponent(source)),{workerData:{path,id:job.id}});t.after(()=>thread.terminate());
 assert.deepEqual(await once(thread,'message'),['validating']);
 const ready=store.transition(job.id,'ready',{output:{sha256:'a'.repeat(64),path:'fixture.mp4'},uploadedAssetId:'asset',importedAt:123,timings:{validatedAt:122},note:'Fixture ready'});
 const done=once(thread,'message');thread.postMessage('patch');assert.deepEqual(await done,['patched']);
 const latest=store.job(job.id);assert.equal(latest.earlyRenderError.length,600);delete latest.earlyRenderError;assert.deepEqual(latest,ready);
 assert.throws(()=>store.recordEarlyRenderError('missing',Error('no job')),/Không tìm thấy/);
});

test('T-048: compose admission is independent of saturated probe, decode and other media pools',async()=>{
 const store=new Store(':memory:'),i=new Integrations(store,'unused',async(_c,_a,{input})=>({ok:true,result:{output:join(tmpdir(),'fixture-output.mp4'),engine:'hermes_ffmpeg_single_pass',commit:input.expectedCommit,cutCount:1,usageUsd:0,creativeReview:'pending'}}));
 store.set('integrations',{python:'fixture',montage:'fixture'});let release;const gate=new Promise(r=>release=r);
 const occupied=[mediaSlots,probeSlots,validationSlots].flatMap(pool=>Array.from({length:pool.limit},()=>pool.run(()=>gate)));
 let timer;try{
  await Promise.race([i.montage('compose'),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Compose queued behind validation')),1000))]);
  assert.equal(composeSlots.active,0);assert.ok(validationSlots.active>0);
 }finally{clearTimeout(timer);release();await Promise.all(occupied);store.close();}
});

test('T-048: warm tab ownership survives selection failure and closes/restores an adopted tab on dispatch failure',async t=>{
 const root=await mkdtemp(join(tmpdir(),'t048-warm-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const mode of ['selection','dispatch','close_failure','quota_return','expired']){
  const store=new Store(':memory:');try{
   store.set('muse_paused',false);store.set('adapter',config);store.set('profiles',[{id:'p',name:'Cho',enabled:true,health:'ready',proxy:{server:'',username:''},vpnEnabled:true,vpn:{state:'connected'},quota:{state:'available'}}]);
   const worker=new Worker(store,root,{},{}),job=store.enqueue(request,mode).job;store.transition(job.id,'preflight',{profileId:'p'});
   let closed=0;
   const page={isClosed:()=>{if(mode==='selection')throw Error('Selection failed');return closed>0;},close:async()=>{if(mode==='close_failure')throw Error('Close failed');closed++;},screenshot:async()=>{},url:()=>config.startUrl};
   const context={pages:()=>[page],close:async()=>{}};worker.contexts.set('p',context);worker.context=async()=>context;worker.warmPages.set('p',page);worker.warmed.set('p',mode==='expired'?Date.now()-130000:Date.now());worker.connectVpn=async()=>{};
   worker.setProfileVisibility=async()=>{throw Object.assign(Error('Dispatch failed'),mode==='quota_return'?{code:'MUSE_QUOTA_UNCONFIRMED'}:{});};
   await worker.runAdmitted(job.id,'p',false);
   if(['selection','close_failure'].includes(mode)){assert.equal(worker.warmPages.get('p'),page);assert.equal(closed,0);}else{assert.equal(worker.warmPages.has('p'),false);assert.equal(closed,1);}
   if(mode!=='selection')assert.equal(worker.warmed.has('p'),false);
   assert.equal(store.get('muse_paused'),false);assert.equal(store.get('profiles')[0].enabled,true);assert.equal(store.get('profiles')[0].vpnEnabled,true);
   assert.equal(worker.night.status().submitted,0);
  }finally{store.close();}
 }
});
