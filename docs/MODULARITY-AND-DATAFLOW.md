# Modularity & Data Flow — Architecture Assessment

*Prepared 2026-08-15. Companion to `ARCHITECTURE.md`, `WIDGET-DEVELOPMENT.md`, and
`ROADMAP.md` (see §Phase 3 there for the original DAG/cascade notes this builds on).*

*This document answers two questions: (1) how modular is the widget system — could
a third party write a widget as a plug-in? (2) what is the capacity for data to
flow *between* widgets, up to and including workflow-orchestration territory?*

---

## TL;DR

1. **Modularity** — the *interfaces* are clean and well-specified (a widget is a
   declarative object; data / render / config are three decoupled layers). But it
   is a **contribution model, not a plug-in model**: renderers and fetchers are
   hardwired into single files, there is no runtime registration, and there is no
   isolation boundary for third-party code.
2. **Data flow** — today there is **zero** widget-to-widget flow (confirmed: no
   Context / store / event bus anywhere in `src/`). The path to "one widget feeds
   another" is reasonable and fits the architecture (it is Grafana's model), but
   **full Airflow/Dagster-style orchestration is a different class of app** — it
   collides with the project's "no backend" design.

---

## Part 1 — How modular is it really?

A scorecard, layer by layer:

| Layer | Verdict | Where | Gap |
|---|---|---|---|
| **Widget definition** | ✅ Fully data-driven | `WIDGET_TYPES` in `src/widgets/index.js` | One 1,184-line object literal; no dynamic registration |
| **Config schema** | ✅ Declarative | `configFields` → generic form + `validateDashboard()` | Only as strong as `configFields` types (`text`/`number`/`select`/`boolean`/`textarea`) |
| **Fetch** | ✅ Clean pure functions | `src/widgets/dataSources.js` | ~30 fetchers in **one 1,502-line file** — not per-widget modules |
| **Transform** | ✅ Clean, documented | inline in each registry entry | Contract is *by convention* (documented, not type-checked) |
| **Renderer** | ⚠️ Pure but hardwired | **22 components in one `WidgetFrame.jsx`** | `renderer` is a string → a hand-maintained `switch` (`WidgetContent`, line 162); a new renderer edits core |
| **State / data flow** | ⚠️ Isolated | `App.jsx` `useState` + prop-drilling | No shared store; widgets cannot see each other |
| **Security** | ✅ Reasonable | markdown escape-first + image allowlist, CORS `origin=*`, no `eval` | No *per-plugin* isolation — a "plugin" is same-trust as core |

### The clean part: three decoupled layers

The contract between **widgets ↔ rendering ↔ data flow** is exactly what you want.
A widget is one object:

```js
pageviews: {
  id, name, icon, description,
  timeScope,               // temporal-scope constitution
  defaults: { article, project, displayMode, refreshSeconds },
  renderer: 'StatCard',    // or getRenderer(config) for config-swapped renderers
  getRenderer: (config) => config.displayMode === 'trend' ? 'TrendCard' : 'StatCard',
  dataSource: 'pageviews', // informational label
  configFields: [ ... ],   // drives the ⚙ form
  fetch:     (config) => fetchPageviews(config.article, config.project),
  transform: (data, config) => ({ title, subtitle, value, detail, trend }),
  labelFromConfig: (c) => c.article?.replace(/_/g, ' '),
  defaultLayout: { w, h, minW, minH },   // optional per-widget grid constraints
}
```

Because the entry is **data, not a component subclass**, the catalog panel, the ⚙
config form, the fetch lifecycle, and the header are all generic against it. This
is why "adding a widget" is one registry entry plus (usually) one fetcher — nothing
else (see `WIDGET-DEVELOPMENT.md`). The design decision "**registry over
inheritance**" (`ARCHITECTURE.md` §Key Design Decisions) is the right one and pays
off every time a widget is added.

The **transform contract** is the interface between data and presentation, and it
is documented per renderer (`ARCHITECTURE.md` §The Widget Registry Pattern). Data
sources, presentation, and configuration are decoupled in practice, not just in
theory.

### The hardwired part: packaging, not design

What is missing is the **packaging layer** that turns a clean interface into a
plug-in system. To get there, in rough order:

1. **Co-locate** — split `dataSources.js` and `WidgetFrame.jsx` into per-widget
   modules (`widgets/<type>/fetch.js` + `widgets/<type>/renderer.jsx`). Mechanical,
   but necessary so a plugin is self-contained.
