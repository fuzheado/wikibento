# Tool Landscape — Dashboards, Galleries, Curation & Dataflow

*Prepared 2026-08-15. A survey of tools that resemble WikiBento in part — the
"frame metrics/media from other sites into a dashboard" idea, the gallery/moodboard
idea, and the narrative-curation / cross-widget-dataflow idea — including projects
that are dead or defunct, because their failure modes are instructive.*

*Companion to `ARCHITECTURE.md`, `WIDGET-IDEAS.md`, and `MODULARITY-AND-DATAFLOW.md`.*

---

## Executive summary

WikiBento is **not the first** to do any one of its three moves — but **the
combination is unclaimed**, and the failure pattern of its predecessors is,
ironically, its moat.

- "Frame metrics from other sites into a dashboard" → done: iGoogle, Netvibes,
  Geckoboard, Freeboard. All died of **platform dependence** or went **server-side**
  (Grafana).
- "Gallery / moodboard of images" → done: Pinterest, Are.na, Polyvore. **Thrived.**
- "Drag posts into a linear narrative" → done: Storify. **Died 2018**, but the
  concept was validated by journalists (CBC's London-riots coverage, Al Jazeera's
  *The Stream*).

Nobody combined the three, and **nobody did the "frame *Wikimedia* content" angle**.
That is the opening.

The most important precedents to study: **Freeboard** (architecturally identical),
**Are.na** (the reusable-media data model), **Observable** (the reactive dataflow
model), **oEmbed** (the "frame any URL" standard), and the dead-but-instructive
**Yahoo Pipes** and **Storify**.

---

## Lineage 1 — Widget & business dashboards

| Tool | What it did | Status | Lesson for WikiBento |
|---|---|---|---|
| **iGoogle** | Google's personalized start page (gadgets, drag-and-drop) | Dead (Nov 2013) | Platform-host death — a proprietary widget runtime dies with its vendor; the *third-party gadget ecosystem* was the moat |
| **Netvibes** | Ajax start page + feed reader; "Universal Widget API" | Pivoted 2012 (Dassault), consumer retired 2025 | The personal-dashboard market couldn't sustain itself commercially; a cross-host widget spec (UWA) died with its hosts |
| **Pageflakes** | Ajax start page with shareable "Pagecasts" | Dead (Jan 2012, acquirer neglect) | Pagecasts = a widget-based Pinterest precursor — literally "share a dashboard"; died of acquirer neglect |
| **WidgetBox** | Widget building/aggregation/distribution | Dead/pivoted (2014, → Flite ads) | Widget *tooling* is hard to monetize — value accrues to the host, not the factory |
| **Yourminis** | Flash widget dashboard | Dead (~2008, AOL + Flash) | Runtime dependency risk (Flash) — open-web stack is the durable choice |
| **Protopage** | Free personal start page | **Alive** (~20 yrs) | Longevity via smallness — a minimal focused dashboard outlives hyped competitors |
| **start.me** | Freemium personal start page | **Alive** | The start-page niche survives as bookmark/portal + freemium teams |
| **Grafana** | Open-source observability platform | **Alive** (AGPLv3) | The canonical **data-source → panel → query** mental model + plugin ecosystem + "dashboards as code" (JSON) |
| **Kibana** | Elasticsearch viz UI | **Alive** (Elastic/SSPL relicensed 2021) | Single-backend coupling + relicense fragmented the community (→ OpenSearch) — keep the license permissive, don't hard-couple |
| **Datadog** | SaaS infra monitoring | **Alive** | Heavy ingest backend; WikiBento is the *inverse* (zero-retention over public CORS APIs) |
| **Geckoboard** | SaaS KPI "TV wall" dashboard | **Alive** | "Reports explain what happened, dashboards change what happens next" — *glanceability* (big numerals) over dense charts |
| **Klipfolio** | SaaS KPI dashboard (PowerMetrics/Klips) | Alive, pivoted | The market moved from ad-hoc widgets to *governed metrics*; depth beats breadth |
| **Cyfe** | "All-in-one" dashboard | Zombie (Alpine SG roll-up, 2019) | The SaaS-zombie outcome — generalist dashboards die by neglect |
| **Databox** | SaaS analytics dashboard + AI analyst | **Alive** | Modern SaaS dashboards become an **AI/query layer over metrics** — an AI "generate a widget config" assistant is feasible for WikiBento |
| **Freeboard** ⭐ | Open-source real-time dashboard builder | **Dormant** (MIT, ~2017) | **Architecturally identical to WikiBento** — 100% client-side, no backend, JSON-defined, `plugins/` dir. See Part 2 (§Freeboard) |
| **Dashing** (Shopify) | Ruby/CoffeeScript dashboard framework | Dead (archived Mar 2018) | "Widget = job + renderer, pushed via SSE" ≈ WikiBento's `fetch → transform → renderer`, but needed a Ruby server |
| **Smashing** | Community fork of Dashing | Alive-but-dormant | The `smashing-contrib` ecosystem shows the value of a community widget registry |
| **WMF Grafana** | Wikimedia Foundation's public Grafana | **Alive** (grafana.wikimedia.org) | WMF *already* runs Grafana publicly — WikiBento must NOT be another ops tool; its niche is a *consumer/curated* framing layer, and WMF's dashboards are a ready-made **catalog of Wikimedia data sources** |

