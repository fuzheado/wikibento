# The Freshness Constitution (read before adding any widget)

Any widget that performs a **live query** (has a `fetch`) MUST let the viewer
see how stale or fresh its data is. `WidgetFrame` stamps every fetch widget's
render data with `_fetchedAt` (the time the query last ran) and renders an
unobtrusive footer on every live widget:

```
⏱ updated 2:34:05 PM · auto-refresh 1h
```

The stamp updates on every load — initial fetch, manual ↻, config change, and
auto-refresh — so viewers can always judge freshness. Static widgets (no
`fetch`: Text/Markdown, Wiki Page) are exempt by definition — they have no
query to be stale.

- **Rule:** a widget with `fetch` MUST declare `refreshSeconds` in `defaults`
  (≥ 30 s — the API-etiquette floor). Enforced by the constitution test
  (`tests/scope-compliance.test.mjs`, run by `npm test` → `npm run build`).
- **Caveats:** when a shared TTL cache serves a hit (Wikistats, SPARQL, CIM),
  the stamp shows when the widget last ran — the underlying data may be up to
  the cache TTL older. The stamp is "when this widget last refreshed", not
  "when the upstream data was produced".

# The Temporal-Scope Constitution (read before adding any widget)

Every widget whose data has a temporal scope MUST display the **resolved**
scope in its subtitle — "2026-07" (month), "2026-02 → 2026-07" (range),
"2026-07-15 → 2026-08-13" (day window) — never "last month" or "30 days".
A number without its time context is useless.

- Every registry entry MUST declare `timeScope`: `'month' | 'range' | 'day' | 'point'`
  (`'point'` = snapshot-as-of-now / static / query-defined — exempt from the
  date rule but must still declare its nature).
- The scope must be derivable from CONFIG ALONE (helpers in `src/lib/scope.js`:
  `resolveMonth`, `shiftMonth`, `fmtMonth`, `fmtMonthRange`, `fmtDayRange`,
  `dayWindow`) — transforms render it from config, not from fetched data.
- **Enforcement is automated:** `tests/scope-compliance.test.mjs` (run by
  `npm test`, wired into `npm run build`) fails any scoped widget whose
  subtitle lacks the date pattern — a non-compliant widget cannot be built,
  so it cannot be deployed. This is the "constitutional" gate.

# Config field types (what the panel can render)

| type | renders | notes |
|---|---|---|
| `text` · `textarea` · `number` · `boolean` | the obvious control | |
| `select` | a dropdown | **options must be an enumeration you own** |
| `preset` | a dropdown with presets | |
| `source` | a combobox of emitting widgets | the dataflow wire (ISSUE-51) |
| `params` | the board-param picker | Board Controls |
| **`project`** | the project picker (ISSUE-93) | every wiki, ordered recency → default → curated → rest, searchable. Add `mode: 'language'` for a field that takes a bare language code, or `extras: [{ value, label }]` for a non-project choice like CIM's "all wikis" |
| `lookup` | a validated combobox | see `paramSources.js` |

**A field named `project`, `wiki` or `lang` must declare *which vocabulary its value belongs to.*** Two different
things share those names, and confusing them is what made the ✨ Ask path invent a wiki:

| the value is… | declare | example value |
|---|---|---|
| a **wiki** | `type: 'project'` — the shared picker | `de.wikipedia` |
| a **speech language tag** — not a wiki at all | `type: 'text', vocab: 'bcp47'` — matched against the device's voices | `de` |

A manifest-constitution test fails the build on anything else, because five widgets once offered 6, 3, 2, 13 and 30
options while the site matrix holds 364 wikis and 374 languages — `options` on such a field is how that happened.
The speech case is deliberately `text` and not a `select`: a dropdown of language tags is the same hardcoded list,
just kept in code instead of in the registry. (The bcp47 rule and the 🌐→🔊 chain it exists for are ISSUE-97.)

# The Emitter Contract (read before wiring a widget to others)

> *Background:* why this is a one-way, text-shaped convention rather than a message
> bus — and how other tools (Grafana, Tableau, marimo, HyperCard, mTropolis) solved
> the same problem — is in [WIDGET-MESSAGING.md](research/WIDGET-MESSAGING.md).

The two sections above are **constitutions** — build-breaking. This one is a
**convention** with a single automated guard, and it exists because the dataflow
wire has non-obvious constraints: getting them wrong produces boards that are
subtly broken rather than loudly broken.

## The rule

**An emitter publishes DATA, never PRESENTATION.** The value must be the thing
the widget is *about*, in a form another widget can consume as content — never
the widget's rendered output: not its markup, not its SVG, not its screenshot,
not its pixels, not its DOM.

Corollaries:

1. **Text is the wire format** (today): scalars, or arrays of lines. Kinds in
   use: `extract` (prose), `lines` (lists), `count` (numbers), `value`
   (pass-through). Consumers are text-shaped.
2. **Emit the smallest true value.** An emitted value is copied into board
   state, persisted (`localStorage` / `?config=` URLs), hashed for the
   change-detection signature, and — for boards the Ask path assembles —
   counted against the prompt budget. Measured 2026-09-10: a QR's SVG is
   3.1–9.3 KB while the text it encodes is 21–138 chars. The QR widget emits
   the text.
