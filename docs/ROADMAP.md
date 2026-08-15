# Roadmap — Next Steps

Status as of the 2026-08-12 audit: **all 7 widgets verified live**, build clean,
app fully functional as a v1. This document orders what comes next.

## Strategy — Power Widgets → Starter Packs → Spike Alert (2026-08-12 brainstorm)

The widget strategy agreed 2026-08-12 (full taxonomy in [WIDGET-IDEAS.md](WIDGET-IDEAS.md), source: brainstorm doc):

```
Power widgets (SPARQL, PetScan, URL extractor)  →  makes WikiBento a framework
Starter packs (7 pre-built bentos)              →  removes the cold start
Spike alert (the killer widget)                 →  makes it shareable / PR-worthy
```

- **Tier 1 power widgets** — SPARQL Query (WDQS, CORS-enabled), PetScan Query,
  Arbitrary URL Extractor. One widget = infinite metrics; this is what turns
  "a nice dashboard" into "a framework."
- **Starter packs** — pre-configured JSON bentos (same `dashboard.json` format
  already exported). Grafana/Kibana-style adoption: users select, then tweak.
  Lineup: 🏛️ GLAM Footprint · 📰 Newsroom Pulse · 🔭 WikiProject Monitor ·
  🎪 Edit-a-thon Live · 📈 Campaign Tracker · 🧑‍🔬 Researcher's View · ✍️ Personal Dashboard.
- **Spike alert (Article Watch)** — pageviews with a 3×-baseline spike detector;
  the hero, screenshot-able feature (newsroom / GLAM "suddenly famous" moments).

Tiers 2–5 (GLAM, Article, Live, Community) are detailed in WIDGET-IDEAS.md; many
Tier-2 GLAM widgets already ship (GLAM Category Usage, File Usage Map).

## Phase 0 — Quick Wins (½ day, no new features)

Housekeeping found during the code audit. Safe for a first PR.

- [x] **Remove unused `recharts` dependency** (package.json) — done 2026-08-12
- [x] **Delete dead assets** `public/favicon.svg` + `public/icons.svg` — done 2026-08-12 (favicon is
      an inline data URI in index.html)
