# Architecture

## Overview

WikiBento is a single-page React app with **no backend**. All state lives in the
browser, all data comes from Wikimedia APIs via CORS. The app is a thin shell
(`App.jsx`) around a **widget registry** (`src/widgets/index.js`) — every widget type is
a declarative entry describing its config, fetcher, and renderer. Adding a widget is
adding one registry entry (see [WIDGET-DEVELOPMENT.md](WIDGET-DEVELOPMENT.md)).

## Component Tree

```
App  (state: widgets[], layout[], panel visibility)
├── GridLayout  (react-grid-layout, 12 cols, rowHeight 80, vertical compaction)
│   └── .grid-item × N
│       └── WidgetFrame  (fetch lifecycle, config panel, title bar)
│           ├── .widget-header      ← drag handle (draggableHandle=".widget-header")
│           │   ├── title (icon + _title)
│           │   └── ⚙ config · ↻ refresh · ✕ remove
│           ├── .widget-config      ← rendered from def.configFields
│           └── WidgetContent  (dispatch on def.renderer)
│               ├── StatCard        ← big number + detail + sparkline
│               ├── RankingCard     ← header + numbered rows
│               └── TrendCard       ← SVG polyline chart
├── AddWidgetPanel  (modal catalog, search filter)
└── .empty-state
```

## State & Persistence

- **Single source of truth:** `App.jsx` holds `widgets` (array of
  `{ id, widgetType, config }`) and `layout` (array of react-grid-layout items).
- **Persistence:** every mutation (add/remove/reconfig/layout change) writes
  `{ widgets, layout }` to `localStorage['wikibento-layout']`. Load happens once on
  mount (corrupt JSON falls back to defaults).
- **Widget identity:** stable `id` strings (defaults use slugs like `pageviews-main`;
  catalog-adds use `` `${typeId}-${Date.now()}` ``). `id` keys both the layout item
  (`layout[].i`) and the widget.
- **Config:** `config` is a free-form object. `_title` is an optional user override
  for the header (no longer auto-set on add); otherwise the header shows
  `labelFromConfig(config)` — the asset being analyzed (article, category, file,
  domain, language) — falling back to the generic widget name. `refreshSeconds`
  drives auto-refresh.

## Widget Lifecycle (WidgetFrame)

1. On mount (and whenever `config` changes): `load()` runs
   `def.fetch(config)` → `def.transform(data, config)` → `state.data`.
2. `state` is `{ loading, error, data }`; loading spinner / error + Retry button are
   handled centrally — widget renderers never see network errors.
3. Auto-refresh: `setInterval(load, refreshSeconds * 1000)`; the interval is torn down
   and recreated whenever `load` changes identity (i.e. on config change), which also
   triggers an immediate re-fetch — so **editing config auto-refreshes**.
4. The card renderer is `def.getRenderer?.(config) || def.renderer` — a widget can
   swap renderers per config (e.g. pageviews stat ↔ trend display mode).

## The Widget Registry Pattern

Each entry in `WIDGET_TYPES` (src/widgets/index.js) is self-contained:

```js
pageviews: {
  id, name, icon, description,
  defaults: { article, project, displayMode, refreshSeconds },
  renderer: 'StatCard',            // StatCard | RankingCard | TrendCard
  dataSource: 'pageviews',         // informational label
  configFields: [ ... ],           // drives the gear-panel form
  fetch:   (config) => fetchPageviews(config.article, config.project),
  transform: (data, config) => ({ title, subtitle, value, detail, trend, ... }),
}
```

The **transform contract** is the only thing renderers understand:

| Renderer | Expected transform output |
|---|---|
| `StatCard` | `{ title, subtitle?, value, detail?, trend?: [{date, views}], trendLabel?, sample?: [{title, url}] }` |
| `RankingCard` | `{ title, subtitle?, columns: [h1, h2], rows: [[c1, c2], ...], image?: {url, description}, caption?, fileTitle? }` |
| `TrendCard` | `{ chartData: [{date, views}], chartKey, chartLabel }` |
| `GlamCard` | `{ title, subtitle?, stats: [{label, value, sub?}] ×4, filmstrip?: [{title, views, thumbUrl}], detail?: {title, rows: [{wiki, page, views}]} }` |

