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
exactly the split Grafana's history endorses. Headwinds of this choice — loops,
scale, clutter, and honest downsides — are analyzed with field precedents in
**Part 5** below; the one-line summary is that hub models are structurally
loop-free, and the obligations that buys us (gesture-only writes, referencing
-only reload, progressive disclosure) are all cheaper than the alternatives.

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

## Part 5 — Headwinds: loops, scale, clutter — and how the field handles them (2026-09-01)

Before hardening the scoped-params design (P1–P3: surfaced IDs, targeted writes,
visible wiring), a due-diligence pass on the three failure modes every prior
system hit, with precedents for how each was solved.

### Comparison matrix — interconnection models, side by side

| Model | Exemplars | Targeting | Loop risk & mitigation | Scale story | Clutter | Serializable |
|---|---|---|---|---|---|---|
| **Spreadsheet cells** | Excel, Google Sheets | direct cell refs (per-cell edges) | **Structurally possible** → detected: status-bar circular-reference list, error value in cells; optional iterative-calc mode is an explicit opt-in with max-iterations | smart recalc engine tracks precedents/dependents, recomputes only what changed | formulas live in cells — zero extra UI | ✅ the original |
| **Reactive cells** | Observable notebooks, Jotai | named-variable refs (per-cell edges) | **Structurally possible** → runtime throws on cycles at graph build; can't serialize a cycle | topological recompute, only dependents re-run | code lives in cells; graph invisible (community built external visualizers) | ✅ notebook JSON |
| **Broadcast variables** | Grafana (classic), Metabase filters | **none — hub-and-spoke by reference** | **Structurally impossible** (variables are written only by controls; panels only read) — no edges to loop | known pain: a broad variable switch re-queries ALL referencing panels at once → browser freeze on dense dashboards (community-documented); mitigation = fewer referencing panels, scoped variables | low — one variable row of controls at dashboard top | ✅ dashboard JSON |
| **Scoped variables** ⭐ | Grafana per-section/tab variables (2025–26 POC→ship), **WikiBento targeted params (P2)** | per-scope writes over a global default | **Structurally impossible** by the same argument (writes only from user controls) | same as broadcast + scopes reduce blast radius | low, if scope picker is progressive-disclosure | ✅ |
| **Event / actions graph** | Tableau actions, Retool, Appsmith, Node-RED, Zapier/Make | explicit source→target edges | **Real and common** → Node-RED: user Function nodes loop, CPU spikes, needs watchdogs/max-depth hacks; Make/Zapier detect cycles; Excel-style iteration never offered — prevention by capping the action vocabulary | edges grow ~O(sources×targets); Retool apps famously become hairballs | HIGH — the action-chain UI is the #1 complexity complaint | ⚠️ flows serialize but are code-like |
| **Direct message-passing** | HyperCard buttons/scripts, mTropolis modifiers | arbitrary (any object → any object) | **Worst case** — the messaging web is the program; no systemic detection (mTropolis-era tools had none) | authors hand-manage | scripts hidden inside objects | ⚠️ stacks, proprietary |
| **WikiBento scoped params (chosen)** | — | hub + optional per-widget overrides (P2) | **Structurally impossible today** (writes only from Board Controls user clicks; fetch/render never write). Guardrail to keep: params are written by user events only | broadcast = O(referencing widgets) per click — same as Grafana; scoped targets shrink it; referencing-only reload is a known optimization | controllable via progressive disclosure (P3 visibility, collapsed-by-default editors) | ✅ dashboard JSON |

The pattern across the field: **the tools that loop are the tools with edges.**
Spreadsheets and reactive notebooks pay for their per-cell edges with cycle
detection engines; broadcast/scoped variable systems have no edges and therefore
no loops. Choosing the hub model buys us the strongest guarantee for free — the
only obligation is to keep it.

### Headwind 1 — Feedback loops

**Today: impossible by construction.** The dataflow is strictly
`user event → param value → widget configs → fetch → render`. Writes happen only
in Board Controls handlers (user gestures); fetch/render paths never write
params. There are no widget→widget edges, so no cycle can form — the same
structural argument as Grafana classic.

**When Path B actions ship (any widget row click → set param), a weaker class of
self-disturbance appears:** clicking a leaderboard row sets `category`, which
re-fetches that same leaderboard — the row you clicked may disappear or reorder.
That is NOT an infinite loop (one write → one refetch → stop; no write happens
on fetch/render), but it is surprising UX. Mitigations, in order:
1. **Keep the constitution: writes originate only from user gestures** — never
   from fetch completion, timers, or render. Encode it as a code-review rule
   now and a testable invariant later (transform/renderers receive `onSetParam`
   only via the Board Controls renderer contract).
