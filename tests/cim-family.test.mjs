/**
 * The CIM family merge: nine widget types over nine API calls became three — `cimStats`, `cimTrend`, `cimRanking`
 * (2026-10-03). This is the regression net for the half of that change a reader cannot see: a board that already
 * exists must keep meaning what it meant.
 *
 * The mechanism is the gallery's (ISSUE-105): retired ids resolve at LOOKUP (`widgetDef`), never by registering alias
 * keys — the ⚙ Add-widget list is built from `Object.values(WIDGET_TYPES)`, so an alias key would appear in the
 * picker as a second, identical entry, and `docs-facts` counts registry keys as widget types.
 *
 * CIM needed one thing the gallery did not: `cimTopPages`, `cimTopWikis` and `cimTopEditors` carry *identical*
 * configs, so the retired id is the only evidence of which question an old board asked. Hence `LEGACY_CIM_IDS` names
 * the implied selector value as well as the type, and `widgetDef` merges it into the resolved definition's
 * `defaults` — which `normalizeConfigForDef` fills a stored config from, for keys the config lacks only.
 *
 * Assertions, in the order a board actually meets them:
 *   1. an old id is NOT a registry key (so the panel cannot show it twice), but IS a known type;
 *   2. it resolves to the merged type, with a stable definition object (WidgetFrame memoises on it);
 *   3. the implied selector arrives in the normalized config, and the keys the board already carried are untouched;
 *   4. the card reads the config it used to: same data → same columns/subtitle shape (the arm is what the old id meant).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES, widgetDef, isKnownWidgetType } from '../src/widgets/index.js';
import { normalizeConfigForDef } from '../src/lib/configNormalize.js';
import { LEGACY_CIM_IDS } from '../src/lib/cimFamily.js';

// One retired id per shape, with the config a real board of that type carried (as exported before the merge).
const RETIRED = {
  cimSnapshot: { type: 'cimStats', selector: { subject: 'category' }, config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0, refreshSeconds: 3600 } },
  cimFileSpotlight: { type: 'cimStats', selector: { subject: 'file' }, config: { filename: 'Dogs, jackals, wolves, and foxes (Plate XI).jpg', wiki: 'all-wikis', showImage: true, month: 0, refreshSeconds: 3600 } },
  cimFileTraffic: { type: 'cimTrend', selector: { subject: 'file' }, config: { filename: 'Dogs, jackals, wolves, and foxes (Plate XI).jpg', wiki: 'all-wikis', months: 12, month: 0, refreshSeconds: 3600 } },
  cimTopFiles: { type: 'cimRanking', selector: { facet: 'files' }, config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10, refreshSeconds: 3600 } },
  cimTopWikis: { type: 'cimRanking', selector: { facet: 'wikis' }, config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0, topN: 10, refreshSeconds: 3600 } },
  cimTopPages: { type: 'cimRanking', selector: { facet: 'pages' }, config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10, refreshSeconds: 3600 } },
  cimTopEditors: { type: 'cimRanking', selector: { facet: 'editors' }, config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', editType: 'all-edit-types', month: 0, topN: 10, refreshSeconds: 3600 } },
  cimLeaderboard: { type: 'cimRanking', selector: { facet: 'categories' }, config: { scope: 'deep', wiki: 'all-wikis', month: 0, highlight: '', refreshSeconds: 3600 } },
};

test('every retired CIM id is a known type but not a registry key', () => {
  for (const id of Object.keys(RETIRED)) {
    assert.equal(WIDGET_TYPES[id], undefined, `${id} must not be a registry key — the Add panel would list it twice`);
    assert.ok(isKnownWidgetType(id), `${id} must still resolve`);
  }
  assert.equal(Object.keys(LEGACY_CIM_IDS).length, 8, 'eight ids were retired; cimTrend kept its name');
  assert.equal(widgetDef('cimTrend').id, 'cimTrend', 'the trend id survived the merge');
  assert.equal(widgetDef('cimTrend').defaults.subject, 'category', 'and still means the category arm');
});

test('a retired id resolves to the merged type, with a stable definition', () => {
  for (const [id, { type }] of Object.entries(RETIRED)) {
    const def = widgetDef(id);
    assert.equal(def.id, type, `${id} → ${type}`);
    assert.ok(def.fetch && def.transform, `${id} resolves to a definition that can fetch and render`);
    assert.equal(widgetDef(id), def, `${id}: the resolved definition must be the same object every call (useMemo)`);
  }
});

test('the implied selector arrives, and the keys the board carried are untouched', () => {
  for (const [id, { type, selector, config }] of Object.entries(RETIRED)) {
    const def = widgetDef(id);
    const out = normalizeConfigForDef(config, def);
    assert.equal(def.id, type);
    for (const [key, value] of Object.entries(selector)) {
      assert.equal(out[key], value, `${id}: the merged type must read ${key} = ${value}`);
    }
    // Nothing the old board said may change: same keys, same values.
    for (const [key, value] of Object.entries(config)) {
      assert.deepEqual(out[key], value, `${id}: stored key ${key} changed`);
    }
    // …and no key the old type did not have may appear in the STORED config (we merge defaults, never rewrite).
    for (const key of Object.keys(selector)) {
      assert.equal(Object.prototype.hasOwnProperty.call(config, key), false, `${id}: the fixture is a pre-merge board`);
    }
  }
});

test('an old board still renders the question it asked — the arm follows the retired id', () => {
  const month = { year: 2026, month: 7 };
  // One row shape serves every ranking arm; each arm reads the fields it needs.
  const row = { title: 'File:X.jpg', views: 9, thumbUrl: null, wiki: 'en.wikipedia', page: 'Marie_Curie', user: 'Alice', edits: 3, category: 'X', rank: 1 };
  const rows = [row];

  const files = widgetDef('cimTopFiles').transform({ category: 'X', rows, resolvedMonth: month }, { ...widgetDef('cimTopFiles').defaults, scope: 'deep' });
  assert.equal(files.rows[0].title, 'File:X.jpg', 'cimTopFiles → the thumbnail arm');
  assert.match(files.subtitle, /2026-07/);

  const wikis = widgetDef('cimTopWikis').transform({ category: 'X', rows, resolvedMonth: month }, { ...widgetDef('cimTopWikis').defaults, scope: 'deep' });
  assert.deepEqual(wikis.columns, ['Wiki', 'Views'], 'cimTopWikis → the wiki ranking');

  const pages = widgetDef('cimTopPages').transform({ category: 'X', rows, resolvedMonth: month }, { ...widgetDef('cimTopPages').defaults, scope: 'deep' });
  assert.deepEqual(pages.columns, ['Wiki', 'Page', 'Views'], 'cimTopPages → the page ranking');

  const editors = widgetDef('cimTopEditors').transform({ category: 'X', rows, resolvedMonth: month }, { ...widgetDef('cimTopEditors').defaults, editType: 'all-edit-types', scope: 'deep' });
  assert.deepEqual(editors.columns, ['Editor', 'Edits'], 'cimTopEditors → the editor ranking');

  const leaders = widgetDef('cimLeaderboard').transform({ rows, resolvedMonth: month }, { ...widgetDef('cimLeaderboard').defaults, highlight: '' });
  assert.equal(leaders.title, 'Most-viewed categories', 'cimLeaderboard → the global leaderboard');

  const stats = widgetDef('cimSnapshot').transform({ category: 'X', files: 10, filesDeep: 10, used: 5, usedDeep: 5, wikis: 2, wikisDeep: 2, pages: 3, pagesDeep: 3, resolvedMonth: month }, { ...widgetDef('cimSnapshot').defaults, scope: 'deep' });
  assert.equal(stats.stats[0].label, 'Files', 'cimSnapshot → the category numbers');

  const spotlight = widgetDef('cimFileSpotlight').transform({ file: 'X.jpg', image: null, wikis: 1, pages: 2, views: 3, trend: [], resolvedMonth: month }, { ...widgetDef('cimFileSpotlight').defaults, showImage: false });
  assert.equal(spotlight.stats[0].label, 'Wikis using it', 'cimFileSpotlight → the file numbers');
  assert.equal(spotlight.image, null, 'showImage false is respected through the legacy id');

  const traffic = widgetDef('cimFileTraffic').transform({ file: 'X.jpg', rows: [{ date: '2026-07', views: 3 }], resolvedMonth: month }, { ...widgetDef('cimFileTraffic').defaults, months: 12 });
  assert.match(traffic.subtitle, /2025-08 → 2026-07/, 'cimFileTraffic → the file series over its own window');
  assert.deepEqual(traffic.rows, [{ date: '2026-07', views: 3 }]);
});

test('the gallery aliases still resolve (the string form of the same table)', () => {
  for (const id of ['commonsGallery', 'fileGallery']) {
    assert.equal(WIDGET_TYPES[id], undefined);
    assert.equal(widgetDef(id).id, 'gallery', `${id} → gallery`);
  }
  assert.equal(widgetDef('nope'), null, 'an unknown id resolves to nothing');
});

test('the merged family publishes what it is about — the subject, and the ranked names (ISSUE-96)', () => {
  const stats = WIDGET_TYPES.cimStats;
  assert.equal(stats.outputs.kind, 'value');
  // The API's own form of the name, not the config's spelling: the card resolved it, so the card publishes it.
  assert.equal(
    stats.emit({ category: 'Files_from_the_Biodiversity_Heritage_Library' }, { subject: 'category', category: 'something else' }),
    'commonswiki:Category:Files from the Biodiversity Heritage Library',
  );
  assert.equal(
    stats.emit({ file: 'Dogs,_jackals,_wolves,_and_foxes_(Plate_XI).jpg' }, { subject: 'file' }),
    'commonswiki:File:Dogs, jackals, wolves, and foxes (Plate XI).jpg',
  );
  // Nothing to name → nothing on the wire. An empty string would be a value every consumer has to special-case.
  assert.equal(stats.emit({}, { subject: 'category' }), undefined);

  const trend = WIDGET_TYPES.cimTrend;
  assert.equal(trend.outputs.kind, 'value');
  assert.equal(trend.emit({ category: 'Files_from_the_BHL' }, { subject: 'category' }), 'commonswiki:Category:Files from the BHL');
  // …and it is the SUBJECT, not the series: a trend of 524,000 views is a reading, not a token (ISSUE-96's rule 2).
  assert.equal(typeof trend.emit({ category: 'X', rows: [{ date: '2026-07', views: 524000 }] }, { subject: 'category' }), 'string');

  const rank = WIDGET_TYPES.cimRanking;
  assert.equal(rank.outputs.kind, 'lines');
  // Files: the File: prefix is added, underscores become the spaces Commons itself uses, and an already-prefixed
  // value is not prefixed twice (the fetcher hands us one, a hand-written board may hand us the other).
  assert.equal(
    rank.emit({ rows: [{ title: 'Dogs,_jackals.jpg' }, { title: 'File:Already_prefixed.png' }] }, { facet: 'files' }),
    'commonswiki:File:Dogs, jackals.jpg\ncommonswiki:File:Already prefixed.png',
  );
  // Pages carry the wiki the row was viewed on, which is the whole point of a reference (ISSUE-92).
  assert.equal(rank.emit({ rows: [{ wiki: 'en.wikipedia', page: 'Marie Curie' }] }, { facet: 'pages' }), 'enwiki:Marie Curie');
  // Wikis publish the dbname itself; editors publish a bare name, because that endpoint returns no wiki and the
  // emitter will not invent one.
  assert.equal(rank.emit({ rows: [{ wiki: 'de.wikipedia.org' }] }, { facet: 'wikis' }), 'dewiki');
  assert.equal(rank.emit({ rows: [{ user: 'Effeietsanders' }] }, { facet: 'editors' }), 'Effeietsanders');
  assert.equal(rank.emit({ rows: [{ category: 'Files_from_the_BHL' }] }, { facet: 'categories' }), 'commonswiki:Category:Files from the BHL');
  // A row with nothing nameable contributes no line rather than a blank one.
  assert.equal(rank.emit({ rows: [{ views: 5 }, { title: 'File:Kept.jpg' }] }, { facet: 'files' }), 'commonswiki:File:Kept.jpg');
  // No rows at all → nothing emitted, not an empty list.
  assert.equal(rank.emit({ rows: [] }, { facet: 'files' }), undefined);

  // The retired ids speak the same way: `cimTopPages` publishes page references because its arm says pages.
  const legacy = widgetDef('cimTopPages');
  const legacyConfig = normalizeConfigForDef({ category: 'X', scope: 'deep', wiki: 'all-wikis', month: 0, topN: 10 }, legacy);
  assert.equal(legacy.emit({ rows: [{ wiki: 'enwiki', page: 'Ada Lovelace' }] }, legacyConfig), 'enwiki:Ada Lovelace');
  assert.equal(legacyConfig.facet, 'pages');
});