2. **Registration API** — a `registerWidget(definition)` entry point + a manifest.
   Today the registry is a static import graph.
3. **Dynamic loading** — `import()` a remote module / npm package instead of
   compiling it into the bundle.
4. **Isolation** — third-party code is untrusted; there is no sandbox today. Options:
   an iframe/Worker boundary, or a "trusted core, reviewed plugins" policy.
5. **Contract versioning** — the seed already exists: the two "constitutions"
   (freshness + temporal-scope, enforced by `tests/scope-compliance.test.mjs`
   gating `npm run build`) are *conformance tests*. Generalize that pattern into a
   plugin-contract test suite.

**Verdict:** the interface is elegant enough that a third party *could* write a
widget today; the missing work is **distribution and trust, not design**.

---

## Part 2 — Data flow between widgets, and the orchestration question

### Current state: no flow, but good foundations

Confirmed by grep: **no `createContext` / `useContext` / store / `subscribe` /
event bus** anywhere in `src/`. Each `WidgetFrame` owns its `{ loading, error,
data }`; the only channel is upward (`onUpdateConfig` → `App.handleUpdateConfig`).
`config` is static free-form JSON — no references, no interpolation, no variables.

Three architectural choices make data flow *cheap to add later*:

- **Widgets are data**, so "wiring" is a config change (`input: { widgetId, field }`),
  not a code change.
- **`WidgetFrame` already re-runs `load()` on config change** (`useEffect` on
  `[load]`, `WidgetFrame.jsx` ~51–53) — a natural propagation trigger if a config
  value resolves from another widget's output.
- **Centralized fetch lifecycle** — one place to insert dependency resolution
  rather than N places.

### The spectrum — reasonable vs. a new app

| Level | What it is | Effort | Fits this architecture? |
|---|---|---|---|
| **1. Dashboard variables** (`{{var}}` + a Variable widget) | Config-level interpolation, Grafana-style | S | ✅ Perfectly — config-only, no DAG engine |
| **2. Declarative wiring** (`input: { widgetId, field }` + declared outputs + dependent queries) | Jotai derived atoms / TanStack Query dependent queries | M | ✅ Fits the registry; needs a shared store + output typing + invalidation |
| **3. Visual DAG authoring** (React Flow edge-drawing) | User draws wires between widgets | L | ⚠️ New UX paradigm; only if end-user authoring is wanted |
| **4. True orchestration** (scheduling, retries, backfills, distributed execution, durability) | Airflow / Dagster / Prefect | XL | ❌ **Different class of app** |

`ROADMAP.md` §Phase 3 already lands here correctly: it explicitly rules out
Airflow/Prefect/Dagster ("server-side, not client-side") and picks Grafana
variables → Jotai/TanStack → React Flow as the staged path.

### The boundary that matters: "no backend" is the ceiling

This is the single most important architectural fact. WikiBento's superpower —
**zero infrastructure, runs from a static host, all state in localStorage** — is
precisely what caps its orchestration potential:

- A browser tab closing **kills the pipeline** (no durability).
- "Auto-refresh" is a per-widget `setInterval`, **not a scheduler** — no retries,
  backfills, or DAG-level scheduling.
- No **multi-user shared state**, no concurrency control.

Airflow/Dagster are *server-side, durable, scheduled, stateful* systems. If the
goal is genuinely "one widget's list feeds another widget's query" as a **live,
interactive, user-driven cascade**, that is achievable and fits beautifully — it is
the Grafana model, not the Airflow model. If the goal is *pipeline orchestration*
(run this list through five stages nightly, retry failures, notify on completion),
that needs a backend — and WikiBento is the wrong substrate. Either bolt on a real
backend (a large commitment that changes the identity of the tool) or build a
separate orchestrator that *emits* dashboard JSON.

### The pragmatic near-term step: "list source" as a shared handle

There is an 80/20 shortcut already half-designed in `WIDGET-IDEAS.md` §List
Sources: the **"list source" config field**. Instead of direct widget→widget wiring,
let widgets consume a **stable external handle** — a PagePile ID or PetScan PSID —
that any widget can read as its input. A "list" then becomes a first-class,
addressable value that one widget can *produce* (e.g. "SPARQL → save as PagePile")
and another *consumes*:

