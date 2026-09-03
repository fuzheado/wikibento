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

1. **Category walk + usage (ISSUE-46, 2026-08-17)** — **primary: PetScan via
the same-origin `/api/petscan` relay** (`lang=commons&project=wikimedia`,
`cats/depth/negcats/negdepth/ns=6/giu=1`): a single server-side crawl that
resolves the tree AND returns per-file global usage with **exact `ns`**
(no namespace heuristic). The relay enforces the **file budget** (default
500, max 30,000) by truncating PetScan's response — PetScan quick-intersection
mode IGNORES `max` and can return multi-10MB responses — and caps bytes
(25 MB, else `truncated` → client falls back). **Fallback (degraded):** the
bounded `categorymembers` walk + `prop=globalusage` in multi-title batches,
`gulimit=100`, chunked by **min(count 50, encoded length 4,500)** — the
anonymous `titles` cap is 50 (`toomanyvalues`; length-only chunking
silently returns empty `query.pages` — fixed 2026-08-16). The fallback is
**capped at 1,000 files** regardless of `fileBudget`, so a relay outage
never triggers a multi-hundred-call browser walk. ⚠️ The API's usage
entries carry **no `ns` field**, so the fallback filters article space with a
URL-path namespace heuristic (localized namespace names conservatively
counted as articles). The widget's output carries `source`
(`'petscan'`/`'selfwalk'`); the card subtitle flags `· self-walk fallback`
when degraded.
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
- **Endpoint:** Action API `prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=400&iiextmetadatafilter=ImageDescription` (`origin=*`) — 400px thumbs + dimensions + description caption. **Adaptive batching by min(count 50, ~4,500 encoded chars/chunk)** — the anonymous `titles` cap is 50 (toomanyvalues), long filenames (WLM) blow GET URLs (HTTP 414).
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
- **Desktop vs mobile view:** `mobile: true` appends `?useformat=mobile` on the **same domain** — MobileFrontend's own preview parameter, which activates the mobile view on the standard domain (verified 2026-08-13: HTTP 200 + Minerva skin HTML on enwiki and Commons; no special cookies, just the standard WMF analytics cookies every page sets). ⚠️ **The m. subdomains are retired**: `en.m.wikipedia.org` and `commons.m.wikimedia.org` both 301 to their desktop domains (verified 2026-08-13), so host-swapping no longer works. (`?useskin=minerva` also serves Minerva, but `useformat=mobile` is the documented MobileFrontend switch.) The desktop skin is responsive regardless and collapses its sidebar below ~720 px.
- **Config:** `page` (any namespace), `project` (en/de/fr + commons — a local project list, since the shared PROJECT_OPTIONS stays article-only), `fragment` (optional `#anchor`), `mobile` (boolean).
- **Privacy:** the framed page is a trusted Wikimedia page (same as opening a tab); no sandbox needed.

## 19. CIM widgets — Commons Impact Metrics (precomputed, allow-list) **Widgets:** CIM Category Snapshot · Views Over Time · Top Files · Top Wikis · Top Pages · Top Editors · Global Leaderboard · File Spotlight
- **Base:** `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/` — CORS `*`, no auth, `{context, items}` envelope; **14 endpoints** (authoritative: `api-spec.json` at the base URL). All 8 widgets verified live 2026-08-13 against `Files_from_the_Biodiversity_Heritage_Library`.
- **Allow-list reality:** only ~1,755 primary categories + subcats (7 levels) have data. Unregistered categories (and registered ones with no data for the requested month) return **HTTP 404** with `"not loaded yet"` in the body — the 404 is **ambiguous** (verified: BHL itself 404s for 2015-01). `fetchCimMonth` disambiguates with a previous-month probe: probe OK → "no CIM data for this month"; probe 404 → not registered (friendly register hint with `{{Views from category}}`, processed monthly).
- **Snapshot has NO pageviews** — join `pageviews-per-category-monthly` for view totals. Read the `-deep` keys for tree-wide numbers (identical to shallow for flat categories).
- **Semantics:** CIM "views" = pageviews of pages **using** the files — not media requests, Commons-page views, or thumbnail fetches. Labeled "pageviews" in the widgets.
- **Dates:** `YYYYMM01`, **end-exclusive**; default = previous calendar month (current month incomplete; data lags ~1–2 days).
- **Numbers are native JSON numerics** (unlike SPARQL) — no coercion. Hyphenated keys (`media-file-count`, `leveraging-wiki-count`) mapped to camelCase in the fetchers.
- **Reliability:** 30 s timeout + 1 retry + **1-hour TTL cache** (monthly data); `refreshSeconds` default 3600 — don't hammer the `top-*` endpoints.
- **Gotcha (fixed):** top-files thumbnails — `imageinfo` normalizes titles to spaces, so thumb lookup keys must be space-form (`title.replace(/_/g, ' ')`), not underscore form.
- **⚠️ Leaderboard interpretation — umbrella categories legitimately top the deep board (investigated 2026-09-03):** the Global Leaderboard (deep) is led by **diffusing umbrella categories**, not content categories — UNESCO 8.27B, Supported_by_Wikimedia_CH 5.6B, Library_of_Congress 1.7B for 2026-03. This is *computed correctly but structurally inflated*: UNESCO shallow = 575 files / 361 pages, but deep sweeps **16.4M files across 7 subcat levels** (¼ of all Commons files), used on 4.6M pages in 814 wikis — Commons' mega-diffusion containers ("Categories requiring permanent diffusion", "Uses of Wikidata Infobox", per-language/country containers) bridge the tree into infrastructure files like national flags (Flag_of_Iran.svg alone: 282M views/mo across 104 wikis — independently reconciled to 0.07% via the per-wiki endpoint). Not a fluke: UNESCO runs 6–9B **every month for 18 months** (stable deep-file count 16.1–16.6M). No single file dominates (top-50 = 16%). **Guidance:** read deep numbers as "reach of the whole category tree's file usage," not "views this category's work earned"; for per-institution/content attribution prefer shallow scope or specific content subcategories; shallow-vs-deep gap on a root category is the tell for diffusion capture.
- **GLAM live walk unchanged:** the `glamorgan` widget (on-demand category walk) remains a separate widget by design (2026-08-13 decision) — CIM widgets are precomputed-only.


