# Tool Landscape — Synthesis for WikiBento

*Written 2026-08-16. Distills two research documents into actionable guidance for
WikiBento: **TOOL-LANDSCAPE.md** (a survey of ~40 dashboards, galleries, curation,
and dataflow tools — including the dead, whose failure modes are instructive) and
**TOOLFLOW-ANALYSIS.md** (an assessment of Magnus Manske's ToolFlow, the
server-side orchestration prior art). Both were prepared 2026-08-15; the
originals live outside this repo. This document is the repo-side record of their
findings and the decisions they inform.*

*Companion to [PHILOSOPHY.md](PHILOSOPHY.md) (the HyperCard lineage thesis),
[PARADIGMS.md](PARADIGMS.md) (presentation paradigms + mortality),
[MODULARITY-AND-DATAFLOW.md](MODULARITY-AND-DATAFLOW.md) (architecture assessment),
[WIDGET-IDEAS.md](WIDGET-IDEAS.md), and [ROADMAP.md](ROADMAP.md).*

---

## TL;DR

1. **The direction is confirmed, from an independent tool set.** The survey's
   meta-lesson — tools die of their *housing* (platform lock-in, acqui-hire,
   licensing, no business model, bus factor), never of their idea; survivors are
   **open source + a sharp niche** — is PARADIGMS §6 in different words. The
   Wikimedia-curation niche is the moat: no horizontal tool can take it.
2. **The architecture is confirmed.** Freeboard (MIT, dormant ~2017) was
   architecturally identical to WikiBento — 100% client-side, JSON dashboards,
   plugin directory, CORS-proxy escalation (their `thingproxy` = our `/api/proxy`,
   13 years earlier). It stalled from single-maintainer burn, not design.
3. **The list-source idea is confirmed.** ToolFlow's adapter nodes (PetScan,
   PagePile, Quarry, SPARQL) are exactly the "list source" inputs already sketched
   in WIDGET-IDEAS — Manske built the server-side version.
4. **The highest-value unbuilt piece is cross-widget dataflow.** Both documents
   converge on it from opposite ends: ToolFlow proves the server-side orchestration
   exists and is *complementary*, not competitive; the survey shows the minimal
   client-side design (named outputs + `dependsOn` + dependent-only recompute).
   MODULARITY-AND-DATAFLOW.md stages the path (variables → declarative wiring →
   visual DAG) and draws the line: **no Airflow/Dagster; no backend.**
5. **OpenDoc (1993–97) is the missing precedent between HyperCard and the web** —
   Apple/IBM/WordPerfect's compound-document framework whose **parts** are
   functionally our widgets, whose "no main application, only the document" model
   is the Bento thesis, and whose PartBank component warehouse anticipated the
   registry recommendation by twenty years. It died of the 1997 platform kill, not
   of design — see §4.
5. **Concrete new widgets fall out of the research:** `urlEmbed` (oEmbed),
   Category Tree + SPARQL sunburst/treemap modes, masonry + license surfacing for
   galleries, and ToolFlow-style operation widgets (Filter/Join) fed by list
   sources.

---

## 1. The four lineages surveyed

| Lineage | Exemplars | Verdict for us |
|---|---|---|
| **Widget & business dashboards** | iGoogle, Netvibes, Pageflakes, Grafana, Kibana, Geckoboard, Freeboard, Dashing | The canonical `data-source → panel → query` model — our `fetch → transform → renderer` already maps onto it. **Grafana is the model to imitate** (plugin ecosystem, dashboards as JSON); iGoogle/Pageflakes show the proprietary-host death |
| **Gallery & moodboards** | Pinterest, Are.na, Padlet, Raindrop, Polyvore, Muxtape, Pocket | **Thrived** (Pinterest 553M MAU). Best data model: Are.na's blocks + first-class connections. Licensing kills curation tools (Muxtape/RIAA) — Commons **pre-cleared licensing is a structural advantage** |
| **Narrative & curation** | Storify, Scoop.it, Flipboard | Storify validated "drag → annotate → linear timeline → embed" and died of acqui-hire + native-embed commoditization. Narrative should be a **distinct product surface**, not muddled into wiring |
| **Mashup & dataflow** | Yahoo Pipes, IFTTT, Zapier, Node-RED, Observable | Pipes (the ancestor of visual wiring) died of neglect; Node-RED survived via open source + IoT niche. **Observable's reactive named cells are the only clean client-side dataflow model** |

