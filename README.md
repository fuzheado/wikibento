# 📊 WikiBento — Wikimedia Dashboard

![WikiBento demo dashboard](docs/screenshot.png)

A dark-themed, drag-and-drop widget dashboard for Wikimedia — **insights and
action** — built on [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
(the same grid engine used by Grafana and Kibana). It's a single-page React app
(≈313 KB total, ~93 KB gzipped) hostable as static files on Toolforge or
anywhere.

All seven widgets hit **real Wikimedia APIs** (RESTBase, MediaWiki Action API,
Commons, Wikistats) directly from the browser — no backend, no login, no proxy.

**Live:** [wikibento.toolforge.org](https://wikibento.toolforge.org/) ·
Source: [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)

---

## Try It (demo file)

A ready-made 7-widget dashboard config is hosted on Wikimedia Commons. Open
the app with this URL and the whole dashboard loads immediately:

```
https://wikibento.toolforge.org/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json
```

(The file is plain JSON — see [docs/JSON-FORMAT.md](docs/JSON-FORMAT.md). Any
on-wiki page, GitHub raw file, or CORS-enabled host works the same way.)

## Widget Catalog

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Article Pageviews** | 📊 | [RESTBase Pageviews API](https://wikimedia.org/api/rest_v1/) | 30-day total + daily sparkline + avg/day for any article |
| **External Link Count** | 🔗 | MediaWiki API `exturlusage` | Count of pages linking to a domain (up to 5,000; **namespace-filterable** — e.g. articles only) |
| **Category Size** | 📁 | MediaWiki API `categoryinfo` | File/page/subcat breakdown for any category (Commons or enwiki), with optional **random photo sample** |
| **Wiki Stats** | 🌐 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Articles, edits, users for a language edition |
| **File Usage Map** | 🖼️ | Commons API `globalusage` + `imageinfo` | Per-wiki breakdown of where a file is used, with optional **image preview + summary caption** |
| **Top 10 Wikipedias** | 🏆 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Ranking table of largest Wikipedias by article count |
| **GLAM Category Usage** | 📈 | Commons API + WMF pageviews (GLAMorgan-style) | Files/used/pages/views for a category tree + month, top-image filmstrip, per-page usage detail |

## Features

- **Drag & drop** — grab a widget's title bar to reposition it (12-column grid, vertical compaction)
- **Resize** — drag the bottom-right corner of any widget
- **Add Widget panel** — searchable catalog; click to add
- **Asset-aware titles** — every box headline and title bar shows *what it's
  analyzing* (article, category, file, domain), updating live when you change it
- **Per-widget config** — ⚙️ gear → edit article, domain, wiki, category, etc., with live re-fetch
- **Commons media previews** — File Usage Map can show the image itself + its
  summary caption; Category Size can show a **random sample** of the category's photos
- **GLAM impact stats** — category × depth × month/year → files, used/viewed
  files, pages on wikis, total views, top-image filmstrip, and per-page usage of
  the top file (GLAMorgan-style)
- **Auto-refresh** — configurable per widget (default: 1 h, Wikistats widgets default 2 h)
- **Resilience** — each widget is wrapped in an error boundary: a render crash
  shows a themed fallback with Try Again instead of killing the dashboard; the
  grid reflows when the window is resized
- **Layout persistence** — saved to `localStorage` (`wikibento-layout`); survives refresh
- **Example dashboard** — ✨ loads a showcase dashboard with all 7 widget types (real working assets)
- **Export / Import** — ⬇ downloads the full config as `dashboard.json` (format v1);
  ⬆ loads one back (file or paste) with **full validation** — precise per-field
  errors, non-fatal warnings, nothing applied unless valid
- **Shareable links** — 🔗 copies a self-contained link (config embedded in the
  URL hash `#/d/…`); `?config=<url>` loads a hosted `dashboard.json` (on-wiki
  pages via the Action API, or any CORS-enabled host)
- **ⓘ About** — built-in explainer of what the tool does and how to use it
- **Reset** — reverts to the 3 default starter widgets

## Quickstart

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # production build → dist/
npx vite preview     # serve dist/ at http://localhost:4173
npm run lint         # oxlint
```

## Project Structure

```
wikibento/
├── index.html                 # entry HTML (inline SVG favicon)
├── vite.config.js             # Vite + React plugin
├── public/                    # static assets + dashboard.json (hosted sample config)
├── docs/                      # full documentation set (see below)
└── src/
    ├── main.jsx               # React 19 bootstrap
    ├── App.jsx                # grid, state, persistence, toolbar, URL boot
    ├── App.css                # dark theme + all component styles
    ├── components/
    │   ├── AddWidgetPanel.jsx # searchable widget catalog modal
    │   ├── ImportPanel.jsx    # validated JSON import (file or paste)
    │   ├── ErrorBoundary.jsx  # per-widget crash isolation (Try Again + auto-recover)
    │   └── AboutPanel.jsx     # ⓘ About modal
    ├── lib/
    │   ├── dashboardConfig.js # format v1: example dashboard + validateDashboard()
    │   └── share.js           # URL loading/sharing (?config=, #/d/<base64>)
    └── widgets/
        ├── index.js           # WIDGET_TYPES registry (add a widget here)
        ├── WidgetFrame.jsx    # title bar, config panel, load/error/refresh lifecycle
        └── dataSources.js     # 6 API fetchers (7 widgets incl. GLAM pipeline)
```

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 (StrictMode) |
| Build | Vite 8.2 |
| Grid | react-grid-layout 2.2.4 + react-resizable 4.0.2 |
| Linting | Oxlint (react + oxc plugins) |
| Charts | Hand-rolled SVG (no chart library used) |

## Verified Working (smoke-tested 2026-08-12)

- ✅ All 7 widget types render live data in the browser
- ✅ On-wiki config loading: `?config=…Commons:WikiPortraits/Bento-demo.json` → all 7 widgets
- ✅ URL loading: `?config=/dashboard.json` (hosted), `#/d/<base64>` hash links (Share roundtrip), error banner + fallback on bad URLs
- ✅ Main Page pageviews: 218.4M views / 30 days (~7.28M/day)
- ✅ External links: 1,499 → LibreTexts.org; 2,850 all-namespaces / **2,320 articles-only** → gettyimages.com; 5,000+ cap indicator on youtube.com
- ✅ Top 10 Wikipedias: English 1st at 7,223,053 articles
- ✅ Category Size (WLM 2024): 239,084 items + random photo sample (6 thumbs, fresh per refresh)
- ✅ File Usage Map: image + summary caption (Blue Marble, 500px thumb)
- ✅ GLAM Category Usage: 500 files, 21/33 viewed, 235 pages on 58 wikis, 314,375 views (Featured pictures, 2026-07); top-file detail (Lion 97,121 views)
- ✅ Export → Import roundtrip, validation errors shown for bad JSON, Example, About, Reset, localStorage persistence
- ✅ Production build: 43 modules, 299.0 KB JS (89.7 KB gzip) + 14.4 KB CSS (3.4 KB gzip)

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component tree, data flow, widget registry pattern, known issues
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — every API endpoint, params, caps, and gotchas
- [docs/WIDGET-DEVELOPMENT.md](docs/WIDGET-DEVELOPMENT.md) — how to add a new widget type
- [docs/GLAMORGAN-WIDGET.md](docs/GLAMORGAN-WIDGET.md) — the GLAM widget design review + Commons Impact Metrics findings
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — local + Toolforge static hosting (`tools.wikibento`)
- [docs/ROADMAP.md](docs/ROADMAP.md) — v2 ideas, quick wins, and known limitations
- [docs/WIDGET-IDEAS.md](docs/WIDGET-IDEAS.md) — the widget idea bank (Wiki Edu dashboards and more), with verified API notes
- [docs/SCALABILITY.md](docs/SCALABILITY.md) — batching, caching, and efficiency notes for tracking hundreds of files/categories
- [docs/JSON-FORMAT.md](docs/JSON-FORMAT.md) — the dashboard JSON format spec (v1), with [machine-readable schema](docs/dashboard.schema.json) and URL-loading docs
- [docs/AUTHORS.md](docs/AUTHORS.md) — author identity (User:Fuzheado)
- [docs/screenshot.png](docs/screenshot.png) — demo dashboard snapshot

## License

Wikimedia-oriented demo dashboard. Data comes from Wikimedia APIs (CC BY-SA 4.0
content licensing applies to any downstream use of article content; pageview
and stat aggregates are public statistics).