## 20. CIM File Traffic — interactive per-file chart **Widget:** CIM File Traffic · **Fetcher:** `fetchCimFileTraffic`
- **Endpoint:** CIM `pageviews-per-media-file-monthly/{file}/{wiki}/{start}/{end}` — fetch window up to 24 months (default 12) ending at the last complete month.
- **Renderer (`FileTrafficCard`):** hand-rolled SVG line chart with labeled axes — Y ticks compact (`254K`, `1.2M`), X = months (`26-02`), axis titles "views" / "month". **−/+ zoom buttons** slice the fetched window client-side (3/6/12/24 months — no refetch); the card header always shows the displayed range ("2026-02 → 2026-07 · 6 months"). Hover points show exact month+views.
- **CIM flakiness (verified 2026-08-13):** the API deterministically 500s (internal upstream 503) for **specific ranges** from browsers — e.g. the exact 12-month window `20250801/20260801` fails while 11- and 13-month windows and 30-month windows succeed (curl gets 200 for the same URL — likely edge/backend-dependent). `fetchCimTrafficWithHeal` self-heals: on HTTP 500 it retries with the earliest month dropped. Related: `fetchCim` retries 5xx twice.

## 21. Wayback Snapshot Gallery — Wayback availability API + CDX fallback **Widget:** Wayback Snapshot Gallery · **Fetcher:** `fetchWaybackGallery(url, dates, toleranceDays)`

- **Fast path:** `https://archive.org/wayback/available?url={url}&timestamp={YYYYMMDD}` — CORS-enabled (ACAO `*`), returns the closest capture to the requested date (`archived_snapshots.closest.{timestamp,status,url}`). One small JSON call per date (TTL-cached 10 min, capped at 24 dates).
- **Fallback (authoritative):** the availability API is FLAKY from browsers — some (url, date) lookups deterministically CORS-fail or return empty `{}` while a capture exists (verified 2026-08-14: `wikipedia.org@20150615` CORS-blocks in-browser / returns `{}` with a `memento-location` header; the same request later succeeds). On failure the widget falls back to the CDX index via the same-origin `/api/proxy`: `web.archive.org/cdx/search/cdx?url=…&from=…&to=…&fl=timestamp,original,statuscode&collapse=timestamp:6&filter=statuscode:200&limit=200` (CDX itself sends no CORS — proxy required; plain static hosts show a graceful "lookup failed — retries on refresh" tile).
- **Replay/embedding:** replay pages send no X-Frame-Options / `frame-ancestors` (verified), so the card embeds `https://web.archive.org/web/{ts}id_/{url}` (id_ = toolbar-less capture) in fixed 1280×960 iframes scaled to 4:3 screenshot tiles (`pointer-events: none`; caption links open the full snapshot in a new tab).
- **Caveats:** dates are YYYY-MM-DD, one per line (≤24); `toleranceDays` (default 30) gates "within tolerance" tiles; captures outside tolerance render as "nearest Nd away" placeholders; non-200 captures are badged.

