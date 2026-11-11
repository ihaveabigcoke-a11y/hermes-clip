import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runMission,missionSchema} from '../scripts/run-codex.mjs';
import {parseCodexExchange} from '../lib/lab/codex-exchange.ts';

const config=d=>({python:'python',reach:'agent-reach',montage:d});
test('portable text filters credentials and local paths and removes URL query credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-portable-'));
 const factory=(store,root)=>({saveConfig(){},async research(){
  const path=join(root,'research.json');await writeFile(path,'{}');
  return {id:'safe_job',state:'done',path,result:{items:[{url:'https://example.org/article?token=hidden-query#hidden-fragment',title:'API key=hidden-title',text:'Saved at C:\\private\\hidden-file'}]}};
 }});
 try{
  await runMission({mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'password=hidden-search'}]},config:config(dir),stateDir:dir,createIntegrations:factory});
  const text=await readFile(join(dir,'codex-exchange.json'),'utf8');
  const exchange=parseCodexExchange(text);
  assert.equal(exchange.steps[0].query,'[redacted]');
  assert.equal(exchange.steps[0].sources[0].url,'https://example.org/article');
  assert.equal(exchange.steps[0].sources[0].title,'[redacted]');
  assert.equal(exchange.steps[0].sources[0].excerpt,'[redacted]');
  assert.equal(/hidden-|private/.test(text),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('portable metadata rejects underscore credentials and decoded sensitive URL paths',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-portable-paths-'));
 const githubToken='ghp_'+'a'.repeat(40);
 const factory=(store,root)=>({saveConfig(){},async research(){
  const path=join(root,'research.json');await writeFile(path,'{}');
  return {id:'safe_job',state:'done',path,result:{items:[
   {url:'https://example.org/article',title:'access_token=hidden-access',text:'client_secret=hidden-client'},
   {url:'https://example.org/'+githubToken},
   {url:'https://'+githubToken+'.example.org/article'},
   {url:'https://example.org/C%3A/Users/Alice/document.txt'},
   {url:'https://example.org/client%5Fsecret/hidden-path'},
   {url:'https://example.org/home/Alice/document.txt'}
  ]}};
 }});
 try{
  await runMission({mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'access_token=hidden-query'}]},config:config(dir),stateDir:dir,createIntegrations:factory});
  const text=await readFile(join(dir,'codex-exchange.json'),'utf8');
  const exchange=parseCodexExchange(text);
  assert.equal(exchange.steps[0].query,'[redacted]');
  assert.equal(exchange.steps[0].sources.length,1);
  assert.equal(exchange.steps[0].sources[0].url,'https://example.org/article');
  assert.equal(exchange.steps[0].sources[0].title,'[redacted]');
  assert.equal(exchange.steps[0].sources[0].excerpt,'[redacted]');
  assert.equal(/hidden-|Alice|ghp_|access_token|client_secret/.test(text),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('portable text redacts URL userinfo in queries, titles and excerpts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-portable-userinfo-'));
 const factory=(store,root)=>({saveConfig(){},async research(){
  const path=join(root,'research.json');await writeFile(path,'{}');
  return {id:'safe_job',state:'done',path,result:{items:[{
   url:'https://example.org/article',
   title:'Read HTTPS://bob@example.org/article',
   text:'See https://carol:p%40ssword@example.org/article'
  }]}};
 }});
 try{
  await runMission({mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'Find https://alice:hunter2@example.org/article'}]},config:config(dir),stateDir:dir,createIntegrations:factory});
  const text=await readFile(join(dir,'codex-exchange.json'),'utf8');
  const exchange=parseCodexExchange(text);
  assert.equal(exchange.steps[0].query,'[redacted]');
  assert.equal(exchange.steps[0].sources.length,1);
  assert.equal(exchange.steps[0].sources[0].url,'https://example.org/article');
  assert.equal(exchange.steps[0].sources[0].title,'[redacted]');
  assert.equal(exchange.steps[0].sources[0].excerpt,'[redacted]');
  assert.equal(/alice|hunter2|bob|carol|p%40ssword/.test(text),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('rejects duplicate IDs before a step can overwrite a receipt',()=>assert.equal(missionSchema.safeParse({id:'m',projectId:'p',steps:[{id:'a',type:'doctor'},{id:'a',type:'doctor'}]}).success,false));
test('runner resumes completed research without a second request and preserves its source report',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-runner-'));let calls=0;
 const factory=(store,root)=>({saveConfig(){},job(id){return store.get(id);},async research(payload){calls++;const path=join(root,'result.json');await writeFile(path,JSON.stringify(payload));const j={id:'job',state:'done',path,result:{items:[{url:'https://example.com'}]}};store.set('job',j);return j;}});
 try{const args={mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'test query'}]},config:config(dir),stateDir:dir,createIntegrations:factory};const first=await runMission(args),second=await runMission(args);assert.equal(first.steps[0].reused,undefined);assert.equal(second.steps[0].reused,true);assert.equal(calls,1);assert.equal(JSON.parse(await readFile(join(dir,'run-report.json'),'utf8')).status,'completed');await runMission({...args,refresh:true});assert.equal(calls,2);}finally{await rm(dir,{recursive:true,force:true});}
});
test('failure writes an honest report, releases lock, and never records a successful step',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-runner-'));try{await assert.rejects(()=>runMission({mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'test query'}]},config:config(dir),stateDir:dir,createIntegrations:()=>({saveConfig(){},async research(){throw Error('upstream failed');}})}),/upstream failed/);assert.equal(JSON.parse(await readFile(join(dir,'run-error.json'),'utf8')).status,'failed');await assert.rejects(()=>readFile(join(dir,'runner.lock')),/ENOENT/);}finally{await rm(dir,{recursive:true,force:true});}
});

