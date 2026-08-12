# GLAMorgan Widget — Feature Review & Implementation Notes

Review date: 2026-08-12. Verdict: **the spec is implementable from the browser,
mostly as written, with two boundedness decisions required** (below). Every
number in the request was reproduced exactly against the live APIs before this
review was written.

## What GLAMorgan Actually Does (from its source)

GLAMorgan (glamtools.toolforge.org/glamorgan.js) is a **per-file pageview counter
for one Commons category tree, one month**:

1. **PetScan** (`petscan.wmcloud.org`) — resolves the category tree (`cats`,
   `depth`, `negcats`, `negdepth`, `ns=6`) and returns every file **with its
   global image usage attached** (`giu=1`) — a single server-side crawl.
2. **WMF pageview API** — monthly view totals for every distinct article page
   that uses any of the files, fetched **via a server-side proxy**
   (`pageviews.php`, 50 pages/batch, 3 concurrent) because thousands of
   per-page REST calls are impractical from a browser.
3. `computeStats` — per file: `views` = Σ views of its using pages; totals for
   the four cards: **Files in category · Files viewed (of N used) · Pages using
   files (on M wikis) · Views in {month}**.

## Verified Against the Spec (live, 2026-08-12)

| Spec item | Feasibility | Evidence |
|---|---|---|
| Parametrize by category + depth + month/year | ✅ | `depth` = recursive subcategory walk; month/year = pageviews range. Your exact URL params map 1:1 |
| "Files in category" | ✅ | Bounded category crawl (see §Boundedness) |
| "Files viewed of N used" | ✅ | `used` = ≥1 article-space (ns 0) page uses it; `viewed` = Σ page views > 0 |
| "Pages using files" | ✅ | Distinct `wiki:page` pairs (ns 0 only — PetScan/GLAMorgan both filter `ns !== 0`) |
| "Total views" | ✅ | WMF pageviews REST, monthly granularity, all-access/user. **Reproduced your example rows exactly**: enwiki Alysa Liu **112,074** ✓, jawiki アリサ・リュウ **16,735** ✓, zhwiki 刘美贤 **5,730** ✓, ruwiki Лю, Алиса **4,916** ✓ |
| Filmstrip of top 3–5 images | ✅ | Rank files by Σ views; thumbnails via one batched `imageinfo` call |
| Top file: usage across languages/pages | ✅ | Its globalusage pages + monthly views per page, sorted desc — exactly your table format |

## Boundedness Decisions (the two real spec gaps)

1. **PetScan is unusable from a browser for large categories.** Empirically it
   **ignores the `max` cap** in quick-intersection mode: `max=100` on
   "Images from Wiki Loves Monuments 2024" (239,084 files) returned all 239,084
   pages in a **39 MB / 16 s response**. GLAMorgan gets away with it server-side;
   a browser tab does not. → **Replaced with a client-side category walk** using
   the Commons Action API (`categorymembers`, files+subcats, depth-aware) with a
   **hard file budget** (default 500, max 1,000). Depth semantics match
   PetScan's (0 = category itself, 1 = + direct subcats, …). The widget reports
   "first N of M files" when the budget caps the tree.
2. **Pageviews are one REST call per distinct page.** GLAMorgan needs a
   server proxy for this. Browser compromise: fetch views for the top
   **150 pages by usage weight** (6 concurrent, ~15–30 s worst case); if a tree
   has more, the Views card and filmstrip are labeled **"partial"** and computed
   over the top 150. Your example scale (one file → 10 pages) needs **11 calls**.
   The existing "CORS proxy" roadmap item is the upgrade path to full exactness.

## Additional Spec Clarifications Adopted

- **Month defaults** to the previous calendar month (complete data; today's
  pageview data lags ~2 days). Year/month clamp: 2015-08 is the API floor
  (RESTBase has no earlier data — GLAMorgan warns about this too).
