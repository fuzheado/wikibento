# WikiBento — Handoff

*Last updated: 2026-08-13 · Repo: [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)*

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

- ✅ 7 data-driven widget types verified live + 📝 Text/Markdown static card + 🔥 Top Wikipedia Articles (14 total, 2026-08-13: + 4 Article Vitals + 🖼️ Gallery)
- ✅ **List-driven widgets (2026-08-13):** 🗂️ **Commons File Gallery** + 📋 **Article List** — 16 widget types. Both take pasted lists (one per line) as input; the gallery renders any Commons files (grid/list, order: listed/random/alpha/largest, missing-file counting, reuses GalleryGrid/ListCard renderers) and the article list is a clickable row list with optional batched thumbnails+intros (pageimages|extracts). First consumers of the "list source" input idea (PagePile/PSID can slot in later). Example dashboard + schema + README/DATA-SOURCES/WIDGET-DEVELOPMENT updated.
- ✅ Config format v1: docs/JSON-FORMAT.md + docs/dashboard.schema.json + runtime validator
- ✅ Shareable URLs, import/export, example dashboard, About modal
- ✅ Git repo initialized and pushed to GitHub (main, current commit ec1b532)
- ✅ **DEPLOYED to Toolforge (2026-08-12):** https://wikibento.toolforge.org/ —
  node20 webservice serving dist/ via deploy/server.js; demo URL verified live.
  **Deploy procedure (fresh-session safe — full detail in docs/DEPLOYMENT.md):**
  SSH as the PERSONAL account (`ssh alih@dev.toolforge.org` — `tools.wikibento@`
  is NOT an SSH login and fails with publickey); tool commands via
  `sudo -niu tools.wikibento` (never `become` over chained SSH); then:
  `npm run build` → `rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/`
  → `ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"`
  → verify bundle hash + `/api/resolve`. This Pi's hosts inventory has
  `tools` = alih@dev.toolforge.org (use `host_exec`).
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
- ✅ **Top Wikipedia Articles widget (2026-08-12):** 🔥 most-visited articles
  per language (top.hatnote.com, 28 langs) — "latest" or any date, top-N
  (all/10/arbitrary), default noise filter (`.xxx`, `XXX (beer)`…). hatnote has
  no CORS, so deploy/server.js gained `/api/proxy` (wraps `{status, body}`);
  non-Toolforge hosts fall back to the CORS-enabled WMF Pageviews `top`
  endpoint. See docs/DATA-SOURCES.md §8
- ✅ **Top Pages expanded view (2026-08-13):** ⚙ "Expanded view (thumbnail +
  summary)" checkbox — each row shows a 120px thumbnail, linked title, views,
  and a 3-line intro. Enrichment via the CORS-enabled MediaWiki API
  (`prop=pageimages|extracts`, batched 50 titles/call — pattern from the
  fuzheado/Wiki-Top-100 repo); non-article pages (Main_Page, Special:*,
  Wikipedia:*…) are filtered from both hatnote and WMF data
- ✅ **w.wiki short URLs (2026-08-12):** `?config=https://w.wiki/TR9R` (or bare
  `w.wiki/TR9R`) expands via the same-origin `/api/resolve` endpoint in
  deploy/server.js — browsers can't follow w.wiki redirects to wiki pages (the
  target sends no CORS headers), so the server follows the redirect and the
  client re-dispatches through the normal wiki/Action-API path
- ✅ **GLAM fixes (2026-08-13):** wiki column shows shorthand (`en.wikipedia`,
  full hostname on hover) and is 108px nowrap; the category title is no longer
  squished to a 9px sliver by the stats area — `.glam-card > * { flex-shrink: 0 }`
  (overflow:hidden on the title made its min-height compute to 0, so flex
  crushed it; the card now scrolls instead)
- ✅ **Article Vitals widgets (2026-08-13):** four new single-article widgets —
  📄 **Article Excerpt** (REST `/page/summary`: description + thumbnail + first
  paragraph), 🕓 **Edit History** (`prop=revisions` newest-first with byte
  deltas, diff-linked users), 🏅 **Article Quality (ORES)** (Lift Wing
  `enwiki-articlequality` POST — FA/GA/B/C/Start/Stub + probability
  distribution bars; falls back to the modern continuous `articlequality`
  model), 🧭 **WikiProject Assessment** (`prop=pageassessments` — per-project
  class + importance badges). All CORS-verified (Lift Wing reflects the
  origin; Action API needs `origin=*`; `palimit=500` gets all projects).
  Verified live: Einstein → FA 53.9%, 18 assessed projects. Schema enum +
  example dashboard + README/DATA-SOURCES/WIDGET-DEVELOPMENT docs updated.
  **DEPLOYED to Toolforge 2026-08-13** (commit b9d62f7, bundle
  index-CF9Vo_m5.js) — verified live: all 4 vitals render, no console
  errors from the new endpoints.
