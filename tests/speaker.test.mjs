/**
 * Speaker widget (GitHub issue fuzheado/wikibento#16) — text-to-speech
 * output widget constitution.
 *
 * Covers the registry contract, the transform shape, and the pure speech
 * logic from src/lib/speech.js (controller with a FAKE synth — the real
 * engines have zero voices headless, verified 2026-09-05: Chromium fires
 * `synthesis-failed`, Firefox queues forever).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampRate, clampVolume, pickVoice, canSpeak, createSpeechController,
  speechPayload, readSpeechPayload, SPEECH_TYPE,
  RATE_MIN, RATE_MAX, VOLUME_CAP,
} from '../src/lib/speech.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const def = WIDGET_TYPES.speaker;

// ── registry contract ──────────────────────────────────────────

test('speaker: registry entry is present and static (no fetch)', () => {
  assert.ok(def, 'speaker widget type exists');
  assert.equal(def.renderer, 'SpeakerCard');
  assert.equal(def.timeScope, 'point');
  assert.equal(typeof def.fetch, 'undefined', 'static widget — no fetch');
  assert.equal(typeof def.transform, 'function');
  assert.equal(def.dataSource.includes('no fetch'), true);
});

test('speaker: safety default — speakOnChange is OFF', () => {
  assert.equal(def.defaults.speakOnChange, false, 'auto-speak must default off');
  assert.equal(def.defaults.refreshSeconds, 86400);
});

test('speaker: config fields cover text, a wired source, a language, a speed + the safety toggle', () => {
  const keys = def.configFields.map((f) => f.key);
  for (const k of ['text', 'source', 'lang', 'rate', 'speakOnChange']) assert.ok(keys.includes(k), k);
  // `source` is the one field type that delivers an emitted value unstringified — the typed-payload path.
  assert.equal(def.configFields.find((f) => f.key === 'source').type, 'source');
  assert.equal(def.defaults.speakOnChange, false, 'auto-speak stays off by default');
});

test('speaker: transform passes text through and coerces speakOnChange', () => {
  const t1 = def.transform(null, { text: 'Hello', speakOnChange: true });
  assert.equal(t1.text, 'Hello');
  assert.equal(t1.speakOnChange, true);
  const t2 = def.transform(null, { text: 42, speakOnChange: 'yes' });
  assert.equal(t2.text, '42');
  assert.equal(t2.speakOnChange, false, 'non-true values coerce to false');
  const t3 = def.transform(null, {});
  assert.equal(t3.text, '');
});

/* ── the typed speech value (ISSUE-97) ──────────────────────────────────────────────────────────── */

test('speech: a payload carries text + language, and only a typed value counts as speech', () => {
  const p = speechPayload('Marie Curie war eine Physikerin.', 'de');
  assert.deepEqual(p, { type: 'speech', text: 'Marie Curie war eine Physikerin.', lang: 'de' });
  assert.deepEqual(readSpeechPayload(p), { text: 'Marie Curie war eine Physikerin.', lang: 'de' });
  // No language known → still speech, just unlabelled (the consumer falls back to its own ⚙ setting).
  assert.deepEqual(speechPayload('text', ''), { type: SPEECH_TYPE, text: 'text' });
  assert.deepEqual(readSpeechPayload({ type: 'speech', text: 'text' }), { text: 'text', lang: '' });
  // Strictness is the point: an untyped object is not speech, so a plain string keeps its old meaning.
  assert.equal(readSpeechPayload('Marie Curie'), null);
  assert.equal(readSpeechPayload(['a', 'b']), null);
  assert.equal(readSpeechPayload({ text: 'no type' }), null);
  assert.equal(readSpeechPayload({ type: 'ranking', rows: [] }), null);
  assert.equal(readSpeechPayload(null), null);
});

test('speaker: a wired typed value supplies BOTH the text and the language', () => {
  const speech = speechPayload('Bonjour, je m’appelle Marie.', 'fr');
  const t = def.transform(null, { text: 'ignored — the source wins' }, { sourceOutput: speech });
  assert.equal(t.text, 'Bonjour, je m’appelle Marie.');
  assert.equal(t.lang, 'fr', 'the language travels with the value');
  assert.equal(t.fromSource, true);
});

