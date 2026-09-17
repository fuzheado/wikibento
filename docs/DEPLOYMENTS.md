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
| 2026-09-16 (fourth) | `index-68WWsiDw.js` | `f12a22c` | **A click in a box opens a new tab (ISSUE-91).** `wikiBox` rendered MediaWiki's own anchors, which have no `target` — sensible on the wiki, destructive here: clicking "Weddell Sea" in `{{List of seas}}` replaced the whole board. Anchors are now rewritten to `target="_blank" rel="noopener noreferrer"` **before** the sanitiser (so the attribute survives the allowlist), matching the 36 other content-link sites in the app; an anchor asking for another target is respected. Verified live: 111 links in the five demo cards, all 111 targeted, a click opens a new tab and the board keeps all five cards. The richer pattern — a click that *means something to the board* (load a page into another widget, emit the title to a map or gallery) — is specced in ISSUE-91 with an audit of what is possible today: nothing emits because a reader clicked, and a cross-origin iframe never reports its clicks. |
| 2026-09-16 (third) | `index-CQrYr5Qg.js` (+ `index-BWgKdWiq.css`) | `1cd545a` | **📰 Wikipedia boxes (ISSUE-90).** A new widget renders any Wikipedia template with the wiki's own markup *and* its own TemplateStyles: `action=parse&text={{In the news}}` returns both in one CORS call, because parsing a *transclusion* skips `<noinclude>` (the documentation furniture) and TemplateStyles arrive inline and already scoped to `.mw-parser-output`. Five cards ship as a demo (`/front-page-demo.json`): In the news, Today's featured article, Did you know, the selected anniversaries and the real Picture of the day. Three traps, all now documented: wrapper templates only render in the Main Page context (the dated subpages return the real boxes), `{{CURRENTYEAR}}` magic words collide with board params (hence the widget's own `{date}` tokens), and the API returns relative URLs that would otherwise send readers to wikibento. Untrusted input goes through an allowlist sanitiser and a CSS rule filter; the box also emits one line per item so it can drive a dataflow board. Verified against production: all five boxes render, 0 relative URLs, nothing clipped. |
| 2026-09-16 (second) | `index-DuKM6csr.js` (+ `index-CI1Ga_V5.css`, unchanged) | `9de72cc` | **A big board now fits in a QR code (ISSUE-89).** The self-contained share link is now gzipped before it is embedded (`#/z/…`, with `#/d/…` still loading forever), which takes the boards in `public/` from 1 of 15 fitting a QR to 13 of 15 — the reported 4,012-character board becomes 900 characters and renders a QR. `buildCompactShareLink` picks whichever form is shorter, the two boards that still cannot fit are refused as before, and the failure message now offers the transfers with no length limit (copy the link, or Export → AirDrop → Import) instead of telling the user to trim their board. Cost one trap, now gotcha 23: a `CompressionStream` deadlocks if the writer is closed before the readable is read, silently falling back to the long link — Node does not reproduce it, and the audit caught it. Verified against production: 18 actions traced, 0 invariants broken. |
| 2026-09-16 | `index-BDLuwt1c.js` (+ `index-CI1Ga_V5.css`, unchanged) | `b44cc2a` | **A shared link borrows a board (ISSUE-88).** Opening someone's `?config=` link no longer overwrites the visitor's saved board: a URL board is *borrowed* — shown, never written — until the visitor edits, at which point it is adopted and the board it displaced is kept recoverable for a day. A slim notice appears only when something is at stake: *"👀 Viewing a shared board — GLAM. Your own board is saved and untouched"* with [Save this as mine] / [Back to my board], becoming *"💾 Your previous board is saved — recoverable for today"* with [Restore my board] after an adoption. One signal does both jobs: the fingerprint divergence that drops the URL's claim is the moment of adoption. Verified against production by the audit: 17 actions traced, 0 invariants broken. |
| 2026-09-15 (seventh) | `index-DnrNeY2o.js` (+ `index-CI1Ga_V5.css`, unchanged) | `18ea65b` | **ISSUE-87, corrected by its own audit.** Asked to confirm the fix was complete, re-auditing found four defects: a unit test that could never fail (it compared a value with the table it is derived from), inventory gaps (link navigation — the one place a push is right — plus the speaker, diagnostics and undo-does-not-re-claim), the suite list and GUIDE not mentioning the new behaviour, and mount-time layout placement being counted as an edit, which killed the claim on arrival for any config whose layout had gaps. The gesture that drops the claim is now drag/resize *start*: RGL 2.2 fires a *stop* handler while placing the board. The audit traces one edit per class — widget removed, param changed, card dragged — and was run against production after this deploy: 11 actions, 0 invariants broken. |
| 2026-09-15 (sixth) | `index-CXkEamrO.js` (+ `index-CI1Ga_V5.css`, unchanged) | `4820f2d` | **The URL stops lying (ISSUE-87).** ↺ Reset dropped its `?config=` claim, and so does every board edit — an effect on the board fingerprint, so the address bar can no longer describe a board that is no longer there. Share builds its link from the board on screen (#/d/<payload> once the config claim is stale) instead of echoing the address bar, which previously handed recipients the file's board rather than the one being pointed at. All URL access now goes through `src/lib/urlState.js` (one reader, one writer, enforced by a source scan), and `npm run smoke:url` traces 9 actions in Chromium — verified in production, 12/12 checks, plus a 3s guard that a quiet load is not an edit. |
| 2026-09-15 (fifth) | `index-BEaAHn9L.js` *(unchanged)* | `b3532a6` | **Config-only: Andrew's own tighter layout for `/document-reader-demo.json`.** He edited the board himself (height 39 → 34 by resizing five cells, plus the app's export fields `moved`/`static` and a `params: null`), asked for it to be noted and deployed, and nothing else changed — the JS bundle is byte-identical, so no restart was needed and the served JSON was diffed against the repo copy to confirm it: **identical, 4,453 bytes**. The board renders live with five cards, the transcription panel open on load and all four documents reporting 329/96/38/16 pages. The only byte I touched was a missing trailing newline. |
| 2026-09-15 (fourth) | `index-BEaAHn9L.js` (+ `index-CI1Ga_V5.css`) | `f0ae35a` | **The transcription panel becomes a sticky toggle.** Two notes from Andrew, which were one fix: the Wikisource text should be visible when the card loads, and it should not vanish on a page turn (he had to press ¶ again each time). Now the panel opens by default when its source has text and the card asks for it (⚙ *Transcription* on the 📄 Document Reader — "show it from the start" or "hidden until I press ¶"), it **follows the reader**: turning a page reloads the text for the page in view, with a sequence guard so a slow response cannot overwrite a newer one, and ¶ is a genuine toggle with `aria-pressed`. A panel that stayed open showing the *previous* page's words would be worse than one that closed, which is why the reload is part of the same feature. The IA Book card keeps its ¶ opt-in — there the text is a bonus, not the point, and the panel costs the page its room — but it is sticky too. Verified live: showing on load with ¶ already pressed, no panel on untranscribed cards, page 19 updating itself to 1,458 characters under EN.WIKISOURCE · VALIDATED, page 20 keeping it open with 1,598 different characters, ¶ closing and reopening — **8/8**, no uncaught JS errors. `smoke:document` 37 assertions, `smoke:iabook` 33 (its test now waits for the words rather than for the container, which the change exposed as a race). 439 tests. |
| 2026-09-15 (third) | `index-B8NGcYXL.js` (+ `index-CI1Ga_V5.css`) | `a1c48a7` | **The Wikisource text layer.** Where volunteers have transcribed a Commons document page by page on **Wikisource**, the 📄 Document Reader grows a **¶ button** showing each page's text **with its proofreading grade** and a link to the transcription. One `globalusage` call detects a transcription (a `Page:`/`Index:` usage on a Wikisource — a cross-wiki *link* is not one); **one** `prop=proofread|revisions` call per page returns the words *and* the grade, which is the point: a merely scanned volume says *"Not proofread (uncorrected OCR)"*, a validated one says *"Validated"*, and a reader has to know which they are quoting. The demo fixture is a 38-page, 0.89 MB validated pamphlet (`"Homo Sum"`); the 1,208-page bulk-OCR reference set the traps were measured on is kept for measurements, not for every run. Also here: the demo's cards are named after their works (`dr-homosum`, `dr-mozart`) because a capability is not a widget. Verified live: five cards reporting 329/96/38/16 pages, ¶ on the transcribed card and absent on the untranscribed ones, page 19's 1,458 characters under EN.WIKISOURCE · VALIDATED, the 42-card catalog with no crash, the IA and 1929 boards unchanged, both endpoints 200 — **17/17**, no uncaught JS errors. 439 tests, `smoke` 252 measurements, `smoke:document` 31, `smoke:iabook` 33. |
| 2026-09-15 (later) | `index-YJ87Jsl0.js` (+ `index-CIDXj2nC.css`) | `c61042c` | **The Document Reader** — read a **PDF or DjVu from Wikimedia Commons** (or any wiki) page by page in the *same* viewer the Internet Archive books use: turn, zoom, jump to a page, **facing pages**. One `imageinfo` call gives the page count and a page-1 render template, so a 329-page book costs what a 2-page one does; the credit comes from `extmetadata`, and **Open the original** hands the file to the browser's own PDF viewer. Two additions to the shared reader came out of it: `caps.maxWidth` (a source's ceiling) and `caps.widths` (a source that serves a fixed width list — see the trap below), plus a **page-jump** control, which a 329-page document needs, and a "this page did not load — open the original" sentence instead of a blank hole. New demo board `/document-reader-demo.json` (a 329-page PDF + a DjVu beside an IA book: one reader, two archives). **The trap, found only by running it:** a document page render is served at only certain widths — 120/250/330/500/960/1280 work, while 70/150/200/320/400/640/700/800/1024/1200 return an HTTP 400 **HTML** page, which Chrome then refuses to give an `<img>` at all (`net::ERR_BLOCKED_BY_ORB`) — so the first run showed blank cards with no icon and no message. Identical on PDF and DjVu, and *not* MediaWiki's image-thumb set. Verified live: the document board's three cards report 329/96/16 pages and the DjVu reaches page 96 of 96; the showcase catalog renders **42 cards** including the new one, with no crash; the IA board still opens as facing pages; the 1929 board still draws 21 timeline dots; `/api/resolve` and `/api/proxy` 200; front door fine — **14/14**, no uncaught JS errors. 421 tests, `smoke` 42/42 widgets and 252 panel measurements, `smoke:document` 24, `smoke:iabook` 33. |
| 2026-09-15 | `index-D9YNjKJA.js` (+ `index-DGfyoQMG.css`) | `8220b99` | **The Internet Archive pass, and a shared page reader.** 📖 **IA Book** — a scanned archive.org book read in a new shared viewer: turn, zoom, a thumbnail strip, **search inside** (IIIF Content Search, each hit naming its page and showing the matched word boxed on it), per-page OCR text, and PDF/EPUB/OCR/DjVu links. The viewer (`src/lib/pagedViewer.js` + `src/widgets/PagedViewer.jsx`) reads a *page source*, so a Commons PDF/DjVu reader (ISSUE-82) reuses it — and **facing pages** with **right-to-left** support (Arabic/Hebrew/Yiddish scans put the later leaf on the left) landed once for both, settable per board via ⚙ *Reading mode*. 🎬 the media player now takes **direct media URLs** — an `archive.org/download/…` file plays with no API call and no key (Range requests make seeking work); the codec trap recorded: Chromium plays mp4/H.264 and reports `canPlayType: ""` for Theora `.ogv`. ⤓ **PNG export for CORS-image widgets** (ISSUE-80): an HTML/CSS card whose image host allows CORS rasterises safely, so a book page exports as a real PNG (4.4 MB at 2×). Plus **two demo boards** — `/internet-archive-demo.json` (two books in facing-pages mode, four archive items, two players) and `/anne-frank-mlk-demo.json` (one story: two lives on one axis with prose, images and traffic). Verified live: the showcase catalog's **41 cards with zero crashes**, both books showing facing pairs with both page images loaded, the film player at `duration 664s`, 21 timeline dots on the 1929 board, the older Lifeline board still rendering, `/api/resolve` 200 and `/api/proxy` relaying 200 — **10/10**, no uncaught JS errors. 403 tests, docs-facts 7/7, `--live` 8/8. |
| 2026-09-14 | `index-CSKC-SIk.js` | `1e54db7` | **The Lifeline catch-up deploy — 28 commits.** Two timelines on one shared axis (`timeline` renderer + `two-lives` and `curie-pair` presets, calendar *or* age alignment, − / + zoom to 8×, an overlap-band toggle, a light card theme, per-card titles); a **⤓ export menu** (PDF, CSV, PNG, SVG) per widget; the **`mul` label fix** (Marie Curie and every other language-neutral name were rendering as `Q7186` — this affected *every* entity-labelling widget, not just the timelines); the **preset query** now visible in the ⚙ panel instead of an empty box; and **`BarCard` restored** — rewriting the timeline card in `e4cdad8` had deleted it, so bar-rendered SPARQL widgets threw `ReferenceError` on main for three commits (never in production, which predated that commit). Verified after deploy: 46 timeline dots across 4 lanes, 40/40 showcase widgets with zero crashes, 40 export menus, PNG correctly disabled for HTML/CSS widgets, `/api/resolve` and `/api/proxy` both 200. |
| 2026-09-12 | `index-C8b1z4iU.js` | `8334f74` | **Widget names, for the video pipeline.** Every `.grid-item` now carries `data-widget-id`, so a recorder (or a script, or a test) can address a card by name instead of by position — `[data-widget-id="views"]`, never `:nth-child(3)`. That is what made the [tutorial video](TUTORIAL-VIDEO-STATUS.md) scriptable. *Reconstructed 2026-09-14: this deploy was never logged at the time. The commit is the one whose features production has, not necessarily the exact build that produced the bundle — and it is the last deploy recorded here, so everything after it is committed but not live.* |
| 2026-09-12 | `index-DkeLIrq2.js` | `d176f79` | **Vocabulary: everything is a widget.** The product copy called the same box a “card” in places and a “widget” in others, and the tutorial video shows both the Reset dialog and the Add Widget picker on camera, so the two disagreed on screen. Fixed: the Reset dialog’s message (“every widget”, “the three-widget starter set”), the Markdown widget’s own text, the registry description for it, the config panel’s “Params on this widget” plus its hint, the “none of this widget’s selected params” notice, and the QR density warning. Left alone deliberately: `Stat Card`, which names a *display mode* (against `Trend Chart`), not the box. Two deploys minutes apart—`index-DJd2USKl.js` carried the main sweep, this one the remaining hyphenated “three-card” a scan had missed |
| 2026-09-11 | `index-gl3ILPmw.js` | `df06d4f` | **Reset now asks, and params travel.** Three product bugs the tutorial could not honestly teach around: Reset opens a dialog (Cancel · **Blank board** · **Starter set**) and clears the board's `params` block with the cards; **Export and 🔗 Share both carry `params`** (both silently dropped it, so a parameterised board lost its controls through Export → wiki page → `?config=` and through a shared link); and `persist()` at five call sites wrote `params: null` when only widgets/layout changed, erasing the block from localStorage as soon as a card was moved. New `src/lib/savedBoard.js` also fixes boot: an **empty board is now restorable** (the old rule required non-empty widget and layout arrays, so a deliberately blank board came back as the three starter cards). Verified in a real browser — 22 checks: the dialog's three choices, blank-board survival through a reload, export payload, params surviving a drag and the reload after it, and a share-link recipient receiving both widgets and params. Needs no `deploy/server.js` change |
| 2026-09-11 | `index-DYsqgVGH.js` | `9627585` | Second deploy: the Commons Impact Metrics **allow list now ships with the app** (`public/cim-allow-list.json`, 1,775 categories / 78 KB), so the lookup's instant suggestions no longer depend on the `/api/proxy` relay — verified in the browser that the live page reads `cim-allow-list.json` and never calls the relay. Also ships `src/lib/cimAllowList.js` and the reworked `src/lib/paramSources.js` loader (bundled → relay → direct). `deploy/server.js` unchanged |
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

