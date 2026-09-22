# WikiBento — Issue Tracker

Tracked issues and needed fixes, as noted during development. Format:
`ISSUE-NN · title` → what/why, reproduction, proposed fix, status.
Status: `open` · `in progress` · `done (commit)`. New issues: append, and take the next number
as **the largest `ISSUE-NN` anywhere in the repo + 1** — enumerate with a *sorted* grep
(`grep -o "^## ISSUE-[0-9]*" docs/ISSUES.md | grep -o "[0-9]*" | sort -n | tail -1`), never the
file's last entry: this file is append-ordered, so the tail is not the maximum. Check for
duplicates after pushing (`sort | uniq -d`), because parallel sessions bump concurrently.

## ISSUE-01 · CIM Global Leaderboard: double rank numerals — **done (163c46f)**

**What:** the top-100 leaderboard shows the row index AND the CIM rank as
separate columns ("1. 1 UNESCO 6,608,106,799").

**Why:** `RankingCard` always renders the row index (`<span class="rank-num">{i+1}.` —
WidgetFrame.jsx:256) and the `cimLeaderboard` transform also emits the CIM
`rank` as its first data column (colClasses `['cim-rank', 'cim-name', 'cim-num']`).

**Proposed fix:** the row index IS the rank — drop the separate Rank column
from the `cimLeaderboard` transform (columns `['Category', 'Views']`,
colClasses `['cim-name', 'cim-num']`). The highlight feature reads
`data.rows[].rank`, not the display, so it's unaffected. (Alternative:
a `hideRowIndex` flag on RankingCard — heavier, only needed if some widget
wants both.)

**Fixed 2026-08-14 (163c46f):** rank column dropped — rows render as `1. UNESCO 6,608,106,799`.

## ISSUE-02 · CIM Global Leaderboard: clickable category names — **done (163c46f)**

**What:** category names in the leaderboard are plain text; they should link
to the Commons category in a new tab.

**Why:** `RankingCard` cells are plain strings (`row.map` → `<span>`,
WidgetFrame.jsx:258).

**Proposed fix:** support link cells in `RankingCard` — when a cell is
`{ text, href }`, render `<a href target="_blank" rel="noopener noreferrer">`.
The `cimLeaderboard` transform then emits
`{ text: category, href: 'https://commons.wikimedia.org/wiki/Category:' + … }`
for the name column. (Same mechanism would later benefit CIM Top Pages /
Top Wikis.)

**Fixed 2026-08-14 (163c46f):** `RankingCard` renders `{text, href}` cells as links
(`.ranking-link` styling); the leaderboard links every category to its
Commons page — verified live (100 links, e.g. UNESCO →
commons.wikimedia.org/wiki/Category:UNESCO).

## ISSUE-03 · Every widget needs a ⓘ info button — **done**

**What:** no per-widget explanation of what a widget shows. Users must guess
or reopen the +Add Widget catalog.

**Why:** each registry entry already HAS the content —
`description` (and `dataSource`) — but the widget header (⚙/↻/✕ in
WidgetFrame.jsx) doesn't expose it.

**Analysis (2026-08-14):** the proposed fix (description + dataSource) is
sound and low-risk — one button, one inline panel, no schema/format
changes, and reusing `def.description` keeps catalog and card in sync. But
as proposed it answers only "what is this?", leaving "what is it looking at
right now?", "how fresh is this?", and "what do these numbers mean?"
unanswered — even though most of that information already exists somewhere
in the app (registry `timeScope`/`configFields`, the ⏱ footer, the scope
subtitles). ISSUE-03 is really an information-architecture request: collect
the scattered rich-info layer into one on-demand panel, without adding
persistent chrome (consistent with the Phase 2 "lean display mode"
direction — on-demand richness is the opposite of decoration creep).

Design principles adopted:
- **Progressive disclosure** — ⓘ closed by default = zero persistent cost;
  one sentence of prose max; everything else is compact key-value rows;
  raw config JSON is never rendered as prose (goes behind Copy debug info).
- **Identity exposure (debugging)** — the registry `id` slug (e.g.
  `cimFileTraffic`) is the canonical identifier across code, dashboard.json
  `widgetType` values, the schema enum, and docs — but it was invisible in
  the UI, and display names are genuinely ambiguous (CIM File Traffic vs
  File Spotlight vs Top Files; Article Gallery vs Commons File Gallery).
  The panel now shows the slug in `<code>` next to the widget name, the
  header tooltip includes it, and a **Copy debug info** button emits
  `{widgetType, name, icon, renderer, timeScope, config, fetchedAt, error}`
  — turning "this widget is broken" into a pasteable, reproducible bug
  report (devtools "copy as cURL" pattern). The slug also aligns UI with
  the export format: users who see `"widgetType": "cimFileTraffic"` in
  their dashboard.json recognize it in the panel.
- **Last error surfacing** — the panel shows the most recent `state.error`
  string when present, so a report is self-contained
  ("cimFileTraffic → load failed on Safari").
- **Help hierarchy** — app-level About modal → per-widget ⓘ →
  docs/DATA-SOURCES.md links. Each card becomes self-explanatory without
  the dashboard growing chrome.

Caveats found during implementation: `dataSource` strings are stylistically
inconsistent ('pageviews' vs 'WDQS / QLever SPARQL + Humaniki API') —
acceptable as-is since they are API names in either form; some registry
`description`s are catalog-thin ("Count pages linking to a domain") — a
future copy pass would improve panel value; `navigator.clipboard` needs a
secure context (https — Toolforge and localhost are fine; a legacy
textarea fallback covers the rest).

**Fix:** add a ⓘ button to the widget header (before ⚙) that toggles an
inline panel (same visual family as the config panel; Escape closes; opening
one panel closes the other). Panel content top→bottom: icon + name + `id`
slug in `<code>`; `def.description` (exact catalog text); `dataSource` line;
key-value rows — Analyzing (auto-built config summary from
`configFields` labels + current values, select/preset values resolved to
labels, long textarea values truncated), Time scope (mapped to friendly
phrasing), Auto-refresh, Last updated (full timestamp), Last error (when
present); Copy debug info button (clipboard JSON, "✓ Copied" feedback,
legacy fallback). Header tooltip gains `Name (slug) · asset`. No schema or
dashboard-format changes.

**Fixed 2026-08-14 (a41e7d4):** ⓘ panel implemented in WidgetFrame.jsx
(showInfo state + WidgetInfo panel), .widget-info styles in App.css, header
tooltip now `Name (slug) · asset`. Verified live: panel opens on data-driven
and static widgets alike, slug + description + config summary render,
Copy debug info emits valid JSON, Escape closes, ⚙/ⓘ mutually exclusive,
Last error row shows on fetch failure.

## ISSUE-04 · CIM Category Snapshot: growth (time-series) display mode — **open**

**What:** `cimSnapshot` shows only the latest month's point (files/used/wikis/
pages). The snapshot endpoint returns the FULL monthly series since the
category was registered — verified: BHL-in-Africa returns 21 months
(Nov 2024 → Jul 2026) in one request — and tiago.bio.br/impact_metrics
charts it as a selectable series.

**Why:** GLAM impact stories are about *adoption over time*
(files → used → wikis → pages); a point-in-time stat card can't tell that
story. The series is already in the fetch response — `fetchCimSnapshot`
reads `items[0]` and discards the rest.

**Proposed fix:** add a growth display mode to `CimSnapshotCard` (or a new
`CimGrowthCard`): selectable metric (`media-file-count` /
`used-media-file-count` / `leveraging-wiki-count` /
`leveraging-page-count`, ± `-deep` suffix per scope) charted over all
months. Fetch window `20120101→<requested month>` (one request; 1-h TTL
cache applies). Reuse the FileTrafficCard SVG line-chart pattern (labeled
axes + client-side −/+ zoom) and the temporal-scope subtitle. Declare
`timeScope: 'range'` (constitution).

**Status:** open. Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-05 · CIM Views Over Time: full-history months option — **open**

**What:** `cimTrend` caps the window at 2–24 months (default 6);
tiago.bio.br charts `pageviews-per-category-monthly` from `20120101` to now.

**Why:** the 24-month cap is self-imposed display policy, not an API limit —
the endpoint serves the full history since 2012/registration. Long-range
trends (seasonality, campaign effects, multi-year adoption) are invisible
today.

**Proposed fix:** allow a full-history mode in the months field
(e.g. `months: 0` sentinel = all, consistent with `month: 0` = latest),
fetching `20120101→now` and rendering the full series with the
FileTraffic-style −/+ zoom slices (6/12/24/all). Keep the default at 6 to
preserve card readability.

**Status:** open. Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-06 · CIM Top Files: nested per-file "top pages" drill-down — **open**

**What:** `cimTopFiles` rows are static (thumb + views). tiago.bio.br
expands each row in place to show the top pages using that file (top-3,
lazy fetch via `top-pages-per-media-file-monthly` — the endpoint
`cimFileSpotlight` already uses) and offers a bulk "Show Top 3 Pages for
All Files".

**Why:** a leaderboard without a drill path stops the "which article
benefits?" question — the core of usage stories for GLAM demos.

**Proposed fix:** per-row expand toggle in `CimTopFilesCard`: lazy fetch
`top-pages-per-media-file-monthly` (wiki/month from config), render linked
page titles inline, cap at 3 by default (config `drillDownN`); optional
bulk expansion using the batching patterns from docs/SCALABILITY.md.
Page links only resolvable when wiki ≠ all-wikis (see ISSUE-08 note).

**Status:** open. Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-07 · CIM Top Editors: link user names — **done (3861d26)**

**What:** user names render as plain text; tiago.bio.br links
[User] | [Talk] | [Contrib] (Commons `User:`, `User_talk:`,
`Special:Contributions`).

**Why:** editors are the human side of impact — a clickable trail to their
work; `RankingCard` already supports `{text, href}` cells (ISSUE-02 fix).

**Proposed fix:** emit the user column as link cells — either three
separate cells or one cell with `[User]|[Talk]|[Contrib]` superscript
links (match Tiago's pattern; keep row height small).

**Fixed 2026-08-14 (3861d26):** new `{text, links}` multi-link cell shape in
`RankingCard` (`.ranking-multi` — name + small link row, JSON-serializable);
the transform emits `editorLinks(user)` → `[User]|[Talk]|[Contrib]`
(underscore-encoded, `User:`/`User_talk:`/`Special:Contributions`).
Verified live: 10 rows × 3 links, first user SchlurcherBot → correct
Commons URLs.

## ISSUE-08 · CIM Top Pages: link page titles (wiki-aware) — **done (3861d26)**

**What:** page titles render as plain text even when a single wiki is
selected; tiago.bio.br links pages when wiki ≠ all-wikis and shows a
"links are not available for all-wikis" warning otherwise.

**Why:** the point of top pages is click-through to the articles; only
all-wikis mode lacks a resolvable host.

**Proposed fix:** transform emits `{text, href: https://<wiki>.org/wiki/<title>}`
when `config.wiki !== 'all-wikis'`, plain text + a subtitle note when
all-wikis. Same `{text, href}` mechanism as ISSUE-02/07.

**Fixed 2026-08-14 (3861d26):** better than proposed — the API returns a
per-row `page-wiki` host prefix (verified: `en.wikipedia`, `de.wikipedia`…
only, deep+all-wikis), so links resolve **per row regardless of
`config.wiki`** — all-wikis mode gets links too, no note needed.
`pageHref()` guards unknown prefixes (dotted hosts → `{wiki}.org`; known
single-word hosts wikidata/species/meta/commons/incubator/mediawiki;
else plain text). Verified live: 10 linked pages in all-wikis mode
(Dog → en.wikipedia.org/wiki/Dog).

## ISSUE-09 · CIM month selector: dropdown of available months — **open** (UX)

**What:** the CIM widgets take a numeric Month field (`0` = last complete
month). tiago.bio.br offers a dropdown of available year-month pairs
(default: last complete month).

**Why:** the magic number works for config power-users but is opaque; a
dropdown prevents impossible dates. Needs the available range
(top-* endpoints serve ~Nov 2023→latest; derive from the snapshot/trend
series for correctness).

**Proposed fix:** new configField type `month` rendering a select of
year-month pairs (start = data start, end = last complete month), keeping
the `0 = latest` semantics internally. Applies to the 8 CIM widgets'
`CIM_MONTH_FIELD`.

**Status:** open (UX, low priority). Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-10 · GLAM widget: "view in GLAMorous" deep-link — **open** (optional)

**What:** tiago.bio.br embeds a lazy GLAMorous iframe with pre-filled params
(`glamtools.toolforge.org/glamorous.php?doit=1&category=…&use_globalusage=1&show_details=1&projects[…]`)
behind a "makes a lot of requests to Wikimedia servers" warning.

**Why:** GLAM users know GLAMorous; a deep link from the `glamorgan` widget
hands off to the familiar tool without duplicating its walk. Our bounded
live walk stays the in-dashboard option.

**Proposed fix:** add a "View in GLAMorous" link/button on the glamorgan
widget card (open the pre-filled URL in a new tab; optionally an iframe
toggle behind the same warning). Cheap.

**Status:** open (optional). Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-11 · CIM category fields: allow-list autocomplete — **open** (UX, medium)

**What:** category inputs are free text; typos land in the friendly but
wrong "not in CIM" register state. tiago.bio.br autocompletes from the
allow-list TSV (verified: 1,529 registered categories,
`assets/commons_category_allow_list.tsv`).

**Why:** the allow-list is public; autocomplete eliminates typo-404s and
surfaces the registered vocabulary (nice for WikiPortraits demos).

**Proposed fix:** ship the allow-list TSV as a static asset (regenerate
periodically), add a datalist/autocomplete to `CIM_CATEGORY_FIELD`
(~1.5k entries is fine as a static list; watch the apostrophe-quoting
seen in the source TSV).

**Status:** open (medium). Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-12 · CIM Views Over Time (TrendCard): no Y-axis scale or labels — **open**

**What:** the trend chart renders an unlabeled SVG line with only start/end
date labels below — no Y axis, no min/max values, no scale context.
Reported live: `cimTrend` (Images_from_Metropolitan_Museum_of_Art, deep,
all-wikis, 18 months) — the viewer can't tell whether the line is 1M or
100M views.

**Why:** `TrendCard` (WidgetFrame.jsx) computes `min`/`max`/`range` but
never renders them; `FileTrafficCard` already has the labeled-axes pattern
(compact Y ticks `254K`/`1.2M`, month X labels, "views"/"month" titles) to
copy.

**Proposed fix:** add Y-axis ticks (5 ticks, compact K/M/B formatting) +
X month labels to `TrendCard`, reusing the FileTrafficCard axis code
(`.file-traffic-axis` styles); optionally include the resolved min/max in
the subtitle. Affects every TrendCard user (cimTrend, pageviews trend
mode, SPARQL line renderer) — beneficial across the board.

**Status:** open. Source: user report 2026-08-14 (URL
`?config=https://w.wiki/TT2g`).

## ISSUE-13 · CIM Category Snapshot: card too tall / mostly blank — **open** (UX)

**What:** `cimSnapshot` renders 4 compact numbers + tiny sparkline; at
common grid heights the card is mostly empty and hard to shrink short
(user: "make this widget shorter given that most of the content is blank").

**Why:** no `defaultLayout` constraint for cimSnapshot (only panorama360
has one — registry pattern `defaultLayout: { w, h, minW, minH }`); the
card content is ~2–3 rows tall but the grid item stays taller, and
`.glam-stats` doesn't center in the body.

**Proposed fix:** add `defaultLayout: { w: 4, h: 3, minH: 2 }` so the
widget starts compact and can shrink to 2 rows (react-grid-layout clamps
by drag, as verified for panorama); consider vertically centering
`.glam-stats` so short heights look intentional. Revisit other short
content cards (StatCard widgets) for the same minH treatment.

**Status:** open. Source: user report 2026-08-14.

## ISSUE-14 · Category Size: random-sample label + in-card refresh — **open** (UX)

**What:** with `sampleCount > 0` the card shows a photo strip with no
indication the images are a **random sample**; the only refresh is the
header ↻. Reported live: `categorySize` (Images from Metropolitan Museum
of Art, sampleCount 20) — "it should show in the box that the images in
the grid are a random sample, and perhaps have a refresh button within
the widget".

**Why:** users may read the sample as exhaustive/curated; the "fresh per
refresh" behavior (new random picks each load — README-verified) is
invisible. The transform already passes `sample: data.sample`; the strip
renders in StatCard with no caption.

**Proposed fix:** (a) render a small caption above/below the strip —
"Random sample of N photos (↻ for a new sample)" from
`data.sample.length`; (b) add an in-card refresh button — requires an
`onRefresh` prop threaded from WidgetFrame through WidgetContent to
StatCard (call `load()`; the ⓘ/⚙/↻ header stays as-is).

**Status:** open. Source: user report 2026-08-14.

## ISSUE-15 · Article Gallery: explain the images are the article's — **open** (UX)

**What:** the gallery grid gives no context that the images are the ones
**used in the article** (Parsoid significant media). Reported live:
`gallery` (Metropolitan Museum of Art) — "it should have a brief
explanation that these images are ones used in the article".

**Why:** the subtitle only says "N images · M filtered (tiny/uncaptioned)"
— provenance ("from the article") and selection rule (captioned,
≥ minSize) aren't communicated.

**Proposed fix:** extend the transform's subtitle (or add a caption line):
"Significant images used in this article (captioned, ≥200px)" —
title/subtitle already exist in the GalleryGridCard header; optionally
link the title to the article page. Update the ⓘ description to match.

**Status:** open. Source: user report 2026-08-14.

## ISSUE-16 · Edit History: click a revision to open its diff — **open**

**What:** edit rows show user/time/comment/byte-delta but aren't clickable
— no way to reach a diff from the widget. Reported live: `edithistory`
(Metropolitan Museum of Art, limit 10).

**Why:** the point of a revision list is diff drill-down; each row already
has `revid`, and the transform has the article title + project.

**Proposed fix:** make each row (or a "diff" affordance on the row) an
`<a>` to `https://{project}.org/w/index.php?title={article}&diff=prev&oldid={revid}`
with `target="_blank"` (keep the row styling; the diff opens in a new
tab). The transform must pass the underscore-form article title and
project (verify `fetchEditHistory` output has both).

**Status:** open. Source: user report 2026-08-14.

## ISSUE-17 · CIM Top Pages: wiki column too wide — **open**

**What:** the first column (wiki prefix, e.g. "en.wikipedia") renders at
the same `flex: 3` width as the page-title column — short content,
wasted space. Reported live: `cimTopPages` (Images_from_
Metropolitan_Museum_of_Art, deep, all-wikis).

**Why:** the transform emits `colClasses: ['cim-name', 'cim-name',
'cim-num']` and `.cim-name { flex: 3 }` is shared by the wiki and page
columns (App.css). The GLAM widget already solved the same problem for
its wiki column (shorthand + 108px nowrap + full hostname on hover).

**Proposed fix:** new `.cim-wiki` class — fixed width (~84–108px),
`nowrap` + ellipsis, full hostname in the `title` tooltip (same pattern
as the GLAM wiki-column fix); transform colClasses become
`['cim-wiki', 'cim-name', 'cim-num']`. No data changes.

**Status:** open. Source: user report 2026-08-14.

## ISSUE-18 · Slim / presentation mode: hide widget chrome — **done (3c94ab8)**

**What:** a mode where widget title bars (and other decoration) are hidden
so the dashboard reads as a streamlined full web app rather than a
widget framework. Reported: user request 2026-08-14; matches ROADMAP
Phase 2 "lean display mode (decorations hidden by default, hover/tap to
reveal)".

**Why:** demo/PR value (the screenshot becomes "a real dashboard", not a
builder — supports the spike-alert/shareable strategy), focus for
viewers (data, not chrome), and kiosk/embed potential (an iframe on a
wiki page or GLAM site with minimal chrome). Drawbacks: hidden controls
hurt discoverability for new users; hover patterns are desktop-only;
and the grid must be locked while headers are hidden (drag handle
lives in the header).

**Approaches considered:**

- **A. Persistent top-level toggle (Edit/View or slim switch).** Pro:
  explicit, discoverable, predictable, keyboard-accessible; state can
  persist. Con: one more toolbar control; chrome stays on until toggled;
  doesn't help touch if the toggle itself is the only path.
- **B. Hover-reveal title bars** (headers hidden; hover a widget → its
  header fades in). Pro: zero chrome at rest; mouse movement is a
  natural affordance. Con: desktop-only (touch has no hover — tap would
  need to both reveal and interact); accidental reveals while sweeping
  the mouse across the board (flicker); keyboard users need a
  focus-within path; drag handle unavailable at rest (grid must lock).
- **C. Two explicit modes — View vs Edit** (Grafana/Kibana-style). Pro:
  robust on touch, accessible, predictable; view mode = grid locked
  (`isDraggable`/`isResizable` false), headers + ⏱ footers hidden,
  toolbar collapses to essentials; edit mode = today's behavior. Con:
  mode switch is a small mental overhead; still a control on screen.
- **D. Slim headers** (icon + title only; action buttons hidden until
  hover). Pro: keeps context + drag handle. Con: still chrome; partial
  win vs the goal.
- **E. Hybrid (recommended): C + B.** A top-level "Slim" toggle
  (toolbar button, `localStorage` persisted, `?slim=1` URL param for
  shareable presentation links, Escape exits) + per-widget hover/
  focus-within reveal of the header in slim mode (CSS-only:
  `.slim .widget-header { display: none }` /
  `.slim .widget-frame:hover .widget-header, .slim .widget-frame:focus-within .widget-header { display: flex }`).
  Grid locked in slim mode; toolbar shrinks (keep ⓘ About, Share,
  Export; hide +Add/Import/Example/Reset).

