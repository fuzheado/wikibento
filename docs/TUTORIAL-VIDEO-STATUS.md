# Tutorial video — pipeline status

**Status as of 2026-09-11.** What the pipeline is, what is verified working, what is still missing,
and how to check any of it. Written so the work can be resumed from this file alone.

**One-line verdict:** the whole chain — record → narrate → assemble — now runs on this macOS
machine and produces a finished narrated MP4. What remains is authoring (finalising `SCRIPT.md`),
wiring the fx layer, and one optional trial of an off-the-shelf tool.

Related: [`TUTORIAL.md`](TUTORIAL.md) (the written tutorial + *Re-making the video*),
[`TUTORIAL-VIDEO-TOOLING.md`](TUTORIAL-VIDEO-TOOLING.md) (the ecosystem research and what we grafted
from it), [`../scripts/tutorial-video/SCRIPT.md`](../scripts/tutorial-video/SCRIPT.md) (the shooting
script), HANDOFF § *Tutorial video*.

---

## The pipeline

| file | role | reads | writes |
|---|---|---|---|
| `scripts/tutorial-video/SCRIPT.md` | **The editable source of truth**: 8 steps + end card as beats, each with markers — 🗣 spoken line (voiceover **and** burnt-in caption) · 🖱 on-screen action · 🔍 zoom (target, magnification, hold, ease) · ⭕ highlight · 🔊 sound · 📝 caption. | — | (human edits) |
| `scenes.json` | The **recorder's** plan: `video {1920×1080 @ 25fps}` and 8 scenes (`01-what` … `08-reload`), each `{id, step, title, url, start, narration, captions}`. Also the narration source. | — | — |
| **`paths.mjs`** | Shared host-portability helpers: the output-directory rule and the Playwright ffmpeg-cache probe, used by every script. | argv, env | — |
| `record.mjs` | Drives the live app with playwright-core and records **one clip per scene** (`--only <id>` re-records one, merging into `timeline.json`). Preflights Playwright's own ffmpeg. | `scenes.json` | `clips/<id>.webm`, `timeline.json` |
| **`narration.mjs`** | Synthesizes each scene's voiceover. Providers: **edge-tts** (default), macOS `say`, `piper`. Content-hash cached, so unchanged lines are never re-synthesized. | `scenes.json` | `narration/<id>.ogg` (Ogg Opus), `narration/manifest.json` |
| `cards.mjs` | Renders `cards/title.png` and `cards/end.png` in a real browser. | (in-code HTML) | `cards/*.png` |
| **`overlays.mjs`** | Renders the step badge, URL card and every caption as **transparent full-canvas PNGs**, so the assembler needs no text support from ffmpeg. Drops caption PNGs left over from a longer earlier cut. | `timeline.json` | `overlays/*.png` |
| `build.mjs` | The assembler: measure each narration → trim the clip's blank lead-in → stretch/pad to the narration length → composite the overlays → mux narration → concatenate behind a title card and in front of an end card → also emit an `.srt`. | `timeline.json`, `clips/*`, `narration/*`, `cards/*`, `overlays/*` | `build/*`, `wikibento-tutorial.mp4`, `.srt` |
| `fx-proof.mjs` | **Proof only** of the fx layer: in-page CSS-transform zoom (text stays crisp), a red ring around a small element, typing with per-keystroke click sounds + a typed-text chip; records keystroke times to `events.json`. **Not yet wired into the pipeline.** | — | `events.json` |

npm scripts: `tutorial:record`, `tutorial:narrate`, `tutorial:build`.

## Running it

```bash
uv tool install edge-tts                       # one-time; or pip install edge-tts
npm run build                                  # the app, if the recorder is pointed at a local one
npm run tutorial:record                        # one clip per scene     → out/clips, out/timeline.json
npm run tutorial:narrate                       # edge-tts voiceover     → out/narration/<id>.ogg
npm run tutorial:build                          # assemble               → out/wikibento-tutorial.mp4
```

Add `--out <dir>` to any step (or set `WIKIBENTO_TUTORIAL_OUT`); with neither, the pipeline uses the
recording host's `/opt/data/staging/wikibento-tutorial` **if that directory exists**, otherwise a
temp directory. Each script prints the path it resolved. `--only <scene-id>` re-records or
re-narrates a single scene; `--provider say` switches the voiceover to macOS `say` with no install.

## Verified working on this machine

- **The full chain, end to end** — recorded `01-what`, synthesized its narration, assembled a
  **35.8s, 0.9 MB, 1920×1080@25** MP4 (4.5s title + 25.7s scene + 5.5s end card) with the badge, URL
  card, both captions and both cards visible in the right places at the right times, plus audio and
  a matching `.srt`.
- **The whole voiceover** — all 8 scenes synthesized with edge-tts to **176.1s** of narration,
  re-running with no network calls (cache hits) and no 429s at 1s spacing.
- **Text is rendered by the browser, not by ffmpeg.** The local ffmpeg has **no `drawtext` and no
  freetype at all**, and that no longer matters: `overlays.mjs` + `overlay` composites text without
  ffmpeg's text filters, and the Debian font paths are gone. This half of the pipeline no longer
  needs a font file or a text-enabled ffmpeg on any host.

