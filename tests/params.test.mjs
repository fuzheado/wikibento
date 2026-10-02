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
import { validateDashboard } from '../src/lib/dashboardConfig.js';
import { normalizeConfigForDef } from '../src/lib/configNormalize.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

test('validateDashboard RETURNS the params block (⬆ Import used to drop it — Ask audit, 2026-10-01)', () => {
  // The defect: `validateDashboard` validated a board and returned `{valid, errors, warnings, widgets, layout}` — no
  // params — and ImportPanel passed only widgets+layout on. A pasted parameterised board therefore lost its switcher
  // and every card reading {{name}} showed "Waiting for a reference", with nothing to say why.
  const board = {
    version: 1,
    params: { institution: { label: 'Institution', type: 'buttons', options: ['Met', 'Smithsonian'], value: 'Met' } },
    widgets: [{ id: 'note', widgetType: 'markdown', config: { text: '{{institution}}' } }],
    layout: [{ i: 'note', x: 0, y: 0, w: 4, h: 3 }],
  };
  const ok = validateDashboard(JSON.stringify(board));
  assert.equal(ok.valid, true, ok.errors.join('; '));
  assert.deepEqual(Object.keys(ok.params), ['institution'], 'the params travel with the board');
  assert.deepEqual(parseParams(ok.params).values, { institution: 'Met' }, 'and they still parse');

  // The invalid paths answer with a shape the caller can rely on (params: null), so `result.params` is never undefined.
  const badJson = validateDashboard('{ not json');
  assert.equal(badJson.valid, false);
  assert.equal(badJson.params, null);
  const badParams = validateDashboard(JSON.stringify({ ...board, params: ['nope'] }));
  assert.equal(badParams.valid, false);
  assert.ok(badParams.errors.some((e) => e.includes('"params" must be an object')));

  // A board WITHOUT params is written by our own Export as `"params": null` — absent, not invalid (the demos carry it).
  const noParams = validateDashboard(JSON.stringify({ version: 1, params: null, widgets: [{ id: 'n', widgetType: 'markdown', config: { text: 'x' } }], layout: [{ i: 'n', x: 0, y: 0, w: 4, h: 3 }] }));
  assert.equal(noParams.valid, true, noParams.errors.join('; '));
  assert.equal(noParams.params, null);

  // A parameter name that cannot be referenced is a warning, not a refusal (the board still renders).
  const oddName = validateDashboard(JSON.stringify({ ...board, params: { 'my param': { label: 'x', type: 'text' } } }));
  assert.equal(oddName.valid, true);
  assert.ok(oddName.warnings.some((w) => w.includes('my param')));
});

test('`wiki` is read as `project` on the app side too, and the validator says so', () => {
  // The advisor writes `wiki:` where the registry says `project:` (3 of 30 rows in the audit). Repaired at *render*
  // time so every intake path gets it, and reported by the validator because it changes which wiki is read.
  const gallery = WIDGET_TYPES.gallery;
  const repaired = normalizeConfigForDef({ from: 'category', category: 'Featured pictures', wiki: 'commons.wikimedia' }, gallery);
  assert.equal(repaired.project, 'commons.wikimedia');
  assert.equal(repaired.wiki, undefined);
  // An explicit project wins over the alias.
  assert.equal(normalizeConfigForDef({ project: 'de.wikipedia', wiki: 'commons.wikimedia' }, gallery).project, 'de.wikipedia');
  // A widget with its own `wiki` field keeps it (nothing is aliased away by accident).
  const withWiki = (WIDGET_TYPES.categorySize || {});
  if ((withWiki.configFields || []).some((f) => f.key === 'wiki')) {
    assert.equal(normalizeConfigForDef({ wiki: 'commons.wikimedia' }, withWiki).wiki, 'commons.wikimedia');
  }

  const result = validateDashboard(JSON.stringify({
    version: 1,
    widgets: [{ id: 'gl', widgetType: 'gallery', config: { from: 'category', category: 'X', wiki: 'commons.wikimedia' } }],
    layout: [{ i: 'gl', x: 0, y: 0, w: 4, h: 4 }],
  }));
  assert.ok(result.warnings.some((w) => w.includes('read as "project"')), result.warnings.join(' | '));
});

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

// ── ISSUE-50 #4/#5: number + month param types ──────────────────────────

test('number params: options = [min, max, step]; value defaults to min', () => {
  const { specs, values } = parseParams({ count: { type: 'number', label: 'Photos', options: [3, 12, 1] } });
  assert.equal(values.count, '3'); // string value — fetchers parseInt
  assert.deepEqual(specs.count.options, ['3', '12', '1']);
});

test('month params: default value 0 (latest available)', () => {
  const { values } = parseParams({ month: { type: 'month', label: 'Data month' } });
  assert.equal(values.month, '0');
  const { values: v2 } = parseParams({ month: { type: 'month', value: 7 } });
  assert.equal(v2.month, '7');
});

test('spec text: number form parses min,max,step; month form parses bare', () => {
  const block = parseParamSpecText('count | number | Photos | 3, 12, 1\nmonth | month | Data month');
  assert.deepEqual(block.count.options, ['3', '12', '1']);
  assert.equal(block.count.type, 'number');
  assert.equal(block.month.type, 'month');
  assert.equal(block.month.options, undefined);
});
