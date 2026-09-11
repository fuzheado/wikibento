# Why WikiBento — the wisdom ledger (running document, started 2026-09-11)

**Status:** running document. This is not a pitch deck and not a feature list — it is the argument
for what WikiBento is *for* now that an agent can generate a dashboard from a sentence, plus an
append-only ledger of the hard-won facts that argument rests on. Add entries when a measurement
changes a decision; date and receipt every one.

**The premise, stated fairly:** yes — someone can open a coding agent and say *"make me a dashboard
that shows Wikipedia pageviews next to the Wayback history for this article"* and get working
JavaScript in a few shots. That is real, it is fast, and for a one-off personal board it is
genuinely the better tool. Any argument for WikiBento that depends on "you couldn't build this
yourself" is already dead, and should stay dead.

**So the argument has to be about what a generated dashboard does not have.** Concretely:

1. **It does not know how the APIs actually behave.** A model writes `fetch('https://web.archive.org/
   cdx/search/cdx?url=…')` from an approximation of what CDX is. It will not know that the archive
   spends up to 66 s inside its own index lookup before sending a byte, that `im_` returns HTML
   rather than the screenshot its name suggests, that `Range:` is ignored, or that asking about
   `nytimes.com` and `www.nytimes.com` can give opposite answers. We now know all four, with receipts
   (`docs/WAYBACK-REPLAY-LATENCY.md`). That difference is not style — it is the difference between a
   card that lies to a visitor and one that says "still loading — 18 s, heavy captures take 20–30 s".
2. **It does not have failure states**, so it spins forever, or shows an empty box, or reports
   "no captures on record" for a site with 751,690 captures. Our tiles now have phases, clocks,
   bounded give-ups, retries and an escape hatch to the archive itself — because we measured what
   waits look like.
3. **It gets the licensing and attribution wrong**, or says nothing. WikiBento is built for
   Wikimedia content where the licence, the author and the source are part of the payload, not a
   footnote. A vibe-coded dashboard typically ships first and discovers attribution never.
4. **It is bespoke, so nothing else in it improves.** Every WikiBento widget is registered in one
   manifest, which is what makes a new widget appear automatically in Ask, in the board, in params
   and in the docs — and what lets a *count* be derived rather than typed. A generated dashboard has
   no such substrate; the second dashboard starts from zero.
5. **It cannot be audited or kept honest.** Main carries a **docs-facts gate inside `npm test`**:
   documentation that contradicts the registry fails the build (13 sources must agree on the widget
   counts), every `docs/*.md` must be linked, volatile facts are banned from present-tense docs. We
   found and fixed our *own* gate hole today — `npm test` was exiting 0 with a failing test.
6. **It does not survive contact with the real world.** Kiosk deployment, offline behaviour, the
   12–14K-token Ask prefix against a 16K fallback model, a 32K LiftWing window, CORS that exists on
   one endpoint and not its neighbour, a per-minute budget that keeps us welcome — none of that is
   in the prompt, and all of it is in the repo.

**The one-line thesis:** *the widgets are the demo; the ledger is the product.* Anyone can generate
a dashboard. What is scarce is the accumulated, dated, measured knowledge of how these sources
behave when they misbehave — and the discipline that keeps the interface honest about it.

---

---

## Design wisdom: the interface is a tested artefact, not a mockup

This is the second half of the argument, and it is the half that is easiest to miss because it is
invisible when it works. A generated dashboard is usually *written to look right in the window the
author had open*. What we have instead is a design language plus measurements that make claims about
it checkable:

- **One design language, enforced by tokens.** `src/App.css` uses CSS custom properties for colour,
  spacing and radii (363 `var(--…)` references at the time of writing), so every widget — 40 catalog
  cards, their config panels, their empty/loading/error states — is drawn from the same vocabulary.
  A new widget inherits it; nothing has to be re-decided per screen. That is why a freshly added
  card looks like it was always there, and why dark/light and density changes are one edit rather
  than forty.
