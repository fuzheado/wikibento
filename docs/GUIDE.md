# WikiBento — User Guide

*Building boards: the widget model, board params, and dataflow. Tight version —
for the spec see [JSON-FORMAT.md](JSON-FORMAT.md); for the design rationale see
[MODULARITY-AND-DATAFLOW.md](MODULARITY-AND-DATAFLOW.md).*

**See it first:** open `?config=/demos.json` — a guided index of demo boards, from the simplest article switcher to the GLAM and SPARQL flagships.

---

## 1. The model

A board is a document; widgets are cards. Three kinds of state, each with its own scope:

| | scope | where it lives | use it for |
|---|---|---|---|
| **Board params** | 🌐 board | top-level `params` block | an **input** several widgets must agree on (topic, language, month) |
| **Widget config** | 📍 one widget | that widget's ⚙ | **settings** only that widget cares about (display mode, refresh) |
| **Widget-to-widget** | 🔗 pairwise | `source` picker / `{{widget:id}}` | a value **derived** from another widget (excerpt → translate) |

**Rule: match the scope to the intent.** If two widgets must agree, use a param.
If only one widget cares, keep it local. If the value is computed from another
widget, wire a dataflow edge.

Params are board-global on purpose — one declaration, many readers, one click
re-aims everything. That is the feature; it is also the hazard (see §2).

## 2. Board params

**Declare once** (top level of the dashboard JSON):

```json
"params": {
  "topic":      { "label": "Article",  "type": "buttons", "options": ["Albert Einstein", "Marie Curie"], "value": "Albert Einstein" },
  "targetLang": { "label": "Language", "type": "buttons", "options": ["fr", "es", "de"], "value": "fr" }
}
```

**Reference anywhere** in any widget config with `{{name}}`:

```json
{ "widgetType": "excerpt", "config": { "article": "{{topic}}" } }
```

**Control it** with a **🎛️ Board Controls** card — it renders buttons, menus,
text fields, number sliders and month steppers. A click writes the value and
every widget referencing it reloads.

- **Definitions vs. values.** Definitions live in the board `params` block
  (shared). The current selection is the value. In the card's ⚙: *Params* edits
  the definitions (all cards read them); *Params on this card* picks **which**
  definitions this card renders.
- **Names are a shared namespace.** Two widgets using `{{category}}` for
  different intents silently share one value. **Name by role, not by target**
  (`article`, `targetLang` — not `category1`).
- **Broadcast.** A click affects every referencing widget. That's the point,
  but check who references a param before renaming or reusing it.
- **Types:** `buttons` · `select` · `text` · `number` (options `[min,max,step]`)
  · `month` (`0` = latest published month).

## 3. Dataflow — feeding one widget into another

A widget can **emit** an output; others consume it two ways:

- **`source` picker** (⚙) on consumer widgets — structured access.
- **`{{widget:<id>}}`** in any text field — the general path. Find the id in the
  header chip (click → ⚙), or click the *Insert a reference* chips under any
  text/textarea field.

Rules:

- The producer must emit. Today: **Text List, Filter Lines, Line Count, Value
  Display**, and **Article Excerpt** (its first paragraph).
- Consumers reload automatically when the producer's value changes; identical
  re-emits are no-ops.
- **An unresolved reference never reaches an API.** A fetching widget shows
  *"Waiting for a reference"* and loads the moment the producer emits.
- Arrays join with newlines — a list can feed a textarea field.

## 4. Worked examples

### Translate an article on demand — `?config=/translate-demo.json`

```
[article buttons] → [Article Excerpt] → [Translator] ← [language buttons]
```

