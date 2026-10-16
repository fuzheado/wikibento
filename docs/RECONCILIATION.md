# Reconciliation — turning labels into targets, and where the labels come from

> **Status: scoping memo** (asked by Andrew, 2026-10-09). Nothing here is built. Filed as **ISSUE-143**.
> It answers three questions: can the server do OCR with CPU only; what should the *import labels from this image*
> feature look like; and what would a **general reconciliation service** — used by more than one widget — have to be.

## The ask, in one line

A board should be able to say *"these are the words in this picture"* and have each word become a zone (or any other
widget's target) pointing at the right page — with a human deciding, because the machine is guessing.

## 1. Can the server OCR with CPU only? Yes — measured, not assumed

I ran three engines over the same image (the hand-lettered biology diagram from `?config=/biosphere-demo.json`,
1800×1200, all labels scored by hand against the picture):

| engine | where it runs | accuracy on this image | wall / CPU | verdict |
|---|---|---|---|---|
| **Apple Vision** | macOS only (`~/.pi/agent/bin/ocr`) | **13 / 13 labels**, every one score 1.00 | 0.45 s, Neural Engine | best by far, and **cannot run on the server** |
| **RapidOCR** (ONNX, CPU) | anywhere, **no GPU** | **11 / 12 labels** (only `biosphere` → `6iosphere` — a hand-lettered `b` looks like a `6`) | **2.21 s wall / 5.14 s CPU** | **the answer to the question: CPU-only is enough** |
| **Tesseract** | anywhere, CPU, tiny | **2 / 13** (it read the two big words and nothing else) | ~1 s | fine for printed text, useless on this diagram |

So the honest shape of the problem: **the engine that reads stylised lettering needs a Neural Engine; the engine that
runs anywhere is good but not perfect; the cheap classic is blind to it.** Two consequences for the design, both already
baked into the rules — *propose, never bind* (11/12 means one wrong label, and `6iosphere` would have been sent to a
search) and *a URL is not a target*.

### Options for the server side, cheapest first

| option | how it deploys | cost to the project | accuracy |
|---|---|---|---|
| **A · nothing** (the manual path used today) | the operator runs the `local-ocr` skill and pastes the JSON | zero | best (Vision) |
| **B · `tesseract.js` in a relay route** | one npm dependency, WASM + language data (~10-15 MB) in the deploy, no root, no system packages | small | printed text only — measured 2/13 here |
| **C · ONNX models in a relay route** (RapidOCR-class, `onnxruntime-node`) | one npm dependency with a prebuilt binary, ~50-100 MB of models on disk | moderate | **11/12 here**, 2.2 s per image |
| **D · client-side WASM** | the models ship in `dist/` (~10-15 MB) and the reader's own CPU does the work | small server, heavier page | same as B/C depending on the model |

**Recommendation:** build the *feature* once (the review UI and the reconcile step — §2, §3) and make the OCR engine a
detail behind it. Start with **A + B**: the paste path (already proven) and `tesseract.js` for printed text, where it is
good; add **C** when a diagram like the biosphere one should work without the operator's Mac. **D** stays on the table
because it is free of server cost and matches this app's client-driven constitution — but it would add 10-15 MB to the
deploy, so it is a deliberate trade, not a default.

Measured caveat worth keeping: **the OCR text is not a label you can trust.** RapidOCR's `6iosphere` would have been
searched as written, found nothing, and ended as an unbound zone — which is the correct outcome, and the reason the
review step is not optional.

## 2. The import UI — review, with no silent binding

Today the flow is a person's: run OCR → paste coordinates → hand-write targets. The feature turns that into a panel and a
review — **the zone editor's shell (slice B of `docs/ZONES.md`), doing a different job.**

**Entry point:** the ⚙ panel's `zones` field gains a button beside its textarea — *Import labels from this image* — and
the field's hint says where the labels can come from (this image's own text; its Commons notes; a pasted OCR result).

**The review overlay** (full-screen, the same portal pattern as the zone editor and the panorama):

- the image at full size with **every proposed box drawn on it**, numbered, faint;
- a **list**, one row per proposal: the OCR text (editable — `6iosphere` is *right there* to fix), the candidate
  articles **with their descriptions**, the source and a confidence, and a row state: **✓ bound · ? needs a choice ·
  ⚠ ambiguous · · no target** (the four states the retired-id/wrong-target work already taught us to show);
- selecting a row highlights its box *and* vice versa, so a wrong box is as visible as a wrong word;
- **Accept all confident** as the one bulk action, with the count it will accept stated in the button; everything else is
  one click per row;
- **`no target` is first class** — a word with no article stays a zone that reveals its label and emits nothing;
- **Apply / Cancel**, working on a copy, exactly like the editor.