test('modified or missing research artifacts are rerun; portable exchange excludes paths and raw tool fields',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-integrity-'));let calls=0;
 const factory=(store,root)=>({saveConfig(){},job(id){return store.get(id);},async research(payload){calls++;const path=join(root,'result_'+calls+'.json');await writeFile(path,JSON.stringify(payload));const job={id:'job_'+calls,state:'done',path,result:{localPath:'/private/secret',apiKey:'never-export',items:[{url:'https://example.org',title:'Finding',text:'Unreviewed source',raw:{credentials:'secret'}},{url:'file:///private',title:'Bad'}]}};store.set(job.id,job);return job;}});
 try{
  const args={mission:{id:'m',projectId:'p',steps:[{id:'s',type:'research',channel:'web',query:'test query'}]},config:config(dir),stateDir:dir,createIntegrations:factory};
  const first=await runMission(args);await writeFile(first.steps[0].path,'changed');
  const second=await runMission(args);assert.equal(calls,2);assert.equal(second.steps[0].reused,undefined);assert.equal(await readFile(first.steps[0].path,'utf8'),'changed');
  const text=await readFile(join(dir,'codex-exchange.json'),'utf8'),exchange=parseCodexExchange(text);
  assert.equal(exchange.steps[0].sources.length,1);assert.equal(exchange.steps[0].artifactSha256.length,64);
  assert.equal(/secret|private|localPath|apiKey|credentials/.test(text),false);
  await rm(second.steps[0].path);await runMission(args);assert.equal(calls,3);
  await writeFile(join(dir,'run-error.json'),'old failure');await runMission(args);assert.equal(calls,3);await assert.rejects(()=>readFile(join(dir,'run-error.json')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('reference resume checks extracted frame contents before reuse',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-frame-'));let calls=0;let firstFramePath;
 const factory=(store,root)=>({saveConfig(){},job(id){return store.get(id);},async frames(id){return [{timestamp:0,bytes:await readFile(store.get(id).framePath)}];},async analyze(){calls++;const path=join(root,'analysis_'+calls+'.json'),framePath=join(root,'frame_'+calls+'.jpg');await writeFile(path,'{"technical":true}');await writeFile(framePath,'original frame');if(calls===1)firstFramePath=framePath;const job={id:'ref_'+calls,state:'done',path,framePath,frames:[{}],result:{source:{width:720,height:1280,duration:12}}};store.set(job.id,job);return job;}});
 try{
  const source=join(dir,'input.mp4');await writeFile(source,'fixture bytes');const args={mission:{id:'m',projectId:'p',steps:[{id:'s',type:'reference',path:source}]},config:config(dir),stateDir:dir,createIntegrations:factory};
  await runMission(args);await runMission(args);assert.equal(calls,1);
  await writeFile(firstFramePath,'modified frame');await runMission(args);assert.equal(calls,2);
  const exchange=parseCodexExchange(await readFile(join(dir,'codex-exchange.json'),'utf8'));assert.equal(exchange.steps[0].frameCount,1);assert.equal(exchange.steps[0].media.duration,12);
 }finally{await rm(dir,{recursive:true,force:true});}
});
