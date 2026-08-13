# Data Sources Reference

All fetchers live in `src/widgets/dataSources.js`. Every endpoint used is
**CORS-enabled** — that's why the app needs no proxy. All requests run from the browser,
so Wikimedia API etiquette is enforced by the browser's own User-Agent (the
`User-Agent` header set in code is stripped by browsers — see ARCHITECTURE.md #10).

Base URLs:

| Service | URL |
|---|---|
| MediaWiki Action API (enwiki) | `https://en.wikipedia.org/w/api.php` |
| MediaWiki Action API (Commons) | `https://commons.wikimedia.org/w/api.php` |
| RESTBase Pageviews | `https://wikimedia.org/api/rest_v1/` |
| Wikistats (s23) | `https://wikistats.wmcloud.org/api.php` |

---

## 1. Article Pageviews — RESTBase

**Widget:** Article Pageviews · **Fetcher:** `fetchPageviews(article, project)`

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/all-access/user/{article}/daily/{start}/{end}
```

- `start`/`end` are `YYYYMMDD00` timestamps; the code fetches the last 30 days
  (`daysAgo(30)` → `daysAgo(0)`).
- Access type is fixed to `user` (agent `user` is also available — `all-access` counts
  crawlers/spiders).
- Returns `{ total, avg, latest, trend: [{date, views}], article }`.
- **Gotchas:**
  - RESTBase returns **HTTP 404** for articles with no data in range (rare for popular
    articles; the error shows in the widget with a Retry button).
  - Article names are URL-encoded, so `Main_Page` (underscores) is the safe form.
  - Data availability lags ~1 day (granularity is daily).

**Verified:** Main Page = 218,350,915 views over 30 days (~7.28M/day) — 2026-08-12.

---

## 2. External Link Count — MediaWiki API `exturlusage`

**Widget:** External Link Count · **Fetcher:** `fetchExternalLinks(domain, wiki)`

```
GET https://{wiki}.org/w/api.php?action=query&list=exturlusage&euquery={domain}&eulimit=500&euprotocol=https&format=json&origin=*
```

- Counts pages linking to a domain via `exturlusage`, paginated with `eucontinue`.
- **The 500/request clamp:** MediaWiki clamps `eulimit` to **500** for non-bot users
  (verified: `eulimit=5000` returns 500 with the warning *"must be between 1 and
  500"*). Special:LinkSearch's 5000-display is internal pagination of 500s — the
  fetcher does the same: up to **10 pages = 5,000 results**, matching that cap.
  Larger domains return `totalExact: false` and the UI shows "(5,000+ total)".
- **Namespace filtering:** optional `eunamespace` (pipe-separated list, e.g. `0` =
  article space, `0|1` = articles + talk). The widget exposes All / Articles only /
  Articles + Talk / Files / Templates / Categories. Verified: gettyimages.com =
  2,850 links all-namespaces vs **2,320 in article space** (2026-08-12).
- For **exact** counts beyond 5,000, use the enwiki database replica
  (`externallinks` table, `el_to_domain_index` prefix LIKE — see the
  el-to-domain-index gotcha note) — server-side only (see SCALABILITY.md).
- Returns `{ total, totalExact, domain, wiki }`.
- **Gotchas:**
  - `euquery` matches domain suffixes, so `Libretexts.org` also matches
    `LibreTexts.org/books/...` — this is a link count, not a unique-domain count.
  - `euprotocol=https` only; http-only links are excluded.
  - Counting is done by walking pages, not by a count API — expensive for big domains
    (3 API calls per refresh).

**Verified:** LibreTexts.org = 1,499 pages (3 pages × 500 − 1) — 2026-08-12.

---

## 3. Category Size — MediaWiki API `categoryinfo`

**Widget:** Category Size · **Fetcher:** `fetchCategorySize(category, wiki)`

```
GET https://{wiki}.org/w/api.php?action=query&prop=categoryinfo&titles=Category:{name}&format=json&origin=*
```

- One call returns `pages`, `files`, `subcats` for the category.
- Default wiki is `commons.wikimedia`; enwiki is selectable.
- Returns `{ pages, files, subcats, total, category }`.
- **Gotchas:**
  - The fetcher prefixes `Category:` and strips any user-typed prefix, so both
    `Foo` and `Category:Foo` work.
  - The subtitle now comes from `config.wiki` ("on Wikimedia Commons" vs
    "on {wiki}") — no files-based heuristic (was ARCHITECTURE #2, fixed).
  - `categoryinfo` counts only direct members, not subcategory contents.

**Verified:** "Images from Wiki Loves Monuments 2024" = 239,084 (239,022 files,
0 pages, 62 subcats) — 2026-08-12.

---

## 4. Wiki Stats — Wikistats (s23) CSV API

**Widgets:** Wiki Stats · Top 10 Wikipedias · **Fetcher:** `fetchWikistats(table, lang)`

```
GET https://wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv
```

- `action=dump&format=csv` returns a full CSV of the table (the dump action doesn't
  support JSON — hence the CSV parsing).
- Tables: `wikipedias`, `wiktionaries`, `wikisources` (selectable); the full dump is
  **333 rows** for Wikipedias.
- `lang` filter: returns the single matching row (e.g. `en`).
- No `lang`: returns `{ rows: top10byGood, table }` — sorted by the `good` column
  (article count) and sliced to 10.
- Row fields include `lang`, `good` (articles), `total`, `edits`, `users`, `date`, etc.
- **Gotchas:**
  - **Naive CSV parse:** splits on `,` with no quoted-field handling (ARCHITECTURE #5).
    Works for the current s23 format — verify if the upstream format changes.
  - The full dump is ~50 KB and is re-fetched on every refresh of either widget; with
    both Wiki Stats and Top 10 on the dashboard, it's fetched twice per refresh cycle.
    A shared cache is the v2 fix.
  - `lang` column values are 2-letter codes (`en`), not `en.wikipedia`.

**Verified:** 333 Wikipedias parsed; English #1 at 7,223,053 articles — 2026-08-12.

---

## 5. File Usage Map — Commons API `globalusage`

**Widget:** File Usage Map · **Fetcher:** `fetchFileUsage(filename, topN)`

```
GET https://commons.wikimedia.org/w/api.php?action=query&prop=globalusage|imageinfo&titles=File:{name}&gulimit=500&iiprop=url|size|extmetadata&iiurlwidth=480&format=json&origin=*
```

- Returns every wiki page embedding the file, aggregated per wiki and sliced to `topN`.
- Returns `{ totalWikis, totalUsages, top: [{wiki, count}], filename, image }` where
  `image` = `{ url (480px thumburl), description (HTML-stripped ImageDescription), license }`.
  The widget renders `image.url` and `description` when "Show image" / "Show caption"
  are enabled (both default on/off respectively; `showImage` defaults on for new and
  existing dashboards since it costs nothing extra — `imageinfo` rides the same call).
- **Gotchas:**
  - `gulimit=500` — files used in more than 500 pages report a partial `totalUsages`
    (the per-wiki slice is still accurate for the pages returned).
  - Requires the `File:` prefix in the stored name (default `Example.jpg` — change it;
    it's only a placeholder). The fetcher strips any user-typed `File:` prefix, so
    both `Foo.jpg` and `File:Foo.jpg` work.

---

## 6. GLAM Category Usage — Commons API + WMF pageviews (GLAMorgan-style)

**Widget:** GLAM Category Usage · **Fetcher:** `fetchGlamStats(cfg)`

Replicates GLAMorgan's computation browser-native, in four bounded stages
(details + review: [GLAMORGAN-WIDGET.md](GLAMORGAN-WIDGET.md)):

1. **Category walk** — `list=categorymembers&cmtype=file|subcat` iterated per
   depth level (0–12), collecting file titles until a **file budget** (default
   500, max 1,000). `negcats`/`negdepth` build an exclusion set. PetScan is
   deliberately NOT used: it ignores the `max` cap and returns multi-10MB
   responses for large trees.
2. **Global usage** — `prop=globalusage` in multi-title batches (50 titles),
   `gulimit=100`, with **length-aware chunking** (long filenames blow the ~8KB
   GET URL limit — HTTP 414). ⚠️ The API's usage entries carry **no `ns`
   field** (verified; GLAMorgan gets `ns` from PetScan's giu), so article-space
   filtering uses a URL-path namespace heuristic (Talk:/User:/File:/Template:/
   … excluded; localized namespace names like Diskussion: are conservatively
   counted as articles).
3. **Pageviews** — `per-article/{project}/all-access/user/{page}/monthly/…`
   for distinct using pages, **capped at 150 pages** (weight = pages-per-file),
   6 concurrent. Beyond that, totals are labeled "views partial".
4. **Aggregates** — per file: Σ views of its using pages → Files in category ·
   Files viewed (of N used) · Pages using files (on M wikis) · Total views.
   Top-N filmstrip (thumbnail via one batched `imageinfo&iiurlwidth=120` call)
   and top-file per-page detail table.

Month/year default to the previous calendar month; pageview data starts
2015-08.

**Alternative — Commons Impact Metrics (precomputed):** for **allow-listed**
categories (GLAM/campaign categories registered via `{{Views from category}}`,
processed monthly), the official AQS API
(`…/api/rest_v1/metrics/commons-analytics/category-metrics-snapshot/…`) returns
the same headline stats instantly, exactly, and at 1M-file scale. Unregistered
categories 404 with *"the category you asked for is not loaded yet"* — that's
the registration check, not an error. Planned pattern: try CIM first, fall
back to this live fetcher on 404 (ROADMAP Phase 1.5).

## 8. Top Wikipedia Articles — top.hatnote.com + WMF fallback

**Widget:** Top Wikipedia Articles · **Fetcher:** `fetchTopPages(cfg)`

- **Primary:** `https://top.hatnote.com/{lang}/wikipedia/{year}/{month}/{day}.json`
  — per-day top-100 JSON (month/day **not zero-padded**; data updated ~02:00 UTC).
  Fields: `articles[]` (`title`, `rank`, `views`/`pviews`, `views_short`,
  `history`, `streak_len`, `summary`, `image_url`), `formatted_date`,
  `full_lang`, `total_traffic[_short]`, `permalink`.
