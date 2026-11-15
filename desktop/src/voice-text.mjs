// Voice description for video prompts. Pure helpers: no I/O, no side effects.
// Unknown, empty or unrecognised fields are dropped, never guessed or defaulted.

export const VOICE_CHIPS = Object.freeze({
  gender: Object.freeze(['male', 'female']),
  age: Object.freeze(['child', 'teen', 'young adult', 'adult', 'middle-aged', 'senior']),
  accent: Object.freeze(['neutral', 'american', 'british', 'australian']),
  pace: Object.freeze(['slow', 'moderate', 'fast']),
  emotion: Object.freeze(['calm', 'warm', 'cheerful', 'energetic', 'serious']),
});

const normalize = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '');

const pick = (value, allowed) => {
  const v = normalize(value);
  return allowed.includes(v) ? v : '';
};

export function voiceTextFromChips({gender, age, accent, pace, emotion} = {}) {
  const g = pick(gender, VOICE_CHIPS.gender);
  const a = pick(age, VOICE_CHIPS.age);
  const ac = pick(accent, VOICE_CHIPS.accent);
  const p = pick(pace, VOICE_CHIPS.pace);
  const e = pick(emotion, VOICE_CHIPS.emotion);

  const parts = [];
  const who = [a, g].filter(Boolean).join(' ');
  if (who) parts.push(who);
  if (ac) parts.push(`${ac} accent`);
  if (p) parts.push(`${p} pace`);
  if (e) parts.push(`${e} tone`);

  if (!parts.length) return '';
  return `Voice: ${parts.join(', ')}.`;
}