- **Responsive is asserted, not assumed.** The panel constitution (`npm run smoke:panels`) forces
  every card to the worst-case `w3 h3` size and requires the ⚙ config and ⓘ info panels to be
  *reachable* at **1440 / 1024 / 600 px** — 240 measurements over the whole catalog, exit 1 on a
  single clipped action, and negative-tested against the pre-fix CSS. "It works on my laptop" is
  replaced by a number that a build can fail on.
- **Three engines, because two of them disagree with Chrome.** `npm run test:browsers` runs
  chromium + firefox + webkit, and the browser matrix defaults to all three
  (`scripts/browser-matrix.mjs --engines`). This is not box-ticking: the single worst bug in our
  history was invisible in Chromium and only reproduced in **Firefox and WebKit** — see the
  2026-09-03 ledger entry below.
- **Real devices, not just viewport emulation.** The iOS Safari report was taken on a phone across
  **two different networks** (Verizon Fios with iCloud Private Relay off, and T-Mobile 5G), with the
  failing and working endpoints tabulated per widget, and the root cause then reproduced on the
  desktop engines. Emulation said everything was fine; the phone said otherwise, and it was right.
- **Venue modes are designed in, not bolted on.** `?lean=1` and `?kiosk=1` presentation modes,
  deep-linkable board state through URL params (so a museum screen can be restored by URL, and a
  tour step is just a link), and params as the touch surface. Kiosk lock is deliberately described
  as *accident-proofing, not a security boundary* — an honest limit rather than a claimed guarantee.
- **Ergonomics that only exist because someone actually used it.** Config panels scroll with a
  sticky action because `overflow: hidden` on a flex item crushed them (21/35 widget types had
  unreachable fields at the fresh-add size, 25/35 at 1024 px) — now a constitution, so it cannot
  regress.

Put plainly: the design layer is *decisions already made and paid for*. A one-off board re-decides
colour, density, empty states, small-screen behaviour, browser quirks and touch affordances in every
session, and re-decides them differently each time.

## The ledger (append-only, dated, with receipts)

Each entry: **what we measured** → **what it changed**. If a later measurement contradicts an entry,
the entry gets a correction note rather than a quiet edit (§5 of the Wayback doc is the model).

### 2026-09-11 · Wayback Machine replay
- **Fact:** the archive's own `Server-Timing` header names the stall — `cdx.remote;dur=` measured
  **7.8 s / 16.4 s / 66.2 s** on three comparable captures, before any content arrives.
  **Changed:** the UI explains a slow tile instead of spinning.
- **Fact:** there is **no progress API** for replay — `Range:` is ignored (asked for 2 KB, got
  898,571 bytes), `im_` is not a screenshot (returns `text/html`), and warming does not help
  (`x-page-cache: HIT`, 0.92 s cold vs 0.99 s warm). **Changed:** we render elapsed time and a
  bounded give-up, never a fake percentage.
- **Fact:** the availability API is **URL-form sensitive** — `nytimes.com` → `{}` where
  `www.nytimes.com` → capture found. **Changed:** both forms are asked; the matched one is replayed
  (a wrong form is a 404 tile).
- **Fact:** a URL with nothing archived cost **74 s** of stacked retries; time-boxing the fallback
  and treating an empty index answer as definitive made it **7.3 s**, and *proven absent* instead of
  *lookup failed*. **Changed:** a 20 s fallback budget, and honest absence.
- **Fact:** the IA calendar's `sparkline` endpoint answers in 0.65–6 s with a real total (17,712 for
  one article; 751,690 for nytimes.com). **Changed:** a count line, so a miss never implies an empty
  archive.
- **Withdrawn:** *"narrow CDX windows are 7–13× cheaper"* — narrow per-date windows measured
  11.8 / 17.1 / 53.5 s against 20.8 s for one wide span on identical dates. Window width is not the
  cost driver. **Changed:** the implementation keeps one span query. (Recorded, not deleted.)

