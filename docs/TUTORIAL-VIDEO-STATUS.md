# Tutorial video — pipeline status

**Status as of 2026-09-11.** What the video pipeline is, what is verified working, what blocks
it, and the order to fix it in. Written so the work can be resumed from this file alone.

**One-line verdict:** the *recording* half runs on this machine (verified end to end); the
*assembling* half cannot run here as written, and there is no narration yet.

Related: [`TUTORIAL.md`](TUTORIAL.md) (the written tutorial + *Re-making the video*),
[`../scripts/tutorial-video/SCRIPT.md`](../scripts/tutorial-video/SCRIPT.md) (the shooting
script), HANDOFF § *Tutorial video*.

---

## The pipeline

| file | role | reads | writes |
|---|---|---|---|
| `scripts/tutorial-video/SCRIPT.md` | **The editable source of truth**: 8 steps + end card as beats, each with markers — 🗣 spoken line (voiceover **and** burnt-in caption) · 🖱 on-screen action · 🔍 zoom (target, magnification, hold, ease) · ⭕ highlight (red ring / arrow / dim-the-rest) · 🔊 sound effect · 📝 caption when it is not simply the spoken line. Rules it asks the pipeline to enforce: a zoom never starts while something is moving; a drag is never interrupted; every action finishes before its beat ends. | — | (human edits) |
| `scenes.json` | The **recorder's** plan: `video {1920×1080 @ 25fps}`, and 8 scenes (`01-what`, `02-read`, `03-reset`, `04-add`, `05-move`, `06-export`, `07-store`, `08-reload`), each `{id, step, title, url, start, narration, captions}`. | — | — |
| `record.mjs` | Drives the **live app** with playwright-core and records **one clip per scene** (`--only <id>` re-records a single scene); merges into `timeline.json` so a re-record does not discard the other scenes' durations. | `scenes.json` | `clips/<id>.webm`, `timeline.json` |
| `cards.mjs` | Renders `cards/title.png` and `cards/end.png` in a **real browser** (playwright-core) — deliberately, because an earlier drawtext-only version looked worse. | (in-code card HTML) | `cards/*.png` |
| `build.mjs` | The assembler: probe each narration's length → stretch/pad the clip to it → draw the scene badge, URL overlay and caption lines → mux narration → concatenate → `wikibento-tutorial.mp4`. Invokes `cards.mjs` for the PNG cards. | `timeline.json`, `clips/*`, `narration/<id>.ogg` | `text/*`, `build/*`, `cards/*`, `wikibento-tutorial.mp4` |
| `fx-proof.mjs` | **Proof only** of the fx layer: in-page CSS-transform zoom (keeps text crisp instead of upscaling pixels in ffmpeg), a red ring on a small element, typing with per-keystroke click sounds + a large typed-text chip; records keystroke times to `events.json` so the assembler can lay the click track. | — | `events.json` |

npm scripts: `tutorial:record` → `record.mjs`, `tutorial:build` → `build.mjs`.

The intended flow:

```bash
npm run build && node scripts/tutorial-video/record.mjs    # one clip per scene
# narration: TTS each string → <out>/narration/<scene-id>.ogg   (see "no TTS step" below)
node scripts/tutorial-video/build.mjs                      # stretch, caption, mux, concat
```

## Verified working on this machine (macOS arm64)

- **`record.mjs` end to end** — recorded scene `01-what` to a real **623 KB / 18.7 s** `.webm` and
  wrote `timeline.json`. This is after two fixes made on 2026-09-11: its ffmpeg preflight now
  resolves Playwright's cache from `PLAYWRIGHT_BROWSERS_PATH` **or the platform default**, and its
  output default is no longer a Linux-only `/opt/data/staging` path.
- **`cards.mjs`** already drives `playwright-core` (no global CLI), so it works anywhere the repo's
  devDependency does.
- **Playwright engines** present: `chromium-1217`, `firefox-1511`, `webkit-2272` (repo devDep
  playwright-core 1.59.1), plus `ffmpeg-1011` for recording.
- **System `ffmpeg` 9.0.1 + `ffprobe`** on `PATH` (`/opt/homebrew/bin`) for probing, scaling,
  audio muxing and concatenation — the *non-text* half of the assembler.

## Blockers

### 1. This machine's ffmpeg cannot draw text at all — the assembler cannot run here

`ffmpeg -filters | grep -c drawtext` → **0**; there is no `drawtext`, `subtitles` or `ass` filter,
and the build configuration has **no `--enable-libfreetype` / `--enable-libharfbuzz`**
(`/opt/homebrew/Cellar/ffmpeg/9.0.1_1`). `build.mjs` uses **8 `drawtext` call-sites** — the scene
badge, the URL overlay, the per-scene caption line, and a 3-line end card — so every caption path
fails.

