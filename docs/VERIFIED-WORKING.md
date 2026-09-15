# Verified working — a dated record

What has actually been smoke-tested in a browser, when, and against which live asset. This is a **record**,
kept because the failures it documents are the ones that recur (a silently-ignored prop, a widget that
renders an empty frame instead of an error). The README carries only the current headline; this carries the
evidence.

Re-run the checks with `npm test`, `npm run smoke`, `npm run smoke:panels` and `npm run test:browsers`
(see [BROWSER-TESTING.md](BROWSER-TESTING.md)), and the cross-doc consistency gates with
`node scripts/docs-facts.mjs`.

Back to the [README](../README.md).

## Trend chart Y-axis + scale toggle (ISSUE-64, 2026-09-10 — GitHub #42)

- ✅ **TrendCard Y-axis ticks + gridlines:** Article Pageviews (trend mode) and
  CIM Views Over Time previously rendered a min–max normalized sparkline with
  zero Y information — a 50→55 series looked identical to a 5M→5.5M series.
  Now: 3 gridlines + tick labels (top = max, mid = (min+max)/2, bottom = min),
  exact values on hover ("latest 10,089 · min 7,747 · max 12,310"), labels
  hidden on very narrow cards via container query. Scale is deliberately
  min–max (NOT zero-based — a zero baseline would flatten pageview series);
  shared helpers in `src/lib/format.js` (`compactNum` + `trendYScale`, also
  used by CIM File Traffic). Constitution: `tests/trend-axis.test.mjs`.
- ✅ **Y-scale toggle:** ⚙ **"Y axis starts at 0"** on both widgets — zero-based
  (honest magnitude: Einstein reads `12K / 6K / 0` instead of `12K / 10K / 8K`)
  vs the default min–max view. Persists, exports, and round-trips like any
  config field.
- ✅ **Ask board assembly (ISSUE-44 Phase 3a, 2026-09-09):** 🧩 Whole board mode
  — describe a multi-widget need, get a complete wired board (params block +
  widgets + `{{param}}`/`{{widget:id}}` wiring) added **below** the current
  board with one-click Undo. See `docs/ISSUES.md` → ISSUE-44 Phase 3a and
  PR #40.

## GLAM & CIM — impact metrics (2026-08-13 → 09-08)

- ✅ **GLAM view-budget + 429-resilience fix (2026-09-08, verified live):** the 📈 widget's
  monthly pageview budget rose 150 → **2,000 pages** — the old top-150-by-weight cut was
  arbitrary (nearly every page has weight 1) and silently dropped high-traffic single-file
  pages: `Media from MIT OpenCourseWare` 2026-05 showed 495,949 views while the true total
  was 1,375,031 (GLAMorgan: 1,386,218 — 64% silently missing, Economy of India's 101,789
  views among the skipped). Live-verified after deploy: **1,375,031 / 158 files viewed — exact**.
  The partial state is quantified (`views partial (N of M pages)`; Total views stat marked
  `partial`) and rate-limited (429) fetches are now retried, with `· N pages failed` on the
  card if any view fetch still fails — never silently zeroed. Self-walk fallback `gulimit`
  also raised 100 → 500 (the Action API max)

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