```json
"params": {
  "topic":      { "type": "buttons", "options": ["Albert Einstein", "Marie Curie", "Ada Lovelace"] },
  "targetLang": { "type": "buttons", "options": ["fr", "es", "de"] }
},
"widgets": [
  { "id": "ctl-article", "widgetType": "boardControls", "config": { "show": "topic" } },
  { "id": "excerpt-src", "widgetType": "excerpt",       "config": { "article": "{{topic}}" } },
  { "id": "translate",   "widgetType": "translate",     "config": { "text": "{{widget:excerpt-src}}", "from": "en", "to": "{{targetLang}}" } },
  { "id": "ctl-lang",    "widgetType": "boardControls", "config": { "show": "targetLang" } }
]
```

Pick an article → the excerpt re-fetches and re-emits → the translator
re-translates. Pick a language → `to` re-resolves and the card re-translates.
Two cards, two scopes, one shared param namespace.

### List → filter → count → display — `?config=/flow-demo.json`

`Text List → Filter Lines → Line Count → Value Display` (via `source`). Edit the
Text List's lines; the whole chain updates.

### Params driving galleries — `?config=/params-demo.json`

Buttons, a number slider and a month stepper re-aim a Category Size card and a
CIM snapshot.

## 5. Widget-local settings

Everything else is per-widget and affects nothing else: article, project,
category, file, domain, display mode, icon size, refresh interval, and an
optional display-title override. Local state is not a lesser citizen — use it
freely; just don't duplicate a value that several widgets must agree on.

## 6. Sharing & persistence

- Layout and config persist in your browser; **↺ Reset** restores the starter board.
- **⬇ Export / ⬆ Import** round-trip the board as JSON.
- **🔗 Share** gives a QR code + link. `?config=<url>` loads a hosted config
  (any CORS-enabled URL, an on-wiki page, or a `w.wiki/…` short link);
  `#/d/…` embeds the whole config in the link.
- **⛶ Present** (kiosk, fullscreen) and **▣ Lean** (chrome-free, resizable)
  give a clean display; Esc or ✕ exits.

## 7. Troubleshooting

| symptom | cause → fix |
|---|---|
| *config not found (HTTP 404)* | wrong `?config=` path, or the file isn't deployed |
| *returned an HTML page, not JSON* | the server sent the app shell — the file doesn't exist at that path |
| *Waiting for a reference* | a `{{widget:id}}` producer hasn't emitted yet (or the id is wrong) — it loads automatically |
| A widget changed when I clicked another card | it references the same `{{param}}` (broadcast) |
| *views partial* / *N pages failed* | a budget or rate-limit guard — the number is a floor; refresh later |
| Stale page after a deploy | hard refresh (⌘⇧R); `index.html` is `no-cache`, assets are immutable |
| *HTTP 429 — rate-limiting this browser* | the app already backed off (paced, honored `Retry-After`, retried once). Wait ~a minute, then **Retry**. If *everything* 429s, your network (VPN / shared NAT) is throttled — try another network |
| Widget shows another error | the API refused; the card names the error and **Retry** re-runs it |

## 8. Cookbook

- **One control, many cards** — declare a param once, reference `{{name}}` wherever it matters.
- **Two independent selectors** — two params + two Board Controls cards, each scoped with *Params on this card*.
- **Feed a widget** — `{{widget:<producer-id>}}` in a text field (or use the reference chips).
- **Translate/speak an article** — excerpt emits its first paragraph; point a Translator or Speaker at it.
- **Chain onward** — a Translator's output can feed another consumer once it emits.
- **Paste a list** — Text List / Commons File Gallery / Article List take one item per line.
- **Embed a 3D model or any page** — Wiki Page → *Custom URL* (e.g. `https://objectium.toolforge.org/uploads/213`); http(s) only, framed with a sandbox.

## Where to go deeper

- Dashboard JSON spec — [JSON-FORMAT.md](JSON-FORMAT.md)
- Why the project exists (HyperCard lineage) — [PHILOSOPHY.md](PHILOSOPHY.md)
- Design decisions & the dataflow ladder — [MODULARITY-AND-DATAFLOW.md](MODULARITY-AND-DATAFLOW.md)
- Every API, cap and gotcha — [DATA-SOURCES.md](DATA-SOURCES.md)
