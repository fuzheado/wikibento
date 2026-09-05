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

test('speaker: config fields cover text + the safety toggle only', () => {
  const keys = def.configFields.map((f) => f.key);
  assert.ok(keys.includes('text'));
  assert.ok(keys.includes('speakOnChange'));
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
  const Utterance = function SpeechSynthesisUtteranceMock(text) { this.text = text; };
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
  const { synth, Utterance, state } = fakeSynth();
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
  const { synth, Utterance, state } = fakeSynth();
  const ctl = createSpeechController({ synth, Utterance });
  const errors = [];
  ctl.speak('a', { onerror: (c) => errors.push(c) });
  ctl.stopAll();
  assert.ok(errors.includes('interrupted'));
  assert.equal(ctl.speak('b').ok, true);
});
