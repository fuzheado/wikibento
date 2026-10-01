# Geometry: paths, polygons and time — the format, and why it is this one

*Read this before adding a widget that draws, consumes or publishes a shape. The decisions here were made once, on
2026-10-01, and the point of them is that nothing about geometry is a WikiBento dialect.*

## The short version

- **The wire format is GeoJSON (RFC 7946).** Not our own `{points: [...]}` shape, not SVG, not a TileJSON or MVT
  dialect. `src/lib/geojson.js` is the only place that reads or writes it.
- **Always a `FeatureCollection`**, even for one shape: properties need a home, a path and an area can travel together,
  and a consumer has exactly one shape to handle. A bare geometry, a bare `Feature`, an array of either, or a JSON string
  of any of them is accepted on intake and wrapped.
- **Coordinates are `[longitude, latitude]`, WGS84 degrees** — the RFC's order. Our internals are `{lat, lon}`; the
  conversion happens in exactly two modules (`geojson.js` and `mapOverlay.js`), which is why a swap is a first-class
  concern below.
- **The value is typed**: `{ type: 'geojson', data: <FeatureCollection> }`, read strictly by `readGeojsonPayload`.
  A value without `type: 'geojson'` is **not** geometry, so plain strings and objects keep their old meaning (the rule
  `{ type: 'speech', … }` established).
- **Time is named the way STAC and OGC API–Features name it**: `datetime`, `start_datetime`, `end_datetime`; a moving
  path may carry `properties.times`, one per vertex.

## Where geometry comes from, and where it goes

| road | how | notes |
|---|---|---|
| **A list of places** | the Map widget's `points` field, one per line (a coordinate, a Wikidata item, a page title, up to 100, batched) + **The points draw**: *Markers* / *A path* / *An area* | the human road; a path needs two places, an area three (the ring is closed for us) |
| **Pasted GeoJSON** | the Map widget's `geojson` field — paste, or `{{widget:id}}` | read liberally: see the intake table |
| **Another widget** | the `source` field (`kinds: ['geojson']`), fed by any widget publishing `kind: 'geojson'` | today that is the **Map** itself, so one map can draw another's shape. The ⚙ picker offers only geometry emitters to that field, and `tests/manifest-compliance.test.mjs` fails if a declared kind is not one something publishes |
| **Wikidata mapdata** | `maps.wikimedia.org/geoshape?getgeojson=1&ids=Q…` (P3896) and `…/geoline?…` (P402) | already GeoJSON, `ACAO: *`, so **no relay**: the browser fetches it directly. Verified 2026-10-01: Museum Island is a `MultiPolygon`, a 422-point `MultiLineString` came back for a geoline, an item with no line returns **0 features rather than an error** |
| **A SPARQL result** | the SPARQL widget's `map` renderer: a WKT `Point(lon lat)` column or a `lat`/`lon` pair | WKT arrives longitude-first, like the RFC — see `fromWkt` |
| **Out** | the Map widget publishes `outputs: { kind: 'geojson' }` (`emit` → the typed envelope) | and the card *shows* what it publishes, which is the Emitter Contract's rule 4 |

`toRows()` (one row per vertex: `index`, `part`, `lat`, `lon`, `time`) is the shape CSV and animation layers want;
`featuresToRows()` (one row per dated feature) is the shape **the timeline already reads** — `vars: ['when','what',
'group']`, which `detectTimeline` matches by name. See "Time" below.

## What is read, and what passes through

We read exactly these `properties`, and nothing else:

| property | meaning |
|---|---|
| `label` | the name a marker tooltip or a timeline row shows |
| `wikidata` | the QID the shape came from, kept for traceability |
| `role` | `stop` \| `path` \| `area` — what the shape *is* to this card (a point is a stop, a polygon is an area; a `LineString` of stops is a path) |
| `datetime` · `start_datetime` · `end_datetime` | an instant, or an interval |
| `times` | one time per vertex, for a moving path |

