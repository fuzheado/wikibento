# Widget resizing and the mobile jump — what actually moves, and the options

**Measured 2026-10-09** with `scripts/mobile-reflow-probe.mjs` (WebKit, iPhone 390×844). The script prints every number
below and can be re-run against any base or build.

## The measurement

A board in the shape Andrew described — a note card, the zone picture, then the consumer below it — with the reader
parked at the bottom (where the card under the picture is) and the bitmap still arriving:

| card | height while loading | on-screen top |
|---|---|---|
| note (above) | 269px, steady | 51 → 51 |
| picture (middle) | **58 → 274px** — one step, **+216px at 516ms** | 332 → 332 |
| consumer (below) | 117px, steady | **402 → 618px** |

The scroller never moved (scrollTop 17 → 17). The page did not scroll: **the content moved under the reader**, by the
picture's own +216px. Clicking a zone afterwards was *stable* — the consumer's on-screen top held at 618px while its
height went 117 → 528px, because a card that grows downwards from a fixed top moves neither itself nor anything above it.

So the jump is the **placeholder→bitmap step**, not the click. A click is stable whenever the changed card sits *below*
the card the reader is looking at — which is exactly why putting the picture first ("it anchors it to the top") solved
it: the growing card is then above nothing the reader has read yet.

**The stylesheet route does not work (measured).** Injecting
`aspect-ratio: 3 / 2 !important; width: 100% !important` on the picture element *did* apply (the computed style says
`aspect-ratio: 3 / 2`) and the growth still happened: **+200px at 162ms**. The pre-measure placeholder is a flex/grid
child with no definite width, so the ratio has nothing to resolve against. Reserving the box has to happen in the
component, not in a stylesheet.

## Options

| option | what it fixes | status | cost |
|---|---|---|---|
| **A. Reserve the picture's box in the component** — render the `<img>` with its real `width`/`height` attributes (imageinfo carries them) and give the placeholder the same ratio | the 216px load step | expected 0; to be measured with the same probe | ~1h |
| **B. App-level "keep the reader's place"** — before a value-driven reflow, record the card at the viewport top and the offset within it, and restore it after | *any* card above the reader changing, whatever the cause | the general guarantee; ISSUE-144's height floor is a special case of it | 1–2h |
| **C. `overflow-anchor: none` on cards that change** | the browser's own scroll anchoring fighting the app | unmeasured, cheap, additive | 15min |
| **D. `content-visibility: auto` + `contain-intrinsic-size`** on off-screen cards | layout work and off-screen measurement | unmeasured | ~1h |
| **E. Authoring rule: the card that changes goes below the card you interact with** | the *experience*, not the geometry | this is what image-first does by hand — free, and worth writing into the templates and the spawn menu's placement | docs |
| **F. Generalise the height floor** — a card that has never had content keeps a per-kind floor | a consumer that fills from nothing | the mobile-jump fix already holds the *previous* height | ~1h |

**Rejected:** reordering cards automatically when a value arrives — magic, and it fights the author's layout.
`position: sticky` on the changing card is a *product* idea ("keep this card in view"), not a fix for the geometry.

## Recommendation

**A now, B next, C alongside them.** A removes the one jump that is measured and certain: +216px in a single frame, on
every first load of a picture card, pushing whatever is below it. B is the guarantee that survives the next unknown
cause — *a card changing above the reader's viewport* is the general case, and the app already has half the machinery.
E belongs in the docs and the spawn menu because it is free and it is what Andrew found by hand. D and F wait for a
measurement that shows they earn their complexity.

## Reproducing

```bash
node scripts/mobile-reflow-probe.mjs                        # production, the board this memo describes
node scripts/mobile-reflow-probe.mjs --base http://localhost:4173
node scripts/mobile-reflow-probe.mjs --engine chromium
node scripts/mobile-reflow-probe.mjs --only shipped         # skip the reserved variant
```

It prints, per variant: the consumer's on-screen wobble, the scroller's own position, each card's height range while
loading, and the picture's growth steps with timestamps — the line that names the mechanism.
