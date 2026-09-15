# Widget catalog

Every widget type, grouped **the same way as the in-app Add Widget panel** — each section here is a
category in the picker. For how widgets are wired together (board params, dataflow, emit/consume) see
[BOARD-COMPOSITION.md](BOARD-COMPOSITION.md); for the endpoints behind them, [DATA-SOURCES.md](DATA-SOURCES.md).

Back to the [README](../README.md).

## Articles (6)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Article Pageviews** | 📊 | [RESTBase Pageviews API](https://wikimedia.org/api/rest_v1/) | 30-day total + daily sparkline with Y-axis ticks (ISSUE-64) + avg/day for any article |
| **Article Excerpt** | 📄 | [REST `/page/summary`](https://en.wikipedia.org/api/rest_v1/page/summary/Ada_Lovelace) | First paragraph + short description + thumbnail for any article, linked to the page — **emits its first paragraph** so other widgets can consume it (e.g. `text: "{{widget:<id>}}"` in a Translator) |
| **Edit History** | 🕓 | MediaWiki API `prop=revisions` | Recent edits newest-first — user, time, comment, and byte delta per edit |
| **Article Quality (ORES)** | 🏅 | [Lift Wing](https://api.wikimedia.org/) `enwiki-articlequality` (falls back to the modern continuous `articlequality` model) | Predicted FA/GA/B/C/Start/Stub class with per-class probability distribution for any article |
| **WikiProject Assessment** | 🧭 | MediaWiki API `prop=pageassessments` | Quality class + importance per WikiProject banner (enwiki and other PageAssessments wikis) |
| **Article Gallery** | 🖼️ | [REST `/page/media-list`](https://en.wikipedia.org/api/rest_v1/page/media-list/Albert_Einstein) + `imageinfo` | Images used in the article — grid (small/medium/large) or list; captioned by default (drops uncaptioned flags/logos/maps + tiny icons); optional **All images** mode (also gallery/table images, with a decorative-image filter you can disable) and **section/gallery grouping** with headers |

## Categories & GLAM (11)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Category Size** | 📁 | MediaWiki API `categoryinfo` | File/page/subcat breakdown for any category (Commons or enwiki), with optional **random photo sample** |
| **GLAM Category Usage** | 📈 | PetScan via same-origin `/api/petscan` relay + WMF pageviews (GLAMorgan-style) | Files/used/pages/views for a category tree + month (file budget up to 30,000), top-image filmstrip, per-page usage detail — clickable category & page links |
| **CIM Category Snapshot** | 🎯 | [CIM](https://wikimedia.org/api/rest_v1/metrics/commons-analytics/) `category-metrics-snapshot` | Exact **precomputed** stats for a CIM-registered category: files · used · wikis · pages (deep/shallow) |
| **CIM Views Over Time** | 📈 | CIM `pageviews-per-category-monthly` | Monthly pageview trend of pages using the category's files (2–24 months) — Y-axis ticks + gridlines, ⚙ zero-based toggle (ISSUE-64) |
| **CIM Top Files** | 🖼️ | CIM `top-viewed-media-files-monthly` + `imageinfo` | Most-viewed files with thumbnails + views |
| **CIM Top Wikis** | 🌍 | CIM `top-wikis-per-category-monthly` | Which wikis use the category's files most |
| **CIM Top Pages** | 📄 | CIM `top-pages-per-category-monthly` | Pages using the files, by views |
| **CIM Top Editors** | ✍️ | CIM `top-editors-monthly` | Top contributors by edit count (creates/updates/all) |
| **CIM Global Leaderboard** | 🏆 | CIM `top-viewed-categories-monthly` | Top 100 most-viewed categories on Commons, optional category highlight |
| **CIM File Spotlight** | 🔦 | CIM `media-file-metrics-snapshot` + `pageviews-per-media-file-monthly` | One file: wikis/pages using it + monthly view trend |
| **CIM File Traffic** | 📉 | CIM `pageviews-per-media-file-monthly` | Interactive monthly traffic chart for one file — labeled axes, −/+ zoom (3/6/12/24 months), self-heals CIM's intermittent 500s on specific ranges |

## Files & Media (5)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **File Usage Map** | 🖼️ | Commons API `globalusage` + `imageinfo` | Per-wiki breakdown of where a file is used, with optional **image preview + summary caption** |
| **Commons File Gallery** | 🗂️ | Commons API `imageinfo` (batched) | Gallery of any Commons files you list (one per line) — grid or list; order as-listed / random / alphabetical / largest-first; missing files counted |
| **360° Panorama Viewer** | 🌐 | Commons `imageinfo` + [Pannellum](https://pannellum.org) (WebGL) | Interactive 360° panorama from any Commons equirectangular file — drag to look around, auto-rotate option, 2:1/GPano detection, per-widget min-size constraint |
| **Video / Media Player** | 🎬 | Commons API `videoinfo` (batched) for `File:` names — or a **direct media URL** (`archive.org/download/…`), which needs no API call | Native HTML5 playback of **Commons files or any direct media URL** (an `archive.org/download/…` file plays with no API call and no key; Range requests make seeking work) — one file or a jukebox playlist: next/prev, loop, shuffle, quality pick, autoplay; optional **Commons description + artist/license credit** per track and a freeform **Markdown annotation** |
| **Document Reader** | 📄 | `imageinfo` on any wiki — pagecount + a page-N render template (one call; CORS ✓, no key) | A **PDF or DjVu** read page by page from the wiki that hosts it: turn, zoom (at the widths the server actually serves), jump to a page, **facing pages**, the file's credit, and a link to the original. Refuses a non-document politely. Where **Wikisource** has transcribed the file, the page's text shows **from the start** — with its **proofreading grade** (this is bulk-OCR territory: the grade is the point) and a link to the transcription. The panel **follows you as you turn pages**; **¶** hides it, and ⚙ decides whether it starts open |

## Rankings & Platforms (4)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **External Link Count** | 🔗 | MediaWiki API `exturlusage` | Count of pages linking to a domain (up to 5,000; **namespace-filterable** — e.g. articles only) |
| **Wiki Stats** | 🌐 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Articles, edits, users for a language edition |
| **Top 10 Wikipedias** | 🏆 | [Wikistats (s23) CSV API](https://wikistats.wmcloud.org/) | Ranking table of largest Wikipedias by article count |
| **Top Wikipedia Articles** | 🔥 | [top.hatnote.com](https://top.hatnote.com) (via same-origin proxy) + [WMF pageviews top](https://wikimedia.org/api/rest_v1/) fallback + MediaWiki `pageimages|extracts` enrichment | Most-visited articles for any of 28 Wikipedia languages — latest day or any date, top-N (all/10/arbitrary), default noise filter (.xxx, XXX (beer)…), optional **expanded view** with thumbnail + intro per row |

## Content & Embeds (7)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Board Controls** | 🎛️ | (static — writes board params) | Buttons / number sliders / month steppers / menus / text fields that drive `{{param}}` references in other widgets — the interactivity primitive; params editable in ⚙ |
| **Text / Markdown** | 📝 | (static content) | Free-form Markdown note — headings, lists, links, code, images (Wikimedia-hosted by default); a starting card or explanatory card (no fetch) |
| **QR Code** | 🔳 | (static — encoded locally, no fetch) | Renders any text/URL as a **scannable QR code** card — a phone-readable bridge from a board, printed handout or kiosk to a Commons category, PetScan query, Wikidata item or board permalink. Real quiet zone + white plate (scans in dark mode), error correction auto-ladders H→Q→M→L, **Save SVG** for print, and it takes `{{param}}` / `{{widget:<id>}}` so the code can follow the board. Encoded in-page (ISO/IEC 18004): **no shortener, no redirect, no scan analytics** |
| **Speaker (text-to-speech)** | 🔊 | (static — Web Speech synthesis) | **Output widget** — speaks its text aloud; voice picker from the device roster; mute all + auto-speak-on-change (default off, only after one ▶ click); degrades gracefully on zero-voice devices |
| **Translator (MinT)** | 🌐 | [MinT translate API](https://translate.wmcloud.org) (Wikimedia, CORS ✓) | Machine-translates its text (typed or a `{{param}}`) into another language — 200+ languages, open NMT models; shows source + translation + serving model |
| **Article List** | 📋 | MediaWiki API `pageimages\|extracts` (batched, optional) | Clickable list of pasted article titles — optional thumbnails + intros |
| **Wiki Page** | 📄 | (static — iframe to the wiki) | Embed any MediaWiki page — desktop or **mobile view (`?useformat=mobile`)**; links browse inside the widget; optional section anchor — or set a **Custom URL** to embed any http(s) page (e.g. an [Objectium](https://objectium.toolforge.org) 3D model, sandboxed) |

## Queries & Power (1)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **SPARQL Query** | 🧠 | [WDQS](https://query.wikidata.org/sparql) + [QLever](https://qlever.dev/api/wikimedia-commons) + Humaniki | Run any SPARQL (Wikidata or Commons SDC) — big number, bar chart, line, or table (auto-detected from the result shape, with manual override); Wikidata entity cells render **"Label (QID)"** (QLever can't run the label SERVICE — labels resolved via `wbgetentities`); 4 curated presets incl. collection depth and the Women-in-Red % (precomputed via Humaniki) Boards that pick a preset store the preset, not its query (so a preset edited upstream still reaches them) — open the ⚙ panel and the box shows the query actually running, ready to edit. |

## Dataflow (4) — widget-to-widget connections (ISSUE-52)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **Text List** | 🧾 | (static — a list you paste) | A numbered list whose lines are **published to the board**: any widget can consume them via its `source` picker or `{{widget:<id>}}` interpolation |
| **Filter Lines** | 🔎 | another widget's output (`source`) | Keeps only the lines matching a pattern (contains/equals/starts-with/ends-with, case toggle) — emits the filtered list downstream |
| **Line Count** | 🔢 | another widget's output (`source`) | Counts the lines/elements of any emitted output — emits the number (chain it into a Value Display) |
| **Value Display** | 🖨️ | another widget's output (`source`) | Prints whatever a widget outputs — number, lines, or JSON — the debug/pipe endpoint of a chain; passes the value through (`emit`) |

## Web & History (3)

| Widget | Icon | Data Source | Shows |
|---|---|---|---|
| **IA Item** | 📦 | `archive.org/metadata` + `be-api…/views` (CORS `*`, no key) | An **Internet Archive item** by identifier — title, creator, year, collection, file count and size, plus all-time / 30-day / 7-day **views** (IA engagement, updated daily — *not* Wikimedia pageviews), thumbnail and a link to its details page. Emits the item URL for downstream use (e.g. a **QR Code** card) |
| **IA Book** | 📖 | `iiif.archive.org` — Presentation v3 manifest, Image API v3, Content Search (CORS ✓, no key) | A **scanned Internet Archive book**: turn, zoom, jump from a thumbnail strip, **search inside it** (each hit names its page and shows the matched words boxed on the page), read that page's OCR text, open the PDF/EPUB/OCR — and read it as **facing pages** — set per board (⚙ *Reading mode*: auto / two pages / one page) or when the card is wide enough, with **right-to-left** handled for Arabic/Hebrew/Yiddish scans. Page count comes from the manifest's canvases, not the item metadata |
| **Wayback Snapshot Gallery** ⚠️alpha | 🕰️ | Wayback availability + CDX/timemap (server batch) | Screenshot tiles of a website at chosen dates — closest capture per date (within tolerance), iframe-embedded; experimental — depends on Wayback backend health, failed lookups retry on refresh |
