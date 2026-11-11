import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';

const request = {projectId: 'project', productId: 'product', productRevision: 1, sceneId: 'scene',
  sceneRevision: 1, name: 'Scene', mediaType: 'video', ratio: '9:16', duration: 10,
  prompt: 'Create a product video', references: []};

test('text-only result reconciliation preserves accounting and creates a clean retry', t => fixture(async (worker, store) => {
  const original = store.enqueue(request, 'response').job;
  const waiting = {...original, state: 'needs_attention', profileId: 'profile', providerUrl: 'https://muse.ai/thread/id', providerResponse: 'No video'};
  store.put(waiting);
  store.set('adapter', {enabled: true, startUrl: 'https://muse.ai/', resultIdAttribute: 'data-message-id'});
  store.set('generation_batch', {id: 'batch', perProfileLimit: 3, submittedByProfile: {profile: 2}});
  let closed = 0;
  const page = {close: async () => {closed++;}};
  worker.context = async () => ({newPage: async () => page});
  worker.connectVpn = async () => {};
  t.mock.method(MuseAdapter.prototype, 'inspectResponse', async () => ({providerId: null}));
  assert.equal((await worker.recheckResult({id: original.id})).state, 'failed');
  assert.equal(closed, 1);
  assert.equal(worker.chatting.size, 0);
  assert.equal(store.batch().submittedByProfile.profile, 2);
  const retry = store.retry(original.id);
  assert.equal(retry.providerResponse, null);
  assert.equal(store.job(original.id).providerResponse, 'No video');
  assert.equal(retry.state, 'queued');
}));

test('result reconciliation links a late file and keeps failures recoverable', t => fixture(async (worker, store) => {
  const original = store.enqueue(request, 'response').job;
  store.put({...original, state: 'needs_attention', profileId: 'profile', providerUrl: 'https://muse.ai/thread/id', providerResponse: 'No video'});
  store.set('adapter', {enabled: true, startUrl: 'https://muse.ai/', resultIdAttribute: 'data-message-id'});
  worker.context = async () => ({newPage: async () => ({close: async () => {}})});
  worker.connectVpn = async () => {};
  const inspection = t.mock.method(MuseAdapter.prototype, 'inspectResponse', async () => {throw Error('Connection failed');});
  await assert.rejects(worker.recheckResult({id: original.id}), /Connection failed/);
  assert.equal(store.job(original.id).state, 'needs_attention');
  assert.equal(worker.chatting.size, 0);
  worker.active.set('profile', 'other');
  await assert.rejects(worker.recheckResult({id: original.id}), /đang bận/);
  worker.active.delete('profile');
  inspection.mock.mockImplementation(async () => ({providerId: 'late-file', providerUrl: 'https://muse.ai/thread/id'}));
  const linked = await worker.recheckResult({id: original.id});
  assert.equal(linked.state, 'needs_attention');
  assert.equal(linked.providerId, 'late-file');
  assert.equal(store.batch(), null);
  await assert.rejects(worker.recheckResult({id: original.id}));
}));

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'hermes-controls-'));
  const store = new Store(join(root, 'worker.sqlite'));
  const worker = new Worker(store, root, {}, {}, () => 8 * 1024 ** 3);
  store.set('adapter', {enabled: true});
  store.set('profiles', [{id: 'profile', enabled: true, proxy: {}}]);
  try { await run(worker, store); }
  finally { store.close(); await rm(root, {recursive: true, force: true}); }
}

for (const entryPoint of ['start', 'enqueueAndRun']) {
  test(`pause cancels pending ${entryPoint} before dispatch and allows a later explicit start`, () => fixture(async (worker, store) => {
    const queued = await worker.enqueue(request);
    const dispatched = [];
    worker.run = async id => { dispatched.push(id); };
    const starting = entryPoint === 'start'
      ? worker.start({count: 1, maxConcurrent: 1})
      : worker.enqueueAndRun(request);
    worker.pause();
    await starting;
    assert.deepEqual(dispatched, []);
    assert.equal(worker.paused, true);
    assert.equal(worker.budget, 0);
    assert.deepEqual(worker.approvedIds, []);
    assert.equal(store.job(queued.job.id).state, 'queued');
    assert.equal(store.batch(), null);
    await worker.start({count: 1, maxConcurrent: 1});
    assert.deepEqual(dispatched, [queued.job.id]);
    await new Promise(resolve => setImmediate(resolve));
  }));
}

