# WikiBento — Handoff

*Last updated: 2026-09-01 · Repo: [github.com/fuzheado/wikibento](https://github.com/fuzheado/wikibento)*

## What This Is

WikiBento is a dark-themed, drag-and-drop widget dashboard for Wikimedia —
"insights and action". A single-page React app (React 19, Vite 8,
react-grid-layout) with **no backend**: every widget fetches directly from
CORS-enabled Wikimedia APIs (RESTBase pageviews, MediaWiki Action API, Commons,
Wikistats). Dashboards are JSON configs (format v1) that persist to
localStorage, export/import, and load via shareable URLs — either embedded in
the hash (`#/d/<base64>`) or fetched from a URL (`?config=<url>`, including
on-wiki pages like `Commons:WikiPortraits/Bento-demo.json`).

## Current Status

**Feature-complete for v1, Phase 0 cleanup done, deployed live.**
- ✅ **Media player description + annotation (2026-09-01, DEPLOYED — bundle index-DBwecE6U.js):**
  the 🎬 widget gains "Show Commons description" (⚙, default ON — now-playing
  track shows its `videoinfo` extmetadata `ImageDescription` + `Artist ·
  License` credit, `.media-desc` block; `iiextmetadatafilter` is ignored by
  videoinfo, noted in code) and a freeform **annotation** textarea (Markdown,
  escape-first renderer, no external images) under the controls — user-written
  captions for boards/kiosks. Verified live with Dance reedit 2.webm
  ("Dance couple performing the cha cha." · Wpzhiyilee · CC BY-SA 3.0).
- ✅ **CIM File Spotlight image preview (2026-09-01, DEPLOYED — bundle index-D5iaTtCr.js):**
  the 🔦 widget gains "Show image preview" (⚙ checkbox, default ON) — a 480px
  Commons thumb of the file above the stats, clickable to the Commons file page
  (reuses the File Usage Map `.card-image` pattern; fetch is best-effort via the
  new `fetchCommonsFileImage` helper — a bad filename can never fail the CIM
  stats). Title now links to Commons too. Ask manifest regenerated
  (`node scripts/generate-manifest.mjs`). Tests: spotlight month-resolution +
  thumb/showImage=false paths (npm test 55).
- ✅ **CIM month-lag fix (2026-09-01, DEPLOYED — bundle index-BHGlMTfE.js):** every CIM widget falsely
  reported registered categories as "unregistered" at the start of each month —
  the calendar's previous month isn't published until the monthly job runs days
  in (verified live 2026-09-01: August 404'd while July had full Met data), AND
  the 404 disambiguation probe was built from the same `prevCimMonth()` as the
  main request when month=0, so probe ≡ main → both 404 → false "register via
  {{Views from category}}" verdict. Fix: new `latestCimMonth()` helper (bounded
  backward walk probing the category-independent global leaderboard, 1 h TTL
  cache) — all 9 CIM fetchers now default to the latest PUBLISHED month and probe
  against it; fetchers return `resolvedMonth` and the CIM transforms display it
  (config-computed `resolveMonth(config.month)` stays as fallback). Also: 4xx
  fetches are now terminal in `fetchTextWithRetry` (previously retried with 1.5 s
  backoff — every 404 error path and the whole test suite were 1.5–4.5 s slower).
  Constitution: tests/cim-latest-month.test.mjs (4 tests, date-relative stub —
  runs in any month; npm test 53). Verified live: Met snapshot resolves to
  2026-07 = 389,030 files · 20,700 used · 404 wikis · 31,351 pages.
- ✅ **GLAM depth UX (2026-08-17)** — zero-state explainer + config hints:
  when a scan returns 0 files the card now shows a real message instead of
  silent zeros — depth 0: "No files directly in this category — increase
  Depth to include subcategories"; deeper: "No files found in this category
  tree" (transform emits `emptyHint`, GlamCard swaps the stats grid for the
  hint). Config panel: `hint` field on configFields renders inline
  semantics — Depth "0 = category only, 1 = + direct subcats", Excl depth
  "0 = excluded cats only, 1 = + their subcats" (plus the 0–12 range);
  negdepth gained min/max 0–12 so the range shows too. Browser-verified
  (zero-state via a nonexistent category, hints in the ⚙ panel).
- ✅ **Clickable titles + page names on GLAM/CIM cards (2026-08-17)** —
  ISSUE-47: GLAM Category Usage + CIM Category Snapshot card titles link
  to the Commons `Category:` page in a new tab (`.excerpt-title a` styling;
  the card title, not the drag-handle title bar, is the link target).
  Extended: the GLAM card's per-page usage table links too — the top-file
  header opens its `File:` page and every usage row's page name opens on
  its own wiki (`pageHref`, `.org` stripped; unknown wikis stay plain).
  Audit: all other page-listing cards already linked (cimTopPages,
  topPages, articleList, cimTopFiles). Transform tests cover en/commons/
  unknown-wiki rows + null-detail (glam-petscan.test.mjs; npm test 48).
