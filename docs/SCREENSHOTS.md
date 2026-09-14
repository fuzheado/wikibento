# Screenshots

Dated snapshots of real boards, kept as documentation of what the app looks like and
of the states that were verified. **These are snapshots, not current-state claims** —
numbers drift and widgets change, so treat the figures as "what it looked like then"
and check the live board for today's values. (Two things have changed since these were
taken, both noted below: the glam demo's collection control and its leaderboard scope.)

All captured from a desktop browser at ~3350 px wide — **2026-09-10** except the timeline below
(**2026-09-12**, 1500 px wide).

---

## `wikibento-2026-09-12-two-lives.png` — a timeline of two lives (ISSUE-76, v0)

![Two lives, one axis](screenshots/wikibento-2026-09-12-two-lives.png)

The `timeline` renderer on the SPARQL widget, calendar alignment, from the `two-lives` preset
(`?config=/parallel-lives-demo.json`). **Anne Frank** (1929–1945) and **Martin Luther King Jr.**
(1929–1968) on one shared axis: the lane bars start at the same point, hers ends at 16 while his runs
23 years further, and the shaded band is the window in which *both* are documented — 1929 to 1945,
which is her entire documented life. Every event is a structured Wikidata statement, so the lane
labelled "14 events" against hers at "7" is also a picture of what structured data holds (birth,
education, awards, residences) and does not hold (the diary, the arrest, Birmingham, Selma). See
[LIFELINE-WIDGET.md](LIFELINE-WIDGET.md).

## `wikibento-2026-09-14-print-widget.png` — one widget as a printed page (ISSUE-77)

![The Curie timeline printed](screenshots/wikibento-2026-09-14-print-widget.png)

The 🖨 button under print media: every other card and all editing chrome is gone, the grid's transforms are
neutralised (printed as-is, the absolutely-positioned cards come out cropped and overlapping), and the
timeline is laid out as a document. The widget header and the ⏱ freshness footer deliberately survive — a
printed chart with no "as of" line is a claim without a date. See [EXPORT.md](EXPORT.md).

## `wikibento-2026-09-12-two-lives-light.png` — the light card theme (ISSUE-76)

![The light card theme](screenshots/wikibento-2026-09-12-two-lives-light.png)

The same renderer with **Card background → Light**: an inset white panel that sets the timeline apart from
the dark board, with the whole palette inverted (ink, axis, spans, dot rings, the overlap band and the
sticky lane-name column) rather than dark colours left on white. The card also carries its own **title**,
which is what shows in presentation/lean mode, where the widget's title bar is hidden. The ▭ button beside
the zoom controls toggles the shaded overlap window.

## `wikibento-2026-09-12-two-lives-zoom.png` — zoomed to 8× (ISSUE-76)

![The timeline zoomed to 8×](screenshots/wikibento-2026-09-12-two-lives-zoom.png)

