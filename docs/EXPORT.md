# Getting a board — or one widget — out of WikiBento (ISSUE-77)

**What shipped 2026-09-14:** one **⤓ Export** menu on every widget with four items — **PDF, CSV, PNG,
SVG** — and **🖨 Print / save as PDF** on the board toolbar — three shapes for the whole board.

![The export menu](screenshots/wikibento-2026-09-14-export-menu.png)

The menu replaced two buttons (`⤓` and `🖨`) before they became four: the action row is already ⓘ ⚙ ↻ ✕.
Availability is decided **when the menu opens**, from the live DOM — the only place the answer exists — and
a disabled item carries the reason in its tooltip rather than failing after the click.

![One widget printed](screenshots/wikibento-2026-09-14-print-widget.png)

## "Export" means four different things

They have very different costs, and the cheapest ones turned out to be the most useful:

| format | cost | fidelity | what it is for |
|---|---|---|---|
| **CSV / JSON data** | low | exact | the numbers behind a card, to reuse in a spreadsheet or a script |
| **PDF** | low | vector text, selectable | a page to file, print or send — via the browser's own print engine |
| **SVG** | low *where the widget is already SVG* | perfect | vector for print or a slide; the QR widget has done this since ISSUE-65 |
| **PNG** | medium–high | pixels | a picture for chat or a slide deck — for widgets that draw their own SVG, **and** for any widget whose image host sends CORS (ISSUE-80) |

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

The browser's print engine is the highest-fidelity PDF path that exists, and it is free: real vector text, selectable
and searchable, correct page geometry, no library. The sheet is driven by two attributes on `<body>`:

- **`data-print="widget"`** — one card, every other card and all editing chrome hidden.
- **`data-print="board"`** — the whole board, in one of three shapes (`data-print-mode`).

It is armed by a `beforeprint` listener, so **⌘P and the browser's Print… menu behave like the 🖨 button**. (Before
that, only the button set the attributes, and a browser-menu print got react-grid-layout's transforms as a clipped
stack.) Disarming is driven by `afterprint`; there is no timer, because one that fires mid-print is worse than none.

### Three shapes, because a dashboard is not a document

