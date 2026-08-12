# 📊 WikiBento — Wikimedia Dashboard

A dark-themed, drag-and-drop widget dashboard for Wikimedia — insights and action, built on
[react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) (the same
grid engine used by Grafana and Kibana). It's a single-page React app — **304 KB total,
~85 KB gzipped** — hostable as static files on Toolforge or anywhere.

All six widgets hit **real Wikimedia APIs** (RESTBase, MediaWiki Action API, Commons,
Wikistats) directly from the browser — no backend, no proxy required.

---

## Widget Catalog

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Article Pageviews** | 📊 | [RESTBase Pageviews API](https://wikimedia.org/api/rest_v1/) | 30-day total + daily sparkline + avg/day for any article |
| **External Link Count** | 🔗 | MediaWiki API `exturlusage` | Count of pages linking to a domain (up to 5,000; **namespace-filterable** — e.g. articles only) |
| **Category Size** | 📁 | MediaWiki API `categoryinfo` | File/page/subcat breakdown for any category (Commons or enwiki) |
| **Wiki Stats** | 🌐 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Articles, edits, users for a language edition |
| **File Usage Map** | 🖼️ | Commons API `globalusage` + `imageinfo` | Per-wiki breakdown of where a file is used, with optional image preview + summary caption |
| **Top 10 Wikipedias** | 🏆 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Ranking table of largest Wikipedias by article count |
| **GLAM Category Usage** | 📈 | Commons API + WMF pageviews (GLAMorgan-style) | Files/used/pages/views for a category tree + month, top-image filmstrip, per-page usage detail |

## Features

- **Drag & drop** — grab a widget's title bar to reposition it (12-column grid, vertical compaction)
- **Resize** — drag the bottom-right corner of any widget
- **Add Widget panel** — searchable catalog; click to add
- **Asset-aware titles** — every box headline and title bar shows *what it's
  analyzing* (article, category, file, domain), updating live when you change it
- **Per-widget config** — ⚙️ gear → edit article, domain, wiki, category, etc., with live re-fetch
- **Commons media previews** — File Usage Map can show the image itself + its summary caption; Category Size can show a **random sample** of the category's photos
- **GLAM impact stats** — category × depth × month/year → files, used/viewed files, pages on wikis, total views, top-image filmstrip, and per-page usage of the top file (GLAMorgan-style)
- **Auto-refresh** — configurable per widget (default: 1 h, Wikistats widgets default 2 h)
- **Layout persistence** — saved to `localStorage` (`wikibento-layout`); survives refresh
- **Example dashboard** — ✨ loads a showcase dashboard with all 6 widget types (real working assets)
- **Export** — downloads the full dashboard config as `dashboard.json` (format v1)
- **Import** — ⬆ loads a `dashboard.json` (file or paste) with **full validation** — precise per-field errors, non-fatal warnings, nothing applied unless valid
- **Shareable links** — 🔗 copies a self-contained link (config embedded in the URL hash); `?config=<url>` loads a hosted `dashboard.json` (wiki pages and CORS-enabled hosts)
- **ⓘ About** — a built-in explainer of what the tool does and how to use it
- **Reset** — reverts to the 3 default starter widgets

## Try It (demo file)

A ready-made dashboard config is hosted on Wikimedia Commons — open the app
with this URL and all 7 widgets load immediately:

```
https://<your-host>/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json
```

(The file is plain JSON — see docs/JSON-FORMAT.md. Any on-wiki page, GitHub raw
file, or CORS-enabled host works the same way.)

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
├── public/                    # static assets (favicon.svg, icons.svg — currently unused)
└── src/
    ├── main.jsx               # React 19 bootstrap
    ├── App.jsx                # grid, state, persistence, toolbar
    ├── App.css                # dark theme + all component styles
    ├── components/
    │   └── AddWidgetPanel.jsx # searchable widget catalog modal
    └── widgets/
        ├── index.js           # WIDGET_TYPES registry (add a widget here)
        ├── WidgetFrame.jsx    # title bar, config panel, load/error/refresh lifecycle
        └── dataSources.js     # 5 API fetchers
```

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 (StrictMode) |
| Build | Vite 8.2 |
| Grid | react-grid-layout 2.2.4 + react-resizable 4.0.2 |
| Linting | Oxlint (react + oxc plugins) |
| Charts | Hand-rolled SVG (no chart library used — `recharts` is an **unused dependency**) |

## Verified Working (smoke-tested 2026-08-12)

- ✅ All 6 widget types render live data in the browser
- ✅ Main Page pageviews: 218.4M views / 30 days (~7.28M/day)
- ✅ External links: 1,499 → LibreTexts.org; 2,850 all-namespaces / **2,320 articles-only** → gettyimages.com; 5,000+ cap indicator on youtube.com
- ✅ Top 10 Wikipedias: English 1st at 7,223,053 articles
- ✅ Category Size (WLM 2024): 239,084 items (239,022 files, 62 subcats) + random photo sample (6 thumbs, fresh per refresh)
- ✅ File Usage Map: image preview + summary caption for a Commons file (Blue Marble, 500px thumb)
- ✅ GLAM Category Usage: 500 files, 21/33 viewed, 235 pages on 58 wikis, 314,375 views (Featured pictures, 2026-07); top-file detail (Lion 97,121 views)
- ✅ Add Widget, config gear, Apply & Reload, Export (`dashboard.json`), Reset, localStorage persistence
- ✅ Production build: 43 modules, 272.2 KB JS (82.3 KB gzip) + 10.3 KB CSS (2.6 KB gzip)

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component tree, data flow, widget registry pattern, known issues
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — every API endpoint, params, caps, and gotchas
- [docs/WIDGET-DEVELOPMENT.md](docs/WIDGET-DEVELOPMENT.md) — how to add a new widget type
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — local + Toolforge static hosting
- [docs/ROADMAP.md](docs/ROADMAP.md) — v2 ideas, quick wins, and known limitations
- [docs/SCALABILITY.md](docs/SCALABILITY.md) — batching, caching, and efficiency notes for tracking hundreds of files/categories
- [docs/JSON-FORMAT.md](docs/JSON-FORMAT.md) — the dashboard JSON format spec (v1), with [machine-readable schema](docs/dashboard.schema.json) and URL-loading (`?config=`, `#/d/`) docs
- `public/dashboard.json` — a hosted sample config (the example dashboard), served alongside the app

## License

Wikimedia-oriented demo dashboard. Data comes from Wikimedia APIs (CC BY-SA 4.0 content
licensing applies to any downstream use of article content; pageview and stat aggregates
are public statistics).
