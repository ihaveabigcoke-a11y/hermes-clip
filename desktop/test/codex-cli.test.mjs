import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {runCodexText,resolveCodexExecutable,CodexTextService} from '../src/codex-cli.mjs';
import * as exchange from '../../lib/lab/codex-exchange.ts';
import {researchResult,landingResult} from '../../tests/fixtures/text-exchange.mjs';
const fixture=resolve('desktop/test/fixtures/codex.mjs');
const fakeFileSpawn=(command,args,options)=>{assert.equal(command,fixture);assert.equal(options.shell,false);assert.equal(args[0],'exec');return spawn(process.execPath,[fixture,...args],options);};
const runFile=(mode,options={})=>runCodexText({prompt:'Fixture prompt',executable:fixture,cwd:process.cwd(),spawnProcess:fakeFileSpawn,env:{...process.env,CODEX_FIXTURE_MODE:mode},...options});

test('T-003: fake codex file receives exec/stdin without shell, API keys removed, last message selected',async()=>{
  const prompt='literal `command` $(command) & | ; " Unicode tiếng Việt';
  const output=JSON.parse(await runFile('inspect',{prompt,env:{...process.env,CODEX_FIXTURE_MODE:'inspect',OPENAI_API_KEY:'fixture',CODEX_API_KEY:'fixture'}}));
  const inspected=JSON.parse(output.caption);
  assert.equal(inspected.prompt,prompt);assert.equal(inspected.hasApiKey,false);
  assert.deepEqual(inspected.args,['exec','--json','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-c','model_provider="openai"','-c','forced_login_method="chatgpt"','-']);
});
test('T-003: fake codex file timeout terminates the invocation',async()=>{
  await assert.rejects(runFile('timeout',{timeoutMs:250}),/hết thời gian/);
});
test('T-003: fake codex file overflow, malformed JSON and failed turn never produce an import',async()=>{
  await assert.rejects(runFile('oversize'),/vượt giới hạn/);
  await assert.rejects(runFile('malformed'),/stream JSON/);
  await assert.rejects(runFile('failed'),/chưa hoàn tất/);
});
test('T-003: missing CLI provides guidance without invoking a shell',async()=>{
  await assert.rejects(resolveCodexExecutable('',{PATH:''}),/Không tìm thấy.*Cài Codex CLI/);
  await assert.rejects(resolveCodexExecutable('codex.cmd'),/tuyệt đối/);
});
test('T-003: timeout and byte cap also tested with injected process events',async()=>{
  let kills=0;
  const spawnProcess=()=>{
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{kills++;};return child;
  };
  await assert.rejects(runCodexText({prompt:'fixture',executable:fixture,spawnProcess,timeoutMs:10}),/hết thời gian/);
  assert.equal(kills,1);
  await assert.rejects(runCodexText({prompt:'fixture',executable:fixture,spawnProcess:()=>{
    const child=spawnProcess();setImmediate(()=>child.stderr.write('x'.repeat(1025)));return child;
  },maxOutputBytes:1024}),/vượt giới hạn/);
  assert.equal(kills,2);
});
test('T-003: injected NDJSON handles chunk boundaries and selects the final agent message',async()=>{
  const final=JSON.stringify({name:'Fixture',hook:'Tiếng Việt',script:'Script',caption:''});
  const result=await runCodexText({prompt:'literal $(not a shell)',executable:fixture,spawnProcess:(_command,args,options)=>{
    assert.equal(args[0],'exec');assert.equal(options.shell,false);
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    let input='';child.stdin.on('data',chunk=>{input+=chunk;});
    setImmediate(()=>{
      assert.equal(input,'literal $(not a shell)');
      const output=Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Earlier'}})+'\n'+JSON.stringify({type:'item.completed',item:{type:'agent_message',text:final}}));
      for(let i=0;i<output.length;i+=7)child.stdout.write(output.subarray(i,i+7));
      child.emit('close',0);
    });return child;
  }});
  assert.equal(result,final);
});
test('T-003: service defaults off, validates all task kinds, rejects bad output and serializes runs',async()=>{
  await mkdir('outputs',{recursive:true});const root=await mkdtemp(resolve('outputs/T-003-service-'));
  const values=new Map(),store={get:(key,fallback)=>values.has(key)?values.get(key):fallback,set:(key,value)=>values.set(key,value)};
  let calls=0,release;
  const service=new CodexTextService({store,root,exchange,resolveExecutable:async()=>fixture,run:async()=>{calls++;return new Promise(yes=>{release=yes;});}});
  try {
    assert.equal(service.status().enabled,false);
    await assert.rejects(service.execute({kind:'content',context:{}}),/đang tắt/);assert.equal(calls,0);
    service.configure({enabled:true,executable:''});
    const pending=service.execute({kind:'content',context:{product:{name:'Fixture'}}});
    while(!release)await new Promise(yes=>setImmediate(yes));
    await assert.rejects(service.execute({kind:'landing',context:{}}),/đang chạy/);
    assert.throws(()=>service.configure({enabled:false,executable:''}),/Chờ lượt/);
    release('{"name":"Concept","hook":"Hook","script":"Script","caption":""}');
    assert.equal((await pending).source,'import:Codex CLI');assert.equal(calls,1);
    service.run=async()=>'{"headline":"Wrong kind"}';
    await assert.rejects(service.execute({kind:'content',context:{}}),/name/);assert.equal(service.status().busy,false);
    for(const [kind,result] of [['research',researchResult],['landing',landingResult]]){
      service.run=async()=>JSON.stringify(result);
      const saved=await service.execute({kind,context:{productId:'fixture'}});
      assert.equal(saved.text,JSON.stringify(result));
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
