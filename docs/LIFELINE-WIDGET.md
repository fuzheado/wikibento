# Lifeline — timelines of lives, and comparing two of them (ISSUE-73)

**Status:** **v0 shipped** 2026-09-12 — a `timeline` renderer on the SPARQL widget, a `two-lives`
preset, and `?config=/parallel-lives-demo.json`. Everything below is measured, not assumed. v1+
(article prose, age alignment, context bands) is designed here but **not built**.

Try it: [`?config=/parallel-lives-demo.json`](https://wikibento.toolforge.org/?config=/parallel-lives-demo.json)

---

## The question

Can a WikiBento board show **the timeline of someone's life** — and, the motivating case, two lives on
one axis? Andrew's example: *"Anne Frank (1929–1945) and Martin Luther King Jr. (1929–1968) were both
born in 1929."* Two people, the same starting year, wildly different spans.

The intuition to test was that **Wikidata alone is not exhaustive**. It is not, and the gap is
interesting rather than embarrassing.

## What the two sources actually hold

Measured 2026-09-12 for the two motivating subjects (Anne Frank `Q4583`, Martin Luther King Jr. `Q8027`).

| | Anne Frank | Martin Luther King Jr. |
|---|---|---|
| **Usable Wikidata events** (birth, death, posts, awards, education, spouse, residence — with a death filter) | **7** (1929–1945) | **14** (1929–1968) |
| Wikidata events *without* the death filter | 8 (a 1955 prize, awarded ten years after she died) | 18 (honours dated 1977, 1978, 1984, 2004) |
| **Dated sentences in the article's life sections** | **66** (27% of sentences carry a year) | **139** (22%) |
| …of which posthumous/legacy/commemoration sections | 42 | 24 |
| …in the lead paragraph alone | 13 | 11 |
| Article size · distinct years mentioned | 8,890 words · 59 years | 17,174 words · 73 years |
| Claim count in Wikidata (all properties) | 358 claims | 407 claims |

Two things fall out of the raw claim counts: **most dated Wikidata statements are not life events**
(photograph dates on P18, citizenship changes on P27, identifier timestamps from 2020–2022), and
**prose holds roughly 5–10× more dated material**, because a biography narrates in dates.

### The finding worth keeping

**Wikidata dates what is recordable; prose holds what is narratable.**

- For **Anne Frank**, Wikidata gives a haunting arc — but only because `residence` (P551) happens to
  encode it: Frankfurt → Merwedeplein → *annex Prinsengracht 263* (1942) → *Bergen-Belsen* (1944) →
  died 1945. There is **no date for the diary, the arrest, or the transports** — the three facts
  every reader knows.
- For **MLK** it is a résumé: born, Morehouse 1944, Crozer 1948, Boston 1951, married 1953, then
  eight awards to 1964 and the Nobel. **No Montgomery bus boycott, no Birmingham, no March on
  Washington, no Selma** — the assassination appears only as `date of death`.

That asymmetry is the intellectual payoff of showing **two provenances side by side**: the widget can
print *"7 events in Wikidata · 66 dated statements in the article"* per lane, which makes structured
data's bias visible at a glance. That is the same "receipts" instinct as the rest of this project.

### A third source, if a context lane is wanted

enwiki **year articles** are a structured, citable world-context source: *"1942"* is 16,119 words
containing **675 dated event lines**, one per bullet, each anchorable by section. Noisy (military
minutiae), but the shape is exactly right for a background band.

## What v0 is (shipped)

| piece | where |
|---|---|
| `timeline` renderer — lanes on one shared axis | `src/lib/timeline.js` (all layout maths, 19 unit tests) + `TimelineCard` in `src/widgets/WidgetFrame.jsx` |
| auto-detection: dated rows with no numeric column become a timeline | `src/widgets/index.js` (transform) — anything with a numeric column keeps its old path (a date column + a count is still a trend chart) |
| manual override in ⚙ | renderer list gains "Timeline (dated rows, one lane per group)" |
| `two-lives` preset (the verified query) | `src/lib/sparqlPresets.js` |
| demo board | `public/parallel-lives-demo.json`, linked from the hub |

What it draws, all from the tested layout module:

- **One lane per distinct value** of the grouping column (a person, an institution, a language).
- A **life bar** from the lane's first to last documented event — its *length* is the argument.
- **The overlap band**: the window in which every lane is documented. For the preset it is
  18.9%–50.2% of the axis, i.e. **Anne Frank's entire documented life sits inside MLK's**.
- Dots for events, labelled where a label fits, with the full text in a tooltip.
- A summary line a reader can trust: `2 lanes · 21 events · 1920–1970`.

### Three decisions inside v0 worth recording

1. **The preset filters at the query, not the renderer.** `FILTER(?date <= ?died)` removes posthumous
   awards. Without it, a "life" timeline of MLK ends with honours from 2004. Both subjects are
   deceased, which is what makes this possible; a living subject needs a different rule (see risks).
2. **Integer years for captions, fractional years for geometry.** A band that ends at a February 1945
   death must not snap to the 1945 gridline — but captioned from the rounded fraction it would read
   *1946*. The module keeps both: `x1`/`x2` fractional, `from`/`to` whole years.
3. **Birth and death labels are never allowed to be dropped.** Four vertical label slots fill up in a
   dense cluster (MLK's 1963–66 awards); the allocator gives a lane's first and last event priority,
   because the two dates a reader looks for first are the ones a crowded timeline would hide.

## Design decisions deferred to v1+

- **Age alignment.** A second axis mode: align both lanes at birth (`0`) instead of at the calendar.
  Same data, different story — *"at 15, she was in hiding; at 15, he entered Morehouse College."* An ⚙
  toggle, exactly like the existing zero-based-Y switch on the trend charts.
- **Provenance marks.** A Wikidata dot vs a prose dot, so a viewer sees which facts the structured data
  holds and which exist only as text.
- **The prose lane.** Article prose → events, via the existing LiftWing relay (`/api/ask`, prompts not
  stored), with a **mechanical anti-hallucination gate**: the extractor must return
  `{date, precision, label, quote, revid}` and **the quote is verified as a verbatim substring of the
  cited revision** before the event is drawn. That turns "is the model making this up?" into a unit
  test — the same move as the `timeScope` constitution that already blocks deploys.
- **Pinned artifacts.** Generate `public/lifelines/<qid>.json` with a script (the
  `cim-allow-list.json` pattern), review it, store it on a wiki, and let a board load it. Deterministic,
  citable, kiosk-safe, and it never silently drifts when the article changes: *"extracted from revision
  X"*. Live extraction behind a user-initiated button, cached by `revid+model`.
- **Context bands.** WWII (1939–45) as a shaded region behind both lanes. Bands read better than lanes
  for overlapping eras.
- **Generalization.** Nothing in the renderer assumes a person: two institutions, a founder and their
  company, a delegate and their congress, an empire and its successor. "Two lives born the same year" is
  the hook; **overlapping lifespans** is the tool.

## Risks, ranked by how much they bite

1. **Legacy contamination — measured, severe, two-sided.** 42 (Anne) and 24 (MLK) dated sentences sit
   in posthumous sections, and Wikidata itself carries honours dated decades after death. A life timeline
   must stop at death; that is a *structural* exclusion (a section denylist plus the query filter), not
   a heuristic.
2. **Prose is an upper bound.** The 66/139 counts include ancestor dates ("moved to Atlanta in 1893"),
   era context, and the publication dates of *sources*. A subject-filtered extractor should yield ~20–40
   real events — the right size for a timeline, and a 3–6× reduction from the raw count.
3. **"Highlights" is an editorial act.** Where the article's own emphasis can be used (lead-paragraph
   events, section order, sentence position) it should be, and what was dropped should be counted. Label
   it *"selected events, with sources"*, never *"the timeline"*.
4. **Relative dates** ("the following year", "that spring") are where extraction errors concentrate. Mark
   them `dateBasis: anaphora` and either render them differently or drop them in v1.
5. **BLP.** For living people, only well-sourced dated facts, no inference, no death-adjacent
   speculation — the existing privacy rules and the ⚠️alpha precedent apply.
6. **Attribution.** Quoting article sentences is CC BY-SA; keep quotes short, link the `?oldid=`, and
   carry an attribution line like the rest of the project.
7. **The completeness illusion.** A timeline reads as authoritative. Event counts, per-lane source
   counts and honest gaps are the mitigation; a lane with four events should look sparse, not curated.

## Traps paid for while building v0 (all three were silent)

- **`.widget-body` centres its child.** A card that does not declare `width: 100%` is sized to its
  content — this one collapsed to **206px** and squeezed the entire axis into a strip. Every other card
  states the width for the same reason; the convention is not cosmetic.
- **Two coordinate spaces look almost right.** The dots lived inside a lane track (74% of the width) while
  the gridlines spanned the full plot, so 1968 drew nowhere near the 1970 line. One shared gutter
  (`--tl-gutter`) for both is the fix; percentages must resolve against one box.
- **Wrapped labels defeat slot arithmetic.** Three lines of text are ~40px tall whatever the slot spacing
  says, so labels overlapped *however* the slots were arranged. Single-line labels make the height a known
  constant and the packing predictable — truncation is safe because the tooltip holds the full text.

## Verifying it

```bash
npm test                                       # includes tests/timeline.test.mjs (19 tests) + docs-facts
npx vite build && npx vite preview --port 4173
# then open: http://localhost:4173/?config=/parallel-lives-demo.json
```

The unit tests pin the arithmetic that a screenshot cannot: tick spacing across spans of 1–900 years,
padded bounds on tick boundaries, percentage positions, the overlap window (including the integer-vs-
fractional caption rule), label slot packing and its collision guarantee, edge anchoring, undated rows,
and the single-event / single-date / same-day degenerate cases.

## Open questions for Andrew

1. **Age mode or calendar mode first?** Age alignment produces the "at 15, she was in hiding; at 15, he
   entered Morehouse" moment, which may be the strongest version of the demo.
2. **Is the Wikidata-only lane enough to ship publicly**, with prose as a v2? It tells the structured-data
   bias story honestly, and avoids the extraction risk entirely for now.
3. **Who are the next three pairs?** The feature generalizes past people (institution vs founder, two
   delegates, a person vs their era) — a couple of deliberate choices would prove it.
