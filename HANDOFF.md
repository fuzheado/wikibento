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
| production bundle | `index-DYsqgVGH.js` (+ `index-FAW-1YrO.css`) |
| deployed | 2026-09-11 (second deploy — the CIM allow list now ships with the app) |
| registry | 39 widget types — 30 data-driven, 9 static |
| showcase catalog | `?config=/dashboard.json` — 39 widgets covering all 38 types |
| front door for demos | `?config=/demos.json` (the hub) |
| entry board | ✨ Example (3 starter widgets), or `?config=/article-switcher-demo.json` |
| pending deploy | none — this branch's tip is live; only docs changed after it (PR [#58](https://github.com/fuzheado/wikibento/pull/58) is open, so `main` is one merge behind production) |

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
`docs/ROADMAP.md` · `docs/ISSUES.md` (canonical tracker).

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

## Tutorial video (state as of 2026-09-11)

**Layout (2026-09-12):** `pipeline/` is the reusable engine (no WikiBento strings; contract in
`pipeline/README.md`), `video/` is the WikiBento project (script, scene plan, `demo.config.mjs`,
`actions.mjs`). npm scripts `tutorial:beats|narrate|record|build|review` all pass
`--config video/demo.config.mjs`. `tutorial:build` is per-chapter cached, so an edit costs seconds.

> **Read first:** [docs/TUTORIAL-VIDEO-STATUS.md](docs/TUTORIAL-VIDEO-STATUS.md) (our pipeline, how to
> run and verify it) and [docs/TUTORIAL-VIDEO-TOOLING.md](docs/TUTORIAL-VIDEO-TOOLING.md) (which
> off-the-shelf tools were evaluated, what we grafted from them, what was rejected for licensing).
>
> Short version: **record → narrate → assemble now runs end to end on macOS** and produces a narrated
> MP4 (`npm run tutorial:record` / `tutorial:narrate` / `tutorial:build`). Voiceover is **edge-tts**
> (free, no key; `--provider say` needs no install), content-hash cached. All on-screen text is
> rendered by a browser into PNGs (`cards.mjs`, `overlays.mjs`) and composited with ffmpeg `overlay`,
> so the assembler needs **no `drawtext`, no font files** — that is what unblocked the Mac. Fixed on
> the way: an end card that played second, and a white flash at every scene boundary.
> Still open: `SCRIPT.md` is not authoritative for `scenes.json`; the fx layer is unwired; nobody has
> listened to the synthesized narration yet.

Goal: a narrated screencast that teaches the eight basic steps (what it is; read a shared board; clear
it; add a card and set its subject; move/resize; export; store the JSON; reload with `?config=`).

Where it stands:

- `video/SCRIPT.md` — **the editable source of truth**: narration in beats, each with
  the action that must happen during that line, plus zoom / ring / sound / caption markers. Andrew is
  editing this; the wording and beat order drive everything else.
- `video/scenes.json` — the recorder's scene plan and the narration text the pipeline
  actually reads (starting state per scene, captions per scene).
- `pipeline/paths.mjs` — the one output-directory rule and the Playwright ffmpeg-cache
  probe, shared by every script (they each used to carry their own, three of them Linux-only).
- `pipeline/record.mjs` — records one clip per scene by driving the live app; `--only <id>`
  re-records a single scene.
- `pipeline/narration.mjs` — synthesizes `<out>/narration/<id>.ogg` via edge-tts / `say` /
  piper, skipping any line whose content hash is unchanged.
- `pipeline/build.mjs` + `cards.mjs` + `overlays.mjs` — assembles: trim each clip's blank
  lead-in, stretch it to its voiceover (max 1.5x, then freeze), composite browser-rendered badges / URL
  cards / captions, mux narration, concat behind a title card and in front of an end card, emit an `.srt`.
- `video/fx-proof.mjs` — proof of the highlighting layer: in-page zoom, red ring with a
  label, per-keystroke click sounds timed from the page, growing typed-text chip. **Not wired in yet.**
- Artifacts (not in git; regenerable): the recorded take lives under the resolved `--out` directory
  (`/opt/data/staging/wikibento-tutorial/` on the recording host; a temp dir elsewhere). The last full
  take there was ≈3:40, 1080p25.

**The known defect to fix next:** the assembler stretches a whole clip to fit its voiceover, so individual
actions drift several seconds away from the words that describe them. Fix = make actions land on their
beat *at record time* (narration as a phrase list with measured offsets; the recorder waits for the offset
before clicking), so no clip is ever stretched. `SCRIPT.md` is structured as beats for exactly this reason.

**Done 2026-09-11 (second pass):** `SCRIPT.md` is now the pipeline's real input — `beats.mjs` parses
it into beats, the voiceover is synthesized **one clip per beat** with measured offsets
(`narration/timing.json`), the recorder starts a beat clock and waits for each beat before acting, and
the 🔍/⭕ fx is applied **in-page** (CSS transform zoom + red ring) as part of the recording. Scene 1 is
wired end to end as the proof: a 1.2× push onto the third card held under the sentence describing it,
with rings on each card as it is named, and one caption per beat. Also fixed: the lead-in is now
*measured* (scene 1 spent 10.6s loading the board; the heuristic trimmed ~1s of it). See
[`docs/TUTORIAL-VIDEO-STATUS.md`](docs/TUTORIAL-VIDEO-STATUS.md) — `tutorial:beats` reports how much fx
is still prose (1 of 10 zooms wired, 3 of 15 rings).

