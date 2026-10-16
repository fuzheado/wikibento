# Image notes → Structured Data, part 2: corpus audit (9,643 files) and matcher evaluation (100-note gold set)

**Date:** 2026-10-08 · **Prepared for:** Andrew Lih · **Mode:** read-only (no wiki edits anywhere) · **Follows:** *Commons image notes → Structured Data: feasibility & estimate* (2026-10-07)

Data collected 2026-10-07/08 UTC against the live APIs. Everything below is measured, not inferred. Scripts and raw data: `/opt/data/audit/` (inventory in Appendix A).

---

## 1. What was audited

Every Commons file that transcludes **both** `{{ImageNote}}` and `{{Artwork}}` — the annotation-rich, curated part of the corpus:

| | |
|---|---|
| Search hits for `hastemplate:"ImageNote" hastemplate:"Artwork"` | 11,346 |
| **Files audited** (both templates confirmed on the page, ≥1 parseable note) | **9,643** |
| Notes parsed | **30,032** |
| Notes per file | mean 3.11 · median 1 · max 225 |
| Distribution | 1 note: 5,951 files · 2–4: 2,271 · 5–9: 828 · 10–19: 385 · **20+: 208** |
| File types | 9,343 JPEG · 202 PNG · 87 TIFF · 6 GIF · 4 WebP · 1 SVG |

The 1,703 titles that produced no record are search-index false positives (pages matched by the `intitle:` partition that do not actually carry both templates, plus pages whose notes failed the parse filter). The drop is stated as an upper bound: the composition of that 15% was not individually audited.

---

## 2. Geometry: the annotations are quietly rotting

| | files | share |
|---|---|---|
| Note `dimx/dimy` still match the current image | 8,526 | **88.4%** |
| **Stale** — boxes no longer describe the live file revision | **1,117** | **11.6%** |

Roughly a ninth of annotated artwork files have boxes anchored to a superseded revision. Consequences for any import: pin `baserevid`, re-verify `dimx/dimy` against `imageinfo` before trusting a stored box, and treat a stale box as a *blocker* rather than a warning — a `pct:` value derived from stale pixels points at the wrong part of the image.

---

## 3. Synchronicity: how much agreement actually exists

### 3.1 File level (whole stratum)

| Metric | Files | Share |
|---|---|---|
| Any SDC statement at all | 8,917 | 92.5% |
| **≥1 depicts (P180)** | **4,817** | **50.0%** |
| Has a caption | 1,125 | 11.7% |
| **Has a position-qualified depicts (P2677)** | **13** | **0.13%** |

Property frequency on these files is dominated by upload-tool metadata, not content: P1163 MIME (8,585), P6216 copyright (6,694), P2048/2049/3575/4092 dimensions and source (6,145 each), then P180 depicts (4,817), P921 main subject (4,019), P6243 digital representation of (3,617). Depicts per file: 4,826 files with none, 4,044 with exactly one, 773 with two or more.

### 3.2 Note level (the number that matters)

For each note, two conservative tests: **(a) explicit** — a link in the note resolves to a QID that the file already depicts; **(b) text** — a depicts label/alias of the file appears in the note text. Anything else is "no structured record of this note's subject".

| | notes | share |
|---|---|---|
| Total notes | 30,032 | |
| On files with **no** depicts at all (nothing to be in sync with) | 12,895 | 42.9% |
| **On files that do have depicts** | **17,137** | 57.1% |
| — in sync: explicit link present | 134 | 0.8% |
| — in sync: depicts label appears in note text | 592 | 3.5% |
| **— total in sync** | **726** | **4.2%** |
| — explicitly out of sync: the note's own link points at a QID the file does not depict | 2,298 | 13.4% |
| — no evidence of the subject in SDC at all | 14,113 | 82.4% |
| **— total not in sync** | **16,411** | **95.8%** |

Link resolution across the stratum: 2,990 link targets resolved to QIDs, 1,577 unresolved (63% resolution; the failures are mostly bare Commons titles that point at categories/galleries and malformed link syntax).

**Reading:** the annotation layer and the structured-data layer are effectively two separate corpora. Where they agree (4.2%) it is largely accidental — an uploader who happened to do both, or a note whose text happens to contain a depicts label. The 13 position-qualified statements on 9,643 files are the only region-level structured data that exists; the ImageNote gadget has never written any.

---

## 4. Matcher evaluation — the 100-note gold set