2. Self-targeting writes should be a deliberate opt-in (a checkbox "apply to
   this widget too"), not a default.
3. If ever a non-gesture writer is truly needed, adopt the spreadsheet
   precedent: cycle detection over the (statically computable)
   param-reference graph + a max-iterations cap. Not needed today.

### Headwind 2 — Scalability

The real precedent is a **documented Grafana pain**: switching a broad variable
re-queries every referencing panel simultaneously → browser freeze on dense
dashboards. WikiBento has the same shape: today a param change bumps
`reloadKey`, and **all** fetch widgets re-run `load()` — O(board), not
O(referencing).

Mitigations, in order of when we'll need them:
1. **Scoped targets (P2) already reduce blast radius** — clicks re-fetch fewer
   widgets when authors declare targets.
2. **Referencing-only reload** (the next optimization, ~S effort): the
   param-reference graph is statically computable — scan each widget's raw
   config for `{{name}}`, then a param write re-runs only matching widgets.
   This is Excel's precedent exactly ("recalculate only what changed").
3. **In-flight coalescing already exists** (`createTtlCache` dedupes identical
   concurrent fetches) — N widgets referencing the same URL cost one request.
4. **Wikimedia etiquette as a backstop:** batched queries, TTL caches, and
   1s-pacing norms in `docs/SCALABILITY.md` bound the worst case; if boards
   grow past ~50 fetch widgets, couple referencing-only reload with a small
   stagger.

### Headwind 3 — Interface clutter

Precedent: Grafana keeps ALL variable controls in one dashboard-top bar — never
per-panel — and even so, dense variable rows are a known annoyance. Tableau's
action chains and Retool's event handlers are the cautionary tales. Rules for
WikiBento:
1. **One controls surface per board** (Board Controls cards), not scattered
   per-widget inputs. Multiple cards are fine (they write the same hub), but
   inputs never appear inside data widgets except as the Path-B click actions,
   which are invisible until click.
2. **Progressive disclosure everywhere:** param targeting (P2) behind the ⚙
   panel, collapsed by default; wiring visibility (P3) in ⓘ panels, not on the
   canvas; the only always-visible chrome is the controls the author chose to
   place.
3. **Kiosk mode is the clutter escape valve** — it renders exactly the controls
   the author placed and nothing else; interactive boards for museum walls are
   the flagship use case, and they show N controls, not N×M wiring UI.
4. **Budget rule:** if a board needs more than ~8 visible controls, that's a
   signal to split boards and use ISSUE-40 parameterized links between them —
   navigation over accumulation.

### Honest downsides of scoped params (so the write-up isn't a sales pitch)

1. **Divergent state:** the same param can hold different values per widget
   once overrides exist. This is powerful and confusing — provenance (ⓘ showing
   "category = Rijksmuseum, scoped to this widget") stops being optional and
   becomes load-bearing (ISSUE-41 anticipated this).
2. **Broadcast-by-default surprise:** without targets, a click affects every
   referencing widget — usually desired, occasionally not. The reverse map (P3)
   is the cure; ship it with targeting, not after.
3. **Name collisions:** two widgets using `{{category}}` for different intents
   share one value. Governance is documentation, not code (choose param names
   by role, not by target).
4. **Share-link size:** per-widget overrides in a `#/d/` hash can bloat URLs —
   may need the `?config=` hosted-JSON route for heavily-wired boards.
5. **localStorage ceiling:** no cross-device/multi-user sync — the standing
   Part 2 boundary, unchanged.

## Part 6 — Showing the wiring: complexity management for dense boards (2026-09-01)

Clarification first: "one controls surface" survives Path B. A click action on a
row is a **write into the hub**, invisible until the user clicks — it adds zero
permanent chrome. And because the wiring is *declarative* (config references,
spec targets), the widget-to-widget graph is **derived, not authored** — it can
always be recomputed from the dashboard JSON and can never drift from reality.
That single property makes every display option below cheap.

### The three tiers of wiring display (with precedents)

| Tier | What it is | Precedents | Effort |
|---|---|---|---|
| **A. Derived, read-only map** | a view computed from configs: controls → params → consumer widgets | **Airflow's DAG Graph View** (read/monitor, not author), Obsidian's graph view, community Observable-runtime visualizers | S — bipartite columns (controls \| params \| consumers), click-to-jump; our graph is a hub (depth-1 star), so a free-form layout isn't even needed |
| **B. On-canvas trace overlay** | arrows drawn ON the board itself, on demand, per control | **Excel's Trace Precedents/Dependents** (Formula Auditing tracer arrows — the canonical pattern: on demand, per cell, never all-at-once), **Figma prototype connections** (viewers see connections read-only) | M — we already have layout coordinates + live DOM rects; hover/click a control → SVG arrows to affected widgets. The "show me what this button affects" moment, visual |
| **C. Authoring canvas** | box-and-arrow as the EDITOR — wiring is the artifact | **Node-RED, Max/MSP, Unreal Blueprints**, React Flow apps | L — and it's a different paradigm: the canvas becomes the program (Part 2's Level 3). React Flow is the easy 10%; edge-authoring UX, validation, and layout persistence are the 90% |

