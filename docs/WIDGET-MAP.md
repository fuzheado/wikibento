# The widget map — 42 types, grouped by what you must supply

*One page, generated from `public/manifest.json` by `scripts/widget-map.mjs` (2026-10-09). The picture is
[widget-map.pdf](widget-map.pdf) (A4 landscape) · [widget-map.png](widget-map.png) · [widget-map.svg](widget-map.svg).*

**Why this exists.** Forty-two widget types is more than a person can hold in mind, and the Add-widget panel orders
them by *topic* — which does not answer the question a board-builder actually has: *what do I have, and what can it
show me?* So the map groups by **what you must supply**, colours by the panel's own families, and badges the gates.

| badge | meaning |
|---|---|
| ✧ | publishes an output another card can consume |
| ⇢ | consumes another card's output |
| ⚡ | static — renders from config, no fetch at all |
| 🔌 | needs our relay server (`/api/staticmap`, the hatnote ranking, the archive CDX) |
| α | alpha |

## Nothing but your own text (6)

*you bring the words (or the switch) — no subject to look up*

- **Text / Markdown** `markdown` — Content & Embeds, display ⚡: Free-form Markdown widget — notes, headings, links, explanations
- **QR Code** `qrCode` — Content & Embeds, display ✧ ⚡: Turns any text or URL into a scannable QR code — a phone-readable bridge from a board, a printed handout or a kiosk screen to a Commons category, Pet…
- **Speaker (TTS)** `speaker` — Content & Embeds, effector ⇢ ⚡: Output widget — speaks its text aloud with speech synthesis. Wire it to another widget and it reads whatever arrives; if that widget publishes a `spe…
- **Translator (MinT)** `translate` — Content & Embeds, ai ✧: Machine-translates its text (typed or via {{param}}) into another language — Wikimedia MinT: 200+ languages on open NMT models (NLLB-200, OpusMT, Ind…
- **Board Controls** `boardControls` — Content & Embeds, controller ⚡: Buttons / menus that drive board params ({{param}}) — one click re-aims every widget that references the param (ISSUE-50)
- **Text List** `listSource` — Dataflow, source ✧ ⚡: A pasted list of lines (articles, files, anything) published for other widgets — connect via a `source` picker or {{widget:id}}

## Nothing at all — a platform-wide ranking (3)

*aggregate statistics about wikis and articles, no subject of yours*

- **Top Articles** `topPages` — , source 🔌: Most-visited articles on a Wikipedia language edition (top.hatnote.com)
- **Top 10 Wikipedias** `topWikipedias` — Rankings & Platforms, source: Largest Wikipedias by article count
- **Wiki Stats** `wikistats` — Rankings & Platforms, source: Articles, edits, editors and admins for one language edition — read live from that wiki’s own API (MediaWiki siteinfo)

## A page (8)

*an article, a template, any wiki page — you name it, the wiki is a setting*

- **Article Pageviews** `pageviews` — Articles, source: 30-day pageview count for a Wikipedia article
- **Article Excerpt** `excerpt` — Articles, source ✧: The first paragraph, short description and lead image of a Wikipedia article (the REST summary API — every language, not just English)
- **Edit History** `edithistory` — Articles, source: Recent edits to an article, newest first, with byte deltas
- **Quality (ORES)** `quality` — Articles, source: Predicted quality class for an article (Lift Wing / ORES)
- **WikiProject Assess.** `assessments` — Articles, source: Quality + importance ratings from WikiProject banners
- **Article List** `articleList` — Content & Embeds, source: Clickable list of articles — pasted titles, optional thumbnails + intros
- **Wiki Page** `wikiPage` — Content & Embeds, display ⚡: Embed a MediaWiki page (desktop or mobile) — or any embeddable URL, e.g. an Objectium 3D model
- **Wikipedia Box** `wikiBox` — Content & Embeds, display ✧: Render a Wikipedia page or a template faithfully — the Main Page boxes (In the news, Did you know, On this day, Today’s featured article, Picture of …

## A Commons category (2)

*any category, walked live*

- **Category Size** `categorySize` — Categories & GLAM, source: File/page count for a Commons or Wikipedia category
- **GLAM Usage (live)** `glamorgan` — Categories & GLAM, source: Impact stats for a Commons category: files, used files, pages, total views (GLAMorgan-style)

## A category in the CIM allow list (3)

*Commons Impact Metrics — precomputed, and only for ~1,775 registered primary categories*

- **CIM Snapshot** `cimStats` — Categories & GLAM, source ✧: Exact precomputed stats for one Commons category or one Commons file — files, used, wikis, pages, and the views of the pages that use them
- **CIM Views / time** `cimTrend` — Categories & GLAM, source ✧: Monthly pageview trend over a window you choose — the pages using a Commons category, or one Commons file
- **CIM Top-N** `cimRanking` — Categories & GLAM, source ✧: Ranked rows for one month — the top files, wikis, pages or editors of a CIM category, or the most-viewed categories on Commons

## Files & media (5)

*a file, a list of files, or a category/article that yields them*

- **Gallery** `gallery` — Files & Media, display ✧: Images from one source — an article, a Commons gallery page, a wiki category, or a list of files. Grid or list, grouped, ordered, clickable into a ne…
- **File Usage by Wiki** `fileUsage` — Files & Media, source: How many wikis use a Commons file, with top breakdown
- **Media Player** `mediaPlayer` — Files & Media, source: Play video or audio — Commons files, or any direct media URL such as an archive.org/download/… file (playlist with next/prev, loop, shuffle)
- **360° Panorama** `panorama360` — Files & Media, source: Interactive 360° panorama from a Commons equirectangular file
- **Document Reader** `documentReader` — Files & Media, source ✧: Read a PDF or DjVu, page by page, straight from the wiki that hosts it — turn, zoom, jump to a page, facing pages, and a link to the original. Where …

## A URL, a domain or an archive item (4)

*something that lives elsewhere: a site, a domain, an archive.org identifier*

- **Wayback Gallery** `waybackGallery` — Web & History, source 🔌 α: Screenshot tiles of a website across history — one Wayback capture per requested date. Experimental: depends on the Wayback Machine backend health; f…
- **External Link Count** `linkcount` — Rankings & Platforms, source: Count pages linking to a domain on Wikipedia
- **IA Item Stats** `iaItem` — Web & History, source ✧: An Internet Archive item by identifier — title, creator, year, collection, file count and size, all-time + 30-day + 7-day views (IA engagement, updat…
- **IA Book** `iaBook` — Web & History, source ✧: A scanned Internet Archive book, page by page — turn, zoom to read, jump to a page, search inside it (with the matched words shown on the page), read…

## A query or a place (2)

*you write the query, or give a coordinate / QID / page title*

- **SPARQL Query** `sparql` — Queries & Power, source: Run any SPARQL query — Wikidata (WDQS) or Commons (QLever); big number, bars, table, trend, a timeline of dated events, or a map of the coordinates i…
- **Map** `map` — Content & Embeds, display ✧ ⇢ 🔌: A static map of a place — a coordinate, a Wikidata item, or a page title — drawn by Wikimedia's own map service at the card's own size, with our pin …

## Another card's output (3)

*a transformer, a reducer and a readout — useless until something publishes to them*

- **Filter Lines** `filterLines` — Dataflow, transformer ✧ ⇢ ⚡: Consume another widget's output and keep only the lines matching a pattern — downstream widgets see the filtered list
- **Line Count** `lineCount` — Dataflow, reducer ✧ ⇢ ⚡: Count the lines/elements of another widget's output — a number downstream widgets can consume ({{widget:id}} or a `source` picker)
- **Value Display** `echo` — Dataflow, display ✧ ⇢ ⚡: Show whatever another widget outputs (number, lines, JSON) — the debug/pipe endpoint of a dataflow chain; passes the value through

## How they relate

- **Board parameters** — Board Controls declares `params`; any config field may reference `{{name}}`, so one click re-aims every card that uses it.
- **16 publishers (✧)**: `qrCode` (value), `excerpt` (extract/value), `gallery` (lines/value), `cimStats` (value), `cimTrend` (value), `cimRanking` (lines), `wikiBox` (lines/value), `translate` (value/speech), `map` (geojson), `iaItem` (value), `iaBook` (value), `documentReader` (value), `listSource` (lines), `filterLines` (lines), `lineCount` (count), `echo` (value).
- **5 consumers (⇢)**: `speaker`, `map`, `filterLines`, `lineCount`, `echo` — a `source` field names a publisher; `{{widget:id}}` works in any text field.
- **Shipping chains**: Article Excerpt → Translator → Speaker (text → language → voice) · Text List → Filter Lines → Line Count → Value Display (lines → a number) · Gallery → Media Player / Article List (files and lines → a card).
- The CIM row is a **gate, not a topic**: those nine widgets only answer for a category from the Commons Impact Metrics allow list (~1,775 registered primary categories; additions go through a Phabricator request). `glamorgan` next to them walks any category live — slower, but nobody's list has to contain it.

Regenerate with `npm run map:widgets` (adds the PDF/PNG through the repo's Playwright; `--svg` writes just the vector).