| **Component documents** | OpenDoc (1993–97), Cyberdog, OLE/COM (the rival), KParts (descendant) | **Parts = widgets, validated by history's only parts-based office/web suite**; the document (not the app) is the product — the Bento thesis. Died of the 1997 platform kill, not design — deep dive in §4 |

Five precedents worth deep study: **Freeboard** (architecture), **Are.na** (data
model), **Observable** (reactivity), **oEmbed** (the frame-any-URL standard),
**Yahoo Pipes + Storify** (the two dead validations).

---

## 2. Freeboard — the architecturally identical predecessor

MIT-licensed, 100% client-side, JSON-defined dashboards, `plugins/` directory,
datasource + widget plugin types. Stalled ~2017. Four lessons:

1. **The datasource/widget split is a cleaner decoupling than our merged
   `fetch → transform → renderer`.** The same datasource feeds many widgets and
   vice versa (M:N). Our `getRenderer(config)` is a partial step — pageviews
   should be able to render as stat/table/bar without new widget types. (Also
   the argument of MODULARITY-AND-DATAFLOW §Part 1: split renderers into
   per-widget files.)
2. **Runtime plugin registration** — `loadWidgetPlugin(plugin)` has worked since
   2013; it's the `registerWidget()` API sketched in MODULARITY-AND-DATAFLOW
   Appendix A.
3. **A self-contained datasource lifecycle + CORS fallback escalation**
   (JSON → JSONP → hosted proxy) — the exact analogue of our `/api/proxy`.
4. **Edit/view mode** — `setEditing(bool)`; our kiosk/lean modes (ISSUE-18)
   arrived at the same idea independently.

---

## 3. ToolFlow — the server-side orchestration proof

