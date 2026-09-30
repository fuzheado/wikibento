# Glossary — the words this project uses

Short definitions for the terms that show up in the UI, in this repository, and in conversation about it. Where a word
also has a print-design or Wikimedia sense that is **not** what we mean here, that is said too — most confusion in this
project has come from a familiar word meaning something narrower than people assume.

## The card

**Card** — one widget's box on the board: the thing you drag, resize and configure. Not "widget" (that is the type),
not "box" (avoid; it means card *and* the Wikipedia Box).

**Chrome** — the parts of a card that exist to *operate* it rather than to show its content: the title bar, the
instance chip, the ⓘ ⚙ ↻ ✕ buttons, the ⏱ freshness stamp.

**Edge to edge** — *the setting: `edgeToEdge: true`, one switch in ⚙.* The card's chrome steps aside so its content
reaches the edges of the box: the title bar fades in **over** the content on hover (or keyboard focus), the padding
goes, and the card's own title goes with it.
   Offered on the types where the content is a *thing* rather than text or a table — the Gallery (including its
**Single image** and **Story** modes), the Video / Media Player, the 360° Panorama, and the page-and-book viewers.
   Two rules hold in this mode, and both exist because removing chrome must never remove information:
   1. **A warning stays.** The media player's *"N not found"* line keeps its place even edge to edge.
   2. **A control the content needs stays.** A playlist keeps its transport buttons — with several files they are the
      only way to reach the others. One file, and they go too.
   *Also called, in other contexts:* **full bleed** (the print term — ink to the trimmed edge, no margin — kept here as
a synonym so print-trained readers find it), *"fills the box"*, *"immersive"*, *"chromeless"*, and **"bare"** (how this
shipped for one day, 2026-09-29, before the rename).
   *Config history:* `frame: 'bare' | 'card'`, a two-option select for that one day. Still accepted — `normalizeConfigForDef` translates it — because boards saved in that window exist.
   *Not to be confused with:* **bleed** in print (content deliberately running off the trimmed edge), or a story's
`full` **panel**, which is one of three panel kinds *inside* a story (the others are `plate` and `split`).

## The board

**Board** — the whole arrangement of cards, and the JSON file that describes it (`?config=/name.json`).
**Borrowed board** — one loaded from a URL and not yet edited: shown, never written, until an edit adopts it.
**Bare id** — a widget's own id with no channel after it (`{{widget:gallery}}`), as opposed to `{{widget:gallery#lines}}`.
*This is the older, unrelated sense of "bare" in this codebase — one reason the appearance setting is not called that.*

## Data and wiring

**Source** — where a widget's content comes from: a wiki page, a category, a pasted list, another widget. A *category*
is a way of obtaining a file list, so it is a source, not a widget type.
**Emitter / consumer** — a widget that publishes a value, and one that reads it. Publishing happens on named
**channels**; the bare id keeps its old meaning through a declared `primary`.
**Param** — a board-level control (a text box, a slider, a month stepper) that widgets read, so one board becomes many.

## Showing a board

**Lean** — the whole board with the app's own toolbar hidden (a shareable, embeddable view).
**Present** (kiosk) — lean plus a locked grid: no dragging, no resizing, no editing affordances. A presentation is not
an editing surface, so *edge to edge* cards hide their title bar entirely here rather than revealing it on hover.