The same Anne Frank × MLK board with the axis stretched 8×, scrolled to the beginning. This is what the
**− / + zoom** control is for: at fit, five of the eighteen labels were truncated ("1944 · lived in
Bergen-Belsen concentratio…"); at 2× **none** are, and at 8× every one of the 21 events is labelled and
legible — the two births now read as five months apart, and the axis has gone from decade ticks to yearly
ones. Lane names stay pinned while the axis scrolls.

## `wikibento-2026-09-12-two-lives-age.png` — the same renderer, age-aligned (ISSUE-76)

![Two lives aligned at birth](screenshots/wikibento-2026-09-12-two-lives-age.png)

**Marie** (1867–1934) and **Pierre Curie** (1859–1906) — eight years apart at birth, which is what the
**age alignment** is for: every lane starts at 0, so their shared years line up (the marriage dot sits at
the same age on both) and the difference is legible at a glance — his lane ends at **46**, hers runs to
**67**. The shaded band is the window both are documented, which here is his entire life. The axis caption
says what it is measuring, because "age" means years since each lane's first documented event rather than
an assumed birth date.

---

## `interaction.png` — the simplest board: one param, the cards follow

![Article switcher demo](screenshots/wikibento-2026-09-10-interaction.png)

The **article switcher** demo (`?config=/article-switcher-demo.json`): a welcome card, a
🎛️ Board Controls card with three article buttons (**Ada Lovelace** selected), and the two
cards that reference `{{article}}` — 📄 Article Excerpt and 📊 Article Pageviews
(87,280 views over 2026-08-11 → 2026-09-09, ~2,909/day, with the daily sparkline and its
labelled axis).

Demonstrates the interactivity primitive: one control writes one board param and every
referencing card re-aims.

## `interaction-glam.png` — the flagship: one template, five institutions

![GLAM demo](screenshots/wikibento-2026-09-10-interaction-glam.png)

The **GLAM demo** (`?config=/glam-demo.json`) with the Metropolitan Museum of Art selected:
the Switch-collection control, the CIM snapshot (389,154 files deep · 20,838 used ·
408 wikis · 32,088 pages), the CIM views-over-time chart with labelled axes
(2025-03 → 2026-08), the top-files card (389,049) and the global Top-100 leaderboard.

> ⚠️ Superseded in two visible ways since capture: the collection control is now a
> **validated lookup box** (free text checked against the Commons Impact Metrics allow
> list) rather than buttons, and the leaderboard runs with `scope: shallow`, so its first
> row is no longer UNESCO — see ISSUE-68 and `docs/DATA-SOURCES.md` §19.

## `metmuseum-dashboard.png` — a subject board built from CIM + a category gallery

![Met Museum dashboard](screenshots/wikibento-2026-09-10-metmuseum-dashboard.png)

A Metropolitan Museum of Art board: welcome card, top-files grid (389,038 files,
11 subcats), CIM snapshot and trend, and an 🖼️ Article Gallery for the Wikipedia article
*Metropolitan Museum of Art* — 28 captioned images (Benin ivory mask, William the
Hippopotamus, *Washington Crossing the Delaware*, the Amethus sarcophagus, …).

Demonstrates the gallery's captioned-only default and the CIM family working off one
category.

## `sparql.png` — three SPARQL engines, three result shapes

![SPARQL demo](screenshots/wikibento-2026-09-10-sparql.png)

The **query power** demo (`?config=/sparql-demo.json`): Collection depth (Met) = 72,442 via
**WDQS**, Women in Red = 20.13% (2,072,236 biographies · 417,132 women) via **Humaniki**,
and Commons most-depicted subjects on **QLever** as a 25-row bar chart with entity cells
rendered as **`Label (QID)`** — the label resolution that QLever cannot do itself.

## `wikiportraits-alysa-liu.png` — a real GLAM board, twelve cards

![WikiPortraits board](screenshots/wikibento-2026-09-10-wikiportraits-alysa-liu.png)

The WikiPortraits board (the README's example link, `?config=https://w.wiki/TR9R`):
a welcome card, the *WikiPortraits at 2026 Winter Olympics* category (370 files) with a
photo grid, GLAM impact stats for 2026-07 (370 files · 119 viewed of 131 used · 244 pages
on 47 wikis · 468,301 views) with the top-file filmstrip, a file-usage breakdown
(52 uses across 40 wikis), an external-link count, Top 10 Wikipedias, Top Wikipedia
articles for 19 February 2026 (with thumbnails and extracts), plus the Alysa Liu excerpt,
edit history and a 14-image gallery.

The best single illustration of the thesis: one board mixing category metrics, file usage,
rankings, article text and history — every number live from a Wikimedia API.

---

**Maintenance:** the PNGs are quantized so the documentation stays cheap to clone: on
2026-09-11 `pngquant --quality=70-90 --speed 1 --strip` took the set from **8.5 MB to
2.3 MB (~73% smaller)** with the same pixel dimensions and no visible difference in text
or photographs. The full-colour originals are still in git history (the commit that added
them, `339a275`), so this is reversible.

Use the same command for new shots — `--speed 1` favours quality, and `--quality=70-90`
means a screenshot that would degrade badly is left alone rather than wrecked — and keep
the `wikibento-<date>-<subject>.png` naming with a section here.
