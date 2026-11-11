import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesQueueFilter, resolvedQueueFailures, queueAction, queueTone, groupQueueJobs} from '../lib/lab/queue-view.ts';
import {sceneCategory, sceneKey, matchesMediaPeriod} from '../lib/lab/media-organization.ts';
import {preferredMedia, mediaReview, mediaInstructions} from '../lib/lab/media-catalog.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('generated tokens match documented color values',()=>{const design=read('DESIGN.md'),css=read('app/lab-tokens.css');for(const match of design.matchAll(/^  ([\w-]+): ['"](#[a-fA-F0-9]{6})['"]$/gm))assert.ok(css.includes(`--lab-${match[1]}: ${match[2]};`));});
test('private user scope and compare-and-swap exist on every record write',()=>{const s=read('lib/lab/server.ts');assert.ok(s.includes('getChatGPTUser()'));assert.ok(s.includes('owner_id=?'));assert.ok(s.includes('lab_records.revision=?'));});
test('editing content clears approval server-side; approval checks proof and media',()=>{const s=read('app/api/lab/route.ts');assert.match(s,/b\.action\s*===\s*['"]approve['"]/);assert.ok(s.includes('productGate(p.data)'));assert.match(s,/if\s*\(!d\.mediaUrl\)/);assert.match(s,/d\.approvedAt\s*=\s*null/);});
test('prepared jobs cannot silently call an unknown paid API',()=>{const s=read('app/api/jobs/route.ts');assert.ok(s.includes('awaiting_provider'));assert.ok(!/\bfetch\(/.test(s));assert.ok(s.includes('c.revision'));});
test('cumulative metrics use one stable ID',()=>assert.match(read('app/api/lab/route.ts'),/id\s*=\s*`metric_\$\{d\.experimentId\}`/));
test('assets enforce ownership, real-file signature and bounds',()=>{assert.match(read('app/api/assets/[id]/route.ts'),/getRecord\(uid,\s*id\)/);const upload=read('app/api/assets/route.ts');assert.match(upload,/25\s*\*\s*1024\s*\*\s*1024/);assert.ok(upload.includes('bytes[0]'));});
test('product forms use owned validation and modal cancellation',()=>{const s=read('components/lab/primitives.tsx');assert.ok(s.includes('noValidate'));assert.ok(s.includes('DialogClose asChild'));assert.ok(s.includes('aria-invalid'));assert.ok(s.includes('resize-none'));assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(s));});

test('queue running filter covers each processing checkpoint without treating drafts or unresolved results as running', () => {
  for (const state of ['preflight', 'prepared', 'submitting', 'submitted', 'waiting', 'downloading', 'validating']) {
    assert.equal(matchesQueueFilter({state}, 'active'), true, state);
    assert.equal(queueAction({state}), 'details', state);
  }
  for (const state of ['queued', 'ready', 'failed', 'cancelled', 'needs_attention']) {
    assert.equal(matchesQueueFilter({state}, 'active'), false, state);
  }
});

test('queue highlights import failures while preserving ready state and existing file access', () => {
  const job = {state: 'ready', importError: 'Cảnh hoặc sản phẩm đã đổi.'};
  assert.equal(matchesQueueFilter(job, 'attention'), true);
  assert.equal(matchesQueueFilter(job, 'pending'), true);
  assert.equal(matchesQueueFilter(job, 'history'), false);
  assert.equal(queueTone(job), 'danger');
  assert.equal(queueAction(job), 'result');
  assert.equal(job.state, 'ready');
});

test('queue actions distinguish retry drafts from resuming an existing Muse result', () => {
  assert.equal(queueAction({state: 'queued'}), 'start');
  for (const state of ['failed', 'cancelled']) assert.equal(queueAction({state}), 'retry');
  assert.equal(queueAction({state: 'needs_attention', providerId: null}), 'reconcile');
  assert.equal(queueAction({state: 'needs_attention', providerId: null, providerResponse: 'No file', providerUrl: 'https://muse.ai/thread/id'}), 'recheckResult');
  assert.equal(queueAction({state: 'needs_attention', providerId: null, providerResponse: 'No file'}), 'reconcile');
  assert.equal(queueAction({state: 'needs_attention', providerId: 'existing'}), 'resume');
  assert.equal(queueAction({state: 'new_unknown_state'}), 'details');
});

test('default queue excludes completed and cancelled history while retaining failed and unresolved work', () => {
  for (const state of ['ready', 'cancelled']) {
    assert.equal(matchesQueueFilter({state}, 'pending'), false, state);
    assert.equal(matchesQueueFilter({state}, 'history'), true, state);
  }
  for (const state of ['queued', 'preflight', 'prepared', 'submitting', 'submitted', 'waiting', 'downloading', 'validating', 'failed', 'needs_attention', 'unknown_state']) {
    assert.equal(matchesQueueFilter({state}, 'pending'), true, state);
    assert.equal(matchesQueueFilter({state}, 'history'), false, state);
  }
});

test('successful import moves a ready result from pending to history without changing the job', () => {
  const job = {id:'same-job', state:'ready', importError:'Import needs review', output:{path:'video.mp4'}};
  assert.equal(matchesQueueFilter(job, 'pending'), true);
  job.importError = null;
  assert.equal(matchesQueueFilter(job, 'pending'), false);
  assert.equal(matchesQueueFilter(job, 'history'), true);
  assert.equal(job.id, 'same-job');
  assert.equal(job.output.path, 'video.mp4');
});

test('queue groups attempts by project and scene while preserving every job and revision', () => {
  const makeJob = (id, projectId, createdAt, sceneRevision = 1) => ({id, createdAt, request:{projectId, sceneId:'same', sceneRevision}});
  const jobs = [makeJob('first','one',1), makeJob('other','two',2), makeJob('retry','one',3,2)];
  const before = structuredClone(jobs);
  const groups = groupQueueJobs(jobs);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].jobs.map(job => job.id), ['retry','first']);
  assert.equal(groups[0].latest.request.sceneRevision, 2);
  assert.deepEqual(jobs, before);
});

test('a later imported result moves prior failed attempts to history without hiding unresolved submissions', () => {
  const make = (id, state, createdAt, extra = {}) => ({id, state, createdAt, request: {
    projectId:'project', sceneId:'scene', sceneRevision:2, productRevision:1, mediaType:'video',
  }, ...extra});
  const failure = make('failed', 'failed', 1);
  const result = make('result', 'ready', 3, {importedAt:4, uploadedAssetId:'asset'});
  const attention = make('attention', 'needs_attention', 2);
  const newerFailure = make('newer', 'failed', 5);
  const jobs = [failure, attention, result, newerFailure];
  const before = structuredClone(jobs);
  const resolved = resolvedQueueFailures(jobs);
  assert.deepEqual([...resolved], ['failed']);
  assert.equal(matchesQueueFilter(failure, 'pending', resolved), false);
  assert.equal(matchesQueueFilter(failure, 'failed', resolved), false);
  assert.equal(matchesQueueFilter(failure, 'history', resolved), true);
  assert.equal(matchesQueueFilter(attention, 'attention', resolved), true);
  assert.equal(matchesQueueFilter(newerFailure, 'pending', resolved), true);
  assert.deepEqual(jobs, before);
  for (const patch of [{importedAt:null}, {uploadedAssetId:null}, {importError:'disk'}, {state:'queued'},
    {request:{...result.request, projectId:'other'}}, {request:{...result.request, sceneRevision:1}},
    {request:{...result.request, mediaType:'image'}}, {request:{...result.request, productRevision:0}}]) {
    assert.equal(resolvedQueueFailures([failure, {...result, ...patch}]).size, 0, JSON.stringify(patch));
  }
});

test('technical tests are explicitly classified and date filters use the Vietnamese day boundary', () => {
  assert.equal(sceneCategory({}, 'QA project','QA scene'), 'content');
  const key = sceneKey('project','scene');
  assert.equal(sceneCategory({[key]:{category:'test',preferredTakeId:null}},'project','scene'), 'test');
  const now = Date.parse('2026-11-10T17:30:00Z');
  assert.equal(matchesMediaPeriod(Date.parse('2026-11-10T16:59:59Z'),'today',now), false);
  assert.equal(matchesMediaPeriod(Date.parse('2026-11-10T17:00:00Z'),'today',now), true);
  assert.equal(matchesMediaPeriod(now - 7 * 86400000,'week',now), true);
  assert.equal(matchesMediaPeriod(now - 7 * 86400000 - 1,'week',now), false);
});

function mediaEntry(id, createdAt, review = 'pending') {
  return {
    key:id, project:{id:'project'}, product:{revision:1},
    production:{productRevision:1,references:[]},
    scene:{id:'scene',revision:1,storyboardApproved:true,references:[],prompt:'Current instructions',action:'',camera:'',voice:'',ratio:'9:16',duration:10,mediaType:'video'},
    take:{id,createdAt,review,sceneRevision:1,type:'video/mp4',metadata:{width:720,height:1280,duration:10}},
  };
}

test('library prefers explicit selections then valid approved versions without discarding alternatives', () => {
  const entries = [mediaEntry('pending',3),mediaEntry('approved',2,'approved'),mediaEntry('rejected',1,'rejected')];
  assert.equal(preferredMedia(entries,{})[0].take.id,'approved');
  assert.equal(preferredMedia(entries,{'project:scene':{category:'content',preferredTakeId:'pending'}})[0].take.id,'pending');
  assert.equal(preferredMedia(entries,{'project:scene':{category:'content',preferredTakeId:'missing'}})[0].take.id,'approved');
  entries[1].take.sceneRevision = 0;
  assert.equal(mediaReview(entries[1]),'stale');
  assert.equal(preferredMedia(entries,{})[0].take.id,'pending');
  assert.equal(entries.length,3);
  assert.equal(entries[1].take.review,'approved');
  entries[1].take.sceneRevision = 1;
  entries[1].product.revision = 2;
  assert.equal(mediaReview(entries[1]),'stale');
});

test('library shows immutable prompt and reference bytes from the selected take snapshot', () => {
  const entry = mediaEntry('old',1);
  entry.scene.prompt = 'Edited later';
  entry.take.snapshot = JSON.stringify({prompt:'Original prompt',camera:'Fixed camera',references:[{id:'ref',version:1,assetId:'original_image'}]});
  assert.deepEqual(mediaInstructions(entry), {prompt:'Original prompt\nFixed camera',references:[{assetId:'original_image',name:'Ảnh tham chiếu đã gửi'}],fromSnapshot:true});
  entry.take.snapshot = '{broken';
  assert.equal(mediaInstructions(entry).prompt,'Edited later');
  assert.equal(mediaInstructions(entry).fromSnapshot,false);
  entry.take.attemptId = 'original-attempt';
  entry.scene.attempts = [{id:'other',snapshot:'{}'}, {id:'original-attempt',snapshot:JSON.stringify({prompt:'Archived attempt prompt'})}];
  assert.equal(mediaInstructions(entry).prompt,'Archived attempt prompt');
  assert.equal(mediaInstructions(entry).fromSnapshot,true);
});
