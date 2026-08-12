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

**Feature-complete for v1, verified live, not yet deployed.**

- ✅ 7 widget types all verified against live APIs (see README "Verified Working")
- ✅ Config format v1: docs/JSON-FORMAT.md + docs/dashboard.schema.json + runtime validator
- ✅ Shareable URLs, import/export, example dashboard, About modal
- ✅ Git repo initialized and pushed to GitHub (main, current commit 7b89266)
- ✅ **DEPLOYED to Toolforge (2026-08-12):** https://wikibento.toolforge.org/ —
  node20 webservice serving dist/ via deploy/server.js; demo URL verified live
  (all 7 widgets). Updates: rsync dist/ + `toolforge webservice node20 restart`

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (299 KB JS / 89.7 KB gzip)
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
│       └── renderer: StatCard | RankingCard | TrendCard | GlamCard
├── AddWidgetPanel / ImportPanel / AboutPanel
└── src/widgets/index.js — WIDGET_TYPES registry (THE extension point)
    each entry: { id, name, icon, defaults, configFields, fetch, transform, renderer, labelFromConfig?, getRenderer? }
    fetch → raw data; transform → renderer contract; WidgetFrame owns loading/error/retry
```

Key files: `src/widgets/index.js` (registry), `src/widgets/dataSources.js`
(6 fetchers), `src/widgets/WidgetFrame.jsx` (lifecycle + renderers),
`src/lib/dashboardConfig.js` (format + `validateDashboard()` + example),
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

- Grid width fixed at `window.innerWidth - 40` — no window-resize listener (widgets don't reflow on resize)
- No React error boundary — a render crash in one widget kills the whole dashboard
- `_title` (custom widget title) isn't editable in the config panel
- `recharts` is an unused dependency; `public/favicon.svg` + `icons.svg` are dead assets
- AddWidgetPanel: no Escape-to-close, no focus trap
- Wikistats CSV parser is naive (no quoted-field handling); 195 KB per fetch, no shared cache

## Next Steps (see docs/ROADMAP.md for the full plan)

1. ~~Deploy to Toolforge~~ — **done 2026-08-12**: https://wikibento.toolforge.org/
1. **Wiki Edu campaign widget (optional, quick win)** — dashboard.wikiedu.org
   has public CORS-enabled JSON (`/campaigns/{slug}.json`, `/users.json`); idea
   and verified endpoints in docs/WIDGET-IDEAS.md
2. Phase 0 cleanup: remove recharts, dead assets, fix resize listener, error boundary, tooltip text
3. Phase 1: dashboard **Import is done**; next: **time-range selectors** for pageviews, **shared fetch cache** (Wikistats CSV!), **CIM-first GLAM mode**
4. Phase 1.5: batching/efficiency layer (docs/SCALABILITY.md)

## Identity & Attribution

- Author: **Andrew Lih** — Wikipedia/Commons username **User:Fuzheado**
- Use `User:Fuzheado` in User-Agents and on-wiki pages; **never** `User:AndrewLih` (old alias)
- See docs/AUTHORS.md; identity also baked into `~/.pi/agent/AGENTS.md`

## Session Notes for AI Agents

- The LLM wiki (`~/.llm-wiki`) has observations/insights from this project's
  development (search `wikiwidget`, `wikibento`, `commons-impact-metrics`).
- Relevant skills: `wikimedia-commons` (incl. Commons Impact Metrics section),
  `wikimedia-api-access`, `commons-file-resolution`, `wikimedia-api-strategy`.
- **Widget ideas bank:** docs/WIDGET-IDEAS.md — unprioritized proposals with
  verified API/CORS notes (Wiki Edu dashboards etc.); move to ROADMAP when scheduled.
- The on-wiki demo config is `Commons:WikiPortraits/Bento-demo.json` — the
  WikiPortraits project hosts it; coordinate changes with that page's editors.
