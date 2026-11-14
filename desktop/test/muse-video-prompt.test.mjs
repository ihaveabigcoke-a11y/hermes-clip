import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MUSE_VIDEO_COMMAND,museVideoBody,museMediaPrompt} from '../src/muse-video-prompt.mjs';
import {MuseAdapter,explicitMediaRefusal} from '../src/muse.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {Worker} from '../src/worker.mjs';
import {Store} from '../src/store.mjs';
import {jobFingerprint} from '../src/contracts.mjs';
import {applyProduction,newProduction,productionSchema} from '../../lib/lab/production.ts';
import {autoVideoShots,museVideoLabel} from '../../lib/lab/auto-video.ts';
import {museTaskPrompt} from '../../lib/lab/muse-workflows.ts';

const body='A fenced garden at dusk.\n  Keep the dog beside the adult.\nNo on-screen text.';
const prefixed=MUSE_VIDEO_COMMAND+'\n'+body;
const request={projectId:'project',productId:'product',productRevision:1,sceneId:'scene',sceneRevision:1,name:'Scene',mediaType:'video',ratio:'9:16',duration:8,prompt:body,references:[]};
const config={startUrl:'https://muse.ai/',resultIdAttribute:'data-message-id',resultCards:'[data-message-role="assistant"]',prompt:'textarea',submitName:'Send',timeoutSeconds:900};

test('fixed video command is first and unique; deletion, duplicates and a moved command preserve the scene',()=>{
 for(const prompt of [body,prefixed,MUSE_VIDEO_COMMAND+'\r\n'+prefixed,body+'\n'+MUSE_VIDEO_COMMAND]){
  const result=museMediaPrompt(prompt,'video');
  assert.ok(result.startsWith(MUSE_VIDEO_COMMAND+'\n'));
  assert.equal(result.split(MUSE_VIDEO_COMMAND).length,2);
  assert.equal(museMediaPrompt(result,'video'),result);
  assert.equal(museVideoBody(result),prompt===body+'\n'+MUSE_VIDEO_COMMAND?body+'\n':body);
 }
 assert.equal(museMediaPrompt(body,'image'),body);
 assert.equal(museMediaPrompt(body,undefined),body);
});

test('save, import and automatic builders normalize new video scenes without rewriting old scenes or images',()=>{
 const input={id:'scene',name:'Scene',mediaType:'video',prompt:body};
 for(const prompt of [body,prefixed,MUSE_VIDEO_COMMAND+'\n'+prefixed]){
  const saved=applyProduction(newProduction('Project','product',1),'scene',{...input,prompt},'save',1);
  assert.equal(saved.scenes[0].prompt,prefixed);
  const imported=applyProduction(newProduction('Project','product',1),'import',{rows:[{...input,prompt}]},'import',1);
  assert.equal(imported.scenes[0].prompt,prefixed);
  saved.scenes[0].prompt=body;
  assert.equal(productionSchema.parse(saved).scenes[0].prompt,body,'Reading a legacy record must not migrate approved text');
 }
 const image=applyProduction(newProduction('Project','product',1),'scene',{...input,mediaType:'image'},'image',1);
 assert.equal(image.scenes[0].prompt,body);
 const shots=autoVideoShots({data:{name:'Fixture',situation:'Finding the dog',allowedClaims:''}});
 assert.ok(shots.every(s=>s.prompt.startsWith(MUSE_VIDEO_COMMAND+'\n')));
});

test('enqueue repairs missing/duplicate prefix and deduplicates against the historical raw fingerprint',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hermes-video-prefix-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const store=new Store(':memory:');t.after(()=>store.close());store.set('muse_paused',false);
 const worker=new Worker(store,root,{},{});
 const legacyHash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
 const old=store.enqueue(request,legacyHash).job;
 const before=structuredClone(old);
 for(const prompt of [body,prefixed,MUSE_VIDEO_COMMAND+'\n'+prefixed]){
  assert.equal(jobFingerprint({...request,prompt}),legacyHash);
  const duplicate=await worker.enqueue({...request,prompt});
  assert.equal(duplicate.deduplicated,true);assert.equal(duplicate.job.id,old.id);
 }
 assert.deepEqual(store.job(old.id),before,'Never rewrite a submitted/legacy receipt for this migration');
 store.put({...old,state:'failed'});worker.readProductionRecord=async()=>({id:request.projectId,data:{scenes:[{id:request.sceneId}]}});
 const legacyRetry=await worker.retry(old.id);assert.equal(legacyRetry.request.prompt,prefixed);
 assert.equal(store.job(old.id).request.prompt,body,'Only the new retry receives the command');
 const fresh=await worker.enqueue({...request,sceneId:'new',prompt:body});
 assert.equal(fresh.job.request.prompt,prefixed);assert.equal(store.jobs().length,3);
 store.put({...fresh.job,state:'failed'});
 assert.equal(store.retry(fresh.job.id).request.prompt,prefixed);
});

