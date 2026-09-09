# Ask Advisor Benchmark Results

Question the benchmark answers: **is the information we send to the Ask
interface (manifest + ASK_MANUAL + ASK_RULES) enough to produce useful widget
recommendations and board construction?**

## Baseline — single-widget intents (2026-09-09)

**Model:** llm-qwen36-27b (LiftWing) · **Fixtures:** 15 ground-truth intents ·
**System prompt:** ~9,210 tokens (manifest v3 + ASK_MANUAL + ASK_RULES)

| Metric | Score |
|---|---|
| top1 | 100% (15/15) |
| top3 | 100% (15/15) |
| keys | 93% (14/15) |
| subject | 85% (11/13) |
| errors | 1 (transient 503) |

(An earlier partial run same day scored top1 93%; the full clean run is 100%.
The "subject ✗" console rows for `top-wikipedias` / `sparql-count` in
`bench-baseline-2026-09-09.json` are a display artifact — those fixtures are
`requireSubject: false` and are excluded from the subject denominator.)

### Residual failures (diagnosed 2026-09-09)

| Fixture | Issue | Diagnosis | Fix |
|---|---|---|---|
| `glam-category-impact` | subject ✗ | Model truncated the category to "Wiki Loves Monuments 2024" (dropped "in the United States") — VALUE RULES never said to preserve the full span | ✅ **FIXED + verified stable**: category VALUE RULE now says "copied VERBATIM … keep the FULL span including qualifiers" — 3/3 re-runs carry the full span |
| `wayback-snapshots` | keys ✗ | Model filled `dates` but omitted `url` entirely — nothing forced subject fields to be filled | ✅ **FIXED + verified**: SUBJECT COMPLETENESS rule alone was unreliable (**1/5**); adding a wayback few-shot to EXAMPLES (different site/dates than the fixture) → **5/5** fill `url` |
| `top-wikipedias`, `sparql-count` | (none) | scorer display artifact | n/a |

## Prompt-variant comparison (2026-09-09)

`scripts/benchmark-ask-variants.mjs` — does ADDING wiring/board knowledge to
the system prompt improve recommendations?

| Variant | System chars | top1 | top3 | keys | subject |
|---|---|---|---|---|---|
| baseline | 32,450 | 100% | 100% | 93% | 85% |
| compact (+500-token wiring ref from BOARD-COMPOSITION.md) | 33,660 | 100% | 100% | 93% | 85% |
| expanded (+full dataflow manual) | 33,453 | 100% | 100% | 93% | 85% |

**Result: a clean null — all three variants identical, all residual failures
unchanged.** Interpretation: the single-widget suite is *saturated* — the model
already extracts intent, widget choice and subjects from the catalog alone.
Wiring knowledge cannot move these numbers, and the two residual failures were
prompt-rule gaps (now fixed in VALUE RULES), not missing wiring context. Token
cost of the extra wiring text buys nothing on single-widget intents.

## Board-construction fixtures (2026-09-09, NEW)

`tests/board-fixtures.mjs` — 6 multi-widget chain prompts scored with
`scoreChainOptions` (chain = expected widgets appear in order as a subsequence;
keys/subject per chain entry). This is the suite that actually measures board
building — the single-widget suite was saturated and could not.

| Variant | System chars | chain | keys | subject |
|---|---|---|---|---|
| baseline | 32,883 | 83%* | 83%* | 100% |
| compact | 34,093 | 83% | 100% | 100% |
| expanded | 33,886 | 83% | 100% | 100% |

\* baseline's one failure was a transient LiftWing 503, not a model miss.

Results (`bench-boards-2026-09-09.json`):

- ✅ 3-widget chains work: `excerpt → translate → speaker` and
  `listSource → filterLines → lineCount` recommended in correct order with
  correct subjects/configs (pattern "art", `to: es/fr`)