**Three ways in, one review:**

| source | what it gives | today |
|---|---|---|
| **the image's own text** (OCR) | the label *and* its box | the manual skill; §1 adds the server/client options |
| **the file's Commons notes** | the label, the box, often a wikilink | designed in `docs/ZONES.md` §Where the zones come from |
| **a pasted OCR result** (JSON/TSV from the `local-ocr` skill) | exactly what Vision produced | what built `?config=/biosphere-demo.json` |

All three end in the same review, and each zone records its **provenance** (`ocr` · `commons-note` · `depicts` · by hand)
so a later re-run can re-check rather than re-guess.

## 3. The reconciliation service — one resolver, many widgets

This is the part Andrew asked to keep general, and it deserves to be a module rather than a feature of the zones field:
**`src/lib/reconcile.js`** — `reconcile(query, { kinds, project, limit })` → ranked candidates, each
`{ ref, label, description, source, score }`.

**The sources, in the order a good resolver tries them** (the ladder from `docs/ZONES.md`, generalised):

| # | source | what it is good at | endpoint |
|---|---|---|---|
| 1 | **an exact reference, read back** | the author already named a page: `en:Cell (biology)` — verify it exists and take it | Action API `prop=pageprops`, `redirects=1` |
| 2 | **the wiki's own full-text search** | names *with their role words* — measured best in the Dom Pedro II case | `list=search` (`origin=*`) |
| 3 | **`wbsearchentities`** | labels and aliases, with descriptions; **blind to renamed entities** until an alias is added | `wikidata.org/w/api.php` (`origin=*`) |
| 4 | **the Wikidata reconciliation service** | the **standard** (OpenRefine protocol), ranked, type-filtered, descriptions included, batchable | `https://wikidata-reconciliation.wmcloud.org/en/api` — **verified 2026-10-09: CORS is open (`access-control-allow-origin: *`), so the browser may call it directly; no relay needed** |
| 5 | **Wikipedia title first, Wikidata second** | a page move is followed by `redirects=1` and the article's `pageprops.wikibase_item` gives the QID — Wikidata labels lag renames | `prop=pageprops&redirects=1` |
| 6 | **nothing** | below threshold is a valid answer | — |

**Why the reconciliation service earns its place** even though the app already searches: it is *the* protocol for
label→entity matching (OpenRefine, Flickypedia and others speak it), it returns candidates **with descriptions** — the
single thing that separates *biosphere* (Q42762, *global sum of all ecosystems*) from a *Norwegian musician* (Q616371) —
and it can be asked in batches, which matters when a diagram has thirteen labels or a board has two hundred. Trying it
costs one fetch and it is CORS-open, so it is the natural second opinion rather than a replacement for the wiki's own
search.

**Guardrails, taken from `wikidata-reconciliation` (verified there, worth repeating here):**

1. **A candidate is a hypothesis.** Nothing binds without a human accept, and the app never writes to a wiki in this flow.
2. **Below threshold → "needs human review"**, never a guess. It is always correct to say *unresolved*.
3. **Verify every accepted target the same session** (exists ✓ label matches ✓ kind plausible ✓) — the same read-back the
   board doctor does for references.
4. **Resolve through the article first** when a page exists (`redirects=1` follows renames), because Wikipedia titles move
   faster than Wikidata labels.

**Who else wants this resolver** — the reason it is a module:

| consumer | what it resolves today | what it would share |
|---|---|---|
| **zones** (this memo's feature) | hand-written references | the whole ladder + the review UI |
| **the page box / Finder** (ISSUE-68 slice 2) | a wiki page from free text | sources 2, 3, 5 |
| **board params** (`paramLookup.js` already validates free text against live data) | a category/template/file | the same calls, one implementation |
| **the Ask door** | a model's suggested targets, trusted as typed | source 1 as a **validator** (the skill's LLM-QID guardrail) |
| **the board doctor** | references are checked offline only | a *network* mode that verifies targets exist (opt-in) |
| **`depicts`/SDC import** | not built | source 5, to go from a note's label to a QID |

## 4. Phasing, and what each phase costs

| phase | what ships | estimate |
|---|---|---|
| **0 · the resolver, headless** | `src/lib/reconcile.js` with sources 1-3 + 5, unit-tested against recorded answers; no UI | ~1 day |
| **1 · the review UI** | the ⚙ button, the overlay, the four row states, accept-all-confident, provenance, Apply/Cancel — fed by *pasted* OCR JSON and by Commons notes (the **safe** path, no server work) | ~1.5 days |
| **2 · OCR in the app** | option B (`tesseract.js` in a relay route, bounded like the other routes) and/or **D** (client-side WASM); the same review consumes it | ~1 day (B) |
| **3 · the standard protocol** | source 4 wired in as a second opinion, with descriptions shown and batching for big label sets | ~0.5 day |
| **4 · the other consumers** | the page box, params and the Ask door move onto the resolver, one at a time, with their own gates | ~0.5 day each |