| in the menu | what you get | Met demo |
|---|---|---|
| 🧩 **Board** | the board's own grid — the same columns, the same rows side by side, cards never split | 5 pages |
| 🖼 **Poster** | **one page, sized to the board** (`@page size` from the board's box): the whole thing at its own aspect, and the dialogue's scale-to-fit turns it into whatever paper you have | **1 page** |
| 📄 **Document** | one card per row, in (row, column) order, each at its own width — the shape to *read*, with the most predictable page count | 7 pages |

### Two rules make it work

**1. Wait for the board to settle.** `window.print()` snapshots whatever is on screen at that instant, and stats APIs
and galleries resolve over seconds — so a sheet taken immediately can be half a board. `preparePrint()`
(`src/lib/print.js`) holds it until every image has decoded and no card is in a loading state (20 s cap), showing
*"Preparing the print — 42 of 139 images…"*. Silently stalling a print would be worse than a missing image, so the
wait is visible. Arming also flips `loading="lazy"` images to eager: cards below the fold would otherwise print as
empty tiles (that is not hypothetical — the Met gallery did exactly that).

**2. Scale to the paper; never reflow it.** A dashboard is a *drawing*. Everything inside a card was measured for the
width it has on screen — a gallery's tile grid, a table, a chart's labels — so a print column that is narrower (or
wider) makes content overflow and paint over its neighbour, or stretch to four times its size. Board and Document
therefore `zoom` the sheet to A4's content width (`--print-zoom`; `zoom` rather than `transform: scale()` because it
changes the layout size, so pagination stays correct), and every card keeps the width its **grid span** gives it
(`calc((var(--print-span) / 12) * 100%)`. Document mode adds one thing — cards may **split across pages**, because a
document flows, where a board card is a picture that must stay whole.

### What the sheet promises, and what the tests check

`boardPrintGeometry(layout)` derives each card's slot from the live layout — column, span, row, row-span — so DOM
order is irrelevant (which is also what makes it correct for a board loaded from a URL) and an overlap is impossible
rather than unlikely. Placement comes from the grid, never from a reading order inferred from it: the first version
grouped cards into *shelves* by overlapping vertical spans, which is right for a tidy board and wrong for a staggered
mosaic, where a tall card's column is re-used by the card below it.

The sweep's **print pass** (`npm run test:browsers:demos`) checks three invariants on every demo, in every engine,
**after the board has settled the way a real print does**:

- no two cards are drawn on top of each other;
- nothing inside a card (`.gallery-grid`, `.ranking-rows`, `table`, `.glam-card`, `.excerpt-card`) paints outside its
  own box;
- every card keeps **its share of the board's width** between screen and print — the mode-agnostic form of "the print
  reflowed something", which is how a stretched chart and a giant image were caught.

A print check that does not wait is a check that lies: the first version measured 300 ms after arming, when every
card was still short, and reported "0 overlaps" for a board whose PDF had four cards printed over each other.

### On paper

Kept deliberately: the widget's own header (it names the card) and the ⏱ freshness footer — a printed chart with no
"as of" line is a claim without a date. Hidden: the toolbar, the action buttons, the instance-id chip, the resize
grips, the borrowed-board notice.

The mechanism is small enough to read in one sitting (`src/lib/print.js`), and it exists because react-grid-layout
positions cards **absolutely with transforms** while `.grid-item` clips its overflow: printed as-is that is a
cropped, overlapping mess. The full history of what each round got wrong — four rounds, four different places for the
same class of mistake — is in [VERIFIED-WORKING.md](VERIFIED-WORKING.md); known follow-ups are in HANDOFF's queue.

## SVG and PNG: what is possible, measured

**Measured 2026-09-14 — and it changes the plan.** The approach was to clone the widget, inline every
computed style, wrap it in an SVG `<foreignObject>` and rasterise that. The wrapper produces a **valid
.svg**, but the rasterisation is impossible in Chromium:

| document drawn into a canvas | `toBlob` result |
|---|---|
| plain SVG (no `foreignObject`) | ✅ works |
| `foreignObject` containing *only* `<p>hello</p>` | ❌ `SecurityError: Tainted canvas` |
| `foreignObject` + a remote `<img>` | ❌ tainted |
| `foreignObject` + a `data:` URI image | ❌ tainted |

A bare `<p>` taints it: **Chromium refuses to hand back any canvas drawn from an SVG containing a
`foreignObject`**, so no amount of inlining helps. Hence the honest capability matrix, which the menu
enforces:

| widget draws itself as… | PDF | CSV | SVG | PNG |
|---|---|---|---|---|
| **HTML/CSS** (timeline, tables, ranked lists, galleries — most of the app) | ✅ | rows? | ✅ *file opens in a browser* | ❌ needs a screenshot |
| **HTML/CSS with a CORS image** (IA Book's IIIF pages, and anything else on `iiif.archive.org`, `upload.wikimedia.org`, `thumb.wikimedia.org`) | ✅ | rows? | ✅ | ✅ **built 2026-09-15** — the image is reloaded with `crossOrigin` and drawn, so the canvas stays clean and the PNG is real |

*The host list is measured, not guessed (`CORS_IMAGE_HOSTS` in `src/lib/exportImage.js`): each entry was
verified to send `Access-Control-Allow-Origin`. `archive.org` is deliberately absent — its `/download/` and
`services/img` send no CORS, so those images stay display-only.*
| **SVG** (CIM trend, file traffic, QR) | ✅ | rows? | ✅ | ✅ rasterised at 2× |
| **iframe** (wiki page, 360° panorama, video) | ✅ | – | ❌ | ❌ |

Only four widgets on the 40-widget showcase board draw SVG (two CIM charts, the QR, and one iframe) — the
app's own charts are mostly CSS, which is why this matters more than it sounds.

**So pixel-perfect PNG of an arbitrary HTML widget is a decision, not a detail** — unless the widget's
pixels come from an image host that allows CORS, which is the case ISSUE-80 closed. Two honest routes for
the rest:

1. **A DOM-to-canvas library** (`html2canvas`, `modern-screenshot`): they draw each element with canvas
   primitives instead of a `foreignObject`, which is why they avoid the taint — and why they re-implement
   CSS. It is a new runtime dependency for a project that has six.
2. **A server-side render** — the Playwright that already records the tutorial videos screenshots the
   widget element in a real browser, with no CSS-fidelity risk, and can emit a print-quality PDF too. That
   is a service to run (a browser per request, caching by config hash, rate limiting), which is why it is
   its own issue rather than a button.

Until then the menu is truthful about it, and print-to-PDF covers most of what a PNG gets wanted for.

**Decided 2026-09-14: this will not be a server-side feature.** The reasoning is recorded in
[ISSUES.md](ISSUES.md) ISSUE-79 and comes down to four costs — it re-fetches the whole board for one image
(the pipeline's own recordings show **17.7–18.1 s of lead-in** per board), the traffic lands on Wikimedia
APIs from a shared Toolforge IP, Chromium is 300–500 MB against a **1 Gi** pod and parses untrusted content
(our widgets can embed arbitrary external pages), and it is a permanent patching/monitoring liability — plus
the objection that survives all of those: a server render is a **re-render, not a capture**, so it cannot
show the user's zoom, scroll, theme or params anyway.

**Getting a PNG anyway, without a service:**

| you want | do this |
|---|---|
| a picture of a card, or of the board | screenshot your own device — the browser has the pixels and the right DPR |
| a **file** of a card | **SVG** from the ⤓ menu, then convert locally (any browser, Figma, Illustrator, `rsvg-convert`) |
| a card that draws itself as SVG (charts, QR), or whose image host sends CORS (a book page) | **PNG** from the ⤓ menu — rasterised exactly, at 2× |
| something for a report, a slide or an email | **PDF** from the ⤓ menu — vector and selectable, better than a PNG for all three |

If PNG-of-any-widget is ever genuinely needed, the proportionate next step is a **client-side** DOM→canvas
library (one dependency, no server), or **scheduled snapshots** of a curated board list for the archival
case — never a per-request render endpoint.

## The original PNG reasoning, kept for the record

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

- **A region rewrite deleted a component that the registry still named.** `BarCard` was removed when the
  timeline card was rewritten (commit `e4cdad8`) while `sparql`'s registry entry still pointed at it, so
  every bar-rendered SPARQL query threw `ReferenceError: BarCard is not defined` for three commits —
  caught by the widget ErrorBoundary and shown as "💥 Try Again", with a green suite behind it. Nothing
  had ever compared the registry to the components; `tests/renderer-registry.test.mjs` now does, for both
  the registry and the dispatcher switch.

- **Inserting a helper above a component's `function` line can steal its `export default`.** The CSV helper
  landed between `export default` and `function WidgetFrame(`, so the module's default export became the
  helper: App rendered `saveCsv(props)` — a boolean — for every card. No exception, no error boundary, no
  console output, a clean build, and **no widgets on the page**. A source-level test now pins the export.
- **A flattened test fixture hid the real nesting.** The timeline's lanes are at
  `payload.timeline.lanes`, not `payload.lanes`; a fixture written from memory exported the raw query rows
  instead of the events and still passed. Fixtures must be copied from what the transform really returns.
- **A guessed CSS class hides nothing.** The print sheet hid `.toolbar`, which does not exist
  (`.app-header` does), so the first PDF-shaped page printed the toolbar across the top.
