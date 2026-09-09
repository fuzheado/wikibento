# Board Composition Guide — WikiBento

## What This Is

WikiBento is a drag-and-drop dashboard for Wikimedia — a single reactive layout for keeping an eye on content and interacting with it. Wikimedia's content and activity live across many places: pageview and stats APIs, wiki pages, recent changes, Commons. WikiBento brings what you care about into one place.

This guide is the **complete reference for wiring widgets into boards**. It covers all 37 widget types, how they communicate with each other (params, dataflow, emit/consume), board composition strategies, and the operational details you need to build sophisticated dashboards — whether you're a human author or an LLM generating board configs.

Think of it as the assembly manual for WikiBento's Lego set: each widget is a brick, and this guide tells you what every brick looks like, how they snap together, and what you can build.

---

## Who This Is For

- **Board authors** who want to compose widgets into working dashboards
- **Developers** who need to understand the widget communication model
- **LLMs and automated tools** that need a machine-parseable reference for generating board configs
- **Curious minds** who want to understand what WikiBento can do

## How to Use This Guide

- **If you're new to WikiBento:** start with the [user guide](GUIDE.md) for the big picture, then come back here for the details.
- **If you want to build a board:** go to Part 1 to pick your widgets, Part 2 to wire them together, and Part 3 for layout and composition patterns.
- **If you're an LLM generating configs:** use Part 1 as a widget catalog, Part 2 as a communication reference, and Part 4 as a generation checklist.
- **If you want demo ideas and board templates:** see [DEMO-IDEAS.md](DEMO-IDEAS.md) for curated board concepts including Voyager CD-ROM-inspired designs.

---

## Table of Contents

