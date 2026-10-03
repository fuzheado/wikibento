# Ask Architecture — the widget-catalog LLM advisor: live audit, context budget, and what the catalog alone buys

*Rewritten **2026-10-01** (first prepared 2026-09-09, ISSUE-44). The 2026-09-09 sections are kept as status rows
rather than history: this is a current-state doc, and its job is to say what is true today. Every number below is
dated and reproducible — the raw runs are `bench/results/2026-10-01-*.json`, the method is
`tests/probe-ask-live.mjs` (throwaway, deleted after the audit) plus the shipped
`scripts/benchmark-ask-variants.mjs`. Companion docs: `bench/README.md` (results write-up),
`docs/INTENT-BENCHMARK.md` (fixtures + coverage), `docs/ISSUES.md` → ISSUE-44 (design and abuse defence),
`docs/DATA-SOURCES.md` §23 (LiftWing).*

---

## TL;DR

- **The prompt is measured, not estimated.** Static prefix = **11,386 tokens** in suggest mode and **11,493** in
  board mode (`usage.prompt_tokens` from the API itself, 2026-10-01). The 2026-09-09 audit's "≈13.4K, at the
  12–14K design ceiling" came from a chars/3.5 heuristic; the real ratio is **4.13 chars/token**, so the fallback
  (16K) has ~4.5K tokens of slack, not ~0.5K.
- **The single-widget suite is no longer saturated.** 15 fixtures score **top1 93% · top3 93% · keys 93% ·
  subject 92%** — identical in 3/3 shipped runs and 2/2 probe runs. The 2026-09-09 record says 100%; the same
  fixture (`category-sample-photos` → `gallery` instead of `categorySize`) fails in **5/5** runs today, so this is a
  stable behaviour change, not noise.
- **Boards: 77% chain (67–83%), 100% keys/subject** in suggest mode over 5 runs — the recurring failure is
  `chain-list-display` (**5/5**: `articleList` without `listSource`, twice in the wrong order).
- **Board-assembly mode (what ships as "🧩 Whole board") is better on shape and safe on application:**
  chain 67% (4/6, identical 3/3), keys 100%, and **18/18 boards accepted by `validateAssembly` AND by the app's own
  `validateDashboard`**, plus **6/6 rendered in the built app in a real browser** with no page errors.
- **The catalog alone buys almost all of the quality.** Sending *only* the catalog (no manual, no rules, no
  few-shots) scores **top1 93%** on the single-widget suite (content-scored) and **78% chain** on the board suite —
  the same as, or better than, the shipped prompt. What the 1,410 tokens of rules/manual/few-shots actually buy is
  the **output envelope** (catalog-only replies satisfy it 0/48) and **subject formatting** (subject 69% → 92%).
- Two defects found while measuring — **both fixed 2026-10-01**, with tests, after the audit landed: `validateAssembly`
  pruned the app's own channel-qualified references (`id#channel`, ISSUE-91 — it deleted the third card of the canonical
  chain in 3/3 runs; the id is now what must resolve, and a channel must be one the producer publishes), and the ⬆ Import
  panel dropped a board's `params` block (validateDashboard now returns it, ImportPanel passes it, verified in the built
  app: default shown, switcher live, a click drives the board).

---

## How Ask works today (machinery map)

- **Catalog:** `public/manifest.json` **v3**, **36 widget types**, 55,874 chars on disk (56,207 as deployed,
  2026-10-01). Per widget: `id, name, icon, description, dataSource, category, type, timeScope, nodeKind, outputs,
  consumesSource, configFields [{key,type,label,options?,hint?,placeholder?,showIf?}], defaults`. The registry
  declares dataflow (`outputs`, `consumesSource`) and `scripts/generate-manifest.mjs` copies it, so a new emitter
  appears in the prompt automatically: **9 emitters** today (`listSource`/lines, `filterLines`/lines,
  `lineCount`/count, `echo`/value, `qrCode`/value, `map`/geojson, `iaItem`, `iaBook`, `documentReader`/value) and
  **5 `source`-field consumers** (`speaker, map, filterLines, lineCount, echo`).
