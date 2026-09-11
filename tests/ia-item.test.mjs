/**
 * IA Item widget tests (ISSUE-25, 2026-09-10).
 *
 * The fetcher's two endpoints were verified live (ACAO `*`: archive.org/metadata
 * 324 ms, be-api views 351 ms). These tests pin the pure shaping so a metadata
 * change on IA's side shows up here rather than as a blank card in a board.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeIaItem, iaBytes, fetchIaItem } from '../src/widgets/dataSources.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

// Real response shape, trimmed (captured 2026-09-10 from archive.org/metadata/nasa
// and be-api.us.archive.org/views/v1/short/nasa).
const META = {
  files_count: 42,
  item_size: 1548000,
  metadata: {
    identifier: 'nasa',
    title: 'NASA',
    mediatype: 'collection',
    collection: 'movies',
    creator: 'NASA',
    year: '2000',
    description: '<p>Collaborative collection with <b>NASA</b> and the Internet Archive.</p>',
  },
  files: new Array(42).fill({ name: 'x' }),
};
const VIEWS = { all_time: 47847396, have_data: true, last_30day: 538283, last_7day: 101202 };

test('shapeIaItem: the card contract has a title, link, thumbnail and four tiles', () => {
  const c = shapeIaItem(META, VIEWS);
  assert.equal(c.title, 'NASA');
  assert.equal(c.href, 'https://archive.org/details/nasa');
  assert.equal(c.detailsUrl, c.href);
  assert.equal(c.image.url, 'https://archive.org/services/img/nasa');
  assert.equal(c.stats.length, 4);
});

test('shapeIaItem: views are formatted, labelled as IA engagement, not pageviews', () => {
  const s = shapeIaItem(META, VIEWS).stats;
  assert.equal(s[0].value, '47,847,396');
  assert.equal(s[0].sub, 'IA engagement');
  assert.equal(s[1].value, '538,283');
  assert.equal(s[1].sub, 'updated daily');
  assert.equal(s[2].value, '101,202');
});

test('shapeIaItem: subtitle combines creator · year · mediatype · collection', () => {
  assert.equal(shapeIaItem(META, VIEWS).subtitle, 'NASA · 2000 · collection · movies');
});

test('shapeIaItem: files tile falls back to files_count then files[]', () => {
  assert.equal(shapeIaItem(META, VIEWS).stats[3].value, '42');
  assert.equal(shapeIaItem(META, VIEWS).stats[3].sub, '1.5 MB');
  const noCount = { metadata: { identifier: 'x' }, files: [{}, {}, {}] };
  assert.equal(shapeIaItem(noCount, null).stats[3].value, '3');
});

test('shapeIaItem: HTML in title/description is stripped for display', () => {
  const c = shapeIaItem({ metadata: { identifier: 'x', title: 'A <i>Title</i>', description: '<p>Two\n  lines</p>' } }, null);
  assert.equal(c.title, 'A Title');
  assert.equal(c.description, 'Two lines');
});

test('shapeIaItem: a views failure degrades to dashes, never a broken card', () => {
  const c = shapeIaItem(META, null);
  assert.deepEqual(c.stats.slice(0, 3).map((s) => s.value), ['—', '—', '—']);
  assert.equal(c.stats[0].sub, 'unavailable');
  assert.equal(c.title, 'NASA'); // metadata still renders
});

test('shapeIaItem: have_data:false is reported distinctly from a failed lookup', () => {
  assert.equal(shapeIaItem(META, { have_data: false }).stats[0].sub, 'no data yet');
});

test('shapeIaItem: a missing identifier yields no thumbnail and no link', () => {
  const c = shapeIaItem({ metadata: {} }, null);
  assert.equal(c.image, null);
  assert.equal(c.href, 'https://archive.org/details/');
});

test('iaBytes: base-1000 units, and empty for unknown size', () => {
  assert.equal(iaBytes(0), '');
  assert.equal(iaBytes(999), '999 B');
  assert.equal(iaBytes(1000), '1 kB');
  assert.equal(iaBytes(1548000), '1.5 MB');
  assert.equal(iaBytes(2500000000), '2.5 GB');
});

test('registry: iaItem is registered with all five widget pieces', () => {
  const w = WIDGET_TYPES.iaItem;
  assert.ok(w, 'iaItem missing from WIDGET_TYPES');
  assert.equal(w.id, 'iaItem');
  assert.equal(w.timeScope, 'point');
  assert.equal(w.icon, '📦');
  assert.equal(typeof w.fetch, 'function');
  assert.equal(typeof w.transform, 'function');
  assert.equal(w.renderer, 'CimSnapshotCard');
  assert.deepEqual(w.configFields.map((f) => f.key), ['identifier']);
  assert.equal(w.defaults.refreshSeconds, 86400);
  assert.ok(w.defaultLayout.w && w.defaultLayout.h);
});

test('registry: iaItem emits its canonical URL (Emitter Contract)', () => {
  const w = WIDGET_TYPES.iaItem;
  assert.equal(w.outputs.kind, 'value'); // must stay in the documented kind set
  assert.equal(w.emit({ detailsUrl: 'https://archive.org/details/nasa' }, {}),
    'https://archive.org/details/nasa');
});

test('registry: every widget declares an emit only alongside an output kind', () => {
  for (const [id, w] of Object.entries(WIDGET_TYPES)) {
    if (w.emit) assert.ok(w.outputs && w.outputs.kind, `${id} emits without outputs.kind`);
  }
});

test('fetchIaItem: an empty identifier fails fast with a usable message', async () => {
  await assert.rejects(() => fetchIaItem('   '), /Internet Archive identifier/);
});
