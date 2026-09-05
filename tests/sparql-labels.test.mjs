/**
 * Wikidata label enrichment for SPARQL results (Issue #6) — the fix for
 * the "Commons — most-depicted subjects" preset showing bare QIDs
 * (QLever cannot run `SERVICE wikibase:label`; it tries to federate to a
 * dead host). All offline — the pure helpers are tested directly and the
 * full fetchSparql path is exercised with a STUBBED global fetch (no
 * network): QLever-style results get "Label (Q123)" cells while
 * literals, non-Wikidata URIs and already-labelled WDQS results
 * (?x + ?xLabel) are left untouched, and the default (no opts) keeps the
 * legacy raw-QID behavior.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  wikidataEntityId,
  labelLanguage,
  chunkIds,
  buildLabelRequestUrl,
  parseLabelResponse,
  shouldResolveVar,
  displayValue,
  enrichEntityLabels,
} from '../src/lib/sparqlLabels.js';
import { fetchSparql } from '../src/widgets/dataSources.js';

// ── entity detection ────────────────────────────────────────────────────

test('wikidataEntityId: recognizes Wikidata entity/property URIs', () => {
  assert.equal(wikidataEntityId('http://www.wikidata.org/entity/Q146'), 'Q146');
  assert.equal(wikidataEntityId('https://www.wikidata.org/entity/Q34442'), 'Q34442');
  assert.equal(wikidataEntityId('http://www.wikidata.org/entity/P180'), 'P180');
  assert.equal(wikidataEntityId('http://wikidata.org/entity/Q5'), 'Q5'); // www optional
});

test('wikidataEntityId: rejects non-entity values', () => {
  assert.equal(wikidataEntityId('Q146'), null); // bare text is NOT an entity URI
  assert.equal(wikidataEntityId('http://www.wikidata.org/wiki/Q146'), null); // wiki page ≠ entity
  assert.equal(wikidataEntityId('http://www.wikidata.org/entity/Q146#frag'), null);
  assert.equal(wikidataEntityId('https://commons.wikimedia.org/wiki/File:X.jpg'), null);
  assert.equal(wikidataEntityId('http://example.org/entity/Q146'), null); // other host
  assert.equal(wikidataEntityId('Cat'), null);
  assert.equal(wikidataEntityId(''), null);
  assert.equal(wikidataEntityId(null), null);
  assert.equal(wikidataEntityId(undefined), null);
});

// ── language ────────────────────────────────────────────────────────────

test('labelLanguage: primary subtag of navigator.language, en fallback', () => {
  assert.equal(labelLanguage('en-US'), 'en');
  assert.equal(labelLanguage('fr-FR'), 'fr');
  assert.equal(labelLanguage('zh-Hant-TW'), 'zh');
  assert.equal(labelLanguage('en_US'), 'en'); // underscore variant tolerated
  assert.equal(labelLanguage('DE'), 'de'); // case-insensitive
  assert.equal(labelLanguage('de'), 'de');
  assert.equal(labelLanguage(undefined), 'en');
  assert.equal(labelLanguage(''), 'en');
  assert.equal(labelLanguage('*'), 'en'); // garbage → en
});

// ── batching ────────────────────────────────────────────────────────────

test('chunkIds: ≤ 50 ids per chunk (wbgetentities cap)', () => {
  assert.deepEqual(chunkIds([]), []);
  assert.deepEqual(chunkIds(['Q1']), [['Q1']]);
  const fifty = Array.from({ length: 50 }, (_, i) => `Q${i + 1}`);
  assert.equal(chunkIds(fifty).length, 1);
  assert.equal(chunkIds(fifty)[0].length, 50);
  const chunks = chunkIds(Array.from({ length: 51 }, (_, i) => `Q${i + 1}`));
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 50);
  assert.equal(chunks[1].length, 1);
});

// ── URL construction ────────────────────────────────────────────────────

test('buildLabelRequestUrl: user language + guaranteed en fallback', () => {
  const u = new URL(buildLabelRequestUrl(['Q146', 'Q5'], 'de'));
  assert.equal(u.origin, 'https://www.wikidata.org');
  assert.equal(u.pathname, '/w/api.php');
  assert.equal(u.searchParams.get('action'), 'wbgetentities');
  assert.equal(u.searchParams.get('ids'), 'Q146|Q5');
  assert.equal(u.searchParams.get('props'), 'labels');
  assert.equal(u.searchParams.get('languages'), 'de|en'); // user lang first, en fallback
  assert.equal(u.searchParams.get('uselang'), 'de');
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('formatversion'), '2');
  assert.equal(u.searchParams.get('origin'), '*'); // CORS
});

test('buildLabelRequestUrl: en requests no duplicate language', () => {
  const u = new URL(buildLabelRequestUrl(['Q1'], 'en'));
  assert.equal(u.searchParams.get('languages'), 'en');
  assert.equal(u.searchParams.get('uselang'), 'en');
});

// ── response parsing ────────────────────────────────────────────────────

test('parseLabelResponse: user language first, en fallback, missing stays null', () => {
  const json = {
    entities: {
      Q146: { id: 'Q146', labels: { de: { language: 'de', value: 'Hauskatze' }, en: { language: 'en', value: 'Cat' } } },
      Q34442: { id: 'Q34442', labels: { en: { language: 'en', value: 'road' } } }, // no de label
      Q5: { id: 'Q5', labels: {} },
      Q999: { id: 'Q999', missing: '' },
    },
  };
  assert.deepEqual(parseLabelResponse(json, 'de'), {
    Q146: 'Hauskatze',
    Q34442: 'road',
    Q5: null,
    Q999: null,
  });
});

test('parseLabelResponse: empty/absent envelopes → {}', () => {
  assert.deepEqual(parseLabelResponse({}, 'en'), {});
  assert.deepEqual(parseLabelResponse(undefined, 'en'), {});
  assert.deepEqual(parseLabelResponse({ entities: undefined }, 'en'), {});
});

// ── var eligibility + display text ──────────────────────────────────────

test('shouldResolveVar: skips label columns and vars with an existing *Label sibling', () => {
  assert.equal(shouldResolveVar('depicts', ['depicts', 'count']), true);
  assert.equal(shouldResolveVar('item', ['item', 'itemLabel', 'count']), false); // SERVICE sibling already asks
  assert.equal(shouldResolveVar('itemLabel', ['item', 'itemLabel']), false); // itself a label column
  assert.equal(shouldResolveVar('label', ['label', 'count']), false);
  assert.equal(shouldResolveVar('xLabel', ['xLabel', 'count']), false);
  assert.equal(shouldResolveVar('Item', ['Item', 'ItemLabel']), false); // exact-case sibling
});

test('displayValue: "Label (QID)" text, raw value kept when no label', () => {
  assert.equal(displayValue('Q146', 'Cat'), 'Cat (Q146)');
  assert.equal(displayValue('Q146', null), 'Q146');
  assert.equal(displayValue('Q146', ''), 'Q146');
  assert.equal(displayValue('plain text', 'x'), 'x (plain text)'); // non-entities never reach here
});

// ── enrichEntityLabels (pure, injected fetcher) ─────────────────────────

test('enrichEntityLabels: chunks ≤ 50, dedupes ids, merges "Label (QID)" per row', async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `Q${i + 1}`);
  const rows = ids.map((id) => ({ x: id, n: 1 }));
  const cells = ids.map((id, r) => ({ r, v: 'x', id }));
  const seen = [];
  const fetchBatch = async (chunk) => {
    assert.ok(chunk.length <= 50, 'chunk must respect the 50-id cap');
    seen.push(chunk);
    return Object.fromEntries(chunk.map((id) => [id, `Label for ${id}`]));
  };
  const count = await enrichEntityLabels(rows, cells, ['x', 'n'], { lang: 'en', fetchBatch });
  assert.equal(count, 51);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].length, 50);
  assert.equal(seen[1].length, 1);
  assert.equal(rows[0].x, 'Label for Q1 (Q1)');
  assert.equal(rows[50].x, 'Label for Q51 (Q51)');
});

test('enrichEntityLabels: same id in multiple rows fetched once, labelled everywhere', async () => {
  const rows = [{ x: 'Q146', n: 1 }, { x: 'Q146', n: 2 }, { x: 'plain', n: 3 }];
  const cells = [{ r: 0, v: 'x', id: 'Q146' }, { r: 1, v: 'x', id: 'Q146' }];
  let calls = 0;
  const fetchBatch = async () => { calls++; return { Q146: 'Cat' }; };
  const count = await enrichEntityLabels(rows, cells, ['x', 'n'], { lang: 'en', fetchBatch });
  assert.equal(count, 2);
  assert.equal(calls, 1); // deduped — one chunk, one HTTP request
  assert.equal(rows[0].x, 'Cat (Q146)');
  assert.equal(rows[1].x, 'Cat (Q146)');
  assert.equal(rows[2].x, 'plain'); // non-entity untouched
});

test('enrichEntityLabels: sibling *Label var → no fetch, raw QID kept', async () => {
  const rows = [{ x: 'Q146', xLabel: 'Cat', n: 1 }];
  const cells = [{ r: 0, v: 'x', id: 'Q146' }];
  let calls = 0;
  const count = await enrichEntityLabels(rows, cells, ['x', 'xLabel', 'n'], {
    lang: 'en', fetchBatch: async () => { calls++; return { Q146: 'Cat' }; },
  });
  assert.equal(count, 0);
  assert.equal(calls, 0);
  assert.equal(rows[0].x, 'Q146'); // WDQS SERVICE-label results stay as bare traceable QIDs
});

test('enrichEntityLabels: missing label and fetch failure both keep the raw QID', async () => {
  const rows = [{ x: 'Q1', n: 1 }, { x: 'Q2', n: 2 }];
  const cells = [{ r: 0, v: 'x', id: 'Q1' }, { r: 1, v: 'x', id: 'Q2' }];
  // First call: Q1 has no label (null). Second chunk throws → swallowed.
  let call = 0;
  const fetchBatch = async () => { call++; if (call === 1) return { Q1: null }; throw new Error('boom'); };
  const count = await enrichEntityLabels(rows, cells, ['x', 'n'], { lang: 'en', fetchBatch });
  assert.equal(count, 0);
  assert.equal(rows[0].x, 'Q1');
  assert.equal(rows[1].x, 'Q2'); // enrichment failure never fails the result
});

// ── full fetchSparql path (stubbed fetch — no network) ─────────────────

// Route stub for global fetch: `routes` = [[url-includes, jsonBody], ...].
function stubFetch(routes) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    for (const [needle, body] of routes) {
      if (u.includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ error: `no route: ${u}` }), { status: 500 });
  };
  return {
    calls,
    labelCalls: () => calls.filter((u) => u.includes('wikidata.org/w/api.php')),
    restore: () => { globalThis.fetch = orig; },
  };
}

let stub;
beforeEach(() => { stub = null; });
afterEach(() => { stub?.restore(); });

const WDQS_LABEL_RESPONSE = {
  entities: {
    Q146: { id: 'Q146', labels: { en: { language: 'en', value: 'Cat' }, fr: { language: 'fr', value: 'Chat' } } },
    Q34442: { id: 'Q34442', labels: { en: { language: 'en', value: 'road' }, fr: { language: 'fr', value: 'route' } } },
  },
};

function qleverResult() {
  return {
    head: { vars: ['depicts', 'count', 'note'] },
    results: {
      bindings: [
        { depicts: { type: 'uri', value: 'http://www.wikidata.org/entity/Q146' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '100' }, note: { type: 'literal', value: 'a literal' } },
        { depicts: { type: 'uri', value: 'http://www.wikidata.org/entity/Q34442' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '50' }, note: { type: 'literal', value: 'Q146' } }, // literal reading "Q146" must NOT resolve
        { depicts: { type: 'uri', value: 'http://commons.wikimedia.org/entity/M37200540' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '7' }, note: { type: 'literal', value: 'plain' } },
      ],
    },
  };
}

const QLEVER_QUERY = 'PREFIX wdt: <http://www.wikidata.org/prop/direct/> SELECT ?depicts (COUNT(?file) AS ?count) WHERE { ?file wdt:P180 ?depicts } GROUP BY ?depicts';

test('fetchSparql + resolveLabels: QLever-style bare QIDs become "Label (QID)" (Issue #6)', async () => {
  stub = stubFetch([['/wikimedia-commons', qleverResult()], ['wikidata.org/w/api.php', WDQS_LABEL_RESPONSE]]);
  const out = await fetchSparql(QLEVER_QUERY, 'qlever-commons', 10, { resolveLabels: true });
  assert.equal(out.rows[0].depicts, 'Cat (Q146)');
  assert.equal(out.rows[1].depicts, 'road (Q34442)');
  assert.equal(out.rows[0].count, 100); // numeric coercion untouched
  assert.equal(out.rows[0].note, 'a literal'); // literals untouched
  assert.equal(out.rows[1].note, 'Q146'); // literal reading "Q146" NOT resolved
  assert.equal(out.rows[2].depicts, 'M37200540'); // Commons media id: shortened, NOT resolved (not a Wikidata entity)
  assert.equal(out.vars.join(','), 'depicts,count,note');
  // exactly one wbgetentities call, for the two genuine entity ids
  const labelUrls = stub.labelCalls();
  assert.equal(labelUrls.length, 1);
  const idsParam = new URL(labelUrls[0]).searchParams.get('ids');
  assert.equal(idsParam, 'Q146|Q34442');
});

test('fetchSparql default (no opts): legacy raw behavior, no label traffic', async () => {
  stub = stubFetch([['/wikimedia-commons', qleverResult()]]);
  const qDefault = `${QLEVER_QUERY} # default-no-opts`; // unique — the 10-min sparql cache is shared per query
  const out = await fetchSparql(qDefault, 'qlever-commons', 10); // no { resolveLabels }
  assert.equal(out.rows[0].depicts, 'Q146');
  assert.equal(out.rows[1].depicts, 'Q34442');
  assert.equal(stub.labelCalls().length, 0);
});

test('fetchSparql + resolveLabels: user language drives the label request (fr)', async () => {
  // navigator.language may exist read-only in newer Node — define it configurable.
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
  try {
    const q2 = `${QLEVER_QUERY} # fr-lang`;
    stub = stubFetch([['/wikimedia-commons', qleverResult()], ['wikidata.org/w/api.php', WDQS_LABEL_RESPONSE]]);
    const out = await fetchSparql(q2, 'qlever-commons', 10, { resolveLabels: true });
    assert.equal(out.rows[0].depicts, 'Chat (Q146)'); // French label preferred
    assert.equal(out.rows[1].depicts, 'route (Q34442)');
    const u = new URL(stub.labelCalls()[0]);
    assert.equal(u.searchParams.get('languages'), 'fr|en'); // en kept as fallback
    assert.equal(u.searchParams.get('uselang'), 'fr');
  } finally {
    delete globalThis.navigator;
  }
});

test('fetchSparql + resolveLabels: WDQS results with ?xLabel sibling unchanged', async () => {
  const wdqsResult = {
    head: { vars: ['depicts', 'depictsLabel', 'count'] },
    results: {
      bindings: [
        { depicts: { type: 'uri', value: 'http://www.wikidata.org/entity/Q146' }, depictsLabel: { type: 'literal', value: 'Cat' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '100' } },
      ],
    },
  };
  stub = stubFetch([['query.wikidata.org/sparql', wdqsResult]]);
  const out = await fetchSparql('SELECT ?depicts ?depictsLabel ?count WHERE { SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }', 'wdqs', 10, { resolveLabels: true });
  assert.equal(out.rows[0].depicts, 'Q146'); // QID retained; ?depictsLabel carries the label
  assert.equal(out.rows[0].depictsLabel, 'Cat');
  assert.equal(stub.labelCalls().length, 0); // no wbgetentities traffic at all
});

test('fetchSparql + resolveLabels: label API failure never fails the query', async () => {
  // Fresh ids (never seen by the module-level label cache) so the label
  // lookup really misses and hits the failing stub route.
  const down = {
    head: { vars: ['depicts', 'count'] },
    results: {
      bindings: [
        { depicts: { type: 'uri', value: 'http://www.wikidata.org/entity/Q77777' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '100' } },
        { depicts: { type: 'uri', value: 'http://www.wikidata.org/entity/Q88888' }, count: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#integer', value: '50' } },
      ],
    },
  };
  const q3 = 'SELECT ?depicts ?count WHERE { ?file wdt:P180 ?depicts } # label-down';
  stub = stubFetch([['/wikimedia-commons', down]]); // NO wikidata route → 500
  const out = await fetchSparql(q3, 'qlever-commons', 10, { resolveLabels: true });
  assert.equal(out.rows[0].depicts, 'Q77777'); // raw QIDs survive a label outage
  assert.equal(out.rows[1].depicts, 'Q88888');
  assert.equal(out.rows[0].count, 100);
  assert.equal(out.rows.length, 2);
});