*Fix (recommended):* stop using ffmpeg for text. Render the badge, URL card, captions and end card
as PNGs in the browser — the pattern `cards.mjs` already proves — and composite them with ffmpeg's
`overlay` (which needs no freetype). That removes this blocker **and** the font-path blocker below,
and gives real browser typography on any host.

*Alternative:* use an ffmpeg built with freetype (`brew reinstall ffmpeg` may or may not include
it — verify with `ffmpeg -filters | grep drawtext` before trusting it).

### 2. The font paths are Debian-only

`build.mjs` hardcodes `/usr/share/fonts/truetype/dejavu/{DejaVuSans-Bold,DejaVuSans,DejaVuSansMono}.ttf`.
All three are **MISSING** on macOS (`/usr/share/fonts` does not exist). Even with a
freetype-enabled ffmpeg, `drawtext` would fail to find its font. (Solved for free by blocker 1's fix.)

### 3. Three files still assume the Linux recording host

`build.mjs` and `cards.mjs` default `--out` to `/opt/data/staging/wikibento-tutorial`, and
**`fx-proof.mjs` hardcodes `/opt/data/staging/fx-proof` with no override at all** — on macOS the
`mkdirSync(…, { recursive: true })` cannot create `/opt/data`, so both fail immediately.
`record.mjs` was already fixed (`--out` → `WIKIBENTO_TUTORIAL_OUT` → the staging path *if it exists*
→ temp dir). Apply the same resolution to the other three.

### 4. There is no narration — and no step that produces it

No `.ogg` anywhere in the repo, and `build.mjs` **skips** any scene whose narration is missing
(`✘ missing narration for <id>`), so it is a no-op until voiceover exists. `TUTORIAL.md` lists it as
*"narration: TTS each string in scenes.json"* — i.e. a **manual, external** step; nothing in the
repo chooses or invokes a TTS engine. This is the last piece, and it depends on `SCRIPT.md` being
final (it is still marked *"draft for your edits"*).

### 5. `SCRIPT.md` and `scenes.json` duplicate the narration with no sync check

`TUTORIAL.md` says the narration lives in `SCRIPT.md` and to *"edit the words there, not in
`scenes.json`"* — yet the recorder reads `narration` from `scenes.json`, and the same document two
paragraphs later says `scenes.json` "holds the narration". So editing the script does **not** change
what is recorded or spoken, and nothing detects the divergence.

### 6. The fx layer is a proof wired into nothing

`fx-proof.mjs` and its `events.json` are referenced by neither `record.mjs` nor `build.mjs`. The
polish it demonstrates (zoom, ring, typing sounds) is not part of any take — matching `SCRIPT.md`'s
own note that *"the current published take does not yet honour 🔍/⭕/🔊"*, and that the beats marked
⚠ are where the action lands several seconds after the words.

### 7. Where the published take lives is not recorded

`TUTORIAL.md` states there *is* a narrated video, but no link to it appears anywhere in the repo, so
a re-make cannot compare against the current version.

## Suggested order

1. **Remove the drawtext dependency** (blocker 1 + 2): render badge/URL/captions/end card as
   browser PNGs, composite with `overlay`. Biggest win — it makes assembly possible on *any* host
   and improves the typography. *(M)*
2. **Fix the three remaining Linux-only path defaults** (blocker 3), matching `record.mjs`. *(S)*
3. **Make `SCRIPT.md` mechanically authoritative** (blocker 5): generate or validate `scenes.json`
   from it, so "the source of truth" is true rather than aspirational — and so 🔍/⭕/🔊 markers have
   somewhere to land. *(S–M)*
4. **Add the TTS narration step** (blocker 4) so the pipeline runs end to end locally. *(S)*
5. **Wire the fx layer in** (blocker 6): `events.json` → click track; 🔍/⭕ markers → zoom/ring. *(M)*

Also worth doing: record the published take's URL in `TUTORIAL.md` (blocker 7).

## How to verify a fix

```bash
# recording half (should print  clips → <dir>  and write clips/<id>.webm + timeline.json)
node scripts/tutorial-video/record.mjs --only 01-what --out /tmp/tut-test

# text rendering in the local ffmpeg (0 = the blocker is real; ≥1 = drawtext available)
ffmpeg -hide_banner -filters | grep -c drawtext

# assembler, once narration exists: <out>/narration/<id>.ogg must exist for every scene
node scripts/tutorial-video/build.mjs --out /tmp/tut-test
```

Acceptance for step 1: `build.mjs` assembles a full take on this Mac **without** any `drawtext`
filter and **without** touching `/usr/share/fonts`, with the captions legible at 1080p.
