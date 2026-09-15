# WikiBento — Handoff

*The state of the project **now**. History: [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) ·
design rationale: [docs/ISSUES.md](docs/ISSUES.md) · feature docs: [README.md](README.md).*

## What this is

WikiBento is a dark-themed, drag-and-drop widget dashboard for Wikimedia —
"insights and action". A single-page React app (React 19, Vite 8,
react-grid-layout) with **no backend for data**: every live widget fetches
directly from CORS-enabled Wikimedia APIs (RESTBase pageviews, MediaWiki Action
API, Commons, Wikistats, Commons Impact Metrics, WDQS/QLever, MinT). A handful of
static widgets (Text/Markdown, QR, Board Controls, Speaker, Wiki Page, Text List,
and the dataflow nodes) render from config.

Dashboards are JSON configs (format v1) that persist to `localStorage`,
export/import, and load via shareable URLs — embedded in the hash
(`#/d/<base64>`) or fetched from a URL (`?config=<url>`, including on-wiki pages
like `Commons:WikiPortraits/Bento-demo.json`). The Toolforge deployment adds a
few same-origin relays for APIs with no CORS (`/api/proxy`, `/api/resolve`,
`/api/petscan`, `/api/ask`).

## Current state

Feature-complete for v1 and deployed.

| | |
|---|---|
| Live | <https://wikibento.toolforge.org/> |
| production bundle | `index-D9YNjKJA.js` (+ `index-DGfyoQMG.css`) |
| deployed | 2026-09-15 (the Internet Archive pass: `iaBook` with facing pages, the shared page reader, direct-media playback, PNG export for CORS images, two demo boards — see [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md)) |
| registry | 41 widget types — 32 data-driven, 9 static |
| showcase catalog | `?config=/dashboard.json` — 42 widgets covering all 41 types |
| front door for demos | `?config=/demos.json` (the hub) |
| entry board | ✨ Example (3 starter widgets), or `?config=/article-switcher-demo.json` |
| pending deploy | none — production serves this branch's tip (verified live after the deploy) |
| newest capabilities | 📄 **Document Reader** (Commons PDFs and DjVu, sharing one viewer with 📖 IA Book — facing pages in both) · 🎬 archive.org media by URL · ⤓ PNG export for CORS images · 🕰️ Lifeline timelines |

**Every widget type is in the showcase catalog** — no exceptions, and
`scripts/docs-facts.mjs` keeps it that way (it fails the build if a registered
type is missing from `public/dashboard.json` without a reasoned entry in its
`CATALOG_EXCLUSIONS`). The catalog's article switcher is a real board param:
one click re-aims five cards (Excerpt, Quality, Assessments, Edit History,
Gallery).

**Constitutions** (all gate `npm run build`, hence a deploy):

| command | asserts |
|---|---|
| `npm test` | the whole suite (a bundle per constitution area: scope compliance, freshness, manifest compliance, panel/dataflow/demos/assembly/trend-axis/gallery/config-load…) plus `scripts/docs-facts.mjs` |
| `npm run smoke` | grid geometry (measured px vs intended formulas) + `smoke:panels` |
| `npm run smoke:panels` | every ⚙/ⓘ action reachable at w3 h3 across 3 widths |
| `npm run test:browsers` | Chromium + Firefox + WebKit load a dashboard with 0 error frames |
| `node scripts/docs-facts.mjs --live` | the bundle HANDOFF claims is deployed is what production serves |

