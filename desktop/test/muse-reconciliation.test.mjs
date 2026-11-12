import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseChat} from '../src/muse-chat.mjs';
import {CodexTextService} from '../src/codex-cli.mjs';
import * as exchange from '../../lib/lab/codex-exchange.ts';
import {researchResult,contentResult} from '../../tests/fixtures/text-exchange.mjs';
import {importModule} from './helpers/local-server.mjs';
const {ResearchRunner}=await importModule('desktop/src/research-runner.mjs');

test('T-002b A: explicit skip persists run/chat receipts, unblocks only their scope, never sends Muse',async t=>{
  const root=await mkdtemp(join(tmpdir(),'hermes-reconcile-')),path=join(root,'worker.sqlite');
  let store=new Store(path),codexCalls=0,networkCalls=0;
  t.after(async()=>{store.close();await rm(root,{recursive:true,force:true});});
  t.mock.method(globalThis,'fetch',async()=>{networkCalls++;throw Error('No external or local HTTP needed');});
  const worker=new Worker(store,root,{},{}),chat=new MuseChat(worker),runner=new ResearchRunner({worker,chat,local:{}});
  store.set('codex_text_enabled',true);store.set('generation_batch',{id:'quota',submittedByProfile:{one:2}});
  store.set('research_runs',[{id:'runX',batchId:'batchX',profileId:'one',state:'needs_attention',requestIds:['chatX','doneX','foreign'],error:'Unknown delivery'},
    {id:'runY',batchId:'batchY',state:'needs_attention',requestIds:[]}]);
  chat.save({requestId:'chatX',projectId:'batchX',profileId:'one',state:'needs_attention',response:'Unverified response',providerUrl:'https://muse.invalid/old'});
  chat.save({requestId:'doneX',projectId:'batchX',profileId:'one',state:'done',response:'Saved response'});
  chat.save({requestId:'foreign',projectId:'batchY',profileId:'one',state:'needs_attention'});
  chat.save({requestId:'standalone',projectId:'task_content_product',profileId:'one',state:'unknown'});
  const service=new CodexTextService({store,root,exchange,resolveExecutable:async()=> 'fake-codex',run:async()=>{codexCalls++;return JSON.stringify(researchResult);}});
  await assert.rejects(service.execute({kind:'research',context:{taskScope:'batchX'}}),/Cần đối soát/);
  runner.skipReconciliation({id:'runX'}); // Muse remains paused throughout.
  assert.equal(worker.status().musePaused,true);
  await service.execute({kind:'research',context:{taskScope:'batchX'}});assert.equal(codexCalls,1);
  await assert.rejects(service.execute({kind:'research',context:{taskScope:'batchY'}}),/Cần đối soát/);
  await assert.rejects(service.execute({kind:'content',context:{taskScope:'task_content_product'}}),/Cần đối soát/);
  chat.skipReconciliation({requestId:'standalone'});
  service.run=async()=>{codexCalls++;return JSON.stringify(contentResult);};
  await service.execute({kind:'content',context:{taskScope:'task_content_product'}});assert.equal(codexCalls,2);
  const skipped=chat.get('chatX');runner.skipReconciliation({id:'runX'});assert.deepEqual(chat.get('chatX'),skipped);
  assert.throws(()=>chat.skipReconciliation({requestId:'doneX'}),/kết quả chưa rõ/);
  store.close();store=new Store(path);
  const reopenedWorker=new Worker(store,root,{},{}),reopenedChat=new MuseChat(reopenedWorker),reopened=new ResearchRunner({worker:reopenedWorker,chat:reopenedChat,local:{}});
  assert.equal(reopened.rows().find(row=>row.id==='runX').reconciled,true);
  assert.equal(reopened.rows().find(row=>row.id==='runX').state,'needs_attention');
  assert.equal(reopened.rows().find(row=>row.id==='runY').reconciled,undefined);
  assert.deepEqual(reopenedChat.get('chatX'),skipped);assert.equal(skipped.reconciliation,'skipped');assert.ok(skipped.reconciledAt);
  assert.equal(skipped.response,'Unverified response');assert.equal(reopenedChat.get('foreign').reconciled,undefined);
  assert.equal(reopenedChat.get('standalone').reconciled,true);assert.equal(reopenedChat.get('doneX').response,'Saved response');
  await reopenedWorker.setMusePaused({paused:false});
  assert.throws(()=>reopened.resume({id:'runX'}),/app sẽ không gửi lại/);
  await assert.rejects(reopenedChat.recover({requestId:'chatX'}),/app sẽ không gửi lại/);
  reopened.boot();assert.equal(reopened.running,null);
  assert.deepEqual(store.batch(),{id:'quota',perProfileLimit:null,submittedByProfile:{one:2}});assert.equal(networkCalls,0);
});

test('T-002b A: skipping a run is atomic and cannot acknowledge a live chat/run',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const worker=new Worker(store,'outputs/T-002b-reconcile',{},{}),chat=new MuseChat(worker),runner=new ResearchRunner({worker,chat,local:{}});
  store.set('research_runs',[{id:'run',batchId:'batch',state:'needs_attention',requestIds:['one','two']}]);
  for(const requestId of ['one','two'])chat.save({requestId,projectId:'batch',profileId:requestId,state:'needs_attention'});
  worker.chatting.add('two');
  assert.throws(()=>runner.skipReconciliation({id:'run'}),/đang chạy/);
  assert.equal(chat.get('one').reconciled,undefined);assert.equal(runner.rows()[0].reconciled,undefined);
  runner.running={id:'run'};assert.throws(()=>runner.skipReconciliation({id:'run'}),/đang chạy/);
});