- **CORS gotcha:** top.hatnote.com sends **no CORS headers** — browsers can't
  fetch it directly. The Toolforge deployment fetches via the same-origin
  `/api/proxy?url=` endpoint (deploy/server.js, wraps `{status, body}` with
  `ACAO: *`). See also `/api/resolve` (w.wiki).
- **Fallback:** `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{y}/{mm}/{dd}`
  (zero-padded, CORS-enabled, top 1000) — used when the proxy is unavailable
  (plain static hosts) or the language isn't among hatnote's 28; the widget
  subtitle marks "via WMF Pageviews API".
- **Date handling:** `dateMode: 'latest'` steps back up to 14 days from today
  (UTC) until a day exists; `dateMode: 'date'` uses year/month/day and steps
  back up to 7 days (weekends/current-day gaps).
- **Noise filter (default on):** `filterNoise` drops sponsored TLD/spam pages
  (`^\.` dot-TLDs like `.xxx`/`.xyz`, `x{3,4}` variants like `XXX (beer)`).
  Today's data literally has `.xxx` at rank #1 — the filter is why the list
  starts at rank 2. The subtitle reports how many were filtered.
- **Expanded view:** when `showExpanded` is on, each row is enriched with a
  120px thumbnail + intro via the CORS-enabled MediaWiki Action API
  (`prop=pageimages|extracts&piprop=thumbnail&pithumbsize=120&exintro&explaintext&exchars=300`,
  batched 50 titles/call with `origin=*`). Non-article helper pages
  (`Main_Page`, `Special:*`, `Wikipedia:*`, `Talk:*`…) are filtered out of
  both sources (pattern from the Wiki-Top-100 project).
