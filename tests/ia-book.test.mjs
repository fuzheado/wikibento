/**
 * IA Book widget tests (ISSUE-25 media family, 2026-09-15).
 *
 * Fixtures are trimmed real responses captured from
 *   iiif.archive.org/iiif/goodytwoshoes00newyiala/manifest.json   (200, 25.7 KB, 1.0 s, CORS)
 *   iiif.archive.org/iiif/search/goodytwoshoes00newyiala/?q=goody (200, 22 hits)
 *   iiif.archive.org/iiif/3/annotations/…/{id}_djvu.xml/1.json     (200, AnnotationPage)
 *
 * The point of most of these is trapping failure modes that LOOK like success: a page count that
 * disagrees with the manifest, a leaf numbering that is 0-based in ids and 1-based in labels, and
 * out-of-range leaves that answer HTTP 200 with a blank image instead of a 404.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  labelText, serviceImageUrl, xywhRegion, leafOf, pagesFromManifest,
  searchServiceId, searchHits, stripOcrHtml, pageText, bookLinks, manifestUrl,
} from '../src/lib/iaBook.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

// ── fixtures ────────────────────────────────────────────────────────────────────
const canvas = (leaf, label, w = 2454, h = 3192) => ({
  id: `https://iiif.archive.org/iiif/goodytwoshoes00newyiala$${leaf}/canvas`,
  type: 'Canvas',
  label: { none: [label] },
  width: w,
  height: h,
  items: [{ items: [{ body: {
    id: `https://iiif.archive.org/image/iiif/3/goodytwoshoes00newyiala%2Fgoodytwoshoes00newyiala_jp2.zip%2Fgoodytwoshoes00newyiala_${String(leaf).padStart(4, '0')}.jp2`,
    service: [{ id: `https://iiif.archive.org/image/iiif/3/goodytwoshoes00newyiala%2Fgoodytwoshoes00newyiala_jp2.zip%2Fgoodytwoshoes00newyiala_${String(leaf).padStart(4, '0')}.jp2` }],
  } }] }],
  annotations: [{ id: `https://iiif.archive.org/iiif/3/annotations/goodytwoshoes00newyiala/goodytwoshoes00newyiala_djvu.xml/${leaf}.json`, type: 'AnnotationPage' }],
});

const MANIFEST = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: 'https://iiif.archive.org/iiif/goodytwoshoes00newyiala/manifest.json',
  type: 'Manifest',
  label: { none: ['Goody Two-Shoes'] },
  summary: { none: ["Publisher's chromolithographed pictorial wrappers"] },
  behavior: ['paged'],
  viewingDirection: 'left-to-right',
  // The item metadata says imagecount 20; this manifest is the truth. 16 canvases in the real one.
  metadata: [{ label: { none: ['imagecount'] }, value: { none: ['20'] } }],
  service: [{ '@id': 'https://iiif.archive.org/iiif/search/goodytwoshoes00newyiala', '@type': 'SearchService1', profile: 'http://iiif.io/api/search/1/search' }],
  rendering: [
    { format: 'image/vnd.djvu', id: 'https://archive.org/download/goodytwoshoes00newyiala/goodytwoshoes00newyiala.djvu', label: { en: ['DjVu'] }, type: 'Image' },
    { format: 'application/pdf', id: 'https://archive.org/download/goodytwoshoes00newyiala/goodytwoshoes00newyiala.pdf', label: { en: ['PDF'] }, type: 'Text' },
  ],
  items: [canvas(0, '1'), canvas(1, '2'), canvas(2, '3'), canvas(3, '4')],
};

const SEARCH_V1 = {
  '@context': 'http://iiif.io/api/search/1/context.json',
  '@id': 'https://iiif.archive.org/iiif/search/goodytwoshoes00newyiala/?q=goody',
  '@type': 'sc:AnnotationList',
  resources: [
    { '@id': 'https://iiif.archive.org/iiif/goodytwoshoes00newyiala/annotation/anno1',
      '@type': 'oa:Annotation', motivation: 'sc:painting',
      on: 'https://iiif.archive.org/iiif/goodytwoshoes00newyiala$2/canvas#xywh=727,190,335,42',
      resource: { '@type': 'cnt:ContentAsText', chars: 'GOODY' } },
    { on: 'https://iiif.archive.org/iiif/goodytwoshoes00newyiala$9/canvas#xywh=1,2,3,4',
      resource: { chars: 'SHOES' } },
  ],
};
const SEARCH_V2 = { hits: [{ on: 'https://x/y$1/canvas#xywh=1,1,2,2', body: { value: '<span>GOODY</span> <b>two</b>' } }] };

const PAGE_ANNO = { type: 'AnnotationPage', items: [
  { body: { value: '<p>GOODY TWO-SHOES.</p>' } },
  { body: { value: 'Part <em>I</em>. &amp; more' } },
] };

const META = { files: [
  { name: 'goodytwoshoes00newyiala.pdf', format: 'Text PDF' },
  { name: 'goodytwoshoes00newyiala_bw.pdf', format: 'Grayscale PDF' },
  { name: 'goodytwoshoes00newyiala.epub' },
  { name: 'goodytwoshoes00newyiala_djvu.txt' },
  { name: 'goodytwoshoes00newyiala.djvu' },
  { name: '__ia_thumb.jpg' },
] };

// ── labels ──────────────────────────────────────────────────────────────────────
test('labelText: v3 language maps, arrays, plain strings, and nothing at all', () => {
  assert.equal(labelText({ none: ['Goody Two-Shoes'] }), 'Goody Two-Shoes');
  assert.equal(labelText({ en: ['A'], none: ['B'] }), 'A');          // a real language wins
  assert.equal(labelText({ fr: ['Deux'] }), 'Deux');                  // any language beats none
  assert.equal(labelText(['x', 'y']), 'x y');
  assert.equal(labelText('  plain  '), 'plain');
  assert.equal(labelText(undefined), '');
  assert.equal(labelText({}), '');
});

test('leafOf: reads the leaf out of canvas ids and search targets', () => {
  assert.equal(leafOf('https://iiif.archive.org/iiif/x$2/canvas'), 2);
  assert.equal(leafOf('https://iiif.archive.org/iiif/x$0/canvas#xywh=1,2,3,4'), 0);
  assert.equal(leafOf('nothing here'), null);
});

// ── the manifest is the page authority ──────────────────────────────────────────
test('pagesFromManifest: page count comes from the canvases, NOT from imagecount', () => {
  const out = pagesFromManifest(MANIFEST);
  assert.equal(out.pages.length, 4, 'the fixture manifest has 4 canvases');
  assert.equal(out.title, 'Goody Two-Shoes');
  assert.equal(out.viewingDirection, 'left-to-right');
  assert.ok(out.behavior.includes('paged'));
  // The manifest's own metadata says imagecount 20 — it must not be consulted.
  assert.notEqual(out.pages.length, 20);
});

test('pagesFromManifest: canvases are 0-based in ids and 1-based in labels', () => {
  const p = pagesFromManifest(MANIFEST).pages;
  assert.equal(p[0].leaf, 0);
  assert.equal(p[0].label, '1');
  assert.equal(p[3].leaf, 3);
  assert.equal(p[3].label, '4');
  assert.equal(p[0].index, 0);
});

test('pagesFromManifest: each page carries its own image service and its size', () => {
  const p = pagesFromManifest(MANIFEST).pages[2];
  assert.match(p.serviceId, /^https:\/\/iiif\.archive\.org\/image\/iiif\/3\//);
  assert.match(p.serviceId, /_0002\.jp2$/);
  assert.equal(p.width, 2454);
  assert.equal(p.height, 3192);
  assert.match(p.annotationPage, /_djvu\.xml\/2\.json$/);
});

test('pagesFromManifest: a non-v3 payload yields no pages instead of throwing', () => {
  for (const bad of [null, {}, { sequences: [] }, { items: 'nope' }]) {
    assert.deepEqual(pagesFromManifest(bad).pages, []);
  }
});

test('pagesFromManifest: finds the Content Search service the card needs', () => {
  assert.equal(searchServiceId(MANIFEST), 'https://iiif.archive.org/iiif/search/goodytwoshoes00newyiala');
  assert.equal(searchServiceId({ items: [] }), '');
  assert.equal(searchServiceId({ service: [{ profile: 'http://iiif.io/api/image/3/level2.json' }] }), '');
});

// ── image URLs: never build $N by hand ──────────────────────────────────────────
test('serviceImageUrl: builds a sized image and strips any IIIF parameters already there', () => {
  const svc = 'https://iiif.archive.org/image/iiif/3/x%2Fy_jp2.zip%2Fy_0002.jp2';
  assert.equal(serviceImageUrl(svc, 400), `${svc}/full/400,/0/default.jpg`);
  assert.equal(serviceImageUrl(svc, 80), `${svc}/full/80,/0/default.jpg`);
  // idempotent: a URL that already carries /full/… is reduced back to the service first
  assert.equal(serviceImageUrl(`${svc}/full/400,/0/default.jpg`, 200), `${svc}/full/200,/0/default.jpg`);
  // a region zoom (this is how a search hit is shown)
  assert.equal(serviceImageUrl(svc, 600, '727,190,335,42'), `${svc}/727,190,335,42/600,/0/default.jpg`);
  assert.equal(serviceImageUrl('', 400), '');
  assert.equal(serviceImageUrl(svc, 0), `${svc}/full/400,/0/default.jpg`, 'a junk width falls back to 400');
});

test('xywhRegion: a hit region is parsed, and a degenerate box is rejected', () => {
  assert.equal(xywhRegion('https://x$2/canvas#xywh=727,190,335,42'), '727,190,335,42');
  assert.equal(xywhRegion('https://x$2/canvas#xywh=0,0,0,0'), null);
  assert.equal(xywhRegion('https://x$2/canvas'), null);
});

// ── search inside the book ──────────────────────────────────────────────────────
test('searchHits: v1 `resources` become page-mapped hits with their word box', () => {
  const pages = pagesFromManifest(MANIFEST).pages;
  const hits = searchHits(SEARCH_V1, pages);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].pageIndex, 2, '$2/canvas maps to the third page');
  assert.equal(hits[0].label, '3', 'the label is the human page number');
  assert.equal(hits[0].text, 'GOODY');
  assert.equal(hits[0].region, '727,190,335,42');
});

test('searchHits: a leaf outside the manifest is kept but marked unmapped', () => {
  const pages = pagesFromManifest(MANIFEST).pages;
  const h = searchHits(SEARCH_V1, pages)[1];
  assert.equal(h.pageIndex, -1, 'no page for leaf 9 — the hit must not be silently dropped');
  assert.equal(h.text, 'SHOES');
});

test('searchHits: the v2 `hits` shape works too, and OCR markup is stripped', () => {
  const hits = searchHits(SEARCH_V2, pagesFromManifest(MANIFEST).pages);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, 'GOODY two');
  assert.equal(hits[0].pageIndex, 1);
});

test('searchHits: an empty or malformed response is an empty list, not a crash', () => {
  assert.deepEqual(searchHits(null, []), []);
  assert.deepEqual(searchHits({ resources: [] }, []), []);
});

// ── per-page OCR text ───────────────────────────────────────────────────────────
test('pageText: joins the page annotations and strips their markup and entities', () => {
  const t = pageText(PAGE_ANNO);
  assert.match(t, /^GOODY TWO-SHOES\./);
  assert.match(t, /Part I\. & more/);
  assert.ok(!t.includes('<'));
});

test('stripOcrHtml: tags, entities and runs of whitespace all go', () => {
  assert.equal(stripOcrHtml('<p>a</p>\n\n  <b>b</b>'), 'a b');
  assert.equal(stripOcrHtml('&amp;&lt;&gt;&quot;&nbsp;x'), '&<>" x');
  assert.equal(stripOcrHtml(null), '');
});

// ── links out ───────────────────────────────────────────────────────────────────
test('bookLinks: prefers the smaller _bw.pdf and URL-encodes the names', () => {
  const links = bookLinks(META, 'goodytwoshoes00newyiala');
  const byLabel = Object.fromEntries(links.map((l) => [l.label, l.href]));
  assert.match(byLabel.PDF, /_bw\.pdf$/);
  assert.match(byLabel.EPUB, /\.epub$/);
  assert.match(byLabel['OCR text'], /_djvu\.txt$/);
  assert.ok(!byLabel['OCR text'].includes('__ia_thumb'));
});

test('manifestUrl: the identifier is encoded and the manifest is the entry point', () => {
  assert.equal(manifestUrl('goodytwoshoes00newyiala'), 'https://iiif.archive.org/iiif/goodytwoshoes00newyiala/manifest.json');
  assert.match(manifestUrl(' a b '), /\/a%20b\/manifest\.json$/);
});

// ── the widget is registered ────────────────────────────────────────────────────
test('iaBook is a registered widget of point scope with a real card', () => {
  const w = WIDGET_TYPES.iaBook;
  assert.ok(w, 'iaBook must be in the registry');
  assert.equal(w.timeScope, 'point');
  assert.ok(w.renderer, 'iaBook must name a card renderer');
  assert.equal(typeof w.fetch, 'function');
  assert.ok(w.defaultLayout && w.defaultLayout.w > 0);
});