### Earlier, still load-bearing (receipts in-repo)
- **LiftWing Ask budget:** primary model 32K, fallback 16K, `ASK_MAX_TOKENS` 700; the static Ask
  prefix is **≈8.9K tokens** for 38 widgets, ≈9.1K for 39 — deliberately under a 12–14K ceiling.
  *Changed:* the manifest/derived-manual design, so a new widget cannot blow the budget silently.
- **Internet Archive endpoints:** CORS `*` on availability/advancedsearch/views, **not** on CDX;
  `scrape` counts need min 100; `wayback/available` measured 1,783 ms; `services/img` is a direct
  JPEG. *Changed:* the server-side aggregation route, and which endpoints the client calls directly.
- **EventStreams:** 41.8 events/sec in-browser via `EventSource`, CORS `*`, ~5.4 MB/min → 323 MB/hour.
  *Changed:* the feasibility verdict, with the bandwidth cost stated up front.
- **Wikimedia AQS media metrics** are keyed per file+referer, so naive aggregation double-counts.
  *Changed:* the CIM/media widgets' query shape.
- **Playwright on this host:** `npx playwright install <subset>` **prunes** browsers not named in the
  arguments (it deleted the cache the suites were using), and the project's own `smoke-grid.mjs`
  drives a *globally installed* CLI rather than a dependency. *Changed:* the browser tooling skill
  and a `PW_EXECUTABLE_<ENGINE>` hook in the matrix runner.
- **Test-chain integrity:** `npm test` exited 0 with a failing test because the docs-facts gate was
  spliced in with `;`. *Changed:* exit status now reflects tests *and* gate; negative-tested.

### 2026-09-03 · Browser portability — the bug Chrome could not see
- **Fact:** every RESTBase-family fetch (pageviews, Wikistats-adjacent REST, CIM, media list) failed
  on **iOS Safari only**, across two networks, while Action-API calls worked. Root cause found by
  reproducing in **Firefox**: `fetchTextWithRetry` set a **`User-Agent` request header**, which is a
  *forbidden header* — Chromium strips it before the CORS preflight (so requests stayed "simple" and
  Chrome always worked), but **Firefox and WebKit include it in the preflight**, and the REST
  endpoints reject it (RESTBase's allow-list has `api-user-agent`, not `user-agent`; the CIM service
  405s `OPTIONS` outright).
  **Changed:** no custom headers on browser GETs (it was a no-op there anyway — the real UA lives in
  the server relays), and the fix was verified in all three engines. Receipt:
  `docs/BUG-REPORT-ios-safari-fetch.md`.
  **Why it belongs in this ledger:** a dashboard written and checked in Chrome ships *broken on
  iPhones* while looking perfect on the author's screen. This is the clearest case where "it works
  for the person who made it" and "it works for the visitor" diverge.

### 2026-08-16 → 2026-09-08 · Silent caps: the failure mode that never throws
- **Fact:** multi-title GETs have **two independent limits** — URL length (HTTP 414) *and* an
  anonymous `titles` cap of **50** (`toomanyvalues`). Length-only chunking "succeeds" and returns an
  empty `query.pages` with **no error surface**: the GLAM widget reported **0 used files / 0 views**
  while glamtools returned **518 files · 38 used · 40 pages · 110,092 views**.
- **Fact:** our distinct-using-pages cap was **150**, which silently undercounted multi-page
  categories — **MIT OCW lost 879K of its views** in the reporting. Raised to **2,000**.
- **Fact:** **PetScan ignores its own `max`** in quick-intersection mode (`max=100` returned all
  **239,084 files / 39 MB**), so it must go through a capped relay rather than the browser.