```
producer widget ──▶ PagePile ID (stable, URL-addressable) ──▶ consumer widget(s)
```

This gives chaining and composability **today**, with zero DAG engine, because the
shared medium is an external resource rather than in-memory wiring. It is the
cheapest step up the spectrum, and it reveals which parts of real wiring are
actually needed before committing to a reactive-graph primitive.

---

## Part 3 — State of the art: how peer tools do interactivity (researched 2026-09-01)

A scan of the tools that already ship widget interactivity — to answer "roll our own
or borrow?" — found **three competing models** in the wild, with clear track records:

| Model | Exemplars | Mechanism | Track record |
|---|---|---|---|
| **Variables / parameters** (hub-and-spoke) | **Grafana**, Metabase, Apache Superset, Power BI, Streamlit | Named values (`$var` / `{{var}}`) interpolated into panel *queries* at evaluation time; changing a variable re-runs every referencing panel. **No direct widget→widget edges.** | The survivor. Grafana's modern `@grafana/scenes` runtime still centers on it; chained/derived variables cover dependency cases; Metabase/Superset both built native-filter + Jinja-style templating variants. |
| **Actions / events** (declarative source→target edges) | **Tableau** (filter / highlight / URL actions), Kibana drilldowns, Metabase click behavior, Retool / Appsmith event handlers | "On click of SOURCE, do ACTION to TARGET" — Tableau's "Use as Filter" is the canonical case | Powerful but **wiring complexity grows with widget pairs**; Retool/Appsmith apps notoriously become event-handler hairballs. Every mature tool *caps* the action vocabulary: Tableau only filter/highlight/navigate; Metabase only "update filter / go to destination". |
| **Reactive dataflow** (named cells + dependency graph) | **Observable** (`@observablehq/runtime` is MIT and embeddable), Jotai, TanStack Query | Cells declare outputs; references form a graph; recompute is topological | Most elegant client-side model — but it *replaces* the app's execution model rather than layering on top. |

Three conclusions:

1. **Grafana — the direct peer — never built widget→widget messaging, deliberately.**
   The industry's collective lesson is that general message-passing between dashboard
   nodes is a complexity trap (cf. mTropolis's fate, PARADIGMS.md §2), and that ~90%
   of real interactivity is "something sets a named parameter; widgets that reference
   it re-query." Actions exist everywhere as a *thin, capped veneer on top of
   variables* (click → set filter), never as a general bus.
2. **Streamlit's propagation semantics are the right fit for this app:** on an input
   change, re-run what references it, skip the rest. WikiBento's equivalent is
   already half-built — config change → `load()` re-run; a params change just needs
   re-resolution + `reloadKey`.
3. **The reactive graph is infrastructure, not a feature.** Grafana built variables
   as a product feature and adopted a reactive scene runtime underneath. We should
   copy that split: hand-roll the (tiny) variables layer, borrow the reactive engine
   only if Level 2 wiring ever proves necessary.

### The minimal primitive set (prototype scope)

1. **Params** — App state `{ name → value }`, persisted in the dashboard JSON
   (additive `params` top-level block; `validateDashboard` already ignores unknown
   top-level keys — verified 2026-09-01).
2. **Interpolation** — `resolveParams(config, values)`: `{{name}}` substitution in
   config string fields, resolved ONCE before validate/fetch (unknown names left
   literal + warned).
3. **Controllers** — widgets/controls that WRITE params: buttons, select, text
   (the Board Controls card of ISSUE-41).
4. **Re-fetch trigger** — already exists: re-resolve configs + bump `reloadKey`.
5. *(later, Level 2 only)* — declared outputs + `$ref` edges for true
   widget→widget flow; the point to adopt Jotai / `@observablehq/runtime`.

### Paths forward

- **Path A (first) — params + Board Controls card** = ISSUE-50. The demo: three
  category buttons re-aim a gallery/stats widget via `{{category}}`. Kiosk +
  buttons = touchscreen museum interactive. Everything stays serializable and
  URL-addressable (`?…&category=X` — ISSUE-40's context params use the same
  resolution path).
- **Path B (after A) — the capped action layer:** "on click of a GLAM category
  title / leaderboard row / top-page row → set param" (the Tableau filter-action
  analogue). Makes every existing list widget a controller while staying inside
  the variables hub.
- **Path C (when proven) — Level 2 `$ref` wiring** with a real reactive primitive
  (Appendix C sketch). Path A's usage tells us if this is ever needed.