## Repository housekeeping

### Stale remote branches deleted (2026-09-11)

Four remote branches sat on GitHub long after their content had landed on `main`
(they were listed as unmerged only because the *files* arrived by another route).
Each was re-checked against `main` before deletion, and the record is kept here so
the old wording survives the branch:

| branch | tip | what it held | why it could go |
|---|---|---|---|
| `docs-tapestry-eval` | `8d93eb9` (2026-09-08) | `docs/TAPESTRY-EVALUATION.md`, 233 lines | **byte-identical** to `main`'s copy |
| `docs-research-landscape` | `7cc4637` (2026-09-08) | the same file, 233 lines | **byte-identical** to `main`'s copy |
| `docs-demo-ideas` | `8f813f3` (2026-09-08) | `docs/DEMO-IDEAS.md`, 209 lines | `main`'s copy is the expanded one (403 lines; +198/−4) — a superseded draft |
| `docs-issue-65` | `becf32f` (2026-09-10) | the `ISSUE-65` entry in `docs/ISSUES.md` | `main` carries the same entry marked **done (branch `feature-qr-widget`)** with its progress notes; the branch still said **open** |

The only text that existed solely on a branch was four draft lines in
`docs-demo-ideas`, kept here for completeness (main's Voyager catalog replaces them):

```
(prioritized plan), `MODULARITY-AND-DATAFLOW.md` (params + dataflow), and
`docs/AGENT-MEMO.md` (conventions). Each entry lists what's on the board,
- Voyager Company (Wikipedia): A Hard Day's Night · The Complete Maus · Who
  Built America? · Criterion Goes to the Movies, etc.
```

Deleted with `git push origin --delete`; nothing else was unique to them, and the
content above is the whole delta.

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
