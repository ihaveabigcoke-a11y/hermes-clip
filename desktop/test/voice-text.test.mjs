import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceTextFromChips, VOICE_CHIPS} from '../src/voice-text.mjs';

test('full set of valid chips builds one English sentence', () => {
  assert.equal(
    voiceTextFromChips({gender: 'female', age: 'young adult', accent: 'neutral', pace: 'slow', emotion: 'warm'}),
    'Voice: young adult female, neutral accent, slow pace, warm tone.',
  );
});

test('missing fields are skipped without guessing', () => {
  assert.equal(voiceTextFromChips({gender: 'male', emotion: 'calm'}), 'Voice: male, calm tone.');
  assert.equal(voiceTextFromChips({accent: 'british'}), 'Voice: british accent.');
});

test('empty, blank and no-argument input returns empty string', () => {
  assert.equal(voiceTextFromChips({}), '');
  assert.equal(voiceTextFromChips(), '');
  assert.equal(voiceTextFromChips({gender: '', age: '   ', accent: null, pace: undefined, emotion: 0}), '');
});

test('unrecognised values are dropped, not coerced', () => {
  assert.equal(
    voiceTextFromChips({gender: 'robot', age: 'ancient', accent: 'klingon', pace: 'warp', emotion: 'angry'}),
    '',
  );
  assert.equal(voiceTextFromChips({gender: 'female', age: 'unknown', pace: 'fast'}), 'Voice: female, fast pace.');
});

test('whitespace and case are normalised', () => {
  assert.equal(
    voiceTextFromChips({gender: '  Female ', age: 'Young   Adult', accent: 'NEUTRAL', pace: ' Fast', emotion: 'Cheerful '}),
    'Voice: young adult female, neutral accent, fast pace, cheerful tone.',
  );
});

test('VOICE_CHIPS exposes the five neutral groups', () => {
  assert.deepEqual(Object.keys(VOICE_CHIPS).sort(), ['accent', 'age', 'emotion', 'gender', 'pace']);
  assert.ok(VOICE_CHIPS.gender.includes('female'));
  assert.ok(Object.isFrozen(VOICE_CHIPS));
});
