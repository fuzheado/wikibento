/**
 * Print layout (2026-09-18) — the board's arrangement on paper.
 *
 * The print sheet used to make every card full width and stack it in DOM order. Measured on
 * `anne-frank-mlk-demo`, that turned a symmetric on-screen row (excerpt w4 · views w2 · views w2 · excerpt w4) into
 * four stacked pages, put two side-by-side galleries on separate pages, and printed the note that *opens* the board
 * fifth. `boardPrintGeometry` is where that is fixed, so it is where it is tested: columns and spans from the
 * layout, rows derived as shelves (items whose vertical spans overlap share a line), DOM order irrelevant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardPrintGeometry } from '../src/lib/print.js';

// The real board, in its real array order (which is NOT its visual order — note prints first on screen, fifth in
// the array; the galleries sit between the excerpts in the array and below them on screen).
const ANNE_FRANK = [
  { i: 'anne-frank-excerpt', x: 0, y: 1, w: 4, h: 6 },
  { i: 'anne-frank-gallery', x: 0, y: 11, w: 6, h: 12 },
  { i: 'mlk-excerpt', x: 8, y: 1, w: 4, h: 6 },
  { i: 'mlk-gallery', x: 6, y: 11, w: 6, h: 12 },
  { i: 'comparison-note', x: 0, y: 0, w: 9, h: 1 },
  { i: 'lives-timeline', x: 0, y: 7, w: 12, h: 4 },
  { i: 'anne-views', x: 4, y: 1, w: 2, h: 6 },
  { i: 'mlk-views', x: 6, y: 1, w: 2, h: 6 },
];

test('print: the board keeps its rows, its columns and its reading order', () => {
  const slots = boardPrintGeometry(ANNE_FRANK);
  const at = (id) => slots.find((s) => s.id === id);
  // four cards share one shelf, in screen order, with their screen widths
  assert.deepEqual(
    slots.filter((s) => s.row === 2).map((s) => [s.id, s.col, s.span]),
    [['anne-frank-excerpt', 1, 4], ['anne-views', 5, 2], ['mlk-views', 7, 2], ['mlk-excerpt', 9, 4]],
  );
  // the note that opens the board is on the first row, not fifth
  assert.deepEqual([at('comparison-note').row, at('comparison-note').span], [1, 9]);
  // the timeline is a full-width row of its own, between the cards and the galleries
  assert.deepEqual([at('lives-timeline').row, at('lives-timeline').span], [3, 12]);
  // and the two galleries stay side by side
  assert.deepEqual(
    slots.filter((s) => s.row === 4).map((s) => [s.id, s.col, s.span]),
    [['anne-frank-gallery', 1, 6], ['mlk-gallery', 7, 6]],
  );
  assert.equal(at('anne-frank-gallery').row, at('mlk-gallery').row);
});

test('print: every widget gets exactly one slot, whatever the input order', () => {
  const shuffled = [...ANNE_FRANK].reverse();
  const a = boardPrintGeometry(ANNE_FRANK);
  const b = boardPrintGeometry(shuffled);
  assert.deepEqual(a, b, 'the geometry does not depend on array order');
  assert.equal(new Set(a.map((s) => s.id)).size, ANNE_FRANK.length);
});

test('print: shelves do not merge rows that merely touch, and tolerate gaps', () => {
  const slots = boardPrintGeometry([
    { i: 'a', x: 0, y: 0, w: 6, h: 2 },
    { i: 'b', x: 6, y: 0, w: 6, h: 3 },   // taller: the shelf runs to y3
    { i: 'c', x: 0, y: 2, w: 6, h: 1 },   // starts inside b's span → same shelf
    { i: 'd', x: 0, y: 3, w: 6, h: 2 },   // starts where the shelf ends → new shelf
    { i: 'e', x: 0, y: 12, w: 6, h: 1 },  // a gap is just a gap, not an empty row
  ]);
  const row = (id) => slots.find((s) => s.id === id).row;
  assert.deepEqual([row('a'), row('b'), row('c')], [1, 1, 1]);
  assert.equal(row('d'), 2);
  assert.equal(row('e'), 3);
});

test('print: malformed and missing layout entries are survivable', () => {
  assert.deepEqual(boardPrintGeometry([]), []);
  assert.deepEqual(boardPrintGeometry(null), []);
  assert.deepEqual(boardPrintGeometry(undefined), []);
  // an entry with no id or no y is dropped rather than printed at (0,0)
  assert.deepEqual(boardPrintGeometry([{ x: 1 }, { i: 'ok', x: 0, y: 0, w: 4, h: 1 }]).map((s) => s.id), ['ok']);
  // x/w are clamped into the 12-column grid: whatever an author wrote, the card stays ON the paper. That is the
  // guarantee worth asserting — `col + span - 1 <= 12` — rather than one particular pair of numbers, since the
  // exact trim is an implementation choice.
  const onPaper = (slot) => slot.col >= 1 && slot.span >= 1 && slot.col + slot.span - 1 <= 12;
  const wild = boardPrintGeometry([{ i: 'wild', x: 30, y: 0, w: 40, h: 1 }])[0];
  assert.ok(onPaper(wild), `x30 w40 escaped the grid: ${JSON.stringify(wild)}`);
  const negative = boardPrintGeometry([{ i: 'neg', x: -4, y: 0, w: 0, h: 0 }])[0];
  assert.ok(onPaper(negative));
  assert.equal(negative.col, 1, 'a nonsense x lands on the first column');
  assert.equal(negative.span, 12, 'an absent or zero width means full width, which is also the safe default');
  assert.ok(onPaper(negative));
  for (const slot of boardPrintGeometry([
    { i: 'a', x: 11, y: 0, w: 5, h: 1 }, { i: 'b', x: 0, y: 0, w: 99, h: 1 }, { i: 'c', x: 7.5, y: 0, w: 3.2, h: 1 },
  ])) assert.ok(onPaper(slot), `${slot.id} escaped the grid`);
  // fractional values (zoom, rounding) round rather than throw
  assert.deepEqual(boardPrintGeometry([{ i: 'x', x: 2.4, y: 1.6, w: 3.6, h: 2 }])[0],
    { id: 'x', col: 3, span: 4, row: 1 });
});

test('print: a span never runs past the last column', () => {
  // A card authored at x8 w6 would be 14 columns wide: trimmed to the six that fit, not pushed off the paper.
  const slots = boardPrintGeometry([
    { i: 'wide', x: 8, y: 0, w: 6, h: 2 },
    { i: 'last', x: 11, y: 2, w: 4, h: 2 },
    { i: 'full', x: 0, y: 4, w: 12, h: 2 },
  ]);
  const at = (id) => slots.find((s) => s.id === id);
  assert.deepEqual([at('wide').col, at('wide').span], [9, 4], '8 + 6 = 14 → trimmed to 4');
  assert.deepEqual([at('last').col, at('last').span], [12, 1]);
  assert.deepEqual([at('full').col, at('full').span], [1, 12]);
});
