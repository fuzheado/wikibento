# Clickable regions on an image — the HyperCard button layer

> **Status: design study. Nothing here is built.** Filed as **ISSUE-138**.
> Wireframes: `docs/hotspot-card.png` (what a reader sees) and `docs/hotspot-editor.png` (the editor).
> The boxes drawn in both are the **real regions already on Commons** for the file in the picture — imported,
> not placed by a designer. That is the point of the feature, so the mock had to be honest about it.

## The idea, and the one fact that makes it cheap

An image fills a card. Regions drawn on it are live: hovering shows *that a region exists*, clicking one
**emits a value** — an article, a Commons file, a category — and other cards react, because cards that react to
values are what this app is already made of.

The reason this is a two-day feature and not a two-week one: **the emit path, the consumer contract, the
validator and the config-field machinery all exist.** What is genuinely new is one editor and one geometry.

| the piece | where it lives today |
|---|---|
| click → emit | the Gallery already does exactly this: its `Clicking an image` field set to *Send it to the board* publishes the clicked file on the widget's `selection` channel (`handleSelect` → `onOutput(id, value, 'selection')`, ISSUE-91) |
| the consumer contract | any card with `source: id#selection`, or the `{{widget:id#selection}}` token — Article, Excerpt, Gallery, Media player, List, Filter, Map, Translate … |
| kind compatibility | `OUTPUT_KINDS`, per-widget `outputs`/`kinds`, `kindsAccepting()` and the article ⊂ page rule (ISSUE-118), and the spawn menu built on them (PR #105) |
| the host card | the Gallery in `displayMode: single` — *"Single image (the first image fills the box)"* — with `imageFit` and `edgeToEdge` |
| a full-screen overlay | the 360° panorama's expand-to-full-screen portal (ISSUE-137): the same shape the editor needs, and the same reason — a card is small, and iOS has no Fullscreen API for non-video elements |
| custom field editors | config fields that bring their own editor (`source`, `params`, `preset`, `speech`), plus `showIf` (28 uses) so a field appears only for the source it applies to |
| how a bad value is treated | ISSUE-134's three lists — a value the declared type can read is repaired *and reported*; an impossible one is an error |

**A hotspot is not a new subsystem; it is a second way to fire an event the Gallery already fires.**

## The data model

```json
{ "hotspots": [
  { "id": "h1", "label": "Piz Nuna", "x": 18.1, "y": 14.4, "w": 5.7, "h": 6.7,
    "kind": "article", "value": "de:Piz Nuna" }
] }
```

Coordinates are **percentages of the image**, never pixels: a box survives every thumbnail width, card resize,
print DPI and the editor's zoom. `label` is what the reader sees on hover; `kind` + `value` are what a click
emits.

### Two Wikimedia standards already use this shape (verified 2026-10-05)

1. **`P2677` relative position within image** — on Wikidata and SDC the value in the wild is literally
   `pct:1.5,8.7,96,91.1`: `pct:` + `x,y,w,h` in percent. Checked on the Mona Lisa item (Q12418): 2 of its 9
   `depicts` statements carry one. So a hotspot box can be **written as** that qualifier, and read back.
2. **Commons image notes** — the ImageAnnotator gadget's `{{ImageNote}}`, stored in the file's wikitext:

   ```
   {{ImageNote|id=2|x=3190|y=1365|w=1000|h=500|dimx=5472|dimy=3648|style=2}}
   Magehorn
   {{ImageNoteEnd|id=2}}
   ```

   Absolute pixels *plus the file's own `dimx`/`dimy`*, so normalising is a division; the label is the text
   between the tags and may be wikitext (the example mock's file has six of these, all named mountains;
   another has full sentences with links). `style` is only a marker class — per the template's own
   documentation, the geometry is always a rectangle. **The corpus is large**: an insource search reports
   ~376,000 File-namespace pages containing the template, ~360,000 of them `style=2` (search-index estimates).

Consequences worth having:

- **You do not draw what Commons already knows.** "Read the notes on this file" is one Action API call
  (`prop=revisions&rvprop=content`, CORS ✓) plus a small parse — and it arrives with labels *and* targets.
- The same field can be **exported** as a P2677 qualifier, so a board's regions are not trapped in the board.

## What a click emits

**A selection emit on the card's own channel — the same event a Gallery click sends.** No new contract:
a consumer cannot tell a hotspot click from a tile click, which is exactly right. Per hotspot, the payload is
`value` and the kind is `kind`, so the natural pairings already work:

| hotspot kind | natural consumer |
|---|---|
| `article` / `page` | Article, Excerpt, Wiki box, Translate, Quality, Edit history … |
| `file` | Gallery (show that file), Media player, 360° panorama, IA item |
| `category` | Gallery, List, Category size, GLAM organ, PetScan-style lists |
| `page` + `article` | the `article` ⊂ `page` rule means a hotspot offering an article is accepted where a page is wanted (ISSUE-118) |

Deliberate v1 limits: one channel set per card (every hotspot emits on the same channel; the *value* differs),
and one value per click. Both are cheap to revisit if a real board asks.

## What a click can do besides emit

HyperCard buttons had a script; ours should have a short, honest list.

- **Send** (v1) — emit on the selection channel. The feature above.
- **Open** (v1, free) — the same `new tab` behaviour the Gallery already offers for a whole-image click.
- **Set a board parameter** (v2) — this is ROADMAP's *missing CYOA control*: a region that writes a param, so
  clicking "Basel" filters every card listening to `{{place}}`. The param machinery and the 🎛️ Board Controls
  card already exist; this is a new writer, not a new mechanism.
- **Jump to a board / focus a card** (v2) — HyperCard's `go to card`. Navigation, not an emit; keep it out of v1.
- **External URL** (v2, with a rule) — boards are data from outside: http(s) only, the domain visible in the
  label, and the validator's error list rejects anything else rather than silently neutralising it.

## The editor

A four-column card is ~300px wide. Drawing a face in a group photo at that size is guesswork, so the editor is
**a full-screen overlay** — the panorama's portal pattern, not a popup inside the card. See
`docs/hotspot-editor.png`.

- **Draw** — press and drag on empty image; release and the new box is selected.
- **Adjust** — drag to move, eight handles to resize, arrow keys to nudge (⇧ = ×10), ⌫ to delete. The keyboard
  path is not a nicety: it is how a box gets *precise*, and it doubles as the accessible path.
- **A list panel** — one row per region: label, kind, target, and its four numbers. Selecting a row selects the
  box; rows are the z-order (later on top); deleting a row deletes the box.
- **Import** — *Read Commons notes*: one call, and six labelled regions appear. Also worth a *Suggest from
  depicts* pass (P2677) for photos whose boxes were never drawn but whose subjects are stated.
- **Apply / Cancel** — the editor works on a copy; Cancel restores the board exactly. Undo is a small snapshot
  stack, which is cheap and removes the need for a confirm dialog.
- **Mobile** — tap to select, ≥44px handles, pinch-zoom and pan for precision (the map already does this), and
  *Add box* then drag, because a fat finger cannot both start and size a box in one gesture.
- **Accessibility** — the reader-side regions are real focusable elements (`<button>`/`<a>`) whose accessible
  name is the label, not bare SVG rects; Tab reaches them, Enter activates. On the card, a hotspot count
  belongs in the chrome so a screen reader knows regions exist at all.

## Geometry: rectangles first

The Commons corpus is rectangles (~360k files), P2677 is a rectangle, and a rectangle is what a person can draw
without instruction. Ellipse later (a rect with a shape flag); polygon after that (the GeoJSON work already
holds the maths); no freehand lasso. The stored form should carry a `shape` field from day one so no migration
is needed when the second shape arrives.

## Why not the HTML `<map>` and `<area>` the idea suggests

The suggestion is right about *what* a hotspot is — an image with areas — but `<map>` is the wrong
*implementation* here, for one blunt reason and several smaller ones:

- **`<area coords>` are in image pixels.** Our cards resize constantly and thumbnails come from several width
  buckets; a CSS-resized `<img>` does **not** scale its map, so the hot areas drift away from the picture. The
  classic fix is a JavaScript rescale on every resize — i.e. the overlay we were trying to avoid, plus a
  dependency on the image having loaded.
- You cannot style an `<area>`: no hover outline, no label tooltip, no hover fill — the "mousing over shows it
  exists" behaviour is exactly what `<area>` cannot do.
- Rect/circle/poly only, and no way to show a region *while drawing* one.

So the render is our own layer over the image — but `<area>` earns a place as an **export**: when a board is
exported for embedding as static HTML, emitting a real `<map>`/`<area>` gives clickable links with `alt` text
for free. That is a phase-3 nicety, not the engine.

## Traps we can already name

1. **Letterbox and crop.** With `imageFit: contain` the image does not fill its box, so a percentage of the box
   is not a percentage of the image; with `cover`, part of the image is cropped and a region can fall outside
   the visible area entirely. The rule that fixes it: **the overlay must live in a box whose aspect ratio *is*
   the file's** (we know the dimensions from `imageinfo` before the image loads), so contain == exact fit and
   the percentages land on the right pixels. What `cover` should mean for a card with regions is a decision —
   see the open questions.
2. **A file is not a card.** Regions belong to a *file*: store the filename inside the field, so replacing the
   image asks "keep the six regions drawn for the old file?" instead of silently pointing at the wrong pixels.
   A Commons rename keeps the picture, so the regions stay valid.
3. **Touch has no hover.** "Hovering shows a region exists" needs a mobile answer: an outline hint the first
   time the card is seen, or a *Show regions* toggle in the chrome, or two-tap (reveal, then act). Also worth a
   card-level `hotspotStyle: subtle | always` for kiosk and exhibition use, where nobody will guess.
4. **Print and PDF.** Regions are invisible on paper; a numbered legend (numbers on the image, a key beneath)
   is the print-native answer. Default belongs to the export discussion, not to v1.
5. **Validation** (ISSUE-134's model applied): a coordinate that *reads* as a number → repaired and reported;
   `w`/`h` ≤ 0, a box outside 0–100, or a missing target → **error** — clamping a box silently would move a
   region onto the wrong part of an image, which is a semantic change, not a repair; an unknown `kind` →
   warning.
6. **Deleted targets.** The validator cannot know whether `de:Piz Nuna` still exists (it is offline by design).
   The consuming card already reports a failed fetch, so nothing new is needed — resist adding a check.
7. **Everything generated follows.** The manifest, the served `board-guide.md` and the JSON schema are built
   from the registry, so declaring the field makes the **Ask door and MCP able to author hotspots** — an agent
   can write a board with regions from an image's `depicts` statements. That is the payoff of one-source-per-fact,
   and it is free.
8. **Size and speed** — a hundred regions is ~8 KB against a ~5 MB localStorage budget, and percentage-positioned
   elements scale without JavaScript. Not concerns.
9. **Board params** (v2) — a region that writes a param is a *different* job from a region that emits a value;
   keep them separate fields in the UI, or the one panel becomes a puzzle.

## Effort — an honest shape

| phase | what | estimate |
|---|---|---|
| 0 | the three decisions below | a conversation |
| 1 | the walking skeleton: rect regions on a single-image Gallery, emit-only, the overlay editor (draw, move, resize, list, delete, undo, apply/cancel), validator rules, unit tests for the geometry + one browser check that a click changes the neighbouring card | **2–3 days** |
| 2 | read Commons: `{{ImageNote}}` import (labels + targets), *Suggest from depicts* (P2677) | half a day |
| 3 | the polish that makes it feel finished: hint behaviour on touch, numbered print legend, `<area>` export, ellipse/polygon, second hosts (the 360° viewer's **native Pannellum hot spots**, the media player, grid tiles) | open |
| — | docs and gates: this file, the guide and manifest regenerate, a GLOSSARY entry, an ISSUE | hours |

Where the cost sits: **the editor**, not the wiring — and the wiring is the part people usually underestimate
because it is invisible when it already exists. Risks, in order: the crop/letterbox rule (decide before
drawing), mobile drawing ergonomics, touch discovery. Not a risk: emit, consume, validation, guide.

## The smallest demo worth building

One group photograph — Commons' own picture of the day, or the Solvay conference, or a WIPO staff photo —
with faces boxed and each one wired to the person's article in the card beside it. Click a face, the neighbour
card changes. Nothing else demonstrates "the board is a HyperCard stack about an image" faster.

## Open questions for Andrew

1. **Touch semantics** — does the first tap act, or does it reveal and the second act? (Every map app does the
   second; every HyperCard button did the first.)
2. **Letterbox or crop** — should regions force `contain` on the card (simple, always correct, wastes card
   space), or should `cover` be allowed with the editor showing the crop?
3. **The host** — a `hotspots` field on the Gallery (fewer types, reuses Single image, `imageFit`, `edgeToEdge`,
   the click path), or a small dedicated *image map* type whose whole job is regions? I lean to the field: the
   Gallery already is the single-image card, and this project's direction has been fewer types with more config.
4. **The name** — `hotspot` is the museum/IIIF word and collides with nothing here. "Region" already means
   something on the map cards, and "area" is the HTML element. Confirm before it enters the glossary.
