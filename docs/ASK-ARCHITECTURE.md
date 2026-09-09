# Ask Architecture — widget-catalog LLM advisor: audit, context budget & manifest v3 plan

*Prepared 2026-09-09. Audit of the Ask subsystem (ISSUE-44) after the dataflow
era (ISSUE-50 params, ISSUE-52/53 widget-to-widget emit/consume, ISSUE-58
excerpt emitter, MinT translator): does the manifest we feed the LiftWing
Qwen LLM carry enough metadata to answer **compound** queries ("get the
article text, filter it, translate it to French"), not just simple ones
("images from a category")? Includes a measured context-budget analysis and a
manifest v3 / prompt-engineering plan.*

*Companion to `docs/DATA-SOURCES.md` §23 (Ask facility record), `ISSUES.md`
(ISSUE-44), and `MODULARITY-AND-DATAFLOW.md` (params/dataflow).*

---

## TL;DR

- **Simple queries: well set up.** 37-widget `manifest.json` v2, value rules,
  few-shots, server-side id validation, intent benchmark + fixtures.
- **Compound dataflow queries: NOT yet.** Three blockers, none architectural:
  1. the manifest carries **no dataflow vocabulary** (no emitters, output
     shapes, consume semantics, `{{widget:id}}`);
  2. a **generator bug truncates descriptions at apostrophes** — including
     exactly the two core transformer widgets (`filterLines`, `lineCount` →
     "Consume another widget");
  3. the **output contract is single-widget** (1–3 independent options, no
     chain/wiring) and AskPanel adds each option standalone (ISSUE-44 phases
     2–3, multi-widget assembly, still open).
- **Context budget is comfortable but bounded:** primary `qwen36-27b` has a
  32K window; the **fallback `qwen3-14b` has 16K** — treat ~12–14K tokens as
  the design ceiling for the static prompt so the fallback always fits.
  Current payload ≈ 6K tokens → ~6–8K of headroom for a targeted manual +
  few-shots before hitting the ceiling.
- The Ask loop is a degenerate one-shot RAG; the biggest architectural win is
  a retrieval stage using **LiftWing's own `qwen3-embedding` model** (0.6B,
  in-infra), plus a human-authored **recipe library**.

---

## How Ask works today (machinery map)

- **Manifest:** `scripts/generate-manifest.mjs` parses `src/widgets/index.js`
  (regex-based, no import — the registry pulls in JSX) → `public/manifest.json`
  **v2**, 37 widgets, run before vite build. Per-widget fields: `id, name,
  icon, description, dataSource, category, type (stat/trend/table/media/
  query/embed), intensity, experimental, configFields [{key,type,options?}],
  defaults [keys]`.
- **Server:** `deploy/server.js` `/api/ask` narrow-function relay. System
  prompt = `ASK_SYSTEM(manifest)` (catalog subset: id/name/description/
  dataSource/category/type/configFields/defaults) + `ASK_RULES` (~2.8K chars:
  exact ids, value rules, output schema, 2 few-shots). Model
  `llm-qwen36-27b`, fallback `llm-qwen3-14b`; `max_tokens` 700; exact-match
  cache `sha(prompt + manifest.version)`; output ids validated against the
  manifest (`validateOptions`), non-JSON → empty options. Rate-limited
  (~10/min/IP) + per-IP daily cap + session token handshake.
- **Client:** `AskPanel.jsx` renders options and adds each via
  `onAdd({id, widgetType, config})` — **always a standalone widget**;
  `src/lib/askLocal.js` = offline keyword fallback scoring the same manifest.
- **Tests/benchmarks:** `ask-validation.test.mjs`, `intent-fixtures.mjs` +
  `intent-benchmark.test.mjs`, `scripts/benchmark-ask.mjs`.

## Audit findings (2026-09-09)

### F1 — Manifest has no dataflow vocabulary

The generator extracts UI/config metadata only. It does **not** extract:

- **Emitters** — five widgets emit runtime outputs, none declared in the
  manifest: `excerpt` (article extract text, ISSUE-58), `listSource` (lines),
  `filterLines` (lines), `lineCount` (count), `echo` (value passthrough).
