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
│       └── ErrorBoundary  (one crashing widget can't kill the dashboard)
│           └── WidgetFrame  (fetch lifecycle, config panel, title bar)
│           ├── .widget-header      ← drag handle (draggableHandle=".widget-header")
│           │   ├── title (icon + _title)
│           │   └── ⚙ config · ↻ refresh · ✕ remove
│           ├── .widget-config      ← rendered from def.configFields
│           └── WidgetContent  (dispatch on def.renderer — ~20 named cards,
│                                shared across widgets; full list in
│                                WIDGET-DEVELOPMENT.md)
│               ├── StatCard        ← big number + detail + sparkline
│               ├── RankingCard     ← header + numbered rows
│               ├── TrendCard       ← SVG polyline chart
│               └── GalleryGridCard ← shared by gallery + fileGallery (same card)
├── AddWidgetPanel  (modal catalog, search filter)
├── SharePanel  (QR code + copyable link modal)
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

1. On mount, on widget-type change, or when the app bumps `reloadKey`
   (import / example / reset): `load()` runs `def.fetch(config)` →
   `def.transform(data, config)` → `state.data`. **Config edits do NOT
   auto-reload** — the ⚙ panel is a draft surface, and only Apply &
   Reload (or ↻) commits, so typing never fires speculative fetches.
2. `state` is `{ loading, error, data }`; loading spinner / error + Retry button are
   handled centrally — widget renderers never see network errors.
3. Auto-refresh: `setInterval(load, refreshSeconds * 1000)`; the interval
   is recreated when `load` changes identity (config change), but ticks
   never fire on keystrokes.
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
| `GalleryGridCard` / `GalleryListCard` | `{ title, subtitle, rows: [{title, thumbUrl, fileUrl, caption}], size?, fit? }` — the **canonical image-row contract**; shared by `gallery` + `fileGallery` (see Shared Renderers) |

Optional media fields: `sample` renders a thumbnail strip (links to Commons file pages);
`image` renders a preview above the table (link to the Commons page via `fileTitle`);
`caption` renders the file's HTML-stripped `ImageDescription`. Config-driven display
flags (e.g. `showImage`, `showCaption`, `sampleCount`) belong in the widget's
`defaults` + `configFields`; the transform decides what to pass through.

This keeps data sources, presentation, and configuration fully decoupled.

## Shared Renderers

Cards are **named components** (the `WidgetContent` switch in
`WidgetFrame.jsx`), not per-widget classes — any number of registry
entries can dispatch to the SAME card. The entry contributes its own
`fetch` + `transform`; the card renders whatever contract it receives.

- `gallery` and `fileGallery` already share `GalleryGridCard` /
  `GalleryListCard` — both transforms emit the same image-row contract.
- Mode switching WITHIN one widget uses `getRenderer(config)` (pageviews
  stat ↔ trend; gallery grid ↔ list).
- The **image-row contract** is the canonical shape for any widget that
  presents a set of media: `rows: [{ title, thumbUrl, fileUrl, caption }]`.
  A new source (category random sample, PagePile list, SPARQL results)
  just produces conforming rows and reuses the cards.
- Planned (ISSUE-33/34/37/38): `GallerySlideshowCard` + `GalleryTickerCard`
  written once, shared by `gallery`, `fileGallery`, and `categorySize`
  (random-sample visual modes). Fetchers stay per-widget — only their
  output converges.

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
   chart library needed. (`recharts` was removed in the Phase 0 cleanup.)
5. **localStorage as the database.** Deliberate for v1: zero infra, survives refresh.

## Third-Party API Contracts (dependency-drift watchlist)

react-grid-layout 2.x has **twice silently dropped props** — the board kept
rendering, just wrong, with no error or warning (2.2.4 regrouped props into
config objects; old names are ignored, not rejected). The two incidents:

| Incident | Symptom | Fix |
|---|---|---|
| `draggableHandle` → `dragConfig` (found 2026-08-13) | panorama mouse-drags moved the widget instead of panning; header-only dragging was silently off for everything | `dragConfig={{ handle: '.widget-header', cancel: '.no-drag' }}` |
| `rowHeight`/`margin`/`cols`/`containerPadding` → `gridConfig` (found 2026-08-16) | grid rendered at RGL's 150px-row defaults; the app's intended 80px density never applied | `gridConfig={{ cols: 12, rowHeight: 80, margin: [12,12], containerPadding: [0,0] }}` |

**The contract we rely on (verify after any RGL upgrade):**
- `gridConfig` (cols/rowHeight/margin/containerPadding) — **measured** by
  `npm run smoke` (item height must equal `h×80 + (h−1)×12`).
- `dragConfig` handle/cancel — header-only dragging (manual check: drag a
  widget by its title bar; panorama canvas must pan, not drag).
- `width` prop, `onLayoutChange`, `compactType` — observed working.

**Prevention rules (this class of bug is invisible to unit tests):**
1. `react-grid-layout` is **pinned exact** (no `^`/`~`) — upgrades are
   deliberate, and go through `npm run smoke`.
2. After ANY dependency upgrade: read the changelog, diff the `.d.ts` for
   the props/APIs we use, then run `npm run smoke` (geometry asserts) +
   the drag-config manual check above.
3. When a prop stops taking effect, **measure the rendered result against
   the intended formula** before assuming the code is wrong — both RGL
   incidents surfaced only via pixel-vs-formula checks.

   On-wiki sync is the natural v2 upgrade (see ROADMAP.md).

## Known Issues & Limitations

| # | Issue | Location | Impact / Fix |
|---|---|---|---|
| 1 | ~~Grid width fixed, no resize listener~~ | App.jsx | **Fixed 2026-08-12** — rAF-throttled `resize` listener + `gridWidth` state; **<768px renders a single-column stack** (Grafana-style) instead of the grid. Stack order = grid layout (y, then x) so it mirrors desktop reading order; drags on desktop are reflected on phones |
| 2 | ~~Category Size subtitle heuristic~~ | widgets/index.js | **Fixed 2026-08-12** — subtitle now derived from `config.wiki` |
| 3 | ~~`recharts@3.10.1` unused dependency~~ | package.json | **Fixed 2026-08-12** — removed from `package.json` + lockfile (Phase 0) |
| 4 | ~~`public/favicon.svg` / `icons.svg` dead assets~~ | public/ | **Fixed 2026-08-12** — deleted; index.html uses an inline emoji data-URI favicon |
| 5 | Wikistats CSV parser splits on commas without quote handling | dataSources.js `fetchWikistats` | Works for the current s23 format; a field containing a comma would misalign columns |
| 6 | `exturlusage` count capped at 10 × 500 = 5,000 (API clamps `eulimit` to 500 for non-bots) | dataSources.js `countExtUrlUsage` | Matches Special:LinkSearch's displayed cap; bigger domains show "(5,000+ total)". Exact counts require DB replicas (SCALABILITY.md) |
| 7 | `_title` is not editable in the config panel | WidgetFrame.jsx | No configField renders it; users can't rename widgets |
| 8 | ~~Export only — no import~~ | App.jsx | **Fixed 2026-08-12** — ⬆ Import panel (file + paste) with `validateDashboard()` |
| 9 | ~~No React error boundary~~ | main.jsx | **Fixed 2026-08-12** — `ErrorBoundary` wraps each grid item (auto-resets on config change, Try Again button) |
| 10 | Browser strips the `User-Agent` header set via `fetch` (forbidden header) | dataSources.js | Harmless no-op: Wikimedia API etiquette is satisfied by the browser's own UA; keep it for non-browser reuse (tests, curl) |
| 11 | Dev-mode StrictMode double-mounts effects → double API fetches in dev | main.jsx | Dev only; production build unaffected |
| 12 | ↺ Reset doesn't clear the URL config (`?config=` / `#/d/<base64>`) | App.jsx `handleReset` | Reset restores defaults, but refresh re-applies the URL config (URL has priority). Fix: `history.replaceState` to the bare path in `handleReset` |
| 12 | ~~No shared fetch cache~~ | dataSources.js | **Fixed 2026-08-12 (Wikistats)** — 5-min TTL cache + in-flight coalescing (`lib/fetchCache.js`); two widgets now share one CSV fetch. Other fetchers can adopt the same helper |
| 13 | `AddWidgetPanel` can't be closed with Escape, and overlay has no focus trap | AddWidgetPanel.jsx | Minor a11y gap — the Share panel (added 2026-08-12) does support Escape-to-close; apply the same pattern here |
| 14 | Config panel has no per-field validation (e.g. `topN` accepts 0/negative) | WidgetFrame.jsx | Validate or clamp in transform/fetch |
| 15 | `handleLayoutChange` persists on every drag tick | App.jsx | Synchronous `localStorage.setItem` per mousemove — fine at this payload size, but debounce if dashboards grow |
| 16 | Long dashboards can't QR-share: `#/d/` links > ~1,500 chars are too dense for phones | SharePanel.jsx | The Share modal QR-encodes the current `?config=` URL when present; otherwise caps at 1,500 chars and shows a friendly notice |
| 17 | Wikistats fetch had no timeout/retry — transient network failures (Safari "Load failed") killed both widgets | dataSources.js | **Fixed 2026-08-12** — 15 s AbortController timeout, retry ×2 with backoff, 5xx retried / 4xx fail-fast; clear "timed out" message |
