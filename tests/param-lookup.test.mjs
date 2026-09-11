/**
 * Lookup-param constitution (ISSUE-67) — the contracts the validated "one box"
 * producer depends on. All pure: no network, no DOM.
 *
 *  - parseParams / parseParamSpecText / paramSpecToText round-trip `lookup`
 *    (the 4th spec field is a SOURCE id, not an option list) while leaving the
 *    other five types byte-identical.
 *  - normalizeLookupValue strips a redundant Category:/File: prefix and folds
 *    underscores to spaces (the Action API's canonical form — gotcha #13), so a
 *    pasted "Category:Images_from_the_Met" validates the same as the bare title.
 *  - matchRank / filterLocal: exact → prefix → word-start → substring, and an
 *    empty query is a browsable shortlist rather than nothing.
 *  - capabilityState: the three-state verdict, where "real category, not
 *    CIM-registered" is `unregistered` (amber, registerable) and NOT `invalid`
 *    (red, a typo) — the distinction the museum-dashboard UX rests on.
 *  - parsers tolerate junk payloads (a failed source must degrade to `unknown`,
 *    never throw into the widget).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseParams, parseParamSpecText, paramSpecToText } from '../src/lib/params.js';
import {
  normalizeLookupValue, matchRank, filterLocal, capabilityState, mergeSuggestions,
  parseEmbeddedIn, parseActionSearch, parseWbSearchEntities,
  getParamSource, PARAM_SOURCE_IDS, PARAM_SOURCES,
} from '../src/lib/paramSources.js';

// ── spec/JSON round-trip ────────────────────────────────────────────────────

test('parseParams accepts the lookup type and keeps its source', () => {
  const { specs, values } = parseParams({
    institution: { label: 'Institution', type: 'lookup', source: 'cim-category', value: 'Images from the Met' },
  });
  assert.equal(specs.institution.type, 'lookup');
  assert.equal(specs.institution.source, 'cim-category');
  assert.equal(specs.institution.label, 'Institution');
  assert.equal(values.institution, 'Images from the Met');
});

test('parseParams: lookup options are a curated shortlist, not the source', () => {
  const { specs } = parseParams({
    institution: { type: 'lookup', source: 'cim-category', options: ['A', 'B'] },
  });
  assert.deepEqual(specs.institution.options, ['A', 'B']);
  assert.equal(specs.institution.source, 'cim-category');
  // a shortlist also gives the empty default the options[0] behaviour
  const { values } = parseParams({ institution: { type: 'lookup', source: 'cim-category', options: ['A', 'B'] } });
  assert.equal(values.institution, 'A');
});

test('parseParams: lookup with no source stays a lookup with no source (degrades to text)', () => {
  const { specs } = parseParams({ q: { type: 'lookup' } });
  assert.equal(specs.q.type, 'lookup');
  assert.equal(specs.q.source, undefined);
});

test('the other five param types are unchanged by the lookup addition', () => {
  const { specs } = parseParams({
    a: { type: 'buttons', options: ['x'] },
    b: { type: 'select', options: ['x'] },
    c: { type: 'text' },
    d: { type: 'number', options: ['1', '9', '2'] },
    e: { type: 'month' },
  });
  assert.deepEqual(Object.values(specs).map((s) => s.type), ['buttons', 'select', 'text', 'number', 'month']);
  for (const s of Object.values(specs)) assert.equal('source' in s, false);
});

test('parseParamSpecText: the 4th field of a lookup line is the source', () => {
  const block = parseParamSpecText('institution | lookup | Institution | cim-category');
  assert.deepEqual(block.institution, { label: 'Institution', type: 'lookup', source: 'cim-category' });
});

test('parseParamSpecText: lookup keeps the source as one token (comma-safe)', () => {
  // A source id must not be comma-split the way an options list is.
  const block = parseParamSpecText('x | lookup | X | cim-category');
  assert.equal(block.x.source, 'cim-category');
  assert.equal(block.x.options, undefined);
});

test('paramSpecToText round-trips lookup through parseParamSpecText', () => {
  const text = paramSpecToText({ institution: { label: 'Institution', type: 'lookup', source: 'article' } });
  assert.equal(text, 'institution | lookup | Institution | article');
  const back = parseParamSpecText(text);
  assert.deepEqual(back.institution, { label: 'Institution', type: 'lookup', source: 'article' });
});

test('paramSpecToText still renders options for buttons/select', () => {
  assert.equal(paramSpecToText({ year: { type: 'select', label: 'Year', options: ['2023', '2024'] } }),
    'year | select | Year | 2023, 2024');
});

// ── value normalization ─────────────────────────────────────────────────────

test('normalizeLookupValue folds underscores and drops a redundant Category: prefix', () => {
  assert.equal(normalizeLookupValue('cim-category', 'Category:Images_from_the_Metropolitan_Museum_of_Art'),
    'Images from the Metropolitan Museum of Art');
  assert.equal(normalizeLookupValue('cim-category', '  Images  from   the Met  '), 'Images from the Met');
});

test('normalizeLookupValue strips File: for the file source only', () => {
  assert.equal(normalizeLookupValue('commons-file', 'File:The Earth seen from Apollo 17.jpg'),
    'The Earth seen from Apollo 17.jpg');
  // a Category: prefix is not a file prefix — left alone for other sources
  assert.equal(normalizeLookupValue('article', 'File:X'), 'File:X');
  assert.equal(normalizeLookupValue('cim-category', ''), '');
});

// ── local ranking ───────────────────────────────────────────────────────────

test('matchRank orders exact < prefix < word-start < substring', () => {
  assert.equal(matchRank('Museum', 'museum'), 0);
  assert.equal(matchRank('Museum of Art', 'museum'), 1);
  assert.equal(matchRank('The Museum of Art', 'museum'), 2); // word start (after "The ")
  assert.equal(matchRank('Artmuseum Group', 'museum'), 3); // mid-word substring only
  assert.equal(matchRank('Library', 'museum'), null);
  assert.equal(matchRank('anything', ''), 0); // empty query matches everything
});

test('matchRank is literal (regex metacharacters in the query are safe)', () => {
  assert.equal(matchRank('Art (Museum)', 'art ('), 1);
  assert.equal(matchRank('Metropolitan', 'Met.*'), null);
});

test('filterLocal ranks, limits, and treats an empty query as a shortlist', () => {
  const list = ['Artmuseum Group', 'Museum of Art', 'Museum', 'Library'];
  assert.deepEqual(filterLocal(list, 'museum'), ['Museum', 'Museum of Art', 'Artmuseum Group']);
  assert.deepEqual(filterLocal(list, ''), list);
  assert.equal(filterLocal(list, 'museum', 2).length, 2);
  assert.deepEqual(filterLocal(null, 'x'), []);
});

// ── the capability verdict ──────────────────────────────────────────────────

test('capabilityState: registered → ok, real-but-unregistered → unregistered, missing → invalid', () => {
  const registered = new Set(['Files from the Biodiversity Heritage Library']);
  assert.equal(capabilityState({ value: 'Files from the Biodiversity Heritage Library', registered }), 'ok');
  assert.equal(capabilityState({ value: 'Images from the Met', registered, exists: true }), 'unregistered');
  assert.equal(capabilityState({ value: 'Nope Nope Nope', registered, exists: false }), 'invalid');
  assert.equal(capabilityState({ value: 'Images from the Met', registered }), 'unknown');
  assert.equal(capabilityState({ value: '', registered }), 'empty');
});

test('capabilityState: without a registered set it is existence-only', () => {
  assert.equal(capabilityState({ value: 'Albert Einstein', exists: true }), 'ok');
  assert.equal(capabilityState({ value: 'Albert Einstein' }), 'unknown');
});

// ── payload parsers tolerate junk ───────────────────────────────────────────

test('parseEmbeddedIn strips the Category: prefix and survives junk', () => {
  const json = { query: { embeddedin: [{ title: 'Category:Skansen' }, { title: 'Category:PD USDA' }] } };
  assert.deepEqual(parseEmbeddedIn(json), ['Skansen', 'PD USDA']);
  assert.deepEqual(parseEmbeddedIn(null), []);
  assert.deepEqual(parseEmbeddedIn({ query: {} }), []);
});

test('parseActionSearch reads search and prefixsearch, optionally stripping a namespace', () => {
  assert.deepEqual(parseActionSearch({ query: { search: [{ title: 'Category:Skansen' }] } }, { stripNamespace: 'Category' }), ['Skansen']);
  assert.deepEqual(parseActionSearch({ query: { prefixsearch: [{ title: 'File:A.jpg' }] } }, { stripNamespace: 'File' }), ['A.jpg']);
  assert.deepEqual(parseActionSearch({}), []);
});

test('parseWbSearchEntities keeps the QID as the value and labels it', () => {
  const json = { search: [{ id: 'Q160236', label: 'Metropolitan Museum of Art' }, { id: 'not-a-qid', label: 'x' }] };
  assert.deepEqual(parseWbSearchEntities(json), [{ value: 'Q160236', label: 'Metropolitan Museum of Art (Q160236)' }]);
  assert.deepEqual(parseWbSearchEntities({}), []);
});

// ── the registry ────────────────────────────────────────────────────────────

test('the source registry exposes the documented ids with the right kinds', () => {
  assert.ok(PARAM_SOURCE_IDS.includes('cim-category'));
  assert.ok(PARAM_SOURCE_IDS.includes('curated'));
  assert.equal(PARAM_SOURCES['cim-category'].kind, 'enumerable');
  for (const id of ['commons-category', 'commons-file', 'article', 'wikidata-item']) {
    assert.equal(PARAM_SOURCES[id].kind, 'search', `${id} is a search source`);
  }
});

// ── the seed-list / server-search merge ─────────────────────────────────────
// The CIM seed list is a PARTIAL view of what CIM processes (the Met and the
// Rijksmuseum have data but are not in it), so suggestion must be able to reach
// the server — and the merge must not duplicate what the list already offered.

test('suggestions fall back to server search so categories outside the seed list are findable', () => {
  assert.equal(typeof PARAM_SOURCES['cim-category'].search, 'function');
});

test('mergeSuggestions puts seed hits first and dedupes case-insensitively', () => {
  const merged = mergeSuggestions(
    ['Collections of the Smithsonian Institution'],
    ['collections of the smithsonian institution', 'Images from Metropolitan Museum of Art'],
    8,
  );
  assert.deepEqual(merged, [
    'Collections of the Smithsonian Institution',
    'Images from Metropolitan Museum of Art',
  ]);
});

test('mergeSuggestions respects the limit and tolerates nulls', () => {
  assert.equal(mergeSuggestions(['a'], ['b', 'c'], 2).length, 2);
  assert.deepEqual(mergeSuggestions(null, null), []);
  assert.deepEqual(mergeSuggestions([], ['x']), ['x']);
});

test('getParamSource: curated and unknown ids return null so the control degrades to text', () => {
  assert.equal(getParamSource('curated'), null);
  assert.equal(getParamSource('nonsense'), null);
  assert.equal(getParamSource(''), null);
  assert.equal(getParamSource('cim-category').id, 'cim-category');
});