`public/manifest.json` (the Ask advisor's catalog) and `public/dashboard.json`
(the showcase) are both **derived artifacts** kept honest by tests, so they
cannot drift from `src/widgets/index.js`.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # runs the full suite, then → dist/
npx vite preview       # http://localhost:4173
npm run lint           # oxlint (pre-existing warnings only: vendored pannellum + legacy nits)
```

Demo URLs (against `vite preview`):
`http://localhost:4173/?config=/demos.json` — the hub ·
`http://localhost:4173/?config=/dashboard.json` — the full catalog ·
`http://localhost:4173/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json` — on-wiki config.

## Deploying

Read the `toolforge-nodejs` skill before any `webservice` command (**there is no
`static` webservice type** — this is `node20` serving `dist/` via
`deploy/server.js`), and `docs/DEPLOYMENT.md` for full detail. Fresh-session-safe
shape:

```bash
npm run build
rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"
```

- SSH as the **personal** account (`ssh alih@dev.toolforge.org`) — `tools.wikibento@`
  is not an SSH login and fails with `publickey`. Tool commands go through
  `sudo -niu tools.wikibento` (never `become` over a chained SSH command).
- Host inventory alias: `tools` = `alih@dev.toolforge.org` (use `host_exec`).
- After deploying, verify: the bundle hash in the served `index.html`,
  `/api/resolve` → 200, and `node scripts/docs-facts.mjs --live`.
- Then **update the two lines above** ("production bundle" / "deployed") and add a
  row to `docs/DEPLOYMENTS.md`.
- `public/*.json` changes (`dashboard.json`, the demo boards) ship with a deploy —
  they are not live before one.

## Architecture in one screen

```
App.jsx (state: widgets[] + layout[] + params{}, URL boot, persistence)
├── GridLayout (12 cols, vertical compaction, single column under 768px)
│   └── WidgetFrame × N (fetch lifecycle, request-serial guard, ⚙ panel, emit publisher)
│       └── renderer: StatCard | RankingCard | TrendCard | GlamCard | MarkdownCard | …
├── AddWidgetPanel / ImportPanel / SharePanel / AboutPanel
└── src/widgets/index.js — WIDGET_TYPES registry (THE extension point)
    each entry: { id, name, icon, category, defaults, configFields, fetch, transform,
                  renderer, timeScope, emit?, source?, defaultLayout?, autoHeight?,
                  labelFromConfig?, getRenderer? }
    fetch → raw data; transform → renderer contract; WidgetFrame owns loading/error/retry
    static widgets (markdown, qrCode, speaker, boardControls, dataflow nodes) omit `fetch`
    emit → publishes output for dataflow consumers (a `source` field / {{widget:id}})
```

Key files: `src/widgets/index.js` (registry) · `src/widgets/dataSources.js`
(fetchers, one per type, batched) · `src/widgets/WidgetFrame.jsx` (lifecycle +
renderers) · `src/lib/dashboardConfig.js` (format + `validateDashboard()` + the
example board) · `src/lib/params.js` (board params, reference resolution) ·
`src/lib/dataflow.js` (emitter signatures) · `src/lib/httpRetry.js` (rate-limit
layer) · `src/lib/markdown.js` · `src/lib/share.js` · `deploy/server.js`
(relays) · `scripts/docs-facts.mjs` (docs↔code constitution).

Docs worth knowing: `docs/GUIDE.md` (user model: board params vs widget config vs
dataflow) · `docs/BOARD-COMPOSITION.md` (complete wiring reference, LLM-parseable) ·
`docs/JSON-FORMAT.md` + `dashboard.schema.json` · `docs/DATA-SOURCES.md` ·
`docs/ARCHITECTURE.md` (incl. the third-party API-contract watchlist) ·
`docs/WIDGET-DEVELOPMENT.md` (how to add a type) · `docs/MEDIA-DATAFLOW.md`
(design direction: should graphics travel the wire?) · `docs/DEMO-IDEAS.md` ·
`docs/ROADMAP.md` · `docs/ISSUES.md` (canonical tracker). The long lists live in their
own files now — `docs/WIDGET-CATALOG.md` (every widget, what it shows, its API),
`docs/VERIFIED-WORKING.md` (the dated smoke-test record), `docs/BROWSER-TESTING.md`
(the browser suites + engine-install traps), `docs/EXPORT.md` (the export formats, and why PNG of an HTML
widget is not a server feature) and `docs/LIFELINE-WIDGET.md` (the timeline renderer, with the measured
Wikidata-vs-prose coverage) — so the README stays a front door.

**Doc convention: append-only applies to exactly two files.** `docs/DEPLOYMENTS.md` (the
deploy log) and `docs/WHY-WIKIBENTO.md` (the measured ledger, where a claim is added with
its receipt and never quietly revised). Every other document — including the README and
`docs/TUTORIAL-VIDEO-STATUS.md` — is **edited in place**: cut, merge, rewrite, and delete
what has stopped being true. A record of what happened may only grow; a description of what
is must be allowed to shrink, or the README becomes a changelog and stops being a front door
(which is exactly what happened: it reached 639 lines, ~250 of them an appended test log).

## Hard-won gotchas (don't rediscover these)

1. **`exturlusage` clamps `eulimit` to 500** for non-bot users (verified:
   `eulimit=5000` returns 500 + a warning). The fetcher paginates 10 pages =
   5,000, matching Special:LinkSearch. `eunamespace=0` gives article-space-only counts.
2. **Commons `prop=globalusage` entries have NO `ns` field**
   (keys: title/url/wiki only). The GLAM widget's article-space filter uses a
   URL-path namespace heuristic (`NON_ARTICLE_NS` in `dataSources.js`); localized
   namespace names (`Diskussion:`, `ノート:`) are conservatively counted as articles.
3. **PetScan ignores the `max` cap** in quick-intersection mode (`max=100` →
   all 239,084 files, 39 MB). Never call PetScan directly from the app for big
   categories — go through the `/api/petscan` relay, which is capped.
4. **Multi-title GETs have two independent limits.** Long filenames blow the URL
   (HTTP 414) → batch by *encoded length* (~4,500 chars). **But** the anonymous
   `titles` cap is **50** per query (`toomanyvalues`; lowlimit 50 / highlimit 500
   for bots) — length-only chunking silently breaks when short filenames pack 70+
   titles into one chunk (every query returns empty `query.pages`, with **no error
   surface**). Chunk by **min(count 50, length 4,500)**. This cost a real bug:
   the GLAM widget reported 0 used/0 views while glamtools returned 518 files ·
   38 used · 40 pages · 110,092 views.
5. **Commons Impact Metrics is allow-list only.** Unregistered categories 404 with
   "the category you asked for is not loaded yet" (the allow list is a published
   TSV of ~1,775 primary categories; additions go through a **Phabricator
   request**, project `Commons-Impact-Metrics-Requests`, by the 20th — **not** the
   `{{Views from category}}` template, which is the unrelated legacy
   category-page-views system) — and that 404 is *ambiguous*:
   a registered category with no data for the month returns the same body. Default
   months must resolve through `latestCimMonth()`, never `prevCimMonth()`.
6. **Playwright coordinate clicks miss after layout shifts** (images loading change
   widget heights). Click via JS (`element.click()`) or re-snapshot, not stale refs.
7. **Wikimedia API etiquette**: pace requests (≥1s), use `$WIKIMEDIA_USER_AGENT`,
   honor 429 `Retry-After`; batch 50 titles/call. See `docs/SCALABILITY.md`.
   From browsers, set **no custom fetch headers** — a `User-Agent` header triggers
   a preflight that RESTBase rejects (see the Firefox/Safari entry in
   `docs/BUG-REPORT-ios-safari-fetch.md`).
8. **top.hatnote.com has NO CORS headers** — the Toolforge deployment fetches it
   through `/api/proxy`; elsewhere the widget falls back to the CORS-enabled WMF
   Pageviews `top` endpoint. Data updates ~02:00 UTC; month/day in URLs are **not**
   zero-padded; there is no "latest" path — back off from today.
9. **w.wiki redirects are browser-unfollowable to wiki pages**: the 301 carries
   `Access-Control-Allow-Origin: *`, but the target page sends no CORS headers, so
   `fetch()` fails and `redirect:'manual'` exposes no `Location`. Expand
   server-side via `/api/resolve`.
10. **CSS: `overflow: hidden` on a flex item makes `min-height: auto` compute to 0** —
    a fixed-height flex column crushes such children to a sliver when content
    overflows. Fix: `flex-shrink: 0` on children and let the container scroll.
    (Same family: `.grid-item { overflow: hidden }` clipped config panels until
    ISSUE-54 made them scroll with a sticky action.)
11. **A stale `index.html` bites after deploys** — `rsync --delete` removes old
    bundles, so a cached `index.html` 404s. It is served `Cache-Control: no-cache`
    (assets stay immutable); hard-refresh (⌘⇧R) if a deploy looks missing.
12. **Commons `imageinfo` needs the `File:` prefix re-added after normalization**:
    strip it for display, but query titles must be `File:Title` — without the
    prefix every title resolves as a missing main-namespace page and the gallery
    silently shows "0 files · N not found".
13. **`formatversion=2` returns canonical titles WITH spaces** even when you query
    `Ada_Lovelace` — look up batched enrichment results by the *returned* title,
    not the underscore form (the Article List enrichment returned empty
    thumbs/extracts until this was fixed).

14. **Wikidata labels need `mul`, or Marie Curie renders as `Q7186`.** Names that are identical in every
    language live under Wikidata's language-neutral **`mul`** code, and those items have **no `en` label at
    all** (Q7186: 247 sitelinks, an English *description*, nothing under `en`). So
    `wbgetentities&props=labels&languages=en` *and* WDQS's `wikibase:label` with `"en"` both hand back the
    bare QID — silently, because a QID is a perfectly valid-looking cell. Request `<lang>|en|mul` (Action
    API) and `"en,mul"` (label service) and read `mul` last. `wbsearchentities` is exempt: it matches across
    languages (verified with `strictlanguage=1`). This was live in *every* entity-labelling widget until
    2026-09-14; `tests/wikidata-labels.test.mjs` now fails the build if a label lookup forgets.
15. **Rewriting a region of a file can silently delete a component.** A region rewrite of `WidgetFrame.jsx`
    took `BarCard` out while the SPARQL registry still pointed at it, so every bar-rendered query threw
    `ReferenceError` — swallowed by the widget error boundary as "Try Again", green test suite, three commits
    on `main` (never production, which predated the commit). `tests/renderer-registry.test.mjs` now asserts
    that every renderer named in the registry — and every card the dispatcher switches on — exists. Lesson:
    after replacing a block of a source file, grep for what *was* inside it.
16. **Never truncate text in the data layer.** Timeline labels were clipped to 36 characters in the layout
    module *before* rendering, so "October 1944 · lived in Bergen-Belsen concentration camp" kept its
    ellipsis at **every** zoom level — and the check written to catch truncation measured *layout* overflow,
    which reported zero, because the shortened string fitted. Clip in CSS (where zoom can widen it) and keep
    the full string for the tooltip.

17. **For Internet Archive books, the manifest is the truth and the leaf numbering will bite you.** The
    item metadata disagreed with the manifest (20 vs **16 canvases**) and nothing looked broken;
    `…/iiif/{id}$0/full/…` is an **HTTP 500** (that route is 1-based while canvas ids are 0-based); an
    **out-of-range leaf is not an error** — `$20` on a 16-page book returns HTTP 200 with a ~1.4 KB
    **blank filler image**, so probing for a 404 never fails; and `download/{id}/page/n{N}.jpg` is 0-based
    and 404s on the last leaf, disagreeing with the IIIF route. Read the manifest, use each canvas's own
    image-service id, and never build `$N` URLs. (Each book's IIIF **Content Search** is also the only
    search-inside route a browser can reach — the standalone FTS host does not resolve.)

18. **Playwright: `waitForFunction(fn, arg, options)`** — the second parameter is the ARGUMENT, so
    `waitForFunction(fn, { timeout: 90000 })` silently passes an object to your predicate and leaves the
    default 30 s timeout. Passing `undefined` for the arg (or a long timeout may never apply) costs a
    confusing "Timeout 30000ms exceeded" on a wait you believe you raised. Same family: `locator.click({
    force: true })` skips the scroll-into-view, so a click on an element **below the fold** dispatches at
    coordinates nothing occupies and does nothing — drive it through the DOM instead
    (`el.click()` inside `page.evaluate`) when the test is about behaviour rather than clickability.

19. **A Commons document page render exists only at certain widths, and an invented one is an HTTP 400 that
    browsers hide.** Measured identically on a PDF and a DjVu: **120 · 250 · 330 · 500 · 960 · 1280** are
    served; **70, 150, 200, 320, 400, 640, 700, 800, 1024, 1200 return an HTML error page**, which Chrome
    then refuses to give to an `<img>` at all — `net::ERR_BLOCKED_BY_ORB`, a blank page with no visible
    reason. It is not MediaWiki's image-thumb set (150/200/400/640/800/1024 are standard image widths and all
    fail here). `iiurlwidth` is the safe route because the API **rewrites** to a legal width (320 → 330,
    700 → 960), which is why the source advertises `caps.widths` and the reader's ladder is built from that
    list. Related: document renders top out at 960, and a document strip needs 120, not the IA reader's 70.

