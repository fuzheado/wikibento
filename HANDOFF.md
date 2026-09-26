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
| production bundle | `index-DqSsco_i.js` (+ `index-BCZUdYtv.css`) |
| deployed | 2026-09-24 — **pick mode, and the two bugs it found** (ISSUE-114/117/118): 🖌 **Pick ▾** arms a widget type and each click on a row or tile places a card for that item; four more renderers publish (a row whose own link is a Wikipedia article or a Commons file declares its own kind); and two reported refusals were fixed — a second item of the same kind was called a duplicate (the dedupe compared fields the pick was not about), and an article was refused by the Wiki Page brush because the kind vocabulary is a hierarchy, not a set of labels. |
| registry | 41 widget types — 32 data-driven, 9 static |
| showcase catalog | `?config=/dashboard.json` — 42 widgets covering all 41 types |
| front door for demos | `?config=/demos.json` (the hub) |
| entry board | ✨ Example (3 starter widgets), or `?config=/article-switcher-demo.json` |
| pending deploy | none — production serves this branch's tip; verified by generating and reading the PDFs (Met demo: Board 5 pages, Poster **1 page**, Document **7**; every image loaded, no overlap, no card reflowed) |
| newest capabilities | 📰 **A wiki page in a card, and the picker feeds it** (ISSUE-123) — the Wikipedia Box renders any page by title (the lead, a section by number or heading, or all of it), styled for reading; and because its page field declares a kind, the pick menu now offers the box, so clicking an article link with that brush armed places a card rendering that article. `?config=/wiki-page-demo.json` · 🎞 **Story mode** (ISSUE-119) — any gallery can present an article's images as one continuous scroll, each panel chosen by the image's own shape, with the article's sections as chapters; `?kiosk=1` with one tall card is the way to show it. Ported from the Met/Google-Arts-&-Culture prototype, verified 7/7 by `npm run smoke:story`. · 🖌 **Pick mode** (ISSUE-114) — a power-user verb beside **+ Add Widget**: choose a widget type once ("Article Excerpt", "Gallery", "Wiki Page"…), then click items in the cards you are already reading. The brush persists across clicks, the toast names the item and offers Undo, and the menu offers only types that can consume what you clicked. |

Pick mode is the newest verb (ISSUE-114). 🖌 **Pick ▾** in the header arms a widget type, and each
click on an item inside a card places a card for that item — the brush persists, so six excerpts from one
list of links is six clicks and no dialog. The menu only offers types that can consume what you clicked; a
row whose own link is a Wikipedia article or a Commons file declares its own kind, which is what made
rankings, top-pages rows, CIM file rows and GLAM filmstrips pickable at once. `npm run smoke:pick` asserts
the interaction and every publisher (19 checks) in a real browser, and it refuses to run at all against a
`dist/` older than `src/`.

**Every widget type is in the showcase catalog** — no exceptions, and
`scripts/docs-facts.mjs` keeps it that way (it fails the build if a registered
type is missing from `public/dashboard.json` without a reasoned entry in its
`CATALOG_EXCLUSIONS`). The catalog's article switcher is a real board param:
one click re-aims five cards (Excerpt, Quality, Assessments, Edit History,
Gallery).

**Constitutions** (all gate `npm run build`, hence a deploy):