3. **Emit only if something can consume it.** A widget whose output nothing can
   draw or read should stay a **sink**. Speculative emitters are not harmless:
   they take a slot in the source picker and in the Ask prompt's emitter list,
   and they invite boards wired to nothing.
4. **The card must show what it emits** (or label it explicitly). If a widget
   emits its first paragraph, that paragraph is on the card; if it emits a
   number, the number is visible. Ambiguity is the failure mode ISSUE-58
   recorded — do not emit a value a viewer cannot identify.
5. **Never emit something that cannot round-trip through JSON.** No DOM nodes,
   no `File`/`Blob`/`ImageBitmap` handles, no functions. If it is not text (or
   an array of text), it does not belong on the wire yet — `docs/MEDIA-DATAFLOW.md`
   lays out what that would take.
6. **Prose must publish its source beside it (ISSUE-92).** An `extract` is text, so nothing inside it says which
   page or which wiki it came from. A widget that emits one therefore also emits a **reference** on its own channel
   — `outputs: { extract: 'extract', reference: 'value' }`, as the Article Excerpt does — and a test in the
   manifest constitution refuses a prose emitter that does not. This is the contract that stops a new emitter
   quietly dropping the context the way `excerpt` did.
7. **A widget may publish more than one thing — on named channels (ISSUE-91), and it must say which one the bare
   id means.** `primary: 'extract'` publishes that channel on the widget's own id as well, which is what every
   reference written before channels existed means. This is not a nicety: the Article Excerpt became a
   multi-channel widget and stopped filling its bare id, and the translate demo — wired as
   `{{widget:excerpt-src}}` — sat on *"Waiting for a reference"* forever. A manifest-constitution test now fails a
   channel-mapped widget that declares no `primary`.
   The default output keeps the bare widget id (`{{widget:id}}`), so nothing old
   changes meaning. A second channel is declared as `outputs: { items: 'lines',
   selection: 'value' }`, returned as `emit: (data) => ({ items: … })`, stored as
   the key `id#channel`, and referenced as `{{widget:id#selection}}` or by naming
   `id#selection` in a consumer's `source` picker. Today exactly one widget uses
   it, for the thing none of the rules above describe: **what the reader clicked**
   — a `wikiBox` publishes the page title of a link the reader picked, which is
   the only emit in the app that is *not* a pure function of fetched data. Two
   checks enforce the shape: the manifest gate accepts either `{ kind }` or a
   channel map with documented kinds, and the demos constitution refuses a
   reference to a channel a widget does not declare. One `outputs` may now carry
   `kind` (the bare id's shape) and `subject` (the thing it is about, ISSUE-96)
   beside those channels — the four emitters that once declared channels only
   (`excerpt`, `gallery`, `wikiBox`, `translate`) each name a `kind` today, so a
   matcher reading `outputs.kind` can finally see them.

## What the value IS: `denotes` (the third axis, ISSUE-96)

`outputs.kind` says the SHAPE of the value; `outputs.subject` says what it is ABOUT. Neither says what it IS — and
that gap shipped a bug. The Article Excerpt's value is `extract` (prose) and it is *about* an article, so a match on
`subject: 'article'` alone offered it to a gallery's `article` field, whose value must be the article's **name**.
The paragraph landed in the title slot and the card showed `Article not found: Albert Einstein was a German-born…`.

So a producer that names a `subject` also declares **`denotes`** — what the value denotes, from `VALUE_KINDS`
(`src/lib/dataflow.js`):

| `denotes` | the value is… | example |
|---|---|---|
| `name` | the thing itself: its title, its page reference (`enwiki:Title`), or a resolvable URL | `enwiki:Albert Einstein` |
| `prose` | text ABOUT the thing — never something a field can look up as a title | `Albert Einstein was a German-born…` |
| `list` | several names, one per line | `enwiki:Marie Curie\ncommonswiki:File:X.jpg` |
| `count` | a number of them (a reading, never the thing) | `42` |

The two axes are independent — the same subject pairs with either — and they are matched together. A `name` fills a
`kind` field, which RESOLVES its value as the thing; `prose` and `count` never do, and a `list` fills a multi-line
(`textarea`) `kind` field but not a single-line one. `denotes` is **required** with a `subject`: the spawn menu
offers a producer with no value form to no field at all (rather than guessing), and a manifest-constitution test
refuses the omission — so an axis left out cannot quietly re-admit a paragraph into a name slot.

## The validated lookup param (ISSUE-68/99)

A Board Controls param may be `type: 'lookup'`, which renders a box that checks what you type against live
Wikimedia data:

```json
"collection": { "type": "lookup", "source": "cim-category", "options": ["…curated shortlist…"] },
"page":       { "type": "lookup", "source": "page", "project": "de.wikipedia" }
```

| source | validates against | project-aware? |
|---|---|---|
| `article` | an article (main namespace) on the chosen wiki | ✅ |
| `page` | any page (article, project/meta, template, file, category) | ✅ |
| `cim-category` | Commons Impact Metrics (allow list + live probe) | ✗ — Commons by definition |
| `commons-category`, `commons-file` | a Commons page | ✗ |
| `wikidata-item` | a Wikidata QID | ✗ |
| `curated` (or no source) | membership in the param's own `options` | ✗ |

A **project-aware** source takes `project` (a wiki, the same value the shared picker produces) and commits a
**reference** (`enwiki:Marie Curie`), so the wiki travels to every consumer. `projectAware` is declared on the source
in `paramSources.js`; the control grows its wiki picker only for those, because offering a picker that does nothing
would be a lie. A source may also declare a `noun` for its verdict copy (`no such page on de.wikipedia`).

## Current emitters (the reference set)

| id | kind | subject | emits | typical consumers |
|---|---|---|---|---|
| `excerpt` | `extract` | `article` | the article's first paragraph | `translate`, `speaker`, `markdown`, `echo` |
| `listSource` | `lines` | — | the pasted lines | `filterLines`, `articleList`, `gallery`, `mediaPlayer`, `echo` |
| `filterLines` | `lines` | — | the filtered lines | `articleList`, `lineCount`, `echo` |
| `lineCount` | `count` | — | a number | `echo`, `markdown` |
| `echo` | `value` | — | pass-through | any text field |
| `translate` | `translation` · `speech` | — | the translated text, and the *same text typed as speech* — `{ type: 'speech', text, lang }` — so a 🔊 Speaker can choose a voice for the language (ISSUE-97) | `speaker`, `markdown`, `echo` |
| `qrCode` | `value` | — | the text it encodes | `echo`, `markdown` — usually a leaf; see the worked example |
| `wikiBox` | `items` · `selection` | — | the box's items as lines, and (when *Links in the box* says so) the page title the reader clicked | `filterLines`, `lineCount`, `echo`, `speaker` · `wikiPage`, `articleGallery`, `echo` |
| `map` | `geojson` | — | what the card draws, as a **GeoJSON `FeatureCollection`** in a typed envelope: `{ type: 'geojson', data: … }` — places, paths and areas, with `label`/`wikidata`/`role` properties and time (`datetime`, or `times` per vertex). The first **JSON-shaped** kind rather than a text one, which is why it needed the size policy in [GEOMETRY.md](GEOMETRY.md) | `map` (a second map card, via its `source` field) — and any future drawing card |
| `gallery` | `lines` · `selection` | — | each row's caption — or its title, when the row has no caption — as lines, and the file the reader clicked | `filterLines`, `lineCount`, `speaker`, `echo` · `mediaPlayer`, `echo` |
| `iaItem` | `value` | — | the item's canonical `archive.org/details/…` URL | any text field; `markdown`, `echo` |
| `iaBook` | `value` | — | the book's `details` URL, the link its title opens | as above |
| `documentReader` | `value` | `commons-file` | the file's own page URL (`commons.wikimedia.org/wiki/File:…`) | as above |
| `cimStats` | `value` | `cim-category` | **the subject it resolved** — `commonswiki:Category:Files from the BHL` or `commonswiki:File:Dogs, jackals.jpg` — as a reference (ISSUE-92). Not its counts: a reading is not a token (ISSUE-96) | any text field via `{{widget:id}}`; a `speaker` or `translate` reads the name |
| `cimTrend` | `value` | `cim-category` | the same subject reference | as above |
| `cimRanking` | `lines` | `cim-category` | the ranked **names**, one per line, each carrying its own project where one exists — `commonswiki:File:Dogs, jackals.jpg`, `enwiki:Marie Curie`, the bare dbname (`enwiki`) for a wiki row, a bare user name for an editor row (that endpoint returns no wiki, so none is invented) | `filterLines` (declared: `kinds: ['lines']`), `lineCount`, `speaker`, `echo` |

Every emitter the registry declares is in this table (16 of the 36 types publish; `tests/manifest-compliance.test.mjs` holds the list of the ones whose kind is pinned, and the CIM trio is the newest family here).

**A producer also says what its value is ABOUT (ISSUE-96).** `outputs.subject` names the THING the emitted value is
about, drawn from the same vocabulary the ⚙ brush validates — `KIND_IDS` in `src/lib/pickMode.js`: `article`,
`page`, `commons-file`, `commons-category`, `commons-gallery`, `wikidata-item`, `cim-category`. It is declared
only where it is unambiguous from the fields the card carries (the rows above with a value in the subject column), and
deliberately omitted where a value's subject depends on the card's own mode — the Gallery's four sources, the Wikipedia
Box's page-or-template, the Translator's unknown source text. A `subject` no consumer accepts is a menu label offered
for nothing, so a gate refuses one (the no-dead-kind rule, extended to subjects).

**A consumer that needs a shape says so.** A `source` field may declare the kinds it accepts, e.g.
`kinds: ['lines']` — the ⚙ picker then offers only publishers whose kind is in that set, while a publisher with an
*unknown* kind is never hidden (offering something we cannot classify beats hiding it). The set lives in one place,
`OUTPUT_KINDS` in `src/lib/dataflow.js`, and `tests/manifest-compliance.test.mjs` asserts that every declared kind is
documented **and** that something in the catalog publishes it — a field wired only to nothing would otherwise look
like an empty dropdown. Declaring nothing is honest for a consumer that takes anything: `echo` inspects whatever it
is handed, so it declares nothing, and `map` was the first field to say `geojson` (ISSUE-132).

## Anti-patterns (with the concrete reason)

| Tempting emitter | Why it breaks |
|---|---|
| A rendered SVG/HTML string ("emit the graphic") | Nothing renders markup: `echo` prints a multi-KB XML blob as text, `lineCount` "counts" SVG lines, `filterLines` mangles it, and `markdown`'s image path is https-allowlisted so a `data:` URL does not draw. Adds KBs to state and persistence for zero live use. |
| A screenshot / raster | Same, plus it cannot be persisted and it taints canvases cross-origin. |
| `data:` URLs for real images | They are text, so they *appear* to work — and bloat every saved board, change signature and `?config=` URL. |
| A blob / file handle | Not JSON-serializable, and the board JSON is the persistence format. |
| The widget's card/state object | Consumers receive JSON text and can do nothing with it. |
| A convenience duplicate of an upstream value | Redundant edges; the same data reachable two ways invites divergent boards. |

## Adding a new output kind

A new `kind` is a design act, not a one-line change. It needs:

1. a **consumer** that understands it — at least one shipping card, not a plan;
2. an entry in the reference table above **and** in
   `docs/BOARD-COMPOSITION.md` §4.4 (the LLM-facing emitter table);
3. a phrase arm in `askManual()`'s `what` map (`deploy/server.js`), or the Ask
   prompt will describe the kind as "a `<kind>`" or mislabel it;
4. the allowlist updated in `tests/manifest-compliance.test.mjs` (the guard);
5. a **size/transfer policy** if values can be large, plus a line here about what
   happens on persistence.

For anything non-text, read `docs/MEDIA-DATAFLOW.md` first: it costs out
Tier 1 (`rows` references), Tier 2 (capped inline `data:` encodings) and
Tier 3 (real binaries + a board-scoped handle store).

## Worked example — the QR widget (2026-09-10)

`qrCode` renders a graphic and emits **its text**. Because the payload is
composed from `{{param}}`/`{{widget:<id>}}`, the emitted string is the only
readable form of a composed URL — a human can check what the code says next to
the code itself (the kiosk/print verification pattern). Emitting the SVG was
rejected: 3.1–9.3 KB per card (measured), renderable by nothing in the catalog,
and it would have been the first emitter to put *presentation* on the wire. The
image output is filed as a future direction in `docs/MEDIA-DATAFLOW.md`, gated
on an effector/compositor consumer (WIDGET-IDEAS family 7).

# Spawning a neighbour from a card (ISSUE-96)

The card chrome carries a **⇄** control (`button.spawn-btn`, title *"Add a card that feeds this one, or that
this one can feed"*). Right-clicking the card, or a touch long-press on it, opens the same panel. It is
called the **spawn menu** and it turns card creation from "describe one, it lands somewhere" into "start
from a card that is already on the board".

## The two sides

The panel's whole content is computed by `spawnOptions(widgetType, config, registry)`
(`src/lib/spawnOptions.js`, pure and unit-tested), which answers both directions for ONE card:

| side | heading | answered by | a row is |
|---|---|---|---|
| LEFT | **Feed this card** | `feeds` — producers whose `outputs` satisfy what this card consumes (grouped by the shape/subject it wants) | a producer **type** that would feed this card |
| RIGHT | **Use this card's value** | `feedsTo` — consumers whose `source` field accepts this card's `outputs.kind` (grouped by channel) | a consumer **type**, and the **field** it would write (`← source`) |

A side with no candidates shows the human-readable sentence from `notes` in its place, never a blank list.

## "Already wired" and the placement rule

Clicking a row creates the neighbour through **the one add path** (`App.handleAddWidget`), so undo,
localStorage, the registry's layout constraints and the borrowed-board adoption rule are identical to the
⬜ Add-widget panel. The difference is the two things the panel adds:

- **It is wired before you see it.** The neighbour is created with `wireConfig(def, { fromId })` already
  applied — RIGHT writes the new card's source to read the parent; LEFT (the "feed" side) patches the
  *parent's* config to read the new card, in the same state update, so creating-and-wiring is **one undo
  step**. `wireConfig` deliberately writes a **plain** `id` / `id#channel` into a `source` field (that field
  is read as an id) and the **braced** `{{widget:id}}` into a text / thing field (that is what `resolveParams`
  substitutes). Do not "fix" that asymmetry — it is the contract.
- **It lands beside its parent.** `adjacentSlot(layout, parentId, def)` (`src/App.jsx`) returns a deliberate
  slot: to the **right** (`x = parent.x + parent.w`) when the new card's default width still fits in the 12
  columns, otherwise **directly below** (`x = parent.x, y = parent.y + parent.h`). The board is
  `compactType="vertical"`, so this can push cards that already occupied the slot **down** — that is the
  chosen behaviour, not a collision to work around.
- The new card is left **highlighted** (`.grid-item.spawn-focused`), i.e. the card you keep chaining from.

## One honest limit: a channel is a NAME, not a kind

`spawnOptions`' `feedsTo[].channel` is a producer's `outputs.kind` — the shape of the value on the **bare**
id (`value`, `lines`, `count`, …). A card's addressable **channel names** are only the non-reserved keys of
its `outputs` object (`translate` publishes `translation` and `speech`). The two happen to coincide for
`speech` but not in general, so the panel calls `wireConfig` with **no** channel — the bare id — and a name
like `{{widget:cimStats#value}}` would resolve to nothing. Surfacing the named channels (so a Speaker could
be offered `translate#speech`, the one the ⚙ hint already steers you to) is the next step, not this one.

# Adding a New Widget

The registry pattern means a new widget is **one entry in `WIDGET_TYPES`** plus
(usually) one fetcher in `dataSources.js`. No changes to the grid, frame, or panels.

## The two flags that are part of a type's contract

Properties on a widget definition are read by everything that describes the catalog, and two of them exist precisely
so that a *reader* can say something true about the type:

- **`needsRelay: true`** — this type cannot fetch its data from a browser at all (Wikimedia's map service answers a
  browser-shaped request with `403` + HTML; two other sources send no CORS header), so it asks **this deployment's
  relay**. `scripts/generate-manifest.mjs` carries it as `relay`, and the board guide, the widget map and the board
  doctor each derive their warning from that one fact — before 2026-10-02 all three kept their own hand-written list,
  which is how one of them goes stale.
- **`experimental: true`** — shipped but not yet proven in the field; travels as `experimental`, and is what the
  widget map's α badge and the doctor's note read.

The same applies to the rest of the metadata that travels: `outputs` and `primary` (what a type publishes, and which
channel the bare id means), each field's `showIf` (which selector value makes it apply), and `kinds` on a field. All of
them reach `public/manifest.json`, which is what an outside producer reads — so a property that is only in the registry
is a property the door cannot state. One trap while editing a shared `configFields` constant: a property that follows a
comment line is invisible to the generator's parser (see the note in `src/widgets/index.js`).

## Anatomy of a Widget

Every widget is defined by 5 things:

| Piece | Where | What it does |
|---|---|---|
| `defaults` | registry entry | Starting config, merged when added from the catalog |
| `configFields` | registry entry | Renders the ⚙ config form (text / number / select / boolean / textarea / source). Fields where a `{{widget:id}}` reference makes no sense (e.g. language codes) set `noRefs: true` — the reference chips are hidden there |
| `fetch(config)` | registry entry → dataSources.js | Async API call, returns data or throws. **Omit for static widgets** (e.g. Text/Markdown) — WidgetFrame then renders `transform(null, config)` directly, no network, no refresh interval |
| `transform(data, config)` | registry entry | Shapes API data into a renderer contract |
| `renderer` | registry entry | `StatCard` \| `RankingCard` \| `TrendCard` \| `GlamCard` \| `MarkdownCard` \| `BoardControlsCard` \| `SpeakerCard` \| `TranslateCard` \| `TopPagesExpandedCard` \| `ExcerptCard` \| `EditHistoryCard` \| `QualityCard` \| `AssessmentsCard` \| `GalleryGridCard` \| `GalleryListCard` \| `MediaPlayerCard` \| `PanoramaCard` \| `WaybackGalleryCard` \| `ArticleListCard` \| `ListSourceCard` \| `EchoCard` \| `SparqlCard` \| `WikiPageCard` \| `CimSnapshotCard` \| `CimTopFilesCard` \| `QrCard` \| `FileTrafficCard` |
| `defaultLayout` | registry entry (optional) | Grid size when added from the catalog: `{ w, h, minW, minH, maxW?, maxH? }` — `w: 12` = full width. Gallery-family widgets default to full-width; the 360° viewer constrains its minimum |
| `autoHeight(view, config)` | registry entry (optional) | Content-based auto-fit: return a pixel height for the loaded content (e.g. rows × tile height); WidgetFrame calls `onAutoHeight` after a successful load, App fits the grid row count (clamp 3–14) — and stops once the user resizes manually. See the `gallery`/`gallery` entries |
| `emit(data, config)` | registry entry (optional) | **Read *The Emitter Contract* (below) first.** Publishes this widget's output to the board so other widgets can consume it via a `source` field or `{{widget:<id>}}` interpolation (ISSUE-52/58). Return the widget's primary payload — a string/number/array of lines (e.g. `excerpt` → `data.extract`). Consumers re-fetch when the value changes (content-based signature). Omit to stay a pure sink; do NOT emit ambiguously-interpretable data without labeling it in the card (see ISSUE-58 on article titles) |

## Step-by-Step

### 1. Write the fetcher (src/widgets/dataSources.js)

```js
/** N. My Widget — what it does */
export async function fetchMyData(param, wiki = 'en.wikipedia') {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'something',
    titles: param,
    format: 'json',
    origin: '*',            // ← required for browser CORS on Action API
  });
  const data = await fetchJSON(`https://${wiki}.org/w/api.php?${params}`);
  // ...shape the result...
  return { key: value, ... };
}
```

Rules:

- Reuse `fetchJSON` (it sets the UA and throws `HTTP <status>` on failure).
- **Throw** on failure — `WidgetFrame` catches, shows the message + Retry.
- **Never return raw API envelopes** — shape to what the widget needs.
- Keep it to **one or two batched calls**; no per-item loops (API etiquette).

### 2. Register the widget (src/widgets/index.js)

Add an entry to `WIDGET_TYPES`:

```js
myWidget: {
  id: 'myWidget',
  name: 'My Widget',                          // catalog + default title
  icon: '✨',
  description: 'One-line description for the catalog',
  defaults: {
    param: 'Something',
    refreshSeconds: 3600,
  },
  renderer: 'StatCard',                       // StatCard | RankingCard | TrendCard
  dataSource: 'mwapi-something',              // informational only
  // Optional: what the header calls this card. `labelFromConfig(config)` names the asset from the config;
  // `labelFromData(data)` names what the fetch RESOLVED (the Map's `Q64` → "Berlin") and is consulted first —
  // while loading, the config label answers. See `src/lib/widgetTitle.js`. A field that applies to only one
  // source declares `showIf` (AGENTS.md).
  configFields: [                             // drives the ⚙ panel
    { key: 'param', label: 'Param', type: 'text', placeholder: 'Something' },
    // type: 'select'  → add options: [{value, label}]
    // type: 'number'  → parsed with parseInt (use 0 as the "off" value)
    // type: 'boolean' → renders a checkbox
    // type: 'textarea' → multi-line text (rows: N, default 6) — e.g. Markdown content
    // type: 'params'   → checkboxes for the board's declared params (Board Controls,
    //                    ISSUE-59) — the value is a comma-separated allow-list
    // Panels scroll inside the card and pin "Apply & Reload" to the bottom
    // (ISSUE-54), so a long field list never makes settings unreachable on a
    // small widget — no per-widget work needed. `npm run smoke:panels` guards it.
  ],
  fetch: (config) => fetchMyData(config.param),
  transform: (data) => ({
    title: data.param,
    subtitle: 'What you're looking at',
    value: data.key?.toLocaleString(),
    detail: 'Extra line under the big number',
    trend: data.trend,                        // optional: sparkline [{date, views}]
  }),
},
```

### 3. Pick a renderer (or use the transform contract)

- **StatCard** — `{ title, subtitle?, value, detail?, trend?, trendLabel? }`
- **RankingCard** — `{ title, subtitle?, columns: [c1, c2], rows: [[r1c1, r1c2], ...] }`
- **TrendCard** — `{ chartData: [{date, views}], chartKey, chartLabel }`
- **ExcerptCard** (Article Excerpt) — `{ title, description?, extract, thumbnailUrl?, pageUrl? }`
- **EditHistoryCard** (Edit History) — `{ title, project, rows: [{revid, timestamp, user, comment, delta}] }`
- **QualityCard** (Article Quality) — `{ title, grade?, probabilities?, score?, revid, model }`
- **AssessmentsCard** (WikiProject Assessment) — `{ title, rows: [{project, class, importance}], total }`
- **GalleryGridCard** (Gallery, grid) — `{ title, subtitle, rows: [{title, caption, thumbUrl, fileUrl}], size }` — **shared with `gallery`** (same card, different fetcher)
- **GalleryListCard** (Gallery, list) — same contract, rows render thumb-left/caption-right — also shared with `gallery`
- **MediaPlayerCard** (Video / Media Player) — `{ title, subtitle, rows: [{title, fileUrl, mediaType, derivatives: [{type, width, height, src}], originalUrl, duration}], mediaType, quality, loopPlaylist, shuffle, autoplay }` — native `<video>`/`<audio>` per track; the renderer picks the best transcoded VP9 WebM for the requested (height-based) quality, falling back to the original; jukebox controls (next/prev, loop wrap, shuffle, ▶ Start pill for autoplay policy)
- **ArticleListCard** (Article List) — `{ title, subtitle, rows: [{title, pageUrl, thumbUrl?, extract?}] }` — clickable rows, optional thumb + 3-line intro. The same row contract works for any pasted-list widget.
- **CimSnapshotCard** (CIM Snapshot / File Spotlight) — `{ title, subtitle?, stats: [{label, value, sub}], trend?: [{date, views}] }` — reuses the GlamCard stat-tile markup, optional monthly-view sparkline.
- **FileTrafficCard** (CIM Views Over Time, the file arm) — `{ title, subtitle, rows: [{date, views}] }` — SVG line chart with labeled X/Y axes and −/+ zoom (client-side slice of the fetched window); the card header shows the displayed range.
- **CimTopFilesCard** (CIM Top-N, facet: files) — `{ title, subtitle?, rows: [{title, views, thumbUrl?}] }` — ranked rows with 44px thumbs (RankingCard has none).
- **SparqlCard** (SPARQL Query) — one renderer, mode decided by the transform: `{ mode, title, subtitle, … }` where mode is `stat` (StatCard contract), `line` (TrendCard contract), `bar` (`{rows: [{label, value}]}`), or `table` (`{columns, rows: [[cells]]}`). Auto-detect lives in the widget's `transform` (config.renderer overrides).

Need a new shape? Add a renderer component to `WidgetFrame.jsx` and extend the
`WidgetContent` switch — keep it dumb (it only receives the transformed `data`).

### Sharing renderers across widgets

Cards are shared **by name** — several registry entries can dispatch to the
same card, each with its own `fetch`/`transform`. Precedent: `gallery` and
`gallery` both render `GalleryGridCard`/`GalleryListCard` via their
`getRenderer`. If your widget's data is a set of media, emit the canonical
image-row contract (`rows: [{ title, thumbUrl, fileUrl, caption }]`) and you
get the grid/list for free. For a new display mode (slideshow / ticker —
ISSUE-33/34/37), add the card ONCE plus one `WidgetContent` case, then each
widget opts in via `getRenderer(config)`. The fetcher is the only
per-widget piece; the transform carries provenance wording (subtitle).

### 4. Optional: add a default starter widget

Edit `DEFAULT_WIDGETS` and `DEFAULT_LAYOUT` in `App.jsx` (mind the layout slots:
12 columns, `w` spans, `minW`/`minH`).

### 5. Regenerate the Ask manifest

`npm run build` runs `scripts/generate-manifest.mjs`, which extracts every
entry's id/name/description/configFields (incl. select options) into
`public/manifest.json` — the source of truth for the ✨ Ask advisor's LLM
prompt and the offline matcher. A new widget appears in Ask automatically
on the next build; verify it with a prompt that should match it.

### 6. Document it

Add a row to the widget catalog table in `README.md` and a section in
`docs/DATA-SOURCES.md` (endpoint, params, gotchas).

## Checklist

- [ ] Fetcher throws real errors, no raw envelopes
- [ ] `origin=*` on Action API calls
- [ ] Config change re-fetches automatically (free — WidgetFrame re-runs `load` on config change)
- [ ] `refreshSeconds` honored
- [ ] Empty / error states look right (the frame handles them, but verify the transform's defaults)
- [ ] `npm run lint` passes; `npm run build` succeeds
- [ ] `npm run smoke` passes (grid geometry; run after any react-grid-layout upgrade)
- [ ] Ask manifest regenerated (automatic in `npm run build`) and a sample Ask prompt finds the new widget
- [ ] Smoke-test in the browser: add from catalog → configure → reload page (persistence)

## Example: the smallest widget

```js
ping: {
  id: 'ping',
  name: 'API Ping',
  icon: '🏓',
  description: 'Latency check against the Action API',
  defaults: { refreshSeconds: 60 },
  renderer: 'StatCard',
  dataSource: 'mwapi',
  configFields: [],
  fetch: async () => {
    const t0 = performance.now();
    await fetchJSON('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*');
    return { ms: Math.round(performance.now() - t0) };
  },
  transform: (data) => ({ title: 'API latency', value: `${data.ms} ms`, detail: 'en.wikipedia.org' }),
},
```

That's the whole widget — registry entry, zero new files.

## Static widgets (no fetch)

A widget that needs no network — like the **Text / Markdown** card — simply
**omits `fetch`** and derives its render data from config in `transform`:

```js
markdown: {
  id: 'markdown',
  name: 'Text / Markdown',
  icon: '📝',
  description: 'Free-form Markdown card — notes, headings, links',
  defaults: { text: '## Welcome\n\nEdit me with ⚙', refreshSeconds: 86400 },
  renderer: 'MarkdownCard',
  dataSource: 'static (no fetch)',
  configFields: [
    { key: 'text', label: 'Markdown content', type: 'textarea', rows: 8 },
  ],
  transform: (data, config) => ({ markdown: config.text }),
},
```

WidgetFrame renders `transform(null, config)` immediately — no Loading state,
no auto-refresh interval. The Markdown renderer is `src/lib/markdown.js`
(zero-dep, escape-first; subset: headings, bold/italic/code/links, lists,
quotes, hr, fenced code blocks).

The other static widget is **QR Code** (`qrCode` / `QrCard`): it derives its
payload from config and encodes it locally via `src/lib/qr.js` — no fetch, no
API, works offline and in kiosk mode. It also **emits** its text, so a static
widget can still be a dataflow producer.

## Declaring an appearance field (the `edgeToEdge` pattern)

Some fields describe the *card* rather than the data — today just `edgeToEdge`, before that `verticalAlign`. They are
declared **per type** rather than globally, so only the types that have something worth filling a box with offer the
switch, and one shared field object (`EDGE_TO_EDGE_FIELD` in `src/widgets/index.js`) keeps the wording from drifting.
Three things to get right when you add one:

1. **A registry default** (`edgeToEdge: false`) — the ⚙ panel shows the value the card is rendering, and a missing
   default is how a field ends up showing an empty box while the card does something else (ISSUE-110).
2. **A real boolean read** (`resolvedConfig.edgeToEdge === true`) — the config is normalised through the registry's
   field types before it reaches the card, so `'true'` from a hand-written board is already `true`.
3. **The card's own inset is yours to drop.** The frame handles the title bar and the body padding; the *inner* card
   padding, borders and radii are per-renderer, and an edge-to-edge card that keeps them looks broken rather than
   immersive. Add the selector next to the others in `src/App.css`.

# Merging or Retiring a Widget Type (read before collapsing a family)

The catalog is not append-only. Twice now a family of near-identical widgets has been folded into one parameterised
type, and both times the same questions had to be answered, so this is the checklist rather than a story about what
happened.

- **Gallery** (2026-09): `commonsGallery` + `fileGallery` → `gallery` — one type, three sources, `showIf` on the
  source-specific fields. Implementation: `src/lib/gallerySource.js`, `LEGACY_WIDGET_IDS` in `src/widgets/index.js`.
- **Commons Impact Metrics** (2026-10-03): nine types over nine endpoints → `cimStats` + `cimTrend` + `cimRanking` —
  three result *shapes*. Implementation: `src/lib/cimFamily.js`, the legacy map, and `tests/cim-family.test.mjs`.

## When a merge is right

Not "these look similar" — **these answer the same question about the same data and differ only in a parameter**. The
CIM cut had the honest test: three independent properties agreed on the same three groups — the return shape (counts /
a `{date, views}` series / ranked rows), the renderer family, and `timeScope`. When those agree, the type boundary and
the data boundary are the same line, and the merge is a simplification. When they disagree — because two widgets share
a renderer but not a shape, or share `timeScope` but not a shape — you are probably looking at *one type with a
display mode*, which is a renderer decision (ISSUE-38), not a catalog one.

The cost of NOT merging is what the frontier looks like: a catalog where a reader has to know which of nine entries
answers "how are these files being viewed" is a catalog that has delegated a decision to the reader.

## The five steps

1. **Add the surviving type(s)** to `WIDGET_TYPES` and **delete the retired entries from it.** The registry is an
   object keyed by id — delete from `id: 'x',` to the next `id: 'y',`, taking the whole entry, or the following entry
   loses its own (AGENTS.md has the incident: 588 of 609 tests stayed green while `commonsGallery` became `fileUsage`).
   Rename the internal view helpers if a new type id collides with one (the CIM merge renamed `cimRanking()` →
   `cimRows()` for exactly that reason).
2. **Make the retired ids resolve** in `LEGACY_WIDGET_IDS`, as `'newId'` or as `{ type: 'newId', config: {...} }` when
   the old id *implied a selector value* — `cimTopPages` and `cimTopWikis` are the same widget with different configs,
   so the old id is the only evidence of which one a board meant. `widgetDef()` merges that `config` into the resolved
   definition's `defaults`, which is where `normalizeConfigForDef` fills a stored config from — **only for keys the
   config lacks**, so a stored board is never rewritten. Resolved definitions are memoised: `WidgetFrame` uses the
   definition as a `useMemo` dependency and a fresh object per render would defeat it.
3. **Keep the aliases out of `WIDGET_TYPES`.** The ⚙ Add panel is built from `Object.values(WIDGET_TYPES)`, so an
   alias key is a second `+` button for the same card; `recentWidgetDefs` de-duplicates by `def.id` for the same
   reason. Configs and docs refer to the *surviving* id.
4. **Prove backward compatibility with a test, not with a promise** — `tests/cim-family.test.mjs` is the worked
   example: every retired id resolves to the expected type *and* the expected selector value; an old-shaped config
   gains the selector and loses nothing; `normalizeConfigForDef` returns the new keys and keeps the old ones; the
   transform still renders the question the old board asked; and the retired ids are asserted absent from
   `WIDGET_TYPES`.
5. **Move what we publish, leave what others hold.** Shipped boards (`public/*.json`), fixtures, the Ask few-shot,
   helper id lists in `scripts/`, and the `dashboard.schema.json` enum all have to move — the last one
   **additively**: keep every retired id in the enum, because external tools validate against it and an old board is
   still legal. Boards in the wild (localStorage, `?config=` URLs, exports) are never touched.

## Traps, each of which cost time once

- **`tests/demos.test.mjs` asserts every shipped card's `widgetType` is a *direct key* of `WIDGET_TYPES`** — not merely
  resolvable through `widgetDef`. So our own boards must migrate even though old boards keep working.
- **`scripts/docs-facts.mjs` finds registry ids with `^\s{4}id:\s*'…'`** (four spaces). A new entry indented
  differently is invisible to the count gates, and the counts then pass while being wrong. Its `WIDGET-MAP` check is
  one-directional too: a regenerated map that keeps old rows still passes.
- **`scripts/generate-manifest.mjs` parses this file's source text.** Two consequences: a property that follows a
  comment line inside a parsed object is invisible to it (`prop()` needs the `{` or `,` immediately before), and a
  **single-line** shared field constant (`const X = { key: '…' };`) never reaches the manifest — the regex wants the
  closing `\n};`. That is why `CIM_MONTH_FIELD` is written across two lines.
- **A shared field constant can only carry one `showIf`.** The CIM merge needed two category fields — one gated on
  `subject`, one on `facet` — as two constants with the same `hint` sentence, because a field hidden by the wrong
  selector is a field the panel never shows (the hint sentence is asserted by `tests/ask-validation.test.mjs`, which
  is what keeps the two copies honest).
- **The Ask few-shot lives in `deploy/server.js` and is mirrored in the checked-in bundle `av.mjs`** — edit both, or
  the prompt keeps teaching the retired id.
- **`RETIRED_WIDGET_NAMES` in `scripts/docs-facts.mjs` is the only thing stopping a retired *name* from creeping back**
  into the docs or a board's welcome text. Add the names in the same commit as the merge (AGENTS.md rule: a departed
  widget's name is annotated on first appearance, not silently dropped).
- **Count claims move together** — the type count, the data-driven count and the catalog-widget count were duplicated across
  ~22 sources; `node scripts/docs-facts.mjs` names the file that disagrees, so run it and fix what it names rather
  than trusting a search-and-replace.