- **Server:** `deploy/server.js` `/api/ask` — a narrow-function relay (server owns the prompt, model, params;
  the client sends only `{prompt, token, mode?}`). Prompt =
  `ASK_SYSTEM(manifest)` (preamble + the trimmed catalog array) + `askManual(manifest)` (dataflow, **derived from
  the manifest**, not hardcoded) + `ASK_RULES` (ids, intent matching, VALUE RULES, output schema, 3 few-shots) for
  `mode:'suggest'`, or `+ ASK_ASSEMBLY_MANUAL + ASK_RULES_BOARD +` the VALUE-RULES slice for `mode:'board'`.
  Model `llm-qwen36-27b` (32K), fallback `llm-qwen3-14b` (16K); `max_tokens 700`, `temperature 0.3`,
  `response_format json_object`, 45 s timeout; exact-match cache `sha(mode|prompt|manifest.version)`, 10-min TTL,
  200 entries; per-IP limits + session-token handshake.
- **Validation:** `validateOptions()` (suggest) drops unknown ids and unknown config keys, checks select values
  against the real options, coerces numbers/booleans, and repairs near-miss project/lang/file values;
  `validateAssembly()` (board) additionally sanitizes/dedupes ids, clamps `w`/`h`, caps params/widgets, and
  **prunes any widget whose `{{widget:id}}`, `{{param}}` or `source` reference does not resolve — cascading**.
- **Client:** `src/components/AskPanel.jsx` — two modes (🔧 Widgets / 🧩 Whole board), an "Add" per option, and
  "＋ Add N widgets" for an assembled board → `App.handleAddAssembly` (id collision remap → param merge → defaults
  underlay → layout append → **full-board `validateDashboard` gate** → apply with undo). Offline tier:
  `src/lib/askLocal.js`.
- **Tests/bench:** `tests/ask-validation.test.mjs`, `tests/assembly.test.mjs`,
  `tests/intent-benchmark.test.mjs` (offline schema constitution + local-tier floor),
  `tests/intent-fixtures.mjs` (15), `tests/board-fixtures.mjs` (6), `tests/intent-benchmark-lib.mjs`
  (`scoreOptions`, `scoreChainOptions`), `scripts/benchmark-ask.mjs`,
  `scripts/benchmark-ask-variants.mjs` (`--via toolforge`).

## Status of the 2026-09-09 findings and plan

| 2026-09-09 item | Status 2026-10-01 | Evidence |
|---|---|---|
| **F1** manifest has no dataflow vocabulary | **Done** | `outputs`/`consumesSource`/`nodeKind`/`timeScope` on 42/42; the manual is derived from them (`askManual`) |
| **F2** description truncation at apostrophes | **Done** | generator fix + constitution test; no description ends mid-word |
| **F3** single-widget output contract | **Superseded** | `mode:'board'` + `ASK_ASSEMBLY_MANUAL` + `validateAssembly` + `handleAddAssembly` shipped; suggestions still 1–3 standalone options |
| **F4** type taxonomy, no `timeScope`, `spec` DSL undocumented | **Done** | `timeScope` 42/42; `nodeKind` 42/42; `boardControls.spec` carries its own hint in the catalog |
| Plan 1 truncation fix | **Done** | as F2 |
| Plan 2 dataflow metadata → manifest v3 | **Done** | as F1 |
| Plan 3 richer config fields (labels/help) | **Done** | `label` on 41/42 types, `hint` on 19, `placeholder` on 39 |
| Plan 4 system manual | **Done** | `askManual`, manifest-derived |
| Plan 5 curated few-shots incl. chains | **Not started** | `ASK_RULES` EXAMPLES are still 3 single-widget/value examples — **no chain example** |
| Plan 6 chain-capable output contract | **Superseded** by board assembly | `ASK_RULES_BOARD` asks for `{board:{params,widgets,summary}}`, not `options[].chain` |
| Plan 7 token-budget constitution | **Not built** | no test assembles the prompt and asserts a budget; see "Prompt constitution" for the measured numbers it should assert |
| Plan 8 compound benchmark fixtures | **Partly** | 6 chain fixtures + `scoreChainOptions` exist and are schema-checked offline — but they are scored in **suggest** mode, and **assembly mode has no offline fixture/scorer at all** |
| Verify vLLM prefix caching on LiftWing | **Still unverified** | 3 timed calls on the same 11.4K prefix: 2.57 / 2.05 / 2.25 s wall incl. a ~1.3–1.7 s SSH hop; the API returns `prompt_tokens_details: null`, so there is no cache signal to read |
| Embedding retrieval (`qwen3-embedding`) | **Not started** | direction unchanged; the catalog-only result below is the strongest argument for it — and against it |

## Prompt constitution (measured 2026-10-01)

`usage.prompt_tokens` from the API, not a heuristic. Model `llm-qwen36-27b`, `max_tokens 700`.

