# WikiBento — how to build a board (written tutorial)

**Status:** verified against the live site on 2026-09-11. There is a narrated video version of this
tutorial; it is produced by the pipeline in `scripts/tutorial-video/` (see *Re-making the video* at
the end). The narration text for each step lives in `scripts/tutorial-video/scenes.json`.

**Who this is for:** someone who has opened WikiBento, clicked around for two minutes, and wants to
know how to get from "there are some cards here" to "here is my board, and here is its URL".

---

## 1. What WikiBento is

A dashboard you build yourself from live Wikimedia data. Everything runs in the browser — no login,
no server of your own, no data to load. You put cards on a grid, point each card at a subject, and
it fetches from the Wikimedia APIs directly.

Open <https://wikibento.toolforge.org/> and you get a **starter board of three cards**: pageviews for
the Main Page, a link count for libretexts.org, and a ranking of the largest Wikipedias. They are all
live; nothing is a mock-up.

## 2. Read a board someone shared

A board is a URL. This one carries its whole configuration:

```
https://wikibento.toolforge.org/?config=https://w.wiki/TR9R
```

`?config=` means "load the board described at this address". That address is a WikiPortraits demo
board stored on Commons (we get to that in step 7). Paste the whole thing into your browser and the
board appears — nothing is installed, and nothing is stored on your machine.

Every card has the same top bar:

- **ⓘ** — where this card's data comes from (useful when a number surprises you)
- **⚙** — configure it: the subject, the wiki, the display mode
- **↻** — refresh now
- **✕** — remove the card
- the small **name chip** next to the title is the card's identity. Other cards can refer to a card
  by that name, and renaming it re-points the references.

## 3. Clear it and start your own

Click **↺ Reset**. Because this throws the board away, it asks first — and offers two ways to start
over:

- **Starter set** — the same three-card board you began with (Main Page pageviews, a link count, the
  largest Wikipedias).
- **Blank board** — nothing at all, just the empty grid, ready for the cards you choose.

**Cancel** changes nothing. A blank board is *remembered*: reloading keeps it empty rather than
bringing the starter cards back.

> ⚠️ **Export first if you want to keep the current board.** Reset clears both the cards and the
> board's parameters, and it cannot be undone.

From here everything you add is yours.

## 4. Add a card and point it at a subject

1. Click **+ Add Widget**. A picker opens listing every card type, grouped by category
   (*Articles, Categories & GLAM, Rankings & Platforms, Files & Media, Web & History, Queries &
   Power, Content & Embeds, Dataflow*), with a search box and a category filter.
2. Type `pageviews` and pick **Article Pageviews**. The card appears immediately — it starts on a
   placeholder subject.
3. Click its **⚙**. The configuration panel opens with the article field and the project selector.
4. Type or paste the **exact article title** (spaces are fine — `Albert Einstein`, not
   `Albert_Einstein`), pick the wiki, and the card fetches real data: the 30-day total plus a daily
   bar chart.

Changes apply as you make them. If a card shows an error, the usual cause is a subject that does not
exist on that wiki — check the ⓘ panel for the exact API call the card made.

## 5. Move and resize

- **Drag by the top bar** to move a card. The rest of the board reflows around it.
- **Drag the bottom-right corner** to resize. Cards have minimum sizes, so they cannot be squashed
  into something unreadable.
- Layout is part of what you save, so tidying the board is not wasted work.

## 6. Export the board

Click **⬇ Export**. Your browser downloads `dashboard.json` — a small file containing every card,
its settings, and its position on the grid. That file *is* the board; there is nothing else to save.

## 7. Put the JSON somewhere it can be fetched

The file needs a home your browser is allowed to read. **The easy place is a wiki page:**

1. Create a page — a subpage of your user page is the natural spot, e.g.
   `https://commons.wikimedia.org/wiki/User:YourName/My-board.json`
2. Paste the exported JSON in as the page's content (no wrapper needed), and save.
3. Load it with `?config=` pointing at that page:

```
https://wikibento.toolforge.org/?config=https://commons.wikimedia.org/wiki/User:YourName/My-board.json
```

**Why wiki pages work:** WikiBento fetches wiki pages through the MediaWiki Action API
(`action=parse`), which is CORS-enabled — so no hosting, no server, and you keep the wiki's history
and permissions. Short links work too: `?config=https://w.wiki/TR9R` resolves the short URL
server-side and then loads the page it points at.

**If you host the file elsewhere**, that host must send `Access-Control-Allow-Origin`. A plain file
on a web server without CORS headers will fail, and you will see:

> ⚠ Could not load dashboard from URL: Failed to fetch

…after which the board falls back to the starter set. That message means "the browser was not allowed
to read that URL", not "the file is missing".