## Galleries, media & lists (2026-08-13 → 09-01)

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
- ✅ **Article Gallery show-all / grouping (2026-09-05, GitHub issue #3):** three new ⚙ options — **All images** (`includeAll`, default off: legacy captioned-only behavior unchanged) also shows caption-less `<gallery>` blocks and table lists (e.g. List of presidents of Harvard University: 1 → 30 images); **Hide decorative** (`hideDecorative`, default on, only with All images) drops caption-less flags/coats of arms/escudos/seals/emblems/logos/icons/locator maps/placeholders via a conservative filename heuristic verified against 12 real pages (zero content false positives; captioned files never filtered; disable to show everything); **Group by** (`groupBy`: none | section | gallery) renders group headers — section mode labels groups with real article headings via one `prop=tocdata` call ("Section: Childhood, youth and education"), gallery mode sets each `<gallery>` block off as its own "Gallery N" group. Empty state no longer claims "No captioned images found" in all-images mode; caption-less tiles show their file name; autoHeight accounts for group headers. minSize floor + batched imageinfo unchanged. Verified live end-to-end (Harvard / National Gallery London / Einstein).

## Article intelligence & power widgets (2026-08-13)

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
- ✅ **SPARQL label resolution (2026-09-05, issue #6):** 🧠 QLever can't run `SERVICE
  wikibase:label` (it federates to a dead host), so QLever queries returned bare QIDs —
  every SPARQL result cell whose binding was a Wikidata entity URI now renders
  **"Label (QID)"** (e.g. `road (Q34442)`), batch-resolved via `wbgetentities`
  (≤ 50 ids/call, 24 h TTL, user-language-first with `en` fallback, best-effort — a label
  failure never fails the query). Works for any endpoint and any user query; vars with a
  `?xLabel` sibling (WDQS SERVICE convention) are left as bare QIDs
- ✅ **SPARQL Query (2026-08-13):** 🧠 verified live — Met collection depth 72,433 (StatCard); multi-institution bars (Met > Rijksmuseum > British Museum > Smithsonian); Women-in-Red **20.13%** via Humaniki (its bias_labels are authoritative — hardcoded QIDs give a wrong 79.7%); Commons top-depicts via QLever (25 bars, prefix block required); multi-column → table; bad query → themed error + Retry; preset select fills query+endpoint atomically; renderer override forces stat/bar/line/table
- ✅ **Wiki Page (2026-08-13):** 📄 static iframe embed — Wikimedia sends no X-Frame-Options / frame-ancestors (verified), so pages embed directly; desktop + mobile toggle (`?useformat=mobile` — MobileFrontend's preview param; the m. subdomains are retired and 301 to desktop, verified), section anchors, links browse inside the widget; verified live in browser (Help:Introduction desktop + mobile render, Albert_Einstein#Biography URL)

## Ask advisor, presentation chrome & grid (2026-08-15 → 16)

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

## Output & AI nodes + request supersede (2026-09-05 → 09-09)

- ✅ **Speaker widget (🔊, PR #17):** the first *output* widget — speaks its
  resolved text via the Web Speech API. Safety-first: nothing speaks until ▶ is
  clicked once on the widget; `speakOnChange` (default off) only auto-speaks
  after that; a controller-global 🔊 mute writes a shareable `audioMuted` board
  param; one voice at a time (cancel-before-speak), rate clamped [0.5, 2].
  Zero-voice engines render a "No voice on this device" state with the text
  still shown — never an error. Verified live: 181-voice picker (macOS
  Chromium), degraded state on headless probes
- ✅ **Translator (MinT) widget (🌐, PR #21):** machine-translates its text
  (typed or `{{param}}`-driven) via Wikimedia MinT — **key-free, no proxy**
  (CORS `*` verified). 200+ languages on open NMT models, source/target codes,
  8,000-char cap flagged in the card, 24 h TTL cache, serving model surfaced
  for transparency. Verified live: EN → *"El jazz es un género musical que se
  originó en Nueva Orleans."* (`ES · nllb200-600M`)
- ✅ **Request-serial guard (ISSUE-57, PR #24):** `WidgetFrame.load()` claims a
  sequence number per run; a superseded success or failure returns before
  touching state, and unmount invalidates in-flight loads — a slow fetch under
  an old config/param can no longer clobber a newer result. Verified with a
  controlled race probe (first response delayed 15 s): with the guard the fresh
  result survives; with the guard removed the stale response wins
- ✅ **Article Excerpt emitter + unresolved-reference guard (ISSUE-58, 2026-09-09):**
  the excerpt card emits its first paragraph, so `text: "{{widget:<excerpt-id>}}"`
  feeds a Translator (verified live: EN extract → *"Albert Einstein fue un físico
  teórico nacido en Alemania…"*), Speaker or Markdown; changing the excerpt's
  article (e.g. via a board param) re-emits and the consumer re-fetches
  automatically. A widget that **fetches** now refuses to send an unresolved
  `{{widget:id}}`/`{{param}}` placeholder upstream — it shows a **"Waiting for a
  reference"** card and loads once the producer emits (verified: zero MinT/REST
  requests while unresolved). ⚙ lists the emitters as clickable
  `{{widget:<id>}}` chips under text fields (language-code fields opt out)
- ✅ **Board Controls per-card param scoping (ISSUE-59, 2026-09-09):** ⚙ → *Params
  on this card* checkboxes scope a card to a subset of the board's params
  (none checked = all). Verified live on the 4-widget board: an article-only
  card and a language-only card, chain Einstein → excerpt → `EN → FR`, then
  clicking **de** on the language card re-translates to `EN → DE`

## Demo suite, guide & resilience (2026-09-09)

- ✅ **Demo suite + hub (ISSUE-63):** 8 boards + **`?config=/demos.json`** — a hub whose Markdown index links every board in place. Onboarding: **Article switcher** (one param, two cards), translate, params, flow. Flagships: **GLAM — one template, five CIM-registered institutions** (Met 389k · LoC 631k · BHL 306k · NGA 54k · Rijksmuseum 6.9k files, collection + month switching), **Article vitals** (summary · traffic · ORES quality · WikiProject assessments · edits · images), **Query power** (WDQS + Humaniki + QLever). Extras: embed, full catalog. Constitution: `tests/demos.test.mjs` — every board validates, ids unique, **every `{{widget:id}}`/`{{param}}` resolves inside its board**, hub links exist, markdown link safety. All 10 boards verified live with 0 widget errors
- ✅ **Custom-URL embed (ISSUE-62):** a Wiki Page card can frame any http(s) page — http(s) only, bare domains get `https://`, unsafe schemes rejected with a visible error, external frames **sandboxed** (Wikimedia pages unchanged). Objectium GLB demo verified live
- ✅ **Rate-limit guards (ISSUE-61):** a shared HTTP layer caps concurrency at 4, paces after any 429, honors `Retry-After` as a global cool-down, retries a 429 at most once, and fails with an actionable message — a throttled IP backs off instead of hammering
- ✅ **User guide (ISSUE-60):** `docs/GUIDE.md` — the three-layer model (board params / widget config / dataflow), worked examples, troubleshooting, cookbook; linked from the README and the in-app ⓘ panel. Config URLs that return HTML or 404 now say so instead of "Unexpected token '<'"
- ✅ **Ask advisor manifest v3:** generated catalog with dataflow metadata + a system manual; `npm test` regenerates it first so it can't drift from the registry

## Constitutions, config loading & plumbing

- ✅ **Freshness constitution (2026-08-14):** all 26 live-querying widgets stamp their last-run time — `⏱ updated 10:17:27 AM · auto-refresh 1h` footer on every fetch widget (updates on every load incl. auto-refresh); verified live on the sample dashboard (26 stamped, markdown + Wiki Page exempt, 0 errors)
- ✅ **Panel reachability (ISSUE-54, 2026-09-09):** ⚙ config and ⓘ info panels
  scroll inside their card and pin their action (`Apply & Reload` / `Copy debug
  info`) to the bottom — previously a panel taller than its card was clipped by
  `.grid-item { overflow: hidden }` with no scrollbar, hiding the button and
  every field below the fold (21/35 widget types at the fresh-add w3 h3 size,
  25/35 at 1024px, 27/35 at 820px). The long "Name (instance id)" hint (7 lines
  on a 3-column card, 67–93px per panel) is now one line with a tooltip.
  Constitution: `npm run smoke:panels` — 240 measurements (⚙+ⓘ × 1440/1024/600
  × 40 widgets at w3 h3, offline), exit 1 on any clipped action; negative-tested
  against the pre-fix CSS. Wired into `npm run smoke`
- ✅ **All 30 data-driven widget types render live data in the browser; the 9
  static ones (Text/Markdown, QR Code, Board Controls, Speaker, Wiki Page,
  Text List, Filter Lines, Line Count, Value Display) render from config — no fetch**
- ✅ On-wiki config loading: `?config=…Commons:WikiPortraits/Bento-demo.json` → the whole board loads from an on-wiki page (its size tracks that page, not this repo)
- ✅ URL loading: `?config=/dashboard.json` (hosted), `#/d/<base64>` hash links (Share roundtrip), error banner + fallback on bad URLs
- ✅ w.wiki short URLs: `?config=https://w.wiki/TR9R` and bare `w.wiki/TR9R`
  expand via the same-origin `/api/resolve` endpoint and load the dashboard
- ✅ Export → Import roundtrip, validation errors shown for bad JSON, Example, About, Reset, localStorage persistence
- ✅ Production build: ~0.6 MB raw / ~175 KB gzipped (Vite output — exact byte
  counts change with every source change, so `npm run build` prints them and the
  docs-facts constitution bound-checks the magnitude)

## The starter board, re-verified (2026-08-12)

- ✅ Main Page pageviews: 218.4M views / 30 days (~7.28M/day)
- ✅ External links: 1,499 → LibreTexts.org; 2,850 all-namespaces / **2,320 articles-only** → gettyimages.com; 5,000+ cap indicator on youtube.com
- ✅ Top 10 Wikipedias: English 1st at 7,223,053 articles
- ✅ Category Size (WLM 2024): 239,084 items + random photo sample (6 thumbs, fresh per refresh)
- ✅ File Usage Map: image + summary caption (Blue Marble, 500px thumb)
- ✅ Text/Markdown card: markdown rendering verified (headings/bold/links/lists/code);
  Wikimedia images render by default, external hosts blocked with an opt-in toggle,
  XSS payloads (`<script>`, `onerror`) inert

- ✅ **2026-09-15 — IA Book** (`node scripts/ia-book-e2e.mjs`, 19/19): the page image **loaded**
  (`naturalWidth > 0`), not merely referenced; "page 1 of 16" comes from the manifest although the item
  metadata says `imagecount: 20`; the src is a IIIF image-service URL, never a hand-built `$N`; page
  turning moves the counter; the 15-thumbnail strip renders and its images load; search-inside ("goody")
  returns **22 hits**, each naming its page, and clicking one jumps the counter *and* loads the word's
  region crop; the OCR panel returns **1,849 chars** for that page; PDF/EPUB/OCR/DjVu links point at
  `archive.org/download`. Negatives: a page-less text item explains itself instead of showing an empty
  viewer, a bad identifier gives a friendly message, and there are no uncaught JS errors (the only console
  errors are the two statuses those fixtures exist to produce — 400 for the missing item, 500 for the item
  whose manifest 500s).

- ✅ **2026-09-15 — Internet Archive playback in a card** (10/10 assertions, demo board): the 11-minute
  Prelinger film reached `readyState ≥ 1` with **duration 664 s** and advanced to **1.37 s** on `play()`
  (`paused: false`), and a three-chapter LibriVox playlist did the same at **507 s / 1.54 s**. Both stream
  from `archive.org/download/` with no API call — a direct URL is the row — and the archive's Range
  responses (`206`, `content-range`) are why seeking works. Also confirmed there: the codec trap, that
  Chromium says `"probably"` for H.264 mp4 and `""` for Theora ogv, so the mp4 derivative is the one to
  offer first (`docs/INTERNET-ARCHIVE.md`).

- ✅ **2026-09-15 — PNG export of a book page** (ISSUE-80, part of the `smoke:iabook` run):
  the ⤓ menu offers **PNG** for the IA Book card with the reason "this widget's image host sends CORS, so
  the canvas stays clean", and clicking it downloads a real raster — **4,384,386 bytes**, a 2× PNG of the
  page (the previous behaviour was a disabled item and the old "this widget is HTML/CSS" tooltip).

- ✅ **2026-09-15 — facing pages, and right-to-left** (`npm run smoke:iabook`, 31 assertions): a spread
  renders two loaded page images, the counter reads "**pages 2–3 of 16**" in reading order, the earlier page
  is on the **left** in a left-to-right book, the strip highlights both leaves, **▶ advances a spread at a
  time (2 → 4)**, the shift control re-pairs the first leaf ("page 1" → "pages 1–2"), and — the assertion
  worth the whole run — on the Arabic scan `DarsENizami_DarjaAula_1stYear` (389 canvases,
  `viewingDirection: right-to-left`) the **later page sits on the left** ("Page 2 | Page 1") while the
  counter still reads "pages 1–2 of 389". Leaf 0 stands alone on both books until you advance.

- ✅ **2026-09-15 — the deploy, verified against production** (10/10, at
  `https://wikibento.toolforge.org/`, serving `index-D9YNjKJA.js`): the showcase catalog renders **41 cards
  with zero crashes**; `/internet-archive-demo.json` opens **both books in facing-pages mode** (the board
  sets it) and shows a facing pair with both page images loaded, and its film player reports
  `duration 664s`; `/anne-frank-mlk-demo.json` draws **21 timeline dots**; the older
  `/parallel-lives-demo.json` still renders; the front door loads a board; **no uncaught JS errors** on any
  board. Endpoints: `/api/resolve` 200, `/api/proxy` relaying to top.hatnote.com 200.

- 📏 **Measured, not a fixture** (`EB1926 - Supplement Volume 3.pdf`, 1,208 pages, 285 MB, transcribed on
  en.wikisource): a page render costs ~5 s on first request, and **every** page of the volume sits at quality
  level 1, "Not proofread" — bulk-imported OCR, never human-checked. That measurement is why the panel prints
  the grade, and why the demo uses something a hundred times smaller.
- ✅ **2026-09-15 — the Document Reader** (`npm run smoke:document`, **24 assertions**, real Commons files):
  a 2-page PDF reports "page 1 of 2" from `imageinfo` and renders a page on the API's host; typing **2** jumps
  and loads page 2; typing **999** **clamps** to page 2 (the server does the same: page 189 of 188 returns
  188); a 329-page book reports its count and reaches page 329 by number; the zoom ladder **stops at 960 px**
  and `+` disables there; a **DjVu** behaves identically *given as a URL*, its last page (96) renders, and it
  reads as facing pages ("pages 2–3 of 96") with the strip highlighting both; the header reads "96 pages ·
  DjVu · 17.6 MB · 1024×730 page"; the links go to the file page and to the original; **PNG export is
  offered** (Wikimedia page renders send CORS); a JPEG is refused politely, with its way out. Demo board:
  4 cards (329 / 96 / 16 pages), two showing facing pairs — **9 assertions**.

- ✅ **2026-09-15 — the Document Reader deploy, verified against production** (14/14, serving
  `index-YJ87Jsl0.js`): `/document-reader-demo.json` renders 4 cards whose documents report **329 / 96 / 16
  pages**, and the DjVu reaches **page 96 of 96** in production; the showcase catalog renders **42 cards**
  (including the new Document Reader) with zero crashes; `/internet-archive-demo.json` still opens its books
  as facing pages; `/anne-frank-mlk-demo.json` still draws 21 timeline dots; `/api/resolve` and `/api/proxy`
  both 200; the front door loads a board; **no uncaught JS errors**.

- ✅ **2026-09-15 — the Wikisource text layer (v1.1)** (the fixture is deliberately small — a **38-page, 0.89 MB**
  DjVu, not the 285 MB reference set the traps were found on): a work with a transcription reports "page 1 of
  38" and grows a **¶ button**; a DjVu with **no** transcription has none; pressing it on page 19 shows
  **1,458 characters** of readable text under **"en.wikisource · Validated"**, linking to
  `…/wiki/Page:%22Homo_Sum%22_…_anthropologist.djvu/19`; **no raw markup** survives — an assertion that, run
  against a full 10 KB page, caught a wikitable that the trimmed unit fixtures had missed, and that
  templates were being expanded after tables.
