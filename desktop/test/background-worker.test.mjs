import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';
import {MuseAdapter} from '../src/muse.mjs';
import {parseMuseQuota} from '../src/muse-quota.mjs';

test('unconfirmed cached quota is refreshed and failed refresh never prepares or spends a slot', async context => fixture(async (worker, store) => {
  const depleted = parseMuseQuota('Usage\nFree plan\n100% used');
  let measured = 0;
  let prepared = 0;
  let submitted = 0;
  worker.context = async () => ({pages: () => [{url: () => 'https://muse.ai/', screenshot: async () => {}}]});
  worker.measureQuota = async () => {measured++; return {state: 'error'};};
  context.mock.method(MuseAdapter.prototype, 'prepare', async () => {prepared++;});
  context.mock.method(MuseAdapter.prototype, 'submit', async () => {submitted++;});
  const cachedQuotas = [null, undefined, depleted, {...depleted, state: 'available'},
    {state: 'error', weeklyRemainingPercent: 50, additionalTokens: 0},
    {state: 'login_required'}];
  for (const [index, quota] of cachedQuotas.entries()) {
    store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {}, health: 'ready', quota}]);
    const result = await worker.enqueueAndRun(request('unconfirmed_quota_' + index));
    for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(worker.active.size, 0);
    assert.equal(store.job(result.job.id).state, 'queued');
    assert.equal(measured, index + 1);
    assert.equal(store.batch(), null);
  }
  assert.equal(prepared, 0);
  assert.equal(submitted, 0);
}));

test('quota preflight distinguishes failed reads, exhaustion and login without spending', async context => fixture(async (worker, store) => {
  let prepared = 0;
  let submitted = 0;
  let measured = 0;
  worker.context = async () => ({pages: () => [{url: () => 'https://muse.ai/', screenshot: async () => {}}]});
  context.mock.method(MuseAdapter.prototype, 'prepare', async () => {prepared++;});
  context.mock.method(MuseAdapter.prototype, 'submit', async () => {submitted++;});
  const zeros = {weeklyRemainingPercent: 0, additionalTokens: 0};
  const cases = [
    {quota: null, kind: 'unconfirmed'},
    {quota: {state: 'unavailable'}, kind: 'unconfirmed'},
    {quota: {state: 'error'}, kind: 'unconfirmed'},
    {quota: {state: 'unavailable', ...zeros}, kind: 'unconfirmed'},
    {quota: {state: 'error', ...zeros}, kind: 'unconfirmed'},
    {quota: {state: 'exhausted', ...zeros}, kind: 'exhausted'},
    {quota: {state: 'available', ...zeros}, kind: 'exhausted'},
    {quota: {state: 'login_required', ...zeros}, kind: 'login'},
  ];
  const messages = {
    unconfirmed: 'Chưa đọc được hạn mức Muse. Bấm Đo hạn mức để thử lại.',
    exhausted: 'Muse đã hết hạn mức theo lần đo hiện có. Đo lại hạn mức để tiếp tục.',
    login: 'Phiên Muse đã hết. Tác vụ được giữ trong hàng chờ.',
  };
  for (const [index, {quota, kind}] of cases.entries()) {
    store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {},
      health: 'ready', session: 'signed_in', quota: {state: 'exhausted', ...zeros}}]);
    worker.measureQuota = async () => {measured++; return quota;};
    const result = await worker.enqueueAndRun(request('quota_diagnostic_' + index));
    for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
    const job = store.job(result.job.id);
    const profile = store.get('profiles')[0];
    assert.equal(worker.active.size, 0);
    assert.equal(worker.approvedIds.length, 0);
    assert.equal(measured, index + 1);
    assert.equal(job.state, 'queued');
    assert.equal(job.profileId, null);
    assert.equal(job.submitBatchId, undefined);
    assert.equal(store.batch(), null);
    assert.equal(prepared, 0);
    assert.equal(submitted, 0);
    assert.equal(job.history.some(event => ['prepared', 'submitting'].includes(event.state)), false);
    const fallback = job.history.find(event => event.note?.endsWith(' Đang chọn profile khác.'));
    assert.ok(fallback);
    assert.equal(fallback.state, 'queued');
    assert.equal(fallback.note, messages[kind] + ' Đang chọn profile khác.');
    for (const other of Object.keys(messages).filter(candidate => candidate !== kind)) {
      assert.equal(job.history.some(event => event.note?.includes(messages[other])), false);
    }
    assert.equal(profile.health, kind === 'login' ? 'login_required' : 'ready');
    assert.equal(profile.session, kind === 'login' ? 'expired' : 'signed_in');
  }
}));

