import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configFieldValue, fieldVisible } from '../src/lib/configFields.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { paramSpecToText } from '../src/lib/params.js';
import { readFileSync } from 'node:fs';

/**
 * What the ⚙ panel shows for a field.
 *
 * The bug this pins: a board stores a PRESET and no query, `fetch` runs `config.query || preset.query`,
 * and the panel showed the stored value — so the gear on any preset-backed SPARQL widget opened an EMPTY
 * query box, hiding the query that was actually running.
 */

const field = (key, fallbackValue) => ({ key, ...(fallbackValue ? { fallbackValue } : {}) });

test('a stored value always wins over the fallback', () => {
  const f = field('query', () => 'PRESET QUERY');
  assert.equal(configFieldValue(f, { query: 'SELECT ?s WHERE { ?s ?p ?o }' }), 'SELECT ?s WHERE { ?s ?p ?o }');
});

test('an empty or absent value falls back (the preset case)', () => {
  const f = field('query', (c) => (c.preset === 'two-lives' ? 'SELECT two lives' : ''));
  assert.equal(configFieldValue(f, { query: '', preset: 'two-lives' }), 'SELECT two lives');
  assert.equal(configFieldValue(f, { preset: 'two-lives' }), 'SELECT two lives', 'absent key');
  assert.equal(configFieldValue(f, { query: null, preset: 'two-lives' }), 'SELECT two lives');
});

test('falsy-but-real values are not treated as empty', () => {
  // 0 and false are legitimate stored settings; only '' and null/undefined are "nothing stored".
  assert.equal(configFieldValue(field('maxRows', () => 100), { maxRows: 0 }), 0);
  assert.equal(configFieldValue(field('showOverlap', () => true), { showOverlap: false }), false);
});

test('no fallback declared → the stored value, or empty', () => {
  assert.equal(configFieldValue(field('title'), {}), '');
  assert.equal(configFieldValue(field('title'), { title: 'Two lives' }), 'Two lives');
});

test('a fallback that returns nothing does not invent a value', () => {
  assert.equal(configFieldValue(field('query', () => undefined), { query: '' }), '');
  assert.equal(configFieldValue(field('query', () => null), {}), '');
});

test('a field with no key or no config is safe', () => {
  assert.equal(configFieldValue({}, undefined), '');
  assert.equal(configFieldValue(undefined, {}), '');
});

test('showIf: a source-specific field appears only for its source', () => {
  const files = { key: 'files', showIf: { from: 'list' } };
  const category = { key: 'category', showIf: { from: 'category' } };
  const plain = { key: 'order' };
  const defaults = { from: 'list' };

  // the registry default decides when the config says nothing (a widget added with its defaults)
  assert.equal(fieldVisible(plain, {}, defaults), true);
  assert.equal(fieldVisible(files, {}, defaults), true);
  assert.equal(fieldVisible(category, {}, defaults), false);

  // a stored value wins over the default
  assert.equal(fieldVisible(category, { from: 'category' }, defaults), true);
  assert.equal(fieldVisible(files, { from: 'category' }, defaults), false);

  // an empty string counts as unset, not as a value
  assert.equal(fieldVisible(files, { from: '' }, defaults), true);

  // every condition in showIf must hold
  const both = { key: 'x', showIf: { from: 'category', wiki: 'commons.wikimedia' } };
  assert.equal(fieldVisible(both, { from: 'category', wiki: 'commons.wikimedia' }, defaults), true);
  assert.equal(fieldVisible(both, { from: 'category', wiki: 'en.wikipedia' }, defaults), false);
});

test('the panel shows the value the card is rendering — the registry default', () => {
  // The class this guards (2026-09-18): a field left at its default showed an EMPTY box while the card rendered the
  // default's value. Worst case was boolean: `default: true` (e.g. hideDecorative) rendered checked and showed an
  // unchecked box, because the input read `!!widget.config[key]` directly. Whatever the card uses is what the box shows.
  assert.equal(configFieldValue({ key: 'lang' }, {}, { lang: 'en' }), 'en');
  assert.equal(configFieldValue({ key: 'lang' }, { lang: 'de' }, { lang: 'en' }), 'de');   // a stored value wins
  assert.equal(configFieldValue({ key: 'hideDecorative' }, {}, { hideDecorative: true }), true);
  assert.equal(configFieldValue({ key: 'x' }, {}, {}), '');
  // …and a fallbackValue receives board context, which is how the Board Controls spec box gets filled
  const withCtx = { key: 'spec', fallbackValue: (c, x) => ((x && x.paramSpecs) ? 'FROM BOARD' : '') };
  assert.equal(configFieldValue(withCtx, {}, {}, { paramSpecs: { a: 1 } }), 'FROM BOARD');
  assert.equal(configFieldValue(withCtx, {}, {}, {}), '');
});

test('AUDIT: no field shows an empty box while the card renders a value', () => {
  // The systematic version of the bug above — every widget, every field. A field with a registry default must be
  // visible with that default when nothing is stored; a field with a fallbackValue is exempt because its own logic
  // decides (presets, board params), and a field with neither is genuinely empty.
  const missing = [];
  for (const [type, def] of Object.entries(WIDGET_TYPES)) {
    for (const field of def.configFields || []) {
      const want = def.defaults && def.defaults[field.key];
      if (want === undefined || field.fallbackValue) continue;
      const shown = configFieldValue(field, {}, def.defaults, {});
      if (String(shown) !== String(want)) {
        missing.push(`${type}.${field.key} shows ${JSON.stringify(shown)} but renders ${JSON.stringify(want)}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("the reporter's board renders in the panel, not an empty box (ISSUE-110)", () => {
  // The exact case: `?config=/category-images-demo.json` declares its params in the BOARD's params block, and the
  // Board Controls spec textarea was empty — the box disagreed with the three buttons on the card. Both halves are
  // asserted here: the params block renders as spec text, and that text is what the field shows.
  const board = JSON.parse(readFileSync(`${process.cwd()}/public/category-images-demo.json`, 'utf8'));
  const spec = paramSpecToText(board.params);
  assert.ok(spec.includes('category | buttons | Category | Images from XBio, Featured pictures, London'), spec);
  const control = WIDGET_TYPES.boardControls;
  const field = control.configFields.find((f) => f.key === 'spec');
  assert.equal(field.fallbackValue({}, { paramSpecs: board.params }), spec);
  assert.equal(configFieldValue(field, {}, control.defaults, { paramSpecs: board.params }), spec);
  // …and a widget that does carry its own spec keeps it (a stored value always wins)
  assert.equal(configFieldValue(field, { spec: 'mine | text | Mine' }, control.defaults, { paramSpecs: board.params }), 'mine | text | Mine');
});
