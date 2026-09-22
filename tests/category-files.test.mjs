import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCategoryName, categoryMemberTitles } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

/**
 * A Commons category as a gallery source (2026-09-18).
 *
 * The point of these tests is the seam: a category is just another way to obtain a file list, so the
 * widget should behave exactly like the pasted-list gallery in every way except where the list came from.
 */

const def = WIDGET_TYPES.fileGallery;

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
  const random = def.transform({ rows: rowsIn, total: 4, missing: 0 }, { ...def.defaults, order: 'random' });
  assert.deepEqual([...random.rows.map((r) => r.title)].sort(), [...rowsIn.map((r) => r.title)].sort());

  const big = { title: 'big', width: 900, height: 900 };
  const small = { title: 'small', width: 10, height: 10 };
  const largest = def.transform({ rows: [small, big], total: 2, missing: 0 }, { ...def.defaults, order: 'largest' });
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
  assert.deepEqual(field('wiki').showIf, { from: 'category' });
  assert.deepEqual(field('from').options.map((o) => o.value), ['list', 'category']);
  // the default is the old behaviour, so existing boards and links are untouched
  assert.equal(def.defaults.from, 'list');
});