## Open issues & known bugs

Tracked design work is `docs/ISSUES.md`; the plan is `docs/ROADMAP.md`. What is
actually broken or unfinished today:

- **Reset doesn't stick on a URL-loaded board.** ↺ Reset clears `localStorage` and
  restores the defaults, but a page loaded via `?config=…` / `#/d/<base64>` /
  a w.wiki share link re-applies the URL config on refresh (URL > localStorage >
  defaults). Fix: `handleReset` should also blank the URL params
  (`history.replaceState` to the bare path).
- **`public/dashboard.json`'s authored layout overlaps itself.** `fileusage`
  (x9 y14 w3 h5 → occupies through row 18) and `topwikis` (x9 y18 w4 h4) collide;
  react-grid-layout pushes items apart so the *rendered* board is fine, but the
  authored file contradicts itself and nothing checks. Worth a no-overlap
  assertion in the demos constitution, plus a one-line fix.
- **Don't diagnose an artifact diff without pinning the commit.** A rebuild of the
  working tree did not match the deployed bundle, which invited a "toolchain drift"
  explanation — but `HEAD` had moved past the **deployed commit**, and the 🔳 QR
  widget (PR #47) had never been deployed. Rebuilding the deployed commit with the
  same toolchain reproduced the live bundle byte-for-byte, so nothing had drifted.
  Before comparing an artifact to a rebuild, pin the commit
  (`git log --oneline <deployed-commit>..origin/main` shows what is merged but not
  live) — the worked numbers live in `docs/DEPLOYMENTS.md`.
- **PNG of an arbitrary widget is a decision, not an oversight.** Client-side PNG works only where a widget
  draws itself as SVG: Chromium taints a canvas for any SVG containing a `foreignObject` (measured — even
  one holding just `<p>hello</p>`), so an HTML/CSS card can produce a valid .svg but never a .png in the
  page. A server-side render service was considered and **rejected** on 2026-09-14 (four costs: re-fetching
  the whole board per image from a shared Toolforge IP, a browser in a 1 Gi pod parsing untrusted content, a
  permanent patching liability, and it would be a *re-render* rather than a capture of the user's view). The
  reasoning, the alternatives and the trigger for revisiting are in [docs/ISSUES.md](docs/ISSUES.md)
  ISSUE-79 and [docs/EXPORT.md](docs/EXPORT.md).
- **AddWidgetPanel** has no Escape-to-close and no focus trap (SharePanel has
  Escape-to-close).
- **Wikistats CSV parser is naive** (no quoted-field handling) — fetching is cached
  and retried, but the parse still assumes no commas in fields.
- **`handleLayoutChange` persists to `localStorage` on every drag tick** — fine at
  the current payload size, wasteful as boards grow.
- **Two pre-existing dev-only React warnings** (cosmetic, 2-line fixes, no
  production impact): the toolbar's ✨ Ask button is nested inside the + Add Widget
  button (`App.jsx:489` — invalid HTML; browsers auto-split them), and the media
  player spreads a `key` inside `mediaProps` into `<audio>`/`<video>`
  (`WidgetFrame.jsx:1604`).

## Next steps

Roadmap detail in `docs/ROADMAP.md`; the design ideas below are specced there.

1. **Deploy the pending catalog/docs change**, then update the two state lines above
   and append to `docs/DEPLOYMENTS.md`.
2. **Tier-A wiring view** — a derived, read-only map of who drives whom on a board.
   Fully specced in `docs/MODULARITY-AND-DATAFLOW.md` §Part 6, not started. This is
   the biggest remaining UX gap now that params and dataflow both ship.
3. **Open widget designs**: ISSUE-41 (board templating), ISSUE-42 (five content
   primitives), ISSUE-43 (`model3D`, the missing fifth primitive — needs CORS on
   Objectium's `/file` + `/thumbnail` routes, or a proxy), ISSUE-48 (media player
   poster frames), ISSUE-49 (TimedText subtitles).
4. **ROADMAP phases**: Phase 1 (time-range selectors, CIM-first GLAM mode),
   Phase 1.5 (batching/efficiency layer), Phase 2 (map + force-graph renderers),
   Phase 2.5 (board-to-board navigation + the Stage & Scene immersion layer).
5. **Quick win**: a Wiki Edu campaign widget — dashboard.wikiedu.org exposes
   CORS-enabled JSON (`/campaigns/{slug}.json`, `/users.json`); verified endpoints
   in `docs/WIDGET-IDEAS.md`.
6. **Demo suite** grows from `docs/DEMO-IDEAS.md` (11 concepts A–K with wiring,
   venue and effort).

## Identity & attribution

- Author: **Andrew Lih** — Wikipedia/Commons username **User:Fuzheado**
- Use `User:Fuzheado` in User-Agents and on-wiki pages; **never** `User:AndrewLih`
  (old alias). See `docs/AUTHORS.md`; the identity is also in `~/.pi/agent/AGENTS.md`.

## External contributions

Public feature requests and bug reports arrive via **GitHub Issues** (templates in
`.github/ISSUE_TEMPLATE/`). Triage flow: duplicate/clarify → move accepted items
into `docs/ISSUES.md` with the next ISSUE-NN number → roadmap/ship per the usual
process. `docs/ISSUES.md` is the canonical internal tracker.

## Session notes for AI agents

- **LiftWing LLM testing (benchmarks, scoring loops): use the "Toolforge trick"** —
  the public endpoint is ~90–100 requests/hour per IP, but running the same call
  from `ssh alih@dev.toolforge.org` (bastion egress on WMF's higher tier) is
  effectively unlimited at ~140 ms/request. Base64-encode the payload over the SSH
  hop. Ready-made: `scripts/benchmark-ask-variants.mjs --via toolforge` and
  `scripts/probe-ask-edge.mjs`; canonical write-up in the `wikimedia-ml-services`
  skill and `docs/DATA-SOURCES.md`.
- **Docs have a constitution now.** `scripts/docs-facts.mjs` derives the truth
  (registry counts, catalog coverage, the panel-measurement count, build-size
  magnitude) and fails the build when prose contradicts it. Volatile facts are
  banned from README/HANDOFF: no bare git SHAs, no running test totals, no
  decimal-precise byte sizes — put history in `docs/DEPLOYMENTS.md` and design
  rationale in `docs/ISSUES.md`, and fix counts *by running the script*, not by
  guessing. `--live` verifies the deployed bundle.
- The LLM wiki (`~/.llm-wiki`) has observations from this project's development
  (search `wikiwidget`, `wikibento`, `commons-impact-metrics`).
- Relevant skills: `toolforge-nodejs` (**read before any `webservice` command**),
  `wikimedia-toolforge`, `wikimedia-commons` (incl. Commons Impact Metrics),
  `wikimedia-api-access`, `commons-file-resolution`, `wikimedia-api-strategy`,
  `playwright-cli`, `cross-browser-testing`, `browser-ux-debugging`.
- **Widget ideas bank:** `docs/WIDGET-IDEAS.md` — unprioritized proposals with
  verified API/CORS notes; move to `docs/ROADMAP.md` when scheduled.
- **Ask-advisor benchmarks:** `bench/README.md` + `bench/results/` (date-prefixed).
  Prompt changes should be re-measured — single-shot runs wobble ±7%, so repeat
  before claiming a regression. Fixtures: `tests/intent-fixtures.mjs`,
  `tests/board-fixtures.mjs`, `tests/fixture-*.mjs`.
- **The on-wiki demo config is `Commons:WikiPortraits/Bento-demo.json`** — the
  WikiPortraits project hosts it; coordinate changes with that page's editors. Its
  size tracks that page, not this repo.

## Tutorial video (state as of 2026-09-12)

> **Picking this up? Read [`docs/TUTORIAL-VIDEO-STATUS.md`](docs/TUTORIAL-VIDEO-STATUS.md) first** — it opens
> with a five-step "if you are picking this up", then the layout, the costs, and what is still missing.
> The reusable technique (and every trap paid for) is the skill at
> `~/.pi/agent/skills/narrated-tutorial-video/SKILL.md`; the engine's contract is
> [`pipeline/README.md`](pipeline/README.md).

**Two layers.** `pipeline/` is the engine (beats, voiceover, overlays, encoding, review) and holds **no
WikiBento strings**; `video/` is this project (script, scene plan, `demo.config.mjs`, `actions.mjs`). A second
project copies `video/` and leaves `pipeline/` alone. npm scripts `tutorial:beats|narrate|record|build|review`
each pass `--config video/demo.config.mjs`.

**Current take:** 2:42, `~/Movies/wikibento-tutorial-latest.mp4` (timestamped versions kept beside it; the
`~/Movies` copies are not in git). Verified end to end, including that each scene shows what its narration
claims: scene 1 clicks a subject and the board ripples to Marie Curie, scene 5 really drags a widget, scene 3's
Reset dialog is on screen while its options are described.

**Cheap to iterate:** `build` is per-chapter cached — a caption edit ≈ 18s, a scene re-record + build ≈ 1 min,
a full rebuild ≈ 90s. Changing only words needs no re-recording at all.

**Open, and none of it blocks a re-make:** sound effects (2 🔊 markers need post-production — nothing records
audio from the browser); the per-scene `note` line still lives in `video/scenes.json` rather than the script;
removing a widget is now only visible, not taught; the "another service" line waits on one extra widget on the
demo board; and the take is not published anywhere yet — record the URL here when it is.

**Decisions worth not re-litigating:** two ffmpegs on purpose (Playwright's own for recording, the system one
for assembling); text is rendered by a browser, never by ffmpeg (this machine's ffmpeg has no text filters at
all); fx runs in-page so magnified text stays crisp; the script owns the words, captions and markers, and
`scenes.json` keeps only what prose cannot express.
