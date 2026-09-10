# Media in the Dataflow — design direction (2026-09-10)

**Status:** direction, not a plan — nothing here is scheduled. Aimed at the
question that produced it: *when a widget can produce a graphic, should the
graphic travel along the wire, or only text?*

**Antecedents (read these first):**
- `docs/WIDGET-DEVELOPMENT.md` → **the emitter contract** — the rule in force
  today: emitters ship **data, not presentation**, and the wire is text.
- `docs/WIDGET-IDEAS.md` → **Node Algebra**, family 7 *Effectors* (output
  family): card-compositor (text + image → graphic), export node, embed-snippet
  generator, story nodes. This doc is the data model those effectors will need.
- `docs/MODULARITY-AND-DATAFLOW.md` → Appendix C: the `$ref` / full **typed
  outputs** seed (SPARQL result → param was the 80% version).

## TL;DR

Today a widget's output is **text** (a scalar, or an array of lines), and that
is why `{{widget:<id>}}` is predictable, cheap and persistable. The moment an
output can be *pixels* — a raster, an SVG, a composited card — four things that
are currently trivial stop being trivial: **storage** (it cannot live in the
board JSON), **identity** (change-detection currently hashes the value),
**lifetime** (a blob needs an owner and a `revokeObjectURL`), and **trust**
(SVG is scriptable). None of that is a reason not to do it; all of it is a
reason to do it deliberately, starting with *references* rather than *payloads*.

## Why this came up