Everything else in `properties` is preserved untouched, so a pasted file loses nothing. **Style hints are ignored** —
`properties.stroke`/`fill` (the de-facto simplestyle convention) do not reach the renderer: style belongs to the card's
⚙ panel, and the Emitter Contract's first rule is that an emitter publishes data, never presentation.

## Intake: repair, refuse, or simplify — and say which

`toFeatureCollection()` is the only door in, and it applies the severity model from
[JSON-FORMAT.md](JSON-FORMAT.md) to geometry:

| severity | case | behaviour |
|---|---|---|
| **Unusable** | not JSON; no `features`; a type that is not one of the seven; **`coordinates` missing or empty**; a position that is not `[lon, lat]`; coordinates outside WGS84 when they are not a simple axis swap (a projected CRS — someone pasted EPSG:3857) | refused, with the reason named. The refusal is **shown on the card**, not swallowed: an unusable paste is usually the wrong key or a fragment, and an empty map would hide it |
| **Repairable** | a ring that is not closed (RFC 7946 §3.1.6) → closed; a third position (altitude) → dropped; a bare geometry / `Feature` / array → wrapped; a `GeometryCollection` → flattened into its parts; `when`/`date`/`time`/`timestamp` → `datetime` and `begin`/`end` → `start_datetime`/`end_datetime` (KML's words, accepted, then normalised to STAC/OGC's); **`|lat| > 90`** → the axes are swapped → swapped back; a `times` array whose length is not the vertex count → dropped with a note; a shape too small to be one (a line under two positions, a ring under four) → dropped with a note | repaired, and reported — including on the card, where the reader can see it |
| **Inefficient** | 200+ features; 2,000+ vertices in one feature | the first 200 features are kept; oversized geometry is **simplified** (Douglas–Peucker, tolerance grown until it fits) and the card says so ("simplified 1 feature (2,410 vertices removed)") |

**What we deliberately do not do.** We do not rewrite ring winding (we never compute "inside" ourselves — SVG's
`fill-rule="evenodd"` and the browser do), we do not split shapes at the antimeridian (RFC 7946 §3.1.9 says to; until a
real case appears, a shape crossing ±180° draws as a band across the map and the docs say so), and we do not require
style. `simplifyGeometry()` is available for callers that want to simplify deliberately.

**Sizes, measured rather than guessed** (2026-10-01): Berlin's mapdata outline is 484 vertices / 13.6 KB, Germany's 948 /
26 KB, a geoline 422 / 11.9 KB. So the caps — **200 features · 2,000 vertices per feature · 256 KB** — are a safety net
for a pasted country outline, not the normal path. They exist because an emitted value is copied into board state,
persisted in `localStorage` and `?config=` URLs, and hashed for change detection: the Emitter Contract asks for a
size/transfer policy with every new kind, and this is it.

## Time: a standard, not a dialect

GeoJSON has no time member by design, so the only real question is *naming*. Three precedents, and we follow them:

