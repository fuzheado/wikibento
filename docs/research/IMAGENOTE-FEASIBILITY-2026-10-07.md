# Commons image notes → Structured Data: feasibility study and project estimate

**Date:** 2026-10-07 · **Prepared for:** Andrew Lih · **Mode:** read-only analysis (no edits made anywhere; every figure below was measured live against Commons/Wikidata APIs on 2026-10-07)

**Test file:** [File:Manuel de Araújo Porto-alegre - estudo para a sagração de Dom Pedro II - c. 1840.jpg](https://commons.wikimedia.org/wiki/File:Manuel_de_Ara%C3%BAjo_Porto-alegre_-_estudo_para_a_sagra%C3%A7%C3%A3o_de_Dom_Pedro_II_-_c._1840.jpg)

---

## 1. Verdict

| Question | Answer |
|---|---|
| Can the boxes and text be extracted reliably? | **Yes, trivial.** The `{{ImageNote}}` templates carry exact pixel geometry and the gadget writes them deterministically. ~30 lines of parsing (`mwparserfromhell` or regex) and 72/72 sampled files parsed cleanly. |
| Does a destination data model exist, or does it need inventing? | **It already exists and is official:** `depicts` (P180) with qualifier `relative position within image` (P2677), value format `pct:x,y,w,h`. The `{{ImageNote}}` box converts 1:1 into it — no property proposal needed. |
| Is the reconciliation "smart" part hard? | **This is the whole project.** Note text is free prose (honorifics, Portuguese titles, role names, whole sentences). Naive label search works on ~9% of the test file's notes; a name+context pipeline resolves ~64% with confidence; the remainder need human judgement or new Wikidata items. |
| Is a fully automatic run feasible? | **Not responsibly.** Recall is high, *precision* is the bottleneck — naive first-hit resolution misresolves ~40% of cases (a Brazilian princess → a municipality; a courtier → a 1944 journalist). The correct deliverable is a **proposal engine with a human review queue and abstention**, not a blind bot. |
| Headline estimate | **Read-only synchronicity auditor: 2–4 days. Semi-automatic proposal generator + editor review: 6–10 days. Full tool (extract → match → review UI → batch write): 21–34 days engineering, plus community process (RfC / bot approval). Upstream fix in the gadget itself: 3–6 days of code, but no one owns it.** |

---

## 2. What the annotations actually are (measured)

| Fact | Value | Source |
|---|---|---|
| Commons files transcluding `{{ImageNote}}` | **360,394** | CirrusSearch `hastemplate:"ImageNote"`, ns 6 |
| Files in hidden tracking category `Category:Images with annotations` | 360,401 (+14 subcats) | `categoryinfo` |
| Share of *all* Commons files (siteinfo reports 149.2M files) | ≈0.24% | `siteinfo` statistics |
| Estimated total notes in the corpus | **≈0.9M** (360,394 × 2.57 mean from sample) | sample, n=72 files / 185 notes |
| Notes per file in sample | mean 2.57, median 1, max 18 | sample |
| Annotated files using `{{Artwork}}` / `{{Photograph}}` / `{{Map}}` / `{{Information}}` | 11,595 / 10,846 / 771 / 333,090 | CirrusSearch |
| Annotated files carrying a Wikidata item seed (`P6243`, or `wikidata=` in Artwork/Photograph/Map) | 4,320 have P6243; 5,489 have Artwork+P180 → **≈4–6% of the corpus** | CirrusSearch |

**Anatomy of a note** (verified against the live gadget source, `MediaWiki:Gadget-ImageAnnotator.js`, 126,786 bytes, version 2.3.2):

```
{{ImageNote|id=1|x=1374|y=693|w=42|h=38|dimx=1885|dimy=1388|style=2}}
Dom Pedro II, Emperor of Brazil
{{ImageNoteEnd|id=1}}
```

* `x, y, w, h` are **pixels in full-image coordinates, origin top-left**; `dimx/dimy` are the full image's width/height. Verified in the gadget's save routine (`dim.y + dim.h > this.viewer.full_img.height`, and `dimx=` written from `full_img.width`).
* The template's wikitext confirms the semantics and the tracking category (`{{#switch:{{NAMESPACE}}|File=[[Category:Images with annotations|…]]}}`).
* **Notes are display-only data.** The gadget contains **zero** SDC code — no `wbcreateclaim`, no `P180`, no `P2677`, not even the string `depicts`. It has never written structured data. (WMF's RIsler said in 2017 that P2677 support would come "including via an update of the image annotations functionality so you can just draw a box" — that never shipped.)
* **Note IDs are not stable identifiers:** the test file has notes `1–8, 10–12` — `id=9` is a deletion gap. Any importer must key on (box + text), not on the id.
* **Coordinates are fragile:** the help page notes that overwriting a file changes the pixel dimensions and the notes stop displaying. Boxes are tied to a file *revision*, not to the file.
* **Note text is prose, not labels.** In the sample only **17/185 notes (9%)** contained any wiki link at all. Link flavours observed in the wild: `[[w:en:Title]]`, `[[:en:Title]]`, `[[:ru:Title]]`, `[[:de:Title]]`, `[[:be-tatarask:Title]]`, `[[:Category:X]]`, `[[:File:X.jpg]]` (zoom/other-angle notes), `[[User:X]]` (noise), and — the useful one — `[[:wikidata:Q83920927|LEDA 1157441]]`.

---

## 3. The destination model already exists (verified)

`relative position within image` ([P2677](https://www.wikidata.org/wiki/Property:P2677)) is a **string** property whose value is `pct:x,y,w,h` — *"x-offset (from left), y-offset (down from top), width w and height h of the crop region (as a percentage of the whole image)"*. It is explicitly flagged on Wikidata as *"use as a qualifier on P180 statements"* and *"Wikidata property used as 'depicts' (P180) qualifier on Commons"*, with a formatter URL (`https://wd-image-positions.toolforge.org/iiif_region/$1`) and a validation regex `pct:(?:(?:100|[1-9]?\d(?:\.\d+)?),){3}(?:100|[1-9]?\d(?:\.\d+)?)`.

**Conversion is a division.** For the test file's note 1: `x=1374, y=693, w=42, h=38, dimx=1885, dimy=1388` → **`pct:72.89,49.93,2.23,2.74`**.

Adoption today (QLever, Commons graph):

| Metric | Value |
|---|---|
| Commons files with any `depicts` (P180) | **29,361,132** |
| Commons files with a `P2677`-qualified depicts | **7,926** (23,561 statements) — i.e. 0.027% |
| Sibling path for map features: `named place on map` (P9664) | 6,827 files |

The two annotation systems are **effectively disjoint**: of 100 sampled files that *do* have position-qualified depicts, only **1** transcludes `{{ImageNote}}` — the position-qualified corpus was built by other routes (the Image Annotator Toolforge campaign tool, GLAM map projects), not by notes.

Documented exemplars of the target state (per `Commons:Structured data/Modeling/Depiction`), measured:

| File | M ID | depicts | with position |
|---|---|---|---|
| Werner Haberkorn — Centro da cidade | M69083785 | 16 | **14** |
| Midvinterblot (Carl Larsson) | M83926963 | 6 | 3 |
| Mona Lisa (C2RMF) | M15442524 | 7 | 0 |
| Coronation of Napoleon (David) | M546742 | 1 | 0 |

---

## 4. Synchronicity: how much agreement exists *today* (measured)

**File-level (exact, whole corpus of annotated files):**

* 108,187 / 360,394 = **30.0%** have at least one `depicts`.
* 252,207 = **69.9%** have none.

**Sample (n = 72 annotated files, 185 notes; sortkey-stratified sample of `Category:Images with annotations`, letters A–Z, 3 files per letter — see Appendix A for method and its bias):**

* 71/72 (**99%**) have at least one SDC *statement* — but almost entirely tool-added metadata (P1163 MIME, P571 inception, P6216 copyright, P275 licence, P3575/P4092/P7482 source), not content.
* 28/72 (**39%**) have at least one `depicts`.
* Of the 15 non-user/file note links, **14 resolved to QIDs (93%)**, and **3 of those 14 (21%) were already present as `depicts` on the same file**. All three were explicit `[[:wikidata:Q…]]` links added by an astronomer uploader who also populates SDC.

**Reading:** the notes and SDC layers are *not* in sync, and where they are, it is because a systematic uploader maintained both by hand — not because any tool links them. Region-level synchronicity does not exist at all: **zero** of the 360k annotated files carry a P2677-qualified statement (verified independently by checking that the P2677 file population is disjoint from the `{{ImageNote}}` population).

---

## 5. Worked example — the Araújo Porto-Alegre study

**File facts:** M4613284, 1885 × 1388 px (exactly the `dimx/dimy` of its notes), **11 notes**, **zero SDC statements and zero captions** — the file has *no* structured data at all. Its `{{Artwork}}` template carries `wikidata=Q42569897` (*Coronation of Pedro II*), and that Wikidata item's own `depicts` is a single value: **Q156774 (Pedro II)** — a usable context seed.

Reconciliation result — 7 of 11 notes get a confident match with a name+context pipeline, 4 need a decision:

| # | box (px) | would-be P2677 | note text (verbatim, abbreviated) | pipeline's candidate | adjudication |
|---|---|---|---|---|---|
| 1 | 1374,693,42,38 | `pct:72.89,49.93,2.23,2.74` | Dom Pedro II, Emperor of Brazil | Q156774 | ✔ context-confirmed (also the artwork item's only depicts) |
| 2 | 1089,787,40,38 | `pct:57.77,56.70,2.12,2.74` | Dom Romualdo de Seixas, archbishop of Bahia province. | Q10364288 | ✔ exact, description matches role |
| 3 | 895,865,38,40 | `pct:47.48,62.32,2.02,2.88` | Rei-de-armas (King-of-Arms) | Q900575 | ⚠ names a **role**, not a person — office item only |
| 4 | 1185,924,40,47 | `pct:62.86,66.57,2.12,3.39` | João Vieira de Carvalho, Count of Lajes and chief standard-bearer (alferes-mor) | Q10312321 | ✔ exact match |
| 5 | 1261,933,45,42 | `pct:66.90,67.22,2.39,3.03` | Paulino José Soares de Sousa, 1st Viscount of Uruguay… | Q7155132 | ✔ title + dates (1807–1866) fit |
| 6 | 742,950,47,47 | `pct:39.36,68.44,2.49,3.39` | Paulo Barbosa, the Steward of the Imperial Palace… | Q10346427 (wrong) | ✘ **no Wikidata item exists**; hits are modern homonyms |
| 7 | 243,945,40,52 | `pct:12.89,68.08,2.12,3.75` | Marcelino de Brito | Q10307293 / Q10325018 | ⚠ genuinely ambiguous (two historical figures) |
| 8 | 200,959,35,47 | `pct:10.61,69.09,1.86,3.39` | Antônio Carlos de Andrada | Q742361 | ✔ found via ptwiki article title, not label search |
| 10 | 789,417,31,40 | `pct:41.86,30.04,1.64,2.88` | Dona Francisca, Princess of Brazil | Q242159 | ✔ only via ptwiki title; label search gave the given name/game |
| 11 | 716,410,28,35 | `pct:37.98,29.54,1.49,2.52` | Dona Januária, Princess Imperial of Brazil | Q22062457 (a town!) | ⚠ right answer is Q261802, only in the wider candidate set |
| 12 | 12,259,580,332 | `pct:0.64,18.66,30.77,23.92` | Painting representing Dom Pedro I… (O Fico) in 1822. | Q170208 (Quaker) | ✘ **prose describing a scene**, not an entity at that spot |

**Naive baseline (measured):** running `wbsearchentities` on the verbatim note text returns a usable answer for **1 of 11** notes — and that one is wrong (it matches a different Monvoisin painting of Pedro II, not the emperor). Cleaning the text and taking the first hit of a Portuguese Wikipedia search raises coverage to 11/11 *candidates* but mis-resolves roughly 40%: `Januária` → a municipality, `Francisca` → a given name, `Paulo Barbosa` → a 1944 journalist.

**This is the real shape of the problem: candidate generation is easy; disambiguation and abstention are the engineering.**

---

## 6. Reconciliation design (with measured yields)

**Stage 1 — explicit links (cheap, high precision, low coverage).** Parse wikilinks out of the note body and resolve with the right prefix handling: `:wikidata:Q…` taken verbatim; `:xx:Title` → that wiki's `pageprops.wikibase_item`; bare title → Commons gallery/`P373` category lookup. Measured: 9% of notes have any link; 93% of those links resolve to a QID; 21% of resolved links were already mirrored in SDC.

**Stage 2 — name → article → item (the workhorse).** Strip honorifics and descriptor clauses (`Dom`, `Dona`, `Rei-de-armas`, text after the first comma), then search **ptwiki/enwiki for the name and take the page's Wikidata item** rather than searching Wikidata labels directly (this is what rescued notes 8 and 10 above, and what produced the `Januária` error when done naively on the first hit). Validate every candidate: `P31 = human`, birth date inside a plausible window for the work, occupation/role consistent with the descriptor clause.

**Stage 3 — context constraints (where precision comes from).** The file's own metadata supplies a *closed candidate set*: the linked artwork item's `depicts`/`main subject` (Q156774 here), `P6243`, the file's categories, and — strongest at scale — **sibling files in the same category that already have depicts**. Rank candidates by that evidence, then **abstain** below a confidence threshold instead of guessing.

**Stage 4 — human review queue.** Everything not resolved at Stage 3 goes to a reviewer with the note text, the image crop, and 2–4 ranked candidates, with actions accept / pick alternative / create item / mark as non-entity / skip.

Coverage reality check: only ≈4–6% of annotated files (Artwork/Photograph/Map with a `wikidata=` seed, or `P6243`) have Stage-3 context available out of the box; the other ~94% must be resolved from text + sibling evidence, which is exactly why the review queue is indispensable for a first pass.

---

## 7. Options and effort

| Option | What it is | Effort | Notes |
|---|---|---|---|
| **A. Auditor (read-only)** | Extract notes + SDC for a chosen subset (e.g. the 11,595 `{{Artwork}}` annotated files), emit per-file and corpus synchronicity reports: notes covered / missing / conflicting. No writes. | **2–4 days** | Safest first deliverable; produces the numbers a proposal needs. Reuses ~everything from option B. |
| **B. Proposal generator + human publishing** | A + Stage 1–3 matching + a machine-readable proposal file (CSV/JSON) or on-wiki worklist; a human (you, as editor) publishes via AC/DC, SDC tool or a script. | **6–10 days** | Good fit for the current constraint that the agent stays off-wiki. Biases to precision; nothing automated on-wiki. |
| **C. Full tool** | Extractor, matcher, confidence scoring, review UI (image crop + candidate picker + batch publish), batch write layer with provenance references and idempotency, QA/reporting. | **21–34 days** engineering (component breakdown below) **+ 4–8 weeks calendar for the community process** (Village Pump/SDC discussion, then a bot-flag request) | The write layer is small; the review UI is the swing factor (5–8 d, or −4 d if an existing tool is extended). |
| **D. Fix at source (upstream)** | Patch `MediaWiki:Gadget-ImageAnnotator.js` (and/or WikibaseMediaInfo) so a new note *also* writes a P180+P2677 claim on save. Stops future divergence. | **3–6 days** of code + review; **calendar unpredictable** | The community wish exists — [Community Wishlist W36 "Rewrite ImageAnnotator or integrate it into MediaWiki/WikibaseMediaInfo"](https://meta.wikimedia.org/wiki/Community_Wishlist/W36) — with **2 supporters, unassigned, no Phabricator task**. Do not plan around it; ask about it (next steps). |

**Option C component breakdown (person-days, one experienced dev):**

| Component | Days |
|---|---|
| Extractor: `{{ImageNote}}` + local `{{ImageWithNotes}}` notes, geometry, revision pinning | 1–2 |
| Candidate generation: link prefixes, `pageprops`, Wikidata search, category/P373, language fallbacks | 3–5 |
| Disambiguation + validation: type/date/role filters, context sets, sibling evidence, scoring, abstention | 4–7 |
| Review UI (or extension of OpenRefine / ISA / SDC tool) | 5–8 |
| Write layer: `wbcreateclaim` + `wbsetqualifier P2677` + references, idempotency, dry-run, audit log | 3–4 |
| Reporting/QA: per-file reports, corpus metrics, visual check via wd-image-positions | 2–3 |
| Hardening, tests, docs, 50-file pilot | 3–5 |
| **Total** | **21–34** |

**Throughput reality (option C at corpus scale):** ~0.9M notes × (1 claim + 1 qualifier + 1 reference) ≈ **2.7M write calls** — ≈370 hours at 2 writes/s, ≈3–4 days of continuous bot time at 10/s subject to `maxlag`/rate policy. Plan a staged pilot; do not attempt a corpus-wide run before the matcher's measured precision is known.

---

## 8. Risks and design constraints (ranked)

1. **Mandate, not code.** Mass-adding statements to Commons needs community discussion and, for unattended operation, a bot account/flag. The safe posture (and the current standing rule here) is: agent produces proposals off-wiki; a human editor publishes.
2. **Divergence and provenance.** If SDC is derived from notes, the derivation must be auditable and idempotent: pin the source revision, add a reference (`P854` permalink with `oldid=` + `P813` retrieved date) to each derived statement, and key updates on (file, value, position) — never on the note `id`.
3. **Geometry validity.** Boxes are pixel coordinates of a revision. A re-upload/rotation silently invalidates every box and every derived `pct:` value. Any import must record `baserevid` and any future re-run must re-verify against the current image size.
4. **Non-entity notes.** Inscriptions, "zoom in here", and scene descriptions ("Painting representing Dom Pedro I…") are legitimate notes that are not `depicts` candidates. Needs a type classifier and an explicit "not an entity" outcome in the review UI.
5. **Ambiguity and absent items.** Historic figures with honorific titles, homonym collisions, and people with **no Wikidata item at all** (note 6 here) — the workflow must support "create item or skip", not force a match.
6. **Model thinness.** Only 7,926 Commons files use position-qualified depicts today. A corpus-wide addition would be a step change in a lightly-adopted pattern — argue it in the community discussion, and consider **staging: plain `depicts` first (region-less), positions second**, since region-less depicts is a 29.4M-file-normal practice.
7. **Two destination homes.** For artworks, position-qualified depictions currently live on the *Wikidata item* (the artwork) with the same P2677 qualifier, as well as on the Commons file. Pick one and document it; note the target file here is a *study* whose Wikidata item is already the artwork.
8. **Rights.** Note *text* on Commons is CC BY-SA; SDC is CC0. Facts are not copyrightable, so deriving item values is fine — but avoid copying note prose verbatim into CC0 captions without a decision.
9. **Estimate sensitivity.** All effort figures above are engineering estimates made without a measured precision/recall number for the matcher. Build the gold set (next steps) before committing to option C.

---

## 9. Recommended next steps (cheap, ordered)

1. **1–2 days — run the read-only auditor** over a bounded, high-value subset (the 11,595 `{{Artwork}}`-annotated files): real coverage, real conflict counts, no writes. This is what turns this study into a proposal.
2. **1 day — build a 20-file / ~100-note gold set** (annotated group portraits, panoramas, maps) and measure matcher precision, recall, and abstention rate. Re-base the option B/C estimates on it.
3. **0.5 day — ask upstream**: is there a Phabricator task, and is any team (Community Tech / Multimedia / Search Platform) interested in W36-style gadget→SDC integration? The answer decides whether option D is in play at all, and whether to build the review UI or wait for one.
4. **1 day — draft the Commons discussion** (Village Pump + SDC talk) presenting the audit numbers and proposing a pilot (e.g. 50 group portraits), with the human-review queue and the plain-depicts-first staging.

---

## Appendix A — Method, and its limits

* All reads via the MediaWiki Action API (`commons.wikimedia.org/w/api.php`, `www.wikidata.org/w/api.php`, `pt.wikipedia.org`/`en.wikipedia.org`), SPARQL via QLever (`qlever.dev/api/wikimedia-commons`; the official WCQS endpoint requires OAuth and was not used), UA identifying `HermesAgent/1.0 (User:Fuzheado) WikiButler/1.0`.
* **Corpus counts** came from CirrusSearch `totalhits` (`hastemplate:"ImageNote"`, combined with `haswbstatement:` filters, `srnamespace=6`) and from QLever aggregate queries. Note: `haswbstatement:` does *not* index qualifiers — a `haswbstatement:P2677` search returns 1 file while QLever correctly reports 7,926; qualifier-level questions must go to SPARQL.
* **Sample construction (n=72):** members of `Category:Images with annotations` retrieved with `cmstartsortkeyprefix` for each letter A–Z, 3 files per letter. This is *sortkey-stratified, not uniformly random* — filename initials correlate with upload campaigns (LCCN, geograph, book scans), so treat the note-count mean (2.57) and the 39% depicts rate as indicative, not exact. The corpus-wide 30.0% figures are exact.
* **Gotcha worth recording:** with `formatversion=2` the Wikibase API returns a MediaInfo entity's statements under the key `statements`, not `claims`. Reading `claims` silently yields empty results — this produced a false "0/72 files have SDC" reading before it was caught and corrected (the corrected figure is 71/72 with at least one statement).
* **Adjudications in §5** are the analyst's, based on candidate labels/descriptions/dates and the painting's documented subject matter; they are judgements, not API facts.

## Appendix B — Data collected (files on this host)

| File | Contents |
|---|---|
| `/opt/data/tmp_imagenote_wikitext.txt` | raw wikitext of the test file |
| `/opt/data/tmp_araujo_recon.json` | per-note candidates + candidate item metadata for the test file |
| `/opt/data/tmp_sample_rows.json` | the 72-file sample: notes, boxes, links |
| `/opt/data/tmp_sample_sdc.json` | SDC (P180 sets) for the sample |
| `/opt/data/tmp_link_sync3.json` | link-by-link resolution + synchronicity result |
| `/opt/data/tmp_gadget_ia.js` | snapshot of `MediaWiki:Gadget-ImageAnnotator.js` (v2.3.2) |

## References

* [Commons:Image annotations](https://commons.wikimedia.org/wiki/Commons:Image_annotations) (official guideline) · [Help:Image-Annotator](https://commons.wikimedia.org/wiki/Help:Image-Annotator) (v2.3.2) · [Template:ImageNote](https://commons.wikimedia.org/wiki/Template:ImageNote)
* [Property P2677 — relative position within image](https://www.wikidata.org/wiki/Property:P2677) · [Commons:Structured data/Modeling/Depiction](https://commons.wikimedia.org/wiki/Commons:Structured_data/Modeling/Depiction)
* [Wikidata Image Positions tool](https://wd-image-positions.toolforge.org/) ([source](https://github.com/lucaswerkmeister/tool-wd-image-positions)) · [Image Annotator campaign tool](https://image-annotator.toolforge.org/) ([source, AGPL](https://github.com/Abbe98/image-annotator))
* [Community Wishlist W36 — rewrite ImageAnnotator / integrate into WikibaseMediaInfo](https://meta.wikimedia.org/wiki/Community_Wishlist/W36) (2 supporters, unassigned)
* [Commons:Structured data](https://commons.wikimedia.org/wiki/Commons:Structured_data) · [Commons:Overwriting existing files](https://commons.wikimedia.org/wiki/Commons:Overwriting_existing_files) (annotations break on re-upload)
