# Clickable spots on an image — the HyperCard button layer

> **Status: design study, with the first decisions recorded** (Andrew, 2026-10-05). Filed as **ISSUE-138**.
> Wireframes, all rendered from real data rather than drawn by hand:
> `docs/hotspot-card.png` (the reader's view) · `docs/hotspot-editor.png` (the editor) ·
> `docs/hotspot-sphere.png` (the 360° case — **this one is a live Pannellum render**, see §Photospheres).

## The word: a **spot** (field `spots`)

One term has to cover a drawn box on a photograph and a pin on a 360° sphere. Recommendation, pending Andrew's OK:

| candidate | evidence in this repo |
|---|---|
| **spot** | 12 incidental hits, **none a term of art**. Pannellum — the engine we already vendor for the spheres — calls its own pins `hotSpots`, so the model and the engine speak the same word one hop apart. Covers a box or a pin without lying about either. Shortest in JSON. |
| zone | 26 hits, none a term of art — the runner-up if "spot" feels too close to the IIIF/museum word. |
| hotspot | the museum/IIIF-viewer word Andrew wants to avoid; kept only as the search term that finds this file. |
| region · area · shape · overlay | **taken** — the map/GeoJSON vocabulary in this repo (`region` 67 hits, `area` 51, `shape` in the map widget, `overlay` is `lib/mapOverlay.js`). |
| marker · pin | **taken** — map markers and pins (35/45 hits). |
| button | **taken** — the card's chrome (ⓘ ⚙ ↻ ✕) is *the buttons*; 358 hits. HyperCard's own word, but the chrome owns it. |
| target · tag · badge · anchor · note | **taken** (192/43/55/43/212 hits) — targets of links, wikitext anchors, notes and notices. |

So: **`spots`** in the board JSON, "spot" in the UI and the guide, GLOSSARY entry with the avoid-list. The
reader-facing sentence is *"tap a spot"*; the test suite would say `tests/spots.test.mjs`.

## The idea, and the one fact that makes it cheap

An image fills a card. Spots are live: hovering shows *that a spot exists*, clicking one **emits a value** — an
article, a Commons file, a category — and other cards react, because cards that react to values are what this app
is already made of.

| the piece | where it lives today |
|---|---|
| click → emit | the Gallery already does exactly this: its `Clicking an image` field set to *Send it to the board* publishes the clicked file on the widget's `selection` channel (`handleSelect` → `onOutput(id, value, 'selection')`, ISSUE-91) |
| the consumer contract | any card with `source: id#selection`, or the `{{widget:id#selection}}` token — Article, Excerpt, Gallery, Media player, List, Filter, Map, Translate … |
| kind compatibility | `OUTPUT_KINDS`, per-widget `outputs`/`kinds`, `kindsAccepting()` and the article ⊂ page rule (ISSUE-118), and the spawn menu built on them (PR #105) |
| the host cards | the Gallery in `displayMode: single` (*"Single image (the first image fills the box)"*) with `imageFit` and `edgeToEdge`; and the 🌐 360° Panorama Viewer, whose engine already draws and clicks spots |
| a full-screen overlay | the 360° viewer's expand-to-full-screen portal (ISSUE-137): the same shape the editor needs, and the same reason — a card is small, and iOS has no Fullscreen API for non-video elements |
| custom field editors | config fields that bring their own editor (`source`, `params`, `preset`, `speech`), plus `showIf` (28 uses) so a field appears only for the source it applies to |
| how a bad value is treated | ISSUE-134's three lists — a value the declared type can read is repaired *and reported*; an impossible one is an error |

**A spot is not a new subsystem; it is a second way to fire an event the Gallery already fires.**

## The data model — one record, two geometry dialects

```json
{ "spots": [
  { "id": "s1", "label": "Piz Nuna", "kind": "article", "value": "de:Piz Nuna",
    "box": { "x": 18.1, "y": 14.4, "w": 5.7, "h": 6.7 } },
  { "id": "s2", "label": "Mauna Kea", "kind": "article", "value": "en:Mauna Kea",
    "at": { "pitch": 4.0, "yaw": -30.0 } }
] }
```

- **`box`** — percentages of the image (never pixels): a box survives every thumbnail width, card resize, print DPI
  and the editor's zoom. For flat images.
- **`at`** — `pitch`/`yaw` in degrees: a direction on the sphere. For 360° panoramas.

Everything else — `label`, `kind`, `value`, `id` — is identical in both, which is the whole point: the consumer,
the validator, the guide and the editor's list panel never learn which geometry it is. The viewer decides which
dialect is valid and the validator enforces the pairing (a `box` on a panorama, or an `at` on a flat image, is an
**error**, not a repair — a silently reinterpreted geometry would point at the wrong place).

### Two Wikimedia standards already use this shape (verified 2026-10-05)

1. **`P2677` relative position within image** — on Wikidata and SDC the value in the wild is literally
   `pct:1.5,8.7,96,91.1`: `pct:` + `x,y,w,h` in percent. Checked on the Mona Lisa item (Q12418): 2 of its 9
   `depicts` statements carry one. So a spot's box can be **written as** that qualifier, and read back.
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
(`prop=revisions&rvprop=content`, CORS ✓) plus a small parse, and the spots arrive with labels and often links.
A 360° upload usually has **no** notes (the example in `docs/hotspot-sphere.png` has none), so the import is a
flat-image superpower first.

## Reader interaction — decided (2026-10-05)

- **Desktop:** hover reveals the spot (outline + its label); a click acts immediately. The hover *is* the reveal step.
- **Touch:** the first tap reveals — all spots outline and the tapped one shows its label; **a second tap on the
  same spot acts**. Tapping elsewhere dismisses. This is what map and museum apps do, because a touch has no hover
  and an accidental tap should cost nothing.
- **Keyboard:** Tab reaches each spot (they are real focusable elements whose accessible name is the label), the
  focus ring is the reveal, Enter acts. That is the touch rule with the keyboard's own hover.
- **A `showSpots` chrome toggle** (`subtle | always`) for kiosk and exhibition use, where nobody will guess.

## Cropping — decided: three fits, the third one keeps the spots

`imageFit` gains a third option beside `contain` (letterbox) and `cover` (fill crop):
**`smart` — *"Fill crop, never cutting off a spot"***.

The geometry is simple enough to state exactly. The card's content box has aspect ratio `A`; with `cover` the crop
window is *fixed in size* and only its **position** is free. Take the union of every spot's box (in image pixels,
plus a margin so a spot is not flush to the edge):

- **Feasible** iff the union's width and height are each ≤ the window's — then there is always a position that
  contains every spot.
- **Choose** the position that centres the union in the window, clamped to the allowed range.
- **Impossible** (the spots straddle more of the picture than the window can hold) → **fall back to letterbox**,
  and say so where the setting is: *"one spot is too wide to crop — showing the whole image."* Never crop a spot
  away silently: a hidden spot is a broken promise.

Implementation is `object-fit: cover` plus a computed `object-position` percentage — no layout code, no
re-measuring the DOM — recomputed on card resize (the aspect ratio is the only input). The **editor** must preview
the crop live, with the parts outside it dimmed, or you will place a spot and then watch the card disagree.

## What a click emits

**A selection emit on the card's own channel — the same event a Gallery click sends.** A consumer cannot tell a
spot click from a tile click, which is exactly right. Per spot, the payload is `value` and the kind is `kind`:

| spot kind | natural consumer |
|---|---|
| `article` / `page` | Article, Excerpt, Wiki box, Translate, Quality, Edit history … |
| `file` | Gallery (show that file), Media player, 360° panorama, IA item |
| `category` | Gallery, List, Category size, GLAM organ, PetScan-style lists |

Deliberate v1 limits: one channel set per card (every spot emits on the same channel; the *value* differs), and
one value per click.

## What a click can do besides emit

- **Send** (v1) — emit on the selection channel. The feature above.
- **Open** (v1, free) — the same `new tab` behaviour the Gallery already offers for a whole-image click.
- **Set a board parameter** (v2) — ROADMAP's *missing CYOA control*: a spot that writes `{{place}}`, filtering
  every card that listens. The param machinery and the 🎛️ Board Controls card already exist; this is a new writer.
- **Jump to a board / change scene** (v2) — HyperCard's `go to card`, and for the 360° side Pannellum's own
  `sceneId` tour hotspots.
- **External URL** (v2, with a rule) — http(s) only, the domain visible in the label, rejected in the validator's
  error list rather than silently neutralised. Boards are data from outside.

## The editor

A four-column card is ~300px wide, so the editor is **a full-screen overlay** — the panorama's portal pattern, not
a popup inside the card. See `docs/hotspot-editor.png`.

- **Draw** — press and drag on empty image; release and the new spot is selected. (On the sphere: click to place a
  pin, drag it to move.)
- **Adjust** — drag to move, eight handles to resize, arrow keys nudge (⇧ = ×10), ⌫ deletes. The keyboard path is
  how a box gets *precise*, and it doubles as the accessible path. Sphere spots edit numerically (pitch/yaw/scale)
  as well as by dragging.
- **A list panel** — one row per spot: label, kind, value, and its numbers (`x,y,w,h` or `pitch,yaw,scale`).
  Selecting a row selects the spot; rows are the z-order; deleting a row deletes the spot.
- **Import** — *Read Commons notes* (one call, labels included); a *Suggest from depicts* pass (P2677) for photos
  whose boxes were never drawn but whose subjects are stated.
- **Apply / Cancel** — the editor works on a copy; Cancel restores the board exactly. Undo is a small snapshot stack.
- **Mobile** — tap to select, ≥44px handles, pinch-zoom and pan (the map already does this), *Add spot* then drag.
- **The crop preview** (§Cropping) belongs here, not as a surprise in the card.

## Photospheres — the same model, and the engine's own pins

Andrew's question: *would a solo clickable image be a degenerate case of a photosphere?* The honest answer has three
parts, and they point the same way.

**Product: yes.** One concept — a picture, some spots, an emit — and the flat image is the simpler case of it.
Everything a reader sees and everything a consumer depends on is identical.

**Geometry: no.** A spot on a sphere is a **direction**, not a box. A rectangle drawn while facing one way is a
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

**And it was verified, not assumed**: `docs/hotspot-sphere.png` is a live render of the app's own default panorama
(`File:'Imiloa grounds 360 Degree View …jpg`, NOIRLab, CC BY 4.0) by this vendored build, with two spots. Pannellum
drew the pins, showed its own *"Mauna Kea"* tooltip on hover, and a dispatched click called our handler with
`{ "kind": "article", "value": "en:Mauna Kea" }` — the exact payload shape every card already emits. The whole
integration is: map our `spots` → `hotSpots`, and point `clickHandlerFunc` at `handleSelect`.

So the plan is **one model, two hosts, two draw modes** — not one widget type with a projection switch. The hosts
differ where it matters (the Gallery takes four kinds of source; the panorama takes one file) and the draw modes
differ where it matters (drag a box; click a direction). If the product later wants a single card that shows
either, `view: flat | sphere` is a rendering flag on top of an unchanged model. Two consequences worth noting:
a partial panorama (`haov` < 360°) can hold spots that are *never visible*, so the editor should warn about those;
and making the panorama an emitter ticks `panorama360` off ISSUE-96's "obvious next ones" list for free.

## Geometry: boxes and directions

Rectangles first on the plane (the entire Commons corpus is rectangles, P2677 is a rectangle, and a rectangle is
what a person can draw without instruction); directions on the sphere (the engine's own primitive). Ellipse later
(a box plus a shape flag); polygon after that (the GeoJSON work already holds the maths); no freehand lasso. The
record carries `shape` from day one so no migration is needed when the second plane shape arrives.

## Why not the HTML `<map>` and `<area>` the idea suggests

The suggestion is right about *what* a spot is — an image with areas — but `<map>` is the wrong *implementation*
here, for one blunt reason and several smaller ones:

- **`<area coords>` are in image pixels.** Our cards resize constantly and thumbnails come from several width
  buckets; a CSS-resized `<img>` does **not** scale its map, so the hot areas drift away from the picture. The
  classic fix is a JavaScript rescale on every resize — i.e. the overlay we were trying to avoid, plus a
  dependency on the image having loaded.
- You cannot style an `<area>`: no hover outline, no label tooltip, no hover fill — the "hovering shows it exists"
  behaviour is exactly what `<area>` cannot do.
- Rect/circle/poly only, and no way to show a spot *while drawing* one.

So the render is our own layer over the image — but `<area>` earns a place as an **export**: when a board is
exported for embedding as static HTML, emitting a real `<map>`/`<area>` gives clickable links with `alt` text for
free. A phase-3 nicety, not the engine.

## Traps we can already name

1. **Letterbox and crop** — the rule that fixes it is in §Cropping: the overlay lives in a box whose aspect ratio
   *is* the file's (we know the dimensions from `imageinfo` before the image loads), and `smart` never hides a spot.
2. **A file is not a card.** Store the filename inside the field, so replacing the image asks "keep the six spots
   drawn for the old file?" instead of silently pointing at the wrong pixels. A Commons rename keeps the picture,
   so the spots stay valid.
3. **Touch has no hover** — decided above; the two-tap rule is the answer, and the chrome toggle covers kiosks.
4. **Print and PDF.** Spots are invisible on paper; a numbered legend (numbers on the image, a key beneath) is the
   print-native answer. Default belongs to the export discussion, not to v1.
5. **Validation** (ISSUE-134's model applied): a coordinate that *reads* as a number → repaired and reported;
   `w`/`h` ≤ 0, a box outside 0–100, a missing `value`, or a geometry dialect that does not match the viewer →
   **error**; an unknown `kind` → warning.
6. **Deleted targets.** The validator cannot know whether `de:Piz Nuna` still exists (it is offline by design).
   The consuming card already reports a failed fetch. Resist adding a check.
7. **Everything generated follows.** The manifest, the served `board-guide.md` and the JSON schema are built from
   the registry, so declaring the field makes the **Ask door and MCP able to author spots** — an agent can write a
   board with spots from an image's `depicts` statements. Free, and the payoff of one-source-per-fact.
8. **Size and speed** — a hundred spots is ~8 KB against a ~5 MB localStorage budget, and percentage-positioned
   elements scale without JavaScript. Not concerns.
9. **Board params** (v2) — a spot that writes a param is a different job from a spot that emits a value; keep them
   separate fields, or the panel becomes a puzzle.

## Effort — an honest shape, revised with the sphere evidence

| phase | what | estimate |
|---|---|---|
| 0 | the two remaining decisions (name, host) | a conversation |
| 1 | the walking skeleton on the flat side: rect spots on a single-image Gallery, emit-only, the overlay editor (draw, move, resize, list, delete, undo, apply/cancel), the three-fit crop rule, validator rules, geometry unit tests + one browser check that a click changes the neighbouring card | **2–3 days** |
| 2 | read Commons: `{{ImageNote}}` import (labels + targets), *Suggest from depicts* (P2677) | half a day |
| 3 | the sphere: spots on the 360° viewer in the same model, engine pins, click → emit, pin placement in the editor, the tour action | **half a day** — the render above proves the engine half; the editor's pin mode is the work |
| 4 | the polish that makes it feel finished: the chrome toggle, the numbered print legend, `<area>` export, ellipse/polygon, a third host (media player, grid tiles) | open |

Where the cost sits: **the editor**, not the wiring — and the wiring is the part people usually underestimate
because it is invisible when it already exists. Risks, in order: the editor's mobile ergonomics, the crop preview
staying honest, and touch discovery. Not a risk: emit, consume, validation, guide, and the sphere rendering.

## The smallest demo worth building

One group photograph — Commons' own picture of the day, the Solvay conference, a WIPO staff photo — with faces
boxed and each one wired to the person's article in the card beside it. Click a face, the neighbour changes. Then
the 360° twin: stand in the 'Imiloa grounds, tap the planetarium, read about it. Nothing demonstrates "the board is
a HyperCard stack about an image" faster.

## Open questions

1. **The name** — `spot` as recommended above, or `zone`? (Everything else here assumes `spot`.)
2. **The host** — a `spots` field on the Gallery (fewer types, reuses Single image, `imageFit`, `edgeToEdge`, the
   click path) or a dedicated type? I lean to the field; the sphere answer above leans the same way, for the same
   reason: hosts differ, the model does not.
3. ~~Touch semantics~~ **decided**: tap reveals, second tap acts.
4. ~~Crop policy~~ **decided**: `contain | cover | smart`, and `smart` falls back to letterbox rather than hiding
   a spot.