- **Wiki scope**: article space (ns 0) only, matching GLAMorgan and your example
  rows (enwiki/jawiki/zhwiki…). Usage on Talk/User/etc. pages is excluded.
- **`gulimit`** per file capped at 100 usage entries (batching 50 files/call —
  the SCALABILITY.md multi-title pattern); heavy-use files are captured to a
  reasonable depth with the trade-off documented.
- **Negative categories** (`negcats`, pipe-separated, `negdepth`) supported by
  the walker via an exclusion set.

## Scale Table (what to expect)

| Category | Files | Client calls | Views |
|---|---|---|---|
| Images from XBio (your example URL, 518 files) | 500 (capped) | ~10 crawl + ~10 giu batches + ~0 views | **zero usage — see note** |
| Quality images of bridges in Paris (57 files) | 57 | ~2 + 2 + ~40 | exact |
| WLM 2024 (239,084 files) | 500 (capped) | same as XBio | partial, "first 500 files" |

## Field Note: The Example URL's Category Is Currently Unused

Checked 2026-08-12: **"Images from XBio" has 518 files, no subcategories,
and no file in it has any global usage** — so the widget correctly reports
all-zero stats for it at any depth. The usage table in the request (Alysa
Liu, 112,074 views…) must come from a different category or an earlier state
of XBio. The pageviews pipeline was validated independently against those
exact numbers (see table above). The widget's default category is
"Featured pictures on Wikimedia Commons", which has real usage to show.

## The Official Alternative: Commons Impact Metrics (CIM)

**Verified 2026-08-12:** the WMF's precomputed monthly dataset — the successor
to GLAMorgan-style computation — requires **allow-list registration**. Only
registered categories (GLAM institutions, affiliates, campaigns — ~1,755
primary categories) plus subcategories up to **7 levels deep** have data.
Unregistered categories return **HTTP 404** with *"the category you asked for
is not loaded yet"* — that 404 *is* the registration check.

- **Register:** add `{{Views from category}}` to the category page → hidden
  tracking category → staff add to the allow-list at month-end (submit by the
  20th). No retroactive data; metrics appear the following month. Optional
  Phabricator ticket (project `Commons-Impact-Metrics-Requests`).
- **API** (CORS ✓): `https://wikimedia.org/api/rest_v1/metrics/commons-analytics/`
  — `category-metrics-snapshot/{cat}/{start}/{end}` (the four headline stats),
  `top-pages-per-category-monthly/…`, `top-viewed-media-files-monthly/…` (the
  filmstrip), etc. Handles categories up to 1M files.
- **Relationship to this widget:** the live `glamorgan` widget works for ANY
  category on demand (bounded), which CIM cannot do for unregistered
  categories. The planned upgrade: **try CIM first, fall back to the live walk
  on 404** — giving instant exact numbers for registered categories and the
  live path otherwise. See ROADMAP Phase 1.5.

Full process details: the `wikimedia-commons` skill's "Commons Impact Metrics"
section (updated 2026-08-12).

## Status: Implemented (2026-08-12)

The widget ships as `glamorgan` ("GLAM Category Usage", renderer `GlamCard`) and
is in the ✨ example dashboard. Verified live on "Featured pictures on
Wikimedia Commons" (2026-07): 500 files, 21/33 viewed, 235 pages on 58 wikis,
314,375 total views, 5-image filmstrip, top-file detail (Lion 97,121 views).
The XBio note below remains true — that category is currently unused.

## Implementation

New widget type `glamorgan` ("GLAM Category Usage", renderer `GlamCard`):
config = category, depth (0–12), year, month, negcats, negdepth, fileBudget
(50–1,000), topN (1–10), showDetail (bool). Fetcher `fetchGlamStats` in
dataSources.js: category walk → batched globalusage → bounded pageviews →
per-file aggregates → top-N filmstrip thumbs → top-file detail table.
See docs/DATA-SOURCES.md §6 and the widget entry in src/widgets/index.js.
