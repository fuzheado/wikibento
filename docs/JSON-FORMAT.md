# Dashboard JSON Format — Specification v1

The dashboard configuration format used by **Export**, **Import**, and
`localStorage` persistence. Validated at runtime by
`src/lib/dashboardConfig.js` (`validateDashboard`); machine-readable schema at
[docs/dashboard.schema.json](dashboard.schema.json).

## Top Level

```json
{
  "version": 1,
  "widgets": [ ... ],
  "layout": [ ... ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `version` | integer | optional | Must be `1` (or absent — treated as 1). Reserved for future migrations |
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
| `glamorgan` | `category` | string (Commons category tree) |
| | `depth` | number, integer 0–12 (subcategory recursion) |
| | `year` / `month` | numbers (pageview range; data starts 2015-08) |
| | `negcats` | string, pipe-separated categories to exclude |
| | `negdepth` | number, integer (exclusion depth) |
| | `fileBudget` | number, integer 50–1,000 (files walked; capped trees labeled) |
| | `topN` | number, integer 1–10 (filmstrip size) |
| | `showDetail` | boolean (top-file per-page usage table) |

**Every widget** additionally accepts:

| Field | Type | Rules |
|---|---|---|
| `refreshSeconds` | number | ≥ 30 (the app's auto-refresh interval; API etiquette floor) |
| `_title` | string | Optional display title override for the header |

**Unknown config keys** are tolerated (forward compatibility) but flagged as
warnings by the validator.

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