- **Languages:** hatnote covers 28 (en, de, fr, ko, et, sv, hu, da, it, pa, ca,
  es, fa, ur, zh, kn, no, bn, id, ta, lv, el, fi, ar, cs, or, te, gl).
- **Verified:** en 2026-08-11 — rank 1 `.xxx` (sponsored TLD), rank 9 `.xyz`;
  top-10 after filtering; ko/ja/fr/de dates via both sources — 2026-08-12.

## 9. Article Excerpt — REST `/page/summary`

**Widget:** Article Excerpt · **Fetcher:** `fetchArticleSummary(article, project)`

- **Endpoint:** `https://{project}.org/api/rest_v1/page/summary/{title}` —
  one call returns `title`, `description` (short desc), `extract` (first
  paragraph, plain text), `thumbnail.source`, `content_urls.desktop.page`.
- **CORS:** ✅ `Access-Control-Allow-Origin: *` (REST API — no `origin=` param needed).
- **Edge cases:** 404 → friendly "Article not found"; `type: 'disambiguation'`
  → the widget shows a notice instead of a misleading paragraph.
- **Verified:** Ada Lovelace 2026-08-13 (description "English mathematician
  (1815–1852)" + thumbnail + first paragraph).

## 10. Edit History — MediaWiki API `prop=revisions`

**Widget:** Edit History · **Fetcher:** `fetchEditHistory(article, project, limit)`

- **Endpoint:** `action=query&prop=revisions&rvlimit={n}&rvprop=timestamp|user|comment|ids|size&rvdir=older&origin=*`
  — newest-first revision list (`rvdir=older` = latest first).
- **Byte deltas:** computed client-side as `size[i] − size[i+1]` (page size at
  each revision); the oldest shown row has no delta (marked `·`).
- **Limits:** `rvlimit` max 50 per call for normal users; the widget caps at 50.
- **CORS:** `origin=*` (standard Action API pattern).
- **Verified:** Albert Einstein 2026-08-13 — +4/−70/−2/… rows with user links
  to `Special:Contributions` and local times.

## 11. Article Quality — Lift Wing (api.wikimedia.org)

**Widget:** Article Quality (ORES) · **Fetcher:** `fetchArticleQuality(article, project)`

- **Two-step fetch:** 1) resolve the latest revision id via
  `prop=revisions&rvlimit=1&rvprop=ids` (with `origin=*`); 2) score it.