Two bugs found and fixed while verifying, both visible in the output before:

- **The end card played second.** `build.mjs` pushed `title.mp4` *and* `end.mp4` before the scenes,
  then built a third, drawtext end card after them. Now the end card is appended once, last.
- **A white flash at every scene boundary.** `recordVideo` starts at browser-context creation, so
  each clip opened on the app's unpainted white page (measured: ~1.0s on `01-what`; frames sampled at
  255,255,255 from t=4.6s to t=5.4s of the assembled video). `build.mjs` now measures the blank
  lead-in and trims it with a filter — not `-ss`, because Playwright's streaming webm has no usable
  seek index. The handoff now goes straight from the title card to the dashboard.

## Host requirements

| need | why | on this machine |
|---|---|---|
| Node 20+ | everything | ✓ |
| Playwright's **own** ffmpeg build | `recordVideo` refuses the system binary | ✓ `ffmpeg-1011` in `~/Library/Caches/ms-playwright` |
| system `ffmpeg` + `ffprobe` | trim, scale, mux, concat, audio encode | ✓ `/opt/homebrew/bin` — **no font or text-filter support needed** |
| an Ogg audio encoder | narration container | ✓ `libopus` (Homebrew has **no `libvorbis`**; `narration.mjs` probes for libopus → libvorbis → native vorbis) |
| a TTS engine | narration | ✓ `edge-tts` 7.2.8 via `uv tool install`; `say` needs nothing |
| Playwright chromium | cards + overlays | ✓ `chromium-1217` |

## Still missing

1. **`SCRIPT.md` is not mechanically authoritative for `scenes.json`.** The narration and captions
   live in *both*, so editing the script does not change what is recorded or spoken, and nothing
   detects the divergence — `TUTORIAL.md` used to contradict itself about which file is
   authoritative. `narration.mjs` reads `scenes.json`, like the recorder, so at least voice and
   picture cannot drift *from each other*. Deriving or validating `scenes.json` from `SCRIPT.md` is
   the fix, and it is also where the 🔍/⭕/🔊 markers would become machine-readable.
2. **The fx layer is still a proof.** `fx-proof.mjs` and its `events.json` are wired into nothing, so
   the polish it demonstrates (zoom, ring, typing sounds) is in no take — matching `SCRIPT.md`'s own
   note that the published take does not yet honour 🔍/⭕/🔊, and that ⚠-marked beats have actions
   landing seconds after the words.
3. **The app's loading state is visible.** The blank-page flash is gone, but `Loading dashboard…` is
   still on screen for ~1.5s at the start of `01-what`; the recorder could wait for the board to
   paint before the scene proper begins.
4. **Where the published take lives is not recorded** — no link to the existing narrated video
   appears anywhere in the repo, so a re-make cannot compare against it.
5. **The narration has not been reviewed by a human.** The 8 synthesized lines are edge-tts reading
   `scenes.json` verbatim; pronunciation of "WikiBento" and the delivery rate are unverified.

## Suggested order

1. **Add the TTS step to `TUTORIAL.md`** — done in this pass; see *Re-making the video* there.
2. **Make `SCRIPT.md` authoritative** (missing 1) so the script drives the recording, narration and
   captions, and the ⚠ timing notes become fixable.
3. **Wait for a human listen** (missing 5) before committing to a voice or a rate.
4. **Wire the fx layer in** (missing 2) — and read the trace-based zoom idea in
   [`TUTORIAL-VIDEO-TOOLING.md`](TUTORIAL-VIDEO-TOOLING.md) first: if a Playwright trace can supply
   element bounding boxes, zoom windows become derived rather than hand-authored.
5. **Record the published take's URL** (missing 4).

## How to verify

```bash
export PATH="$HOME/.local/bin:$PATH"           # edge-tts from uv

# 1. recording (needs the app running/URL reachable); prints "clips → <dir>"
node scripts/tutorial-video/record.mjs --only 01-what --out /tmp/tut

# 2. narration (defaults to edge-tts; --provider say needs no install)
node scripts/tutorial-video/narration.mjs --only 01-what --out /tmp/tut
node scripts/tutorial-video/narration.mjs --only 01-what --out /tmp/tut   # 2nd run: "cached"

# 3. assemble — works with a partial timeline, so one scene is enough to prove the chain
node scripts/tutorial-video/build.mjs --out /tmp/tut

# 4. confirm there is no white flash at the title→scene handoff (expect ~2-3, not 255)
ffmpeg -hide_banner -loglevel error -ss 4.6 -i /tmp/tut/wikibento-tutorial.mp4 \
  -frames:v 1 -vf scale=1:1 -f rawvideo -pix_fmt rgb24 - | od -An -tu1

# 5. this machine's ffmpeg still has no text filters — and that is now fine
ffmpeg -hide_banner -filters | grep -c drawtext        # 0
```

Acceptance for the text layer: a full take assembles with **no `drawtext` in the filter graph** and
**no reference to `/usr/share/fonts`**, with captions legible at 1080p.
