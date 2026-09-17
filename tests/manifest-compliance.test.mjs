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
  excerpt: { extract: 'extract', reference: 'value' },
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

test('a multi-channel widget says what its bare id means (the compatibility rule)', () => {
  // Channels were added as a *compatible* change: `{{widget:id}}` must keep meaning what it always meant. A widget
  // that publishes several things therefore declares which one the bare id is — the Article Excerpt taught this the
  // hard way by emptying the bare id, which left `translate` in the demo waiting for a value forever.
  for (const w of manifest.widgets) {
    if (!w.outputs || 'kind' in w.outputs) continue;
    assert.ok(w.primary, `${w.id} names several channels without saying which one the bare id means`);
    assert.ok(w.primary in w.outputs, `${w.id}: primary "${w.primary}" is not one of its channels`);
  }
});

test('a widget that emits prose declares where the prose came from (ISSUE-92)', () => {
  // The one shape that cannot self-describe: an `extract` is text, so nothing inside it says which page or which
  // wiki it came from. A widget that publishes one therefore has to publish a `reference` beside it — this is the
  // gate that stops a new emitter quietly dropping the context again, the way `excerpt` did for months.
  const prose = manifest.widgets.filter((w) => w.outputs && Object.values(w.outputs).includes('extract'));
  assert.ok(prose.length > 0, 'the registry should still have a prose emitter to check');
  for (const w of prose) {
    assert.ok(w.outputs.reference, `${w.id} emits prose without a reference channel`);
    assert.equal(w.outputs.reference, 'value', `${w.id}: the reference channel is a value`);
  }
});

test('a project or language field uses the picker, not a hardcoded list (ISSUE-93)', () => {
  // The sweep this protects: five widgets once offered 6, 3, 2, 13 and 30 options while the site matrix holds 364
  // wikis and 374 languages. A new widget that types out its own list is how that happened, so the registry is
  // checked rather than trusted — a hand-rolled `select` for `project`, `wiki` or `lang` fails the build.
  const offenders = [];
  for (const w of manifest.widgets) {
    for (const f of w.configFields || []) {
      if (!['project', 'wiki', 'lang'].includes(f.key)) continue;
      if (f.type !== 'project') offenders.push(`${w.id}.${f.key}: type "${f.type}"`);
    }
  }
  assert.deepEqual(offenders, [], `project fields must use the shared picker:\n  ${offenders.join('\n  ')}`);
});

test('the five emitters declare their output kinds', () => {
  for (const [id, kind] of Object.entries(KNOWN_EMITTERS)) {
    const w = byId.get(id);
    assert.ok(w, `emitter ${id} exists`);
    assert.ok(w.outputs, `${id} declares outputs`);
    // Named channels (ISSUE-92): a widget may publish more than one thing, e.g. the Article Excerpt's prose *and*
    // the page it came from. The map is checked key-by-key above; a single-output widget keeps its `{ kind }`.
    // Two shapes, one meaning (ISSUE-91): a single output is `{ kind }`, while a widget with named channels —
    // a box that publishes both its items and the reader's selection — maps channel → kind.
    const expected = typeof kind === 'string' ? kind : null;
    if ('kind' in w.outputs && expected) assert.equal(w.outputs.kind, expected, `${id} outputs.kind === '${expected}'`);
    if (!('kind' in w.outputs)) {
      const kinds = Object.values(w.outputs);
      assert.ok(kinds.length > 0, `${id} names at least one channel`);
      assert.ok(kinds.every((k) => typeof k === 'string'), `${id} channel kinds are strings`);
    }
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


test('emitter output kinds stay within the documented set (emitter contract)', () => {
  // docs/WIDGET-DEVELOPMENT.md -> "The Emitter Contract": a new output kind is a
  // design act (a real consumer, doc entries, an askManual() phrase, a size
  // policy) — this allowlist makes that decision loud instead of accidental.
  const DOCUMENTED = ['extract', 'lines', 'count', 'value'];
  for (const w of manifest.widgets) {
    if (!w.outputs) continue;
    const kinds = 'kind' in w.outputs ? [w.outputs.kind] : Object.values(w.outputs);
    for (const one of kinds) assert.ok(
      DOCUMENTED.includes(one),
      `${w.id}: output kind "${one}" is not in the documented set [${DOCUMENTED.join(', ')}] — `
      + 'see docs/WIDGET-DEVELOPMENT.md "The Emitter Contract" (and docs/MEDIA-DATAFLOW.md for non-text outputs)',
    );
  }
});