**Open decisions:** whether the ⏱ freshness footer (freshness
constitution) hides in slim mode — proposal: yes, as an intentional
opt-out (viewers of a presentation link don't need it; the header's ⏱
reappears on hover) or keep a one-line footer; whether subtitles with
the temporal scope stay (proposal: yes — they're content-adjacent).

**Approved design (2026-08-15):** implement E — a top-level
"Present" toggle + `?kiosk=1` URL param, root `.kiosk` class, CSS-only
chrome hiding, grid lock, no persistence (deliberate: kiosk is entered
on purpose; URL param wins at boot). Full spec below.

## Implementation spec (2026-08-15 — highest detail)

**Files:** `src/App.jsx`, `src/App.css`. No server, schema, or registry
changes. Effort: ~1–2 h incl. testing.

### 1. State & boot (`src/App.jsx`)

```jsx
const [kiosk, setKiosk] = useState(false);
```

- **Boot** (inside the existing URL-boot effect): read the param once —
  `new URLSearchParams(window.location.search).get('kiosk') === '1'` →
  `setKiosk(true)`. A `?kiosk=1` link stays kiosk across refreshes
  because the param stays in the URL.
- **NOT persisted to localStorage** — a user who tries kiosk once must
  not silently land back in it next visit.
- **Escape exits** (only when kiosk is active):

```jsx
useEffect(() => {
  if (!kiosk) return;
  const onKey = (e) => { if (e.key === 'Escape') setKiosk(false); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [kiosk]);
```

### 2. Render changes (`src/App.jsx`)

- Root div (line ~245): `<div className={`app ${kiosk ? 'kiosk' : ''}`}>`
- **Toolbar button** (in `.app-actions`, after the ⓘ About button):

```jsx
<button className="btn" onClick={() => setKiosk(true)} title="Presentation mode — hides editing controls · Esc to exit">
  ⛶ Present
</button>
```

- **Exit pill** (rendered when kiosk; place right before the closing
  `</div>` of `.app`):

```jsx
{kiosk && (
  <button className="kiosk-exit" onClick={() => setKiosk(false)} title="Exit presentation mode (Esc)">
    ✕ Exit
  </button>
)}
```

- **Grid lock + tighter margins** (GridLayout, line ~290; current props:
  `rowHeight={80}`, `margin={[12, 12]}`):

```jsx
<GridLayout
  // ...existing props...
  isDraggable={!kiosk}
  isResizable={!kiosk}
  margin={kiosk ? [4, 4] : [12, 12]}
>
```

- **Optional fullscreen** (flag `FULLSCREEN_ON_PRESENT`): only inside
  the Present *click handler* (browser requires a user gesture; the
  `?kiosk=1` boot path must NOT attempt it): `if (kiosk &&
  document.documentElement.requestFullscreen)` →
  `requestFullscreen().catch(() => {})`; on exit,
  `if (document.fullscreenElement) document.exitFullscreen().catch(() => {})`.

### 3. CSS (`src/App.css`)

```css
/* ── Kiosk / presentation mode (ISSUE-18) ──────────────── */
.kiosk .app-header { display: none; }        /* hide brand + all toolbar buttons */
.kiosk .widget-header { display: none; }     /* title bar: icon, title, ⓘ⚙↻✕ */
.kiosk .widget-fetched { display: none; }    /* ⏱ freshness footer (intentional opt-out) */
.kiosk .widget-frame { border-color: transparent; }  /* soften card chrome */
.kiosk .grid-item { box-shadow: none; }      /* if grid-item has a shadow */
.kiosk .widget-body { padding: 8px; }        /* a touch more density */
.kiosk .boot-banner { display: none; }       /* hide transient banners */

.kiosk-exit {
  position: fixed;
  top: 10px;
  right: 12px;
  z-index: 1000;
  opacity: 0.35;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.kiosk-exit:hover { opacity: 1; }
```

Notes: `.widget-fetched` is `position: absolute` inside the body —
hiding it is safe. Hiding `.app-header` collapses it out of flow, so
the grid moves up and gets the full viewport (the point of kiosk).
Mobile: the single-column stack is untouched; the pill stays tappable
at 0.35 opacity (touch has no hover, so never go below ~0.3).

### 4. Behavior checklist (test before calling it done)

- Enter via ⛶ Present: headers/footers/toolbar gone; **drag attempt
  does nothing** (grid locked); margins tight; Escape exits; pill
  exits.
- Enter via `?kiosk=1`: same on load; refresh stays kiosk.
- Widget content still interactive: panorama drag-pan, file-traffic
  −/+ zoom, gallery links (new tab), wikiPage iframe links, SPARQL
  renderer override — no regressions from hidden headers.
- Auto-refresh still runs (⏱ hidden is fine — confirm via a 30 s
  refreshSeconds widget's data changing, no console errors).
- Mobile viewport: single-column stack renders; pill visible/tappable.
- After ✕ Exit + refresh → normal mode (no persistence).
- Share/Export/Add are unreachable in kiosk by design — the Exit pill
  is the door back.

### 5. Docs

- README Features: one bullet ("⛶ Presentation / kiosk mode — hide all
  editing chrome via the Present button or `?kiosk=1`; Esc or the
  floating ✕ Exit returns").
- ROADMAP Phase 2: mark the "lean display mode" item as done once
  shipped.

**Fixed 2026-08-15 (3c94ab8):** implemented per spec — `kiosk` state in
App.jsx (boot reads `?kiosk=1` once, never persisted), `.app.kiosk` root
class + CSS-only hiding (`.app-header`, `.widget-header`, `.widget-fetched`,
`.boot-banner`; card border softened via `.grid-item` — the spec's
`.widget-frame` rule was a no-op since the frame has no border, verified),
grid locked (`isDraggable`/`isResizable` off) + `[4,4]` margins, ⛶ Present
toolbar button (browser fullscreen only on this user-gesture path),
floating ✕ Exit pill (also strips `?kiosk=1` from the URL so a refresh
after Exit lands in normal mode — closes the spec's checklist item that
would otherwise fail on kiosk URLs), Esc exits. Kiosk density padding
(8px) excludes markdown cards via `:not(:has(.markdown-card))` so they
keep their flush body. Verified live on the full 29-widget catalog: drag
inert (real mouse events, transform unchanged), 0 headers/footers visible,
no widget error states, zoom buttons interactive, mobile stack + tappable
pill at 0.35 opacity, Escape/Exit/refresh cycles per checklist. README
Features bullet + ROADMAP lean-display item marked done.

**Extended 2026-08-16 (3bfad47):** ▣ **Lean mode** — the same
chrome-free, grid-locked presentation WITHOUT fullscreen (`?lean=1` URL
param + toolbar button; `.kiosk` CSS rules shared with `.lean`). The
browser stays resizable at any size, so the board reads as a compact
app (iPad-style). Esc exits; ✕ Exit strips `?lean` (or `?kiosk`) so a
refresh after leaving lands in normal mode; kiosk and lean are mutually
exclusive (kiosk wins at boot). Fixed during verification: the
param-strip used the return of `URLSearchParams.delete()` (undefined,
not boolean) — restored `.has()`-first semantics; kiosk regression
green. **DEPLOYED to Toolforge 2026-08-16** (bundle index-DkcrAAk0.js) —
verified live: `?config=/dashboard.json&lean=1` → 30 widgets chrome-free,
no fullscreen, resize/Esc/pill lifecycle green; `?kiosk=1` regression
green. See README Features + ROADMAP lean-display item.

**Status:** done. Source: user
request 2026-08-14; spec 2026-08-15.

## ISSUE-19 · CIM File Spotlight: show the file's thumbnail (size-customizable) — **open**

**What:** `cimFileSpotlight` renders stats + sparkline but never the image
itself. Reported live: Queen Mother Pendant Mask — Iyoba
(MET DP231460, all-wikis) — "Add a thumbnail of the image, perhaps
customizable for size — thumb, medium, full width?"

**Why:** a single-file spotlight widget is the natural place for the
visual — the file IS the subject; `fetchCimFileSpotlight` only calls
`media-file-metrics-snapshot` + `pageviews-per-media-file-monthly` (no
`imageinfo`), so no thumb URL exists in the data.

**Proposed fix:**
- Fetch one `imageinfo` for the file (the `attachThumbs` pattern from
  `cimTopFiles` — space-normalized `File:` title gotcha applies;
  `iiurlwidth` for a ~800px display copy). One extra call, TTL-cached.
- New `thumbSize` config: `thumb` (~120px) / `medium` (~300px) /
  `full` (~800px, CSS-constrained responsive width, `object-fit:
  contain`); default `medium`. Note the Commons thumb-width constraint
  (up to 4096px via iiurlwidth; beyond that use the original URL) —
  display width is CSS-controlled either way.
- Render the image at the top of `CimSnapshotCard` (new
  `.spotlight-image` block; click-through link to the Commons file
  page; reuse `.card-image`/`sample-thumb` styling family); caption
  shows the display filename.
- Keep the stats + sparkline below the image.

**Status:** open. Source: user report 2026-08-14.

## ISSUE-20 · Session info: reveal the loaded config's source URL (incl. w.wiki expansion) — **open**

**What:** loading via `?config=https://w.wiki/TT2g` gives no UI indication
of what the short link expanded to or where the JSON lives. Reported:
"I'm not sure what is the exact URL the JSON data is from… I should be
able to see that this w.wiki shortcut has expanded into a full URL and I
can find it at that URL" — session-level info, debug or user-friendly.

**Why:** `fetchRemoteConfig` (src/lib/share.js) resolves w.wiki → target
via `/api/resolve` but **discards the resolved URL** (returns text only);
App.jsx keeps only `bootError` for the whole session provenance. The
toolbar ⓘ (About) explains the tool, not the current session — the
per-widget ⓘ (ISSUE-03) has no app-level counterpart.

**Proposed fix:**
- `share.js`: return `{ text, resolvedUrl }` from `fetchRemoteConfig` so
the expanded URL is available to the UI.
- App.jsx: track session provenance — `{ rawParam, resolvedUrl,
sourceKind: 'url' | 'hash' | 'localStorage' | 'defaults', fetchedAt,
widgetCount, validationWarnings, bootError }`.
- Extend the existing app-level ⓘ About modal with a **Session**
section (one affordance, no new chrome): raw `?config=` value, the
expanded full URL (link + copy button — it's browseable directly since
a `.json` wiki page serves its JSON), fetch time, widget count,
validation warnings; plus a **Copy debug info** button emitting JSON
(same pattern as the per-widget ⓘ).
- Also state the source kind: `#/d/<base64>` hash → "config embedded in
URL", localStorage → "from previous session", none → "starter
widgets".

**Status:** open. Source: user report 2026-08-14.

## ISSUE-21 · Provenance constitution (meta): every display explains its own data — **open** (design)

**What:** pattern analysis of the filed issues (2026-08-14): five of nine
user-filed issues ask the same question in different words — "what am I
looking at?" — ISSUE-12 (chart scale), 14 (is this a sample?), 15 (where
did these images come from?), 19 (show me the subject), 20 (where did
this board come from). Propose a **third constitution** — after freshness
(⏱ footer) and temporal scope (subtitle) — requiring every data display
to make its provenance visible.

**Why:** the constitution architecture is proven (tests/scope-
compliance.test.mjs runs via `npm test`, wired into `npm run build` — a
non-compliant widget blocks deployment). A provenance rule would have
prevented 5 of the 9 user filings; without it, the pattern keeps being
rediscovered per-widget (cf. ISSUE-17 — the GLAM widget already solved
the wiki-column width).

**The constitution (proposed rules, enforced by a new
`tests/provenance-compliance.test.mjs`):**

1. **Subject visible** — every widget's header/title states what it is
   analyzing (already true via asset-aware titles; the rule formalizes
   it).
2. **Scale/scope visible** — any chart MUST render labeled axes or an
   explicit min/max (fixes 12); the resolved temporal scope stays in the
   subtitle (existing constitution).
3. **Caveats visible** — samples are labeled "Random sample of N"
   (14); filters stated ("captioned, ≥200px" — 15); caps stated
   (5,000+ pattern already exists for external links); **data vintage vs
   fetch time** — TTL-cached sources (CIM/Wikistats/SPARQL) should show
   "data: 2026-07 · fetched 2:34 PM" rather than only the fetch time
   (interpolated from 20 + the freshness constitution's documented
   caveat).
4. **Subject visual** — widgets about a single artifact (cimFileSpotlight
   19, excerpt, panorama) show the artifact's image when one exists.
5. **Session provenance** — the app-level ⓘ/About gains a Session
   section: raw `?config=` value, expanded URL, source kind, fetch time,
   widget count (fixes 20).

**Registry form:** each entry declares `provenance: { caveats: [...],
showsSubjectImage: bool }` or similar; the test walks the registry +
fixture transforms (same pattern as scope-compliance) and fails on
missing declarations or unlabeled sample/cap data.

**Status:** open (design). Source: pattern analysis of ISSUE-12..20, 2026-08-14.

## ISSUE-22 · Actionability audit (meta): every datum links to its source — **open** (design)

**What:** widgets are posters, not portals. Following the link precedents
(ISSUE-02 leaderboard → 07 editors → 08 pages, all done), remaining
gaps: 16 (revision → diff), 06 (top file → its top pages drill-down),
10 (GLAMorous handoff). Propose a **per-widget link-coverage audit** so
"data as portals" is a checklist, not a rediscovery.

**Why:** the README tagline is "insights **and action**" — the action
half is underbuilt. Each link fix so far was filed independently after a
user hit the missing affordance; a matrix prevents future gaps (e.g.
the wiki column in cimTopPages/leaderboard could link to its wiki's
main page — a candidate not yet filed).

**The audit matrix (docs/ACTIONABILITY.md, widget-by-widget checklist):**

- Article-based widgets (pageviews, excerpt, quality, assessments,
  edithistory, gallery, articleList): title → article page; revisions →
  diff (16); users → contributions (edithistory already does).
- File-based (fileUsage, gallery, fileGallery, cimTopFiles,
  cimFileSpotlight, panorama): file → Commons file page (mostly done;
  verify coverage incl. the spotlight thumb link from 19).
- Category-based (categorySize, glamorgan, all CIM): category → Commons
  category page (leaderboard done in 02; check the rest).
- Table rows (CIM): pages/users done (07/08); wiki column → wiki main
  page (candidate); top-files drill-down (06).
- Tool handoffs: GLAMorous deep-link (10); future PetScan/PagePile
  sources get the same treatment.

**Proposed form:** no build gate (links are best-effort affordances, not
constitution-grade) — a documented matrix + per-widget fixes, filed as
small issues as the audit proceeds.

**Status:** open (design). Source: pattern analysis of ISSUE-12..20, 2026-08-14.

## ISSUE-23 · SightGlass widget family: job result + metadata gaps — **open**

**What:** integrate [SightGlass](https://sightglass.toolforge.org)
(WikiPortraits tool, Kevin Payravi — gitlab.wikimedia.org/repos/
wikiportraits/sightglass; job-based Commons category pageview-impact
scanner on mediacounts data, same family as CIM) as a display widget.
Analyzed 2026-08-14 from a saved job result (NASA Air & Space Museum
scan, 6,947 files).

**Why:** SightGlass offers what the CIM family can't — (1)
**metadata-completeness signals**: per-file `author`/`license` fields
reveal gap buckets (the NASA scan: license: 0 on 6,946/6,947 files,
author missing on ~900) → an actionable GLAM audit sorted by view
count, genuinely new content for WikiBento; (2) **any category, any
date range, referer/agent filters** — CIM is allow-list + monthly;
SightGlass computes on demand → natural CIM fallback for unregistered
categories (ROADMAP "CIM-first GLAM mode" item — note there, not here).

**API facts (verified):** `GET /api/jobs/{id}` → `{type:
'category-stats', status, progress, total, parameters: {category,
start, end, granularity, referer, agent, depth}, isSaved,
expiresInDays}`; `GET /api/jobs/{id}/result` → `{category,
fileCount, filesProcessed, filesWithErrors, totalViews,
averageViewsPerFile, startDate, endDate, timeline:
[{timestamp, requests}], files: [{filename, totalViews, author,
license, taken, uploaded, usage}], authors[], licenses[],
categoryTree}` — 1.26 MB for 6,947 files; job run ~15 min (async);
result API public, **job creation requires /login**; **NO CORS headers**.
Sparse fields: `usage` on 61/6,947, `taken` on 2,988/6,947 — handle
missing fields.

**Proposed fix (two display modes, one data source):**
- New widget family `sightglass` (input = job ID or full job URL — the
  "list source" input vocabulary):
  - **Job Result mode**: summary stats (files · total views · avg/file ·
    range) + monthly timeline chart (FileTraffic/TrendCard pattern —
    inherits ISSUE-12's axis fix) + top-N files with thumbnails
    (`attachThumbs` imageinfo pattern) + status/progress banner for
    pending jobs + "saved result" freshness stamp.
  - **Metadata Gaps mode**: "N files (X% of views) lack author
    metadata · M lack license" + most-viewed gap files as a fix-it
    list linking to their Commons pages.
- Transport: fetch via the Toolforge same-origin `/api/proxy` (hatnote
  precedent; sightglass sends no CORS) — consider a server-side trim
  (`?top=N&fields=…` proxy extension) and/or a shared TTL cache
  (Wikistats 195 KB CSV precedent) for the 1.26 MB payload.
- Handoff: a small "Create a scan" deep-link to
  `https://sightglass.toolforge.org/query` (login-gated; same pattern
  as ISSUE-10's GLAMorous link).
- Registry entry declares `timeScope: 'range'` (constitution) and
  provenance caveats (ISSUE-21: "sample = top N of the scan; scan
  period from the job").

**Status:** open. Source: SightGlass API analysis 2026-08-14 (job
TBJkShssuDUjMqWM).

## ISSUE-24 · Wiki Edu widgets: campaign overview + course stats — **open**

**What:** integrate Wiki Education's public data into widgets — the
course dashboard (dashboard.wikiedu.org) and the Impact topic tool
(impact.wikiedu.org). Analyzed 2026-08-14 from three surfaces: the
Impact home, a course overview
(`/courses/American_University/COMM420_(Spring_2016)/overview`), and
the Explore catalog.

**Why:** Wiki Edu runs hundreds of classroom programs whose outputs are
Wikipedia contributions — a natural "Edit-a-thon Live / Campaign
Tracker" starter-pack data source (ROADMAP). Prior notes in
WIDGET-IDEAS.md cover the campaign JSON; the course-level surface is
newly verified here and is the richer half.

**API facts (verified 2026-08-14):**
- **CORS: dashboard.wikiedu.org sends `Access-Control-Allow-Origin: *`
  (emitted when an Origin header is present — real browser fetches
  work directly; earlier "no CORS" readings were header-only probes
  without Origin).** All endpoints below are public JSON, no auth:
  - `campaigns/{slug}.json` → `{campaign: {title, slug, description,
    courses_count, user_count, new_article_count_human, word_count_human,
    references_count_human, view_sum_human, …}}` (human-formatted stats
    e.g. "254K", "17.4M" — quick-win StatCard material).
  - `courses/{school}/{course}/articles.json` → per-article
    `{character_sum, references_count, view_count, new_article,
    tracked, user_ids, mw_page_id, url}` (83 KB for COMM420 — RankingCard
    material: top articles by views, new-article flags).
  - `courses/{school}/{course}/users.json` → per-student
    `{character_sum_ms/us/draft, references_count, role, …}`
    (10.9 KB — student contribution leaderboard).
  - `courses/{school}/{course}/uploads.json` → `{uploaded_at,
    usage_count, url, thumburl, …}` (34.7 KB — **thumburl already
    present**, gallery material).
  - `courses/{school}/{course}/timeline.json` (weeks/blocks) and
    `assignments.json` (student↔article links) — minor.
  - 404s: `courses/{school}/{course}.json`, `…/overview.json`,
    `students.json`, `revisions.json`, `explore.json`; root
    `campaigns.json` returns `{campaigns: []}` without filter params
    (Explore's surface needs bundle archaeology — defer).
- **impact.wikiedu.org has NO CORS even with Origin** — needs the
  Toolforge `/api/proxy` (hatnote/SightGlass precedent); topic
  metadata rich (`/api/topics/{id}`: articles_count 436, user_count
  116,712, timepoints_count 25, embedded Wikidata query link —
  WIDGET-IDEAS "Topic Overview" note stands, proxy-gated).

**Proposed fix (two widgets):**
1. **Wiki Edu Campaign** (quick win, S): input = campaign slug;
   StatCard/GLAMCard of the human-formatted headline stats
   (courses/users/articles/words/references/views) + link to the
   campaign page. CORS-OK, no proxy.
2. **Wiki Edu Course** (M): input = school/course slug pair (or full
   course URL — parse it); render: top articles by `view_count`
   (RankingCard, `new_article` badge, link via `url`), student
   contribution rows from users.json (characters/references), and an
   uploads filmstrip using the existing `thumburl` values
   (GalleryGridCard pattern). All three fetches in parallel
   (Promise.all), shared TTL cache.

Registry entries declare `timeScope: 'point'` (or 'range' for
time-bounded course terms — check) + ISSUE-21 provenance caveats
("course period from Wiki Edu"). Update WIDGET-IDEAS.md with the
verified course endpoints and the corrected CORS note.

**Deferred:** Explore catalog widget (param discovery needed); Impact
topic widgets (proxy-gated; revisit when /api/proxy is generalized
server-side trimming).

**Status:** open. Source: WikiEdu API analysis 2026-08-14.

## ISSUE-25 · Internet Archive widget family: item, views, search, collection, wayback — **open**

**What:** integrate the Internet Archive's public APIs as display widgets.
Researched 2026-08-14 (official developer portal
archive.org/developers + live probes; IA/Wikimedia ties: Wayback is
Wikipedia's citation archive — dead-link triage; IA scans donated to
Commons/Wikisource).

**Why:** IA holds ~1T web pages (Oct 2025 milestone) + millions of texts/
media with per-item engagement stats — a pageviews-style surface for a
GLAM/archive bento, plus the Wayback availability check is genuinely
useful next to any Wikipedia citation work. All core endpoints are
public and most are browser-fetchable.

**Verified API surface (2026-08-14):**
- ✅ **CORS `Access-Control-Allow-Origin: *`** (browser-fetchable):
  - `archive.org/metadata/{id}` → item metadata + `files[]` list +
    `item_size`; partial reads (`/metadata/{id}/files?start&count`).
  - `archive.org/advancedsearch.php?q=…&fl[]=…&rows&sort&output=json` →
    `{response: {numFound, docs[]}}` (fields: identifier, title, year,
    downloads, collection…).
  - `archive.org/services/search/v1/scrape?q=…&fields=…&count=N` —
    newer API; ⚠️ `count` min 100 (client slices; 400 otherwise).
  - `archive.org/wayback/available?url=…` → `{archived_snapshots:
    {closest: {available, timestamp, status, url}}}`.
  - **`be-api.us.archive.org/views/v1/short/{id}`** → per-item
    engagement `{all_time, last_30day, last_7day}` ("views" = play/read/
    download, one per item/user/IP/day; updated daily); time series via
    `views/v1/detail/item/{id}/{start}/{end}` (200 verified).
  - `archive.org/services/img/{id}` → 302 to a real thumbnail — usable
    directly as an `<img src>` (no JSON).
- ❌ **No CORS** (need the Toolforge `/api/proxy` — hatnote/SightGlass
  precedent): `web.archive.org/cdx/search/cdx` (capture index),
  `web.archive.org/web/timemap/link/{url}` (memento timeline).
- `archive.org/stats` (aggregate ops dashboard) → 302, not a data API.

**Proposed fix (widget family, in priority order):**
1. **IA Item** (📦, S): identifier → metadata summary (title, creator,
   year, description, collection, item_size, file count) + views stats
   (all_time/30d/7d) + thumbnail (`services/img`) + link to details
   page. Two fetches (metadata + views), CORS-OK, StatCard-style.
2. **IA Item Views Over Time** (📈, S): views detail series → TrendCard
   (inherits ISSUE-12 axis fix) — the IA analogue of pageviews.
3. **IA Search** (🔍, S–M): query → results list (identifier/title/
   year/downloads) clickable to details; optional `services/img`
   thumbs (Article List pattern).
4. **IA Collection** (🗂️, M): collection id → top items by downloads
   (`advancedsearch q=collection:X sort=downloads desc`) + collection
   metadata — GLAM-style; natural fit for Wikimedia-adjacent
   collections (donated scans).
5. **Wayback Availability** (🕰️, S): URL → closest snapshot
   (available/timestamp/status/replay link) — dead-link triage for
   Wikipedia citations; optional **coverage mode** (first/last
   capture, count, capture timeline via CDX — proxy-gated, M).

Registry: `timeScope` 'point'/'range' per widget; ISSUE-21 provenance
caveats ("views = IA engagement, updated daily; search = top N by
downloads"). Shared TTL cache for the search/views endpoints.

**Deferred:** IA S3 API, changes feed (auth-gated); Archive-It partner
APIs (auth); Scholar/Fatcat (separate catalog).

**Progress (2026-09-10):**
- ✅ **Item 1 shipped — `iaItem` (IA Item).** Metadata + engagement views +
  `services/img` thumbnail on a shared `CimSnapshotCard`; `timeScope: 'point'`;
  emits the item URL. Endpoints re-verified live 2026-09-10 (CORS `*`): metadata
  324 ms, views 351 ms. Tests: `tests/ia-item.test.mjs` (14) →
  `npm test` 252/252; browser E2E `npm run smoke:ia`
  (`scripts/ia-item-e2e.mjs`, 13 assertions incl. a loaded thumbnail and the
  not-found message). Docs: `docs/DATA-SOURCES.md` §27,
  `docs/BOARD-COMPOSITION.md` §1.8.
- ⚠️ **Item 5 (Wayback Availability) is largely already built — do not duplicate
  it.** `waybackGallery` (registry, `WaybackGalleryCard`, `/api/wayback-gallery`)
  already does closest-capture-per-date with an availability fast path, a CDX
  fallback through `/api/proxy`, stale-cache resilience, and iframe replay tiles.
  A separate single-URL "is it archived?" card would overlap it; the genuinely
  *new* angle is **bulk citation-rot** (an article's external links → coverage %
  + liveness), which belongs with the Bucket B dead-link detector.
- Re-verified constraints for the rest of the family: `scrape` `count` minimum is
  **100** (400 otherwise); CDX is **proxy-gated and 503-prone**; `views/v1/detail`
  is **5.8 s / 48 KB** (the slow one — cache hard, refresh rarely);
  `timemap/link` returns **27 MB** per call.
- Remaining: items 2 (views over time), 3 (IA search), 4 (IA collection).

**Progress (2026-09-15) — the media expansion researched, and a home for it:**
[**docs/INTERNET-ARCHIVE.md**](INTERNET-ARCHIVE.md) is now the family's page: the verified API
surface (endpoint / CORS / measured latency & size), the **derivative-file conventions per media
type** (which files a scan, a concert, an audiobook, a film and a TV broadcast actually carry), the
quotas, and a ranked proposal for the media widgets this issue did not cover —
`iaBook` (IIIF page viewer; **CORS ✅ and canvas-safe, so PNG export works**),
`iaVideo` (+ a keyframe filmstrip from `{id}.thumbs/`), `iaAudio` (playlist + spectrograms),
`iaImages`, and `iaTvNews` last.

New distinction measured (and it is the one that breaks naive designs): **a collection, an item and a
playlist are all one `metadata/{id}` call apart, and the URL tells you nothing.**
`metadata.mediatype === 'collection'` is the collection marker (`mit_ocw` — 11 files, 0.1 MB, **511
children**), and **a collection's own metadata lists no children**: enumerate with
`scrape?q=collection:mit_ocw&total_only=true` → `{"total": 511}` in 34 bytes, then cursor paging. A
**playlist is not a type at all** — it is an item whose `files[]` group into 2+ ordered parts carrying
`length` and `title` (`MIT18.01JF07`: 35 lectures × mp4+ogv, all 70 files titled and timed, 11.6 GB),
so `iaPlaylist` is a *renderer* over the same call `iaItem` already makes. Strip derivative suffixes
(`_512kb`, `_300k`, `_64kb`, `_vbr`, `_spectrogram`) before grouping or a single Prelinger film reads
as a playlist — verified the hard way.

New limits measured (and two mechanics worth knowing):
- **Advanced Search deep paging ends at the 10,000th result**; `page=10001` fails with
  `[DEEP_PAGING] Requested results would exceed the deep paging limit` **inside an HTTP 200 body** —
  a widget checking only `res.ok` will parse that error as data.
- **`scrape` `size` is 100–10,000, server-enforced**: `size=99` → `count '99' is too small (min
  count=100)`; `size=20000` → `max count=10000`. `total_only=true` returns 37 bytes — the cheap way
  to count a collection.
- IIIF now speaks **v3** (`manifest.json` 25.7 KB, 1.0 s, CORS ✅; `…{id}${leaf}/full/400,/0/default.jpg`
  57 KB in 1.8 s) and the official docs carry **no numeric rate limit** (the retired labs service said
  2,000/hour unauthenticated — treat that as the planning budget).
- `services/img` and `download/…/page/n{N}.jpg` have **no CORS**: fine as `<img>`, useless as data and
  canvas-tainting, so those widgets cannot offer PNG/SVG export.
- **`ia-fts.archive.org` did not resolve from a dev machine** — search-inside needs verification from
  Toolforge before anything is designed on it; TVNA caption search is **proxy-gated and returned
  non-JSON** to a plain client, so `iaTvNews` ranks last (GDELT TV is CORS-✅ but 11.5 s).
- Item sizes are hundreds of MB (346 MB for one TV `.mp4`) — media stays a URL, and is never proxied.

**Status:** open (item 1 done 2026-09-10; media family researched 2026-09-15). Source: IA API
research 2026-08-14, re-verified 2026-09-10, extended 2026-09-15.

## ISSUE-26 · Hashtag Stats widget — edit-a-thon / campaign tracking — **open**

**What:** integrate the Wikimedia Hashtags tool
(hashtags.wmcloud.org — WikipediaLibrary/hashtags, Django backend) as
a widget: given a hashtag (WPWP, 1lib1ref, #WikiForHumanRights…),
show who edited, on which wikis, and the daily edit activity. This is
the natural data source for the ROADMAP "Edit-a-thon Live" /
"Campaign Tracker" starter packs — hashtags are the de-facto campaign
tracking mechanism.

**Why:** campaigns track themselves via edit-summary hashtags; a widget
would surface an edit-a-thon's live pulse (top editors, top wikis,
edits/day) in the same board as its pageviews/gallery impact. The API
is public and open source; the shape maps directly onto existing
renderers.

**API facts (verified 2026-08-14):**
- `api/top_user_stats/?query=X` → `{usernames[], edits_per_user[]}`
  (top-10 editors; WPWP: Muhammad Abul-Futooh 76,288 edits). ✅ 200.
- `api/top_project_stats/?query=X` → `{projects[],
  edits_per_project[]}` (top-10 wikis; WLM2024: commons.wikimedia.org
  691). ⚠️ 502 on huge hashtags (WPWP) — backend flakiness.
- `api/time_stats/?query=X` → `{edits_array[], time_array[]}` (daily
  edit counts; WLM2024: 58 days). ✅ 200.
- `json/?query=X` and `csv/?query=X` — full edit exports; time out on
  huge hashtags (WPWP: connection reset) — NOT widget material.
- All endpoints accept optional `project`, `startdate`, `enddate`
  (YYYY-MM-DD) params (per /docs/).
- ⚠️ **NO CORS headers on any endpoint** (verified with Origin header)
  → fetch via the Toolforge `/api/proxy` (hatnote/SightGlass precedent)
  or the batch-endpoint pattern; `x-frame-options: DENY` on HTML pages
  (irrelevant for JSON).

**Proposed fix — one widget, three modes** (id `hashtagStats`, 🏷️):
input = hashtag (+ optional date range); fetch the three stats
endpoints in parallel via `/api/proxy` with a shared TTL cache
(10 min — the backend is single-node and flaky under heavy hashtags,
so cache hard and degrade gracefully to "stats unavailable — try a
smaller range" on 502/timeout). Render modes: **Top Editors**
(RankingCard — usernames → Special:Contributions links per ISSUE-22),
**Top Projects** (RankingCard — wiki → main page links), **Edits over
time** (TrendCard line — inherits ISSUE-12's axis fix).

Registry: `timeScope: 'range'` when dates are given, else 'point'
(lifetime) — constitution; ISSUE-21 provenance caveat ("edits with
the hashtag in the summary, per the Hashtags tool; backend may be
unavailable for very large hashtags").

**Status:** open. Source: Hashtags tool API analysis 2026-08-14.

## ISSUE-27 · XTools widget family: Article Statistics + Editor Stats — **open**

**What:** frame XTools' per-article / per-user stats as two widgets.
The canonical "maintained tool computes, we frame" play — XTools is
mature, and **CORS is origin-reflecting** (verified 2026-08-14: echoes
`Origin: https://wikibento.toolforge.org`) → **no proxy needed**,
direct browser fetch (same pattern as Lift Wing).

**API facts (verified 2026-08-14):**
- `https://xtools.wmcloud.org/api/page/articleinfo/{proj}/{page}` →
  `{watchers, pageviews, revisions, editors, anon_edits, minor_edits,
  creator, created_at, modified_at, secs_since_last_edit, assessment:
  {value, color, category, badge}, …}` — Einstein: watchers 4,070,
  pageviews 281,134, revisions 19,132, editors 6,353, assessment GA.
- `https://xtools.wmcloud.org/api/user/simple_editcount/{proj}/{user}` →
  `{live_edit_count, deleted_edit_count, user_groups,
  global_user_groups, creation_count, user_id}` — Fuzheado: live
  52,849 / deleted 1,582.

**Proposed fix (two widgets):**
1. **Article Statistics** (📊, S): article + project → StatCard/GLAMCard
   of watchers · revisions · editors · anon/minor edits · creator +
   assessment badge (link to the article; `secs_since_last_edit` as a
   freshness-adjacent detail). Subsumes part of the Article Vitals
   family with richer data (no other widget shows watchers or
   assessment).
2. **Editor Stats** (👤, S): user + project → live/deleted edit counts,
   groups, creation count; link to XTools page + contributions.
   Subsumes the WIDGET-IDEAS Tier-5 "contribution counter" with better
   data.

Both: `timeScope: 'point'`; ISSUE-21 provenance caveat ("per XTools,
updated live").

**Status:** open. Source: XTools API verification 2026-08-14.

## ISSUE-28 · Movement health widget family — **open**

**What:** the movement-level numbers — total traffic, active editors,
new registrations — which no current widget covers (everything today is
per-article or per-category). This is the working group's "prime
directive" question (the traffic/participation decline) as a widget.

**API facts (verified 2026-08-14, all CORS `*`):**
- `wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/{proj}/all-access/all-agents/monthly/{from}/{to}`
  → monthly total views (enwiki latest month: 9.59B).
- `…/metrics/editors/aggregate/{proj}/all-editor-types/content/all-activity-levels/monthly/{from}/{to}`
  → active editors per month (200 ✓).
- `…/metrics/registered-users/new/{proj}/monthly/{from}/{to}` → new
  registrations per month (200 ✓).

**Proposed fix:** ONE widget (id `movementHealth`, 🌍) with a metric
select (Total pageviews / Active editors / New registrations) +
language select, rendering the monthly series on a TrendCard (inherits
ISSUE-12's axis fix). One generic time-series fetcher sharing the
`scope.js` helpers; 2–36 month range. Declare `timeScope: 'range'`
(resolved dates in subtitle per the constitution).

**Status:** open. Source: REST Metrics verification 2026-08-14.

## ISSUE-29 · Lift Wing edit quality widget (goodfaith/damaging) — **open**

**What:** score revisions with the edit-quality ML models — the same
Lift Wing service already framed for ORES article quality.

**API facts (verified 2026-08-14):** `POST
https://api.wikimedia.org/service/lw/inference/v1/models/{model}:predict`
with `{rev_id}` — `enwiki-goodfaith` ✅ 200, `enwiki-damaging` ✅ 200
(origin-reflecting CORS, same as the quality widget). ⚠️
`enwiki-revertrisk` 404 under that name — the vandalism-dashboard
aspiration (revert-risk + recent-changes feed) stays in
WIDGET-IDEAS until the model name is found.

**Proposed fix (verified core only):** widget (id `editQuality`, 🛡️) —
article + revision picker (or the article's N most recent revisions via
`prop=revisions`) → per-revision goodfaith/damaging probability bars
(GRADE_COLORS-style rendering, QualityCard pattern); link each
revision to its diff. `timeScope: 'point'`; provenance caveat "ML
prediction, per Lift Wing".

**Status:** open. Source: Lift Wing probe 2026-08-14.

## ISSUE-30 · Earwig Copyvio check widget — **open** (low priority)

**What:** a "does this article contain copied text" card using Earwig's
copyvio detector.

**API facts (verified 2026-08-14):** `GET
https://copyvios.toolforge.org/api.json?action=search&project=wikipedia&lang=en&title={title}`
→ CORS `*` ✓; `{status: ok, meta: {time, queries, cached}, page,
best, sources}` (60 KB; the `best` field carries the top match).
⚠️ **Backend is slow: meta.time = 30.0s on an uncached check** — the
widget needs a 45s+ timeout and patience UX (loading note: "checking
against the web…").

**Proposed fix:** widget (id `copyvio`, 🔎): title + project → best
match percent + source + link to the full Earwig report; retry/
spinner states for the slow path; cache results (same title+project
within TTL) to avoid re-triggering the 30s computation.
`timeScope: 'point'`; provenance caveat "live check, slow — may take
30s".

**Status:** open (low priority — deprioritized per review; backend
latency is the constraint). Source: Earwig probe 2026-08-14.

## ISSUE-31 · Quarry saved-query power widget — **open**

**What:** the SQL analogue of the 🧠 SPARQL widget — display the output
of a saved Quarry query (run output JSON) as stat/bar/table. Rounds
out the power-widget story (SPARQL + SQL + PetScan + URL-extractor).

**API facts (per analysis 2026-08-14, one probe pending):**
`https://quarry.wmcloud.org/run/{run_id}/output/{n}/json` → saved run
outputs are public JSON snapshots (refreshed when the query is
re-run — not live SQL); ⚠️ no CORS → via the Toolforge `/api/proxy`
(SightGlass/hatnote precedent). Needs one probe: confirm a known run
id + the exact output path + JSON shape.

**Proposed fix:** widget (id `quarry`, 🧮): run id input → proxy fetch →
render with the SPARQL auto-detecting renderer logic (big number /
bars / table from the result shape). Reuse `fetchSparql`'s renderer
machinery with a different fetch. `timeScope: 'point'`; provenance
caveat "output of Quarry run {id}, as last executed".

**Status:** open (probe pending). Source: Quarry analysis 2026-08-14.

## ISSUE-32 · Add Widget catalog redesign: category two-pane + flat toggle — **done**

**What:** the Add Widget panel is a long linear list of 29 widgets, hard
to navigate. Redesign around **multiple discovery modes** with a
view toggle: a categorized **two-pane view** (category rail + items
pane) and the existing **flat list** view, plus type glyphs, an
intensity flag (warn before/while using heavy widgets), a type
filter, and a recently-used section.

**Why:** discoverability scales with structure — 29 rows is a wall;
7 categories is an outline. The registry `category` field is already a
ROADMAP Phase 2 item; the intensity flag answers "why is this slow?"
before adding AND while loading (and in the ⓘ panel after). Search
already exists (local name/description filter) — it becomes the third
discovery path, overriding both views when typing.

**Design (agreed 2026-08-15):**
- **Toggle** in the panel header (`☰ List | ▤ Categories`), persisted in
  localStorage (`wikibento-addview`); default `categories` for new
  users, honor the saved preference for returners.
- **Two-pane view**: left rail = category nav (icon + label + count),
  right = the selected category's items; first category selected by
  default; arrow-key navigation on the rail.
- **Flat view**: today's list, enhanced with type glyphs + intensity
  badges + a Recent section at top.
- **Search overrides both**: typing collapses any view into flat
  filtered results (name/description/dataSource match, highlighted);
  clearing restores the view.
- **Type filter** row (all / stat / trend / table / media / query /
  embed — derived from `renderer`), works in both views.
- **Intensity flag** (registry `intensity: low|medium|high`): catalog
  badge (⚡/🐢), an "Intensity" row in the ⓘ panel, and a contextual
  **loading message** for high widgets ("Walking the category tree —
  may take 10–30 s"). Honest classification: CIM widgets are
  precomputed (low); high = glamorgan, sparql, waybackGallery;
  medium = categorySize w/ sample, gallery, fileGallery, articleList,
  topPages expanded.
- **Recent section** (last-added widget types, localStorage, cap 6):
  top of flat view + a "Recent" pseudo-category at the top of the rail.

**Registry contract:** additive only — `category`, `intensity`,
optional `loadingHint`; no schema or dashboard-format changes.

**Status:** done (see commit). Implemented 2026-08-15: registry
`category` + `intensity` (+`loadingHint` for glamorgan/sparql/
waybackGallery) on all 29 widgets; AddWidgetPanel rebuilt with the
☰ List | ▤ Categories toggle (localStorage `wikibento-addview`,
default categories), two-pane rail (icon/label/count, Recent
pseudo-category), search overriding both views (name/description/
dataSource/category), type filter chips (stat/trend/table/media/
query/embed from renderer), type glyphs, intensity badges (`slow`
danger / `medium` amber, reusing the alpha badge style), Recent
section (localStorage `wikibento-recent-widgets`, cap 6). WidgetFrame:
contextual loading hint for high-intensity widgets + ⓘ Intensity row.
Verified live: 7 rails, counts 6/10/5/3/1/1/3, 29 flat, search
override, persistence, recent tracking.

## ISSUE-33 · Article Gallery: slideshow mode (one large image at a time) — **open**

**What:** a new `displayMode` for the `gallery` widget that shows ONE image
at a time at large size with its caption, auto-advancing on a configurable
delay (3 s / 5 s / 10 s / custom), cycling through all the article's images
so the card reads as live. User request 2026-08-15: "it shows the image and
caption in pretty large size… cycles through each of the images so it looks
like it's live."

**Why:** "active content" — the current grid (and list) render a static
archive of the article's images; a slideshow cycles attention through the
whole set and suits demo/PR boards, GLAM halls, and the kiosk direction
(ISSUE-18). Crucially the data is ALREADY fetched: `GalleryGridCard` gets
`rows[]` of `{title, thumbUrl, fileUrl, caption}` — a slideshow is a pure
renderer change, zero new API calls, freshness/temporal constitutions
untouched (`timeScope: 'point'` stays; ⏱ footer = data age, the animation
is client-side).

**Proposed fix (additive):**
- Registry (`src/widgets/index.js` `gallery` entry): `displayMode` options
  gain `'slideshow'`; `getRenderer` dispatches to a new
  `GallerySlideshowCard` (same `config.displayMode` switch as
  grid/list). New config fields: `slideDelay` (select: 3 s / 5 s / 10 s
  / custom number, default 5 s), `loop` (bool, default true). No schema
  change needed — config is `additionalProperties: true`
  (docs/dashboard.schema.json), consistent with `maxItems`, `minSize`.
- Card: large image (reuse `object-fit` from `imageFit`, letterboxed by
  default), caption below (existing `.gallery-caption` family), "N / M"
  counter + progress dots, click-through to the Commons file page
  (`fileUrl`, existing link pattern), prev/next arrows on hover,
  pause-on-hover.
- Implementation notes: `setInterval`-driven `current` index advanced in
  a `useEffect` keyed on `[rows, slideDelay, loop]` (reset timer on config
  change, clear on unmount); **respect `prefers-reduced-motion`** — render
  the first image statically, no auto-advance; a11y: alt from caption,
  `role="group"` + `aria-roledescription="slideshow"`, `aria-live` off
  (captions changing every few seconds would be screen-reader noise);
  empty rows → existing "No captioned images found" state.
- Layout note: a large-image mode wants a taller card — per-widget
  `defaultLayout` minH is global, not per-mode; either bump the widget's
  minH (costs grid space in grid/list modes) or accept user-driven resize.
  Decide during implementation; a `minH` bump is the simple option.
- Optional follow-on (NOT in scope): `fileGallery` shares both renderers
  via its own `getRenderer` — the slideshow can slot in there the same way
  later if wanted.

**Status:** open. Source: user request 2026-08-15.

## ISSUE-34 · Article Gallery: ticker mode (scrolling horizontal strip) — **open**

**What:** a `displayMode` where the article's images stream past in a
horizontal ticker — a strip of image + caption tiles scrolling at a
configured rate, wrapping seamlessly back to the front. Customizable:
how many images are in the stream, scroll speed, and whether it loops.
User request 2026-08-15: "a scrolling horizontal strip of the images with
their captions going by at a certain rate, and then it loops back again to
the front."

**Why:** stream-style consumption — a wall of moving images reads as live
activity (edit-a-thon walls, GLAM lobby displays, kiosk boards); it is the
"many at once" complement to ISSUE-33's "one at a time". Same zero-new-
fetch property: pure renderer over the already-fetched `rows[]`.

**Proposed fix (additive):**
- Registry: `displayMode` gains `'ticker'`; new `GalleryTickerCard`
  dispatched from `getRenderer`. Config fields: `tickerSpeed` (select
  slow/medium/fast, or a px/s number), `tickerItems` (max tiles rendered
  into the strip — note `maxItems` already caps the fetch pool; decide
  whether tickerItems caps the DISPLAYED pool or the strip is
  viewport-driven with fixed tile width ~220 px), `loop` (bool, default
  true). Additive config → no schema change.
- Seamless loop via the classic CSS marquee: render the row content
  TWICE (duplicated tiles), `@keyframes ticker { to { transform:
  translateX(-50%) } }`, `animation-duration` derived from the speed
  config — the duplicate-content trick gives an infinite gap-free loop
  with zero JS timing drift and no reflow at the wrap point.
- Controls: pause on hover (`animation-play-state: paused`); `loop:
  false` → `animation-iteration-count: 1` + `fill-mode: forwards` (strip
  ends at the last tile); **`prefers-reduced-motion` → static strip, no
  animation**; touch: tap pauses.
- Tiles reuse the `.gallery-item` / `.gallery-thumb` / `.gallery-caption`
  styling family (caption under each tile, click opens `fileUrl` in a new
  tab — existing pattern). Strip container `overflow: hidden` for narrow
  cards; `imageFit` 'cover' reads better in a ticker than 'contain'
  (letterboxed tiles look gappy) — consider forcing `cover` per-tile in
  ticker mode regardless of `imageFit`.
- Same constitution story as ISSUE-33: `timeScope: 'point'`, ⏱ footer
  shows data age, animation is client-side only.

**Status:** open. Source: user request 2026-08-15.

## ISSUE-35 · Bento-to-Bento navigation: link card + lightweight in-app loading — **open** (design)

**What:** navigate from one Bento (dashboard config) to another by clicking
a link — interlinked boards like website pages, instead of one gigantic
dashboard. User request 2026-08-15: "click on something and link to another
WikiBento session… interlinked pages almost like going from page to page."
Two parts: (1) a **Bento Links card** (static widget) rendering labeled
links to other configs; (2) **lightweight loading** of the target Bento
without a full page reload.

**Why:** starter packs (ROADMAP strategy: 7 JSON bentos — GLAM Footprint,
Newsroom Pulse, Edit-a-thon Live…) become one navigable suite rather than
separate links; kiosk mode (ISSUE-18) gets board-to-board rotation for
exhibition/presentation; boards stay focused instead of accumulating 29
widget types into one wall. Cost is near-zero: the URL is ALREADY the
source of truth for a Bento (`?config=` + `#/d/`, read at boot), and
`applyDashboard` (App.jsx:220) already swaps widgets/layout in place.

**Feasibility analysis (2026-08-15):** the machinery is ~90% present —
config loading (fetch → validate → apply) exists and is URL-driven
(`readConfigParam`/`readHashConfig`, src/lib/share.js:38-48); the static
widget pattern exists (markdown: `transform(null, config)`, no fetch);
`applyDashboard` is used by Import/Example today. Missing piece: a
URL-change listener + pushState click handler (a ~30-line mini-router).

**Proposed fix — two approaches:**
- **A. Full reload:** nav card renders plain `<a href="…/?config=…">` —
  works today with zero new machinery; cost: page reload, boot splash,
  all widgets re-fetch (TTL caches mitigate); plain links drop `?kiosk=1`
  unless the author adds it.
- **B. Lightweight SPA (recommended):** refactor the boot effect's load
  logic into a reusable `loadDashboardFromUrl()`; nav card click →
  `history.pushState(target)` + load (no reload, no splash — just
  `applyDashboard` after validated fetch); `popstate` listener makes
  browser back/forward walk Bento history like real pages (hash links
  fire `hashchange` natively; `?config=` pushState needs the manual
  load + popstate only). Render REAL `<a>` tags with a JS click handler
  so a handler failure falls back to Approach A (progressive
  enhancement); ctrl/cmd-click new-tab keeps working.
- **Bento Links card** (id `bentoLinks`, 🔗, static, category Content &
  Embeds, `timeScope: 'point'`): textarea of link rows (one per line,
  `Label|URL` or `Label|config-param`), rendered as labeled buttons;
  reuses the static pattern. In kiosk mode, compose the target URL
  preserving `?kiosk=1`.

**Caveats (accepted):** boards re-fetch their widgets on arrival (shared
TTL caches make repeat visits cheap); `wikibento-layout` localStorage is a
single key — per-board layout restore would need storage keyed by config
URL (possible follow-on); link targets have the same trust model as
existing `?config=` loading (validation rejects bad JSON).

**Status:** open (design). Source: user request 2026-08-15.

## ISSUE-36 · Multi-Bento packaging: manifest (index) vs inline suite — **open** (design)

**What:** can several Bento sessions live in a single JSON file, and should
they? User question 2026-08-15 — prompted by ISSUE-35 (Bento-to-Bento
navigation): packaging multiple boards for starter packs, kiosk rotation,
and distribution.

**Paradigm analysis (2026-08-15):** the model is "one URL → one validated
JSON → one Bento". Bundling does NOT break validation/loading if done as an
additive top-level `type` (v1 dashboards keep working; `validateDashboard`
untouched; `version: 1` was reserved for future migrations). It DOES break
the identity layer: session provenance (ISSUE-20), the single
`wikibento-layout` localStorage key, and Share links all become two-level
(`suite URL + board id`); `#/d/` hash embedding can't carry multi-board
files (~1,500-char cap). Two shapes with very different costs:

- **Manifest (recommended):** `{ version: 1, type: 'bento-manifest',
  bentos: [{ id, label, config: <url> }] }` — boards stay separate files;
  the manifest is an index. Each board still loads via the existing
  validated path (one extra hop). Serves: ISSUE-35 nav card as an auto-fill
  data source (`?suite=<url>`), kiosk rotation playlist, starter packs as
  one shareable on-wiki page (Action API parse path already handles it —
  same pattern as Commons:WikiPortraits/Bento-demo.json). Paradigm intact:
  every board remains addressable, validated, individually editable.
- **Inline suite (deferred):** `{ version: 1, type: 'bento-suite',
  bentos: [{ id, label, widgets, layout }] }` — true bundling. Real format
  change: per-board validation (current philosophy is all-or-nothing —
  needs a deliberate exception so one bad board doesn't kill the pack),
  two-level provenance/layout-storage, `bento=<id>` selector param.
  Pays ONLY for kiosk rotation with zero fetches and offline/single-artifact
  distribution. Hurts independent editing (one page = edit bottleneck),
  board reuse (no include mechanism — manifests exist precisely for that),
  and blast radius.

**Proposed fix:** ship the manifest first (~40-line validator + `type`
discriminator + nav-card `?suite=` source + kiosk playlist); spec the
inline suite as a follow-on only if single-fetch/offline demand appears.

**Status:** open (design). Source: user question 2026-08-15.

## ISSUE-37 · Category Size: visual display modes (gallery / slideshow / ticker of random images) — **open** (design)

**What:** given any Commons category, show a grid of `n` images randomly
sampled from the category, refreshing every `s` seconds (user-specified,
rate-limit-safe) — plus slideshow and filmstrip-ticker modes, mirroring the
Article Gallery request (ISSUE-33/34). User request 2026-08-15, with the
explicit question: new widget or a mode of the existing `categorySize`
widget (metrics display optional/off, purely visual)?

**Analysis (2026-08-15): EXTEND `categorySize` — do not create a new
widget.** Reasons: (1) the fetch is identical — `fetchRandomCategoryImages`
(src/widgets/dataSources.js:485) already returns n random category images
with thumbs in ONE request via `generator=search&gsrsort=random` +
inline `imageinfo` (re-randomizes per refresh); (2) the config surface is
identical — `category` + `wiki` + `sampleCount` + `refreshSeconds` are
already the widget's fields; (3) the `gallery` registry entry is the exact
precedent (`displayMode` → `getRenderer` dispatch, grid/list today);
(4) convergence: ISSUE-33/34's slideshow/ticker cards render `rows[]` of
`{title, thumbUrl, fileUrl, caption}` — the category sample already
produces `{title, url}`; adding `fileUrl` is one line (`iiprop: 'url|size'`
already fetches the original URL, the map just drops it), so the SAME
cards render both features with zero new renderer code. A new widget would
duplicate fetch/config/catalog and confuse the catalog.

**Rate-limit analysis ("safe s"):** the constitution already enforces
`refreshSeconds ≥ 30` (schema minimum + validator + freshness test) —
users cannot set below 30 s → worst case ~2 requests/min per widget
(categoryinfo + random query), ~120/h, trivially inside API etiquette
(batched ✓, paced ✓, UA ✓). Architecture keeps the "live" look client-side:
animation (slideshow/ticker) runs on a 1–5 s clock with ZERO API calls;
the API is hit only at the slow refreshSeconds cadence for a fresh random
sample. Two clocks: animation (free/fast) + re-sample (cheap/slow).

**Proposed fix:**
- `categorySize` gains `displayMode`: `metrics` (default — current
  StatCard + sample), `gallery` (grid of n — reuse GalleryGridCard +
  `imageFit`), `slideshow` (ISSUE-33 card: `slideDelay`, `loop`),
  `ticker` (ISSUE-34 card: `tickerSpeed`, `tickerItems`, `loop`).
- Raise `sampleCount` cap 24 → ~60 (one request handles it).
- Visual modes keep the count subtitle as provenance (ISSUE-21): "N files ·
  random sample of n" — categoryinfo is in the same fetch, zero extra cost.
- Add `fileUrl` to the sample rows (one line) so ISSUE-33/34 cards link
  through to the Commons file pages (click-through per ISSUE-22).
- `timeScope: 'point'` unchanged; ⏱ footer shows sample age honestly.
- Grid mode can ship immediately (GalleryGridCard exists); slideshow/ticker
  land with ISSUE-33/34's cards — implement together.

**Status:** open (design). Source: user request 2026-08-15.

## ISSUE-38 · Shared visual-mode renderers across gallery/categorySize (architecture note) — **open**

**What:** ISSUE-33/34 (Article Gallery slideshow/ticker) and ISSUE-37
(Category Size visual modes) describe the SAME display modes (grid /
slideshow / ticker) fed by different sources. Architecture decision: build
the renderers ONCE as shared components; widgets stay thin glue.

**Verified sharing precedent (2026-08-15):** `gallery` and `fileGallery`
ALREADY share `GalleryGridCard`/`GalleryListCard` — both entries dispatch
via `getRenderer` (src/widgets/index.js:640-641, 689-690) and WidgetFrame
resolves renderer NAMES to components in one switch (WidgetFrame.jsx:334-336).
The pattern: fetchers per-widget, renderers shared, registry entry = config
vocabulary + getRenderer + transform.

**Contract (canonical image row):** `rows[]` of `{title, thumbUrl, fileUrl,
caption}`. Sources: `fetchArticleGallery` (REST /page/media-list) conforms;
`fetchRandomCategoryImages` (dataSources.js:485) needs the one-line
`fileUrl` addition (`iiprop: 'url|size'` already fetches it; the map drops
it); fileGallery's batched imageinfo conforms.

**Implementation plan (binds ISSUE-33/34/37 — do as one slice):**
1. Build `GallerySlideshowCard` + `GalleryTickerCard` once in
   WidgetFrame.jsx (+ 2 switch cases) — all animation logic (interval
   advance, pause-on-hover, prefers-reduced-motion, CSS marquee) in one
   place; CSS in the shared `.gallery-*` family.
2. Each widget declares its modes: `gallery` (article), `fileGallery`
   (pasted list), `categorySize` (random sample, displayMode
   metrics|gallery|slideshow|ticker, sampleCount cap 24→60).
3. Share the visual-mode config FIELD DEFINITIONS via a constant
   (e.g. `VISUAL_MODE_FIELDS`) spread into each entry's configFields —
   declarations stay per-widget, definitions aren't copy-pasted.
4. Do NOT build a mega-component — name-dispatch is the abstraction;
   keeps the registry declarative (`renderer: 'GalleryTickerCard'`).
5. Per-widget transforms keep source-specific provenance subtitles
   (ISSUE-21): "N files · random sample of n" vs "32 images · filtered".

**Status:** open (design) — docs updated 2026-08-15: ARCHITECTURE.md gains a
"Shared Renderers" section + canonical image-row contract row;
WIDGET-DEVELOPMENT.md gains a "Sharing renderers across widgets" section
and marks GalleryGridCard/ListCard as shared with fileGallery. Source:
architecture analysis 2026-08-15.

## ISSUE-39 · Media player widget: video/audio embed + jukebox playlist mode — **done (c9f7bbc)**

**What:** a widget that embeds a Commons video (or audio) file with a native
HTML5 player, plus a **jukebox mode**: a playlist of files (one per line —
the established list-source pattern) that plays through sequentially with
loop/shuffle, "now playing" title, and prev/next/play-pause controls. User
request 2026-08-15.

**Feasibility (verified 2026-08-15, live probe):** `prop=videoinfo&viprop=
derivatives` returns the original + transcoded derivatives in ONE batched
call (50 titles/request): e.g. File:FA-18 Automated Aerial Refueling.ogv →
vp9+opus WebM transcodes at 320×240/640×480, a video/quicktime iOS
derivative, duration + size. Derivative URLs are direct and hotlinkable
(`…/transcoded/<hash>/<file>/<file>.480p.webm`). Native `<video>` plays VP9
WebM in all modern browsers — NO vendored player (unlike pannellum);
poster via the video keyframe thumb URL scheme. Audio (.ogg/.opus/.flac)
plays identically via `<audio>` — "jukebox" covers both media types.

**Zero-code path that exists today:** the `wikiPage` widget can embed
`File:….webm` — Commons file pages render the TimedMediaHandler player
in-iframe (no X-Frame-Options). Cost: whole file page, not a clean player.

**Proposed fix (one widget, id `mediaPlayer` or `jukebox`, 🎬):**
- Input: `files` textarea (one File: per line — fileGallery/articleList
  pattern); single file = plain embed, multiple = jukebox.
- Fetch: ONE batched `videoinfo` (derivatives|duration|url) per refresh —
  the playlist's whole metadata in one request; ⏱ footer = data age
  (two-clock architecture: playback is client-side, no API).
- Renderer `MediaPlayerCard`: `<video controls>` (or `<audio>` per
  `mediaType: video|audio|auto`), best DONE VP9 derivative per track
  (quality config 240/480/720/1080 auto; fall back to original; optional
  iOS quicktime pick), now-playing title + position "3/12", prev/next,
  play-pause, playlist loop + shuffle toggles, per-file link to the
  Commons page (ISSUE-22 actionability).
- Registry: category Files & Media, `timeScope: 'point'` (static after
  fetch — derivatives don't change mid-session), refreshSeconds ≥ 30
  (constitution).
- Caveats: autoplay-with-sound needs one user gesture (browser policy —
  fine in kiosk: presenter clicks once); Commons format policy = WebM/OGG
  only (MP4 blocked, patents) so VP9 WebM is the universal default;
  transcode status can be IN_PROGRESS/ERROR → pick best DONE, degrade
  gracefully; provenance subtitle "N files · playlist".

**Fixed 2026-08-16 (c9f7bbc):** widget `mediaPlayer` (🎬, Files & Media)
implemented per the spec above — `fetchMediaPlaylist` (batched
`videoinfo`, ≤4,500-char chunks, `?utm_source` stripped, per-track
video/audio detection, missing-file count) + `MediaPlayerCard` (native
`<video>`/`<audio>` per track — no player library; `pickPlayUrl` prefers
transcoded VP9 WebM by height-based quality, auto = largest ≤1080p,
original as fallback; `onended`→next, loop wrap, Fisher-Yates shuffle,
▶ Start pill for browser autoplay policy, position + duration + Commons
links). Config: files list, mediaType auto/video/audio, quality
auto/240/480/720/1080, loopPlaylist, shuffle, autoplay. Schema enum +
full-catalog dashboard.json (30 widgets). Verified live: FA-18 480p VP9
pick, EN-Abbe audio (original Ogg), mixed next/prev, loop wrap, shuffle

**Extended 2026-09-01:** `showDescription` (⚙, default ON) — `videoinfo`
gains `extmetadata` and each track shows its Commons `ImageDescription`
(striped HTML, clamped 280 chars) + `Artist · LicenseShortName` credit line
under the now-playing title (`.media-desc`); ⚠ `iiextmetadatafilter` is
IGNORED by videoinfo (full metadata set always returns — verified live).
Plus `annotation` (textarea, Markdown via the zero-dep renderer, escaped,
no external images) rendered under the controls — user-written caption for
the board. Verified live: Dance reedit 2.webm → "Dance couple performing
the cha cha." / Wpzhiyilee · CC BY-SA 3.0.
reorder, autoplay unlock, kiosk-compatible. **DEPLOYED to Toolforge
2026-08-16** (bundle index-DdJRNUuD.js) — see README ✅ bullet.

**Status:** done. Source: user request 2026-08-15; API probe
verified.

## ISSUE-40 · Parameterized Bento links (the HyperTalk "go to card" revival) — **open** (design)

**What:** the HyperCard-completing capability for Bento-to-Bento navigation
(ISSUE-35): a link that opens another Bento **pre-configured with context**
from the originating card — `?config=A&bento=overview&article=Albert_Einstein`
or `#/d/<base64>&bento=…&article=…`. From docs/PHILOSOPHY.md §6 (the
HyperCard lineage analysis, 2026-08-16): "navigation becomes
message-passing between cards — the actual scripting revival."

**Why:** today, Bento-to-Bento links (ISSUE-35) are static — they load a
board, not a board *about something*. HyperCard's `go to card X` could
carry state; without the equivalent, the canvas remains a poster wall
rather than a working hypermedia system. With parameters, a "Bento Links"
card can say "here's this article's quality" → opens a board focused on
that article; a GLAM overview board can deep-link every category tile to a
category-focused board.

**Proposed fix (additive, no format break):**
- A `bento` param (board selector for manifest files, ISSUE-36) + free-form
  context params (`article=`, `category=`, `filename=`, …).
- Boot (and the ISSUE-35 SPA loader) parse the param set; each widget whose
  config key matches a provided param gets it **overlaid onto its config**
  at load time (`widget.config[key] ??= contextParam`) — then fetches
  normally. No schema change; unknown context params are ignored.
- The Bento Links card (ISSUE-35) gains an optional per-link "context"
  field (`Label|URL|article=Einstein`), and any widget's ⓘ panel could
  offer "Open this subject in a new Bento" — the ISSUE-22 actionability
  audit's deep-link form.
- Provenance: the ⓘ Session section (ISSUE-20) must show the context
  params that were applied, so "why is this board about Einstein" is
  answerable.

**Status:** open (design). Source: HyperCard lineage analysis
2026-08-16 (docs/PHILOSOPHY.md).

## ISSUE-41 · Board templating: Bento-level parameters that ripple through widgets — **open** (design)

> **Status note (2026-09-09):** the controls-surface half shipped — a Board
> Controls card can be scoped to a subset of params (ISSUE-59). Per-click
> *target* scoping (which widgets a param change affects) remains design.

**What:** one institution Bento (Met: category metrics, photo gallery, CIM
trend, top files…) becomes a Smithsonian or Cleveland Bento by changing a
single value. Board-level template variables referenced by widget configs,
with a menu/control to switch the value and have the change ripple through
every widget. User direction 2026-08-16: "pull down a menu and select a new
institution, and that change ripples through all the widgets… part of our
major architecture."

**Why:** it is the declarative scripting layer of the config-as-data thesis
(PHILOSOPHY.md — HyperTalk by other means): board params = HyperCard
*fields*; widget configs = the *scripts* that read them. It multiplies the
value of every existing widget (one GLAM Bento × N institutions instead of
N Bentos), powers the starter-pack strategy (templates + instantiations),
and makes the map family (WIDGET-IDEAS.md Mapping) — "photo map of
{{category}}" — instantly re-aimable. This is the missing third of the
parameter story, unifying with ISSUE-40 (URL context params) and ISSUE-36
(manifests instantiate templates with per-entry param values).

**Design (additive, no format break):**
- **Config v1 gains an optional top-level `params` block:**
  `{ "version": 1, "params": { "institution": "Metropolitan Museum of Art", "year": 2024 }, "widgets": [...], "layout": [...] }`.
- **Placeholders:** widget config values may contain `{{name}}` (any
  string field: article, category, filename, domain…). Resolution happens
  ONCE, before `validateDashboard` runs — the validator sees resolved
  values (so select enums and number fields validate correctly); unknown
  names are left literal and warn. Markdown/static widgets resolve too —
  a collision between markdown text and a declared param is the author's
  escape hatch: don't declare the name.
- **Ripple:** params live in App state; changing one re-resolves every
  widget config and bumps `reloadKey` (existing mechanism) → all affected
  widgets re-fetch. A widget with a hard-coded value (no placeholder) is
  deliberately exempt — the freeze/override escape hatch.
- **Three entry points, one system:**
  1. `params` block (authored in the JSON),
  2. a **Board Controls card** (new static widget, id `boardControls` —
     renders a select per param, like a config panel on the board itself;
     the HyperCard "field"),
  3. URL context params (ISSUE-40: `?config=…&institution=Smithsonian` —
     overlaid at boot, same resolution path).
- **Manifest synergy (ISSUE-36):** a manifest entry can carry param
  overrides per board — one template Bento instantiated for Met /
  Smithsonian / Cleveland from a single file.
- **Provenance (ISSUE-20/21):** the ⓘ Session section shows the params
  applied + their source (authored / control / URL); per-widget ⓘ shows
  resolved values — "this board is a template instantiated with
  institution=Smithsonian" must be answerable.
- **Constitutions unaffected:** resolution is pre-fetch; freshness ⏱ and
  temporal scope operate on resolved configs as today.
- **Effort:** S–M core (a `resolveParams(config, params)` helper + App
  state + the Board Controls card); no schema break (params is additive;
  placeholders are plain strings to every existing validator path).

**Status:** open (design). Source: user direction 2026-08-16 (major
architecture); unifies ISSUE-36 + ISSUE-40.

## ISSUE-42 · Five content primitives: 1-or-n widgets + per-family display modes — **open** (design)

**What:** the five basic content types — **wiki page, image, audio, video, 3D model** —
each get ONE canonical basic widget that handles **1..n** items from a list (manual
or generated), with a family-appropriate display-mode selector. User direction
2026-08-16: "the basic widget can handle showing 1, 2… or an arbitrary n of them
given a manual list (or other generated list) of identifiers — be it en:Foo or a
File: specifying a Commons item."

**Why:** consistency (one mental model: *give it a list, pick a display*), the
list-source vocabulary (WIDGET-IDEAS §List Sources) applies to all five, and the
catalog stays 5 primitives × modes instead of proliferating widget types.
Supported by the research: Freeboard's datasource/widget split (one source, many
renderings), Are.na's blocks, OpenDoc's parts (TOOL-LANDSCAPE-SYNTHESIS §4), and
ISSUE-38's shared-renderer architecture.

**The audit (2026-08-16):**

| Primitive | Single (1) | Many (n) | Modes today | Verdict |
|---|---|---|---|---|
| Wiki page | `wikiPage` (iframe, mobile, section anchor) | `articleList` (rows) | single: iframe; many: list only | ✅ covered; **pager mode missing** |
| Image | ❌ no plain single-image widget | `gallery` (article), `fileGallery` (manual list), `cimTopFiles` | grid/list (shared `GalleryGridCard`/`GalleryListCard`); slideshow/ticker = ISSUE-33/34 | ⚠️ single mode missing |
| Audio | `mediaPlayer` single | `mediaPlayer` jukebox | player (correct for audio) | ✅ |
| Video | `mediaPlayer` single | `mediaPlayer` jukebox + quality | player; optional video-thumb grid later | ✅ |
| 3D model | ❌ nothing | ❌ nothing | — | ❌ the gap (ISSUE-43) |

**Design:**
1. **Arity and modes are CONFIG, not widget types** — the registry pattern (config
   vocabulary + `getRenderer` dispatch + shared renderer components). No
   mega-widget; name-dispatch is the abstraction (ISSUE-38).
2. **Per-family mode vocabularies** (a single universal `displayMode` enum is
   wrong — players are not tiles):
   - *Display family* (image, 3D): `single / list / grid / slideshow / ticker`
   - *Player family* (audio, video): `single / playlist` (jukebox); later optional video-thumb grid
   - *Page*: `single iframe / pager (prev–next) / list`
3. **Canonical row contracts per family** (extends ISSUE-38's image row
   `{title, thumbUrl, fileUrl, caption}`):
   - image: `{title, thumbUrl, fileUrl, caption}`
   - page: `{title, url, project}`
   - audio/video: `{title, fileUrl, type: audio|video, thumbUrl?}`
   - 3D: `{title, fileUrl, thumbUrl?}` (thumb = `w/thumb.php?f=…&w=…`, see ISSUE-43)
4. **Unified item vocabulary** — a shared `items` config field (one per line;
   `File:` prefix normalization per gotcha #12) with a future "list source" slot
   for generated lists (PagePile/PSID/SPARQL output/ToolFlow/category members —
   the direction ToolFlow validated). Manual and generated lists become two
   fillers of the same field; every primitive inherits both.
5. **Provenance stays per-source** (ISSUE-21): subtitles survive unification
   ("3 files · 1 not found" vs "32 images · filtered").
6. **Catalog:** a **Primitives** section pointing at the five canonical widgets
   (no duplicates) — conceptual clarity without widget duplication.

**Status:** open (design). Source: user direction 2026-08-16; builds on ISSUE-33/34/37/38.

## ISSUE-43 · 3D Model widget (`model3D`) — the missing fifth primitive — **open** (design)

**What:** display Commons STL models — a single interactive viewer, or a list/grid
of models. The gap in the five-primitive audit (ISSUE-42).

**Verified feasibility (2026-08-16, curl-tested):**
- **Raw STL fetch works with CORS:** `upload.wikimedia.org` serves
  File:Stanford_Bunny.stl (5.6 MB binary, `Content-Type: application/sla`) with
  `Access-Control-Allow-Origin: *` → browser `fetch()` + three.js `STLLoader`
  parses it, **zero backend**. `api.wikimedia.org/core/v1/commons/file/…` also
  CORS-enabled.
- **Thumbnails:** thumbor's standard thumb path 400s for STL, but
  `https://commons.wikimedia.org/w/thumb.php?f=Stanford_Bunny.stl&w=400` returns
  a real rendered PNG (verified 400×300, model rendered). No CORS needed for
  `<img>`. ⚠️ **Gotcha: use `w/thumb.php`, NOT the `upload.wikimedia.org/thumb/`
  pattern.**
- **In-ecosystem precedent:** MediaWiki's own Extension:3D renders a three.js
  viewer on Commons file pages.
- **Scope: STL only** (binary + ASCII) — Commons policy accepts only STL for 3D
  (no glTF/GLB).

**Interaction dynamics — why 3D differs from image/video (the design crux):**

| Aspect | Image / video | 3D model |
|---|---|---|
| Camera | fixed, or playback timeline | **user-controlled**: orbit/pan/zoom (OrbitControls); touch: 1-finger rotate, 2-finger pinch-zoom/pan |
| Loading | thumbnails / streaming | **full-file fetch, MBs** (Bunny 5.6 MB; some models 10–50 MB) → progress UI, size cap, byte size in subtitle |
| Render | 2D paint | **WebGL**: context loss handling, devicePixelRatio, resize via ResizeObserver (panorama precedent) |
| Appearance | inherent to the file | **STL has no colors/textures** → material + lighting choices: shaded neutral material (Commons-viewer style), smooth/flat shading toggle, wireframe overlay, background |
| Orientation | n/a | model-bounds fitting (normalize), **reset view**, auto-rotate (kiosk-friendly), optional ground grid |
| Semantics | caption | units are **undefined** in STL — scale is arbitrary; don't promise dimensions |

**Config fields (draft):**
- `files` — textarea, one `File:` per line (1..n; the ISSUE-42 items vocabulary)
- `displayMode` — `viewer` (default) / `grid` / `list`
- `autoRotate` (bool, default true — demo/kiosk-friendly; pauses on pointer down)
- `shading` — `smooth | flat` (computed normals; default smooth)
- `wireframe` (bool, default false)
- `showStats` (bool, default false — vertices/triangles + file size in subtitle)
- `maxBytes` (cap, default 25 MB → friendly error + link to the Commons file page)
- Constitutions: `timeScope: 'point'`, `refreshSeconds ≥ 30` (file fetch); ⏱
  footer = fetch time (static model — no upstream data age)

**Viewer interaction spec:** drag = orbit; wheel/pinch = zoom; right-drag or
shift-drag = pan; double-click = reset view; auto-rotate toggle; fullscreen
button; loading progress with MB counter; **WebGL-unavailable fallback** (message
+ link to the Commons file page); >2M-triangle models → warn (STL parse +
render hitch; suggest the file page for huge models).

**defaultLayout:** w4 h3, min 3×2 (the panorama precedent — registry
`defaultLayout`).

**Renderer structure:** vendored three.js **subset** (core + STLLoader +
OrbitControls) as a separate lazy asset — the Pannellum pattern
(`src/vendor/pannellum.js` + `pannellumLoader.js`; separate dist chunk). three.js
min is ~600 KB — tree-shake or use a prebuilt module build; **must not** grow the
main bundle. Parse in a Web Worker for large files (STLLoader is synchronous —
worker or progress overlay, decide at implementation). Dispose geometries on
unmount/config change (panorama precedent).

**Grid/list modes:** `thumbUrl = https://commons.wikimedia.org/w/thumb.php?f=<urlencoded>&w=400`;
click → viewer (in-widget swap to that model, or enlarge); missing thumb →
generic 3D-cube glyph + title fallback.

**Known-good test assets:** File:Stanford_Bunny.stl (verified end-to-end);
confirm a second large model during implementation.

**Status:** open (design). Source: user direction 2026-08-16 + primitive audit
(ISSUE-42) + CORS/thumb verification 2026-08-16.

## ISSUE-44 · "Ask" — natural-language widget advisor (intent-first catalog) — **open** (brainstorm → design)

**What:** an intent-first interface that upgrades (not replaces) the
browse-the-catalog flow: the user types what they want ("show a random sampling
of images from a category"), and an LLM focused on WikiBento's capabilities
returns a **menu of concrete options** — widget recommendations with pre-filled
configs, ready to add. User direction 2026-08-16: "in the age of artificial
intelligence, [browse-and-trial-error] is old fashioned… type in what they want
to do, and an LLM that is very, very much focused on the capabilities of
WikiBento… could provide a menu of options… a very low friction way of turning
idea into implementation."

**Why:** the catalog model assumes the user knows the taxonomy; intent-first
inverts it — the user knows *what they want*, not *which widget*. It is also the
productized continuation of PHILOSOPHY §9's closing evidence (prose → working
jukebox widget in a day) and PHILOSOPHY §7 gap 3 (AI-directed registry editing).

**Precedents (verified 2026-08-16) — the mechanism exists; the configuration is open:**
- **Grafana Assistant** (Grafana Cloud) — NL → dashboards/panels; "describe what
  you want and the dashboard renders live beside the conversation"
- **Kibana AI Chat** (GA in Elastic 9.5) — NL → ES|QL-backed dashboards,
  "prompt to dashboard in under a minute"
- **Power BI Copilot** — create report pages from NL prompts
- **Tableau Agent / Einstein Copilot for Tableau** — NL visual analysis
- **Databox AI analyst** (from TOOL-LANDSCAPE research): "an AI 'generate a
  widget config' assistant is feasible for WikiBento"
- General pattern: app-builder copilots (v0, Retool AI); the AI era as
  "HyperCard's promise returning" (PHILOSOPHY §8: Wong 2025, TidBITS 2026-08-14)

**What is NOT done anywhere (our opening):** an intent → recommendation →
**instantiation** loop for the *Wikimedia data space* over an open config-as-data
substrate — the recommended widget arrives pre-configured on the board (not a
screenshot or a suggestion), and the same loop can later assemble multi-widget
boards from one sentence.

**Design sketch:**
1. **Capability manifest** — serialize the registry (id, name, description,
   dataSource, category, type, configFields, modes) as a machine-readable
   prompt context (build-time JSON export or runtime; the registry is already
   declarative — this is nearly free).
2. **Prompt contract** — system prompt: "You are the WikiBento widget advisor.
   Recommend widget(s) for the user's intent. Return JSON:
   `[{widgetType, config, displayMode, reason}]`" + few-shot examples (the two
   user examples: random category sampling → categorySize / fileGallery;
   "how often is an image used in a category" → fileUsage / GLAM / CIM family).
3. **UI** — an "Ask" panel (chat-style) alongside the Add Widget catalog;
   recommendations render as cards with a config preview + "Add to board";
   follow-ups refine ("make it a slideshow"). Output must pass
   `validateDashboard()` before display — **never offer an invalid config**
   (a constitution for the assistant).
4. **Two tiers** — (a) local intent/keyword matching over the manifest
   (works offline, no key; upgrades the existing AddWidgetPanel search —
   cheap and immediately useful); (b) LLM tier for genuine NL + composition
   (multi-widget boards).
5. **Transport — verified: a Toolforge same-origin relay (`/api/ask`)** — tested
   2026-08-16 against the live endpoint: `api.wikimedia.org`'s chat-completions
   route sends **no CORS headers** (browser fetch blocked; confirmed on the
   response and preflight), so the Ask tier MUST run through the Toolforge
   server — which is also exactly right for rate limits: anonymous access is
   **100 req/h per client, shared across models**, while Toolforge-originated
   traffic is effectively unlimited (the `/api/proxy` pattern). **No API key
   at all, and the API persists nothing** (no logging, retention, or
   training) — prompts stay inside Wikimedia infrastructure; better for
   privacy than any BYO-key plan.
6. **Evaluation as a constitution** — an intent→widget test suite (N sample
   intents → expected widget ids) keeps the assistant honest as the catalog
   grows; same enforcement spirit as the freshness/scope constitutions.

**Phased scope:**
1. Manifest export + "smart search" upgrade of AddWidgetPanel (intent box,
   local matching) — S
2. LLM recommendation tier (Ask panel; single-widget recommendations with
   pre-filled configs) — M
3. Multi-widget board assembly ("a GLAM overview for the Met") + refinement
   loop — M/L
4. (Long-term, PHILOSOPHY §7 gap 3) intent → NEW widget via registry editing — XL

**Abuse prevention & access control for the `/api/ask` relay (design, 2026-08-16):**
the upstream is free and keyless — the threat is not cost but (a) others
embedding the relay as their free LLM backend, (b) hammering degrading the
service, (c) prompt-injection to use it as a general LLM. Layered defense:
1. **Narrow function, not a proxy** — contract is `POST /api/ask {prompt}`;
   the server owns the system prompt (manifest embedded server-side), fixes
   model + params (max_tokens cap), strips `<think>`, validates widget ids.
   No arbitrary system prompts / model choice / message arrays → useless as
   a general LLM API (the structural defense).
2. **Origin/Referer allowlist** — wikibento.toolforge.org + localhost (soft
   gate; spoofable, not a boundary).
3. **Per-IP rate limits + global cap** — in-memory sliding windows (single
   k8s pod): ~5 req/min + ~100 req/day per IP (429 + Retry-After); global
   tripwire ~1,000 req/h → 503 "Ask is busy".
4. **Session handshake** — `GET /api/ask/session` → short-lived token
   `HMAC(serverSecret, ip+expiry)` (30 min, IP-bound); Ask must present it.
   A static secret in the SPA bundle is NOT secret — this is a *control*
   token (per-session limits, expiry, revocation via secret rotation, kill
   switch `ASK_ENABLED`), not a privacy boundary.
5. **Request caps** — prompt ≤ ~1,000 chars, output ≤ ~600 tokens.
6. **Cache** — hash(prompt + manifestVersion), 10-min TTL.
7. **Observability (privacy-respecting)** — hashed-IP buckets, prompt
   *length*, outcome; 24-h in-memory retention; **never log prompt content**.
8. **Injection hygiene** — user text only in the `user` message, never
   concatenated into the system prompt; server-side id validation.
9. **Escalation ladder** — if abused: require Wikimedia OAuth for Ask, or
   drop to local-only smart search.

**Verified feasibility (2026-08-16, live curl tests against the Wikimania 2026
LiftWing LLM endpoints):**
- **Endpoints:** OpenAI-compatible chat completions, no key:
  `https://api.wikimedia.org/service/lw/inference/v1/models/llm-qwen36-27b/openai/v1/chat/completions`
  (27B, 32K ctx) and `llm-qwen3-14b` (14B, 16K ctx). Streaming supported.
- **Context math:** the 30-widget manifest sent to the model (trimmed
  catalog with configFields, see "Payload contract" below) measures 15,764
  chars ≈ 4.1–5.3K tokens; the full system prompt (catalog + rules +
  examples) is 18,549 chars ≈ 4.5–6K tokens — fits 32K (qwen36-27b) with
  ~26K headroom; the 16K fallback (qwen3-14b) has room for one more ~2×
  enrichment but not unbounded growth (keep the enriched system ≤ ~13K,
  or ship a compact catalog variant on fallback). (A bare
  id/name/description-only variant measures 531 tokens — design-time
  estimate only, never shipped.)
- **JSON reliability without tool calling: SOLVED — `response_format:
  {"type": "json_object"}` is supported** (vLLM enforces valid JSON). Two
  realistic sample intents returned clean contract JSON (no `<think>`, no
  fences): "random sampling of images from a category" → `categorySize` with
  pre-filled config + correct reason; "how often is an image used in a
  category" → 3-option menu (`fileUsage` / `sparql` with a plausible query /
  `cimFileSpotlight` with an honest caveat).
- **⚠️ Hallucinated ids happen:** a third test returned `video_player` (not
  the real `mediaPlayer`) — the relay MUST validate `widgetType` against the
  manifest and drop/repair unknown ids (re-prompt once or omit with a note).
- **Latency:** ~2–4 s end-to-end for small responses (shared service, slower
  under load; streaming mitigates). No SLA — experimental; the local
  smart-search tier + error states are the graceful degradation.
- **CORS: absent** → relay-only architecture (see Transport).

**Payload contract (as shipped, 2026-08-16):** the exact prompt the relay
sends is server-owned in `deploy/server.js` (`ASK_SYSTEM` + `ASK_RULES`) and
never reconstructed client-side.
1. **Trim mapping** — `scripts/generate-manifest.mjs` extracts every widget
   from `src/widgets/index.js`; the LLM sees ONLY 8 fields per widget:
   `{id, name, description, dataSource, category, type, configFields,
   defaults}`. Dropped: `icon`, `intensity`, `experimental` (and the
   manifest-level `version`/`generatedAt`). `configFields` carries REAL
   select options so the model can only pick valid values.
2. **System prompt layout** — preamble (role) → `CATALOG` (the trimmed JSON
   array) → `RULES` (exact ids, 1–3 options, intent matching
   category-inputs vs file-inputs, never invent subjects) → `VALUE RULES`
   (Category: stripped / File: prefixed / bare domains / https URLs / plain
   numbers) → `OUTPUT SCHEMA` → 2 few-shot `EXAMPLES`.
3. **User message** — the raw prompt only, ≤ 1,000 chars; never
   concatenated into the system prompt (injection hygiene).
4. **Params** — `response_format: {type: "json_object"}`, `temperature 0.3`,
   `max_tokens 700`, 45 s timeout, model `llm-qwen36-27b` (fallback
   `llm-qwen3-14b`); `<think>…</think>` stripped before parse.
5. **Cache** — `sha(prompt + manifest.version)` key, 10-min TTL.
6. **Sanitizer** — model output must survive `validateOptions()` →
   `normalizeConfig()` (tests/ask-validation.test.mjs) before it reaches
   the UI; hallucinated ids and invalid values are dropped.

**Intent→widget benchmark suite (constitution, design item 6 — implemented
2026-08-16):** `tests/intent-fixtures.mjs` holds the ground-truth catalog of
human prompts → expected `{widgetType, config}`; `tests/intent-benchmark-
test.mjs` (wired into `npm test`) hard-asserts fixture schema validity and
scores the LOCAL tier (askLocal) with a rising floor; `scripts/benchmark-
ask.mjs` scores the live LLM tier against the same fixtures (exact top-1 /
top-3 widget match, config-key presence, subject-token containment). The
fixtures double as the few-shot pool for prompt enrichment. **Fixture
interviewer (2026-08-16):** `scripts/interview-fixtures.mjs` — interactive
widget-card → phrase → subject → validated-append flow (and `--add` for
agents); `--list` shows coverage. Full how-to, scoring semantics, ground
rules, and findings: docs/INTENT-BENCHMARK.md.

**Status:** Phase 1 (manifest + local smart search + /api/ask ML tier + Ask
panel) **DONE and DEPLOYED 2026-08-16** (commit 5378088, verified live);
intent→widget benchmark suite added 2026-08-16 (fixtures + offline
scorecard + live scorer).
Phases 2-4 open: multi-widget board assembly, refinement loop, and
(long-term) intent → new widget via registry editing.
Source: user direction 2026-08-16; precedents verified 2026-08-16
(Grafana/Kibana/Power BI/Tableau docs); LiftWing LLM endpoints live-tested
2026-08-16 (wikitech Machine_Learning/LiftWing/Large_Language_Models/
Wikimania_2026).
**Facility record + caveat (experimental, no SLA, may be removed):**
docs/DATA-SOURCES.md §23.

## ISSUE-45 · GLAM widget silently returns zero usage — anonymous `titles` cap (50) — **done 2026-08-16**

**Reported:** GLAM Category Usage for "Images from XBio" (depth 1, 2026-07)
showed 518 files but **0 used / 0 pages / 0 views**, while
glamtools.toolforge.org returned 518 files · 38 used · 40 pages · 2 wikis ·
110,092 views.

**Root cause (verified live):** the Action API caps the `titles` parameter
at **50 values for anonymous clients** (`toomanyvalues`, lowlimit 50 /
highlimit 500 for bots — confirmed for `prop=globalusage` AND
`prop=imageinfo`). `fetchBatchedUsage` chunked by **encoded length only**
(4,500 chars), so short filenames packed 71–75 titles per chunk and EVERY
query failed. The failure is **silent**: the response carries
`{"batchcomplete":""}` with no `query.pages` — no error key, so the widget
parsed it as "no usage" and reported zeros. Filename-length-dependent: long
names (WLM-style) stayed ≤50/chunk and worked, which is why earlier
verifications passed.

**Fix:** chunk by **min(count 50, encoded length 4,500)** in the three
length-based multi-title batchers — `fetchBatchedUsage` (GLAM),
`fetchMediaPlaylist` (mediaPlayer), `fetchCommonsGallery` (file gallery).
The by-count-50 sliders (pageimages|extracts enrichment, imageinfo in
articleList/topPages) were already safe.

**Verified:** widget now matches GLAMorgan exactly on every metric —
518/38/38/40/2/110,092. Docs updated: HANDOFF gotcha #4, DATA-SOURCES
§GLAM + §imageinfo + §videoinfo.

## ISSUE-46 · GLAM widget: delegate tree+usage to PetScan via capped `/api/petscan` relay — **done 2026-08-17** (branch `glam-petscan-relay`)

**Decision (2026-08-17):** adopt architecture B — replace the self-walk +
globalusage lookup with PetScan (`giu`, exact `ns`) called through a thin
stateless relay on our Toolforge server that enforces the file budget
(PetScan ignores `max` in quick-intersection mode — 39 MB responses) and
caps response size. Pageviews stay client-side via the WMF API (stable,
CORS); glamtools' `pageviews.php` is explicitly NOT adopted (same-origin
only, unversioned). Full analysis + revisit triggers:
docs/GLAMORGAN-WIDGET.md §Architecture Decision (2026-08-17).

**Why:** ISSUE-45 showed the self-implementation's usage lookup carries a
bug class (50-title anonymous cap, `gulimit` truncation, ns heuristic) that
PetScan's exact-ns `giu` eliminates; parity with glamtools becomes
structural instead of heuristic.

**Implemented 2026-08-17 (all scope items, verified):**
1. `deploy/server.js`: `/api/petscan` — stateless GET relay (budget +
   response-size caps, 60 s timeout, WM UA, per-IP rate limits); reports
   `{source, files, usage, capped, truncated}`; `wikiDbToDomain` normalizes
   PetScan DB names → domains; `buildPetscanUrl`/`normalizePetscanPages`/
   `parsePetscanParams` exported pure functions.
2. `src/widgets/dataSources.js`: `fetchGlamStats(cfg, deps)` — relay
   primary, `fetchSelfWalkUsage` fallback, `aggregateGlamStats` shared
   (injectable views/thumbs); output carries `source`; card subtitle flags
   `· self-walk fallback`.
3. Fallback: PetScan down/truncated/empty → bounded self-walk (ISSUE-45
   fix retained as the degraded path).
4. **Tests: 19 new offline tests** (`tests/glam-petscan.test.mjs`, in `npm
   test` — 36 total): URL construction, DB→domain mapping, normalization,
   validation/clamps, aggregation (ns filtering, per-file views, top-N,
   detail, partialViews), relay/fallback routing. **Live verification:**
   `scripts/verify-glam.mjs` — both paths match glamtools exactly on XBio
   depth-1 2026-07: 518 files · 38 used · 38 viewed · 40 pages · 2 wikis ·
   110,092 views. HTTP smoke of the endpoint: validation 400s + real query
   both correct.

**Revisit triggers (→ full server aggregation C):** budgets > ~30,000
files (GLAMorgan's own ceiling; raised through 1,000 → 10,000 → 30,000 on
2026-08-17 — see the GLAMORGAN-WIDGET revision note),
repeat-load cache wins, glamtools ships a real stats API, or PetScan
reliability changes.

## ISSUE-47 · GLAM / CIM cards: clickable category titles — **done 2026-08-17**

**What:** the GLAM Category Usage card's category title is plain text; it
should link to the Commons category in a new tab. (Same for the CIM
Category Snapshot card, which shares the title pattern.)

**Why:** `GlamCard` / `CimSnapshotCard` render `data.title` as a plain div
(WidgetFrame.jsx) — unlike the CIM leaderboard (ISSUE-02's `{text, href}`
cells) and the Article Excerpt card (`excerpt-title a` pattern). The title
bar is the drag handle, so the card title (not the header) is the right
click target.

**Proposed fix:** the `glamorgan` transform emits `href:
'https://commons.wikimedia.org/wiki/Category:' + encodeURIComponent(category)`
(space-form title); `cimSnapshot` emits the underscore form directly (the
leaderboard precedent). The cards render the title as
`<a target="_blank" rel="noopener noreferrer">` when `href` is present,
styled like `.excerpt-title a` (text-colored, underline on hover).

**Fixed 2026-08-17:** both cards link out; two transform-contract tests
added (tests/glam-petscan.test.mjs, npm test 47).

**Extended 2026-08-17:** the GLAM card's per-page usage table now links
too — the top-file header links to its Commons `File:` page, and every
usage row's page name links to that page on its own wiki (`pageHref` with
the `.org` stripped from full domains; unknown wikis stay plain). Audit
result: every other page-listing card already linked (cimTopPages,
topPages, articleList, cimTopFiles). Transform test covers en/commons/
unknown-wiki rows (npm test 48).

## ISSUE-48 · Media player: poster frame before playback + iOS quicktime derivative pick — **open**

**What:** the 🎬 media player shows a black frame before the user hits play
(native `<video preload="metadata">` renders nothing until the first frame
buffers — and shows nothing at all in kiosk mode before the ▶ Start click).
It should show the file's **keyframe poster**. While in there: pick the
**iOS quicktime derivative** (`video/quicktime`, generated by TMH for every
video) when the UA needs it — ISSUE-39's spec listed it as an optional pick,
never implemented.

**Why:** boards and kiosks are watched more than operated — a wall of black
boxes reads as broken. The poster is free (no new fetch); the quicktime pick
is one more arm in `pickPlayUrl`.

**Feasibility (verified 2026-09-01, live):** the zero-math path is
`https://commons.wikimedia.org/wiki/Special:FilePath/<File>.webm?width=640`
→ **200 `image/jpeg`** (keyframe poster; TMH renders it through the
thumbnail pipeline). The direct `upload.wikimedia.org/.../thumb/<hash>/
<file>.webm/640px-seek=2-<file>.webm.jpg` scheme returned **400** in live
probes (seek-form URL rejected — do NOT rely on it; `?utm_source` stripping
also required if deriving from `videoinfo.url`). iOS pick: `derivatives`
already returns the `video/quicktime` entry (verified in ISSUE-39's
2026-08-15 probe) — `pickPlayUrl` just needs a UA/`?ios=1` branch.

**Proposed fix:** `fetchMediaPlaylist` adds `posterUrl`
(`Special:FilePath/<title>?width=640` — same batched call, zero extra
requests); `MediaPlayerCard` sets `poster` on `<video>` (audio: skip). ⚙
optional `posterWidth` (320/640/960) only if kiosk needs it. `pickPlayUrl`
gains the quicktime arm behind `mediaType: 'video'` + UA sniff or an
explicit config. Keep `preload="metadata"` (poster renders regardless).

**Caveats:** `Special:FilePath` redirects to upload.wikimedia.org (fine in
`<img>`/`poster`, no CORS involved); seek-to-N variants
(`?width=640` always frame ~0s) — for a specific keyframe the seek thumb
scheme must be solved first, but frame 0 is fine for posters. Don't trust
the 400-prone direct scheme without re-verifying.

---

## ISSUE-49 · Media player: TimedText subtitles / closed captions — **open**

**What:** Commons videos can carry community-written subtitles as
**TimedText** pages (`TimedText:<File>.<lang>.srt`, WebVTT content). The 🎬
widget should discover available caption tracks, expose a ⚙/inline language
picker, and wire them to the native `<track kind="subtitles" src=… srclang=…>`
element — zero player-library work, browser renders the captions.

**Why:** accessibility (WCAG for kiosks/PR walls), multilingual boards (a
GLAM kiosk in Tokyo and one in Mexico City can share one dashboard, each
picking its language), and it makes the "insights and action" claim
concrete on video content.

**Feasibility (partially verified 2026-09-01):** TimedText pages probe via
the regular Action API (`action=query&titles=TimedText:Dance_reedit_2.webm.
en.srt` → `{missing: true}` for files without subtitles — verified live on
a subtitle-less file). Content fetch: `prop=revisions&rvprop=content` on an
existing TimedText page returns the raw WebVTT/SRT. **Open probe (not yet
done):** enumerating a file's AVAILABLE languages without guessing codes —
candidates: the file page's TMH `<track>` elements (parse `prop=text`?),
`action=timedtext` (TMH's web-API for track listing, needs verification),
or templated `List:` pages. Also verify whether `commons.wikimedia.org/w/
api.php` serves `format=vtt` natively (TMH has a vtt endpoint) so SRT→VTT
conversion can be skipped.

**Proposed fix:** `fetchMediaPlaylist` probes/fetches tracks per file
(only when a new `captions: 'off' | 'en' | '<lang>' | 'auto'` config is
non-off); convert SRT→VTT client-side if needed (~20 lines, cue format is
near-identical); `MediaPlayerCard` renders `<track>` children and a small
`CC` language chip next to the shuffle/loop badges. Cross-track memory:
remember the chosen language across playlist advances. Kiosk default:
`captions: 'auto'` = browser language if available.

**Caveats:** TimedText coverage on Commons is sparse (most files have
none) — the widget must treat "no track" as the normal case (like the
missing-file count, not an error). `crossorigin` on the `<video>` is
required for `<track>` served cross-origin... actually tracks served from
the SAME origin (Toolforge fetch → blob or same-origin URL) avoid that;
if direct Commons URLs are used, add `crossorigin="anonymous"` (Wikimedia
sends CORS `*` on upload.wikimedia.org — verified pattern from the
thumbnail work). Licensing note: subtitles are user-generated CC BY-SA —
the existing Commons link/credit surface already covers attribution.

## ISSUE-50 · Board params v1: `{{param}}` interpolation + Board Controls card (buttons/select/text) — **prototype implemented + deployed 2026-09-01**

**What:** the concrete Path A implementation of ISSUE-41's design (which is the
declarative core of the Phase 3 interactivity vision): a board-level `params`
block, `{{name}}` placeholders in any widget config string, and a **Board
Controls** card (static widget, `boardControls`) that renders a button group /
select / text field per param — clicking a control re-resolves every referencing
widget's config and re-fetches it. The canonical demo: three category-name
buttons → a Category Size widget's `{{category}}` config → the sample photos and
stats re-aim to the chosen museum.

**Why:** this is the single primitive that turns WikiBento from a poster wall
into an interactive instrument (user direction 2026-09-01: "a button in Widget A
sends a category name to Widget B as input"). It is also the industry-validated
model: Grafana/Metabase/Superset/Power BI all converged on variables-as-hub with
NO widget→widget messaging (research 2026-09-01, MODULARITY-AND-DATAFLOW §Part 3)
— general message-passing is the complexity trap that killed the CD-ROM-era
object/message authoring tools (mTropolis). Variables first; a capped click→set
param action layer (Tableau's lesson) is the follow-up.

**Design (implemented as prototype 2026-09-01, additive, no format break):**
- **`params` top-level block** (validateDashboard ignores unknown top-level keys
  — verified): `{ "params": { "category": { "label": "Museum", "type":
  "buttons" | "select" | "text", "options": ["A", "B"], "value": "A" } } }`.
  `value` is the live value (defaults to `options[0]` or `""`).
- **`src/lib/params.js`**: `parseParams(block)` → `{ specs, values }`;
  `resolveParams(config, values)` → deep `{{name}}` substitution in string
  fields (numbers/booleans untouched; unknown names left literal).
- **Resolution timing:** App resolves every widget config
  (`useMemo([widgets, paramValues])`) before passing to WidgetFrame — the
  validator never sees placeholders, select enums validate on resolved values.
- **Ripple:** `handleSetParam(name, value)` = set param value + bump
  `reloadKey` → all fetch widgets re-run `load()` (the existing whole-board
  reload trigger; per-widget dependency tracking is a later optimization —
  with N ≤ 40 widgets and 1 h-TTL caches, whole-board reload on an explicit
  click is acceptable and predictable).
- **`boardControls` static widget** (timeScope `point`, no fetch): renderer
  receives `paramSpecs` / `paramValues` / `onSetParam` via WidgetFrame props
  (only this renderer consumes them). Config: `{ title }` — shows all declared
  params by default. Buttons render one group per param; the active value is
  highlighted.
- **Provenance (deferred to ISSUE-41 full design):** ⓘ Session shows applied
  params; URL context overlay (`?…&category=X`) is the same resolution path and
  lands with ISSUE-40.

**Prototype verification (2026-09-01):** hash-config demo — `params.category`
(three museum categories) + `boardControls` (button group) + `categorySize`
(`config.category = "{{category}}"`, 6 random photos): clicking a button
re-fetches the widget against the chosen category; non-referencing widgets are
unaffected in output (they do re-run `load()`). Unit constitution:
tests/params.test.mjs (parse/resolve/roundtrip, unknown names literal).

**Follow-up 2026-09-01 (same day, deployed index-B1BCpReR.js) — two fixes from
first real use:**
1. **The `{{param}}` lock-in bug:** the ⚙ config panel edits the RESOLVED
   config, so touching ANY field (e.g. sampleCount) wrote the whole resolved
   config back — the placeholder was overwritten by its literal and the
   widget was permanently locked to one value. Fix: resolution moved from App
   into `WidgetFrame` (`resolvedConfig` useMemo) — the DATA path (fetch/
   transform/titles/refresh) uses the resolved config, the ⚙ EDITOR path uses
   the RAW `widget.config`, so the placeholder stays visible in the form
   (provenance) and overwriting it manually remains the documented freeze
   escape hatch. Verified live: edit sampleCount → Apply → buttons still
   re-aim the widget.
2. **Params editable in the UI:** Board Controls ⚙ gains a `spec` textarea —
   one param per line, `name | type | Label | option1, option2` (2/3-part
   shorthand forms supported; `#` comments; type defaults select-when-options
   else text). `handleUpdateConfig` intercepts boardControls spec edits →
   redefines the board params (live values preserved when still among the
   options, else first option) + persists to localStorage + bumps reloadKey.
   Roundtrip constitution: paramSpecToText/parseParamSpecText tests
   (tests/params.test.mjs, npm test 65). Verified live: renamed options +
   added a fourth via ⚙ → buttons reshaped immediately.

**Follow-up 2 (2026-09-01, deployed index-EqMYvBZt.js) — input types #4 + #5
(MODULARITY §Part 4 quadrant 1):**
- **`number` params** — spec `count | number | Photos | 3, 12, 1` (options =
  min, max, step); renders a kiosk-friendly slider + numeric readout; value is
  a string (fetchers parseInt). Drives topN/sampleCount/depth/budget/months.
- **`month` params** — `month | month | Data month` (no options); renders a
  ‹ label › stepper + a **Latest** chip (value 0 = latest available, matching
  the widgets' own `latestCimMonth`/`resolveMonth` semantics). The stepper
  shows the resolved month-year for explicit months ("September → 2026-09");
  for Latest it stays neutral (the actual month is widget/publish-defined).
  Verified live: Latest → CIM 2026-07; step to September → the honest
  month-lag error + Retry; Latest again → recovers to 2026-07.
- **Validator gap fixed:** `validateDashboard` now accepts `{{name}}`
  placeholders in number config fields (skips numeric checks — resolution is
  at fetch time); previously `sampleCount: "{{count}}"` failed validation and
  the board wouldn't load.
- Demo board (params-demo.json) upgraded to all five types. npm test 68.

**Caveats / non-goals for v1:**
- Whole-board reload on every param change (see Ripple) — fine for prototype;
  revisit if boards grow past ~50 fetch widgets.
- No URL overlay, no per-widget ⓘ provenance, no markdown-text collision
  warning yet (ISSUE-41 full design covers these).
- `params` is NOT in the JSON schema yet — add to docs/dashboard.schema.json +
  docs/JSON-FORMAT.md when the prototype graduates.

## ISSUE-51 · Article Gallery: show-all / decorative-filter / section-gallery grouping — **done (314ccfc)**

**What:** the `gallery` widget shows only "significant" captioned images, so
`<gallery>` blocks and table/figure image lists never display — e.g. List of
presidents of Harvard University returns 32 media-list items but just 1
captioned one. Requested (GitHub issue #3, fuzheado/wikibento): an option to
"maximally" display all images while still hiding minor/decorative ones, and
an option to break the grid into article sections / per-gallery sections.

**Why:** `fetchArticleGallery` filters media-list items to
`type === 'image' && caption.html` (src/widgets/dataSources.js) — caption-less
items are dropped wholesale even when they are content (president portraits,
gallery photos). Media-list items inside `<gallery>` blocks carry a unique
`gallery_id`; every item carries `section_id` and is ordered by article
position — both are usable grouping keys, and `section_id` maps 1:1 to
`action=parse&prop=tocdata` heading indexes (verified live on Albert Einstein,
2026-09-05).

**Proposed fix:** three additive `gallery` config options (defaults preserve
today's behavior exactly):
- `includeAll` (boolean, default false) — also include caption-less images.
- `hideDecorative` (boolean, default true, only when includeAll) — drop common
  decorative caption-less files (flags, coats of arms/escudos/wappen, seals,
  emblems, insignia, logos, locator/blank/orthographic maps, icons/symbols,
  Noimage stubs) via a conservative filename heuristic; captioned images never
  filtered; documented as user-disableable.
- `groupBy` (select none|section|gallery, default none) — renderer shows group
  headers; rows carry the grouping key. Section labels come from one
  `prop=tocdata` call when available, else "Section N" / "Section:
  Introduction" (lead); gallery mode sets each `<gallery>` block off as its
  own "Gallery N".

**Fixed 2026-09-05 (314ccfc, branch `issue-3-gallery-all-images`):**
`includeAll`/`hideDecorative` selection + `assignRowGroups` grouping helpers
in dataSources.js (fetchArticleGallery gains an optional 5th options object;
4-arg callers unchanged); the two gallery renderers render group headers,
caption-less file-name labels and an includeAll-aware empty state; autoHeight
budgets headers; ⓘ/catalog description + Ask manifest updated; README catalog
row + history, HANDOFF, DATA-SOURCES §13 documented; heuristic verified
against 12 live pages with zero content false positives and captioned images
exempt. Constitution: tests/gallery-options.test.mjs (13 tests → npm test 88).
Verified live end-to-end: Harvard presidents 1 → 30 images (+2 decorative
hidden), Einstein all-images → 36 rows under 27 real "Section: …" headings,
National Gallery London → Gallery 1/2/3 groups. Not yet merged (patch
delivered; no write access to GitHub).

## ISSUE-52 · Widget-to-widget dataflow: `source` picker + `{{widget:id}}` interpolation + the four-Dataflow-widget chain — **done + DEPLOYED 2026-09-08 (bundle index-OJOY0xwd.js)**

**What:** beyond board params (ISSUE-50) — where a Board Controls card drives
`{{param}}` references — wire widgets to each other: one widget's **output**
feeds the next. The rudimentary demo the user asked for: a **list → filter →
count → display** chain (Text List → Filter Lines → Line Count → Value
Display), plus a Text List feeding a real widget's textarea field
(Article List titles).

**Why:** interactivity is currently one-way (controls → params → widgets).
A filter widget that consumes a source and re-emits gives boards the
"pipeline" feel — the natural next rung on the dataflow ladder in
MODULARITY-AND-DATAFLOW §Part 3 (inputs → parameters → widget-to-widget
edges), without a visual DAG.

**Design (2 mechanisms, both additive):**
- **Emission** — a registry entry may declare `emit(data, config) → value`
  (string | number | array | object). WidgetFrame publishes it to the App
  (`widgetOutputs[id]`) after every load — static AND fetch paths (the
  producers are all static; the first implementation forgot the static
  return path — caught in browser verification, see the two fixes below).
- **Consumption** —
  1. a new `source` **config-field type** (a select of every emitting widget
     on the board, labeled by its live title); the producer's output is
     passed to the consumer's `transform`/`fetch` as `opts.sourceOutput`
     (structured, type-preserving);
  2. **`{{widget:id}}` interpolation** — the same deep-string mechanism as
     `{{param}}`, extended in `resolveParams`; arrays join with newlines so
     a list output can feed a textarea config (`"articles":
     "{{widget:flow-list}}"`). Unknown refs stay literal + one console.warn
     (never break a board). `stringifyOutput`/`extractWidgetRefs` are the
     pure helpers (src/lib/params.js).

**Reload wiring:** WidgetFrame computes a content-based signature of every
referenced output (`widgetOutputSignature`, src/lib/dataflow.js) and
re-runs its load only when it changes — identical re-emits are no-ops, so
no refresh storms and no emit→reload→emit loops. Signature is built from
the RAW config (resolution replaces the `{{widget:id}}` placeholder with
the value, hiding the ref — the first implementation used the resolved
config and the interpolation path never reloaded; caught in browser
verification).

**The four new Dataflow widgets (category "Dataflow", all static):**
🧾 **Text List** (pastes lines; emits them) · 🔎 **Filter Lines** (consumes a
source, keeps lines by contains/equals/starts/ends + case toggle, emits the
filtered list) · 🔢 **Line Count** (consumes a source, emits the count) ·
🖨️ **Value Display / echo** (renders number/list/JSON; pass-through emit for
further piping). Renderers: `ListSourceCard` (numbered scrollable list) +
`EchoCard`; both registered in the Add-Widget type glyph map + Ask manifest.

**Fix #1 (browser verifier caught it):** the static-widget branch of
`WidgetFrame.load()` returned before publishing `emit` output — none of the
four dataflow producers ever emitted. Restructured so `publishOutput` runs
in both paths.

**Fix #2 (browser verifier caught it):** `widgetOutputSignature` was computed
from the resolved config — after resolution the `{{widget:id}}` was gone, so
`extractWidgetRefs` found nothing and interpolation consumers never
reloaded. Now computed from the raw `widget.config`.

**Constitution:** tests/dataflow.test.mjs (13 tests; npm test now 125):
params.js `{{widget:}}` resolution + stringifyOutput + extractWidgetRefs;
dataflow helpers (toLines/countOf/resolveSourceValue/signature — content-
based, identical re-emits identical); the canonical chain List → Filter
(contains/starts/ends/equals + case) → Count → Echo numbers; validateDashboard
warns (never errors) on a `source` pointing off-board; `flow-demo.json` valid.
Wired into `npm run test` (dataflow-test-bundle.mjs; cleanup list fixed to
rm all 10 bundles).

**Shipped artifacts:** `public/flow-demo.json` (`?config=/flow-demo.json` —
the 6-widget chain demo incl. a markdown explainer and the interpolation-fed
Article List); EXAMPLE_DASHBOARD + `public/dashboard.json` gain the same
5-widget flow row (now 35 widget types); docs/ISSUES.md (this entry),
README (catalog + features), HANDOFF, JSON-FORMAT updated. Ask manifest
regenerated (35 widgets; the LLM sees `source` fields + Dataflow category).

**Verified:** unit 125/125; `npm run test:browsers` flow-demo 6/6 widgets ×
Chromium/Firefox/WebKit, 0 errors, 0 console errors; full 35-widget catalog
passes all engines when the pageview API isn't rate-limiting (a local burst
of live requests trips Wikimedia 429s — the widgets degrade gracefully, 0
render errors; re-runs clean). Live interaction verified in Chromium: Text
List 5→7 lines propagates Filter "7 of 7", Count "7", Echo "7" and the
Article List re-fetches 7 real articles w/ thumbnails + intros via
`{{widget:flow-list}}`.

## ISSUE-53 · Widget instance names + rename resolution (id chips, editable name, repoint dialog, source combobox) — **done + DEPLOYED 2026-09-08**

**What (user session, dataflow review):** after ISSUE-52 wire-up, three
consistency gaps: (1) widget *instance ids* (the `flow-list` in JSON — the
stable name other widgets reference) were **invisible in the UI** — the ⓘ
panel showed the *type* slug (`listSource`), not the instance id, and headers
showed computed labels only, so "some boxes have an instance name and some
don't"; (2) the instance name could only be set by editing JSON — no interface
path, and no resolution policy for what happens to references when a widget
is renamed; (3) the source picker was a plain `<select>` only on consumer
widgets — no manual entry, and no single consistent control.

**Design decisions (answering the user's questions):**
- **Every widget gets a visible, editable instance name.** Id chip in every
  header (click opens ⚙; hidden in kiosk/lean with the rest of the chrome);
  ⓘ shows the instance id prominently + a Type row; the source-picker options
  are labeled `icon Type · instance-id — label` so identical types and renames
  stay distinguishable.
- **Rename resolution = dialog + atomic repoint** (their stronger suggestion):
  renaming in ⚙ validates (non-empty, `[A-Za-z0-9_-]` — the token grammar,
  unique on the board) then scans every widget for `source` fields and
  `{{widget:id}}` tokens pointing at the old id. If any exist → confirm dialog
  "Rename X → Y? This updates N references in M widgets (…); they will be
  repointed to Y. Cancel leaves everything unchanged." Confirm rewrites all
  configs atomically (renameWidgetRefs) + the layout `i`; Cancel changes
  nothing. Silent auto-repoint rejected (mutates other widgets' configs
  invisibly); manual-only rejected (silent broken links). **Inline errors**
  for empty/invalid/duplicate keep the ⚙ panel open (fix: Apply closed the
  panel in the same tick as the error — error was set then unmounted).
- **One consistent source control:** the picker is now a **combobox**
  (`<input list=datalist>`) everywhere — dropdown of emitting widgets (by
  instance id) AND manual id typing. The dropdown's presence still follows
  the widget type declaring a `source` config field (only dataflow consumers
  today); interpolation `{{widget:id}}` remains the manual path on any string
  field — the combobox makes both discoverable. A per-field binding UI
  (wire any widget's field to any output) remains the Tier-A visual-wiring
  design (MODULARITY-AND-DATAFLOW §Part 6).
- **Display title**: the previously-uneditable `_title` now has a "Display
  title (optional)" field in ⚙ (header override; defaults to the computed
  label like "5 lines"). Kills the long-standing known issue.

**Bonus behavior surfaced by verification:** a markdown note whose text
contains `{{widget:flow-list}}` is a *live* consumer — it renders the resolved
list, is counted as a reference by the rename dialog, and is repointed with
everything else. Widgets are referrable from anywhere a string lives.

**Constitution:** tests/dataflow.test.mjs +5 (renameWidgetRefs deep rewrite
incl. regex-special ids, findWidgetRefs/countWidgetTokens counts, validateDashboard
warns-not-errors on unreferrable id formats, `source` is a known key on
consumer types → no unknown-key warning) → npm test 131. validateDashboard
warns (never blocks) on ids outside `[A-Za-z0-9_-]` — such ids can't be
referenced via `{{widget:}}`/the picker.

**Verified live in the browser (Chromium + 3-engine matrix):** id chips on all
6 flow-demo widgets; ✔ rename `flow-list→my-list` → dialog "3 references in 3
widgets (flow-note, flow-filter, flow-articles)" → confirm → chip + filter
header (`🔎 my-list`) + source dropdown + note text all repointed, chain still
renders (5→5→5→5, Article List re-fetches via `{{widget:my-list}}`); ✔ invalid
name "bad name!" → inline error + panel stays open; ✔ duplicate name →
"already the name of another widget"; ✔ Cancel → nothing changes. Browser
matrix: flow-demo 6/6 × Chromium/Firefox/WebKit, 0 errors, 0 console errors.

**Second bug caught by browser verification (rename propagation freeze):**
the first rename implementation cleared the WHOLE `widgetOutputs` registry on
rename — consumers' reload signatures compare against a per-frame
`prevOutputSigRef`, so producers re-emitting IDENTICAL values post-clear made
`sig === prev` → the reload never fired → the chain froze at stale 0s
(filter "0 of 0") and stayed dead (only a full page reload recovered it).
Fix: DON'T clear outputs on rename — only the renamed widget's key goes stale
(`setWidgetOutputs(prev => drop renamed key)`); its remount re-emits under the
new id and its consumers re-source, everyone else untouched (no reload storm,
no stale-prev). Verified: rename → chain stable at 5→5→5→5 within ~2 s, no
transients, no reload needed.

## ISSUE-54 · ⚙/ⓘ panels clip their bottom action on small widgets (Apply unreachable) — **done 2026-09-09**

**What (user session):** on a widget shorter than its config panel, opening ⚙
leaves **"Apply & Reload" below the card's bottom edge** — invisible and
unclickable, with no scrollbar anywhere. The only workarounds were resizing the
widget or abandoning the edit. The ⓘ panel has the identical defect for
"Copy debug info".

**Root cause (three CSS declarations):** the panel lives in a fixed-height grid
cell — `.grid-item { height: 100%; overflow: hidden }` — and
`.widget-config`/`.widget-info` were `flex-shrink: 0` with no `overflow`. A
panel taller than its card was therefore *clipped* at the card boundary: the
fields below the fold were unreachable and so was the action button.

**Audit (`scripts/smoke-panels.mjs`, 2026-09-09):** every widget on the
35-widget catalog, cards forced to the **w3 h3** size a widget lands at when
added from the Add Widget panel (264px tall):

| viewport | ⚙ clipped (pre-fix) | of those, Apply fully invisible |
|---|---|---|
| 1440×900 | 21/35 | 17 |
| 1280×800 | 21/35 | 19 |
| 1024×768 | 25/35 | 21 |
| 820×900 | 27/35 | 23 |
| 600×900 (mobile stack) | 0/35 | — |

The catalog *as authored* mostly passes (2/35 at 1024) — this is mostly a
fresh-add/shrink bug, which is why the browser matrix (loads the catalog,
never opens ⚙) missed it. ⓘ measured identically (21/35). Worst panels:
sparql 488px (+250 clipped), mediaplayer 468 (+230), filegallery 441 (+203).
Below 768px the mobile stack sets `.grid-item { height: auto }`, so cards grow
and nothing clips — desktop grid only.

**Fix (CSS-only, 2026-09-09):**
- `.widget-config`, `.widget-info` → `flex-shrink: 1; min-height: 0;
  overflow-y: auto` — the panel shrinks to the card and the fields scroll.
- Pinned action: `.widget-config > .widget-btn-apply` and
  `.widget-info > .widget-info-actions` → `position: sticky; bottom: 0` with an
  opaque background (card surface composited with the panel's 15% black tint)
  and a top border. The action stays clickable while fields scroll under it.
- **Rejected alternatives:** *Apply at top and bottom* — the **fields**, not
  the button, are the unreachable part (a 488px panel in a 232px card shows
  ~2 fields; a top button would let you commit a form you can't finish
  editing); *DOM scroll-wrapper + footer* — functionally equivalent but a
  larger JSX diff (sticky on the panel's direct child works for both panels,
  verified 0/35 each); *popout/popover* — still the right **polish**
  follow-up (comfortable editing on 2-row cards, settings not constrained by
  card size), but not needed for reachability; *auto-expand the card on ⚙* —
  reflows the board, can't fit on a full board, fights the user's layout.

**Hint trim (same session):** the universal "Name (instance id)" hint wrapped
to ~7 lines on a 3-column card and cost **67–93px per panel** (10,274 → 8,107px
across the catalog). It is now one line — `{{widget:sparql}}` — with the full
sentence in the tooltip; the label shortened to "Name". This alone flipped 12
of the 21 pre-fix ⚙ clips to ok; the scroll contract handles the rest.

**Constitution:** `npm run smoke:panels` (`scripts/smoke-panels.mjs --assert`) —
every widget × {⚙, ⓘ} × {1440, 1024, 600}px, cards forced to w3 h3, requests
to Wikimedia blocked so auto-height can't grow a card and mask a too-tall
panel: **210 measurements**, exit 1 on any clipped action. Wired into
`npm run smoke` after the grid-geometry check. **Negative-tested:** with the
fix reverted the run fails (⚙ 9/35 @1440, ⓘ 21/35 @1440, 14/35 and 33/35
@1024; 600px mobile unaffected) and exits 1; restored → pass.

**Verified live (Chromium, built dist):** sparql at w3 h3 — panel scrolls
(414px of fields in 203px), Apply pinned and visible, scrolling reaches the
last field ("Max rows"), Apply commits and closes the panel; short panel
(topwikis) shows the action inline with no forced scroll; ⓘ on filegallery
scrolls with "Copy debug info" pinned; hint renders one line.

## ISSUE-55 · Speaker widget: text-to-speech "output" widget (GitHub issue #16) — **done (branch `issue-16-speaker`, PR #17)**

**What:** the first member of the output/effector widget family. `speaker`
(registry id, category Content & Embeds) is a static widget (no fetch) that
speaks its resolved `text` aloud via the Web Speech API. Text arrives through
the ISSUE-50 channel: `text: "{{phrase}}"` re-resolves when Board Controls
params change (reloadKey bump → static re-transform), so a Controls text/
buttons param drives what the speaker says. A per-widget voice picker lists
the device roster (name + lang — the Web Speech API exposes no gender
metadata); mute is controller-global.

**Safety model (the design center):** *nothing speaks unless a human makes
it.* The browser only gates speak() until the user's first page click (Chrome
M71+), so the widget enforces its own gate: `speakOnChange` (default OFF)
auto-speaks only after ▶ has been clicked on that widget at least once
("armed"). Speaking is one-at-a-time (cancel-before-speak, also the Chrome
rate>2 wedge workaround), rate clamped [0.5, 2], volume capped, utterance
cancelled on unmount/tab-hide. Every speaker card has ▶/⏹ and a 🔊 mute
toggle writing a shareable `audioMuted` board param. Zero-voice engines
(headless CI: Chromium `synthesis-failed`, Firefox silent stall — both
verified 2026-09-05) render a degraded "No voice on this device" state
showing the text; a 6s stall guard catches engines that queue forever.

**Files:** `src/lib/speech.js` (controller factory + pure helpers, synth
injected for tests), `src/widgets/index.js` (registry entry),
`src/widgets/WidgetFrame.jsx` (SpeakerCard), `src/App.css`,
`tests/speaker.test.mjs` (14 tests → npm test 145 after the dataflow merge), README row + this entry.
Constitution: static widget precedent (markdown) — `timeScope:'point'`,
no fetch, `refreshSeconds` present. Verified live on headless Chromium:
resolved {{param}} text renders, param button re-aims the phrase,
degraded state shown, speakOnChange does not fire before arming, zero
console/page errors. Real audio + voices: manual leg on macOS/WebKit.

## ISSUE-56 · Translator (MinT) widget: machine translation via Wikimedia MinT — **done (branch `translate-mint`, PR #21)**

**What:** the first wiki-native AI-node (see WIDGET-IDEAS §Node Algebra, family 8)
and the natural companion to the speaker (#16) and transformer (#18) work: a
fetch widget whose `text` (typed or `{{param}}`-driven via ISSUE-50 Board
Controls) is machine-translated into a target language. Registry id `translate`,
category Content & Embeds, `timeScope:'point'`.

**Service:** MinT (Wikimedia Language team) — `POST
https://translate.wmcloud.org/api/translate`, body `{content,
source_language, target_language, format:'text'}`. **CORS `*` verified
2026-09-05** (ACAO `*` on POST + clean OPTIONS preflight) → browser-direct,
**no key, no proxy** (contrast: service TTS voices and LLM summarizers need
keys/proxies — MinT is the key-free AI demo). MinT has **no `auto` source
detection**, so `from` defaults `en`, `to` defaults `es` (2-letter codes,
normalized). Content >8,000 chars is truncated + flagged. Same text+pair is
cached 24 h (createTtlCache). Serving model surfaced in the card
(`nllb200-600M` etc.) for transparency.

**Files:** `src/widgets/dataSources.js` (buildMinTRequest/parseMinTResponse/
fetchMinTTranslation — pure helpers exported for tests), registry entry,
TranslateCard renderer, App.css, `tests/translate.test.mjs` (10 tests →
npm test 155 after the dataflow/speaker merges), README row. Live-verified: curl en→es 0.29 s
(nllb200-600M); headless-Chromium probe: Board Controls phrase button →
translated text re-aims in the card, zero console/page errors.


## ISSUE-57 · Request-serial guard in WidgetFrame.load() — stale writes can't clobber fresh results — **done (branch `supersede-guard`, PR #24)**

**Problem:** `load()` had no request-serial token. A slow fetch started under
an old config/params (60 s SPARQL, batched imageinfo, MinT round-trips)
could resolve AFTER a newer run (param change → reloadKey bump → re-load,
or manual ↻) and overwrite its result with stale data — or a stale failure
could blank a fresh result. Latent for single widgets; it compounds the
moment widgets consume changing `{{param}}` feeds (the #18 transformer
data plane, timing policy 2026-09-05).

**Fix (src/widgets/WidgetFrame.jsx):** `loadSeqRef` — each load() claims
`++loadSeqRef.current`; success and error paths check `seq !==
loadSeqRef.current` before touching state and simply return if superseded.
Unmount invalidates in-flight loads (`loadSeqRef.current += 1`) so a slow
fetch can't write state after the widget is removed. ~15 lines, no behavior
change for the normal single-run path.

**Verified:** npm test 155 pass · lint clean · build green · chromium matrix
smoke PASS. (Race itself isn't unit-testable without a React harness — repo
convention is lib-level tests + browser probes; the guard is covered by
review + smoke.)


## ISSUE-58 · Article Excerpt emitter + unresolved-reference guard + reference chips — **done 2026-09-09**

**What (user session):** "Can I take the output of a widget like Article Excerpt
and feed it to another one like the Translator (MinT)?" — they had typed
`text: "{{widget:excerpt-1788946116785}}"` correctly, but the translator showed
the **literal token** as its source and MinT translated it into *"¿Qué es
esto?"*. Diagnosis: `{{widget:id}}` interpolation only resolves ids in the
`widgetOutputs` registry, and `WidgetFrame.publishOutput` publishes only when
the producer's registry entry declares **`emit`** — which only the four
Dataflow widgets did. The user was doing it right; the producer half was
missing.

**Fix (three parts):**
1. **Producer — Article Excerpt emits its first paragraph**
   (`emit: (data) => data.extract`). With that one line the chain works, and
   the existing content-based `widgetOutputSignature` re-runs the consumer
   automatically when the excerpt's article changes (verified: param switch
   Einstein → Marie Curie re-emitted and re-translated).
2. **Guard — a fetch widget never sends an unresolved placeholder upstream.**
   New pure helpers `findUnresolvedRefs(config)` / `describeUnresolvedRefs(refs)`
   (params.js) scan the RESOLVED config for remaining `{{widget:id}}` /
   `{{param}}` tokens; `WidgetFrame.load()` returns a **"Waiting for a
   reference"** state instead of fetching, and the signature effect reloads it
   the moment the producer emits. Verified: zero MinT/REST requests while
   unresolved; distinct copy for unknown widget vs unknown param.
3. **Discoverability — reference chips.** Every OTHER emitting widget on the
   board is listed as a clickable `{{widget:<id>}}` chip under text/textarea
   config fields; clicking inserts the token at the caret. Fields where a
   reference is meaningless opt out via `noRefs: true` (Translator `from`/`to`
   language codes).

**Deliberate scope limit (user decision):** article *title* lists are NOT
emitted yet. A machine-translated title can be mistaken for a Wikidata language
mapping (the actual article name in that language) rather than a MinT
translation — if a title-list emitter is added later, the card must label the
output as machine translation. Recorded in JSON-FORMAT's dataflow section.

**Constitution:** tests/dataflow.test.mjs +5 (excerpt emits its extract and
emits `undefined` without one; findUnresolvedRefs detects widget+param refs
deeply and dedupes; empty once resolveParams substituted everything incl. an
emitted empty string; unknown refs stay literal AND are reported;
describeUnresolvedRefs copy) → npm test 160.

**Verified live (Chromium, built dist):** excerpt → translator renders the
translated extract; unknown widget ref → "Waiting for a reference — widget
output “does-not-exist” (not emitted yet — or the id is unknown)" with **no
upstream request**; unknown param → the param variant; chips appear only under
the text field (from/to opt out) and insert the token at the caret. Full
`npm run smoke` (grid + 222 panel measurements × 37 widgets) still passes — the
chips increase panel height and the ISSUE-54 scroll contract absorbs it.

## ISSUE-59 · Board Controls: per-card param scoping — **done 2026-09-09**

**What (user session):** a 4-widget board — (1) article buttons → (2) Article
Excerpt → (3) Translator with `to: "{{targetLang}}"` → (4) language buttons.
Widgets 1–3 worked (with the ISSUE-58 excerpt emitter), but a *fourth* card
duplicated the controls: `BoardControlsCard` renders **every** board param
(the ⚙ `spec` field rewrites the shared board block), so both cards showed
"Article" and "Language". The user asked for a language-only card.

**Fix:** a `show` config field on `boardControls` (type `params`) — the ⚙ panel
renders one checkbox per declared board param; the value is a comma-separated
allow-list stored in the widget config. `transform` carries it to the renderer,
and `BoardControlsCard` filters via the pure helper
`selectParamNames(specs, show)` (params.js): empty/absent = all params
(backward compatible), unknown names ignored, result in declaration order.
A card whose selection matches no declared param shows an explanatory empty
state. This is the controls-surface half of "param targeting" (P2) from
MODULARITY-AND-DATAFLOW §Part 5; per-click *target* scoping (which widgets a
param change affects) remains design (ISSUE-41).

**Constitution:** tests/dataflow.test.mjs +3 (registry declares the `params`
picker + transform passthrough; empty/missing = all; scoping/order/unknown
handling) → npm test 163. Shipped demo: **`?config=/translate-demo.json`** —
the exact 4-widget board (two scoped cards, article + language).

**Verified live (Chromium, built dist):** the exact 4-widget board — cards
render `["Article"]` and `["Language"]` respectively; the chain
Einstein → excerpt → `EN → FR · nllb200-600M`; clicking **de** on the
language-only card re-translates to `EN → DE · nllb200-600M`; the ⚙ picker
shows both params with only `topic` checked on the article card.

## ISSUE-60 · User guide + config-URL error handling — **done 2026-09-09**

**What (user session):** after building the 4-widget params/dataflow chain, the
user asked whether the philosophy and design decisions were documented in a
user-facing manual. They weren't: `PHILOSOPHY.md` (why) and
`MODULARITY-AND-DATAFLOW.md` (design research) are maintainer-facing, the README
is feature bullets, and the in-app ⓘ panel never mentioned params or dataflow.

**Deliverables:**
- **`docs/GUIDE.md`** — tight user guide: the three-layer model (board params /
  widget config / widget-to-widget) and the scope-matching rule; params
  (definitions vs values, `show` scoping, name-by-role, broadcast);
  dataflow (emit/consume, `{{widget:id}}`, reference chips, the waiting guard);
  three worked examples (`translate-demo`, `flow-demo`, `params-demo`); local
  settings; sharing/persistence; a troubleshooting table; a cookbook. Linked
  from the README docs index and "Building a dashboard", and from the in-app ⓘ
  panel (new "Concepts & guide" section listing the demos; stale catalog copy
  fixed).
- **Config-URL error handling** (`src/lib/share.js`): `looksLikeHtml()` +
  `httpError()` — a config URL that returns an HTML page (SPA fallback) now says
  *"returned an HTML page, not JSON — the config file probably doesn't exist"*,
  and a 404 says *"config not found (HTTP 404) — check the ?config= path"*
  instead of *"Not valid JSON: Unexpected token '<'"*.
- **Dev/preview parity** (`vite.config.js`): a middleware 404s missing `*.json`
  instead of serving `index.html`, matching `deploy/server.js`.

**Constitution:** `tests/config-load.test.mjs` +5 (HTML detection; JSON/text are
not HTML; HTML response → friendly error; 404 → missing-path error; valid JSON
passthrough) → npm test 168.

**Verified live (dev + built dist):** ⓘ shows the guide link and the demo list,
stale copy gone; `?config=/nope.json` → *"config not found (HTTP 404) — check
the ?config= path: …/nope.json"*; the dev server returns `text/plain` 404 for a
missing JSON, while `/` is still HTML and existing configs are still
`application/json`.

## ISSUE-61 · Rate-limit guards: pacer, Retry-After, bounded 429 retries — **done 2026-09-09**

**What (user session):** persistent `HTTP 429` from the Action API — the config
load (`Wiki fetch failed: HTTP 429`) and every widget. Diagnosis: the same
request pattern from another IP returned 200s (even a 20-parallel + 10-sequential
burst), so the throttle was **IP-level** (VPN / shared NAT), not app-induced. But
the app handled it badly: `fetchTextWithRetry` retried 429s after 500/1000 ms
without reading `Retry-After`, the config fetch had **no** retry, and nothing
capped the board-load burst (one parallel request per widget).

**Fix — new `src/lib/httpRetry.js`** (the shared HTTP layer; `dataSources.js` and
`share.js` import it):

- **Pacer** — max **4 concurrent** requests; the gap is 0 until a 429 is seen,
  then **500 ms** for the session. A board load can no longer stampede an API.
- **`Retry-After` honored** — parsed (seconds or HTTP-date; capped at 10 s;
  default 1 s when absent) and applied as a *global* cool-down, so every queued
  widget backs off together, not just the one that saw 429. Wikimedia exposes the
  header via `Access-Control-Expose-Headers` (verified live).
- **Bounded 429 retries** — at most **one** (5xx keep the normal budget): a
  sustained throttle is not met with a retry storm.
- **Actionable failure** — `HTTP 429 — Wikimedia is rate-limiting this browser —
  wait ~Ns, then Retry (…)` instead of a bare `HTTP 429`.
- **Config load** goes through the same helper (`retries: 2`), so a throttled
  boot retries and reports clearly instead of failing instantly.

**Constitution:** `tests/http-retry.test.mjs` +5 (parseRetryAfter
seconds/date/cap/invalid; concurrency ≤ 4; a 429 retries once then succeeds and
raises the gap; exhausted 429 → actionable message carrying `retryAfterMs`;
non-429 4xx stays terminal) → npm test 168.

**Verified live (built dist, route-intercepted 429 with `Retry-After: 2`):** the
linkcount card made exactly **2 requests** (initial + one retry) spaced
**2,011 ms**, and showed *"HTTP 429 — Wikimedia is rate-limiting this browser —
wait ~2s, then Retry (…)"*. The config path shows the same message prefixed
`Wiki fetch failed: …`.

**Not fixable app-side:** if an IP is throttled, every request 429s regardless —
the app now backs off and explains instead of hammering. Mitigations for the
user: leave the VPN/shared network, wait a few minutes, close duplicate tabs.

## ISSUE-62 · Wiki Page: custom-URL embed mode (Objectium 3D and any embeddable page) — **done 2026-09-09**

**What (user session):** *"Are you able to frame or show content from a site
like https://objectium.toolforge.org/uploads/213 for 3D?"* — Objectium is a
Toolforge tool (Laravel/Inertia) serving GLB models; upload 213 is a CC0
Smithsonian model ("Spirit of St. Louis", 8.29 MB).

**Feasibility (verified 2026-09-09):**
- The Objectium page sends **no `X-Frame-Options`** and only a **report-only
  CSP** → iframe-embeddable. Verified in a real browser: the frame loads,
  renders its WebGL canvas, shows *"Spirit of St. Louis · GLB CC0 · 99,888
  triangles · Drag to rotate"* — zero console errors.
- The model file (`/uploads/213/file`, `model/gltf-binary`) and the thumbnail
  send **no `Access-Control-Allow-Origin`** → a native three.js loader cannot
  fetch them cross-origin. The planned `model3D` widget (ISSUE-43) would need
  CORS on Objectium's routes or a same-origin proxy.

**Fix (framing path):** the `wikiPage` widget gains a **`url`** config field
(custom mode) — http(s) only, bare domains get `https://`, unsafe schemes
(`javascript:`, `data:`, `file:`, `ftp:`) are rejected with a visible error
state, and the URL takes precedence over the wiki fields. External frames are
**sandboxed** (`allow-scripts allow-same-origin allow-forms
allow-presentation` + `allow="fullscreen"`); Wikimedia pages stay unsandboxed.
`labelFromConfig` shows the host.

**Constitution:** `tests/embed.test.mjs` +6 (https embed + external flag; bare
domain → https; unsafe/malformed rejected; URL precedence over wiki fields; wiki
mode regression incl. mobile + fragment; label) → npm test 174. The Ask manifest
was regenerated — which also picks up the `show` field #33 added without
regenerating it.

**Verified live:** an Objectium card in a board (sandboxed iframe) renders the
3D viewer with zero console errors.

## ISSUE-63 · Seminal demo suite + hub board + demo constitution — **done 2026-09-09**

**What (user session):** after the interactivity and output widgets landed, the
user asked for "a good seminal set of demos/examples", explicitly keeping simple
onboarding examples next to the flagships. Baseline: every-widget catalog, flow,
params, translate. Requested additions: GLAM (seeded by a Meta-hosted Met board,
`w.wiki/TT2g`), article vitals, query power.

**Shipped (8 boards + hub):**
- **Onboarding:** `article-switcher-demo` (one param, two cards — the gentlest
  entry), `translate-demo`, `params-demo`, `flow-demo`
- **Flagships:** `glam-demo` — one template, **five CIM-registered institutions**
  (Met 389,030 · LoC 630,933 · BHL 305,868 · NGA 54,167 · Rijksmuseum 6,863
  files, verified 2026-07), switching collection + month;
  `article-vitals-demo` (excerpt · views · ORES quality · assessments · edits ·
  gallery, one article param); `sparql-demo` (WDQS + Humaniki + QLever presets)
- **Extras:** `embed-demo`, `dashboard` (full catalog)
- **`demos.json`** — a hub board whose Markdown index links every board in place

**Markdown renderer:** same-origin links (`?config=/x.json`, `/path`, `#hash`)
now render as in-place anchors — absolute URLs still open a new tab;
protocol-relative and `javascript:` stay inert text. This is what makes the hub
a navigable index (and a lightweight answer to ISSUE-35 board-to-board nav).

**Constitution:** `tests/demos.test.mjs` +5 — every board validates; ids unique,
types registered, layout/widget counts match; every `{{widget:id}}`/`{{param}}`
resolves inside its board; the hub links every demo and each target exists;
markdown link safety → npm test 190.

**Verified live (built dist):** all 10 boards load with **0 widget errors**
(SPARQL included); the hub renders 9 links and clicking one navigates to that
board; `embed-demo` frames Objectium; `dashboard` renders 37 widgets.

## ISSUE-64 · TrendCard charts have no Y-axis values (Article Pageviews trend, CIM Views Over Time) — **done + DEPLOYED 2026-09-10** (GitHub #42)

**What (GitHub issue #42):** trend-style charts rendered a min–max normalized
sparkline with zero Y information — no ticks, no min/max, no current value —
so a 50→55 series looked identical to a 5M→5.5M series. Affected: `pageviews`
in trend mode and `cimTrend` (the two widgets rendering the bare `TrendCard`).

**Fix:** `src/lib/format.js` (new) holds the shared chart helpers:
`compactNum` (the `254K`/`1.2M` tick format — extracted from
FileTrafficCard, which now reuses it) and `trendYScale(values)` — the
min–max tick spec (top tick = max, mid = (min+max)/2, bottom = min, viewBox
fractions `TREND_Y_TOP`=12 / `TREND_Y_BOT`=96; flat series collapse to two
ticks). The scale is deliberately **not zero-based** — pageview series live
far from zero and a zero baseline would flatten them; ISSUE-42 makes the
existing implicit scale explicit.

`TrendCard` now draws 3 gridlines at those fractions plus an HTML tick-label
column (absolutely positioned at the same fractions of the plot height, so
labels align with gridlines under `preserveAspectRatio="none"` — SVG text
would distort), and an `aria-label` + native `<title>` tooltip carrying the
exact values ("latest 10,089 · min 7,747 · max 12,310"). Narrow cards
(`<230px` container width) hide the label column via a container query — the
sparkline + tooltip carry the info (ISSUE-54-family constraint).

**Follow-up (same PR):** the scale is now a per-widget toggle — ⚙ **"Y axis
starts at 0"** (boolean, `zeroY`) on both affected widgets. Off (default) =
min–max, variation stays visible; on = zero-based, honest magnitude
comparison (`trendYScale(values, { zero })`, ticks become e.g. 12K/6K/0;
floors at the data min for negative-capable data).

**Constitution:** `tests/trend-axis.test.mjs` (11 tests — tick values/positions,
linear inverted mapping, flat/single-point/empty series, unsorted + non-finite
inputs, zero-based option) → npm test 212.

**Verified live (built dist, Chromium):** Einstein trend shows `12K / 10K / 8K`
ticks + gridlines; switching the article via Board Controls (Marie Curie)
re-aims the ticks (max 20,937); a Wikimedia 429 mid-check surfaced the
ISSUE-61 rate-limit message and Retry recovered cleanly.

**DEPLOYED 2026-09-10** (merged via PR #43; production bundle
index-D9wl_Ty8.js): re-verified on https://wikibento.toolforge.org/ —
Einstein trend ticks `12K / 10K / 8K` live, the zero-based toggle flips the
production card to `12K / 6K / 0` after ⚙ → Apply & Reload. GitHub #42
closed by the merge.

## ISSUE-65 · QR widget: encode a URL/text as a scannable QR card (GitHub issue #45) — **done (branch `feature-qr-widget`)**

**What:** a `qrCode` card that renders any text — a URL first — as a scannable
QR code **on the board itself** (not only in the Share panel), with `ecLevel`,
`margin` (quiet zone) and an optional `caption`, plus a client-side **Save SVG**
for signage/print. Requested by fuzheado 2026-09-10; filed as GitHub issue #45
(labels: `enhancement`, `good first issue`).

**Why:** the Share panel already encodes the board's own link, but as a *card*
the QR becomes a physical-world bridge sitting next to whatever it points at —
GLAM signage, editathon stations, print handouts, kiosk walls. The payload is a
direct link to a free-knowledge resource: no shortener, no redirect hop, no scan
analytics, with all encoding local (ISO/IEC 18004).

**Feasibility (verified 2026-09-10, measured against the installed library):**
`qrcode-generator@^2.0.4` is already a dependency (MIT, zero-dep, client-side,
no network) and `src/lib/qr.js` → `qrSvg(text)` already returns inline SVG
(Byte mode, `type 0` auto-size, EC `M` fixed, no quiet zone); `SharePanel.jsx`
is the working precedent (white padded container, 1,500-char cap,
>1,000-char density warning). Byte-mode capacity measured on the installed
build: **L 2953 / M 2331 / Q 1663 / H 1273 bytes**. Real payloads at EC `M`:
`https://w.wiki/ABC123` (21 chars) → 25×25 modules; Commons category URL (82) →
37×37; board `?config=` permalink (90–138) → 41×41…49×49. Capacity is therefore
not the limit — module density in a small card is.

**Proposed fix:** registry entry `qrCode` (`nodeKind: 'display'`,
`timeScope: 'point'`, `intensity: 'low'`, zero network calls) + a `QrCard`
renderer; extend `qrSvg(text, { ecLevel, margin })` keeping SharePanel's
defaults byte-identical. The `text` field takes the standard interpolation
(`{{param}}`, `{{widget:<id>}}`), so a QR can encode a *derived* value — the
article a pageviews card is currently showing, or the live board permalink.
Optional emitter (`outputs: { kind: 'value' }`, `echo`-shaped) to decide in
review.

**Density rules (never render an unscannable code silently):** auto-ladder the
EC level `H` → `M` → `L` as the payload grows, warn relative to card size, and
hard-cap at ~1,500 chars (matching SharePanel); confirm the on-screen threshold
with a couple of real phone scans during implementation.

**Phase 2 (no new dependencies — typed payloads are formatted strings):**
`mailto:`, `tel:`, `geo:lat,lon`, Wi-Fi (`WIFI:T:WPA;S:…;P:…;;`), vCard, plus
wiki-native deep links (Commons / Wikidata / PetScan); needs the documented
`; , : \` escaping rules.

**Tests:** payload→SVG structural test (module count / finder patterns),
manifest-compliance green for the new entry (`npm test` now regenerates the
manifest first), and a SharePanel regression check.

**Out of scope:** camera scanning/decoding (separate widget; browser
`BarcodeDetector` API), logo overlays and coloured/gradient codes, and
commercial shorteners or tracked redirect links.

**Implemented 2026-09-10 (`feature-qr-widget`):** `qrCode` registry entry
(`nodeKind: display`, static, emits its encoded text) + `QrCard` renderer in
`WidgetFrame.jsx` + `.qr-*` styles; `src/lib/qr.js` extended with
`ecLevel`/`margin`/`label` options (defaults byte-identical to the SharePanel
output — hash-guarded) plus `qrModuleCount`/`qrFits`/`fitEcLevel` and the
measured capacity table; offline-matcher intent + a derived Ask-manual line;
and the widget added to README, DATA-SOURCES §26, BOARD-COMPOSITION §1.5
(registry + emitter tables), WIDGET-DEVELOPMENT, JSON-FORMAT and GUIDE.

**Constitution:** `tests/qr-widget.test.mjs` (18 tests — registry contract,
EC ladder/density/overflow, encoding + capacity, SharePanel regression
hashes, validator, offline Ask tier) → **npm test 228 green**, `npm run build`
clean.

**Verified live (2026-09-10, built dist + real Chromium):** a four-card board
(fixed link / `{{target}}` board param / empty / 1,600 chars) rendered with 0
console errors; **both codes decoded from rendered pixels by an independent
decoder** (OpenCV `QRCodeDetector`) — fixed link → `https://w.wiki/QRtest`,
param card → the interpolated Commons category URL; a ~1% white smear still
decoded at EC H; the over-cap card shows the refusal message; **Save SVG**
downloaded a byte-identical standalone file (5,975 B, quiet zone included).
Live Ask (`llm-qwen36-27b`): QR intents return `qrCode` with the named URL,
and "follow whichever article my pageviews card shows" uses
`{{widget:…}}` interpolation per the new guidance.


## ISSUE-66 · Live edit stream from EventStreams (subscriber-once) (GitHub issue #56) — **open**

**What:** the first "live" aspect of WikiBento — widgets consuming the
Wikimedia EventStreams `recentchange` SSE feed, so a board shows what is
happening *now* rather than a polled snapshot. Requested by Andrew,
2026-09-10, with the design questions: is the event rate feasible, can
several widgets share one subscription, and does this belong in the
standard emitter framework or need different wiring for performance?

**Why:** it is the missing "live" dimension of the tool, and the engine
behind demo G — "The Living Encyclopedia Wall" (`docs/DEMO-IDEAS.md:122`).
Also the only path to a genuine "happening now" signal
(`docs/AGENT-MEMO.md:80`, `docs/WIDGET-IDEAS.md:414`).

**Feasibility (verified 2026-09-10, measured — not taken from docs):**
- Rate **67.4 events/sec** (20 s curl window; 4,046/min), browser
  `EventSource` **41.8/sec** over 15 s from a real page origin, 0 errors.
- Payload mean 1,396 B → **5.4 MB/min, 323 MB/hour** per open board.
- `JSON.parse` in Chromium: median **0.1 ms** → parsing is NOT the
  bottleneck; rendering/persistence is.
- CORS `access-control-allow-origin: *` → browser-direct, no proxy, no key
  (same happy category as MinT, `references/mint-translate-2026-09.md`).
- Composition: **categorize 59 %**, bot-flagged **23 %**, ns0 only **25 %**,
  commonswiki 56 % by volume → filtering is a product requirement.
- Constraints: no server-side filtering; **15-min server-enforced
  connection timeout** (auto-reconnect + `Last-Event-ID` resume); discard
  `meta.domain === 'canary'`; composite streams comma-separated.

**Proposed fix:** `src/lib/liveStream.js` — a refcounted subscription
registry (ONE EventSource per stream per board, closed with the last
subscriber), a windowed reduction layer (fixed-size ring buffer + counters,
UI coalesced to ~1 Hz), and an **optional reduced emitter** (`lines` =
top-N pages, `count` = edits/min) published on a throttle — i.e. the
emitter framework carries the *reduction*, never the feed. Add a
`live: true` registry declaration, pause-on-hidden-tab and a reconnecting
badge. Candidates: `liveEdits`, `editSpike` (vs. the ISSUE-28 baseline),
`liveWall`.

**Tests:** a fake-stream unit test for the registry (one connection for N
subscribers, refcount teardown, canary discard, windowed aggregates) plus a
browser probe asserting one connection and a live count. No live-network
dependency in the unit tier.

**Out of scope:** server-side filtering, persisting events, per-widget
connections, and high-traffic public deployment (the service is for
small-scale external tools).

## ISSUE-67 · Share panel: explicit share mode (lean vs full) for the QR + link (GitHub issue #59) — **done**

**What:** the 🔗 Share panel now chooses what a scanned/pasted link *opens*:
**📱 Lean mode** (`?lean=1`) or **🖥 Full board**. Requested by Andrew
2026-09-10: "the QR code that it generates is just loading up the normal
board… I would like a QR code that when you load it, loads it in Lean mode …
so that it feels like a seamless web app".

**Why:** the panel previously shared the current URL verbatim, so a share from
the toolbar could never carry `?lean=1`, and the presenter's own present mode
could leak into the link. The QR and the copyable link could also disagree.

**Fix:** `presentModeUrl(url, mode)` (`src/lib/share.js`) normalizes the URL —
both modes strip any `?lean`/`?kiosk`, then lean adds `lean=1`; one choice in
the panel drives **both** the QR and the link (the QR is an encoding of the
link, so they cannot diverge); the caption names the mode; the panel defaults
to the mode the presenter is in. `?kiosk=1` is never encoded — fullscreen needs
a user gesture and the kiosk boot path must not attempt it (`App.jsx`).

**Verified (2026-09-10):** `tests/share-lean.test.mjs` (10 unit tests, wired
into `npm test` → **239/239**); `npm run smoke:share`
(`scripts/share-lean-e2e.mjs`, 14 browser assertions) boots the URL the QR
encodes and asserts `class="app lean"`, `app-header` `display: none`, ✕ Exit
present, and that the Full link boots editable — 0 page errors. The rendered QR
was decoded with an independent reader (OpenCV) and returned exactly the lean
URL. Leaving a lean link: ✕ Exit / Esc (already strips the param).

**Status:** done (`src/lib/share.js`, `src/components/SharePanel.jsx`,
`src/App.jsx`, `src/App.css`, `tests/share-lean.test.mjs`,
`scripts/share-lean-e2e.mjs`).

## ISSUE-100 · "It's empty on my iPhone" — the demo sweep, and three bugs it found — **done + verified 2026-09-16**

Andrew, from an iPhone: `?config=/click-through-demo.json` — *"the click-seas box is empty"*, and the question that
mattered more: *"are you checking all demos against the three browser tests?"*

**The honest answer was no.** `scripts/browser-matrix.mjs` loaded **one** board (`params-demo.json`) at **one**
width (desktop). "We test in three browsers" was true of a single demo, so a phone-only failure had nowhere to
appear. That is now a **sweep**: every `public/*-demo.json` + the hub × every engine × desktop **and** an iPhone 14
profile, each run checked for a card per widget, no error frames, no console errors, and **no collapsed card**.

```
npm run test:browsers:demos                                  # all boards × engines × viewports
node scripts/browser-matrix.mjs --demos --base http://localhost:5199 --engines webkit,chromium
node scripts/browser-matrix.mjs --demos --require-relay      # sweeping a host that has /api/proxy
   --boards click-through --viewports phone --concurrency 4
```

It found **three** bugs, none of which the old check could see:

1. **The phone stack collapsed every card body to zero height.** `.widget-body` is `flex: 1; min-height: 0` so a
   *fixed-height* grid cell gets a scrolling body — but in the stack, where `.grid-item { height: auto }`, `flex: 1`
   has no line to grow into and the body renders at **0px**: the card keeps its 58px header and looks empty. The
   📰 box measured `1 child · 0 links · 0px` in **both** engines on an iPhone profile, which is the reported
   symptom — and it was never iOS-specific, the phone stack was simply the only place it showed.
   Fix: `.mobile-stack .widget-body { flex: 0 0 auto; min-height: auto }`.

2. **Wikipedia strips navboxes for phones, and a browser cannot ask for the desktop parse.** The same
   `action=parse` request returns **22,820 bytes / 161 links** for a desktop User-Agent and **5,780 bytes / 0 links**
   for an iPhone one (mobile UA → MobileFrontend removes the `.navbox` family and leaves its stylesheet behind).
   `useskin`, `mobileformat` and `wrapoutputclass` change nothing; only the UA matters, and `User-Agent` is a
   forbidden header for `fetch`. So the client cannot fix it — but the deployment's **`/api/proxy` relay** can,
   because it sends the tool's own UA: the same URL through it returns the full box. The widget now detects the
   exact signature (`navbox-styles` present, no `navbox` element — only the navbox family is affected; POTD, In the
   news, the selected anniversaries and infoboxes came back byte-identical), retries through the relay, and going
   forward asks the relay first on a phone. Where there is no relay it says so instead of showing an empty box.

3. **A static widget was making a request with an unresolved reference.** ISSUE-58's guard — never send a `{{…}}`
   placeholder to an API as content — was only applied on the fetch path, and the 📄 Wiki Page is *static*: it
   embedded `https://en.wikipedia.org/wiki/{{widget:click-seas#selection}}` in an iframe on every load of the
   click-through demo (a 404 plus an X-Frame-Options refusal). Now static widgets wait for their references too.

**Two cosmetic bugs fixed on the way,** both previously filed in HANDOFF as "2-line fixes": ✨ Ask was nested
*inside* + Add Widget (invalid HTML, a React hydration warning on every load, and one console error on every row of
the sweep), and the media player spread React's `key` into `<audio>`/`<video>`.

**Verified against production** (with `--require-relay`): **64/64 clean** — every board, both engines, both
viewports — and the click-through box on an iPhone profile renders **161 links in a 1644px body, no reduced-notice,
0 errors**. A local sweep is 61–64/64 with the two phone runs correctly reporting the relay-degraded fallback,
because a dev server has no `/api/proxy`.

**The lesson worth keeping:** a test that loads one board in three engines is a test of one board. The sweep costs
about eight minutes at `--concurrency 3`, which is a release-time check rather than a per-commit one — and it is
now in the deploy loop below.

## ISSUE-99 · The page box: a validated page name that knows its wiki — **done + verified 2026-09-16** (ISSUE-68's deferred slice)

**Shipped.** A `lookup` param of `source: 'article'` or the new `source: 'page'` now takes a `project`, grows a wiki
picker beside the box, validates against *that* wiki, and commits a **reference** — so the board below carries no
project fields at all:

```json
"page": { "label": "Page", "type": "lookup", "source": "page",
          "project": "en.wikipedia", "value": "enwiki:Marie Curie" }
```

Spec-line form is `page | lookup | Page | page | de.wikipedia` (the 5th field is the wiki). The control:
suggestions from the chosen wiki, a ✓/✗ verdict that names it (`✓ exists on de.wikipedia`,
`✗ no such page on de.wikipedia`), a line showing what it **stores** (`stores "dewiki:Weddellmeer"`), and the
keyboard shortcut — `en:Marie Curie`, `de:Weddellmeer`, `dewiki:…`, `commons:File:…` — which moves the picker as
you type it, so the guess is visible rather than silent.

**Measured in the browser** (three consumers, zero project fields, 0 errors): seeded `enwiki:Marie Curie` → ✓;
typing `de:Weddellmeer` moved the picker to `de.wikipedia`; committing stored `dewiki:Weddellmeer` and the Article
Excerpt, Article Pageviews and Quality cards all re-fetched **German** content; a fictional title gave
✗ *no such page on de.wikipedia*. Demo: `?config=/page-picker-demo.json`.

**Two revisions made while implementing, recorded rather than silently skipped:**

1. **A bare `File:`/`Category:` does *not* switch to Commons** (the plan above said it should). A category can live
   on any wiki, so quietly reinterpreting `Category:Mainz` as a Commons category would be exactly the class of
   silent wrongness the rest of this work avoids. `commons:Category:Mainz` is explicit and one keystroke longer, and
   the picker is right there.
2. **`commons:` needs a short-name table.** The reference grammar requires `commonswiki` (`dbnameOf('commons')` is
   null — a bare word with no family suffix is not a dbname), so `commons:`, `wikidata:`, `meta:` and `species:`
   resolve through a small alias map in the input. The grammar's boundary stays where ISSUE-92 put it.

**And the bug the browser found, which no unit test would have:** validation was asking the API for a page literally
named `dewiki:Weddellmeer` → *missing* → a ✗ badge on a page that plainly existed (the excerpt beside it was
rendering German text). The target is now one pure function — `lookupValidationTarget()` asks about the **title**, on
the wiki the **reference** names (a reference beats the picker, for the same reason it beats a widget's project
field) — and it has its own test. The lesson is the same one as ISSUE-97: a value's *name* is not its *content*, and
every layer that handles one has to say which it means.

**The original slice notes follow.**

Andrew asked (2026-09-16): *"do we have a simple just text entry box … all it would do is just match against article
names? I just want a box where I can enter a validated name of a Wikipedia article, and then that language that
maybe we pull down from a menu. Or maybe we type EN colon and the name, and then automatically it sets the project
and language. … it should be page name, because it could be meta, it could be something else. But then that box
just emits the project language and page name out."*

**The box already exists — and it works.** Measured 2026-09-16 in a browser, with no new code:

- A Board Controls param, `{ "type": "lookup", "source": "article", "options": [ …shortlist… ] }`, renders a text
  box with a ✓/✗/⚠/? verdict, live suggestions (`Weddell` → *Weddell, Weddell Island, Weddell seal, Weddell Sea,
  James Weddell, Mimi Weddell*), a curated shortlist before you type, and **commit on Enter or picking a
  suggestion** — never per keystroke, because a param fans out to N widgets (ISSUE-68's UI contract).
- One box re-aims a whole board: in the probe, `Marie Curie` → `Weddell Sea` re-fetched an Article Excerpt, an
  Article Pageviews card and an embedded Wiki Page together. A fictional title got ✗ *"no such wikipedia article
  (en)"* and the board stayed where it was. (ISSUE-68 Slice 1, `tests/param-lookup.test.mjs`.)

**What it does not do is what Andrew actually asked for: know its wiki.** Three gaps, all visible in that probe:

1. `source: 'article'` is hardcoded to **en.wikipedia** (`WIKI_API` in `paramSources.js`) and says so: *"English
   Wikipedia article title."* The label is honest and the limitation is real.
2. There is **no language/project menu** beside the box.
3. **The committed value is a bare title**, so the project does not travel with it. The probe board needed
   `"project": "en.wikipedia"` written out **three times**, once per consumer — which is exactly the duplication
   ISSUE-92's references exist to remove: a page that travels with its wiki. A committed `enwiki:Weddell Sea` would
   re-aim all three cards with no project field anywhere.

**Design (additive, no format break):**

```json
"page": { "label": "Page", "type": "lookup", "source": "article",
          "project": "en.wikipedia",         // NEW: the wiki the box validates against (default en.wikipedia)
          "value": "enwiki:Weddell Sea" }    // NEW: committed as a REFERENCE, so the wiki travels
```

1. **The source becomes project-aware.** `searchArticles`/the article validator take a project (the ISSUE-93
   `projectConfigOf` mapping already turns `de.wikipedia` into `de.wikipedia.org`, and the reference module already
   turns a wiki into its dbname). Everything else about the control is unchanged.
2. **The committed value is a reference** (`dbname:Title`) — which is what makes Andrew's "emits the project,
   language and page name" true without a single new mechanism: 15 page-taking widgets already resolve references
   (ISSUE-92), and *a reference beats a configured project*, so a board can drop its project fields entirely.
3. **A project picker beside the box** (the shared `ProjectField`, ISSUE-93 — 364 wikis, ordered by recency).
4. **The prefix shortcut**: typing `en:Marie Curie`, `de:…`, `commons:File:…` or `enwiki:…` sets the picker and
   strips the prefix. `File:`/`Category:` should switch the project to Commons, which is the overwhelming case.
   Honest boundary: in the *reference grammar* a bare language code is still not a reference (ISSUE-92's deliberate
   line) — `en:` is a **UI convenience** that the visible picker immediately confirms, so the user can see and
   correct the interpretation rather than trusting a silent guess.
5. **The verdict follows the picker** — ✓/✗ against the chosen wiki, with the language named beside the box.

**Why a param and not a widget (the fork worth stating).** Andrew's phrasing — "that box just emits the project
language and page name out" — describes an emitter. ISSUE-68 already argued the other way, and the argument holds:
`{{param}}` resolves into any config field, so *one* box re-aims *N* consumers, while `emit`/`source` is
point-to-point and would create a second, competing wiring mechanism for the same job. With the value being a
reference, the param *does* hand out project + language + page name — to every consumer at once. (A Finder **widget**
— a prominent search-and-pick card — is ISSUE-68's Slice 2, and remains the right home for a *visual* picker with
result previews; the two are compatible: the widget sets the param.)

**Effort:** small — `paramSources.js` (project parameter + reference formatting), the lookup control (picker +
prefix parsing), `parseParams` (carry `project`), tests, docs. No new format, no migration: a lookup param without
a `project` keeps validating against en.wikipedia, so every existing board behaves exactly as it does today.

## ISSUE-68 · Validated lookup params: "type an institution, the whole board follows" (GitHub #51–#53 family) — **Slice 1 done 2026-09-10**

**What:** a Board Controls param type that accepts free text *checked against live
Wikimedia data*, so one box can aim a whole museum/library dashboard. The
flagship case is the GLAM board: type an institution → the nine CIM widgets
re-aim. Directed 2026-09-10: *"I want a way that a user can specify a Wikimedia
Commons category in one box … all the other widgets get populated … either allow
free text entry and check against valid Wikimedia Commons categories … type to
validate or type to fill or type to check or pull down from a list … it would be
nice to have maybe a pull down menu as an option."*

**Why it is a param and not a widget.** The consumer side already exists: because
`{{param}}` resolves into any string config field, one `category` param re-aims
**9 widgets** (MODULARITY-AND-DATAFLOW §Part 4 audits this — "the consumer side
needs zero code"). Params also **fan out** to N consumers, while the dataflow
`emit`/`source` mechanism is point-to-point; the "one box" is therefore a
*producer* in the param system, and building it as an emitter widget would create
a second, competing wiring mechanism. §Part 4 ranks this work as Quadrant 2 #6
(*dynamic query select*, "the pick-any-GLAM-institution board") + #7
(*search-as-input*); Quadrant 1 (buttons/text/select/number/month) had all shipped.

**Design (additive, no format break):**

```json
"collection": { "label": "Collection", "type": "lookup",
                "source": "cim-category", "options": ["…curated shortlist…"],
                "value": "Images from Metropolitan Museum of Art" }
```

Spec-line form (the ⚙ textarea) uses the 4th field as the **source**, not options:
`collection | lookup | Collection | cim-category`. Sources live in
`src/lib/paramSources.js`: `cim-category`, `commons-category`, `commons-file`,
`article`, `wikidata-item` (plus the implicit `curated` = the `options` list).
`options` on a lookup is a hand-picked shortlist shown before typing.

**Three verdicts, because "valid category" ≠ "works here":** `ok` (✓, has CIM
data), `unregistered` (⚠, real category CIM does not process — the CIM cards will
offer to register it), `invalid` (✗, no such page), `unknown` (`?`, could not
check). Validation is best-effort and **never blocks the board** — a failed check
degrades to `unknown`, like the SPARQL label resolution.

**UI contract:** commit on **Enter or picking a suggestion, never per keystroke**
(a param fans out to N widgets — per-character commits would fire an N-card
re-fetch storm); the badge describes the *committed* value, not the draft; a
stale-response guard (the ISSUE-57 pattern) drops superseded queries; an
unknown/absent source degrades to a plain text input rather than breaking.

### Verified API notes (all live 2026-09-10, `origin=*`)

| need | endpoint | note |
|---|---|---|
| category suggestion | `list=search&srnamespace=14` (CirrusSearch) | **full-text is mandatory** |
| — rejected | `list=prefixsearch&psnamespace=14` | only matches title *starts*: `Smithsonian` → `Category:Smithsonian*`, never `Images from Smithsonian…`. GLAM naming is `Images from X` / `Files from Y`, so prefix search cannot find the real targets |
| — rejected | `list=search&srsearch=<q> hastemplate:"Views from category"` | the template's own rendered text is indexed, so it matched almost anything ("Met" → `Hallands kulturhistoriska museum`) |
| file / article suggestion | `list=prefixsearch&psnamespace=6` / `=0` | titles start with their subject, so prefix fits here |
| Wikidata suggestion | `wbsearchentities` | commit the QID |
| existence check | `action=query&titles=Category:<X>` | `missing` flag |
| **capability check** | `…/commons-analytics/category-metrics-snapshot/<Cat>/<YYYYMMDD>/<YYYYMMDD>` | **the only authoritative check** (see below) |

**The correction that shaped the design — `{{Views from category}}` is NOT the allow list.**
An earlier revision of this slice seeded its option list from
`list=embeddedin` on `Template:Views from category` (886 categories, 2 requests)
and described that as "the documented registration route". It is not: the
template is the **legacy COM:VIEWS category-page-views** system and does not
register anything for CIM. It is a **correlation trap** — 872 of the 886
transcluding categories (**98.4%**) are allow-listed anyway, simply because GLAM
categories commonly carry both, and the 14 that are not return 404 on a live
probe. Believing it produced exactly the failure mode a validator must not have:
false "not registered" warnings for working categories — the Met (389,036 files),
the Rijksmuseum, the Library of Congress and the National Gallery of Art are all
allow-listed and **none of them transclude the template**. (Corrected 2026-09-11
from the `wikimedia-commons` skill's Commons Impact Metrics section, which also
records the 98.4% measurement; that skill fix is now merged into the
`Wikipedia-AI-Skills` repo's `main` — it landed on a branch called
`fix/cim-registration`, which was deleted after the merge.)

**The authoritative source is a published TSV, and it is enumerable:**

```
https://gitlab.wikimedia.org/repos/data-engineering/airflow-dags/-/raw/main/
  main/dags/commons/commons_category_allow_list.tsv
```

**1,775 primary categories** (subcategories up to 7 levels deep also have data),
73 KB, one underscored slug per line, no header. It sends **no CORS headers**, so
the browser reads it through the deployment's generic `/api/proxy` relay — the
same mechanism the Top-pages widget already uses for hatnote; on hosts without
the relay the source degrades to search-only suggestions. So the design is now:

| input | verdict |
|---|---|
| on the allow list | ✓ `ok` — definitive, offline-confirmable |
| not listed, probe 200 | ✓ `ok` — a subcategory of an allow-listed category |
| not listed, probe 404, page exists | ⚠ `unregistered` — "request it via Phabricator (project Commons-Impact-Metrics-Requests)" |
| not listed, probe 404, no such page | ✗ `invalid` — a typo |
| list or probe unreachable | `?` `unknown` — never a guess |

**Registration is a staff cycle, not a page edit:** a Phabricator request
(project `Commons-Impact-Metrics-Requests`, pre-filled form, by the **20th**),
processed at month-end, no retroactive backfill. This also corrects the
user-facing copy in `dataSources.js` (`CimUnregisteredError`) and in the README,
`docs/DATA-SOURCES.md` §19, `docs/GLAMORGAN-WIDGET.md` and HANDOFF — every one of
which had been telling users to add the template.

**Shipped (Slice 1):** `src/lib/paramSources.js` (registry + pure helpers),
`lookup` in `parseParams`/`parseParamSpecText`/`paramSpecToText`,
`LookupParam` in `WidgetFrame`, styles in `App.css`, a `latestCimMonth` export
(one source of truth for the published month), constitution
`tests/param-lookup.test.mjs` (23 tests → npm test 252), and the glam demo's
`collection` param switched to `lookup` + `cim-category` with the five flagship
institutions as the curated shortlist.

**Verified live in the browser (2026-09-10):** the Met seeded → ✓ *"has Commons
Impact Metrics data"* (probe, not list); empty query → the 5 curated
institutions (the pull-down); `Smithsonian` → ⚠ *not in CIM — cards will offer to
register it*; a fictional category → ✗ *no such Commons category*; typing
`Images from Metropolitan` → pick → **snapshot + top files + the rest re-aim to
the new category, 0 error frames**.

**Follow-ups shipped (2026-09-11):**
- **The allow list is bundled.** Instant suggestions used to depend on the
  deployment's `/api/proxy` relay, so they existed on Toolforge and nowhere else
  (a local `npm run preview`, a mirror, or any third-party host got search-only
  suggestions). `scripts/fetch-cim-allow-list.mjs` now writes
  `public/cim-allow-list.json` (1,775 categories, ~78 KB) and the loader tries it
  **first** — same-origin, instant, identical everywhere — with the relay as the
  live fallback and a direct fetch as the third try. Refresh with
  `npm run update:cim-allow-list`; `npm run check:cim-allow-list` and a test in
  `tests/param-lookup.test.mjs` guard count, shape, freshness (180 days) and that
  a flagship glam institution is still listed. A snapshot suffices because the
  list only *seeds* suggestions — the probe decides validity, and CirrusSearch
  finds what the list lacks.
- **The smoke test no longer needs a global tool.** `scripts/smoke-grid.mjs`
  drove the globally installed `playwright-cli`; it now drives the repo's
  `playwright-core` like `browser-matrix.mjs` and `smoke-panels.mjs` already did,
  so no suite depends on a global install whose engine revisions differ from the
  devDependency's (verified by running it with `playwright-cli` absent from `PATH`).

**Known limits / next slices:** suggestion quality is relevance-ranked, so a user
who types `Metropolitan Museum` gets the *general* category (correctly flagged ⚠)
rather than the CIM `Images from…` variant — ranking probe-verified candidates
first, or biasing toward collection-category patterns, is the obvious follow-up.
Slice 2: a **Finder widget** (a prominent search-and-pick card with result
previews, click-row → set-param — this is also where Quadrant 2 #9 lands, making
leaderboard/category rows drive the board). Slice 3: ISSUE-40 URL context params
(`?config=…&collection=Images from the Met`) so the box is shareable. Deferred:
project-aware `article` source (per-wiki), PagePile/PSID list params (#8).

## ISSUE-69 · Locked view-only kiosk mode (no UI path back to the editor) (GitHub issue #64) — **open**

**What:** a board mode for public workstations / museum terminals / locked iPads in
which a visitor has **no UI path** back to the editing interface, and an
administrator can unlock it with a deliberate gesture + PIN. Requested by Andrew
2026-09-10 ("truly a kiosk mode… you can always kick back out into the editing
interface today").

**Why the current modes don't cover it:** `?kiosk=1` / `?lean=1` *hide* chrome
rather than lock it. Live escape routes: the always-rendered ✕ Exit pill
(`App.jsx:742-746`), the Escape handler (`App.jsx:191-197`), and Exit stripping
`?kiosk`/`?lean` from the URL so a refresh lands back in the editor
(`App.jsx:177-189`). Chrome is hidden by CSS (`App.css:1753-1761`), not disabled,
and the Share panel's **Full board** variant (ISSUE-67) means a locked board's QR
can hand out an *unlocked* link.

**Proposed fix (decomposition — full detail in the GitHub issue):**
`lock=1` board flag composable with lean/kiosk (F1); every escape path disabled at
the **code** level, with handlers guarding on the flag and not merely hidden by CSS
(F2); lock-aware Share panel offering only locked links (F3); admin unlock via
hold-a-corner gesture → PIN keypad (F4, with PIN-storage options and a
recommendation: salted hash in the board JSON + a device-local unlock token);
content stays fully interactive while locked (F5: params, auto-refresh, galleries,
media, QR); optional view-only indicator (F6); kiosk profile + idle param reset
(F7). Browser E2E asserting the lock holds against Escape, direct clicks and the
Share panel, that unlock works, and that **reload re-locks**.

**Honest limit:** client-side code removes *UI* paths only — it is accident-proofing,
not a security boundary (devtools can edit state; the plain board URL still opens
the editor). Real deployments pair this with OS kiosk mode (iPad Guided Access,
ChromeOS kiosk) and/or serve the locked URL as the only published one.

**Note:** renumbered 68 → 69 — the docs-facts/lookup-params work took ISSUE-68 (merged as PR #68).

**Status:** open. Source: user direction 2026-09-10 (kiosk/view-only analysis).

## ISSUE-70 · Wikisource widgets: book navigation, proofreading progress, activity (GitHub issue #79) — **open**

**What:** a first set of Wikisource widgets, requested by Andrew 2026-09-11 while thinking
about which Wikimedia projects a dashboard serves well. Researched live: the API behaviour,
the cost of each readout, and the policy constraints are in the GitHub issue.

**Why Wikisource:** the content is a work in progress — a scanned book becomes readable
only as volunteers transcribe and validate it page by page — so "how finished is this?"
and "what should I do next?" are numeric questions spread over hundreds of pages nobody
wants to open one at a time. Measured: **one** `action=parse` of an Index page returns the
whole book's status breakdown *and* its page links (Wind in the Willows: 390 pages,
356 validated, 34 with no text; 111 KB). Per-page status and *who set it* come from
`<pagequality level="N" user="X" />` in batched wikitext (50 pages per request, 246 KB).
Live activity comes from `rcnamespace=104` with self-describing tags
(`proofreadpage-quality3`) and comments (`/* Proofread */`). There is **no usable status
API**: `prop=proofread` returns no payload, `list=proofread` is unrecognised.

**Proposed widgets:** `wsBookPages` (page-turner with ◀ ▶ and a page-number box — the
explicit ask, and cheap because the Index parse already carries the page list),
`wsProofreadProgress` (stacked bar + "356 of 390 validated"), `wsPageStatus`,
`wsActivity`, `wsValidationQueue` (pages at level 3 — the milestone that needs pairs of
eyes), `wsText` (a validated passage with proper attribution), `wsIndexBrowser`,
`wsAuthor`. Example boards: book-squad, reading, project.

**Gotchas:** level 0 (blank/plates) distorts denominators; level-3 detection is the weak
spot (no cheap query); namespace listings include subpages and image-based indexes; the
scan is **not** in the rendered `Page:` HTML (1249 bytes, 0 images) — it comes from the
file's `imageinfo` and the djvu page thumbnail. Open questions for the Wikisource
community are in the issue.

## ISSUE-71 · Wikivoyage widgets: static maps, itineraries, and closing the image gap (GitHub issue #80) — **open**

**What:** a first set of Wikivoyage widgets, same session/request. Researched live;
measurements and policy quotes are in the GitHub issue.

**Why Wikivoyage:** the guide is map-shaped and listing-shaped — structured points of
interest with coordinates, plus prose — and travel planning is the canonical "many small
numbers in a grid" problem. It also has a deliberate constraint to design around: see
`Wikivoyage:Image policy`, quoted in the issue — *"Travellers may be using Wikivoyage from
networks with low bandwidth, or with a cost for every MB used."* A board can carry the
pictures **outside** the article: measured, five Commons photos near Kyoto cost **16.0 MB**
at full size but **1.3 MB** at 800 px and **194 KB** at 320 px. The policy even names the
opening: *"Guidelines on minimal use of images do not apply to the 'image' tabs in
listings, which should be filled with the filenames of relevant images on Wikimedia
Commons whenever possible."*

**Measured feasibility:** the destination coordinate is one `prop=coordinates` call;
listings parse from one page fetch, but **coordinate coverage is wildly uneven** (Kyoto 3
of 9 rendered cards; Kyoto/Central 39 of 91; Aarhus 285 of 310; some itineraries 0) — so
maps must show their gaps. Static Wikimedia maps work from a browser with CORS
(`maps.wikimedia.org/img/osm-intl,…` → 200, `image/png`, 176 KB), as do route/region
GeoJSON (`geoline`/`geoshape`). **Policy:** `maps.wikimedia.org` *tiles* may only be
embedded on WMF/Affiliate-hosted sites (approval otherwise), but **static images may be
downloaded or hosted by anyone** under CC BY-SA 4.0 with attribution — hence static-first.

**Proposed widgets:** `wvMap` (static Kartographer map + attribution), `wvItinerary`
(numbered waypoints, track via GeoJSON, distances, and "N of M stops have coordinates"
so the map cannot lie by omission — the community's own expedition page lists itinerary
maps as *"Manually created, not slippy"*), `wvListings` (sortable table with missing-
coordinate and missing-image columns), `wvPhotosNearby` (Commons geosearch gallery with a
stated byte budget), `wvImageGaps` (the photo desk that fills listing `image=`),
`wvNearby`, `wvBanner`. Example boards: destination, itinerary, photo desk, kiosk.

**Gotchas:** count rendered `vcard`s, not `{listing}` (Kyoto: 3 vs 9); itineraries often
have no coordinates at all; pages can be huge (Aarhus: 237 KB wikitext, 469 `<img>`);
never ship a map without its attribution line; OSM/Overpass/Nominatim politeness applies
to anything we add.

## ISSUE-77 · Export: save a widget's data, or a widget/board as a document

> **Revised 2026-09-18 (print layout) — final state:** the 🖨 button is a menu of three shapes — **Board** (the
> board's own grid), **Poster** (one page, sized to the board) and **Document** (a card per row, at its own width) —
> the sheet **waits for the board to settle** before it is taken, and Board/Document **scale to the paper instead of
> reflowing it**. Met demo: Board 5 pages · Poster 1 · Document 7, every image loaded, no overlap and no reflow.
> Four rounds of fixes each hit the same class of mistake in a different place (inferred shelves, then a reflowed
> sheet, then reflowed cards); the invariants now live in the sweep's print pass, and the history is in
> `docs/VERIFIED-WORKING.md`.
>
> **Revised 2026-09-18 (print layout).** The board's print sheet used to make every card full width in DOM order;
> it now reproduces the on-screen grid — columns, spans and shelf rows derived from the live layout — so a row of
> cards stays a row and the PDF reads in the same order as the board (the Anne Frank / MLK demo: seven pages of
> stacked cards became the board's own flow). Two bugs came out with it: the sheet was only armed by the 🖨 button
> (⌘P printed react-grid-layout's clipped transforms), and a three-second disarm timer could fire **mid-print**,
> clearing the slots and producing a PDF with the very layout problem the sheet exists to fix. See
> `docs/EXPORT.md` and `boardPrintGeometry` in `src/lib/print.js`. — **done + DEPLOYED 2026-09-14**

**What:** a **⤓ export menu** on every widget — **PDF, CSV, PNG, SVG** — plus **🖨 Print / save as PDF**
on the board toolbar. Shipped with the Lifeline deploy (`index-CSKC-SIk.js`).

**The four formats, and what each can honestly do:**

| format | how | coverage |
|---|---|---|
| **CSV** | `src/lib/exportData.js` maps each payload shape (tables, object rows, chart series, gallery items, a stat, a timeline) to `{columns, rows}`; RFC 4180 quoting; the button only appears when rows exist | any widget with data |
| **PDF** | `src/lib/print.js` + the `@media print` sheet: the browser's print engine gives vector, selectable text — the best artifact for a report, slide or email | every widget, and the whole board (one card per page) |
| **SVG** | `src/lib/exportImage.js`: clone the widget, inline every computed style, wrap in an SVG `foreignObject`. `color-mix()`, custom properties and `position: sticky` all survive because a real CSS engine renders it | any widget that is not an iframe |
| **PNG** | rasterises the widget's **own** SVG at 2× | only widgets that draw themselves as SVG (CIM trend, file traffic, QR) |

**Why PNG is narrow — measured, not assumed:** Chromium **taints a canvas for any SVG containing a
`foreignObject`**, including one holding nothing but `<p>hello</p>` (`SecurityError: Tainted canvas`),
while plain SVG rasterises fine. So an HTML/CSS widget can produce a valid **.svg** but never a **.png**
in the page, and server-side rasterisers (resvg, librsvg) do not support `foreignObject` either. The menu
disables PNG for those widgets and says why, rather than failing after the click.

**A server-side render service was considered and rejected** — see [ISSUE-79](ISSUES.md) for the decision
and the four costs (it re-fetches the whole board per image, from a shared Toolforge IP; a browser in a
1 Gi pod that parses untrusted content; a permanent patching liability; and a server render is a
*re-render*, not a capture of the user's view). Practical alternatives are in
[EXPORT.md](EXPORT.md): screenshot your device, or convert the SVG locally.

**Traps paid for here:** inserting a helper above `function WidgetFrame(` put it between `export default`
and the component, so the module's default export became the helper and App rendered `saveCsv(props)` —
a boolean — for every card (no error, clean build, zero widgets on the page). A source-level test now
pins that export, and `tests/export-data.test.mjs` covers the row mapping, CSV quoting and filenames.

## ISSUE-95 · Settings: my wiki, recent wikis, present-mode fullscreen — **prototype shipped 2026-09-16**

Andrew asked for a Settings panel prototype, and ISSUE-93 left it owed: the project picker honours a *default wiki*
that had no UI, and the fullscreen behaviour of Present mode was a constant (`FULLSCREEN_ON_PRESENT`) rather than a
preference.

**Shipped as a prototype** (⚙ in the toolbar), with deliberately three things and no more — each of which existed
nowhere before, or only in a constant:

  1. **My wiki** — the project picker from ISSUE-93, reused verbatim (which is why the picker now lives in
     `src/components/ProjectField.jsx` rather than inside the widget frame). Choosing one records it as used, so the
     default and the recency list stay consistent by construction.
  2. **Recently used wikis** — shown, with "Make default" per row and a "Clear the list". A recency list you cannot
     see is a list you cannot fix.
  3. **Present mode: ask for fullscreen** — the old constant as a checkbox, defaulting to on so nothing changes for
     anyone who never opens Settings.

**And `translate` now emits its translation** (the concrete half of the ask): it computed `translation` and
published nothing, so a Markdown card or a Speaker could not consume it. `outputs: { kind: 'value' }`,
`emit: (data) => data.translation`.

**The bug the panel immediately surfaced:** the picker stored a recency entry as `jawiki` while the panel stored
`ja.wikipedia`, so the same wiki appeared twice and the ranking — which matches on the dbname — ignored one of them.
`recentKey()` now canonicalises on write *and* on read (so a mixed list from an older build self-heals), and a
language code is stored as itself. That is the argument for settings nobody can inspect being a bad idea: this was
found by reading `localStorage` after clicking around the panel, not by a test.

**Not built, on purpose:** a Settings panel is a place where features accumulate. The bar for anything else joining
it is that it is a preference *of the person* with no better home — a board option belongs in the board, and a
widget option belongs in ⚙ on the card.

## ISSUE-98 · Should a widget's display be a template? — **open, design only**

Andrew asked, looking at the 🌐 Translator showing original *and* translation: can we rearrange what a card shows —
a variable for the original, a variable for the translation, whatever format we want? "That might be a more advanced
thing for the future in terms of templating any kind of output."

**Answer for today: right, we don't have that — and there are exactly two levels of "templating" in the app now.**

| level | exists? | example |
|---|---|---|
| board-level interpolation in config fields | ✅ | `{{param}}` (a Board Controls value), `{{widget:id}}` / `{{widget:id#channel}}` (another widget's output) |
| per-widget display **choice** | ✅ since 2026-09-16 | the Translator's *Show* → original and translation / translation only / original only |
| per-widget display **template** — this issue | ❌ | `{{original}}` … `{{translation}}` with the user's own layout |

**Why the third is not just "more of the second":** it introduces a *second* templating language whose variables
belong to the widget rather than the board. The moment a card's template can reference its own fields, two questions
appear: what namespaces them (`{{original}}` vs the board's `{{param}}` — a collision is silent and confusing), and
what happens when the fields change (a template is now a contract with the widget's *internals*, which is exactly
what ISSUE-97 says a consumer should never depend on). It is also a UI-building language, and a small one becomes a
big one the first time someone wants a conditional.

**Recommendation:** keep the per-widget `display` **select** as the answer for a while — it covers the real request
(show less) with no new grammar, and it is inspectable. Revisit when a **third** widget wants one: the moment two or
three cards each hand-roll a variant of the same need, a template is cheaper than another select. The intermediate
step worth taking *first* is making the select's options data-driven per widget (the registry already knows its own
fields, so a card could offer "any combination of my fields" without inventing a syntax).

## ISSUE-97 · Structured values: a `type` inside the payload, not just a shape — **open, first payload shipped**

**Shipped 2026-09-16:** the 🌐 Translator now publishes `{ type: 'speech', text, lang }` on a `#speech` channel
beside its text, and the 🔊 Speaker reads it through a `source` field, chooses a voice for the language and can
speak new text automatically once armed. Measured in a browser with a fake voice roster: one click arms it, then
changing the article speaks the new translation in French (`fr-FR`, voice `Amélie`) with **no second click**.
Three things the implementation taught:

- **The channel is the whole point, and the bare id must keep its meaning.** A source field set to `translate` gets
  text only; `translate#speech` gets the typed value. `primary: 'translation'` keeps `{{widget:translate}}` meaning
  what it always meant, so the change is additive.
- **`primary`'s promise needed a test to survive** (it had already been broken once): a manifest-constitution test
  now fails a channel-mapped widget that declares no `primary`.
- **A `lang` field is not a wiki.** The project-picker gate (ISSUE-93) fired on the speaker's new language field,
  correctly by its own rule — which turned out to need two vocabularies: a *wiki* (`type: 'project'`, the picker)
  and a *speech tag* (`type: 'text', vocab: 'bcp47'`, matched against the device's voices). See
  `docs/WIDGET-DEVELOPMENT.md`.

**The original analysis follows.**

Andrew asked, after ISSUE-96's audit: we are emitting increasingly complex data — is that scalable? Do we know from
context whether something is a text block, a list, a category list or an image list? Does this demand a formal
schema and JSON on the wire?

**Measured, what we do now (2026-09-16):**

| | truth |
|---|---|
| the emitted values in the registry | **all primitives or arrays of strings** — a number, a paragraph, a URL, lines; no objects anywhere |
| how a consumer reads them | **shape sniffing** — `toLines()`/`countOf()` check `Array.isArray` and split strings |
| the declared `outputs.kind` | **documentation** — measured, nothing in the data path reads it |
| structure across the two paths | a `source` field delivers the value intact; `{{widget:id}}` stringifies it (arrays joined, objects JSON) |

**So the answer to "do we know from context?": no.** A consumer knows *that* it received a list, never *what the
list is about*. Categories, files and ranked rows are indistinguishable, and an object arrives as one long line of
JSON — which is not broken, but is not consumable either.

**Is it scalable?** For text, lines and counts — yes, and that covers 10 of the 42 widgets and most chains people
build. For the row-shaped emitters ISSUE-96 lists next (a ranking carries a **name and a count**; a file list carries
a name, a size and a URL; a revision list carries a user and a timestamp) — **no**, and the failure is quiet rather
than loud: the consumer gets JSON text where it expected lines.

**Proposed, in the smallest form that works:**

1. **A `type` inside the payload.** `{ type: 'ranking', rows: [{ title, count }] }`, `{ type: 'files', rows: [...] }`,
   `{ type: 'revisions', rows: [...] }`. The discriminator is the whole point: it turns a blob into a value a
   consumer can branch on.
2. **Beside the text channel, never instead of it** (channels, ISSUE-91). A ranking publishes `rows` (typed) *and*
   `lines` (the names, for a Filter or a Speaker) — so the existing consumers keep working and nothing already
   wired changes meaning. `primary` decides which one the bare id means, as it does now.
3. **A catalogue, not a schema.** One table in `docs/WIRING-BOARDS.md` (or a `DATAFLOW-TYPES.md`) listing each type
   and its fields. JSON Schema per channel would be honest and is not worth it yet: with one consumer per producer in
   practice, the discriminator plus a written shape is the 80%. Revisit if a third party starts publishing.
4. **What not to do:** never publish an anonymous object, and never make a consumer parse a producer's internals —
   both are the same mistake, and the `type` is what prevents them.

**How this compares.** Grafana and Tableau pass typed dataframes, but they own both ends of the wire. marimo and
Observable pass live objects, and have no persistence constraint. A WikiBento board has to survive a URL and
`localStorage`, which forces a serialisable wire — so *typed JSON* is the ceiling here, and the discriminator is
what makes it a type rather than a blob.

**Effort:** the discriminator plus the first three structured emitters (a ranking, a file list, an edit list) is
about a day, and it is best done *with* ISSUE-96's row-shaped work rather than before it — the first structured
producer is what tells us whether the type list is right.

## ISSUE-96 · Emitter/consumer audit: 12 of 41 widgets publish anything — **open**

> **Updated 2026-09-18:** the 🎞️ Commons Gallery (ISSUE-103) joined the emitters when it shipped — the gallery's
> captions as `lines` (a curated, human-written list, the best thing to feed a Filter, a Translator or a Speaker)
> and the clicked file as `selection`, on the ISSUE-91 channel pattern. 11 of 43.
>
> **2026-09-18:** 12 of 41 — the gallery gained `lines` + `selection` when it became the category source
> (ISSUE-104), and the family merged into one widget (ISSUE-105). Adding a channel to a widget that already existed is exactly the kind of
> progress this audit is for.

Andrew asked for an audit of "the obvious emitter/consumer functions". Measured from the registry 2026-09-16:

| | count | meaning |
|---|---|---|
| widget types | 42 | |
| **emit** something | **10** | qrCode, excerpt, wikiBox, iaItem, iaBook, documentReader, listSource, filterLines, lineCount, echo, and now `translate` (ISSUE-95) |
| declare a `source` picker (a *dataflow* consumer) | 3 | filterLines, lineCount, echo |
| can be **consumed** anyway | all | any text field interpolates `{{widget:id}}`, so a Translator or a Wiki Page does not need a picker to be a consumer |

**The conclusion that matters:** the *consumer* side is in better shape than the counts suggest — interpolation makes
every widget a potential consumer without new machinery. The **emitter side is the gap**, and it is the side that
makes a board feel alive rather than merely populated.

**The obvious emitters, in the order I would add them** (each is a one- or two-line `emit` plus an `outputs`
declaration, and each needs its data shape checked — that is the whole work):

| widget | should emit | kind |
|---|---|---|
| `translate` | the translated text | `value` — **done, ISSUE-95** |
| `articleList` | the article titles | `lines` |
| `quality` | the ORES grade (`GA`, `B`, …) | `value` |
| `assessments` | `WikiProject: grade` rows | `lines` |
| `gallery`, `fileGallery` | the file names | `lines` |
| `edithistory` | `user — summary` rows, or the users | `lines` |
| `topPages`, `topWikipedias`, `cimTop*`, `cimLeaderboard`, `wikistats` | the ranked names | `lines` |
| `sparql` | the result rows | `lines` |
| `waybackGallery` | the snapshot URLs | `lines` |
| `mediaPlayer`, `panorama360` | the file/URL being shown | `value` |
| `wikiPage` | the page it is showing (a **reference**, ISSUE-92) | `value` |
| `markdown` | its own text, like `qrCode` does | `value` |
| `pageviews`, `linkcount`, `categorySize`, `fileUsage`, `glamorgan` | the number | `count` / `value` — debatable: useful for a "how many" chain, noise otherwise |

**Not needed:** `speaker` (it says nothing a value could carry), `boardControls` (it drives *params*, which is a
different mechanism — see the param model in `docs/MODULARITY-AND-DATAFLOW.md`), and the widget families that
already publish URLs.

**Two rules that came out of doing this one:**

1. **Prose must publish a reference beside it** — already a gate (ISSUE-92). The same argument applies to any value
   that names a page: a title without its wiki is ambiguous once boards cross languages.
2. **A number is not automatically worth publishing.** Five statistics widgets could emit their number, and the
   question each needs is "what would consume this?" — a chain that counts something else is rare, while a *list*
   of names is the thing boards actually pipe into Filters, Galleries and Maps. That judgement is why this is a
   checklist rather than a manifest gate: a gate can check a rule, not a purpose.

**No gate for the gap itself**, deliberately. What a widget *should* publish depends on what it is about, and the
registry cannot know that; what it can know is already enforced (prose → reference; a declared output kind must be
in the documented set; a channel must exist if referenced).

## ISSUE-94 · The Article Excerpt: name it honestly, and let text hang from the top — **done + verified 2026-09-16**

Two things Andrew raised about the excerpt widget.

**1. The name.** His worry was that "excerpt" is too generic for a widget that we now have to distinguish from
Internet Archive books and Commons documents. Measured: the registry's own `name` has been **"Article Excerpt"**
all along, and the picker, the catalog and the guides all say that. What looks generic is the *type id* (`excerpt`)
— which is what appears in configs, in the emitter contract, and as the instance-id chip on the card once the
widget is on a board.

The philosophy question underneath it is worth answering, because the registry already answers it consistently:
**generic names for generic functions, specific names for specific sources.**

| generic (a function, indifferent to what it touches) | specific (one source, one API) |
|---|---|
| Text List · Filter Lines · Line Count · Value Display · QR Code | Article Pageviews · Article Quality (ORES) · **Article Excerpt** · Internet Archive Item · IA Book · Document Reader |

The excerpt fetches *one specific thing* — the summary endpoint of a Wikipedia article, in one language — so it is
correctly specific, and it should stay that way. The generic thing Andrew was reaching for is a *different* widget:
something that accepts a **reference** and fetches the right passage from whatever it names (a Wikipedia article, a
Wikisource chapter, an IA book page). That is possible precisely because of ISSUE-92, and it is filed there rather
than smuggled into this one.

**Done:** the description now says what it is and where it comes from — *"The first paragraph, short description
and lead image of a Wikipedia article (the REST summary API — every language, not just English)"* — so the picker
answers "which project?" without a doc. The **type id stays `excerpt`**: it is the config contract, referenced by
every board, demo, guide and by the emitter contract, and renaming it for cosmetics would break all of them (an
alias map would be the way to ever do it).

**2. Vertical gravity.** A short excerpt in a tall card was centred, floating in the middle of nothing. Measured:
`139px above, 139px below` in a 780px card.

**Done, as a general option rather than a special case:** the frame now reads `config.verticalAlign`
(`top` | `center`) and applies a class. Nothing changes for a card that declares nothing — so this is a per-type
decision, not a new house style — and the **Article Excerpt defaults to `top`**: measured after, `12px above,
524px below`. A top-gravity card also claims the full width, because a text column centred as a *block* reads as a
mistake even when it is vertically at the top. Verified in a browser at two settings and on the shipped
`translate-demo` board (12px above, nothing clipped).

**A trap worth recording:** the first attempt put the default in the registry and the *frame* read only the config —
so a board that omitted the field stayed centred, which is every existing board. A registry default has to be
honoured at render time, and the lookup must not reach for `def` twenty lines before it is declared (a TDZ crash,
which cost a debugging round and is why the frame looks the type's defaults up directly).

## ISSUE-93 · Every language, chosen quickly: the project picker — **done + verified 2026-09-16**

**What:** 21 of the 42 widget types ask which wiki to work on, and five of them restrict the answer to a hardcoded
list. Measured 2026-09-16:

| widget | options offered today |
|---|---|
| `topPages` | 30 (a hand-picked "top 30 languages") |
| `wikistats` | 13 |
| `pageviews` | 6 |
| `linkcount` | 3 |
| `categorySize` | 2 |

The wiki's own site matrix says how many there are: **374 languages, 364 wikis**, keyed by dbname (`enwiki`,
`dewiki`, `commonswiki`, `enwikisource`) — `meta.wikimedia.org` `action=sitematrix`, 121 KB, cacheable. So a
6-option select covers **1.6%** of what exists, and Andrew's report is exact: an Article Excerpt only offers
English, German and French.

**Why it matters:** the app's whole premise is Wikimedia content, and most of it is not in English. A widget that
cannot be pointed at `eswiki`, `arwiki` or `zhwikisource` is a widget that cannot be used by most of the movement.
This is an epic precisely because it touches 21 types.

**The design question Andrew raised, and the answer to build:** an alphabetical list of 364 is not a solution. The
picker should order by *usefulness*, not by alphabet:

1. **the projects this user has used recently** — the app already has exactly this pattern for widgets
   (`wikibento-recent-widgets` + a "Recent" section in the add panel); projects mirror it as
   `wikibento-recent-projects`;
2. **a user-chosen default** (one setting, "my wiki"), so the common case is zero clicks;
3. **a short curated list** of the languages that actually carry the most content, as suggestions rather than a
   limit;
4. **everything else, searchable** — type `zh` or `中文` or `wikisource` and it appears;
5. and the list must remain *complete*: inclusion is the point, ranking is only the convenience.

**Sketch:** one shared `src/lib/projects.js` — a cached `sitematrix` fetch (with a shipped fallback list so a first
run is never empty), `dbnameOf`/`projectSite` from `src/lib/reference.js` for naming, an MRU store, and a single
`type: 'project'` config field replacing the five hardcoded `select`s. Then a sweep of the 12 free-text project
fields to use the same field, so every widget is the same widget here.

**Related, and to do at the same time:** the scattered project→host logic. There is a shared mapping in
`src/lib/reference.js` (`projectSite`), but the older call sites each build a host by hand — `wikiPage` did
`https://${project}.org`, which turned a dbname into `https://enwiki.org` the moment a *reference* reached it
(found 2026-09-16 while shipping ISSUE-92). Every one of those should go through `projectSite`.

**Effort:** the picker is a day; the sweep across 21 types is another, mostly mechanical, and worth doing with a
gate (a test that no widget hardcodes a language list).

## ISSUE-92 · A page should travel with its wiki: references — **done + verified 2026-09-16**

**What:** values that name a page carried only the *title*. Measured 2026-09-16 across the emitters:

| emitter | what it published | context |
|---|---|---|
| `excerpt` | the article's prose | **none** — not even which article ✗ |
| `wikiBox` (`selection`) | `Weddell Sea` | **none** — no wiki, no language ✗ |
| `iaItem`, `iaBook`, `documentReader` | a URL | complete (a URL knows where it points) ✓ |
| `listSource`, `filterLines`, `lineCount`, `echo`, `qrCode` | text/number | not applicable ✓ |

**Shipped 2026-09-16 (the convention):** `src/lib/reference.js` defines the wire form — `enwiki:Weddell Sea`,
`dewiki:Weddellmeer`, `commonswiki:File:KM Virgo.jpg`, `wikidata:Q1094710` — using the **dbname**, because that is
what every Wikimedia API, dump and replica already calls these wikis (and `dbnameOf` accepts the app's own
`en.wikipedia` spelling, so nobody has to learn it). A bare title parses as a title, which is why nothing built
earlier changed meaning. The box's `selection` now publishes a reference, and a `wikiPage` **consumes** one: it
reads the project out of the value and wins over its own configured project — so a click in a box known to be
`dewiki` loads the German article. Verified end to end, including the bug this exposed: `wikiPage`'s hand-built
host produced `https://enwiki.org`, which is now `projectSite`.

**All three, shipped 2026-09-16:**

1. **The Article Excerpt publishes both channels** — `outputs: { extract: 'extract', reference: 'value' }`. Its
   paragraph goes out on `extract` (what a Translator or Speaker consumes) and the page it came from on
   `reference` — `enwiki:Albert Einstein`, built from the API's canonical title, falling back to the configured
   article. Prose is the one shape that cannot describe itself, so it no longer travels alone.
2. **Fifteen page-taking widgets accept a reference.** `pageviews`, `categorySize`, `excerpt`, `edithistory`,
   `quality`, `assessments`, `gallery`, `articleList` (per line, mixed projects noted below), the six `cim*`
   widgets and `documentReader` — all through one helper (`pageRef` / `resolvePageConfig`) rather than fifteen
   hand-rolled parsings. The reference wins over the widget's own project field, because a value that says where
   it is from is better evidence than a field the board was built with.
3. **The gate exists:** the manifest constitution now refuses a widget that emits prose without a `reference`
   channel beside it, so a new emitter cannot quietly drop the context the way this one did.

**The bug this found, and the boundary it drew.** `resolvePageConfig` returns the canonical **dbname** — and the
app's own fetchers build `https://${project}.org` from the *dotted* form. So the first sweep handed `enwiki` to
fifteen fetchers, every one of which produced `https://enwiki.org`: a DNS failure that looks nothing like a type
error, caught only by driving the demo. The resolver now returns both names — `project` (the wire form, for
anything published) and `projectConfig` (the dotted form, for anything fetched) — with a test that states the
boundary, and `projectSite`/`projectConfigOf` are the single place it is decided.

**Verified end to end:** an Article Excerpt on `Albert Einstein` publishes `enwiki:Albert Einstein`; a Value
Display reading `ex#reference` shows exactly that; a page viewer reading `{{widget:ex#reference}}` loads
`https://en.wikipedia.org/wiki/Albert_Einstein` — with no project configured on either consumer.

**Still open, and smaller:** a *mixed-project* list (an Article List whose lines name different wikis) is fetched
with the first line's project, because the fetcher takes one project per call; per-item fetching is its own
feature. And the twelve free-text project fields still take a bare project string — that is ISSUE-93's sweep.

**Why this is the important half of the two:** ISSUE-91 made a click able to mean something to the board; this is
what makes the meaning *unambiguous* once boards cross languages, which is the normal case for Wikimedia content.

## ISSUE-91 · Clicks on rendered Wikimedia content: what should they do? (and formal widget classes) — **open**

Andrew clicked a link inside a `wikiBox` ("Weddell Sea" in `{{List of seas}}`) and the **whole board was replaced**
by that page. He asked for options — new tab, load it into another widget, or send the string to a widget that does
something else with it (a map, a gallery) — then widened it: this should be a general pattern wherever we render
Wikimedia content, and it raises the question of whether widgets should have **formal classes** with expected
behaviour.

### Shipped 2026-09-16: the link no longer eats the board

Measured: **36 places** in `WidgetFrame.jsx` already render content links with `target="_blank"`, and the page
widget keeps its browsing inside its own frame — `wikiBox` was the exception because the markup is MediaWiki's own.
Every box's anchors are now rewritten to `target="_blank" rel="noopener noreferrer"` before sanitising (so the
attribute survives the allowlist), an anchor that asks for another target is respected, and a box that is a *list of
seas* is a nice demonstration: 155 article links, all of which now open without losing the board. Verified in a
browser: click → new tab, board intact with all five cards.

### The audit: who faces Wikimedia content, and what can we do about a click?

| how a widget presents wiki content | count (2026-09-16) | what a click can do today |
|---|---|---|
| Content links rendered by us (cards, tables, galleries, lists) | **36 sites** | new tab ✓ — the app's house rule |
| Remote markup rendered inline (the box pipeline) | 5 uses (`wikiBox`) | new tab ✓ (shipped above) |
| A wiki page framed in an iframe (`wikiPage`, panorama, media player) | 3 | nothing: **cross-origin, we cannot see the click** ✗ |
| Widgets that emit a value | 10, **all computed from data** | no widget emits *because the reader clicked something* ✗ |
| Widgets that accept a source widget (`source`) | the dataflow set (textList, filterLines, lineCount, valueDisplay) | they can be wired widget→widget ✓ |

Two conclusions worth committing to: **the iframe path is a dead end for interaction** (worth saying plainly, since
`wikiPage` was Andrew's example — a *page* viewer cannot participate unless it is re-rendered inline, and a whole
article is **107 KB** of HTML versus 8–23 KB for a box, so that trade is a separate decision, not an oversight);
and **the missing capability is not the link, it is an interaction channel** — a click that means something to the
board rather than to the browser.

### Shipped 2026-09-16: the interaction channel (steps 1–3)

Built in the order proposed, on the widget where the problem appeared:

1. **Named output channels.** `outputs` now takes either `{ kind }` (unchanged, and what every existing emitter
   still declares) or a channel map — `wikiBox` publishes `{ items: 'lines', selection: 'value' }` and returns
   `emit: (data) => ({ items: … })`. A channel is stored under `id#channel`, resolved as `{{widget:id#selection}}`,
   offered in the source picker as `id#selection`, and the rename path repoints it. Three gates learned the shape:
   the manifest-compliance check, the registry emit check, and the demos constitution (which now refuses a
   reference to a channel a widget does not declare — a typo in a channel is as broken as a typo in an id).
2. **A click hook.** The frame passes `onSelect` into the card layer; the box's delegated handler reads the clicked
   anchor and `boxLinkSelection` turns `/wiki/Weddell_Sea` into `Weddell Sea` (namespace-aware: File:/Category:/
   Template: links report their kind, and an off-wiki link keeps its display text).
3. **A `linkAction` field**: *new tab* (default) · *send to the board* · *both*.

**Verified end to end (the screenshot in `docs/screenshots/wikibento-2026-09-16-click-through.png`):** clicking
"Weddell Sea" in a live `{{List of seas}}` card (161 article links) loaded the article in the page viewer beside it
and put `Weddell Sea` in a Value Display card — the exact scenario, with the board intact.

### What remains from this issue

4. **Consumers that take a value as their *subject*** — a `wikiPage` whose page is `{{widget:…}}` works today
   through generic interpolation, but fields that are *about* a selection (a gallery's title, a map's target)
   deserve to say so in their own config hints.
5. **The `class:` field** — the taxonomy below, now that the `interactive` class has an implementation to describe.

### What the interaction channel took (the original plan)

1. **Named output channels** — the blocking change. Today `outputs` is one kind per widget and `emit` is a pure
   function of the fetched data, so "the box emits its items" *and* "the box emits what you clicked" cannot both
   exist. Proposed: `outputs: { items: 'lines', selection: 'value' }`, `emit: (data) => ({ items: … })`,
   `onOutput(id, channel, value)`, and `source: 'fp-itn#selection'` for the consumer — with the 10 existing
   emitters keeping their meaning (a widget with one channel is the common case and stays unchanged).
2. **A click hook in the frame** (`onSelect(widgetId, value)`) plus a delegated handler in the card that reads the
   clicked anchor and turns `/wiki/Weddell_Sea` into `Weddell Sea` (a pure function, `boxLinkSelection`).
3. **A `linkAction` config field**: `new tab` (default, shipped) · `send to the board` · `both`. The reader decides;
   nothing about the default changes.
4. **Consumers that accept a value**: a `wikiPage` taking its page from a source, an article gallery taking its
   title, and later a map. Today `source` exists only for the dataflow widgets, so this is the other half of the
   pattern.
5. **Tests**: the click→emit→consume path end to end (extend `scripts/url-state-audit.mjs`-style driving rather than
   a unit test, since the whole point is that a human gesture does something).

Effort: **1.5–2 days** for the pattern on `wikiBox` plus one consumer; the link fix above was the 20-minute part.

### Formal widget classes — proposed

The registry already carries half a taxonomy (`nodeKind`, `category`, `timeScope`, `outputs.kind`, `emit`, `source`,
`intensity`) and the docs gate *derives* the static/data-driven split rather than trusting prose. What is missing is
a class whose *rules* are checkable, so a new widget of a known class arrives with known behaviour. Proposal:

| class | what it is | rules a test can enforce |
|---|---|---|
| `measure` | fetches numbers/facts and displays them (the 33 data-driven widgets) | declares freshness + error handling; exports its data |
| `content` | renders *someone else's* markup (`wikiBox`) | must go through sanitise + scope; links follow the house rule; carries a credit link |
| `framed` | embeds a page or player it cannot see into (`wikiPage`, panorama, media player) | declares `sandbox`/`allow`; **says so** when it cannot intercept clicks |
| `control` | params and dataflow nodes (`boardControls`, textList, filterLines, …) | declares its output kind/channels; no network without a reason |
| `present` | renders from config only (`markdown`, `qrCode`, `speaker`) | no fetch; safe to place anywhere |
| `interactive` | its content is a list of things the reader picks (`wikiBox` with `linkAction`, galleries, search results) | declares a `selection` channel and what a click does when nothing is wired |

The value is in the last three: they are the ones with expectations that are currently unwritten, and each row above
is a source-level assertion (the class of a widget can be checked against how it renders), not a convention.

### Shipped 2026-09-16

**One picker, all 364 wikis.** `src/lib/projects.js` holds the ranking rules (pure, 20 tests) and
`fetchProjectList` the loading (localStorage mirror for 30 days → a cached `sitematrix` fetch → the shipped
shortlist if both fail, so a picker is never empty). Measured live: **951 projects** in the mirror, the full matrix
rather than the 7-entry fallback.

**Ordered by usefulness, not alphabet** — the thing the issue was actually about. Recency (the user's own, on
`wikibento-recent-projects`, mirroring the widget MRU that already existed) → their **default wiki** → the curated
shortlist → everything else, alphabetical only *within* its group. Search matches a label, a dbname, a language
code, a **script** (`العربية`) or an English language name, ranked so an exact hit leads: measured, typing
"chinese" returns *Chinese Wikipedia*, *Chinese Wikibooks*, *Chinese Wikinews*.

**Every one of the 21 project/language fields uses it** — the five hardcoded lists (`topPages` 30, `wikistats` 13,
`pageviews` 6, `linkcount` 3, `categorySize` 2) and the twelve free-text fields, plus the two `lang` fields in
language mode. The three hardcoded constants are **deleted**, and a manifest-constitution test fails the build if a
new widget types out its own list again.

**Traps worth keeping:**

  · **The site matrix returns *native* language names** (`中文`, `العربية`), so typing "chinese" matched nothing at
    all — the reason every option now carries both (`Chinese Wikipedia (中文)`) and search looks at both;
  · the picker **cannot be a `<datalist>`**: the browser filters on the *value* (`de.wikipedia`), so "German" finds
    nothing. It is a small combobox instead;
  · **two of my edits were silently lost** to a later failed assertion in the same script (the loader's import, and
    an earlier one): the symptom was a picker offering 7 options and a loader that threw into its own `.catch`. The
    fix is the discipline the repo already documents — one edit per script, assert, then **grep to confirm**;
  · a project field is **no longer enumerable**, so the Ask normaliser stops dropping unknown wikis: it fixes
    shapes and near misses (`Commons` → `commons.wikimedia`, `German` → `de.wikipedia`) and passes the rest through,
    because the widget's own error state is the honest guard and the picker is what keeps the UI tight.

**Still open, deliberately:** the Ask path can still hallucinate a project (it is passed through, then reported by
the widget); and the *default wiki* setting has no UI yet — a stored preference the picker honours, with the
setting itself left for whoever wants a Settings panel.

**Recommendation:** do (1)+(2)+(3) first — that is the pattern Andrew described, on the one widget where he hit it —
then add the `class:` field with the enforcement above, because the class rules make more sense once the
interactive class has an implementation to describe.

## ISSUE-90 · Render a Wikipedia template faithfully — the In the news box — **done + verified 2026-09-16**

**Ask:** "Can you make a widget for a specific template or box to render correctly, like the In the news box on
the Main Page?"

**Answer, measured first:** it is a *general* mechanism, not an ITN special case, because one API call returns
everything a faithful render needs — `action=parse&text={{In the news}}&prop=text` gives the box's HTML **with its
TemplateStyles already inline** (2 blocks, 2.5 KB for ITN). Parsing a *transclusion* rather than the template page
is what keeps the documentation box and the categories out of the result.

**Shipped:** a 📰 **Wikipedia Box** widget (`wikiBox`) that renders any template with the wiki's own markup and
styles, five cards of it in `public/front-page-demo.json` (linked from the hub and the README), and a
`sanitize + rewrite + scope` pipeline in `src/lib/wikiBox.js` (25 tests, incl. one over the real API response).
The box also **emits** one line per item, so it can drive a dataflow board.

**What made "render correctly" the hard part** — three traps, all in DATA-SOURCES §30 and HANDOFF gotchas 24–25:

  1. wrapper templates (`{{Picture of the day}}`, `{{On this day}}`) only render on the Main Page and otherwise
     return a maintenance notice — the dated subpages (`POTD/{date}`, `…/Selected anniversaries/{monthname} {day}`)
     return the real boxes;
  2. `{{CURRENTYEAR}}` magic words work on the wiki but collide with board params here, hence the widget's own
     `{date}`-style tokens;
  3. the API returns relative and protocol-relative URLs, which left alone would send readers to wikibento rather
     than Wikipedia.

**Also fixed on the way:** the sanitiser was re-emitting closing tags as opening ones (`</p>` → `<p>`), which
doubled every element while the text still read correctly — caught by asserting an idempotent round-trip on a small
markup fixture, and visible in the real data as an item count of 30 instead of 15. And the card had to fight the
app's own `.widget-body` centring, which floated the box in the middle of a tall card.

**Not built:** parameterised boxes beyond the token set (e.g. passing a count to a template) — the `box` field
already accepts a full invocation, so that is a documentation question until someone needs it.

## ISSUE-89 · Sharing a big board to a phone — the QR failure has better answers than "trim your board" — **done + verified 2026-09-16**

**What:** when the board's self-contained link exceeds `QR_MAX_CHARS` (1,500), SharePanel says:

> ⚠ Link too long for a QR code (4,012 chars). Trim the dashboard to fewer/smaller widgets, or load a hosted
> `?config=` URL and share that instead.

Both suggestions push work onto the user — trim the board you built, or go host a JSON file yourself. Andrew
asked the right question: what *other* ways are there to get a board onto a phone?

**Why it fails at all.** The link IS the payload: `#/d/<base64url(JSON)>`. Measured against the 15 boards in
`public/` (which `qr.js` already handles well *within* its limit — `fitEcLevel` walks the EC ladder H→Q→M→L,
and the 1,500 cap is a deliberate refusal because "an unscannable QR is worse than no QR"):

| board | JSON | gzip | **gzip+base64url** | base64url today | fits a QR today | would fit (gzip, EC L = 2,953 B) |
|---|---|---|---|---|---|---|
| `dashboard.json` (42 widgets) | 11,384 | 2,738 | 3,651 | 15,179 | ✗ | ✗ (still over) |
| `internet-archive-demo.json` | 4,645 | 1,701 | 2,268 | 6,194 | ✗ | ✓ |
| `document-reader-demo.json` | 3,863 | 1,638 | 2,184 | 5,151 | ✗ | ✓ |
| `glam-demo.json` | 3,013 | 912 | 1,216 | 4,018 | ✗ | ✓ |
| `article-vitals-demo.json` | 2,202 | 701 | 935 | 2,936 | ✗ | ✓ |
| …15 boards | | | | | **1 of 15** | **13 of 15** |

So the payload is compressible by ~3–4× and **that alone moves this from "almost never works" to "usually
works"** — the board is the same, only its encoding changes.

**Options, ranked by what they fix per unit of effort:**

1. **Compress the embed** — add a `#/z/<base64url(gzip(JSON))>` payload beside `#/d/<base64url(JSON)>`. Measured
   **13 of 15** boards fit a QR afterwards, and every share link gets shorter for email, slides, chat and the
   clipboard too. `DecompressionStream` is present in **Chromium, Firefox and WebKit** (verified in all three
   engines on this machine, gzip round-trip included), so the only fallback needed is a friendly message for a
   pre-2023 browser — and `#/d/` stays readable, so old links keep working. **No server, no policy, ~half a
   day** (encode on share, decode at boot, tests, EC/`QR_DENSE_CHARS` review).
2. **Publish a board → short link** — `POST /api/boards` stores it content-addressed, `GET /b/<id>` serves the
   JSON with CORS, and Share hands you `?config=https://wikibento.toolforge.org/b/9f3k2` — a ~60-character URL.
   That is the *only* option that covers everything: `dashboard.json` compresses to 3,651 bytes and the widget
   manifest to 11.5 KB, so neither can ever fit a QR. It also makes the QR a crisp few-module code that a phone
   scans instantly, plus a link you can read out loud. Costs: storage, retention, and a policy decision —
   **publishing makes a board publicly fetchable at an unlisted URL**, and a config can name a wiki page
   someone considers private. Recommended shape: an explicit **Publish** action, random unlisted ids, a TTL.
   The Toolforge server already has the `/api/*` route pattern (`deploy/server.js`), so it is 1–2 days
   including the policy. *(A third-party paste host could stand in for the storage, but CORS, permanence and
   abuse are outside our control — worth a look before building our own.)*
3. **Zero-code paths that work today, and belong in that message** — the failure text should offer the
   transfers that have no length limit at all:
   * **Export → AirDrop the `dashboard.json` to the phone → ⬆ Import** (file transfer, so 4,012 chars is not a
     concept);
   * **copy the link and paste it on the phone** (Universal Clipboard, or send it to yourself in
     Signal/WhatsApp/Telegram/Mail) — long text pastes fine even when nothing auto-links it.
4. **Web Share API** (`navigator.share`) — one tap opens the OS share sheet (AirDrop, Messages, Mail, or any
   app on mobile). Feature-detected; present in Safari/Chrome on macOS. Most useful *after* 1 or 2, because
   some share targets truncate very long URLs.
5. **Animated / chunked QR** (the BC-UR / `txqr` family) — a real technique, used by crypto wallets: the
   payload is split across many QR frames and read as video. It needs a *receiver* that speaks the protocol, so
   for a web-app target we would have to build the receiving side (camera UI + reassembly). Recommend against:
   option 2 is better on both effort and UX.
6. **Raise the cap / force a lower EC level** — mostly already implemented (`fitEcLevel` degrades H→Q→M→L
   automatically). Byte mode tops out at 2,953 bytes (EC L) and a version-40 code is 177×177 modules, so the
   1,500 cap is a reliability choice, not a spec limit. Raising it *without* compressing turns a clear refusal
   into a dense code that may or may not scan — the worst outcome — so it should follow 1, never replace it.

**Recommendation:** do **1** and **3** together (self-contained, no policy, ~a day: better links everywhere plus
an honest message), then decide on **2** — it is the only thing that covers every board, and it needs a
decision about boards being publicly fetchable that is Andrew's to make.

**Shipped 2026-09-16 — options 1 and 3.**

1. **The compressed embed** (`#/z/<gzip+base64url>`, `src/lib/share.js`). `buildCompactShareLink` picks the
   shorter of the two forms (a tiny board genuinely loses to the gzip header, so it is a comparison, not a
   preference), the plain `#/d/` form keeps loading forever, and a browser without `DecompressionStream` gets a
   readable error naming the alternatives. Boot accepts both (`src/App.jsx`), and `urlState` treats `#/z/…` as
   the same claim in another encoding — including `stripBoardClaim`, which drops either form.
2. **The message** (`src/components/SharePanel.jsx`) no longer asks the user to trim their board or go host a
   file. It says what is true — a QR has a hard limit — and offers the two transfers with no length limit:
   copy the link and paste it on the phone (Messages/Mail/Signal/WhatsApp), or ⬇ Export → AirDrop the
   `dashboard.json` → ⬆ Import. A hosted `?config=` board is mentioned as the shortest path, not as homework.
3. **Option 2 (publish → short link) is not built** — it is the only thing that would cover *every* board (the
   42-widget catalogue compresses to 3,651 bytes and the manifest to 11.5 KB, neither of which can ever fit a
   QR), but it needs a decision about boards being publicly fetchable. Still open below.

**Measured, end to end:** the reported board (`glam-demo.json`, whose plain link was 4,012 characters) now
shares as a **900-character** `#/z/` link and **renders a QR**. Across the 15 boards in `public/`: plain
base64url fit a QR for **1**, the compressed form fits **13**. The audit traces it (`Share a big board`), the
unit suite holds the numbers down (`tests/share-embed.test.mjs`), and the app still *refuses* the two boards
that genuinely cannot fit rather than rendering a dense unreadable code.

**The trap this cost, now gotcha 23 in HANDOFF:** a `CompressionStream` backpressures, so closing the writer
before anyone reads the readable deadlocks — the promise never settles, no error is raised, and the panel
quietly fell back to the uncompressed link. 1.6 KB of gzip hung; a 15-byte test string did not; and **Node does
not reproduce it**, so the unit tests were green while the app was broken. The live audit is what caught it.

**Still open from this issue:** option 2 (publishing), which is the only fix for boards beyond even a
version-40 QR; and the `?page=` style deep links it would make cheap.

## ISSUE-88 · A shared link must not overwrite the visitor's board — **done + verified 2026-09-16**

**What:** opening someone's `?config=` / `#/d/…` link **persists it over the visitor's own saved board**.
Boot ends with `apply(...)`, and `apply` writes `localStorage`, so a demo or a colleague's board silently
replaces whatever the visitor had been working on. Nothing on screen says so; the loss shows up on the next
visit without the param.

**Why it matters:** the entry board is described as "your board", and one click on a link destroys it. This
is the same class as ISSUE-87 — the app treating a URL as state to adopt rather than as a document to show —
but it costs data rather than correctness, which makes it worse.

**Found:** while building the ISSUE-87 audit (the inventory asked "does this action affect the URL?" and the
answer for *loading* turned out to be "it adopts it, permanently").

**Decided behaviour (pick one and write it down):**
1. **Preview, then adopt on first edit** — a URL-loaded board is held as "borrowed"; the visitor's saved
   board stays untouched until they change something. Recommended: matches the mental model of clicking a
   link, and the change is visible (the address bar claim already drops on that first edit, ISSUE-87).
2. **Always adopt, but keep the previous board** under a second key with a "restore my board" affordance.
3. **Adopt only when the visitor has nothing saved** — cheapest, but silently ignores the case that matters.

**Warnings, notices and reversibility — decided 2026-09-16 (do not re-litigate while building).**

Andrew asked whether a warning popup should tell the user what is about to happen. Answer: **inform, yes; pop
up, no** — and the codebase already carries the rule that decides this. It has two idioms:

* a **`ConfirmDialog`** for ↺ Reset ("clears the current board … cannot be undone") and for Rename (which
  repoints every `{{widget:id}}` reference). Both are *deliberate, in-app, irreversible* acts: the user pressed
  a button whose permanence is obvious;
* an **`assembly-toast` with Undo** for the Ask/assembly path — an *incidental* change that is cheap to reverse.

Loading a link someone sent is **incidental** (you clicked a link, often just to see what it is) and it can be
**made reversible**. That puts it in the undo/preview idiom, and a modal is the wrong shape for four concrete
reasons:

1. **It would fire where there is nothing to lose** — a first-time visitor, or anyone browsing the hub with an
   empty board. A warning that appears when nothing is at risk is how the warning that *matters* gets clicked
   through.
2. **The demos hub is ~13 links.** A confirm per click makes sampling the demos — the front door — hostile.
3. **A warning is a substitute for reversibility, and a worse one.** It arrives before you know whether you
   want the board, it can be dismissed reflexively, and it cannot help the person who clicked three days ago.
   Information must not be the load-bearing part of the safety.
4. **A modal on navigation** steals focus at exactly the moment a browser would normally just follow a link.

So, in the order of what actually protects the visitor:

1. **The non-destructive default (option 1) is the protection.** Nothing is overwritten until the visitor
   edits, so there is nothing to warn about.
2. **A slim, named notice while the board is borrowed** (never a modal): *"Viewing a shared board — Document
   Reader demo. Your own board is saved and untouched."* with **[Save this as mine]** and **[Back to my
   board]** (which drops the URL claim and restores). Shown only when *both* hold — a URL board is loaded
   **and** a different board is saved — so it never appears for a first-time visitor and never repeats once the
   choice is made. Reuse the existing banner/toast slot rather than inventing a component.
3. **Expect an implicit adoption to be one-deep recoverable.** The visitor edits the borrowed board, and that
   *is* the adoption — so keep the board it displaced under a second key. That is what makes **[Back to my
   board]** work even *after* someone has started editing, which a banner alone cannot cover.
4. **A confirm is earned in exactly one case:** the explicit **[Save this as mine]** would discard *unsaved*
   edits made on top of the borrowed board. Then a `ConfirmDialog` is right — and it must **name the two
   boards** ("Replace *My board* (4 widgets) with *Document Reader demo* (5 widgets)?"), because "are you
   sure?" tells the user nothing they can act on.

**Verification:** load `?config=…` in a browser with a saved board, assert `localStorage` is unchanged after
load (and that the board on screen is the URL's); then make an edit and assert it is adopted; assert the
borrowed notice appears **only** in the borrowed state (not on a first visit, not after adoption), and that
**[Back to my board]** restores the displaced board after an edit. Extend `scripts/url-state-audit.mjs` rather
than writing a new script — it already drives this exact path.

**Shipped 2026-09-16** — option 1 plus the notice, in three steps:

1. **Borrowed semantics.** `apply(..., { persist: false })` for a URL board; the visitor's own board is read
   *unconditionally at boot* (a ref cannot survive the navigation, and on a URL load `loadSaved()` never runs —
   the first attempt's bug was adopting with nothing "displaced" because the board it should have protected had
   never been read); the first edit adopts, because `persist()` is both the single write path and the single
   adoption point; the displaced board goes to `wikibento-previous-board` for a day. `borrowed` is mirrored in
   a ref set *synchronously* with the state — an effect update lags a render, and a mount-time write slipped
   through that gap. react-grid-layout's mount-time placement no longer persists (the same trap ISSUE-87 hit on
   the claim path), so only a real gesture writes.
2. **The notice** (`src/components/BoardNotice.jsx`): *"👀 Viewing a shared board — GLAM. Your own board is
   saved and untouched — edit anything to make this copy yours."* with [Save this as mine] and
   [Back to my board]. Shown only when `noticeState` finds something at stake, so a first-time visitor sees
   nothing at all.
3. **Recovery** — after an adoption the bar becomes *"💾 Your previous board is saved — recoverable for
   today."* with [Restore my board] (and a ✕ that drops the recovery, as its tooltip says).

**Correction to the section above:** the one case that was going to earn a `ConfirmDialog` — "[Save this as
mine] would discard unsaved edits on top of the borrowed board" — **dissolved once the default became
non-destructive**. Editing *is* adopting, so there is no in-between state holding unsaved work, and the
displaced board is recoverable, so nothing in this flow is irreversible. A confirm is for acts that cannot be
taken back; there are none left here, and no dialog was built. If a future change makes an adoption
irreversible, that case comes back and the dialog with it.

**Verified:** `npm run smoke:url` traces 17 actions with 0 invariants broken, six of them ISSUE-88's own —
no notice for a first-time visitor; a link leaves the saved board untouched; the saved board is still there on
the next plain visit; [Back to my board] restores it and clears the claim; the first edit adopts *and* stashes
the displaced board *and* switches the notice to recovery; [Restore my board] puts it back.

## ISSUE-87 · The URL as a claim about the board (audit + contract) — **done + verified 2026-09-15**

**What:** ↺ Reset blanked the board but left `?config=/demos.json` in the address bar, so a reload or a
shared link resurrected the board the user had just discarded. Andrew asked the right general question —
"recommend a plan to audit every point where clicking something may or may not want to affect the URL" —
because the reset button was only the visible symptom.

**Why:** the app has exactly one URL writer (`history.replaceState`, stripping `?kiosk=1`/`?lean=1` on Exit)
and reads the URL once at boot. Everything else the user does lives in React state + `localStorage`, so the
address bar was a **claim nothing kept honest** — and it is the artifact people copy, bookmark and e-mail.

**The second instance found while auditing:** SharePanel preferred the `?config=` URL whenever one was
present ("dramatically shorter than the hash form"), so loading a demo, editing it and hitting Share handed
the recipient the *file's* board rather than the one on screen. Same lie, opposite direction, and this one
reached a second person.

**Shipped (2026-09-15):**
- `src/lib/urlState.js` — the contract as data (`URL_STATE_CONTRACT`, `NEVER_IN_URL`), `parseUrlState`,
  `boardClaim`, `boardFingerprint` (built on `savedBoardPayload`, so "does the URL match the board?" and
  "what would a reload restore?" cannot disagree), `claimIsFresh`, `stripBoardClaim`, `setParams`, and
  `applyUrl` — the single writer.
- Reset and wholesale replacement drop the claim; **every** board edit drops it too (an effect on the
  fingerprint), so the URL never describes a board that is no longer there.
- Share builds its link from the board: `#/d/<payload>` once the claim is stale, the short `?config=` URL
  only while it is still true; the QR hint follows the same decision.
- `docs/URL-STATE.md` — the six rules, the **complete action-by-action inventory** (including the decided
  *no* cases: zoom, page number, panels, sort, toasts), the design questions, and the measurement plan.
- `tests/url-state.test.mjs` (19 tests, one of which walks `src/` and fails if a second URL writer appears)
  and `npm run smoke:url` (`scripts/url-state-audit.mjs`), which drives the real app and prints the traced
  table. It caught a real crash during development (`claimIsFresh is not defined` — an import that silently
  did not land) that no unit test would have seen.

**Open questions moved out, not forgotten:** deep-linking a document page (`?page=19`) is a *reference*, not
a view preference, and is worth doing in the share path when someone asks to cite one; Back-button undo is
refused on purpose (C6) while the app is not URL-driven; ISSUE-88 is the data-loss sibling.

**Verification:** `npm run smoke:url` — 12 checks, 9 actions traced, 0 invariants broken.

## ISSUE-86 · Duplicate a widget — and copy/paste one between boards — **open**

**What:** Andrew's request: *"sometimes you've made a widget and you want to make another one based on one that
exists already … once you're in the zone and creating a lot of content, there should be this desire to do
another excerpt from an article, let's do another graph, another chart."* So: **⧉ duplicate** in place, and
ideally **copy → paste** into another board or tab.

**What exists today (read out of the code):**

| mechanism | detail |
|---|---|
| adding one widget | `AddWidgetPanel`: `id = \`${def.id}-${Date.now()}\``, layout `{x: 0, y: Infinity, …registry defaultLayout}` — the `y: Infinity` is what lets react-grid-layout drop it into the next free row, so placement is already solved |
| whole-board paste | ⬆ ImportPanel + ⬇ Export, gated by `validateDashboard` (which already rejects **duplicate widget ids** and duplicate layout entries) |
| **assemblies** | `handleAddAssembly`: applies a multi-widget spec with an **`idMap`** (spec id → new id) and a **`paramMap`** (spec param → board param), validates the *resulting* board, and offers an **undo toast** |
| widget-level copy/duplicate | **none** — the card toolbar is ⓘ ⚙ ⤓ ↻ ✕ |
| keys | only `Escape` (present mode / panels) — ⌘C/⌘V are unclaimed |
| tabs | **no `storage` listener**, so two tabs on one board are last-write-wins |

**→ So the cheapest correct implementation reuses the assembly path, it does not write a new one.** A duplicate
is a one-widget spec run through `handleAddAssembly`: id remap, param remap, validation and undo already exist.

**Four questions, and what I would do:**

1. **Same-board duplicate first** — a **⧉** button in the toolbar. It covers the "another excerpt" case, needs
   no clipboard, and is safe because **`{{widget:id}}` and `source` references stay valid**: the original still
   exists. Take the layout from the source card's *current* cell, clamped by the registry's `minW/minH/maxW/
   maxH`, so the copy looks like what you were looking at rather than the registry default.
2. **Then clipboard copy/paste.** Payload: **one self-contained widget object** (`{id, widgetType, config}`) —
   the same shape as a `dashboard.json` entry. Write with `navigator.clipboard.writeText`. For reading, prefer
   a **UI box** (the ImportPanel precedent) over `navigator.clipboard.readText()`: the async clipboard needs a
   permission and a gesture and is uneven across browsers, and a paste box also covers *"paste a widget someone
   sent me"*.
3. **Cross-tab: yes — the transport is free, the references are the work.** The clipboard is shared, so pasting
   into another tab works. Two caveats: (a) a widget from *another* board can carry a `{{widget:id}}`/`source`
   reference that board does not have, or a `{{param}}` that is not declared — the app already has the words
   for this (`findUnresolvedRefs` / `describeUnresolvedRefs`), so the paste should **say so and offer to bring
   the referenced widget along** (the `idMap` is exactly the mechanism) rather than quietly producing a broken
   card; (b) **no cross-tab sync** — two tabs of the same board are last-write-wins on `localStorage`, so a
   paste in tab B can be erased by tab A's next write. Pre-existing, but it is the reason same-tab duplicate is
   the safe default.
4. **Keyboard last.** ⌘D/⌘C/⌘V only if the ⧉ button proves insufficient: the handler **must ignore events
   while focus is in an `<input>`/`<textarea>`** (the board is full of config fields and the Import box, and
   typing "c" in a SPARQL query must not copy a card), and ⌘C with a text selection inside a card should copy
   the *text*, not the widget.

**Traps:**

- **`Date.now()` ids collide within the same millisecond** — a latent bug that a duplicate button makes easy to
  hit (double-click). Fix while here: a counter or a random suffix. `validateDashboard` catches it, but only
  afterwards.
- The registry's `minW/minH/maxW/maxH` must travel with the copy (the 360° viewer needs a minimum size).
- Auto-height cards (`lastAutoH`) re-measure on mount — do not pin a duplicated gallery to a stale height.
- Everything *except the id* should be copied, including the config's title/annotation: that is the whole point
  of duplicating.
- A pasted payload needs the same error/warning treatment a pasted board gets, and "duplicate id" is already
  one of the errors it must not newly introduce.

**Verification:** pure tests for `duplicateWidget(widget, freshId)` (fresh id, deep-copied config, same type)
and `parseWidgetPayload(text)` (accepts a lone widget or a one-widget board, rejects junk, reports which);
then an E2E — duplicate gives one more card with a different id and an identical config, the copy renders its
own data, and a widget carrying `{{widget:id}}` still resolves. Then a paste into a *different* board: the
dangling-reference message with an offer to bring the source along.

**Effort:** duplicate ≈ an afternoon (a button plus wiring into `handleAddAssembly`), clipboard copy/paste ≈ a
day (payload, paste UI, validation, the reference offer), keyboard shortcuts last.

**Status:** open (filed 2026-09-15).

## ISSUE-83 · Document Reader: let the reader decide how much room the transcription gets — **open**

**What:** the transcription panel is a fixed strip under the page (`flex: 0 0 auto`, `max-height: 180px`, its own
scroll) while the page stage takes what is left (`flex: 1 1 auto`). Andrew wants a **drawer**: more text when he
is reading it, more page when he is looking at the scan.

**Options, with what each costs:**

| option | how | notes |
|---|---|---|
| **drag handle** between page and panel | a thin grip that sets the panel's height | the most direct "drawer"; needs a keyboard-accessible equivalent, and a clamp (the page must keep a usable minimum, the panel must not exceed the card) |
| **size presets** (Compact · Half · Tall) | a segmented control beside ¶ | simpler, discoverable, testable; less continuous than a drag |
| **configured ratio** (`textPanelSize: 0.4`) | ⚙ + a default in the board | the board's default, not the reader's choice — belongs *with* the two above, not instead of them |

**Two facts that frame it:** the split is currently **implicit** (the stage absorbs whatever is left), and the
**card itself is already resizable** by dragging its bottom-right corner — so "give the text more room" has a
free answer today (`9. The board height is yours to drag`), and what is really missing is the **internal** split.

**The house rules it must respect:** the board sets a default and the reader overrides it (as with `spread` and
`showOverlap`), and a *reader's* choice is view state, not board config (as with zoom — see
[LIFELINE-WIDGET.md](LIFELINE-WIDGET.md)). So: a ⚙ default plus a control that wins until reload.

**Verification:** a unit test for the clamp (never below the page's minimum, never beyond the card), and an E2E
that moves the split and asserts both halves changed size — measured, not eyeballed.

## ISSUE-84 · A copy button for the transcription (and what should be copied) — **open**

**What:** Andrew wants to copy the text without dragging a selection across the panel.

**The design question is not the button, it is the payload.** Three candidates:

1. **the page's text alone** — what a reader expects, and the least surprising;
2. **the text plus its provenance** — e.g. `"…page text…\n\n— Wikisource, Page:"Homo Sum"…/19 (Validated)"`. **This
   is the one I would argue for by default:** a snippet pasted into a draft with no grade attached invites
   citing *"Not proofread (uncorrected OCR)"* as if it were the edition, which is exactly the mistake
   [HANDOFF gotcha 20](../HANDOFF.md) exists to prevent — in a clipboard this time;
3. **a ready-made citation** (wikitext or plain) for the source page — a second, smaller action, useful for
   Wikisource-adjacent work.

**Mechanics:** `navigator.clipboard.writeText` needs a user gesture (the button is one) and a secure context
(production is HTTPS, and localhost counts) — a `<textarea>` + `execCommand` fallback is probably unnecessary,
but it is the documented escape hatch. The button should confirm ("Copied") and reset, because a silent copy
button gets clicked twice.

**And the honest limitation:** *copying a whole work* is not the same feature — 1,208 pages is 1,208 API calls,
so it needs either a bulk route (WSexport was unreachable from here when measured: `ws-export.wmcloud.org`
returned 000) or a progress-driven loop with a cap. File it separately if anyone asks for it; do not quietly
make the button mean "all pages".

**Verification:** a Playwright test that grants clipboard permissions, clicks, and reads the clipboard back —
asserting the text *and* the provenance line, since the provenance is the point.

## ISSUE-85 · Where should the transcription live? (placement, to explore) — **open**

**What:** today the text is a strip **below** the page. Andrew asked whether other arrangements make sense.
Options, with the trade-offs as I understand them:

| placement | wins | costs |
|---|---|---|
| **below** (today) | trivial; a wide, short card uses the width well | it competes *vertically* with the page — the one resource a portrait scan needs |
| **side-by-side** (page left, text right) | the natural proofreading layout: the scan and its words visible together, neither stealing the other's axis | each pane gets ~half the width; in a narrow card it must fall back to stacked — the same viewport-measured switch the viewer already uses for facing pages (`spreadsFit`) |
| **overlay drawer** (slides over the page) | the page keeps its full size; the text is a mode you enter and leave | you cannot compare the two while reading; needs a dismiss affordance |
| **tabs** (Page · Text) | no room cost at all | you cannot see both, which defeats the reason to have a transcription beside a scan |
| **text laid over the scan** (positioned annotations) | the honest ideal — the words where they sit on the page | **not possible from this source:** Wikisource `Page:` wikitext carries paragraphs and `<section>` markers, not line boxes. It would need coordinates from somewhere else (IIIF annotations, an ALTO/hOCR layer), so it belongs with a different data source, not this one |

**What I would try first:** side-by-side above a width threshold, stacked below it, with the overlay as a
second option for tall cards — one layout decision keyed to the measured width, exactly like spread mode. It
also composes with ISSUE-83: a **split** and a **drawer size** are two expressions of the same idea (who gets
the space), and they should ship together or not at all.

**Verification:** an E2E that a wide card renders two panes and a narrow one stacks (both with the text in the
page's reading order), plus one screenshot of each.

## ISSUE-82 · A document reader for Commons PDFs/DjVu (and one page viewer shared with IA books) — **done + verified 2026-09-15**

**What:** WikiBento can read an Internet Archive book page by page (📖 `iaBook`). Commons holds scanned
**PDFs and DjVu** files with the same shape and a simpler API, and today there is no way to read one in the
app — only to link to it. Add a **📄 Document reader** card, and first **extract the page viewer `iaBook`
already has** so both readers share it (the full research, the measured numbers and seven traps are in
[DOCUMENT-VIEWER.md](DOCUMENT-VIEWER.md)).

**Why the extraction comes first:** the viewer needs a page count, a per-page image URL builder, a counter,
a zoom ladder, a strip, page turn, and hooks for search and page text. `iaBook` has all of it and Commons
documents fit the same interface, so ISSUE-81 (facing pages, right-to-left) then gets implemented **once**
and lands in both — and a third source becomes an adapter, not another card.

**Verified basis (2026-09-15):**
- `imageinfo` gives **`pagecount`** as a first-class field (`mediatype: OFFICE`, `mime: application/pdf`),
  and its `width`/`height` are the *page* size;
- **one thumbnail per page**: `iiurlparam=page{N}` (1-indexed) → a `thumburl` on the
  `pageN-{w}px-{name}.jpg` scheme — verified for pages 1, 94 and 188 of a 188-page report;
- the original PDF is `application/pdf` with `accept-ranges: bytes` and **`access-control-allow-origin: *`**,
  so page bytes are safe to draw (and a future PDF.js route is possible);
- **a text layer exists only where Wikisource proofread the file**: `Page:EB1926 - Supplement Volume 3.pdf/434`
  returned 10,737 chars with `<pagequality level="1">` and `{{rh}}` templates to strip. Coverage is thin —
  the report we measured has no transcription at all — so it is a panel that appears when available.

**The tempting route is the fragile one, and it is unverified:** embedding the browser's own PDF viewer in an
iframe would give zoom, search, print and download for free, but (a) **it could not be verified here** —
headless Chromium ships no PDF viewer, and both a sandboxed and an unsandboxed frame rendered **blank** for a
real Commons PDF (the file is fetched, nothing paints); (b) it collides with our own sandbox policy for
untrusted URLs (ISSUE-62); (c) Wikimedia's CSP already says `frame-ancestors 'none'`, report-only today, so
the route has a stated expiry; and (d) iOS Safari shows only the first page in a frame. **So: page images in
the card, plus an "open the original" link** — a real tab gets all of that with none of the four costs.

**Plan:**
1. Extract `PagedViewer` from `iaBook` behind a page-source interface (`pageCount`, `pageUrl(i, width)`,
   `direction`, optional `search`, optional `pageText`) and re-point `iaBook` at it — no user-visible change,
   and the 19 existing assertions must stay green.
2. Ship **📄 `documentReader`**: identifier → `imageinfo` header (pages, pagesize, file size) → page images
   with turn/zoom/strip, "open the original", and CSV export of the page list.
3. Land **ISSUE-81** on the shared viewer (facing pages, right-to-left).
4. Add the **Wikisource text panel** when the document has a `Page:` transcription, showing the proofreading
   level — and only then.
5. **PDF.js** only on evidence, if searching arbitrary (unproofread) PDFs becomes a real requirement.

**Verification:** a `scripts/document-reader-e2e.mjs` in the `smoke:iabook` style — a real Commons PDF
(page image loaded, counter reads the `pagecount`, the last page renders and one past the end **clamps**,
the strip loads, "open the original" points at `upload.wikimedia.org`), a DjVu file for the second format,
and a PDF with no `pagecount` (or an unrenderable page) degrading to a link rather than an empty viewer.
Unit tests for the page-URL builder and the clamp belong next to `tests/ia-book.test.mjs`.

**Pre-flight 2026-09-15 (steps 0–2 of the reading workstream are done, so this is the last piece):**
- the document thumb hosts **both send CORS** (`thumb.wikimedia.org` and `upload.wikimedia.org`), so **PNG
  export works for this reader too** — no new allow-list entry needed;
- **DjVu is the same model as PDF** (`Mozart Sonate`: 96 pages, `mediatype: OFFICE`, `iiurlparam` works
  identically) — one code path, two formats;
- a 329-page document needs **ONE** API call: `pagecount` plus a page-1 `thumburl` that becomes a template
  once `page1-` and the width are rewritten;
- **document renders have a 960 px ceiling** — asked 320 → `330px`, 700 → `960px`, 1200 → **960**, 2000 →
  **960** — so the zoom ladder needs a per-source `caps.maxWidth` in the shared viewer, or the `+` button
  lies above 700 px and the API's `thumbwidth` describes neither the URL nor the file;
- `extmetadata` supplies description / artist / license / date, the same call the media player makes.

**The plan (detail in [DOCUMENT-VIEWER.md](DOCUMENT-VIEWER.md)):** `src/lib/documentSource.js` (pure
source builder + tests) → `DocumentReaderCard` as a ~20-line wrapper like `IaBookCard` → registry entry
(`documentReader`, 📄, `timeScope: 'point'`, `spread` + `project` + `file`) → `caps.maxWidth` in
`PagedViewer` → showcase catalog entry (41 → 42 widgets / 40 → 41 types / 31 → 32 data-driven, which the
docs-facts count rules will name) → `scripts/document-reader-e2e.mjs` (`npm run smoke:document`) with
fixtures for a 2-page PDF, the 329-page default, a 96-page DjVu, a non-document, and the clamp → a
`document-reader-demo.json` board (the PDF, the DjVu, and an IA book side by side — one viewer, two
archives).

**Open decisions for Andrew:**
1. **v1 scope** — pages + links + facing pages, with the **Wikisource text panel as v1.1** (recommended:
   coverage is thin — the 188-page report measured has no transcription anywhere — and it is a different
   data path), or include it now.
2. **Multi-wiki** — support `project` (any wiki's local PDF/DjVu, default `commons.wikimedia`) or
   Commons-only for now. Recommended: yes, since it is the same API shape and it is what makes Wikisource
   documents (where DjVu dominates) readable.
3. **Default file** — `File:The Three Hostages (1924).pdf` (329 pages, described as "From internet
   archive", so a nice pairing with the IA board) or the 96-page Mozart DjVu. Recommended: the PDF, with
   the DjVu in the demo board.

**Shipped 2026-09-15:** `src/lib/documentSource.js` (pure — `normalizeCommonsFile`, `derivePageTemplate`,
`documentPageSource`; 18 unit tests) · `fetchDocumentPages` (**one** `imageinfo` call, 30-minute cache) ·
`DocumentReaderCard`, five lines, because the work is in the shared viewer · the registry entry
(`documentReader`, 📄, with `file` + `project` + `spread`, emitting the file page) · two additions to the
shared viewer (`caps.maxWidth`, and `caps.widths` for a server that serves a fixed set) · a **page-jump**
control, which a 329-page document needs · a "this page did not load — open the original" sentence instead of
a blank hole · the showcase catalog entry (42 widgets / 41 types / 32 data-driven — the gate named every
claim) · `npm run smoke:document` (**24 assertions**, real Commons files) · `public/document-reader-demo.json`
(329-page PDF + DjVu beside an IA book; 9 assertions).

**The discovery worth more than the feature:** a document page render is served only at **certain widths** —
120 · 250 · 330 · 500 · 960 · 1280 work, while **70/150/200/320/400/640/700/800/1024/1200 return an HTML
error with HTTP 400**, which Chrome refuses to give an `<img>` at all (`net::ERR_BLOCKED_BY_ORB`). The
template had invented 700 for pages and 70 for the strip, so *every* image was blank and nothing said why.
The API is the safe route because `iiurlwidth` **rewrites** to a legal width (320 → 330, 700 → 960) — which
is why the source advertises the served list and the reader's ladder comes from it. Also learned: a document
strip needs 120, not the IA reader's 70.

**v1.1 shipped the same day — the Wikisource text layer** (the piece this issue deferred pending evidence).
The evidence: `File:EB1926 - Supplement Volume 3.pdf` (1,208 pages, public domain) is transcribed on
en.wikisource, a `Page:` page per leaf. One `globalusage` call detects a transcription (ns 104/106 on a
Wikisource — a cross-wiki *link* is not one), and **one** `prop=proofread|revisions` call per page returns
the text *and* the proofreading grade. That grade is the feature: the whole volume is level **1, "Not
proofread"** — bulk OCR, never human-checked — so the panel prints "en.wikisource · Not proofread
(uncorrected OCR)" above the words and links to the transcription itself. `src/lib/wikisourceText.js` (17
tests) strips an edition's markup; the E2E's "no raw markup" assertion, run against the full 10 KB page,
caught a **wikitable** leaking that the trimmed unit fixture had missed, and a template/table ordering bug
turned `{{rh||A|B}}` into "B". Also fixed: the viewer's text guard required a IIIF-only field, so every
Commons document was refused before its own fetcher ran.

**Status:** done + verified 2026-09-15 (`npm run smoke:document`, 31 assertions; the demo board adds 5 more).

## ISSUE-81 · IA Book: facing pages (a two-page spread view) — **done + verified 2026-09-15**

**What:** the IA Book card shows one leaf at a time. The Internet Archive's own BookReader defaults to
**two facing pages** on a wide viewport, and a scanned book is usually *meant* to be read that way — a
spread is one printed page in the original. Add a spread mode: a toggle, responsive by default.

**Measured 2026-09-15** — the three findings that shape the work:

| what | finding |
|---|---|
| spreads are meaningful | every scanned item's manifest carries `behavior: ["paged"]` |
| **reading direction is real, and must be honoured** | `viewingDirection: "right-to-left"` on Arabic/Hebrew/Yiddish scans — `DarsENizami_DarjaAula_1stYear` (389 canvases), `2_20200322_20200322_1243` (470), `nybc207487` (502). **Both directions appear inside the same `language:ara` / `language:heb` / `language:yid` searches**, so language is not a proxy — read the field |
| chapters cannot align the spreads | **`structures: []`** on a 304-page book, and on every item sampled: IA publishes no chapter ranges, so the pairing is positional only (do not design on structures) |

**Plan:**

1. **Pairing.** Leaf 0 alone (a cover or a title page), then (1,2), (3,4)… plus a **shift-by-one toggle**,
   because whether leaf 0 is a cover or a text page is a property of the scan, not of the API. Verify the
   default phase against IA's own BookReader for `goodytwoshoes00newyiala` before settling it.
2. **Right-to-left.** When `viewingDirection === 'right-to-left'`, the later leaf renders on the **left**.
   The counter reads the same ("pages 4–5"); the pictures swap. Shipping this wrong is invisible to an
   English reader and obvious to everyone else — it is the main correctness risk here.
3. **Two IIIF requests per view**, each sized to half the card's width. The 400/700/1000/1400 ladder is
   *per leaf*, so a 6-column card at the top of the ladder would ask for 2 × 1400 px; cap or halve the
   ladder in spread mode rather than silently doubling the bytes.
4. **Responsive, like IA itself:** 2-up above a width threshold, 1-up below it (a `ResizeObserver` — the
   TimelineCard precedent), with the manual toggle winning until reload. View state, not board config —
   the same rule as zoom (see [LIFELINE-WIDGET.md](LIFELINE-WIDGET.md)).
5. **Do not disturb 1-up.** It is verified (19 assertions, `npm run smoke:iabook`); spread mode is additive.
6. **Connected surfaces:** the page strip highlights the pair (or shows spreads); a search hit jumps to the
   spread containing its page and keeps the word crop; and **PDF export of a spread is one printed page**,
   which is the natural win for the print path.

**Verification:** extend `scripts/ia-book-e2e.mjs` — in spread mode assert two page images load, that the
counter reads "pages N–N+1", that the pair ordering **flips for a `right-to-left` item** (one of the
identifiers above becomes a third book in the fixture), and that a search hit still lands with its crop.
The existing traps (`tests/ia-book.test.mjs`: manifest page count beats `imagecount`, `$0` → 500, blank
filler leaves) apply unchanged.

**Note:** this is also what makes a Commons document reader cheap — the paged viewer is being extracted from
`iaBook` for ISSUE-82, so facing pages (and the right-to-left case) is implemented **once** and applies to
both sources.

**Shipped 2026-09-15** — and, as planned, *below* the reader rather than inside it, so a Commons document
reader gets it for free:

- `src/lib/pagedViewer.js` (pure, 12 unit tests): the page-source contract, `spreadPairs(count, offset)`,
  `spreadOrder(pair, direction)`, `spreadIndexOf`, `spreadLabel`, `spreadsFit`, `leafWidth`, `stripWindow`.
  Every leaf appears exactly once at any length and either offset — asserted for 1 to 304 pages.
- `src/widgets/PagedViewer.jsx`: the shared reader (turn, zoom, strip, counter, search, page text, facing
  pages). `IaBookCard` is now a 19-line wrapper that supplies the IIIF-specific fetchers.
- **Right-to-left** honoured: measured on a real Arabic scan (`DarsENizami_DarjaAula_1stYear`, 389 canvases,
  `viewingDirection: right-to-left`), the LATER leaf renders on the **left** and the counter still reads
  "pages 1–2 of 389".
- Leaf 0 stands alone (a cover) with a **shift control** to pair it instead, for scans that start on a text
  page; spreads engage from the card's measured width (`SPREAD_MIN_WIDTH = 820`), and a board can set the
  **default** (⚙ *Reading mode*: auto / two pages / one page) while the reader's own toggle still wins
  until reload; each leaf gets half the zoom ladder.

**Verified in a browser** (`npm run smoke:iabook`, now **33 assertions**): a spread shows two loaded pages,
the counter names it in reading order, the earlier page is on the left in a left-to-right book, the strip
highlights both, **▶ advances by a spread (2 → 4)**, the shift control re-pairs the first leaf, and for the
right-to-left book the later page is on the left while the counter reads in reading order. Screenshot:
`docs/screenshots/wikibento-2026-09-15-ia-book-card.png`.

**Status:** done + verified 2026-09-15.

## ISSUE-80 · PNG export for CORS-image widgets (iaBook first) — **done + verified 2026-09-15**

**What:** `imageCapabilities()` (`src/lib/exportImage.js`) offers PNG only when the widget contains an
`<svg>` — it was written for the four widgets that draw themselves as vector. But the real rule is
whether the pixels can reach a canvas without tainting it, and a **cross-origin image whose host sends
CORS is just as safe**. Measured 2026-09-15: `iiif.archive.org` echoes the request `Origin` on both the
image API and the manifest, so an `iaBook` page image can be drawn to a canvas and exported — the user
gets a real PNG of a book page, which is exactly the artifact a GLUT/Wikimedia person wants.

**Plan:** a small allow-list of measured CORS hosts (`iiif.archive.org`; `upload.wikimedia.org` sends
`Access-Control-Allow-Origin: *` and is worth measuring too), a `corsImageToPngBlob(imgEl, scale)` that
reloads the image with `crossOrigin="anonymous"` and rasterises it at 2×, and one branch in the export
menu. **Verify in a browser**, not by unit test: extend `scripts/ia-book-e2e.mjs` to open the ⤓ menu,
assert PNG is enabled, click it and assert the download event fires with a `image/png` file — the
capability matrix in [EXPORT.md](EXPORT.md) then needs its row updated.

**Until then** the claim is *not* made: `docs/INTERNET-ARCHIVE.md` and `DATA-SOURCES.md` §28 say PNG is
possible-but-not-wired, so nobody reads a promise the app does not keep.

**Shipped 2026-09-15:** `CORS_IMAGE_HOSTS` (three hosts, each measured), `corsImageIn(node)` and
`corsImageToPngBlob(img)` in `src/lib/exportImage.js`; `imageCapabilities()` offers PNG when such an image
is present, and the export menu picks the SVG path or the image path. The row above about the capability
matrix in [EXPORT.md](EXPORT.md) is updated. Verified in a browser (`npm run smoke:iabook`, 21 assertions):
the menu offers PNG for a IIIF page, the reason reads "this widget's image host sends CORS, so the canvas
stays clean", and clicking it downloads a real **4.4 MB** PNG of the page.

**A bug found while verifying:** `ExportMenu` computed the capabilities in an effect, so every item
rendered disabled for one frame before the reasons arrived — the E2E saw a disabled PNG and no tooltip.
Availability is now read in the same tick as the open.

**Status:** done + verified 2026-09-15.

## ISSUE-79 · Snapshot service: a server-side browser for PNG of any widget — **not doing (decided 2026-09-14)**

**Decision:** **rejected.** PNG of an HTML/CSS widget will not become a server-side feature. Client-side PNG
stays limited to widgets that draw themselves as SVG, and the export menu says so. Decided by Andrew and the
agent on 2026-09-14, after the client-side half shipped (see *What shipped instead*).

**Why — the four costs, in the order they matter**

1. **It re-fetches the whole board for one image.** The board's own recordings measure it: the tutorial
   pipeline trims **17.7–18.1 s of lead-in** because a board takes that long to load before it can be filmed
   (`pipeline/build.mjs` trims it per scene). A snapshot endpoint pays that on every request, and the caches
   that make a human's second visit cheap — the in-page `sparqlCache`, CIM's 1 h TTL, HTTP caching — start
   cold every time.
2. **The traffic lands on Wikimedia, from a shared IP.** A 40-widget board is dozens of calls to WDQS, CIM,
   PetScan, LiftWing and the Action API. WDQS rate-limits, and a Toolforge IP doing that on demand can be
   throttled for **other tools**. Heavy automated WDQS use by a movement-hosted tool is bad citizenship.
3. **The browser is a bigger risk than its CPU.** Chromium is 300–500 MB against a **1 Gi pod** (Toolforge
   default; max 4 Gi), and it is a large attack surface that parses untrusted content. Our boards can embed
   **arbitrary external pages** (Wiki Page custom URL, panorama, video), so the service would be a
   Wikimedia-hosted box that fetches and renders URLs on request — an SSRF/proxy surface by construction.
4. **It is a permanent liability, not a feature.** Chromium CVEs to patch, OOM to watch, a queue to tune,
   rate limits to defend — forever, for a capability almost nobody asked for.

**And the objection that stands even if compute were free:** a server render is a **re-render, not a
capture**. It cannot show what the user is looking at — zoom, scroll position, light/dark card theme,
selected params, kiosk/lean mode — unless the whole view state is serialised and rebuilt, and even then the
image differs from the screen. The client device has the pixels, the DPR, the intent and no infrastructure.
Screenshotting is a keystroke; a service is a job.

**What shipped instead** (ISSUE-78 era, `docs/EXPORT.md`): a **⤓ export menu** per widget — **CSV** for the
data, **PDF** via the browser's print engine (vector, selectable — a better artifact than PNG for reports
and slides), **SVG** for every non-iframe widget, and **PNG** where the widget already draws SVG (rasterised
exactly at 2×). Anyone wanting a PNG of an HTML widget can screenshot their own device or convert the SVG
export locally.

**Durable finding from the investigation, worth keeping:** Chromium **taints a canvas for any SVG containing
a `foreignObject`** — measured 2026-09-14 on five documents, including one holding nothing but `<p>hello</p>`
(`SecurityError: Tainted canvas`), while plain SVG rasterises fine. That is why the DOM→SVG wrapper yields a
valid **.svg** but can never yield a **.png** in the page, and why server-side rasterisers (resvg, librsvg)
are no shortcut either: they do not support `foreignObject`. See `src/lib/exportImage.js`, which encodes the
measured capability matrix.

**If this is ever revisited** — the trigger should be *evidence*: a user describing a workflow where a
screenshot genuinely does not work (e.g. a bot posting board images to a wiki on a schedule). Weigh in this
order, lightest first:

| option | weight | notes |
|---|---|---|
| **Client-side DOM→canvas library** (`modern-screenshot`, MIT) | one dependency, ~30–50 KB, no server, no extra API traffic | re-implements CSS (`color-mix()`, container queries, sticky) — plausible-but-wrong files are the risk; still cannot do iframes |
| **Scheduled snapshots** — a cron job renders a curated board list to static PNG/PDF | browser in a pod, N times a day | predictable, rate-limit-friendly traffic; frozen artifacts that drift from live data (label them "as of"); covers the archival use case, not "any widget on demand" |
| **Per-request render endpoint** | a service to run and defend | **rejected here** — all four costs above |

The feasibility unknown recorded at the time, in case it is ever needed: getting a browser *into* a pod is
the hard part, not driving it — either a **Build Service** image with Chromium and its ~90 shared libraries
installed at build time (apt support in the build unconfirmed), or a **rootless Chromium** build such as
`@sparticuz/chromium` run from a pod/cron (version-pinning against the driver). Playwright is optional;
Puppeteer or `chrome-headless-shell` would do, though `pipeline/` already drives this app with Playwright.


## ISSUE-78 · Lifeline: a timeline of a life, and two lives on one axis — **v0 shipped**

**What:** a `timeline` renderer for the existing `sparql` widget — dated rows as **lanes on one shared
axis** — plus a `two-lives` preset (Anne Frank × Martin Luther King Jr.) and
`?config=/parallel-lives-demo.json`. Requested by Andrew 2026-09-12, from an experiment pairing two people
born in the same year.

**Why it fits:** the widget already runs arbitrary SPARQL and renders stat/bar/line/table; "timeline" was
already on the renderer wish list in [WIDGET-IDEAS.md](WIDGET-IDEAS.md) (the WDQS UI's own views are
table/map/timeline/graph). Nothing here needs a backend: one WDQS call returns the whole board.

**Full write-up with the measurements, the design for v1+, and the risks: [LIFELINE-WIDGET.md](LIFELINE-WIDGET.md).**

**Measured (2026-09-12):** Wikidata gives **7 usable dated events for Anne Frank and 14 for MLK** (with a
death filter); the article prose contains **66 and 139 dated sentences** in its life sections (27% / 22%
of sentences carry a year), ~5–10× more, and it holds the events that make each life narratable — the
diary, the arrest and the transports for her; the bus boycott, Birmingham, the March on Washington and
Selma for him. Wikidata dates what is *recordable* (awards, posts, residences); prose holds what is
*narratable*. Without a death filter the preset also returns posthumous honours (a 1955 prize for Anne,
2004 for MLK) — a "life" timeline that ends with an award won 36 years after death.

**Shipped:** `src/lib/timeline.js` (layout maths, 22 unit tests — ticks, bounds, percentages, the overlap
window, label slot packing, edge anchoring, degenerate cases, **both alignment modes**), the `TimelineCard`
renderer, auto-detection (dated rows with no numeric column), a manual ⚙ override, two verified presets
(`two-lives`, `curie-pair`) and the demo board.

**Both alignments, as requested (2026-09-12):** a ⚙ toggle offers *calendar years* ("what happened at the
same time") and *age* ("align every lane at its first event"). Age mode is what makes the second pair work:
**Marie** (1867–1934) and **Pierre Curie** (1859–1906) were born eight years apart, so on a calendar axis
his childhood has no counterpart; aligned at birth, their shared years line up and his lane ends at **46**
while hers runs to **67**. "Age" is defined as years since each lane's first documented event — birth when
the query has one — and the axis says so rather than assuming.

**Zoomable axis (2026-09-12, asked for after looking at it):** a `− n× +` control stretches the axis
1×/2×/4×/8× with native horizontal scrolling and pinned lane names. Cheap because the layout is
percentages of the content box; the real work was **tick density** (the step follows the *visible* span, so
ticks walk 10 → 5 → 2 → 1 years) and **label slots** (a label is a fixed pixel width, so the collision gap
in percent shrinks as the box grows — measured, not guessed). Result at fit: 5 of 18 labels truncated; at
2×: none; at 8×: all 21 events labelled.

**Display settings (2026-09-12, from a second look):** a ⚙ **title** (also the card's only heading in
lean/presentation mode, where the widget's own bar is hidden), a **light card theme** that inverts the whole
palette so the timeline reads as its own panel against a dark board, and an **overlap-band toggle** — both a
⚙ boolean and a ▭ button beside the ± controls. Alignment stays in the board config (it changes what the
chart means); zoom is view state only, so a shared board opens at fit.

**And a truncation bug worth remembering:** labels were clipped to 36 characters in the layout module
*before* rendering, so "October 1944 · lived in Bergen-Belsen concentration camp" kept its ellipsis at every
zoom level — and the check meant to catch truncation measured layout overflow, reporting zero, because the
shortened string fitted. The data layer no longer truncates (CSS wraps, the tooltip keeps the full text).
Measured: 5 clipped labels at fit, 0 at 2× and beyond.

**A product bug found and fixed on the way:** Marie Curie rendered as `Q7186`, because her Wikidata label
lives under the language-neutral **`mul`** code (247 sitelinks, English description, no `en` label), and
both the Action API with `languages=en` and WDQS's `wikibase:label` with `"en"` refuse to name her. That
blind spot was in `src/lib/sparqlLabels.js`, so **every entity-labelling widget was affected**, not just
this one: it now requests `<lang>|en|mul` and reads in that order, the presets ask for `"en,mul"`, and the
request/response matrix is recorded in [DATA-SOURCES.md](DATA-SOURCES.md) with a regression test.

**Next (not built):** the **article-prose lane** via the LiftWing relay with a verbatim-quote gate against
the cited revision; a **context band** from the year articles (enwiki "1942" carries 675 dated, citable
event lines); pinned per-revision artifacts on a wiki; and generalization past people (institution vs
founder, two delegates, a person vs their era — Wikidata-only lanes are useful for many such topics).

## ISSUE-72 · Wikidata knowledge graph: image nodes, labelled edges (GitHub issue #82) — **open**

**What:** add a **`graph` renderer to the existing `sparql` widget** so a board can show a Wikidata
knowledge graph the way WDQS's own Graph view does — items as nodes, direct claims as labelled
edges, P18 images on the nodes. Requested by Andrew 2026-09-11 with a worked `#defaultView:Graph`
query (a "Madame X" art cluster: Sargent's painting, the sitter, related portraits by other artists,
the holding museums, two books).

**Why it fits:** the app already runs arbitrary SPARQL (widget `#1411`, endpoints wdqs /
qlever-commons / humaniki) and can render stat, bar, line or table — the missing view is the one
Wikidata is actually shaped like. Tables cannot show relations.

**Measured (2026-09-11):** the supplied query runs on the live endpoint in **0.8 s**, returning
**41 rows / 17 nodes / 15 distinct edge labels / 38 KB**; **15 of 17 nodes carry a P18 image**. A
browser can query WDQS directly — `POST /sparql` answers `200` with `access-control-allow-origin: *`
and the `OPTIONS` preflight passes. `embed.html` sends **no `X-Frame-Options` and no `frame-ancestors`
CSP**, so an iframe embed is also technically open (that is the alternative to a native render).

**Two findings that shape the design:**

1. **WDQS is now split into endpoints** — `query-main` (verified 200, CORS `*`), `query-scholarly`,
   and a **Commons** service (`commons-query`, verified 307 with our origin echoed);
   `wikidata-legacy-full` was **decommissioned 2026-01-20**. A widget assuming "the whole graph"
   behind one URL is now wrong, and the endpoint selector should name the current set.
2. **The documented limits are the thing to design against** — a 60 s hard deadline, **60 s of
   processing time per client (User-Agent + IP) per 60 s**, over-limit **429 + `Retry-After`**, with
   temporary bans for ignoring them and blocking for a missing `User-Agent`. Since a **browser cannot
   set `User-Agent`** (forbidden header), a board querying WDQS from the visitor's browser spends the
   *visitor's* budget — an argument for routing graph queries through the existing Toolforge relay
   with caching, and against short auto-refresh timers.

**Proposed:** `renderer: 'graph'` and `graph+table`; honour `#defaultView:Graph` and the WDQS
variable contract (`?item1`/`?item2`, `?item1Label`, `?image1`/`?image2`, `?edgeLabel`) so WDQS
queries render unchanged; images on by default when bound, with a no-image fallback; click a node to
open the item; a stated node ceiling with a visible "N rows dropped" notice rather than silent
truncation. Recommended: native SVG with the design tokens (keeps lean/kiosk/print working and is
cacheable), with the WDQS iframe offered as an explicit "embed" mode. Prior art named in the issue:
Wikidata Graph Builder, and WDQS's own Graph view.

**Gotchas:** Wikidata data is CC0 but the **images are not** (per-file CC BY-SA, needs attribution and
a file link); endpoint drift can silently drop edges; the repo has **13 deps and no graph library**, so
this is a real dependency decision — hence the option of a deterministic layout with no new dependency
for v1.

## ISSUE-73 · Article Gallery: lighter default example + first-class image cap (GitHub issue #84) — **open**

**What:** the `gallery` widget ("Article Gallery", `src/widgets/index.js:762`) ships with
**Albert Einstein** as its placeholder article, and with `maxItems: 0` — *unlimited* — in both its
defaults and the catalogue example. Requested by Andrew 2026-09-11: pick a lighter example, and make
the image limit first-class (3 / 5 / 10 / 15 / no limit).

**What is already there:** the cap **exists** as a config field (`Max images (0 = all)`, numeric) and
is applied at the end of `fetchArticleGallery` (`dataSources.js:1268-1270`). So the ask is a sane
**default** and **presets**, not a new field. The data path is also cheaper than feared — one
`REST /page/media-list/<title>` call plus batched `imageinfo` (50 titles/call): **3 requests** for
Einstein, not one per image.

**Measured (2026-09-11, en.wikipedia):** Einstein uses **59** images (42 pass the widget's
`minSize: 200`). Metadata is small — `media-list` 36.3 KB — but the thumbnails are not: **1.72 MB at
320 px**, **3.32 MB at 340 px**, **7.85 MB at 640 px**, median image 134 KB at 800 px. Capped at five:
**0.18 MB**. So the real cost is **reader bandwidth, not API quota** (three requests, under ~100 KB,
cached by the relay and refreshed hourly) — the same cost class as `Wikivoyage:Image policy` and the
same measurement pattern as ISSUE-71 (#80).

**Proposed:** default the example to a measured-light article — recommendation **Gibbes Museum of Art**
(5 images, ~0.2 MB, and one of the museums in the #82 knowledge-graph example) — plus a recorded rule
("check the image count before using an article as an example"); a preset select **3 / 5 / 10 / 15 /
All** defaulting non-zero (recommend 10); a visible weight hint in the ⚙ panel ("10 images ≈ 0.3 MB");
a warning (not a block) when left on All for an image-heavy article; and an optional consistency pass,
since Einstein is also the placeholder in five other catalogue entries, in `paramSources.js:335`, and
in the Ask example prompt. Honest limit recorded in the issue: because the cap slices after the
metadata fetch, it saves image bytes but not the media-list/imageinfo responses, and `media-list` has
no limit parameter to push it into.

## ISSUE-74 · Drag & drop: edge auto-scroll so a bottom widget can reach the first row (GitHub issue #86) — **open**

**What:** requested by Andrew 2026-09-11 — with a widget at the bottom of a tall board there is no
practical way to drag it to the top, because dragging to the window edge does not scroll the board.
Also proposes a non-drag **Move to top / Move to bottom** action, since drag-and-drop is inaccessible
and is currently the only way to reposition a card.

**Measured on the live site** (2026-09-11, `?config=https://w.wiki/TR9R`, 10 cards, 1920×1080; board
taller than the viewport, scroll container = the window):

- Holding a drag at the top edge for ≈2.8 s, sampling `window.scrollY` 14 times: **no movement at
  all** (`[264, 264, …]`); same at the bottom edge (`[0, 0, …]`) — the drag itself is fine
  (`.react-draggable-dragging` present throughout), only scrolling is missing.
- The **mouse wheel does scroll mid-drag**, but the dragged card **detaches from the pointer**: after a
  276 px scroll, the card's viewport top moved 108 → **−168** while its `transform` stayed
  `translate(966px, 40px)` and the pointer never moved — i.e. the card slides away by exactly the scroll
  delta and the drop is decided from the pointer, not from what the user sees. This is the pitfall the
  fix must handle (compensate the dragged element by the scroll delta), and it is why the current wheel
  workaround is guesswork.
- Per-card controls today are `About / Configure / Refresh / Remove` — **no move action**, so keyboard
  and many touch users cannot reposition anything.
- `react-grid-layout@2.2.4` has **no `autoScroll` option** anywhere in its build output, so this cannot
  be switched on — it must be implemented (App currently passes no drag handlers at all).

**Proposed:** (A) an `onDrag` handler that scrolls `window` on a rAF loop when the pointer is within
~80–90 px of the viewport edge, velocity ramping with proximity, clamped to the board's bounds, stopped
on drag end; (B) compensate the dragged item's offset by the accumulated scroll delta so the card stays
under the pointer (the measured failure above); (C) the same helper for `onResize`, which has the
identical problem near the bottom edge; (D) a **Move to top / bottom** action in the card header menu —
one click, keyboard reachable, works on touch and on very long boards, and it is the only path that
would work in kiosk/lean modes where dragging is disabled.

**Acceptance:** with 10+ cards, an edge-held drag scrolls until row 1 is reachable with the card under
the pointer; stops on drop; never overscrolls past the board; regression = mechanise the measurement
above (assert `scrollY` changes and the card's offset to the pointer stays constant) in the existing
three-engine smoke matrix; verify by hand on a real iPad and in lean/kiosk modes.

## ISSUE-75 · Project picker: all Wikimedia projects, not three Wikipedias (GitHub issue #88) — **open**

**What:** requested by Andrew 2026-09-11. Almost every widget with a "Project" field offers the same
three options (English/German/French Wikipedia) and much widget code hardcodes `en.wikipedia`. Needs a
searchable picker over the real number of wikis — type-in with a dropdown, not a 1,000-row scroll list —
and Commons support, including a gallery that can load a **Commons page or category** and display all or
**selected** images.

**Measured current state:** `PROJECT_OPTIONS` is literally three entries (`index.js:52-56`, reused by the
CIM widgets); 9 widgets expose a project field; `en.wikipedia` appears 16× as a literal in `index.js`; and
Commons is hardwired separately (23 refs in `index.js`, 17 in `dataSources.js`) rather than being a
selectable project.

**The real universe:** `action=sitematrix` (Meta) is the canonical list — **41.2 KB, 165 ms, CORS `*`**,
**1,072 wikis**: 364 Wikipedias, 198 Wiktionaries, 122 Wikibooks, 100 Wikiquotes, 84 Wikisources, 36
Wikinews, 27 Wikivoyages, 17 Wikiversities, 124 "specials" (Commons, Wikidata, Meta, chapter/ArbCom
wikis), 26 closed. Each entry carries code, dbname, url, sitename, the language's **autonym** and its
**English name**, plus a `dir` hint — so one search box can match either name plus code and dbname.
Only Commons/Wikidata/Meta of the specials are worth offering.

**Feasibility — the finding that matters:** AQS pageviews answers for **every** family, with live
numbers and CORS `*` (en.wikipedia 202.5M/day, commons.wikimedia 6.5M, en.wiktionary 3.0M,
www.wikidata 3.0M, en.wikisource 1.7M, en.wikivoyage 1.1M, en.wikibooks 0.7M, en.wikinews 0.06M), and
per-article pageviews work on en.wikisource/en.wikivoyage. **But the gallery's REST source is
Wikipedia-shaped**: `page/media-list` returns 200 on en.wikipedia and de.wiktionary, **500 on
en.wikivoyage**, and does not follow Commons redirects — while the Action API (`prop=images`) works
everywhere. So a project-aware gallery needs the Action API path, an extra piece of work the issue calls
out.

**Proposed:** one control with a shortlist above the fold (current three + biggest wikis per family +
Commons/Wikidata/Meta in a "Special" group), type-ahead matching autonym/English name/code/dbname, and
direct entry of a project code; a `code → host/dbname/family` resolver; a bundled sitematrix snapshot so
the picker needs no round trip; per-widget `families: [...]` declarations so the picker only offers what a
widget supports; closed wikis excluded; configs keep the plain `'en.wikipedia'` string. Size ordering
needs article counts and per-wiki `siteinfo statistics` is 3.4 KB/~150 ms each — bundle a top-N at build
time rather than requesting 364 wikis.

**Commons (second half):** measured one-call primitives — `generator=categorymembers` + `imageinfo`
returns files *and* 400 px thumbnails in one request (8 files, 6.2 KB); `cmtype=subcat` allows drilling
into subcategories; `prop=images` reads a gallery page (with `redirects=1`, since Commons gallery pages
are often redirects — `Kyoto` → `京都市`). Selection writes the chosen filenames into the config, and the
`fileGallery` widget **already accepts a pasted file list**, so the new work is the picker, not the data
model. Filter to bitmaps with real dimensions (measured: an `.ogg` at 0×0 and an `.svg` came back first)
and cap the count — a Commons category can hold thousands of files, so #84's byte-budget logic applies.

## ISSUE-76 · External Link Count: namespace breakdown (+ two count defects) (GitHub issue #90) — **open**

**What:** requested by Andrew 2026-09-11 for the `linkcount` widget ("External Link Count", `#195`,
source `exturlusage`): show *where* a domain's links are — main space, talk pages, user pages, project
pages — instead of one number.

**Finding 1 — the breakdown is free.** `exturlusage` returns the namespace of every hit, so the breakdown
is a client-side group over results the widget already fetches. Measured for `ocw.mit.edu` on
en.wikipedia: **1,179 links across 8 namespaces** — main 582 (49%), Talk 223 (19%), User 219 (19%),
Wikipedia 99 (8%), User talk 45, Wikipedia talk 6, Draft 4, File 1 — in **3 requests / 0.84 s**. Querying
namespace-by-namespace instead costs **42 requests** for the same answer, so the implementation must
group, not filter.

**Finding 2 — a live defect: the widget under-reports by 57%.** `countExtUrlUsage` hardcodes
`euprotocol: 'https'`, so the card shows 502 of the real 1,179 links for this domain (older citations are
`http://`). Fix the filter or label the card; this exists whether or not the breakdown ships.

**Finding 3 — the number counts links, the label promises pages.** 1,179 rows but **962 distinct pages**
(one user page carries 36 links). The description says "count pages linking to a domain", so label and
number disagree by 217; show both or label precisely.

**Negative result recorded:** `insource:` via CirrusSearch is *not* a substitute — it counts mentions in
wikitext, not external links (File namespace: 1,549 vs 1 real link; total 2,607 vs 1,179).

**Decided (Andrew, 2026-09-14):** headline count = **links**, because that is the honest unit
returned by `exturlusage`; show distinct pages as secondary context. The full namespace report should be
a **mode of the existing `linkcount` card**, not a separate widget type, to avoid registry sprawl.

**Proposed:** one paged run over all namespaces grouping by `ns`; a stacked bar plus namespace/count/share
list with small namespaces collapsed into "Other"; namespace labels from the wiki's own
`siteinfo` namespaces (so non-Wikipedia wikis read correctly); keep the existing `namespace` config as a
*view* filter rather than a query filter; count all protocols by default; show **links** as the headline
and distinct pages as a subtitle; and say "≥5,000" when the code's documented result cap bites instead
of presenting a capped number as a total.

## ISSUE-101 · Single Commons image tile: full-bleed decorative image — **open**

> **Renumbered 2026-09-18:** registered as ISSUE-78, which collided with *Lifeline*. The older
> entry keeps 78 (it is referenced from `src/lib/timeline.js`, `src/widgets/WidgetFrame.jsx`,
> `public/demos.json`, `SCREENSHOTS.md`, `WIDGET-IDEAS.md` and `LIFELINE-WIDGET.md`); this one
> had no inbound references, so it moves.

**What:** add a standalone `imageTile` widget that accepts one Commons file and fills its entire widget box
from edge to edge, making the image a decorative tile rather than a gallery or statistics card.

**Why:** the current catalog has no plain single-image widget. `gallery` is article-based and multi-image;
`fileGallery` is a list-oriented gallery; `fileUsage` shows an image only alongside usage statistics; and
`markdown` is not Commons-file-aware. A single-image primitive would support visual boards, presentation
layouts, GLAM displays, and lean/kiosk mode without forcing authors to use a workaround.

**Proposed:**
- Registry id `imageTile`; input a single Commons filename such as `File:Example.jpg`.
- Resolve the file through the Commons API and use a thumbnail sized to the rendered box where practical,
  with the original file page as the click-through target.
- Render edge-to-edge with no inner card padding; default `object-fit: 'cover'` so the tile is fully populated,
  with optional `'contain'` for uncropped display.
- Add an optional focal position (`center`, `top`, `bottom`, `left`, `right`, or CSS position) for deliberate
  cropping in portrait/landscape tiles.
- Preserve attribution and licensing: expose author/license/file identity through the ⓘ panel and an
  accessible hover/focus treatment, without putting a persistent caption over the decorative image by default.
- Reuse the existing image-fetch and thumbnail patterns; do not fold this into `gallery` or create a
  multi-image "photo wall" here. The latter remains a separate `WIDGET-IDEAS.md` concept.

**Status:** open; planning note recorded 2026-09-15 from Andrew's request. No implementation yet.

## ISSUE-102 · Quiz / trivia mode: image widget + multiple choice + running score (GitHub issue #95) — **open**

> **Renumbered 2026-09-18:** registered as ISSUE-91, which was already taken by *Clicks on
> rendered Wikimedia content* (shipped 2026-09-16; referenced in `DEPLOYMENTS.md`,
> `VERIFIED-WORKING.md` and `DATA-SOURCES.md`). The GitHub issue number (#95) is unaffected.

**What:** requested by Andrew 2026-09-18 for a week-long event. One widget shows an image, another shows a
four-answer multiple-choice question, a click says right/wrong, a running tally covers five questions, and
the end shows a complete score.

**Half of it works today — probe-verified 2026-09-18** on the built app (Chromium, `playwright-core`):
clicking **C** in a Board Controls `answer | buttons | Answer | A, B, C, D` param re-aimed a Markdown
widget from `Chosen answer: A` to `Chosen answer: C`; and the tally chain `listSource` (3 lines) →
`lineCount` ("Score 3 elements **3**") → `echo` (readout **3**) already computes and displays a score.
Any widget config field resolves `{param}` and `{widget:id}` (`params.js:115`, unknown refs left
literal and warned), and 8 widget types already emit `outputs` — so a score has a display path.

**The missing half is not UI:** (1) nothing knows which answer is *correct* — a `buttons` param is a value,
not a judgement; (2) nothing accumulates — `lineCount` counts the lines of an output *now*, and **no widget
in the registry emits from user interaction**; (3) the five-question sequence, feedback and end state do
not exist; (4) **booth semantics will bite**: board params travel with the saved board in `localStorage`,
so on a shared tablet the previous visitor's last click is what the next visitor inherits, while a board
opened from `?config=` is deliberately not persisted (`App.jsx:131-136`, verified: a reload with
`?config=` falls back to the saved board).

**Proposed:** one new `quiz` **effector** widget (the family the Speaker opened) that owns the question
bank, judging, sequence and score and **emits its state** the way `lineCount`/`echo` already do — so the
image pane stays a separate widget driven by `{widget:quiz1}` and the room-visible score can be an
`echo` readout. Question bank as a loadable JSON (`?config=`) so an organiser can write questions without
code. Booth extras: kiosk mode, iPad-size touch targets, idle auto-reset between visitors, visible Start
over, optional Speaker announcement (armed). Quiz session state becomes a declared **SESSION tier**
(sessionStorage — survives an accidental refresh, dies with the tab, never in the URL), with the contract
and `url-state.test.mjs` updated rather than bypassed.

**Non-goals v1:** no server/leaderboard/multiplayer (needs the Toolforge relay plus a privacy decision),
client-side grading only (the answer key is visible in the JSON — fine for a booth, said plainly), no
free-text answers.

## ISSUE-103 · Gallery pages: Commons' curated layer, as data — **done + verified 2026-09-18**

## ISSUE-104 · Images from a Commons category — **done + verified 2026-09-18**

Andrew, 2026-09-18: *"just show images from a Commons category, in alpha order, or random, or filterable …
how hard or easy is it to do so?"*

**Easy — and it needed no new widget.** Measured before building: the three gallery entries already in the
registry (`commonsGallery`, `gallery`, `fileGallery`) share `displayMode`/`iconSize`/`imageFit`/`maxItems` and
differ by **exactly one source field each**, and `fileGallery` already offers `order: listed | random | alpha |
largest`. A category is a *way of obtaining a file list*, so it belongs there:

```json
{ "widgetType": "fileGallery",
  "config": { "from": "category", "category": "Images from XBio", "wiki": "commons.wikimedia", "order": "random" } }
```

- **`from: 'list' | 'category'`** — `list` is the default, so no existing board, saved board or shared link
  changes behaviour. New: `category`, `wiki` (the shared 364-wiki picker) and a fourth order, `newest`.
- **`showIf` in the ⚙ panel** (a tested `fieldVisible()` predicate): a source's fields appear only for that
  source. Verified by driving the real panel.
- **The fetch reads only what the order needs** — `alpha`/`newest` come from the API, so truncating its order is
  faithful and cheap; `random`/`largest` fetch a pool, and the subtitle names it
  (`12 files · of 518 in the category · random order · from the first 500`).
- **Not built, deliberately:** subcategory walking (a category-tree walk), and a *sample* of a huge category
  (random shuffles a fetched pool). Both are stated in the card rather than hidden.
- Demo: `?config=/category-images-demo.json`. Verified live in Chromium, Firefox and WebKit.

**A test changed on purpose.** `ask-validation` locked in a bug report where the model emitted `fileGallery` +
a `category` key (previously dropped as unknown). That combination is now the feature, so the expectation moved —
and a genuinely unknown key is still dropped, so the invariant survives.

## ISSUE-106 · The Add-widget panel listed the Gallery three times — **done + verified 2026-09-18**

Andrew, minutes after the gallery merge shipped, with a screenshot: the panel's **Recent** list showed "Gallery"
three times, each with its own `+` button.

**Cause, and it is the merge's own footprint:** his browser had `gallery`, `commonsGallery` and `fileGallery` in
`wikibento-recent-widgets`. `widgetDef()` resolves all three to the same definition — correctly, that is the point of
aliases — but nothing collapsed them, so the recents list showed one widget once per id it had ever been.

- `recentWidgetDefs(ids)` resolves **and** de-duplicates by canonical id, preserving recency order; the panel uses it,
  and the recents list is now written with the canonical id so a legacy list converges as it is used.
- **The class of bug, not the instance:** this was the *second* fault in a day that only existed in a browser — the
  first was a helper called but never imported, which threw on every render of the widget. Neither could be seen by
  the unit tests, because nothing renders the panel. The demos sweep now **renders it** on desktop, seeding the
  recents with retired ids (the state every returning user is in), and asserts each section lists a widget once.
  Asserting is not enough on its own — a check that reports without failing is worse than none — so it feeds the
  same verdict as everything else, and was verified by injecting the bug back: ❌ with the message, then ✅.

## ISSUE-105 · One gallery widget, four sources — **done + verified 2026-09-18**

The gallery family is now four sources behind the same renderer: a pasted list (ISSUE-104 made it `from:
'list'`), an article (`gallery`), a `<gallery>` page (`commonsGallery`), and a category (`fileGallery.from:
'category'`). They share four display fields and differ by one source field each.

**The tidier end state is one `gallery` type with `from: list | article | page | category`.** Not done now
because it is a migration, not a feature: saved boards and shared `#/z/` links carry `gallery`,
`commonsGallery` and `fileGallery` as *type ids*, and this repo's own rules say those must keep rendering — so
it needs an alias shim (`commonsGallery` → `gallery` + `from: 'page'`) plus doc and count churn. The pay-off is
one place for shared features (a filter box, a lightbox, a click-to-publish action) instead of four.

**Revisit when** a third gallery feature is wanted, or when the consolidation can be done behind aliases and
verified by the demos sweep.

**Done the next day** — Andrew's own reaction to the Add-widget panel (*"commonsGallery and fileGallery are confusingly
named"*, with a screenshot of two adjacent entries whose descriptions had to deny each other) settled it: the naming
problem *was* the architecture problem. What made it cheap was the work of the previous day — `showIf` (so the merged
dialog shows 6–10 fields, never 17) and the row contract (all four fetchers already produced `title · caption ·
thumbUrl · fileUrl · group`, so `GalleryGridCard` never knew which source it was drawing).

- `gallery` with `from: article | page | list | category`; the picker shows **one** entry; 41 registry types.
- **The old ids still resolve** — at lookup (`widgetDef`), not by registering alias keys, because the picker is built
  from `Object.values(WIDGET_TYPES)` and an alias key would appear as a second identical entry. The *config* infers the
  source from the fields an old board carries, so nothing is rewritten on load.
- **Per-source behaviour preserved verbatim**: the article's `minSize`/`hideDecorative`/`includeAll`, the gallery
  page's curated captions, sections and `linkAction`, the category's cap/pool disclosure, the list's ordering — and
  each source keeps its own empty-state message, which a generic one would have destroyed.
- `project` replaces the category source's day-old `wiki` (one field, legacy name still read); the *default* project
  now belongs to the source (`en.wikipedia` for an article, `commons.wikimedia` for a page or category), because a
  static default cannot depend on the source and the wrong one is a page that does not exist.
- Verified **18/18 live** (page, category and article sources on production, three engines × two viewports), with
  `npm run test:browsers:demos` covering the legacy ids for free — `dashboard.json` alone carried three of them.


**Shipped.** A `commonsGallery` widget renders a gallery page's own images, captions and order — the 44th card on the
full-catalog board — and the 🎞️ demo board chains its captions into a Translator and its clicks into a reader.

**Measured live on production** (desktop Chromium and iPhone WebKit, 0 errors): `The Venetian Macao` → 5 images
with their captions (`Macao bridge 2019`, `Marco Polo Canal`, `The Great Hall`); switching the box to *London* →
**"542 images · showing 24"** (the cap is applied before thumbnails, so the other 518 cost nothing); clicking the
third tile → the reader beside it loaded `File:The Venetian_05.jpg`, i.e. the `selection` channel drove another
widget. Demo: `?config=/gallery-demo.json`.

**What implementing it added beyond the plan:**

- **The wikitext route was the right call, confirmed twice over** — the item counts match the rendered HTML exactly,
  at 56 KB instead of 654 KB for London, and the section headings come free (the parser tracks them, so
  `groupBy: section` was nearly no extra work).
- **A `commons-gallery` lookup source** so a Board Controls box is a validated typeahead over the 87k galleries
  (CirrusSearch `hastemplate:"Gallery page"`, which a prefix search cannot express), including a guard for the
  mistake everyone makes first: a typed `Gallery:` prefix is stripped, because that prefix does not exist.
- **Click-to-publish on the shared gallery renderers**, additively: a card that does not set `selectable` behaves
  exactly as before, so the category and article galleries are untouched.
- **Two traps the parser now handles, both found in the real pages**: a gallery line whose whole caption part is an
  option (`|alt=Just an option` → no caption), and options that follow a caption (`Caption|link=File:Y`). Splitting on
  the first pipe only is what keeps a linked caption intact.
- **A new docs gate**: every demo board on disk must be linked from the README *and* the hub. It fired immediately,
  proving its worth — the page-picker demo had lost its README row in a merge, and nothing had been watching.

**The original exploration follows.**

Andrew, with `https://commons.wikimedia.org/wiki/The_Venetian_Macao`: *"By name, they are not specially named with a
`Gallery:` prefix nor do they seem like they are in a special namespace. What makes a gallery a gallery, and what
might we do special in WikiBento to do something useful with it?"*

### What makes a gallery a gallery — measured

Nothing in the title, and nothing in the namespace. Every signal is **content and convention**:

| signal | measured on the example |
|---|---|
| a **main-namespace (ns-0)** page | `The Venetian Macao` → `ns=0`, pageid 149083378 |
| — and **`Gallery:` is NOT a namespace alias** | `Gallery:The Venetian Macao` → **missing**; that is just a page with that literal title |
| the **`{{Gallery page}}`** template | transcluded, with `/i18n/en` and `/layout` subpages |
| a literal **`<gallery>`** tag | one block, and 542 bytes of wikitext in total |
| a **tracking category tree** | `Category:Gallery pages of Macao`, `…of buildings in China`, `…of hospitality buildings` (root: `Category:Commons galleries`) |

Scale: **87,315** pages carry `{{Gallery page}}`, **140,220** contain a `<gallery>` tag (Commons, ns-0, 2026-09-18).

The consequence that shapes everything below: **you cannot find or fetch a gallery by title.** Discovery is search
(`hastemplate:"Gallery page"`, `insource:"<gallery"`), and the content lives in the page source.

### What WikiBento does today, and the gap

The gallery-family widgets (`small`, `contain`, the category gallery) read a **category**; `fileGallery` reads an
**explicit list of files**. Neither reads a gallery page — so the only way to show one today is the 📄 Wiki Page
widget, which embeds the *entire page* in a frame (its own header, infobox, sidebar) and yields no data.

That is a real gap, because galleries are Commons' **curated** layer: hand-written captions, hand-chosen order and
sections — where a category is an unordered, caption-less set. Galleries are also *paired* with a same-named
category (`The Venetian Macao` ↔ `Category:The Venetian Macao`), so curation and completeness become two views of
one subject.

### The access route — three options, measured

| route | data | bytes (London, 542 items) | verdict |
|---|---|---|---|
| `prop=revisions` **wikitext** + parse the `<gallery>` blocks | files, captions, order, **section structure** | **56 KB** | ✅ recommended |
| `action=parse&prop=text` rendered HTML, extract `li.gallerybox` | the same items, plus the template's chrome | **654 KB** | ✗ 10× the bytes for the same data — kept only as a fallback |
| `prop=images` | file titles only; no captions, no order | ~2 KB | ✗ insufficient |

Identical item counts on every page sampled (Venetian Macao 5/5, London 542/542, New York City 246/246, Berlin
0/0), so the wikitext route is not a compromise — it is the same answer, cheaper.

Two traps the same sample surfaced, both of which a widget must handle:

- **Berlin: a gallery-named page with zero gallery items.** 107 KB of page, no `<gallery>` — a hub or a redirect.
  "It is a Commons page" ≠ "it is a gallery". The card needs an honest empty state, not a spinner or a blank.
- **London: 542 items in one page**, in **62 separate `<gallery>` blocks** (one per section). A cap is not an
  optimisation but a requirement — and the section structure is data worth offering (grouping, or a section filter).

Captions come in three shapes, all present in the example: `File.jpg` (none), `File.jpg|Caption`, and
`File.jpg|[[:Category:Marco Polo Canal|Marco Polo Canal]]` (a **linked** caption). Thumbnails come from the existing
`imageinfo` batch — the same call the category gallery already makes.

### Proposed v1 (small, and every piece already exists)

1. **A `commonsGallery` widget** — one field, a gallery page title; fetch `prop=revisions`, parse the `<gallery>`
   blocks, batch `imageinfo`, and render through the **existing** `GalleryGrid`/`GalleryList` renderers with the
   existing `displayMode` / `iconSize` / `imageFit` / `maxItems` vocabulary, so it behaves like its siblings.
2. **A `commons-gallery` lookup source** — the ⚙ field becomes a validated typeahead over the 87k galleries
   (CirrusSearch `hastemplate:"Gallery page"` in ns-0): ISSUE-68/99 machinery, already built and tested.
3. **Emit channels**, following the wikiBox precedent (ISSUE-91): `lines` = the captions in order (a curated list
   that can feed a Filter, a Translator or a Speaker) and `selection` = the file the reader clicked, as `File:…`, so
   one click can drive the Document Reader, a pageviews card, or anything else.
4. **An honest empty state** for the Berlin case, naming the trap rather than showing nothing.

**Known limits, stated rather than hidden:** a gallery generated *by a template* has no literal `<gallery>` in its
wikitext and would read as empty (the rendered-HTML fallback exists for exactly that, at 10× the bytes — decide per
case); captions are in whatever language they were written in (the `{{Gallery page}}` i18n covers the template's own
chrome, not the captions); section grouping is a v2 question.

**Effort:** about a day — a fetcher, one pure parser (highly testable: `<gallery>` blocks and pipe-separated lines),
a registry entry, a lookup source, a demo, docs. No new format, no migration.
