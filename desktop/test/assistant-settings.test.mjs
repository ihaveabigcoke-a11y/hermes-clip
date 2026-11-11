import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantSettings} from '../src/assistant-settings.mjs';
import {Store} from '../src/store.mjs';

test('assistant config uses encrypted storage, keeps blank key and never exposes secrets in status', async () => {
  const store = new Store(':memory:');
  const settings = new AssistantSettings(store, {encrypt: async key => 'cipher:'+Buffer.from(key).toString('base64'), decrypt: async cipher => Buffer.from(cipher.slice(7), 'base64').toString()});
  try {
    assert.equal(settings.status().configured, false);
    await settings.save({model: 'test-model', dailyLimit: 2, apiKey: 'fake-secret'});
    assert.ok(!JSON.stringify(settings.status()).includes('fake-secret'));
    assert.ok(!JSON.stringify(store.get('assistant_settings')).includes('fake-secret'));
    assert.equal((await settings.environment()).TEXT_API_KEY, 'fake-secret');
    const id = (await settings.environment()).TEXT_CONFIG_ID;
    await settings.save({model: 'test-model', dailyLimit: 3, apiKey: ''});
    assert.equal((await settings.environment()).TEXT_API_KEY, 'fake-secret');
    assert.notEqual((await settings.environment()).TEXT_CONFIG_ID, id);
    await settings.save({model: 'test-model', dailyLimit: 0, clearKey: true});
    assert.equal(settings.status().configured, false);
    assert.equal((await settings.environment()).TEXT_API_KEY, '');
    await assert.rejects(settings.save({model: 'test', dailyLimit: 21}));
  } finally { store.close(); }
});
test('encryption failure leaves previous config intact and rejects overlapping saves', async () => {
  const store = new Store(':memory:');
  let release;
  const settings = new AssistantSettings(store, {encrypt: () => new Promise((resolve, reject) => { release = reject; })});
  const first = settings.save({model: 'test', dailyLimit: 1, apiKey: 'fake'});
  await assert.rejects(settings.save({model: 'test', dailyLimit: 2}), /Chờ/);
  release(new Error('encryption unavailable'));
  await assert.rejects(first, /unavailable/);
  assert.equal(store.get('assistant_settings'), null);
  assert.equal(settings.saving, false);
  store.close();
});
