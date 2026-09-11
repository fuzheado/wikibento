/**
 * Assemble the tutorial video from the recorded clips + narration.
 *
 * For each scene: stretch the clip up to 1.5x so the on-screen action lasts as long as its
 * voiceover (freezing the last frame for any remainder), composite the step badge, the URL card and
 * the caption lines, mux the narration with a short lead-in, and concatenate everything behind a
 * title card and in front of an end card. Also emits a matching .srt.
 *
 * All text — badge, URL, captions, title card, end card — is rendered by a real browser into PNGs
 * (`cards.mjs`, `overlays.mjs`) and composited here with the `overlay` filter. An earlier version
 * drew it with ffmpeg `drawtext`, which cannot work on a machine whose ffmpeg lacks freetype (the
 * Homebrew build has no text filters at all) and pointed at Debian-only font paths besides. Using
 * `overlay` means this half of the pipeline needs no text support from ffmpeg whatsoever.
 *
 * Two different ffmpegs, deliberately: recording uses Playwright's own build (record.mjs); this
 * assembling step uses the system `ffmpeg`/`ffprobe` for trimming, scaling, muxing and concatenation.
 *
 * Usage: node scripts/tutorial-video/build.mjs [--out /opt/data/staging/wikibento-tutorial]
 * Inputs (produced by record.mjs + narration.mjs): out/timeline.json, out/clips/*.webm,
 *                                                  out/narration/<scene-id>.ogg
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveOut, arg } from './paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolveOut(arg('out', null));
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const { width: W, height: H, fps } = plan.video;

const BG = '0x14161a';
const BUILD = join(OUT, 'build');
mkdirSync(BUILD, { recursive: true });

const ff = (args, label) => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error(`✘ ${label} failed:`, String(e.stderr || e.message).slice(0, 400));
    throw e;
  }
};
const probe = (file, entries = 'format=duration') => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', file],
  { encoding: 'utf8' }).trim());

const srtStamp = (seconds) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};

/**
 * Sample a clip down to one small greyscale frame per video frame.
 *
 * 32x18 rather than 1x1 on purpose: a single averaged pixel cannot tell an *unpainted* white page
 * from a white page that has content on it. Chromium renders raw JSON on a white background (which
 * is exactly what scene `07-store` shows — a Commons page holding the board's JSON), and averaging
 * that to one pixel reads as "white", so an earlier version of this trimmed 12.6s of legitimate
 * JSON-page footage and then warned that the take was 63% blank. Keeping a coarse grid means a
 * single dark glyph anywhere in the frame makes it non-blank.
 */
function sampleClip(clip) {
  try {
    return execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', clip,
      '-vf', `fps=${fps},scale=32:18`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { maxBuffer: 64 * 1024 * 1024 });
  } catch { return Buffer.alloc(0); }
}

const PX = 32 * 18;   // bytes per sampled frame

/** A frame is blank only if EVERY sample is white — no text, no UI, nothing drawn. */
function isBlankFrame(buf, i, threshold = 250) {
  const end = i * PX + PX;
  for (let k = i * PX; k < end; k += 1) if (buf[k] < threshold) return false;
  return true;
}

/**
 * Frames of unpainted page at the head of a clip.
 *
 * recordVideo starts when the browser context is created, so a clip opens on the app's unpainted
 * page before it renders — about 1.0s on most of these scenes, and much longer when the scene
 * navigates to a wiki page. Left in, that is a white flash at every scene boundary. The cap is a
 * fraction of the clip rather than a fixed number of seconds, since a long head is real even though
 * a head covering the whole clip is not.
 */
function leadInFrames(buf, { maxFraction = 0.8 } = {}) {
  const frames = Math.floor(buf.length / PX);
  if (!frames) return 0;
  const cap = Math.floor(frames * maxFraction);
  let i = 0;
  while (i < cap && isBlankFrame(buf, i)) i += 1;
  return i >= frames ? 0 : i;                // entirely blank: not a lead-in we can trust
}

