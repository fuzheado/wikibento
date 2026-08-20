/**
 * GLAM PetScan relay tests (ISSUE-46) — the constitution for architecture B:
 * tree+usage from PetScan via /api/petscan, self-walk fallback, shared
 * aggregation. All offline: pure relay functions are tested directly; the
 * aggregation is tested with injected views/thumbs stubs (no network).
 *
 * Covers:
 *  - buildPetscanUrl: param construction (cats/depth/negcats |→\n/giu/ns/max)
 *  - wikiDbToDomain: PetScan DB names → Wikimedia domains (all families)
 *  - normalizePetscanPages: title normalization, usage shape, budget cap
 *  - parsePetscanParams: validation + clamps
 *  - aggregateGlamStats: ns filtering, page map, per-file views, top-N,
 *    detail ordering, partialViews budget
 *  - fetchGlamStats: relay-primary / walk-fallback routing, zero files,
 *    truncated relay → fallback
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPetscanUrl, wikiDbToDomain, normalizePetscanPages, parsePetscanParams } from '../deploy/server.js';
import { fetchGlamStats, aggregateGlamStats } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

// ── relay URL construction ────────────────────────────────────────────────

test('buildPetscanUrl: widget-style params map to PetScan params', () => {
  const u = new URL(buildPetscanUrl({ cats: 'Images from XBio', depth: 1, budget: 500 }));
  assert.equal(u.origin, 'https://petscan.wmcloud.org');
  assert.equal(u.searchParams.get('lang'), 'commons');
  assert.equal(u.searchParams.get('project'), 'wikimedia');
  assert.equal(u.searchParams.get('cats'), 'Images from XBio');
  assert.equal(u.searchParams.get('depth'), '1');
  assert.equal(u.searchParams.get('ns'), '6');
  assert.equal(u.searchParams.get('giu'), '1');
  assert.equal(u.searchParams.get('max'), '500'); // budget → max (ignored by PetScan; enforced in normalize)
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('doit'), '1');
  assert.equal(u.searchParams.get('redirects'), '0');
  assert.equal(u.searchParams.get('negcats'), null); // absent when empty
});

test('buildPetscanUrl: negcats | form → newline-separated (petscan.js rule)', () => {
  const u = new URL(buildPetscanUrl({ cats: 'C', negcats: 'Cat A|Cat B', negdepth: 2 }));
  assert.equal(u.searchParams.get('negcats'), 'Cat A\nCat B');
  assert.equal(u.searchParams.get('negdepth'), '2');
});

test('buildPetscanUrl: defaults', () => {
  const u = new URL(buildPetscanUrl({ cats: 'C' }));
  assert.equal(u.searchParams.get('depth'), '0');
  assert.equal(u.searchParams.get('max'), '500');
});

// ── wiki DB name → domain ─────────────────────────────────────────────────

test('wikiDbToDomain: wikipedia families', () => {
  assert.equal(wikiDbToDomain('enwiki'), 'en.wikipedia.org');
  assert.equal(wikiDbToDomain('dewiki'), 'de.wikipedia.org');
  assert.equal(wikiDbToDomain('simplewiki'), 'simple.wikipedia.org');
  assert.equal(wikiDbToDomain('zh_yuewiki'), 'zh-yue.wikipedia.org'); // underscore → hyphen
  assert.equal(wikiDbToDomain('zh_min_nanwiki'), 'zh-min-nan.wikipedia.org');
});

test('wikiDbToDomain: sister projects + special wikis', () => {
  assert.equal(wikiDbToDomain('commonswiki'), 'commons.wikimedia.org');
  assert.equal(wikiDbToDomain('specieswiki'), 'species.wikimedia.org');
  assert.equal(wikiDbToDomain('metawiki'), 'meta.wikimedia.org');
  assert.equal(wikiDbToDomain('wikidatawiki'), 'www.wikidata.org');
  assert.equal(wikiDbToDomain('frwikisource'), 'fr.wikisource.org');
  assert.equal(wikiDbToDomain('enwiktionary'), 'en.wiktionary.org');
  assert.equal(wikiDbToDomain('dewikivoyage'), 'de.wikivoyage.org');
  assert.equal(wikiDbToDomain('ptwikinews'), 'pt.wikinews.org');
});

test('wikiDbToDomain: unknown DB names pass through (client treats as non-viewable)', () => {
  assert.equal(wikiDbToDomain('unexpected_project'), 'unexpected_project');
  assert.equal(wikiDbToDomain(''), '');
});

// ── PetScan response normalization ────────────────────────────────────────

const PAGES = [
  { page_title: 'XBio_illustration_–_Zygote.png', giu: [{ wiki: 'enwiki', page: 'Visible_spectrum', ns: 0 }, { wiki: 'commonswiki', page: 'File:XBio_illustration.jpg', ns: 6 }] },
  { page_title: 'XBio_illustration_–_Actin.png', giu: [{ wiki: 'dewiki', page: 'Aktin', ns: 0 }] },
  { page_title: 'XBio_illustration_–_Unused.png' }, // no giu key at all
];

test('normalizePetscanPages: titles get File: prefix + spaces; usage carries exact ns', () => {
  const { files, usage, capped } = normalizePetscanPages(PAGES, 10);
  assert.deepEqual(files, ['File:XBio illustration – Zygote.png', 'File:XBio illustration – Actin.png', 'File:XBio illustration – Unused.png']);
  assert.deepEqual(usage['File:XBio illustration – Zygote.png'], [
    { wiki: 'en.wikipedia.org', page: 'Visible_spectrum', ns: 0 },
    { wiki: 'commons.wikimedia.org', page: 'File:XBio_illustration.jpg', ns: 6 },
  ]);
  assert.deepEqual(usage['File:XBio illustration – Unused.png'], []);
  assert.equal(capped, false);
});

test('normalizePetscanPages: budget truncation sets capped (PetScan ignores max)', () => {
  const { files, usage, capped } = normalizePetscanPages(PAGES, 2);
  assert.equal(files.length, 2);
  assert.equal(capped, true);
  assert.ok(usage['File:XBio illustration – Unused.png'] === undefined); // beyond budget → not walked
});

test('normalizePetscanPages: 30,000-budget tree truncates at the ceiling', () => {
  const big = Array.from({ length: 30001 }, (_, i) => ({ page_title: `F${i}.jpg` }));
  const { files, usage, capped } = normalizePetscanPages(big, 30000);
  assert.equal(files.length, 30000);
  assert.equal(capped, true);
  assert.ok(usage['File:F30000.jpg'] === undefined); // first beyond ceiling
});

test('normalizePetscanPages: empty/garbage input', () => {
  assert.deepEqual(normalizePetscanPages(undefined, 5), { files: [], usage: {}, capped: false });
  assert.deepEqual(normalizePetscanPages([], 5), { files: [], usage: {}, capped: false });
  const { files } = normalizePetscanPages([{ page_title: '_' }, { page_title: 'ok.jpg' }], 5);
  assert.deepEqual(files, ['File:ok.jpg']); // blank titles skipped
});

// ── param validation ──────────────────────────────────────────────────────

test('parsePetscanParams: cats required; depth/budget clamped', () => {
  const base = 'http://localhost/api/petscan?cats=C';
  assert.equal(parsePetscanParams(new URL(base)).ok, true);
  assert.equal(parsePetscanParams(new URL('http://localhost/api/petscan')).ok, false);
  assert.equal(parsePetscanParams(new URL('http://localhost/api/petscan?cats=')).ok, false);
  const clamped = parsePetscanParams(new URL(`${base}&depth=99&budget=99999`)).params;
  assert.equal(clamped.depth, 12);
  assert.equal(clamped.budget, 30000); // ceiling = GLAMorgan's 30K (raised 2026-08-17, was 1000 → 10000)
  const defaults = parsePetscanParams(new URL(`${base}&depth=&budget=`)).params;
  assert.equal(defaults.depth, 0);
  assert.equal(defaults.budget, 500);
});

// ── shared aggregation (stubbed views/thumbs — no network) ────────────────

const VIEWS = {
  'en.wikipedia.org:Alpha': 10,
  'de.wikipedia.org:Alpha': 5,
  'en.wikipedia.org:Beta': 7,
  'fr.wikipedia.org:Gamma': 3,
};
const stubViews = async (wiki, page) => VIEWS[`${wiki}:${page}`] || 0;
const stubThumbs = async () => {};

const FILES = ['File:A.jpg', 'File:B.png', 'File:C.svg'];
const USAGE = {
  'File:A.jpg': [
    { wiki: 'en.wikipedia.org', page: 'Alpha', ns: 0 },
    { wiki: 'de.wikipedia.org', page: 'Alpha', ns: 0 },
    { wiki: 'commons.wikimedia.org', page: 'File:A.jpg', ns: 6 }, // dropped
  ],
  'File:B.png': [
    { wiki: 'en.wikipedia.org', page: 'Beta', ns: 0 },
    { wiki: 'en.wikipedia.org', page: 'Talk:Beta', ns: 1 }, // dropped
  ],
  'File:C.svg': [], // unused
};

test('aggregateGlamStats: ns filtering, pages map, per-file views, totals', async () => {
  const r = await aggregateGlamStats(FILES, USAGE, { year: 2026, month: 7, topN: 5, views: stubViews, thumbs: stubThumbs });
  assert.equal(r.files, 3);
  assert.equal(r.usedFiles, 2); // A, B (C unused)
  assert.equal(r.viewedFiles, 2); // both used files have views
  assert.equal(r.pages, 3); // Alpha(en,de), Beta(en)
  assert.equal(r.wikis, 2); // en.wikipedia.org, de.wikipedia.org
  assert.equal(r.totalViews, 22); // 10+5+7
  assert.equal(r.partialViews, false);
  assert.equal(r.monthLabel, '2026-07');
  // top-N filmstrip ranked by views (display titles strip File: prefix)
  assert.deepEqual(r.top.map((t) => [t.title, t.views]), [['A.jpg', 15], ['B.png', 7]]);
  // top-file detail: ns-0 rows only, sorted by views
  assert.equal(r.detail.title, 'Top file: A.jpg');
  assert.deepEqual(r.detail.rows, [
    { wiki: 'en.wikipedia.org', page: 'Alpha', views: 10 },
    { wiki: 'de.wikipedia.org', page: 'Alpha', views: 5 },
  ]);
});

test('aggregateGlamStats: self-walk usage (no ns field) treated as article', async () => {
  const legacy = {
    'File:A.jpg': [{ wiki: 'en.wikipedia.org', page: 'Alpha' }], // no ns → keep
    'File:B.png': [],
  };
  const r = await aggregateGlamStats(['File:A.jpg', 'File:B.png'], legacy, { year: 2026, month: 7, topN: 5, views: stubViews, thumbs: stubThumbs });
  assert.equal(r.usedFiles, 1);
  assert.equal(r.pages, 1);
  assert.equal(r.totalViews, 10);
});

test('aggregateGlamStats: partialViews beyond the view budget', async () => {
  const files = Array.from({ length: 5 }, (_, i) => `File:${i}.jpg`);
  const usage = {};
  for (let i = 0; i < 5; i++) {
    usage[files[i]] = Array.from({ length: 40 }, (_, j) => ({ wiki: 'en.wikipedia.org', page: `Page_${i}_${j}`, ns: 0 }));
  }
  // 5 files × 40 pages = 200 distinct pages > GLAM_VIEW_BUDGET (150)
  const r = await aggregateGlamStats(files, usage, { year: 2026, month: 7, topN: 5, views: stubViews, thumbs: stubThumbs });
  assert.equal(r.partialViews, true);
  assert.equal(r.pages, 200);
});

test('aggregateGlamStats: showDetail=false skips the detail table', async () => {
  const r = await aggregateGlamStats(FILES, USAGE, { year: 2026, month: 7, topN: 5, showDetail: false, views: stubViews, thumbs: stubThumbs });
  assert.equal(r.detail, null);
});

// ── fetchGlamStats routing (relay primary, self-walk fallback) ────────────

test('fetchGlamStats: relay data is used when available (walk not called)', async () => {
  const calls = { relay: 0, walk: 0 };
  const relay = async () => {
    calls.relay++;
    return { source: 'petscan', files: FILES, usage: USAGE, capped: false, truncated: false };
  };
  const walk = async () => { calls.walk++; return { files: [], usage: {} }; };
  const r = await fetchGlamStats({ category: 'C', depth: 1, year: 2026, month: 7, fileBudget: 500, topN: 5, showDetail: true }, { relay, walk, views: stubViews, thumbs: stubThumbs });
  assert.equal(calls.relay, 1);
  assert.equal(calls.walk, 0);
  assert.equal(r.source, 'petscan');
  assert.equal(r.files, 3);
  assert.equal(r.totalViews, 22);
});

test('fetchGlamStats: relay failure or truncation falls back to the self-walk', async () => {
  const walkData = { files: ['File:A.jpg'], usage: { 'File:A.jpg': [{ wiki: 'en.wikipedia.org', page: 'Alpha', ns: 0 }] } };
  for (const badRelay of [
    async () => null,                                             // relay down
    async () => ({ source: 'petscan', files: [], usage: {}, capped: true, truncated: true }), // byte-cap hit
    async () => ({ source: 'petscan', files: [], usage: {}, capped: true, truncated: false }), // empty category
  ]) {
    let walked = false;
    const r = await fetchGlamStats({ category: 'C', year: 2026, month: 7, fileBudget: 500, topN: 5 }, {
      relay: badRelay,
      walk: async () => { walked = true; return walkData; },
      views: stubViews, thumbs: stubThumbs,
    });
    assert.ok(walked, 'fallback walk must run');
    assert.equal(r.source, 'selfwalk');
    assert.equal(r.files, 1);
    assert.equal(r.totalViews, 10);
  }
});

test('fetchGlamStats: relay capped flag propagates', async () => {
  const relay = async () => ({ source: 'petscan', files: FILES.slice(0, 2), usage: { 'File:A.jpg': USAGE['File:A.jpg'] }, capped: true, truncated: false });
  const r = await fetchGlamStats({ category: 'C', year: 2026, month: 7, fileBudget: 500, topN: 5 }, { relay, walk: async () => ({ files: [], usage: {} }), views: stubViews, thumbs: stubThumbs });
  assert.equal(r.source, 'petscan');
  assert.equal(r.cappedFiles, true);
});

test('fetchGlamStats: fileBudget up to 30,000 reaches the relay unchanged', async () => {
  const seen = [];
  const relay = async (p) => { seen.push(p.budget); return { source: 'petscan', files: FILES, usage: USAGE, capped: false, truncated: false }; };
  await fetchGlamStats({ category: 'C', year: 2026, month: 7, fileBudget: 5000, topN: 5 }, { relay, walk: async () => ({ files: [], usage: {} }), views: stubViews, thumbs: stubThumbs });
  await fetchGlamStats({ category: 'C', year: 2026, month: 7, fileBudget: 99999, topN: 5 }, { relay, walk: async () => ({ files: [], usage: {} }), views: stubViews, thumbs: stubThumbs });
  assert.deepEqual(seen, [5000, 30000]); // 99999 clamps to the 30,000 ceiling
});

test('fetchGlamStats: self-walk fallback is capped at 1,000 regardless of budget', async () => {
  // A 10,000-file budget must never trigger a 10,000-file browser walk:
  // the fallback caps at GLAM_FALLBACK_CAP and reports cappedFiles honestly.
  let walkBudget = null;
  const full = Array.from({ length: 1000 }, (_, i) => `File:W${i}.jpg`);
  const usage = Object.fromEntries(full.map((f) => [f, []]));
  const r = await fetchGlamStats({ category: 'C', year: 2026, month: 7, fileBudget: 10000, topN: 5 }, {
    relay: async () => null, // relay down → fallback
    walk: async (cat, depth, budget) => { walkBudget = budget; return { files: full, usage }; },
    views: stubViews, thumbs: stubThumbs,
  });
  assert.equal(walkBudget, 1000);
  assert.equal(r.source, 'selfwalk');
  assert.equal(r.files, 1000);
  assert.equal(r.cappedFiles, true); // walk hit its cap → labeled, not silent
});

test('fetchGlamStats: empty category → zero stats without network', async () => {
  const r = await fetchGlamStats({ category: 'Empty cat', year: 2026, month: 7, fileBudget: 500, topN: 5 }, {
    relay: async () => ({ source: 'petscan', files: [], usage: {}, capped: false, truncated: false }),
    walk: async () => ({ files: [], usage: {} }),
    views: stubViews, thumbs: stubThumbs,
  });
  assert.equal(r.files, 0);
  assert.equal(r.totalViews, 0);
  assert.deepEqual(r.top, []);
  assert.equal(r.detail, null);
});

test('fetchGlamStats: missing category throws (config guard)', async () => {
  await assert.rejects(() => fetchGlamStats({ year: 2026, month: 7 }, { relay: async () => null, walk: async () => ({ files: [], usage: {} }) }), /need a category/);
});

// ── transform contract: category titles link to Commons (ISSUE-47) ────────

test('glamorgan transform: category title links to the Commons category', () => {
  const t = WIDGET_TYPES.glamorgan.transform({
    category: 'People at Wikimania 2024', files: 2832, cappedFiles: false, partialViews: false,
    source: 'petscan', usedFiles: 290, viewedFiles: 100, pages: 500, wikis: 12, totalViews: 123456,
    monthLabel: '2026-07', top: [], detail: null,
  });
  assert.equal(t.href, 'https://commons.wikimedia.org/wiki/Category:People%20at%20Wikimania%202024');
  assert.equal(t.title, 'People at Wikimania 2024');
  assert.equal(t.detail, null); // no detail → stays null (card hides the table)
});

test('glamorgan transform: empty result explains the depth-0 case (not silent zeros)', () => {
  // depth 0: category itself has no files → point at the depth knob
  const t0 = WIDGET_TYPES.glamorgan.transform({
    category: 'Empty cat', files: 0, cappedFiles: false, partialViews: false,
    source: 'petscan', usedFiles: 0, viewedFiles: 0, pages: 0, wikis: 0, totalViews: 0,
    monthLabel: '2026-07', top: [], detail: null,
  }, { depth: 0 });
  assert.equal(t0.emptyHint, 'No files directly in this category — increase Depth to include subcategories');
  // depth > 0: tree scanned, nothing found → different message
  const t5 = WIDGET_TYPES.glamorgan.transform({
    category: 'Empty cat', files: 0, cappedFiles: false, partialViews: false,
    source: 'petscan', usedFiles: 0, viewedFiles: 0, pages: 0, wikis: 0, totalViews: 0,
    monthLabel: '2026-07', top: [], detail: null,
  }, { depth: 5 });
  assert.equal(t5.emptyHint, 'No files found in this category tree');
  // non-empty: no hint at all
  const t1 = WIDGET_TYPES.glamorgan.transform({
    category: 'C', files: 2832, cappedFiles: false, partialViews: false,
    source: 'petscan', usedFiles: 290, viewedFiles: 100, pages: 500, wikis: 12, totalViews: 123456,
    monthLabel: '2026-07', top: [], detail: null,
  }, { depth: 5 });
  assert.equal(t1.emptyHint, undefined);
});

test('glamorgan transform: detail rows link to their wiki pages (full domains)', () => {
  const t = WIDGET_TYPES.glamorgan.transform({
    category: 'C', files: 1, cappedFiles: false, partialViews: false,
    source: 'petscan', usedFiles: 1, viewedFiles: 1, pages: 2, wikis: 2, totalViews: 100,
    monthLabel: '2026-07', top: [],
    detail: {
      title: 'Top file: Dogs Plate XI.jpg',
      rows: [
        { wiki: 'en.wikipedia.org', page: 'Visible_spectrum', views: 42 },
        { wiki: 'commons.wikimedia.org', page: 'File:Dogs Plate XI.jpg', views: 7 },
        { wiki: 'testwiki', page: 'Some_Page', views: 1 }, // unknown DB → no href
      ],
    },
  });
  assert.equal(t.detail.titleHref, 'https://commons.wikimedia.org/wiki/File:Dogs_Plate_XI.jpg');
  assert.deepEqual(t.detail.rows.map((r) => r.href), [
    'https://en.wikipedia.org/wiki/Visible_spectrum',
    'https://commons.wikimedia.org/wiki/File%3ADogs_Plate_XI.jpg', // colon URL-encoded (valid, MW-normalized)
    null, // unknown wiki prefix → plain text
  ]);
  assert.equal(t.detail.rows[2].page, 'Some_Page');
});

test('cimSnapshot transform: underscore-form category links to Commons', () => {
  const t = WIDGET_TYPES.cimSnapshot.transform(
    { category: 'Files_from_the_Biodiversity_Heritage_Library', files: 305868, used: 14434, wikis: 252, pages: 41819, filesDeep: 305868 },
    { scope: 'deep', month: 0 },
  );
  assert.equal(t.href, 'https://commons.wikimedia.org/wiki/Category:Files_from_the_Biodiversity_Heritage_Library');
  assert.equal(t.title, 'Files from the Biodiversity Heritage Library');
});
