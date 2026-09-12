# Tutorial video — tooling research

**2026-09-11.** What already exists for turning a scripted browser walkthrough into a narrated
tutorial video, what is worth taking, and what is not. Companion to
[`TUTORIAL-VIDEO-STATUS.md`](TUTORIAL-VIDEO-STATUS.md), which describes *our* pipeline and its
current state; this file is about the ecosystem we could borrow from.

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
