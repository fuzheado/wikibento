# How Widgets Talk — messaging models, past and present, and why WikiBento routes through a hub

*Written 2026-09-10 for outside readers: the short answer to "why can't widget A just
send a message to widget B?" — with the receipts. Companion to the deeper internal
analyses: `MODULARITY-AND-DATAFLOW.md`, `PARADIGMS.md`, `PHILOSOPHY.md`,
`TOOL-LANDSCAPE-SYNTHESIS.md` §4, and `WIDGET-DEVELOPMENT.md` (the Emitter Contract).*

---

## TL;DR

Widgets in WikiBento **do not message each other**. They share a small set of **named,
board-scoped values** (board params) and may publish **one-way, labelled outputs** that
other widgets consume by name. Writes come only from user gestures; an identical re-emit
is a no-op; there is no bus, no per-widget callback mesh, and no widget names another
widget except through a declared reference.

That is not a shortcut. Every mature dashboard tool converged on the same shape
(Grafana variables, Looker dashboard filters, Power BI slicers, Tableau parameters), the
1990s authoring tools that chose a message mesh instead are the ones whose authors
describe the mess, and the reason is structural: **the tools that loop are the tools with
edges.** A hub has no edges between widgets, so it cannot loop, cannot deadlock, and
cannot hide its wiring inside a component.

The same property is what makes a plugin system thinkable: a widget author needs the board's
**vocabulary**, not a mental map of every other widget (§8 — with the honest caveat that the
hub is only half the story; an *enforced, typed, distributable* contract is the other half).

---

## 1. The question, and why it keeps coming back

The intuition is reasonable and old: components on a canvas, plus a way for one to
affect another. Three different things hide under that intuition, and conflating them is
the source of most of the mess:

1. **Data flow** — "the list this widget produced is the input to that widget's query."
2. **Control flow** — "clicking a row here should re-aim what's over there."
3. **Presentation flow** — "put this widget's rendered picture inside that document."

Historical tools that let all three travel the same channel are exactly the ones that
became unmaintainable. WikiBento separates them: (1) is a declared, one-way
emitter→consumer edge; (2) is a write into the named hub by a user gesture; (3) is out of
scope — an emitter publishes *data*, never markup or rendered output (the Emitter
Contract).

## 2. A taxonomy of inter-component messaging

| Model | Exemplars | Addressing | Who may write | Loop risk | Validation |
|---|---|---|---|---|---|
| **Direct message passing / object messaging** | HyperCard `send … to`, ToolBook `send`, mTropolis modifiers, QuarkImmedia actions | by object name/path | any object, any time | **worst case** — the mesh *is* the program | none systemic; hidden by construction |
| **Message hierarchy (up and out)** | HyperTalk (button → card → background → stack → Home), Lingo (handler → sprite → cast → frame → movie), OpenScript | implicit upward path + `pass`/`forward` | any handler on the path | ordering/placement sensitive; a misplaced handler silently changes behaviour | none |
| **Broadcast events** | Smalltalk `changed:`/`update:`, Power BI cross-filter | anonymous, everyone listening | any sender | chatter, redraw storms | implicit `update:` contract, unchecked |
| **Typed listener callbacks** | JavaBeans, OLE connection points, ipywidgets `observe`/`link` | direct reference between two parties | either party | **none built-in** — mutually-linked widgets ping-pong | types yes (JavaBeans), graph no |
| **Wiring by reference to named shared state (hub)** | **Grafana variables**, Looker dashboard filters, Power BI slicers, Streamlit, **WikiBento params** | by name, in one place | controls (user gestures) | **structurally impossible** | name resolution + documented types |
| **Per-cell dependency graph** | Excel/Sheets, Observable, marimo | by cell/variable name | the cell that defines it (one writer) | possible → cycle *refused* (Excel default; Observable raises) | strongest: static graph |
| **Explicit source→target action edges** | Tableau actions, Retool/Appsmith handlers, Node-RED, Zapier | named source and target | the author, as edges | **real and common** (Node-RED loops, CPU spikes) | capped vocabularies |
| **Service / event bus** | CORBA Event & Notification Service, enterprise buses | channel, anonymous | any producer | broker-dependent; back-pressure and ordering become your problem | untyped `Any` payloads defeat it |

