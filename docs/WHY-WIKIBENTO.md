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

---

## How to use this document

- **Append, don't rewrite.** New date, new entry, receipt attached. Corrections get their own note
  (a withdrawn claim is more informative than a tidy page).
- **Every entry must name what changed.** A fact that changed nothing is trivia; the ledger is about
  decisions, so it reads as *measured → decided*.
- **Receipts live in the repo**: a `docs/*.md` measurement note, a test, a smoke script, or the
  commit that carries the change. Anything unmeasured goes in as explicitly unverified.
- **Keep the honest counter-case in view.** For a one-off personal dashboard, an agent generating
  the code is the right answer, and this document is not for that person. It is for the case where
  the board is *published*: it will be visited, it will be wrong sometimes, it will outlive the
  session that made it, and someone will have to maintain it.
