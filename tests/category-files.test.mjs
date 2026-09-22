import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCategoryName, categoryMemberTitles } from '../src/widgets/dataSources.js';
import { inferGallerySource, galleryProject, GALLERY_SOURCES } from '../src/lib/gallerySource.js';
import { WIDGET_TYPES, widgetDef, recentWidgetDefs } from '../src/widgets/index.js';

/**
 * A Commons category as a gallery source (2026-09-18).
 *
 * The point of these tests is the seam: a category is just another way to obtain a file list, so the
 * widget should behave exactly like the pasted-list gallery in every way except where the list came from.
 */

const def = WIDGET_TYPES.gallery;

const row = (n) => ({ title: `File ${n}`, thumbUrl: `https://upload.test/${n}.jpg`, width: 100, height: 100 });
const categoryData = (n = 500, total = 518) => ({
  rows: Array.from({ length: n }, (_, i) => row(i)),
  total, listed: n, category: 'Category:Images from XBio', missing: 0,
});

test('category names: prefix, quotes and padding all mean the same category', () => {
  assert.equal(cleanCategoryName('Category:Images from XBio'), 'Images from XBio');
  assert.equal(cleanCategoryName('category: Images from XBio'), 'Images from XBio');
  assert.equal(cleanCategoryName('  Images from XBio  '), 'Images from XBio');
  assert.equal(cleanCategoryName('"Images from XBio"'), 'Images from XBio');
  assert.equal(cleanCategoryName(''), '');
  assert.equal(cleanCategoryName(null), '');       // a config that lost its value must not throw
  assert.equal(cleanCategoryName(undefined), '');
});

test('categorymembers: files only — including the File: titles that cmsort=timestamp lets through', () => {
  const d = { query: { categorymembers: [
    { ns: 6, title: 'File:XBio illustration – Actin.png' },
    { ns: 6, title: 'File:Another photo.jpg' },
    { ns: 14, title: 'Category:XBio diagrams' },                  // a subcategory is not a file
    { ns: 14, title: 'File:namespaced as a category, still a file' }, // observed under cmsort=timestamp
    { ns: 0, title: 'Some article' },
    { title: '' },
  ] } };
  assert.deepEqual(categoryMemberTitles(d), [
    'XBio illustration – Actin.png',
    'Another photo.jpg',
    'namespaced as a category, still a file',
  ]);
  assert.deepEqual(categoryMemberTitles({}), []);
  assert.deepEqual(categoryMemberTitles(null), []);
});

test('category source: names the card after the category and reports the cap honestly', () => {
  const view = def.transform(categoryData(), { ...def.defaults, from: 'category', order: 'listed' });
  assert.equal(view.title, 'Category:Images from XBio');
  assert.match(view.subtitle, /500 files · of 518 in the category · as returned \(alphabetical\)/);
  assert.equal(view.rows.length, 500);
});

test('a category that fits does not claim to be capped', () => {
  const view = def.transform(categoryData(37, 37), { ...def.defaults, from: 'category' });
  assert.match(view.subtitle, /37 files/);
  assert.doesNotMatch(view.subtitle, /of 37/);
});

test('the pasted-list gallery is unchanged (an old board must render exactly as before)', () => {
  const data = { rows: [row(1)], total: 1, missing: 0 };
  const view = def.transform(data, { ...def.defaults, from: 'list', order: 'alpha' });
  assert.equal(view.title, 'Commons files');
  assert.match(view.subtitle, /^1 file/);
  assert.doesNotMatch(view.subtitle, /category/i);
});

test('order: newest is labelled, random keeps the set, largest sorts by area', () => {
  const newest = def.transform(categoryData(3, 3), { ...def.defaults, from: 'category', order: 'newest' });
  assert.match(newest.subtitle, /newest first/);

  const rowsIn = [row(1), row(2), row(3), row(4)];
  const random = def.transform({ rows: rowsIn, total: 4, missing: 0 }, { ...def.defaults, from: 'list', order: 'random' });
  assert.deepEqual([...random.rows.map((r) => r.title)].sort(), [...rowsIn.map((r) => r.title)].sort());

  const big = { title: 'big', width: 900, height: 900 };
  const small = { title: 'small', width: 10, height: 10 };
  const largest = def.transform({ rows: [small, big], total: 2, missing: 0 }, { ...def.defaults, from: 'list', order: 'largest' });
  assert.deepEqual(largest.rows.map((r) => r.title), ['big', 'small']);
});

test('the subtitle counts what the card shows, and names the pool when the order only read part of it', () => {
  const view = def.transform(categoryData(), { ...def.defaults, from: 'category', maxItems: 24 });
  assert.equal(view.rows.length, 24);
  assert.match(view.subtitle, /^24 files · of 518 in the category/);

  // faithful orders (alpha/newest) need no caveat: the API's order survives truncation
  const alpha = def.transform(categoryData(60, 518), { ...def.defaults, from: 'category', order: 'alpha', maxItems: 24 });
  assert.doesNotMatch(alpha.subtitle, /first \d+/);

  // random/largest are applied to a pool, so the pool is named when the category is bigger than it
  const random = def.transform(categoryData(500, 518), { ...def.defaults, from: 'category', order: 'random', maxItems: 12 });
  assert.match(random.subtitle, /^12 files · of 518 in the category · random order · from the first 500$/);

  // a whole category in a pool: no cap, no pool
  const whole = def.transform(categoryData(40, 40), { ...def.defaults, from: 'category', order: 'random', maxItems: 12 });
  assert.equal(whole.subtitle, '12 files · of 40 in the category · random order');   // the pool is the category…
});

