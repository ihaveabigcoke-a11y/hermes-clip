import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {startLocalServer, sessionCookie} from './helpers/local-server.mjs';
import {importWorkerOutput} from '../local/import-worker.mjs';
import {Store} from '../src/store.mjs';
import {Worker} from '../src/worker.mjs';

test('worker imports are durable, idempotent, concurrent and bound to the scene revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'product-lab-import-'));
  const store = new Store(join(root, 'worker.sqlite'));
  let server;
  try {
    server = await startLocalServer({root: join(root, 'workspace')});
    const request = async (path, body) => {
      const response = await fetch(server.origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {Cookie: `${sessionCookie}=${server.session}`, Origin: server.origin, 'Content-Type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result;
    };
    const records = async () => (await request('/api/lab')).records;
    let project = (await records()).find(record => record.id === 'local_qa_production');
    const command = async (action, input, commandId) => {
      project = (await request('/api/production', {id: project.id, revision: project.revision, action, input, commandId})).record;
    };
    await command('scene', {id: 'import_scene', name: 'Import QA', prompt: 'Product image', mediaType: 'image', ratio: '1:1', referenceIds: ['local_qa_reference']}, 'create_import_scene');
    await command('storyboard', {sceneId: 'import_scene'}, 'approve_import_scene');
    const scene = project.data.scenes.find(item => item.id === 'import_scene');
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII=', 'base64');
    await mkdir(join(root,'outputs'),{recursive:true});
    const worker = new Worker(store, root, {}, {});
    const createJob = async fingerprint => {
      // Distinct requests need distinct bytes; old-byte rejection has its own
      // T-049 tests. PNG permits trailing data after IEND.
      const content=Buffer.concat([bytes,Buffer.from(fingerprint)]),sha256=createHash('sha256').update(content).digest('hex');
      const outputPath=join(root,'outputs',fingerprint+'.png');await writeFile(outputPath,content);
      const {job} = store.enqueue({projectId: project.id, productId: project.data.productId,
        productRevision: project.data.productRevision, sceneId: scene.id, sceneRevision: scene.revision,
        references: [], mediaType: 'image', ratio: '1:1', duration: 5, prompt: scene.prompt}, fingerprint);
      store.put({...job, state: 'ready', output:{path:outputPath,name:'result.png',sha256,size:content.length,metadata:{width:1,height:1,duration:null,verifiedBy:'container'}}, providerId: `provider_${fingerprint}`});
      return job.id;
    };
    const first = await createJob('first');
    const second = await createJob('second');
    await Promise.all([importWorkerOutput(server, worker, first), importWorkerOutput(server, worker, first), importWorkerOutput(server, worker, second)]);
    let saved = await records();
    project = saved.find(record => record.id === project.id);
    const received = project.data.scenes.find(item => item.id === scene.id);
    assert.equal(received.takes.length, 2);
    assert.equal(received.attempts.length, 2);
    assert.equal(saved.filter(record => record.id.startsWith('upload_desktop_')).length, 2);
    assert.equal(received.takes[0].review, 'pending');
    await server.close();
    server = await startLocalServer({root: join(root, 'workspace')});
    let imports = 0;
    worker.receiveOutput = async id => {
      imports++;
      await importWorkerOutput(server, worker, id);
    };
    await Promise.all([worker.importReady(first), worker.importReady(first)]);
    assert.equal(imports, 1);
    assert.ok(store.job(first).importedAt);
    assert.equal(worker.status().jobs.find(job => job.id === first).label, 'Đã vào Thư viện');
    const stale = await createJob('stale');
    store.put({...store.job(stale), request: {...store.job(stale).request, sceneRevision: scene.revision + 1}});
    await worker.importReady(stale);
    assert.match(store.job(stale).importError, /Cảnh hoặc sản phẩm đã đổi/);
    assert.equal(store.job(stale).state, 'ready');
    assert.equal(store.job(stale).uploadedAssetId, null);
    saved = await records();
    assert.equal(saved.filter(record => record.id.startsWith('upload_desktop_')).length, 2);
    store.put({...store.job(stale), request: {...store.job(stale).request, sceneRevision: scene.revision}});
    await worker.importReady(stale);
    assert.ok(store.job(stale).importedAt);
    assert.equal(store.job(stale).importError, null);
    assert.equal((await records()).find(record => record.id === project.id).data.scenes.find(item => item.id === scene.id).takes.length, 3);
  } finally {
    await server?.close();
    store.close();
    await rm(root, {recursive: true, force: true});
  }
});
