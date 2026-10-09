# Dashboard JSON Format — Specification v1

**Served twin:** <https://wikibento.toolforge.org/board-guide.md> — this specification *plus* the generated catalog,
the reference grammars and the gates, assembled for anything writing a board from outside WikiBento
(`npm run guide:board`; `scripts/board-guide.mjs` includes this file verbatim, so the two cannot drift).

The dashboard configuration format used by **Export**, **Import**, and
`localStorage` persistence. Validated at runtime by
`src/lib/dashboardConfig.js` (`validateDashboard`); machine-readable schema at
[docs/dashboard.schema.json](dashboard.schema.json).

## Top Level

```json
{
  "version": 1,
  "params": { ... },
  "widgets": [ ... ],
  "layout": [ ... ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `version` | integer | optional | Must be `1` (or absent — treated as 1). Reserved for future migrations |
| `params` | object | optional | Board params (ISSUE-50): `{ name: { label, type, options, value } }`, `type` = `buttons` \| `select` \| `text` \| `number` (options `[min, max, step]`) \| `month` \| `lookup` (ISSUE-67: add `source`, e.g. `cim-category`, `commons-category`, `commons-file`, `article`, `wikidata-item`; `options` becomes an optional curated shortlist). Widget configs reference them with `{{name}}`; a `boardControls` card renders them |
| `widgets` | array | ✅ | **May be empty** — a blank board (the Reset dialog can start you on one, and the UI shows an empty state). Otherwise see [Widget](#widget) |
| `layout` | array | ✅ | May be empty (widgets auto-place); see [Layout Item](#layout-item) |

## Widget

```json
{
  "id": "example-pageviews",
  "widgetType": "pageviews",
  "config": { "...": "..." }
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | ✅ | Non-empty, **unique** across `widgets`. Used to match `layout[].i` |
| `widgetType` | string | ✅ | One of the registered types (below) |
| `config` | object | optional | Per-type config; missing fields fall back to the widget's defaults |

### Registered widget types and their config

| widgetType | Config fields | Type / allowed values |
|---|---|---|
| `pageviews` | `article` | string (e.g. `Main_Page`) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` \| `commons.wikimedia` |
| | `displayMode` | `stat` \| `trend` |
| `linkcount` | `domain` | string (e.g. `Libretexts.org`) |
| | `wiki` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` |
| `categorySize` | `category` | string (with or without `Category:` prefix) |
| | `wiki` | `commons.wikimedia` \| `en.wikipedia` |
| | `sampleCount` | number, integer 0–24 (0 = no photo sample; Commons only) |
| `wikistats` | `table` | `wikipedias` \| `wiktionaries` \| `wikisources` |
| | `lang` | `en` \| `de` \| `fr` \| `ja` \| `zh` \| `es` \| `ar` \| `pt` \| `ru` \| `it` |
| `fileUsage` | `filename` | string (with or without `File:` prefix) |
| | `topN` | number, integer (rows shown) |
| | `showImage` | boolean (image preview) |
| | `showCaption` | boolean (file summary text) |
| `topWikipedias` | — | no config fields |
| `listSource` | `title` | string (optional card title) |
| | `items` | string, one line per list item (EMITTED to the board — see Dataflow below) |
| `filterLines` | `source` | widget id of an emitting widget on the board |
| | `pattern` | string (match text) |
| | `match` | `contains` \| `equals` \| `starts` \| `ends` |
| | `caseSensitive` | boolean |
| `lineCount` | `source` | widget id of an emitting widget on the board |
| | `label` | string (optional stat label) |
| `echo` | `source` | widget id of an emitting widget on the board |
| | `title` | string (optional card title) |
| `glamorgan` | `category` | string (Commons category tree) |
| | `depth` | number, integer 0–12 (subcategory recursion) |
| | `year` / `month` | numbers (pageview range; data starts 2015-08) |
| | `negcats` | string, pipe-separated categories to exclude |
| | `negdepth` | number, integer (exclusion depth) |
| | `fileBudget` | number, integer 50–30,000 (files walked via the PetScan relay; the self-walk fallback caps at 1,000; capped trees labeled) |
| | `topN` | number, integer 1–10 (filmstrip size) |
| | `showDetail` | boolean (top-file per-page usage table) |
| `markdown` | `text` | string, Markdown (static widget — no fetch) |
| `boardControls` | `title` | string (card title) |
| | `spec` | string, one param per line: `name \| type \| Label \| options` — saving rewrites the board `params` block |
| | `show` | string, comma-separated param names rendered on **this** card (empty/absent = all) — split controls across cards, e.g. one card for the article and one for the language (ISSUE-59) |
| `topPages` | `lang` | 28 Wikipedia language codes (`en`, `de`, `fr`, …) |
| | `dateMode` | `latest` \| `day` \| `month` \| `year` (hatnote data updates ~02:00 UTC) |
| | `topN` | number, integer 1–100 (0/100 = all) |
| | `filterNoise` | boolean (drop sponsored TLD/spam pages) |
| | `showExpanded` | boolean (120px thumb + intro per row) |
| `excerpt` | `article` / `project` | string (REST `/page/summary`) |
| `edithistory` | `article` / `project` | string; `limit` number |
| `quality` | `article` / `project` | string (Lift Wing ORES class) |
| `assessments` | `article` / `project` | string; `topN` number |
| `gallery` | `article` / `project` | string (REST `/page/media-list`) |
| | `displayMode` | `grid` \| `list` |
| | `iconSize` | `small` \| `medium` \| `large` |
| | `imageFit` | `contain` \| `cover` |
| | `minSize` / `maxItems` | numbers (px filter / row cap; 0 = all) |
| `panorama360` | `filename` | string, Commons file (2:1 / GPano) |
| | `project` | `commons.wikimedia` |
| | `autoRotate` | boolean |
| `gallery` | `files` | string, one Commons file per line (textarea) |
| | `order` | `listed` \| `random` \| `alpha` \| `largest` |
| | `displayMode` | `grid` \| `list` |
| | `iconSize` / `imageFit` | as `gallery` |
| | `maxItems` | number (0 = all) |
| `articleList` | `articles` | string, one article title per line (textarea) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` |
| | `enrich` | boolean (batched thumbs + intros) |
| | `maxItems` | number (0 = all) |
| `wikiPage` | `url` | string, any embeddable http(s) URL (custom mode — overrides the page fields; framed with `sandbox`; ISSUE-62) |
| | `page` | string, any namespace (e.g. `Help:Introduction`) |
| | `project` | `en.wikipedia` \| `de.wikipedia` \| `fr.wikipedia` \| `commons.wikimedia` |
| | `mobile` | boolean (`?useformat=mobile` — MobileFrontend mobile view on the same domain) |
| | `fragment` | string, optional `#anchor` |
| `cimStats` | `subject` | `category` \| `file` — which arm the card uses (default `category`) |
| | `category` / `scope` | string (CIM-registered) · `deep` \| `shallow` (`subject: category`) |
| | `filename` / `wiki` / `showImage` | string (Commons file) · `all-wikis` \| project · boolean (`subject: file`) |
| | `month` | number (default: last complete month) |
| `cimTrend` | `subject` | `category` \| `file` (default `category`) |
| | `category` / `scope` / `months` | string · `deep` \| `shallow` · number 2–24 (`subject: category`) |
| | `zeroY` | boolean — Y axis starts at 0 (`subject: category`) |
| | `filename` / `wiki` | string (Commons file) · `all-wikis` \| project (`subject: file`) |
| | `month` | number (default: last complete month) |
| `cimRanking` | `facet` | `files` \| `wikis` \| `pages` \| `editors` \| `categories` |
| | `category` / `scope` | string (CIM-registered) · `deep` \| `shallow` (hidden for `facet: categories`) |
| | `wiki` | `all-wikis` \| project (`facet: files` \| `pages` \| `categories`) |
| | `editType` | `all-edit-types` \| `create` \| `update` (`facet: editors`) |
| | `topN` | number (`facet: files` \| `wikis` \| `pages` \| `editors`) |
| | `highlight` | optional category (rank shown if in top 100; `facet: categories`) |
| | `month` | number (default: last complete month) |
| `sparql` | `preset` | preset id (fills `query` + `endpoint`; see src/lib/sparqlPresets.js) |
| | `query` | string, SPARQL (textarea; empty uses the preset's) |
| | `endpoint` | `wdqs` \| `qlever-commons` \| `humaniki` |
| | `renderer` | `auto` \| `stat` \| `bar` \| `line` \| `table` |
| | `maxRows` | number, integer (row cap) |
| `waybackGallery` | `url` | string (any website) |
| | `dates` | string, one YYYY-MM-DD per line (≤24) |
| | `toleranceDays` | number (default 30; gates "within tolerance" tiles) |
| `mediaPlayer` | `files` | string, one Commons file per line (video or audio) |
| | `mediaType` | `auto` \| `video` \| `audio` |
| | `quality` | `auto` \| `240` \| `480` \| `720` \| `1080` (height-based; auto = largest ≤1080p) |
| | `loopPlaylist` | boolean (wrap end → start; single file = native loop) |
| | `shuffle` | boolean (Fisher-Yates per playlist change) |
| | `autoplay` | boolean (browsers need one click first — ▶ Start pill) |

**Every widget** additionally accepts:

| Field | Type | Rules |
|---|---|---|
| `refreshSeconds` | number | ≥ 30 (the app's auto-refresh interval; API etiquette floor) |
| `_title` | string | Optional display title override for the header |

**Unknown config keys** are tolerated (forward compatibility) but flagged as
warnings by the validator.

> The canonical widget-type list and per-type config vocabulary live in
docs/dashboard.schema.json and the `WIDGET_TYPES` registry
(src/widgets/index.js) — the runtime validator enforces them; keep this
table in sync when adding a widget.

## Layout Item

```json
{ "i": "example-pageviews", "x": 0, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 }
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `i` | string | ✅ | Must **match a widget id**; unique per layout |
| `x`, `y` | number | ✅ | Grid coordinates (12-column grid, row height 80px) |
| `w` | number | ✅ | Width in columns; 1–12 (out of range → clamped, warning) |
| `h` | number | ✅ | Height in rows; ≥ 1 |
| `minW`, `minH` | number | optional | Minimum size for the resize handle; ≥ 1 |

## Widget-to-widget connections (Dataflow)

Beyond board params, a widget can **emit** its output and another widget can
**consume** it two ways (see docs/ISSUES.md ISSUE-52):

1. **`source` config field** on the consuming widget (e.g. `filterLines`,
   `lineCount`, `echo`) — set it to the **id** of any widget on the board
   that emits. The producer's output reaches the consumer's `transform` as
   `opts.sourceOutput` and consumers re-fetch automatically when it changes.
   In JSON it's a plain string: `"config": { "source": "flow-list", ... }`;
   in the ⚙ panel it's a **combobox** — dropdown of emitting widgets (by
   instance id) **and** manual id typing.
2. **`{{widget:<id>}}` interpolation** — the same deep-string mechanism as
   `{{param}}` board params, resolvable in ANY string config field. Arrays
   join with newlines, so a Text List's lines can feed a multi-line textarea
   field directly:
   `"config": { "articles": "{{widget:flow-list}}", ... }`
   Unknown widget ids are left literal (never break a board) — but a widget
   that **fetches** will not send an unresolved placeholder upstream: it shows
   a waiting state instead (**"Nothing selected yet"** when the producer is a card
   that simply has not sent a value yet, or a *warning* when no card on the board
   can satisfy the reference) and loads automatically once the producer emits
   (ISSUE-58, ISSUE-145). Under text/textarea config fields the ⚙
   panel lists the available emitters as clickable `{{widget:<id>}}` chips, so
   references are inserted precisely instead of typed from memory.

### Output kinds — the text-first rule

An emitter publishes **data, not presentation**: text (a scalar, or an array of
lines), never its own markup, SVG, screenshot or pixels. The manifest declares
the kind (`outputs.kind` ∈ `extract` | `lines` | `count` | `value`); the source
picker and the Ask prompt both read it from there. The rule, its corollaries and
the anti-patterns live in **docs/WIDGET-DEVELOPMENT.md → The Emitter Contract**;
the design direction for non-text outputs (references, capped inline encodings,
real binaries) is scoped in **docs/MEDIA-DATAFLOW.md**.

### Instance ids and renaming (ISSUE-53)

- Every widget's **id** is its stable instance name — the header shows a
  small id chip (click → ⚙), the ⓘ panel shows it, and the source picker
  lists emitters by id.
- ⚙ edits it under **Name**: validates non-empty,
  `[A-Za-z0-9_-]` (the reference grammar), and unique on the board.
- Renaming a referenced id opens a **confirm dialog** — "N references in M
  widgets" — and confirm **repoints all of them** (source fields + every
  `{{widget:old-id}}` token, deep) and the layout entry; Cancel changes
  nothing.
- ⚙ also has **Display title (optional)** (header override, `_title`).
- Imported boards whose ids use characters outside `[A-Za-z0-9_-]` get a
  warning (they can't be referenced via interpolation/the picker).

Emitting widget types (current): `listSource` (the lines), `filterLines`
(the filtered lines), `lineCount` (the number), `echo` (pass-through),
`qrCode` (the encoded text), and
`excerpt` (the article's first paragraph — feed it to Translator, Speaker or
Markdown via `text: "{{widget:<excerpt-id>}}"`). The canonical demo chain
lives at `?config=/flow-demo.json`:
**🧾 Text List → 🔎 Filter Lines → 🔢 Line Count → 🖨️ Value Display**.

Deliberately **not** emitting yet: article *title* lists. Machine-translated
titles can be mistaken for Wikidata language mapping (an actual per-language
article name) rather than an MinT translation — if added, the card must label
the output as machine translation (ISSUE-58).

## Validation Behavior

`validateDashboard(input)` returns `{ valid, errors, warnings, widgets, layout }`.

- **Errors block the import** (nothing is applied): malformed JSON, missing
  arrays, unknown `widgetType`, duplicate ids, type mismatches, out-of-options
  select values, `refreshSeconds` < 30, layout entries without a matching widget.
- **Warnings are non-fatal** (import still succeeds): widget without a layout
  entry (auto-placed), `w` out of range (clamped by the grid), unknown config
  keys, missing `config` (defaults used).
- Import applies **only after validation passes**; the file/paste is never
  partially applied.

## Complete Example

```json
{
  "version": 1,
  "widgets": [
    { "id": "pv", "widgetType": "pageviews", "config": { "article": "Main_Page", "project": "en.wikipedia", "displayMode": "stat", "refreshSeconds": 3600 } },
    { "id": "cat", "widgetType": "categorySize", "config": { "category": "Images from Wiki Loves Monuments 2024", "wiki": "commons.wikimedia", "sampleCount": 6, "refreshSeconds": 3600 } },
    { "id": "fu", "widgetType": "fileUsage", "config": { "filename": "The Earth seen from Apollo 17.jpg", "topN": 10, "showImage": true, "showCaption": true, "refreshSeconds": 3600 } }
  ],
  "layout": [
    { "i": "pv", "x": 0, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 },
    { "i": "cat", "x": 3, "y": 0, "w": 3, "h": 4, "minW": 2, "minH": 3 },
    { "i": "fu", "x": 6, "y": 0, "w": 3, "h": 5, "minW": 2, "minH": 4 }
  ]
}
```

The app ships a ready-made all-six-widgets example (`EXAMPLE_DASHBOARD` in
`src/lib/dashboardConfig.js`) — the ✨ **Example** button loads it, and it's
exactly what `dashboard.json` looks like after export.

## Loading a Dashboard from a URL

- **`?config=<url>`** — fetch a hosted dashboard JSON. URLs on Wikimedia wikis
  (`*.wikipedia.org`, `*.wikimedia.org`, …) are fetched via the Action API
  (`action=parse&prop=wikitext`, CORS-enabled) — point it at any page holding
  JSON. Both `/wiki/Title` and `/w/index.php?title=Title` URL forms work, and a
  `<syntaxhighlight>`/`<pre>` wrapper around the JSON is stripped automatically.
  **Working example:** `?config=https://commons.wikimedia.org/wiki/Commons:WikiPortraits/Bento-demo.json`
  (verified 2026-08-12 — 7 widgets load from the on-wiki config). Any other
  host must send CORS headers (`raw.githubusercontent.com`, Toolforge tools, etc.).
- **`?config=<w.wiki short URL>`** — Wikimedia's URL shortener
  (`https://w.wiki/XXXX`, or bare `w.wiki/XXXX`) is expanded server-side by the
  same-origin `/api/resolve` endpoint (deploy/server.js — browsers can't follow
  w.wiki redirects because the target page sends no CORS headers). After
  expansion the URL goes through the normal wiki/direct fetch logic. **Working
  example:** `?config=https://w.wiki/TR9R` (verified 2026-08-12 — expands to the
  Bento-demo.json page, 8 widgets load). On a plain static host without the
  resolver, a CORS-enabled w.wiki target still works via direct fetch; otherwise
  a clear error is shown.
- **`#/d/<base64url>`** — the config embedded directly in the URL hash
  (self-contained; no hosting needed). The 🔗 Share button produces these.
- Load order: URL config > saved dashboard (localStorage) > defaults. A failed
  URL load shows a dismissible error banner and falls back to the saved
  dashboard. The config is validated with the same `validateDashboard` rules
  before anything is applied.
- `public/dashboard.json` ships with the app as a hosted sample (the example
  dashboard) — try `?config=/dashboard.json`.

## Reading a JSON Canvas document (`.canvas`)

`src/lib/jsonCanvas.js` writes a board as a JSON Canvas document (see `docs/EXPORT.md`); `src/lib/canvasImport.js`
reads one back, and the ⬆ Import panel accepts either. A `.canvas` is **not** a board, so it is read into one first —
and then goes through `validateDashboard` like any other pasted document: same coercion, same registry defaults, same
severity model, no second, gentler path.

**How a node becomes a card**

| node | card | why |
|---|---|---|
| any node carrying a `wikibento` payload | the card it names | our own export rides on each node, so a round trip is **identity** — ids, configs and grid boxes all come back |
| `text` | Text / Markdown, verbatim | nothing to interpret |
| `link` | the card the ⚙ brush would place for that URL | `lib/pickMode.js` already answers "what is this link" (`pickFromUrl`) and "which widget accepts it, with what config" (`typesForKind`, `brushConfig`); a second table would drift from the first |
| `link` to a SPARQL endpoint | SPARQL, with the query from the fragment or `?query=` | a WDQS URL *is* how a query travels between people |
| `link` to a Commons category | the category card, its source selector set | one shape `pickFromUrl` deliberately does not read (a namespace page), added here — a Commons category is the commonest thing a person links to on Commons |
| `file` | a Commons file card **if** the reference resolves to Commons, otherwise Text quoting the path | in Obsidian a `file` node is a **vault path**: it means nothing here, and inventing a URL from it produces a card that 404s and looks like our bug |
| `group` | nothing (reported) | a board has no sections |
| anything else | Text quoting the node | an unreadable node is still the reader's content |

**Edges are ignored, on purpose.** In JSON Canvas an edge is presentation — sides, arrowheads, a label — not dataflow.
After one of our own round trips the real wiring is already inside the configs, because **a node's id is the widget's
id**; wiring a card from an edge would be guessing at something we already know.

**What is lossy.** Pixel boxes convert back to grid units exactly (the inverse of `toCanvasBox`), but a grid board
cannot reproduce free 2-D placement: a card keeps its box where it rounds to a legal one and is pulled inside the 12
columns where it does not, so the *order* a reader sees survives where the exact pixels do not. Nothing is dropped
silently — the ⬆ Import panel reports the counts of cards, how many were restored from a payload, and how many edges,
groups, vault paths or unplaceable links were handled some other way.

**Unknown fields are carried at both levels**: a document's own top-level keys become the board's extras
(`boardExtras`), and a node field this import did not read (a `color`, a `shape`, a field a future version defines)
rides along on the card under `canvas`. That is the export's rule in the other direction — *retain what you do not
model* — so an import → export cycle sheds nothing. `tests/canvas-import.test.mjs` holds the mapping; the round trip
through the real panel is checked by `npm run smoke:canvas-import`.

## Compatibility Notes

- **Export, the `#/d/` share link and the localStorage snapshot all carry the whole board
  including `params`** (fixed 2026-09-11 — Export and Share previously wrote `version`, `widgets` and
  `layout` only, so a parameterised board arrived without the controls that re-aim its cards, and
  several internal save paths wrote `params: null` and erased the block from storage as soon as a
  card was moved). Omitted from a share link when there are no params, since that link is a URL.
- Exported files carry `"version": 1` (added 2026-08-12); older exports without
  `version` still import.
- The widget registry (`src/widgets/index.js`) is the source of truth for
  `configFields` — new widget types or config fields automatically become part
  of the format's vocabulary via `validateDashboard`.


## A board is data from outside — what happens when it is errant

A board arrives from a demo file, a URL, a share link, a browser's localStorage, or a tool that wrote JSON by hand.
Its *types* are as much a matter of trust as its values — a board that spells `includeAll: "False"` (as one generated
outside the app did) means the opposite of what it looks like, because `!!"False"` is `true`.

### The severity model

| what | example | behaviour |
|---|---|---|
| **Unusable** | an unknown `widgetType`; a layout that does not match the widgets; a malformed `params` entry | **Refuse the board** and say which field, in the app's own words. `validateDashboard` returns the error list; the boot banner shows the first one. |
| **Repairable** | `"200"` for a number; `"True"`/`"False"` for a boolean; a missing key that the registry defaults; an unknown key; an unknown `select` option; a number outside a field's declared range (clamped); `refreshSeconds` below the floor (raised to it) | **Normalise silently, and report it if it changed anything.** `normalizeConfigForDef` coerces by the field's declared type, clamps to the field's `min`/`max`, fills the registry defaults and raises `refreshSeconds` to `MIN_REFRESH_SECONDS`, so the card behaves as the registry says. A value that cannot be read (`"twelve"` for a number) is left exactly as written rather than guessed at, and appears in the report. These arrive as **`repairs`** — its own list, beside `errors` and `warnings` — since 2026-10-02, when the code was brought into line with this table (ISSUE-134: a board from a chat writes `"200"` and was being refused outright). |
| **Inefficient, not wrong** | every widget storing every field, including the three source fields it does not use | **Nothing to report.** `compactConfig` drops what the registry would say anyway when the board is *saved*, shared or hashed — so a board the app writes is a description of the choices made, not a copy of the defaults. Never trimmed in the reader's hands: a borrowed board is shown, not rewritten. |

### Writing a board

A spawn and a newly added widget write only the fields their source reads — the registry defaults minus everything their
own `showIf` hides — and a board is trimmed whenever it is **written**: the share link, localStorage and ⬇ **Export** all
go through `savedBoardPayload`. So an old board's "Inefficient" leftovers disappear at its next save rather than at its
next read, and a trim is lossless because the default comes back at render time.

**Foreign top-level keys are carried, not pruned.** A document may hold keys this format does not define — another tool's
namespace, or a state a future version will read — and they survive a round trip: `boardExtras()`
(`src/lib/configNormalize.js`) takes them off a document as it is read (localStorage, ⬆ Import, `?config=`) and
`savedBoardPayload(…, extras)` writes them back **ahead of** `widgets`/`layout`/`params`, so a foreign key can never
shadow one of ours. This is JSON Canvas's extension contract — *retain what you do not model* — because a reader that
keeps only the fields it understands makes every save a silent pruning: the file stays valid, opens, and something is
quietly missing. It is the same rule this codebase already applied at **config** level (`compactConfig` carries an
unmodelled config key through, and `validateDashboard` reports it rather than dropping it) and at **widget** level (the
payload spreads the widget object). The one deliberate exception is the **URL payload** (`urlState.js`): a URL is a wire
with a size budget that has to survive a QR code, so unknown keys stop there — a board shared by link carries its
widgets, layout and params, and its documents carry anything else.

### Prompting the user

**Report, do not interrupt**, and only when a repair changed the *meaning* rather than the shape:

- A **repaired type** or **filled default** is silent — the board renders as the board intended, and the ⚙ panel shows
  the normalised value, so nothing is hidden.
- An **unreadable value**, a **dropped field** or an **unknown key** belongs in a non-blocking notice (the existing
  `BoardNotice` pattern: what was found, what was assumed), with the option to *save a clean copy* — never an automatic
  write, because the board may be a link someone else owns.
- **Errors that cannot be repaired** (an unknown widget type, a broken layout) block with a message naming the field
  and the expected shape. That is already `validateDashboard`'s contract.

### Why one function, two callers

The lint that decides "is this repairable, and is it worth telling anyone?" is the same one that should run over the
boards in this repo. `scripts/docs-facts.mjs` exists because *"a rule in prose is not a check"*; board files deserve
the same treatment, and a single `lintWidgetConfig(config, def)` can serve both the loader (warn the reader) and a
build-time pass over `public/*.json` (fail the PR).

**The reporting half now exists**: [`src/lib/boardDoctor.js`](../src/lib/boardDoctor.js) — `npm run check:board -- board.json` —
returns this severity model for a board that came from somewhere else, delegating the shape/config verdicts to
`validateDashboard` itself and adding the checks a validator cannot make (references that name nothing, a channel the
producer does not publish, a field the current source mode ignores, a CIM category outside the allow list). It is what
an outside model is pointed at before it hands a board over. One disagreement between this table and the code is filed
as **ISSUE-134** (a mistyped config value is documented as *Repairable* and is currently refused — the doctor reports
what the app will do, which is refuse).
