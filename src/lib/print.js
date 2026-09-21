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
    .filter((l) => l && l.i && Number.isFinite(l.y))
    .map((l) => {
      // Clamped into the 12-column grid: a bad author value must not push a card off the paper — a column start
      // past the last column, or a span that runs past it, is trimmed rather than trusted.
      const col = Math.min(12, Math.max(1, Math.round(Number(l.x) || 0) + 1));
      const span = Math.min(13 - col, Math.max(1, Math.round(Number(l.w) || 12)));
      const y = Number(l.y) || 0;
      return { id: l.i, col, span, y, bottom: y + Math.max(1, Math.round(Number(l.h) || 1)) };
    })
    .sort((a, b) => a.y - b.y || a.col - b.col);

  const rows = [];
  for (const it of items) {
    // A shelf holds everything that starts before the shelf's current bottom — the on-screen row.
    const shelf = rows[rows.length - 1];
    if (!shelf || it.y >= shelf.bottom) rows.push({ bottom: it.bottom, items: [it] });
    else {
      shelf.items.push(it);
      shelf.bottom = Math.max(shelf.bottom, it.bottom);
    }
  }
  const out = [];
  rows.forEach((shelf, i) => {
    for (const it of shelf.items) out.push({ id: it.id, col: it.col, span: it.span, row: i + 1 });
  });
  return out;
}

/** Give every card on the board its print slot. Called only for `data-print="board"`. */
function applyBoardPrintGeometry(layout) {
  const geometry = boardPrintGeometry(layout);
  const byId = new Map(geometry.map((g) => [g.id, g]));
  let fallbackRow = geometry.length + 1;
  for (const wrapper of document.querySelectorAll('.react-grid-item')) {
    // react-grid-layout puts its classes ON the element the app renders (the one carrying `data-widget-id`),
    // rather than wrapping it — so look at this element first, and only then inside it.
    const id = wrapper.getAttribute('data-widget-id')
      || wrapper.querySelector('[data-widget-id]')?.getAttribute('data-widget-id');
    const g = id ? byId.get(id) : null;
    // A card the layout does not mention still prints — full width, after the ones that do.
    const slot = g || { col: 1, span: 12, row: fallbackRow++ };
    wrapper.style.setProperty('--print-col', String(slot.col));
    wrapper.style.setProperty('--print-span', String(slot.span));
    wrapper.style.setProperty('--print-row', String(slot.row));
  }
}

function clearBoardPrintGeometry() {
  for (const wrapper of document.querySelectorAll('.react-grid-item')) {
    wrapper.style.removeProperty('--print-col');
    wrapper.style.removeProperty('--print-span');
    wrapper.style.removeProperty('--print-row');
  }
}

/**
 * Arm board mode: `data-print="board"` plus a print slot on every card.
 *
 * Exported so the app can re-arm on **every** print attempt, not just a click on 🖨: see the `beforeprint`
 * listener in App.jsx, which means ⌘P now prints the board correctly too (before this, only the toolbar button
 * set `data-print`, so a browser-menu print got react-grid-layout's transforms and printed as a clipped stack).
 */
export function armBoardPrint(layout) {
  document.body.setAttribute('data-print', 'board');
  applyBoardPrintGeometry(layout);
}

/** Back to the screen. Safe to call when nothing is armed. */
export function disarmPrint() {
  document.body.removeAttribute('data-print');
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
export function printTarget(widgetId, { layout } = {}) {
  const el = widgetId ? document.querySelector(`[data-widget-id="${widgetId}"]`) : null;
  if (widgetId && !el) return;
  if (widgetId) {
    document.body.setAttribute('data-print', 'widget');
    el.classList.add('print-target');
  } else {
    armBoardPrint(layout);
  }
  window.print();
}

// Disarm once, for every print path (the toolbar, the widget menu, ⌘P) — registered at module scope so a print
// started by the browser's own menu cleans up the same way.
if (typeof window !== 'undefined') window.addEventListener('afterprint', disarmPrint);