test('speaker: a plain output is spoken as text, with the language from ⚙', () => {
  const t = def.transform(null, { text: 'fallback', lang: 'de', source: 'excerpt' }, { sourceOutput: 'Ein Absatz.' });
  assert.equal(t.text, 'Ein Absatz.');
  assert.equal(t.lang, 'de');
  assert.equal(t.sourceId, 'excerpt');
  // An array from any emitter reads the same way it would in a text field.
  const lines = def.transform(null, { source: 'list' }, { sourceOutput: ['Ada Lovelace', 'Marie Curie'] });
  assert.equal(lines.text, 'Ada Lovelace\nMarie Curie');
  // And an untyped object is JSON, not speech — visible rather than silent.
  const obj = def.transform(null, { source: 'q' }, { sourceOutput: { rows: 3 } });
  assert.equal(obj.text, '{"rows":3}');
  assert.equal(obj.fromSource, true);
});

test('speaker: nothing wired → its own text field, and the configured speed is clamped', () => {
  const t = def.transform(null, { text: 'Hello', rate: '1.5' });
  assert.equal(t.text, 'Hello');
  assert.equal(t.rate, 1.5);
  assert.equal(t.fromSource, false);
  assert.equal(def.transform(null, { rate: '99' }).rate, RATE_MAX, 'Chrome-safe clamp');
  assert.equal(def.transform(null, { rate: 'nonsense' }).rate, 1);
  // An empty string from a source (a card that has fetched nothing) must not blank the text field.
  assert.equal(def.transform(null, { text: 'mine' }, { sourceOutput: '' }).text, 'mine');
});

test('translate: the translation travels as text AND as typed speech, on separate channels', () => {
  const def2 = WIDGET_TYPES.translate;
  const data = { translation: 'Marie Curie war eine Physikerin.', from: 'en', to: 'de' };
  const emitted = def2.emit(data, { translation: data.translation, to: data.to });
  assert.equal(emitted.translation, 'Marie Curie war eine Physikerin.');
  assert.deepEqual(emitted.speech, { type: 'speech', text: data.translation, lang: 'de' });
  // Compatibility: the bare id still means the translation (the `primary` channel), so every board wired
  // before channels existed keeps working — the failure this promise cost us once already.
  assert.equal(def2.outputs.translation, 'value');
  assert.equal(def2.outputs.speech, 'speech');
  assert.equal(def2.primary, 'translation');
});

test('translate: what the card shows is a choice, defaulting to both', () => {
  const def2 = WIDGET_TYPES.translate;
  const base = { text: 'Jazz is a music genre.', from: 'en' };
  const data = { translation: 'Le jazz est un genre musical.', from: 'en', to: 'fr' };
  assert.equal(def2.transform(data, base).display, 'both');
  assert.equal(def2.transform(data, { ...base, display: 'translation' }).display, 'translation');
  assert.equal(def2.transform(data, { ...base, display: 'source' }).display, 'source');
  assert.equal(def2.transform(data, { ...base, display: 'nonsense' }).display, 'both', 'unknown → the old look');
  assert.equal(def2.transform(data, base).original, 'Jazz is a music genre.');
});

test('speaker: a dashboard containing the widget passes the constitution validator', () => {
  const res = validateDashboard({
    version: 1,
    widgets: [{ id: 's1', widgetType: 'speaker', config: { text: 'hi' } }],
    layout: [{ i: 's1', x: 0, y: 0, w: 4, h: 3 }],
  });
  assert.ok(res.valid ?? res.ok ?? res === true, `expected valid, got ${JSON.stringify(res)}`);
});

// ── pure speech helpers ────────────────────────────────────────

test('speech: rate clamp keeps Chrome-safe bounds [0.5, 2]', () => {
  assert.equal(clampRate(0.4), RATE_MIN);
  assert.equal(clampRate(2.5), RATE_MAX);
  assert.equal(clampRate(3), RATE_MAX, 'rate > 2 wedges Chrome speechSynthesis');
  assert.equal(clampRate(1.2), 1.2);
  assert.equal(clampRate(NaN), 1);
  assert.equal(clampVolume(1.5), VOLUME_CAP);
  assert.equal(clampVolume(-1), 0);
});