- **Primary model:** `POST https://api.wikimedia.org/service/lw/inference/v1/models/{wiki}-articlequality:predict`
  body `{"rev_id": N}` — the frozen Revscoring/ORES model: prediction
  FA/GA/B/C/Start/Stub + per-class probabilities. Response envelope:
  `{wiki}.scores.{revid}.articlequality.score.{prediction, probability}`.
- **Fallback:** `POST …/models/articlequality:predict` body
  `{"rev_id": N, "lang": "en"}` — modern continuous 0–1 score (used when the
  wiki has no revscoring model).
- **CORS:** api.wikimedia.org **reflects the requesting origin** (not `*`) —
  works from wikibento.toolforge.org and localhost; preflight allows POST +
  `Content-Type: application/json`. No auth needed at dashboard scale
  (50k req/hr anonymous, 15 req/s).
- **No prediction cache on Lift Wing** — every call runs fresh inference; the
  widget's 1 h refresh is fine, but don't lower it aggressively.
- **Verified:** Albert Einstein → FA at 53.9% (GA 34.8%, B 8.4%, …), rev 1367582180 — 2026-08-13.

## 12. WikiProject Assessment — MediaWiki API `prop=pageassessments`

**Widget:** WikiProject Assessment · **Fetcher:** `fetchAssessments(article, project, topN)`

- **Endpoint:** `action=query&prop=pageassessments&palimit=500&origin=*` —
  returns every WikiProject banner's `{class, importance}` for the article
  (the PageAssessments extension; no DB tunnel needed for single-article
  lookups — the `wikimedia-page-assessment` skill's SQL path is for
  project-wide queries).
- **Coverage caveat:** the extension is only deployed on enwiki (best),
  zhwiki, trwiki, etc. — **not** on dewiki/frwiki/eswiki/ruwiki. Articles on
  those wikis render an empty state ("No WikiProject assessments found").