| precedent | what it says | what we take |
|---|---|---|
| **STAC** and **OGC API–Features** | `properties.datetime` (RFC 3339), with `start_datetime` + `end_datetime` for an interval | our canonical feature-level names |
| **KML** (`TimeStamp/<when>`, `TimeSpan/<begin>/<end>`, `gx:Track`'s parallel `<when>`/`<gx:coord>`) and **GPX** (`<trkpt><time>`) | time on a feature, and **one time per vertex** for a moving track | the words we accept (`when`, `begin`, `end`) and the shape of `properties.times` |
| **OGC MF-JSON** (Moving Features) | the formal standard for time-varying geometry: `datetimes` beside `coordinates` | the concept, acknowledged; our form is the simpler parallel array that KML and every animation layer already use |

Three rules keep it honest, and all three match what the timeline module already does:

1. **Precision is never fabricated.** Wikidata's year-precision date (`precision: 9`) becomes `"1944"`, not
   `1944-01-01T00:00:00Z`; month precision becomes `"1944-06"`. `normalizeTime(value, precision)` is the only place that
   truncation happens, and `src/lib/timeline.js` was taught to read the reduced forms rather than the data being bent to
   suit it. (`formatTimelineEvent`: "never more precision than the source asserted".)
2. **ISO 8601 sorts lexicographically**, reduced precision included (`"1944" < "1944-06-06"`), so ordering needs no
   parser on the wire.
3. **If `times` exists, the whole-feature fields are derived** (first/last) when absent, so a consumer that only
   understands feature-level time still gets the right answer.

**How a shape becomes a timeline** — no conversion, by construction:

```
features ──featuresToRows()──► { rows: [{when, what, group}], vars: ['when','what','group'] } ──► buildTimeline()
```

`when`, `what` and `group` are exactly the names `detectTimeline` matches, and the `when` values are the strings
`parseTimelineDate` already reads. `group` is only declared when a feature carries one, because an always-empty series
column would make `buildTimeline` name every lane "—". A feature with `times` and no `datetime` contributes one event at
`times[0]` — the interesting view of a track is the map, not a timeline of 400 vertices.

## Drawing: one image, one overlay, no library

`mapOverlay.js` owns the geometry the browser does not do for us:

- `projectGeometry(collection, view)` → per-feature **groups of lines in the image's own pixel space**. Groups are
  drawn as one `<path>` each, so a polygon's holes are holes (`fill-rule="evenodd"`).
- The SVG's `preserveAspectRatio` mirrors the `<img>`'s `object-fit` (`xMidYMid slice` *is* `cover`), so the browser
  scales and crops the shapes exactly as it does the image — no per-frame maths, nothing to keep in sync.
- Shapes and markers are the same projection, so a card can draw both; markers come from `Point` features, shapes from
  the rest, and the card notes what it drew ("1 shape · 5 vertices · 1944-06").

## Wiring, in the app's own terms

- **Consumer:** a `source` field with `kinds: ['geojson']` (`docs/MEDIA-DATAFLOW.md`'s consumer mirror, in its smallest
  useful form: the ⚙ picker filters by kind, and the manifest gate checks that a declared kind is documented *and*
  published by something in the catalog).
- **Emitter:** `outputs: { kind: 'geojson' }` + `emit: (data) => geojsonPayload(data.collection)`. A single kind, so the
  bare `{{widget:id}}` means the geometry and no `primary` is needed. A widget that later publishes a *second* channel
  moves to the channel-map form and declares `primary` (the Emitter Contract's rule 7).
- **A new output kind is a design act** — the five steps are in
  [WIDGET-DEVELOPMENT.md](WIDGET-DEVELOPMENT.md#adding-a-new-output-kind), and `geojson` went through all of them.

## What this buys, beyond the map card

- **A drawing widget** (Leaflet.draw, MapLibre GL Draw, Mapbox Draw) emits GeoJSON, so it would need no conversion and
  the same envelope.
- **The interactive (tiled) map**, when Tier 2 arrives, consumes the same payload as the static card — one format, two
  renderers.
- **Non-map consumers**: `lengthKm()` (great-circle) and `boundsOf()` are the beginnings of a "facts about this shape"
  card; `toRows()` is the CSV export; a globe needs nothing but lat/lon.
- **Time + place together** without inventing a combined payload: geometry travels as GeoJSON, and the timeline reads
  rows derived from it.

## Verified

`npm run check:map-landmarks` has three phases, and the third is this one: a **live geoshape** (Museum Island) is
projected, drawn on a card whose aspect is not the image's, and then the map pixels **inside** the shape are classified
(land — it is an island) and **just outside** its shoreline (the Spree). A deliberately mis-scaled projection is drawn
too, and the phase fails if it does not notice. See [VERIFIED-WORKING.md](VERIFIED-WORKING.md).
