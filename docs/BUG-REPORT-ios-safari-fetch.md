# Bug Report: iOS Safari "Load failed" on Wikistats + Pageviews widgets

**Status: FIXED 2026-09-03 — root cause found via Firefox reproduction.** The
same root cause explains this report AND the 2026-09-03 Firefox "NetworkError"
wave: `fetchTextWithRetry` set a `User-Agent` request header on every fetch.
`User-Agent` is a forbidden header: Chromium strips it before the CORS preflight
check (so requests stay "simple" and Chrome always worked), but **Firefox and
WebKit include it in the preflight** — and Wikimedia's REST endpoints reject it
(RESTBase's preflight allow-list has `api-user-agent` but not `user-agent`; the
CIM service 405s OPTIONS outright). Every RESTBase-family fetch (pageviews,
Wikistats-adjacent REST, CIM, media-list) died with NetworkError/"Load failed"
while Action-API calls (`w/api.php`, which answers preflights properly) worked
— exactly the affected/working split in the table below. Fix: no custom headers
on browser GETs (the header was a no-op in browsers anyway — the real tool UA
lives server-side in deploy/server.js relays). Verified fixed in Chromium +
Firefox + WebKit via `npm run test:browsers`.

---

## Summary

On **iOS Safari only**, three widgets fail to load with network-level fetch
errors, consistently across **two different networks** (Verizon Fios wifi with
iCloud Private Relay **OFF**, and T-Mobile 5G cellular). Desktop Chrome,
desktop Chromium (Playwright), and mobile Chromium emulation all work. The
failures predate and survive all mitigations shipped 2026-08-12 (timeout +
retry + cache).

## Exact error messages (from the phone, 2026-08-12)

```
Pageviews fetch failed: Load failed
(wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/…)

Wikistats fetch failed: Load failed (wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv)
```

"Load failed" is Safari's generic network-layer fetch rejection (Chrome would
say "Failed to fetch"). **Not** a timeout (that would say "timed out after
15s"), **not** an HTTP error (would say "HTTP xxx"), **not** a CORS-message
Safari shows in-app.

## Affected vs. working endpoints (same device, same page load)

| Widget | Endpoint | iOS Safari |
|---|---|---|
| Top 10 Wikipedias | `wikistats.wmcloud.org/api.php` | ❌ Load failed |
| Wiki Stats | `wikistats.wmcloud.org/api.php` | ❌ Load failed |
| Article pageviews | `wikimedia.org/api/rest_v1/…` | ❌ Load failed |
| External Link Count | `en.wikipedia.org/w/api.php` | ✅ works |
| Category Size | `commons.wikimedia.org/w/api.php` | ✅ works |
| File Usage Map | `commons.wikimedia.org/w/api.php` | ✅ works |
| GLAM Category Usage | `commons.wikimedia.org` (+ pageviews, errors swallowed) | ✅ (pageviews errors hidden) |

Note: the GLAM widget calls `wikimedia.org` pageviews too but **swallows
per-page errors** (returns 0 views), so it cannot reveal the same failure.

## Investigation so far — ruled out

- ❌ **Server/CORS side**: both failing hosts return HTTP 200 with
  `Access-Control-Allow-Origin: *` (verified via curl, incl. with an iPhone
  Safari UA + `Origin` header). Working host `commons.wikimedia.org` shares
  the `*.wikimedia.org` wildcard TLS cert with the failing `wikimedia.org` —
  rules out certs and the wikimedia.org domain itself.
- ❌ **App request construction**: identical `fetch()` path (`fetchJSON` /
  `fetchTextWithRetry`, no custom headers — `User-Agent` is a forbidden header
  and stripped; `credentials: same-origin` default, no cookies sent).
- ❌ **Network/connection**: fails on Fios (Private Relay OFF) AND T-Mobile 5G.
- ❌ **Payload size**: pageviews responses are ~5 KB; wikistats is 195 KB —
  unrelated to the failure.
- ❌ **Our timeout/retry/cache changes**: failures persisted after 3 retry
  attempts per fetch across two deployments.
- ❌ **HTTP/2**: all four hosts serve HTTP/2 fine (server stacks differ:
  `main-tls`+Varnish for wikimedia.org, `nginx/1.22.1` for wmcloud, Varnish for
  the working hosts — the two failing hosts have nothing in common
  infra-wise).

## Hypotheses (unranked, for the revisit)

1. **iOS Safari + Wikimedia + logged-in users** — Phabricator
   [T399674](https://phabricator.wikimedia.org/T399674) (OPEN, medium):
   "Requests fail with Access-Control-Allow-Origin errors when using ForeignApi
   on iOS Safari"; occurs for **logged-in** users only, anonymous passes, iOS
   18.5. Mechanism isn't a perfect match (our fetches are anonymous,
   cookie-less), but it proves a known class of iOS-Safari + Wikimedia
   cross-origin failures that depends on the user's login state.
2. **Safari cache serving a CORS-invalid entry** for those two origins (known
   Safari failure class; the `cache: 'no-store'` probe in the diagnostics
   panel tests this).
3. **iOS-Safari-specific connection handling** of those two origins (DNS/IPv6,
   HTTP/2 windowing, QUIC) — least supported by evidence since
   commons.wikimedia.org shares the edge with wikimedia.org.
4. **Safari content blocker** on the device (user hasn't confirmed none).

## Shipped mitigations (2026-08-12, all live)

- `src/lib/fetchCache.js` — 5-min TTL cache + in-flight coalescing for the
  Wikistats CSV (two widgets → one request)
- `fetchTextWithRetry` in `src/widgets/dataSources.js` — 15 s AbortController
  timeout, 2 retries with backoff, 5xx retried / 4xx fail-fast; now used by
  **all** fetchers
- Error messages now include the failing URL (truncated)
- **🧪 Network Self-Test panel** (`src/components/DiagnosticsPanel.jsx`, 🧪
  button in the header) — probes the 4 endpoints × 3 modes (normal fetch,
  `mode:'no-cors'` connectivity check, `cache:'no-store'`), 15 s timeout each.
  On desktop: all 12 ✅. On the phone it classifies the failure layer:
  normal ❌ + no-cors ✅ → CORS-check failure; both ❌ → connection-level.

## Next steps when revisiting (decisive experiments)

1. **Run the 🧪 panel on the phone** (live at
   https://wikibento.toolforge.org/) and record the 12 results — classifies
   CORS vs connection per host.
2. **Safari Private Browsing** on the phone → reload dashboard. If it works,
   login state matters (T399674 hypothesis).
3. **Log out of Wikipedia on the phone** → reload (same hypothesis, finer).
4. **Chrome (iOS)** on the same phone → if it works, Safari-specific; if it
   fails, device-level.
5. **Open the raw URLs directly in Safari on the phone**:
   - `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Main_Page/daily/2026070100/2026073100`
   - `https://wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv`
   Both load → connection fine, failure is in the cross-origin fetch path.
6. Reproduce locally: Playwright **WebKit** on this Mac — install kept failing
   (corrupt download, only 15 MB of ~77 MB extracted); retry via
   `npx playwright@latest install webkit` or a fresh cache dir. safaridriver
   also needs a GUI toggle ("Allow Remote Automation") — could be enabled once
   at the Mac.

## Related files

- `src/widgets/dataSources.js` (fetchers, retry helper)
- `src/lib/fetchCache.js` (TTL cache)
- `src/components/DiagnosticsPanel.jsx` (self-test panel)
- HANDOFF.md §Known Issues
