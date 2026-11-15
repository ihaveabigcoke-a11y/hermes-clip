// Child process owned by t050-queue-state.test.mjs. No service/browser access.
import {join} from 'node:path';
import {copyFile} from 'node:fs/promises';
import {Store} from '../../src/store.mjs';
import {Worker} from '../../src/worker.mjs';
import {MuseAdapter} from '../../src/muse.mjs';
import {MUSE_VIDEO_COMMAND} from '../../src/muse-video-prompt.mjs';
const root=process.argv[2],store=new Store(join(root,'fixture.sqlite'));
store.set('muse_paused',false);store.set('adapter',{enabled:true,startUrl:'https://muse.invalid/',timeoutSeconds:60});
const profiles=['waiting','saved'].map(id=>({id,name:id,enabled:true,vpnEnabled:true,proxy:{server:'',username:''},quota:{state:'available'}}));
store.set('profiles',profiles);
const worker=new Worker(store,root,{},{}),page={url:()=> 'https://muse.invalid/thread/fixture'};
worker.context=async()=>({pages:()=>[page]});worker.setProfileVisibility=async()=>{};worker.measureQuota=async()=>{};
let sends=0,waiting=false,saved=false;
const ids={};
const notify=()=>{if(waiting&&saved)process.send({ids,sends});};
MuseAdapter.prototype.prepare=async(_page,request)=>{if(request.prompt.split(MUSE_VIDEO_COMMAND).length!==2)throw Error('Command count');};
MuseAdapter.prototype.submit=async(_page,checkpoint)=>{await checkpoint('submitting');sends++;await checkpoint('submitted',{providerId:'result_'+sends,providerUrl:page.url(),providerResponse:'Fixture receipt '+sends});};
MuseAdapter.prototype.fetch=async(_page,job,checkpoint,path)=>{
  checkpoint('waiting');
  if(job.request.sceneId==='waiting'){waiting=true;notify();await new Promise(()=>{});}
  checkpoint('downloading');await copyFile(join(root,'source.mp4'),path);return path;
};
// Reproduce the historical torn snapshot: a verified output exists but its
// terminal state was overwritten. The parent kills this process at that point.
store.completeOutputs=entries=>{
  for(const {id,patch} of entries){const {note,...rest}=patch;store.put({...store.job(id),...rest,state:'validating'});}
  saved=true;notify();
};
for(const sceneId of ['waiting','saved']){
  const request={projectId:'project',productId:'product',productRevision:1,sceneId,sceneRevision:1,name:sceneId,mediaType:'video',ratio:'9:16',duration:1,prompt:MUSE_VIDEO_COMMAND+'\nA synthetic scene.',references:[]};
  const job=store.enqueue(request,sceneId).job;ids[sceneId]=job.id;
  store.transition(job.id,'preflight',{profileId:sceneId});worker.active.set(sceneId,job.id);
  void worker.runAdmitted(job.id,sceneId,false);
}
setInterval(()=>{},1000);
