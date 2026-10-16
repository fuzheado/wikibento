# Commons image notes → Structured Data: the audit's code, data and results

This is the working set behind **`reports/commons-imagenote-audit-2026-10-08.md`** (*Image notes → Structured Data,
part 2: corpus audit (9,643 files) and matcher evaluation (100-note gold set)*) and the two plots it revises
(`reports/commons-imagenote-to-sdc-2026-10-07.md`). Everything here is read-only against Wikimedia: the scripts only
ever GET, and nothing was written to any wiki.

## Provenance

| | |
|---|---|
| Collector run | `manifest.json` → `generated: 2026-10-08T07:54:42Z`, `list_source: cirrussearch-partitioned`, `requested: 11346` |
| User-Agent used | `HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0` |
| Corpus | `files.jsonl` — **9,643 records**, 30,032 image notes (`progress.txt` records the collector's own counter: `11346/11346`) |
| Data sources | Commons + Wikidata Action APIs; QLever (`qlever.dev/api/wikimedia-commons`) for qualifier-level SPARQL (the official WCQS needs OAuth and was not used) |
| Everything here is | CC0 / public-domain *data* (Wikimedia file metadata). No credentials, tokens or private data are included — check with `grep -riE 'token|password|secret' *.py` (nothing). |

## Requirements

Python **3.9+** (developed and verified on 3.13.5) — **standard library only**, no `pip install`. The scripts use
`json, os, re, sys, time, urllib, unicodedata, collections, random`.

Network access is needed only by `collect_artwork_subset.py` (the collector) and by any run that misses the two API
caches. `api_cache.json` (850 responses, 24 MB) and `api_cache_cc.json` (718 responses, 8.7 MB) make the analysis steps
**offline and idempotent** — that is their purpose.

## Paths

Each script hard-codes the directory it reads and writes:

```python
OUTDIR = "/opt/data/audit"
```

Two ways to run this anywhere else:

```bash
# a) extract to that path, and nothing needs changing
# b) or run this once, which rewrites the single line in each script:
./set_outdir.sh "$(pwd)"
```

`./run_offline.sh` does (b) and then runs the five analysis steps in order, printing where each output landed.

## What is in the box

| file | what it does | reads | writes |
|---|---|---|---|
| `collect_artwork_subset.py` | the read-only collector: every Commons file transcluding **both** `{{ImageNote}}` and `{{Artwork}}` → notes (box, text, links), template params, imageinfo, all SDC statements, the linked artwork item's `depicts` | Commons + Wikidata APIs | `files.jsonl`, `manifest.json`, `progress.txt` |
| `files.jsonl` | the corpus: 9,643 records, one JSON object per line (notes with their boxes and links, SDC, artwork seed) | — | — |
| `audit_report.py` | §2–3.1 corpus metrics (coverage, geometry staleness, SDC, link layer, import volume) | `files.jsonl` | `audit_summary.json` + a printed summary |
| `crosscheck2.py` | §3.2 note-level synchronicity, **batched** (50 titles/request): does the file already have a structured record of what each note names? | `files.jsonl`, `api_cache_cc.json` | `synchronicity.json`, `synchronicity_per_file.json` |
| `crosscheck.py` | the **v1** of the above, one request per note — kept because it is the earlier measurement path | `files.jsonl`, `api_cache_cc.json` | `synchronicity.json` (same names; do not run both in one directory) |
| `select_gold.py` | the stratified gold-set selection (`random.seed(20261008)`, so it is deterministic) | `files.jsonl` | `gold_notes.json` (100 notes), `gold_titles.json` |
| `matcher.py` | **the matcher**: 4-stage candidate ladder (explicit `:wikidata:` links → wiki links resolved via `pageprops` → normalised-name Wikipedia search → Wikidata entity search), then validation (`P31=human`, birth/death plausibility, context boosts) and scoring | `files.jsonl`, `gold_notes.json`, `api_cache.json` | `candidates_gold.json`, `candidates_test.json` |
| `evaluate.py` | §4: coverage, top-1/hit@3, the confidence **threshold sweep** (the publish gate), error inventory | `gold_labels.json`, `candidates_gold.json` | `matcher_evaluation.json` + printed tables |
| `gold_labels.json` | the 100 hand-adjudicated notes (gold QID / MISS / AMBIG / NOITEM / NOTENTITY) — the only hand-made input | — | — |
| `gold_micro.json` | the 36-note micro-gold set on link-rich files | — | — |
| `gold_qid_lookups.json` | the QIDs verified in order to adjudicate the misses | — | — |

## Run order

```bash
# 0 · the collector — the only step that must be online, and the only slow one
#     (~11.3k files; the shipped files.jsonl is the frozen result, so you do not need to re-run it)
python3 collect_artwork_subset.py [limit]

# 1 · corpus metrics                            (~0.2 s, offline)
python3 audit_report.py

# 2 · note-level synchronicity                  (~4 s with the cache, offline)
python3 crosscheck2.py

# 3 · the stratified gold set                   (~0.2 s, offline, deterministic)
python3 select_gold.py

# 4 · the matcher, on the gold set              (~40 s with the cache, offline)
python3 matcher.py --notes gold_notes.json --out candidates_gold.json
#     the smaller smoke run the report also used:
python3 matcher.py --files 20 --out candidates_test.json

# 5 · score it against the hand-made labels      (<0.1 s, offline)
python3 evaluate.py gold_labels.json candidates_gold.json
```

`matcher.py` also accepts `--titles <json list>` (a plain JSON array of page titles) instead of `--notes`.

## Expected results (what "it worked" looks like)

From the shipped, untouched outputs — these are the numbers the report quotes:

- `audit_summary.json` — `audited.files` **9643**, `audited.notes` **30032**, `geometry.stale` **1117**,
  `sdc.any_statement` **8917**, `sdc.has_depicts` **4817**, `sdc.depicts_with_position` **13**,
  `notes.notes_with_link` **8145**, `import_volume_estimate.candidate_claims` **30032**
  (→ `writes_if_qualifier_and_reference_added` **90096**).
- `matcher_evaluation.json` — `gold_notes` **100**, `gold_bindable` **66**, `gold_should_abstain` **34**,
  `overall.top1_correct` **37**, `top3_contains_gold` **45**, `missed` **21**; the threshold sweep starts at
  `0.5 → 58 proposals @ 0.638 precision`, `0.6 → 47 @ 0.723`.
- `synchronicity.json` — `explicit_link_present` **134**; `text_overlap_present` **610** and `absent` **14095** with
  the shipped code (see the finding below — the shipped file says 592/14113).

## Verified reproduction

I re-ran the pipeline in a clean copy of this package on 2026-10-12 (Python 3.13.5, no network needed for steps 1–5)
and compared the regenerated outputs byte-for-byte against the shipped ones:

| step | output | md5 match | time |
|---|---|---|---|
| `audit_report.py` | `audit_summary.json` | **identical** | 0.2 s |
| `select_gold.py` | `gold_notes.json` | **identical** | 0.2 s |
| `matcher.py --notes gold_notes.json --out candidates_gold.json` | `candidates_gold.json` | **identical** | 40.8 s |
| `evaluate.py gold_labels.json candidates_gold.json` | `matcher_evaluation.json` | **identical** | 0.02 s |
| `crosscheck2.py` | `synchronicity.json` | **differs** — see below | 4.1 s |

**The one difference, and its cause.** `synchronicity.json` / `synchronicity_per_file.json` in this package were
written at **09:06:30**, while `crosscheck2.py` was last edited at **09:11:33** — i.e. the shipped count files predate
the shipped script by five minutes. Re-running today's `crosscheck2.py` gives:

| | shipped file | re-run of the shipped code |
|---|---|---|
| `text_overlap_present` | 592 | **610** |
| `absent` | 14,113 | **14,095** |

So 18 of the 14,705 notes on depicts-bearing files (**0.12%**) are found by the later text-overlap test and were not
counted in the file the report's §3.2 table used (total in sync 726 → **744**, i.e. 4.2% → 4.3%). It is not
non-determinism: three repeat runs give 610 every time, with and without `PYTHONHASHSEED=0`, and the API caches are
byte-identical to the shipped ones (same md5), so nothing was re-fetched. The script is simply newer than its own
output. **The other five outputs are exactly reproducible.**

## Caveats worth carrying

- The 100-note gold set is a **stratified sample, not a census**; the per-stratum figures carry roughly ±10 points at
  n≈30 per stratum, and the link-free stratum (n=56) is the best-supported number in the report.
- `haswbstatement:` **does not index qualifiers** — `haswbstatement:P2677` reports 1 file while SPARQL reports 7,926.
  Qualifier questions must go to SPARQL (QLever here).
- The caches are the reason re-runs are cheap and idempotent; **deleting them makes every step network-bound** and, for
  `crosscheck2.py`, makes the label/alias inputs live rather than frozen (Wikidata labels change).
- `crosscheck.py` and `crosscheck2.py` write the **same filenames** — running both in one directory overwrites.

## Licence

The **data** is Wikimedia's (CC0 / public domain metadata; individual file pages carry their own licences).
The **code** in this package originally carried no licence file; if it is published, give it one (MIT would match the
author's other repositories) rather than leaving it implicit.