## 8. Load it anywhere

That wiki page plus `?config=` is a complete, portable board. Open the URL on another machine, a
lobby kiosk, or send it to a colleague: the same dashboard appears, rebuilt from the page. The link
is the whole thing — bookmark it, or use **🔗 Share** to get a QR code for it.

For a screen that should not be edited, add `?lean=1` (chrome-free, still resizable) or `?kiosk=1`
(fullscreen), and press **Esc** to leave.

---

## Known gaps (as of 2026-09-11)

Documentation is only honest if it says where the tool currently lets you down. These are real, and
filed rather than hidden:

- **The `?config=` URL must be CORS-fetchable** (wiki pages are, most static hosts are not) — see
  step 7. There is no server-side proxy for arbitrary hosts.

Fixed on 2026-09-11 — the tutorial needed them to be true, so the product changed rather than the
narration:

- **Reset now asks.** It opens a dialog offering the starter set, a blank board, or cancel — and it
  clears the board's `params` block along with the cards.
- **Export carries the `params` block.** The exported JSON was `version`, `widgets`, `layout` only, so
  a parameterised board lost its parameters through Export → wiki page → `?config=`. It now writes
  `params` too, matching the documented format.

## Re-making the video

The tutorial video is generated, not hand-edited, so it can be re-recorded when the app changes:

**Prerequisite:** recording needs *Playwright's own* ffmpeg build, not the system one. It lives
in Playwright's browser cache as `ffmpeg-<rev>/` — `PLAYWRIGHT_BROWSERS_PATH` if that is set,
otherwise the platform default (`~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright`
on Linux). The recorder checks both and names what it looked for. If it is genuinely absent the
one-time fix is the build belonging to **this repo's** playwright-core:

```bash
node node_modules/playwright-core/cli.js install ffmpeg
```

⚠️ Do not reach for `npx playwright install ffmpeg` — it resolves a *different* playwright version
(so it can install a revision nothing here uses) and `install <subset>` **prunes** the engines you
did not name. Verified by ablation: with the ffmpeg binary renamed aside, recording fails with
"Video rendering requires ffmpeg binary".

**Two different ffmpegs, on purpose:** recording uses Playwright's build (above); the
*assembling* step (`tutorial:build`) shells out to the **system** `ffmpeg` and `ffprobe`
for trimming, stretching, muxing and concatenation, so those must be on `PATH`
(`brew install ffmpeg` here; verified present 2026-09-11). The system ffmpeg does **not** need
text support: every caption, badge and card is rendered by a real browser into a PNG and composited
with the `overlay` filter, so a build without `drawtext` (or `libfreetype`, or DejaVu fonts) works
fine — which is exactly the situation on macOS.

**Prerequisite for narration:** a text-to-speech engine, only for the `tutorial:narrate` step.
The default is [edge-tts](https://github.com/rany2/edge-tts) — free, no API key, no account:

```bash
uv tool install edge-tts        # or: pip install edge-tts
```

On macOS you can skip the install entirely and use the built-in voice with
`--provider say`. Unchanged lines are cached, so re-running after editing one beat re-synthesizes
only that line.

**Output directory:** `--out <dir>` (or `WIKIBENTO_TUTORIAL_OUT`). The default is the recording
host's `/opt/data/staging/wikibento-tutorial` when that exists, otherwise a temp dir — so the
pipeline also runs on a laptop. The recorder prints the resolved path as `clips → …`.

The **narration, captions and on-screen effects** all come from
`scripts/tutorial-video/SCRIPT.md`, which is the editable source of truth: each scene is a list of
beats, and every beat says which action must happen while that line is spoken. `tutorial:beats` parses
it into the beats the rest of the pipeline works from, and `tutorial:narrate` synthesizes **one clip
per beat** so each beat has a measured offset — which is what lets an action land on the words
describing it. A marker becomes something the recorder can actually draw when it names its target —
`🔍 1.2× @ .grid-item:nth-child(3)` — and `tutorial:beats` prints how many still need one.

```bash
npm run tutorial:beats                            # SCRIPT.md → beats (also validates it)
npm run tutorial:narrate                          # one clip per beat → narration/timing.json
npm run build && npm run tutorial:record          # records, timed to those beats
npm run tutorial:build                            # trim, stretch, caption, mux, concat
```

**Narrate before recording** — the recorder times its actions from the measured voiceover offsets.
Each step takes `--out <dir>` to work in a different directory, and `--only <scene-id>` to redo a
single scene. The resolution is printed by each script.

Because each scene is recorded separately, a single changed step can be re-recorded with
`--only <scene-id>` without touching the rest. `scenes.json` holds the narration, the on-screen
captions and the starting state for each step, so the video and the text above stay in step.