const request = sceneId => ({projectId: 'project', productId: 'product', productRevision: 1, sceneId,
  sceneRevision: 1, name: sceneId, mediaType: 'video', ratio: '9:16', duration: 10, prompt: 'Create product video', references: []});
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'background-worker-'));
  const store = new Store(join(root, 'worker.sqlite'));store.set('muse_paused',false);
  const worker = new Worker(store, root, {}, {}, () => 8 * 1024 ** 3);
  store.set('adapter', {enabled: true, startUrl: 'https://muse.ai/', resultIdAttribute: 'data-message-id'});
  const quota = {state: 'available', weeklyRemainingPercent: 50, additionalTokens: 0};
  store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {}, health: 'unknown', quota}, {id: 'two', name: 'Two', enabled: true, proxy: {}, health: 'ready', quota}]);
  try {await run(worker, store);}
  finally {store.close(); await rm(root, {recursive: true, force: true});}
}

test('create and run starts only the clicked scene and deduplicates it', async () => fixture(async (worker, store) => {
  await worker.enqueue(request('old_draft'));
  const calls = [];
  worker.run = async id => {calls.push(id);};
  const result = await worker.enqueueAndRun(request('new_scene'));
  const duplicate = await worker.enqueueAndRun(request('new_scene'));
  assert.deepEqual(calls, [result.job.id]);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(store.jobs().find(job => job.request.sceneId === 'old_draft').state, 'queued');
}));

test('a queued scene automatically tries another profile after an expired session', async context => fixture(async (worker, store) => {
  const profiles = [];
  worker.context = async id => ({pages: () => [{url: () => 'https://muse.ai/', profile: id, screenshot: async () => {}}]});
  context.mock.method(MuseAdapter.prototype, 'prepare', async page => {
    profiles.push(page.profile);
    if (page.profile === 'two') {const error = Error('Expired'); error.code = 'MUSE_LOGIN_REQUIRED'; throw error;}
  });
  context.mock.method(MuseAdapter.prototype, 'submit', async (_page, checkpoint) => {
    await checkpoint('submitting');
    const error = Error('Unknown delivery'); error.code = 'MUSE_DELIVERY_UNCONFIRMED'; throw error;
  });
  const result = await worker.enqueueAndRun(request('fallback'));
  for (let i = 0; i < 200 && worker.active.size; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(profiles, ['two', 'one']);
  assert.equal(store.job(result.job.id).state, 'needs_attention');
  assert.equal(store.get('profiles').find(profile => profile.id === 'two').health, 'login_required');
  assert.equal(store.job(result.job.id).history.filter(event => event.state === 'submitting').length, 1);
}));

test('all expired profiles leave the task queued and stop automatic retries', async context => fixture(async (worker, store) => {
  let checks = 0;
  worker.context = async () => ({pages: () => [{url: () => 'https://muse.ai/'}]});
  context.mock.method(MuseAdapter.prototype, 'prepare', async () => {
    checks++;
    const error = Error('Expired'); error.code = 'MUSE_LOGIN_REQUIRED'; throw error;
  });
  const result = await worker.enqueueAndRun(request('expired'));
  for (let i = 0; i < 200 && worker.active.size; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(checks, 2);
  assert.equal(worker.active.size, 0);
  assert.equal(worker.approvedIds.length, 0);
  assert.equal(store.job(result.job.id).state, 'queued');
  assert.match(store.job(result.job.id).history.at(-1).note, /Chưa có hồ sơ Muse dùng được/);
}));

test('browser visibility minimizes background work and restores the saved profile', async () => fixture(async worker => {
  const states = [];
  let quotaChecks = 0;
  worker.checkProfile = async () => { quotaChecks++; };
  let foreground = 0;
  worker.contexts.set('one', {
    pages: () => [{url: () => 'https://muse.ai/', bringToFront: async () => foreground++}],
    newCDPSession: async () => ({send: async (method, payload) => {
      if (method === 'Browser.getWindowForTarget') return {windowId: 3};
      states.push(payload.bounds.windowState);
    }, detach: async () => {}}),
  });
  worker.store.set('muse_connection', {startUrl: 'https://muse.ai/'});
  await worker.setProfileVisibility('one', false);
  assert.equal(worker.status().profiles[0].background, true);
  await worker.openProfile('one');
  assert.deepEqual(states, ['minimized', 'normal']);
  assert.equal(foreground, 1);
  assert.equal(quotaChecks, 1);
  assert.equal(worker.status().profiles[0].background, false);
}));

test('one-click sends allow the fourth scene and preserve uncertain receipts without resetting counts', async context => fixture(async (worker, store) => {
  store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {}, health: 'ready', quota: {state: 'available', weeklyRemainingPercent: 50, additionalTokens: 0}}]);
  let sends = 0;
  worker.context = async () => ({pages: () => [{url: () => 'https://muse.ai/', screenshot: async () => {}}]});
  context.mock.method(MuseAdapter.prototype, 'prepare', async () => {});
  context.mock.method(MuseAdapter.prototype, 'submit', async (_page, checkpoint) => {
    await checkpoint('submitting');
    sends++;
    const error = Error('Delivery uncertain');
    error.code = 'MUSE_DELIVERY_UNCONFIRMED';
    throw error;
  });
  for (let index = 0; index < 4; index++) {
    const result = await worker.enqueueAndRun(request('batch_scene_' + index));
    for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(store.job(result.job.id).state, 'needs_attention');
    worker.pause();
  }
  assert.equal(sends,4);assert.equal(store.batch().submittedByProfile.one,4);
  const fourth=store.jobs().find(job=>job.request.sceneId==='batch_scene_3');
  const batchId=store.batch().id;
  const replay=await worker.enqueueAndRun(request('batch_scene_3'));
  assert.equal(replay.job.id,fourth.id);assert.equal(replay.job.state,'needs_attention');
  assert.equal(sends,4);assert.equal(store.batch().submittedByProfile.one,4);assert.equal(store.batch().id,batchId);
}));

