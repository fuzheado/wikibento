/**
 * Printing a widget — or the whole board — as PDF (ISSUE-77).
 *
 * This is the cheapest half of the export story and needs no library at all: the browser's own print
 * engine produces a vector PDF with selectable, searchable text, at a fidelity no DOM-to-canvas
 * screenshot reaches. The price is that it is a dialogue rather than a silent download, which is why
 * the CSV path exists alongside it.
 *
 * The print sheet in App.css keys off the attributes set here:
 *   data-print="widget"  → every other card and all editing chrome is hidden
 *   data-print="board"   → the whole board, reproducing the on-screen grid: the same columns, the same rows
 *                          side by side, in reading order (react-grid-layout positions cards with transforms,
 *                          which print as a clipped full-width stack unless neutralised — see boardPrintGeometry)
 *
 * `afterprint` is the clean-up hook, but Safari and a cancelled dialogue can skip it, so a timer
 * disarms the page regardless — a board left "armed for print" would print wrong on the next ⌘P.
 */
/**
 * The board's print geometry: **the arrangement the reader sees, in the order they read it** (2026-09-18).
 *
 * The old print sheet made every card full width and stacked it in DOM order, which is neither the board's
 * arrangement nor its reading order. Measured on `anne-frank-mlk-demo`: on screen a symmetric row of four cards
 * (`excerpt w4 · views w2 · views w2 · excerpt w4`) and two galleries side by side (`w6 · w6`); in the PDF eight
 * full-width cards in array order, with the note that opens the board printing fifth and the two views cards last.
 *
 * So the print layout is derived from the grid the board is actually using, not from the widgets array:
 *
 *   · columns and spans come from the layout's `x`/`w` (a 12-column grid on screen, a 12-column grid on paper);
 *   · rows are *shelves* — items whose vertical spans overlap share a shelf — so the four cards above stay on one
 *     line and the galleries stay side by side;
 *   · DOM order is irrelevant once every item has an explicit row and column, which is also what makes it work for
 *     a board loaded from a URL (there is no array order to trust).
 *
 * Pure, so the contract is testable without a browser. A widget with no layout entry keeps a full-width row of its
 * own rather than disappearing.
 */