Optional media fields: `sample` renders a thumbnail strip (links to Commons file pages);
`image` renders a preview above the table (link to the Commons page via `fileTitle`);
`caption` renders the file's HTML-stripped `ImageDescription`. Config-driven display
flags (e.g. `showImage`, `showCaption`, `sampleCount`) belong in the widget's
`defaults` + `configFields`; the transform decides what to pass through.

This keeps data sources, presentation, and configuration fully decoupled.

## Data Flow Diagram

```
AddWidgetPanel ──onAdd──▶ App.handleAddWidget ──▶ widgets[] ──▶ WidgetFrame
                                                      │              │
config change (gear) ◀── onUpdateConfig ◀────────────┘         def.fetch(config)
                                                      │              │
                                        localStorage ◀─persist      ▶ Wikimedia APIs
                                                      │              (CORS, browser UA)
export/reset ───────────────────────────────────────▶ downloads / defaults
```

## Key Design Decisions

1. **No proxy.** All five endpoints already send CORS headers, so the app runs from any
   static host. (The `origin=*` parameter on MediaWiki Action API calls is what unlocks
   browser access; RESTBase and Wikistats allow CORS natively.)
2. **Registry over inheritance.** Widgets are data, not component subclasses — this is
   what makes the catalog panel, config forms, and rendering all generic.
3. **Centralized fetch state.** Renderers are pure; WidgetFrame owns loading/error/retry.
4. **Hand-rolled SVG charts.** The sparkline and TrendCard are ~30 lines of SVG — no
   chart library needed. (`recharts` is installed but never imported; see Known Issues.)
5. **localStorage as the database.** Deliberate for v1: zero infra, survives refresh.
   On-wiki sync is the natural v2 upgrade (see ROADMAP.md).

## Known Issues & Limitations

| # | Issue | Location | Impact / Fix |
|---|---|---|---|
| 1 | Grid width is fixed at `window.innerWidth - 40`, computed once per render — **no resize listener** | App.jsx | Widgets won't reflow when the window is resized until some other re-render; fix with a `resize` listener + `useState` |
| 2 | ~~Category Size subtitle heuristic~~ | widgets/index.js | **Fixed 2026-08-12** — subtitle now derived from `config.wiki` |
| 3 | `recharts@3.10.1` is an unused dependency | package.json | Not in the bundle (tree-shaken), but should be removed from `package.json` |
| 4 | `public/favicon.svg` and `public/icons.svg` are dead assets | public/ | index.html uses an inline emoji data-URI favicon; neither file is referenced. Delete or wire up |
| 5 | Wikistats CSV parser splits on commas without quote handling | dataSources.js `fetchWikistats` | Works for the current s23 format; a field containing a comma would misalign columns |
| 6 | `exturlusage` count capped at 10 × 500 = 5,000 (API clamps `eulimit` to 500 for non-bots) | dataSources.js `countExtUrlUsage` | Matches Special:LinkSearch's displayed cap; bigger domains show "(5,000+ total)". Exact counts require DB replicas (SCALABILITY.md) |
| 7 | `_title` is not editable in the config panel | WidgetFrame.jsx | No configField renders it; users can't rename widgets |
| 8 | Export only — **no import** of `dashboard.json` | App.jsx | Add an Import button (validates `{widgets, layout}`) |
| 9 | No React error boundary | main.jsx | A render error in one widget crashes the whole dashboard; wrap each grid item |
| 10 | Browser strips the `User-Agent` header set via `fetch` (forbidden header) | dataSources.js | Harmless no-op: Wikimedia API etiquette is satisfied by the browser's own UA; keep it for non-browser reuse (tests, curl) |
| 11 | Dev-mode StrictMode double-mounts effects → double API fetches in dev | main.jsx | Dev only; production build unaffected |
| 12 | No shared fetch cache | WidgetFrame.jsx | Two widgets hitting the same endpoint (e.g. Wiki Stats + Top 10 both fetch the Wikistats CSV) fetch independently; add a tiny in-memory TTL cache in v2 |
| 13 | `AddWidgetPanel` can't be closed with Escape, and overlay has no focus trap | AddWidgetPanel.jsx | Minor a11y gap |
| 14 | Config panel has no per-field validation (e.g. `topN` accepts 0/negative) | WidgetFrame.jsx | Validate or clamp in transform/fetch |
| 15 | `handleLayoutChange` persists on every drag tick | App.jsx | Synchronous `localStorage.setItem` per mousemove — fine at this payload size, but debounce if dashboards grow |
