# WikiBento — Handoff

*Last updated: 2026-08-12 · Repo: [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)*

## What This Is

WikiBento is a dark-themed, drag-and-drop widget dashboard for Wikimedia —
"insights and action". A single-page React app (React 19, Vite 8,
react-grid-layout) with **no backend**: every widget fetches directly from
CORS-enabled Wikimedia APIs (RESTBase pageviews, MediaWiki Action API, Commons,
Wikistats). Dashboards are JSON configs (format v1) that persist to
localStorage, export/import, and load via shareable URLs — either embedded in
the hash (`#/d/<base64>`) or fetched from a URL (`?config=<url>`, including
on-wiki pages like `Commons:WikiPortraits/Bento-demo.json`).

## Current Status

**Feature-complete for v1, Phase 0 cleanup done, deployed live.**

- ✅ 7 data-driven widget types verified live (see README "Verified Working") + 📝 Text/Markdown static card (8 total, 2026-08-12)
- ✅ Config format v1: docs/JSON-FORMAT.md + docs/dashboard.schema.json + runtime validator
- ✅ Shareable URLs, import/export, example dashboard, About modal
- ✅ Git repo initialized and pushed to GitHub (main, current commit 23c627d)
- ✅ **DEPLOYED to Toolforge (2026-08-12):** https://wikibento.toolforge.org/ —
  node20 webservice serving dist/ via deploy/server.js; demo URL verified live
  (all 7 widgets). Updates: rsync dist/ + `toolforge webservice node20 restart`
- ✅ **Phase 0 cleanup done (2026-08-12):** recharts removed, dead assets
  (`public/favicon.svg`, `icons.svg`) deleted, grid resize listener added,
  per-widget error boundary added
- ✅ **QR share panel (2026-08-12):** 🔗 Share now opens a modal with a scannable
  QR code (client-side `qrcode-generator`, inline SVG) + copyable link — encodes
  the current `?config=` URL when present (short, phone-friendly), else the
  self-contained hash link when under ~1,500 chars, else a friendly notice
- ✅ **Responsive layout (2026-08-12):** phones (<768px) get a single-column card
  stack instead of 75px-wide grid columns; tablets/desktops keep the grid
- ✅ **Wikistats robustness (2026-08-12):** shared 5-min TTL fetch cache (Wiki Stats
  + Top 10 now cost ONE request for the 195 KB CSV) + 15 s timeout +
  retry-with-backoff; transient "Load failed" errors self-heal
- ✅ **Text/Markdown widget (2026-08-12):** 📝 8th widget type — zero-dep,
  escape-first Markdown renderer (`src/lib/markdown.js`), static-widget pattern
  (no `fetch`; WidgetFrame renders `transform(config)` directly — see
  docs/WIDGET-DEVELOPMENT.md), new `textarea` config field. Images are https-only
  with a **`*.wikimedia.org` default allowlist**; other hosts need the per-widget
  "Allow external images" opt-in (privacy: blocks tracking-pixel IP/referrer
  leakage in shared dashboards; `referrerpolicy=no-referrer` on all imgs)
- ✅ **Mobile stack ordering fix (2026-08-12):** the <768px single-column stack
  now sorts by grid position (y, then x) instead of widget-array insertion
  order — desktop drags are reflected on phones

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (323 KB JS / 97.4 KB gzip)
npx vite preview   # http://localhost:4173
npm run lint       # oxlint (5 pre-existing warnings, all benign)
```

Demo URL to see the full dashboard:
`http://localhost:4173/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json`

## Architecture in One Screen

```
App.jsx (state: widgets[] + layout[], URL boot, persistence)
├── GridLayout (12 cols, vertical compaction)
│   └── WidgetFrame × N (fetch lifecycle, ⚙ config panel, refresh, header)
│       └── renderer: StatCard | RankingCard | TrendCard | GlamCard | MarkdownCard
├── AddWidgetPanel / ImportPanel / AboutPanel
└── src/widgets/index.js — WIDGET_TYPES registry (THE extension point)
    each entry: { id, name, icon, defaults, configFields, fetch, transform, renderer, labelFromConfig?, getRenderer? }
    fetch → raw data; transform → renderer contract; WidgetFrame owns loading/error/retry
    static widgets (e.g. markdown) omit `fetch` — rendered from config directly
```

Key files: `src/widgets/index.js` (registry), `src/widgets/dataSources.js`
(6 fetchers), `src/widgets/WidgetFrame.jsx` (lifecycle + renderers),
`src/lib/dashboardConfig.js` (format + `validateDashboard()` + example),
`src/lib/markdown.js` (zero-dep Markdown renderer for the Text/Markdown widget),
`src/lib/share.js` (URL loading/sharing).

## Hard-Won Technical Gotchas (don't rediscover these)

1. **`exturlusage` clamps `eulimit` to 500** for non-bot users (verified:
   `eulimit=5000` returns 500 + warning). The fetcher paginates 10 pages =
   5,000, matching Special:LinkSearch. `eunamespace=0` gives article-space-only counts.
2. **Commons `prop=globalusage` entries have NO `ns` field** (keys: title/url/wiki only).
   The GLAM widget's article-space filter uses a URL-path namespace heuristic
   (see `NON_ARTICLE_NS` in dataSources.js). Localized namespace names
   (Diskussion:, ノート:) are conservatively counted as articles.