for (const lock of ['active', 'checking']) {
  test(`closing a launching profile rechecks the ${lock} lock before closing its browser`, () => fixture(async worker => {
    let releaseOpening;
    const opening = new Promise(resolve => { releaseOpening = resolve; });
    worker.opening.set('profile', opening);
    let closed = 0;
    const closing = worker.closeProfile('profile');
    const rejected = assert.rejects(closing, /Profile đang có job/);
    worker.contexts.set('profile', {close: async () => { closed++; }});
    worker[lock].set('profile', 'in-progress');
    releaseOpening();
    await rejected;
    assert.equal(closed, 0);
    worker[lock].delete('profile');
    worker.opening.delete('profile');
    await worker.closeProfile('profile');
    assert.equal(closed, 1);
  }));
}

test('dispatch waits for browser close to finish and resumes the approved queue', () => fixture(async (worker, store) => {
  let releaseClose;
  const browserClosing = new Promise(resolve => { releaseClose = resolve; });
  worker.contexts.set('profile', {close: async () => {
    await browserClosing;
    worker.contexts.delete('profile');
  }});
  const closing = worker.closeProfile('profile');
  const queued = await worker.enqueue(request);
  const dispatched = [];
  worker.run = async id => { dispatched.push(id); };
  try {
    await worker.start({count: 1, maxConcurrent: 1});
    assert.deepEqual(dispatched, []);
    assert.equal(store.job(queued.job.id).state, 'queued');
    assert.equal(worker.profiles()[0].busy, true);
  } finally {
    releaseClose();
    await closing;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(dispatched, [queued.job.id]);
  assert.equal(worker.profiles()[0].busy, false);
}));

test('a pending start cancelled by pause cannot dispatch alongside a newer explicit start', () => fixture(async (worker, store) => {
  const first = await worker.enqueue(request);
  const second = await worker.enqueue({...request, sceneId: 'second'});
  const dispatched = [];
  worker.run = async id => { dispatched.push(id); };
  const oldStart = worker.start({count: 1, maxConcurrent: 1, jobIds: [first.job.id]});
  worker.pause();
  const newStart = worker.start({count: 1, maxConcurrent: 1, jobIds: [second.job.id]});
  await Promise.all([oldStart, newStart]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(dispatched, [second.job.id]);
  assert.equal(store.job(first.job.id).state, 'queued');
}));

test('resume and profile edits reject a pending browser close without changing the job', () => fixture(async (worker, store) => {
  const {job} = await worker.enqueue(request);
  store.transition(job.id, 'preflight', {profileId: 'profile'});
  store.transition(job.id, 'needs_attention', {providerId: 'existing-result', providerUrl: 'https://muse.ai/thread/existing'});
  let releaseClose;
  const browserClosing = new Promise(resolve => { releaseClose = resolve; });
  worker.contexts.set('profile', {close: async () => {
    worker.contexts.delete('profile');
    await browserClosing;
  }});
  const closing = worker.closeProfile('profile');
  await new Promise(resolve => setImmediate(resolve));
  try {
    await assert.rejects(worker.resume(job.id), /đang đóng browser/);
    await assert.rejects(worker.saveProfile({id: 'profile', name: 'Changed', accountLabel: '', enabled: true, proxy: {server: ''}}), /Đóng browser/);
    assert.equal(store.job(job.id).state, 'needs_attention');
    assert.equal(store.job(job.id).providerId, 'existing-result');
    assert.equal(store.batch(), null);
  } finally {
    releaseClose();
    await closing;
  }
}));

test('reopening waits for an in-flight close and duplicate close calls share one operation', () => fixture(async worker => {
  let releaseClose;
  const browserClosing = new Promise(resolve => { releaseClose = resolve; });
  let closes = 0;
  let launches = 0;
  worker.contexts.set('profile', {close: async () => {
    closes++;
    await browserClosing;
    worker.contexts.delete('profile');
  }});
  const nextContext = {on() {}};
  worker.browser.launchPersistentContext = async () => { launches++; return nextContext; };
  const closing = worker.closeProfile('profile');
  const duplicateClose = worker.closeProfile('profile');
  const opening = worker.context('profile');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(launches, 0);
  assert.equal(closes, 1);
  releaseClose();
  await Promise.all([closing, duplicateClose]);
  assert.equal(await opening, nextContext);
  assert.equal(launches, 1);
  assert.equal(worker.closing.size, 0);
}));