- ✅ The switcher board (`boardControls → cimSnapshot`) is recognized
- ⚠️ `chain-list-display` failed twice in the first run (model recommended
  `articleList` alone — defensible, since articleList takes a pasted list
  directly). With the sharpened prompt ("I'll keep editing the list in one
  place and the card should follow"): **2/3 variants pass** — the expanded
  variant returned `articleList, listSource` (right widgets, wrong ORDER —
  the chain subsequence check is strict about dataflow direction). Ordering
  is the remaining board-construction wobble; a 1-shot chain example in
  ASK_MANUAL is the likely fix (see `bench-fixcheck-2026-09-09.json`)
- ⚠️ **Wiring-token behavior:** the model volunteered
  `{{widget:<invented-id>}}` tokens in ~4/18 chain options despite ASK_MANUAL's
  "never invent ids" rule (e.g. `text: "{{widget:excerpt_id}}"` — a plausible
  but non-existent id). Informational: on a FRESH board the ids are actually
  predictable (the client generates them), so a future Ask phase could let the
  model wire new chains explicitly — that would turn chain recommendations
  into one-click boards. Documented as the main follow-up.

## Answers to the benchmark question

1. **Widget recommendations: yes, the info is sufficient.** 100% top1 on
   single-widget intents with the shipped prompt; the 2 residual config
   failures were fixed with two VALUE RULES edits (category verbatim ✓
   re-verified, subject completeness ✓ re-verified) — not by adding wiring
   knowledge.
2. **Board construction: mostly yes, with one gap.** Chains of 2–3 widgets are
   recommended in correct order with correct wiring described in reasons
   (chain 100% on 5/6 fixtures, plus 2/3 on the sixth after the prompt
   sharpening). The gap is not prompt knowledge but the **output schema**: Ask
   cannot declare a `params` block or wire `{{widget:id}}` refs for NEW
   widgets (the manual forbids invented ids, yet the model invents them anyway
   ~20% of the time). A "board assembly" output schema (widget ids + params +
   wiring, generated client-side) is the next phase (ISSUE-44 Phase 3).

## Round 2 — experiments unlocked by `--via toolforge` (2026-09-09, later)

With the public 100 req/h cap bypassed, five experiments that were previously
impractical (each needs repeats or a big call budget):

| # | Experiment | Result |
|---|---|---|
| 1 | Board suite re-run, all 3 variants | **chain 100% · keys 100% · subject 100%** everywhere — the earlier 83% was the transient 503 + ambiguous fixture, both resolved; the ordering wobble did not reproduce. No ordering few-shot needed. Boards are saturated. |
| 2 | `llm-qwen3-14b` (the production FALLBACK model, never benchmarked) | **top1 100% · keys 100% · subject 100%** on all 15 single-widget fixtures — the fallback degrades nothing; passed glam-category-impact first try |
| 3 | Temperature 0.0 vs 0.3 (board suite, baseline) | identical 100% — temp is not a factor for chain/board tasks; keep 0.3 |
| 4 | Out-of-scope rejection probe (`scripts/probe-ask-edge.mjs`) | 5/6 strict — for "Write a poem about the ocean" the model returned a VALID markdown widget containing the poem (creative but legitimate: a Markdown card displays text). Zero invented ids / invalid configs in 6/6 — the real safety bar holds |
| 5 | **Board-assembly schema prototype** (`--assembly`) | **3/3 valid complete boards**: params block declared (museum switcher, `{{category}}` wired into glamorgan + cimTrend), `excerpt → translate → speaker` chained transitively, and a 4-widget list/filter/count/display pipeline with correct source-picker semantics (bare producer id) — unique ids, known types, **zero dangling refs** |

Experiment 5 is the decisive evidence for **ISSUE-44 Phase 3 (board
assembly)**: given a schema that allows it, the model already emits coherent
`params` + widgets + `{{widget:id}}`/`{{param}}` wiring in one shot. The
remaining work is product engineering (accepting/validating an assembled
board client-side, layout placement, id collision handling), not model
capability. The probe asserts the invariants (unique ids, known types,
no dangling `{{widget:}}`/`{{param:}}` refs) and is the template for the
Phase 3 constitution.

Files: `bench-boards-v2-2026-09-09.json`, `bench-model-14b-2026-09-09.json`,
`bench-boards-temp0-2026-09-09.json`, `scripts/probe-ask-edge.mjs`.

## Follow-on work

1. ~~Verify the two VALUE RULES fixes~~ — **done 2026-09-09, with reliability
   measured** (`--via toolforge` made repeats cheap): `wayback-snapshots`
   passed only **1/5** with the rule alone — rules alone don't stick for
   pre-fill completeness. Adding a wayback few-shot (url + dates, different
   site than the fixture) to EXAMPLES → **5/5**. `glam-category-impact`
   verbatim category holds **3/3**. Lesson: for config pre-fill, ONE
   targeted few-shot beats a general rule.
2. **Ordering robustness for chains:** `expanded` returned
   `articleList, listSource` (right widgets, wrong order) on the sharpened
   list fixture — add one chain few-shot to ASK_MANUAL that demonstrates
   producer-before-consumer ordering (the wayback few-shot result above
   suggests few-shots are the right lever here too)
3. ~~Board-assembly schema (ISSUE-44 Phase 3) feasibility~~ — **probed
   2026-09-09: the model fills a complete params+widgets+wiring schema 3/3
   with zero dangling refs** (experiment 5 above). Phase 3 is a product
   build, not a model-capability risk.
4. Consider wiring-token volunteering as a *feature* gate: reject configs
   whose `{{widget:X}}` doesn't match a widget id in the same recommendation

### Files

| File | Purpose |
|---|---|
| `bench-baseline-2026-09-09.json` | Original single-widget baseline (15 fixtures) |
| `bench-variants-2026-09-09.json` | 3-variant prompt comparison (single-widget) |
| `bench-boards-2026-09-09.json` | Board-construction chain benchmark (6 fixtures × 3 variants) |
| `bench-fixcheck-2026-09-09.json` | Post-fix verification (glam ✓; wayback pending) |
| `tests/board-fixtures.mjs` | Ground-truth chain fixtures |
| `tests/intent-benchmark-lib.mjs` | + scoreChainOptions / summarizeChain / assertBoardFixtureSchema |
| `scripts/benchmark-ask-variants.mjs` | Variant + `--boards` runner (429-aware w/ Retry-After) |
| `scripts/benchmark-ask.mjs` | Original single-variant scorer |
| `tests/intent-fixtures.mjs` | 15 single-widget fixtures |
| `docs/BOARD-COMPOSITION.md` | Full wiring reference (compact variant source) |

### Run

```bash
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs                      # single-widget, current prompt
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs             # 3-variant comparison
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --boards    # board-construction chains
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --only wayback-snapshots          # one fixture
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --variants baseline               # one variant
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --via toolforge                   # high tier (recommended)
# pace 1500ms default; --pace 250 is fine via toolforge; 429s honor Retry-After automatically
```

### Rate limits (measured 2026-09-09)

- **Direct (local IP): ~90 calls/hour, then persistent 429s** — the
  anonymous public tier is 100 req/h per client IP. A full 3-variant run
  (~90+ calls) exhausts it; `--pace 5000` + Retry-After only softens it.
- **`--via toolforge`: effectively unlimited** — requests are sent from the
  Toolforge bastion (`ssh $USER@dev.toolforge.org`, override with
  `TOOLFORGE_SSH`), whose egress IPs sit on WMF's higher tier automatically:
  no key, no request, same endpoint (per the `wikimedia-ml-services` skill,
  verified there with a 100-request burst, 0×429 in ~14 s). Payloads are
  base64-encoded over the SSH hop so quoting never breaks. This is what made
  the 5×/3× reliability re-runs above possible — use it for all repeat
  measurements; keep the direct mode only to reproduce user-facing latency.
