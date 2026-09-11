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
 * Seconds of blank page at the head of a clip.
 *
 * recordVideo starts when the browser context is created, so a clip always opens on the app's
 * unpainted white page — measured at ~1.0s on the 01-what take, which showed up in the assembled
 * video as a white flash at every scene boundary. Sample the clip down to 1x1 greyscale (1 byte per
 * frame) and find the first frame that is not white; trim with a filter rather than `-ss`, because
 * Playwright's streaming webm has no usable seek index.
 */
function detectLeadIn(clip, { threshold = 250, maxSeconds = 4 } = {}) {
  let raw;
  try {
    raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', clip,
      '-vf', `fps=${fps},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { maxBuffer: 64 * 1024 * 1024 });
  } catch { return 0; }
  const cap = Math.min(raw.length, fps * maxSeconds);
  let i = 0;
  while (i < cap && raw[i] >= threshold) i += 1;
  if (i >= raw.length) return 0;              // entirely white: not a lead-in we can trust
  return i / fps;
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
  const lead = detectLeadIn(clip);                  // blank page before the app paints
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
