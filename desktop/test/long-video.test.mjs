import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,copyFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseNight} from '../src/muse-night.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {Integrations} from '../src/integrations.mjs';
import {LongVideo} from '../src/long-video.mjs';
import {lastVideoFrame} from '../src/long-video-frames.mjs';
import {jobInput} from '../src/contracts.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {longVideoScenes,longVideoDefaults} from '../../lib/lab/long-video.ts';
import {newProduction,applyProduction,productionSchema} from '../../lib/lab/production.ts';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ff=(args)=>execFileSync('ffmpeg',['-v','error',...args],{windowsHide:true,maxBuffer:20*1024**2});
test('T-046 defaults stay off, old records/three-hook scenes are unchanged, settings are revisioned and bounded',()=>{
  const p=newProduction('Fixture','product',1),before=structuredClone(p);
  assert.equal(p.longVideo,undefined);assert.equal(longVideoDefaults().enabled,false);
  assert.throws(()=>longVideoScenes(p),/đang tắt/);
  const next=applyProduction(p,'long_video_settings',{enabled:true,mode:'manual',prompts:['One scene.','Two scenes.'],sceneIds:[]},'settings1');
  assert.deepEqual(p,before);assert.deepEqual(next.scenes,p.scenes);assert.deepEqual(next.variants,p.variants);assert.deepEqual(next.exports,p.exports);
  assert.equal(longVideoScenes(next).length,2);assert.deepEqual(applyProduction(next,'long_video_settings',{},'settings1'),next);
  for(const count of [0,1,6])assert.throws(()=>longVideoScenes({...p,longVideo:{enabled:true,mode:'manual',prompts:Array(count).fill('Scene')}}));
  assert.deepEqual(productionSchema.parse(p),p);
  assert.throws(()=>longVideoScenes({...p,longVideo:{enabled:true,mode:'project',sceneIds:['x','x']}}));
});