| command | asserts |
|---|---|
| `npm test` | the whole suite — a bundle per constitution area: scope, freshness, manifest compliance (including **emitters, channels, `primary`, prose→reference, and the project picker's no-hardcoded-lists rule**), panel, dataflow, demos, assembly, trend-axis, gallery, config-load, references, projects, URL state… — plus `scripts/docs-facts.mjs` — and it now ends by **loading what it built** (`npm run smoke:built`): a browser opens a board in `dist/` and requires cards with no page errors, so a green suite cannot hide an app that throws in the built bundle. |
| `npm run smoke` | grid geometry (measured px vs intended formulas) + `smoke:panels` |
| `npm run smoke:panels` | every ⚙/ⓘ action reachable at w3 h3 across 3 widths |
| `npm run smoke:iabook` | the 📖 Internet Archive reader in a real browser — 33 assertions: the manifest's page count (not the metadata's), search-inside with the word boxed on the page, facing pages, right-to-left order, PNG export |
| `npm run smoke:document` | the 📄 Commons document reader — 37 assertions: page counts from `imageinfo`, the served-width ceiling, the DjVu, the polite refusal of a non-document, and the Wikisource panel open on load and following the page turn |
| `npm run smoke:story` | story mode end to end — a story card for a real article pasted in through ⬆ Import: the panel mix (a mix dominated by one kind means the shape data never arrived), caption coverage, chapters, the progress bar, and screenshots |
| `npm run smoke:pick` | pick mode end to end in a real browser — arm a brush, place a card from a row, refuse a twin, Undo it, the kind gate, and each publisher: 19 checks, against the built app or against production with `--base` |
| `npm run test:browsers` | Chromium + Firefox + WebKit load a dashboard with 0 error frames |
| `npm run test:browsers:demos` | **every demo board** (19 of them, including the full-catalog board) × every engine × desktop **and** an iPhone profile — asserting a card per widget, no error frames, no console errors, no collapsed card, no `—` placeholder and no empty ranking. ~8–20 min, so it is a release check, not a per-commit one |
| `npm run smoke:url` | the URL tells the truth: a claim is dropped when the board diverges, Share embeds the board on screen, present params stay opt-in and reversible (9 actions traced) |
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
App.jsx (state: widgets[] + layout[] + params{}, URL boot, borrowed-vs-adopted
persistence, claim drop on divergence)
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

Key files: `src/lib/urlState.js` (the URL contract: one reader, one writer, claim
integrity) · `src/lib/borrowedBoard.js` (borrowed boards, the recovery stash, the
notice's rule) · `src/lib/reference.js` (a page plus its wiki: `enwiki:Weddell Sea`,
and the one project→host mapping) · `src/lib/projects.js` (every wiki, ordered
recency → default → curated → rest) · `src/lib/wikiBox.js` (rendering a wiki template:
sanitise, scope, rewrite, and what a click means) · `src/lib/speech.js` (the typed speech value — text + language — and choosing a voice by language) · `src/lib/paramSources.js` (the validated lookup sources: Commons categories, galleries, files, articles, QIDs) · `src/widgets/index.js` (registry) · `src/widgets/dataSources.js`
(fetchers, one per type, batched) · `src/widgets/WidgetFrame.jsx` (lifecycle +
renderers) · `src/lib/dashboardConfig.js` (format + `validateDashboard()` + the
example board) · `src/lib/params.js` (board params, reference resolution) ·
`src/lib/dataflow.js` (emitter signatures) · `src/lib/httpRetry.js` (rate-limit
layer) · `src/lib/markdown.js` · `src/lib/share.js` · `src/components/ProjectField.jsx` (the shared project
picker, used by widget ⚙ panels and Settings) · `src/components/SettingsPanel.jsx` (⚙ — your wiki, recents,
present-mode fullscreen) · `src/components/BoardNotice.jsx` (the borrowed/recover bar) · `deploy/server.js`
(relays) · `scripts/docs-facts.mjs` (docs↔code constitution).

Docs worth knowing: `docs/GUIDE.md` (user model: board params vs widget config vs
dataflow) and its sequel `docs/WIRING-BOARDS.md` (sources, consumers, channels, references — and what a value is) ·
`docs/BOARD-COMPOSITION.md` (complete wiring reference, LLM-parseable) ·
`docs/JSON-FORMAT.md` + `dashboard.schema.json` · `docs/DATA-SOURCES.md` ·
`docs/ARCHITECTURE.md` (incl. the third-party API-contract watchlist) ·
`docs/WIDGET-DEVELOPMENT.md` (how to add a type) · `docs/MEDIA-DATAFLOW.md`
(design direction: should graphics travel the wire?) · `docs/DEMO-IDEAS.md` ·
`docs/ROADMAP.md` · `docs/ISSUES.md` (canonical tracker). The long lists live in their
own files now — `docs/WIDGET-CATALOG.md` (every widget, what it shows, its API),
`docs/VERIFIED-WORKING.md` (the dated smoke-test record), `docs/BROWSER-TESTING.md`
(the browser suites + engine-install traps), `docs/EXPORT.md` (the export formats, and why PNG of an HTML
widget is not a server feature) · `docs/URL-STATE.md` (what the address bar may claim — the six rules, the
action-by-action inventory, and the audit that enforces them) and `docs/LIFELINE-WIDGET.md` (the timeline renderer, with the measured
Wikidata-vs-prose coverage) — so the README stays a front door.

