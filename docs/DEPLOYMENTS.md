# WikiBento — Deployment Log

*Append-only. Newest first. Superseded entries here are **expected**, not wrong.*

**Why this file exists.** HANDOFF.md used to accumulate one "DEPLOYED <date> —
bundle …" bullet per session, so a document whose job was to state *what is true
now* was also a changelog: deployed bundle hashes, commit refs, dated
"verified live" notes and running test totals interleaved with present-tense
guidance. Facts written *by value* rot — by 2026-09-10 HANDOFF claimed
`main = afd308a` (actual HEAD had moved past it), "37 widget types" (the
registry held 38), and `npm test 212` (it was 229), with nothing to catch it.

The fix is the split this file makes: history belongs in a log, where a stale
entry is *normal*; HANDOFF states only the present. `scripts/docs-facts.mjs`
enforces it — the volatile-facts rules (no bare SHAs, no running test totals, no
byte-precision) apply to the present-tense docs only, and exempt this file and
`docs/ISSUES.md`, which are logs. `--live` also verifies the bundle HANDOFF
claims is deployed against what production actually serves.

Where other detail lives: **design rationale and full verification evidence** →
`docs/ISSUES.md` (ISSUE-NN per change); **feature documentation and the
"verified working" record** → `README.md`; **API behaviour and gotchas** →
`docs/DATA-SOURCES.md`, `docs/ARCHITECTURE.md`, `docs/GLAMORGAN-WIDGET.md`.

## How a deploy works

Full detail in `docs/DEPLOYMENT.md`. The shape (fresh-session safe):

```bash
npm run build        # runs the full test suite (a non-compliant widget blocks the build)
rsync -az --delete dist/ alih@dev.toolforge.org:/data/project/wikibento/www/js/dist/
ssh alih@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes node20 restart"
```

Verify after deploying: the bundle hash in the served `index.html`, `/api/resolve`
returning 200, and `node scripts/docs-facts.mjs --live` (which compares the bundle
HANDOFF claims is live against production). `index.html` is served
`Cache-Control: no-cache` because `rsync --delete` removes the old bundles — a
browser holding a cached `index.html` would 404 (hard-refresh to clear).

## Log

Bundle hashes and commits are transcribed from what each session recorded (in
HANDOFF, or `docs/ISSUES.md` for ISSUE-numbered work); a blank commit means the
session recorded only a bundle. Status of the deployed *service* for the earliest
entries was not always re-verified — the "ships" column is what the deploy was
for, not a claim about behaviour today.

