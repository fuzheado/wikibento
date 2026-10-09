# Clickable zones on an image — the HyperCard button layer

> **Status: slice A is built** (branch `feat/zones-mvp`, 2026-10-08) — the text field, the overlay, the click →
> `selection` emit, and a shipped demo (`?config=/zone-demo.json`) whose zones are a file's own Commons notes. The rest
> (the editor, the import ladder, the 360° half, tours) is still a design, in the order §Can this be a clean feature
> branch? sets out. Filed as **ISSUE-138**.
> Wireframes, all rendered from real data rather than drawn by hand:
> `docs/zone-card.png` (the reader's view) · `docs/zone-editor.png` (the editor) ·
> `docs/zone-sphere.png` (the 360° case — **this one is a live Pannellum render**, see §Photospheres) ·
> `docs/zone-tour.png` (a zone that moves the card itself — see §Tours) ·
> `docs/zone-arrival.png` (where a jump lands — see §Arrival view) ·
> `docs/zone-suggest.png` (importing notes and choosing their targets — see §Where the zones come from).

## The word: a **zone** (field `zones`)

One term has to cover a drawn box on a photograph and a pin on a 360° sphere. **Decided (Andrew, 2026-10-05):
`zone`** — `zones` in the board JSON, "zone" in the UI and the guide.

| candidate | evidence in this repo |
|---|---|
| **zone** | 26 hits, and **not one is a bare "zone" as a term of art**: ~20 are the QR widget's *quiet zone* (a fixed compound — its config label is "Quiet zone (modules)"), the rest are the JS *temporal dead zone* in code comments and one quoted idiom. Nothing in the map vocabulary touches it. Stretches honestly from a drawn box to a pin, and would still fit if a sphere zone ever grows a radius. |
| spot | the first draft's word (2026-10-05, same day, never shipped): 12 incidental hits and free of collisions, but the engine we vendor for the sphere calls its pins `hotSpots`, and "spot" sits one letter from the IIIF/museum word Andrew wanted distance from. |
| *hot zone* | **declined.** In English a *hot zone* is a contaminated or dangerous area (epidemic, hazmat, war) — the wrong association for a Wikimedia and GLAM tool. And "hot" appears in this whole repository just five times, every one of them *"hot spot"* (the Pannellum vendor's strings and our own panorama-tour idea), so the adjective would import the museum word rather than leave it behind. The HyperCard *sense* — an area that is live — is better said in prose than carried in the noun. |
| hotspot | the museum and IIIF-viewer word to avoid; kept only as the search term that finds this file. |
| region · area · shape · overlay | **taken** — the map/GeoJSON vocabulary (`region` 67 hits, `area` 51, `shape` in the map widget, `overlay` is `lib/mapOverlay.js`). |
| marker · pin | **taken** — map markers and pins (35/45 hits). |
| button | **taken** — the card's chrome (ⓘ ⚙ ↻ ✕) is *the buttons*; 358 hits. HyperCard's own word, but the chrome owns it. |
| target · tag · badge · anchor · note | **taken** (192/43/55/43/212 hits). |

So: **`zones`** in the board JSON, "zone" in the UI and the guide, a GLOSSARY entry with the avoid-list, and
`tests/zones.test.mjs`. The reader-facing sentence is *"tap a zone"*. Nothing has shipped under any other name, so
no board in the wild needs a compatibility alias — the only migration is this file and its three pictures.

## The idea, and the one fact that makes it cheap

An image fills a card. Zones are live: hovering shows *that a zone exists*, clicking one **emits a value** — an
article, a Commons file, a category — and other cards react, because cards that react to values are what this app
is already made of.

| the piece | where it lives today |
|---|---|
| click → emit | the Gallery already does exactly this: its `Clicking an image` field set to *Send it to the board* publishes the clicked file on the widget's `selection` channel (`handleSelect` → `onOutput(id, value, 'selection')`, ISSUE-91) |
| the consumer contract | any card with `source: id#selection`, or the `{{widget:id#selection}}` token — Article, Excerpt, Gallery, Media player, List, Filter, Map, Translate … |
| kind compatibility | `OUTPUT_KINDS`, per-widget `outputs`/`kinds`, `kindsAccepting()` and the article ⊂ page rule (ISSUE-118), and the spawn menu built on them (PR #105) |
| the host cards | the Gallery in `displayMode: single` (*"Single image (the first image fills the box)"*) with `imageFit` and `edgeToEdge`; and the 🌐 360° Panorama Viewer, whose engine already draws and clicks zones |
| a full-screen overlay | the 360° viewer's expand-to-full-screen portal (ISSUE-137): the same shape the editor needs, and the same reason — a card is small, and iOS has no Fullscreen API for non-video elements |
| custom field editors | config fields that bring their own editor (`source`, `params`, `preset`, `speech`), plus `showIf` (28 uses) so a field appears only for the source it applies to |
| how a bad value is treated | ISSUE-134's three lists — a value the declared type can read is repaired *and reported*; an impossible one is an error |

**A zone is not a new subsystem; it is a second way to fire an event the Gallery already fires.**

## The data model — one record, two geometry dialects, stored as text

**Storage is decided (Andrew, 2026-10-05): structured text in a textarea**, following this repo's own precedent for
structured config — the map's `points` ("one place per line"), `spec` (`name | type | Label | options`) and `geojson`
(RFC 7946, pasted). Not a nested JSON array, for the reasons in §Can this be a clean feature branch: text is what the
map already does, it needs **no new field type** (so `configNormalize` keeps coercing a string and `boardDoctor` needs
no nested error paths), it stays readable and pasteable, and an agent authoring a board writes lines rather than
nested JSON.

One zone is one line — `geometry | label | kind | value | action`:

    # the card's current file; `# scene: <id>` opens a scene's own block in a tour
    18.1,14.4,5.7,6.7 | Piz Nuna     | article | de:Piz Nuna     | go planetarium
    7.6,16.7,6.8,8.2  | Piz Sursass  | article | de:Piz Sursass  | send
    at 4,-30          | Mauna Kea    | article | en:Mauna Kea    | go detail yaw=200 hfov=110
    -                 | King of Arms | article | en:King of Arms | open

- **geometry** — `x,y,w,h` as **percentages of the image** (never pixels) for a flat picture; `at pitch,yaw` in
  degrees for a 360° panorama. Percentages survive every thumbnail width, card resize, print DPI and the editor's
  zoom, and the viewer decides which dialect is valid — a percentage box on a panorama, or a `pitch,yaw` on a flat
  image, is an **error**, not a repair, because a silently reinterpreted geometry points at the wrong place.
- **label** — what the reader sees on reveal; `-` when a zone is anonymous.
- **kind** + **value** — what a click emits (`article` → `de:Piz Nuna`); `-` for a zone with *no target*, which
  §Where the zones come from makes a first-class and common outcome.
- **action** — `send` (the default: emit on the card's channel), `open` (the file in a new tab), `go <sceneId>` with
  an optional arrival view (`yaw=`, `pitch=`, `hfov=`; §Arrival view), or `-` for a zone that only outlines.

The exact grammar is slice A's first commit, with parser *and* round-trip tests, because the editor reads and writes
this text: the board file stays something a person can read, diff and fix — the property the map's geometry text has.

### Two Wikimedia standards already use this shape (verified 2026-10-05)

1. **`P2677` relative position within image** — on Wikidata and SDC the value in the wild is literally
   `pct:1.5,8.7,96,91.1`: `pct:` + `x,y,w,h` in percent. Checked on the Mona Lisa item (Q12418): 2 of its 9
   `depicts` statements carry one. So a zone's box can be **written as** that qualifier, and read back.
2. **Commons image notes** — the ImageAnnotator gadget's `{{ImageNote}}`, stored in the file's wikitext:

   ```
   {{ImageNote|id=2|x=3190|y=1365|w=1000|h=500|dimx=5472|dimy=3648|style=2}}
   Magehorn
   {{ImageNoteEnd|id=2}}
   ```

   Absolute pixels *plus the file's own `dimx`/`dimy`*, so normalising is a division; the label is the text
   between the tags and may be wikitext. `style` is only a marker class — per the template's own documentation
   the geometry is always a rectangle. **The corpus is large**: an insource search reports ~376,000 File-namespace
   pages containing the template, ~360,000 of them `style=2` (search-index estimates).

So **you do not draw what Commons already knows**: *Read Commons notes* is one Action API call
(`prop=revisions&rvprop=content`, CORS ✓) plus a small parse, and the zones arrive with labels and often links.
A 360° upload usually has **no** notes (the example in `docs/zone-sphere.png` has none), so the import is a
flat-image superpower first.

## Where the zones come from — Commons notes, and the targets they do not have

*Read Commons notes* is one Action API call (verified): a file's `{{ImageNote}}` boxes arrive with their labels, at
their real coordinates. What arrives **without** a target is the interesting part, and it is where this feature either
becomes useful or becomes a quiet source of wrong links.

| rung | the source | what it gives |
|---|---|---|
| 1 | **a link inside the note text** | the note author's own answer, free — a `[[Dom Pedro II]]` needs no search |
| 2 | **the file's structured data** | `depicts` statements give QIDs, sometimes with a `P2677` relative position that lands inside the same box |
| 3 | **search, with the role kept** | head form *plus* the role words, full-text, on a wiki — the rung that does the work |
| 4 | **the author's eye** | the last word, always; and "no target" is a legitimate outcome |

Measured on a real file (`docs/zone-suggest.png`): Porto-alegre's *Estudo para a sagração de Dom Pedro II*, c. 1840 —
**11 notes**, English labels, **0** structured-data claims, **0** links inside the notes. Rungs 1 and 2 are empty, so
rung 3 carries it, and here is what rung 3 does on that file:

- **The head form alone: 8 of 11 hits, three of them the wrong thing.** "Dom Pedro II" → a *work of the Brasiliana
  Iconográfica*; "Dona Francisca" → a *municipality of Rio Grande do Sul*; "Dona Januária" → an **1820 ship**.
- **The full label is worse: 0 of 3.** The appositives ("…, archbishop of Bahia province.") stop the search dead.
- **Head form + the role words fixes them**, on the board's wiki — *"Dona Januária Princess Imperial of Brazil"* →
  *Princess Januária of Brazil*; the ship disappears once the role is in the query.
- **The notes' language is not the subject's.** These are English notes on a Brazilian painting: `pt.wikipedia` found
  *Romualdo Antônio de Seixas* that English never surfaced, while English found the princess under a spelling
  Portuguese does not use. Search the label's language **and** the board's wiki; let the author choose.
- **A role is a fine target.** "Rei-de-armas (King-of-Arms)" resolves to the *concept* article **King of Arms** —
  which is what a reader hovering that figure wants.
- **A sentence is not a name.** The eleventh note describes the painting-within-the-painting; its proposal is "no
  target", and it should stay one. A zone may be nothing but a label until someone gives it a job.

Rules that follow — all of them about not lying to the reader:

1. **Propose, never bind.** Candidates arrive with their **description** (the thing that tells *Princess Januária* from
   *Dona Januária (1820 ship)*) and their wiki, and the author accepts or rejects each. A silent wrong bind is worse
   than an unbound zone: the reader clicks a face and gets a municipality.
2. **Store what the consumer reads** — a page title in the app's `lang:Title` form — and keep the QID beside it as
   provenance, so a later re-run re-checks rather than re-guesses.
3. **"No target" is first class.** The zone still outlines and still labels, and can still be a `go` link in a tour.
4. **Keep the role words.** They are not noise to strip: they are the disambiguator, so the cleaning rules (cut at the
   first comma, lift the parentheses) should *feed them to the search*, not discard them.
5. **Nested boxes need an order.** A detail inside a scene is two notes, one inside the other; the list order decides
   which wins a click (later on top), and the import preserves the file's own order.

None of this is new machinery: the app already searches — `src/lib/paramSources.js` does `prefixsearch`,
`list=search` and `wbsearchentities` for the param pickers — so the import's *suggest* step is a new caller of an
existing client, not a new client.

## Reader interaction — decided (2026-10-05)

- **Desktop:** hover reveals the zone (outline + its label); a click acts immediately. The hover *is* the reveal step.
- **Touch:** the first tap reveals — all zones outline and the tapped one shows its label; **a second tap on the
  same zone acts**. Tapping elsewhere dismisses. This is what map and museum apps do, because a touch has no hover
  and an accidental tap should cost nothing.
- **Keyboard:** Tab reaches each zone (they are real focusable elements whose accessible name is the label), the
  focus ring is the reveal, Enter acts. That is the touch rule with the keyboard's own hover.
- **A `showZones` chrome toggle** (`subtle | always`) for kiosk and exhibition use, where nobody will guess.

## Cropping — decided: three fits, the third one keeps the zones

`imageFit` gains a third option beside `contain` (letterbox) and `cover` (fill crop):
**`smart` — *"Fill crop, never cutting off a zone"***.

The geometry is simple enough to state exactly. The card's content box has aspect ratio `A`; with `cover` the crop
window is *fixed in size* and only its **position** is free. Take the union of every zone's box (in image pixels,
plus a margin so a zone is not flush to the edge):

- **Feasible** iff the union's width and height are each ≤ the window's — then there is always a position that
  contains every zone.
- **Choose** the position that centres the union in the window, clamped to the allowed range.
- **Impossible** (the zones straddle more of the picture than the window can hold) → **fall back to letterbox**,
  and say so where the setting is: *"one zone is too wide to crop — showing the whole image."* Never crop a zone
  away silently: a hidden zone is a broken promise.

Implementation is `object-fit: cover` plus a computed `object-position` percentage — no layout code, no
re-measuring the DOM — recomputed on card resize (the aspect ratio is the only input). The **editor** must preview
the crop live, with the parts outside it dimmed, or you will place a zone and then watch the card disagree.

## What a click emits

**A selection emit on the card's own channel — the same event a Gallery click sends.** A consumer cannot tell a
zone click from a tile click, which is exactly right. Per zone, the payload is `value` and the kind is `kind`:

| zone kind | natural consumer |
|---|---|
| `article` / `page` | Article, Excerpt, Wiki box, Translate, Quality, Edit history … |
| `file` | Gallery (show that file), Media player, 360° panorama, IA item |
| `category` | Gallery, List, Category size, GLAM organ, PetScan-style lists |

Deliberate v1 limits: one channel set per card (every zone emits on the same channel; the *value* differs), and
one value per click.

## What a click can do besides emit

- **Send** (v1) — emit on the selection channel. The feature above.
- **Open** (v1, free) — the same `new tab` behaviour the Gallery already offers for a whole-image click.
- **Set a board parameter** (v2) — ROADMAP's *missing CYOA control*: a zone that writes `{{place}}`, filtering
  every card that listens (§Tours). The param machinery and the 🎛️ Board Controls card already exist; this is a new writer.
- **Go — replace this card's own picture** (see §Tours) — HyperCard's `go to card` made literal: a zone whose
  action is `go: <sceneId>` swaps the card's image, and on the 360° side it is Pannellum's own scene switch.
- **External URL** (v2, with a rule) — http(s) only, the domain visible in the label, rejected in the validator's
  error list rather than silently neutralised. Boards are data from outside.

## Tours — a zone that replaces the card's own content (asked 2026-10-05)

Andrew asked for a third action beside *send*: a zone that **replaces the card's own picture** — 2D or 360° — so one
card can be a chain of scenes, Myst-style. The mechanics allow it, in two different ways, and they are worth keeping
distinct:

| the tour lives… | the zone's action | who follows | already proven by |
|---|---|---|---|
| **in the card** — a `scenes` list, each scene a file with its own zones | `go: <sceneId>` | just this card | the 🎞️ Media player navigates itself today: playlist index, ◀ ▶, loop, no board change |
| **on the board** — the card's file is `"File:{{scene}}"` | `set: scene = <file>` | **every card wired to that param** | `public/article-switcher-demo.json` ships exactly this shape — Board Controls writes `{{article}}` and two cards follow |

Recommendation: **the card-local tour first** (it is the thing asked for, it changes nothing about the board, and its
3D half is largely a config translation — Pannellum already has `scenes`, `firstScene`, `sceneFadeDuration` and
`loadScene`), then the **param write** second: that one is also ROADMAP item 6's missing *CYOA control* (click → set
param), and it is what makes a whole *wall* move together — one zone on a map card re-aims a photo card, a caption
card and an article card at once.

Shape (card-local):

```json
{ "scenes": [
    { "id": "wide", "file": "File:Scuol-Motta Naluns…jpg",
      "zones": [ { "label": "Piz Nuna", "kind": "article", "value": "de:Piz Nuna", "go": "planetarium" } ] },
    { "id": "planetarium", "file": "File:'Imiloa grounds 360…jpg",
      "zones": [ { "label": "Mauna Kea", "kind": "article", "value": "en:Mauna Kea", "go": "detail" } ] },
    { "id": "detail", "file": "File:Scuol-Motta Naluns…jpg", "zones": [] }
  ], "firstScene": "wide" }
```

- **Zones belong to the scene, not to the card** — the Commons-notes import is per file, and the geometry rule of
  §The data model applies scene by scene: `box` where the scene is flat, `at` where it is a sphere.
- **The chrome answers "where am I"**: ◀ Back walks the card's own stack, a `2 of 3` counter, and the title follows
  the current scene (the frame already takes its title from fetched data via `labelFromData`).
- **The position is not in the URL — by decision, not omission.** `docs/URL-STATE.md` puts *"where you are looking"*
  in tier **C3: never carried**, and the app writes the URL with `replaceState` only (no `popstate` re-boot, so a
  `pushState` would break Back). A shared link therefore reproduces the **tour**, not where the last visitor stood,
  and Back is the card's own — exactly like the playlist's. Becoming URL-driven is a bigger decision than this
  feature and is not on the table.
- **Instant swaps need prefetching we do ourselves**: Pannellum has no `preload` (checked — absent from the vendored
  build), so a scene loads when entered; entering scene *n* should warm scene *n+1*'s image, at the thumbnail width
  we already choose.
- **The roadmap's cap holds.** Scenes are a **list**; zones point at scene ids; there is deliberately no node canvas.
  ROADMAP item 6 already names the destination as *scenes + zones + gates* — this is the scenes half, and *gates*
  (a card visible only when `{{param}} == X`, the Router family) stays separate.
- **A Myst still lacks**: saved position (the board's `firstScene` is the reset), inventory (out of scope by design),
  and gates. Sound is free *today* — a zone that emits to the 🔊 Speaker card is a click that speaks.
- Worth banking for exhibitions: **reset to `firstScene` after N seconds idle**, beside the panorama's `autoRotate`.

### Arrival view — the view travels with the link, not the scene

A jump between panoramas is not finished until it says **where you land**. That belongs to the **link** — the zone —
not to the destination, because the same scene entered from two zones is two different arrivals: from one you arrive
facing the thing you came to see, from the other you arrive turned back toward the door you came through. So `go`
carries an `arrive`:

```json
{ "label": "→ inside the pyramid", "go": { "scene": "inside", "arrive": { "pitch": -2, "yaw": 20, "hfov": 95 } } }
{ "label": "→ inside the pyramid", "go": { "scene": "inside", "arrive": { "yaw": "+180" } } }   // turn about
```

Three modes, in the order an author reaches for them:

1. **Absolute** — give `pitch`/`yaw`/`hfov`. Deterministic, authorable, and what `docs/zone-arrival.png` shows.
2. **Relative** — a `yaw` offset from the view you *actually left*: `+180` turns you about, `+0` keeps you going.
   This is the arrival that genuinely depends on where you came from.
3. **The destination's own default** — omit `arrive`; the scene's own `pitch`/`yaw`/`hfov` is used (the values
   `firstScene` starts at).

**The engine already takes all of this** — checked in the vendored 2.5.7, not in the docs: a `sceneId` hotspot
passes `targetPitch`/`targetYaw`/`targetHfov` into the scene switch, `loadScene(scene, pitch, yaw, hfov)` does the
same by hand, and `getPitch()`/`getYaw()`/`getHfov()`/`getScene()` read the **live** camera. That last part is what
makes the relative mode and **◀ Back** exact: the stack stores the view you had when you clicked, not the scene's
default, so returning puts you where you stood, looking where you were looking.

Things that will bite if they are not decided now:

- **`getYaw()` returns [-180°, 180°)** — the engine's own convention, so that is what we store. A stored yaw outside
  the circle is a **wrap** (lossless → repaired and reported, per ISSUE-134's model); a `pitch` outside ±90° is an
  **error**, because it cannot mean what it says.
- **The transition is a fade, not a walk.** `sceneFadeDuration` crossfades the picture; there is no camera
  fly-through between scenes, and promising one would need frame interpolation we do not have.
- **Zoom is part of the arrival** — `hfov` 95° is a stroll, 50° is "look at that". The editor sets it by turning the
  destination and clicking *Use this view*, which reads the live camera; a **preview** of the arrival is part of the
  picker, because arrivals are easy to get wrong blind.
- **Flat (2D) scenes have no camera to aim.** Their analogue of an arrival view is *which part of the picture you land
  on*, which only means something once flat scenes can zoom; until then a flat `go` lands on the whole image, and
  this doc should say so rather than pretend otherwise.
- **A reader should be able to tell a *go* from a *send***: Pannellum takes a `cssClass` per hotspot, so the marker
  can differ by action — a walk marker where a zone moves you, an emit marker where it feeds another card. Cheap, and
  it keeps a tour from reading as a wall of identical pins.

## The editor

A four-column card is ~300px wide, so the editor is **a full-screen overlay** — the panorama's portal pattern, not
a popup inside the card. See `docs/zone-editor.png`.

- **Draw** — press and drag on empty image; release and the new zone is selected. (On the sphere: click to place a
  pin, drag it to move.)
- **Adjust** — drag to move, eight handles to resize, arrow keys nudge (⇧ = ×10), ⌫ deletes. The keyboard path is
  how a box gets *precise*, and it doubles as the accessible path. Sphere zones edit numerically (pitch/yaw/scale)
  as well as by dragging.
- **A list panel** — one row per zone: label, kind, value, and its numbers (`x,y,w,h` or `pitch,yaw,scale`).
  Selecting a row selects the zone; rows are the z-order; deleting a row deletes the zone.
- **Import** — *Read Commons notes* (one call, labels included); a *Suggest from depicts* pass (P2677) for photos
  whose boxes were never drawn but whose subjects are stated.
- **Apply / Cancel** — the editor works on a copy; Cancel restores the board exactly. Undo is a small snapshot stack.
- **Mobile** — tap to select, ≥44px handles, pinch-zoom and pan (the map already does this), *Add zone* then drag.
- **The crop preview** (§Cropping) belongs here, not as a surprise in the card.

## Photospheres — the same model, and the engine's own pins

Andrew's question: *would a solo clickable image be a degenerate case of a photosphere?* The honest answer has three
parts, and they point the same way.

**Product: yes.** One concept — a picture, some zones, an emit — and the flat image is the simpler case of it.
Everything a reader sees and everything a consumer depends on is identical.

**Geometry: no.** A zone on a sphere is a **direction**, not a box. A rectangle drawn while facing one way is a
curve on the sphere, and it is wrong the moment the camera turns; its screen shape changes with every camera move.
Pitch/yaw is the only honest geometry there, and a flat image has no meaningful pitch/yaw at all. Pretending one is
the other would mean a conversion that lies, so the model carries both dialects instead (§The data model).

**Engineering: share everything except the renderer — and let the engine do the sphere.** Pannellum 2.5.7 is
already vendored here, and its API was checked in our copy, not in the docs:

| what we need | what the vendored build has |
|---|---|
| pins with labels | `hotSpots: [{ pitch, yaw, type: 'info', text }]` — the engine draws the pin and its hover tooltip |
| click → emit | `clickHandlerFunc(event, clickHandlerArgs)` is attached to any hotspot that declares it, and the build adds `pnlm-pointer` for us |
| live editing | `addHotSpot(hotSpot)` / `removeHotSpot(id)` — add and remove pins without reloading |
| placing a pin | `mouseEventToCoords(event)` returns `[pitch, yaw]` for a click; `getPitch()` / `getYaw()` read the camera |
| tours | `sceneId` hotspots with `targetPitch` / `targetYaw` — the multi-scene case, already in WIDGET-IDEAS |

**And it was verified, not assumed**: `docs/zone-sphere.png` is a live render of the app's own default panorama
(`File:'Imiloa grounds 360 Degree View …jpg`, NOIRLab, CC BY 4.0) by this vendored build, with two zones. Pannellum
drew the pins, showed its own *"Mauna Kea"* tooltip on hover, and a dispatched click called our handler with
`{ "kind": "article", "value": "en:Mauna Kea" }` — the exact payload shape every card already emits. The whole
integration is: map our `zones` → `hotSpots`, and point `clickHandlerFunc` at `handleSelect`.

So the plan is **one model, two hosts, two draw modes** — not one widget type with a projection switch. The hosts
differ where it matters (the Gallery takes four kinds of source; the panorama takes one file) and the draw modes
differ where it matters (drag a box; click a direction). If the product later wants a single card that shows
either, `view: flat | sphere` is a rendering flag on top of an unchanged model. Two consequences worth noting:
a partial panorama (`haov` < 360°) can hold zones that are *never visible*, so the editor should warn about those;
and making the panorama an emitter ticks `panorama360` off ISSUE-96's "obvious next ones" list for free.

## Geometry: boxes and directions

Rectangles first on the plane (the entire Commons corpus is rectangles, P2677 is a rectangle, and a rectangle is
what a person can draw without instruction); directions on the sphere (the engine's own primitive). Ellipse later
(a box plus a shape flag); polygon after that (the GeoJSON work already holds the maths); no freehand lasso. The
record carries `shape` from day one so no migration is needed when the second plane shape arrives.

## Why not the HTML `<map>` and `<area>` the idea suggests

The suggestion is right about *what* a zone is — an image with areas — but `<map>` is the wrong *implementation*
here, for one blunt reason and several smaller ones:

- **`<area coords>` are in image pixels.** Our cards resize constantly and thumbnails come from several width
  buckets; a CSS-resized `<img>` does **not** scale its map, so the hot areas drift away from the picture. The
  classic fix is a JavaScript rescale on every resize — i.e. the overlay we were trying to avoid, plus a
  dependency on the image having loaded.
- You cannot style an `<area>`: no hover outline, no label tooltip, no hover fill — the "hovering shows it exists"
  behaviour is exactly what `<area>` cannot do.
- Rect/circle/poly only, and no way to show a zone *while drawing* one.

So the render is our own layer over the image — but `<area>` earns a place as an **export**: when a board is
exported for embedding as static HTML, emitting a real `<map>`/`<area>` gives clickable links with `alt` text for
free. A phase-3 nicety, not the engine.

## Traps we can already name

1. **Letterbox and crop** — the rule that fixes it is in §Cropping: the overlay lives in a box whose aspect ratio
   *is* the file's (we know the dimensions from `imageinfo` before the image loads), and `smart` never hides a zone.
2. **A file is not a card.** Store the filename inside the field, so replacing the image asks "keep the six zones
   drawn for the old file?" instead of silently pointing at the wrong pixels. A Commons rename keeps the picture,
   so the zones stay valid.
3. **Touch has no hover** — decided above; the two-tap rule is the answer, and the chrome toggle covers kiosks.
4. **Print and PDF.** Zones are invisible on paper; a numbered legend (numbers on the image, a key beneath) is the
   print-native answer. Default belongs to the export discussion, not to v1.
5. **Validation** (ISSUE-134's model applied): a coordinate that *reads* as a number → repaired and reported;
   `w`/`h` ≤ 0, a box outside 0–100, a missing `value`, or a geometry dialect that does not match the viewer →
   **error**; an unknown `kind` → warning.
6. **Deleted targets.** The validator cannot know whether `de:Piz Nuna` still exists (it is offline by design).
   The consuming card already reports a failed fetch. Resist adding a check.
7. **Everything generated follows.** The manifest, the served `board-guide.md` and the JSON schema are built from
   the registry, so declaring the field makes the **Ask door and MCP able to author zones** — an agent can write a
   board with zones from an image's `depicts` statements. Free, and the payoff of one-source-per-fact.
8. **Size and speed** — a hundred zones is ~8 KB against a ~5 MB localStorage budget, and percentage-positioned
   elements scale without JavaScript. Not concerns.
9. **Board params** (v2) — a zone that writes a param is a different job from a zone that emits a value; keep them
   separate fields, or the panel becomes a puzzle.

## Can this be a clean feature branch? — yes, as five slices, with one decision first

Asked before building (Andrew, 2026-10-05). The honest answer: the *design* fits this project unusually well, and the
*feature set* is too big for one branch.

### Where it fits, with no new machinery

- **Emit → consume reuses ISSUE-91**: a zone click fires the same `selection` emit the Gallery already sends, and the
  consumer contract (`source: id#selection`) does not change.
- **Kinds, pairing and the wiring view** come free from `OUTPUT_KINDS`, `kindsAccepting()` and the spawn menu.
- **One source per fact**: declaring the field regenerates the manifest, the served `board-guide.md` and the JSON
  schema, and the widget map follows — no hand-written counts anywhere.
- **Bad values already have a policy**: ISSUE-134's three lists answer "repair or refuse" for every value a zone
  carries — a yaw outside the circle is a wrap, a pitch outside ±90° is an error.
- **The 360° half needs no vendor patch**: Pannellum 2.5.7 is vendored and already has `hotSpots`,
  `clickHandlerFunc`, `addHotSpot`/`removeHotSpot`, `mouseEventToCoords`, `scenes`, `loadScene` and the `target*`
  arrival parameters (all checked in our copy).
- **A card that navigates itself already exists**: the 🎞️ Media player's playlist (index state, ◀ ▶, loop) is the
  pattern a tour follows.
- **Searching for targets already exists**: `src/lib/paramSources.js` does `prefixsearch`, `list=search` and
  `wbsearchentities` for the param pickers.

### The three frictions, and the call I would make

1. ~~How is a zone list stored?~~ **Decided: structured text in a textarea.** This repo has **no nested
   array-of-objects config field**, and its precedent for structured config is *structured text*: `points` ("one place
   per line"), `spec` (`name | type | Label | options`), `geojson` (RFC 7946, pasted) — text you can read, paste,
   diff, and let a model write. So `zones` is a text field (a compact line form — geometry | label |
   kind | value | action) and let the editor be the friendly front end that reads and writes that text. Then slice A
   adds **no new field type at all**: `configNormalize` keeps coercing a string, `boardDoctor` needs no nested error
   paths, the ⬆ import/export story stays uniform, and an agent authoring a board writes lines rather than nested
   JSON. Cost: a parser and a formatter, with the `repack-layout.mjs` discipline (generate the text the editor was
   already showing).
2. **Two ways to change which file a card shows.** A card-local `scenes` tour and a `{{param}}`-driven board move are
   both "the picture changes". **Recommendation: ship the card-local tour alone**, and document the param route as the
   *same feature, board-wide*; add its `set` action in its own slice, because that slice is also ROADMAP item 6's
   CYOA control and deserves to be judged on its own.
3. **Zones touch every mode and every output.** Normal, lean, kiosk, edge-to-edge and print; the overlay must not
   fight the chrome's hover-fade in edge-to-edge; print needs a decision (hidden, or a numbered legend); ⬆ export and
   the JSON Canvas round trip must carry them; and `pickMode` must intercept a click (pick, do not navigate).
   **Recommendation: make each an explicit checklist item in slices A–B**, verified in the browser matrix, per
   `AGENTS.md`'s "verify every mode you touched".

### The five slices

One branch each, merged independently, green on `npm test`, each adding its own gate. The design doc is the contract,
so a slice that changes a decision edits this file in the same PR.

| slice | what | the gate it adds | estimate |
|---|---|---|---|
| ~~**A · zones as text, drawn, emitting**~~ **built** (branch `feat/zones-mvp`) | the `zones` text field (gated to `displayMode: single`); the overlay in a box whose aspect ratio *is* the file's, measured rather than assumed; hover-reveal; click → the existing `selection` emit; `open` zones resolved to wiki URLs; unreadable lines reported on the card; regenerated guide, schema, manifest and widget map | parser/round-trip/URL unit tests, a registry-and-demo test, and a browser check that **clicks a zone and waits for the consumer to load it** | **done** |
| **B · the editor** | the full-screen overlay: draw, move, resize, list, delete, undo, Apply/Cancel; the three-fit crop rule with its preview; the print decision | an editor e2e — draw a zone, apply, reload, click it, watch the consumer move | 1.5–2 days |
| **C · Commons notes and their targets** | the `{{ImageNote}}` import; the four-rung ladder of §Where the zones come from; the propose-never-bind list | unit tests for the note parser and the label cleaner, on a fixture of a real file's notes | ≈1 day |
| **D · the 360° half** | zones on the panorama in the same model — `hotSpots` + `clickHandlerFunc`, pin placement via `mouseEventToCoords`, a `cssClass` per action | an e2e against a real Commons panorama | 0.5 day |
| **E · tours** | `scenes`, the `go` action, the arrival view (absolute · relative · the scene's own), the ◀ Back stack, prefetching the next scene | an e2e that walks two scenes, checks the arrival yaw, and returns | 1.5–2 days |

A–E ≈ **6–7 days**, which is why this is a program and not a branch. The polish that follows — the chrome toggle, the
numbered print legend, `<area>` export, ellipse/polygon, a third host — is deliberately unscheduled.
**F · the board-wide move** (`set: scene = …`, the param writer) waits until somebody wants a wall to move together.

### Branch mechanics, per this repo's own rules

- `git worktree add ../wikibento-<slice> -b zones/<slice>` plus a symlinked `node_modules` — the recipe this repo
  already uses to run a branch safely — and **one writer per cwd**.
- A new test file means **three** `package.json` references (the esbuild step, the `node --test` list, the `rm -f`
  list); a new browser check gets an `npm run smoke:zones`-style alias and must keep the **stale-`dist` mtime guard**
  that `smoke-built` and `pick-mode-e2e` use.
- **Regenerate the generated artefacts before committing** — PR #102's lesson.
- The deploy shape: slice A changes `boardDoctor`/the validator, so **`dist/` + `validator-bundle.mjs`** ship
  together (`server.js` only if a route changes), and `docs-facts --live` polices the bundle claim in HANDOFF.

## The smallest demo worth building

One group photograph — Commons' own picture of the day, the Solvay conference, a WIPO staff photo — with faces
boxed and each one wired to the person's article in the card beside it. Click a face, the neighbour changes. Then
the 360° twin: stand in the 'Imiloa grounds, tap the planetarium, read about it. Nothing demonstrates "the board is
a HyperCard stack about an image" faster.

## Open questions

1. ~~The name~~ **decided**: `zone` (field `zones`). The first draft said *spot*, and *hot zone* was considered and
   declined (see §The word) — nothing has shipped, so no alias is needed.
2. ~~How the zone list is stored~~ **decided**: *structured text in a textarea*, following the map's
   `points`/`geojson`/`spec` precedent (see §The data model) — so slice A adds **no new field type**.
3. **The host** — a `zones` field on the Gallery (fewer types, reuses Single image, `imageFit`, `edgeToEdge`, the
   click path) or a dedicated type? I lean to the field; the sphere answer above leans the same way, for the same
   reason: hosts differ, the model does not.
4. **Tours** — card-local first, then the param write, as §Tours recommends? And does a tour stay a `scenes` field on
   the existing hosts, or is "a card that is a scene chain" enough of a product to want its own type?
5. ~~Touch semantics~~ **decided**: tap reveals, second tap acts.
6. ~~Crop policy~~ **decided**: `contain | cover | smart`, and `smart` falls back to letterbox rather than hiding
   a zone.