- **Output shapes** (scalar / lines / count / extract) — invisible.
- **Consumer semantics** — `filterLines`/`lineCount`/`echo` DO surface a
  `source` config field of `type: 'source'`, but the string is opaque; nothing
  says "pick an emitting widget on the board," and the second consume path —
  `{{widget:id}}` interpolation in any string field — appears nowhere.
- **Node kinds** (source / controller / transformer / reducer / effector /
  AI-native per the Node Algebra taxonomy) — the UI "Dataflow" category is a
  hint, not a role.
- Config-field **labels/help text** (what does `pattern`/`match`/`spec` mean?)
  and `timeScope` are also dropped.

### F2 — Description-truncation bug (generator)

`q('description')` regex (`description:\s*'([^']*)'`) stops at the **first
apostrophe**, so any description containing an escaped `\'` is truncated.
**Affected ids:** `cimTrend`, `cimTopWikis`, `cimTopPages`, `filterLines`,
`lineCount` — the two core transformers read literally *"Consume another
widget"* in the manifest. Root cause is in `generate-manifest.mjs`; the
registry source is correct.

### F3 — Single-widget output contract

`ASK_RULES` output schema = `options: [{widgetType, config, mode, reason}]`,
1–3 **independent** options. No way to express "then filter, then translate";
no `source`/wiring reference among options; AskPanel adds each option
standalone. Multi-widget board assembly = ISSUE-44 phases 2–3 (open). Even a
perfect manifest cannot produce a wired chain through the current contract.

### F4 (minor)

- Type taxonomy (stat/trend/table/media/query/embed) reflects *renderer*
  family, not node kind.
- No `timeScope` — trend/range widgets can't be advised with correct temporal
  config.
- `boardControls` `spec` (textarea DSL) is documented nowhere the LLM sees.

**What works well:** exact-id + value rules prevent most invalid configs;
`validateOptions` + re-prompt repair handles hallucinated ids; local fallback
+ benchmark keep the simple path healthy.

## Context budget (measured 2026-09-09)

- **Models** (wikitech Machine_Learning/LiftWing/Large_Language_Models):
  `qwen36-27b` = Qwen3.6-27B, FP8, vLLM on AMD MI300X (2-way tensor
  parallel), 32K ctx (verified in ISSUE-44); `qwen3-14b` fallback = 16K ctx.
  Also available on the same platform: **`qwen3-embedding` (0.6B)**.
- **Current payload:** mapped catalog ≈ 19.8K chars + ASK_RULES ≈ 2.8K +
  boiler ≈ **23.0K chars ≈ ~6K tokens** (~5.1–7.2K). Output cap 700 tokens.
- **Headroom:** 32K window → ~25K tokens free on the primary. **BUT the
  fallback binds:** a prompt that exceeds 16K turns a primary-model outage
  into a 502 on the fallback. **Design ceiling for the static prefix:
  ~12–14K tokens** (16K − 700 output − user prompt − margin).
- **Latency/etiquette:** prefill scales with prompt length on shared on-prem
  GPUs; every uncached ask pays full prefill. vLLM supports automatic prefix
  caching — **verify it is enabled on the LiftWing deployment**; if yes, a
  stable long prefix is nearly free after the first call per version.

## Manifest v3 / prompt plan (ranked)

1. **Fix the truncation bug** (S) — apostrophe-safe extraction; add a
   constitution-style test: no manifest description ends in `\` or contains
   `\'` artifacts; assert ≥ 35 widgets extracted.
2. **Registry-declared dataflow metadata** (S–M) — next to each `emit:`, add
   declarative `outputs: {kind: 'extract'|'lines'|'count'|'value'}`, plus
   `consumes: ['source'|'{{widget:id}}']` and a Node-Algebra `nodeKind`;
   generator copies them into **manifest v3**. (No regex-inference from
   runtime code.)
3. **Richer config fields** (M) — include per-field `label`/`help` in the
   manifest (semantics of `pattern`/`match`/`caseSensitive`/`spec`, and a
   note on `type: 'source'`: "id of a widget on the board that emits").
   Include `timeScope`.