- ✅ **Article Gallery widget (2026-08-13):** 🖼️ significant images with
  captions for any article. REST `/page/media-list` (Parsoid's own media
  extraction — no wikitext parsing) + batched `imageinfo`. Significance
  filter (verified): keep only captioned images — caption-less items are
  exactly the noise (infobox flags like `Flag_of_France.svg`, maps, logos);
  `minSize` (default 200px) drops tiny icons. Display modes: grid
  (small/medium/large) or list (thumb left, caption right + filename).
  `showInGallery` metadata is useless (true for everything). Thumb URLs
  utm-stripped (`cleanThumbUrl`). Verified: Einstein → 32 captioned images,
  both modes + size variants in browser. Schema/README/DATA-SOURCES §13
  updated. **DEPLOYED to Toolforge 2026-08-13** (commit 4cf2c93, bundle
  index-BEguwTL7.js) — verified live: gallery renders 32 captioned images,
  no console errors from the new endpoints.
- ✅ **Gallery overflow fix (2026-08-13):** content-height gallery card could
  exceed the widget body on windows < ~1280px wide — `align-items: center`
  centered the overflow so its top painted OVER the header, burying the
  ⚙/✕/↻ buttons (reproduced at 1100/1000/900/800px: card 1204–1864px vs
  body 1074px). Fix: `.gallery-card { height: 100%; min-height: 0 }` (the
  `.ranking-card` pattern — inner grid scrolls at any width) + defensive
  `overflow: hidden` on `.widget-body` so no future content-height card can
  cover a header. Verified live at 1100px: fits, no overlap, ⚙ pointer-
  clickable (commit 4cf2c93 fix bundle index-BqgxhKa5.js).
- ✅ **Gallery square tiles + letterboxing (2026-08-13):** grid thumbs were
  `object-fit: cover` in fixed-height boxes — cropped wide panoramas and tall
  portraits. Now square tiles (`aspect-ratio: 1/1`) with `object-fit: contain`
  — the entire image is always visible, letterboxed against the tile
  background; new `imageFit` config opts into `cover` (square fill-crop).
  Verified live: 32/32 images contain, all tiles square, 6 wide + 5 tall
  images letterboxed (bundle index-bbwxWEKh.js).
