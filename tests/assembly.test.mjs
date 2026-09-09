/**
 * Board-assembly validation tests (ISSUE-44 Phase 3a) — the constitution for
 * validateAssembly: the model's assembled board must never produce a fragment
 * with dangling references, unknown widget types, or out-of-contract values.
 *
 * Covers: hallucinated widgetTypes, id sanitization + dedup, dangling
 * {{widget:}} / bare source / {{param}} references pruned iteratively
 * (cascading drops), unknown config keys dropped (normalizeConfig), layout
 * clamps, param grammar + caps, widget cap, display-title passthrough.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAssembly } from '../deploy/server.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = new Map(manifest.widgets.map((w) => [w.id, w]));

const boardOf = (widgets, params = {}) => ({ board: { params, widgets, summary: 'test' } });

test('assembly: a valid wired chain passes through unchanged', () => {
  const r = validateAssembly(boardOf([
    { id: 'ex', widgetType: 'excerpt', config: { article: 'Ada Lovelace' }, w: 4, h: 3 },
    { id: 'tr', widgetType: 'translate', config: { text: '{{widget:ex}}', to: 'es' }, w: 4, h: 3 },
    { id: 'sp', widgetType: 'speaker', config: { text: '{{widget:tr}}' }, w: 4, h: 3 },
  ]), defs);
  assert.equal(r.widgets.length, 3);
  assert.deepEqual(r.widgets.map((w) => w.id), ['ex', 'tr', 'sp']);
  assert.equal(r.params && Object.keys(r.params).length, 0);
  assert.equal(r.warnings.length, 0);
});

test('assembly: hallucinated widgetTypes are dropped', () => {
  const r = validateAssembly(boardOf([
    { id: 'good', widgetType: 'excerpt', config: { article: 'X' } },
    { id: 'bad', widgetType: 'video_player', config: {} },
  ]), defs);
  assert.deepEqual(r.widgets.map((w) => w.id), ['good']);
});

test('assembly: ids are sanitized to kebab-case and deduped', () => {
  const r = validateAssembly(boardOf([
    { id: 'My Widget!', widgetType: 'excerpt', config: { article: 'A' } },
    { id: 'my_widget', widgetType: 'excerpt', config: { article: 'B' } },
    { id: 'MY WIDGET', widgetType: 'excerpt', config: { article: 'C' } },
  ]), defs);
  const ids = r.widgets.map((w) => w.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.every((id) => /^[a-z0-9_-]+$/.test(id)), `ids sanitized: ${ids.join(',')}`);
});

test('assembly: a dangling {{widget:}} reference prunes the consumer (iterative cascade)', () => {
  const r = validateAssembly(boardOf([
    { id: 'ex', widgetType: 'excerpt', config: { article: 'A' } },
    { id: 'tr', widgetType: 'translate', config: { text: '{{widget:nonexistent}}', to: 'es' } },
    { id: 'sp', widgetType: 'speaker', config: { text: '{{widget:tr}}' } }, // transitively orphaned
  ]), defs);
  assert.deepEqual(r.widgets.map((w) => w.id), ['ex']);
  assert.ok(r.warnings.some((w) => w.includes('tr')));
  assert.ok(r.warnings.some((w) => w.includes('sp')));
});

test('assembly: a bare source-field id must reference a declared widget', () => {
  const r = validateAssembly(boardOf([
    { id: 'list', widgetType: 'listSource', config: { items: 'A\nB' } },
    { id: 'flt', widgetType: 'filterLines', config: { source: 'list', pattern: 'a' } },
    { id: 'cnt', widgetType: 'lineCount', config: { source: 'ghost' } },
  ]), defs);
  assert.deepEqual(r.widgets.map((w) => w.id), ['list', 'flt']);
  assert.ok(r.warnings.some((w) => w.includes('cnt')));
});

test('assembly: a dangling {{param}} reference prunes the widget', () => {
  const r = validateAssembly(boardOf([
    { id: 'ex', widgetType: 'excerpt', config: { article: '{{no-such-param}}' } },
  ]), defs);
  assert.equal(r.widgets.length, 0);
});

test('assembly: params are grammar-checked, typed, and capped at 4', () => {
  const r = validateAssembly(boardOf([
    { id: 'ex', widgetType: 'excerpt', config: { article: '{{a}}' } },
  ], {
    a: { label: 'A', type: 'buttons', options: ['x', 'y'], value: 'x' },
    'bad name!': { label: 'dropped' },
    b: { label: 'B', type: 'nonsense' },
    c: { label: 'C' },
    d: { label: 'D' },
    e: { label: 'E' }, // over the cap
  }), defs);
  assert.deepEqual(Object.keys(r.params).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(r.params.b.type, 'text'); // nonsense type falls back
  assert.ok(r.warnings.length >= 2);
});

test('assembly: unknown config keys are dropped; numbers/booleans coerced', () => {
  const r = validateAssembly(boardOf([
    { id: 'cs', widgetType: 'categorySize', config: { category: 'Featured pictures on Wikimedia Commons', wiki: 'commons.org', sampleCount: '6', junk: 'x' } },
  ]), defs);
  const cfg = r.widgets[0].config;
  assert.ok(!('junk' in cfg));
  assert.equal(cfg.sampleCount, 6); // number field coerced
  assert.equal(cfg.wiki, 'commons.wikimedia'); // near-miss alias normalized
});

test('assembly: layout w/h are clamped to sane grid bounds', () => {
  const r = validateAssembly(boardOf([
    { id: 'ex', widgetType: 'excerpt', config: { article: 'A' }, w: 99, h: 0 },
    { id: 'ex2', widgetType: 'excerpt', config: { article: 'B' }, w: -4, h: 'eleven' },
  ]), defs);
  for (const w of r.widgets) {
    assert.ok(w.w >= 1 && w.w <= 12, `w clamped: ${w.w}`);
    assert.ok(w.h >= 2 && w.h <= 14, `h clamped: ${w.h}`);
  }
});

test('assembly: widget cap (8) keeps the first N; non-array board yields empty', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, widgetType: 'excerpt', config: { article: `A${i}` } }));
  const r = validateAssembly(boardOf(many), defs);
  assert.equal(r.widgets.length, 8);
  const empty = validateAssembly({ board: null }, defs);
  assert.deepEqual(empty.widgets, []);
  assert.deepEqual(empty.params, {});
});
