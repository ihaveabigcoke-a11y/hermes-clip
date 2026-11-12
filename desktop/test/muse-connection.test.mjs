import test from 'node:test';
import assert from 'node:assert/strict';
import {museConnectionSummary} from '../../lib/lab/muse-connection.ts';

const profile = {enabled: true, health: 'ready', session: 'signed_in', quota: {state: 'available', weeklyRemainingPercent: 76}, open: false};
const status = {musePaused:false, generationReady: true, profiles: [profile]};

test('Studio reports a connected Muse profile even when its browser is closed', () => {
  const summary = museConnectionSummary(status, true);
  assert.equal(summary.state, 'ready');
  assert.match(summary.description, /76%/);
  assert.equal(summary.view, 'production');
});

test('Studio distinguishes loading, IPC failure, setup and unavailable profiles', () => {
  assert.equal(museConnectionSummary(null, false).state, 'desktop_required');
  assert.equal(museConnectionSummary(null, true).state, 'loading');
  assert.equal(museConnectionSummary(status, true, 'Worker unavailable').state, 'unavailable');
  assert.equal(museConnectionSummary({...status, generationReady: false}, true).state, 'setup');
  assert.equal(museConnectionSummary({...status, profiles: [{...profile, enabled: false}]}, true).state, 'profile_required');
  for (const change of [{health: 'login_required'}, {session: 'expired'}, {quota: {state: 'exhausted'}}]) {
    assert.equal(museConnectionSummary({...status, profiles: [{...profile, ...change}]}, true).state, 'attention');
  }
  assert.doesNotMatch(museConnectionSummary({...status, profiles: [{...profile, quota: null}]}, true).description, /76|undefined|NaN/);
});

test('Studio excludes legacy zero quota, unknown quota and profiles at their batch limit', () => {
  for (const additionalTokens of [null, undefined]) {
    const quota = {state: 'available', weeklyRemainingPercent: 0, additionalTokens};
    assert.equal(museConnectionSummary({...status, profiles: [{...profile, quota}]}, true).state, 'attention');
  }
  const positiveTokens = {state: 'available', weeklyRemainingPercent: 0, additionalTokens: 1};
  assert.equal(museConnectionSummary({...status, profiles: [{...profile, quota: positiveTokens}]}, true).state, 'ready');
  const emptyQuota = {state: 'available', weeklyRemainingPercent: 0, additionalTokens: 0};
  assert.equal(museConnectionSummary({...status, profiles: [{...profile, quota: emptyQuota}]}, true).state, 'attention');
  assert.equal(museConnectionSummary({...status, profiles: [{...profile, quota: null}]}, true).state, 'attention');
  const batch = {id: 'batch', startedAt: 1, perProfileLimit: 3, submittedByProfile: {one: 3}};
  assert.equal(museConnectionSummary({...status, batch, profiles: [{...profile, id: 'one'}]}, true).state, 'attention');
  assert.equal(museConnectionSummary({...status, batch, profiles: [{...profile, id: 'two'}]}, true).state, 'ready');
});