test('a gallery is wireable: lines come out of the same card that shows the images', () => {
  const emitted = def.emit({ rows: [{ title: 'A.jpg', caption: 'A caption' }, { title: 'B.jpg' }] });
  assert.deepEqual(emitted.lines, ['A caption', 'B.jpg']);
  assert.equal(def.primary, 'lines');
  assert.deepEqual(def.outputs, { lines: 'lines', selection: 'value' });
});

test('the source fields are mutually exclusive in the config UI', () => {
  const field = (k) => def.configFields.find((f) => f.key === k);
  assert.deepEqual(field('files').showIf, { from: 'list' });
  assert.deepEqual(field('category').showIf, { from: 'category' });
  assert.deepEqual(field('project').showIf, { from: ['article', 'page', 'category'] });
  assert.deepEqual(field('from').options.map((o) => o.value), ['article', 'page', 'category', 'list']);
  // the default is the old behaviour, so existing boards and links are untouched
  assert.equal(def.defaults.from, 'article');   // a legacy `gallery` board had no `from` and meant an article
});

/* ── the merge itself: old boards and links must keep rendering (ISSUE-105) ───────────────────────────────── */

test('the two retired type ids resolve to the merged widget', () => {
  assert.equal(widgetDef('commonsGallery'), WIDGET_TYPES.gallery);
  assert.equal(widgetDef('fileGallery'), WIDGET_TYPES.gallery);
  assert.equal(widgetDef('gallery'), WIDGET_TYPES.gallery);
  assert.equal(widgetDef('nonsense'), null);
  // …and the picker must NOT list them: resolving an alias is not adding a second entry
  assert.deepEqual(Object.keys(WIDGET_TYPES).filter((k) => /commonsGallery|fileGallery/.test(k)), []);
});

test("a legacy board's source is inferred from the fields it carries", () => {
  assert.equal(inferGallerySource({ page: 'The Venetian Macao' }, 'commonsGallery'), 'page');
  assert.equal(inferGallerySource({ files: 'File:A.jpg' }, 'fileGallery'), 'list');
  assert.equal(inferGallerySource({ category: 'Images from XBio' }, 'fileGallery'), 'category');
  assert.equal(inferGallerySource({ article: 'Albert Einstein' }, 'gallery'), 'article');
  assert.equal(inferGallerySource({}, 'gallery'), 'article');                      // an old board had no `from`
  assert.equal(inferGallerySource({ from: 'category', page: 'Something Else' }), 'category');  // explicit wins
  assert.equal(inferGallerySource({ files: 'File:A.jpg', order: 'random' }, 'fileGallery'), 'list');
  for (const src of GALLERY_SOURCES) assert.equal(inferGallerySource({ from: src }), src);
});

test('the project default belongs to the source, not the widget', () => {
  // one static default cannot serve both: en.wikipedia is right for an article and a missing page on Commons
  assert.equal(galleryProject({}, 'article'), 'en.wikipedia');
  assert.equal(galleryProject({}, 'page'), 'commons.wikimedia');
  assert.equal(galleryProject({}, 'category'), 'commons.wikimedia');
  // an explicit project wins, under either name — `wiki` is what the category source shipped with for a day
  assert.equal(galleryProject({ project: 'de.wikipedia' }, 'page'), 'de.wikipedia');
  assert.equal(galleryProject({ wiki: 'commons.wikimedia' }, 'category'), 'commons.wikimedia');
});

test('every source reaches its own branch, and none crashes on a payload it did not expect', () => {
  for (const src of GALLERY_SOURCES) {
    const card = def.transform({ rows: [], total: 0 }, { ...def.defaults, from: src });
    assert.ok(card && typeof card.title === 'string', `${src} produced a card`);
    assert.deepEqual(card.rows, []);
  }
});

test('every source can name its own card (labelFromConfig is called on every render)', () => {
  // The live failure this catches (2026-09-18): the merged entry called a helper that was not imported, so every
  // render of the widget threw — and the tests passed, because none of them had ever CALLED labelFromConfig.
  for (const src of GALLERY_SOURCES) {
    const label = def.labelFromConfig({ ...def.defaults, from: src });
    assert.ok(label === null || typeof label === 'string', `${src} named its card`);
  }
  assert.equal(def.labelFromConfig({ ...def.defaults, from: 'category', category: 'Images from XBio' }), 'Category:Images from XBio');
  assert.equal(def.labelFromConfig({ ...def.defaults, from: 'category', category: 'Category:Images from XBio' }), 'Category:Images from XBio');
  assert.equal(def.labelFromConfig({ ...def.defaults, from: 'list', files: 'File:A.jpg\nFile:B.jpg' }), '2 files');
  assert.equal(def.labelFromConfig({ ...def.defaults, from: 'article', article: 'Ada_Lovelace' }), 'Ada Lovelace');
});

test('the Add-widget recents collapse to one entry per widget, not one per legacy id', () => {
  // A browser mid-migration holds all three gallery ids, and each resolves to the same definition: the panel showed
  // "Gallery" three times, with three identical + buttons (reported 2026-09-18).
  const defs = recentWidgetDefs(['gallery', 'commonsGallery', 'fileGallery', 'pageviews']);
  assert.deepEqual(defs.map((d) => d.id), ['gallery', 'pageviews']);
  assert.equal(defs.length, 2);
  // order is the recency order, unknown ids are dropped, and an empty list is fine
  assert.deepEqual(recentWidgetDefs(['pageviews', 'nonsense']).map((d) => d.id), ['pageviews']);
  assert.deepEqual(recentWidgetDefs([]), []);
  assert.deepEqual(recentWidgetDefs(undefined), []);
  assert.deepEqual(recentWidgetDefs(['fileGallery', 'gallery']).map((d) => d.id), ['gallery']);
});
