/**
 * Board params constitution (ISSUE-50) — the contracts the interactivity
 * prototype depends on:
 *  - parseParams: types normalized (buttons/select/text), defaults to
 *    options[0], junk tolerated.
 *  - resolveParams: {{name}} substitution in strings (deep), numbers and
 *    booleans untouched, UNKNOWN names left literal (never break a board),
 *    identity preserved when nothing resolves (so React memo works).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, resolveParams, parseParamSpecText, paramSpecToText } from '../src/lib/params.js';

test('parseParams: defaults to first option; explicit value wins', () => {
  const { specs, values } = parseParams({
    category: { label: 'Museum', type: 'buttons', options: ['A', 'B'], value: 'B' },
    year: { options: ['2023', '2024'] },
  });
  assert.equal(values.category, 'B');
  assert.equal(values.year, '2023'); // no value → first option
  assert.equal(specs.category.type, 'buttons');
  assert.equal(specs.year.type, 'select'); // options without type → select
  assert.equal(specs.year.label, 'year'); // label defaults to name
});

test('parseParams: text type, junk tolerated', () => {
  const { specs, values } = parseParams({ q: { type: 'text', value: 'Einstein' }, junk: 'string', empty: null });
  assert.equal(values.q, 'Einstein');
  assert.equal(specs.junk, undefined); // string shorthand ignored in v1
  assert.equal(specs.empty, undefined);
});

test('resolveParams: substitutes {{name}} in string fields, deep', () => {
  const values = { category: 'Images from the Met' };
  assert.equal(
    resolveParams({ category: '{{category}}', title: 'Photos of {{category}} (sample)' }, values).category,
    'Images from the Met',
  );
  assert.equal(
    resolveParams({ nested: { deep: ['{{category}}'] } }, values).nested.deep[0],
    'Images from the Met',
  );
});

test('resolveParams: numbers, booleans, and placeholder-free configs pass through untouched', () => {
  const cfg = { n: 6, flag: true, wiki: 'commons.wikimedia' };
  assert.equal(resolveParams(cfg, { category: 'X' }), cfg); // identity preserved
  const out = resolveParams({ n: '{{category}}' }, { category: 'X' });
  assert.equal(typeof out.n, 'string'); // substitution is string-level, by design
});

test('resolveParams: unknown names left LITERAL (never break a board)', () => {
  const cfg = { category: '{{nope}}' };
  assert.equal(resolveParams(cfg, { other: 'X' }), cfg);
  assert.equal(resolveParams({ a: '{{nope}}', b: '{{yes}}' }, { yes: 'Y' }).a, '{{nope}}');
  assert.equal(resolveParams({ a: '{{nope}}', b: '{{yes}}' }, { yes: 'Y' }).b, 'Y');
});

test('resolveParams: whitespace-tolerant placeholders', () => {
  assert.equal(resolveParams({ a: '{{ category }}' }, { category: 'X' }).a, 'X');
});

// ── ISSUE-50 follow-up: editable spec text (Board Controls ⚙ panel) ──────

test('parseParamSpecText: full line format → block', () => {
  const block = parseParamSpecText(
    'category | buttons | Collection | Smithsonian, Rijksmuseum\nyear | select | Year | 2023, 2024\nquery | text | Search',
  );
  assert.deepEqual(block.category, { label: 'Collection', type: 'buttons', options: ['Smithsonian', 'Rijksmuseum'] });
  assert.deepEqual(block.year, { label: 'Year', type: 'select', options: ['2023', '2024'] });
  assert.deepEqual(block.query, { label: 'Search', type: 'text' }); // no options → text stays
});

test('parseParamSpecText: junk tolerated (bad names skipped, comments, blank lines)', () => {
  const block = parseParamSpecText('# a comment\n\nok | text | Ok\nbad name!! | text | X');
  assert.deepEqual(Object.keys(block), ['ok']);
});

test('parseParamSpecText: options without type default to select', () => {
  const block = parseParamSpecText('size | Small, Large');
  assert.equal(block.size.type, 'select');
  assert.deepEqual(block.size.options, ['Small', 'Large']);
});

test('paramSpecToText roundtrips through parseParamSpecText', () => {
  const block = { category: { label: 'Collection', type: 'buttons', options: ['A', 'B'] }, q: { label: 'Search', type: 'text' } };
  const text = paramSpecToText(block);
  const back = parseParamSpecText(text);
  assert.deepEqual(back, block);
});
