# Getting a board — or one widget — out of WikiBento (ISSUE-77)

**What shipped 2026-09-14:** every widget with rows has a **⤓ Save data (CSV)** button, every widget has a
**🖨 Print / save as PDF**, and the board toolbar has **🖨 Print / save as PDF** for the whole board.

![One widget printed](screenshots/wikibento-2026-09-14-print-widget.png)

## "Export" means four different things

They have very different costs, and the cheapest ones turned out to be the most useful:

| format | cost | fidelity | what it is for |
|---|---|---|---|
| **CSV / JSON data** | low | exact | the numbers behind a card, to reuse in a spreadsheet or a script |
| **PDF** | low | vector text, selectable | a page to file, print or send — via the browser's own print engine |
| **SVG** | low *where the widget is already SVG* | perfect | vector for print or a slide; the QR widget has done this since ISSUE-65 |
| **PNG** | medium–high | pixels | a picture for chat or a slide deck — **not built** (see below) |

The two shipped formats need **no dependency, no server and no canvas**. That matters here: WikiBento runs
on six small runtime packages, and a DOM-to-canvas library is a much bigger commitment than it looks
(below).

## Data: the ⤓ button

Every widget already holds its payload, so the work is a *mapping*, not a rendering problem:
`src/lib/exportData.js` turns the shapes the app actually produces — 2-D tables, rows of objects, chart
series, gallery items, a stat, and a **timeline** — into `{ columns, rows }`, and `toCsv` writes them out
with RFC 4180 quoting. The filename is derived from the widget type and its title
(`wikibento-sparql-born-1929-anne-frank-and-martin-luther-king-jr-2026-09-14.csv`).

Three rules, in the tests:

- **Export the data, not the pixels.** A screenshot of a chart is a picture of numbers.
- **Never invent a value.** A cell the widget does not hold is left empty, and a year-precision date stays
  `1964` — writing `1964-01` would assert a month the source never claimed.
- **No dead buttons.** The ⤓ button only appears when the payload actually has rows (a markdown card does
  not, so it offers print only).

The timeline is the interesting case because it genuinely exports something the query did not name: one row
per event with `lane, date, precision, kind, event, age`, including the age in each lane, which is the
column an aligned comparison is really about.

## PDF: the 🖨 button

The browser's print engine is the highest-fidelity PDF path that exists, and it is free: real vector text,
selectable and searchable, correct page geometry. Two print modes, both driven by `data-print` on `<body>`:

- **`data-print="widget"`** — every other card and all editing chrome is hidden; the card fills the page.
- **`data-print="board"`** — the whole board laid out as a document, one card per page where it fits.

What is deliberately kept on paper: the widget's own header (it names the card), and the ⏱ freshness
footer — a printed chart with no "as of" line is a claim without a date. What is hidden: the toolbar,
the action buttons, the instance-id chip, the resize grips.

The mechanism is small enough to read in one sitting (`src/lib/print.js`), and it exists because
react-grid-layout positions cards **absolutely with transforms** while `.grid-item` clips its overflow.
Printed as-is that is a cropped, overlapping mess; the print sheet neutralises the grid completely
(`position: static`, no transforms, auto height).

## PNG — why it is not here

A picture of a widget is the one export that cannot be done well from inside the page without a
dependency, and even with one it is the least trustworthy:

1. **DOM → canvas libraries** (`html2canvas`, `modern-screenshot`) re-implement CSS. This app uses
   `color-mix()`, CSS variables, container queries and `position: sticky`; the first two alone are where
   these libraries fail quietly — you get a file, just a wrong one.
2. **The SVG `foreignObject` route** (serialize the DOM into an SVG, draw it to a canvas) has full
   fidelity but requires inlining every image as a data URI and every font, and it cannot capture an
   **iframe** at all — so the Wiki Page, 360° panorama and video widgets would export as blank boxes.
3. **A server-side render** is the honest answer: the same Playwright that records the tutorial videos
   (see `pipeline/`) screenshots the widget element in a real browser, with no CSS-fidelity risk, and can
   also emit a proper print PDF with `page.pdf()`. That is a genuine service though — a browser per
   request, caching by config hash, rate limiting — and it belongs in its own issue rather than bolted on.

So PNG waits. Print-to-PDF already gives most of what people want a PNG for, and it works today.

## Traps found while building this (each was invisible to the test suite)

- **Inserting a helper above a component's `function` line can steal its `export default`.** The CSV helper
  landed between `export default` and `function WidgetFrame(`, so the module's default export became the
  helper: App rendered `saveCsv(props)` — a boolean — for every card. No exception, no error boundary, no
  console output, a clean build, and **no widgets on the page**. A source-level test now pins the export.
- **A flattened test fixture hid the real nesting.** The timeline's lanes are at
  `payload.timeline.lanes`, not `payload.lanes`; a fixture written from memory exported the raw query rows
  instead of the events and still passed. Fixtures must be copied from what the transform really returns.
- **A guessed CSS class hides nothing.** The print sheet hid `.toolbar`, which does not exist
  (`.app-header` does), so the first PDF-shaped page printed the toolbar across the top.
