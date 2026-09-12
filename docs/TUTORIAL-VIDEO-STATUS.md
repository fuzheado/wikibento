# Tutorial video — pipeline status

**Status as of 2026-09-12 (second review pass).** What the pipeline is, what is verified working, what is still missing,
and how to check any of it. Written so the work can be resumed from this file alone.

**One-line verdict:** `SCRIPT.md` is now the pipeline's real input — it is parsed into beats, the
voiceover is synthesized one clip per beat, and the recorder times its actions and fx from the
measured offsets. Recording, narration and assembly all run on this macOS machine.

Related: [`TUTORIAL.md`](TUTORIAL.md) (the written tutorial + *Re-making the video*),
[`TUTORIAL-VIDEO-TOOLING.md`](TUTORIAL-VIDEO-TOOLING.md) (the ecosystem research and what we grafted
from it), [`../scripts/tutorial-video/SCRIPT.md`](../scripts/tutorial-video/SCRIPT.md) (the shooting
script), HANDOFF § *Tutorial video*.

---

## The data flow

```
SCRIPT.md  ──parse──▶  beats.json  ──tts──▶  per-beat .ogg + timing.json
   │                                              │
   │ the words, captions, fx markers              │ measured beat offsets (start/end per beat)
   │                                              ▼
   └──────────────────────────────▶  record.mjs  ──▶  clips/*.webm + timeline.json
                                     (actions and fx timed to the beats)
                                              │
                                              ▼
                                        build.mjs  ──▶  wikibento-tutorial.mp4 + .srt
```

| file | role | reads | writes |
|---|---|---|---|
| `SCRIPT.md` | **The source of truth**: per-beat spoken lines, captions (📝 overrides), and fx markers. A marker is machine-readable when it names a target — `🔍 1.2× @ .grid-item:nth-child(3)`, `⭕ @ .grid-item:nth-child(1) .widget-title`. | — | (human edits) |
| `scenes.json` | Only the operational setup prose cannot express: each scene's starting state (`start`), `step`, `title`, and its lower-left `note` (the board's address, or a one-line process hint — the field was called `url` until it turned out two of the eight notes are not URLs). | — | — |
| **`beats.mjs`** | Parses the script into beats; validates it against the scene ids and reports how much fx is still prose. `--check` is the gate; `npm test` covers it. | `SCRIPT.md`, `scenes.json` | `beats.json` |
| **`narration.mjs`** | Synthesizes **one clip per beat**, measures each, and writes the beat timeline. Providers: edge-tts (default), `say`, piper. Content-hash cached, so an unchanged line is never re-synthesized. | `SCRIPT.md` (via beats.mjs) | `narration/<scene>-b<n>.ogg`, `narration/<scene>.ogg`, `narration/timing.json` |
| `record.mjs` | Drives the live app and records one clip per scene. Starts a beat clock when the scene's actions begin, waits for each beat before acting, plays the 🔍/⭕ fx in-page, and records the measured lead-in. | `scenes.json`, `narration/timing.json` | `clips/*.webm`, `timeline.json` |
| `overlays.mjs` | Renders badge, URL card and **one caption PNG per beat** in a real browser (transparent, full-canvas), content-hash cached. | `timeline.json`, `beats.json` | `overlays/*.png` |
| `cards.mjs` | Renders `title.png` / `end.png` in a browser. | (in-code HTML) | `cards/*.png` |
| `build.mjs` | Parses the script, trims each clip's measured lead-in, stretches to the narration, composites the overlays (each caption under **its own beat's** window), muxes narration, concatenates behind a title card and in front of an end card, emits an `.srt`. | `timeline.json`, `clips/*`, `narration/*`, `beats.json`, `timing.json` | `build/*`, `wikibento-tutorial.mp4`, `.srt` |
| `fx-proof.mjs` | The standalone proof the in-page fx came from (zoom, ring, typing clicks, `events.json`). The zoom/ring half now lives in `record.mjs`; this stays as the reference. | — | `events.json` |
| `paths.mjs` | The shared output-directory rule and the Playwright ffmpeg-cache probe. | argv, env | — |