**Recommendation:** build A now (it doubles as the P3 provenance surface — one
implementation, two jobs), B as the demo/kiosk showpiece (an Excel-style "trace
this control" is a board-explainer AND an educational feature), and treat C as
ruled out for the same reason as Part 2's Level 4: a hub graph doesn't need a
node editor. Free-form canvases exist to lay out arbitrary graphs; a star is
better served by columns and arrows-on-demand, at roughly a tenth the cost.

### Best practices for complexity management (from the survey)

1. **Derived > authored** — every wiring view must be computed from the configs,
   never stored separately (a stored graph drifts; a derived one can't).
2. **On-demand tracing over ambient display** — Excel shows arrows only when
   asked; Figma shows thin connection dots, full arrows on selection. Ambient
   hairballs (Node-RED at scale) are the failure mode to avoid.
3. **Zoom levels:** board (just controls + data) → ⓘ (this widget's drivers) →
   wiring map (whole board). Each level answers one question, no more.
4. **Status in the map, not the board** — Airflow's graph view shows run state;
   our map can later show each param's current value and each widget's data age
   (the ⏱ footer's data, reused).
5. **Complexity budgets** (from Part 5): ~8 visible controls; beyond that,
   split boards and connect with ISSUE-40 parameterized links — navigation over
   accumulation.

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


## Part 7 — Timing, freshness & multi-input policy (2026-09-05)

For widgets that consume multiple feeds (union/join transformers, #18's data
plane) the timing questions are: when to render, how long to wait, what to
show while waiting, what to do on partial failure, and how to cancel stale
work. Policy below — grounded in how the peer tools handle it (Grafana:
independent panels, per-query timeouts, no joins; TanStack Query: per-query
timeout/retry/staleTime; RxJS: combineLatest vs forkJoin vs merge; Prometheus:
per-query timeout + fixed staleness; CDN SWR: serve stale, refresh in
background).

### 0. The reframe — the hub dissolves most "waiting"

Outputs flow as *param writes*, not polls: a downstream widget runs when a
value is WRITTEN (reloadKey bump), not on a timer. Source A (fast) writes →
downstream runs with A; source B (slow) writes 40 s later → downstream runs
again with A+B. No union-level wait exists at the dataflow layer; each run
renders whatever has arrived and the state converges when the last writer
lands. This is the Grafana-not-Airflow choice (Part 2/3) paying off.

### 1. Per-input timeouts & retries — never a union-level timer

Each source keeps its own budget; a slow source degrades alone. Current
defaults in `fetchTextWithRetry` (dataSources.js): 15 s, 2 retries,
500 ms·attempt backoff; 4xx terminal (never retried); POSTs (MinT, 60 s)
retry 1× on 5xx/network only. Registry `loadingHint` communicates slow ops
("SPARQL may take up to 60 s").

| Class | Budget | Notes |
|---|---|---|
| REST summaries/thumbnails | ≤15 s | default |
| Batched imageinfo / media-list | ≤30 s | |
| SPARQL (WDQS/QLever) | ≤60 s | loadingHint set |
| MinT / LLM POSTs | ≤60–90 s, retries 1 | never retry 4xx |

A multi-input widget MAY declare an overall join budget for its `waitFor:
'all'` mode, but the default is incremental (rule 2) and per-input.

### 2. Render incrementally with per-input state — never all-or-nothing

Default semantics = combineLatest-with-progress: a union widget shows each
input's badge — ✓ fresh (with its own `_fetchedAt` stamp), ⏳ pending,
⚠ error — and composes whatever has arrived. Strict forkJoin semantics is an
opt-in `waitFor: 'all'`. Partial failure shows the healthy inputs + a clear
per-input error; it never blanks the whole card.

### 3. Never blank what you have; never let stale work win

- **SWR:** TTL caches serve repeat reads instantly (createTtlCache; labels
  24 h, MinT 24 h, wikistats 5 m). Widgets keep showing the last good value
  while a refresh is in flight.
- **Supersede:** `WidgetFrame.load()` claims `++loadSeqRef.current`; only the
  latest run may write state (success OR error), and unmount invalidates
  in-flight loads — a slow fetch from an old config can never clobber a
  newer result (ISSUE-54, PR #24). This is the load-bearing rule the moment
  widgets consume changing `{{param}}` feeds.

### 4. Etiquette & scheduling under the no-backend ceiling

- Auto-refresh is per-widget `setInterval`, NOT a scheduler (Part 2): no
  retries/backfills/DAG scheduling. Multi-input widgets rely on the cascade
  (rule 0) + caches, not on refresh timers, for cross-widget freshness.
- Rate limits: honor WMF 429 discipline; MinT ≥1 s pacing for bulk; TTL
  caches are the first line of defense; cap fan-out per refresh instead of
  spraying N parallel fetches (concurrency degrades CPU-bound MT inference).
- Jitter/stagger: prefer slightly offset auto-refresh intervals over N
  widgets refiring simultaneously on the hour.

### 5. Failure & honesty semantics

An input that times out or 422s shows its own error badge and retry
affordance; the union still renders healthy inputs. Errors are per-source
and attributed (which feed, which op) — never a bare "failed".

*End of document.*