- [x] **Fix grid resize reflow** — done 2026-08-12: rAF-throttled `resize` listener +
      `gridWidth` state (ARCHITECTURE #1)
- [x] **Fix Category Size subtitle heuristic** — done 2026-08-12: subtitle now
      derived from `config.wiki` (ARCHITECTURE #2)
- [x] **Sanitize user input** — done 2026-08-12: `Category:` / `File:` prefixes
      stripped in fetchers (DATA-SOURCES §3, §5)
- [x] **Asset-aware widget titles** — done 2026-08-12: renderers display transform
      `title`/`subtitle`; headers show `labelFromConfig(config)` live; pageviews
      trend mode fixed via `getRenderer` dispatch
- [x] **Add an Error Boundary** around each grid item — done 2026-08-12:
      `ErrorBoundary.jsx` wraps every widget; auto-recovers on config change,
      Try Again button (ARCHITECTURE #9)

## Phase 1 — v2 Features (the "What's Not Here" list, evaluated)

| Idea | Effort | Impact | Notes |
|---|---|---|---|
| ~~**Import dashboard.json**~~ | S | High | **Done 2026-08-12** — ⬆ Import panel (file + paste) with `validateDashboard()`: precise per-field errors, non-fatal warnings, atomic apply. Also added ✨ Example dashboard (all 7 widget types) and the **JSON format spec** (docs/JSON-FORMAT.md + dashboard.schema.json + `version: 1` on exports) |
| **Shared fetch cache** | S | Medium | **Done 2026-08-12 for Wikistats** (5-min TTL + coalescing, `lib/fetchCache.js`); extend to other fetchers when needed |
| **Time-range selectors** | M | High | Pageviews widget is hardcoded to 30 days. Add `days` config (7/30/90/365) — RESTBase supports arbitrary ranges. Natural fit for the config panel |
| **Editable widget titles** | S | Low | `_title` exists but no configField renders it (ARCHITECTURE #7) |
| **CORS proxy** | S (partial) | High | **Done 2026-08-12 for hatnote + w.wiki:** deploy/server.js has `/api/resolve` (short-URL expansion) and `/api/proxy` (https GET, wraps `{status, body}` with `ACAO: *`) — used by the Top Wikipedia Articles widget and `?config=` w.wiki links. The **Arbitrary URL Extractor power widget** will reuse `/api/proxy` for arbitrary scraped sources |
| ~~**Power widget: SPARQL Query**~~ | S–M | High | **Done 2026-08-13** — `sparql` widget: WDQS + QLever (Commons) + Humaniki (precomputed gender gap); auto-detecting renderer (big number / bars / line / table) with manual override; 4 presets (Met depth, multi-institution, Women-in-Red %, Commons top-depicts); 60 s timeout, retry, 10-min TTL cache; GET≤1,800 chars else form-urlencoded POST (no preflight). Map / force-graph renderers (d3-force) remain Phase 2 — see WIDGET-IDEAS.md Tier 1 |
| **Power widget: PetScan Query** | S–M | High | Category/template intersections via `petscan.wmcloud.org` (`format=json` + PSID); list/table output. ⚠️ gotcha: PetScan ignores `max` in quick-intersection mode — always pass bounded params (depth, categories). See WIDGET-IDEAS.md Tier 1 |
| **Power widget: Arbitrary URL Extractor** | M | High | Paste a tool URL + CSS selector/regex, pick a metric (sum/count/top-N). The escape hatch wrapping any tool; non-CORS targets need the proxy row above |
| **Spike alert (Article Watch)** | M | High | Pageviews + anomaly detector: watched article jumps 3× its baseline → widget lights up. Newsroom editorial intelligence; the shareable hero feature. Needs baseline-window config (7/30 d) |
| **Starter packs** | S each | High | 7 pre-configured bentos as `dashboard.json` presets with a picker on first run. Ship first 3: GLAM Footprint, Newsroom Pulse, Edit-a-thon Live. See WIDGET-IDEAS.md Part 2 |
| **Multi-device sync via on-wiki JSON** | M–L | High | Store the dashboard at `User:Fuzheado/dashboard.json` on-wiki; fetch on load, push on change. Requires OAuth for writes — see below |
| **User authentication / OAuth** | L | High | OAuth 2.0 (MediaWiki) enables on-wiki sync, personal dashboards, and eventually save-to-page. See the `wikimedia-auth-oauth` skill |
| **Widget marketplace** | L | Medium | Community-contributed widgets need a schema-versioned registry (current configs have no version field) and a hosting story. Premature until the registry API stabilizes — but adding `schemaVersion` to exports now costs nothing |

## Phase 1.5 — Efficiency at Scale

- [ ] **Batch query planning + shared fetch layer** — multi-title Action API queries
      (50 titles/request) so hundreds of categories/files cost ~1 call per 50; TTL
      fetch cache with in-flight coalescing; concurrency cap + refresh jitter;
      visibility-based fetching. Full analysis in
      [SCALABILITY.md](SCALABILITY.md) (batching verified live 2026-08-12).

- [x] **CIM widget family (done 2026-08-13, separate widgets)** — the CIM-first idea shipped as **8 dedicated widgets** (snapshot, views-over-time, top files/wikis/pages/editors, global leaderboard, file spotlight) with a 1-h TTL cache and 404-disambiguation (probe previous month to separate 'not registered' from 'no data for this month'). The live `glamorgan` walk stays a separate, unchanged widget by design (2026-08-13 decision) — no CIM-first fallback inside it

## Phase 2 — Polish & Platform

- [x] **URL-shareable dashboards** — done 2026-08-12: 🔗 Share button copies a
      self-contained `#/d/<base64url>` link; `?config=<url>` loads a hosted
      dashboard.json (wiki pages fetched via the Action API, CORS-enabled hosts
      direct). URL > localStorage > defaults priority; error banner + fallback
- **Widget duplication** ("duplicate this widget") and **copy/paste configs**
- **Edit `refreshSeconds` from the config panel** — it's in `defaults` but has no
  configField today
- **Escape-to-close + focus trap** on AddWidgetPanel (ARCHITECTURE #13)
- **Categorized Add Widget catalog** (2026-08-13 note) — 28 widget types in a
  linear list is unwieldy. Add sections to the panel: each registry entry gets
  a `category` field (e.g. `commons` / `wikipedia-article` / `stats-tools` /
  `content`), and the panel groups + labels them ("Wikimedia Commons",
  "Wikipedia article vitals", "Stats & external tools", "Content").
  Sections could collapse to headers; keep the free-text search filtering
  across all categories.
- **Slide-out toolbox instead of centered modal** (2026-08-13 note) — the Add
  Widget modal covers the dashboard you're building on. Consider a 360–400px
  right-side slide-out drawer so the grid stays visible while browsing
  (pattern proven in the wikigraph project: `position: fixed; right: -420px`
  + `transition: right 0.3s ease`, `.open { right: 0 }`, always-rendered
  panel). Same for Import/Share if they grow.
- **Debounced search — don't load while typing** (2026-08-13 note) — the
  current catalog search is a local `filter()` over the registry (no network,
  no cost), but if we ever add live-loading to the panel — opensearch
  autocomplete, live previews, or the URL-extractor power widget's probes —
  debounce input ~250–300 ms (wait-for-pause) and cancel stale requests with
  `AbortController` before issuing new ones.
- **Lean display mode — hidden decorations by default** — **done 2026-08-15**
  (kiosk/presentation mode, ISSUE-18): ⛶ Present toggle + `?kiosk=1` URL
  param hide all widget chrome (title bars, ⚙/↻/✕, ⏱ footers, borders) and
  lock the grid; Esc or a floating ✕ Exit returns; browser fullscreen on the
  Present click (never on boot), nothing persisted — the URL param wins at
  boot, and ✕ Exit strips it so a refresh lands in normal mode. Per-widget
  hover/tap reveal was consciously NOT built: hidden headers are
  all-or-nothing by design, and the exit door is always visible
- **Responsive multi-breakpoint grid** — done 2026-08-12 in simplified form:
  <768px collapses to a single-column stack (Grafana-style); future option is
  react-grid-layout `Responsive` with intermediate breakpoints (md/sm)
- **Config validation** — clamp `topN` to 1–50, reject empty domains/categories
  (ARCHITECTURE #14)
- **Layout import via drag-drop of dashboard.json** onto the page
- **Light theme toggle** — CSS custom properties are already fully tokenized (`:root`)
- **i18n** — widget names/labels are hardcoded English; the registry makes this a
  message-table swap when wanted

## Phase 3 — Stretch

### Interactivity & Widget Wiring — DAG/cascade model (2026-08-13 direction, long-term)

> The vision: one widget's output feeds another's input — a text box that
> changes other widgets, or a Wikidata item card whose QID (or a property
> of it, e.g. P6108 IIIF manifest URL) drives another widget. A
> directed-acyclic-graph of triggering. **Don't reinvent the wheel — the
> mature pieces exist; the work is integrating them into the registry.**

**What exists already (the "don't build" list):**

| Need | Mature package/pattern | Notes |
|---|---|---|
| "A box that changes widgets" | **Grafana dashboard variables** (text/query/constant, `$var` interpolation) | WikiBento already borrows Grafana's grid — variables are the natural next Grafana pattern; works without a DAG engine |
| Dependency graph / recompute | **Jotai** (derived atoms = declarative DAG, ~6 KB) · MobX computed · @preact/signals · **@observablehq/runtime** (Observable's reactive cell runtime — canonical dataflow engine, MIT) | Choose ONE reactive graph primitive; don't hand-roll invalidation |
| Fetch + invalidation on input change | **TanStack Query** dependent queries (`enabled: !!qid`, cache keys from inputs) | The half people get wrong by hand; dependent-query invalidation is solved here |
| Visual wiring UI (users draw edges) | **React Flow** (xyflow, MIT) | Only if user-facing DAG authoring is wanted; Node-RED is the mature full-flow engine but wrong UX for a dashboard |
| Batch/server DAGs | Airflow/Prefect/Dagster | Ruled out — server-side, not client-side |
| IIIF deep-zoom rendering | **OpenSeadragon** (or Mirador/UV) | Don't build tile rendering; Wikidata P6108 = IIIF manifest URL (verified); ⚠️ external manifests need CORS per institution; Commons native IIIF not shipped (T261621/T187872 open) — zoomviewer proxy is the workaround |

**Phased plan:**

1. **Phase A — dashboard variables (cheap)**: a "Variable" widget type
   (text/select/number) writing to `dashboard.variables`; widget configs
   reference `{{var}}`; the fetch context resolves them. Config stays
   serializable JSON — Share/export format gains `variables` (format v1→v2,
   ties into the schemaVersion note above).
2. **Phase B — declarative wiring**: config-level `input: { widget: id,
   field: qid }`; outputs declared per widget (e.g. Wikidata item card
   outputs `qid`, claims, P6108/P18/P625); consumers fetch via dependent
   queries. Widget family: **Wikidata item card** (wbgetentities) →
   **claims/property viewer** → **IIIF viewer** (P6108 → OpenSeadragon),
   **image widget** (P18), **map widget** (P625).
3. **Phase C — visual wiring**: React Flow edge-drawing between widgets;
   cycles rejected (it's a DAG).

**Config/schema impact:** variables + inputs change the dashboard format —
add `schemaVersion` to exports now (the marketplace note already says this
costs nothing).

> Widget proposals and links live in **[WIDGET-IDEAS.md](WIDGET-IDEAS.md)** —
> including Wiki Edu dashboard/impact widgets (campaign overview, topic stats,
> quality distributions). Several are blocked on the CORS proxy (Phase 1):
> dashboard.wikiedu.org is CORS-enabled, impact.wikiedu.org is not.


- More widgets — full taxonomy in [WIDGET-IDEAS.md](WIDGET-IDEAS.md) (5 tiers):
  Tier 2 GLAM (Commons Gallery, BaGLAMa-style tracker, Structured Data panel),
  Tier 3 Article (embed, revision history, size/growth, what-links-here, language
  coverage, Wikidata item card), Tier 4 Live (top-read, ITN, on-this-day,
  hashtag tracker), Tier 5 Community (contribution counter, WikiProject pulse,
  vital articles, discussion monitor — watchlist feed needs OAuth). Also:
  article quality (Lift Wing/ORES), recent changes stream (EventStreams), page
  assessment (PageAssessments), watchlist-style "your dashboard" with OAuth
- PWA: manifest + service worker for offline dashboards (pageview data caches well)
- Automated smoke tests (Playwright) against the live API endpoints to catch upstream
  format changes — especially the naive Wikistats CSV parser (ARCHITECTURE #5)

## Sequencing Suggestion

Phase 0 first (zero-risk cleanup, teaches the codebase). Then, in order:
**Import** → **time-range selectors** → **shared cache** → **URL-shareable dashboards**
→ **power widgets** (SPARQL, PetScan, URL extractor — biggest leverage) →
**3 starter packs** (GLAM Footprint, Newsroom Pulse, Edit-a-thon Live) →
**spike alert** (the PR-worthy hero feature) → decide on OAuth/on-wiki sync
(biggest design commitment; revisit after the others are in, since the export
format will have stabilized).