4. **System manual section** (~1.5–2.5K tokens, machine-generated or static
   in server.js) — dataflow model: who emits what; `source` field vs
   `{{widget:id}}` vs `{{param}}`; chain semantics; value rules; repair rule
   (drop/refuse unknown ids). Placed after the catalog.
5. **Curated few-shots incl. chains** (S) — add 2–3 chain examples; ground
   truth = the shipped `public/translate-demo.json` 4-widget chain and the
   "article text → filter → translate → display" query.
6. **Chain-capable output contract** (M — ISSUE-44 phase 2/3 slice) —
   options may carry `chain: [{widgetType, config, wiring: {source | set of
   {{widget:id}} refs}}]`; server validates ids AND refs resolve; AskPanel
   applies in order and sets `source` fields. Single-widget stays the default.
7. **Token-budget constitution** (S) — build-time test: assembled static
   prefix (manifest + manual + rules + few-shots) must be ≤ ~14K tokens
   (chars/3.5 heuristic); fail the build otherwise. Keeps the fallback safe
   and the prefix stable (cache-friendly).
8. **Extend the intent benchmark** (S) — compound fixtures in
   `intent-fixtures.mjs` ("translate this article's first paragraph to
   French") scored by `benchmark-ask.mjs`; requires (6) to assert chain
   shape.

## Beyond one-shot: RAG optimizations

The Ask loop is a degenerate RAG (whole static corpus in the prompt, one
shot, one answer). Mature fixes, in order of leverage:

- **True RAG in Wikimedia infra** — embed the intent with LiftWing
  `qwen3-embedding`, retrieve top-K widgets (+ recipes) by cosine similarity,
  send candidates + manual only. Order-of-magnitude prompt shrink, better
  focus; no new infra.
- **Recipe/template library** — retrieve over human-authored "recipes"
  (translate chain, GLAM overview, article-vitals pack — the starter-packs
  idea as few-shot skeletons). Recipe carries the wiring; the LLM fills
  subjects. Highest reliability-per-token.
- **Two-stage local-first** — `askLocal` answers simple intents at zero LLM
  cost (instant, offline); only ambiguous/compound escalate. Most traffic is
  simple.
- **Prompt as a build artifact** — assemble manifest + manual + few-shots at
  build time into one versioned file (content-hash version); stable prefix →
  prefix caching, reviewable diffs, token-budget test applies to a real
  artifact.
- **Semantic cache** — beyond exact `sha(prompt+version)`: near-duplicate
  intents (embedding cosine) hit cache; matters at ~10 req/min/IP.
- **Chunkable manifest** — per-widget blocks + per-field docs, so a future
  marketplace or per-widget doc growth can be served by retrieval instead of
  a fatter prompt.

## Follow-ups (work items)

**Status 2026-09-09:** plan items 1–4 implemented in `ask-manifest-v3` (PR #36)
— truncation fix + test, dataflow metadata → manifest v3, richer config
fields, `ASK_MANUAL` system manual. Verified: 169/169 tests; live
`llm-qwen36-27b` functional test — the compound "article text → filter →
translate" query now recommends the `excerpt → filterLines → translate` chain
with wiring explained, no invented board ids. Static prefix grew ≈6K → ≈8.5K
tokens, still under the 12–14K ceiling. Also: `npm test` now regenerates the
manifest before running (stale-manifest false passes eliminated).

| Item | Effort | Status |
|---|---|---|
| Fix F2 truncation + test | S | done (PR #36) |
| F1 dataflow metadata → manifest v3 (plan items 2–3) | S–M | done (PR #36) |
| Item 4 system manual | S | done (PR #36, `ASK_MANUAL`) |
| Item 5 curated few-shots incl. chains | S | not started |
| Item 6 chain contract (client+server) | M | ISSUE-44 phase 2/3 |
| Item 7 token constitution | S | not started (test wiring landed; budget test still open) |
| Item 8 compound benchmark fixtures | S | not started |
| Verify vLLM prefix caching on LiftWing | S | open question |
| Embedding retrieval prototype (qwen3-embedding) | M–L | research |

*Sources: code paths above (HEAD 3404cf8, 2026-09-09); wikitech
Machine_Learning/LiftWing/Large_Language_Models; ISSUE-44 verification notes
(32K/16K contexts).*
