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

## ISSUE-03 · Every widget needs a ⓘ info button — **open**

**What:** no per-widget explanation of what a widget shows. Users must guess
or reopen the +Add Widget catalog.

**Why:** each registry entry already HAS the content —
`description` (and `dataSource`) — but the widget header (⚙/↻/✕ in
WidgetFrame.jsx) doesn't expose it.

**Proposed fix:** add a ⓘ button to the widget header that toggles a small
popover/inline panel showing `def.description` (exact text from the catalog)
+ the `dataSource` line. Same visual treatment as the config panel; Escape
closes; no schema/format changes (description is already in the registry).