The QR widget (`qrCode`, PR #47) renders a graphic from text and, per the
emitter contract, emits **the text it encodes** — not its SVG. That was the
right call: nothing in the catalog could render an emitted SVG, `echo` would
have printed a 3–9 KB XML blob into a card, and each QR would have added that
blob to board state, `localStorage` and the change signature. The interesting
question is what has to become true before "emit the image" is the right
answer. This doc sketches that.

## Where we are (verified 2026-09-10)

| Fact | Value |
|---|---|
| Wire format | text: scalars, or arrays of lines (joined with `\n` by interpolation) |
| Output kinds in the manifest | `extract`, `lines`, `count`, `value` (6 emitters) |
| Consumer shape | text-shaped — `source` field (`filterLines`, `lineCount`, `echo`) or `{{widget:<id>}}` in any string field |
| Change detection | content-based signature over the resolved output (`widgetOutputSignature`) |
| Persistence | board JSON → `localStorage` / `?config=` URL; **text only** |
| Largest current payload | article extract / pasted lists (kilobytes of text) |
| Cost of a graphic on the wire | QR SVG: 3.1 KB (`x`) · 4.4 KB (short URL) · 9.3 KB (Commons category URL) — measured |

## Three tiers — and why we should walk them in order

**Tier 1 — References (URL + metadata). Do this first; mostly already true.**
The canonical *image-row contract* (`rows: [{title, thumbUrl, fileUrl, caption}]`)
already moves pictures between widgets without ever moving pixels: a widget
publishes pointers, a shared renderer (`GalleryGridCard`) draws them. Formalising
this as `outputs: { kind: 'rows', schema: 'image-row' }` gives media flow with
**zero** new storage/lifetime problems, and it is what nearly every "media
widget" actually needs (galleries, filmstrips, story nodes, poster layouts).
Add a `schema` name so consumers can state what they accept.

**Tier 2 — Inline text encodings (data: URLs, SVG markup). Cheap, tempting,
limited.** Works today with zero storage work (it is just a string), but: it
lands in persisted board JSON, it inflates the change signature, and the
markdown card's image path is **https-allowlisted** — a `data:` URL will not
render there. Realistic scope: small, generated graphics where the encoding is
a few KB and a **size cap** is enforced (e.g. a QR at `kind: 'image'`,
`mime: 'image/svg+xml'`, cap ~32 KB).

**Tier 3 — Binaries (Blob / File / ArrayBuffer / ImageBitmap / media streams).
This is the real change.** Required for compositing, rasterising, packaging or
exporting — and the tier where every currently-free property needs a design.

## What Tier 3 entails

**1. Output typing (manifest v4).** Extend the emitter declaration:
`outputs: { kind, mime?, schema?, bytes?|maxBytes? }`, and give consumers a
mirror (`consumesKinds` / `consumesSchema`) so compatibility is *checkable*
rather than accidental. The Ask prompt and the ⚙ source picker both read the
manifest, so both learn to filter by kind — the picker should stop offering a
binary producer to a text field. Note `askManual()` derives the emitter list
from the manifest already, so new kinds appear in the LLM prompt automatically
(its `what` phrase map needs an arm per kind — a text kind must never be
described as a blob and vice versa).

**2. Storage & lifetime.** Binaries cannot go into the board JSON
(`localStorage`, `?config=` URLs are text and must stay that way — config-as-URL
is a load-bearing property). So: a **board-scoped in-memory store** keyed by
`{widgetId, outputId}` holding a handle + metadata, with
  - an explicit owner and `revokeObjectURL` on replace/unmount/board switch,
  - a TTL/LRU cap (a kiosk runs for days — this is the leak surface),
  - a rule that persisted configs never *contain* the bytes: saved boards keep
    the producer's config and re-derive the graphic on load.
  A validator can enforce the last one cheaply (fail a board whose config holds
  a `data:` URL above a threshold).

**3. Identity & change detection.** Today the signature is a hash of the value.
Hashing megabytes per emit is unacceptable, and blobs are opaque. Needed: a
producer-declared revision (`rev: n`) or an input-hash ("params + config + source
revisions"), so consumers re-run on *real* change and not on every render.

**4. Cost & scheduling.** SVG → raster means canvas work, which is synchronous
and can block the frame; a compositor that rasterises a 4000px poster will jank
a board. Expect a worker (OffscreenCanvas), a staged pipeline, and a visible
"rendering" state — WidgetFrame's `loading`/`waiting` machinery generalises, but
`waiting` today means "unresolved reference", which is a different thing.

**5. Cross-origin reality.** Drawing a remote image into a canvas **taints** it
unless the response is CORS-clean; `upload.wikimedia.org` thumbnails are the
common case and generally cooperative, but not every source is (Commons API
endpoints vary; some hosts send no CORS header at all). A compositor therefore
needs either a CORS-clean allowlist per source, or a **same-origin fetch** path —
precedent: ISSUES.md 2097 (Toolforge fetching to a blob / same-origin URL to
avoid tainting). This is the same class of constraint that forced the
deliberate choice to keep the app backend-free; a raster pipeline is the first
feature that may *want* a thin server route.

**6. Trust.** An SVG is a document: it can carry script, external references and
`on*` handlers. Anything emitted or injected must be sanitised (or re-rendered
from a known-safe subset — the QR card's single-`<path>` output is the model of
a safe producer), and blob URLs must never be handed to
`dangerouslySetInnerHTML` unvalidated. Existing habit of escaping-first in
`src/lib/markdown.js` is the right precedent to extend.

**7. Who consumes it (the only reason to build it).** Family 7 effectors:
card-compositor, export node (PNG/PDF/zip rather than CSV/JSON), embed-snippet
generator, story nodes — plus a print/kiosk pipeline. Until one of those is
scheduled, Tier 3 has no consumer, and building an output nobody draws is the
exact anti-pattern the emitter contract warns about.

**8. UX & memory pressure.** A card holding a blob should show a thumbnail,
dimensions and size, and offer Save — otherwise the user cannot tell whether a
graphic was produced. And N widgets × megabytes is a real budget on a 4 GB
kiosk; board-level caps and per-widget `maxBytes` declarations are the guard.

**9. Ask / LLM boundary.** Never send pixels or blobs to the model: manifests
carry kind, mime, schema and size *limits*, never payloads. Board assembly
should validate media *edges* (kind compatibility) rather than content, and the
system prompt's emitter list stays a list of kinds — which is another reason
kinds must be few and documented.

## Minimal first steps, in order (when there is a consumer)

1. **Formalise Tier 1** — `kind: 'rows'` + `schema: 'image-row'`, picker/Ask
   filtering. Cheap, immediately useful, no storage change.
2. **An export effector** (CSV/JSON from a feed) — an output-family win with no
   binaries at all, and it exercises the "producer with no pixels" path.
3. **`kind: 'image'` for small generated graphics** (a QR at a hard size cap)
   *paired with* one consumer that can draw it (markdown/embed arm + the
   https-only rule relaxed for a validated data-URL subset).
4. **Board-scoped handle store + `rev`-based signatures** — the Tier 3 unlock.
5. **Worker-based raster/encode**, then the compositor.

Triggers worth naming: a scheduled compositor/export effector; a second widget
that wants to render another widget's graphic; any print/PNG/PDF requirement
from a GLAM or kiosk use case.

## Non-goals (so this stays a direction, not a rewrite)

- No visual wiring canvas; wiring stays declarative config (MODULARITY Path B/C).
- No server-side rendering backend as a default; if a raster pipeline needs a
  route, it is an explicitly-scoped exception (same-origin fetch), not a new
  architecture.
- Config-as-URL stays text. Boards stay portable.
- No blob ever reaches the LLM prompt.

## Open questions

- Is `rev` trustworthy enough for change detection if a producer's inputs change
  without a config change (e.g. a live fetch)? (Probably: content hash for text,
  `rev` for handles.)
- Does a handle store belong to the board or the app? Board switch / import must
  not leak handles from the previous board.
- Do we need per-consumer resolution policy (a poster wants 2× a card's pixels)?
- Should `data:` URLs be permitted in persisted boards under a small cap, or
  banned outright to keep the format honest?
- For exports (PNG/PDF), is the target the DOM (html2canvas-style, brittle) or
  re-rendered SVG (deterministic, more work)?
