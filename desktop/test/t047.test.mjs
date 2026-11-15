import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {MUSE_VIDEO_COMMAND} from '../src/muse-video-prompt.mjs';
import {museVideoLimitReceipt} from '../src/muse-error-receipt.mjs';
import {museThreadUrl} from '../src/muse-thread-url.mjs';
import {importModule} from './helpers/local-server.mjs';
const {buildOfficeView}=await importModule('lib/lab/office-view.ts');
const config={enabled:true,startUrl:'https://muse.ai/thread/new',loggedIn:'#logged',prompt:'textarea',submitName:'Send',resultCards:'.result',resultIdAttribute:'data-message-id',readyWithinCard:'video',downloadButtonName:'Download',upload:'input',timeoutSeconds:900,reviewed:true};
const profiles=['Duc','Cho','Chi'].map(id=>({id,name:id,enabled:true,vpnEnabled:true,health:'ready',proxy:{server:''},quota:{state:'available',weeklyRemainingPercent:80}}));
const request=i=>({projectId:'project',productId:'product',productRevision:1,sceneId:'scene_'+i,sceneRevision:1,name:'Cảnh kiểm thử',prompt:'An approved product shot',mediaType:'video',ratio:'9:16',duration:8,references:[]});
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'hermes-t047-')),store=new Store(':memory:');try{store.set('profiles',profiles);store.set('muse_paused',false);store.set('adapter',config);await fn(store,new Worker(store,root,{},{},()=>8*1024**3));}finally{store.close();await rm(root,{recursive:true,force:true});}}

test('T-047: 24h receipt reaches S-2, stops only the failed profile without retry or switch changes',async t=>{
 const now=Date.now();t.mock.timers.enable({apis:['Date'],now});
 for(const code of ['MUSE_NO_MEDIA','MUSE_REFUSED'])await fixture(async(store,w)=>{
  w.night.begin();w.paused=false;const page={url:()=>'',screenshot:async()=>{}};
  w.context=async()=>({pages:()=>[],newPage:async()=>page});w.setProfileVisibility=async()=>{};w.checkToolchain=async()=>{};
  const raw="You've reached the video generation limit in the past 24 hours. https://fixture.invalid?token=private-token Bearer private-bearer token=private-key\nCookie: private-cookie";
  const prepare=t.mock.method(MuseAdapter.prototype,'prepare',async(_,request)=>{assert.ok(request.prompt.startsWith(MUSE_VIDEO_COMMAND+'\n'));assert.equal(request.prompt.split(MUSE_VIDEO_COMMAND).length,2);});
  const submit=t.mock.method(MuseAdapter.prototype,'submit',async(_,checkpoint)=>{await checkpoint('submitting');throw Object.assign(Error(raw),{code,providerResponse:raw});});
  try {
   const {job}=await w.enqueue(request(1));store.transition(job.id,'preflight',{profileId:'Duc'});
   const before=Date.now();await w.run(job.id,'Duc');const receipt=store.job(job.id),after=Date.now();
   assert.equal(submit.mock.callCount(),1);assert.equal(receipt.state,'needs_attention');assert.equal(receipt.errorKind,'refused');
   assert.ok(receipt.failedAt>=before&&receipt.failedAt<=after);assert.ok(receipt.errorMessage.length<=240);
   assert.match(receipt.errorMessage,/You've reached the video generation limit in the past 24 hours/);
   for(const field of ['errorMessage','failureDetail','providerResponse'])if(receipt[field])assert.doesNotMatch(receipt[field],/private-|https:\/\//);
   const view=buildOfficeView([],store.jobs());assert.equal(view.runs[0].group,'refused');assert.match(view.runs[0].needsAction.reason,/^Muse giới hạn video 24 giờ\. Thử lại sau \d\d:\d\d$/);
   assert.equal(w.night.profileStatus('Duc').stopped,true);assert.equal(w.night.profileStatus('Cho').stopped,false);assert.equal(w.night.profileStatus('Chi').stopped,false);
   assert.throws(()=>w.night.assertRoom(1,'Duc'),{code:'MUSE_NIGHT_STOP'});w.night.assertRoom(1,'Cho');
   w.tick();await new Promise(r=>setImmediate(r));assert.equal(submit.mock.callCount(),1);assert.equal(store.jobs().length,1);
   assert.equal(store.get('muse_paused'),false);assert.deepEqual(store.get('profiles'),[{...profiles[0],session:'signed_in',checkedAt:now},...profiles.slice(1)]);assert.equal(w.night.current().submissions.length,1);
   assert.deepEqual(w.night.current().submissions.map(s=>s.profileId),['Duc']);
  } finally {prepare.mock.restore();submit.mock.restore();}
 });
});

test('T-047: unrelated errors have no invented limit receipt, Vietnamese and truncated private text are safe',()=>{
 assert.deepEqual(museVideoLimitReceipt({message:'Network timeout'},42),{});
 assert.deepEqual(museVideoLimitReceipt({message:'Weekly quota exhausted'},42),{});
 assert.equal(museVideoLimitReceipt({message:'Đã hết giới hạn tạo video trong 24 giờ qua'},42).failedAt,42);
 const receipt=museVideoLimitReceipt({providerResponse:'24 hour video generation limit. '+('x'.repeat(500))+' token=private'},42);
 assert.ok(receipt.errorMessage.length<=240);assert.doesNotMatch(receipt.errorMessage,/private|x{32}/);
});

test('T-047: saved conversation URLs only; no new thread, foreign host, credentials or query secrets',()=>{
 assert.equal(museThreadUrl('https://muse.ai/thread/fixture_123'),'https://muse.ai/thread/fixture_123');
 for(const url of [null,'','https://muse.ai/thread/new','https://muse.ai/thread/new/','https://muse.ai/','https://muse.ai/thread/','http://muse.ai/thread/id','https://muse.ai.evil.test/thread/id','https://u:p@muse.ai/thread/id','https://muse.ai/thread/id?token=x','https://muse.ai/thread/id#secret','javascript:alert(1)','https://muse.ai/thread/a/b'])assert.equal(museThreadUrl(url),null,String(url));
});

test('T-047: timeout persists through existing adapter save; bounds and invalid types leave settings and switches intact',()=>fixture(async(store,w)=>{
 for(const value of [60,900,1800]){w.saveAdapter({...config,timeoutSeconds:value});assert.equal(w.config().timeoutSeconds,value);}
 const before=structuredClone(w.config());
 for(const value of [59,1801,60.5,null,undefined,NaN,Infinity,'900']){assert.throws(()=>w.saveAdapter({...config,timeoutSeconds:value}),/Thời gian chờ phải là số nguyên từ 60 đến 1800 giây/);assert.deepEqual(w.config(),before);}
 w.contexts.set('Duc',{});assert.throws(()=>w.saveAdapter(config),/Đóng các profile/);assert.deepEqual(w.config(),before);
 assert.deepEqual(store.get('profiles'),profiles);assert.equal(store.get('muse_paused'),false);assert.equal(store.jobs().length,0);
}));

test('T-047: export folder IPC uses the same directory as worker output, never accepts a caller path',async()=>{
 const main=await readFile(new URL('../src/main.mjs',import.meta.url),'utf8'),preload=await readFile(new URL('../src/preload.cjs',import.meta.url),'utf8');
 assert.match(main,/exportDirectory:join\(root,'outputs'\)/);assert.match(main,/revealExports:async\(\)=>\{const directory=join\(root,'outputs'\);await mkdir\(directory,\{recursive:true\}\);const error=await shell.openPath\(directory\);if\(error\)throw Error/);
 assert.match(preload,/'revealExports'/);
});
