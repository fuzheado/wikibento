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
 *   data-print="board"   → the whole board is laid out as a document (react-grid-layout positions
 *                          cards with transforms, which print as a clipped mess unless neutralised)
 *
 * `afterprint` is the clean-up hook, but Safari and a cancelled dialogue can skip it, so a timer
 * disarms the page regardless — a board left "armed for print" would print wrong on the next ⌘P.
 */
export function printTarget(widgetId) {
  const el = widgetId ? document.querySelector(`[data-widget-id="${widgetId}"]`) : null;
  if (widgetId && !el) return;
  const done = () => {
    document.body.removeAttribute('data-print');
    el?.classList.remove('print-target');
    window.removeEventListener('afterprint', done);
  };
  document.body.setAttribute('data-print', widgetId ? 'widget' : 'board');
  el?.classList.add('print-target');
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 3000);
}
