/**
 * Paged-viewer maths (ISSUE-81 / ISSUE-82, 2026-09-15).
 *
 * These are the rules the Internet Archive's own BookReader implements, reduced to the parts that decide a
 * picture: how leaves group into spreads, how a spread is ordered in a right-to-left book, what the counter
 * says, and where a thumbnail strip should look. Wrong here and a book reads backwards for Arabic, Hebrew
 * and Yiddish without anything looking broken to an English reader — so these are the tests that matter.
 */
import { THUMB_LADDER, isLegalThumbWidth } from '../src/lib/thumbWidths.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pageImageUrl,
  canCrop,
  spreadPairs,
  spreadOrder,
  spreadIndexOf,
  spreadLabel,
  spreadsFit,
  leafWidth,
  stripWindow,
  SPREAD_MIN_WIDTH,
  PV_LADDER,
  zoomLadder,
} from '../src/lib/pagedViewer.js';

const IIIF_PAGE = { index: 4, label: '5', image: 'https://iiif.archive.org/image/iiif/3/x%2Fy.jp2/{region}/{w},/0/default.jpg' };
const COMMONS_PAGE = { index: 4, label: '5', image: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Book.pdf/page5-{w}px-Book.pdf.jpg' };

test('pageImageUrl: fills the width, and a region when the source has one', () => {
  assert.equal(pageImageUrl(IIIF_PAGE, 400), 'https://iiif.archive.org/image/iiif/3/x%2Fy.jp2/full/400,/0/default.jpg');
  assert.equal(pageImageUrl(IIIF_PAGE, 400, '727,190,335,42'), 'https://iiif.archive.org/image/iiif/3/x%2Fy.jp2/727,190,335,42/400,/0/default.jpg');
  assert.equal(pageImageUrl(COMMONS_PAGE, 960), 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Book.pdf/page5-960px-Book.pdf.jpg');
  // a missing width falls back rather than producing "NaN" in a URL
  assert.match(pageImageUrl(IIIF_PAGE, 0), /\/700,/);
  assert.equal(pageImageUrl(null, 400), '');
});

test('canCrop: only a source with a region placeholder may offer a zoom-to-word crop', () => {
  assert.equal(canCrop(IIIF_PAGE), true);
  assert.equal(canCrop(COMMONS_PAGE), false, 'Wikimedia page thumbs have no region API');
  assert.equal(canCrop({}), false);
});

test('spreadPairs: a cover alone, then facing pairs (offset 0)', () => {
  assert.deepEqual(spreadPairs(0), []);
  assert.deepEqual(spreadPairs(1), [[0]]);
  assert.deepEqual(spreadPairs(2), [[0], [1]]);
  assert.deepEqual(spreadPairs(6), [[0], [1, 2], [3, 4], [5]]);
  assert.equal(spreadPairs(16).length, 9, '16 pages → 1 cover + 7 pairs + 1 left over');
  assert.equal(spreadPairs(16).flat().length, 16, 'every leaf appears exactly once');
});

test('spreadPairs: offset 1 pairs from the first leaf, for scans that start on a text page', () => {
  assert.deepEqual(spreadPairs(4, 1), [[0, 1], [2, 3]]);
  assert.deepEqual(spreadPairs(5, 1), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(spreadPairs(1, 1), [[0]]);
});

test('spreadPairs: every leaf appears exactly once, at any length and either offset', () => {
  for (const n of [1, 2, 3, 4, 5, 16, 17, 188, 304]) {
    for (const offset of [0, 1]) {
      const flat = spreadPairs(n, offset).flat();
      assert.equal(flat.length, n, `n=${n} offset=${offset} lost or duplicated a leaf`);
      assert.deepEqual([...flat].sort((a, b) => a - b), [...Array(n).keys()], `n=${n} offset=${offset} is not a cover of 0..n-1`);
    }
  }
});

test('spreadOrder: right-to-left puts the LATER leaf on the left', () => {
  assert.deepEqual(spreadOrder([4, 5], 'left-to-right'), [4, 5]);
  assert.deepEqual(spreadOrder([4, 5], 'right-to-left'), [5, 4]);
  assert.deepEqual(spreadOrder([0], 'right-to-left'), [0]);
  assert.deepEqual(spreadOrder([], 'right-to-left'), []);
});

test('spreadLabel: reading order, single or facing, with the pages\u2019 own labels', () => {
  const labels = ['1', '2', '3', '4', '5', '6'];
  assert.equal(spreadLabel(labels, [0]), 'page 1');
  assert.equal(spreadLabel(labels, [1, 2]), 'pages 2\u20133');
  assert.equal(spreadLabel(labels, [4, 5]), 'pages 5\u20136');
  assert.equal(spreadLabel(labels, []), '');
  // labels are what the source calls the page (a leaf number, a roman numeral, "Cover")
  assert.equal(spreadLabel(['Cover', 'i', 'ii'], [0]), 'page Cover');
  assert.equal(spreadLabel(['Cover', 'i', 'ii'], [1, 2]), 'pages i\u2013ii');
});

test('spreadLabel: a right-to-left DISPLAY order still reads "pages 4\u20135"', () => {
  const labels = ['1', '2', '3', '4', '5'];
  // the pair is shown as [4, 3] in a right-to-left book; the label must not become "pages 5–4"
  assert.deepEqual(spreadOrder([3, 4], 'right-to-left'), [4, 3]);
  assert.equal(spreadLabel(labels, spreadOrder([3, 4], 'right-to-left')), 'pages 4–5');
  assert.equal(spreadLabel(labels, [3, 4]), 'pages 4–5');
  assert.equal(spreadLabel(labels, [4, 3]), 'pages 4–5', 'order of the argument must not matter');
});

test('spreadIndexOf: a page belongs to exactly one spread, and jumps land there', () => {
  const pairs = spreadPairs(16);
  assert.equal(spreadIndexOf(0, pairs), 0, 'the cover is its own spread');
  assert.equal(spreadIndexOf(1, pairs), 1);
  assert.equal(spreadIndexOf(2, pairs), 1);
  assert.equal(spreadIndexOf(3, pairs), 2);
  assert.equal(spreadIndexOf(15, pairs), 8);
  assert.equal(spreadIndexOf(999, pairs), 0, 'an unknown page falls back to the first spread');
});

test('spreadsFit: two pages need room, and the threshold is a viewport property', () => {
  assert.equal(spreadsFit(SPREAD_MIN_WIDTH - 1), false);
  assert.equal(spreadsFit(SPREAD_MIN_WIDTH), true);
  assert.equal(spreadsFit(1400), true);
  assert.equal(spreadsFit(0), false);
});

test('leafWidth: each leaf gets half the ladder in a spread, with a floor', () => {
  assert.equal(leafWidth(1400, false), 1400);
  assert.equal(leafWidth(1400, true), 700);
  assert.equal(leafWidth(400, true), 240, 'never below the floor, or a page becomes unreadable');
  assert.equal(leafWidth(0, false), 700, 'a missing ladder width falls back');
});

test('stripWindow: a window around the page, never past the ends', () => {
  const w = stripWindow(304, 150, 15);
  assert.equal(w.indices.length, 15);
  assert.ok(w.indices.includes(150));
  assert.deepEqual(stripWindow(10, 0, 15).indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'a short book shows all of it');
  assert.deepEqual(stripWindow(40, 0, 5).indices, [0, 1, 2, 3, 4], 'clamped at the start');
  assert.deepEqual(stripWindow(40, 39, 5).indices, [35, 36, 37, 38, 39], 'clamped at the end');
  assert.equal(stripWindow(0, 0, 5).indices.length, 0);
});

test('every page-thumbnail width the viewer can request actually exists', () => {
  // A page thumbnail URL is built by substituting into a `{w}px-` template — there is no API to rewrite a bad width,
  // so an off-ladder step is HTTP 400, not a bigger image. Measured 2026-09-18: 400/700/1000/1400 → 400. The old
  // PV_LADDER was off-ladder at every step. Found by measuring against commons-vibe's thumbnail benchmark.
  for (const w of PV_LADDER) assert.ok(isLegalThumbWidth(w), `PV_LADDER step ${w} is not a pre-rendered width`);
  // …and so must every per-source ceiling, and every step of the ladder it produces.
  for (const cap of [300, 700, 960, 1000, 1400, 4000]) {
    for (const w of zoomLadder(cap)) {
      assert.ok(isLegalThumbWidth(w), `zoomLadder(${cap}) offers ${w}, which does not exist`);
      assert.ok(w <= cap, `zoomLadder(${cap}) offers ${w}, above the source's own ceiling`);
    }
  }
  assert.deepEqual(zoomLadder(700), [330, 500]);      // snapped DOWN, never up into the next bucket
  assert.deepEqual(zoomLadder(960), [330, 500, 960]); // an exact ceiling is kept
  assert.deepEqual(zoomLadder(4000).at(-1), 3840);    // above the ladder, the top step wins
});
