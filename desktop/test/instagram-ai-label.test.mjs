import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store} from '../src/store.mjs';
import {InstagramPublisher} from '../src/instagram.mjs';
import {InstagramAdapter} from '../src/instagram-adapter.mjs';
import {ensureInstagramAiLabel, instagramAiLabelMode} from '../src/instagram-ai-label.mjs';

// Static DOM only. Never launch a persistent/user profile or navigate a service.
const outputs = fileURLToPath(new URL('../../outputs/', import.meta.url));
let root, browser, video;
before(async () => {
  await mkdir(outputs, {recursive: true});
  root = await mkdtemp(join(outputs, 'instagram-ai-label-test-'));
  assert.equal(dirname(root), resolve(outputs));
  process.env.TEMP = root; process.env.TMP = root;
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, 'browsers');
  const {chromium} = await import('playwright');
  browser = await chromium.launch({headless: true,
    executablePath: process.env.HERMES_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    env: {...process.env, APPDATA: root, LOCALAPPDATA: root},
    args: ['--disable-background-networking', '--disable-component-update', '--disable-crash-reporter',
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND']});
  video = join(root, 'fixture.mp4');
  await writeFile(video, 'DOM upload fixture; not a playable video');
});
after(async () => {
  await browser?.close();
  if (root) {assert.equal(dirname(root), resolve(outputs)); await rm(root, {recursive: true, force: true});}
});

const toggle = (attributes = '', click = "this.setAttribute('aria-checked','true'); window.toggles++") =>
  `<button role="switch" aria-label="Label as made with AI" ${attributes} onclick="${click}">AI label</button>`;
function html(control, {draft = false, outside = ''} = {}) {
  return `<!doctype html><html lang="en"><body>
    <script>window.shares=0;window.toggles=0</script>${outside}
    <button onclick="document.querySelector('[role=dialog]').hidden=false">Create</button>
    <div role="dialog" aria-label="Create Reel" ${draft ? 'hidden' : ''}>
      <input type="file" accept="video/mp4" onchange="document.querySelector('#next').hidden=false">
      <button id="next" hidden onclick="this.hidden=true;document.querySelector('#details').hidden=false">Next</button>
      <section id="details" ${draft ? 'hidden' : ''}>
        <textarea aria-label="caption"></textarea>${control}
        <button onclick="window.shares++;this.closest('[role=dialog]').innerHTML='<p>Your reel has been shared.</p><a href=https://www.instagram.com/reel/fixture/>Receipt fixture</a>'">Share</button>
      </section>
    </div></body></html>`;
}
async function fixture(t, control, options) {
  const context = await browser.newContext({serviceWorkers: 'block'});
  const requests = [];
  await context.route('**/*', route => {requests.push(route.request().url()); return route.abort();});
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.setContent(html(control, options));
  t.after(async () => {await context.close(); assert.deepEqual(requests, [], 'fixture must not request any network URL');});
  return page;
}
// Use the app's 3000 ms budget: 180 ms also limited Playwright's actionability
// wait for two animation frames, which can exceed that under full-suite load.
const check = (page, mode = 'required', options = {}) => ensureInstagramAiLabel(page, mode, options);
const blocked = (reason) => error => {
  assert.equal(error.code, 'INSTAGRAM_AI_LABEL_REQUIRED');
  assert.equal(error.aiLabelCheck.status, 'blocked');
  assert.equal(error.aiLabelCheck.reason, reason);
  assert.match(error.message, /Cần đối soát\/thao tác tay/);
  assert.match(error.message, /dừng trước Share/);
  return true;
};

test('missing/null configuration defaults to off; only explicit required enables the AI label', async () => {
  for (const value of [undefined, null, 'off']) assert.equal(instagramAiLabelMode(value), 'off');
  assert.equal(instagramAiLabelMode('required'), 'required');
  // Call directly: the check() helper defaults an undefined mode to 'required'.
  for (const value of [undefined, null]) assert.equal((await ensureInstagramAiLabel({}, value)).status, 'skipped');
  for (const value of ['', false, 0, 'optional']) assert.throws(() => instagramAiLabelMode(value), blocked('invalid_config'));
  assert.equal((await check({}, 'off')).status, 'skipped'); // no DOM access at all
});

test('AI label documentation states the off default and limits fail closed to explicit required', async () => {
  for (const path of ['../../docs/INSTAGRAM-AI-LABEL.md', '../../docs/context/T09-INSTAGRAM-AI-LABEL.md']) {
    const text = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(text, /Mặc định \*\*không gắn nhãn AI\*\* \(`off`\), kể cả khi thiếu `aiLabel` hoặc `aiLabel=null`/);
    assert.match(text, /Fail closed chỉ áp dụng khi chọn Bắt buộc bật nhãn AI \(`required`\)/);
    assert.match(text, /không chặn Share vì thiếu công tắc nhãn/);
  }
});

test('DOM switch turns on once and an already-on switch is never toggled off', async t => {
  const page = await fixture(t, toggle('aria-checked="false"'));
  assert.equal((await check(page)).status, 'confirmed');
  assert.equal(await page.getByRole('switch').getAttribute('aria-checked'), 'true');
  assert.equal((await check(page)).status, 'confirmed');
  assert.equal(await page.evaluate(() => window.toggles), 1);
  assert.equal(await page.evaluate(() => window.shares), 0);
});

test('DOM supports native labeled checkbox and Vietnamese accessible switch name', async t => {
  const page = await fixture(t, '<label><input type="checkbox">Label as made with AI</label>');
  assert.equal((await check(page)).status, 'confirmed');
  assert.equal(await page.getByRole('checkbox').isChecked(), true);
  await page.setContent(html('<button role="switch" aria-label="Được tạo bằng AI" aria-checked="true">Nhãn</button>'));
  assert.equal((await check(page)).status, 'confirmed');
});

test('DOM expands only the named advanced settings and confirms a delayed toggle update', async t => {
  const page = await fixture(t, `<button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#advanced').hidden=false">Advanced settings</button>
    <div id="advanced" hidden>${toggle('aria-checked="false"', "window.toggles++;setTimeout(()=>this.setAttribute('aria-checked','true'),40)")}</div>`);
  assert.equal((await check(page)).status, 'confirmed');
  assert.equal(await page.getByRole('button', {name: 'Advanced settings'}).getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => window.toggles), 1);
});

for (const [name, control, reason] of [
  ['absent', '', 'toggle_missing'],
  ['caption claim only', '<p>AI-generated concept</p>', 'toggle_missing'],
  ['unassociated label', '<p>Label as made with AI</p><button role="switch" aria-checked="true">Other</button>', 'toggle_missing'],
  ['hidden', `<div hidden>${toggle('aria-checked="true"')}</div>`, 'toggle_missing'],
  ['ambiguous', toggle('aria-checked="false"') + toggle('aria-checked="true"'), 'toggle_not_unique'],
  ['disabled', toggle('aria-checked="false" disabled'), 'toggle_disabled'],
  ['unknown state', toggle(''), 'state_unknown'],
  ['mixed state', toggle('aria-checked="mixed"'), 'state_unknown'],
  ['click has no effect', toggle('aria-checked="false"', 'window.toggles++'), 'enable_unconfirmed'],
  ['disappears after click', toggle('aria-checked="false"', 'this.remove()'), 'toggle_unavailable'],
]) test(`DOM ${name} fails closed before Share`, async t => {
  const page = await fixture(t, control);
  await assert.rejects(check(page), blocked(reason));
  assert.equal(await page.evaluate(() => window.shares), 0);
});

test('DOM ignores a matching toggle outside the composer and rejects multiple dialogs', async t => {
  const page = await fixture(t, '', {outside: toggle('aria-checked="true"')});
  await assert.rejects(check(page), blocked('toggle_missing'));
  await page.setContent(html(toggle('aria-checked="true"'), {outside: '<div role="dialog">Another dialog</div>'}));
  await assert.rejects(check(page), blocked('composer_not_unique'));
});

class FixtureAdapter extends InstagramAdapter {
  async session() {return {session: 'signed_in', handle: 'fixture_owner', userId: '100'};}
  async recentPosts() {return ['https://www.instagram.com/reel/old/'];}
  async dismissPrompts() {}
}
async function publisherFixture(t, page, aiLabel) {
  const store = new Store(':memory:'); t.after(() => store.close());
  store.set('instagram_browser_enabled',true); // Explicit legacy-browser fixture; defaults are tested in T-004.
  const snapshot = {planId: 'plan', revision: 1, accountId: 'account', assetId: 'asset', productId: 'product',
    caption: 'AI-generated concept', path: video, sha256: 'a'.repeat(64), ratio: '9:16', duration: 10,
    ...(aiLabel === undefined ? {} : {aiLabel})};
  const workspace = {snapshot: async () => structuredClone(snapshot), revalidate: async () => snapshot, syncPublished: async () => {}};
  const adapter = new FixtureAdapter();
  const publisher = new InstagramPublisher({store, root, workspace, adapter, browser: {}, secret: {}, validate: async () => ({sha256: snapshot.sha256})});
  publisher.stopped = true;
  publisher.browsers.page = async () => page;
  publisher.browsers.visibility = async () => {};
  store.set('instagram_profiles', [{id: 'account', apiMode:'browser', vpnEnabled: false, proxy: {server: '', username: ''}, ...await adapter.session()}]);
  const request = {requestId: 'request', planId: 'plan', revision: 1, accountId: 'account', assetId: 'asset'};
  const job = await publisher.enqueue(request);
  publisher.stopped = false;
  return {publisher, job, request, workspace, adapter, store};
}

test('publisher with required uses real adapter DOM preparation, labels and shares once', async t => {
  const mode = 'required';
  const page = await fixture(t, toggle('aria-checked="false"'), {draft: true});
  const {publisher, job, request} = await publisherFixture(t, page, mode);
  await publisher.run(job.id);
  assert.equal(publisher.job(job.id).state, 'published');
  assert.equal(publisher.job(job.id).aiLabelCheck.status, 'confirmed');
  assert.deepEqual(await page.evaluate(() => [window.toggles, window.shares]), [1, 1]);
  assert.equal((await publisher.enqueue(request)).id, job.id);
  assert.equal(await page.evaluate(() => window.shares), 1);
  assert.equal(publisher.job(job.id).snapshot.caption, 'AI-generated concept');
});

test('publisher missing AI switch persists needs_attention across restart; retry/reconcile never share', async t => {
  const page = await fixture(t, '', {draft: true});
  const {publisher, job, request, workspace, adapter, store} = await publisherFixture(t, page, 'required');
  await publisher.run(job.id);
  const stopped = publisher.job(job.id);
  assert.equal(stopped.state, 'needs_attention'); assert.equal(stopped.attentionReason, 'ai_label');
  assert.equal(stopped.aiLabelCheck.reason, 'toggle_missing'); assert.equal(stopped.submittingAt, null);
  assert.match(stopped.history.at(-1).note, /Cần đối soát\/thao tác tay/);
  assert.equal(await page.evaluate(() => window.shares), 0);
  assert.equal(publisher.browsers.busy.size, 0);
  assert.throws(() => publisher.retry({id: job.id}), /Chỉ thử lại/);
  assert.equal((await publisher.enqueue({...request, requestId: 'another'})).id, job.id);
  const recovered = new InstagramPublisher({store, root, workspace, adapter, browser: {}, secret: {}});
  assert.equal(recovered.job(job.id).state, 'needs_attention');
  await assert.rejects(recovered.reconcile({id: job.id}), /dừng trước Share vì nhãn AI/);
  assert.equal(await page.evaluate(() => window.shares), 0);
});

test('publisher final gate catches a switch changed during beforeShare revalidation', async t => {
  const page = await fixture(t, toggle('aria-checked="false"'), {draft: true});
  const {publisher, job, workspace} = await publisherFixture(t, page, 'required');
  let validations = 0;
  workspace.revalidate = async snapshot => {
    if (++validations === 2) await page.getByRole('switch').evaluate(element => element.setAttribute('aria-checked', 'false'));
    return snapshot;
  };
  await publisher.run(job.id);
  const stopped = publisher.job(job.id);
  assert.equal(stopped.state, 'needs_attention'); assert.equal(stopped.attentionReason, 'ai_label');
  assert.equal(stopped.aiLabelCheck.reason, 'toggle_off_before_share'); assert.equal(stopped.submittingAt, null);
  assert.deepEqual(await page.evaluate(() => [window.toggles, window.shares]), [1, 0]);
});

test('adapter direct publish cannot skip prepare to share with an unchecked AI switch', async t => {
  const page = await fixture(t, toggle('aria-checked="false"'));
  let checkpoints = 0;
  await assert.rejects(new InstagramAdapter().publish(page, {snapshot: {aiLabel: 'required'}}, async () => {checkpoints++;}), blocked('toggle_off_before_share'));
  assert.equal(checkpoints, 0);
  assert.deepEqual(await page.evaluate(() => [window.toggles, window.shares]), [0, 0]);
});

for (const mode of ['off', undefined, null]) test(`publisher with ${mode} (default off) publishes without a label control`, async t => {
  const page = await fixture(t, '', {draft: true});
  const {publisher, job} = await publisherFixture(t, page, mode);
  await publisher.run(job.id);
  assert.equal(publisher.job(job.id).state, 'published');
  assert.equal(publisher.job(job.id).aiLabelCheck.status, 'skipped');
  assert.deepEqual(await page.evaluate(() => [window.toggles, window.shares]), [0, 1]);
});

test('publisher with default off never touches an AI switch that is present', async t => {
  const page = await fixture(t, toggle('aria-checked="false"'), {draft: true});
  const {publisher, job} = await publisherFixture(t, page, undefined);
  await publisher.run(job.id);
  assert.equal(publisher.job(job.id).state, 'published');
  assert.equal(publisher.job(job.id).aiLabelCheck.status, 'skipped');
  assert.deepEqual(await page.evaluate(() => [window.toggles, window.shares]), [0, 1]);
});
