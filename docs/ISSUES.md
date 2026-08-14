# WikiBento — Issue Tracker

Tracked issues and needed fixes, as noted during development. Format:
`ISSUE-NN · title` → what/why, reproduction, proposed fix, status.
Status: `open` · `in progress` · `done (commit)`. New issues: append, bump NN.

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
