/**
 * Manifest compliance (ASK-ARCHITECTURE plan items 1–2, 2026-09-09).
 *
 * Runs against public/manifest.json, which `npm test` regenerates first
 * (`node scripts/generate-manifest.mjs` is prepended to the test script), so
 * this suite guards the generator + registry-declared dataflow metadata:
 *
 * 1. Description integrity — no apostrophe-truncation artifacts (the v2
 *    regex bug that cut filterLines/lineCount descriptions to "Consume
 *    another widget").
 * 2. Emitter declarations — the five emitting widgets must declare the
 *    output kind that their `emit` produces.
 * 3. Consumer declarations — source-field widgets must be flagged
 *    consumesSource and document their source field.
 * 4. Node roles + scope — every widget carries a valid nodeKind and
 *    timeScope; the non-source roles are correct where declared.
 * 5. Config-field shape — every config field has key + type; dataflow
 *    fields carry their hint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(
  await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'),
);
const byId = new Map(manifest.widgets.map((w) => [w.id, w]));

const KNOWN_EMITTERS = {
  excerpt: 'extract',
  listSource: 'lines',
  filterLines: 'lines',
  lineCount: 'count',
  echo: 'value',
};
const KNOWN_NODE_KINDS = {
  filterLines: 'transformer',
  lineCount: 'reducer',
  echo: 'display',
  boardControls: 'controller',
  speaker: 'effector',
  translate: 'ai',
  markdown: 'display',
  wikiPage: 'display',
};
const ALLOWED_NODE_KINDS = ['source', 'controller', 'transformer', 'reducer', 'display', 'effector', 'ai'];
const ALLOWED_TIME_SCOPES = ['month', 'range', 'day', 'point'];

test('manifest is v3 with a full catalog', () => {
  assert.equal(manifest.version, 3);
  assert.ok(manifest.widgetCount >= 35, `widgetCount ${manifest.widgetCount} >= 35`);
  assert.equal(manifest.widgets.length, manifest.widgetCount);
  const ids = manifest.widgets.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length, 'widget ids are unique');
});

test('no description is truncated at an apostrophe (v2 bug regression)', () => {
  for (const w of manifest.widgets) {
    const d = w.description || '';
    assert.ok(!d.endsWith('\\'), `${w.id}: description ends with a stray backslash: ${d}`);
    assert.ok(!d.includes("\\'"), `${w.id}: description contains an unescaped apostrophe artifact: ${d}`);
  }
  const fl = byId.get('filterLines').description;
  assert.ok(fl.length > 50 && fl.includes('output'), `filterLines description restored: ${fl}`);
});

test('the five emitters declare their output kinds', () => {
  for (const [id, kind] of Object.entries(KNOWN_EMITTERS)) {
    const w = byId.get(id);
    assert.ok(w, `emitter ${id} exists`);
    assert.equal(w.outputs?.kind, kind, `${id} outputs.kind === '${kind}'`);
  }
});

test('source-consuming widgets are flagged and documented', () => {
  for (const id of ['filterLines', 'lineCount', 'echo']) {
    const w = byId.get(id);
    assert.equal(w.consumesSource, true, `${id} consumesSource`);
    const sourceField = w.configFields.find((f) => f.key === 'source');
    assert.ok(sourceField, `${id} has a source config field`);
    assert.equal(sourceField.type, 'source');
    assert.ok(sourceField.label, `${id} source field has a label`);
    assert.ok(sourceField.hint, `${id} source field has a hint`);
  }
  // non-consumers must not be flagged
  for (const id of ['excerpt', 'listSource', 'translate', 'categorySize']) {
    assert.equal(byId.get(id).consumesSource, false, `${id} not consumesSource`);
  }
});

test('every widget carries a valid nodeKind and timeScope', () => {
  for (const w of manifest.widgets) {
    assert.ok(ALLOWED_NODE_KINDS.includes(w.nodeKind), `${w.id} nodeKind ${w.nodeKind} valid`);
    assert.ok(ALLOWED_TIME_SCOPES.includes(w.timeScope), `${w.id} timeScope ${w.timeScope} valid`);
  }
  for (const [id, kind] of Object.entries(KNOWN_NODE_KINDS)) {
    assert.equal(byId.get(id).nodeKind, kind, `${id} nodeKind === ${kind}`);
  }
});

test('config fields are well-formed and documented', () => {
  for (const w of manifest.widgets) {
    for (const f of w.configFields) {
      assert.equal(typeof f.key, 'string', `${w.id} field key`);
      assert.ok(f.key.length > 0);
      assert.equal(typeof f.type, 'string', `${w.id} field ${f.key} type`);
      if (f.type === 'source') assert.ok(f.hint, `${w.id} ${f.key} source field documented`);
    }
  }
});