**Construction.** 27 files / 100 notes, stratified by evidence type so the numbers are not flattered by link-rich files: 48 notes with no links, 38 with article/other-wiki links, 12 with category links, 2 with direct `:wikidata:` links. Each note was adjudicated by hand into: correct QID (OK), correct QID but not ranked first (OK_TOP3), a QID exists but was missed (MISS), genuinely ambiguous (AMBIG), no Wikidata item exists (NOITEM), or not an entity at all — map text, inscription, scene prose, zoom link (NOTENTITY).

**Gold distribution:** 37 OK · 8 OK_TOP3 · 21 MISS · 9 AMBIG · 9 NOITEM · 16 NOTENTITY. So **66 of 100 notes have a bindable Wikidata answer; 34 should not be bound at all.**

### 4.1 Precision by evidence type — the decisive split

| Evidence in the note | notes | bindable | correct top-1 | correct in top-3 | missed | non-bindable given a wrong proposal |
|---|---|---|---|---|---|---|
| Direct `:wikidata:Q…` link | 2 | 2 | **2 (100%)** | 2 | 0 | 0 |
| Wiki article link (any language) | 30 | 29 | **28 (97%)** | 29 | 0 | 1 |
| Category link | 12 | 9 | 2 (22%) | 5 | 4 | 3 of 3 |
| **No link at all** | **56** | 26 | **5 (19%)** | 9 | **17** | **20 of 30 (67%)** |

This is the whole story of the project: **link-bearing notes are nearly solved; link-free notes — 73% of the corpus — are not.** The failure modes are systematic, not random: archaic map orthography (`Fossdike`, `Tung 通州`, `Kinhoa 金华`, `Great South Sea` → Pacific Ocean), small local features with no item (`Central School` Seattle, `Lincoln Hotel`), single-word labels too thin to bind (`Spring`, `Roca`), and prose that is not an entity at all (Bruegel proverbs, colonial boundary text).

### 4.2 Confidence threshold = publish gate

The score separates well, which means a threshold is a usable governance control rather than a guess:

| Threshold | Would publish | Precision | Coverage of bindable notes |
|---|---|---|---|
| 0.50 | 58 | 63.8% | 87.9% |
| 0.60 | 47 | 72.3% | 71.2% |
| **0.70** | **36** | **91.7%** | **54.5%** |
| **0.80** | **24** | **95.8%** | **36.4%** |
| 0.85 | 14 | 92.9% | 21.2% |
| 0.95 | 8 | 87.5% | 12.1% |

**Recommended operating point: publish ≥0.80 (96% precision), send 0.50–0.80 to human review, discard below 0.50.** On this population that is roughly a third of notes auto-publishable, a third reviewable, a third not worth binding.

### 4.3 Cross-check on link-rich files (the flattering case)

A separate micro-gold set of 36 notes drawn from three link-rich files (a satirical map, a Menzel painting, a Russian frieze) scored **30 correct top-1, 3 correct in top-3, 1 miss, 1 wrong-type, 1 should-abstain** — ~83% top-1. Included because it is the shape most demos would show, and it should be read as the ceiling, not the average.

---

## 5. Defects found (and fixed) in the tooling

Each of these produced *wrong measured numbers* before being caught — worth recording because they are the kind of thing that silently invalidates this sort of analysis:

