import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import * as domain from '../../lib/lab/rea-video.ts';
import {referenceVideoDraftSchema} from '../../lib/lab/viral-reference.ts';
import {formulaVersions,workspaceFormulas} from '../../lib/lab/viral-formulas.ts';
import {proposeReaFormulas} from '../../lib/lab/rea-formula.ts';
import {Integrations} from '../src/integrations.mjs';
import {ReaVideoService,withGeminiEnv} from '../src/rea-video.mjs';
import {runCodexText,codexImageCapability} from '../src/codex-cli.mjs';
import {productAss,exportReaPack} from '../src/rea-pack.mjs';
import {renderClips} from '../src/media.mjs';
import {captureMediaTool} from '../src/compress.mjs';
import {sha256} from '../src/reference-structure.mjs';
import {formulaStoryboard} from '../../lib/lab/formula-storyboard.ts';
import {newProduction} from '../../lib/lab/production.ts';
const fixture=resolve('desktop/test/fixtures/rea-video');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const sample=async(n='V01')=>({breakdown:await json(join(fixture,n,'breakdown.json')),timeline:await json(join(fixture,n,'packaging/timeline.json'))});
const memory=()=>{const map=new Map();return {get:(k,v)=>map.has(k)?map.get(k):v,set:(k,v)=>map.set(k,v),map};};
async function temp(){await mkdir('outputs',{recursive:true});return mkdtemp(resolve('outputs/T-008-test-'));}
test('T-008: twelve real JSON fixtures import 116 shots, timed overlays and complete narrative/prompts; no classification',async()=>{
  let total=0;
  for(let i=1;i<=12;i++){
    const id='V'+String(i).padStart(2,'0'),{breakdown,timeline}=await sample(id);
    const data=domain.parseReaVideo(breakdown,{timeline,readBy:'manual'});
    const answers=domain.validateReviewAnswers(await json(join(fixture,id,'review_answers.json')),data.shots.map(s=>s.id));
    const reference=referenceVideoDraftSchema.parse({id,product:id,reaVideo:data,durationSec:data.durationSec,cuts:data.shots.length-1});
    assert.equal(reference.reaVideo.version,2);total+=data.shots.length;assert.equal(data.readStatus,'complete',id);
    assert.ok(data.overlays.length>=1,id);assert.ok(data.overlays.every(o=>o.toSec>o.fromSec));
    assert.equal(data.narrative.length,data.shots.length);assert.equal(data.remakePrompts.length,data.shots.length);assert.equal(answers.shots.length,data.shots.length);
    assert.doesNotMatch(JSON.stringify(data),/"(?:made~|label_probs|material|verdict|ai_video|image_source)"/);
  }
  assert.equal(total,116);
});
test('T-008: OCR discarded stays in metadata; unknown audio remains null; failed review preserves measurements',async()=>{
  const {breakdown,timeline}=await sample();breakdown.audio={};for(const s of breakdown.shots){s.narrative=null;s.review=null;s.vlm=null;s.replication=null;}
  const r=domain.parseReaVideo(breakdown,{timeline});assert.equal(r.audio.bpm,null);assert.equal(r.audio.hasVoice,null);assert.equal(r.readStatus,'waiting');assert.equal(r.readBy,null);
  assert.ok(r.overlays.length);assert.ok(r.metadata.filteredOcr.length);assert.ok(r.metadata.filteredOcr.every(o=>o.text.trim().length<3||o.confidence<.8));
});
test('T-008: new formula proposal stays inside reference draft until explicit approval',async()=>{
  const versions=formulaVersions(),base=versions.find(f=>f.id==='do-not-show'&&f.storyboardVersion===2),refs=[];
  for(const id of ['V01','V04']){const {breakdown,timeline}=await sample(id);const reaVideo=domain.parseReaVideo(breakdown,{timeline,readBy:'manual'});refs.push(referenceVideoDraftSchema.parse({id,product:id,reaVideo,hookType:base.hookType}));}
  const proposals=proposeReaFormulas(refs,versions),p=proposals.find(p=>p.formula.id===base.id);assert.ok(p);assert.equal(p.formula.version,base.version+1);
  assert.equal(p.medianShots,(refs[0].reaVideo.shots.length+refs[1].reaVideo.shots.length)/2);assert.equal(p.medianCta,null);
  const records=[{id:'reference_video_draft_V01',kind:'reference_video_draft',data:{...refs[0],proposedFormula:p.formula}}];
  assert.deepEqual(workspaceFormulas(records),workspaceFormulas());
  assert.equal(proposeReaFormulas([refs[0],refs[0]],versions).length,0);
});
function fakeProcess(response,inspect){return(command,args,options)=>{
  inspect?.(command,args,options);const c=new EventEmitter();c.stdin=new PassThrough();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kill=()=>{};
  setImmediate(()=>{c.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(response)}}));c.emit('close',0);});return c;
};}
test('T-008: safe Codex image argv, JSON schema and credential stripping with injected fake process',async()=>{
  const images=[resolve('outputs/shot_001.jpg'),resolve('outputs/shot_002.jpg')],outputSchema=resolve('outputs/schema.json');
  await runCodexText({prompt:'Read images',executable:process.execPath,images,outputSchema,profile:'session_gateway',env:{OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret2',SESSION_GATEWAY_TOKEN:'fixture'},spawnProcess:fakeProcess({},(_exe,args,options)=>{
    assert.equal(options.shell,false);assert.equal(options.env.OPENAI_API_KEY,undefined);assert.equal(options.env.CODEX_API_KEY,undefined);assert.equal(options.env.SESSION_GATEWAY_TOKEN,'fixture');
    assert.equal(args[args.indexOf('-s')+1],'read-only');assert.ok(args.includes('--ephemeral'));assert.equal(args[args.indexOf('--output-schema')+1],outputSchema);
    assert.deepEqual(args.flatMap((x,i)=>x==='--image'?[args[i+1]]:[]),images);assert.ok(!args.some(x=>x.includes('model_provider')));
  })});
  const cap=await codexImageCapability('fixture',{run:async()=>({stdout:'--image IMAGE'})});assert.equal(cap.ready,false);assert.match(cap.error,/--output-schema/);
});
test('T-008: fake codex executable receives images and schema (no provider)',async()=>{
  const fixture=resolve('desktop/test/fixtures/codex.mjs');
  const out=JSON.parse(await runCodexText({prompt:'fixture',executable:fixture,images:[resolve('outputs/shot.jpg')],outputSchema:resolve('outputs/review-schema.json'),env:{...process.env,OPENAI_API_KEY:'not-a-key',CODEX_FIXTURE_MODE:'inspect'},spawnProcess:(exe,args,options)=>spawn(process.execPath,[exe,...args],options)}));
  const seen=JSON.parse(out.caption);assert.equal(seen.hasApiKey,false);assert.ok(seen.args.includes('--image'));assert.ok(seen.args.includes('--output-schema'));
});
test('T-008: malformed review never writes answers or calls apply; >20 images split contiguously',async()=>{
  const out=await temp();await mkdir(join(out,'shots'));const store=memory(),ids=Array.from({length:23},(_,i)=>'shot_'+String(i+1).padStart(3,'0'));
  for(const id of ids)await writeFile(join(out,'shots',id+'.jpg'),'fixture');
  let applied=0;const batches=[];
  const service=new ReaVideoService({store,root:out,domain,run:async(_exe,_args,{input})=>{if(input.operation==='review')return {result:{tasks:{instructions:'English descriptions',shots:ids.map(id=>({id}))}}};applied++;return {result:{}};},config:()=>({reaPython:process.execPath,reaVideo:out}),resolveCodex:async()=>process.execPath,capability:async()=>({ready:true}),codexRun:async()=>'{"shots":[]}'});
  await assert.rejects(service.readCodex(out,{breakdown:{shots:ids.map(id=>({id}))}}));assert.equal(applied,0);assert.ok(!(await readdir(out)).includes('review_answers.json'));
  service.codexRun=async({images,prompt})=>{const batch=ids.slice(batches.flat().length,batches.flat().length+images.length);batches.push(batch);return JSON.stringify({shots:batch.map(id=>({id,description:'Description',narrative:{role:'proof',point:'Point'},replication:{image_prompt:'Frame',video_prompt:'Motion',video_prompt_en:'Motion'}}))});};
  await service.readCodex(out,{breakdown:{shots:ids.map(id=>({id}))}});assert.deepEqual(batches.map(b=>b.length),[20,3]);assert.deepEqual(batches.flat(),ids);assert.equal(applied,1);
});
test('T-008: Gemini requires consent; private env file cleaned on success and error, secret absent from settings',async()=>{
  const out=await temp(),store=memory();const service=new ReaVideoService({store,root:out,domain,secret:{encrypt:async()=> 'encrypted',decrypt:async()=> 'fixture-key'}});
  const settings={reader:'gemini-api',model:'gemini-2.5-flash',python:process.execPath,checkout:out,geminiConfirmed:false,key:'fixture-key'};
  await assert.rejects(service.configure(settings),/xác nhận/);assert.equal(store.get('rea-key',null),null);
  await service.configure({...settings,geminiConfirmed:true});assert.doesNotMatch(JSON.stringify(service.settings()),/fixture-key|encrypted/);
  for(const fail of [false,true]){let seen;const promise=withGeminiEnv(out,'fixture-key','gemini-2.5-flash',async path=>{seen=path;assert.match(await readFile(path,'utf8'),/REA_VLM_API_KEY=fixture-key/);if(fail)throw Error('fixture failure');return 'ok';},{platform:'linux'});
    if(fail)await assert.rejects(promise,/fixture failure/);else assert.equal(await promise,'ok');await assert.rejects(stat(seen),{code:'ENOENT'});}
  assert.deepEqual((await readdir(out)).filter(n=>n.startsWith('.gemini-')),[]);
});
test('T-008: Codex/Gemini failure retains local measurements; manual import completes; no secret in call or receipt',async()=>{
  const base=await sample(),out=await temp(),store=memory(),calls=[];
  const raw=structuredClone(base.breakdown);for(const s of raw.shots){delete s.review;delete s.vlm;delete s.replication;delete s.narrative;}
  const source=join(out,'source.mp4');await writeFile(source,'fixture video');
  const service=new ReaVideoService({store,root:out,domain,config:()=>({reaPython:process.execPath,reaVideo:out}),
    secret:{encrypt:async()=> 'cipher',decrypt:async()=> 'hidden-fixture-key'},resolveCodex:async()=>{throw Error('missing');},envFile:(dir,key,model,fn)=>withGeminiEnv(dir,key,model,fn,{platform:'linux'}),
    run:async(exe,args,options)=>{calls.push({exe,args,input:options.input});if(options.input.envFile){assert.match(await readFile(options.input.envFile,'utf8'),/hidden-fixture-key/);throw Error('provider failed');}
      return {result:options.input.operation==='apply-review'?base:{breakdown:raw,timeline:base.timeline}};}});
  const checksum=sha256(Buffer.from('fixture video'));
  let r=await service.analyze(out,source,checksum);assert.equal(r.data.readStatus,'waiting');assert.equal(r.data.shots.length,10);assert.ok(r.data.overlays.length);
  store.set('rea-settings',{reader:'gemini-api',model:'gemini-2.5-flash',geminiConfirmed:false});store.set('rea-key','cipher');
  await service.analyze(out,source,checksum);assert.ok(!calls.some(c=>c.input.envFile));
  store.set('rea-settings',{reader:'gemini-api',model:'gemini-2.5-flash',geminiConfirmed:true});
  r=await service.analyze(out,source,checksum);assert.equal(r.data.readStatus,'waiting');assert.equal(r.data.audio.bpm,117.5);
  assert.doesNotMatch(JSON.stringify({calls,r,settings:service.settings()}),/hidden-fixture-key/);assert.deepEqual((await readdir(join(out,'rea-video'))).filter(p=>p.startsWith('.gemini-')),[]);
  const completed=await service.importReview(out,r.data,await readFile(join(fixture,'V01/review_answers.json'),'utf8'));assert.equal(completed.data.readStatus,'complete');assert.equal(completed.data.readBy,'manual');
  assert.equal(await readFile(source,'utf8'),'fixture video');
});
test('T-008: every proposed hook group generates valid T-007 storyboard with pinned source prompts',async()=>{
  for(const base of formulaVersions().filter(f=>f.storyboardVersion===2)){
    const refs=[];for(const id of ['V01','V07']){const {breakdown,timeline}=await sample(id);refs.push(referenceVideoDraftSchema.parse({id,product:id,hookType:base.hookType,integrationJobId:'fixture',reaVideo:domain.parseReaVideo(breakdown,{timeline,readBy:'manual'})}));}
    const p=proposeReaFormulas(refs,formulaVersions()).find(p=>p.formula.id===base.id);assert.ok(p);
    const draft=formulaStoryboard({name:'Product'},newProduction('Project','product',1),p.formula,{ctaKeyword:'LIGHT',situation:'A lamp is off',packaging:{brandName:'Fixture',boxText:'Fixture lamp'}});
    assert.ok(draft.rows.every(r=>r.sourceReference?.prompt));assert.doesNotMatch(JSON.stringify(draft),/\bAI\b/);
  }
});
test('T-008: ASS preserves accepted event timing/style/tags, replaces text and rejects injection',async()=>{
  const {breakdown,timeline}=await sample(),data=domain.parseReaVideo(breakdown,{timeline,readBy:'manual'}),template=await readFile(join(fixture,'V01/packaging/overlays.ass'),'utf8');
  const copies=data.overlays.map(o=>({id:o.id,text:'OUR PRODUCT'})),ass=productAss(template,data,copies);
  assert.match(ass,/0:00:04.50,0:00:07.10,label_4,,0,0,0,,\{\\pos\(330,312\)\\fscx60/);
  assert.doesNotMatch(ass,/CARGUY|numm|加儿/);assert.match(ass,/OUR PRODUCT/);
  assert.throws(()=>productAss(template,data,[{id:data.overlays[0].id,text:'{\\pos(0,0)}bad'}]));
});
test('T-008: manual source pack includes generation units, first/last frames, own overlays; keeps original output',async()=>{
  const {breakdown,timeline}=await sample(),data=domain.parseReaVideo(breakdown,{timeline,readBy:'manual'}),out=await temp();
  const source=join(out,'rea-video');await mkdir(join(source,'shots'),{recursive:true});await mkdir(join(source,'packaging'));
  const original=await readFile(join(fixture,'V01/packaging/overlays.ass'));await writeFile(join(source,'packaging/overlays.ass'),original);
  for(const s of data.shots)for(const f of [s.firstFrame,s.lastFrame])await writeFile(join(source,f),Buffer.from([255,216,255]));
  const r=await exportReaPack(out,data,{productName:'Our lamp',copies:data.overlays.map(o=>({id:o.id,text:'OUR LAMP'}))});
  assert.equal(r.units,2);const files=await readdir(r.path);assert.equal(files.filter(f=>f.endsWith('.jpg')).length,20);assert.ok(files.includes('UNIT-01.txt'));assert.ok(files.includes('overlays.ass'));
  const manifest=await json(join(r.path,'timeline.json'));assert.ok(manifest.overlays.every(o=>o.text==='OUR LAMP'));assert.equal(manifest.units.flatMap(u=>u.shots).length,10);assert.ok(manifest.renderArgs.includes('ass=overlays.ass'));
  assert.doesNotMatch(await readFile(join(r.path,'UNIT-01.txt'),'utf8'),/\bAI\b/);assert.deepEqual(await readFile(join(source,'packaging/overlays.ass')),original);
});
test('T-008: real FFmpeg burns ASS on synthetic media, produces a decodable MP4',async()=>{
  const out=await temp(),input=join(out,'input.mp4'),output=join(out,'output.mp4');
  await captureMediaTool('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',input]);
  const ass='[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Main,Arial,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,Main,,0,0,0,,OUR PRODUCT\n';
  const report=await renderClips([{path:input,duration:1,audio:false}],'9:16',output,{ass});assert.equal(report.fullDecode,true);assert.ok(report.metadata.duration>0);
  const {stderr}=await captureMediaTool('ffmpeg',['-v','info','-i',output,'-vf','signalstats,metadata=print','-frames:v','1','-f','null','-']);
  const average=Number(stderr.match(/lavfi.signalstats.YAVG=(\S+)/)?.[1]);assert.ok(average>16.1,'White text must change the black source frame');
  assert.ok((await stat(input)).size>0);assert.equal(await readFile(join(out,'overlays.ass'),'utf8'),ass);
});
test('T-008: integration receipt survives restart; template render rejects wrong duration and project',async()=>{
  const out=await temp(),store=memory(),{breakdown,timeline}=await sample();store.jobs=()=>[];
  const jobId='fixture_job',dir=join(out,'integrations',jobId);await mkdir(join(dir,'rea-video/shots'),{recursive:true});await mkdir(join(dir,'rea-video/packaging'));
  const data=domain.parseReaVideo(breakdown,{timeline,readBy:'manual'});
  for(const s of data.shots)for(const f of [s.firstFrame,s.lastFrame])await writeFile(join(dir,'rea-video',f),Buffer.from([255,216,255]));
  await writeFile(join(dir,'rea-video/packaging/overlays.ass'),await readFile(join(fixture,'V01/packaging/overlays.ass')));
  const source=join(dir,'source.mp4'),bytes=Buffer.from('fixture source');await writeFile(source,bytes);
  const i=new Integrations(store,out);i.rea={domain,available:async()=>true,analyze:async()=>{const path=join(dir,'rea-result.json'),r=Buffer.from(JSON.stringify(data));await writeFile(path,r);return {data,path,reaSha256:sha256(r),elapsedMs:10};}};
  const r=await i.structureResult(dir,source,sha256(bytes));store.set('integration-jobs',[{id:jobId,kind:'reference-structure',state:'done',projectId:'fixture_product',request:{name:'fixture.mp4'},...r}]);
  const restarted=new Integrations(store,out);restarted.rea={domain};const result=await restarted.structure({id:jobId,projectId:'fixture_product'});assert.equal(result.reaVideo.shots.length,10);assert.equal(result.sourceSha256,sha256(bytes));
  const input={id:jobId,projectId:'fixture_product',copies:data.overlays.map(o=>({id:o.id,text:'PRODUCT'}))};assert.match(await restarted.reaAss(input,data.durationSec),/PRODUCT/);
  await assert.rejects(restarted.reaAss(input,8),/thời lượng/);await assert.rejects(restarted.reaAss({...input,projectId:'wrong'},data.durationSec));
  await writeFile(r.reaPath,'{}');await assert.rejects(restarted.structure({id:jobId,projectId:'fixture_product'}),/checksum/);
});
