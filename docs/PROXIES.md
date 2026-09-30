# Proxied services — what runs on our server, why, and what keeps it safe

Most of WikiBento talks to the outside world **directly from your browser**: Wikimedia's Action and REST APIs, Commons,
Wikidata, `iiif.archive.org`, the Internet Archive. Those services send CORS headers, so a browser can read them and the
work is done on the reader's machine.

A handful of things cannot work that way, and those go through **our own server** (`deploy/server.js`, on Toolforge).
This file is the inventory, the reasons, and the rules those routes follow — because they are the one place where *our*
code runs on a shared, finite machine, and therefore the one place where a mistake is ours to pay for.

## Why a proxy exists at all

Three browser limitations, and nothing else:

1. **A page cannot set its own `User-Agent`.** Some services answer differently — or not at all — to a browser-shaped
   request. The map service is the sharpest example: it answers a Wikimedia User-Agent with a PNG and a browser with
   `403` and an HTML page, which a browser then refuses outright as an image (`net::ERR_BLOCKED_BY_ORB`).
2. **A page cannot read a response with no CORS header.** `top.hatnote.com` and the archive.org CDX API send no
   `Access-Control-Allow-Origin`, so the browser can fetch but not read.
3. **A page cannot be trusted with someone else's quota.** PetScan's quick-intersection ignores `max` and can return
   39 MB; an LLM call costs money. Those need a server that can cap, cache and say no.

## The inventory

Every route below is in `deploy/server.js`. "Caps" are byte ceilings, "TTL" is how long a cached answer stays fresh.

| Route | Upstream | Why it is proxied | Cache | Caps and limits |
|---|---|---|---|---|
| `/api/staticmap` | `maps.wikimedia.org/img/osm-intl` | the map service refuses browser-shaped requests (see above) | 60 entries, 6 h, memory | size must be on the ladder; coordinates rounded to 4 dp; closed parameter set |
| `/api/proxy` | Wikimedia wikis, `top.hatnote.com`, `web.archive.org` | sources with no CORS, and asking for a *desktop* parse with our own UA (ISSUE-100) | none (each request is data the user asked for) | 2 MB body cap; **host allowlist**; shared deadline |
| `/api/resolve` | `w.wiki` only | expanding short URLs server-side; the target sends no CORS | none | 1 host allowed; shared deadline |
| `/api/petscan` | `petscan.wmcloud.org` | quick-intersection ignores `max`; the cap and the file budget live here (ISSUE-46) | none | 25 MB streamed cap, 60 s deadline, file budget, `{ truncated }` reported rather than guessed |
| `/api/wayback-gallery` | `web.archive.org` availability + CDX + timemap | no CORS on the CDX side | 200 entries, in-memory TTL | shared byte cap; per-call deadlines (25 s / 15 s) |
| `/api/ask` · `/api/ask/session` | LiftWing LLM | the API key and the system prompt live server-side (ISSUE-44) | 200 entries, 10 min | prompt caps, 45 s deadline, control token, allowed origins |

**Everything is `https` and `GET`**, and **nothing writes to disk** — the caches are in memory, bounded, and expire.

## The rules every relay follows

Set once, at the top of `deploy/server.js`, and drawn on by all seven routes:

1. **A host allowlist.** A proxy that can reach anywhere is an amplifier. The wikis are many and *closed* — the project
   families plus the three third-party hosts the widgets actually use — so the list is patterns, and anything else is
   refused **by name** so the failure is explicable.
2. **A byte cap, streamed.** `content-length` is a hint, not a promise, so the running total is what stops a response:
   a hostile or merely enormous body must never decide how much memory we use.
3. **A deadline.** One helper (`relayFetch`) so that no route can forget one; node's own `requestTimeout` is 300 s by
   default, which is far too patient, so it is set to 30 s.
4. **A rate limit, per client.** A token bucket keyed on the client's address (the proxy's `x-forwarded-for`), so one
   visitor cannot starve the others — asserted by the guard, not assumed.
5. **An in-flight ceiling.** Concurrent upstream requests are bounded globally, released in a `finally`, so a slow
   upstream cannot pile up connections.
6. **Caches that cannot grow without bound.** A TTL *and* a size ceiling; a hostile key space cannot become a leak.
7. **Errors that explain themselves.** A thrown error used to be reported as `404 Not Found` — a broken relay looked
   exactly like a missing file. It is now a `500` with the reason, which is how the two bugs below were found.

## The guard

```
node scripts/relay-guard-e2e.mjs            # local: starts the real server with tight limits and tries to break it
node scripts/relay-guard-e2e.mjs --base URL # a deployed host: read-only checks only, and it never bursts
```

It asserts each rule by breaking it: an off-ladder size (400), a non-allowlisted host (403), an oversized body (502
naming the cap), a repeat served from cache (`x-staticmap: cache`), a burst of 24 that is rate-limited, **a second
client still being served**, and resident memory staying sane afterwards. `npm run smoke:relay`, and part of `npm test`.

It earned its place immediately. Running it found:

- **`MAP_LADDER` undefined in the server** — the constant lives in `src/lib/mapImage.js`, which `deploy/server.js`
  cannot import (it sits next to `dist/` on the deployment). The map route threw on every request. The duplication is
  now deliberate and `tests/map-widget.test.mjs` compares the two lists, so they cannot drift.
- **A temporal-dead-zone crash in the proxy's allowlist**, which read a `target` const declared below it.
- **Every error reported as `404 Not found`** — which is why the first two looked like missing files. That catch is now
  a 500 that names the reason (rule 7).

## Adding a new relay

1. **Start with the reason.** If the browser can do it directly, it should — no proxy, no quota of ours.
2. Return a **typed, bounded** response. If it cannot be capped, it probably should not be a relay.
3. Give it an entry in the table above and in the health check, or it did not happen.
4. A **host allowlist**, unless the route's own parameters *are* the closed set (the map relay takes numbers only).
5. A **deadline** via `relayFetch`, a **byte cap** via `readCapped`, a **cache** with a TTL and a ceiling.
6. The **gate** and the **limits** (rules 4 and 5) are already in the dispatcher: call `relayCheck(req)` at the top of
   the route and `relayEnter()`/`leave()` around the upstream fetch.
7. Add its assertions to `scripts/relay-guard-e2e.mjs` — the guard is the only thing that keeps these promises honest
   after the next person edits the file.