- ✅ **GLAM file budget ceiling raised to 30,000 (2026-08-17)** — the
  `glamorgan` widget's `fileBudget` (silently clamped at 1,000 in
  production) now honors user values up to **30,000** end-to-end (raised
  1,000 → 10,000 → 30,000 = GLAMorgan's own ceiling): client clamp
  `GLAM_FILE_BUDGET_MAX` (dataSources.js), relay clamp `PETSCAN_BUDGET_MAX`
  (server.js parsePetscanParams), registry/panel max, docs. The **self-walk
  fallback stays capped at 1,000** (`GLAM_FALLBACK_CAP`) so a relay outage
  can never trigger a multi-hundred-call browser walk — and `cappedFiles` is
  now computed against the walk cap, so a capped fallback is labeled, not
  silent. **Timeout mismatch fixed:** the relay legitimately runs up to 60 s
  on big trees, but the client's `fetchJSON` default (15 s) aborted first
  and silently fell back — `fetchPetscanRelay` now waits 75 s in a single
  attempt; loadingHint updated ("30–90 s for large budgets"). **UI/import
  contract:** registry configFields declare `min`/`max` (fileBudget 50–
  30,000, depth 0–12, topN 1–10) → the ⚙ panel shows the range hint + HTML
  min/max, and `validateDashboard` warns on out-of-range values ("will be
  clamped", mirroring the layout w/h warning precedent). Live probe:
  People at Wikimania 2024 depth 5 = 2,832 files / 1.19 MB / ~2 s via
  PetScan (~0.4 KB/file → a full-budget tree ≈ 12 MB, under the 25 MB byte
  cap). Tests: glam-petscan +3, new config-ranges suite +6 (npm test 45).
  **DEPLOYED 2026-08-17** (bundle index-B_hgqo4i.js; merged to main ebb4af7).
- ✅ **30 widget types total (2026-08-16):** + 🎬 Video/Media Player
  (ISSUE-39) + 🕰️ Wayback Snapshot Gallery (alpha). Full catalog:
  `?config=/dashboard.json`.
- ✅ **Kiosk mode (2026-08-15)** — ⛶ Present + `?kiosk=1`: chrome-free
  fullscreen presentation, grid locked, Esc/✕ Exit (strips the URL
  param), fullscreen only on click (user-gesture rule). ISSUE-18.
  **DEPLOYED** (commit 3c94ab8, verified live 2026-08-15).
- ✅ **Lean mode (2026-08-16)** — ▣ Lean + `?lean=1`: the same
  chrome-free, grid-locked state WITHOUT fullscreen — resizable
  browser, iPad-app feel; shares the `.kiosk` CSS rules; Esc/✕ Exit;
  kiosk and lean mutually exclusive. **DEPLOYED** (commit 3bfad47,
  bundle index-DkcrAAk0.js — current production bundle, verified live
  2026-08-16 incl. kiosk regression).
- ✅ **Video / Media Player widget (2026-08-16)** — 🎬 ISSUE-39: native
  HTML5 `<video>`/`<audio>` (no player library) of Commons files —
  single embed or jukebox playlist; batched `videoinfo` derivatives
  (≤4,500-char chunks), height-based quality pick (VP9 WebM, auto =
  largest ≤1080p, original fallback), per-track media-type detection,
  next/prev/position, loop wrap, Fisher-Yates shuffle, autoplay ▶ Start
  pill (browser policy), missing-file counts. **DEPLOYED** (commit
  c9f7bbc, bundle index-DdJRNUuD.js → current index-DkcrAAk0.js,
  verified live 2026-08-16).
- ✅ **✨ Ask advisor (2026-08-16)** — ISSUE-44 Phase 1: intent-first
  widget discovery. `✨ Ask` toolbar button → conversational panel
  (user bubble → thinking → recommendation cards with reasons +
  pre-filled config chips → click to add to board; sample chips,
  privacy footer). Architecture: `scripts/generate-manifest.mjs`
  extracts the 30-widget catalog (with REAL select options per field)
  into `public/manifest.json` (~3.7K tokens, wired into `npm run build`);
  `deploy/server.js` gains `/api/ask/session` (30-min HMAC token,
  IP-bound) + `/api/ask` — narrow-function relay to Wikimedia's free
  LiftWing LLM (`llm-qwen36-27b`, json_object mode, `<think>` strip,
  id validation, per-IP rate limits + global tripwire, prompt caps,
  10-min hash cache, 45 s timeout + `llm-qwen3-14b` fallback,
  privacy-respecting logs). Server-side config normalization against
  declared fields (unknown keys dropped, invalid selects dropped,
  `commons.org`→`commons.wikimedia` aliases, `Category:` stripped,
  `File:` prefixes ensured, displayMode validated) + VALUE RULES /
  intent-matching prompt. Offline keyword fallback (`src/lib/askLocal.js`,
  "offline" badge). Constitution: `tests/ask-validation.test.mjs`
  (11 tests, wired into npm test/build). **DEPLOYED** (commits 5378088 +
  165c014, verified live incl. the user-reported failure prompts).
- ✅ **Gallery defaults + grid density fix (2026-08-16):** Article Gallery /
  Commons File Gallery now add at **w:12 full width** and **auto-fit their
  height to the image count** (registry `autoHeight` → WidgetFrame
  `onAutoHeight` → App fits rows, clamp 3–14, stops once the user resizes).
  cimTopFiles + waybackGallery share the full-width default. **Root-cause
  find:** react-grid-layout 2.2.4 moved `cols/rowHeight/margin/
  containerPadding` into the `gridConfig` prop (same silent-API drift as
  dragConfig) — the app's rowHeight={80} was ignored and the grid rendered
  with RGL's 150px-row defaults all along. Fixed via `gridConfig`; board
  now renders at the intended density. Commit ee70ce4, verified live.
- ✅ **GLAM PetScan relay implemented (ISSUE-46, 2026-08-17)** — branch
  `glam-petscan-relay`. `deploy/server.js` gains `/api/petscan` (stateless
  capped relay: budget + 25 MB byte cap, 60 s timeout, per-IP limits;
  `wikiDbToDomain` maps PetScan DB names → domains; pure fns exported).
  `fetchGlamStats` rewritten: PetScan relay primary, self-walk fallback
  (ISSUE-45 fix retained), shared `aggregateGlamStats` with injectable
  views/thumbs; output carries `source`, card subtitle flags self-walk
  fallback. **19 new offline tests** (tests/glam-petscan.test.mjs — npm
  test now 36) + `scripts/verify-glam.mjs` live parity check. **Verified:
  both paths match glamtools exactly on XBio depth-1 2026-07 — 518/38/38/
  40/2/110,092**; endpoint HTTP-smoked (400 on missing cats, real query
  OK). **DEPLOYED 2026-08-17** (merged to main ebb4af7; production bundle
  index-B_hgqo4i.js; verified live — Wikimania 2024 depth 5 = 2,832 files,
  capped: false).
- ✅ **GLAM architecture decision: PetScan relay (ISSUE-46, 2026-08-17)** —
  after the ISSUE-45 zero-usage bug, a source read of glamtools showed
  GLAMorgan has NO stats backend (PetScan + same-origin pageviews proxy +
  ~40 lines of browser aggregation). Decision: **B now** — delegate
  tree+usage to PetScan (`giu` exact-ns) via a capped stateless
  `/api/petscan` relay; pageviews stay client-side (WMF API); never adopt
  glamtools' proxy (same-origin-only, unversioned — verified no CORS
  2026-08-17); full server aggregation (C) only when budgets >~1K files or
  repeat-load caching wins. Design + revisit triggers:
  docs/GLAMORGAN-WIDGET.md §Architecture Decision; contracts recorded in
  ARCHITECTURE.md watchlist; ROADMAP Phase 1.5. **Status: implemented +
  merged to main 2026-08-17 (ebb4af7), deployed** (was `glam-petscan-relay`,
  docs-only at decision time).
- ✅ **Ask payload contract documented + intent→widget benchmark suite
  (2026-08-16):** ISSUE-44 gains the "Payload contract (as shipped)"
  section — the exact trim map (8 fields per widget: id/name/description/
  dataSource/category/type/configFields/defaults; icon/intensity/
  experimental dropped), prompt layout (preamble → CATALOG → RULES →
  VALUE RULES → OUTPUT SCHEMA → 2 few-shots), params (json_object,
  temp 0.3, 700 max tokens, 45 s timeout), cache key, sanitizer chain.
  Corrected the stale "531 prompt tokens" figures in ISSUES.md +
  DATA-SOURCES.md: the shipped catalog is 15,764 chars ≈ 4.1–5.3K tokens;
  full system prompt 17.5K chars ≈ 4.5–6K of 32K ctx (fallback 16K → keep
  enriched system ≤ ~13K). **Benchmark suite (ISSUE-44 design item 6,
  "evaluation as a constitution"):** `tests/intent-fixtures.mjs` — 15
  ground-truth intents (draft v1, review pending) covering every widget
  family + confusable pairs (fileUsage vs cimFileSpotlight, glamorgan vs
  cimSnapshot); `tests/intent-benchmark.test.mjs` wired into `npm test`
  (hard schema asserts + local-tier top-3 floor); `scripts/benchmark-
  ask.mjs` — live LLM scorer against the exact ASK_SYSTEM+ASK_RULES
  prompt (direct LiftWing call, same sanitizer, --gate/--out/--model
  options). askLocal gains a manifest override param + 3 new intent
  patterns. **Baseline: LLM tier 15/15 top-1, keys 100%, subject 100%;
  local tier 15/15 top-3 (100% top-1 after pattern fixes) — the bench
  caught 3 real local-matcher bugs** (missing wikistats + wayback
  patterns; linkcount losing to topPages on a keyword false-friend).
  **Category-span delineation probed live (5 variants): the model extracts
  full category names exactly whether quoted, unquoted w/ em-dash, or
  unquoted with NO boundary — fixtures stay in the realistic unquoted form
  and glam-category-impact was hardened to the no-boundary wording
  ("…and how many files…"); re-verified 100% live + offline. Benchmark
  script gains --fixtures and matchedOption in --out (extracted configs
  saved for span diagnostics). **Fixture interviewer tool
  (scripts/interview-fixtures.mjs)**: interactive widget-card → phrase →
  subject → validated-append flow (needs a real terminal; piped stdin
  hangs on Node 26 readline — use --add for automation); --list shows
  coverage (15/30), --add is the agent path; entries validated by the
  same assertFixtureSchema before writing. Full how-to, scoring
  semantics, and ground rules in docs/INTENT-BENCHMARK.md (linked from
  README + ISSUE-44).
- ✅ **Docs (2026-08-15/16):** docs/PHILOSOPHY.md (the HyperCard
  lineage + origin story + wayfinding question) and docs/PARADIGMS.md
  (presentation paradigms, CD-ROM era, contemporaries incl. Knight Lab
  + GLAM Wiki Dashboard evaluations) added; WIDGET-IDEAS.md gained the
  mapping extensions, sister-project widgets (Wikivoyage/Wiktionary/
  Wikisource), and the Knight Lab + GLAM Wiki Dashboard evaluations;
  ROADMAP Phase 2 rows (board templating, map family); ISSUES.md
  now tracks ISSUE-18..44 (kiosk/lean done, media player done;
  slideshow/ticker (33/34), categorySize modes (37), Bento navigation
  (35), manifests (36), shared renderers (38), parameterized links
  (40), board templating (41), five content primitives (42),
  model3D widget (43), "Ask" NL widget advisor (44) — open design).

- ✅ 7 data-driven widget types verified live + 📝 Text/Markdown static card + 🔥 Top Wikipedia Articles (28 total, 2026-08-13: + 4 Article Vitals + 🖼️ Gallery + 🗂️ Commons File Gallery + 📋 Article List + 🧠 SPARQL Query + 📄 Wiki Page + 8 CIM widgets)
- ✅ **SPARQL Query widget (2026-08-13):** 🧠 power widget — WDQS + QLever (Commons) + Humaniki; auto-detecting renderer (big number/bars/line/table, ⚙ override); 4 presets (Met depth 72,433, multi-institution bars, Women-in-Red 20.13% via Humaniki, Commons top-depicts via QLever); 60 s timeout + retry + 10-min TTL cache; GET ≤1,800 chars else form-urlencoded POST (no preflight). Humaniki gotcha: interpret gender keys via its own bias_labels (its QID map is swapped vs Wikidata — hardcoding gives 79.7%, label lookup gives the correct 20.1%). Preset select fills query+endpoint atomically (one onUpdateConfig call — sequential handleConfigChange calls clobber each other via stale props). Schema + example dashboard (17 widget types) + docs updated. **DEPLOYED to Toolforge 2026-08-13** (commit bfbce6e, bundle index-BJjaG_ta.js) — verified live: multi-institution bars (Met 72,433), /api/resolve OK.
- ✅ **Wiki Page widget (2026-08-13):** 📄 static iframe embed — Wikimedia pages send no X-Frame-Options/frame-ancestors (verified), so the widget is a direct `<iframe>` (no fetch, no sanitize); **desktop/mobile toggle** via `?useformat=mobile` (MobileFrontend's own preview parameter — verified 200 + Minerva HTML on enwiki and Commons; the m. subdomains are retired and 301 to desktop), optional section anchor, links browse inside. 28 widget types total (26 data-driven + markdown + wiki page). **DEPLOYED to Toolforge 2026-08-13** (commit f7dfa44, bundle index-BdMTw21V.js) — verified live: Help:Introduction iframe renders on the production site.
- ✅ **Freshness constitution (2026-08-14):** every live-querying widget now shows its last-run time — WidgetFrame stamps `_fetchedAt` on every fetch widget's data and renders a `⏱ updated HH:MM:SS · auto-refresh Nh` footer (updates on every load: initial, ↻, config change, auto-refresh). Static widgets (markdown, wikiPage) exempt. Enforced by the constitution test: fetch widgets must declare `refreshSeconds ≥ 30` in defaults. Audit: all 26 fetch widgets covered automatically by the single WidgetFrame change; 2 static exempt. Caveat documented: TTL-cached sources (Wikistats/SPARQL/CIM) show the widget's last run, not upstream data age. **DEPLOYED to Toolforge 2026-08-14** (commit a7f5ee7, bundle index-C3DXQFad.js) — verified live: 26 stamps, 0 errors.
- ✅ **Temporal-scope constitution (2026-08-13):** every widget whose data has a time scope now displays the RESOLVED scope in its subtitle (pageviews: "2026-07-15 → 2026-08-13 · 30-day pageviews"; CIM: "2026-07 · precomputed (CIM)…", "2026-02 → 2026-07 · …"). Enforced by `tests/scope-compliance.test.mjs` via `npm test`, wired into `npm run build` — a non-compliant widget blocks the build, hence deployment. All 28 widgets declare `timeScope` ('month'/'range'/'day'/'point'); helpers in src/lib/scope.js.
- ✅ **CIM File Traffic widget (2026-08-13):** 📉 interactive per-file chart — labeled axes (compact Y ticks, month X labels, "views"/"month" titles), −/+ zoom slices 3/6/12/24 months client-side, header always shows the displayed range. Found + self-healed a real CIM bug: the API deterministically 500s from browsers on the exact 12-month window 20250801/20260801 (internal upstream 503; curl 200s; other windows incl. 30-month work) — `fetchCimTrafficWithHeal` retries with the earliest month dropped.
- ✅ **CIM widgets (2026-08-13):** 🎯📈🖼️🌍📄✍️🏆🔦 8 separate precomputed Commons Impact Metrics widgets (NOT merged into the glamorgan live walk, per 2026-08-13 decision): snapshot (BHL: 305,868 files · 14,434 used · 252 wikis · 41,819 pages — exact), views trend (Jan 83.1M), top files w/ thumbs (Dogs Plate XI 811,993), top wikis/pages/editors (SchlurcherBot 4,491), global top-100 leaderboard (UNESCO 6.6B) + file spotlight. 28 widget types total (26 data-driven + markdown + wiki page). Key gotchas: the CIM 404 is AMBIGUOUS (registered cats with no data for the month return the same "not loaded yet" body — BHL 2015-01 404s) → previous-month disambiguation probe; snapshot has NO pageviews; CIM views = pageviews of pages USING the files; top-files thumb lookup must use space-normalized titles (imageinfo normalizes). 1-h TTL cache + 30 s timeout. **DEPLOYED to Toolforge 2026-08-13** (commit 7e022f7, bundle index-DiStWjwF.js) — verified live via the new full-catalog sample (`?config=/dashboard.json`: all 28 widget types, 0 errors; leaderboard highlight works — WLM 2024 correctly 'not in the top 100').
- ✅ **List-driven widgets (2026-08-13):** 🗂️ **Commons File Gallery** + 📋 **Article List** — 28 widget types. Both take pasted lists (one per line) as input; the gallery renders any Commons files (grid/list, order: listed/random/alpha/largest, missing-file counting, reuses GalleryGrid/ListCard renderers) and the article list is a clickable row list with optional batched thumbnails+intros (pageimages|extracts). First consumers of the "list source" input idea (PagePile/PSID can slot in later). Example dashboard + schema + README/DATA-SOURCES/WIDGET-DEVELOPMENT updated. **DEPLOYED to Toolforge 2026-08-13** (commit 68dea21, bundle index-D4DEEPkT.js) — verified live: "3 files" gallery tiles + article list thumbs/extracts, /api/resolve OK.
- ✅ Config format v1: docs/JSON-FORMAT.md + docs/dashboard.schema.json + runtime validator
- ✅ Shareable URLs, import/export, example dashboard, About modal
- ✅ Git repo on GitHub (main). Current production bundle = index-D5iaTtCr.js (spotlight image preview, 2026-09-01);
  latest deploy 2026-08-17 (GLAM PetScan relay + 30K budget ceiling +
  clickable links + depth UX; prior: index-DkcrAAk0.js Lean mode 2026-08-16).
- ✅ **DEPLOYED to Toolforge (2026-08-12):** https://wikibento.toolforge.org/ —
  node20 webservice serving dist/ via deploy/server.js; demo URL verified live.
  **Deploy procedure (fresh-session safe — full detail in docs/DEPLOYMENT.md):**
  SSH as the PERSONAL account (`ssh alih@dev.toolforge.org` — `tools.wikibento@`
  is NOT an SSH login and fails with publickey); tool commands via
  `sudo -niu tools.wikibento` (never `become` over chained SSH); then:
  `npm run build` → `rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/`
  → `ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"`
  → verify bundle hash + `/api/resolve`. This Pi's hosts inventory has
  `tools` = alih@dev.toolforge.org (use `host_exec`).
- ✅ **Phase 0 cleanup done (2026-08-12):** recharts removed, dead assets
  (`public/favicon.svg`, `icons.svg`) deleted, grid resize listener added,
  per-widget error boundary added
- ✅ **QR share panel (2026-08-12):** 🔗 Share now opens a modal with a scannable
  QR code (client-side `qrcode-generator`, inline SVG) + copyable link — encodes
  the current `?config=` URL when present (short, phone-friendly), else the
  self-contained hash link when under ~1,500 chars, else a friendly notice
- ✅ **Responsive layout (2026-08-12):** phones (<768px) get a single-column card
  stack instead of 75px-wide grid columns; tablets/desktops keep the grid
- ✅ **Wikistats robustness (2026-08-12):** shared 5-min TTL fetch cache (Wiki Stats
  + Top 10 now cost ONE request for the 195 KB CSV) + 15 s timeout +
  retry-with-backoff; transient "Load failed" errors self-heal
- ✅ **Text/Markdown widget (2026-08-12):** 📝 8th widget type — zero-dep,
  escape-first Markdown renderer (`src/lib/markdown.js`), static-widget pattern
  (no `fetch`; WidgetFrame renders `transform(config)` directly — see
  docs/WIDGET-DEVELOPMENT.md), new `textarea` config field. Images are https-only
  with a **`*.wikimedia.org` default allowlist**; other hosts need the per-widget
  "Allow external images" opt-in (privacy: blocks tracking-pixel IP/referrer
  leakage in shared dashboards; `referrerpolicy=no-referrer` on all imgs)
- ✅ **Mobile stack ordering fix (2026-08-12):** the <768px single-column stack
  now sorts by grid position (y, then x) instead of widget-array insertion
  order — desktop drags are reflected on phones
- ✅ **Top Wikipedia Articles widget (2026-08-12):** 🔥 most-visited articles
  per language (top.hatnote.com, 28 langs) — "latest" or any date, top-N
  (all/10/arbitrary), default noise filter (`.xxx`, `XXX (beer)`…). hatnote has
  no CORS, so deploy/server.js gained `/api/proxy` (wraps `{status, body}`);
  non-Toolforge hosts fall back to the CORS-enabled WMF Pageviews `top`
  endpoint. See docs/DATA-SOURCES.md §8
- ✅ **Top Pages expanded view (2026-08-13):** ⚙ "Expanded view (thumbnail +
  summary)" checkbox — each row shows a 120px thumbnail, linked title, views,
  and a 3-line intro. Enrichment via the CORS-enabled MediaWiki API
  (`prop=pageimages|extracts`, batched 50 titles/call — pattern from the
  fuzheado/Wiki-Top-100 repo); non-article pages (Main_Page, Special:*,
  Wikipedia:*…) are filtered from both hatnote and WMF data
- ✅ **w.wiki short URLs (2026-08-12):** `?config=https://w.wiki/TR9R` (or bare
  `w.wiki/TR9R`) expands via the same-origin `/api/resolve` endpoint in
  deploy/server.js — browsers can't follow w.wiki redirects to wiki pages (the
  target sends no CORS headers), so the server follows the redirect and the
  client re-dispatches through the normal wiki/Action-API path