- ✅ **360° Panorama Viewer widget (2026-08-13):** 🌐 Pannellum 2.5.7 (vendored
  `src/vendor/pannellum.js` + lazy `pannellumLoader.js` — separate 56 KB dist
  asset, singleton script tag). Config: Commons file → `imageinfo`
  (iiurlwidth=4096 display copy, original URL, dims) → interactive WebGL
  viewer: drag/look-around, auto-rotate toggle, fullscreen, 2:1 + GPano
  detection with "not 2:1" warning, viewer.resize() via ResizeObserver,
  destroy on unmount. **New registry pattern: `defaultLayout`** — per-widget
  min/max size constraints (panorama: w4×h3, min 3×2; verified clamped by
  drag). Gotchas: npm pannellum build is a window-IIFE (rolldown "Missing
  export") → load via `?url` script injection; Pannellum 2.5.7 rejects
  cross-origin `#config=` JSON. Verified live: Imiloa grounds 12740×6370
  renders + rotates; File:Example.jpg flags not-2:1; config change rebuilds
  the viewer. **DEPLOYED to Toolforge 2026-08-13** (commit ec9d26c, bundle
  index-BSwIQuK-.js + lazy asset pannellum-BqmdIb_j.js) — verified live:
  canvas renders, drag rotates (pixel-diff).
- ✅ **Grid drag fix — dragConfig API (2026-08-13):** mouse-dragging the
  panorama moved the WIDGET instead of panning. Root cause: react-grid-layout
  2.2.4 replaced the 1.x `draggableHandle` prop with the `dragConfig`
  object (`{ handle, cancel, ... }`) — the old prop was **silently ignored**,
  so widget drags could start anywhere. Fix: `dragConfig={{ handle:
  '.widget-header', cancel: '.no-drag' }}` + `no-drag` class on
  `.panorama-container` (reusable for future interactive widgets — maps!).
  Side effect: header-only dragging is now ACTIVE for all widgets (the
  README's "grab the title bar" behavior — was silently broken). Verified
  live: canvas drag pans the view (pixel-diff), widget stays at (30,48),
  header drag still moves widgets (bundle index-CyCFd4ac.js).

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (355.9 KB JS / 107.2 KB gzip)
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
(7 fetchers), `src/widgets/WidgetFrame.jsx` (lifecycle + renderers),
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
8. **top.hatnote.com has NO CORS headers** — browsers can't fetch it directly;
   the Toolforge deployment uses the same-origin `/api/proxy` endpoint
   (deploy/server.js). Data updates ~02:00 UTC; month/day in URLs are NOT
   zero-padded; there is no "latest" path — back off from today.
9. **w.wiki redirects are browser-unfollowable to wiki pages**: the 301 itself
   carries `Access-Control-Allow-Origin: *`, but the target page (e.g.
   commons.wikimedia.org) sends no CORS headers, so `fetch()` fails with
   "Failed to fetch" and `redirect:'manual'` exposes no Location. Expand
   server-side (`/api/resolve`) — see the `wikimedia-url-shortener` skill.
10. **CSS: `overflow: hidden` on a flex item makes `min-height: auto` compute
    to 0** — a fixed-height flex column will crush such children to a sliver
    when content overflows (the GLAM title bug). Fix: `flex-shrink: 0` on
    children and let the container scroll.
11. **Stale index.html bites after deploys**: old bundles are deleted by
    `rsync --delete`, so a browser holding a cached index.html 404s. index.html
    is now served `Cache-Control: no-cache` (assets stay immutable); hard
    refresh (⌘⇧R) if a deploy looks missing.

## Known Issues (details in docs/ARCHITECTURE.md §Known Issues)

- **OPEN BUG — iOS Safari "Load failed" on Wikistats + pageviews widgets**
  (see **docs/BUG-REPORT-ios-safari-fetch.md**): Safari-only network-layer
  failures to `wikimedia.org` + `wikistats.wmcloud.org`, both networks, not
  reproduced in Chromium. Mitigations live (timeout/retry/cache, URL-bearing
  errors, 🧪 diagnostics panel). Deferred for later debugging.
- `_title` (custom widget title) isn't editable in the config panel
- **Reset leaves the URL config in place**: ↺ Reset clears localStorage + restores
  defaults, but if the page was loaded via `?config=…` or `#/d/<base64>` (or a w.wiki
  share link), a refresh re-applies the URL config (URL > localStorage > defaults
  priority) — the reset "doesn't stick". Fix: `handleReset` should also blank the URL
  params (`history.replaceState` to the bare path, removing `?config=` / `#/d/`).
- AddWidgetPanel: no Escape-to-close, no focus trap (SharePanel has Escape-to-close)
- Wikistats CSV parser is naive (no quoted-field handling) — fetching is now
  cached + retried, but the parse itself still assumes no commas in fields
- `handleLayoutChange` persists to localStorage on every drag tick (fine at current payload size)

*Fixed in Phase 0 (2026-08-12): resize reflow, error boundary, recharts,
`public/favicon.svg` + `icons.svg`. Added (2026-08-12): QR share panel,
responsive mobile stack (order follows grid layout), Wikistats cache + timeout
+ retry, 📝 Text/Markdown widget (static pattern + image domain policy),
🔥 Top Wikipedia Articles + /api/proxy. Added (2026-08-13): expanded Top Pages
view (MW API enrichment), w.wiki /api/resolve, GLAM wiki-column + title fixes,
Top-100 display fixes (default 10, single counter, wrap titles, card
containment), index.html no-cache.*

## Next Steps (see docs/ROADMAP.md for the full plan)

1. ~~Deploy to Toolforge~~ — **done 2026-08-12**: https://wikibento.toolforge.org/
1. ~~Phase 0 cleanup~~ — **done 2026-08-12**: recharts, dead assets, resize listener, error boundary
1. ~~📝 Text/Markdown widget~~ — **done 2026-08-12**: static widget + image domain policy (see Current Status)
1. ~~🔥 Top Wikipedia Articles widget~~ — **done 2026-08-12**: hatnote via /api/proxy + WMF fallback (see Current Status)
1. ~~Top Pages expanded view~~ — **done 2026-08-13**: thumbnails + intros via MW API enrichment (see Current Status)
1. ~~w.wiki short URLs in ?config=~~ — **done 2026-08-12**: /api/resolve endpoint (see Current Status)
1. ~~GLAM display fixes~~ — **done 2026-08-13**: wiki-column shorthand + nowrap, title squish fix (see Current Status)
1. ~~Article Vitals widgets~~ — **done 2026-08-13**: Excerpt, Edit History, ORES Quality, WikiProject Assessment (see Current Status)
1. **Widget strategy agreed 2026-08-12** — ROADMAP §Strategy + WIDGET-IDEAS:
   power widgets (SPARQL, PetScan, URL extractor) → starter packs (7 JSON
   bentos; ship GLAM Footprint, Newsroom Pulse, Edit-a-thon Live first) →
   spike alert (hero feature). Brainstorm doc: wiki source SRC-2026-08-12-004.
1. **UX + WikiProject directions noted 2026-08-13** (user session) — ROADMAP
   §Phase 2: categorized Add Widget catalog (registry `category` field),
   slide-out toolbox instead of centered modal (drawer pattern proven in
   wikigraph), debounced search (don't load while typing; current search is
   local filter — note applies to future live-loading), lean display mode
   (decorations hidden by default, hover/tap to reveal). WIDGET-IDEAS Tier 6:
   WikiProject widget family — assessment scale + popular pages (endpoints
   verified: `/Popular_pages` = Rank·Views·Quality·Importance table, 501
   rows, ~360 KB; ⚠️ `prop=wikitable` doesn't exist — parse `prop=text`).
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