Sources: Wikipedia articles for iGoogle, Netvibes, Pageflakes, WidgetBox, Cyfe;
github.com/grafana/grafana, github.com/elastic/kibana, github.com/Shopify/dashing,
github.com/Smashing/smashing, github.com/Freeboard/freeboard; wikitech.wikimedia.org/wiki/Grafana;
live product sites for Geckoboard/Klipfolio/Databox/start.me/Protopage.

---

## Lineage 2 — Gallery & moodboard tools

| Tool | What it does | Status | Lesson for WikiBento |
|---|---|---|---|
| **Pinterest** | Social pinboards; masonry grid | **Alive** (553M MAU) | The **pin + board + masonry** metaphor: atomic image+link item, user-defined context, aspect-ratio-preserving grid, metadata deferred to hover/click |
| **Are.na** ⭐ | "Social network for ideas" — blocks → channels → connections | **Alive** | The best **data model**: atomic blocks joined to channels via *first-class connection objects* carrying position + per-channel metadata; no likes/shares — annotation over engagement |
| **Padlet** | Real-time freeform wall | **Alive** | Freeform wall scales poorly (messy accumulation); structured grid is more robust — offer *both* layouts from one data model |
| **Miro / Mural** | Infinite-canvas collaboration | **Alive** | Infinite canvas is overkill for a widget; "canvas for ideation, templates for repeatable structure" |
| **Dropmark** | Minimal visual collections | **Alive** (15+ yrs) | A tiny "collection + items" model with drag-reorder survives 15 years independently |
| **Milanote** | Moodboard/visual planner | **Alive** | Boards mix *multiple content types* (image+text+link+note), not just images |
| **Raindrop.io** | Bookmark manager w/ visual collections | **Alive** | **Grid / Masonry / List / Headlines view modes** + a web-archive snapshot (anti-link-rot) |
| **Pearltrees** | Hierarchical "pearls → trees" | Alive, quiescent | Deep hierarchy adds power but hurts casual use — flat grouping won |
| **Polyvore** | Fashion moodboard / social commerce | Dead (2018, Yahoo→SSENSE) | Death-by-acquisition orphaning user sets → **portability is the safeguard** |
| **Muxtape** | Minimal mixtape sharing | Dead (2008, RIAA) | **Legal/licensing kills curation tools** — Commons pre-cleared licensing is a structural WikiBento advantage |
| **We Heart It** | Image social network | Inactive | Engagement-without-structure failed; WikiBento's structure (categories/captions) is more durable |
| **Pocket** | Read-later/bookmarking | Dead (July 2025, Mozilla) | Corporate-owned curation tools vanish on short notice → user-owned JSON URLs are the safeguard |

