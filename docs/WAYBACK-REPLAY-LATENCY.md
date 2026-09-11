# Wayback replay latency — measured, with receipts (2026-09-11)

**Status:** measured findings, not a plan. Every number below came from live probes on
2026-09-11 from this host; the probe scripts are listed at the end so anyone can re-run them.

**Why this doc exists:** the Wayback Snapshot Gallery (`waybackGallery`) is the slowest card we
ship. Tiles *sit there* for seconds to a minute and the UI has no way to say what is happening or
whether anything will ever arrive. This is what the archive actually does, and what we can
honestly show the user.

**Bottom line:** there is **no progress API for replaying a page** — but the archive *does* tell us
where the time went (`Server-Timing`), and the two dominant costs are both ours to control: the
**width of the CDX query window** and the **URL form we ask about**. The rest of the wait is the
archived page itself loading ~150–270 subresources.

---

## 1. The measurements

### 1.1 Lookup endpoints — what answers fast (all times `time_total`, this host)

| Endpoint | Time | Notes |
|---|---|---|
| `__wb/calendarcaptures/2?url=…&date=…` | **0.39 s** | per-day capture counts; `{}` when that day has none |
| `__wb/sparkline?output=json` | 0.65–6.0 s | per-year/month capture counts (the IA calendar's own data) |
| `cdx?…&showNumPages=true` | **2.5 s** | cheap "how much index is there" probe |
| `archive.org/wayback/available` | **2.6 s hit / 6.2 s miss** | the only one with `Access-Control-Allow-Origin: *` |
| `cdx?…&from=…&to=…&limit=1` (one-day window) | **2.8 s** | narrow windows are cheap |
| `cdx?…&from=2015&limit=1` | 10.7 s | wide window |
| `cdx?…&timestamp=20150601&limit=1` | 15.2 s | "closest" form |
| `cdx?…&from=2015&to=2015&limit=1&filter=statuscode:200` | 19.0 s | filter costs more |
| `cdx?…&from=2010&to=2024&collapse=timestamp:4&filter=statuscode:200` | **27–37 s** | the shape our server used for multi-date batches |

**Rule that falls out of it:** CDX cost tracks the size of the index range it must scan, not the
number of rows returned. A one-day window is **7–13× cheaper** than a multi-year range.

### 1.2 The archive explains itself: `Server-Timing`

The redirect response (before the document even starts) carries per-stage timings:

```
server-timing: captures_list;dur=0.74, exclusion.robots;dur=0.07, esindex;dur=0.009,
               cdx.remote;dur=66.198440, LoadShardBlock;dur=228.2, PetaboxLoader3.datanode;dur=204.2
```

`cdx.remote` measured at **66.2 s** (en.wikipedia.org 2020), **16.4 s** (2015), **7.8 s**
(nytimes.com 2010). That single number is the reason a tile can hang for a minute *before* any
content arrives. It is delivered with the headers, so it cannot drive a countdown — but it is
exactly the sort of thing our server can log, surface in a tooltip, or show as "the archive's
index lookup took 66 s for this capture".

### 1.3 Negative results (worth not re-trying)

- **`im_` is not a screenshot.** For a web page it returns `text/html`, 898,571 bytes — byte-for-byte
  the same shape as the default form. There is no cheap static preview hiding behind a URL modifier.
- **`Range:` is ignored.** Requesting bytes 0–2000 returned the full 898,571-byte document, so we
  cannot estimate progress by peeking.
- **Warming does not help.** Cold 0.92 s vs repeat 0.99 s / 0.96 s, with `x-page-cache: HIT` both
  times — the bytes come from IA's own cache regardless. (This kills the naive "pre-fetch for
  progress, then point the iframe at the same URL" idea; it doubles bytes for no gain.)
- **The Memento aggregator is unreachable from here.** `timetravel.mementoweb.org` fails DNS
  resolution — do not build a fallback on it.
- **`if_` / `id_` / default differ by noise** (0.86 s / 2.29 s / 1.83 s for the same wikipedia capture).

### 1.4 The false negative that looks like an empty archive

The availability API is **URL-form sensitive**:

| Query | Result |
|---|---|
| `url=nytimes.com` | `{"archived_snapshots": {}}` — *nothing found*, 6.2 s |
| `url=www.nytimes.com` | capture found, 2.6 s |
| `url=http://www.nytimes.com/` | `{}` |
| `url=https://www.nytimes.com/` | `{}` |

Same site, opposite answers — and the *miss* is also the slower path. Until 2026-09-11 the card
rendered this as **"no captures on record"**, which reads as "the archive has nothing" for a site
with tens of thousands of captures.

### 1.5 What a tile costs once it does start (headless chromium, this host)

| Snapshot | Response commit | Requests | DOMContentLoaded | `load` | Bytes | Failed |
|---|---|---|---|---|---|---|
| en.wikipedia.org 2015 | 495 ms | 145 | 3.6 s | **6.6 s** | 1.1 MB | 2 |
| nytimes.com 2010 | 4.2 s | **268** | 22.8 s | **28.9 s** | 2.2 MB | 3 |

NYT timeline: at t+5 s only 18 requests finished with 55 still pending; at t+20 s, 210 done / 30
pending. Four tiles is therefore **~600–1000 subrequests** against a service that also
intermittently drops connections under burst (probes hit a run of connection failures that
succeeded on retry seconds later).

## 2. Design rules we now follow

1. **Narrow CDX windows, never one wide span.** Ask per date, ±tolerance, not min→max across years.
2. **Try both URL forms** (`example.com`, `www.example.com`) and remember which one matched —
   the replay URL must use the matched form or the iframe 404s.
3. **Never claim "no captures" from the availability API alone.** `{}` means *unknown*; corroborate
   with the cheap calendar/sparkline probes before saying the archive has nothing.
4. **Show states, not a spinner:** queued → checking (elapsed) → found (timestamp) → loading
   (elapsed) → loaded · slow · failed · no-capture, each with "Open in Wayback ↗" and Retry.
5. **Budget concurrency.** 1–2 tiles at a time, the rest lazy/staggered; every tile is a
   ​150–270-request page load.
6. **Use the cheap probes for immediate substance** (0.4–2.5 s): "N captures archived · loading
   2015-06-01…" beats an empty box.
7. **Say what the archive said.** `Server-Timing`'s `cdx.remote` is available for explaining a slow
   tile specifically rather than vaguely.

## 3. Supplements, ranked (measured, for content we can't get from IA)

- **arquivo.pt** — CORS `*`; CDX 0.85 s, timemap 1.09 s. Genuine second source.
- **Common Crawl index** — CORS `*`; `collinfo.json` 0.11 s, index query 4.7 s. Raw archived
  content for a "found elsewhere" hint (no rendering).
- **Save Page Now** — the one IA surface with real job-progress polling, and only relevant if we
  ever *create* snapshots rather than replay them. The documented endpoints I tried (`/developers/
  spn2-api.html`, `/developers/tutorial-saving.html`) both 404'd, so treat any specific claim as
  unverified until re-checked.

## 4. Reproduce

Probe scripts (this host, 2026-09-11): `/opt/data/wb-probe-meta.py` (endpoint costs),
`wb-probe-docs.py` / `wb-probe-docs2.py` (document loads, warm/cold), `wb-probe-browser.cjs`
(headless-chromium request timeline), `wb-probe-alt.py` (alternatives), `wb-probe-cdx.py`
(CDX window costs, URL-form sensitivity). They take a User-Agent identifying WikiBento and cap
every request with `--max-time`, so re-running them is safe and cheap.

**Caveat, stated plainly:** these are one host, one network, one day, with all requests
unauthenticated. The archive's own caching means variance is large — the same lookup shape gave
7.8 s, 16.4 s and 66.2 s `cdx.remote` on three comparable captures. Treat the *ratios* as the
finding (narrow vs wide, hit vs miss, one tile vs four), not the absolute seconds.