export function boardPrintGeometry(layout) {
  const items = (Array.isArray(layout) ? layout : [])
    .filter((l) => l && l.i)
    .map((l) => {
      // Clamped into the grid: a bad author value must not push a card off the paper. A column start past the
      // last column, or a span running past it, is trimmed rather than trusted.
      const col = Math.min(12, Math.max(1, Math.round(Number(l.x) || 0) + 1));
      const span = Math.min(13 - col, Math.max(1, Math.round(Number(l.w) || 12)));
      const row = Math.max(1, Math.round(Number(l.y) || 0) + 1);
      const rowSpan = Math.max(1, Math.round(Number(l.h) || 1));
      return { id: l.i, col, span, row, rowSpan };
    });
  // Sorted for readability and stable output; the grid placement does not depend on it.
  return items.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Give every card on the board its print slot. Called only for `data-print="board"`. */
function applyBoardPrintGeometry(layout) {
  const geometry = boardPrintGeometry(layout);   // already sorted by (row, column) — the board's reading order
  const byId = new Map(geometry.map((g, i) => [g.id, { ...g, order: i }]));
  let fallbackRow = geometry.length + 1;
  for (const wrapper of document.querySelectorAll('.react-grid-item')) {
    // react-grid-layout puts its classes ON the element the app renders (the one carrying `data-widget-id`),
    // rather than wrapping it — so look at this element first, and only then inside it.
    const id = wrapper.getAttribute('data-widget-id')
      || wrapper.querySelector('[data-widget-id]')?.getAttribute('data-widget-id');
    const g = id ? byId.get(id) : null;
    // A card the layout does not mention still prints — full width, after the ones that do.
    const slot = g || { col: 1, span: 12, row: fallbackRow++, rowSpan: 1, order: fallbackRow };
    wrapper.style.setProperty('--print-col', String(slot.col));
    wrapper.style.setProperty('--print-span', String(slot.span));
    wrapper.style.setProperty('--print-row', String(slot.row));
    wrapper.style.setProperty('--print-rowspan', String(slot.rowSpan || 1));
    // Document mode reads in (row, column) order — the order the board reads in. DOM order is the widgets array,
    // a different thing entirely, and that mismatch is half of why the printed board used to be wrong.
    wrapper.style.setProperty('--print-order', String(slot.order ?? 0));
  }
}

function clearBoardPrintGeometry() {
  for (const wrapper of document.querySelectorAll('.react-grid-item')) {
    wrapper.style.removeProperty('--print-col');
    wrapper.style.removeProperty('--print-span');
    wrapper.style.removeProperty('--print-row');
    wrapper.style.removeProperty('--print-rowspan');
    wrapper.style.removeProperty('--print-order');
    wrapper.style.removeProperty('--print-hpx');
  }
}

/**
 * Arm board mode: `data-print="board"` plus a print slot on every card.
 *
 * Exported so the app can re-arm on **every** print attempt, not just a click on 🖨: see the `beforeprint`
 * listener in App.jsx, which means ⌘P now prints the board correctly too (before this, only the toolbar button
 * set `data-print`, so a browser-menu print got react-grid-layout's transforms and printed as a clipped stack).
 */
const PAGE_STYLE_ID = 'wikibento-print-page';
const PX_PER_MM = 96 / 25.4;   // CSS pixels per millimetre, the ratio @page sizes are expressed in

/**
 * Poster mode: **one page, sized to the board** (2026-09-18).
 *
 * `@page size` accepts dimensions, so the sheet can ask for a page exactly as big as the board is on screen — 391×
 * 1693 mm for the Met demo. The reader's print dialogue then scales that one page down to whatever paper they have,
 * which is what makes it a poster: the whole board, its own aspect ratio, nothing paginated and nothing cropped.
 * Each card keeps the box it has on screen (`--print-hpx`), so the poster is the board *as drawn* — including the
 * clipping a card does on screen, because un-clipping here would change the shapes the poster is meant to preserve.
 */
function applyPosterPage() {
  const grid = document.querySelector('.react-grid-layout') || document.querySelector('.dashboard-container');
  if (grid) {
    const { width, height } = grid.getBoundingClientRect();
    /* The page is the board's box plus a real allowance, and the allowance is the honest part of this function.
     *
     * Script cannot measure the printed layout: `beforeprint` runs while the page is still in screen media, so the
     * box measured here is the on-screen one. Measured on the Met board that was 4618px against 5929px of printed
     * content — a poster that spilled 1300px onto a second page, twice. The causes are mundane and not worth
     * chasing one by one (a card whose printed content exceeds its screen box, images that arrive later, the grid's
     * own gaps). What matters for a *poster* is the shape of the answer: a page a little taller than its content is
     * still one page, and the reader's scale-to-fit handles the rest — whereas a page even slightly too short is a
     * second page nobody wanted. So: the box, plus a quarter. */
    const mm = (px) => (Math.max(1, px) / PX_PER_MM * 1.25).toFixed(1);
    let style = document.getElementById(PAGE_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = PAGE_STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${mm(width)}mm ${mm(height)}mm; margin: 0; }`;
  }
  for (const wrapper of document.querySelectorAll('.react-grid-item')) {
    wrapper.style.setProperty('--print-hpx', `${Math.round(wrapper.getBoundingClientRect().height)}px`);
  }
}

/**
 * Arm board mode. `mode` chooses the shape of the paper:
 *
 *   'board'    the board's own grid — the same rows, the same columns, no overlap (default)
 *   'poster'   one page, sized to the board, cards clipped exactly as they are on screen
 *   'document' one card per row, full width, in reading order — the shape to *read* rather than
 *              to recognise, and the page count that is easiest to predict
 *
 * Exported so the app can re-arm on **every** print attempt, not just a click on 🖨: see the `beforeprint`
 * listener in App.jsx, which means ⌘P now prints the board correctly too (before this, only the toolbar button
 * set `data-print`, so a browser-menu print got react-grid-layout's transforms and printed as a clipped stack).
 */
const A4_CONTENT_MM = 210 - 16;   // A4 portrait, minus the 8mm margins the sheet asks for

/** Is anything still on its way? Cards in a loading state, or images not yet decoded. */
function printPendingContent() {
  const loading = document.querySelectorAll('.widget-loading').length;
  const images = [...document.querySelectorAll('img')];
  const missing = images.filter((img) => !img.complete || img.naturalWidth === 0).length;
  return { loading, images: images.length, missing };
}

/** A small, honest progress note while a print is being prepared — this can take seconds on a gallery-heavy board. */
function showPrintProgress(text) {
  let el = document.getElementById('wikibento-print-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wikibento-print-progress';
    el.className = 'board-print-progress';
    document.body.appendChild(el);
  }
  el.textContent = text;
}

function hidePrintProgress() {
  document.getElementById('wikibento-print-progress')?.remove();
}

/**
 * Wait until the board has settled, then run `done` (2026-09-18, second pass).
 *
 * Why this exists: printing a *live* dashboard is a race. Stats APIs and galleries resolve over seconds, and the
 * browser takes the sheet whenever the dialogue is ready — so the Met poster came out with a grid of images that
 * simply had not arrived, and the geometry was computed from a half-loaded board. Arming flips `loading="lazy"`
 * images to eager; this then waits for every image to decode and for no card to be in a loading state, with a
 * timeout so a slow API cannot hold the print dialogue hostage. The note tells the reader what it is waiting for —
 * silently stalling a print would be worse than a missing image.
 */
export function preparePrint({ timeoutMs = 20000, onDone } = {}) {
  const started = Date.now();
  const tick = () => {
    const { loading, images, missing } = printPendingContent();
    const elapsed = Date.now() - started;
    if ((loading === 0 && missing === 0) || elapsed > timeoutMs) {
      hidePrintProgress();
      onDone();
      return;
    }
    showPrintProgress(loading > 0
      ? `Preparing the print — ${loading} card${loading === 1 ? '' : 's'} still loading…`
      : `Preparing the print — ${images - missing} of ${images} images…`);
    setTimeout(tick, 250);
  };
  tick();
}

export function armBoardPrint(layout, mode = 'board') {
  document.body.setAttribute('data-print', 'board');
  document.body.setAttribute('data-print-mode', mode);
  applyBoardPrintGeometry(layout);
  // EVERY image must be loaded before the sheet is taken. Cards below the fold use `loading="lazy"`, so on a tall
  // board — the Met demo's gallery came out as a grid of empty black tiles in the poster — the images a reader has
  // not scrolled to were never fetched and print as nothing. Flipping them to eager on arm gives the print pass
  // (and the dialogue's own preview, which takes a moment) the images it needs.
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  if (mode === 'poster') {
    applyPosterPage();
  } else {
    applyPrintZoom();
  }
}

/**
 * Board and document modes: **scale, never reflow** (2026-09-18, second pass).
 *
 * They used to let the paper's width decide the cards' width. Everything inside a card that was measured for the
 * screen — a gallery's fixed tile grid, a wide table, a chart's absolute labels — then overflowed the narrower
 * column and painted over its neighbour: the reported "page two has all types of things overlapping", and the
 * reason "text overlaps" in both the board and document views. A dashboard is a *drawing*, not a document, so on
 * paper it should be shrunk rather than re-laid-out.
 *
 * `zoom` does exactly that — unlike `transform: scale()`, it changes the layout size, so the browser still
 * paginates correctly. The factor takes the board's own width to A4's content width; the page size is left to the
 * dialogue, so any paper works and a wider one simply leaves margin. Text stays vector and selectable.
 */
function applyPrintZoom() {
  const grid = document.querySelector('.react-grid-layout') || document.querySelector('.dashboard-container');
  if (!grid) return;
  const boardPx = grid.getBoundingClientRect().width;
  if (!boardPx) return;
  const k = Math.min(1, (A4_CONTENT_MM * PX_PER_MM) / boardPx);
  grid.style.setProperty('--print-zoom', String(k));
}

/** Back to the screen. Safe to call when nothing is armed. */
export function disarmPrint() {
  document.body.removeAttribute('data-print');
  document.body.removeAttribute('data-print-mode');
  document.getElementById(PAGE_STYLE_ID)?.remove();
  hidePrintProgress();
  for (const grid of document.querySelectorAll('.react-grid-layout, .dashboard-container')) {
    grid.style.removeProperty('--print-zoom');
  }
  for (const el of document.querySelectorAll('.print-target')) el.classList.remove('print-target');
  clearBoardPrintGeometry();
}

/**
 * Print one widget (`widgetId`) or the whole board.
 *
 * THE TIMER THAT USED TO BE HERE (ISSUE-77 → fixed 2026-09-18): `afterprint` is unreliable (Safari, a cancelled
 * dialogue), so the disarm was also scheduled three seconds out. Three seconds is not enough for a real print job:
 * generating a PDF of the Anne Frank board took longer, the timer fired mid-print, the slots were cleared, and the
 * PDF came out with the disarmed layout — the exact bug this file exists to fix, only harder to see. `beforeprint`
 * re-arming makes a stale armed state harmless (the sheet only affects print media; it cannot change what is on
 * screen), so the timer is gone entirely.
 */
export function printTarget(widgetId, { layout, mode = 'board' } = {}) {
  const el = widgetId ? document.querySelector(`[data-widget-id="${widgetId}"]`) : null;
  if (widgetId && !el) return;
  if (widgetId) {
    document.body.setAttribute('data-print', 'widget');
    el.classList.add('print-target');
    window.print();
    return;
  }
  // Arm first (so lazy images start loading and the reader sees the shape), then wait for the board to settle, then
  // take the sheet. Waiting is the whole point: `window.print()` snapshots whatever is on screen at that moment.
  armBoardPrint(layout, mode);
  preparePrint({ onDone: () => window.print() });
}

// Disarm once, for every print path (the toolbar, the widget menu, ⌘P) — registered at module scope so a print
// started by the browser's own menu cleans up the same way.
if (typeof window !== 'undefined') window.addEventListener('afterprint', disarmPrint);