Sources: Wikipedia articles for Pinterest, Are.na, Padlet, Miro, Polyvore, Muxtape,
We Heart It, Pocket, Pearltrees; are.na/developers/all.md (V3 API); live sites for
Dropmark, Milanote, Raindrop.io.

---

## Lineage 3 — Narrative & curation

| Tool | What it did | Status | Lesson for WikiBento |
|---|---|---|---|
| **Storify** | Drag social posts into a linear, annotated, embeddable "story" | Dead (2018, Livefyre→Adobe) | The **drag → annotate → linear timeline → embed** loop was loved by journalists; died of acqui-hire + commoditization (native embeds made every CMS a mini-Storify) |
| **Wakelet** | Modern content curation (collections) | **Alive** (education niche) | Curation survives by *owning an audience segment* (education), not by being a generic Storify replacement |
| **Scoop.it** | Topic curation → "online newspaper"; began as **Goojet, a mobile widget platform** | Alive, pivoted (→B2B) | A live case of *pivoting from widgets to curation* — iOS commoditized its widget tech |
| **Flipboard** | Magazine-format news + user "magazines" | **Alive** | "Named collection + links" is a durable metaphor; UI polish carried it beyond Storify |
| **Paper.li** | Auto-generated "online newspaper" from social feeds | Uncertain (unverified) | The *automated* end of curation vs. Storify's manual assembly |
| **embed.ly** | "Embeds as a service" aggregation over oEmbed | Absorbed by Medium (2016) | Embed-tooling monetized only as a utility; the durable value was the *standard*, not the broker |
| **oEmbed** | Standard for typed embeds of a URL | **Alive** (spec since 2008) | **This is WikiBento's framing idea, already standardized** — see Part 2 (§oEmbed) |

Sources: Wikipedia articles for Storify, Scoop.it, Flipboard, OEmbed, Medium;
techcrunch.com/2017/12/12/storifys-standalone-service-is-shutting-down-next-year/;
web.archive.org Storify EOL FAQ; oembed.com.

---

## Lineage 4 — Mashup & dataflow / automation

| Tool | What it did | Status | Lesson for WikiBento |
|---|---|---|---|
| **Yahoo Pipes** | Drag modules, wire into a feed-mashup pipeline (Unix-pipes metaphor, per-node debugger) | Dead (2015) | The canonical **visual wiring UX** — the ancestor of cross-widget flow; died of parent neglect + no business model + hosted-only |
| **IFTTT** | "If this then that" trigger→action | **Alive** | Reduce composition to a *sentence fragment* — pick the simplest mental model for wiring |
| **Zapier** | Multi-step B2B "Zaps" | **Alive** | Depth (multi-step) + enterprise pricing beats breadth + consumer free |
| **Huginn** | Self-hosted "IFTTT for hackers" | Open source (unverified activity) | The self-hosted, scriptable counterpoint — aligned with WikiBento's ethos |
| **Node-RED** | Flow-based programming; nodes wired by wires, `msg` payloads | **Alive** (IBM→OpenJS, Apache-2.0) | Survived where Pipes died via **open source + self-host + IoT niche**; per-node debug output is a UX to copy |
| **Power Automate** | SaaS workflow ("flows": automated/instant/scheduled/BP) | **Alive** | A useful *trigger typology* when defining "one widget feeds another" |
| **Observable** ⭐ | Reactive JS dataflow notebooks; named **cells** reference each other | **Alive** | The best **client-side dataflow model** — see Part 2 (§Observable) |

Sources: Wikipedia articles for Yahoo Pipes, IFTTT, Zapier, Node-RED,
Power Automate; observablehq.com/documentation/cells/javascript.

---

## The five precedents worth deep study

### 1. Freeboard — WikiBento's spiritual predecessor
MIT-licensed, **100% client-side, no backend**: static HTML/JS, dashboards defined
and loaded as **JSON**, widgets fetch JSON APIs and render into a grid, and a
`plugins/` directory holds datasource/widget plugins. Architecturally identical to
WikiBento. It stalled (~2017, single maintainer) despite being genuinely good —
study both its design *and* its failure. See Part 2 (§Freeboard).
<https://github.com/Freeboard/freeboard>