test('fake Muse generates only when the command is first, including legacy and duplicate requests; one send',async()=>{
 for(const prompt of [body,prefixed,MUSE_VIDEO_COMMAND+'\n'+prefixed]){
  let filled='',sent=false,clicks=0;const urls=[];
  const adapter=new MuseAdapter(config);adapter.session=async()=>true;
  const page={url:()=> 'https://muse.ai/thread/fixture',goto:async url=>urls.push(url),
   locator:selector=>({inputValue:async()=>'',waitFor:async()=>{},fill:async value=>{filled=value;},evaluateAll:async()=>selector.includes('role="user"')||selector==='[data-message-id][data-message-role="assistant"]'?[]:sent?['new-video']:[]}),
   getByRole:()=>({waitFor:async()=>{},click:async()=>{clicks++;assert.ok(filled.startsWith(prefixed));assert.equal(filled.split(MUSE_VIDEO_COMMAND).length,2);sent=true;}})};
  await adapter.prepare(page,{...request,prompt});
  const states=[];assert.equal(await adapter.submit(page,async(state,patch)=>states.push({state,patch})),'new-video');
  assert.deepEqual(urls,['https://muse.ai/thread/new']);assert.equal(clicks,1);
  assert.equal(states.at(-1).patch.providerId,'new-video');assert.ok(filled.includes(body));
 }
});

test('403 text refusal keeps the reason before follow-up suggestions, stops once and cannot report ready',async t=>{
 const reason='Status: PROMPT ONLY — no video was generated here. Video generation is unavailable for this account in this country/region (lasting restriction, 403 video_not_available)';
 const followup='Want me to make a still image instead?';
 assert.equal(explicitMediaRefusal(reason),true);
 let now=0,sent=false,clicks=0;t.mock.method(Date,'now',()=>now);
 const adapter=new MuseAdapter(config);adapter.mediaType='video';
 const page={url:()=> 'https://muse.ai/thread/refusal',locator:selector=>({evaluateAll:async()=>selector==='[data-message-id][data-message-role="assistant"]'&&sent?[{id:'refusal',text:reason},{id:'followup',text:followup}]:[]}),getByRole:()=>({click:async()=>{sent=true;clicks++;},isVisible:async()=>false}),waitForTimeout:async()=>{now+=1000;}};
 await assert.rejects(adapter.submit(page,async()=>{}),error=>{
  assert.equal(error.code,'MUSE_NO_MEDIA');assert.equal(error.providerResponse,reason+'\n\n'+followup);
  const label=museVideoLabel({musePaused:false,generationReady:true,profiles:[{id:'cho',name:'Cho',enabled:true,health:'ready',quota:{state:'available'}}],jobs:[{profileId:'cho',request,state:'needs_attention',failureCode:error.code,providerResponse:error.providerResponse}]});
  assert.equal(label,'Cho: Muse hạn chế tạo video theo vùng/quyền');assert.ok(!label.includes('sẵn sàng'));return true;
 });
 assert.equal(clicks,1);assert.ok(now>=15000&&now<30000);
});

test('text research/content requests stay text-only and never inherit the video command',t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const chat=new MuseChat({store});
 for(const kind of ['research','content','landing','analysis']){
  const prompt=museTaskPrompt(kind,{}),out=chat.textPrompt(prompt);
  assert.ok(!out.includes(MUSE_VIDEO_COMMAND));assert.match(out,/Do not call image or video generation tools/);
 }
});