| Prompt | Chars | **Tokens (API)** | Δ |
|---|---|---|---|
| `ASK_SYSTEM` (preamble 327 + catalog array 40,908) | 41,235 | **9,976** | — |
| + `askManual` + `ASK_RULES` (**suggest**, shipped) | 47,066 | **11,386** | +1,410 |
| + `ASK_ASSEMBLY_MANUAL` + `ASK_RULES_BOARD` + VALUE RULES (**board**, shipped) | 47,434 | **11,493** | +107 |
| `public/manifest.json` on disk | 55,874 | — | the catalog array is a 73% subset of the file |

- **Measured ratio: 4.13 chars/token** for this prompt (47,066 / 11,386). A budget test should assert tokens with
  this ratio (or ask the API), not chars/3.5 — the old heuristic overestimates by ~15%.
- **What one widget type costs:** 40,908 chars / 42 types ≈ **974 chars ≈ 236 tokens**. The design band was
  12–14K tokens for the static prefix so the 16K fallback always fits (16K − 700 output − user prompt − margin):
  at 11,493 the board prompt sits **507 tokens below the band's floor** (≈2 more widget types) and **2.5K below its
  ceiling** (≈10 more types). Item 7 (plan item 7) is not hypothetical any more.
- **What the extra 1,410 tokens buy** is measured in "What the catalog alone buys" below: the envelope, and value
  formatting — not widget discrimination.

## Measured baselines (2026-10-01)

All runs `llm-qwen36-27b`, `temperature 0.3`, `max_tokens 700`, through the Toolforge bastion
(`--via toolforge`). **171 fixture-runs, 0 upstream errors, 0 non-JSON replies, 0×429** — the pace never had to
wait. Scoring is the bench's own (`scoreOptions` / `scoreChainOptions`).

### Re-measured after the 2026-10-02 prompt edits (same fixtures, same model)

The prompt changed while making room for the CIM gate, so it was re-measured rather than assumed. The *unchanged*
number is the point: the trim bought budget without costing advice quality.

| Suite | before (2026-10-01) | after (2026-10-02) | File |
|---|---|---|---|
| single-widget, suggest | top1 93% · keys 93% · subject 92% | **top1 93%** · top3 93% · keys 93% · subject 92% | `2026-10-02-suggest-after-v2.json` |
| boards, suggest | chain 67% (83% lenient) | **chain 83%** · keys 100% · subject 100% | `2026-10-02-boards-after-v2.json` |

Three prompt defects were found and fixed while checking the budget — the first two now have guards:

- **The dataflow manual's EMITTERS list omitted every CHANNEL publisher** (`excerpt`, `gallery`, `wikiBox`,
  `translate`), because it counted only `outputs.kind` — while the sentence above the list promised "only these N
  produce output". The Translator, the middle of the chain this prompt recommends, was missing from the list of
  things that can feed it. `tests/ask-validation.test.mjs` derives the publisher set from the manifest and fails if
  the EMITTERS line omits one.
- **The catalog carried each widget's full `defaults` key list** — ~660 tokens of the budget for something the field
  list already conveys. Replaced by one VALUE RULE: an omitted field takes the registry default.
- **`primary` did not travel into the catalog**, so nothing said what a bare `source: "id"` means for a widget that
  publishes channels. The manifest already carried it; the catalog now does too.

Budgets after the three: suggest **~12,111** / board **~11,989** tokens against the 12,600 cap (measured 4.13
chars/token), i.e. ~490 tokens of headroom for the served guide's additions.

### Single-widget fixtures (15) — suggest mode

| Run | top1 | top3 | keys | subject | File |
|---|---|---|---|---|---|
| shipped script r1 | 93% | 93% | 93% | 92% | `2026-10-01-single-widget-r1.json` |
| shipped script r2 | 93% | 93% | 93% | 92% | `…-r2.json` |
| shipped script r3 | 93% | 93% | 93% | 92% | `…-r3.json` |
| probe r1 / r2 (raw replies kept) | 93% | 93% | 93% | 92% | `…-probe-r1/r2.json` |

`scripts/benchmark-ask.mjs` has **no `--via` flag** (it always calls from the local IP), so the repeats above used
`benchmark-ask-variants.mjs --variants baseline --via toolforge` — same prompt (`ASK_SYSTEM + askManual +
ASK_RULES`), same `validateOptions`, same scoring library.