- **Parallel cheap win:** the list-source handle (PagePile PSID, §Part 2) —
  producer/consumer chaining through an external stable ID, zero in-memory wiring.

**Verdict:** roll our own the *variables layer* (it is a resolve function + App
state — the integration work is the actual job per Part 2); do NOT roll our own
the *reactive graph* (adopt `@observablehq/runtime` or Jotai at Level 2). That is
exactly the split Grafana's history endorses.

## Part 4 — Input widgets: taxonomy, consumer coverage, impact matrix (2026-09-01)

With the params primitive shipped (ISSUE-50), the interactivity question becomes:
**what input widgets are worth building, in what order?** Grounded in the peer
-taxonomy research above (Grafana variable types: query/custom/textbox/constant/
interval/adhoc; Observable Inputs: button/text/number/range/select/search/table/
date; Streamlit: button/text/select/multiselect/slider/file_uploader/data_editor)
and a full audit of our registry's config fields.

### The headline: every widget is ALREADY a consumer

Because params resolve into any string (and, via the fetchers' own `parseInt`,
number) config field, the **consumer side needs zero code**. A full registry audit:

| Param (one name) | Widgets that re-aim for free |
|---|---|
| `article` | pageviews, excerpt, edithistory, quality, assessments, gallery, articleList, wikiPage — **8 widgets** |
| `category` | categorySize, glamorgan, cimSnapshot/Trend/TopFiles/TopWikis/TopPages/TopEditors — **9 widgets** |
| `filename` | fileUsage, cimFileSpotlight, cimFileTraffic, panorama360, mediaPlayer (single) |
| `month` | all 8 CIM widgets + topPages (fetchers already `parseInt` the month) |
| `domain` / `url` / `page` | linkcount / waybackGallery / wikiPage |
| a LIST (multi-line) | fileGallery, articleList, mediaPlayer playlists (textarea fields are strings — interpolation already works) |
| `query` | sparql (placeholders inside SPARQL text: `FILTER … {{category}}` — power-user escape hatch) |

So an "article spotlight" board (pageviews + excerpt + quality + edit history +
gallery) re-aims across 7 widgets from ONE control. The input-widget work is
therefore almost entirely about **better producers**, not consumers.

### Taxonomy → backlog, ranked by effort × impact

Taxonomy sources: Grafana's variable types (the *query* variable — options
fetched from a data source — is their single most-used type), Observable's
Inputs (button/text/number/range/select/search/table/date), Streamlit's widget
set (incl. data_editor = editable table), Tableau parameters + actions.

**Quadrant 1 — quick wins (S effort, high impact):**

| # | Input | Effort | Impact | Notes |
|---|---|---|---|---|
| 1 | ✅ Buttons | S | High | shipped (ISSUE-50) |
| 2 | ✅ Text field | S | High | shipped |
| 3 | ✅ Static select | S | High | shipped |
| 4 | **Number stepper/slider** | S | Med-High | drives topN, sampleCount, depth, fileBudget, months, limits — fetchers already parseInt strings; slider UI is the only work. Kiosk-friendly. |
| 5 | **Month/date picker** | S–M | High | the CIM family + topPages + pageviews windows all take a month; semantics already solved (`latestCimMonth`, `resolveMonth`). A picker that offers "latest available" fixes the ergonomics AND the month-lag class of confusion. |

**Quadrant 2 — strategic (M effort, high impact):**