**Doc convention: append-only applies to exactly two files.** `docs/DEPLOYMENTS.md` (the
deploy log) and `docs/WHY-WIKIBENTO.md` (the measured ledger, where a claim is added with
its receipt and never quietly revised). Every other document — including the README and
`docs/TUTORIAL-VIDEO-STATUS.md` — is **edited in place**: cut, merge, rewrite, and delete
what has stopped being true. A record of what happened may only grow; a description of what
is must be allowed to shrink, or the README becomes a changelog and stops being a front door
(which is exactly what happened: it reached 639 lines, ~250 of them an appended test log).

## Hard-won gotchas (don't rediscover these)

36. **A field whose box is empty while the card shows data is a lie about the widget.** Two of the ways that
   happens are invisible in code review: `configFieldValue` not consulting the registry default (so a boolean
   defaulting to `true` renders CHECKED and shows UNCHECKED), and a value that comes from the BOARD (the
   Board Controls `spec` is the editor for the dashboard's `params` block, so reading back needs the board's
   context, not the widget's config). `tests/config-fields.test.mjs` now sweeps every registry field for the
   first, and asserts the reporter's own board for the second.
37. **Check that a build produced a NEW asset filename.** A JSX error meant `vite build` had been failing
   while the tests kept passing; `dist/` still held the previous bundle, so a deploy shipped old code and a
   whole round of measurements described something that was never served. `npx vite build` is quick — run it
   and compare the filename in `dist/assets/` before believing any measurement or writing it into HANDOFF.
35. **A `srcset` whose `sizes` arrives a frame later is worse than no `srcset`.** With width descriptors and
   no `sizes`, the browser assumes 100vw, fetches the largest candidate, then fetches AGAIN once `sizes`
   appears — measured as 72 requests for 36 tiles, i.e. both renditions of every image. Measure the container
   before the `<img>` mounts (a `ResizeObserver` runs before paint, so nothing is seen), and always ship
   `srcset` and `sizes` together. Related measurement trap: `encodedBodySize` counts cache hits, so use
   `transferSize` in a FRESH browser when comparing before/after — the first attempt reported a 100% saving
   that was entirely the disk cache.
34. **`width: 100%` + `aspect-ratio` on an image inside a grid row sized `auto` is a cyclic dependency.**
   The row asks the image its height, the height depends on a column width the row has not decided, and the
   browser falls back to the image's INTRINSIC size — nothing, for a lazy-loaded image — and never re-expands
   when it arrives. A gallery grid did this, and `overflow: hidden` on the tile turned every image into a
   thin band (ISSUE-107). Give the image a **definite** height and the rows `min-content`; do not reach for
   `min-height: 0` on the tile, which is what *permits* a row shorter than its content.
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

20. **A Wikisource transcription is not a proofread text — carry the grade with the words.** When a Commons
    document has a `Page:` transcription, one `prop=proofread|revisions` call returns the text *and* its
    quality (`{"quality": 1, "quality_text": "Not proofread"}`). Measured: the 1926 Britannica Supplement's
    1,208 pages are all **level 1** — bulk-imported OCR, never human-checked. Print the grade above the text
    (`uncorrected OCR` at level 1) or the panel invites someone to quote OCR as the edition. Two measured
    cases: a 1,208-page bulk-OCR reference set (level 1) and a 38-page validated pamphlet (level 4) — **use
    the small one as a fixture** and keep the big one for measurements. Also: a
    transcription is detected by a `Page:`/`Index:` usage on a Wikisource (`globalusage`, ns 104/106) — being
    *linked* from a Wikisource article is not one — and `prop=proofread` on an `Index:` page returns nothing,
    so grades only come per page.

21. **react-grid-layout reports *lifecycle* events that look exactly like user actions.** Two traps, each of
which silently changed behaviour until an audit caught it, and both the same root cause: at mount RGL **fills
gaps in an authored layout** and reports `onLayoutChange`, and RGL 2.2 also fires a drag/resize **stop**
handler once while placing the board. So "the layout changed" and "the user dragged something" can both be
true on a board nobody has touched. What that cost: the URL's board claim was dropped on arrival (ISSUE-87),
and a borrowed board *adopted itself* before the visitor edited anything (ISSUE-88). The rules that now hold:
a mount-time placement is never an edit; the discriminator for a real gesture is `onDragStart` /
`onResizeStart` (a *start* cannot happen without a pointer); and arrangement is excluded from the board
fingerprint entirely. Generalisation worth keeping: **when a library reports an event, ask whether it can fire
without a user** — driving the real app is what found both.

22. **Read what you must protect at boot, not in the path that applies a board.** A `useRef` does not
survive a navigation, and on a `?config=` load the "load the saved board" branch never runs — so the first
attempt at ISSUE-88 adopted a borrowed board while holding `null` as "the board being displaced", and the
visitor's board was written over with nothing stashed. Whose board is saved is now read *first and
unconditionally* at the top of boot. Same shape as the state-ordering rules elsewhere in this file: **the
thing that must not be lost has to be captured before the thing that might lose it.**

23. **A `CompressionStream` deadlocks if you close the writer before reading the readable.** It backpressures:
if nobody consumes `readable`, the queue fills and `await writer.close()` never resolves — no error, no
warning, a promise that simply never settles. Measured while building the compressed share link (ISSUE-89):
1.6 KB of gzip hung, a 15-byte test string did not, and **Node does not reproduce it**, so the unit tests
passed while the app quietly fell back to the uncompressed link and rendered no QR. The shape that works —
read first, write and close concurrently, await both:
`const consumed = new Response(cs.readable).arrayBuffer(); const writer = cs.writable.getWriter(); await Promise.all([writeAndClose(), consumed])`.
Two habits from the hunt, both worth keeping: when a promise never settles, **probe each step** (an array on
`globalThis` beats console logging here, because a rejected effect promise is swallowed by its own `.catch`);
and a stream pipeline that works in Node is not evidence about a browser.

24. **A template's *wrapper* and its *content* are different pages, and only one of them renders off the Main
    Page.** Measured: `{{Picture of the day}}` and `{{On this day}}` return an `imbox`/`tmbox` maintenance notice
    ("This image was selected as picture of the day…") when parsed anywhere else — while the dated subpages
    `{{POTD/2026-09-16}}` and `{{Wikipedia:Selected anniversaries/September 16}}` return the real boxes. Related,
    and the reason to reach for `action=parse&text=` rather than `page=`: parsing a *transclusion* skips
    `<noinclude>`, so a template's documentation box and categories stay out of the result. Both were found by
    driving the widget and *looking* at the card — the HTML was valid and the notice was invisible to every unit
    test. Generalisation: when a wiki page renders "something", check whether it renders the same thing in your
    context.

25. **`{{CURRENTYEAR}}` works on the wiki and breaks a board.** MediaWiki magic words do expand inside a parsed
    transclusion (verified), which is exactly what a self-updating dated box needs — but in a Wikibento *board*
    `{{name}}` already means a param reference, so a config containing them fails the demos constitution (measured:
    "every {{widget:id}} and {{param}} resolves inside the board"). The widget therefore expands its own
    single-brace tokens — `{date}`, `{monthname}`, `{day}`, `{month}`, `{year}` — so `POTD/{date}` is both
    self-updating and board-legal. Lexical collisions between a host platform's syntax and ours are worth checking
    before building on the host's version.

26. **One edit per script, assert, then grep — because a later failure silently discards earlier ones.** A
    multi-edit script that asserts on its second edit writes *nothing*, so the first edit is lost while the run
    still prints the first `✔`. This cost three separate debugging rounds in one session (a loader whose import
    vanished, an output handler that stayed on the old signature, a picker that fell back to 7 options) and every
    time the symptom looked like a *logic* bug rather than a lost write. The habit that prevents it: one edit,
    `assert old in s`, write, then **grep the file for the new text** before moving on — and when a runtime
    behaviour surprises you, print `repr()` of the region first, because indentation guessed from a `sed` dump is
    wrong about half the time (that one recurred all day, on Python, JSX, CSS and Markdown alike).

27. **`{{param}}` in JSX *children* is an object literal containing an undefined identifier.** Every card that
    wants to *show* a placeholder must write `<code>{'{{param}}'}</code>`, not `<code>{{param}}</code>` — the
    braces are an expression, so `{{param}}` compiles to `{ {param} }` and throws `ReferenceError: param is not
    defined`, which the error boundary renders as "widget crashed". It stayed hidden for months because the
    branch that contained it (the 🔊 Speaker's *no text yet* message) only renders when the widget has **no**
    text — and no shipped board had a text-less speaker until a wired one arrived (source set, text field
    empty), which is now the normal way to use it. Worth knowing: the crash text names the *transformed* line
    number, so a stack trace pointing past the end of the file is this, not a stale bundle.

28. **Transform the module after editing it — a duplicate import is a blank page, not an error message.** `import
    ProjectField` written twice in `WidgetFrame.jsx` (once with `FALLBACK_PROJECTS`, which I did not notice) does
    not fail loudly: the dev server answers **500 for the whole module**, the app never boots, the page is empty,
    and the symptom looks exactly like a bad board config. Ten minutes went into checking JSON that was fine. The
    one-second check, which belongs in the loop after every module edit: `npx esbuild --bundle <file> --loader:.jsx=jsx --outfile=/dev/null` (or just `npm test`, which bundles everything). Related and worth knowing: a stack trace naming a line past the end of the file is the *transformed* file — see gotcha 27.

29. **A body that stretches is a body that collapses when the height is `auto`.** `.widget-body` is `flex: 1;
    min-height: 0` so a fixed-height grid cell gives a card a scrolling body — but the phone stack sets
    `.grid-item { height: auto }`, where `flex: 1` has no line to grow into, so the body rendered at **0px** and
    every stacked card showed only its 58px header. Reproduce it in one line of Playwright (an iPhone 14 context)
    and check `.widget-body`'s `scrollHeight`, not its text: the data was all there, invisible. Fixed with
    `.mobile-stack .widget-body { flex: 0 0 auto; min-height: auto }` — and by making the demo sweep assert it.

33. **A print check that does not wait is a check that lies.** The sweep's print pass armed the sheet and measured
    300ms later: on the Met board the images had not arrived, every card was short, nothing collided — "0 overlaps"
    — while the real PDF had four cards printed over each other. `window.print()` snapshots a *settled* board, so a
    check for it has to measure a settled one: wait for every image to decode and for no card to be loading, then
    measure. The same lesson in the other direction is what makes the export work at all now: the app holds the sheet
    (`preparePrint`) until the board has settled, instead of printing whatever happened to be on screen.

32b. **…and the same mistake one level down: a card sized by its content instead of its cell.** Making Document-mode
    cards full width reflowed their insides (a chart at four times its width, an image overflowing its card); the fix
    was to give each card its grid proportion — and the first attempt at *that* left the width to the flex item's
    content, which measured 19% of the page for one card and 100% for another. Two levels, one lesson: a card's
    width comes from the grid, never from what is inside it.

32. **Two cards can be in the same *row* and still not be in the same *cell*.** Grouping a board's cards into
    "shelves" by overlapping vertical spans is a plausible way to paginate it, and it is wrong the moment a layout is
    a staggered mosaic: on the Met demo a tall card's column is re-used by the card below it, so the shelf held five
    cards, two pairs shared a column, and page two printed four cards on top of each other. What works is the grid
    the board is *already drawn on* — column, span, row and row-span straight from the layout — because CSS grid
    cannot overlap two items. The general form: when reproducing an arrangement, copy the coordinates you are given
    rather than inferring a structure from them.

31. **A safety timeout that fires mid-operation is worse than no timeout.** The print sheet disarmed itself three
    seconds after arming, because `afterprint` is unreliable (Safari, a cancelled dialogue) — and three seconds is
    not enough for a real print job. Generating the Anne Frank board's PDF took longer, the timer cleared the layout
    slots mid-print, and the PDF came out with the disarmed layout: the bug the sheet exists to fix, now intermittent
    and much harder to see. The disarm is now driven by `afterprint` **plus a `beforeprint` that re-arms**, so a
    stale armed state is harmless and no timer is needed. When you reach for "clean up eventually", ask what happens
    if the cleanup wins the race — and prefer an operation that re-establishes the state over one that expires it.

30. **A component can exist, be named by the registry, and never render.** `PanoramaCard` was defined in
    `WidgetFrame.jsx`, named by the `panorama360` widget, and had **no `case` in the content dispatcher** — so every
    360° card fell through to `default: StatCard` and showed an empty "—" for as long as the widget shipped. The gate
    that should have caught it asserted that a renderer *exists* (it did), not that it is *reachable*; there are two
    assertions now, and the second one is the one that decides what a user sees. The general lesson is worth
    keeping: **existence is not reachability**, in code, in docs, and in tests.

## Open issues & known bugs

Tracked design work is `docs/ISSUES.md`; the plan is `docs/ROADMAP.md`. What is
actually broken or unfinished today:

- **ISSUE-115** — production logs a *report-only* Content-Security-Policy violation for the Wayback iframe, plus embed
  warnings from the Wikipedia pages inside the wiki-page box (touch icons, a stylesheet, a blocked autofocus). Nothing is
  blocked and the cards render — filed because the console looks alarming, and both browser checks now treat it as a note.
- **ISSUE-116** — `/api/petscan` answered **502** twice while verifying a deploy. The proxy and PetScan both answer when
  asked directly, so it is intermittent and most likely an upstream timeout; recorded rather than guessed at.

- ~~**Reset doesn't stick on a URL-loaded board.**~~ **Fixed 2026-09-15** — and it was the visible
  half of a bigger problem: the URL was a claim nothing kept honest. Reset now drops the claim, an edit
  drops it too, and Share builds its link from the board instead of from the address bar. The contract,
  the full action-by-action inventory and the audit live in `docs/URL-STATE.md`; `npm run smoke:url`
  fails if any of it regresses.
- ~~**A shared link overwrites the visitor's own saved board.**~~ **Fixed 2026-09-16 (ISSUE-88)** — the same
  family as the Reset bug: the app treated a URL as state to adopt rather than a document to show. A URL board
  is now *borrowed*: shown, never written, until the visitor edits; the board an adoption displaces stays
  recoverable for a day, and a notice offers [Save this as mine] / [Back to my board]. One signal does both
  jobs — the fingerprint divergence that drops the URL's claim is the moment of adoption.
- **Three demo boards' *authored* layouts overlap themselves** (measured 2026-09-18: `dashboard.json` 7 pairs,
  `glam-demo.json` 2, `front-page-demo.json` 1). Example: `fileusage` (x9 y14 w3 h5) and `topwikis` (x7 y18 w5 h4)
  collide; `quality`/`assessments` collide with `edithistory`. Nothing breaks: react-grid-layout **compacts
  vertically** (closing gaps) and **pushes** overlapping items apart, so the rendered board is fine and the demo sweep
  passes in every engine. The authored files simply contradict themselves, and nothing checks — the same sloppiness
  that put the new gallery tile into a collision the moment it was added. The clean fix is a one-off repack of those
  three layouts, after which a no-overlap assertion belongs in the demos constitution; the measurement is ten lines
  of Python (pairwise rectangle intersection).
- **Don't diagnose an artifact diff without pinning the commit.** A rebuild of the
  working tree did not match the deployed bundle, which invited a "toolchain drift"
  explanation — but `HEAD` had moved past the **deployed commit**, and the 🔳 QR
  widget (PR #47) had never been deployed. Rebuilding the deployed commit with the
  same toolchain reproduced the live bundle byte-for-byte, so nothing had drifted.
  Before comparing an artifact to a rebuild, pin the commit
  (`git log --oneline <deployed-commit>..origin/main` shows what is merged but not
  live) — the worked numbers live in `docs/DEPLOYMENTS.md`.
- **PNG of an arbitrary widget is a decision, not an oversight.** Client-side PNG works where a widget draws
  itself as SVG, **or** where its images come from a CORS-enabled host (`iiif.archive.org`,
  `upload.wikimedia.org`, `thumb.wikimedia.org` — measured to send ACAO), which is how a book or document page
  exports as a real PNG. It cannot work for an *arbitrary* HTML/CSS card: Chromium taints a canvas for any SVG containing a `foreignObject` (measured — even
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
- **`handleLayoutChange` persists to `localStorage` on every drag tick** (only *during* a real gesture now — a
  mount-time auto-placement no longer persists, see gotcha 21) — fine at the current payload size, wasteful as
  boards grow.
- **The legacy Wikistats CSV is flaky, and the ranking depends on it.** `wikistats.wmcloud.org/api.php?action=dump&table=wikipedias&format=csv`
  answered 500-with-an-empty-body for a stretch on 2026-09-18 and then recovered. The single-edition Wiki Stats card
  no longer uses it (siteinfo), but `topWikipedias` needs a list of every edition and **no replacement exists** — the
  site matrix carries no article counts. A persistent failure shows an error rather than an empty ranking, and
  finding a better source for "largest Wikipedias" is an open question rather than a task.
- **The Ask path can name a wiki that does not exist.** The project picker constrains the UI (ISSUE-93), but the
  Ask path reads the *manifest* and passes an unfamiliar project through: 364 wikis cannot be enumerated in a
  validator, so the widget's own error state is the guard. Aliases and shapes are normalised (`Commons` →
  `commons.wikimedia`, `German` → `de.wikipedia`); an invented wiki reaches the fetcher and reports itself.
- **A mixed-project Article List is fetched with its first line's project.** `resolveRefLines` parses a reference per
  line, but the fetcher takes one project per call, so lines naming different wikis need per-item fetching — a
  feature, not a fix (ISSUE-92's known limit).
- **Settings has no home for anything else yet, on purpose.** The panel holds three preferences (your wiki, the
  recents, present-mode fullscreen). The bar for a fourth: a preference *of the person* with no better home.
- ~~**Two pre-existing dev-only React warnings**~~ **Fixed 2026-09-18** — both, while making the demo sweep's
  console signal usable: ✨ Ask is now a *sibling* of + Add Widget (it was nested inside it — invalid HTML that made
  browsers auto-split the tags) and the media player puts React's `key` on `<audio>`/`<video>` instead of spreading it
  out of `mediaProps`. Each was a one-console-error-per-load tax on every sweep row, which is why they finally got
  done: a check nobody can read is a check nobody runs.

## Next steps

Roadmap detail in `docs/ROADMAP.md`; the design ideas below are specced there.

1. **Nothing is pending** — production is level with this branch, and the state lines above plus
   `docs-facts --live` are the evidence for it. The queue, in the order I would take it:

   - **ISSUE-96 — finish the emitter audit.** 12 of 41 widget types publish anything (the 🖼️ Gallery publishes on every source since 2026-09-18; the 🎞️ Commons Gallery joined on
     2026-09-18: captions as `lines`, the clicked file as `selection`), and the audit ranks the
     obvious next ones (`articleList`, `quality`'s ORES grade, `assessments`, the article and category galleries (`small`, `contain`, `fileGallery`), `edithistory`, every
     ranking, `sparql`, `waybackGallery`, `mediaPlayer`/`panorama360`, `wikiPage` as a reference, `markdown`). Each
     is a one-line `emit` plus an `outputs` declaration; **the work is checking each one's data shape.** The
     consumer side needs nothing: any text field already interpolates `{{widget:id}}`.
   - **ISSUE-97 — typed payloads — first one shipped (2026-09-16), the row-shaped ones remain.** The pattern is
     now proven end to end on the 🌐 Translator's `#speech` value (`{ type: 'speech', text, lang }`) read through a
     `source` field: the text channel kept, a typed channel added beside it, `primary` deciding what the bare id
     means. Next: the same for a ranking with counts (`{ type: 'ranking', rows: [{ title, count }] }`), a file list
     and an edit list — and copy the speaker's `readSpeechPayload` strictness (a value without a `type` is *not*
     that type, so plain strings keep their old meaning).
   - ~~**ISSUE-99 — the page box, made project-aware.**~~ **Done 2026-09-16** (below): a wiki picker beside the
     box, a reference as the committed value, the `en:`/`de:`/`commons:` shortcut. What remains of this family is
     ISSUE-68's Slice 2 — a Finder **widget** (a prominent search-and-pick card with result previews), which would
     set the param rather than compete with it.
   - **ISSUE-98 — should a widget's display be a template?** Andrew's question after seeing the Translator show
     original *and* translation. Today: the *Show* select is the whole answer, and it covers the real need (show
     less) with no new grammar. Filed with the two design traps (a widget-local namespace colliding with the
     board's, and a template becoming a contract with a widget's internals — the thing ISSUE-97 says a consumer
     must never depend on).
   - **ISSUE-91's `class:` field** — the widget taxonomy. It was waiting for the `interactive` class to have
     implementations to describe; it now has three (channels, `selection`, `linkAction`).
   - **ISSUE-83/84/85 — the Document Reader's reading enhancements** (how much room the transcription gets, a copy
     button that carries the proofreading grade, and where the text lives). Filed from Andrew's notes, none built.
   - **ISSUE-86 — duplicate / copy-paste a widget.** The machinery exists (`handleAddAssembly`'s `idMap`,
     `validateDashboard`, the undo toast); it needs the ⧉ button. Also latent: `Date.now()` ids collide within a
     millisecond.
   - **Then the Internet Archive media family** — `iaPlaylist` → `iaVideo` + keyframe filmstrip → `iaAudio`, all
     measured and specced in `docs/INTERNET-ARCHIVE.md`.
     - **ISSUE-103's known limit** — the 🎞️ Commons Gallery reads literal `<gallery>` blocks from the wikitext, so a
       gallery generated *by a template* reads as empty (the rendered HTML would catch those, at 10× the bytes: 654 KB
       against 56 KB for London). Worth deciding per case rather than assuming; everything else about galleries shipped.
     - **The gallery merge's two lessons** (2026-09-18) — now written where they are read: **`AGENTS.md`** (loaded
       automatically in this directory) for the operating rules, and `docs/BROWSER-TESTING.md` for the sweep. In one
       line each: the registry is an object keyed by id, so `id:`-based deletions corrupt it silently
       (`commonsGallery` → `fileUsage`, with 588/609 tests passing); and **a sweep without `--base` tests production,
       not your working tree** — the script now prints its base and warns when it is the implicit default.

     - **The print's known tweaks** (Andrew, 2026-09-18: *"all much better but could use some tweaking"*). Three
       small, well-understood follow-ups, in the order I would take them:
       (1) **a scale chooser in the 🖨 menu** — *fit* (today's behaviour) or *100%* — because Board and Document mode
       now scale the board to A4's content width, which is a lot of shrinkage for a 1480px board: a deliberate
       trade of page count against text size;
       (2) **Document mode should keep a tall card whole when it fits a page** — it flows now (21 → 7 pages) at the
       cost of a chart occasionally being cut by a page boundary; a JS paginator that knows each card's height could
       insert breaks only where a card would straddle;
       (3) **the poster's allowance is generous** — the page is the board's box × 1.25, so there is ~25% white space
       at the bottom. It is deliberate (script cannot measure the printed layout, and a page slightly too short is a
       second page nobody wanted), but a measured allowance would tighten it.
     - **Also filed, not queued** — ISSUE-101 (a full-bleed single Commons image tile) and ISSUE-102 (quiz / trivia
       mode for an event, GitHub #95) came in from a parallel session. Both are self-contained and neither blocks
       anything here.
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