Magnus Manske's Toolforge tool: workflows = node graphs chaining **adapters**
(PetScan, PagePile, Quarry, SPARQL) → **operations** (join/filter) →
**generators** (wiki-page edits), with a scheduler. Source code still available
(web part GPL-3.0; `toolflow_rs` Rust part **unlicensed** — read, don't lift).

Why it matters:

1. **Validates the list-source direction** — adapter nodes are exactly the
   sketched inputs in WIDGET-IDEAS §List Sources.
2. **Proves the architectural boundary** — orchestration required a Rust service
   + PHP API + scheduler for durability and wiki-edit auth. That is the
   "different class of app" line we must not cross while client-side.
3. **The `adapter → operation → generator` taxonomy names our natural
   extensions** — today we have only adapters (fetch-and-render); a future
   Filter/Join/Output widget family is the vocabulary for them.
4. **The JSONL standardized format generalizes our `transform` contract** — if
   cross-widget dataflow ships, the normalized output form should be *explicit
   and shared*, not private per widget.
5. **The output-mapping UX** (auto-suggest a field mapping, manual override) is
   the proven pattern for "how does a widget know which field is 'the list'."
6. **Scheduler + WikiPage generator = "bot automation without writing a bot"** —
   the modern Faebot/GLAM-dashboard pattern, relevant to GLAM reporting.

**Strategic take:** complementary, not competitive. ToolFlow = "run it and let it
write the page"; WikiBento = "look at and explore this." The bridge is the shared
list sources and, eventually, a widget that consumes a ToolFlow workflow's output.

---

## 4. OpenDoc & Cyberdog — the component-document precedent (1993–1997)

*Added 2026-08-16 at the suggestion of the project owner: OpenDoc is the missing
link between HyperCard's cards and the web — history's only mass attempt at a
parts-based office/web suite. Sources: [Wikipedia](https://en.wikipedia.org/wiki/OpenDoc),
the archived [OpenDoc Components catalog](https://web.archive.org/web/19970413045906/http://opendoc.apple.com/odcomponents.html)
(April 1997), and contemporary reporting (WIRED 1997-03, MacTech 1997-03).*

### What it was

OpenDoc (announced 1993 by Apple with IBM and WordPerfect; shipped 1995–97) was a
compound-document framework: instead of applications owning documents, a
document was a **container of parts** — self-contained components (a word
processor part, a spreadsheet part, a chart part, a 3D part, a spelling
checker) — each rendered and edited **in place** by its own **part editor**.
"No main application, only the document." Technically it ran on IBM's
SOM/DSOM object model (CORBA-based, cross-language, distributed), was adopted
by the OMG in 1996, and was widely conceded — even by Microsoft's partners —
to be technically superior to Microsoft's rival OLE/COM, which it was built
to oppose. **Cyberdog** (shipped May 1996) was Apple's internet suite — a
browser, mail, and news reader — assembled entirely from OpenDoc parts; the
only web browser ever built on a component architecture.

The ecosystem artifacts are the eerily familiar part: Apple's own 1995
document predicted "on-line component warehouses" for distributing parts;
**PartBank** (by Kantara) shipped as a searchable "one stop shop" database of
OpenDoc components; **Component 100 / C100** was a community of component
developers; the catalog shows the parts market (Digital Harbor's WAV
"work processor", Nisus Writer, BBEdit Lite, Adrenaline Numbers & Charts,
SoftLinc's LEXI spelling/thesaurus part, Corda's C-Graph/C-Table/C-TextBox
Live Objects, SimCalc's math-education parts, theta group's LiveAccess
database front-ends). IBM shipped Person Pak and Table Pak parts for OS/2.

### The mapping — parts are widgets

| OpenDoc | WikiBento |
|---|---|
| **Part** (self-contained component) | **Widget** — the same unit of content + behavior + config; the user's point exactly |
| **Part editor** (in-place WYSIWYG editing) | Renderer + ⚙ config panel — in-place configuration without leaving the board |
| **Compound document** (document-centered, no main app) | **Bento** — board-centered; the grid is a container, not an application |
| **Container apps** (Dock'Em, WAV) | The Bento grid + kiosk/lean presentation modes |
| **SOM/DSOM interface contract** | Registry contract: the constitutions + `validateDashboard()` today, `assertContract()` per MODULARITY-AND-DATAFLOW Appendix A |
| **PartBank / C100 component warehouses** | The third-party widget registry recommendation (§5 D.10) — anticipated in 1996 |
| **Live Objects** (Corda, LiveAccess) | Live data-connector widgets — our fetchers with auto-refresh |
| **Cyberdog** (parts-based app suite) | The cautionary tale: do not build "apps" on the widget substrate (§5 C.9) |

### Lessons for WikiBento

1. **The document-centered model is the Bento thesis, validated.** OpenDoc's
   "no main application, only the document" is exactly "the board is the
   product, not the app" — and it was a deliberate, widely praised design
   choice. The grid must stay a container; the composition is the product.
2. **The contract makes the market.** OpenDoc parts interoperated through a
   formal cross-vendor object contract (SOM/CORBA), and that contract is what
   made a parts *market* possible (PartBank, C100). Our constitutions and
   `validateDashboard()` are the seed of the same thing; MODULARITY-AND-
   DATAFLOW's `assertContract()` (registration-time conformance) is the
   grown-up version. A third-party widget ecosystem requires enforced
   interface contracts, not advisory conventions.
3. **The standards trap.** OpenDoc was technically superior (rivals conceded
   it), cross-platform (Mac, OS/2, Windows planned), and OMG-adopted — and
   lost to OLE because Microsoft owned the dominant platform and bundled.
   **Distribution beat design.** The counter-lesson for us: our "contract"
   substrate (JSON + HTTP + the browser) is owned by no one, and our
   "bundling" is the URL + on-wiki hosting + Toolforge. Never let the widget
   contract depend on a proprietary runtime or a single vendor's platform.
4. **The platform kill, again.** Apple discontinued OpenDoc in March 1997;
   Jobs at WWDC 1997 called it "dead" and said he favored "putting a bullet in
   the head of OpenDoc." Cyberdog was collateral damage. This is PARADIGMS §6's
   "the platform kills" pattern applied to a component framework — and the
   same 1997 streamlining that killed HyperCard's momentum. A proprietary
   runtime is always one corporate decision from death.
5. **Parts survive their housing.** OpenDoc's physics-education parts were
   rewritten as Java applets/JavaBeans after the kill (notably E-Slate); the
   parts idea resurfaced as KParts (KDE) and eventually web components. Same
   story as mTropolis → the paradigm outlives the platform — which is the
   argument for keeping our parts on an open substrate.
6. **Even a parts-built app suite died.** Cyberdog shows that building whole
   applications (browser, mail, news) on a component base does not save the
   base — and that the component model is a *composition* tool, not an *app*
   framework. We stay a composition layer; orchestration and "apps" remain
   the line we do not cross (ToolFlow §3, MODULARITY-AND-DATAFLOW §Part 2).
7. **In-place editing was the killer feature.** OpenDoc's promise was WYSIWYG
   in-place part editing — never leave the document to edit what's in it.
   Our ⚙ config panel is the same instinct; lean/kiosk modes are the
   edit/view split done cleanly (Freeboard lesson 4). The more a widget can be
   *edited* in place — config, pasted lists, SPARQL queries — the closer we
   are to the OpenDoc dream.
8. **The ecosystem must be seeded.** "Few components were released compared to
   ActiveX" was the autopsy line; even a great framework stalls without a
   parts market. Starter packs, shared on-wiki Bentos, and (eventually) a
   registry are our ecosystem seeding — the 1996 PartBank previews the play.

## 5. What this means for WikiBento — recommendations

### A. Widgets worth adding (Tier 1 — cheap, additive)

1. **`urlEmbed` widget (oEmbed)** — a provider table (`oEmbed endpoint → widget
   type`) + OpenGraph/metadata fallback → a generic "link card" for any URL.
   oEmbed `type` maps onto existing renderers: `photo` → image card, `video`/
   `rich` → iframe (the `wikiPage` pattern, sandbox question already answered),
   `link` → link card. **Replaces the Arbitrary URL Extractor scraping idea**
   (ROADMAP Phase 1) at roughly half the effort and far more robustly. Build on
   the standard, not the broker (the embed.ly lesson). For *Wikimedia* content,
   the Action/REST APIs remain richer — oEmbed is the universal fallback, not
   the primary path.
2. **Category Tree widget + SPARQL hierarchical renderers** — extend the SPARQL
   auto-renderer (`stat/bar/line/table`) with `sunburst`/`treemap` modes
   (d3-hierarchy over Wikidata P279/P361 or Commons category trees), plus a
   dedicated Category Tree widget for non-SPARQL users. "SPARQL → hierarchical
   result → sunburst" is a killer power-widget story; the map + force-graph
   renderers already sit in Phase 2 (ROADMAP). Chart widgets are the concrete
   case for splitting renderers into per-widget files first
   (MODULARITY-AND-DATAFLOW §Part 1).
3. **Masonry gallery option** — Pinterest/Raindrop's aspect-ratio-preserving
   masonry is the native gallery feel; our gallery family (grid/list) should add
   it as a mode, with lazy-load + metadata deferred to hover/click.
4. **Surface license/attribution in galleries** — legally required for
   downstream reuse and a trust signal ad-funded tools cannot offer (the Muxtape
   lesson inverted: Commons pre-cleared licensing is structural).

### B. Data-model improvements (Tier 2)

5. **Datasource/widget split** (Freeboard lesson 1) — decouple *data source*
   from *visualization* so one datasource renders in many forms. The SPARQL
   renderer override is the production proof of the pattern.
6. **Are.na's connection model** — first-class per-channel metadata so the same
   Commons file can appear in a category gallery and an article gallery
   *annotated differently, without duplication*. Our galleries are the natural
   first consumers.

### C. The dataflow path (Tier 3 — the HyperTalk completion)

7. **Named widget outputs + `dependsOn` + dependent-only recompute** — the
   Observable/marimo model; the "single transferable idea" of the notebook
   analysis. We already have the hard parts (declarative registry, JSON
   serialization); we are missing named outputs and the edges. This is
   PHILOSOPHY §7 gap #2 (the widget-action layer) made concrete, and the exact
   Phase 3 vision. **Follow MODULARITY-AND-DATAFLOW's staged path:**
   Level 1 dashboard variables (config-only, `{{var}}` interpolation — the
   `params` block of ISSUE-41), then declarative `$ref` wiring (Level 2),
   then visual DAG authoring only if end-user authoring is wanted (Level 3).
   Do **not** chase Level 4 orchestration (Airflow/Dagster) — a new app.
8. **The "list source" handle is the 80/20 shortcut** — instead of in-memory
   widget→widget wiring, let widgets consume a stable external handle (PagePile
   ID, PetScan PSID) that one widget *produces* and another *consumes*. Chaining
   and composability today, zero DAG engine, and it reveals which parts of real
   wiring are needed before committing to a reactive primitive.
9. **ToolFlow interop** — a widget that consumes a ToolFlow workflow's output
   (or its JSONL shape) bridges "run it and write the page" (ToolFlow) with
   "look at it" (WikiBento). The scheduler/wiki-edit backend is the line we do
   not cross.

### D. Platform strategy

10. **Third-party widget registry early** — Grafana's plugin ecosystem is the
    moat; Smashing's `smashing-contrib` shows the value of a community widget
    registry; Freeboard's runtime registration is the API precedent. Our
    registry + constitutions are the seed — generalize the conformance tests
    into a plugin-contract test suite (MODULARITY-AND-DATAFLOW §Part 1).
11. **Narrative as a product surface** (Storify lesson) — linear timeline +
    annotation, distinct from dataflow; do not muddle it into the wiring
    metaphor. Connects to the "fill it with life" instinct (PHILOSOPHY §1) and
    the slideshow/ticker family (ISSUE-33/34/37).
12. **Dataflow UX: borrow Node-RED's per-node debug preview** — show each
    widget's output shape when wiring, the way Pipes previewed each module.

---

## 6. The meta-lesson — why they died, and why we are immune

| Death cause | Victims | WikiBento's immunity |
|---|---|---|
| **Proprietary host / platform lock-in** | iGoogle, Pageflakes, Yahoo Pipes, Storify, Pocket, **OpenDoc/Cyberdog** (killed with Apple's 1997 streamlining) | No backend + JSON-in-URL = fully portable; configs live on-wiki |
| **Acqui-hire into oblivion** | Polyvore, Storify (→Adobe), Scoop.it's Goojet | Open source — cannot be "acquired away" |
| **Legal / licensing** | Muxtape (RIAA) | Commons is **pre-cleared** — legal safety inherited |
| **No business model / parent neglect** | Yahoo Pipes, WidgetBox | Wikimedia-aligned, non-commercial |
| **Single maintainer / bus factor** | Freeboard, Dashing, Cyfe (roll-up) | Declarative registry + widget-authoring docs (WIDGET-DEVELOPMENT.md) |

**Survivors share one trait:** open source + a sharp niche (Node-RED → IoT;
Wakelet → education; Zapier → B2B; Grafana → devops). WikiBento's niche — curate
and frame *Wikimedia* content — is the moat, untouchable by any horizontal tool.
This is PARADIGMS §6's mortality analysis confirmed from a second, independent
data set.

---

## 7. Uncertainty flags (from TOOL-LANDSCAPE — do not cite as fact)

- **"Storify users migrated to Wakelet"** — no surviving primary source; the
  EOL FAQ only says "export content locally." Plausible but unverified.
- **Pocket shut down July 2025 (Mozilla)** — from Wikipedia; high-confidence but
  recent, worth confirming before publishing.
- **Yahoo Pipes exact shutdown date** — Wikipedia internally inconsistent
  (30 June 2015 vs. Sept 2015).
- **Paper.li and Huginn current statuses** — unverified.
- **OpenDoc provenance notes (from §4, added 2026-08-16):** the mock-funeral
  story sometimes attached to OpenDoc belongs to **Mac OS 9 at WWDC 2002** —
  OpenDoc's actual end was the March 1997 discontinuation, followed by Jobs'
  WWDC 1997 closing Q&A (May 13) calling it "dead" and favoring "putting a
  bullet in the head of OpenDoc." The "technically superior to OLE" claim is
  contemporary vendor testimony (Novell et al. via Wikipedia's cited sources),
  not a neutral benchmark. Cyberdog shipped May 1996 as the first OpenDoc
  product.

---

## 8. Open questions / decisions to make

1. **`urlEmbed` vs. the Arbitrary URL Extractor** — the oEmbed route (standard,
   half effort, robust) argues for retiring the scraper idea in ROADMAP Phase 1,
   or keeping the scraper only for Wikimedia-adjacent targets behind `/api/proxy`.
2. **When to start the datasource/widget split** — before or after the chart-
   renderer additions (sunburst/treemap)? Every new chart type is a new renderer
   in the hardcoded `WidgetContent` switch; the split amortizes across them.
3. **List-source handle priority** — PagePile first (stable IDs, read-only) or
   PetScan PSID? ToolFlow's adapter list (PetScan, PagePile, Quarry, SPARQL)
   is the ordering signal.
4. **ToolFlow interop depth** — consume a workflow's output as a read-only list
   source, or also render its JSONL schema as a table widget (the shared
   standardized format)?

---

*End of document. Sources: TOOL-LANDSCAPE.md (2026-08-15), TOOLFLOW-ANALYSIS.md
(2026-08-15) — originals kept outside the repo; MODULARITY-AND-DATAFLOW.md is in
this docs/ tree as the architectural companion.*