/**
 * What fraction of the clip is an unpainted page, anywhere. A take that is mostly blank is a broken
 * recording — a page that never rendered, an action that never fired — and the assembler should say
 * so rather than stretch the blank across a scene.
 */
function blankFraction(buf) {
  const frames = Math.floor(buf.length / PX);
  if (!frames) return 0;
  let n = 0;
  for (let i = 0; i < frames; i += 1) if (isBlankFrame(buf, i)) n += 1;
  return n / frames;
}

const scenes = timeline.scenes;
console.log(`building ${scenes.length} scenes → ${BUILD}`);
const parts = [];

// ── browser-rendered static cards ────────────────────────────────────────────
// A silent mp4 from a PNG, at the video's own resolution and framerate.
const cardPart = (png, dur) => {
  const out = join(BUILD, `${png.replace('.png', '')}-card.mp4`);
  ff(['-loop', '1', '-t', String(dur), '-i', join(OUT, 'cards', png),
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', `scale=${W}:${H},format=yuv420p`,
      '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-r', String(fps), out], `card ${png}`);
  return out;
};

mkdirSync(join(OUT, 'cards'), { recursive: true });
let srtTime = 0;
const srt = [];
const TITLE_DUR = 4.5, END_DUR = 5.5;
const missingCards = ['title.png', 'end.png'].filter((f) => !existsSync(join(OUT, 'cards', f)));
if (missingCards.length) {
  console.log(`rendering card PNGs (${missingCards.join(', ')})…`);
  execFileSync('node', [join(root, 'scripts/tutorial-video/cards.mjs'), OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
}
if (existsSync(join(OUT, 'cards', 'title.png'))) { parts.push(cardPart('title.png', TITLE_DUR)); srtTime += TITLE_DUR; }
else console.error('✘ missing cards/title.png');
// the end card is appended AFTER the scenes — it used to be pushed here alongside the title, which
// put a closing card immediately after the opening one; the drawtext end card that followed it has
// been dropped in favour of this single browser-rendered one.
const endCard = existsSync(join(OUT, 'cards', 'end.png')) ? cardPart('end.png', END_DUR)
  : (console.error('✘ missing cards/end.png'), null);

/** takes that assembled, but look wrong — reported at the end so a broken clip cannot ship unnoticed */
const suspects = [];

// ── browser-rendered per-scene overlays (badge / url / captions) ─────────────
const OVL = join(OUT, 'overlays');
const ov = (name) => join(OVL, name);
{
  const wanted = [];
  for (const s of scenes) {
    wanted.push(`${s.id}-badge.png`);
    if (s.url) wanted.push(`${s.id}-url.png`);
    (s.captions || []).forEach((_, i) => wanted.push(`${s.id}-cap${i}.png`));
  }
  if (wanted.some((f) => !existsSync(ov(f)))) {
    console.log('rendering overlay PNGs…');
    execFileSync('node', [join(root, 'scripts/tutorial-video/overlays.mjs'), '--out', OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
}

// ── scenes ───────────────────────────────────────────────────────────────────
for (const scene of scenes) {
  const clip = scene.clip;
  const narration = join(OUT, 'narration', `${scene.id}.ogg`);
  if (!existsSync(clip)) { console.error(`✘ missing clip for ${scene.id}`); continue; }
  if (!existsSync(narration)) { console.error(`✘ missing narration for ${scene.id}`); continue; }
  const dClip = probe(clip);
  const dNarr = probe(narration);
  const buf = sampleClip(clip);
  const lead = leadInFrames(buf) / fps;             // blank page before the app paints
  const blank = blankFraction(buf);
  const dEff = Math.max(0.5, dClip - lead);
  const target = dNarr + 1.0;                       // a beat of silence at the end
  const stretch = Math.min(1.5, Math.max(1.0, target / dEff));
  const stretched = dEff * stretch;
  const pad = Math.max(0, target - stretched);

  const inputs = ['-i', clip, '-i', narration];
  const head = lead > 0.05
    ? `[0:v]trim=start=${lead.toFixed(2)},setpts=(PTS-STARTPTS)*${stretch.toFixed(4)}`
    : `[0:v]setpts=PTS*${stretch.toFixed(4)}`;
  const filters = [[
    head,
    `fps=${fps}`,
    ...(pad > 0.05 ? [`tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`] : []),
    `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG}`,
  ].join(',') + '[base]'];
  let last = 'base';
  let idx = 2;
  const overlay = (png, window) => {
    inputs.push('-loop', '1', '-i', png);
    const tag = `o${idx}`;
    const enable = window ? `:enable='between(t,${window[0].toFixed(2)},${window[1].toFixed(2)})'` : '';
    filters.push(`[${last}][${idx}:v]overlay=0:0:eof_action=repeat${enable}[${tag}]`);
    last = tag;
    idx += 1;
  };

  overlay(ov(`${scene.id}-badge.png`));                                  // whole scene
  if (scene.url) overlay(ov(`${scene.id}-url.png`), [1.0, target]);      // once the page has settled

  // captions: split the scene's length evenly across its lines, weighted by length
  const caps = scene.captions || [];
  const weights = caps.map((c) => c.length + 12);
  const wTotal = weights.reduce((s, x) => s + x, 0) || 1;
  let t0 = 0.8;
  caps.forEach((cap, i) => {
    const span = ((target - 1.0) * weights[i]) / wTotal;
    if (existsSync(ov(`${scene.id}-cap${i}.png`))) overlay(ov(`${scene.id}-cap${i}.png`), [t0, t0 + span]);
    else console.error(`✘ missing overlay ${scene.id}-cap${i}.png`);
    srt.push({ start: srtTime + t0, end: srtTime + t0 + span, text: cap });
    t0 += span;
  });

  filters.push('[1:a]adelay=500|500,apad[a]');
  const out = join(BUILD, `${scene.id}.mp4`);
  ff([...inputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${last}]`, '-map', '[a]', '-t', target.toFixed(2),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', out], scene.id);
  console.log(`  ${scene.id}: clip ${dClip.toFixed(1)}s${lead > 0.05 ? ` − ${lead.toFixed(1)}s blank` : ''} × ${stretch.toFixed(2)} + ${pad.toFixed(1)}s pad → ${target.toFixed(1)}s (narration ${dNarr.toFixed(1)}s)`);
  if (blank > 0.25) {
    suspects.push(`${scene.id} (${(blank * 100).toFixed(0)}% blank)`);
    console.warn(`  ⚠ ${scene.id}: ${(blank * 100).toFixed(0)}% of this clip is a blank page — the take looks broken.` +
      ` Re-record it:  node scripts/tutorial-video/record.mjs --only ${scene.id} --out ${OUT}`);
  }
  if (pad > 8) {
    suspects.push(`${scene.id} (${pad.toFixed(1)}s freeze)`);
    console.warn(`  ⚠ ${scene.id}: narration runs ${pad.toFixed(1)}s longer than the usable footage — the last frame freezes for that long.`);
  }
  parts.push(out);
  srtTime += target;
}
if (endCard) parts.push(endCard);

// ── concatenate ──────────────────────────────────────────────────────────────
const listFile = join(BUILD, 'concat.txt');
writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n'));
const final = join(OUT, 'wikibento-tutorial.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final], 'concat');
writeFileSync(join(OUT, 'wikibento-tutorial.srt'),
  srt.map((l, i) => `${i + 1}\n${srtStamp(l.start)} --> ${srtStamp(l.end)}\n${l.text}\n`).join('\n'));

console.log(`\n✔ ${final}`);
console.log(`  duration ${probe(final).toFixed(1)}s · ${(statSync(final).size / 1048576).toFixed(1)} MB · ${W}x${H}@${fps}`);
console.log(`  captions: ${join(OUT, 'wikibento-tutorial.srt')}`);
if (suspects.length) {
  console.warn(`\n⚠ ${suspects.length} clip(s) assembled but look wrong: ${suspects.join(', ')}`);
  console.warn(`  The video is complete; re-record those scenes and rebuild before publishing.\n`);
}
