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

## ISSUE-07 · CIM Top Editors: link user names — **open**

**What:** user names render as plain text; tiago.bio.br links
[User] | [Talk] | [Contrib] (Commons `User:`, `User_talk:`,
`Special:Contributions`).

**Why:** editors are the human side of impact — a clickable trail to their
work; `RankingCard` already supports `{text, href}` cells (ISSUE-02 fix).

**Proposed fix:** emit the user column as link cells — either three
separate cells or one cell with `[User]|[Talk]|[Contrib]` superscript
links (match Tiago's pattern; keep row height small).

**Status:** open. Source: tiago.bio.br comparison, 2026-08-14.

## ISSUE-08 · CIM Top Pages: link page titles (wiki-aware) — **open**

**What:** page titles render as plain text even when a single wiki is
selected; tiago.bio.br links pages when wiki ≠ all-wikis and shows a
"links are not available for all-wikis" warning otherwise.

**Why:** the point of top pages is click-through to the articles; only
all-wikis mode lacks a resolvable host.

**Proposed fix:** transform emits `{text, href: https://<wiki>.org/wiki/<title>}`
when `config.wiki !== 'all-wikis'`, plain text + a subtitle note when
all-wikis. Same `{text, href}` mechanism as ISSUE-02/07.

**Status:** open. Source: tiago.bio.br comparison, 2026-08-14.

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