| date | bundle | commit | ships |
|---|---|---|---|
| 2026-09-11 | `index-B-t2hIBH.js` | `1167e25` | **The big catch-up deploy** — 35 commits: 🔳 IA Item widget (39th type, `iaItem`), share lean/full mode, Wayback tile states, the validated `lookup` param (ISSUE-68) with its allow-list relay, the CIM registration correction, and `deploy/server.js` (+156/−74 — pushed separately; the standard `dist/` rsync alone would not have carried it) |
| 2026-09-10 | `index-6udjc6im.js` *(unchanged)* | `b0ef076` | Config-only deploy, third that day: the glam demo's 🏆 CIM Global Leaderboard switches to `scope: shallow` (direct category attribution instead of the diffusion-inflated tree rollup — deep and shallow share only 39 of their top 100), the demo hub's markdown count is corrected to 38 widget types, and the README's demo table to five institutions |
| 2026-09-10 | `index-6udjc6im.js` | `e658dab` | Second deploy: finally ships the 🔳 **QR widget** (PR #47 — merged earlier the same day, never deployed) together with the new `deploy/server.js` (the Ask dataflow manual is now *derived from the manifest*, so a new emitter can't be silently missing from the prompt), the complete **39-widget showcase catalog** (🛒 Board Controls driving an `article` param that re-aims five cards, 🔳 QR), the `docs-facts` constitution and the HANDOFF now-document split |
| 2026-09-10 | `index-D9wl_Ty8.js` | `534cff7` | ISSUE-64: TrendCard Y-axis ticks + gridlines + `zeroY` scale toggle (Article Pageviews trend, CIM Views Over Time) — GitHub #42, PR #43 |
| 2026-09-10 | `index-TTSz7Lkm.js` | `edd68f0` | ISSUE-44 Phase 3a: Ask **board assembly** (describe a board → wired params + widgets + `{{widget:id}}`, added below the current board with Undo). Superseded same day by the ISSUE-64 deploy |
| 2026-09-09 | `index-DxO6r8uA.js` | `e29fe77`, `e75dd19` | Demo suite + `?config=/demos.json` hub (ISSUE-63), custom-URL embeds (ISSUE-62), rate-limit guards (ISSUE-61), user guide + config-URL error handling (ISSUE-60), Ask manifest v3 |
| 2026-09-09 | `index-BWKLfppo.js` | — | First six-PR session deploy: 🔊 Speaker (#17), 🌐 Translator/MinT (#21), request-serial guard (#24), ⚙/ⓘ panel reachability (ISSUE-54, #31), docs research series (#30), ROADMAP Phase 2.5 (#29) |
| 2026-09-08 (recorded) | `index-DWKLfppo.js`, `index-CGBDkEU8.js` | — | GLAM view-budget + ISSUE-53 (widget instance names / rename repointing). `DWKLfppo` as recorded — likely a typo for `BWKLfppo` |
| 2026-09-08 | `index-OJOY0xwd.js` | `e4d248b` | ISSUE-52: widget-to-widget dataflow (`source` picker + `{{widget:id}}` + the 🧾🔎🔢🖨️ chain) |
| 2026-09-08 | `index-DHc3p4sT.js`, `index-BLGokffr.js` | `481dee2` | GLAM 2026-09-08 work (recorded as a group; `BLGokffr` = full merged main incl. the view-budget fix) |
| 2026-09-08 | `index-ejrRtwiS.js` | `22375cc` | GLAM view-budget 150 → 2,000 pages, 429s retried as transient, `· N pages failed` surfaced |
| 2026-09-08 | — | `3f219d9` | Firefox/Safari CORS fix (no `User-Agent` header on browser GETs — it triggered preflights) + the cross-browser matrix; also ISSUE-51 gallery options (#12) and QID→label resolution (#11) |
| 2026-09-03 | `index-BgEdNEa0.js` | `3f219d9` | Cross-browser fix land + `npm run test:browsers` |
| 2026-09-03 | `index-DClvfKWq.js` | `ba33105` | CIM shallow-vs-deep gap indicator (Issue #5) |
| 2026-09-01 | `index-BHGlMTfE.js` | — | CIM month-lag fix: `latestCimMonth()` resolves the latest *published* month; 4xx fetches terminal |
| 2026-09-01 | `index-D5iaTtCr.js` | — | CIM File Spotlight image preview |
| 2026-09-01 | `index-DBwecE6U.js` | `5d941c8` | Media player: Commons description + `Artist · License` credit, Markdown annotation |
| 2026-09-01 | `index-DjTAjvPz.js` | `d1f3860`, `b584f60`, `00b2dd7` | ISSUE-50 board params prototype: `{{param}}` interpolation + 🎛️ Board Controls, then number slider + month stepper |
| 2026-08-17 | `index-B_hgqo4i.js` | `ebb4af7` | GLAM PetScan relay (ISSUE-46) + `fileBudget` ceiling 1,000 → 30,000; ISSUE-47 clickable GLAM/CIM titles |
| 2026-08-16 | — | `ee70ce4` | Gallery full-width defaults + content-fit height; found `gridConfig` prop drift (rows were rendering at RGL's 150px defaults) |
| 2026-08-16 | `index-DkcrAAk0.js` | `3bfad47` | ▣ Lean mode; prior same-day `index-DdJRNUuD.js` (`c9f7bbc`) = 🎬 Video/Media Player (ISSUE-39) |
| 2026-08-16 | — | `5378088`, `165c014` | ✨ Ask advisor (ISSUE-44 Phase 1) + `/api/ask` LiftWing relay |
| 2026-08-15 | — | `3c94ab8` | Kiosk mode (⛶ Present, `?kiosk=1`) — ISSUE-18 |
| 2026-08-14 | `index-C3DXQFad.js` | `a7f5ee7` | Freshness constitution (⏱ last-run stamp on every fetch widget) |
| 2026-08-13 | `index-CyCFd4ac.js` | — | Grid drag fix (`dragConfig` handle — widget drags were starting anywhere) |
| 2026-08-13 | `index-D4DEEPkT.js` | `68dea21` | 🗂️ Commons File Gallery + 📋 Article List (pasted-list inputs) |
| 2026-08-13 | `index-DiStWjwF.js` | `7e022f7` | The 8 CIM widgets (Commons Impact Metrics) |
| 2026-08-13 | `index-BJjaG_ta.js` | `bfbce6e` | 🧠 SPARQL Query widget (WDQS/QLever/Humaniki + presets) |
| 2026-08-13 | `index-BdMTw21V.js` | `f7dfa44` | 📄 Wiki Page iframe embed + mobile view |
| 2026-08-13 | `index-bbwxWEKh.js` | `4cf2c93` | Gallery square tiles + letterboxing (`imageFit`) |
| 2026-08-13 | `index-BqgxhKa5.js` | `4cf2c93` | Gallery overflow fix (content-height card covered its own header) |
| 2026-08-13 | `index-BEguwTL7.js` | `4cf2c93` | 🖼️ Article Gallery (REST media-list + batched imageinfo) |
| 2026-08-13 | `index-BSwIQuK-.js` | `ec9d26c` | 🌐 360° Panorama Viewer (vendored Pannellum, lazy asset) |
| 2026-08-13 | `index-CF9Vo_m5.js` | `b9d62f7` | Article Vitals: 📄 Excerpt, 🕓 Edit History, 🏅 ORES Quality, 🧭 WikiProject Assessment |
| 2026-08-12 | — | — | First Toolforge deploy: `node20` webservice serving `dist/`, plus `/api/proxy`, `/api/resolve` |

## Notable deploy-time findings

The lessons that only showed up *after* deploying — worth keeping because each
one changed the code or the procedure. Nothing here is a current to-do; it is
the record of what deploying taught us.

- **A deploy can be real while the bundle hash stays the same** (2026-09-10). The
  third deploy shipped only `public/*.json` changes (a board's widget config, a
  markdown count) — Vite copies `public/` verbatim instead of bundling it, so the
  JS hash was identical before and after. Verifying "the bundle hash changed"
  would have proved nothing; the serve-side check has to read the shipped JSON
  (`/glam-demo.json`, `/demos.json`) and, best of all, the rendered result. For
  the leaderboard scope change the decisive check was comparing the live card's
  rows against the shallow API response for the resolved month — the card read
  `1. Uploaded with VicuñaUploader 4,978,286,576`, matching shallow, where deep
  would have shown UNESCO 6.1B.
- **`dist/` is not the whole deploy — check `deploy/` too** (2026-09-10). The
  second deploy needed `deploy/server.js` as well as `dist/`, because the Ask
  dataflow manual had moved from a hardcoded list to one derived from the
  manifest. Shipping only the new `dist/` would have left production running the
  old server that still claimed "only these five widgets emit" — wrong for the
  first time a sixth emitter (qrCode) existed. Before deploying, diff the
  deployed commit against `HEAD` and include `deploy/` when it changed:
  `git diff --stat <deployed-commit>..HEAD -- deploy/`.
- **A deploy can carry several sessions' merged work.** This one shipped the QR
  widget (PR #47), the derived-manual server change, and the catalog/docs work
  together, because `main` had accumulated merged-but-undeployed commits. Verify
  the *live* result, not just the deploy commands — the checklist used here was:
  served bundle hash, `/api/resolve` → 200, `/manifest.json` (v3, `widgetCount`,
  emitters present), `/dashboard.json` (39 widgets / 38 types / `params.article`),
  and a browser pass on the live board (frames rendered, 0 error frames, the QR
  card's inline SVG, and the param switcher re-aiming all five cards).
- **`main` SHA and running test totals do not belong in prose** (2026-09-10).
  HANDOFF's `main = afd308a` was already stale, and its `npm test 212` was 229 by
  the time anyone read it. Now enforced by `scripts/docs-facts.mjs`.
- **Don't quote build bytes — and never diagnose an artifact diff without
  pinning the commit first** (2026-09-10). Exact byte counts change with every
  source change, so README quotes a *magnitude* and `docs-facts` bound-checks it
  instead of pinning decimals. The related trap cost a **wrong diagnosis** the
  same day: a rebuild of the working tree did not match the deployed bundle,
  which invited a "toolchain drift" explanation — but `HEAD` had moved past the
  **deployed commit**, and the QR widget (PR #47) had never been deployed.
  Rebuilding the deployed commit `534cff7` with today's toolchain reproduced the
  live bundle **byte-for-byte** (md5 `3482ffbb752e6c097f04d7d3fcf6ca27`), so
  nothing had drifted. (`react-grid-layout` *is* pinned exactly, after two silent
  API-drift incidents — `dragConfig` and `gridConfig`, see
  `docs/ARCHITECTURE.md` — but that is a separate, real lesson.)
- **Merged is not the same as live.** Production ran `index-D9wl_Ty8.js` (built
  from `534cff7`) while `main` had already merged the 🔳 QR widget (PR #47): the
  live bundle contains none of its code. A "current production bundle" line says
  *which* artifact is live, never *how current* it is — check the gap with
  `git log --oneline <deployed-commit>..origin/main`.
- **A view-budget fix can still undercount through 429s** (2026-09-08).
  Verifying the GLAM view-budget fix live exposed a *second* silent-wrongness bug:
  the view walk's ~285-request burst trips the pageview API's rate limiter, and
  429s were terminal in `fetchTextWithRetry` **and** zero-filled by
  `fetchMonthlyViews`' catch-all — one live run silently lost ~65% of views while
  a clean run matched the offline reproduction exactly (1,375,031). Fix: 429 is
  transient (404 stays terminal), `fetchMonthlyViews` returns `null` on
  non-404 failure (0 keeps meaning "genuinely no data"), and the card appends
  `· N pages failed`. Lesson: a partial result must be *quantified*, never zeroed.
- **CIM's 404 is ambiguous** (2026-09-01). A registered category with no data for
  the requested month returns the same "not loaded yet" body as an unregistered
  one — and because the disambiguation probe was built from the same
  `prevCimMonth()` as the main request when `month=0`, probe ≡ main → both 404 →
  a false "register via {{Views from category}}" verdict for long-registered
  categories at every month start. Fixed with `latestCimMonth()`.
- **Wikimedia rejects a `User-Agent` request header from browsers** (2026-09-03).
  Chromium strips it before the CORS preflight check (which masked the bug);
  Firefox and WebKit preflight *with* it, and RESTBase's allow-list accepts only
  `api-user-agent` while CIM 405s `OPTIONS` — producing the exact working/failing
  split seen on iOS Safari. Full diagnosis:
  `docs/BUG-REPORT-ios-safari-fetch.md`. Never set custom headers on browser GETs.
- **`rsync --delete` plus a cached `index.html` 404s the app** (2026-08-12 →
  fixed). Old bundles are removed on deploy, so a browser holding a cached
  `index.html` requests a bundle that no longer exists. `index.html` is served
  `Cache-Control: no-cache` (assets stay immutable).
- **Measuring again beats trusting the claim — twice.** The `gridConfig` drift
  (2026-08-16) was invisible because the board *looked* fine at RGL's 150px row
  defaults, and the panel-clipping bug (ISSUE-54) was invisible because the
  catalog's authored sizes mostly pass while 21/35 widget types clip at the
  fresh-add size. Both became constitutions (`npm run smoke`,
  `npm run smoke:panels`) rather than one-off fixes.
