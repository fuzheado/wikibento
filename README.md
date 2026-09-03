# 📊 WikiBento — Wikimedia Dashboard

![WikiBento demo dashboard](docs/screenshot.png)

WikiBento is a drag-and-drop dashboard for Wikimedia — a single board for
keeping an eye on things and acting on them. Wikimedia's data and activity
live across many places: pageview and stats APIs, wiki pages, recent changes,
Commons. WikiBento brings what you care about into one place — starting with
metrics like article pageviews, external link counts, category sizes, file
usage, and GLAM-style impact stats, and extending to listings and feeds you
can click through and act on, like recent changes and usage trails.

It's a single-page React app built on
[react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
(the same grid engine used by Grafana and Kibana), ≈541 KB total (~154 KB
gzipped), hostable as static files on Toolforge or anywhere.

All widgets hit **real Wikimedia APIs** (RESTBase, MediaWiki Action API,
Commons, Wikistats) directly from the browser — no backend, no login, no proxy.

**Live:** [wikibento.toolforge.org](https://wikibento.toolforge.org/)

**Example:** [Alysa Liu](https://wikibento.toolforge.org/?config=https://w.wiki/TR9R)

**Source**: [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)

---

## Try It (demo file)

A ready-made 7-widget dashboard config is hosted on Wikimedia Commons. Open
the app with this URL and the whole dashboard loads immediately:

```
https://wikibento.toolforge.org/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json
```

(Or use a [w.wiki](https://w.wiki) short link for the same config: `?config=https://w.wiki/TR9R` — expanded automatically via the same-origin `/api/resolve` endpoint.)

An **interactive demo** (Board Controls driving galleries via params) is at `?config=/params-demo.json` — press the buttons, move the slider, step the month.

A **full-catalog sample** (all 30 widget types, real working assets) is hosted
with the app itself:

```
https://wikibento.toolforge.org/?config=/dashboard.json
```

(The file is plain JSON — see [docs/JSON-FORMAT.md](docs/JSON-FORMAT.md). Any
on-wiki page, GitHub raw file, or CORS-enabled host works the same way.)

## Widget Catalog

Grouped the same way as the in-app **Add Widget** panel — each section below is a category in the widget picker.

### Articles (6)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Article Pageviews** | 📊 | [RESTBase Pageviews API](https://wikimedia.org/api/rest_v1/) | 30-day total + daily sparkline + avg/day for any article |
| **Article Excerpt** | 📄 | [REST `/page/summary`](https://en.wikipedia.org/api/rest_v1/page/summary/Ada_Lovelace) | First paragraph + short description + thumbnail for any article, linked to the page |
| **Edit History** | 🕓 | MediaWiki API `prop=revisions` | Recent edits newest-first — user, time, comment, and byte delta per edit |
| **Article Quality (ORES)** | 🏅 | [Lift Wing](https://api.wikimedia.org/) `enwiki-articlequality` (falls back to the modern continuous `articlequality` model) | Predicted FA/GA/B/C/Start/Stub class with per-class probability distribution for any article |
| **WikiProject Assessment** | 🧭 | MediaWiki API `prop=pageassessments` | Quality class + importance per WikiProject banner (enwiki and other PageAssessments wikis) |
| **Article Gallery** | 🖼️ | [REST `/page/media-list`](https://en.wikipedia.org/api/rest_v1/page/media-list/Albert_Einstein) + `imageinfo` | Significant images with captions — grid (small/medium/large) or list (thumb left, caption right); filters out uncaptioned flags/logos/maps and tiny icons |

### Categories & GLAM (11)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Category Size** | 📁 | MediaWiki API `categoryinfo` | File/page/subcat breakdown for any category (Commons or enwiki), with optional **random photo sample** |
| **GLAM Category Usage** | 📈 | PetScan via same-origin `/api/petscan` relay + WMF pageviews (GLAMorgan-style) | Files/used/pages/views for a category tree + month (file budget up to 30,000), top-image filmstrip, per-page usage detail — clickable category & page links |
| **CIM Category Snapshot** | 🎯 | [CIM](https://wikimedia.org/api/rest_v1/metrics/commons-analytics/) `category-metrics-snapshot` | Exact **precomputed** stats for a CIM-registered category: files · used · wikis · pages (deep/shallow) |
| **CIM Views Over Time** | 📈 | CIM `pageviews-per-category-monthly` | Monthly pageview trend of pages using the category's files (2–24 months) |
| **CIM Top Files** | 🖼️ | CIM `top-viewed-media-files-monthly` + `imageinfo` | Most-viewed files with thumbnails + views |
| **CIM Top Wikis** | 🌍 | CIM `top-wikis-per-category-monthly` | Which wikis use the category's files most |
| **CIM Top Pages** | 📄 | CIM `top-pages-per-category-monthly` | Pages using the files, by views |
| **CIM Top Editors** | ✍️ | CIM `top-editors-monthly` | Top contributors by edit count (creates/updates/all) |
| **CIM Global Leaderboard** | 🏆 | CIM `top-viewed-categories-monthly` | Top 100 most-viewed categories on Commons, optional category highlight |
| **CIM File Spotlight** | 🔦 | CIM `media-file-metrics-snapshot` + `pageviews-per-media-file-monthly` | One file: wikis/pages using it + monthly view trend |
| **CIM File Traffic** | 📉 | CIM `pageviews-per-media-file-monthly` | Interactive monthly traffic chart for one file — labeled axes, −/+ zoom (3/6/12/24 months), self-heals CIM's intermittent 500s on specific ranges |

### Files & Media (4)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **File Usage Map** | 🖼️ | Commons API `globalusage` + `imageinfo` | Per-wiki breakdown of where a file is used, with optional **image preview + summary caption** |
| **Commons File Gallery** | 🗂️ | Commons API `imageinfo` (batched) | Gallery of any Commons files you list (one per line) — grid or list; order as-listed / random / alphabetical / largest-first; missing files counted |
| **360° Panorama Viewer** | 🌐 | Commons `imageinfo` + [Pannellum](https://pannellum.org) (WebGL) | Interactive 360° panorama from any Commons equirectangular file — drag to look around, auto-rotate option, 2:1/GPano detection, per-widget min-size constraint |
| **Video / Media Player** | 🎬 | Commons API `videoinfo` (batched) | Native HTML5 playback of Commons video or audio — one file or a jukebox playlist: next/prev, loop, shuffle, quality pick, autoplay; optional **Commons description + artist/license credit** per track and a freeform **Markdown annotation** |

### Rankings & Platforms (4)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **External Link Count** | 🔗 | MediaWiki API `exturlusage` | Count of pages linking to a domain (up to 5,000; **namespace-filterable** — e.g. articles only) |
| **Wiki Stats** | 🌐 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Articles, edits, users for a language edition |
| **Top 10 Wikipedias** | 🏆 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Ranking table of largest Wikipedias by article count |
| **Top Wikipedia Articles** | 🔥 | [top.hatnote.com](https://top.hatnote.com) (via same-origin proxy) + [WMF pageviews top](https://wikimedia.org/api/rest_v1/) fallback + MediaWiki `pageimages|extracts` enrichment | Most-visited articles for any of 28 Wikipedia languages — latest day or any date, top-N (all/10/arbitrary), default noise filter (.xxx, XXX (beer)…), optional **expanded view** with thumbnail + intro per row |

### Content & Embeds (4)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Board Controls** | 🎛️ | (static — writes board params) | Buttons / number sliders / month steppers / menus / text fields that drive `{{param}}` references in other widgets — the interactivity primitive; params editable in ⚙ |
| **Text / Markdown** | 📝 | (static content) | Free-form Markdown note — headings, lists, links, code, images (Wikimedia-hosted by default); a starting card or explanatory card (no fetch) |
| **Article List** | 📋 | MediaWiki API `pageimages\|extracts` (batched, optional) | Clickable list of pasted article titles — optional thumbnails + intros |
| **Wiki Page** | 📄 | (static — iframe to the wiki) | Embed any MediaWiki page — desktop or **mobile view (`?useformat=mobile`)**; links browse inside the widget; optional section anchor |

### Queries & Power (1)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **SPARQL Query** | 🧠 | [WDQS](https://query.wikidata.org/sparql) + [QLever](https://qlever.dev/api/wikimedia-commons) + Humaniki | Run any SPARQL (Wikidata or Commons SDC) — big number, bar chart, line, or table (auto-detected from the result shape, with manual override); 4 curated presets incl. collection depth and the Women-in-Red % (precomputed via Humaniki) |

### Web & History (1)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Wayback Snapshot Gallery** ⚠️alpha | 🕰️ | Wayback availability + CDX/timemap (server batch) | Screenshot tiles of a website at chosen dates — closest capture per date (within tolerance), iframe-embedded; experimental — depends on Wayback backend health, failed lookups retry on refresh |

## Features

### The board — layout & presentation

- **Responsive layout** — on phones (<768px) the 12-column grid collapses to a
  single-column card stack (Grafana-style) that follows the grid's reading order
  (top-left first, so desktop drags are reflected on phones); tablets and
  desktops keep the full drag-and-drop grid
- **Drag & drop** — grab a widget's title bar to reposition it (12-column grid, vertical compaction)
- **Resize** — drag the bottom-right corner of any widget
- **Content-fit galleries** — Article Gallery / Commons File Gallery default to **full window width** and **auto-fit their height to the image count** after loading (clamp 3–14 rows); once you resize one manually, your size sticks
- **Presentation / kiosk mode** — ⛶ Present hides all editing chrome (title
  bars, ⏱ footers, toolbar, card borders) and locks the grid for a clean data
  wall — or load any dashboard directly in kiosk with `?kiosk=1` (shareable
  presentation link); Esc or the floating ✕ Exit returns, and browser
  fullscreen engages on the Present click
- **Lean mode** — ▣ Lean (or `?lean=1`) gives the same chrome-free,
  grid-locked presentation as kiosk **without fullscreen**: the browser
  stays resizable, so the board reads as a compact app at any window size

### Building a dashboard

- **🎛️ Board Controls (params)** — declare a `params` block and reference `{{name}}` in any widget config; a Board Controls card renders **buttons, number sliders, and month steppers** (plus menus/text fields) that re-aim every referencing widget with one click — the interactivity primitive ([ISSUE-50](docs/ISSUES.md)). Params are editable right in the card's ⚙ panel (one line per param); per-widget targeting is designed (docs/MODULARITY-AND-DATAFLOW.md §Part 5) but not yet built

- **Add Widget panel** — searchable catalog; click to add
- **✨ Ask (ML advisor)** — type what you want in plain language ("random
  sampling of images from a category") and get widget recommendations with
  pre-filled settings, ready to add; powered by Wikimedia's free LiftWing
  LLM via a same-origin relay (prompts not stored), with an offline
  keyword fallback when the ML service is unavailable
- **Asset-aware titles** — every box headline and title bar shows *what it's
  analyzing* (article, category, file, domain), updating live when you change it
- **Per-widget config** — ⚙️ gear → edit article, domain, wiki, category, etc., with live re-fetch
- **Text / Markdown cards** — 📝 free-form Markdown (headings, lists, links,
  code, images). Images are https-only with a **Wikimedia-host default
  allowlist** (`*.wikimedia.org`); other hosts render only with the per-widget
  "Allow external images" opt-in — so a shared dashboard can't leak viewers'
  IP/referrer to third-party tracking pixels (`referrerpolicy=no-referrer`)
- **Example dashboard** — ✨ loads a showcase dashboard with all 30 widget types (real working assets), including a 📝 welcome card; the interactive params demo (🎛️ Board Controls) lives at `?config=/params-demo.json`

### Widget highlights

- **Top Wikipedia Articles** — 🔥 most-visited articles per language edition
  (top.hatnote.com data, 28 languages). Date: "latest" or any day/month/year;
  Top N: all / 10 / arbitrary; **default noise filter** removes sponsored
  TLD/spam pages (`.xxx`, `.xyz`, `XXX (beer)`…) — toggle off in ⚙ if wanted.
  hatnote sends no CORS headers, so the Toolforge deployment fetches it via a
  same-origin proxy (`/api/proxy`); elsewhere it falls back to the
  CORS-enabled WMF Pageviews `top` endpoint (marked "via WMF Pageviews API").
  **Expanded view** (⚙ checkbox): each row gets a 120px thumbnail + intro
  extract from the CORS-enabled MediaWiki API (`prop=pageimages|extracts`,
  batched 50 titles/call — pattern from the Wiki-Top-100 project), and
  non-article helper pages (Main_Page, Special:*, Wikipedia:*…) are filtered
  from both sources
- **CIM widgets (Commons Impact Metrics)** — 🎯📈🖼️🌍📄✍️🏆🔦 a full family of **precomputed** monthly widgets for allow-listed Commons categories: exact snapshot stats (305,868-file categories with zero budget), view trends, top files/wikis/pages/editors, a global top-100 leaderboard, and a per-file spotlight. Unregistered categories get a friendly "register via {{Views from category}}" state (404 ≠ error); the live `glamorgan` walk stays a separate widget, unchanged. CIM "views" = pageviews of pages *using* the files (not media requests)
- **SPARQL power widget** — 🧠 run any SPARQL against Wikidata (WDQS) or Commons (QLever) and get a big number, bars, line, or table — auto-detected from the result shape (manual override in ⚙). Canned presets unlock instant dashboards (collection depth, multi-institution comparison, Women-in-Red %, Commons top-depicts); 60 s timeout + retry + 10-min cache tame WDQS flakiness; long queries POST form-urlencoded (no CORS preflight)
- **List-driven widgets** — 🗂️ Commons File Gallery and 📋 Article List take a **pasted list** (one item per line) as input: any Commons files → gallery (grid/list, order as-listed/random/alphabetical/largest, missing files counted); any article titles → clickable rows with optional batched thumbnails + intros. The first consumers of the planned "list source" input vocabulary (PagePile/PSID can slot into the same fields later)
- **GLAM impact stats** — category × depth × month/year → files, used/viewed
  files, pages on wikis, total views, top-image filmstrip, and per-page usage of
  the top file (GLAMorgan-style); PetScan-relay powered (budget up to 30,000
  files), clickable category/page links, depth-aware zero-state
- **Commons media previews** — File Usage Map can show the image itself + its
  summary caption; Category Size can show a **random sample** of the category's photos

### Transparency constitutions

- **Freshness constitution** — every live-querying widget shows when its data was last fetched (⏱ footer: "updated 2:34:05 PM · auto-refresh 1h", refreshed on every load incl. auto-refresh) — so viewers can judge how stale or fresh a query is; static widgets (Text/Markdown, Wiki Page) are exempt by definition
- **Temporal-scope constitution** — every widget whose data has a time scope (month/range/day) shows the **resolved** scope in its subtitle ("2026-07", "2026-02 → 2026-07", "2026-07-15 → 2026-08-13") — enforced by `npm test` (wired into `npm run build`, so a non-compliant widget blocks deployment). New widgets must declare `timeScope` in the registry

### Sharing, persistence & housekeeping

- **Layout persistence** — saved to `localStorage` (`wikibento-layout`); survives refresh
- **Export / Import** — ⬇ downloads the full config as `dashboard.json` (format v1);
  ⬆ loads one back (file or paste) with **full validation** — precise per-field
  errors, non-fatal warnings, nothing applied unless valid
- **Shareable links** — 🔗 opens a Share panel with a **QR code** (scan to open
  on your phone — ideal for demos) + copyable link. The QR encodes the current
  `?config=` URL when present (short, phone-friendly); otherwise the
  self-contained hash link `#/d/…` (config embedded, under a size cap);
  oversized configs show a friendly notice instead of an un-scanable QR
- **ⓘ About** — built-in explainer of what the tool does and how to use it
- **Reset** — reverts to the 3 default starter widgets

### Reliability

- **Auto-refresh** — configurable per widget (default: 1 h, Wikistats widgets default 2 h)
- **Resilient fetches** — the Wikistats CSV is fetched through a shared TTL cache
  (two widgets hitting the same 195 KB file now cost one request) with a 15 s
  timeout and retry-with-backoff, so transient network hiccups don't kill widgets
- **Resilience** — each widget is wrapped in an error boundary: a render crash
  shows a themed fallback with Try Again instead of killing the dashboard; the
  grid reflows when the window is resized


## Quickstart

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # production build → dist/
npx vite preview     # serve dist/ at http://localhost:4173
npm run lint # oxlint
npm run smoke # grid-geometry smoke test (catches silently-ignored dependency props)
npm run test:browsers # cross-browser matrix: the dashboard in Chromium + Firefox + WebKit (see scripts/browser-matrix.mjs)
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
    │   ├── SharePanel.jsx     # QR code + copyable link modal
    │   ├── ErrorBoundary.jsx  # per-widget crash isolation (Try Again + auto-recover)
    │   └── AboutPanel.jsx     # ⓘ About modal
    ├── lib/
    │   ├── dashboardConfig.js # format v1: example dashboard + validateDashboard()
    │   ├── markdown.js        # tiny zero-dep Markdown renderer (Text/Markdown widget)
    │   ├── share.js           # URL loading/sharing (?config=, #/d/<base64>)
    │   └── qr.js              # URL → inline SVG QR code (qrcode-generator)
    └── widgets/
        ├── index.js           # WIDGET_TYPES registry (add a widget here)
        ├── WidgetFrame.jsx    # title bar, config panel, load/error/refresh lifecycle
        └── dataSources.js     # API fetchers (one per widget, batched where needed)
```

## Technology Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 (StrictMode) |
| Build | Vite 8.2 |
| Grid | react-grid-layout 2.2.4 + react-resizable 4.0.2 |
| Linting | Oxlint (react + oxc plugins) |
| Charts | Hand-rolled SVG (no chart library used) |
| QR codes | `qrcode-generator` (client-side, zero-dep; SVG rendered in-app) |

## Verified Working (smoke-tested 2026-08-12, updated 2026-09-03)

### GLAM & CIM — impact metrics (2026-08-13 → 09-01)

- ✅ **CIM month-lag fix (2026-09-01):** the calendar's previous month isn't
  published until CIM's monthly job runs, so at month start every default-month
  CIM widget 404'd — and the disambiguation probe (built from the same month)
  misread that as "unregistered" for long-registered categories. Fixed:
  `latestCimMonth()` resolves the latest PUBLISHED month (bounded backward walk
  probing the global leaderboard, 1 h TTL cache); all 9 CIM fetchers default to
  it and probe against it; cards display the resolved month. Constitution:
  tests/cim-latest-month.test.mjs (date-relative, runs in any month).
  Verified live: Images_from_Metropolitan_Museum_of_Art resolves to 2026-07 =
  **389,030 files · 20,700 used · 404 wikis · 31,351 pages**
- ✅ **CIM File Spotlight image preview (2026-09-01):** 🔦 "Show image preview"
  (default ON) renders a 480px Commons thumb of the file above the stats,
  linked to the file page; best-effort fetch — a bad filename degrades to
  stats-only, never an error. Verified live: Queen Mother Pendant Mask- Iyoba
  MET DP231460.jpg → mask image + 60 wikis · 123 pages · 347,631 views (2026-07)
- ✅ **Interactive params verified cross-browser (2026-09-03):** the params-demo
  board (buttons + number slider + month stepper driving a Category Size widget
  and a CIM snapshot) passes a 3-engine matrix — Chromium, Firefox, WebKit:
  widgets rendered, 0 error frames, 0 severe console errors per engine
  (`npm run test:browsers`, scripts/browser-matrix.mjs)
- ✅ **Firefox/Safari CORS fix verified (2026-09-03):** full 30-widget catalog
  (+ Board Controls = 31) loaded in all three engines — was 60 CORS console
  errors in Firefox before the User-Agent-header fix (see
  docs/BUG-REPORT-ios-safari-fetch.md for the full diagnosis)
- ✅ **GLAM PetScan relay + budget ceiling (2026-08-17):** the GLAM widget's
  tree+usage flows through the same-origin `/api/petscan` relay (PetScan `giu`
  exact-ns — structural parity with glamtools, verified 518/38/38/40/2/110,092
  on XBio depth-1 2026-07); `fileBudget` honored up to **30,000** files
  end-to-end (self-walk fallback stays capped at 1,000; the relay's 25 MB byte
  cap + 60 s timeout are the real valves); client relay timeout matched to the
  server (75 s single attempt — the 15 s `fetchJSON` default was aborting the
  60 s server work and silently falling back). Verified live: People at
  Wikimania 2024 depth 5 → **2,832 files, capped: false** (the old ceiling
  truncated at 1,000); Wikimania 2026 depth 7 → 12,007 files under the new cap
- ✅ **Clickable GLAM/CIM links + depth UX (2026-08-17):** GLAM + CIM card
  category titles, the top-file header, and every per-page usage row link out
  in a new tab; zero-file scans explain themselves ("No files directly in this
  category — increase Depth to include subcategories" at depth 0); ⚙ panel
  shows semantic hints for Depth ("0 = category only, 1 = + direct subcats")
  and Excl depth
- ✅ **CIM widgets (2026-08-13):** 🎯📈🖼️🌍📄✍️🏆🔦 all 8 verified live against `Files_from_the_Biodiversity_Heritage_Library` — snapshot **305,868 files · 14,434 used · 252 wikis · 41,819 pages** (exact, no budget); trend (Jan 83.1M views); top files with thumbs (Dogs Plate XI 811,993); top wikis/pages/editors (SchlurcherBot 4,491); leaderboard (100 rows, UNESCO 6.6B); file spotlight (49 wikis · 346 pages · 811,993 views). Unregistered category → friendly register state (the 404 is ambiguous: disambiguation probe separates "not in CIM" from "no data for this month" — verified: BHL 2015-01 404s too). Month resolution is now publish-aware: default months resolve to the latest PUBLISHED month via `latestCimMonth()`, so the month-start publish lag can no longer masquerade as "unregistered" (fixed 2026-09-01)
- ✅ **CIM File Traffic (2026-08-14):** 📉 interactive chart — labeled axes (compact Y ticks `254K`/`1.2M`, month X labels, "views"/"month" titles), −/+ zoom slices 3/6/12/24 months client-side, header shows the displayed range; self-heals the CIM 500-on-12-month-window bug (verified: exact window `20250801/20260801` 500s from browsers while curl 200s; 11/13/30-month windows fine) by retrying with the earliest month dropped
- ✅ GLAM Category Usage: 500 files, 21/33 viewed, 235 pages on 58 wikis, 314,375 views (Featured pictures, 2026-07); top-file detail (Lion 97,121 views)
- ✅ GLAM detail: wiki names show as shorthand (`en.wikipedia`), full hostname
  on hover; category title no longer squished by the stats area (flex-shrink)

### Galleries, media & lists (2026-08-13 → 09-01)

- ✅ **Article Gallery (2026-08-13):** REST `/page/media-list` + batched
  imageinfo — Albert Einstein → 32 captioned images; caption-presence filter
  drops infobox flags/maps (verified: France's `Flag_of_France.svg` and all
  map SVGs have no caption); grid mode (small/medium/large) + list mode
  (thumb left, caption right); min-size filter (200px) for tiny icons;
  utm-stripped thumb URLs; example dashboard includes the gallery
- ✅ **Commons File Gallery (2026-08-13):** 🗂️ pasted list of Commons files → batched `imageinfo` (400px thumbs + description captions); grid + list modes, order listed/random/alpha/largest (verified: 3 files, alphabetical subtitle, list mode, random order), missing-file counting ("3 files · 1 not found"), adaptive 4,500-char batching for long filenames
- ✅ **Article List (2026-08-13):** 📋 pasted article titles → clickable rows (en/de/fr); optional enrichment adds 120px thumb + 3-line intro via batched `pageimages|extracts` (50/call — verified: 2 thumbs + 2 extracts for Ada Lovelace / Albert Einstein)
- ✅ **Video / Media Player (2026-08-16):** 🎬 native HTML5 playback of
  Commons video/audio — no player library (unlike the vendored Pannellum).
  One file or a jukebox playlist: batched `videoinfo` derivatives (one call
  per ≤4,500-char batch), VP9 WebM transcode per height-based quality
  (auto = largest ≤1080p, original as fallback), per-track video/audio
  auto-detect (mixed playlists render `<video>`/`<audio>` per track),
  next/prev + position, loop-playlist wrap, Fisher-Yates shuffle,
  autoplay with a browser-policy-aware ▶ Start pill (one click unlocks
  subsequent autoplay), kiosk-compatible; missing files counted in the
  subtitle — verified live: FA-18 refueling clip (480p VP9), EN-Abbe
  spoken article (audio), Leica 1927 (1080p). **Extended 2026-09-01:**
  "Show Commons description" (default ON) — the now-playing track shows its
  `ImageDescription` + `Artist · License` credit (verified: Dance reedit 2 →
  "Dance couple performing the cha cha." · Wpzhiyilee · CC BY-SA 3.0); plus
  a freeform **Markdown annotation** field for board captions
- ✅ **360° Panorama Viewer (2026-08-13):** Pannellum 2.5.7 (vendored,
  lazy-loaded as a separate 56 KB asset) renders real Commons
  equirectangular files — Imiloa grounds 12740×6370 verified live in the
  widget: WebGL canvas, drag-to-look-around (pixel-diff verified),
  auto-rotate, 2:1 + GPano detection with a "not 2:1" warning, display via
  iiurlwidth=4096 thumb instead of the 10–20 MB original. New: per-widget
  layout constraints (registry `defaultLayout` → react-grid-layout
  minW/minH/maxW/maxH) — panorama defaults to w:4 h:3, can't shrink below
  3×2 (verified by drag-resize). Config change re-fetches and rebuilds the
  viewer

### Article intelligence & power widgets (2026-08-13)

- ✅ **Article Vitals (2026-08-13):** Article Excerpt (REST summary — Ada
  Lovelace: description, thumbnail, first paragraph), Edit History (byte
  deltas + user + timestamp + comment, newest-first), Article Quality (Lift
  Wing ORES class — Albert Einstein → FA at 53.9%, full class distribution),
  WikiProject Assessment (18 projects, class + importance badges); config
  change re-fetches live; schema + example dashboard updated
- ✅ Top Wikipedia Articles: hatnote via proxy (en latest: top-10 of 100, 4
  noise items filtered incl. rank-1 `.xxx`); WMF fallback (de, ja — "via WMF
  Pageviews API"); specific date (fr 2026-07-14); filterNoise toggle shows
  `.xxx`/`.xyz` when off; topN 100=all (96 rows after filter); 100-row card
  scrolls internally
- ✅ Expanded view (⚙ checkbox): 120px thumbnails + intro extracts via the
  MediaWiki API (prop=pageimages|extracts) — Spider-Man poster, Lucy Davis
  photo; non-article pages (Main_Page, Special:*) filtered from both sources
- ✅ **SPARQL Query (2026-08-13):** 🧠 verified live — Met collection depth 72,433 (StatCard); multi-institution bars (Met > Rijksmuseum > British Museum > Smithsonian); Women-in-Red **20.13%** via Humaniki (its bias_labels are authoritative — hardcoded QIDs give a wrong 79.7%); Commons top-depicts via QLever (25 bars, prefix block required); multi-column → table; bad query → themed error + Retry; preset select fills query+endpoint atomically; renderer override forces stat/bar/line/table
- ✅ **Wiki Page (2026-08-13):** 📄 static iframe embed — Wikimedia sends no X-Frame-Options / frame-ancestors (verified), so pages embed directly; desktop + mobile toggle (`?useformat=mobile` — MobileFrontend's preview param; the m. subdomains are retired and 301 to desktop, verified), section anchors, links browse inside the widget; verified live in browser (Help:Introduction desktop + mobile render, Albert_Einstein#Biography URL)

### Ask advisor, presentation chrome & grid (2026-08-15 → 16)

- ✅ **✨ Ask advisor (2026-08-16):** intent-first widget discovery — type
  what you want, get widget recommendations with pre-filled configs,
  click to add. Manifest generated from the registry (~3.7K tokens),
  /api/ask relay to Wikimedia's free LiftWing LLM (llm-qwen36-27b, no key,
  prompts not stored), server-side config normalization (invalid select
  values dropped, `commons.org`→`commons.wikimedia` aliases, `Category:`
  prefixes stripped, `File:` prefixes ensured), offline keyword fallback.
  Constitutions: tests/ask-validation.test.mjs (11 tests).
- ✅ **Gallery content-fit + grid density (2026-08-16):** Article Gallery /
  Commons File Gallery add at full width and auto-fit height to the image
  count (registry `autoHeight` → WidgetFrame → App row fitting, clamp
  3–14, stops after manual resize). Root cause of the old small/narrow
  default: react-grid-layout 2.2.4 silently moved `rowHeight`/`margin`/
  `cols` into the `gridConfig` prop (same drift as `dragConfig`) — the
  board rendered at RGL's 150px-row defaults; fixed, and guarded by
  `npm run smoke` (scripts/smoke-grid.mjs, geometry assertions).
- ✅ **Kiosk + Lean presentation modes (2026-08-15/16):** ⛶ Present
  (fullscreen, `?kiosk=1`) and ▣ Lean (chrome-free without fullscreen,
  `?lean=1` — resizable browser, iPad-app feel) hide all editing chrome,
  lock the grid, and tighten margins; Esc or the floating ✕ Exit returns
  (and strips the URL param so a refresh after leaving lands in normal
  mode); fullscreen only on the Present click (user-gesture rule),
  never on boot — verified live on the full 30-widget catalog including
  the mobile stack

### Constitutions, config loading & plumbing

- ✅ **Freshness constitution (2026-08-14):** all 26 live-querying widgets stamp their last-run time — `⏱ updated 10:17:27 AM · auto-refresh 1h` footer on every fetch widget (updates on every load incl. auto-refresh); verified live on the sample dashboard (26 stamped, markdown + Wiki Page exempt, 0 errors)
- ✅ All 29 data-driven widget types render live data in the browser; the
  29th (Text/Markdown) and 30th (Wiki Page — a static iframe) are static —
  no fetch, renders from config
- ✅ On-wiki config loading: `?config=…Commons:WikiPortraits/Bento-demo.json` → all 30 widgets
- ✅ URL loading: `?config=/dashboard.json` (hosted), `#/d/<base64>` hash links (Share roundtrip), error banner + fallback on bad URLs
- ✅ w.wiki short URLs: `?config=https://w.wiki/TR9R` and bare `w.wiki/TR9R`
  expand via the same-origin `/api/resolve` endpoint and load the dashboard
- ✅ Export → Import roundtrip, validation errors shown for bad JSON, Example, About, Reset, localStorage persistence
- ✅ Production build: 433.41 KB JS (127.58 KB gzip) + 48.86 KB CSS (9.86 KB gzip)

### The starter board, re-verified (2026-08-12)

- ✅ Main Page pageviews: 218.4M views / 30 days (~7.28M/day)
- ✅ External links: 1,499 → LibreTexts.org; 2,850 all-namespaces / **2,320 articles-only** → gettyimages.com; 5,000+ cap indicator on youtube.com
- ✅ Top 10 Wikipedias: English 1st at 7,223,053 articles
- ✅ Category Size (WLM 2024): 239,084 items + random photo sample (6 thumbs, fresh per refresh)
- ✅ File Usage Map: image + summary caption (Blue Marble, 500px thumb)
- ✅ Text/Markdown card: markdown rendering verified (headings/bold/links/lists/code);
  Wikimedia images render by default, external hosts blocked with an opt-in toggle,
  XSS payloads (`<script>`, `onerror`) inert

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — component tree, data flow, widget registry pattern, known issues
- [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) — why this project exists: the HyperCard lineage and the malleable-canvas thesis
- [docs/PARADIGMS.md](docs/PARADIGMS.md) — research companion: presentation paradigms (cards, timelines, canvases, tile grids), the wayfinding question, and the CD-ROM multimedia era's rise and fall
- [docs/TOOL-LANDSCAPE-SYNTHESIS.md](docs/TOOL-LANDSCAPE-SYNTHESIS.md) — research synthesis: ~40 dashboard/gallery/curation/dataflow tools surveyed (Freeboard, Are.na, Observable, oEmbed, ToolFlow…) and what each teaches WikiBento
- [docs/MODULARITY-AND-DATAFLOW.md](docs/MODULARITY-AND-DATAFLOW.md) — architecture assessment: plug-in modularity scorecard + the dataflow spectrum (dashboard variables → declarative wiring → visual DAG → orchestration, and why we stop before orchestration)
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) — every API endpoint, params, caps, and gotchas
- [docs/WIDGET-DEVELOPMENT.md](docs/WIDGET-DEVELOPMENT.md) — how to add a new widget type
- [docs/INTENT-BENCHMARK.md](docs/INTENT-BENCHMARK.md) — the Ask advisor's intent→widget ground-truth catalog, the offline + live benchmark suites, and the fixture **interviewer tool** (`scripts/interview-fixtures.mjs` — interview mode for adding test cases without hand-editing JSON)
- [docs/GLAMORGAN-WIDGET.md](docs/GLAMORGAN-WIDGET.md) — the GLAM widget design review + Commons Impact Metrics findings
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — local dev + Toolforge node20 deployment (SSH as `alih@`, `sudo -niu tools.wikibento`), full deploy procedure
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