## 22. Video / Media Player — Commons API `videoinfo` (batched) **Widget:** Video / Media Player · **Fetcher:** `fetchMediaPlaylist(filesText)`
- **Input:** a textarea list of Commons files, one per line (`File:` prefix optional). One file = plain embed; several = jukebox playlist.
- **Endpoint:** Action API `prop=videoinfo&viprop=derivatives|url|size|duration` (`origin=*`) — returns the original + all transcoded derivatives (VP9/VP8 WebM, Theora OGG, quicktime iOS path) with width/height/duration. **Adaptive batching by min(count 50, ~4,500 encoded chars/chunk)** — same rule as `fetchCommonsGallery`/`fetchBatchedUsage` (anonymous 50-title cap + HTTP 414 otherwise).
- **Audio works too:** `videoinfo` serves audio files — derivatives may list an mp3 transcode; the widget plays the original Ogg/Opus directly (Commons format policy = WebM/OGG only; MP4 uploads blocked by patents, so VP9 WebM is the universal playback default).
- **Playback URL pick (`pickPlayUrl`):** prefer transcoded `video/webm` derivatives (excludes the original, whose src lacks `/transcoded/`); quality is **height-based** ("480p" = 640×480) — largest derivative ≤ target, auto = largest ≤ 1080p; fallback = original URL. `?utm_source=…` query junk stripped from all URLs.
- **Per-track media type:** video if any derivative is `video/*` or the extension is webm/ogv, else audio → the card renders `<video>` or `<audio>` per track (mixed playlists fine).
- **Missing files:** counted and surfaced in the subtitle ("3 files · 1 not found · 2 video, 1 audio") — never fatal.
- **Jukebox behavior:** all client-side — `onended` → next; loop-playlist wraps the end to the start (single-file + loop = native `loop`); Fisher–Yates shuffle per playlist change; autoplay respects browser policy via a ▶ Start pill (one click unlocks subsequent autoplay — `playing` hides the pill).
- **Rate limits:** ONE batched call per refresh (refreshSeconds ≥ 30 per the constitution); playback streams from upload.wikimedia.org (their CDN).

## 23. LLM inference — LiftWing open-weight models (Wikimedia-hosted, free)

**Facility record (2026-08-16):** Wikimedia's LiftWing platform hosts two
open-weight Qwen chat models **free for any Wikimedia project or tool**, no
API key, no cost. Documented at
wikitech.wikimedia.org/wiki/Machine_Learning/LiftWing/Large_Language_Models/Wikimania_2026.

- **Models:** `llm-qwen36-27b` (Qwen3.6-27B, 32K context — largest available)
  and `llm-qwen3-14b` (Qwen3-14B, 16K). Multilingual, instruction-tuned.
- **Endpoint (OpenAI-compatible chat completions):**
  `https://api.wikimedia.org/service/lw/inference/v1/models/llm-<model>/openai/v1/chat/completions`
  — any OpenAI client works by pointing `base_url` at it; streaming supported.
- **Supports:** chat/text generation, streaming, `response_format:
  {"type": "json_object"}` (vLLM-enforced valid JSON — verified live
  2026-08-16), up to 32K context. **Does NOT support:** tool/function
  calling, RAG, web search, vision.
- **Rate limits:** anonymous = **100 requests/hour shared across all models,
  per client** (HTTP 429 over). Running from **Toolforge = effectively
  unlimited** (no request needed). The 429 body may be plain text; honor
  Retry-After.
- **CORS: none** on the endpoint (verified) → browsers cannot call it
  directly; **any tool use must relay server-side** (the `/api/ask` pattern,
  same as `/api/proxy`).
- **Privacy:** the API persists nothing — prompts and responses are **not
  logged, retained, or used for training**. Prompts stay inside Wikimedia
  infrastructure. (LiftWing Studio is different: it saves chats by default.)
- **Outputs:** may include a `<think>…</think>` reasoning wrapper — strip it
  before use. Training cutoff is fixed; no live knowledge — supply context
  in the prompt for anything time-sensitive.
- **Verified use (2026-08-16):** the ISSUE-44 "Ask" widget advisor — the
  trimmed 30-widget catalog sent in the system prompt is 15,764 chars
  (≈ 4.1–5.3K tokens; full system prompt with rules ≈ 4.5–6K, fits 32K with
  ~26K headroom — see ISSUE-44 "Payload contract" for the exact trim
  map); `json_object` mode returns clean contract JSON on realistic intents
  with correct widget ids and pre-filled configs. ⚠️ **The model can
  hallucinate widget ids** (`video_player` for `mediaPlayer`) — always
  validate model output against the manifest.
- **⚠️ Caveat — experimental test service, no long-term guarantee:** this is
  a pilot with **no SLA**; it may be slow or unavailable, and models or
  endpoints can change or be **removed without notice**. Never make a
  feature *depend* on it: pair every use with a local/offline fallback
  (e.g. the local smart-search tier in ISSUE-44). Treat it as a bonus
  facility, not a dependency.

**Other future uses at our fingertips (same endpoint, same rules):** the Ask
advisor (ISSUE-44); natural-language → SPARQL query generation (pre-filled
configs); widget description / config-help text generation; dashboard title
and subtitle summarization; drafting Markdown content for the Text/Markdown
widget; text classification and summarization helpers for GLAM workflows;
multilingual dashboard text (the models are multilingual). Anything that is
"structured text in, structured text out" over a constrained domain is the
right paradigm — coding benchmarks are not.