- **Sorting:** importance rank (Top > High > Mid > Low) then class rank
  (FA > FL > GA > …), then project name; `topN` (default 12, max 50) truncates
  with a "Top N of M WikiProjects" subtitle.
- **CORS:** `origin=*` (standard Action API pattern).
- **Verified:** Albert Einstein → 18 projects; Germany/History of Science/
  Physics/… all GA with Top/High/Mid/Low badges — 2026-08-13.

## 13. Article Gallery — REST `/page/media-list` + `imageinfo`

**Widget:** Article Gallery · **Fetcher:** `fetchArticleGallery(article, project, minSize, maxItems)`

- **Endpoint:** `https://{project}.org/api/rest_v1/page/media-list/{title}` —
  Parsoid's server-side media extraction: every media item with `type`
  (image/audio/video), `title`, `caption.html`, `srcset` (1x/2x thumb URLs),
  `section_id`, `leadImage`, `showInGallery`. One call, ~30–60 KB. **No
  wikitext parsing needed** — this IS MediaWiki's AST/Parsoid output (the
  `wikimedia-wikitext` skill's rule: don't parse wikitext when you don't need
  write-back).
- **CORS:** ✅ `Access-Control-Allow-Origin: *` (REST API).
- **Significance filter (verified 2026-08-13):** keep only `type=image` items
  WITH `caption` — caption-less items are exactly the noise: France's
  `Flag_of_France.svg` (infobox flag), EU/map SVGs, territorial-waters maps,
  government portraits. Then a batched `prop=imageinfo&iiprop=size|mime`
  (50 titles/call) drops images smaller than `minSize` (default 200 px) —
  catches remaining tiny icons/logos. Captioned SVGs (significant diagrams)
  survive the filter, as intended.
- **Gotchas:** `showInGallery` is NOT a useful filter — true for every image
  on 4 pages tested (only audio gets false). `srcset` URLs are
  protocol-relative with `utm_source/campaign/content` params — normalized
  to absolute https + stripped (see `cleanThumbUrl`). Captions are HTML with
  links → stripped to plain text (`stripHtml`) for the widget.
- **Display modes:** grid (small/medium/large via `iconSize`, CSS
  `auto-fill minmax(110/170/250px, 1fr)`) or list (90×60 thumb left, caption
  right, file name below). Grid thumbs are **square tiles**
  (`aspect-ratio: 1/1`) with `object-fit: contain` by default — the whole
  image is always visible, letterboxed against the tile background (no
  cropping of wide panoramas or tall portraits); `imageFit: 'cover'` opts
  back into square fill-crop.
- **Verified:** Albert Einstein → 32 captioned images (of 35 total); France →
  38 of 47 captioned — 2026-08-13.

## 14. 360° Panorama — Commons `imageinfo` + Pannellum

**Widget:** 360° Panorama Viewer · **Fetcher:** `fetchPanoramaFile(filename, project)`

- **Endpoint:** Action API `prop=imageinfo&iiprop=url|size|mime&iiurlwidth=4096`
  (`origin=*`) — resolves a Commons file to a **4096px-wide display copy**
  (aspect preserved) instead of the 10–20 MB original; also returns original
  URL, dimensions, mime.
- **360-ness check:** aspect ratio ≈ 2:1 (`|width/height − 2| < 0.03`) →
  `equirectangular: true`; the widget shows a "not 2:1" warning otherwise.
  Pannellum additionally auto-reads Google Photo Sphere GPano XMP at render
  time, so true photospheres without a 2:1 ratio still render.
- **Viewer:** Pannellum 2.5.7 (MIT, WebGL, ~21 KB gz) **vendored** at
  `src/vendor/pannellum.js` and lazy-loaded via `src/lib/pannellumLoader.js`
  (script injection of the `?url` asset — a separate 56 KB dist asset,
  fetched only when a panorama widget mounts; singleton across widgets).
  `viewer.resize()` is wired to a ResizeObserver so the WebGL canvas tracks
  widget resizes; `viewer.destroy()` on unmount/config change.