- **Fact (same family):** Commons `imageinfo` needs the `File:` prefix re-added after normalization
  (otherwise every title resolves as a missing page and the gallery shows "0 files · N not found"),
  and `formatversion=2` returns canonical titles *with spaces*, so enrichment lookups by the
  underscore form come back empty.
  **Changed:** chunk by `min(count 50, length 4500)`, capped relays for PetScan, prefix-correct
  queries, and lookups by the returned title. **Why it belongs in this ledger:** these all return
  **HTTP 200 with wrong numbers**. A one-shot dashboard cannot tell "nothing there" from "I asked
  wrong", so it shows a confident zero — the worst possible output for a data product, and precisely
  what our own widget did until it was measured against an independent source.

### · CORS is a property of the host, not of "the API"
- **Facts, each verified separately:** Wikimedia Action API → `origin=*`; Wikimedia REST → `*`;
  `api.wikimedia.org` → **reflects the requesting origin** (not `*`); Internet Archive
  `wayback/available` → `*` but **CDX → nothing**; **top.hatnote.com → no CORS at all**; and
  **w.wiki short links are unfollowable from a browser** (the 301 carries `*`, the target page sends
  no CORS headers, and `redirect:'manual'` exposes no `Location`).
  **Changed:** per-source decisions — call it directly, route it through a relay, or use a
  CORS-enabled fallback endpoint; expand short links server-side. The same "API" can be usable on
  one endpoint and unusable on its sibling.

### · Commons Impact Metrics: an allow-list and an ambiguous 404
- **Fact:** CIM serves only ~1,775 allow-listed categories; unregistered categories 404 — and a
  *registered* category with no data for the month returns the **same body**, so the two are
  indistinguishable. New categories go through a Phabricator request, not a template.
  **Changed:** resolve default months through `latestCimMonth()` (never `prevCimMonth()`), and give
  the widget copy that tells the user which case they are in.

### · Two layout traps that look like styling, not bugs
- **Fact:** `overflow: hidden` on a flex item makes `min-height: auto` compute to **0**, crushing
  children to a sliver; and `.grid-item { overflow: hidden }` clipped config panels until they
  scrolled with a sticky action (**21/35 widget types had unreachable fields** at the fresh-add size).
- **Fact:** Playwright coordinate clicks **miss after layout shifts** (images loading change heights),
  which is why our browser checks click through the DOM.
  **Changed:** `flex-shrink: 0` + scrollable panels; a constitution that measures it; DOM-based
  clicking in every smoke suite.

### · QLever cannot label, so we label for it
- **Fact:** QLever **can't run `SERVICE wikibase:label`** (it federates to a dead host), so
  most-depicted-subject queries returned **bare QIDs** — technically correct, useless on a dashboard.
  **Changed:** batched `wbgetentities` label resolution (`props=labels`, ≤50 ids/call) rendered as
  **"Label (QID)"**, keeping the identifier visible for traceability; best-effort, so a label failure
  never fails the query. Same spirit as the licence/attribution rule: show the reader where the fact
  came from.

---

## How to use this document

- **Append, don't rewrite.** New date, new entry, receipt attached. Corrections get their own note
  (a withdrawn claim is more informative than a tidy page).
- **Every entry must name what changed.** A fact that changed nothing is trivia; the ledger is about
  decisions, so it reads as *measured → decided*.
- **Receipts live in the repo**: a `docs/*.md` measurement note, a test, a smoke script, or the
  commit that carries the change. Anything unmeasured goes in as explicitly unverified.
- **This is not a changelog and it must not become one.** An entry earns its place if it changed a
  decision, contradicted a reasonable expectation, or cost real user-visible wrongness. `HANDOFF.md`
  already keeps the *complete* register of gotchas (13 at last count, "don't rediscover these");
  this ledger is the smaller set that says **why those things matter to someone deciding whether to
  build on WikiBento or on a generated one-off**. When in doubt, leave it out.
- **Keep the honest counter-case in view.** For a one-off personal dashboard, an agent generating
  the code is the right answer, and this document is not for that person. It is for the case where
  the board is *published*: it will be visited, it will be wrong sometimes, it will outlive the
  session that made it, and someone will have to maintain it.
