/**
 * Projects — every wiki, ordered by usefulness (ISSUE-93).
 *
 * These tests hold down the two things that are easy to get wrong and invisible in a screenshot: that the list is
 * *complete* (all 364 wikis, not a curated 18) and that the order is recency → default → curated → rest, which is
 * the whole point of the issue.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSiteMatrix, languageList, orderProjects, filterProjects, labelFor,
  readRecentProjects, noteRecentProject, readDefaultProject, writeDefaultProject,
  toFieldValue,
  packProjects, readPackedProjects, COMMON_PROJECTS, PROJECTS_CACHE_TTL_MS, RECENT_CAP,
} from '../src/lib/projects.js';

// a faithful slice of the real response (measured 2026-09-16: numeric language keys + a `specials` array that mixes
// the hubs we want with dozens of chapter wikis we do not)
const MATRIX = {
  sitematrix: {
    count: 374,
    '0': {
      code: 'en', name: 'English', localname: 'English', dir: 'ltr',
      site: [
        { url: 'https://en.wikipedia.org', dbname: 'enwiki', code: 'wiki' },
        { url: 'https://en.wikisource.org', dbname: 'enwikisource', code: 'wikisource' },
        { url: 'https://en.wiktionary.org', dbname: 'enwiktionary', code: 'wiktionary' },
        { url: 'https://en.wikimedia.org', dbname: 'enwikimedia', code: 'wikimedia' },
      ],
    },
    '1': {
      code: 'de', name: 'Deutsch', localname: 'Deutsch', dir: 'ltr',
      site: [{ url: 'https://de.wikipedia.org', dbname: 'dewiki', code: 'wiki' }],
    },
    '2': {
      code: 'ar', name: 'العربية', localname: 'العربية', dir: 'rtl',
      site: [{ url: 'https://ar.wikipedia.org', dbname: 'arwiki', code: 'wiki' }],
    },
    specials: [
      { url: 'https://commons.wikimedia.org', dbname: 'commonswiki', code: 'commons' },
      { url: 'https://www.wikidata.org', dbname: 'wikidata', code: 'wikidata' },
      { url: 'https://advisors.wikimedia.org', dbname: 'advisorswiki', code: 'advisors' },
      { url: 'https://aewikimedia.org', dbname: 'aewikimedia', code: 'aewikimedia' },
    ],
  },
};

const fakeStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
};

// ── parsing ───────────────────────────────────────────────────────────────────────────────────────

test('the matrix becomes a flat list the app can speak', () => {
  const projects = parseSiteMatrix(MATRIX);
  const en = projects.find((p) => p.dbname === 'enwiki');
  assert.deepEqual({ dbname: en.dbname, host: en.host, family: en.family, lang: en.lang, dir: en.dir },
    { dbname: 'enwiki', host: 'en.wikipedia.org', family: 'wikipedia', lang: 'en', dir: 'ltr' });
  assert.equal(en.label, 'English Wikipedia');
  assert.equal(projects.find((p) => p.dbname === 'enwikisource').label, 'English Wikisource');
  assert.equal(projects.find((p) => p.dbname === 'dewiki').label, 'German Wikipedia (Deutsch)',
    'the English name leads and the localised one is kept beside it');
  assert.equal(projects.find((p) => p.dbname === 'arwiki').dir, 'rtl', 'direction travels with the project');
  assert.equal(en.config, 'en.wikipedia', 'and the dotted form the app stores travels with it');
  assert.equal(projects.find((p) => p.dbname === 'commonswiki').config, 'commons.wikimedia');
  assert.equal(projects.find((p) => p.dbname === 'wikidata').config, 'www.wikidata');
});

test('families the app cannot fetch from are left out, including the chapter wikis', () => {
  const projects = parseSiteMatrix(MATRIX);
  const dbnames = projects.map((p) => p.dbname);
  assert.ok(!dbnames.includes('enwikimedia'), 'a governance site is not a content project');
  assert.ok(!dbnames.includes('advisorswiki') && !dbnames.includes('aewikimedia'));
  assert.ok(dbnames.includes('commonswiki') && dbnames.includes('wikidata'), 'but the hubs are offered');
});

test('a malformed or empty response yields the hubs rather than nothing', () => {
  assert.ok(parseSiteMatrix(null).some((p) => p.dbname === 'wikidata'));
  assert.ok(parseSiteMatrix({}).length >= 4);
  assert.equal(parseSiteMatrix({ sitematrix: { specials: [] } }).some((p) => p.dbname === 'commonswiki'), false,
    'the hubs are offered only when the matrix confirms they exist');
});

test('the list keeps only one entry per dbname', () => {
  const doubled = JSON.parse(JSON.stringify(MATRIX));
  doubled.sitematrix['0'].site.push({ url: 'https://en.wikipedia.org', dbname: 'enwiki', code: 'wiki' });
  assert.equal(parseSiteMatrix(doubled).filter((p) => p.dbname === 'enwiki').length, 1);
});

test('one entry per language, for the widgets that take a bare language code', () => {
  const langs = languageList(parseSiteMatrix(MATRIX));
  assert.deepEqual(langs.map((l) => l.lang), ['ar', 'de', 'en']);
  assert.equal(langs.find((l) => l.lang === 'de').label, 'Deutsch');
  assert.ok(!langs.some((l) => l.lang === 'commons'), 'the hubs are not languages');
});

// ── ordering (the point of the issue) ─────────────────────────────────────────────────────────────

const LIST = parseSiteMatrix(MATRIX);
const order = (opts) => orderProjects(LIST, opts).map((p) => p.dbname);

test('recently used comes first, most recent first', () => {
  assert.deepEqual(order({ recent: ['arwiki', 'dewiki'] }).slice(0, 2), ['arwiki', 'dewiki']);
});

test('then the user default, then the curated shortlist, then the rest', () => {
  const out = order({ recent: ['dewiki'], defaultProject: 'arwiki' });
  assert.equal(out[0], 'dewiki', 'recent beats default');
  assert.equal(out[1], 'arwiki', 'default beats curated');
  assert.equal(out[2], 'enwiki', 'then the curated shortlist, in its published order');
  // "the rest" is alphabetical within its own group — the only place alphabet belongs
  const rest = out.slice(out.indexOf('enwiktionary') + 1);
  assert.deepEqual(rest, [...rest].sort(), 'the tail is alphabetical');
});

test('a recent or default project is never listed twice', () => {
  const out = order({ recent: ['enwiki'], defaultProject: 'enwiki' });
  assert.equal(out.filter((d) => d === 'enwiki').length, 1);
});

test('nothing recent and no default still puts the curated shortlist first', () => {
  assert.ok(COMMON_PROJECTS.includes(order({})[0]));
});

test('language mode ranks languages, not dbnames', () => {
  const langs = languageList(LIST);
  const out = orderProjects(langs, { mode: 'language', recent: ['ar'], defaultProject: 'de' }).map((l) => l.lang);
  assert.deepEqual(out.slice(0, 2), ['ar', 'de']);
});

// ── search ────────────────────────────────────────────────────────────────────────────────────────

test('search finds a language by its English name, which the matrix does not return (ISSUE-93)', () => {
  // Measured against the live matrix: typing "chinese" matched nothing, because the API returns 中文. Every
  // language therefore carries its English name for search and for display ("中文 · Chinese").
  assert.deepEqual(filterProjects(LIST, 'german').map((p) => p.dbname), ['dewiki'], 'the fixture has no English name for German…');
});

test('search matches a label, a dbname, a language code or a script', () => {
  assert.deepEqual(filterProjects(LIST, 'commons').map((p) => p.dbname), ['commonswiki']);
  assert.deepEqual(filterProjects(LIST, 'enwiki').map((p) => p.dbname), ['enwiki', 'enwikisource'],
    'a substring match is still offered — but the exact one leads');
  assert.deepEqual(filterProjects(LIST, 'de').map((p) => p.lang), ['de'], 'the German projects');
  assert.deepEqual(filterProjects(LIST, 'العربية').map((p) => p.dbname), ['arwiki']);
  assert.equal(filterProjects(LIST, '  ').length, LIST.length, 'an empty query is not a filter');
});

test('search is accent- and case-tolerant, because the labels are localised', () => {
  const withAccents = [{ dbname: 'frwiki', label: 'Français Wikipedia', lang: 'fr', langName: 'Français', family: 'wikipedia' }];
  assert.equal(filterProjects(withAccents, 'francais').length, 1);
  assert.equal(filterProjects(withAccents, 'FRANÇAIS').length, 1);
});

test('a pick stores the dotted form for a project, the code for a language', () => {
  const en = parseSiteMatrix(MATRIX).find((p) => p.dbname === 'enwiki');
  assert.equal(toFieldValue(en), 'en.wikipedia');
  assert.equal(toFieldValue(en, { mode: 'language' }), 'en');
  assert.equal(toFieldValue(null), '');
});

test('a stored value shows its label, or itself when unknown', () => {
  assert.equal(labelFor(LIST, 'dewiki'), 'German Wikipedia (Deutsch)');
  assert.equal(labelFor(LIST, 'de', { mode: 'language' }), 'German', 'language mode reads language codes');
  assert.equal(labelFor(LIST, 'madeupwiki'), 'madeupwiki');
  assert.equal(labelFor(LIST, ''), '');
});

// ── the user's memory ─────────────────────────────────────────────────────────────────────────────

test('recency is newest-first, deduped and capped', () => {
  const s = fakeStorage();
  for (const p of ['enwiki', 'dewiki', 'enwiki', 'frwiki']) noteRecentProject(s, p);
  assert.deepEqual(readRecentProjects(s), ['frwiki', 'enwiki', 'dewiki']);
  for (let i = 0; i < RECENT_CAP + 4; i++) noteRecentProject(s, `w${i}wiki`);
  assert.equal(readRecentProjects(s).length, RECENT_CAP);
});

test('an empty or corrupt recent list is simply empty', () => {
  assert.deepEqual(readRecentProjects(fakeStorage({ 'wikibento-recent-projects': 'not json' })), []);
  assert.deepEqual(readRecentProjects(fakeStorage({ 'wikibento-recent-projects': '{"a":1}' })), []);
  assert.deepEqual(readRecentProjects(null), []);
  assert.deepEqual(noteRecentProject(fakeStorage(), ''), []);
});

test('the default project is remembered, and clearing it means clearing it', () => {
  const s = fakeStorage();
  assert.equal(readDefaultProject(s), null);
  writeDefaultProject(s, 'dewiki');
  assert.equal(readDefaultProject(s), 'dewiki');
  writeDefaultProject(s, '');
  assert.equal(readDefaultProject(s), null);
});

// ── the mirror that keeps the first paint fast ────────────────────────────────────────────────────

test('a cached list is used while fresh, and ignored once stale or unreadable', () => {
  const packed = packProjects(LIST, 1_000_000);
  assert.equal(readPackedProjects(packed, { now: 1_000_000 + 1000 }).length, LIST.length);
  assert.equal(readPackedProjects(packed, { now: 1_000_000 + PROJECTS_CACHE_TTL_MS + 1 }), null);
  assert.equal(readPackedProjects('nonsense'), null);
  assert.equal(readPackedProjects(JSON.stringify({ v: 99, at: Date.now(), projects: LIST })), null, 'a future shape is discarded');
  assert.equal(readPackedProjects(JSON.stringify({ v: 1, at: Date.now(), projects: [] })), null, 'an empty list is not a cache');
});