test('exhausted quota is refreshed once before switching profiles without a submit slot', async context => fixture(async (worker, store) => {
  const quota = {state: 'available', weeklyRemainingPercent: 0, additionalTokens: 0};
  store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {}, health: 'ready', quota},
    {id: 'two', name: 'Two', enabled: true, proxy: {}, health: 'ready', quota: {state: 'available', weeklyRemainingPercent: 50, additionalTokens: 0}}]);
  const measured = [];
  const submitted = [];
  worker.context = async id => ({pages: () => [{url: () => 'https://muse.ai/', profile: id, screenshot: async () => {}}]});
  worker.measureQuota = async id => {measured.push(id); return {...quota, state: 'exhausted'};};
  context.mock.method(MuseAdapter.prototype, 'prepare', async page => assert.equal(page.profile, 'two'));
  context.mock.method(MuseAdapter.prototype, 'submit', async (page, checkpoint) => {
    await checkpoint('submitting');
    submitted.push(page.profile);
    throw Object.assign(Error('Delivery uncertain'), {code: 'MUSE_DELIVERY_UNCONFIRMED'});
  });
  await worker.enqueueAndRun(request('quota_fallback'));
  for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(measured, ['one']);
  assert.deepEqual(submitted, ['two']);
  assert.deepEqual(store.batch().submittedByProfile, {two: 1});
}));

test('quota recovery allows submission while an unsuccessful refresh preserves the unsent job', async context => fixture(async (worker, store) => {
  const quota = {state: 'exhausted', weeklyRemainingPercent: 0, additionalTokens: 0};
  store.set('profiles', [{id: 'one', name: 'One', enabled: true, proxy: {}, health: 'ready', quota}]);
  worker.context = async () => ({pages: () => [{url: () => 'https://muse.ai/', screenshot: async () => {}}]});
  let prepared = 0;
  context.mock.method(MuseAdapter.prototype, 'prepare', async () => {prepared++;});
  context.mock.method(MuseAdapter.prototype, 'submit', async (_page, checkpoint) => {
    await checkpoint('submitting');
    throw Object.assign(Error('Delivery uncertain'), {code: 'MUSE_DELIVERY_UNCONFIRMED'});
  });
  worker.measureQuota = async () => ({state: 'error'});
  const result = await worker.enqueueAndRun(request('quota_refresh'));
  for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(prepared, 0);
  assert.equal(store.job(result.job.id).state, 'queued');
  assert.equal(store.batch(), null);
  worker.measureQuota = async () => ({state: 'available', weeklyRemainingPercent: 50, additionalTokens: 0});
  await worker.enqueueAndRun(request('quota_refresh'));
  for (let wait = 0; wait < 200 && worker.active.size; wait++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(prepared, 1);
  assert.equal(store.batch().submittedByProfile.one, 1);
}));
