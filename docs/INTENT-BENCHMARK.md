# Intent→Widget Benchmark & Fixture Interviewer

The ground-truth catalog for the "Ask" advisor (ISSUE-44): a set of realistic
human prompts, each mapped to the widget (and pre-filled config) a correct
recommendation should produce. Everything here measures — and improves — how
well both the offline local matcher and the LiftWing LLM tier turn intent
into widget choices.

## Why this exists

As the catalog grows (36 widget types today: the map family, geometry fields, QR Code, the IA/document readers
and the whole CIM family all landed after this suite was written — and none of them is covered), widgets become
confusable — e.g. `fileUsage` vs `cimStats`
(live vs precomputed file usage), `gallery` vs `categorySize` (article media
vs category media). One-line descriptions stop being enough to distinguish
them. This suite:

1. **Locks in behavior** — a regression gate that runs in `npm test`
   (offline) and a manual live scorer for the LLM tier.
2. **Provides ground truth** for prompt enrichment — the fixtures double as
   the few-shot example pool when we enrich the manifest.
3. **Guides the interviewer tool** — the fastest way to grow the catalog
   with human phrasing rather than machine-typed JSON.

**Current baseline (2026-10-01, `llm-qwen36-27b`):** LLM tier **top1 93% · top3 93% · keys 93% ·
subject 92%**, identical in 3/3 shipped runs and 2/2 diagnostic re-runs — the
one miss (`category-sample-photos` → `gallery`) is stable **5/5**. Boards:
**chain 77% (67–83% over 5 runs) · keys 100% · subject 100%**; in assembly mode
(`mode:'board'`) **chain 67%**, with 18/18 boards accepted by both the server
and the app. Local tier 15/15 top-3. Full numbers, run files and the failure
taxonomy: `docs/ASK-ARCHITECTURE.md` + `bench/results/2026-10-01-*.json`.
*(Historical: the 2026-08-16 baseline was 15/15 top-1, keys 100%
subject 100% — quoted only to show what moved. The 2026-09-09 record of a
100% top-1 baseline no longer reproduces.)* The suite already caught 3 real
local-matcher bugs — see [Findings](#findings).

## The three artifacts

| Artifact | What it does | When it runs |
|---|---|---|
| `tests/intent-fixtures.mjs` | The ground-truth catalog: `{id, prompt, expected:{widgetType, config}, requireSubject, note}` entries | read by everything else |
| `tests/intent-benchmark.test.mjs` | Hard-asserts fixture schema validity; scores the LOCAL tier (askLocal) against the fixtures with a rising top-3 floor | `npm test` (offline, deterministic) |
| `scripts/benchmark-ask.mjs` | Scores the LIVE LLM tier — sends the exact deployed prompt (`ASK_SYSTEM`+`ASK_RULES` from `deploy/server.js`) to LiftWing, runs output through the same sanitizer, reports top1/top3/keys/subject | manual (live dependency, no SLA) |

Shared scoring lives in `tests/intent-benchmark-lib.mjs` (`scoreOptions`,
`assertFixtureSchema`, scorecard printing) so both tiers are measured
identically.

Scoring semantics: **top1/top3** = expected widget is `options[0]` / within
the first three; **keys** = the matching option carries all expected config
keys; **subject** = (only for `requireSubject` fixtures) every expected value
is present as significant tokens in the returned value — placeholders never
count. The local tier is only expected to reach top-3 (it is a discovery
matcher, not a config extractor); the LLM tier should reach top-1 everywhere.

## The interviewer tool

`scripts/interview-fixtures.mjs` — interview mode for building fixtures
without hand-editing JSON. Shows a widget card (name, description, source,
config fields), asks for a natural Ask-box phrase, captures the pre-fill
subject, validates, appends.

### Modes

```bash
node scripts/interview-fixtures.mjs            # interactive loop (needs a real terminal)
node scripts/interview-fixtures.mjs --list     # coverage report (covered vs uncovered)
node scripts/interview-fixtures.mjs --add \
     --widget mediaPlayer \
     --prompt "play a playlist of commons videos of the solar eclipse" \
     --subject "File:Solar eclipse 2024.webm" \
     [--id myid] [--note "…"]                  # programmatic add (agent/CI path)
```

### Interactive walkthrough

*(Transcript from 2026-08-16, when the catalog had 30 types — the shape of the tool, not today's coverage;
for that see [Coverage](#coverage). The widget ids shown are the ones current on that date: the CIM family
has since merged nine types into three, and those nine old ids still resolve for boards that carry them.)*

```
Coverage: 15/30 · 15 uncovered

Uncovered widgets (interview these first):
  1. 📝 markdown         5. 🎯 cimSnapshot    9. 📄 cimTopPages   13. 📉 cimFileTraffic
  2. 🧭 assessments      6. 📈 cimTrend      10. ✍️ cimTopEditors 14. 📄 wikiPage
  3. 🗂️ gallery      7. 🖼️ cimTopFiles   11. 🏆 cimLeaderboard 15. 🎬 mediaPlayer
  4. 📋 articleList      8. 🌍 cimTopWikis   12. 🔦 cimFileSpotlight

Enter a number or widget id (blank to quit): 15

── 🎬 Video / Media Player ──────────────────────────────
Category: Files & Media · Type: stat
Play Commons video or audio — one file or a whole playlist (jukebox: next/prev, loop, shuffle)
Source: Commons API videoinfo (batched)
Config: files (textarea) · mediaType (select: auto|video|audio) · quality (select: auto|240|480|720|1080) · loopPlaylist (boolean) · shuffle (boolean) · autoplay (boolean)

Identity field: files — File:Name.ext entries, one per line, each with the File: prefix

Q1. Type a phrase a user would type to ask for THIS widget (natural, as if typing into the Ask box):
> play a playlist of commons videos of the solar eclipse

Q2. Pre-fill files with? (File:Name.ext entries, one per line, each with the File: prefix; blank = no pre-fill)
> File:Solar eclipse 2024.webm

Q3. Optional note (why this phrasing / what to watch for):
> jukebox playlist phrasing; don't confuse with mediaPlayer video-only asks

Preview:
{
  "id": "mediaplayer-1",
  "prompt": "play a playlist of commons videos of the solar eclipse",
  "expected": { "widgetType": "mediaPlayer", "config": { "files": "File:Solar eclipse 2024.webm" } },
  "requireSubject": true,
  "note": "jukebox playlist phrasing; don't confuse with mediaPlayer video-only asks"
}
Save? [y/n] y
Saved → 16 fixtures (mediaPlayer now has 1 entry)
```

### What happens on save (the guarantees)

1. The entry is built by `buildEntry()` — subject-less widgets
   (`topWikipedias`, `sparql`, `markdown`, `cimRanking` with `facet: categories`) skip Q2 and get
   `requireSubject: false`; select-typed identity fields (`lang` for
   `wikistats`/`topPages`) are checked against the widget's real options.
2. The **entire** resulting fixture list is validated with the same
   `assertFixtureSchema` used by `npm test` — unknown widget ids, config keys
   that aren't real `configFields`, duplicate ids, or too-short prompts are
   rejected **before anything is written**.
3. Only then is the entry appended to `tests/intent-fixtures.mjs`.
4. Run `npm test` to re-verify, and `scripts/benchmark-ask.mjs` (live) to see
   whether the LLM tier agrees with the new ground truth.

### Ground rules for good fixtures

- **Realistic phrasing wins.** Prompts should read like what a human types
  into the Ask box — not like a widget name ("pageviews for X" is a bad
  fixture; "how many views did X get last month" is a good one).
- **Do not quote category names.** Probed live (5 variants, 2026-08-16): the
  model extracts full category spans exactly whether quoted, unquoted with a
  clause boundary, or unquoted with none. Fixtures stay unquoted — and where
  the realistic form is also the hardest (no boundary: "…in the United
  States and how many files…"), that is the form to use.
- **Prefer the confusable pair.** When a widget has a near-twin (live vs
  precomputed, gallery vs list), write the phrasing that tests the
  discrimination, and say so in the note.
- **`requireSubject: true`** when the prompt names a real subject the config
  must carry. False when the widget takes no subject (rankings, static
  cards) or the config can't be pre-filled (sparql query text, markdown
  body).
- **One widget per fixture** — the ONE best match. Alternatives are the
  LLM's job to offer, not the ground truth's.

### Troubleshooting

- **Interactive mode hangs when stdin is piped** (e.g. `printf … | node
  scripts/interview-fixtures.mjs`): a Node 26 `readline/promises` quirk —
  only the first `question()` resolves on non-TTY stdin. Run it in a real
  terminal, or use `--add` for automation.
- **Ctrl+D** at any prompt exits gracefully (treated as blank / quit).
- Entry ids are generated as `<widgetId-lowercase>-<n>` (e.g.
  `mediaplayer-1`) to satisfy the kebab-case schema rule; override with
  `--id`.

## Measuring the LLM tier

```bash
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs                        # all fixtures, default model
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --limit 5              # first 5
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --model llm-qwen3-14b  # fallback model
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --gate 0.8             # exit 1 unless top-3 ≥ 80%
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --out bench.json       # machine-readable, incl. extracted configs
WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --fixtures ./probe.mjs # score a throwaway probe file

# repeats, board fixtures, and the high rate tier — benchmark-ask.mjs has NO --via flag
# (it always calls from the local IP, ~90 req/h), so repeats go through the variants runner:
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --variants baseline --via toolforge --out run.json
WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --boards --variants baseline --via toolforge --out run.json
```

Notes:

- Sends the **exact** prompt the deployed relay sends (imports
  `ASK_SYSTEM`/`ASK_RULES` from `deploy/server.js`) and sanitizes output
  with the same `validateOptions()` — the score reflects what the UI would
  actually offer.
- Requests are paced 1.5 s apart (`--pace` to change); the anonymous
  LiftWing tier is ~100 req/h per client. This is a manual benchmark, NOT
  part of `npm test` (live dependency, no SLA).
- `--out` saves the extracted configs (`matchedOption`) so span-extraction
  problems can be diagnosed exactly — this is how the category-delineation
  probe was verified.
- `--fixtures` lets you probe prompt variants or experimental phrasings
  without touching the catalog (see `tests/probe-*.mjs` pattern — delete
  after use).

## Findings (2026-08-16)

1. **Local matcher bugs caught by the suite (and fixed):** no intent pattern
   for `wikistats` (language-edition stats) or `waybackGallery` ("snapshot"
   vs "snapshots" — the corpus didn't contain the plural); and a keyword
   false-friend where `topPages` outranked `linkcount` on "…articles link to
   example.org?" (name-bonus double-count on "Top Wikipedia Articles").
2. **Category-span delineation:** the LLM extracts full category names
   exactly regardless of quoting/boundary delimiters — fixtures therefore
   stay in the realistic unquoted form (see Ground rules).
3. **Subject-less fixtures** (`requireSubject: false`) show "—" in the
   scorecard's subject column; the rate is computed only over fixtures where
   a subject applies.

## Findings (2026-10-01) — the live audit

Measured with the shipped prompts (`llm-qwen36-27b`, `temperature 0.3`,
`max_tokens 700`) via the Toolforge bastion: 171 fixture-runs, **0 upstream
errors, 0 non-JSON replies, 0×429**. Everything below is reproducible from
`bench/results/2026-10-01-*.json`; the method and the full taxonomy are in
`docs/ASK-ARCHITECTURE.md`.

1. **Single-widget: 93% top1, stable.** One fixture fails in 5/5 runs —
   `category-sample-photos` returns `gallery` (`from: 'category'`) instead of
   `categorySize`, i.e. against the prompt's own canonical few-shot. It also
   writes `wiki:` where `gallery` declares `project`, so the value is silently
   dropped. Both are one-line fixes; the fixture's ground truth is a call for
   its author, not for the audit.
2. **Boards (suggest mode) 77%, not 100%.** `chain-list-display` fails 5/5 —
   `articleList` alone, or `[articleList, listSource]` (right widgets, wrong
   dataflow order). `board-switcher-institutions` also misses 2/5 with a
   defensible alternative (`glamorgan + categorySize`). One targeted chain
   few-shot is the cheap lever (for value-level behaviour, the wayback case
   went 1/5 → 5/5 only after an example was added).
3. **Assembly mode (`mode:'board'`) is the stronger contract:** chain 67%
   (4/6, identical 3/3), keys/subject 100%, **18/18 accepted by
   `validateAssembly` and by the app's own `validateDashboard`**, and **6/6
   rendered in the built app in a real browser**. `chain-list-display` passes
   here — being allowed to assign instance ids is what suggest mode lacks.
4. **One of the two assembly misses is a server bug, not a model miss.** The
   model emitted the full `excerpt → translate → speaker` chain with
   `speaker.source = "translate#speech"` — the app's own channel-qualified id
   (ISSUE-91) — and `validateAssembly` pruned the card as dangling **3/3 runs**.
5. **The catalog alone carries the knowledge.** With `ASK_SYSTEM` only (no
   manual, no rules, no few-shots, no output schema): as shipped it scores 0%
   (48/48 replies use an invented envelope, `{widgets:[{id:…}]}`), but scored on
   content it matches the shipped prompt — **top1 93%** on single-widget
   intents, **chain 78%** on boards. What the rules buy is the envelope, and
   subject formatting (69% → 92%, with the server repairing two of the three
   recurring faults anyway).
6. **Coverage is the weakest part of the number.** 15 of 36 types have
   single-widget ground truth; the board fixtures name 9 more, so 13 types are
   unmeasured — the rest of the CIM family, the map/geometry fields, media and the
   embeds. See [Coverage](#coverage).

## Board-construction fixtures (2026-09-09, numbers refreshed 2026-10-01)

The single-widget fixtures were saturated when this suite was written (LLM
top1 100%) so they could not measure prompt enrichment — a 3-variant
comparison (baseline / +compact wiring ref / +expanded manual) scored
**identically** on all 15. They are no longer saturated (top1 93%,
2026-10-01), but the reason for a second suite stands: the first half of the
Ask question is "which widget", the second is "which widgets, in what
order" — and only the second needs the dataflow manual. The board suite is
measured by:

| Artifact | What it does |
|---|---|
| `tests/board-fixtures.mjs` | 6 multi-widget chain prompts: `{id, prompt, expected:{chain:[…], config:{widgetType:{…}}}, requireSubject, note}` |
| `scoreChainOptions` / `summarizeChain` / `assertBoardFixtureSchema` (in `tests/intent-benchmark-lib.mjs`) | chain scoring: expected chain appears as an in-order SUBSEQUENCE of the returned options; keys/subject per chain entry |
| `scripts/benchmark-ask-variants.mjs --boards` | the live runner (also compares prompt variants; 429-aware) |
| `tests/intent-benchmark.test.mjs` | offline schema constitution for the board fixtures (chain ≥ 2, ids/keys exist in the manifest) — wired into `npm test` |

Chain scoring semantics: **chain** = the expected widget sequence appears
in order (extra alternatives allowed — the model may add a precomputed/live
pair); **keys** = every declared config entry's keys are present; **subject**
same token rule as single-widget, applied per chain entry. Wiring is NOT
gated as literal `{{widget:…}}` tokens — askManual(manifest) (correctly) tells the
model never to invent board ids; the scorer records volunteered tokens
informationally.

Findings (**refreshed 2026-10-01** — five runs in suggest mode, three in
assembly mode; the 2026-09-09 numbers are in `bench/results/2026-09-09-boards-v1.json`):

1. **Chains work, at ~77% not 100%:** 3-widget chains (`excerpt → translate →
   speaker`, `listSource → filterLines → lineCount`) come back in order with
   correct subjects/configs, and `boardControls → cimStats` usually does.
   chain 83 / 67 / 83 / 83 / 67 over five runs · keys 100% · subject 100%.
   The recurring failure is `chain-list-display` (**5/5**); the 2026-09-09
   note that it was a transient 503 does not hold — it is a real answer.
2. **Prompt fixes from the single-widget residuals** (deploy/server.js VALUE
   RULES): categories are now "copied VERBATIM … keep the FULL span" (fixed
   the `glam-category-impact` truncation ✓ re-verified) and a new SUBJECT
   COMPLETENESS rule fills every subject the user named (fixes
   `wayback-snapshots` dropping `url` ✓ re-verified after the rate window).
   **Both still hold on 2026-10-01**: no fixture in 171 runs omitted a subject
   it named.
3. **The model wants to wire, and the contract cannot say it:** on 2026-10-01
   the suggest-mode replies carried a wiring reference the board cannot use in
   **6/12** runs (`speaker.source = "excerpt"` — the widget *type* where an
   instance id goes; `{{widget:excerpt}}` with no id to point at) and no
   reference at all in **4/12**. That contradiction — the manual says never
   invent ids, the model wires anyway — is what the assembly contract
   (`mode:'board'`, ISSUE-44 Phase 3, shipped since this section was written)
   resolves by letting the model assign the ids itself.
4. **Rules alone don't make the model pre-fill config fields:** the SUBJECT
   COMPLETENESS rule fixed `wayback-snapshots` (dropped `url`) only 1/5
   repeat runs; adding ONE targeted few-shot to the EXAMPLES block (url +
   dates, different site than the fixture) fixed it 5/5. For value-level
   behavior, few-shots are the reliable lever; rules set intent only.
5. **LiftWing rate window:** direct ~90 calls/IP/hour before persistent 429s
   — run benchmarks with `--via toolforge` (bastion egress = higher tier,
   effectively unlimited; ~140 ms/req before this round's ~1.3–1.7 s SSH hop).
   171 calls on 2026-10-01 produced zero 429s. Full write-up in
   `bench/README.md`.
6. **Assembly mode needs its own fixtures** (2026-10-01): the board fixtures
   above are scored in *suggest* mode (options, chain as a subsequence), while
   the shipped 🧩 path returns a different shape (`{board:{params,widgets}}`).
   Nothing offline asserts the board contract yet; `tests/assembly.test.mjs`
   shows how cheap that would be.

## Coverage

Current: **15/36 widgets covered** (15 fixtures), 21 uncovered. The board
fixtures name 9 more types but do not give them a single-widget intent, so
**23/36 types appear anywhere in ground truth** and **13 appear nowhere**:
`markdown`, `qrCode`, `assessments`, `cimTrend`, `cimRanking`, `wikiBox`,
`wikiPage`, `map`, `mediaPlayer`, `iaItem`, `iaBook`, `documentReader`,
`echo`.

The highest-value targets, in order:

1. **The CIM family (3 types)** — the biggest unmeasured block; `cimStats`
   appears only inside a board fixture, and the arms differ only in which
   precomputed slice they show. Note the allow-list caveat: a CIM card on a
   non-allow-listed category renders and then reports no data (found 2026-10-01).
2. **The map and its geometry fields** (ISSUE-132) — a places list, pasted
   GeoJSON, and geometry arriving from another widget.
3. **Media & IA** — `mediaPlayer`, `iaItem`, `iaBook`, `documentReader`,
   `qrCode` (the only widget whose config is a *reference*).
4. **Embeds & text** — `markdown`, `wikiBox`, `wikiPage`, `assessments`.
5. **Dataflow types as standalone intents** — `listSource`, `filterLines`,
   `lineCount`, `articleList`, `translate`, `speaker`, `boardControls` are only
   ever seen inside a chain today, so nothing measures choosing them for their
   own sake.

Coverage check: `node scripts/interview-fixtures.mjs --list`.

## Related

- ISSUE-44 design, abuse defense, and the shipped payload contract
  (trim map, prompt layout, token math): `docs/ISSUES.md` → ISSUE-44.
- LiftWing model capabilities, rate limits, privacy: `docs/DATA-SOURCES.md`
  §23.
- The local matcher: `src/lib/askLocal.js` (curated `INTENT_PATTERNS` +
  keyword scoring — the patterns are a natural place to encode fixture
  learnings).