### 2. Are.na — the reusable-media data model
Atomic **blocks** (image/text/link/file) joined to **channels** (collections) via
first-class **connections** (edges) that carry their own `position` and per-channel
metadata, with their own REST endpoints. A Commons file could appear in many
galleries with different captions and ordering, without duplication — the exact
model for "same image in a category gallery and an article gallery, annotated
differently." <https://www.are.na/developers/all.md>

### 3. Observable — the client-side reactive dataflow model
Everything is a named **cell**; any cell can reference any other by name, regardless
of visual order; the runtime executes in **topological order** and **only re-evaluates
referencing cells** when a value changes (spreadsheet semantics). This is the model
WikiBento should mirror for "widget A's output feeds widget B" in a pure client-side
app. <https://observablehq.com/documentation/cells/javascript>

### 4. oEmbed — the "frame any URL" standard
A consumer sends `GET {provider endpoint}?url=<target>&format=json`; the provider
returns a typed object (`type`: `photo`/`video`/`rich`/`link`, plus title/author/dims
and an `html` snippet or `url`). Discovery via a `<link rel="alternate"
type="application/json+oembed">` head tag. WikiBento's declarative widgets are
already "typed renderers of a resource given a URL/id" — oEmbed is that idea,
standardized and battle-tested since 2008. <https://oembed.com>

### 5. Yahoo Pipes + Storify — the two dead validations
Pipes nailed the "drag nodes, wire them, preview each node's output" UX (the ancestor
of cross-widget flow). Storify nailed "drag → annotate → linear timeline → embed."
Both died of **ownership/niche-miss, not product failure.**

---

## The meta-lesson — why they died, and why WikiBento is immune

| Death cause | Victims | WikiBento's immunity |
|---|---|---|
| **Proprietary host / platform lock-in** | iGoogle, Pageflakes, Yahoo Pipes, Storify, Pocket | No backend + JSON-in-URL = fully portable |
| **Acqui-hire into oblivion** | Polyvore, Storify (→Adobe), Scoop.it's Goojet | Open source — can't be "acquired away" |
| **Legal / licensing** | Muxtape (RIAA) | Commons is **pre-cleared** — legal safety inherited |
| **No business model / parent neglect** | Yahoo Pipes, WidgetBox | Wikimedia-aligned, non-commercial |
| **Single maintainer / bus factor** | Freeboard, Dashing, Cyfe (roll-up) | Declarative registry + widget-authoring docs |

**Survivors share one trait:** *open source + a sharp niche* (Node-RED → IoT;
Wakelet → education; Zapier → B2B). WikiBento's niche — "curate and frame
*Wikimedia* content" — is the obvious moat, untouchable by any horizontal tool.

---

## Lessons by capability