**The one failure, stable 5/5:** `category-sample-photos` ("Show me a random sampling of images from the category
Featured pictures on Wikimedia Commons") returns **`gallery`** with `from: 'category'`, not `categorySize` — even
though this exact prompt shape is the prompt's own canonical few-shot for `categorySize`. It also carries a
hallucinated field name (`wiki`, where `gallery` declares `project`), which `normalizeConfig` silently drops. The
2026-09-09 record has this fixture at top1 ✓, so either the gallery merge (the three gallery widgets became one with
a `category` source) made `gallery` the better answer, or the example needs sharpening — **a fixture-ground-truth
decision, not one this audit should make silently**.

### Board fixtures (6) — suggest mode (options, chain as in-order subsequence)

| Run | chain | keys | subject | File |
|---|---|---|---|---|
| shipped r1 | 83% | 100% | 100% | `2026-10-01-boards-suggest-r1.json` |
| shipped r2 | 67% | 100% | 100% | `…-r2.json` |
| shipped r3 | 83% | 100% | 100% | `…-r3.json` |
| probe r1 | 83% | 100% | 100% | `…-suggest-probe-r1.json` |
| probe r2 | 67% | 100% | 100% | `…-suggest-probe-r2.json` |

**chain ≈ 77% (67–83%) over 5 runs.** The recurring miss is `chain-list-display` **5/5** — the model answers
`articleList` alone (defensible: `articleList` takes a pasted list directly), or returns
`articleList, listSource` (right widgets, wrong dataflow order). `board-switcher-institutions` also misses **2/5**
(`glamorgan + categorySize` instead of `boardControls + cimStats`) — a defensible alternative reading of "switch
between two institutions and see their Commons stats". The 2026-09-09 "boards are saturated at 100%" conclusion
does not reproduce.

### Board fixtures (6) — assembly mode (`mode:'board'`, what the UI's 🧩 toggle sends)

| Run | chain | keys | subject | assembly accepted | app accepted (`validateDashboard`) |
|---|---|---|---|---|---|
| r1 / r2 / r3 (identical) | 67% | 100% | 100% | **18/18** | **18/18** |

- **`validateAssembly` accepted every board, 18/18**, with 3 warnings total — see below.
- **`validateDashboard` accepted every board, 18/18, with 0 warnings and 0 errors** when the fragment is applied
  the way `App.handleAddAssembly` applies it (defaults underlay, layout built from `w`/`h`, params merged).
- **`chain-list-display` passes 3/3 here** — being allowed to invent instance ids gives the model the ordering it
  cannot express in suggest mode.
- The 4/6 chain misses are:
  1. `chain-summary-translate-speak` **3/3** — the model *did* emit `excerpt → translate → speaker`, but wired the
     speaker as `source: "french-translation#speech"` — **the app's own channel-qualified id form** (ISSUE-91) —
     and `validateAssembly` only accepts bare widget ids, so it **deleted the third card**
     (`widget "speak-french" dropped — a reference it consumes is not on the board`). This is a server-side bug, not
     a model failure, and it is the cheapest fix in this document.
  2. `board-switcher-institutions` **3/3** — `gallery`/`cimRanking`/`cimTrend` where the fixture expects
     `cimStats`; the board is coherent, parameterised (`{{institution}}`) and renders.

### Does it render? (built app, real browser, 2026-10-01)

`tests/probe-ask-render.mjs` — the built `dist/` loaded in Chromium, each accepted board pasted through the app's
own ⬆ Import panel (the `scripts/pick-mode-e2e.mjs` pattern), then loaded a second way through the app's `#/d/`
share hash:

| Board | cards | Import panel | `#/d/` hash |
|---|---|---|---|
| chain-translate-article | 2/2 | renders, wired | renders, wired |
| chain-speak-article | 2/2 | renders, wired | renders, wired |
| chain-filter-count | 3/3 | renders, wired (holder → filter → count all resolved) | same |
| chain-list-display | 2/2 | renders, wired (`{{widget:}}` → 4 articles) | same |
| chain-summary-translate-speak | 2/2 | renders, wired (3rd card was pruned server-side) | same |
| board-switcher-institutions | 4/4 | renders, **3 cards stuck "Waiting for a reference"** | renders, **`{{institution}}` resolves**; 2 CIM cards report "No precomputed (CIM) data yet" |

**6/6 boards render with no page errors and no error frames; 5/6 are fully wired through the Import path.** The
boards are 496–1,277 chars of JSON and compress to **394–696-char** share links (`#/z/`) — comfortably inside the
1,500-char QR ceiling (`QR_MAX_CHARS`, `src/components/SharePanel.jsx`), so an Ask-built board is shareable by QR.
Two findings, both recorded rather than fixed:

- **The ⬆ Import panel drops the `params` block** (`src/components/ImportPanel.jsx` hands the parent
  `{widgets, layout}` only). The `?config=` and `#/d/` loaders both apply `params` (App boot), so a pasted board
  with `{{param}}` references renders every driven card as "Waiting for a reference". The Ask path itself is fine —
  `handleAddAssembly` merges params properly — so this is an **import-path bug**, and it is also why the audit had
  to load the params board twice.
- **The CIM cards are wired but have no data**: the model put `cimRanking`/`cimTrend` on a category that is not on
  the Commons Impact Metrics allow-list. The card says so honestly. Nothing in the catalog tells the advisor that
  the CIM family only serves allow-listed categories.

## Failure taxonomy (2026-10-01, 171 fixture-runs)

Classes are decided from the **raw** reply (before validation can hide the defect), by
`tests/probe-ask-live.mjs`. Production paths only (60 fixture-runs: 30 suggest/intent, 12 suggest/board,
18 board/board); the catalog-only variant is scored separately below.

| # | Class | Where | Count | Real example |
|---|---|---|---|---|
| 1 | **wrong widget** (expected id absent from the reply) | suggest/intent, suggest/board, board/board | 2/30 · 2/12 · 6/18 | `category-sample-photos` → `gallery`; `board-switcher` → `glamorgan, categorySize` |
| 2 | **chain order** (all expected ids present, wrong order) | suggest/board | 1/12 | `[articleList, listSource]` for `listSource → articleList` |
| 3 | **reference the server rejects** (`id#channel`) | board/board | 3/18 | `speaker.source = "french-translation#speech"` → card pruned |
| 4 | **field that does not exist** | suggest/intent | 3/30 | `gallery.wiki = "commons.wikimedia"` (the field is `project`); `glamorgan.wiki` |
| 5 | **value the field will not accept** | suggest/intent | 1/30 | `linkcount.namespace = ""` → dropped |
| 6 | **wiring reference with no instance id** | suggest/board | 6/12 | `speaker.source = "excerpt"` — a *type*, not a board id (the contract forbids inventing ids, so the user must wire by hand) |
| 7 | **no wiring emitted where the chain implies it** | suggest/board | 4/12 | `listSource → filterLines → lineCount` returned with three standalone configs |
| 8 | **subject field omitted** | — | **0** | SUBJECT COMPLETENESS + the wayback few-shot hold on all 15 |
| 9 | **hallucinated widget id** | — | **0** | the "exact ids" rule + `validateOptions` drop: zero unknown types in 171 runs |
| 10 | **non-JSON reply** | — | **0** | `response_format: json_object` |
| 11 | **upstream error (429/503/timeout)** | — | **0** | all 171 calls via the bastion, no backoff needed |
| — | *not a failure but worth counting* | suggest/intent | 6/30 | `value-repaired-by-normalizer`: `lang: "de.wikipedia"` → `de`, `filename: "Earth from space.jpg"` → `File:…` |
| — | *catalog-only variant* | catalog/* | **48/48** | `output-schema-miss` — every reply was a coherent `{widgets:[…]}` that is not the contract's `{options:[…]}` |

Interpretation: the **safety bar is the strongest part of the prompt** (no invented ids, no non-JSON, no upstream
failures, no omitted subjects); the **soft spot is chain *expression*, not chain *knowledge*** — classes 1, 2, 6 and
7 are all the same underlying thing: the model knows the chain and cannot say it in the suggest schema. Give it a
schema that can (board mode), and 4 of the 6 board fixtures pass today — 5 of 6 once class 3 is fixed.

## What the catalog alone buys (the ablation that matters)

Prompt variant: **`ASK_SYSTEM` only** — the catalog array and the role sentence; **no `askManual`, no RULES, no
VALUE RULES, no few-shots, no output schema** (41,235 chars / 9,976 tokens — 1,410 tokens less than shipped).

| Suite | Scored as the bench scores it | Content-scored (envelope repaired) | Runs |
|---|---|---|---|
| board fixtures | **0%** chain (0 options — schema miss 6/6 every run) | **78%** chain (83 / 67 / 83), keys 100%, subject 100% | `2026-10-01-catalog-only-boards-r1..r3.json` |
| single-widget fixtures | **0%** top1 (schema miss 15/15) | **93%** top1, 93% keys, **69% subject** | `2026-10-01-catalog-only-widgets-r1/r2.json` |

**Read the two columns together.** As shipped, the variant scores 0 — the finding is that *the output contract is
the part of the prompt that cannot be inferred from the catalog*. Scored on content, the catalog alone matches the
shipped prompt's widget choice exactly on single-widget intents (93% vs 93%) and on board chains (78% vs 77%), and
the replies even volunteer the app's own wiring vocabulary (`{{widget:excerpt}}`, `source: "translate#speech"`,
`{{institution}}` params).

**Delta, stated honestly:**

- **Widget choice and chain shape: ~0.** The 1,410 tokens of manual + rules + few-shots buy no measurable accuracy
  on either suite. This repeats the 2026-09-09 variant result (three variants scored identically) from the other
  direction — removing the engineering changes nothing either.
- **Output envelope: everything.** 48/48 catalog-only replies violate the contract (they emit `{widgets:[{id:…}]}`
  or a bare `{widgetId, config}`); 0/48 shipped-prompt replies do.
- **Value formatting: ~23 points of "subject"** (69% → 92%). Two of the three recurring faults (`File:` prefix,
  `de.wikipedia` → `de`) are repaired by the server's `normalizeConfig` anyway, so the *user-visible* delta is
  smaller than the raw gap — the remaining real one is `wiki` vs `project` (taxonomy class 4) and the
  date-mode/"latest" choice.
- **Caveat, and it is a real one:** the "content-scored" column is a repair the bench does not ship — it hands the
  model credit for an envelope no client could parse. It is the right measure for "what does the catalog teach",
  not for "would this work today". 6 board fixtures is also a wide confidence interval: one fixture is 17%.

**Consequence for design.** If Ask is ever handed to an external/bigger LLM, the catalog is a portable artifact and
the *contract* is what must be specified precisely and validated strictly — which is what `validateOptions` /
`validateAssembly` already do. Conversely, the 1,410 tokens that carry no accuracy are the first place to cut if
the 16K fallback ever binds (but keep the VALUE RULES: they carry the formatting that the normalizer cannot fix).

## Coverage: what the current numbers actually describe

- **15 of 36 widget types have single-widget ground truth** (`node scripts/interview-fixtures.mjs --list`), one
  English, single-subject, single-sentence prompt each; 13 of 15 have `requireSubject`. They cover the article /
  file / category / GLAM / ranking core: `pageviews, linkcount, categorySize, wikistats, fileUsage, glamorgan,
  topWikipedias, topPages, excerpt, edithistory, quality, gallery, sparql, panorama360, waybackGallery`.
- **The 6 board fixtures name 9 types** — `excerpt, translate, speaker, listSource, filterLines, lineCount,
  articleList, boardControls, cimStats` — but only inside chains, with 2 of 6 `requireSubject`. **Union: 23/36.**
- **13 types appear nowhere in ground truth:** `markdown, qrCode, assessments, cimTrend, cimRanking, wikiBox,
  wikiPage, map, mediaPlayer, iaItem, iaBook, documentReader, echo`. That is the rest of the **CIM family
  (`cimTrend`, `cimRanking` — `cimStats` appears in a board fixture)**, the map and its
  geometry fields, the whole media/IA family, and the embeds.
- So "top1 93%" means: *the model picks the right widget for a single-subject English request in the core
  data family*. It says nothing about the 13 types above, about multi-subject requests, about non-English prompts
  (the 2026-09-09 es/fr/de/it/pt probe, `tests/fixture-multilingual.mjs`, is the only evidence there), or about
  refusal behaviour.

Fixtures that would close the most (each is one interview session with `scripts/interview-fixtures.mjs --add`):

1. **CIM family, one per arm** (snapshot: category + file; views-over-time: category + file; top-N: five facets) —
   plus the distinguishing phrasing vs `glamorgan` / `fileUsage`.
2. **The map** (3): places list → auto-fit; "draw this GeoJSON"; "map whatever the SPARQL card returned" (a
   geometry-kind wiring case, new in ISSUE-132).
3. **Media & IA** (5): `mediaPlayer`, `iaItem`, `iaBook`, `documentReader`, `qrCode` (an emitter, and the only
   widget whose config is a *reference*).
4. **Embeds & text** (4): `markdown`, `wikiBox`, `wikiPage`, `assessments`.
5. **Dataflow as single-widget intents** (7): `listSource`, `filterLines`, `lineCount`, `articleList`, `translate`,
   `speaker`, `boardControls` — today they are only ever seen inside a chain, so nothing measures whether the model
   picks them for their own sake.
6. **Board fixtures that exercise the schema, not just the chain** (3): a params board with two params; a 4-widget
   pipeline with a branch; and one unbuildable request, to test that it declines instead of inventing.

## Ranked cheap fixes

Ordered by (evidence × cheapness). The 2026-09-09 finding stands: **rules set intent, few-shots change behaviour** —
the wayback case went 1/5 → 5/5 only by adding a targeted example.

1. ✅ **DONE 2026-10-01** — **Accept `id#channel` references in `validateAssembly`** (S, ~5 lines + one test). The app's source picker offers
   channel-qualified ids (ISSUE-91), the model emits them, and the validator deletes the card — 3/3 runs of the
   canonical `excerpt → translate → speaker` chain lost its third widget. Split on `#` before the `liveIds` check
   (widget refs, bare `source` refs) and add the case to `tests/assembly.test.mjs`.
2. ✅ **DONE 2026-10-01** — **One chain few-shot in `ASK_RULES` EXAMPLES** (S). `chain-list-display` fails 5/5 in suggest mode (wrong order /
   missing producer); board mode's id licence fixes it, and the cheapest way to move suggest mode is one example
   showing producer-before-consumer. Ground it in the shipped `public/translate-demo.json` chain.
3. ✅ **DONE 2026-10-01** — **Teach `project` vs `wiki`** (S). 3/30 single-widget rows wrote `wiki: "commons.wikimedia"` on `gallery` /
   `glamorgan`, where the field is `project` — `normalizeConfig` silently drops it and the card falls back to its
   own default project (a silent wrong-wiki). Either add the field name to VALUE RULES or alias `wiki` → `project`
   in `normalizeConfig` when the widget has no `wiki` field.
4. ✅ **DONE 2026-10-01** — **A token constitution with the measured ratio** (S). `tests/*` does not assemble the prompt today. Assert
   `ASK_SYSTEM + askManual + <rules> + 700 output ≤ 14,000` using **4.13 chars/token** (or the API count), and fail
   with the block that grew.
5. ⏸ **Reviewed by the owner 2026-10-02 — left as it is for now.** It fails 5/5 against a prompt whose own few-shot
   teaches `categorySize`, and since the gallery merge the model answers `gallery` with `from: category` — a picture
   grid rather than a count with a few thumbnails. The owner looked at both and kept the current behaviour, so the
   fixture is **deliberately** not reconciled: the 1/15 is an accepted, known difference, not a regression. Revisit
   only if the fixture is recalibrated as a whole (the trigger in `docs/INTENT-BENCHMARK.md`).
6. ✅ **DONE 2026-10-02** — **Warn the advisor off CIM for non-allow-listed categories** (S). Done in the three places
   a reader can meet the gate: `askManual()` gains a **CIM GATE** line (both modes — board mode includes the manual,
   so one line covers both) that names the gated types as a list **derived from the manifest's `dataSource`**, the
   suggest-mode intent rule says `cim*` is gated, and `CIM_CATEGORY_FIELD` carries a `hint` so a human in the ⚙ panel
   gets the same sentence and the names of the live alternatives (`glamorgan`, `categorySize`). The hint's journey is
   asserted by `tests/ask-validation.test.mjs`, which also catches the trap it hit: `scripts/generate-manifest.mjs`
   kept only `{key, type}` from a shared config-field constant, so a hint written there could never reach the
   manifest — the reader that must state the gate. The card was already honest (an unlisted category throws
   `CimUnregisteredError` naming the request process); the *advice* was the part that proposed a dead card.
7. ✅ **DONE 2026-10-02** — **Cover assembly mode offline, and render what comes out of it.** Two halves, because
   "validates" and "renders" are different claims. `tests/assembly-fixtures.mjs` freezes **18 real replies** (three runs
   of the assembly suite, `bench/results/2026-10-01-boards-assembly-r{1,2,3}.json`, including the three that were not
   usable JSON), and `tests/assembly-contract.test.mjs` asserts on them: nothing throws, a non-JSON reply degrades to no
   board, every accepted board holds together (unique ids, registered types, every reference resolvable *inside the
   surviving board*), and the app can load each one through the `handleAddAssembly` path. `scripts/board-render-e2e.mjs`
   (`npm run smoke:boards`, in `npm test`) is the browser half: our own boards loaded from `?config=`, the same boards
   pasted through the ⬆ Import panel, and the frozen model boards pasted the same way — one card per widget, nothing
   left at "Waiting for a reference", no page or console errors. Both were verified by restoring the defects they exist
   for: the channel fix (the canonical chain test fails by name: *"the canonical chain lost a card (r1): got 2 —
   `speak-french` dropped"*) and the Import-`params` fix (*two pasted boards stuck at "Waiting for a reference"*). The
   first version of the render check could not see the second defect at all — every pasted board had `params: {}` — which
   is why the hosted boards are pasted too.
8. **Prefix caching** (S, but needs an ops answer). Unverifiable from the API (`prompt_tokens_details: null`); ask
   the LiftWing maintainers, or measure p95 latency on a stable prefix at real volume. Until then, do not assume the
   long prompt is free.

### Defects found while measuring (reported, not fixed here)

- **`validateAssembly` vs `id#channel`** — item 1 above; it is a correctness bug in the shipped board path.
- **The ⬆ Import panel drops `params`** (`ImportPanel.jsx` → `{widgets, layout}`). `?config=` and `#/d/` apply the
  params block; a pasted board does not, so every `{{param}}`-driven card shows "Waiting for a reference". Ask's own
  board path is unaffected (`handleAddAssembly` merges params) but the import path is not.
- Also verified 2026-10-01 and out of scope: an unknown path answers **500** and leaks the server's absolute path
  (`/data/project/wikibento/www/js/dist/…`); it should be 404. `/manifest.json` is public (200,
  `application/json`, 56,207 bytes) with **no CORS header**, so another origin cannot read it from a browser.

## Beyond one-shot: RAG optimisations (direction unchanged, evidence updated)

1. **True RAG over the catalog** — embed the intent with LiftWing `qwen3-embedding` and send the top-K widget
   blocks plus the manual. The catalog-only result says the *selection* knowledge is already in the catalog and the
   model finds it at 9,976 tokens, so retrieval's win is budget and focus, not accuracy — worth doing only when the
   budget binds (≈10 more widget types), not before.
2. **Recipe library** — human-authored chains (translate chain, GLAM overview, article vitals) that the model fills
   in. This attacks the actual soft spot (chain *expression*, classes 2/6/7) in a way more prose cannot.
3. **Two-stage local-first** — `askLocal` for simple intents, LLM for compound. Unchanged; the offline tier is the
   graceful degradation and costs nothing.
4. **Prompt as a build artifact** — assemble catalog + manual + rules into one versioned file with a content hash.
   Now also the precondition for item 4 in the fixes list (a real budget test) and for any caching claim.
5. **Prompt-injection and abuse posture** — unchanged and still sound: narrow function, server-owned prompt, caps,
   session token, origin allowlist, per-IP limits.

## How to re-measure

```bash
# single-widget + board fixtures, suggest mode (shipped scripts, high tier via the bastion)
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --variants baseline --via toolforge --out X.json
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --boards --variants baseline --via toolforge --out X.json
```

The rest of this audit used **three throwaway probes** (the `tests/probe-*.mjs` pattern — deleted when the audit
finished, so they are described rather than pointed at). Each is a few dozen lines on top of the shipped pieces and
is worth re-creating rather than trusting the numbers:

- **`probe-ask-live.mjs`** — sends the exact suggest / board / catalog-only system prompt through the Toolforge
  helper, runs the reply through `validateOptions` *and* `validateAssembly`, scores it with the bench's own
  `scoreOptions` / `scoreChainOptions`, and records the raw reply, the API's `usage.prompt_tokens`, and a
  per-fixture diagnosis (hallucinated id, unknown field, dropped value, omitted subject, dangling ref, chain
  order, schema miss). A `--analyze` mode aggregates those classes across result files.
- **`probe-dashboard-check.mjs`** (esbuild-bundled, because the registry imports JSX) — mirrors
  `App.handleAddAssembly` steps 1–5 for an empty starting board and runs the app's real `validateDashboard`, so the
  same fragment can be checked under node *and* pasted into the app.
- **`probe-ask-render.mjs`** — starts `vite preview`, pastes each accepted board through the app's own ⬆ Import
  panel and then loads it again through `#/d/`, asserting one card per widget, no page errors, and no
  "Waiting for a reference" state.

```bash
# rendering (built app, real browser) — needs the probe above
npx vite build
```

Rate limits: the public endpoint is ≈90 req/h per IP, so every repeat above went through the Toolforge bastion
(`--via toolforge`, `ssh $USER@dev.toolforge.org`; ~1.3–1.7 s of that is the SSH hop). 171 calls, zero 429s.
Noise: single-shot runs wobble ±1 fixture — repeat before claiming a regression, and remember that 1 fixture is 17%
of the board suite and 7% of the single-widget suite.

*Sources: `bench/results/2026-10-01-*.json` (this audit); `deploy/server.js`, `src/components/AskPanel.jsx`,
`src/components/ImportPanel.jsx`, `src/App.jsx`, `src/lib/dashboardConfig.js`, `public/manifest.json`
(2026-10-01); wikitech `Machine_Learning/LiftWing/Large_Language_Models`; ISSUE-44, ISSUE-91, ISSUE-132.*