- ✅ **GLAM fixes (2026-08-13):** wiki column shows shorthand (`en.wikipedia`,
  full hostname on hover) and is 108px nowrap; the category title is no longer
  squished to a 9px sliver by the stats area — `.glam-card > * { flex-shrink: 0 }`
  (overflow:hidden on the title made its min-height compute to 0, so flex
  crushed it; the card now scrolls instead)
- ✅ **Article Vitals widgets (2026-08-13):** four new single-article widgets —
  📄 **Article Excerpt** (REST `/page/summary`: description + thumbnail + first
  paragraph), 🕓 **Edit History** (`prop=revisions` newest-first with byte
  deltas, diff-linked users), 🏅 **Article Quality (ORES)** (Lift Wing
  `enwiki-articlequality` POST — FA/GA/B/C/Start/Stub + probability
  distribution bars; falls back to the modern continuous `articlequality`
  model), 🧭 **WikiProject Assessment** (`prop=pageassessments` — per-project
  class + importance badges). All CORS-verified (Lift Wing reflects the
  origin; Action API needs `origin=*`; `palimit=500` gets all projects).
  Verified live: Einstein → FA 53.9%, 18 assessed projects. Schema enum +
  example dashboard + README/DATA-SOURCES/WIDGET-DEVELOPMENT docs updated.
  **DEPLOYED to Toolforge 2026-08-13** (commit b9d62f7, bundle
  index-CF9Vo_m5.js) — verified live: all 4 vitals render, no console
  errors from the new endpoints.