| # | Input | Effort | Impact | Notes |
|---|---|---|---|---|
| 6 | **Dynamic query select** (Grafana's killer variable) | M | High | options FETCHED at load: institutions from a SPARQL query, subcategories via categorymembers, languages from Wikistats. Reuses the fetch layer; options = any query's first column. The "pick any GLAM institution" board. |
| 7 | **Search-as-input** | M | High | Action API `opensearch`/autocomplete → sets `article`/`filename`/`category` param. The most natural Wikimedia input; no board authoring needed (viewers just search). |
| 8 | **List param** (paste/upload a list) | M | High | textarea producer → `{{list}}` lands in fileGallery/articleList/mediaPlayer textareas. Pairs with the list-source handle (PagePile PSID) for the stable-reference version. GLAM batch workflows. |
| 9 | **Click actions on existing widgets** (Path B) | M | High | category titles, leaderboard rows, top-pages rows, gallery items → "set param". The HyperCard moment; Tableau filter-action analogue. Cap the vocabulary to click→set-param. |

**Quadrant 3 — deeper (L effort; do only when Level 2 is justified):**

| # | Input | Effort | Impact | Notes |
|---|---|---|---|---|
| 10 | SPARQL result → param | L | Med-High | the SPARQL widget as PRODUCER: "use column X as a list param" is the 80% version (feeds #8); full typed outputs (`$ref`) is the Level 2 seed (Appendix C). |
| 11 | Table / CSV editor input | L | Medium | paste CSV, pick a column/row as param (Streamlit data_editor analogue). Powerful; niche authoring audience. |
| 12 | JSON stream input | L | Low | live streams have no home in a no-backend, localStorage app — the Part 2 ceiling. Revisit only with a backend. |

**Deliberately skipped:** boolean toggles and color pickers (rarely board-level
decisions), Grafana adhoc/groupby filters ( datasource-shaped, not our model),
multi-select (single-value params today; multiselect implies list params — do #8
first).

### Recommended sequence

**4 (number) + 5 (month picker) → 6 (dynamic select) → 9 (click actions) → 7
(search) → 8 (list param) → 10 (SPARQL→param).** Rationale: 4+5 complete the
static-input set with the constitutions already solved (resolved-month display);
6 and 9 are the two highest-leverage producers (institution boards; make every
list widget a controller); 7 is the viewer-facing one; 8+10 unlock the GLAM
batch/list workflows that the list-source design anticipated.

## Recommendation

The architecture is in good shape for both directions, but they are different-sized
bets:

- **Plug-ins** — interface done, packaging next: *co-locate → registration API →
  dynamic import → sandbox* (Part 1).
- **Data flow** — start at **Level 1 (variables)**, adopt the **"list source" handle**
  for chaining, and **do not chase Airflow/Dagster** — that is a new app, not an
  evolution of this one (Part 2).

---

## Appendix — proposed interfaces (sketches, not implemented)

### A. `registerWidget()` — a plugin registration API

```js
// widgets/registry.js — proposed
const registry = new Map();

export function registerWidget(definition) {
  // 1. Validate the contract (throws with a precise message).
  assertContract(definition);           // id/name/renderer/configFields present;
                                        // fetch ⇒ refreshSeconds ≥ 30; timeScope declared
  // 2. Coalesce defaults + configFields with the frame's conventions.
  // 3. Register.
  registry.set(definition.id, definition);
}

export function getWidget(id) { return registry.get(id); }
export function listWidgets() { return [...registry.values()]; }
```

`assertContract()` is the generalized form of the existing constitution test —
the conformance check moves from build-time to registration-time, which is exactly
what makes a third-party plugin safe to load.

### B. Dashboard variables (Level 1)

```js
// dashboard.json — proposed format v2
{
  version: 2,
  variables: [
    { name: "category", type: "text", default: "Featured pictures on Wikimedia Commons" },
    { name: "project", type: "select", options: ["en.wikipedia", "commons.wikimedia"] },
  ],
  widgets: [
    { id: "c1", widgetType: "categorySize",
      config: { category: "{{category}}", wiki: "{{project}}" } },
    { id: "g1", widgetType: "glamorgan",
      config: { category: "{{category}}" } },
  ],
  layout: [ /* … */ ],
}
```

A small "Variable" widget (a text/select input writing to `dashboard.variables`)
plus a `resolveConfig(config, variables)` pass in `WidgetFrame`'s `load()`. No
reactive engine needed — changing a variable simply re-runs every widget that
references it (the config-change → `load()` trigger already exists).

### C. Declarative wiring (Level 2)

```js
// A widget declares its inputs and outputs; the frame wires them.
{
  id: 'wikidata-item',
  widgetType: 'wikidataItemCard',
  config: { qid: 'Q937' },
  outputs: { qid: 'Q937', claims: 'P6108' },   // declared, addressable
}
{
  id: 'iiif-viewer',
  widgetType: 'iiifViewer',
  config: { manifest: { $ref: 'wikidata-item.claims.P6108' } },  // dependent input
}
```

Resolution: a `$ref` in config pulls from the named widget's declared output; the
frame subscribes to that output and re-runs `load()` when it changes. This is the
point where a reactive primitive (Jotai derived atom, TanStack dependent query) is
warranted — but only after Level 1 has proven the need.

---

*End of document.*
