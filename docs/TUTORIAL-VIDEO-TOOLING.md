# The tutorial video — pipeline status and tooling research

**This file merges two documents (2026-10-04):** the pipeline *status* (what our pipeline is, what a re-make
costs, what is still missing — snapshot 2026-09-12) and the *tooling research* (the ecosystem we could have
borrowed from, 2026-09-11). One file because neither half makes sense alone: the status says what the pipeline
does, the research says why it looks like that.

Related: [`../pipeline/README.md`](../pipeline/README.md) (the engine's contract) ·
[`../video/SCRIPT.md`](../video/SCRIPT.md) (the shooting script) · [`TUTORIAL.md`](TUTORIAL.md) (the
written tutorial) · the reusable technique: `~/.pi/agent/skills/narrated-tutorial-video/SKILL.md`.

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
5. **Check nothing regressed** — `npm test`, including the ones that enforce this project's
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

---

# The tooling research

**2026-09-11.** What already exists for turning a scripted browser walkthrough into a narrated
tutorial video, what is worth taking, and what is not — the ecosystem we could borrow from. The
pipeline it was measured against is the first half of this file.

Every repository below was checked against the GitHub API (stars, licence, last push) and its own
README — none of the numbers here come from a summary of a summary. Where a claim in the brief that
prompted this research was wrong, that is noted.

## Verdict

**No project is a drop-in replacement, and none is mature enough to be worth adopting wholesale.**
Every candidate is a single-maintainer repository under ~120 stars, most created within the last
year. The real anchors in the space are an order of magnitude larger — Remotion 58,929★, VHS
20,859★, motion-canvas 19,088★, edge-tts 11,916★, Kokoro 8,788★ — which says this category is young,
not that a good incumbent is waiting to be adopted.

What the research *did* establish: several independent projects converged on the same architecture
this repo already uses — **a script that lives in the repo → Playwright drives the browser → TTS
narration → compose → re-render in CI**. That is the pattern VHS established for terminal
recordings, pointed at web apps. Our design is not unusual; it is the emerging norm.

So the decision is **graft the commodity parts, keep our pipeline**. What we grafted is listed
below; the parts we did not take are listed with reasons, so the decision is not re-litigated.

The **technique** is written up separately as a reusable skill —
`~/.pi/agent/skills/narrated-tutorial-video/SKILL.md` — which is the thing to read before building this
kind of pipeline again: the architecture, the order to wire it up in, and a catalogue of the traps that
cost time here (blank lead-ins, stale content-hash caching, React inputs, clipped panels, injected-script
escapes, encoder probing, and deploy-before-record).

## What we grafted

| taken | from | why |
|---|---|---|
| **edge-tts as the narration engine** — `narration.mjs`, content-hash cached | *Ultrademo*'s voice ladder, *ProductVideoCreator*'s scope | Ultrademo's requirements section turned out to be verbatim the ladder we would have chosen: *"ElevenLabs (premium) → Piper (free, offline, all platforms) → macOS `say` (zero-install placeholder). Unchanged narration lines are cached."* We implemented the middle and lower rungs plus edge-tts. |
| **Never re-synthesize an unchanged line** (hash of provider+voice+rate+text) | *Ultrademo*, *Tutorial Forge* | Both cache on a content hash. Editing one beat must not re-render the other seven, and a re-run must be free. |
| **Browser-rendered text composited with ffmpeg `overlay`** — `overlays.mjs` | *demowright*, *Tutorial Forge*'s "one FFmpeg pass" | Replaces `drawtext` entirely. See "the overlay trick" below — the interesting part is a positioning gotcha it documents. |
| **Trim the setup pre-roll from each clip** | *Tutorial Forge* | It trims "setup pre-roll" in its single ffmpeg pass; our clips each opened on the app's blank white page. Now `build.mjs` measures the blank lead-in and trims it. |

### The overlay trick worth knowing

`overlays.mjs` renders each caption, the step badge and the URL card as a **transparent
full-canvas PNG** in a real browser, so `build.mjs` only ever does `overlay=0:0` and the browser
owns the layout. Two things learned from reading how others solved it:

- **Attach the overlay outside the zoomed subtree.** `demowright` attaches its overlay to `<html>`
  rather than `<body>` *specifically so a zoom transform does not scale the captions and cursor* —
  they stay crisp while the page zooms underneath. Our fx layer zooms the app root, so the same rule
  applies: overlays must never live inside the transformed element.
- **Full-canvas PNGs beat positioned ones.** Because each PNG is 1920×1080, ffmpeg does no
  positioning arithmetic and the text can never drift out of sync with the CSS that produced it.

## Candidates, verified

| repository | ★ | licence | last push | assessment |
|---|---|---|---|---|
| **ThePatriczek/playwright-recast** | 58 | MIT | 2026-08-30 | The closest match to the brief and the only one worth a trial. Parses `trace.zip` (DOM actions, clicks, bounding boxes, cursor positions) into a narrated video: auto-zoom derived from the trace, animated ripple + click sound, SRT/VTT/ASS subtitles, background music with **auto-ducking**, `playwright-bdd` support. v0.5.0 added fade-overlay zoom transitions and per-action-type zoom levels. **Its bundled TTS is commercial-API or GPU-only** (OpenAI / ElevenLabs / Polly / Qwen3-TTS on CUDA), but `RECAST_TTS_PROVIDER=none` plus its "subtitles only" branch means it renders fine with narration we supply ourselves. |
| **matte97p/demowright** | 1 | MIT | 2026-09-08 | Small, MIT, active, and conceptually identical to us: a `VoiceStep[]` array in the repo, synthetic cursor, auto-zoom, captions and end card baked in-browser, `ffmpeg-static` bundled. Its `voice: async (text) => Buffer` hook accepts **any** TTS, including a local engine. 1★ is a real abandonment risk — read it as a source of technique, not a dependency. (Its fork `symval/demowright` adds keystroke badges, auto-slowdown, espeak and SRT.) |
| **new-xp/ultrademo** | 26 | Apache-2.0 | 2026-07-10 | Complete philosophy match — `storyboard.json` as the single source of truth, per-scene re-record, editor stems (clean video + `narration.mp3` + `captions.srt`), Remotion for rendering. But it is two months old and ships as an *agent skill* with its own project scaffold, so adopting it means adopting its structure. Best read as a design blueprint — and its voice ladder is the one we implemented. |
| **mcpware/pagecast** | 47 | MIT | 2026-03-27 | Recorder only: captures bounding boxes on click/focus/type and renders tooltip zoom callouts, ripples and chained pans. No narration, no composition. Interesting technique (bounding-box-driven zooms), same idea as recast's. |
| **jbrecht/tutorial-forge** | 4 | **PolyForm Small Business** | 2026-06-16 | Closest mental model — "VHS for terminal recordings, pointed at web apps", TTS first / record / one ffmpeg pass, content-hash-cached narration, pre-roll trim. But **PolyForm Small Business is source-available, not OSI open source**, and it restricts use by larger organisations: wrong licence for a Wikimedia-adjacent tool. Read it; do not depend on it. |
| **charnley/example-tutorial-as-code** | 5 | MIT | 2026-02-25 | Self-described proof of concept. Valuable as the cleanest reference for **Piper** (offline, CPU, `pip install piper-tts`) + MoviePy sync, and for the "each section pairs a page action with its narration text" authoring style. |
| **kanopi/training-video-generator** | 4 | GPL-2.0 | 2025-10-17 | A Claude Code plugin (`/video-narrate`): markdown → beats → automation scripts → TTS (**ElevenLabs / OpenAI / macOS `say`**) → ffmpeg. Useful as prior art for the markdown-as-script path; stale (≈11 months). |
| **MatrixReligio/ProductVideoCreator** | 41 | **none** | 2026-06-22 | Right stack (Remotion + Playwright + **edge-tts**) and a good idea we did not take — voiceover **validation**: detect duration/overlap/gap problems between narration and action. But with no licence it is all rights reserved and cannot be reused. |
| **profullstack/makedemo** | 5 | **none** | 2026-08-03 | An LLM decides the interactions, so runs are not reproducible, and narration is paid ElevenLabs. Wrong model for a tutorial that must re-render identically. No licence. |
| **outscal/video-generator** | 65 | **none** | 2026-04-21 | Described only as "Generates video using ai". Unusable. |
| ~~**itsjwill/vanta**~~ | 114 | NOASSERTION | 2026-07-26 | **The brief misdescribes this one.** It is a generative *AI-video* engine — voice cloning, AI avatars, text-to-video (Wan 2.2 / LTX) — not a screen-recording compositor. Not applicable. |

**Licensing is the filter the brief ignored.** Four of the nine have no licence at all (all rights
reserved), and one is source-available-only. For this project only MIT / Apache-2.0 / GPL are
actually usable, which removes most of the list as *code* while leaving it usable as *reading*.

### On Remotion

If higher production value (chapter cards, lower thirds, motion graphics) ever matters, Remotion is
the engine underneath most of these projects and its [licence](https://www.remotion.dev/docs/license)
is workable: free for individuals, organisations of up to three employees, **and non-profits**;
a paid company licence applies only to larger for-profit organisations. The cost is a React/TSX
video codebase, which is a large architectural commitment — not worth making merely to escape a text
rendering problem that PNG overlays already solve.

## Still to try

**A time-boxed trial of `playwright-recast` only** — it is MIT, active, and has a no-code CLI:

```bash
npx playwright-recast -i trace.zip -o demo.mp4                       # trace → video, no narration
npx playwright-recast -i ./traces --srt narration.srt --burn-subs     # with our own subtitles
```

The interesting question is whether its **trace-derived** auto-zoom and subtitle burn-in beat our
hand-authored zoom targets. Playwright can emit a trace during our own recording run — we already
drive the same Playwright — and a trace gives the element bounding box for every action. If that
works, `SCRIPT.md`'s 🔍/⭕ markers become *selectors* and the fx layer's zoom windows are computed
rather than written down, which is exactly what the unwired fx layer needs. Either way the narration
stays ours (`--provider none`), so the trial costs nothing but time.

An honest limitation: none of these tools has been *run* against WikiBento. The assessments above are
based on verified metadata, source and documentation, not on measured output — which is why exactly
one trial is proposed rather than a shortlist.