npm scripts: `tutorial:beats`, `tutorial:narrate`, `tutorial:record`, `tutorial:build`,
`tutorial:review`.

## Running it

```bash
uv tool install edge-tts             # one-time; or pip install edge-tts
npm run tutorial:beats               # parse SCRIPT.md → beats.json (also validates it)
npm run tutorial:narrate             # one clip per beat + timing.json   ← BEFORE recording
npm run tutorial:record              # records, timed to the beats
npm run tutorial:build                # assemble          → out/wikibento-tutorial.mp4
```

**Narrate before recording** — the recorder needs the beat offsets, and the offsets come from the
measured voiceover. Each step takes `--out <dir>` (or `WIKIBENTO_TUTORIAL_OUT`; with neither, the
recording host's `/opt/data/staging/wikibento-tutorial` if it exists, else a temp dir) and
`--only <scene-id>`. `--provider say` needs no install at all on macOS.

## Verified working on this machine

- **The whole chain, on every scene.** Parse → per-beat voiceover with measured offsets → record (each
  action waits for the beat whose words describe it) → assemble (one caption per beat, in that beat's
  window). Spot-checked in the finished video: scene 1's **1.2× push onto the third card, held under the
  sentence describing it, with rings on each card as it is named**; scene 3's Reset dialog **open while
  its two options are described** and dismissed on "From here, everything you add is yours"; scene 5's
  card **still moving while the clause about the board reflowing is spoken**, then resized.
- **The recorder reports actions that overrun their beat** — the script's rule ("every action must
  finish before the beat that describes it ends") as a log line rather than something to spot in the
  finished video. On the 2026-09-11 pass it flagged exactly one: scene 5's resize finishes 0.5s after
  beat 2 ends, so that beat wants a few more words or a quicker gesture.
- **The parser is faithful**: for 7 of the 8 recorded scenes the narration derived from `SCRIPT.md`
  is *byte-identical* to the hand-maintained copy in `scenes.json` (the 8th differs only in quote
  style), so switching the pipeline to the script changed no words. `tests/tutorial-beats.test.mjs`
  (9 cases) pins the parsing rules.
- **fx is really applied, on every scene**: 27 markers fire across the eight scenes (the log names
  each one, and the recorder warns if a target never appears). The zoom is a CSS transform in-page —
  text stays crisp because the browser re-renders it — and the ring is an overlay drawn over the
  target; both are part of the recording, not post-production.
- **The URL pill.** A browser's address bar is not part of a Playwright recording, so two of the
  script's markers ("ring the `?config=` part", scenes 2 and 8) had no target at all. The recorder now
  draws a pill showing the real `location.href`, with the `?config=` part in its own span
  (`.fx-url-config`) for the ring to find — and `build.mjs` skips its static URL burn-in for those
  scenes so the address is not on screen twice.
- **The lead-in is measured, not guessed.** Scene 1 spent **10.6s** loading the board before its
  actions began; the old blank-pixel heuristic trimmed only ~1s of that, so nine seconds of loading
  sat at the head of the take. `build.mjs` now trims the recorder's own measurement.
- 312 tests, `docs-facts` 7/7.

### Review pass 2026-09-12 (from watching the take)

- **Everything is a widget now.** The narration said “card” in some scenes and “widget” in others, which
  makes a viewer wonder whether they are different things. The script says widget throughout, a test
  (`the script only ever calls a widget a widget`) keeps it that way, and the **product copy was fixed to
  match** — the Reset dialog, the picker's widget descriptions, the config panel's “Params on this
  widget”, two widget hints and the QR warning all said “card”, and the dialog and picker are on camera.
  “Card” now means only the video's own title and closing screens.
- **Scene 1 introduces the noun and what a widget can hold** — “Every box here is a widget. A widget shows
  one thing — a pageview count, a table, a chart, a gallery — from a Wikimedia project, or from another
  service worth composing with.” Tightened to ~36s after a first attempt ran to 40s.
- **The title card is 2.5s, not 4.5s** — scenery, not content; the reviewer wanted the tutorial to start
  sooner.
- **Scene 4 starts by clearing the board.** It removes all three starter widgets with their ✕ (which is
  how you start from nothing), then adds Article Pageviews and points it at Marie Curie on an otherwise
  empty grid — the widget is readable instead of cramped in a corner next to three others.
- **The Marie Curie figure really changes now.** Two bugs: the recorder set the field and moved on (the
  narration's “watch it fetch real data” was false — also because `Enter` submitted the field's form and
  closed the panel, so the project-selector ring had nothing to draw on), and the check that was supposed
  to catch it read its baseline *after* applying, so it could not see a change. Now the pre-apply figure
  is captured first, the subject is applied with the panel's own **Apply & Reload**, and the recorder
  polls until the figure differs — it reports `207,055,573 → 161,964 (📊 Marie Curie…)` in 0.4s.
  That also removed a 17s and a 15s beat overrun, and the clip went 65s → 49s.
- **The URL pill shows the address decoded** — `?config=https://w.wiki/TR9R`, not `%3A%2F%2F` — because
  the escaping is what makes the link work, not what makes it readable.
- **The app copy had to change too, and then be deployed before re-recording.** The Reset dialog and the
  picker are on camera, so the terminology sweep reached `src/` — the dialog, the Markdown widget's text,
  the registry description, the config panel's labels, the params hint and the QR warning. The first
  re-record happened *before* that deploy, so the take still showed the old dialog ("every card"), and a
  second scan (the first missed hyphenated uses like "three-card") turned up four more. Re-deployed, then
  re-recorded: `index-DkeLIrq2.js`. **Order matters — deploy the copy before recording a scene that shows
  it.**
- **`scenes.json` stopped carrying the words.** Its `narration` and `captions` copies are gone (`SCRIPT.md`
  owns both), and the on-screen step badge now takes its number and title from the script, so a heading
  edit cannot leave a stale title on screen. What remains is per-scene setup only:
  `id`, `start`, `note` — plus `step`/`title` as fallbacks for when no `beats.json` exists.

### Fourth review pass 2026-09-12 (the showcase board, and speed)

- **Hear something, see something.** Scene 1 promised "a pageview count, a table, a chart, a gallery" over
  the three-widget starter board — three numbers and a ranking, no chart and no gallery. It now shows the
  shipped **`public/article-vitals-demo.json`** ("one article, six angles"): a pageview **chart**, an
  assessments **table**, a **gallery**, the **article** card, its **quality** rating, its **edit history**,
  and the **subject picker** — and a ring lands on each as it is named. The claim about "another service"
  was **cut**, because nothing on that board shows one; a line the viewer cannot see is what the rule
  forbids. Markers now address widgets as `[data-widget-id="views"]` (the app renders that attribute) rather
  than `:nth-child(3)`, so re-laying the board cannot point a highlight at the wrong card. `npm test` now
  enforces the rule: every widget scene 1 highlights must exist on the board it starts from, and the
  narration must name a chart, table, gallery, article, quality and history.
- **Chapters are cached, so an iteration costs seconds not minutes.** Each scene's encoded part is keyed by
  everything that shaped it — clip, narration, caption text, note, overlay PNGs, timing maths — in
  `build/manifest.json`. Measured: a build with nothing changed reuses 10 of 10 parts in ~6s; a caption-only
  edit re-encodes one scene (~18s); a re-recorded scene re-encodes that one. What used to be a ~70s full
  rebuild is now proportional to what actually changed. Caption *text* now comes from the script and only
  its *window* from the timeline, so fixing a typo in a caption needs no re-narration at all.
  - The discipline this makes affordable: **changing words needs no re-recording** (the clip is stretched to
    the new narration), **changing captions or notes needs neither recording nor narration**, and only
    changed **actions or fx** mean re-recording a scene.

### Third review pass 2026-09-12 (two notes from watching)

- **The title card speaks now.** Five silent seconds over a logo wasted the moment attention is highest. The
  opening line moved out of scene 1 and onto the card: SCRIPT.md has a `00-title` section (a card, not a
  recorded scene), `narration.mjs` synthesizes it like any other beat, and `build.mjs` muxes that line over
  the title card and sizes the card to it (5.9s here). The line is also in the `.srt`. Scene 1 now opens on
  "Every box here is a widget", so nothing is said twice. Take: 3:00 → 2:58, and the story starts at 0:00.
- **A JSON file is read from its top-left at 1×.** In scene 6 the zoom was on the whole `<pre>`, which is
  larger than the viewport, so scaling it pushed the left edge and the header off screen and the viewer saw
  the middle of the file with every line clipped off at the left — exactly the note "it gets cut off… you
  don't want to zoom into the middle". The zoom is gone from that beat (a file does not need magnifying),
  the page's text is 16px and wraps (`overflow-wrap: anywhere`) so long values cannot run off the right, and
  the scroll is gentle enough to keep the header in view. Underneath, the fx layer now **anchors an
  oversized target to its top-left instead of centring it**, which is the general fix for any zoom on a
  document-sized element.
- The title card also said "in four minutes" while the take is 2:58; it says three minutes now.

### Scene 3 played as 17 seconds of white (2026-09-12)

Reported from watching: "the to start your own board section has a big white blank screen". Exactly so —
scene 3 was `255,255,255` at every second. The clip was fine and the lead-in trim was fine; **five of
scene 3's overlay PNGs had been rendered `rgb24` instead of `rgba`, i.e. opaque white full-canvas images**,
and since they are full-canvas, an opaque one whites out everything under it. All 41 other overlays were
correct, which is why only that scene went blank.

The worse half is why it persisted: overlays are cached by a hash of their markup, so a bad render was
recorded as *current* and never re-rendered — the same failure shape as the stale captions, a wrong
artifact that caching makes permanent. `overlays.mjs` now:
  - checks the PNG header (IHDR colour type 6 = RGBA) for **every** planned overlay, so a file that lost
    its transparency is re-rendered rather than trusted;
  - waits for the page to be painted (an element with a size and some text) and for two animation frames
    before the screenshot;
  - retries once, then **exits non-zero rather than caching an opaque overlay** — the build stops instead
    of compositing a white screen.

### Second review pass 2026-09-12 (from watching the take again)

- **3:41 → 3:00.** The ending was over-explained. Scene 7 is now two beats — "that JSON needs a home your
  browser can read; the easiest is a file on a wiki" — and the takedown of the MediaWiki API and the
  cross-origin/hosting discussion are gone. Scene 8 loses the kiosk beat and is now the payoff plus the
  share/QR. An ordinary user does not need an API to paste a file. One optional beat went too (scene 2's
  name chip, a dataflow detail). Also: pause after each scene 1.0 → 0.35s, closing card 5.5 → 3.0s.
- **“Wiki page” → “a JSON file on a wiki”.** Saying “wiki page” makes a viewer picture a Wikipedia article;
  what the app actually reads is a small config file, served from a Wikimedia server, that happens to hold
  JSON. The script and the written tutorial both say file now.
- **The move in scene 5 really moves.** It had not been: the widget stayed at x=20 and the recorder's check
  said `moved: true` anyway, because it compared whole box objects and passed on a 1px width rounding. Two
  causes — the zoom on that beat is a CSS transform on the app root, which moves the widget under the
  pointer mid-gesture, so the drag never engaged (`dragging-class: 0`); and the check was too loose. The
  zoom moved to the closing beat (where nothing is moving, as the script's own rule requires) and the check
  now requires a real Δx/Δy. It reports `dx 315`.
- **The intermittent 10-minute build hang is fixed.** ffmpeg was deadlocking in shutdown: output `-t` plus
  endless `-loop 1` image inputs meant it encoded to within 0.1s of the target, the overlay inputs reported
  "All consumers of this stream are done", and it waited forever — reproducibly (3/8 runs), including when
  the exact command was run by hand. The graph is now **fully finite**: clone-then-`trim=end` the video,
  `apad,atrim=end` the audio, give each image input an explicit `-t`, and drop the output `-t`. 8/8, and a
  full build takes **~70 seconds**.

### Fixed along the way (each found by reading frames, not logs)

- The end card played second, and there were two of them.
- A white flash at every scene-boundary (the app's unpainted page).
- Stale captions: overlays were cached by filename, so edited words never reached the video. Now
  cached by content hash, and `build.mjs` always invokes the renderer.
- Scene 4 never set its subject (the click at a computed offset missed the field), so
  "the data fills in for that article" was false on screen.
- The Reset dialog: recorded scenes now drive it (and the product itself gained it).

## Still missing

1. **Two markers cannot be wired, and the script says why.** `tutorial:beats` now reports **10 🔍, all 10
   with a `@target`; 19 ⭕, 17 with a `@target`; 3 🔊**. The two unwired rings are deliberate and noted in
   `SCRIPT.md`: a ring on scene 5's *moving* card would sit still while the card slid out from under it
   (it is drawn once, at fixed coordinates), and scene 7's raw wiki page has no title element to ring.
   The 3 🔊 markers still need post-production, because no audio is recorded at all.
2. ~~Only scene 1's actions are beat-timed.~~ **Done 2026-09-11**: every scene is a list of steps, each
   naming the beat whose words describe it (`STEPS` in `record.mjs`); the runner waits for that beat and
   warns when a step overruns it. Sub-actions inside one beat are spread across its window, which is how
   "four hovers as each icon is named" became four points inside the beat.
3. **Scene 6's export never downloads** in headless Playwright — reproduced and diagnosed. Worked
   around 2026-09-11: the wait is now 4s (it used to be 20s, which made that take four times longer than
   its narration) and the scene renders the board's own JSON — which after the export fix is exactly what
   the file contains — so the viewer sees the file's contents instead of a dead pause.
4. **Nobody has listened to the narration.** It is edge-tts reading the script verbatim.
5. **Where the published take lives is not recorded** — no link anywhere in the repo.
6. **Typing is instantaneous** rather than keystroke-by-keystroke (scene 4), which needs the
   keystroke-chip + click-sound work from `fx-proof.mjs`.

## Reviewing a take — and comparing takes

**Every `tutorial:review` run writes a new timestamped version and never overwrites an older one**, so
takes can be compared side by side; that comparison is how "the move does not move" and the white scene 3
were both caught. A `-latest` symlink points at the newest of each. `--label v3` names a version by hand.

`npm run tutorial:review` writes the three artifacts a person needs, so nobody has to go looking for
them — **watch** `~/Movies/wikibento-tutorial.mp4`, **listen** to `~/Movies/wikibento-narration.m4a`
(the take's own audio, 3½ minutes), **follow** `~/Movies/wikibento-transcript.txt` (every beat with its
position in the *video*, and which fx it triggers). `--dest <dir>` puts them elsewhere.

The transcript is generated from the measured timings rather than hand-kept, because a stale transcript
is worse than none.

## How to verify

```bash
export PATH="$HOME/.local/bin:$PATH"           # edge-tts from uv

# 1. the script parses, and matches the scene plan
node scripts/tutorial-video/beats.mjs --check

# 2. narration: per-beat, with offsets (2nd run is all cache hits)
node scripts/tutorial-video/narration.mjs --only 01-what --out /tmp/tut
node scripts/tutorial-video/narration.mjs --only 01-what --out /tmp/tut

# 3. record — the log names every fx marker it played and the measured lead-in
node scripts/tutorial-video/record.mjs --only 01-what --out /tmp/tut

# 4. assemble — works with a partial timeline, so one scene proves the chain
node scripts/tutorial-video/build.mjs --out /tmp/tut

# 5. this machine's ffmpeg still has no text filters, and that is fine
ffmpeg -hide_banner -filters | grep -c drawtext        # 0
```

Acceptance for the text layer: a full take assembles with **no `drawtext`** and **no reference to
`/usr/share/fonts`**, captions legible at 1080p. Acceptance for the beats layer: `tutorial:beats
--check` is clean, and a caption's on-screen window equals its beat's window in `timing.json`.
