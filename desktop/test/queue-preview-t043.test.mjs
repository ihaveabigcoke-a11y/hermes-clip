import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {UiPreferences} from '../src/ui-preferences.mjs';
import {videoProfiles} from '../src/video-profiles.mjs';
const request=n=>({projectId:'p',productId:'p',sceneId:'s'+n,mediaType:'video',references:[]});

test('T-043 job numbers survive filtering, updates and retries without rewriting receipts',()=>{
 const store=new Store(':memory:');try{
  const a=store.enqueue(request(1),'a').job,b=store.enqueue(request(2),'b').job;
  const numbers=()=>Object.fromEntries(store.jobs({withQueueNumber:true}).map(j=>[j.id,j.queueNumber]));
  const before=numbers();assert.equal(before[a.id],1);assert.equal(before[b.id],2);
  store.put({...a,state:'failed'});const receipt=store.job(a.id);store.retry(a.id);
  assert.equal(numbers()[a.id],1);assert.equal(numbers()[b.id],2);assert.equal(Object.values(numbers()).length,3);
  assert.deepEqual(store.job(a.id),receipt);assert.equal('queueNumber' in store.job(a.id),false);
 }finally{store.close();}
});

test('T-043 stopped Chi stays enabled; preview and fresh dispatch both choose the available profile',async()=>{
 const store=new Store(':memory:');try{
  const profiles=['Chi','Cho','Duc'].map(name=>({id:name,name,enabled:true,health:'ready',quota:{state:'available'},vpnEnabled:true,proxy:{server:''}}));
  store.set('profiles',profiles);store.set('muse_paused',false);
  const worker=new Worker(store,'.',{},{},()=>8*1024**3);worker.diskStatus=()=>({blocked:false});
  worker.night.begin();worker.night.outcome('refusal',Object.assign(Error('stop'),{code:'MUSE_REFUSED'}),'Duc');worker.night.outcome('chi_refusal',Object.assign(Error('stop'),{code:'MUSE_REFUSED'}),'Chi');
  const status=worker.profiles();assert.deepEqual(videoProfiles(status).map(p=>p.name),['Cho']);
  const job=store.enqueue(request(1),'fresh').job;let chosen;
  worker.run=async(id,profileId)=>{chosen=profileId;};worker.paused=false;worker.budget=1;worker.maxConcurrent=3;worker.approvedIds=[job.id];worker.tick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(chosen,'Cho');assert.deepEqual(store.get('profiles'),profiles);assert.equal(store.get('muse_paused'),false);
 }finally{store.close();}
});

test('T-043 measured duration persists through preferences, rejects zero/unknown, does not touch switches',()=>{
 const store=new Store(':memory:');try{
  const preferences=new UiPreferences(store),value={measuredAt:100000,elapsedMs:85344,hookCount:3,sceneCount:5,profileIds:['Cho','Duc','Chim']};
  assert.equal(preferences.load({key:'videoMeasurement'}),null);
  preferences.save({key:'videoMeasurement',value});assert.deepEqual(new UiPreferences(store).load({key:'videoMeasurement'}),value);
  for(const elapsedMs of [null,0,NaN,-1])assert.throws(()=>preferences.save({key:'videoMeasurement',value:{...value,elapsedMs}}));
  assert.deepEqual(preferences.load({key:'videoMeasurement'}),value);assert.equal(store.get('profiles'),null);assert.equal(store.get('muse_paused'),null);
 }finally{store.close();}
});
