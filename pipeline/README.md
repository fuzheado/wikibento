# pipeline — narrated demo videos from a live web app

The engine behind the WikiBento tutorial. It knows about **beats, voiceover, highlights, overlays, encoding
and review bundles**; it knows nothing about WikiBento — no URLs, no selectors, no words. Everything about
the app being demonstrated lives in a project config (`video/demo.config.mjs` here), so the same engine can
make a video for another app by writing a new config, a new script and a new actions module.

The ideas, the traps that cost time, and the order to wire things up in are written up as a skill:
`~/.pi/agent/skills/narrated-tutorial-video/SKILL.md`. Read that first; this file is the contract.

## Shape

```
SCRIPT.md ──parse──▶ beats.json ──tts──▶ per-beat .ogg + timing.json (offsets)
   │ the words, captions, fx markers            │
   └────────────▶ record.mjs ──▶ clips/*.webm + timeline.json (actions timed to beats)
                                              └──▶ build.mjs ──▶ <name>.mp4 + .srt
```

| file | role |
|---|---|
| `beats.mjs` | parses the project's script into beats (words, captions, `🔍`/`⭕`/`🔊`/`📝` markers); `--check` validates |
| `narration.mjs` | one TTS clip per beat, content-hash cached; writes the beat timeline the recorder times itself from |
| `record.mjs` | drives the app with Playwright, one clip per scene, actions and fx timed to beats; runs the project's `startState` and `steps` |
| `overlays.mjs` | renders captions, the step badge and the note line as transparent full-canvas PNGs in a browser (validated for transparency, cached by content hash) |
| `cards.mjs` | renders the project's title/closing cards in a browser |
| `build.mjs` | trims each clip's measured lead-in, stretches to its narration, composites overlays, muxes, concatenates — **per-chapter cached** |
| `review.mjs` | writes a timestamped review bundle: the take, its audio alone, and a transcript on the video's clock |
| `primitives.mjs` | mouse/typing/selector helpers and the beat clock, shared by the engine and the project's actions |
| `paths.mjs` | config loading, the output-directory rule, the Playwright ffmpeg-cache probe |

All scripts take `--config <path>` (default `video/demo.config.mjs`), `--out <dir>`, and most take
`--only <scene-id>`.

## The project config

```js
// video/demo.config.mjs
import * as app from './actions.mjs';

export default {
  name: 'myapp-tutorial',          // output dir + review-bundle filenames
  transcriptTitle: 'MyApp — narration transcript',
  base: 'https://myapp.example',    // the app under demo (your actions receive it)
  script: 'video/SCRIPT.md',        // the shooting script
  plan: 'video/scenes.json',        // per-scene setup the script does not carry: start, note, step, title
  video: { width: 1920, height: 1080, fps: 25 },
  tts: { provider: 'edge', voice: 'en-US-AvaNeural' },
  actions: app,                     // must export { startState, steps }, optionally configure(ctx)
  cards: [ { id: 'title', file: 'title.png', html: `…` }, { id: 'end', file: 'end.png', html: `…` } ],
  titleCardScene: '00-title',       // the script scene whose line is spoken over the title card
};
```

`actions.mjs` is the app half:

```js
export const context = { out: null, base: null };       // filled in by the engine
export function configure(ctx) { Object.assign(context, ctx); }

/** how a scene's starting state is established (navigate, and/or set the app up) */
export async function startState(page, spec) { … }      // spec comes from scenes.json, e.g. 'home', 'config:/board.json'

/** what each scene does on screen. A step names the beat whose words describe it. */
export const steps = {
  '01-what': [
    { beat: 2, label: 'the chart, the table, the gallery', run: async (page, b) => { … } },
  ],
};
```

Primitives (`glide`, `clickHuman`, `typeHuman`, `fxBox`, `at`, `spread`, `settle`, …) come from
`../pipeline/primitives.mjs`, so both halves share one implementation.

## The script format

```
## 1. What the app is

`scene 01-what` · starts from: home · target ~30s

1. 🗣 "Every box here is a widget."
   🖱 pointer drifts across the board
2. 🗣 "A widget shows one thing. Here: a pageview chart, a table of assessments, a gallery of images."
   🔍 1.2× @ [data-item-id="chart"] — a gentle push on the chart
   ⭕ @ [data-item-id="table"] — as the table is named
   📝 an optional caption override for this beat
```

- 🗣 the spoken line, and its caption unless 📝 overrides it; 🖱 what happens; 🔍/⭕/🔊 effects.
- A marker is **machine-readable when it names its target**: `🔍 1.2× @ <css>`, `⭕ @ <css>`. Everything after
  the em dash is prose for the human. `beats.mjs` counts how many markers are still prose.
- A section whose metadata has **no** `starts from:` is a card (the title/closing screen), not a recorded
  scene — that is how the opening line gets spoken over the title card.

## Rules the engine enforces or assumes

- **Every noun spoken must be on screen when it is said**, and highlighted as it is named. Put the highlight
  target in the marker; a test in the *project* should assert the targets exist on the board the scene starts
  from and that the narration names them.
- **Address things by name, not by position** (`[data-item-id="views"]`, not `:nth-child(3)`) — a position
  silently follows whatever happens to be third.
- **A zoom never runs while something is moving** (a CSS transform on the app root moves the target under the
  pointer and a drag silently fails to take), and an oversized target is anchored to its **top-left**, never
  centred — a document is read from its corner.
- **Every stream in the ffmpeg graph is finite** (clone+`trim=end`, `apad,atrim=end`, explicit `-t` on image
  inputs, no output `-t`). `-t` plus endless `-loop 1` inputs deadlocks ffmpeg's shutdown about half the time.
- **Never cache a bad artifact**: overlay PNGs are validated for transparency (an opaque one whites out a
  whole scene), and captions are cached by content hash — a wrong render or a stale caption must not become
  permanent.
- **Deploy the app's copy before recording the scene that shows it.**

## Cost of an edit

`build/manifest.json` keys each scene's encoded part by everything that shaped it (clip, narration, caption
text, note, overlay PNGs, timing maths), so a rebuild costs what actually changed. On the 8-scene WikiBento
video: nothing changed ≈ 6s (all parts reused); one caption edited ≈ 18s; a full rebuild ≈ 70–90s.

| you changed | re-run |
|---|---|
| a caption, a note, the badge | `build` only |
| spoken words | `narrate` + `build` (**no re-recording** — the clip stretches to the new narration) |
| an action, a selector, fx | `record --only <id>` + `build` |
| the app's copy or UI | deploy, then re-record the scenes that show it |