3. **PetScan ignores the `max` cap** in quick-intersection mode (max=100 →
   all 239,084 files, 39 MB response). Never call PetScan from this app for big
   categories — the GLAM widget does its own bounded categorymembers walk.
4. **Long filenames blow multi-title GET URLs** (HTTP 414). Batch by encoded
   length (~4,500 chars), not by count — see `fetchBatchedUsage`.
5. **Commons Impact Metrics is allow-list only**: unregistered categories 404
   with "the category you asked for is not loaded yet". Registration via
   `{{Views from category}}` template, processed monthly. The planned CIM-first
   mode (try CIM, fall back to live) is a ROADMAP item — see
   docs/GLAMORGAN-WIDGET.md and the `wikimedia-commons` skill.
6. **Playwright coordinate clicks miss after layout shifts** (images loading
   change widget heights). For reliable browser tests, click via JS
   (`element.click()`) or re-snapshot, not stale refs.
7. **Wikimedia API etiquette**: pace requests (≥1s), use the
   `$WIKIMEDIA_USER_AGENT` env var, honor 429 Retry-After. Multi-title batching
   (50 titles/call) is the scale pattern — see docs/SCALABILITY.md.

## Known Issues (details in docs/ARCHITECTURE.md §Known Issues)

- **OPEN BUG — iOS Safari "Load failed" on Wikistats + pageviews widgets**
  (see **docs/BUG-REPORT-ios-safari-fetch.md**): Safari-only network-layer
  failures to `wikimedia.org` + `wikistats.wmcloud.org`, both networks, not
  reproduced in Chromium. Mitigations live (timeout/retry/cache, URL-bearing
  errors, 🧪 diagnostics panel). Deferred for later debugging.
- `_title` (custom widget title) isn't editable in the config panel
- AddWidgetPanel: no Escape-to-close, no focus trap (SharePanel has Escape-to-close)
- Wikistats CSV parser is naive (no quoted-field handling) — fetching is now
  cached + retried, but the parse itself still assumes no commas in fields
- `handleLayoutChange` persists to localStorage on every drag tick (fine at current payload size)

*Fixed in Phase 0 (2026-08-12): resize reflow, error boundary, recharts,
`public/favicon.svg` + `icons.svg`. Added (2026-08-12): QR share panel,
responsive mobile stack (order follows grid layout), Wikistats cache + timeout
+ retry, 📝 Text/Markdown widget (static pattern + image domain policy).*

## Next Steps (see docs/ROADMAP.md for the full plan)

1. ~~Deploy to Toolforge~~ — **done 2026-08-12**: https://wikibento.toolforge.org/
1. ~~Phase 0 cleanup~~ — **done 2026-08-12**: recharts, dead assets, resize listener, error boundary
1. ~~📝 Text/Markdown widget~~ — **done 2026-08-12**: static widget + image domain policy (see Current Status)
1. **Widget strategy agreed 2026-08-12** — ROADMAP §Strategy + WIDGET-IDEAS:
   power widgets (SPARQL, PetScan, URL extractor) → starter packs (7 JSON
   bentos; ship GLAM Footprint, Newsroom Pulse, Edit-a-thon Live first) →
   spike alert (hero feature). Brainstorm doc: wiki source SRC-2026-08-12-004.
1. **Wiki Edu campaign widget (optional, quick win)** — dashboard.wikiedu.org
   has public CORS-enabled JSON (`/campaigns/{slug}.json`, `/users.json`); idea
   and verified endpoints in docs/WIDGET-IDEAS.md
2. Phase 1: **time-range selectors** for pageviews, **CIM-first GLAM mode**
3. Phase 1.5: batching/efficiency layer (docs/SCALABILITY.md)
4. ~~QR code share~~ — **done 2026-08-12**: Share panel with client-side QR (see README)
5. ~~Shared fetch cache (Wikistats)~~ — **done 2026-08-12**: 5-min TTL cache +
   in-flight coalescing + 15 s timeout + retry (see README)

## Identity & Attribution

- Author: **Andrew Lih** — Wikipedia/Commons username **User:Fuzheado**
- Use `User:Fuzheado` in User-Agents and on-wiki pages; **never** `User:AndrewLih` (old alias)
- See docs/AUTHORS.md; identity also baked into `~/.pi/agent/AGENTS.md`

## Session Notes for AI Agents

- The LLM wiki (`~/.llm-wiki`) has observations/insights from this project's
  development (search `wikiwidget`, `wikibento`, `commons-impact-metrics`).
- Relevant skills: `toolforge-nodejs` (**deployments — read before any webservice
  command**; the `static` webservice type does not exist, use node20),
  `wikimedia-toolforge`, `wikimedia-commons` (incl. Commons Impact Metrics section),
  `wikimedia-api-access`, `commons-file-resolution`, `wikimedia-api-strategy`.
- **Widget ideas bank:** docs/WIDGET-IDEAS.md — unprioritized proposals with
  verified API/CORS notes (Wiki Edu dashboards etc.); move to ROADMAP when scheduled.
- The on-wiki demo config is `Commons:WikiPortraits/Bento-demo.json` — the
  WikiPortraits project hosts it; coordinate changes with that page's editors.
