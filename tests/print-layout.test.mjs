/**
 * Print layout (2026-09-18) — the board's arrangement on paper.
 *
 * The print sheet used to make every card full width and stack it in DOM order. Reproducing the board's own grid
 * fixed the flow; the *first* attempt at that grouped cards into "shelves" by overlapping vertical spans, which is
 * right for a tidy board and wrong for a staggered mosaic — on the Met demo a tall card's column is re-used by the
 * card below it, five cards landed in one shelf, two pairs shared a column, and they printed on top of each other.
 * The placement now comes from the layout's own `x`/`w`/`y`/`h`, which makes an overlap impossible rather than
 * unlikely — that is the property these tests pin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boardPrintGeometry } from '../src/lib/print.js';

// The Ann Frank / MLK board: tidy, and the case the shelf version also got right.
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

// The Met board, which broke the shelf version: staggered starts, mixed widths, a tall card whose column the card
// below it re-uses (`edithistory` x388 and `cimtopeditors` x388 start 368px apart; `fileusage` x20 and `articlelist`
// x20 likewise).
const MET = [
  { i: 'welcome', x: 0, y: 0, w: 3, h: 4 },
  { i: 'catsize', x: 3, y: 0, w: 3, h: 4 },
  { i: 'cimsnap', x: 6, y: 0, w: 3, h: 4 },
  { i: 'cimtrend', x: 9, y: 0, w: 3, h: 4 },
  { i: 'fileusage', x: 0, y: 4, w: 3, h: 5 },
  { i: 'edithistory', x: 3, y: 4, w: 4, h: 4 },
  { i: 'cimtopfiles', x: 7, y: 4, w: 5, h: 6 },
  { i: 'cimtopeditors', x: 3, y: 8, w: 4, h: 6 },
  { i: 'articlelist', x: 0, y: 9, w: 3, h: 4 },
  { i: 'file-spotlight', x: 7, y: 10, w: 3, h: 5 },
  { i: 'cimtoppages', x: 0, y: 13, w: 3, h: 4 },
  { i: 'sparql', x: 3, y: 14, w: 4, h: 3 },
  { i: 'gallery', x: 0, y: 17, w: 12, h: 34 },
];

test('print: every widget gets exactly one slot, whatever the input order', () => {
  const shuffled = [...ANNE_FRANK].reverse();
  const a = boardPrintGeometry(ANNE_FRANK);
  const b = boardPrintGeometry(shuffled);
  assert.deepEqual(a, b, 'the geometry does not depend on array order');
  assert.equal(new Set(a.map((s) => s.id)).size, ANNE_FRANK.length);
});

test('print: a staggered mosaic can never put two cards in one cell', () => {
  // The bug this replaces: `articlelist` (x0 y9) shares a column with `fileusage` (x0 y4 h5) and starts *inside*
  // that card's vertical span, so a vertical-overlap shelf put both in one row and they printed on top of each
  // other. Placing by the layout's own rows keeps them in different cells.
  const slots = boardPrintGeometry(MET);
  const at = (id) => slots.find((s) => s.id === id);
  assert.deepEqual([at('fileusage').row, at('fileusage').rowSpan], [5, 5]);
  assert.deepEqual([at('articlelist').row, at('articlelist').rowSpan], [10, 4]);
  assert.notEqual(at('fileusage').row, at('articlelist').row);
  assert.deepEqual([at('cimtopfiles').row, at('cimtopeditors').row, at('sparql').row], [5, 9, 15]);

  // …and as a general invariant, because "no overlap" is the property that matters, not these numbers:
  for (const a of slots) {
    for (const b of slots) {
      if (a.id >= b.id) continue;
      const colsClash = a.col < b.col + b.span && b.col < a.col + a.span;
      const rowsClash = a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan;
      assert.ok(!(colsClash && rowsClash),
        `${a.id} and ${b.id} share a cell: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    }
  }
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
    { id: 'x', col: 3, span: 4, row: 3, rowSpan: 2 });
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

test('print: the three shapes are all reachable from the print call', async () => {
  // The menu offers Board / Poster / Document, and `printTarget` is the only thing that arms a print. A `mode`
  // that never reaches `armBoardPrint` is invisible in a unit test of the geometry and obvious in a browser:
  // every choice printed "board" (found by driving the deployed menu, 2026-09-18). So: assert the wiring exists,
  // and that each mode lands in the DOM the sheet keys off.
  // `process.cwd()`, not `import.meta.url`: the test files are bundled before running, so a URL relative to this
  // module points at the emitted bundle's directory, not the source tree (the trap documented in HANDOFF).
  const src = readFileSync(join(process.cwd(), 'src/lib/print.js'), 'utf8');
  assert.match(src, /export function armBoardPrint\(layout, mode = 'board'\)/);
  assert.match(src, /export function printTarget\(widgetId, \{ layout, mode = 'board' \} = \{\}\)/);
  assert.match(src, /armBoardPrint\(layout, mode\)/, 'printTarget must pass the mode on');
  assert.match(src, /if \(mode === 'poster'\) applyPosterPage\(\)/);
  // the sheet keys off data-print-mode, and the app re-arms board mode for ⌘P
  const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');
  for (const mode of ['poster', 'document']) {
    assert.match(css, new RegExp(`data-print-mode='${mode}'`), `the ${mode} shape has no styles`);
  }
  const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
  assert.match(app, /mode: 'poster'/);
  assert.match(app, /mode: 'document'/);
});
