/**
 * Translator (MinT) widget — machine translation via Wikimedia MinT.
 *
 * Pure-logic constitution (no network in tests): request building, response
 * parsing, language-code normalization, truncation, registry contract, and
 * transform shape. The live path (CORS `*`, en→es 0.3 s, model nllb200-600M)
 * was verified 2026-09-05 with a real curl + browser probe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMinTRequest, parseMinTResponse, normalizeLangCode, MINT_MAX_CHARS,
} from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const def = WIDGET_TYPES.translate;

// ── registry contract ──────────────────────────────────────────

test('translate: registry entry is a fetch widget (network → translation)', () => {
  assert.ok(def, 'translate widget type exists');
  assert.equal(def.renderer, 'TranslateCard');
  assert.equal(def.timeScope, 'point');
  assert.equal(typeof def.fetch, 'function', 'async fetch (MinT POST)');
  assert.equal(typeof def.transform, 'function');
  assert.equal(def.defaults.from, 'en');
  assert.equal(def.defaults.to, 'es');
  assert.ok(String(def.defaults.text).length > 10, 'has demo text');
});

test('translate: config fields = text + from/to language codes', () => {
  const keys = def.configFields.map((f) => f.key);
  assert.deepEqual(keys, ['text', 'from', 'to']);
});

test('translate: transform maps data + config onto the card contract', () => {
  const t = def.transform(
    { translation: 'El jazz es un género musical…', model: 'nllb200-600M', from: 'en', to: 'es' },
    { text: 'Jazz is a music genre…', from: 'en', to: 'es' },
  );
  assert.equal(t.original, 'Jazz is a music genre…');
  assert.equal(t.translation, 'El jazz es un género musical…');
  assert.equal(t.model, 'nllb200-600M');
  assert.equal(t.from, 'en');
  assert.equal(t.to, 'es');
  assert.equal(t.truncated, false);
  // missing data fields fall back to config codes
  const t2 = def.transform({ translation: '' }, { text: 'x', from: 'EN', to: '' });
  assert.equal(t2.from, 'en', 'normalized fallback from config');
  assert.equal(t2.to, 'es', 'default target when empty');
  assert.equal(t2.truncated, false);
});

test('translate: a dashboard with the widget passes the constitution validator', () => {
  const res = validateDashboard({
    version: 1,
    widgets: [{ id: 't1', widgetType: 'translate', config: { text: 'Hello', from: 'en', to: 'fr' } }],
    layout: [{ i: 't1', x: 0, y: 0, w: 4, h: 3 }],
  });
  assert.ok(res.valid, `expected valid, got ${JSON.stringify(res.errors)}`);
});

// ── pure request/response helpers ──────────────────────────────

test('minT: request body uses the MinT field names (content/source_language/…)', () => {
  const { url, body, truncated } = buildMinTRequest('Hello world', 'en', 'es');
  assert.equal(url, 'https://translate.wmcloud.org/api/translate');
  const parsed = JSON.parse(body);
  assert.deepEqual(parsed, {
    content: 'Hello world',
    source_language: 'en',
    target_language: 'es',
    format: 'text',
  });
  assert.equal(truncated, false);
});

test('minT: language codes are normalized (trim/lower) with en→es defaults', () => {
  const { body } = buildMinTRequest('x', '  EN-GB ', 'FR');
  const parsed = JSON.parse(body);
  assert.equal(parsed.source_language, 'en-gb');
  assert.equal(parsed.target_language, 'fr');
  const dflt = JSON.parse(buildMinTRequest('x', '', '').body);
  assert.equal(dflt.source_language, 'en');
  assert.equal(dflt.target_language, 'es');
  assert.equal(normalizeLangCode('  SpAnIsH '), 'spanish');
  assert.equal(normalizeLangCode(null), '');
});

test('minT: content longer than the cap is truncated and flagged', () => {
  const long = 'a'.repeat(MINT_MAX_CHARS + 100);
  const { body, truncated } = buildMinTRequest(long, 'en', 'es');
  assert.equal(truncated, true);
  const parsed = JSON.parse(body);
  assert.equal(parsed.content.length, MINT_MAX_CHARS);
  const ok = buildMinTRequest('a'.repeat(MINT_MAX_CHARS), 'en', 'es');
  assert.equal(ok.truncated, false);
});

test('minT: empty/whitespace text still produces a valid request (server decides)', () => {
  const { body } = buildMinTRequest('   ', 'en', 'es');
  const parsed = JSON.parse(body);
  assert.equal(parsed.content, '');
});

test('minT: response parsing maps the wire payload to the card contract', () => {
  const out = parseMinTResponse({
    translation: 'El jazz…',
    translationtime: 0.29,
    sourcelanguage: 'en',
    targetlanguage: 'es',
    model: 'nllb200-600M',
  });
  assert.equal(out.translation, 'El jazz…');
  assert.equal(out.model, 'nllb200-600M');
  assert.equal(out.from, 'en');
  assert.equal(out.to, 'es');
  assert.equal(out.seconds, 0.29);
  // tolerant of missing fields
  const empty = parseMinTResponse({});
  assert.equal(empty.translation, '');
  assert.equal(empty.model, null);
  assert.equal(empty.seconds, null);
});

test('minT: model is surfaced so users know which NMT engine served it', () => {
  const out = parseMinTResponse({ translation: 'x', model: 'opusmt-tatoeba-en-es' });
  assert.equal(out.model, 'opusmt-tatoeba-en-es');
});
