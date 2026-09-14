import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configFieldValue } from '../src/lib/configFields.js';

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
