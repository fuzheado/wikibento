# Tutorial video — pipeline status

**Status: 2026-09-12.** The pipeline runs end to end on macOS and produces a finished narrated take:
**2:42**, version `wikibento-tutorial-2026-09-12-1431.mp4`, with six earlier takes kept beside it for
comparison.

**One-line verdict:** recording, narration, highlights and assembly all work and are cheap to re-run
(a chapter cache means an edit costs seconds); what is left is small, listed under *Still missing*, and
nothing blocks a re-make.

Related: [`../pipeline/README.md`](../pipeline/README.md) (the engine's contract) ·
[`../video/SCRIPT.md`](../video/SCRIPT.md) (the shooting script) · [`TUTORIAL.md`](TUTORIAL.md) (the
written tutorial) · [`TUTORIAL-VIDEO-TOOLING.md`](TUTORIAL-VIDEO-TOOLING.md) (the tooling research) ·
the reusable technique: `~/.pi/agent/skills/narrated-tutorial-video/SKILL.md`.

---

## If you are picking this up

1. **Read the engine contract** — [`../pipeline/README.md`](../pipeline/README.md): the config shape, the
   script format, and the rules the engine enforces. Then read the skill listed above; it carries the traps
   that were paid for here (silent failures, ffmpeg deadlocks, stale caches) so they need not be paid again.
2. **Find the current take** — `~/Movies/wikibento-tutorial-latest.mp4` (`-latest` is a symlink; every run
   writes a new timestamped version rather than overwriting). The `~/Movies` copies are **not in git**;
   everything in them is regenerable from the repo.
3. **Permissions and tools** — Node 20+, the repo's `playwright-core` engines, Playwright's *own* ffmpeg in
   its browser cache, system `ffmpeg`/`ffprobe`, and a TTS engine (`uv tool install edge-tts`, or macOS
   `say` with no install). See [`TUTORIAL.md`](TUTORIAL.md) *Prerequisite* for the exact commands.
4. **Re-run it** (see *Running it* below). Only the repo is the source of truth: the recorded clips and
   narration live in a working directory (`--out`, a temp dir by default) and re-recording against the live
   site takes ~6 minutes.
5. **Check nothing regressed** — `npm test` (315 tests, including the ones that enforce this project's
   video rules: highlights point at widgets that exist, the narration names what it shows, the opening line
   is spoken over the title card, and a widget is only ever called a widget).

## Two layers: an engine and a project

- **`pipeline/` is the engine.** Beats, voiceover, overlays, encoding, review bundles — and **no WikiBento
  strings at all** (the check is `grep -i wikibento pipeline/*.mjs`). Contract:
  [`../pipeline/README.md`](../pipeline/README.md).
- **`video/` is the project.** `SCRIPT.md`, `scenes.json`, `demo.config.mjs` (name, app URL, TTS defaults,
  the title/closing card text) and `actions.mjs` (where each scene starts, what it does on screen).
  Everything that would change for another app lives here.

A second project copies `video/` and leaves `pipeline/` alone.

## The data flow

```
SCRIPT.md ──parse──▶ beats.json ──tts──▶ per-beat .ogg + timing.json (offsets)
   │ the words, captions, fx markers            │
   └────────────▶ record.mjs ──▶ clips/*.webm + timeline.json (actions timed to beats)
                                              └──▶ build.mjs ──▶ <name>.mp4 + .srt
```

| file | role |
|---|---|
| `pipeline/beats.mjs` | parses the script into beats; `--check` validates and counts prose-only markers |
| `pipeline/narration.mjs` | one TTS clip per beat, content-hash cached; writes the beat timeline |
| `pipeline/record.mjs` | drives the app, one clip per scene, actions and fx timed to beats; runs the project's `startState`/`steps`; reveals a highlight's target before drawing it |
| `pipeline/overlays.mjs` | captions, step badge and note as transparent PNGs (validated, content-hash cached) |
| `pipeline/cards.mjs` | the project's title/closing cards, rendered in a browser |
| `pipeline/build.mjs` | trim/stretch/composite/mux/concat, **per-chapter cached** |
| `pipeline/review.mjs` | the timestamped review bundle: take, audio, transcript |
| `pipeline/primitives.mjs` | mouse/typing/selector helpers and the beat clock, shared with the project |
| `pipeline/paths.mjs` | config loading, the output-directory rule, the Playwright ffmpeg probe |

npm scripts: `tutorial:beats`, `tutorial:narrate`, `tutorial:record`, `tutorial:build`, `tutorial:review`
(each already passes `--config video/demo.config.mjs`).

## Running it

```bash
uv tool install edge-tts         # one-time; or use --provider say on macOS
npm run tutorial:beats           # parse SCRIPT.md → beats.json (also validates)
npm run tutorial:narrate         # one clip per beat + timing.json  ← BEFORE recording
npm run tutorial:record          # records, timed to the beats
npm run tutorial:build           # → <out>/wikibento-tutorial.mp4 + .srt
npm run tutorial:review          # → timestamped take + audio + transcript in ~/Movies
```

**Narrate before recording** — the recorder times its actions from the measured voiceover offsets. Every
step takes `--out DIR` (default: the recording host's `/opt/data/staging/<name>` if it exists, else a temp
dir; `DEMO_VIDEO_OUT` overrides) and `--only <scene-id>`.

## What an edit costs

`build/manifest.json` keys each scene's encoded part by everything that shaped it, so a rebuild costs what
actually changed. Measured on this 10-scene project:

| you changed | re-run | cost |
|---|---|---|
| a caption, the note line, the badge | `tutorial:build` | ~6s if nothing else changed; ~18s for one scene |
| spoken words | `narrate` + `build` | **no re-recording** — the clip stretches to the new narration |
| an action, a selector, fx | `record --only <id>` + `build` | ~1 min |
| the app's copy or UI | deploy first, then re-record the scenes that show it | ~1 min/scene |
| everything | `record` + `narrate` + `build` | ~6–8 min |

## Verified working (2026-09-12)

- **The whole chain, every scene** — parse → per-beat voiceover with measured offsets → record (actions and
  fx on the beat clock) → assemble, with captions in their own beat's window.
- **The take shows what it claims.** Scene 1 demonstrates the board (chart, table, gallery, article,
  quality, history) and then clicks **Marie Curie**, the change rippling through the widgets while the
  narration names them; scene 5 really drags a widget; scene 3's Reset dialog is on screen while its options
  are described; scene 6 shows the exported JSON from its top-left.
- **31 fx markers** fire across the scenes (8 zooms, 23 rings), each targeting a widget **by name**
  (`[data-widget-id="views"]`), and each revealing its target first if it is below the fold.
- **The step badge** is a compact box in the upper-right, shown only for the first 5.5s of a scene.
- **315 tests + docs-facts 7/7**, including video-specific rules (above).

## Still missing

1. **No sound effects.** The script carries 2 🔊 markers (keystroke clicks, pick-up/put-down ticks). Nothing
   records audio from the browser, so they need post-production: lay a click track in `build.mjs` from a
   timeline of keystroke times (the old `video/fx-proof.mjs` records such a timeline to `events.json`).
2. **The `note` line is the last on-screen text the script does not own.** Each scene's lower-left
   annotation (`article-vitals-demo.json — one article, six angles`, `Reset → Blank board`, …) lives in
   `video/scenes.json`. Moving it into `SCRIPT.md` as a per-scene marker would complete "the script is the
   source of truth".
3. **Removing a widget is no longer taught** — it is only visible. Scene 3 now ends on a blank board (which
   is why scene 4 no longer has to clear three widgets), and the ✕ beat went with the shortened opening.
   One beat would put it back.
4. **"Or from another service worth composing with" is not in the narration** — true of the app (Internet
   Archive, Wayback, SPARQL), but nothing on the demo board shows it. One extra widget on
   `public/article-vitals-demo.json` would earn the line back (and the existing test would then enforce it).
5. **The take is not published anywhere.** When it is, record the URL here so the next re-make can compare
   against what is public.

## Reviewing a take — and comparing takes

Every `tutorial:review` run writes a **new timestamped version** and never overwrites an older one, with a
`-latest` symlink per artifact, and prints the versions it finds. Comparing two takes side by side is how a
drag that did not move, a scene that had gone white, and a highlight that never revealed its target were all
caught. `--label v3` names a version by hand.

## How to verify

```bash
export PATH="$HOME/.local/bin:$PATH"           # edge-tts from uv

node pipeline/beats.mjs --check                                    # the script parses and matches the plan
node pipeline/narration.mjs --only 01-what --out /tmp/tut          # per-beat voiceover + offsets
node pipeline/narration.mjs --only 01-what --out /tmp/tut          # 2nd run: all cache hits
node pipeline/record.mjs --config video/demo.config.mjs --only 01-what --out /tmp/tut
node pipeline/build.mjs --out /tmp/tut                             # a partial timeline is enough to prove the chain
node pipeline/review.mjs --out /tmp/tut

ffmpeg -hide_banner -filters | grep -c drawtext                    # 0 on this machine, and that is fine
```

Acceptance for the text layer: a take assembles with **no `drawtext`** and no reference to
`/usr/share/fonts`, captions legible at 1080p. Acceptance for the beats layer: `beats --check` is clean and
a caption's window equals its beat's window in `timing.json`.

---

## History

Newest first. Each pass was driven by watching the previous take; the generic lessons from all of them were
lifted into the skill, so this is the project's own record rather than a tutorial.

| date | what happened |
|---|---|
| 2026-09-12 · sixth | Ripple demo (click Marie Curie, poll until the widgets follow); scene 3 cut to two beats (17s → 6.2s) and scene 4 starts blank with its removal beats dropped (**2:56 → 2:42**); the step badge moved to a compact upper-right box and retires after 5.5s. Two bugs: `clickHuman` could not take Playwright selectors (a scene silently recorded no widget), and the extracted app module referenced the engine's old clock (a step threw silently) — the runner now counts and calls out failed steps. |
| 2026-09-12 · fifth | A highlight reveals its own target: the fx layer scrolls a target into view before drawing, so "a gallery of images" is actually on screen when it is said. |
| 2026-09-12 · fourth | Scene 1 moved onto the shipped `article-vitals-demo.json` so the narration's nouns are all visible; markers address widgets `[data-widget-id]` rather than by position; a test enforces the rule. Chapter caching added (nothing changed ≈ 6s). |
| 2026-09-12 · third | Narration over the title card (the opening line moved off scene 1); scene 6 shows the JSON at 1× from its top-left instead of a zoom that clipped it. |
| 2026-09-12 · second | Scene 3's five overlay PNGs had been cached as opaque white (`rgb24`), which played the scene as 17 seconds of white; `overlays.mjs` now validates transparency, waits for a painted page, and refuses to cache a bad render. Takes became versioned. |
| 2026-09-12 · first | Ending cut from 3:41 to 3:00 (no API/CORS talk, straight to the payoff and the QR); "wiki page" → "a JSON file on a wiki"; scene 5's drag really moves (the zoom on that beat was transforming the app root mid-gesture, and the check that should have caught it passed on 1px rounding). |
| 2026-09-11 | Built the pipeline: SCRIPT.md as the source of truth with a beats parser, per-beat voiceover with measured offsets, beat-timed actions, in-page zoom/ring, browser-rendered overlays (no ffmpeg text support needed), and the ffmpeg shutdown deadlock fixed by making every stream finite. |
