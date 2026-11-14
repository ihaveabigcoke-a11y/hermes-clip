import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MuseAdapter} from '../src/muse.mjs';
import {runMediaTool} from '../src/compress.mjs';
import {EarlyVideoRender,compositionSignature} from '../src/early-video-render.mjs';

test('T-034: fetches the exact video URL while chat is streaming, without opening preview',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-t034-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'source.mp4');await runMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=90x160:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',source]);
  const bytes=await readFile(source),events=[],config={startUrl:'https://muse.ai/',resultIdAttribute:'data-message-id',resultCards:'[data-message-id]',loggedIn:'textarea',readyWithinCard:'video',downloadButtonName:'Download',timeoutSeconds:30};
  const media={isVisible:async()=>true,evaluate:async()=> 'https://media.muse.ai/this-receipt.mp4'};
  const exact={scrollIntoViewIfNeeded:async()=>{},locator:selector=>{assert.equal(selector,'video');return {first:()=>media};}};
  const page={url:()=>config.startUrl,locator:selector=>{if(selector==='textarea')return {waitFor:async()=>{},isVisible:async()=>true};assert.equal(selector,'[data-message-id][data-message-id="this-result"]');return exact;},
    getByRole:()=>assert.fail('Download must not wait for Stop to disappear or open the preview'),
    request:{get:async url=>{assert.equal(url,'https://media.muse.ai/this-receipt.mp4');events.push('transfer');return {ok:()=>true,headers:()=>({'content-length':String(bytes.length)}),body:async()=>bytes,dispose:async()=>events.push('disposed')};}}};
  const adapter=new MuseAdapter(config),result=await adapter.fetch(page,{providerId:'this-result',providerUrl:config.startUrl,request:{mediaType:'video'}},async state=>events.push(state),join(root,'output.mp4'));
  assert.ok((await readFile(result)).length);assert.deepEqual(events,['waiting','downloading','transfer','disposed']);assert.equal(adapter.timings.downloadMethod,'video-url');
  assert.ok(adapter.timings.downloadStartedAt-adapter.timings.mediaVisibleAt<=1000);
  // A stale/signed URL falls back to the normal UI once, without repeating a
  // downloading transition or contaminating the next member of a bundle.
  events.length=0;
  page.request.get=async()=>({ok:()=>false,dispose:async()=>{}});
  exact.locator=selector=>({first:()=>selector==='video'?media:{click:async()=>events.push('preview')}});
  exact.getByRole=()=>({});page.getByRole=()=>({waitFor:async()=>{},click:async()=>events.push('button')});
  page.keyboard={press:async()=>events.push('escape')};
  page.waitForEvent=async()=>({saveAs:p=>writeFile(p,bytes),failure:async()=>null});
  await adapter.fetch(page,{providerId:'this-result',providerUrl:config.startUrl,request:{mediaType:'video'}},async state=>events.push(state),join(root,'fallback.mp4'));
  assert.deepEqual(events,['waiting','downloading','preview','button','escape']);
});

test('T-034: verified hook encodes before library import; cached render requires exact sources, cuts and CTA',async()=>{
  const product={id:'p',kind:'product',revision:1,data:{ctaKeyword:'GLOW'}};
  const scenes=[0,1,2,3,4].map(i=>({id:'auto_'+i,revision:1,storyboardApproved:true,takes:i<3?[]:[{id:'t'+i,assetId:'a'+i,sha256:String(i).repeat(64),sceneRevision:1,review:'pending'}]}));
  const project={id:'project',kind:'production',data:{productId:'p',productRevision:1,scenes}};
  const records=[product,project,...[3,4].map(i=>({id:'a'+i,kind:'asset',data:{sha256:String(i).repeat(64),metadata:{duration:8}}}))];
  const job={id:'j',state:'ready',request:{projectId:'project',sceneId:'auto_0',sceneRevision:1,productRevision:1},output:{sha256:'a'.repeat(64),metadata:{duration:8}}};
  let input,finish,importFinished=false;const events=[];
  const service=new EarlyVideoRender({records:async()=>records,readAsset:async()=>new Uint8Array([1]),readOutput:async()=>({bytes:new Uint8Array([2]),sha256:job.output.sha256}),compose:async value=>{assert.equal(importFinished,false);input=value;events.push('encode');await new Promise(r=>finish=r);return {id:'render'};},onTiming:(_id,event)=>events.push(event)});
  await service.start(job);assert.equal(input,undefined,'Only a user-started flow can arm background encoding');
  await service.arm('project');await service.start(job);assert.ok(input);assert.equal(scenes[0].takes.length,0);
  assert.equal(input.clips.length,3);assert.deepEqual(input.clips.map(c=>c.outSec),[4,4,7]);
  assert.equal(service.get({...input,overlays:[]}),null);assert.equal(service.get({...input,clips:input.clips.map((c,i)=>i?c:{...c,inSec:1})}),null);
  assert.equal(service.get({...input,clips:input.clips.map((c,i)=>i?c:{...c,sha256:'b'.repeat(64)})}),null);
  assert.equal(compositionSignature({...input,clips:input.clips.map(c=>({...c,assetId:'new-library-id'}))}),compositionSignature(input));
  importFinished=true;events.push('library');finish();assert.deepEqual(await service.get(input),{id:'render'});assert.ok(events.indexOf('encode')<events.indexOf('library'));
  product.revision=2;input=null;await service.start({...job,id:'j2'});assert.equal(input,null,'Changed product must not render');
});