1. [Part 1 — Widget Registry](#part-1--widget-registry) — all 37 widgets with full capabilities
2. [Part 2 — Communication Patterns](#part-2--communication-patterns) — params, dataflow, source picker, interpolation
3. [Part 3 — Board Composition Patterns](#part-3--board-composition-patterns) — layout, sizing, responsive, kiosk/lean
4. [Part 4 — LLM Prompt Guide](#part-4--llm-prompt-guide) — how to use this guide to generate board configs

---

## Part 1 — Widget Registry

Every widget is defined by these fields (from `public/manifest.json`):

| Field | Meaning |
|---|---|
| `id` | Unique string identifier (used in `{{widget:<id>}}` references) |
| `name` | Human-readable name |
| `icon` | Emoji icon for the Add Widget panel |
| `description` | One-line summary |
| `category` | Group in the Add Widget panel |
| `type` | Renderer contract: `stat` (big number), `table` (rows), `trend` (chart), `media` (embedded content), `embed` (iframe/static), `query` (SPARQL) |
| `dataSource` | API/fetcher used |
| `timeScope` | `'month'` \| `'range'` \| `'day'` \| `'point'` — temporal-scope constitution |
| `nodeKind` | `'source'` (fetches data), `'query'` (runs SPARQL), `'sink'` (renders static/computed data) |
| `consumesSource` | `true` if the widget can accept a `source` field (dataflow consumer) |
| `intensity` | `'low'` \| `'medium'` \| `'high'` — API load estimate |
| `experimental` | `true` if the widget is alpha/beta |

### 1.1 Articles (6 widgets)

#### `pageviews` — Article Pageviews
- **dataSource:** RESTBase Pageviews API (`/metrics/pageviews/`)
- **configFields:**
  - `article` (text, placeholder `Main_Page`) — Wikipedia article title
  - `project` (select: `en.wikipedia`, `de.wikipedia`, `fr.wikipedia`, `commons.wikimedia`) — wiki to query
  - `displayMode` (select: `stat` \| `trend`) — big number vs. sparkline chart
- **defaults:** `article`, `project`, `displayMode`, `refreshSeconds`
- **timeScope:** `range` (30-day window)
- **emit:** none (pure sink)
- **renderer:** `StatCard` or `TrendCard`

#### `excerpt` — Article Excerpt
- **dataSource:** REST `/page/summary`
- **configFields:**
  - `article` (text) — article title
  - `project` (select: same as pageviews)
- **defaults:** `article`, `project`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** `data.extract` — emits the first paragraph as a string. Other widgets can consume this via `source` picker or `{{widget:<id>}}` interpolation.
- **renderer:** `ExcerptCard`
- **⚠️ LLM note:** This is the primary text emitter. Use `{{widget:<excerpt-id>}}` to feed the text into a Translator, Speaker, or Markdown card.

#### `edithistory` — Edit History
- **dataSource:** MediaWiki API `prop=revisions`
- **configFields:**
  - `article` (text), `project` (select), `limit` (number)
- **defaults:** `article`, `project`, `limit`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `EditHistoryCard`

#### `quality` — Article Quality (ORES)
- **dataSource:** Lift Wing `enwiki-articlequality` (falls back to `articlequality` model)
- **configFields:**
  - `article` (text), `project` (select)
- **defaults:** `article`, `project`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `QualityCard` (shows FA/GA/B/C/Start/Stub with probability distribution)

#### `assessments` — WikiProject Assessment
- **dataSource:** MediaWiki API `prop=pageassessments`
- **configFields:**
  - `article` (text), `project` (select), `topN` (number)
- **defaults:** `article`, `project`, `topN`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `AssessmentsCard`

#### `gallery` — Article Gallery
- **dataSource:** REST `/page/media-list` + `imageinfo`
- **configFields:**
  - `article` (text), `project` (select)
  - `displayMode` (select: `grid` \| `list`)
  - `iconSize` (select: `small` \| `medium` \| `large`)
  - `imageFit` (select: `contain` \| `cover`)
  - `minSize` (number, px filter)
  - `maxItems` (number, row cap; 0 = all)
  - `includeAll` (boolean — show caption-less gallery blocks and table lists)
  - `hideDecorative` (boolean — drop flags/coats of arms/logos; default on, only with `includeAll`)
  - `groupBy` (select: `none` \| `section` \| `gallery`)
- **defaults:** `article`, `project`, `displayMode`, `iconSize`, `imageFit`, `minSize`, `maxItems`, `includeAll`, `hideDecorative`, `groupBy`, `refreshSeconds`
- **timeScope:** `point`
- **autoHeight:** yes (rows × tile height, clamp 3–14, stops after manual resize)
- **defaultLayout:** `{ w: 12, h: 6 }` — full width
- **emit:** none
- **renderer:** `GalleryGridCard` or `GalleryListCard`

### 1.2 Categories & GLAM (11 widgets)

#### `categorySize` — Category Size
- **dataSource:** MediaWiki API `categoryinfo`
- **configFields:**
  - `category` (text, placeholder `Images from X`)
  - `wiki` (select: `commons.wikimedia` \| `en.wikipedia`)
  - `sampleCount` (number, 0–24; 0 = off)
- **defaults:** `category`, `wiki`, `sampleCount`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `StatCard`

#### `glamorgan` — GLAM Category Usage
- **dataSource:** PetScan relay (`/api/petscan`) + WMF pageviews
- **configFields:**
  - `category` (text)
  - `depth` (number, 0–12; hint: "0 = category only, 1 = + direct subcats")
  - `year` / `month` (numbers)
  - `negcats` (text, pipe-separated exclusion categories)
  - `negdepth` (number, exclusion depth)
  - `fileBudget` (number, 50–30,000)
  - `topN` (number, 1–10, filmstrip size)
  - `showDetail` (boolean — per-page usage table)
- **defaults:** `category`, `depth`, `year`, `month`, `negcats`, `negdepth`, `fileBudget`, `topN`, `showDetail`, `refreshSeconds`
- **timeScope:** `month`
- **emit:** none
- **renderer:** `GlamCard`

#### `cimSnapshot` — CIM Category Snapshot
- **dataSource:** CIM `category-metrics-snapshot`
- **configFields:**
  - `category` (text)
  - `scope` (select: `shallow` \| `deep`)
  - `month` (text, `YYYY-MM`)
- **defaults:** `category`, `scope`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `CimSnapshotCard`

#### `cimTrend` — CIM Views Over Time
- **dataSource:** CIM `pageviews-per-category-monthly`
- **configFields:**
  - `category` (text)
  - `scope` (select: `shallow` \| `deep`)
  - `wiki` (select: `all-wikis` \| specific wiki)
  - `months` (number, 2–24)
  - `month` (text, `YYYY-MM`)
- **defaults:** `category`, `scope`, `wiki`, `months`, `month`, `refreshSeconds`
- **timeScope:** `range`
- **emit:** none
- **renderer:** `TrendCard`

#### `cimTopFiles` — CIM Top Files
- **dataSource:** CIM `top-viewed-media-files-monthly` + `imageinfo`
- **configFields:**
  - `category` (text)
  - `scope` (select: `shallow` \| `deep`)
  - `wiki` (select)
  - `topN` (number, 1–50)
  - `month` (text)
- **defaults:** `category`, `scope`, `wiki`, `topN`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `CimTopFilesCard`

#### `cimTopWikis` — CIM Top Wikis
- **dataSource:** CIM `top-wikis-per-category-monthly`
- **configFields:** `category`, `scope`, `wiki`, `topN`, `month`
- **defaults:** `category`, `scope`, `wiki`, `topN`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `RankingCard`

#### `cimTopPages` — CIM Top Pages
- **dataSource:** CIM `top-pages-per-category-monthly`
- **configFields:** `category`, `scope`, `wiki`, `topN`, `month`
- **defaults:** `category`, `scope`, `wiki`, `topN`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `RankingCard`

#### `cimTopEditors` — CIM Top Editors
- **dataSource:** CIM `top-editors-monthly`
- **configFields:** `category`, `scope`, `wiki`, `topN`, `month`
- **defaults:** `category`, `scope`, `wiki`, `topN`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `RankingCard`

#### `cimLeaderboard` — CIM Global Leaderboard
- **dataSource:** CIM `top-viewed-categories-monthly`
- **configFields:** `topN`, `highlightCategory` (text, optional)
- **defaults:** `topN`, `highlightCategory`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `RankingCard`

#### `cimFileSpotlight` — CIM File Spotlight
- **dataSource:** CIM `media-file-metrics-snapshot` + `pageviews-per-media-file-monthly`
- **configFields:**
  - `filename` (text)
  - `showImage` (boolean, default on)
  - `month` (text)
- **defaults:** `filename`, `showImage`, `month`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `CimFileSpotlightCard`

#### `cimFileTraffic` — CIM File Traffic
- **dataSource:** CIM `pageviews-per-media-file-monthly`
- **configFields:**
  - `filename` (text)
  - `months` (select: 3 \| 6 \| 12 \| 24)
  - `month` (text)
- **defaults:** `filename`, `months`, `month`, `refreshSeconds`
- **timeScope:** `range`
- **emit:** none
- **renderer:** `FileTrafficCard` (interactive SVG chart with −/+ zoom)

### 1.3 Files & Media (4 widgets)

#### `fileUsage` — File Usage Map
- **dataSource:** Commons API `globalusage` + `imageinfo`
- **configFields:**
  - `filename` (text, placeholder `Example.jpg`)
  - `topN` (number, rows shown)
  - `showImage` (boolean)
  - `showCaption` (boolean)
- **defaults:** `filename`, `topN`, `showImage`, `showCaption`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `FileUsageCard`

#### `fileGallery` — Commons File Gallery
- **dataSource:** Commons API `imageinfo` (batched)
- **configFields:**
  - `files` (textarea, one Commons file per line)
  - `displayMode` (select: `grid` \| `list`)
  - `order` (select: `listed` \| `random` \| `alpha` \| `largest`)
- **defaults:** `files`, `displayMode`, `order`, `refreshSeconds`
- **timeScope:** `point`
- **autoHeight:** yes (full width, auto-fit to image count)
- **defaultLayout:** `{ w: 12, h: 6 }`
- **emit:** none
- **renderer:** `GalleryGridCard` or `GalleryListCard`

#### `panorama360` — 360° Panorama Viewer
- **dataSource:** Commons `imageinfo` + Pannellum (WebGL, lazy-loaded)
- **configFields:**
  - `filename` (text, Commons equirectangular file)
  - `project` (select: `commons.wikimedia`)
  - `autoRotate` (boolean)
- **defaults:** `filename`, `project`, `autoRotate`, `refreshSeconds`
- **timeScope:** `point`
- **defaultLayout:** `{ w: 4, h: 3, minW: 3, minH: 2 }`
- **emit:** none
- **renderer:** `PanoramaCard`

#### `mediaPlayer` — Video / Media Player
- **dataSource:** Commons API `videoinfo` (batched)
- **configFields:**
  - `files` (textarea, one Commons file per line — jukebox playlist)
  - `autoPlay` (boolean)
  - `loop` (boolean)
  - `shuffle` (boolean)
  - `showDesc` (boolean — Commons description + artist/license credit)
  - `showAnnotation` (boolean — freeform Markdown annotation)
- **defaults:** `files`, `autoPlay`, `loop`, `shuffle`, `showDesc`, `showAnnotation`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `MediaPlayerCard`

### 1.4 Rankings & Platforms (4 widgets)

#### `linkcount` — External Link Count
- **dataSource:** MediaWiki API `exturlusage`
- **configFields:**
  - `domain` (text, placeholder `example.org`)
  - `wiki` (select: `en.wikipedia`, `de.wikipedia`, `fr.wikipedia`)
  - `namespace` (select: `""` \| `0` \| `0|1` \| `6` \| `10` \| `14`)
- **defaults:** `domain`, `wiki`, `namespace`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `StatCard`

#### `wikistats` — Wiki Stats
- **dataSource:** Wikistats (s23) CSV API
- **configFields:**
  - `lang` (select: `en`, `de`, `fr`, `ja`, `zh`, `es`, `ar`, `pt`, `ru`, `it`)
  - `table` (select: `wikipedias`, `wiktionaries`, `wikisources`)
- **defaults:** `table`, `lang`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `StatCard`

#### `topWikipedias` — Top 10 Wikipedias
- **dataSource:** Wikistats (s23) CSV API
- **configFields:** none
- **defaults:** `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `RankingCard`

#### `topPages` — Top Wikipedia Articles
- **dataSource:** top.hatnote.com (via `/api/proxy`) + WMF pageviews `top` fallback
- **configFields:**
  - `lang` (select: 28 Wikipedia language codes)
  - `dateMode` (select: `latest` \| `day` \| `month` \| `year`)
  - `topN` (number, 1–100; 0/100 = all)
  - `filterNoise` (boolean, default on)
  - `showExpanded` (boolean — 120px thumbnail + intro per row)
- **defaults:** `lang`, `dateMode`, `topN`, `filterNoise`, `showExpanded`, `refreshSeconds`
- **timeScope:** `day`
- **emit:** none
- **renderer:** `RankingCard` (with optional `TopPagesExpandedCard` when `showExpanded`)

### 1.5 Content & Embeds (6 widgets)

#### `boardControls` — Board Controls (params)
- **dataSource:** static (writes board params)
- **configFields:**
  - `title` (text, card title)
  - `spec` (textarea, one param per line: `name \| type \| Label \| options`)
  - `show` (string, comma-separated param names rendered on this card; empty = all)
- **defaults:** `title`, `spec`, `show`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `BoardControlsCard`
- **⚠️ LLM note:** This is the primary input widget. Define params here and reference them with `{{paramName}}` in other widgets' config fields.

#### `markdown` — Text / Markdown
- **dataSource:** static (no fetch)
- **configFields:**
  - `text` (textarea, Markdown content)
  - `refreshSeconds` (number, static widgets exempt from freshness constitution)
- **defaults:** `text`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `MarkdownCard`
- **⚠️ LLM note:** Images in Markdown are https-only; `*.wikimedia.org` is the default allowlist. Other hosts need the per-widget "Allow external images" opt-in.

#### `speaker` — Speaker (text-to-speech)
- **dataSource:** static (Web Speech synthesis)
- **configFields:**
  - `text` (textarea, or `{{param}}` / `{{widget:<id>}}` reference)
  - `voice` (select, device voice roster)
  - `rate` (number, 0.5–2)
  - `speakOnChange` (boolean, default off — auto-speak after one ▶ click)
- **defaults:** `text`, `voice`, `rate`, `speakOnChange`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `SpeakerCard`
- **⚠️ LLM note:** The first output widget. Nothing speaks until ▶ is clicked once. Use `{{widget:<excerpt-id>}}` to feed article text for narration.

#### `translate` — Translator (MinT)
- **dataSource:** MinT translate API (`POST https://translate.wmcloud.org/api/translate`)
- **configFields:**
  - `text` (textarea, or `{{param}}` / `{{widget:<id>}}` reference)
  - `from` (text, 2-letter source language code)
  - `to` (text, 2-letter target language code)
  - `format` (select: `text` \| `html`)
- **defaults:** `text`, `from`, `to`, `format`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `TranslateCard`
- **⚠️ LLM note:** Key-free, no proxy (CORS `*`). 200+ languages. 8,000-char cap flagged in card. Use `{{widget:<excerpt-id>}}` to translate article excerpts.

#### `articleList` — Article List
- **dataSource:** MediaWiki API `pageimages|extracts` (batched, optional)
- **configFields:**
  - `articles` (textarea, one article title per line)
  - `project` (select)
  - `showThumbnails` (boolean)
  - `showIntros` (boolean)
- **defaults:** `articles`, `project`, `showThumbnails`, `showIntros`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `ArticleListCard`

#### `wikiPage` — Wiki Page (embed)
- **dataSource:** static (iframe to the wiki)
- **configFields:**
  - `wiki` (select) — wiki to embed
  - `page` (text) — page title
  - `url` (text) — custom URL (overrides wiki+page; http(s) only)
  - `useMobile` (boolean — `?useformat=mobile`)
  - `section` (text — section anchor)
  - `sandbox` (boolean — sandbox the iframe for external URLs)
- **defaults:** `wiki`, `page`, `url`, `useMobile`, `section`, `sandbox`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `WikiPageCard`

### 1.6 Queries & Power (1 widget)

#### `sparql` — SPARQL Query
- **dataSource:** WDQS (`query.wikidata.org/sparql`) + QLever (`commons-query.wikimedia.org`) + Humaniki
- **configFields:**
  - `query` (textarea, SPARQL query text)
  - `endpoint` (select: `wdqs` \| `qlever` \| `humaniki`)
  - `renderer` (select: `auto` \| `stat` \| `bar` \| `line` \| `table`)
  - `timeout` (number, seconds; default 60)
- **defaults:** `query`, `endpoint`, `renderer`, `timeout`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `SparqlCard`
- **⚠️ LLM note:** QLever can't run `SERVICE wikibase:label` — entity URIs are resolved via `wbgetentities` and rendered as `Label (QID)`. WDQS queries with `?xLabel` sibling variables leave bare QIDs.

### 1.7 Dataflow (4 widgets — widget-to-widget connections)

#### `listSource` — Text List
- **dataSource:** static (a list you paste)
- **configFields:**
  - `title` (text, optional card title)
  - `items` (textarea, one item per line)
- **defaults:** `title`, `items`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** `data.items` — emits the list of lines as an array. Other widgets consume via `source` picker or `{{widget:<id>}}` interpolation (arrays join with `\n`).
- **renderer:** `ListSourceCard`
- **⚠️ LLM note:** This is the primary producer for curated lists. Paste a list of items; downstream widgets consume it.

#### `filterLines` — Filter Lines
- **dataSource:** another widget's output (`source`)
- **configFields:**
  - `source` (source picker — dropdown of emitting widgets)
  - `pattern` (text, match pattern)
  - `match` (select: `contains` \| `equals` \| `starts` \| `ends`)
  - `caseSensitive` (boolean)
- **defaults:** `source`, `pattern`, `match`, `caseSensitive`, `refreshSeconds`
- **timeScope:** `point`
- **consumesSource:** `true`
- **emit:** `data.filtered` — emits the filtered lines array.
- **renderer:** `FilterLinesCard`

#### `lineCount` — Line Count
- **dataSource:** another widget's output (`source`)
- **configFields:**
  - `source` (source picker)
  - `label` (text, optional stat label)
- **defaults:** `source`, `label`, `refreshSeconds`
- **timeScope:** `point`
- **consumesSource:** `true`
- **emit:** `data.count` — emits the number.
- **renderer:** `StatCard`

#### `echo` — Value Display
- **dataSource:** another widget's output (`source`)
- **configFields:**
  - `source` (source picker)
  - `title` (text, optional card title)
- **defaults:** `source`, `title`, `refreshSeconds`
- **timeScope:** `point`
- **consumesSource:** `true`
- **emit:** `data.value` — passes the value through (number, lines, or JSON).
- **renderer:** `EchoCard`

### 1.8 Web & History (1 widget)

#### `waybackGallery` — Wayback Snapshot Gallery ⚠️ alpha
- **dataSource:** Wayback Machine availability + CDX/timemap (server batch)
- **configFields:**
  - `url` (text, the website URL)
  - `dates` (textarea, one date per line, `YYYYMMDD` format)
  - `tolerance` (number, days)
- **defaults:** `url`, `dates`, `tolerance`, `refreshSeconds`
- **timeScope:** `point`
- **emit:** none
- **renderer:** `WaybackGalleryCard`

---

## Part 2 — Communication Patterns

### 2.1 Board Params (shared inputs)

**Purpose:** Declare shared inputs that multiple widgets reference. One change re-aims all referencing widgets.

**Where defined:** Top-level `params` block in the dashboard JSON.

**Syntax:**
```json
{
  "params": {
    "topic": {
      "label": "Article",
      "type": "text",
      "value": "Ada Lovelace"
    },
    "collection": {
      "label": "Collection",
      "type": "buttons",
      "options": ["Images from Met", "Files from BHL", "Images from LoC"],
      "value": "Images from Met"
    },
    "targetLang": {
      "label": "Target language",
      "type": "select",
      "options": ["fr", "de", "es", "it"],
      "value": "fr"
    }
  }
}
```

**Reference anywhere in widget configs:**
```json
[
  { "widgetType": "excerpt", "config": { "article": "{{topic}}" } },
  { "widgetType": "cimSnapshot", "config": { "category": "{{collection}}" } },
  { "widgetType": "translate", "config": { "to": "{{targetLang}}" } }
]
```

**Board Controls widget** renders the UI for params. Use `show` to scope a card to a subset of params:
```json
{
  "widgetType": "boardControls",
  "config": {
    "show": "topic,targetLang"
  }
}
```

**⚠️ LLM note:** Params are the primary mechanism for shared inputs. Define all shared inputs in `params`, reference them with `{{name}}` in widget configs, and use Board Controls cards to render the UI.

### 2.2 Widget-to-Widget Dataflow (emit/consume)

**Purpose:** Widgets can emit their output and other widgets can consume it — two ways:

1. **`source` picker** (⚙ panel on consumer widgets) — structured access; the producer's output arrives as `opts.sourceOutput` to `transform`/`fetch`.
2. **`{{widget:<id>}}` interpolation** — in any text/config field; arrays join with `\n` so a Text List's lines can feed an Article List's titles field.

**Emitting widgets (producers):**

| Widget | What it emits |
|---|---|
| `excerpt` | `data.extract` — first paragraph string |
| `listSource` | `data.items` — array of lines |
| `filterLines` | `data.filtered` — array of filtered lines |
| `lineCount` | `data.count` — number |
| `echo` | `data.value` — passes through |

**⚠️ Critical rule:** A widget that **fetches** never sends an unresolved `{{widget:id}}` placeholder upstream. It shows *"Waiting for a reference"* and loads automatically once the producer emits. This prevents cascade failures.

**Content-based signature:** Consumers re-fetch when the source value changes. Identical re-emits are no-ops — no refresh storms or loops.

**Example chain (annotated listening):**
```
listSource (lines = film titles)
  → filterLines (keep only "Criterion" titles)
    → articleList (clickable rows with thumbnails)
      → excerpt (emits first paragraph)
        → translate (consumes excerpt via {{widget:excerpt-id}})
        → speaker (consumes excerpt via {{widget:excerpt-id}})
```

**⚠️ LLM note:** When wiring a board, use `listSource` as the entry point for curated lists, `filterLines` for refinement, and `excerpt` → `translate`/`speaker` for the "read aloud" chain.

### 2.3 Reference Grammar

| Syntax | Meaning | Example |
|---|---|---|
| `{{paramName}}` | Board param interpolation | `"article": "{{topic}}"` |
| `{{widget:<id>}}` | Widget output interpolation | `"text": "{{widget:excerpt-src}}"` |
| `source` field | Structured dataflow consumption | `source: "excerpt-src"` |

**Resolution order:** `{{param}}` → `{{widget:<id>}}` → literal string. Unknown references are left literal and warned about.

### 2.4 Widget Instance Names & Rename Resolution

Every widget has a visible, editable instance name (the `id` field). The ⚙ panel shows the id chip. Renaming triggers a confirm dialog if other widgets reference the id — it reports "N references in M widgets" and repoints them all atomically.

**⚠️ LLM note:** When generating board configs, use descriptive ids like `excerpt-src`, `film-list`, `translate-target` so references are self-documenting.

---

## Part 3 — Board Composition Patterns

### 3.1 Dashboard JSON Structure

```json
{
  "version": 1,
  "params": { "topic": { "label": "Article", "type": "text", "value": "Ada Lovelace" } },
  "widgets": [
    { "id": "excerpt-1", "widgetType": "excerpt", "config": { "article": "{{topic}}" } }
  ],
  "layout": [
    { "i": "excerpt-1", "x": 0, "y": 0, "w": 12, "h": 6, "minW": 2, "minH": 3 }
  ]
}
```

### 3.2 Layout Guidelines

| Widget type | Recommended `w` | Recommended `h` | Notes |
|---|---|---|---|
| Markdown / welcome card | 12 | 4–6 | Full width, introductory |
| Board Controls | 12 | 2–4 | Top of board, drives params |
| Stat cards (pageviews, linkcount) | 3–4 | 3–4 | Compact, side-by-side |
| Galleries (article, file) | 12 | 6–10 | Full width, auto-height |
| Tables (edit history, top pages) | 6–8 | 6–10 | Scrollable inside card |
| Media player | 8–12 | 5–8 | Wide for controls |
| SPARQL query | 8–12 | 6–10 | Needs room for chart |
| 360° panorama | 4–6 | 3–4 | Fixed aspect ratio |
| Dataflow chain widgets | 3–4 | 3–4 | Small, chain horizontally |

**Responsive behavior:**
- Phones (<768px): 12-column grid collapses to single-column card stack, sorted by grid position (top-left first)
- Tablets/desktops: full drag-and-drop grid
- Kiosk/Lean: grid locked, no editing chrome

### 3.3 Board Composition Strategies

**Strategy 1: Templated collection (one template, N institutions)**
- Board Controls with `buttons` param for collection switching
- CIM snapshot + trend + top files + top pages + GLAM usage all driven by `{{collection}}` param
- Markdown card with curator's notes
- **Example:** `glam-demo.json`

**Strategy 2: Single artifact deep-dive (one film/book/work)**
- Article Excerpt as the anchor (emits first paragraph)
- Translator consumes excerpt via `{{widget:excerpt-id}}`
- Speaker consumes excerpt via `{{widget:excerpt-id}}`
- Article Gallery shows stills/frames
- Edit History shows editorial activity
- Quality + Assessments show encyclopedic standing
- Board Controls for language/era selection
- **Example:** annotated listening board

**Strategy 3: Curated list → filter → consume**
- Text List as entry point (paste curated titles)
- Filter Lines for refinement (by decade, genre, etc.)
- Article List or File Gallery as consumer
- Excerpt → Translator → Speaker chain
- **Example:** literary anthology board

**Strategy 4: Multi-institution comparison**
- Board Controls with `buttons` param for institution selection
- CIM snapshot + trend + top files for each institution
- SPARQL query for cross-institution comparison
- Markdown for comparative notes
- **Example:** museum comparison board

### 3.4 Resilience Patterns

- **Rate-limit aware:** Every fetch goes through a shared HTTP layer (max 4 concurrent, `Retry-After` honored, one 429 retry)
- **Error boundary:** Each widget is wrapped in an error boundary — a render crash shows a themed fallback with "Try Again" instead of killing the dashboard
- **Auto-refresh:** Configurable per widget (default 1h); static widgets exempt
- **Freshness constitution:** Every live-querying widget shows `⏱ updated ... · auto-refresh 1h`



## Part 4 — LLM Prompt Guide

### 4.1 How to Use This Guide to Generate Board Configs

When asked to create a board, follow this workflow:

1. **Identify the goal** — what experience are you building? (a curated collection, a deep-dive on one artifact, a comparison, a living feed)
2. **Map to WikiBento mechanisms** — use the communication patterns in Part 2 to wire widgets together.
3. **Select widgets** — use the Widget Registry (Part 1) to pick the right widget types.
4. **Define params** — what are the shared inputs? (e.g., movement, language, institution, decade)
5. **Wire dataflow** — which widgets emit and which consume? Use the communication patterns (Part 2).
6. **Choose layout** — use the layout guidelines (Part 3) for sizing.
7. **Write the JSON** — use the dashboard JSON structure (Part 3) with `version: 1`, `params`, `widgets`, `layout`.
8. **Validate** — run `npm run build` and `npm test` to check the config.

### 4.2 Common Board Patterns

| Pattern | Widgets used | When to use |
|---|---|---|
| **Single artifact deep-dive** | excerpt → translate + speaker + gallery + quality + edithistory | One film, book, or work |
| **Curated list → filter → consume** | listSource → filterLines → articleList → excerpt → translate + speaker | Multiple works, filterable |
| **Templated collection** | boardControls (params) → CIM family + GLAM + gallery | Institution/museum comparison |
| **Annotated listening** | excerpt → translate + speaker + mediaPlayer + gallery | Music/film with audio |
| **Living biography** | excerpt + edithistory + pageviews + quality + assessments + gallery | Article as living object |

### 4.3 Anti-Patterns

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| Using `{{param}}` in a widget that doesn't support it | Config field doesn't accept interpolation | Check the widget's configFields — only text/textarea/select fields support `{{...}}` |
| Emitting article titles without labeling | Translated titles can be mistaken for Wikidata language mappings | Use `excerpt` as the emitter (first paragraph only), not the title |
| Forgetting `refreshSeconds` on fetch widgets | Freshness constitution violation; build fails | All fetch widgets MUST declare `refreshSeconds ≥ 30` |
| Using `source` on a non-emitting widget | No output to consume | Only Text List, Filter Lines, Line Count, and Echo emit |
| Overlapping widget ids | Layout conflict; duplicate references | Use descriptive, unique ids like `excerpt-src`, `film-list` |
| Ignoring CIM 404 ambiguity | Unregistered categories and months with no data both 404 | Use `latestCimMonth()` for default months; the disambiguation probe separates these cases |

### 4.4 Widget ID Reference (for `{{widget:<id>}}` references)

When wiring dataflow chains, reference the emitter's `id`:

| Emitter widget | Emits | Consumed by |
|---|---|---|
| `excerpt` | `data.extract` (first paragraph string) | `translate`, `speaker`, `markdown`, `echo` |
| `listSource` | `data.items` (array of lines) | `filterLines`, `articleList`, `fileGallery`, `mediaPlayer`, `echo` |
| `filterLines` | `data.filtered` (array of filtered lines) | `articleList`, `fileGallery`, `lineCount`, `echo` |
| `lineCount` | `data.count` (number) | `echo`, `markdown` |
| `echo` | `data.value` (pass-through) | Any text field |

### 4.5 Quick Reference: Board Patterns → Widget Mapping

| Board pattern | WikiBento widget(s) |
|---|---|
| Annotated primary text + audio | `excerpt` + `translate` + `speaker` + `markdown` |
| Layers of commentary | `markdown` cards + `boardControls` params |
| "Karaoke" participation | `speaker` + `mediaPlayer` |
| Maps as portals | `panorama360` + `wikiPage` |
| Deep artifact treatment | `cimFileSpotlight` + `gallery` |
| Curated sequence | `boardControls` params + `listSource` |
| Reader's path stored | Board params + config-as-data = URL |
| Static finished artifact | Live ⏱ footer proves it's not a screenshot |
| Film extracts | `mediaPlayer` + `gallery` |
| Scholarly essays | `markdown` + `translate` |
| Note-taking with export | `markdown` (config persists) |
| Index/table of contents | `listSource` → `filterLines` → `articleList` |
| Cross-wiki file usage | `fileUsage` |
| Collection statistics | `cimSnapshot` + `cimTrend` + `cimTopFiles` |
| Community contribution | `cimTopEditors` + `edithistory` |
| Quality assessment | `quality` + `assessments` |

---

## Sources

- WikiBento manifest: `public/manifest.json` (37 widget types)
- WikiBento JSON format: `docs/JSON-FORMAT.md`
- WikiBento widget development: `docs/WIDGET-DEVELOPMENT.md`
- WikiBento guide: `docs/GUIDE.md`
- WikiBento data sources: `docs/DATA-SOURCES.md`
- WikiBento demo ideas: `docs/DEMO-IDEAS.md`
- WikiBento modularity & dataflow: `docs/MODULARITY-AND-DATAFLOW.md`