test('speech: pickVoice falls back by name → language → English → first', () => {
  const roster = [
    { name: 'Samantha', lang: 'en-US' },
    { name: 'Daniel', lang: 'en-GB' },
    { name: 'Thomas', lang: 'fr-FR' },
  ];
  assert.equal(pickVoice(roster, { voice: 'daniel' }).name, 'Daniel', 'case-insensitive name match');
  assert.equal(pickVoice(roster, { lang: 'fr-FR' }).name, 'Thomas');
  assert.equal(pickVoice(roster, { lang: 'de-DE' }).name, 'Samantha', 'falls to English voice');
  assert.equal(pickVoice(roster, {}).name, 'Samantha');
  assert.equal(pickVoice([], {}), null);
  assert.equal(pickVoice(roster, { lang: 'en-AU' }).name, 'Samantha', 'primary-subtag match');
});

test('speech: canSpeak — the widget safety predicate', () => {
  const ok = { voices: [{ name: 'A' }], armed: true, muted: false, text: 'hi' };
  assert.equal(canSpeak(ok), true);
  assert.equal(canSpeak({ ...ok, armed: false }), false, 'not armed → never speaks');
  assert.equal(canSpeak({ ...ok, muted: true }), false, 'muted → never speaks');
  assert.equal(canSpeak({ ...ok, voices: [] }), false, 'zero voices → degrades');
  assert.equal(canSpeak({ ...ok, text: '   ' }), false, 'empty text → nothing to say');
});

// ── controller with a fake synth ───────────────────────────────

function fakeSynth() {
  const state = { cancelled: 0, spoken: [], voices: [{ name: 'Samantha', lang: 'en-US' }] };
  const utterances = [];
  state.utterances = utterances;
  const synth = {
    _state: state,
    getVoices: () => state.voices,
    cancel: () => { state.cancelled += 1; utterances.forEach((u) => u.onerror?.({ error: 'interrupted' })); utterances.length = 0; },
    speak: (u) => { state.spoken.push(u.text); utterances.push(u); },
  };
  class Utterance { constructor(text) { this.text = text; } }
  return { synth, Utterance, state, utterances };
}

test('speech: controller refuses to speak when muted', () => {
  const { synth, Utterance } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  assert.equal(ctl.isMuted(), false);
  ctl.setMuted(true);
  const r = ctl.speak('hello');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'muted');
  assert.equal(synth._state.spoken.length, 0);
});

test('speech: controller refuses empty text / missing synth', () => {
  const { synth, Utterance } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  assert.equal(ctl.speak('  ').reason, 'empty');
  const none = createSpeechController({});
  assert.equal(none.hasSynth(), false);
  assert.equal(none.speak('hi').reason, 'no-synth');
  none.setMuted(true);
  assert.equal(none.isMuted(), true);
});

test('speech: speak cancels first (one voice at a time + Chrome wedge guard)', () => {
  const { synth, Utterance, state } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  assert.equal(ctl.speak('one').ok, true);
  assert.equal(ctl.speak('two').ok, true);
  assert.equal(state.cancelled, 2, 'cancel before every speak');
  assert.deepEqual(state.spoken, ['one', 'two']);
});

test('speech: mute change notifies subscribers; toggle flips', () => {
  const { synth, Utterance } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  let seen = null;
  const unsub = ctl.onMuteChange((m) => { seen = m; });
  ctl.setMuted(true);
  assert.equal(seen, true);
  ctl.toggleMuted();
  assert.equal(seen, false);
  assert.equal(ctl.isMuted(), false);
  unsub();
  ctl.setMuted(true);
  assert.equal(seen, false, 'unsubscribed listener not called');
});

test('speech: speak fires utterance events and rate/volume are clamped', () => {
  const { synth, Utterance, state } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  const events = [];
  const r = ctl.speak('hi', { rate: 9, volume: 3, onstart: () => events.push('start'), onend: () => events.push('end') });
  assert.equal(r.ok, true);
  assert.equal(state.spoken[0], 'hi');
  state.utterances[0].onstart?.();
  state.utterances[0].onend?.();
  assert.deepEqual(events, ['start', 'end']);
});

test('speech: cancel() surfaces interrupted to the old utterance only', () => {
  const { synth, Utterance } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  const errors = [];
  ctl.speak('a', { onerror: (c) => errors.push(c) });
  ctl.stopAll();
  assert.ok(errors.includes('interrupted'));
  assert.equal(ctl.speak('b').ok, true);
});