- ✅ **Article Gallery widget (2026-08-13):** 🖼️ significant images with
  captions for any article. REST `/page/media-list` (Parsoid's own media
  extraction — no wikitext parsing) + batched `imageinfo`. Significance
  filter (verified): keep only captioned images — caption-less items are
  exactly the noise (infobox flags like `Flag_of_France.svg`, maps, logos);
  `minSize` (default 200px) drops tiny icons. Display modes: grid
  (small/medium/large) or list (thumb left, caption right + filename).
  `showInGallery` metadata is useless (true for everything). Thumb URLs
  utm-stripped (`cleanThumbUrl`). Verified: Einstein → 32 captioned images,
  both modes + size variants in browser. Schema/README/DATA-SOURCES §13
  updated. **DEPLOYED to Toolforge 2026-08-13** (commit 4cf2c93, bundle
  index-BEguwTL7.js) — verified live: gallery renders 32 captioned images,
  no console errors from the new endpoints.
- ✅ **Gallery overflow fix (2026-08-13):** content-height gallery card could
  exceed the widget body on windows < ~1280px wide — `align-items: center`
  centered the overflow so its top painted OVER the header, burying the
  ⚙/✕/↻ buttons (reproduced at 1100/1000/900/800px: card 1204–1864px vs
  body 1074px). Fix: `.gallery-card { height: 100%; min-height: 0 }` (the
  `.ranking-card` pattern — inner grid scrolls at any width) + defensive
  `overflow: hidden` on `.widget-body` so no future content-height card can
  cover a header. Verified live at 1100px: fits, no overlap, ⚙ pointer-
  clickable (commit 4cf2c93 fix bundle index-BqgxhKa5.js).
