# Tutorial video — pipeline status

**Status as of 2026-09-11.** What the pipeline is, what is verified working, what is still missing,
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
| `scenes.json` | Only the operational setup prose cannot express: each scene's starting state (`start`), `step`, `title`. | — | — |
| **`beats.mjs`** | Parses the script into beats; validates it against the scene ids and reports how much fx is still prose. `--check` is the gate; `npm test` covers it. | `SCRIPT.md`, `scenes.json` | `beats.json` |
| **`narration.mjs`** | Synthesizes **one clip per beat**, measures each, and writes the beat timeline. Providers: edge-tts (default), `say`, piper. Content-hash cached, so an unchanged line is never re-synthesized. | `SCRIPT.md` (via beats.mjs) | `narration/<scene>-b<n>.ogg`, `narration/<scene>.ogg`, `narration/timing.json` |
| `record.mjs` | Drives the live app and records one clip per scene. Starts a beat clock when the scene's actions begin, waits for each beat before acting, plays the 🔍/⭕ fx in-page, and records the measured lead-in. | `scenes.json`, `narration/timing.json` | `clips/*.webm`, `timeline.json` |
| `overlays.mjs` | Renders badge, URL card and **one caption PNG per beat** in a real browser (transparent, full-canvas), content-hash cached. | `timeline.json`, `beats.json` | `overlays/*.png` |
| `cards.mjs` | Renders `title.png` / `end.png` in a browser. | (in-code HTML) | `cards/*.png` |
| `build.mjs` | Parses the script, trims each clip's measured lead-in, stretches to the narration, composites the overlays (each caption under **its own beat's** window), muxes narration, concatenates behind a title card and in front of an end card, emits an `.srt`. | `timeline.json`, `clips/*`, `narration/*`, `beats.json`, `timing.json` | `build/*`, `wikibento-tutorial.mp4`, `.srt` |
| `fx-proof.mjs` | The standalone proof the in-page fx came from (zoom, ring, typing clicks, `events.json`). The zoom/ring half now lives in `record.mjs`; this stays as the reference. | — | `events.json` |
| `paths.mjs` | The shared output-directory rule and the Playwright ffmpeg-cache probe. | argv, env | — |

npm scripts: `tutorial:beats`, `tutorial:narrate`, `tutorial:record`, `tutorial:build`.

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
- **fx is really applied**: the zoom is a CSS transform in-page (text stays crisp because the browser
  re-renders it) and the ring is an SVG-free overlay drawn over the target — both part of the
  recording, not post-production.
- **The lead-in is measured, not guessed.** Scene 1 spent **10.6s** loading the board before its
  actions began; the old blank-pixel heuristic trimmed only ~1s of that, so nine seconds of loading
  sat at the head of the take. `build.mjs` now trims the recorder's own measurement.
- 312 tests, `docs-facts` 7/7.

### Fixed along the way (each found by reading frames, not logs)

- The end card played second, and there were two of them.
- A white flash at every scene-boundary (the app's unpainted page).
- Stale captions: overlays were cached by filename, so edited words never reached the video. Now
  cached by content hash, and `build.mjs` always invokes the renderer.
- Scene 4 never set its subject (the click at a computed offset missed the field), so
  "the data fills in for that article" was false on screen.
- The Reset dialog: recorded scenes now drive it (and the product itself gained it).

## Still missing

1. **Most fx markers are still prose.** `tutorial:beats` reports it live: **10 🔍, 2 with a `@target`;
   15 ⭕, 3 with a `@target`; 3 🔊**. The recorder plays whatever carries a target, so wiring the rest is
   mostly adding `@ selectors` to `SCRIPT.md` — plus the 3 sound effects, which need post-production
   because no audio is recorded at all.
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