Two familes of *wiring* sit on the right of that table: things where a component names
its peers (rows 1–2, 4, 7–8) and things where components only know a **name in a shared
namespace** (rows 5–6). The second group is where the survivors live.

## 3. The historical inventory — what each tool actually wired, and what broke

**HyperCard (Apple, 1987).** A button's script handles an event; if it doesn't, the event
is offered to the card, then the background, then the stack, then Home, then HyperCard
itself; `pass` forwards it along; `send <msg> to <object>` reaches sideways by name.
*Why it worked:* a handler at one level served every object beneath it, so non-programmers
built real applications. *What broke:* no classes or instance variables, so reuse meant
copying (MacTech, 1990, on HyperCard's lack of true OOP); nothing was validated statically;
`send` hid cross-object coupling; and third-party XCMDs without defensive error handling
could crash the system. Apple killed it in 2004 — the *card* survived as the widget.

**Macromedia Director + Lingo (1985→2017).** Same shape as HyperCard: an event is offered
to primary handlers, then the sprite, cast member, frame and movie levels, stopping at the
first handler unless it `pass`es. Director 6 (1997) added Behaviors (instantiated scripts
with their own properties). *What broke:* behaviour depended on **where** handlers sat and
whether they passed — dispatch is order- and placement-sensitive, exactly the class of bug
that is invisible in the authoring tool. Adobe ended Director in 2017.

**mTropolis (mFactory, 1995; Quark 1997→cancelled 1998).** Sections, subsections and
scenes held assets; **behaviors and modifiers were dragged onto assets, and interaction was
built by "making different modifiers send messages to each other."** Its Miniscript
language *deliberately omitted* control constructs such as conditional loops, on the theory
that everything should be visual — a third-party "Alien Studio" modifier had to fill the
gap. Authoring was Mac-only and its binary format wasn't cross-platform. Users raised
millions of dollars to try to buy it back after Quark killed it. *Note:* the repo's own
`PARADIGMS.md §2` lists this as its own paradigm — **"Object / message-passing —
'Objects trigger each other; behavior is composition'"** — with a table row and a death
date, which is the cleanest way to see it: the paradigm is real, and it is finished.

**QuarkImmedia (Quark, 1995/96).** A QuarkXPress add-on where page objects became
"interactive objects" carrying menu-chosen actions plus a scripting language; output went to
a proprietary player format, not HTML. Contemporary reviews called the toolset extremely
complex with an unintuitive interface and output glitches; it failed within about two years.

**Apple Media Tool (1992) + Programming Environment.** Screens in a map; media dragged on;
links created; menu-chosen responses to clicks; hypertext linking of keywords to media.
Serious interactivity required a **separately purchased** Programming Environment (a
compiler/debugger for an Eiffel-based language). Its installed base was tiny (around 10,000
by one developer's recollection), and Apple ended it. *Uncertain:* the rights-transfer story
afterwards (Wikipedia says Havas; other accounts say the original developer reacquired it and
relaunched it as iShell) — flagged, not asserted.

**Authorware (1987→Adobe).** The outlier that avoided messaging entirely: a **flowline of
icons** (Display, Interaction, Decision, Calculation…). Icons don't message each other —
execution flows one way along the line, and sharing happens through **global variables**.
*What broke:* no encapsulation; coupling through global names means ordering and name
collisions are the failure mode. (Same disease as messaging, different vector.)

**Asymetrix ToolBook (1990).** OpenScript handlers on objects, with a hierarchy
objects → page → background → book → system books. The manual warns repeatedly that you
must `forward` system-generated messages or the controlling system books never see them —
i.e. **forgetting one word silently breaks add-on behaviour**: a hidden dependency, by design.

**OpenDoc (Apple/IBM/WordPerfect, 1993–1997).** Documents as containers of **parts**;
parts were SOM objects, the shell dispatched UI events to `ODPart::HandleEvent`, and parts
received lifecycle/link callbacks (`FrameShapeChanged`, `LinkUpdated`, …), with explicit
link-vs-embed semantics. Technically admired — even Microsoft's partners conceded it beat
OLE — and killed anyway in March 1997 ("put a bullet through [OpenDoc's] head"); Cyberdog,
its parts-built internet suite, died with it. `TOOL-LANDSCAPE-SYNTHESIS.md §4` maps parts →
widgets row by row and draws the lesson we still use: **a component contract makes a market,
but distribution beats design** — so our contract is JSON + HTTP + the browser, owned by no one.

**The component-object era, in one breath.** OLE/COM/ActiveX gave binary vtables,
in-place activation, `IDispatch` late binding and multicast event sinks — with registry
hell, reference-counting bugs, failures deferred to runtime, and Windows-only reach.
VBX→OCX→ActiveX churn orphaned a generation of controls. JavaBeans fixed the typing
(typed `EventObject`s, listener interfaces) but stayed point-to-point, with boilerplate and
listener leaks. Apple events/AppleScript showed the best and worst of typed IPC: a real
cross-app message model with dictionaries that were word lists rather than documentation.
NeXTSTEP's Interface Builder chose static, inspectable wiring (outlets, target/action) and
accepted its cost: a broken connection is a runtime crash. Smalltalk's `changed:`/`update:`
gave us the observer pattern, an implicit untyped contract, and redraw chatter.
CORBA's Event Service put an anonymous channel in the middle — and untyped `Any` payloads
defeated the typing the channel was meant to preserve.

## 4. Why that "obvious" model isn't right now

Seven concrete reasons, each with a receipt from the record above:

1. **The wiring becomes the program.** In a mesh there is no artifact you can read to
   know what a board does; behaviour lives inside components. HyperCard's `send`, mTropolis's
   inter-modifier messages and ToolBook's `forward` are all cases where *the connections*
   are the logic.
2. **Ordering is invisible and load-bearing.** Lingo decides which handler wins by *where it
   sits*; ToolBook silently breaks add-ons when a `forward` is missing; Tableau's UI hides
   action order ("sometimes… the order of operations dictates that they be executed in a
   different order, which gives you unexpected results").
3. **Edges are where the loops live.** Node-RED users wire function-node loops and hit CPU
   spikes; Tableau documents no cycle detection for filter actions; ipywidgets `link` is
   bidirectional with no graph, so mutually-linked widgets ping-pong. Hub models *structurally
   cannot* loop — that is the single strongest argument for the hub, and it is free.
4. **Reuse dies when a component names its peers.** HyperCard had no classes; a widget that
   refers to "the pageviews widget" can never be dropped into someone else's board.
5. **Boards must serialise.** A WikiBento board is text: JSON in localStorage, a `?config=`
   URL, a `#/d/…` link, and — increasingly — something an LLM assembles. Live wires and
   callbacks don't round-trip; named values do. (Same reason the Ask path can only generate
   what it can express declaratively.)
6. **Authoring and reading cost.** Event-handler hairballs (Retool/Appsmith) and action chains
   (Tableau) are the field's most-cited usability complaints; Yahoo Pipes' autopsy was
   social, not technical — expressive chaining without a named-state hub is hard for
   non-programmers, and it was shut down rather than monetised.
7. **Runtimes die; config survives.** Apple killed HyperCard, Media Tool and OpenDoc; Quark
   killed mTropolis; Adobe ended Director and Flash. In every case the *ideas* outlived the
   tool. Keeping the wiring declarative — a JSON document on an open substrate — is what
   makes our model portable across whatever executes it next.

## 5. How WikiBento does it, exactly

Two layers, both declarative, both plain JSON.

**The hub: board params.** A board may declare a top-level `params` block
(`{ name: { label, type, options, value } }`, `type` ∈ buttons | select | text | number |
month; `docs/JSON-FORMAT.md:22`, `src/lib/params.js:23-39`). Live values sit in App state and
are written by `handleSetParam`, which updates state, persists, and bumps `reloadKey`
(`src/App.jsx:439-453`). **Only the Board Controls renderer ever receives the writer
callback** (`docs/ISSUES.md:2139-2143`). Every widget resolves `{{name}}` in its string
config once per render, on the **data path only** — the ⚙ editor keeps the raw config, so
editing a field can never bake a resolved value into stored JSON
(`src/widgets/WidgetFrame.jsx:68-79`). Unknown names stay literal with one warning
(`src/lib/params.js:118-124`).

**The edge: one-way, labelled outputs.** A registry entry may declare
`emit(data, config) => value` with an `outputs: { kind }` tag, `kind` ∈
`extract | lines | count | value`. After every load, `WidgetFrame` publishes the emitted
value into App state (`WidgetFrame.jsx:206-216`). Consumers read it two ways: a structured
`source` field (passed to fetch/transform as `opts.sourceOutput`) or `{{widget:<id>}}`
interpolation in any string field; arrays interpolate newline-joined so a list can feed a
textarea (`src/lib/params.js:92-153`). The `source` picker lists only widgets that declare
`emit`, excluding the widget itself (`src/App.jsx:465-477`).

**The three rules that keep it loop-free:**

- **Equality-gated writes.** `handleWidgetOutput` returns the previous state unchanged when
  the value is deep-equal to the last one (`src/App.jsx:456-463`) — an identical re-emit is a
  no-op and causes no re-render.
- **Content-based signatures.** Each consumer computes a signature of the outputs it
  references and reloads only when it changes (`src/lib/dataflow.js`), so no
  emit → reload → emit storm (`docs/ISSUES.md:2282-2289`).
- **Write only on user gesture.** Params are written by controls; fetch/render/timers never
  write (`docs/MODULARITY-AND-DATAFLOW.md:329, 350-353`).

**Status: a convention, not a constitution.** The freshness and temporal-scope rules are
build-breaking constitutions, enforced by `tests/scope-compliance.test.mjs`. The Emitter
Contract is a convention with one automated guard — the output-kind allowlist in
`tests/manifest-compliance.test.mjs:114-127` (`docs/WIDGET-DEVELOPMENT.md:43-48`).

## 6. Side by side with today's tools

| Tool | Mechanism | Cross-component influence | Notes |
|---|---|---|---|
| **Grafana** | Dashboard variables are the hub; data links let a panel *write* a variable (with "include all variables") | **through variables**, by construction one-way | The only panel→panel path is the **`-- Dashboard --` data source**, which re-serves another panel's *result set* for re-visualisation — a query-dedup device, not a control channel (["Share query results with another panel"](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/share-query)). Documented pain: a broad variable re-queries **all** referencing panels at once. |
| **Tableau** | Actions: filter / highlight / URL / parameter, wired source→target | explicit edges, **capped vocabulary** | Order-of-execution invisible; parameter actions silently refuse in some selection states |
| **Power BI** | Broadcast cross-filter by default; per-target override; slicers as hub | broadcast, anonymous | Filter-context confusion is the signature complaint; slicers and the Filters pane duplicate each other |
| **Looker** | Dashboard filters hub; filter-only fields; per-tile opt-in | through filters | Overlap rules between dashboard- and tile-level filters are subtle |
| **marimo** | Static DAG over global variables — **every global defined by exactly one cell** | name → name, one writer | Mutations deliberately untracked ("tracking mutations reliably is impossible in Python"); `_`-prefixed locals are the escape hatch |
| **Observable** | Named cells, inferred edges | name → name | A cycle is a hard `RuntimeError`, not a hang |
| **ipywidgets / traitlets** | `observe`, `link`/`dlink`, `jslink` | direct wiring or callbacks | No graph, no cycle detection; ordering is the author's problem |
| **Node-RED** | `msg` objects along wires; context stores | direct wiring | No structural validation; documented advice is to pass data in `msg` and avoid context (races under load) |
| **Yahoo Pipes (2007–2015)** | Positional operator chaining | the wire itself | No shared state; subgraphs duplicated for reuse; shut down |
| **Excel / Sheets** | Per-cell references; recalc when precedents change | cell → cell | Circular references **refused by default**; iterative calculation is an explicit opt-in — the closest analogue to our equality gating |
| **WikiBento** | Named params hub + declared one-way emit→consume, equality-gated | through the hub **and** declared edges | Nodes: sources → controllers/transformers/reducers → displays |

**Where we sit.** Closest to Grafana (a hub, and a deliberate refusal of a control API
between widgets) and to marimo (named single-writer state, no callbacks) — with one
distinction we can claim: the equality gate is an API-level contract, not just an
implementation detail. Neither Grafana nor marimo documents "an identical re-write is
ignored" as a guarantee; Excel gets the effect from precedent-tracking, and reactive
notebooks get it from content-addressed cells. Our version is stated and tested.

## 7. Designing future widgets: the checklist

1. **Read what you need from the hub** (`{{param}}`) — never reach for another widget's
   internals.
2. **Consume through `source` or `{{widget:<id>}}`** — declared, one-way, no callbacks.
3. **Emit data, never presentation.** Declare `outputs.kind`; publish the smallest value that
   is true (the Emitter Contract, `docs/WIDGET-DEVELOPMENT.md:43-120`).
4. **Never write state from fetch, transform, render or a timer.** User gestures only.
5. **Cap the action vocabulary** — "click a row → set a param" is the whole action layer;
   Tableau's lesson is that a small vocabulary stays comprehensible.
6. **Keep everything serialisable and small** — it is copied into board state, persisted,
   hashed for change detection, and (on Ask-assembled boards) counted against a token budget.
7. **If you think you need a bus, change the board instead.** A widget asking to talk to
   arbitrary peers is almost always a composition problem.

## 8. Does the hub model actually help third-party widget authors?

The claim to test: *with widget-to-widget messaging, every new widget author has to
dissect how all the other widgets work and how they interconnect; with a hub, authorship
stays local — so the hub is what makes a plugin system feasible.*

**Verdict: mostly true, but for a narrower reason than it sounds — and the hub alone does
not get you there.** The decoupling is real and quantifiable. But a hub replaces *peer
coupling* with *shared-namespace coupling*, which is a different hazard, and it does
nothing about the four things that actually block third-party authorship today.

### Where the claim holds

1. **The author's knowledge surface is O(N), not O(N²).** A widget written against a hub
   declares the names it needs (`{{category}}`) and the one source it consumes. A widget in
   a mesh must know its peers *and* be known by them: with N widgets, the wiring knowledge
   is pairwise. That is precisely why the mTropolis/HyperCard lineage became unmaintainable —
   the author of widget 40 inherits a web of 39 existing behaviours.
2. **Widgets become unit-testable in isolation.** A hub widget can be exercised with raw
   config + resolved params + one output value; there are no peers to stand up. Our own
   `tests/dataflow.test.mjs` does exactly this — it constructs outputs directly instead of
   booting a board of interdependent widgets.
3. **The graph is derived, not authored** (`MODULARITY-AND-DATAFLOW.md:427-429`), so tooling
   can reason about a board **without executing it**: validators, the Ask manifest, and an LLM
   assembling a board all read the same declarative structure. A callback mesh has no such
   static form; you cannot prompt an LLM to generate one safely.
4. **The historical contrast is the proof.** HyperCard had no classes or instance variables,
   so reuse meant copying; mTropolis's power *was* the inter-modifier message web, which is
   also why nothing was portable. At the other pole, OpenDoc's parts interoperated through a
   **formal contract** (SOM part interfaces), and that contract is what produced a parts
   *market* — PartBank, Component 100 (`TOOL-LANDSCAPE-SYNTHESIS.md §4`).

### Where the claim is weaker — four liabilities, honestly

1. **A hub is a global namespace, i.e. the Authorware disease.** Coupling by name means name
   collisions, and a rename silently breaks every consumer that you cannot see. Our
   mitigations are partial: unknown names stay literal with one warning
   (`src/lib/params.js:118-124`), Board Controls can be scoped to a subset of params
   (ISSUE-59, `params.js:207-211`), and only user gestures write. But a plugin author still
   cannot discover *which other widgets* will react to a param they add — the board's
   vocabulary is shared, not owned.
2. **The boundary is text-shaped and weakly typed.** `extract | lines | count | value` carry
   prose, lists, numbers and pass-through strings. ISSUE-58 already documents the ambiguity
   this creates for consumers. A plugin ecosystem wants typed ports (`rows:image`,
   `count`, `url`) — which is exactly the manifest-v4 direction in `MEDIA-DATAFLOW.md`.
3. **The contract is not fully enforced.** The Emitter Contract's requirements (a consumer
   must exist; a new kind needs doc tables and an `askManual` phrase) are **prose**; the only
   automated guard is the output-kind allowlist in
   `tests/manifest-compliance.test.mjs:114-127`. First-party code gets review; third-party
   code will not. Conformance has to become a test (`assertContract`, `MODULARITY-AND-DATAFLOW`
   Appendix A) before strangers ship widgets.
4. **Today a widget is still a code change.** A widget = registry entry + fetcher + card in
   `src/` + regenerated manifest — i.e. fork-and-PR, not authorship. The messaging model
   cannot fix that; a plugin mechanism can (declarative widget definitions, or sandboxed
   module loading with a stable plugin API and a trust model). Grafana — the closest peer —
   has the largest third-party panel ecosystem in this space, and it got there with a stable
   plugin API *plus* a signature/trust story. The counter-lesson from the object era is
   ActiveX: code with full permissions in the host's process, which crashed hosts and made
   distribution dangerous. **Declarative-first is the safer plugin substrate**, with code
   plugins as an explicitly trusted exception.

### The modularity axis, side by side

| Approach | Author's knowledge burden | Reuse story | Contract | Third-party ecosystem |
|---|---|---|---|---|
| HyperCard | own object + the hierarchy above it | copy the object | none | stacks shared, no component market |
| mTropolis | the whole modifier web | re-attach behaviours | none enforced | none survived |
| OpenDoc + SOM | the part interface | part into any document | **formal, cross-vendor** | PartBank, C100 — a real (brief) market |
| OLE/ActiveX | interface + host rules | control into any container | formal, but heavy | **large** (VBX/OCX) — and the first ecosystem to pay for it, once the web made control distribution frictionless: **signed native code with the user's full privileges and no sandbox** |
| JavaBeans | listener interfaces | bean into any builder | typed, point-to-point | BeanBox never took off |
| Grafana | variables + plugin API | panel plugin anywhere | formal + **signed** | **large and alive** |
| Node-RED | `msg` shape per node | node into any flow | informal, by convention | **large** (npm) |
| Yahoo Pipes | the chain | clone a pipe | none | remixing, no marketplace |
| marimo / Observable | name in a namespace | cell into any notebook | one-writer rule | no plugin market |
| **WikiBento today** | **names it needs + one source** | **registry entry on any board** | **constitution + convention (partial)** | **none yet — fork-and-PR** |

The pattern: the tools with a **hub *and* an enforced, distributable contract** grew
ecosystems (Grafana, Node-RED, and historically OLE/ActiveX — whose ecosystem existed first as retail VBX/OCX controls, and whose *internet-era* turn shipped signed native code with the user's full privileges and no sandbox, which is where the security bill came due).
Tools with a hub and no contract (Yahoo Pipes) or a mesh and no contract (mTropolis) did not.
Our hub is the precondition; the contract and the distribution channel are the missing half.

### What a plugin future would need (in order)

1. **Enforce the contract as a test**, not prose: consumer-exists, shape compatibility,
   `outputs.kind` (partly done), plus a widget-level `assertContract()` at registration.
2. **Type and namespace the boundary** — typed params/outputs (or a documented namespace
   convention with validation warnings), so a plugin can't silently collide.
3. **A serialisable widget definition** (or sandboxed loading) with versioning, so a widget
   can be authored and validated without a code review against `src/`.
4. **Publish the manifest as the interface** — the same manifest that feeds Ask becomes the
   discoverability layer a plugin author writes against.
5. **A trust model.** Declarative-first; code plugins signed and opt-in; never full
   permissions in the host process by default. Signing alone is not a safety property: in
   ActiveX, verification *worked* — the certificates were valid, the warnings appeared, and a
   properly signed demonstration control still formatted a floppy drive live on stage at JavaOne
   in 1997. Trust-by-reputation without a sandbox only tells you who to blame afterwards.

**Bottom line:** the messaging architecture removes the reason third-party authoring was
impossible in the CD-ROM era (the N² knowledge web), and gives us the derived graph that
validation, tooling and LLM assembly need. It is **necessary but not sufficient**: what
gates actual plugin authorship is a contract that is *enforced and versioned*, typed
boundaries, a trust model, and a distribution channel. Those are engineering decisions we
can still make cheaply, because the hub keeps the interface small.

## 9. Honest limits, stale claims, and open questions

Things this model does **not** give you: event-stream-driven reactivity at high frequency
(see `docs/MEDIA-DATAFLOW.md` and the live-edit stream issue), cross-board shared state,
durable pipelines or scheduling — a closed tab ends the chain, which is the deliberate
consequence of having no backend (`MODULARITY-AND-DATAFLOW.md:130-148`).

Three claims in our own docs are now **stale or undefined**, and are worth fixing rather
than papering over:

1. **"There are no widget→widget edges"** (`MODULARITY-AND-DATAFLOW.md:329, 339-343`) was
   true when written; ISSUE-52 has since added exactly that edge kind. The loop-freedom
   argument still holds — but it now rests on *equality gating + user-gesture-only writes*,
   not on the absence of edges. It should be restated.
2. **One-writer semantics for outputs is not documented.** The one-writer rule is written
   for params; for emitted outputs it is implicit in the code (`App.jsx`'s keyed map).
3. **"Hub and spoke" is applied to the params layer but never defined for the shipped output
   model** — nor is there an explicit rejection statement using the words "message bus"
   (the docs say "general message-passing" / "a general bus" / "event bus").
   Also minor: `src/lib/dataflow.js` cites ISSUE-51 for widget dataflow while the docs define
   it as ISSUE-52 (ISSUE-51 is the Article Gallery).

### Sources

Repo: `docs/MODULARITY-AND-DATAFLOW.md` (Parts 3 & 5), `docs/PARADIGMS.md` §2–3,
`docs/PHILOSOPHY.md`, `docs/TOOL-LANDSCAPE.md`, `docs/TOOL-LANDSCAPE-SYNTHESIS.md` §4,
`docs/WIDGET-DEVELOPMENT.md`, `docs/ISSUES.md` (ISSUE-50/51/52/58/59).

External (the load-bearing ones): mTropolis paradigm, modifiers and release history —
[Wikipedia](https://en.wikipedia.org/wiki/MTropolis) and mirrors; HyperCard message order —
[hypercard.center HyperTalk reference](https://www.hypercard.center/HyperTalkReference/hypertalkbasics/The-message-passing-order);
HyperCard's lack of OOP — [MacTech 1990](https://preserve.mactech.com/articles/mactech/Vol.06/06.08/HyperCardOOP/index.html);
OpenDoc part methods and callbacks —
[OpenDoc Class Reference](https://dev.os9.ca/techpubs/mac/ODClassRef/ODClassRef-412.html);
Grafana query sharing — [Grafana docs](https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/share-query);
marimo reactivity rule — [marimo docs](https://docs.marimo.io/guides/reactivity).

*Uncertainty flags:* mTropolis's introduction year is given as 1995 by Wikipedia (v1.0,
January 1995); the "1994" in some retellings is unverified. Apple Media Tool's post-Apple
rights history is contested. Director's `tell the sprite` appears in field use but no
version of introduction was located. Authorware's inter-icon notification beyond shared
variables is unverified — treat "globals are the channel" as the documented shape, not a
complete specification.
