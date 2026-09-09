# Dashboard JSON Format — Specification v1

The dashboard configuration format used by **Export**, **Import**, and
`localStorage` persistence. Validated at runtime by
`src/lib/dashboardConfig.js` (`validateDashboard`); machine-readable schema at
[docs/dashboard.schema.json](dashboard.schema.json).

## Top Level

```json
{
  "version": 1,
  "params": { ... },
  "widgets": [ ... ],
  "layout": [ ... ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `version` | integer | optional | Must be `1` (or absent — treated as 1). Reserved for future migrations |
| `params` | object | optional | Board params (ISSUE-50): `{ name: { label, type, options, value } }`, `type` = `buttons` \| `select` \| `text` \| `number` (options `[min, max, step]`) \| `month`. Widget configs reference them with `{{name}}`; a `boardControls` card renders them |
| `widgets` | array | ✅ | At least one entry; see [Widget](#widget) |
| `layout` | array | ✅ | May be empty (widgets auto-place); see [Layout Item](#layout-item) |

## Widget

```json
{
  "id": "example-pageviews",
  "widgetType": "pageviews",
  "config": { "...": "..." }
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | ✅ | Non-empty, **unique** across `widgets`. Used to match `layout[].i` |
| `widgetType` | string | ✅ | One of the registered types (below) |
| `config` | object | optional | Per-type config; missing fields fall back to the widget's defaults |

### Registered widget types and their config

| widgetType | Config fields | Type / allowed values |
|---|---|---|
| `pageviews` | `article` | string (e.g. `Main_Page`) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` \| `commons.wikimedia` |
| | `displayMode` | `stat` \| `trend` |
| `linkcount` | `domain` | string (e.g. `Libretexts.org`) |
| | `wiki` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` |
| `categorySize` | `category` | string (with or without `Category:` prefix) |
| | `wiki` | `commons.wikimedia` \| `en.wikipedia` |
| | `sampleCount` | number, integer 0–24 (0 = no photo sample; Commons only) |
| `wikistats` | `table` | `wikipedias` \| `wiktionaries` \| `wikisources` |
| | `lang` | `en` \| `de` \| `fr` \| `ja` \| `zh` \| `es` \| `ar` \| `pt` \| `ru` \| `it` |
| `fileUsage` | `filename` | string (with or without `File:` prefix) |
| | `topN` | number, integer (rows shown) |
| | `showImage` | boolean (image preview) |
| | `showCaption` | boolean (file summary text) |
| `topWikipedias` | — | no config fields |
| `listSource` | `title` | string (optional card title) |
| | `items` | string, one line per list item (EMITTED to the board — see Dataflow below) |
| `filterLines` | `source` | widget id of an emitting widget on the board |
| | `pattern` | string (match text) |
| | `match` | `contains` \| `equals` \| `starts` \| `ends` |
| | `caseSensitive` | boolean |
| `lineCount` | `source` | widget id of an emitting widget on the board |
| | `label` | string (optional stat label) |
| `echo` | `source` | widget id of an emitting widget on the board |
| | `title` | string (optional card title) |
| `glamorgan` | `category` | string (Commons category tree) |
| | `depth` | number, integer 0–12 (subcategory recursion) |
| | `year` / `month` | numbers (pageview range; data starts 2015-08) |
| | `negcats` | string, pipe-separated categories to exclude |
| | `negdepth` | number, integer (exclusion depth) |
| | `fileBudget` | number, integer 50–30,000 (files walked via the PetScan relay; the self-walk fallback caps at 1,000; capped trees labeled) |
| | `topN` | number, integer 1–10 (filmstrip size) |
| | `showDetail` | boolean (top-file per-page usage table) |
| `markdown` | `text` | string, Markdown (static widget — no fetch) |
| `boardControls` | `title` | string (card title) |
| | `spec` | string, one param per line: `name \| type \| Label \| options` — saving rewrites the board `params` block |
| | `show` | string, comma-separated param names rendered on **this** card (empty/absent = all) — split controls across cards, e.g. one card for the article and one for the language (ISSUE-59) |
| `topPages` | `lang` | 28 Wikipedia language codes (`en`, `de`, `fr`, …) |
| | `dateMode` | `latest` \| `day` \| `month` \| `year` (hatnote data updates ~02:00 UTC) |
| | `topN` | number, integer 1–100 (0/100 = all) |
| | `filterNoise` | boolean (drop sponsored TLD/spam pages) |
| | `showExpanded` | boolean (120px thumb + intro per row) |
| `excerpt` | `article` / `project` | string (REST `/page/summary`) |
| `edithistory` | `article` / `project` | string; `limit` number |
| `quality` | `article` / `project` | string (Lift Wing ORES class) |
| `assessments` | `article` / `project` | string; `topN` number |
| `gallery` | `article` / `project` | string (REST `/page/media-list`) |
| | `displayMode` | `grid` \| `list` |
| | `iconSize` | `small` \| `medium` \| `large` |
| | `imageFit` | `contain` \| `cover` |
| | `minSize` / `maxItems` | numbers (px filter / row cap; 0 = all) |
| `panorama360` | `filename` | string, Commons file (2:1 / GPano) |
| | `project` | `commons.wikimedia` |
| | `autoRotate` | boolean |
| `fileGallery` | `files` | string, one Commons file per line (textarea) |
| | `order` | `listed` \| `random` \| `alpha` \| `largest` |
| | `displayMode` | `grid` \| `list` |
| | `iconSize` / `imageFit` | as `gallery` |
| | `maxItems` | number (0 = all) |
| `articleList` | `articles` | string, one article title per line (textarea) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` |
| | `enrich` | boolean (batched thumbs + intros) |
| | `maxItems` | number (0 = all) |
| `wikiPage` | `url` | string, any embeddable http(s) URL (custom mode — overrides the page fields; framed with `sandbox`; ISSUE-62) |
| | `page` | string, any namespace (e.g. `Help:Introduction`) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` \| `commons.wikimedia` |
| | `mobile` | boolean (`?useformat=mobile` — MobileFrontend mobile view on the same domain) |
| | `fragment` | string, optional `#anchor` |
| `cimSnapshot` | `category` / `scope` | string (CIM-registered) · `deep` \| `shallow` |
| | `month` | number (default: last complete month) |
| `cimTrend` | `category` / `scope` / `wiki` | string · `deep` \| `shallow` · `all-wikis` \| project |
| | `months` | number, integer 2–24 |
| `cimTopFiles` | `category` / `scope` / `wiki` / `topN` | as above; `topN` number |
| `cimTopWikis` | `category` / `scope` / `topN` | as above |
| `cimTopPages` | `category` / `scope` / `wiki` / `topN` | as above |
| `cimTopEditors` | `category` / `scope` / `editType` / `topN` | `editType`: `all-edit-types` \| `create` \| `update` |
| `cimLeaderboard` | `scope` / `wiki` / `highlight` | `highlight`: optional category (rank shown if in top 100) |
| `cimFileSpotlight` | `filename` / `wiki` | string (Commons file) · `all-wikis` \| project |
| `cimFileTraffic` | `filename` / `wiki` / `months` | as above; `months` number 3–24 (fetch window) |
| `sparql` | `preset` | preset id (fills `query` + `endpoint`; see src/lib/sparqlPresets.js) |
| | `query` | string, SPARQL (textarea; empty uses the preset's) |
| | `endpoint` | `wdqs` \| `qlever-commons` \| `humaniki` |
| | `renderer` | `auto` \| `stat` \| `bar` \| `line` \| `table` |
| | `maxRows` | number, integer (row cap) |
| `waybackGallery` | `url` | string (any website) |
| | `dates` | string, one YYYY-MM-DD per line (≤24) |
| | `toleranceDays` | number (default 30; gates "within tolerance" tiles) |
| `mediaPlayer` | `files` | string, one Commons file per line (video or audio) |
| | `mediaType` | `auto` \| `video` \| `audio` |
| | `quality` | `auto` \| `240` \| `480` \| `720` \| `1080` (height-based; auto = largest ≤1080p) |
| | `loopPlaylist` | boolean (wrap end → start; single file = native loop) |
| | `shuffle` | boolean (Fisher-Yates per playlist change) |
| | `autoplay` | boolean (browsers need one click first — ▶ Start pill) |

**Every widget** additionally accepts:

| Field | Type | Rules |
|---|---|---|
| `refreshSeconds` | number | ≥ 30 (the app's auto-refresh interval; API etiquette floor) |
| `_title` | string | Optional display title override for the header |

**Unknown config keys** are tolerated (forward compatibility) but flagged as
warnings by the validator.

> The canonical widget-type list and per-type config vocabulary live in
docs/dashboard.schema.json and the `WIDGET_TYPES` registry
(src/widgets/index.js) — the runtime validator enforces them; keep this
table in sync when adding a widget.

## Layout Item

```json
{ "i": "example-pageviews", "x": 0, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 }
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `i` | string | ✅ | Must **match a widget id**; unique per layout |
| `x`, `y` | number | ✅ | Grid coordinates (12-column grid, row height 80px) |
| `w` | number | ✅ | Width in columns; 1–12 (out of range → clamped, warning) |
| `h` | number | ✅ | Height in rows; ≥ 1 |
| `minW`, `minH` | number | optional | Minimum size for the resize handle; ≥ 1 |

## Widget-to-widget connections (Dataflow)

Beyond board params, a widget can **emit** its output and another widget can
**consume** it two ways (see docs/ISSUES.md ISSUE-52):

1. **`source` config field** on the consuming widget (e.g. `filterLines`,
   `lineCount`, `echo`) — set it to the **id** of any widget on the board
   that emits. The producer's output reaches the consumer's `transform` as
   `opts.sourceOutput` and consumers re-fetch automatically when it changes.
   In JSON it's a plain string: `"config": { "source": "flow-list", ... }`;
   in the ⚙ panel it's a **combobox** — dropdown of emitting widgets (by
   instance id) **and** manual id typing.
2. **`{{widget:<id>}}` interpolation** — the same deep-string mechanism as
   `{{param}}` board params, resolvable in ANY string config field. Arrays
   join with newlines, so a Text List's lines can feed a multi-line textarea
   field directly:
   `"config": { "articles": "{{widget:flow-list}}", ... }`
   Unknown widget ids are left literal (never break a board) — but a widget
   that **fetches** will not send an unresolved placeholder upstream: it shows
   a **"Waiting for a reference"** state instead and loads automatically once
   the producer emits (ISSUE-58). Under text/textarea config fields the ⚙
   panel lists the available emitters as clickable `{{widget:<id>}}` chips, so
   references are inserted precisely instead of typed from memory.

### Instance ids and renaming (ISSUE-53)

- Every widget's **id** is its stable instance name — the header shows a
  small id chip (click → ⚙), the ⓘ panel shows it, and the source picker
  lists emitters by id.
- ⚙ edits it under **Name**: validates non-empty,
  `[A-Za-z0-9_-]` (the reference grammar), and unique on the board.
- Renaming a referenced id opens a **confirm dialog** — "N references in M
  widgets" — and confirm **repoints all of them** (source fields + every
  `{{widget:old-id}}` token, deep) and the layout entry; Cancel changes
  nothing.
- ⚙ also has **Display title (optional)** (header override, `_title`).
- Imported boards whose ids use characters outside `[A-Za-z0-9_-]` get a
  warning (they can't be referenced via interpolation/the picker).

Emitting widget types (current): `listSource` (the lines), `filterLines`
(the filtered lines), `lineCount` (the number), `echo` (pass-through), and
`excerpt` (the article's first paragraph — feed it to Translator, Speaker or
Markdown via `text: "{{widget:<excerpt-id>}}"`). The canonical demo chain
lives at `?config=/flow-demo.json`:
**🧾 Text List → 🔎 Filter Lines → 🔢 Line Count → 🖨️ Value Display**.

Deliberately **not** emitting yet: article *title* lists. Machine-translated
titles can be mistaken for Wikidata language mapping (an actual per-language
article name) rather than an MinT translation — if added, the card must label
the output as machine translation (ISSUE-58).

## Validation Behavior

`validateDashboard(input)` returns `{ valid, errors, warnings, widgets, layout }`.

- **Errors block the import** (nothing is applied): malformed JSON, missing
  arrays, unknown `widgetType`, duplicate ids, type mismatches, out-of-options
  select values, `refreshSeconds` < 30, layout entries without a matching widget.
- **Warnings are non-fatal** (import still succeeds): widget without a layout
  entry (auto-placed), `w` out of range (clamped by the grid), unknown config
  keys, missing `config` (defaults used).
- Import applies **only after validation passes**; the file/paste is never
  partially applied.

## Complete Example

```json
{
  "version": 1,
  "widgets": [
    { "id": "pv", "widgetType": "pageviews", "config": { "article": "Main_Page", "project": "en.wikipedia", "displayMode": "stat", "refreshSeconds": 3600 } },
    { "id": "cat", "widgetType": "categorySize", "config": { "category": "Images from Wiki Loves Monuments 2024", "wiki": "commons.wikimedia", "sampleCount": 6, "refreshSeconds": 3600 } },
    { "id": "fu", "widgetType": "fileUsage", "config": { "filename": "The Earth seen from Apollo 17.jpg", "topN": 10, "showImage": true, "showCaption": true, "refreshSeconds": 3600 } }
  ],
  "layout": [
    { "i": "pv", "x": 0, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 },
    { "i": "cat", "x": 3, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 },
    { "i": "fu", "x": 6, "y": 0, "w": 3, "h": 5, "minW": 2, "minH": 4 }
  ]
}
```

The app ships a ready-made all-six-widgets example (`EXAMPLE_DASHBOARD` in
`src/lib/dashboardConfig.js`) — the ✨ **Example** button loads it, and it's
exactly what `dashboard.json` looks like after export.

## Loading a Dashboard from a URL

- **`?config=<url>`** — fetch a hosted dashboard JSON. URLs on Wikimedia wikis
  (`*.wikipedia.org`, `*.wikimedia.org`, …) are fetched via the Action API
  (`action=parse&prop=wikitext`, CORS-enabled) — point it at any page holding
  JSON. Both `/wiki/Title` and `/w/index.php?title=Title` URL forms work, and a
  `<syntaxhighlight>`/`<pre>` wrapper around the JSON is stripped automatically.
  **Working example:** `?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json`
  (verified 2026-08-12 — 7 widgets load from the on-wiki config). Any other
  host must send CORS headers (`raw.githubusercontent.com`, Toolforge tools, etc.).
- **`?config=<w.wiki short URL>`** — Wikimedia's URL shortener
  (`https://w.wiki/XXXX`, or bare `w.wiki/XXXX`) is expanded server-side by the
  same-origin `/api/resolve` endpoint (deploy/server.js — browsers can't follow
  w.wiki redirects because the target page sends no CORS headers). After
  expansion the URL goes through the normal wiki/direct fetch logic. **Working
  example:** `?config=https://w.wiki/TR9R` (verified 2026-08-12 — expands to the
  Bento-demo.json page, 8 widgets load). On a plain static host without the
  resolver, a CORS-enabled w.wiki target still works via direct fetch; otherwise
  a clear error is shown.
- **`#/d/<base64url>`** — the config embedded directly in the URL hash
  (self-contained; no hosting needed). The 🔗 Share button produces these.
- Load order: URL config > saved dashboard (localStorage) > defaults. A failed
  URL load shows a dismissible error banner and falls back to the saved
  dashboard. The config is validated with the same `validateDashboard` rules
  before anything is applied.
- `public/dashboard.json` ships with the app as a hosted sample (the example
  dashboard) — try `?config=/dashboard.json`.

## Compatibility Notes

- Exported files carry `"version": 1` (added 2026-08-12); older exports without
  `version` still import.
- The widget registry (`src/widgets/index.js`) is the source of truth for
  `configFields` — new widget types or config fields automatically become part
  of the format's vocabulary via `validateDashboard`.