Phase 0 + 1 deliver the *feature* — an image's labels becoming reviewed zones — without touching the server, and they are
also the two phases whose value does not depend on which OCR engine wins.

## 5. Open questions for Andrew

1. **Where should OCR run** — the server (B: cheap, printed text only; C: ONNX, good on diagrams, ~100 MB of models), the
   reader's browser (D: free of server cost, +10-15 MB in the deploy), or the operator's Mac (A: best accuracy, manual)?
   I would ship A + B, then take C when a diagram must work without you.
2. **How confident is "confident"?** *Accept all confident* needs a threshold, and it should be a number the app can
   justify (the resolver's score plus the description matching the kinds asked for) rather than a feeling.
3. **Should the review be able to write back to Commons** — e.g. turning accepted zones into `depicts` statements with
   `P2677` positions? That is the same information in the other direction, and it is a *writing* flow, so it needs its own
   decision.
4. **Does the reconciliation service belong in the board guide** for the Ask door (so a model can resolve its own
   targets before handing a board over), or is that the app's job alone?

## What this memo deliberately does not do

It does not choose an OCR engine for you, does not design the writing-back-to-Commons flow, and does not touch the
persistence story for a *reconciled* target (a QID beside a title — designed in `docs/ZONES.md` as provenance, not built).

## What the corpora actually contain — and the calibration the ladder needs (measured 2026-10-09)

The ladder above says *where* to look. This says *how much is there*, because that decides which rung does the work. Every
number below was measured here, live, on 2026-10-09, and each row names its own query so it can be re-run. **Counts of this
size move between runs** — `{{ImageNote}}` transclusions differed by ~2,900 between two runs on the same day, and a
position-qualified `depicts` count by 13 files in a few hours — which is why they are stated as measured on a date and
never as constants.

| source | how to count it | measured 2026-10-09 |
|---|---|---|
| files transcluding `{{ImageNote}}` | `list=search&srnamespace=6&srsearch=hastemplate:"ImageNote"` → `searchinfo.totalhits` | **361,163** files |
| …the `{{Artwork}}` stratum | the same, plus `hastemplate:"Artwork"` | **11,620** files |
| files with an `<imagemap>` | `insource:"<imagemap>"` — ns 6 / all namespaces | **1,043** files / **2,138** pages |
| files with any `depicts` (P180) | `haswbstatement:P180`, ns 6 | **29,494,043** files |
| files with a **position-qualified** depicts (P2677) | SPARQL on QLever's Commons graph: `?f p:P180 ?st . ?st pq:P2677 ?pos` | **7,939** files / **23,593** regions |
| …the same question asked of search | `haswbstatement:P2677`, ns 6 | **1** file — and it carries no P2677 when read back |

Three conclusions that shape the design:

1. **The structured layer is three orders of magnitude thinner than the annotation layer.** 361,163 files carry a note;
   7,939 carry a machine-readable region. The *import* rung is a small door and the **suggestion** rung is the main path,
   so "no target" is the normal outcome of an import rather than a failure.
2. **Never ask search whether a qualifier exists.** `haswbstatement:P2677` reports **1** where SPARQL finds **7,939**.
   Qualified claims come from SPARQL (`wikimedia-commons-sparql`), never from CirrusSearch.
3. **`<imagemap>` is the one on-wiki source carrying a box *and* a real click target** (`rect 0 0 1267 1250 [[:Image:…]]`)
   — only 1,043 files, and worth its own rung for exactly that reason.

### The calibration (an external gold-set audit)

Snapping a label to a target was audited against a **100-note gold set over a 9,643-file corpus** (an external corpus audit
prepared for this project, 2026-10-08). Its headline figures are re-stated here with provenance, and the two this repo
could check independently — the corpora above, and a fixture's dimensions and `sha1` — were verified rather than copied:

| measure | value |
|---|---|
| notes whose label agrees with the file's own structured data | **4.2 %** |
| annotated files whose boxes are anchored to a superseded revision | **11.6 %** (1,117 of 9,643) |
| precision by evidence type | a **link** in the label **97–100 %** · a **category** **22 %** · **no link at all** **19 %** |

The review gate follows from those numbers and is calibrated, not asserted: **≥0.80 confidence auto-accept · 0.50–0.80
needs review · <0.50 discard**. A label containing a link is nearly always right; a bare prose label is a coin toss —
which is why the ladder's last resort proposes a candidate *with its description* and lets a person decide, and why
nothing is ever bound silently.

### The matcher, as designed and measured

The two reports this section summarises are archived verbatim:
[IMAGENOTE-FEASIBILITY-2026-10-07.md](research/IMAGENOTE-FEASIBILITY-2026-10-07.md) (the design and the estimate) and
[IMAGENOTE-AUDIT-2026-10-08.md](research/IMAGENOTE-AUDIT-2026-10-08.md) (the corpus audit and the gold-set evaluation).
Their scripts and raw data live on the host that produced them (`/opt/data/audit/` — not this machine), so the numbers
here are the record, and the queries in this document are how to re-derive them. The four stages, with the yields those
reports measured — **this is the design to follow, not a plan to re-derive**:

| stage | what it does | measured |
|---|---|---|
| 1 · explicit links | parse the note's wikilinks — `:wikidata:Q…` verbatim, `:xx:Title` → that wiki's `pageprops.wikibase_item`, a bare title → Commons gallery / `P373` | only **9 % of notes** carry any link, but **93 % of those resolve**, and 21 % of the resolved ones were already mirrored in SDC |
| 2 · name → article → item | strip honorifics and descriptor clauses (`Dom`, `Dona`, text after the first comma), then search **that wiki** — not Wikidata labels — and take the page's item; validate `P31 = human`, dates in a plausible window, role consistent with the clause | this is what rescues the cases label search fails: `Dona Francisca` → a *given name*, `Januária` → a *municipality* |
| 3 · context constraints | the file's own metadata as a **closed candidate set**: the linked artwork item's `depicts`/main subject, `P6243`, the file's categories, and **sibling files in the same category that already have `depicts`** — then rank by that evidence and **abstain** below the gate | only ≈4–6 % of annotated files carry a Wikidata seed, so text plus sibling evidence carries ~94 % of the work |
| 4 · human review | note text, the image crop, 2–4 ranked candidates, and actions *accept · alternative · create item · not an entity · skip* | **the critical path.** The audit's own revision of the estimate: the matcher is not the risk, the review queue is |

**Naive resolution, measured so it is not attempted twice:** `wbsearchentities` on the verbatim note text produced a usable
answer for **1 of 11** notes — and that one was wrong (a different painting of the same emperor). Cleaning the text and
taking the first hit of a wiki search raised *coverage* to 11/11 while mis-resolving roughly **40 %**.

### The threshold, calibrated

| threshold | would publish | precision | coverage of bindable notes |
|---|---|---|---|
| 0.50 | 58 | 63.8 % | 87.9 % |
| 0.70 | 36 | 91.7 % | 54.5 % |
| **0.80** | **24** | **95.8 %** | 36.4 % |
| 0.85 | 14 | 92.9 % | 21.2 % |

→ **publish ≥0.80 · review 0.50–0.80 · discard <0.50** — on this population roughly a third auto-publishable, a third
reviewable, a third not worth binding. The gold set was 27 files / **100 notes**, stratified by evidence type (48 with no
link, 38 with an article link, 12 category links, 2 `:wikidata:` links) and adjudicated by hand: **66 bindable, 34 that
should not be bound at all** (9 genuinely ambiguous, 9 with no Wikidata item, 16 not entities — inscriptions, "zoom here",
scene prose). A separate link-rich micro-gold set scored **83 % top-1**: that is the ceiling a demo would show, not the
average. Per-stratum figures carry roughly ±10 points at n≈30, and the link-free stratum (n=56) is the best-supported
number in the audit.

### What that means for the phases

- **Stage the work by evidence type.** Link-bearing notes across the corpus are an easy, high-precision first tranche
  (~8,000+ in the `{{Artwork}}` stratum alone at ~97 % top-1), before any human-review capacity is committed.
- **Plain `depicts` first, positions second.** Position-qualified depicts exists on **7,926** Commons files; plain
  `depicts` is a 29.4-million-file norm. Importing regions before the pattern is broadly adopted is a step change in a
  lightly-used model — and 11.6 % of the annotated files have stale geometry to re-verify first.
- **Provenance is part of the data.** Each derived statement pins the source revision (`baserevid`) and carries a
  reference (permalink with `oldid=`, plus a retrieved date), and updates key on *(file, value, position)* — **never on the
  note `id`**, which is not stable (a real file's notes run 1–8 and 10–12; `id=9` is a deletion gap).
- **The write is the small half.** ~0.9 M notes × (claim + qualifier + reference) ≈ 2.7 M write calls, ≈370 hours at
  2 writes/s — while the review UI is 5–8 of the 21–34 person-days the full tool is estimated at, and the community
  process behind it is 4–8 weeks of calendar. Ask about the upstream gadget fix
  ([Wishlist W36](https://meta.wikimedia.org/wiki/Community_Wishlist/W36), 2 supporters, unassigned) before assuming it.