**Dashboard (framing).** Adopt Grafana's `data-source → panel → query` vocabulary
(WikiBento's `fetch → transform → renderer` already maps onto it). Build the
third-party widget registry *early* — the ecosystem is the moat.

**Gallery.** Masonry (not fixed grid) as the default; Are.na's block+connection
model; lazy-load thumbnails and defer metadata; persist explicit order in JSON;
**surface license/attribution** (legally required + a trust signal ad-funded tools lack).

**Narrative.** Storify's power was *linear timeline + annotation*, distinct from
dataflow — ship narrative as a *product surface*, not muddled into the wiring metaphor.

**Dataflow.** Observable's declarative reactive DAG (not an imperative event mesh)
is the only thing that works cleanly client-side; borrow Node-RED's per-node debug
preview as the UX.

---

## Uncertainty flags (do not cite these as fact)

- **"Storify users migrated to Wakelet"** — no surviving primary source; Storify's
  own EOL FAQ only says "export content locally." Treat as plausible-but-unverified.
- **Paper.li** and **Huginn** current statuses unverified.
- **Yahoo Pipes exact shutdown date** internally inconsistent on Wikipedia
  (infobox "30 June 2015" vs. prose "read-only Aug 30 / shutdown Sept 30 2015").
- **Geckoboard** — verified alive (site live and selling, 2026-08-15); no shutdown found.
- **Pocket shut down July 2025 (Mozilla)** — from Wikipedia; high-confidence but
  recent, worth a confirm before publishing.

---

## Part 2 — The Notebook Paradigm, oEmbed & Visualization

*Appended 2026-08-15. Four follow-on areas: a code-level reading of Freeboard, the
oEmbed implementation, the d3/Observable chart-renderer catalog, and the notebook
paradigm (Jupyter / ipywidgets / reactive notebooks).*

### §Freeboard — codebase lessons

Freeboard splits the "widget" concept into **two** plugin types and connects them:

- **Datasource plugin** — `function(settings, updateCallback)`; fetches (owns its own
  refresh interval, headers/body/method), pushes results via `updateCallback(data)`,
  exposes `onDispose()`.
- **Widget plugin** — renders the data (sparkline, gauge, text, table).

The engine "does all the work to connect the two" — the user binds a datasource to a
widget and maps fields. Four concrete lessons:

1. **The datasource/widget split is a cleaner decoupling than WikiBento's merged
   `fetch→transform→renderer`.** The same datasource feeds many widgets and vice versa
   (M:N). WikiBento's `getRenderer(config)` is a partial step; consider separating
   *data source* from *visualization* so pageviews can render as stat/table/bar without
   new widget types.
2. **Runtime plugin registration** — `freeboard.loadDatasourcePlugin(plugin)` /
   `freeboard.loadWidgetPlugin(plugin)` is the `registerWidget()` API from
   `MODULARITY-AND-DATAFLOW.md`, working since 2013.
3. **A self-contained datasource lifecycle + generic CORS fallback** — Freeboard's
   datasource escalates JSON → JSONP → **thingproxy.freeboard.io** (a hosted CORS proxy),
   the exact analogue of WikiBento's `/api/proxy`, 13 years early.
4. **Edit/view mode** — `freeboard.setEditing(bool)` gives a clean view-only mode (the
   ROADMAP "lean display mode").

The stack (jQuery + lodash + gridster + require.js) hasn't aged well, but the concepts
have: plugin split, registration, serialize/load JSON, CORS proxy, edit mode.
<https://github.com/Freeboard/freeboard>

### §oEmbed — implementation impact

oEmbed is "frame any URL as a typed embed," standardized since 2008. It changes widget
implementation as follows:

- **It replaces the "Arbitrary URL Extractor" scraping idea** with a standard: a small
  provider table (`oEmbed endpoint → widget type`) + an OpenGraph/metadata fallback →
  a generic "link card" widget.
- The oEmbed `type` maps onto existing renderers: `photo` → image card, `video`/`rich` →
  iframe (the `wikiPage` pattern), `link` → link card.
- **Caveat 1:** `video`/`rich` return HTML fragments — the iframe/sandbox question already
  answered by the `wikiPage` widget.
- **Caveat 2:** for *Wikimedia* content the Action/REST APIs are richer than any oEmbed
  provider — oEmbed is the *universal fallback* widget (any URL), not the primary path.

Recommendation: a single `urlEmbed` widget = provider table + metadata fallback — about
half the effort of the scraping version and far more robust. Build on the standard, not
the broker (the embed.ly lesson).

### §Observable / d3 — chart-renderer catalog

WikiBento is deliberately zero-chart-library (hand-rolled SVG), but sunburst/treemap/
force-graph are hard to hand-roll — import tree-shakeable d3 modules or Observable Plot.

| Renderer | d3 module | Hierarchical/graph data source |
|---|---|---|
| Sunburst / treemap | `d3-hierarchy` | Category trees, Wikidata `P279`/`P361` |
| Force-directed graph | `d3-force` | subclass-of / part-of graphs |
| Sankey | `d3-sankey` | flow between wikis/categories |
| Choropleth / map | `d3-geo` or Leaflet | `P625` coordinates |

Cleanest path: extend the SPARQL widget's auto-renderer (`stat/bar/line/table`) with
`sunburst`/`treemap`/`graph` modes — "SPARQL → hierarchical result → sunburst" is a killer
power-widget story. Plus a dedicated **Category Tree** widget for non-SPARQL users.

Note: every new chart type is a new renderer in the hardcoded `WidgetContent` switch —
chart widgets are the concrete case for splitting renderers into per-widget files first
(see `MODULARITY-AND-DATAFLOW.md` §Part 1).

### §The Notebook Paradigm

The notebook paradigm and WikiBento are the same shape viewed from different angles:

| Notebook concept | WikiBento equivalent |
|---|---|
| A **cell** (named, recomputable value) | A **widget** (`transform` output) |
| `.ipynb` / Quarto document (portable JSON) | dashboard JSON |
| JupyterLab **extension registry** | `WIDGET_TYPES` registry |
| ipywidgets `link`/`observe` wiring | *missing* — cross-widget dataflow |
| Reactive-notebook DAG | *missing* — the Phase 3 vision |

**Classic notebooks.** Jupyter (`.ipynb` = portable JSON of cells+output), JupyterLab
(kernel↔UI split + plugin registry), Google Colab (zero-install + share-by-URL), Deepnote
("blocks" blur notebook into app; open-sourced Sept 2025), Hex/Databricks (notebook →
dashboard → scheduled job).

**ipywidgets** — the most instructive *widget* model, and the *opposite* architecture:

| | ipywidgets | WikiBento |
|---|---|---|
| Source of truth | Python **kernel** (server) | **Browser** (client) |
| Compute | round-trips to kernel | fetch-and-render, no compute |
| Layout | programmatic tree (`HBox`/`VBox`) | 2D grid metadata (`x,y,w,h`) |
| Wiring | `link`/`observe` traitlets | *none* |

Verdict: WikiBento's registry + grid is correct for a no-backend Wikimedia tool — borrow
ipywidgets' *wiring* (named state, attribute links), not its *layout*. Its `interact(f)`
(auto-generate a widget from a function signature via type inference) is the seed of an
"auto-generate a widget from a data schema" feature.

**Reactive notebooks.** Observable (named cells, topological order, only-dependents-rerun),
Pluto.jl (static dependency analysis; *errors* on a missing dependency — no hidden state),
Marimo (pure-`.py` notebook that reconstructs a DAG from plain text; ~22k★; UI elements as
first-class variables). Marimo is the strongest signal: *"notebook as plain versionable
text that reconstructs a DAG"* = WikiBento's *"dashboard as plain JSON that reconstructs a
widget graph."*

**Notebook → dashboard.** Voilà ("the dashboard is the notebook minus the code" — but a
kernel per viewer), Panel (`param` reactive parameters), Streamlit (full re-run per
interaction; Snowflake 2022), Gradio (UI from function signature; Hugging Face 2021),
Shiny (explicit named reactive graph). All keep compute server-side — WikiBento's
"fetch-and-render, no compute" is simpler and better for a public zero-cost tool; the
trade-off is that any derived logic must happen in-browser, which is exactly why the
reactive-DAG machinery needs re-implementing client-side.

**The single transferable idea:** treat every widget as a **named, derived value** that
recomputes when — and only when — its declared inputs change, in topologically-sorted
order. WikiBento already has the hard parts (declarative registry, JSON serialization);
it is only missing **named outputs + `dependsOn` edges + dependent-only recompute**.

Sources: jupyter.org, github.com/jupyterlab, ipywidgets.readthedocs.io; observablehq.com,
github.com/JuliaPluto/Pluto.jl, github.com/marimo-team/marimo; github.com/voila-dashboards/voila,
github.com/holoviz/panel, github.com/streamlit/streamlit, github.com/gradio-app/gradio,
github.com/posit-dev/py-shiny; github.com/quarto-dev/quarto-cli.

---

*End of document — see also `MODULARITY-AND-DATAFLOW.md` for the architectural
assessment that motivated this survey.*