async function fixture(t,{count=3,failure=null,oneProfile=false,compose=true,useProject=false}={},check){
  const root=await mkdtemp(join(tmpdir(),'hermes-t046-')),store=new Store(':memory:');
  // Browser is fake, so unrelated parallel test processes must not decide its
  // RAM admission. A separate case below exercises the low-memory stop.
  const worker=new Worker(store,root,{},{},()=>8*1024**3);let now=Date.now();
  worker.night=new MuseNight(store,{now:()=>now,sleep:async ms=>{now+=ms;}});
  store.set('muse_paused',false);store.set('muse_pacing',{intervalSeconds:60,sessionLimit:null});
  store.set('adapter',{enabled:true,startUrl:'https://muse.invalid',prompt:'#prompt',upload:'#upload',timeoutSeconds:10});
  store.set('profiles',['Cho',...(oneProfile?[]:['Duc','Chim']),'Chi'].map(name=>({id:name,name,enabled:true,health:'ready',session:'signed_in',quota:{state:'available',weeklyRemainingPercent:100},vpnEnabled:true,vpn:{state:'connected'},proxy:{server:''}})));
  const originalProfiles=structuredClone(store.get('profiles'));
  const project={id:'project',kind:'production',revision:1,data:{...newProduction('Fixture','product',1),longVideo:{enabled:true,mode:'manual',prompts:Array.from({length:count},(_,i)=>`${MUSE_VIDEO_COMMAND}\nScene ${i+1}: a plain cup on a wooden table. ${MUSE_VIDEO_COMMAND}`),sceneIds:[]}}};
  if(useProject){
    for(let i=0;i<count;i++){
      project.data=applyProduction(project.data,'scene',{id:'existing'+i,name:'Existing '+i,prompt:'Approved scene '+i,duration:8,ratio:'9:16',mediaType:'video',referenceIds:[]},'save'+i);
      project.data=applyProduction(project.data,'storyboard',{sceneId:'existing'+i},'approve'+i);
    }
    project.data.longVideo={enabled:true,mode:'project',prompts:[],sceneIds:project.data.scenes.map(s=>s.id).reverse()};
  }
  const records=[project,{id:'product',kind:'product',revision:1,data:{}}],originalProject=structuredClone(project);
  const uploads=[],prompts=[],attachmentPaths=[],sent=[],events=[];
  const manual={records:async()=>records,request:async(path,options)=>{
    assert.equal(path,'/api/assets');const blob=options.body.get('file'),bytes=Buffer.from(await blob.arrayBuffer());const asset={id:'asset_'+uploads.length,sha256:hash(bytes)};uploads.push({...asset,bytes,commandId:options.body.get('commandId')});return Response.json(asset);
  }};
  const integrations=new Integrations(store,root);
  integrations.saveConfig({python:process.env.PRODUCT_LAB_TEST_PYTHON??resolve('desktop/.integrations/.venv/Scripts/python.exe'),reach:process.env.PRODUCT_LAB_TEST_REACH??resolve('desktop/.integrations/.venv/Scripts/agent-reach.exe'),montage:process.env.PRODUCT_LAB_TEST_MONTAGE??resolve('desktop/.integrations/OpenMontage')});
  if(!compose)integrations.compose=async()=>{throw Error('fixture render failure');};
  const service=new LongVideo({worker,manual,integrations,domain:{longVideoScenes},wait:()=>delay(5)});
  worker.validateMediaProvider=request=>service.assertRequest(request);
  worker.receiveOutput=id=>service.importJob(id);
  const page={url:()=>'',screenshot:async()=>{},locator:selector=>({first:()=>({isVisible:async()=>false}),allTextContents:async()=>[],fill:async prompt=>prompts.push(prompt),setInputFiles:async paths=>attachmentPaths.push(paths)})};
  worker.context=async()=>({pages:()=>[],newPage:async()=>page});worker.setProfileVisibility=async()=>{};worker.connectVpn=async()=>{};worker.measureQuota=async()=>({state:'available'});
  const session=t.mock.method(MuseAdapter.prototype,'session',async()=>true);
  const submit=t.mock.method(MuseAdapter.prototype,'submit',async function(_page,checkpoint){
    assert.equal(worker.active.size,1);await checkpoint('submitting');
    const job=store.jobs().find(j=>j.state==='submitting');sent.push(job.id);events.push('send:'+job.request.longVideo.index);
    if(failure&&failure!=='MUSE_OLD_CLIP'&&job.request.longVideo.index===1)throw Object.assign(Error('fixture refused or failed'),{code:failure});
    await checkpoint('submitted',{providerId:'fixture_'+sent.length,providerUrl:'https://muse.invalid/result'});
  });
  const fetch=t.mock.method(MuseAdapter.prototype,'fetch',async function(_page,job,checkpoint,path){
    await checkpoint('waiting');await checkpoint('downloading');
    const index=job.request.longVideo.index,frame=job.request.references.find(r=>r.role==='first_frame');
    if(index){assert.ok(frame);const previous=service.find(job.request.longVideo.runId).outputs[index-1];assert.ok(previous.assetId);assert.equal(frame.sha256,service.find(job.request.longVideo.runId).frames[index-1].sha256);assert.equal(hash(await readFile(frame.path)),frame.sha256);}
    if(failure==='MUSE_OLD_CLIP'&&index===1){await copyFile(service.find(job.request.longVideo.runId).outputs[0].path,path);events.push('file:'+index);return path;}
    ff([...(frame?['-loop','1','-framerate','24','-i',frame.path]:['-f','lavfi','-i','color=c=red:s=90x160:r=24:d=8']),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-vf',`drawbox=x=0:y=0:w=45:h=80:color=${['blue','green','yellow','white','purple'][index]}:t=fill:enable='gte(t,7.9)'`,'-t','8','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-shortest',path]);
    events.push('file:'+index);return path;
  });
  try{await check({root,store,worker,service,project,records,originalProject,originalProfiles,uploads,prompts,attachmentPaths,sent,events});}
  finally{await Promise.all([...service.tasks.values()]);await worker.close();session.mock.restore();submit.mock.restore();fetch.mock.restore();store.close();await rm(root,{recursive:true,force:true});}
}

for(const count of [2,3,4,5])test(`T-046 fake Muse + real ffmpeg/bridge: ${count} sequential scenes, exact last-frame attachment, one MP4`,{timeout:180000},t=>fixture(t,{count,oneProfile:count===2,useProject:count===3},async f=>{
  const request={projectId:'project',revision:1,requestId:'run'+count};
  const initial=await f.service.start(request);assert.equal(initial.state,'running');
  assert.equal((await f.service.start(request)).id,initial.id);
  await assert.rejects(f.worker.start({count:1}),/Video dài/);
  await Promise.all([...f.service.tasks.values()]);
  const run=f.service.find(initial.id);assert.equal(run.state,'done',run.reason);
  assert.equal(run.outputs.length,count);assert.equal(run.frames.length,count-1);assert.equal(run.jobIds.length,count);assert.equal(f.sent.length,count);
  assert.ok(Math.abs(run.output.metadata.duration-count*8)<=.1);assert.equal(run.output.fullDecode,true);assert.equal(run.output.sha256,hash(await readFile(run.output.path)));
  assert.deepEqual(f.events,Array.from({length:count},(_,i)=>['send:'+i,'file:'+i]).flat());
  assert.equal(f.prompts.length,count);for(const prompt of f.prompts){assert.ok(prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(prompt.split(MUSE_VIDEO_COMMAND).length-1,1);}
  if(count===3){assert.match(f.prompts[0],/Approved scene 2/);assert.match(f.prompts[2],/Approved scene 0/);}
  assert.equal(f.attachmentPaths.length,count-1);assert.equal(f.store.get('muse_paused'),false);
  assert.ok(f.store.jobs().every(j=>j.profileId!=='Chi'));assert.deepEqual(f.store.get('profiles').map(p=>p.enabled),f.originalProfiles.map(p=>p.enabled));assert.deepEqual(f.project,f.originalProject);
  for(const name of ['Cho','Duc','Chim']){const sends=f.worker.night.current().submissions.filter(s=>s.profileId===name);for(let i=1;i<sends.length;i++)assert.ok(sends[i].at-sends[i-1].at>=60000);}
  assert.ok(run.seams.every(s=>s.withinThreshold&&s.differencePercent<1));
  // Independent full-stream decode proves this is the final frame, not the
  // first frame at -sseof -1. Last 0.1s differs visibly from the previous frame.
  const pixels=ff(['-i',run.outputs[0].path,'-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
  const last=ff(['-i',run.frames[0].path,'-pix_fmt','rgb24','-frames:v','1','-f','rawvideo','pipe:1']);
  const frameBytes=90*160*3;
  assert.deepEqual(pixels.subarray(-frameBytes),last);assert.notDeepEqual(pixels.subarray(-24*frameBytes,-23*frameBytes),last);
  const before=f.sent.length;await f.service.start(request);assert.equal(f.sent.length,before);
  await assert.rejects(f.worker.retry(run.jobIds[0]),/không thử lại/);
  await assert.rejects(f.worker.retryMany({requestId:'retry',items:[{id:run.jobIds[0]}]}),/không thử lại/);
  const changed=join(f.root,'changed.mp4');await copyFile(run.outputs[0].path,changed);await writeFile(changed,'changed');
  await assert.rejects(lastVideoFrame({...run.outputs[0],path:changed},join(f.root,'bad-frame'),0),/checksum/);
}));

for(const failure of ['MUSE_NO_MEDIA','MUSE_CAPTCHA','TIMEOUT','MUSE_OLD_CLIP'])test(`T-046 ${failure}: stop after scene 2, preserve scene 1, no retry or failover, switches unchanged`,{timeout:60000},t=>fixture(t,{failure},async f=>{
  await f.service.start({projectId:'project',revision:1,requestId:'failure'});await Promise.all([...f.service.tasks.values()]);
  // The service can stop while the runner is still saving its diagnostic.
  // Wait for that cleanup before testing a fresh start's stopped-night guard.
  await Promise.all([...f.worker.pendingTicks]);
  const run=f.service.find('failure');assert.equal(run.state,'stopped');assert.equal(run.outputs.length,1);assert.equal(run.jobIds.length,2);assert.equal(f.sent.length,2);assert.equal(f.uploads.length,1);assert.equal(f.worker.paused,true);
  if(failure==='MUSE_OLD_CLIP'){assert.match(run.reason,/Trùng clip cũ #1/);assert.equal(f.store.job(run.jobIds[1]).duplicateOf.jobId,run.jobIds[0]);assert.equal(run.output,undefined);}
  assert.equal(hash(await readFile(run.outputs[0].path)),run.outputs[0].sha256);assert.deepEqual(f.store.get('profiles').map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled})),f.originalProfiles.map(p=>({id:p.id,enabled:p.enabled,vpnEnabled:p.vpnEnabled})));
  assert.equal(f.store.get('muse_paused'),false);await assert.rejects(f.service.start({projectId:'project',revision:1,requestId:'retry_run'}),/đã dừng/);assert.equal(f.sent.length,2);
}));

test('T-046 off/stale/Chi-only/busy projects never enqueue; restart preserves receipts and stops without auto send',t=>fixture(t,{},async f=>{
  const request={projectId:'project',revision:1,requestId:'blocked'};
  f.project.data.longVideo.enabled=false;await assert.rejects(f.service.start(request),/đang tắt/);f.project.data.longVideo.enabled=true;
  await assert.rejects(f.service.start({...request,revision:2}),/đã đổi/);
  f.worker.active.set('Cho','other');await assert.rejects(f.service.start(request),/đang chạy/);f.worker.active.clear();
  f.store.set('profiles',f.originalProfiles.filter(p=>p.name==='Chi'));await assert.rejects(f.service.start(request),/Chi/);assert.equal(f.store.jobs().length,0);
  f.store.set('long_video_runs',[{id:'old',projectId:'project',scenes:[{},{}],state:'running',createdAt:1,outputs:[{assetId:'old_asset'}],jobIds:['old_receipt'],seams:[]}]);
  const before=f.store.get('long_video_runs');const restarted=new LongVideo({worker:f.worker,manual:{},integrations:{},domain:{longVideoScenes}});
  assert.equal(restarted.find('old').state,'stopped');assert.deepEqual(restarted.find('old').outputs,before[0].outputs);assert.deepEqual(restarted.find('old').jobIds,before[0].jobIds);assert.equal(f.sent.length,0);assert.equal(f.store.get('muse_paused'),false);
}));

test('T-046 first-only reference is limited to a continuation; legacy first/last contract remains strict',()=>{
  const ref={id:'f',version:1,role:'first_frame',type:'image/png',sha256:'a'.repeat(64),bytes:new Uint8Array([1])},request={projectId:'p',productId:'p',productRevision:1,sceneId:'s',sceneRevision:1,name:'s',mediaType:'video',ratio:'9:16',duration:8,prompt:'s',references:[ref]};
  assert.equal(jobInput.safeParse(request).success,false);
  assert.equal(jobInput.safeParse({...request,longVideo:{runId:'r',index:1}}).success,true);
  assert.equal(jobInput.safeParse({...request,references:[],longVideo:{runId:'r',index:1}}).success,false);
  assert.equal(jobInput.safeParse({...request,references:[ref,{...ref,id:'last',role:'last_frame'}]}).success,true);
});

test('T-046 worker rechecks sequence ownership after async preflight; an earlier ordinary start cannot overlap',t=>fixture(t,{},async f=>{
  f.worker.validateMediaProvider=async()=>{};
  const {job}=await f.worker.enqueue({projectId:'project',productId:'product',productRevision:1,sceneId:'normal',sceneRevision:1,name:'normal',mediaType:'video',ratio:'9:16',duration:8,prompt:'Normal hook',references:[]});
  let release;f.worker.checkToolchain=()=>new Promise(resolve=>{release=resolve;});
  const start=f.worker.start({count:1,jobIds:[job.id],maxConcurrent:3});
  f.worker.longVideoOwner='other_sequence';release();
  await assert.rejects(start,/Video dài/);assert.equal(f.worker.active.size,0);assert.equal(f.worker.approvedIds.length,0);assert.equal(f.sent.length,0);assert.equal(f.store.get('muse_paused'),false);
}));

test('T-046 low-memory admission stops before the first send and preserves switches',t=>fixture(t,{},async f=>{
  f.worker.memory=()=>0;
  await f.service.start({projectId:'project',revision:1,requestId:'no_memory'});await Promise.all([...f.service.tasks.values()]);
  const run=f.service.find('no_memory');assert.equal(run.state,'stopped');assert.equal(f.sent.length,0);assert.equal(run.outputs.length,0);
  assert.match(f.store.job(run.jobIds[0]).history.at(-1).note,/RAM/);assert.equal(f.store.get('muse_paused'),false);assert.ok(f.store.get('profiles').every(p=>p.enabled));
}));