- ✅ **Gallery square tiles + letterboxing (2026-08-13):** grid thumbs were
  `object-fit: cover` in fixed-height boxes — cropped wide panoramas and tall
  portraits. Now square tiles (`aspect-ratio: 1/1`) with `object-fit: contain`
  — the entire image is always visible, letterboxed against the tile
  background; new `imageFit` config opts into `cover` (square fill-crop).
  Verified live: 32/32 images contain, all tiles square, 6 wide + 5 tall
  images letterboxed (bundle index-bbwxWEKh.js).
- ✅ **360° Panorama Viewer widget (2026-08-13):** 🌐 Pannellum 2.5.7 (vendored
  `src/vendor/pannellum.js` + lazy `pannellumLoader.js` — separate 56 KB dist
  asset, singleton script tag). Config: Commons file → `imageinfo`
  (iiurlwidth=4096 display copy, original URL, dims) → interactive WebGL
  viewer: drag/look-around, auto-rotate toggle, fullscreen, 2:1 + GPano
  detection with "not 2:1" warning, viewer.resize() via ResizeObserver,
  destroy on unmount. **New registry pattern: `defaultLayout`** — per-widget
  min/max size constraints (panorama: w4×h3, min 3×2; verified clamped by
  drag). Gotchas: npm pannellum build is a window-IIFE (rolldown "Missing
  export") → load via `?url` script injection; Pannellum 2.5.7 rejects
  cross-origin `#config=` JSON. Verified live: Imiloa grounds 12740×6370
  renders + rotates; File:Example.jpg flags not-2:1; config change rebuilds
  the viewer. **DEPLOYED to Toolforge 2026-08-13** (commit ec9d26c, bundle
  index-BSwIQuK-.js + lazy asset pannellum-BqmdIb_j.js) — verified live:
  canvas renders, drag rotates (pixel-diff).
- ✅ **Grid drag fix — dragConfig API (2026-08-13):** mouse-dragging the
  panorama moved the WIDGET instead of panning. Root cause: react-grid-layout
  2.2.4 replaced the 1.x `draggableHandle` prop with the `dragConfig`
  object (`{ handle, cancel, ... }`) — the old prop was **silently ignored**,
  so widget drags could start anywhere. Fix: `dragConfig={{ handle:
  '.widget-header', cancel: '.no-drag' }}` + `no-drag` class on
  `.panorama-container` (reusable for future interactive widgets — maps!).
  Side effect: header-only dragging is now ACTIVE for all widgets (the
  README's "grab the title bar" behavior — was silently broken). Verified
  live: canvas drag pans the view (pixel-diff), widget stays at (30,48),
  header drag still moves widgets (bundle index-CyCFd4ac.js).

## Quick Start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (436.79 KB JS / 128.66 KB gzip + 49.19 KB CSS)
npx vite preview   # http://localhost:4173
npm run lint       # oxlint (5 pre-existing warnings, all benign)
```

Demo URL to see the full dashboard:
`http://localhost:4173/?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json`

## Architecture in One Screen

```
App.jsx (state: widgets[] + layout[], URL boot, persistence)
├── GridLayout (12 cols, vertical compaction)
│   └── WidgetFrame × N (fetch lifecycle, ⚙ config panel, refresh, header)
│       └── renderer: StatCard | RankingCard | TrendCard | GlamCard | MarkdownCard
├── AddWidgetPanel / ImportPanel / AboutPanel
└── src/widgets/index.js — WIDGET_TYPES registry (THE extension point)
    each entry: { id, name, icon, defaults, configFields, fetch, transform, renderer, labelFromConfig?, getRenderer? }
    fetch → raw data; transform → renderer contract; WidgetFrame owns loading/error/retry
    static widgets (e.g. markdown) omit `fetch` — rendered from config directly
```

Key files: `src/widgets/index.js` (registry), `src/widgets/dataSources.js`
(fetchers, one per widget type), `src/widgets/WidgetFrame.jsx` (lifecycle + renderers),
`src/lib/dashboardConfig.js` (format + `validateDashboard()` + example),
`src/lib/markdown.js` (zero-dep Markdown renderer for the Text/Markdown widget),
`src/lib/share.js` (URL loading/sharing).

## Hard-Won Technical Gotchas (don't rediscover these)

1. **`exturlusage` clamps `eulimit` to 500** for non-bot users (verified:
   `eulimit=5000` returns 500 + warning). The fetcher paginates 10 pages =
   5,000, matching Special:LinkSearch. `eunamespace=0` gives article-space-only counts.
2. **Commons `prop=globalusage` entries have NO `ns` field** (keys: title/url/wiki only).
   The GLAM widget's article-space filter uses a URL-path namespace heuristic
   (see `NON_ARTICLE_NS` in dataSources.js). Localized namespace names
   (Diskussion:, ノート:) are conservatively counted as articles.
3. **PetScan ignores the `max` cap** in quick-intersection mode (max=100 →
   all 239,084 files, 39 MB response). Never call PetScan from this app for big
   categories — the GLAM widget does its own bounded categorymembers walk.
4. **Long filenames blow multi-title GET URLs** (HTTP 414). Batch by encoded
   length (~4,500 chars), not by count — see `fetchBatchedUsage`. **BUT the
   anonymous `titles` cap is 50 per query** (`toomanyvalues`, lowlimit 50 /
   highlimit 500 for bots) — length-only chunking silently breaks when short
   filenames pack 70+ titles into a chunk (every query returns empty
   `query.pages`, NO error surface). Chunk by **min(count 50, length
   4,500)**. Fixed 2026-08-16: GLAM widget showed 0 used/0 views for
   "Images from XBio" while glamtools returned 518 files · 38 used · 40
   pages · 110,092 views; after the fix the widget matches exactly.
5. **Commons Impact Metrics is allow-list only**: unregistered categories 404
   with "the category you asked for is not loaded yet". Registration via
   `{{Views from category}}` template, processed monthly. The planned CIM-first
   mode (try CIM, fall back to live) is a ROADMAP item — see
   docs/GLAMORGAN-WIDGET.md and the `wikimedia-commons` skill.
6. **Playwright coordinate clicks miss after layout shifts** (images loading
   change widget heights). For reliable browser tests, click via JS
   (`element.click()`) or re-snapshot, not stale refs.
7. **Wikimedia API etiquette**: pace requests (≥1s), use the
   `$WIKIMEDIA_USER_AGENT` env var, honor 429 Retry-After. Multi-title batching
   (50 titles/call) is the scale pattern — see docs/SCALABILITY.md.
8. **top.hatnote.com has NO CORS headers** — browsers can't fetch it directly;
   the Toolforge deployment uses the same-origin `/api/proxy` endpoint
   (deploy/server.js). Data updates ~02:00 UTC; month/day in URLs are NOT
   zero-padded; there is no "latest" path — back off from today.
9. **w.wiki redirects are browser-unfollowable to wiki pages**: the 301 itself
   carries `Access-Control-Allow-Origin: *`, but the target page (e.g.
   commons.wikimedia.org) sends no CORS headers, so `fetch()` fails with
   "Failed to fetch" and `redirect:'manual'` exposes no Location. Expand
   server-side (`/api/resolve`) — see the `wikimedia-url-shortener` skill.
10. **CSS: `overflow: hidden` on a flex item makes `min-height: auto` compute
    to 0** — a fixed-height flex column will crush such children to a sliver
    when content overflows (the GLAM title bug). Fix: `flex-shrink: 0` on
    children and let the container scroll.
11. **Stale index.html bites after deploys**: old bundles are deleted by
    `rsync --delete`, so a browser holding a cached index.html 404s. index.html
    is now served `Cache-Control: no-cache` (assets stay immutable); hard
    refresh (⌘⇧R) if a deploy looks missing.
12. **Commons `imageinfo` needs the `File:` prefix re-added after normalization** (fixed 2026-08-13): strip `File:` for display/normalization, but query titles must be `File:Title` — without the prefix every title resolves as a missing main-namespace page and the gallery silently shows "0 files · N not found".
13. **formatversion=2 returns canonical titles WITH spaces** (fixed 2026-08-13): even when you query `Ada_Lovelace`, the API answers `Ada Lovelace` — look up batched enrichment results by the returned title, not the underscore form (the Article List enrichment returned empty thumbs/extracts until fixed).

## Known Issues (details in docs/ARCHITECTURE.md §Known Issues)

**Tracked bugs & fixes: `docs/ISSUES.md`** — ISSUE-01 (leaderboard double rank numerals), ISSUE-02 (clickable category names), ISSUE-03 (ⓘ info button on every widget).

- **OPEN BUG — iOS Safari "Load failed" on Wikistats + pageviews widgets**
  (see **docs/BUG-REPORT-ios-safari-fetch.md**): Safari-only network-layer
  failures to `wikimedia.org` + `wikistats.wmcloud.org`, both networks, not
  reproduced in Chromium. Mitigations live (timeout/retry/cache, URL-bearing
  errors, 🧪 diagnostics panel). Deferred for later debugging.
- `_title` (custom widget title) isn't editable in the config panel
- **Reset leaves the URL config in place**: ↺ Reset clears localStorage + restores
  defaults, but if the page was loaded via `?config=…` or `#/d/<base64>` (or a w.wiki
  share link), a refresh re-applies the URL config (URL > localStorage > defaults
  priority) — the reset "doesn't stick". Fix: `handleReset` should also blank the URL
  params (`history.replaceState` to the bare path, removing `?config=` / `#/d/`).
- AddWidgetPanel: no Escape-to-close, no focus trap (SharePanel has Escape-to-close)
- Wikistats CSV parser is naive (no quoted-field handling) — fetching is now
  cached + retried, but the parse itself still assumes no commas in fields
- `handleLayoutChange` persists to localStorage on every drag tick (fine at current payload size)

*Fixed in Phase 0 (2026-08-12): resize reflow, error boundary, recharts,
`public/favicon.svg` + `icons.svg`. Added (2026-08-12): QR share panel,
responsive mobile stack (order follows grid layout), Wikistats cache + timeout
+ retry, 📝 Text/Markdown widget (static pattern + image domain policy),
🔥 Top Wikipedia Articles + /api/proxy. Added (2026-08-13): expanded Top Pages
view (MW API enrichment), w.wiki /api/resolve, GLAM wiki-column + title fixes,
Top-100 display fixes (default 10, single counter, wrap titles, card
containment), index.html no-cache.*

- ✅ **Dependency-drift defense (2026-08-16)** — react-grid-layout pinned
  exact `2.2.4` (the caret range let the 1.x→2.x config-object renames
  arrive silently — the cause of BOTH the dragConfig and gridConfig
  incidents); `npm run smoke` (scripts/smoke-grid.mjs) asserts measured
  grid geometry against intended formulas (starter h:4 = 356px, gallery
  w:12 full-width, height == h×80+(h−1)×12) — negative-tested to catch
  the gridConfig bug; ARCHITECTURE.md gains a Third-Party API Contracts
  watchlist with the upgrade procedure. Commit bed5af6.

## Next Steps (see docs/ROADMAP.md for the full plan)

1. ~~Deploy to Toolforge~~ — **done 2026-08-12**: https://wikibento.toolforge.org/
1. ~~Phase 0 cleanup~~ — **done 2026-08-12**: recharts, dead assets, resize listener, error boundary
1. ~~📝 Text/Markdown widget~~ — **done 2026-08-12**: static widget + image domain policy (see Current Status)
1. ~~🔥 Top Wikipedia Articles widget~~ — **done 2026-08-12**: hatnote via /api/proxy + WMF fallback (see Current Status)
1. ~~Top Pages expanded view~~ — **done 2026-08-13**: thumbnails + intros via MW API enrichment (see Current Status)
1. ~~w.wiki short URLs in ?config=~~ — **done 2026-08-12**: /api/resolve endpoint (see Current Status)
1. ~~GLAM display fixes~~ — **done 2026-08-13**: wiki-column shorthand + nowrap, title squish fix (see Current Status)
1. ~~Article Vitals widgets~~ — **done 2026-08-13**: Excerpt, Edit History, ORES Quality, WikiProject Assessment (see Current Status)
1. **Widget strategy agreed 2026-08-12** — ROADMAP §Strategy + WIDGET-IDEAS:
   power widgets (SPARQL, PetScan, URL extractor) → starter packs (7 JSON
   bentos; ship GLAM Footprint, Newsroom Pulse, Edit-a-thon Live first) →
   spike alert (hero feature). Brainstorm doc: wiki source SRC-2026-08-12-004.
1. **UX + WikiProject directions noted 2026-08-13** (user session) — ROADMAP
   §Phase 2: categorized Add Widget catalog (registry `category` field),
   slide-out toolbox instead of centered modal (drawer pattern proven in
   wikigraph), debounced search (don't load while typing; current search is
   local filter — note applies to future live-loading), lean display mode
   (decorations hidden by default, hover/tap to reveal). WIDGET-IDEAS Tier 6:
   WikiProject widget family — assessment scale + popular pages (endpoints
   verified: `/Popular_pages` = Rank·Views·Quality·Importance table, 501
   rows, ~360 KB; ⚠️ `prop=wikitable` doesn't exist — parse `prop=text`).
1. ~~Commons File Gallery + Article List widgets~~ — **done 2026-08-13**: pasted-list inputs (one per line), order modes, optional enrichment; PagePile/PSID list sources deferred (see Current Status)
1. ~~SPARQL power widget~~ — **done 2026-08-13**: WDQS/QLever/Humaniki + auto renderer + presets (see Current Status); map + force-graph renderers remain Phase 2
1. ~~Wiki Page embed~~ — **done 2026-08-13**: static iframe, desktop/mobile toggle, section anchors (see Current Status)
1. ~~CIM widgets~~ — **done 2026-08-13**: 8 separate precomputed widgets (see Current Status); starter pack / glamorgan merge deferred by design
1. **Wiki Edu campaign widget (optional, quick win)** — dashboard.wikiedu.org
   has public CORS-enabled JSON (`/campaigns/{slug}.json`, `/users.json`); idea
   and verified endpoints in docs/WIDGET-IDEAS.md
2. Phase 1: **time-range selectors** for pageviews, **CIM-first GLAM mode**
3. Phase 1.5: batching/efficiency layer (docs/SCALABILITY.md)
4. ~~QR code share~~ — **done 2026-08-12**: Share panel with client-side QR (see README)
5. ~~Shared fetch cache (Wikistats)~~ — **done 2026-08-12**: 5-min TTL cache +
   in-flight coalescing + 15 s timeout + retry (see README)
6. **Five content primitives (ISSUE-42)** — one canonical widget per content
   type (page/image/audio/video/3D), 1-or-n items + per-family display modes;
   **model3D widget (ISSUE-43)** — STL viewer, CORS + thumbnails verified
   (three.js lazy asset, Pannellum pattern)
7. **"Ask" NL widget advisor (ISSUE-44)** — intent-first catalog: user types
   what they want → LLM (registry-focused) returns widget options with
   pre-filled configs; phased: smart search → Ask panel → board assembly

## Identity & Attribution

- Author: **Andrew Lih** — Wikipedia/Commons username **User:Fuzheado**
- Use `User:Fuzheado` in User-Agents and on-wiki pages; **never** `User:AndrewLih` (old alias)
- See docs/AUTHORS.md; identity also baked into `~/.pi/agent/AGENTS.md`

## Session Notes for AI Agents

- The LLM wiki (`~/.llm-wiki`) has observations/insights from this project's
  development (search `wikiwidget`, `wikibento`, `commons-impact-metrics`).
- Relevant skills: `toolforge-nodejs` (**deployments — read before any webservice
  command**; the `static` webservice type does not exist, use node20),
  `wikimedia-toolforge`, `wikimedia-commons` (incl. Commons Impact Metrics section),
  `wikimedia-api-access`, `commons-file-resolution`, `wikimedia-api-strategy`.
- **Widget ideas bank:** docs/WIDGET-IDEAS.md — unprioritized proposals with
  verified API/CORS notes (Wiki Edu dashboards etc.); move to ROADMAP when scheduled.
- The on-wiki demo config is `Commons:WikiPortraits/Bento-demo.json` — the
  WikiPortraits project hosts it; coordinate changes with that page's editors.