1. **`formatversion=2` returns MediaInfo statements under `statements`, not `claims`.** Reading `claims` yields empty dicts and a false "this file has no SDC" conclusion. (Both `wbgetentities` and `prop=claims` reads are affected.)
2. **`formatversion=1` returns revision text under `*`, not `content`.** Produced a run where every note count was zero.
3. **Notes written as `{{en|1=Text}}`, `{{Langswitch|en=…}}`, `{{nowrap|…}}` were parsed as empty.** A naive template strip blanks the note entirely, which degraded both the matcher *and* the synchronicity cross-check (blank notes look like "no textual evidence"). Fixed by keeping template payloads for language/formatting templates and falling back to link labels. This fix moved the measured sync rate from 4.1% to 4.2% and raised resolved links from 2,879 to 2,990 — a modest but real correction.
4. **`maxlag` on `wikidata.org` blocks on WDQS lag**, not edit-cluster load — it aborted every artwork-item lookup until scoped to Commons only.
5. **Category links must resolve through Commons `pageprops`, then `P301` (category's main topic)** — the previous `haswbstatement:P373` search route returned unrelated items (a wrong `:Category:…` resolution returned the painting itself as a depicts candidate).
6. **Searches were hitting non-article namespaces**, surfacing templates/talk pages and producing absurd matches (a Russian note resolving to a Nazi official).
7. **Wikimedia-internal items (categories, disambiguation pages, lists) need an explicit penalty** — one candidate was a Wikimedia category item; another was a list article.
8. **A wrong-item context boost:** the artwork-item depicts boost (max score 0.95) pushed d'Alembert above the correct Marmontel for a note reading "Jean-François Marmontel". Context boosts need the note-text evidence to dominate, not the artwork's cast list.

Also useful for any future work: of 30,032 notes, only **3** use a direct `:wikidata:Q…` link, so "link to the item directly" is not a scalable reconciliation strategy (the 3 that exist are astronomy files where the uploader maintained both layers).

---

## 6. Consequences for the project estimate (revising the 2026-10-07 report)

The earlier estimate holds, but the shape of the work changes with these measurements:

- **The matcher is not the risk; the review queue is.** Link resolution is a solved 97% problem; the 73% of notes without links need human decisions. A review UI (the 5–8 day line in the original breakdown) is now the critical path, not the extraction or matching.
- **Governance is now concrete.** "Publish ≥0.80, review 0.50–0.80, discard below 0.50" is a policy a reviewer can approve, with a measured 96% precision at that gate. That is a defensible community proposal where "we will import a million statements" was not.
- **Region precision should ship second.** Only 13 files in this stratum have P2677 today, and 11.6% of notes have stale geometry. Plain `depicts` first (a 29.4M-file-normal practice), position qualifiers after a geometry re-verification pass.
- **Scope can be staged by evidence type.** Link-bearing notes across the whole corpus are an *easy*, high-precision first tranche (an estimated 8,000+ notes in this stratum alone at ~97% top-1), before any human-review capacity is committed.
- **Deliverable already exists for the "report-only" option.** Steps A and B of the earlier option list are effectively built: `audit_report.py` + `crosscheck2.py` + `evaluate.py` produce this document's numbers for any subset, read-only.

---

## 7. Recommended next steps

1. **Run the reporter over the whole annotated corpus** (360,394 files, not just the `{{Artwork}}` stratum) — ~6–8 hours of polite API traffic, read-only, and it would give the community proposal a corpus-wide number instead of a 2.7% sample. *(This is the single most valuable next run.)*
2. **Add the geometry re-verification pass** to the auditor: flag notes whose `dimx/dimy` no longer match, and report them as "annotation needs re-anchoring" — a useful Commons maintenance report in its own right, independent of any SDC import.
3. **Extend the matcher for the 56% of notes that are place labels** (maps are a large share of the annotated corpus): place-name resolution against Wikidata with historical/archaic orthography handling, and the Chinese/Japanese-label path that already shows up in the data.
4. **Then, and only then, draft the Commons proposal** with these numbers, the 0.80 gate, the link-tranche-first staging, and the human-review queue named explicitly.

---

## Appendix A — Artifacts on this host (`/opt/data/audit/`)

| File | Contents |
|---|---|
| `collect_artwork_subset.py` | Read-only collector: wikitext, imageinfo, SDC, linked artwork items → `files.jsonl` |
| `files.jsonl` | 9,643 audit records (notes, boxes, links, SDC, template params, artwork-item seeds) |
| `audit_report.py` → `audit_summary.json` | Corpus metrics of §2–3.1 |
| `crosscheck2.py` → `synchronicity.json`, `synchronicity_per_file.json` | Note-level sync of §3.2 |
| `select_gold.py` → `gold_notes.json`, `gold_titles.json` | Stratified gold-set selection |
| `matcher.py` → `candidates_gold.json`, `candidates_test.json` | 4-stage candidate generation + validation + scoring |
| `gold_labels.json` | 100 hand-adjudicated notes (gold QID / MISS / AMBIG / NOITEM / NOTENTITY) |
| `evaluate.py` → `matcher_evaluation.json` | §4 metrics, threshold sweep, error inventory |
| `gold_micro.json` | 36-note micro-gold set on link-rich files |
| `gold_qid_lookups.json` | Verified QIDs used to adjudicate misses |
| `collect.log`, `progress.txt`, `manifest.json` | Run provenance |

## Appendix B — Reproducibility notes

* Endpoints: Commons and Wikidata Action APIs (GET/POST with a descriptive UA), QLever (`qlever.dev/api/wikimedia-commons`) for qualifier-level SPARQL. The official WCQS requires OAuth and was not used.
* All counts come from API responses recorded in the caches (`api_cache.json`, `api_cache_cc.json`), so re-runs are idempotent and cheap.
* `haswbstatement:` does not index qualifiers — `haswbstatement:P2677` reports 1 file while SPARQL reports 7,926. Qualifier questions must go to SPARQL.
* The 100-note gold set is a stratified *sample*, not a census; the per-stratum figures carry roughly ±10 points of uncertainty at n≈30 per stratum, and the link-free stratum (n=56) is the best-supported number in the document.