**Done 2026-09-11 (third pass):** every scene's actions are now beat-timed — `STEPS` in `record.mjs`
names, per step, the beat whose words describe it; the runner waits for that beat and **warns when a
step overruns its beat** (it flagged one: scene 5's resize finishes 0.5s after beat 2 ends). Sub-actions
inside a beat are spread across it, so "four hovers as each icon is named" is four points in the beat,
and scene 5's drag continues *while* the reflow clause is spoken. The script's stale ⚠ "the action lands
after the words" notes are gone.

**Done 2026-09-11 (fourth pass):** every fx marker that *can* be drawn now is — **10 of 10 zooms and
17 of 19 rings** carry a `@target`; the two that do not are deliberate and documented in `SCRIPT.md`
(a ring cannot follow a card that is being dragged, and the raw wiki page has no title element). The
recorder draws a **URL pill** so scenes 2 and 8 can actually show `?config=` — a browser's address bar
is not part of a recording, so those two markers had no target at all before. Found while doing it: a
single `\?` inside the injected fx template literal collapsed to `?`, producing an invalid regex that
made the whole `window.__fx` script fail to parse — every marker in that take was a silent no-op, so
the recorder now says so if the fx layer does not install.

**Reviewed and revised 2026-09-12** after watching a take: the tutorial now says **widget** everywhere
(the product copy was fixed to match — Reset dialog, picker descriptions, config labels), scene 1
introduces the noun and what a widget can hold, the title card is 2.5s, scene 4 **clears the board with
the ✕ first** so the Marie Curie widget is built on an empty grid, its figure is now *proved* to change
(the recorder captures the pre-apply value, clicks Apply & Reload, and polls — `207,055,573 → 161,964`),
and the URL pill shows the address **decoded**. `scenes.json` no longer carries narration or captions.

**Fourth pass 2026-09-12:** scene 1 shows a board that demonstrates what the narration claims (the shipped
`article-vitals-demo.json` — chart, table, gallery, article, quality, history, subject picker), highlights
address widgets by `[data-widget-id]` so they cannot drift, and a test enforces "hear something, see
something". Builds are now **per-chapter cached** (`build/manifest.json`): nothing changed → ~6s, one
caption edited → ~18s, instead of a ~70s full rebuild.

**Versions are kept:** `tutorial:review` writes `wikibento-tutorial-<stamp>.mp4` (+ narration, transcript,
subtitles) and a `-latest` symlink, so takes no longer overwrite each other and can be compared
(`--label v3` names one by hand).

**Second review pass 2026-09-12:** the tutorial is **3:00** (was 3:41) — the ending was over-explained, so
scene 7 is two beats about a *JSON file on a wiki* (no MediaWiki-API or CORS talk) and scene 8 ends on the
payoff plus the share/QR. The widget in scene 5 now actually moves (the zoom on that beat was transforming
the app root mid-drag, so the drag never engaged — and the check that should have caught it compared whole
box objects and passed on a 1px rounding). And an intermittent ffmpeg shutdown deadlock — output `-t` plus
endless `-loop 1` image inputs — is gone now that every stream in the graph is finite: builds went from
10-minute hangs to ~70 seconds.

**Also queued:** the 3 🔊 sound markers need post-production (no audio is recorded); scene 5's beat 2
overruns by 0.5s (needs more words or a quicker gesture); and a human listen to the narration. The
`note` field in scenes.json (the lower-left annotation line) is not derived from SCRIPT.md, which is
the one piece of on-screen text the script does not own yet.

**Done 2026-09-11** (the tutorial needed them true, so the product changed rather than the narration):
Reset now asks — Cancel · **Blank board** · **Starter set** — and clears the board's `params` block;
**Export and the 🔗 Share link both carry `params`** (they silently dropped it, so a parameterised
board lost its controls through Export → wiki page → `?config=`, and a shared link arrived with the
cards but not the controls); and `persist()` at five call sites wrote `params: null` when only
widgets/layout changed, erasing the block from localStorage as soon as a card was moved — those now
keep the current block. Verified in a real browser (22 checks: reset flow, blank-board reload, export
payload, drag survival, share-link recipient) and by `tests/saved-board.test.mjs`. Scenes 3 and 4 need
re-recording (`--only 03-reset`, `--only 04-add`).

Measured facts worth keeping (2026-09-11, this host):

- In-page zoom works: a CSS transform on `#root` magnifies **1.80x** (a 461 px card measures 830 px), and
  magnified text stays crisp because the browser re-renders it — upscaling in ffmpeg cannot.
- `recordVideo` needs **Playwright's own** ffmpeg (`ffmpeg-<rev>/` under `PLAYWRIGHT_BROWSERS_PATH`, else
  the platform default cache), not the system ffmpeg. `record.mjs` preflights it. The one-time fix is
  `node node_modules/playwright-core/cli.js install ffmpeg` — **not** `npx playwright install ffmpeg`,
  which resolves a different playwright version and prunes the engines you do not name.
- The system ffmpeg here has **no text filters at all** (no `drawtext`, no freetype) and Homebrew ships
  `libopus` but not `libvorbis` — the pipeline is built to not care about either.
- Real selectors (guessing them by text costs a whole take): the top button is a plain
  `button.btn.btn-primary` reading "+ Add Widget"; the picker's field is `.add-widget-search`
  (placeholder "Search widgets… (name, source, category)"), and it is **inside `#root`**, so transforms
  applied there affect it.
- The auto-zoom tutorial tools (OpenScreen / Recordly / OpenScreen Studio) cannot run here: this host is
  **aarch64** and OpenScreen v1.11.0 ships no arm64 Linux asset (AppImage/deb/rpm/pacman only), Recordly
  has no releases. They also infer zooms from cursor position, whereas we know the exact bounding box of
  the element we are pointing at.
- Drag recipe (measured): one column of the grid is ≈262 px of pointer travel at 1920 px wide; a card in
  the leftmost column cannot move left (it snaps back) and drags must be handed to the card's top bar.