- **Why vendored + injected, not `import pannellum`:** the npm build is a
  window-assigning IIFE — rolldown fails with "Missing export"; loading it
  as a classic `<script>` (via Vite `?url`) sets `window.pannellum` reliably.
  ⚠️ Pannellum 2.5.7 rejects cross-origin `#config=` JSON in pannellum.htm;
  the JS API has no such restriction.
- **Layout constraints (new pattern):** registry entries can declare
  `defaultLayout: { w, h, minW, minH, maxW?, maxH? }` — App.jsx
  `handleAddWidget` passes them to react-grid-layout (minW/minH/maxW/maxH
  clamp resize/drag). The panorama defaults to w:4 h:3 with minW:3 minH:2
  (verified: drag-resize clamps at 253×310).
- **Verified:** Imiloa grounds 360 (12740×6370) renders + drag-rotates in the
  widget; File:Example.jpg correctly flags "not 2:1" — 2026-08-13.

## Wikimedia API Etiquette (applies to any future fetchers)

- Keep a descriptive User-Agent with contact info (the code's constant is
  `WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado)`).
- Batch queries instead of looping; the current fetchers already do this.
- Respect 429s — the Action API and RESTBase throttle aggressively. Widget
  auto-refresh (1–2 h defaults) is well within limits, but watch any new fetcher.
- For browser apps, add `origin=*` to Action API queries to unlock CORS.

## Adding a New Data Source

See [WIDGET-DEVELOPMENT.md](WIDGET-DEVELOPMENT.md) — the pattern is: write an
async fetcher returning `{ data }` or throwing, register it in `WIDGET_TYPES`,
describe it in the docs above, done.

## 15. Commons File Gallery — Commons API `imageinfo` (batched) **Widget:** Commons File Gallery · **Fetcher:** `fetchCommonsGallery(filesText)`
- **Input:** a textarea list of Commons files, one per line (`File:` prefix optional). Ordering is client-side in the transform — re-sorting never re-fetches.
- **Endpoint:** Action API `prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400&iiextmetadatafilter=ImageDescription` (`origin=*`) — 400px thumbs + dimensions + description caption. **Adaptive batching by encoded length (~4,500 chars/chunk), not by count** — long filenames (WLM) blow GET URLs (HTTP 414) otherwise.
- **Missing files:** counted (`missing` in the fetch result), surfaced in the subtitle ("3 files · 1 not found") — never fatal.
- **Order modes:** `listed` (input order) · `random` (Fisher–Yates shuffle, fresh each refresh) · `alpha` (title) · `largest` (width×height). `maxItems` clamps rows.
- **Gotcha (fixed 2026-08-13):** strip the `File:` prefix for normalization but **re-add it in the API `titles`** — without the prefix every title resolves as a missing main-namespace page.
- **Renderer:** reuses `GalleryGridCard` / `GalleryListCard` (same `{title, caption, thumbUrl, fileUrl}` row contract as the Article Gallery) — no new renderer code.

## 16. Article List — MediaWiki API `pageimages|extracts` (batched, optional) **Widget:** Article List · **Fetcher:** `fetchArticleList(articlesText, project, opts)`
- **Input:** a textarea list of article titles, one per line; `project` select (en/de/fr like the other article widgets).
- **Plain mode (no network):** rows are pure config → title + page URL, no fetch at all.
- **Enriched mode (`enrich: true`):** batched `prop=pageimages|extracts&piprop=thumbnail&pithumbsize=120&exintro&explaintext&exsentences=3` — 50 titles/call (the Top Pages expanded-view pattern); adds a 120px thumb + 3-sentence intro per row.
- **Gotcha (fixed 2026-08-13):** the API returns canonical titles **with spaces** even when queried with underscores — look up enrichment results by `p.title` as returned, not by the underscore form.
- **Renderer:** `ArticleListCard` (new, small) — clickable rows, optional thumb left + 3-line-clamped intro; rows link out to the project wiki in a new tab.

