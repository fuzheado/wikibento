/**
 * Wiki Stats source constitution (2026-09-18).
 *
 * The legacy `wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv` endpoint answers **HTTP 500 with
 * an empty body** — reproducibly, for every User-Agent, and only for the `wikipedias` table (wiktionaries,
 * wikisources, wikidata and commons still return CSV). It also refuses every other format for that table, so there
 * was no way to ask it. The card now reads the wiki's own `siteinfo` statistics, which is why these two functions
 * are pure and tested: the host mapping and the response shape are the whole contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wikistatsHost, parseWikistatsStatistics, WIKISTATS_FAMILIES, wikistatsSource } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

test('wikistats: the host follows the family table and the language', () => {
  assert.equal(wikistatsHost('wikipedias', 'en'), 'en.wikipedia.org');
  assert.equal(wikistatsHost('wiktionaries', 'de'), 'de.wiktionary.org');
  assert.equal(wikistatsHost('wikisources', 'fr'), 'fr.wikisource.org');
  // the ⚙ Language field is the shared project picker, so it can hand over a bare code, a dotted project or a
  // dbname — all three must land on the same host
  for (const form of ['en', 'en.wikipedia', 'enwiki', 'EN']) {
    assert.equal(wikistatsHost('wikipedias', form), 'en.wikipedia.org', form);
  }
  assert.equal(wikistatsHost('wikipedias', 'de.wikipedia'), 'de.wikipedia.org');
  // an unknown table is Wikipedia rather than a broken host
  assert.equal(wikistatsHost('nonsense', 'it'), 'it.wikipedia.org');
  // and nothing at all still gets a real wiki
  assert.equal(wikistatsHost('wikipedias', ''), 'en.wikipedia.org');
  assert.equal(wikistatsHost(undefined, undefined), 'en.wikipedia.org');
  assert.deepEqual(Object.keys(WIKISTATS_FAMILIES), ['wikipedias', 'wiktionaries', 'wikisources']);
});

test('wikistats: the siteinfo payload becomes the flat card shape', () => {
  const payload = {
    batchcomplete: true,
    query: { statistics: { pages: 66279372, articles: 7241639, edits: 1370945137, images: 977058,
      users: 54570369, activeusers: 263530, admins: 809, jobs: 0 } },
  };
  const stats = parseWikistatsStatistics(payload, { table: 'wikipedias', lang: 'en' });
  assert.equal(stats.host, 'en.wikipedia.org');
  assert.equal(stats.articles, 7241639);
  assert.equal(stats.pages, 66279372);
  assert.equal(stats.edits, 1370945137);
  assert.equal(stats.activeusers, 263530);
  assert.equal(stats.admins, 809);
  // a missing or malformed payload is null, never a half-filled object the card would render as zeros
  assert.equal(parseWikistatsStatistics(null), null);
  assert.equal(parseWikistatsStatistics({}), null);
  assert.equal(parseWikistatsStatistics({ query: {} }), null);
  assert.equal(parseWikistatsStatistics({ query: { statistics: 'nope' } }), null);
  // non-numeric values coerce to 0 rather than NaN in the card
  const odd = parseWikistatsStatistics({ query: { statistics: { articles: '12', pages: null } } });
  assert.equal(odd.articles, 12);
  assert.equal(odd.pages, 0);
  assert.equal(odd.admins, 0);
});

test('wikistats: the card renders the new shape, and names the wiki it actually read', () => {
  const def = WIDGET_TYPES.wikistats;
  const stats = parseWikistatsStatistics({
    query: { statistics: { pages: 1457108, articles: 1262642, edits: 10765342, images: 93, users: 259995, activeusers: 316, admins: 12 } },
  }, { table: 'wiktionaries', lang: 'de' });
  const card = def.transform(stats, { table: 'wiktionaries', lang: 'de' });
  assert.equal(card.title, 'de.wiktionary.org', 'not always .wikipedia.org');
  assert.equal(card.value, '1,262,642');
  assert.match(card.detail, /Articles: 1,262,642/);
  assert.match(card.detail, /Edits: 10,765,342/);
  assert.match(card.detail, /Active: 316/);
  // the ⚙ label agrees with the title (it used to hardcode .wikipedia.org too)
  assert.equal(def.labelFromConfig({ table: 'wiktionaries', lang: 'de' }), 'de.wiktionary.org');
  assert.equal(def.labelFromConfig({ table: 'wikipedias', lang: 'en' }), 'en.wikipedia.org');
  assert.equal(def.labelFromConfig({}), null);
  // no invented number: with nothing to show the detail line is empty rather than "Articles: 0"
  const empty = def.transform(parseWikistatsStatistics({ query: { statistics: {} } }), {});
  assert.equal(empty.detail, '');
});

test('wikistats: an edition is read from the wiki; a ranking from the dump (one place decides)', () => {
  // The single-edition card was reading a CSV dump of all 333 Wikipedias to pick one row, and that CSV endpoint
  // started answering 500 (intermittently). It now asks the wiki itself. The ranking genuinely needs every
  // edition, so it keeps the dump — and the decision is a named, tested function rather than an if inside a fetch.
  assert.equal(wikistatsSource('en'), 'siteinfo');
  assert.equal(wikistatsSource('de'), 'siteinfo');
  assert.equal(wikistatsSource(null), 'dump');
  assert.equal(wikistatsSource(''), 'dump');
  assert.equal(wikistatsSource(undefined), 'dump');
});

test('wikistats: the ranking keeps the dump shape the widget renders', () => {
  // `topWikipedias` reads `data.rows` and maps `[lang, good]`. Restoring the dump path without this would have
  // left the "Largest Wikipedias" card rendering zero rows — silently, since an empty ranking throws nothing.
  const def = WIDGET_TYPES.topWikipedias;
  const card = def.transform({ rows: [{ lang: 'en', good: '7241639' }, { lang: 'ceb', good: '6112334' }], table: 'wikipedias' });
  assert.deepEqual(card.rows, [['en', '7,241,639'], ['ceb', '6,112,334']]);
  assert.match(card.title, /Largest Wikipedias/);
  // and with no rows at all the card says nothing rather than inventing one
  assert.deepEqual(def.transform({ rows: [] }).rows, []);
  assert.deepEqual(def.transform({}).rows, []);
});
