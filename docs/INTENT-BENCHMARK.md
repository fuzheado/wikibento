# Intent→Widget Benchmark & Fixture Interviewer

The ground-truth catalog for the "Ask" advisor (ISSUE-44): a set of realistic
human prompts, each mapped to the widget (and pre-filled config) a correct
recommendation should produce. Everything here measures — and improves — how
well both the offline local matcher and the LiftWing LLM tier turn intent
into widget choices.

## Why this exists

As the catalog grows (30 → 50 widgets planned: slideshow, ticker, map
family…), widgets become confusable — e.g. `fileUsage` vs `cimFileSpotlight`
(live vs precomputed file usage), `gallery` vs `categorySize` (article media
vs category media). One-line descriptions stop being enough to distinguish
them. This suite:

1. **Locks in behavior** — a regression gate that runs in `npm test`
   (offline) and a manual live scorer for the LLM tier.
2. **Provides ground truth** for prompt enrichment — the fixtures double as
   the few-shot example pool when we enrich the manifest.
3. **Guides the interviewer tool** — the fastest way to grow the catalog
   with human phrasing rather than machine-typed JSON.

**Baseline (2026-08-16):** LLM tier 15/15 top-1 (keys 100%, subject 100%);
local tier 15/15 top-3 (100% top-1 after pattern fixes). The suite already
caught 3 real local-matcher bugs — see [Findings](#findings).

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

```
Coverage: 15/30 · 15 uncovered

Uncovered widgets (interview these first):
  1. 📝 markdown         5. 🎯 cimSnapshot    9. 📄 cimTopPages   13. 📉 cimFileTraffic
  2. 🧭 assessments      6. 📈 cimTrend      10. ✍️ cimTopEditors 14. 📄 wikiPage
  3. 🗂️ fileGallery      7. 🖼️ cimTopFiles   11. 🏆 cimLeaderboard 15. 🎬 mediaPlayer
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
   (`topWikipedias`, `sparql`, `markdown`, `cimLeaderboard`) skip Q2 and get
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

## Coverage

Current: **15/30 widgets covered** (15 fixtures). Uncovered — interview
these first: `markdown`, `assessments`, `fileGallery`, `articleList`,
`cimSnapshot`, `cimTrend`, `cimTopFiles`, `cimTopWikis`, `cimTopPages`,
`cimTopEditors`, `cimLeaderboard`, `cimFileSpotlight`, `cimFileTraffic`,
`wikiPage`, `mediaPlayer`. The CIM family (8 widgets) is the highest-value
target: its members differ mainly in which precomputed slice they show.

Coverage check: `node scripts/interview-fixtures.mjs --list`.

## Related

- ISSUE-44 design, abuse defense, and the shipped payload contract
  (trim map, prompt layout, token math): `docs/ISSUES.md` → ISSUE-44.
- LiftWing model capabilities, rate limits, privacy: `docs/DATA-SOURCES.md`
  §23.
- The local matcher: `src/lib/askLocal.js` (curated `INTENT_PATTERNS` +
  keyword scoring — the patterns are a natural place to encode fixture
  learnings).
