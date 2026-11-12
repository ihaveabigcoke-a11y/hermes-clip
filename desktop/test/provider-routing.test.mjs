import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProvider, textProviderReceipts} from '../src/provider-routing.mjs';
import {museConnectionSummary} from '../../lib/lab/muse-connection.ts';
const profile={id:'one',enabled:true,health:'ready',session:'signed_in',quota:{state:'available',weeklyRemainingPercent:50,additionalTokens:0}};
const status={musePaused:false,generationReady:true,profiles:[profile],batch:{submittedByProfile:{one:0}}};
const cases=[
  ['ready',{},true], ['paused',{musePaused:true},false], ['missing switch',{musePaused:undefined},false],
  ['adapter disabled',{generationReady:false},false], ['no profile',{profiles:[]},false],
  ['profile disabled',{profiles:[{...profile,enabled:false}]},false],
  ['not signed in',{profiles:[{...profile,session:'unknown'}]},false],
  ['expired session',{profiles:[{...profile,session:'expired'}]},false],
  ['session error',{profiles:[{...profile,health:'connection_error'}]},false],
  ['quota unknown',{profiles:[{...profile,quota:null}]},false],
  ['quota error',{profiles:[{...profile,quota:{state:'error'}}]},false],
  ['quota exhausted',{profiles:[{...profile,quota:{state:'exhausted'}}]},false],
  ['zero weekly and no tokens',{profiles:[{...profile,quota:{state:'available',weeklyRemainingPercent:0,additionalTokens:null}}]},false],
  ['extra tokens',{profiles:[{...profile,quota:{state:'available',weeklyRemainingPercent:0,additionalTokens:10}}]},true],
  ['available with null percent follows legacy ready',{profiles:[{...profile,quota:{state:'available',weeklyRemainingPercent:null}}]},true],
  ['batch exhausted',{batch:{submittedByProfile:{one:3}}},false],
  ['second ready profile',{profiles:[{...profile,enabled:false},{...profile,id:'two'}]},true],
];
for(const [name,patch,ready] of cases)test('routing table: '+name,()=>{
  for(const kind of ['research','content','landing','media'])for(const codexEnabled of [false,true]){
    const input={kind,status:{...status,...patch},codexEnabled};const before=JSON.stringify(input);
    const result=resolveProvider(input);
    assert.equal(result.ready,ready);assert.equal(result.provider,ready?'muse':kind==='media'?'manual':codexEnabled?'codex':'import:json');
    assert.equal(result.blocked,false);assert.equal(JSON.stringify(input),before);
    assert.equal(museConnectionSummary(input.status,true).state==='ready',result.ready);
  }
});
test('readiness fails closed when unavailable, missing status or status read fails',()=>{
  for(const input of [{available:false},{error:'offline'},{status:null}])assert.equal(resolveProvider({kind:'media',status,...input}).provider,'manual');
});
test('scene and project manual choices override default, auto can return to Muse',()=>{
  assert.equal(resolveProvider({kind:'media',status,selection:'manual'}).provider,'manual');
  assert.equal(resolveProvider({kind:'media',status,selection:'auto'}).provider,'muse');
  const locked=resolveProvider({kind:'media',status:{...status,musePaused:true},selection:'muse'});
  assert.equal(locked.provider,'muse');assert.equal(locked.blocked,true);
  for(const selection of ['grok-cli','fal'])assert.equal(resolveProvider({kind:'media',status,selection}).blocked,true);
});
test('uncertain Muse receipts never fall through to another provider, even with manual selection or newer finished receipt',()=>{
  for(const state of ['unknown','needs_attention'])for(const kind of ['research','content','media'])for(const selection of [undefined,'manual','codex','import:Claude']){
    const result=resolveProvider({kind,status:{...status,musePaused:true},selection,codexEnabled:true,
      previous:[{provider:'muse',state},{provider:'muse',state:'done'}]});
    assert.equal(result.blocked,true);assert.equal(result.reason,'Cần đối soát');
  }
  assert.equal(resolveProvider({kind:'media',previous:[{provider:'muse',state:'failed'}]}).blocked,false);
  assert.equal(resolveProvider({kind:'media',previous:[{provider:'muse',state:'unknown',reconciled:true}]}).blocked,false);
});
test('running Muse task keeps ownership while switch or readiness changes',()=>{
  for(const state of ['preflight','prepared','submitting','waiting','downloading','validating','running']){
    const result=resolveProvider({kind:'media',status:{...status,musePaused:true},previous:[{provider:'muse',state}]});
    assert.equal(result.blocked,true);assert.equal(result.reason,'Tác vụ Muse đang chạy');
  }
});

test('T-002b A: text receipts share exact scope filtering and preserve provider/reconciled flags',()=>{
  const runs=[{batchId:'X',state:'needs_attention'},{batchId:'Y',state:'unknown',reconciled:true},{taskScope:'Y',state:'needs_attention',provider:'codex'}];
  const chats=[{projectId:'task_research_Y',state:'unknown',reconciled:true},{projectId:'X',state:'needs_attention'}];
  const previous=textProviderReceipts({kind:'research',scope:'Y',runs,chats});
  assert.equal(previous.length,3);assert.equal(resolveProvider({kind:'research',previous}).blocked,false);
  assert.equal(resolveProvider({kind:'research',previous:textProviderReceipts({kind:'research',scope:'X',runs,chats})}).reason,'Cần đối soát');
  assert.deepEqual(textProviderReceipts({kind:'research',runs,chats}),[]);
  assert.deepEqual(textProviderReceipts({kind:'content',scope:'Y',runs,chats}),[]);
});
