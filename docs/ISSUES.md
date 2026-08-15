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

## ISSUE-18 · Slim / presentation mode: hide widget chrome — **open** (design)

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

**Proposed fix (if approved):** implement E above — toolbar toggle +
root `.slim` class + CSS reveal rules + grid lock + persistence
(localStorage `wikibento-slim` + `?slim=1`).

**Status:** open (design). Source: user request 2026-08-14.

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

**Status:** open. Source: IA API research 2026-08-14.

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