## 17. SPARQL Query — WDQS + QLever + Humaniki **Widget:** SPARQL Query · **Fetcher:** `fetchSparql(query, endpoint, maxRows)`
- **Endpoints (all CORS `*`, verified 2026-08-13):** WDQS `query.wikidata.org/sparql` · QLever `qlever.dev/api/wikimedia-commons` (Commons SDC — **requires explicit PREFIX declarations**; WDQS auto-registers wd:/wdt:/p:/ps:/pq:, QLever does not) · Humaniki `humaniki.wmcloud.org/api/v1/gender/gap/latest/gte_one_sitelink/properties` (precomputed gender gap — **not SPARQL**).
- **Transport:** GET for queries ≤ ~1,800 chars (WDQS GET URLs cap ~2,000), else **POST `application/x-www-form-urlencoded`** — a "simple" content type, so **no CORS preflight** (`application/sparql-query` would preflight). Always send `Accept: application/sparql-results+json` + `format=json`.
- **Parsing rules:** SPARQL JSON literals are **always strings** — coerce numerics via the `datatype` field (`…XMLSchema#integer|decimal|double|float|int|long|nonNegativeInteger|positiveInteger`); shorten entity URIs to IDs (`Q160236`, `M37200540`); return `{ vars, rows }`, never the raw bindings envelope.
- **Reliability:** 60 s timeout + one retry (WDQS SLO is 95%; live 502/504 seen); 10-min TTL cache keyed `endpoint::query` (a ↻ refresh inside the TTL returns cached — by design). 4xx fails fast — the widget shows a themed error + Retry. `Retry-After` honoring on 429 is a future enhancement (the shared retry helper doesn't read it).
- **Humaniki gotcha (the big one):** interpret value keys via the API's OWN `meta.bias_labels`. Humaniki's QID convention is **swapped vs Wikidata** (verified: its map says 6581097→male / 6581072→female; Wikidata says the opposite). Hardcoding `Q6581097=female` yields a wrong **79.7%**; the label lookup yields the correct **~20.1%** (matches Women in Red). `?project=enwiki&label_lang=en`; sum all `values` = total humans, sum the female-key bucket = women.
- **Renderer detection (transform):** 1 row + numeric → StatCard · label→value rows → BarCard · date-ish var + numeric → TrendCard (index-x) · else TableCard. Manual ⚙ override: `auto|stat|bar|line|table`.
- **Presets** (`src/lib/sparqlPresets.js`): met-collection (72,433), multi-institution (Met > Rijksmuseum > British Museum > Smithsonian — Europeana returns no rows), women-in-red (Humaniki), commons-top-depicts (QLever). Picking a preset atomically sets query + endpoint.

## 18. Wiki Page — static iframe (no fetch) **Widget:** Wiki Page · **Fetcher:** none (static widget)
- **What it is:** an `<iframe>` pointing at the wiki page itself — the page renders with full MediaWiki CSS/JS and links browse inside the widget. `referrerpolicy="no-referrer"`.
- **Why it works (verified 2026-08-13):** Wikimedia pages send **no `X-Frame-Options` and no CSP `frame-ancestors`** (checked via full GET header dump on en.wikipedia.org and en.m.wikipedia.org, 301→200) — direct framing is currently allowed. If Wikimedia ever adds frame-ancestors, this widget breaks (fallback: `action=parse&prop=text` + srcdoc — CORS `*`, no `<script>` tags in output, but base skin CSS is missing).
- **Desktop vs mobile view:** `mobile: true` swaps the host — `en.wikipedia.org` → `en.m.wikipedia.org`, `commons.wikimedia.org` → `commons.m.wikimedia.org` (the m. site renders the mobile skin regardless of iframe width; the desktop skin is responsive and collapses its sidebar below ~720 px).
- **Config:** `page` (any namespace), `project` (en/de/fr + commons — a local project list, since the shared PROJECT_OPTIONS stays article-only), `fragment` (optional `#anchor`), `mobile` (boolean).
- **Privacy:** the framed page is a trusted Wikimedia page (same as opening a tab); no sandbox needed.
