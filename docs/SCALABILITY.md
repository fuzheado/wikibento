# Scalability & Efficiency Notes

**Context:** the current design is deliberately simple — one widget, one fetch, no
shared state, no backend. That's the right call for a handful of widgets. This
document maps what changes when the dashboard grows to **hundreds of tracked files
and categories**, with batching mechanics verified against the live APIs on
2026-08-12.

## 1. Per-Data-Source Batching Opportunities

| Data source | Current cost | Batchable? | At scale (hundreds of assets) |
|---|---|---|---|
| **categoryinfo** (Category Size) | 1 call / category | ✅ **multi-title**: `titles=A\|B\|C\|D` (≤ 50 titles per request) | 500 categories → **10 calls** instead of 500. Verified: 3 categories in 1 call. Missing categories return `missing` pages — handle gracefully |
| **globalusage** (File Usage Map) | 1 call / file, `gulimit=500` | ✅ multi-title (≤ 50 titles) | 100 files → 2 calls. ⚠️ Response size scales as `titles × gulimit` — 50 × 500 entries is a heavy payload; in batch mode lower `gulimit` (100–200) or accept truncation |
| **imageinfo** (thumbnail + caption) | rides the fileUsage call | ✅ multi-title + `iiurlwidth` | Combine with globalusage in the same multi-title query (`prop=globalusage\|imageinfo`) |
| **pageviews** (RESTBase) | 1 call / article | ❌ **no batch endpoint** for arbitrary article sets (RESTBase `top` only covers most-viewed lists) | Parallelize with a concurrency cap + cache. For very large sets, aggregate server-side or use dumps |
| **exturlusage** (Link Count) | 1–3 **sequential** calls / domain (pagination) | ❌ one domain per query | Parallelize domains (cap ~4–6 concurrent), cache with TTL. Counts are capped at 5,000 anyway — for exact counts at scale, prefer an enwiki **database replica** query on `el_index` (server-side only) |
| **Wikistats CSV** | 1 full dump per widget (**195 KB**, 333+ rows) | ✅ **fetch once, share** | The same CSV serves every Wiki Stats *and* Top 10 widget. A TTL cache keyed by URL turns N fetches into 1; also parse once and index by `lang` instead of re-parsing per widget |
| **random sample** (CirrusSearch) | 1 call / widget refresh | ❌ deliberately uncacheable — `srsort=random` needs a fresh seed per request (that's the point) | Cheap per call; for hundreds of categories just cap concurrency. Do NOT cache (catprobe notes this too) |

## 2. Cross-Cutting Efficiency Layers (in order of ROI)

1. **Shared fetch cache (TTL)** — a small in-memory `Map` keyed by URL (+ params),
   ~5-minute TTL. Kills the obvious duplicates: two widgets on the same article,
   every Wikistats widget re-fetching the 195 KB CSV, re-checks after drag/resize.
2. **In-flight coalescing** — while a fetch is pending, concurrent identical requests
   await the same promise instead of firing again. Protects bursty page loads (e.g.
   loading a saved dashboard with 100 widgets).
3. **Concurrency cap + refresh jitter** — cap parallel fetches per cycle (4–6);
   stagger per-widget refresh timers with ±15% jitter so hundreds of widgets don't
   all hit the APIs at :00 (thundering herd → 429s; honor `Retry-After`, back off —
   see the wikipedia-error-handling skill).
4. **Visibility-based fetching** — only fetch widgets that are actually on screen
   (IntersectionObserver); defer off-screen widgets until scrolled into view. Today
   every widget fetches on mount regardless of visibility.
5. **Staggered initial load** — priority queue: fetch visible widgets first, then the
   rest in waves of ~6.
6. **Debounced persistence** — with hundreds of widgets, debounce the
   `localStorage` write (currently synchronous per layout tick).
7. **Rendering** — react-grid-layout gets sluggish past a few hundred items;
   virtualize widget bodies (`content-visibility: auto` is the cheap first step,
   full windowing the second).

## 3. The Server-Side Option (when client-side batching stops being enough)

At thousands of assets — or when **exactness** matters (exturlusage cap at 5,000;
0-use files) — a thin Toolforge aggregator service is the natural upgrade:

- One endpoint like `/dashboard?ids=…` that runs the batched multi-title queries
  server-side (higher API limits, `maxlag`, proper pacing), caches aggressively
  (ETag/HTTP caching), and returns one JSON per dashboard.
- It's also the only way to reach **database replicas** for exact link counts
  (`el_index`), which browsers cannot.
- Same CORS story as today (the service adds CORS headers) — and it's the natural
  extension of the "CORS proxy" roadmap item. **Additive, not a rewrite**: the SPA
  keeps working with the current direct-to-API fetchers; the aggregator is just a
  faster path when present.

## 4. Where the Code Would Change

- `src/widgets/dataSources.js`: a `batchFetch(titles, prop, …)` helper that chunks
  50 titles per request; optional cache flag on `fetchJSON`.
- New `src/lib/cache.js`: TTL cache + in-flight promise coalescing.
- `src/widgets/WidgetFrame.jsx`: refresh jitter, visibility gating.
- `src/App.jsx`: debounced persistence.
- `src/widgets/index.js`: registry entries declare `batchable: true` + a batch key,
  so the fetch layer can merge across widgets (e.g. all Category Size widgets in one
  cycle share one multi-title call).

## 5. Verified Numbers (2026-08-12)

- Multi-title `categoryinfo`: 3 categories in 1 request ✓
- Multi-title `globalusage`: 2 files in 1 request ✓ (payload grows with
  `gulimit` × titles — reduce `gulimit` in batch mode)
- Wikistats `wikipedias` CSV: **195,299 bytes** per fetch — the single biggest
  duplication win in the current app when several Wiki Stats widgets exist
- `srsort=random`: fresh seed per request confirmed (curl + browser, no caching)

## See Also

- [ROADMAP.md](ROADMAP.md) — Phase 1 "shared fetch cache"; Phase 2 entry below
- docs/DATA-SOURCES.md — endpoint reference this document builds on
- catprobe tool (`~/Documents/ai/commons-categories/catprobe.py`) — the
  `srsort=random` sampling mechanism this app adopted
