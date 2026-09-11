/**
 * Assemble the tutorial video from the recorded clips + narration.
 *
 * For each scene: stretch the clip up to 1.5x so the on-screen action lasts as long as its
 * voiceover (freezing the last frame for any remainder), then burn in the step badge, an optional
 * URL card and the caption lines, mux the narration with a short lead-in, and finally concatenate
 * everything behind a title card and in front of an end card. Also emits a matching .srt.
 *
 * Usage: node scripts/tutorial-video/build.mjs [--out /opt/data/staging/wikibento-tutorial]
 * Inputs (produced by record.mjs + any TTS): out/timeline.json, out/clips/*.webm,
 * out/narration/<scene-id>.ogg
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const OUT = arg('out', '/opt/data/staging/wikibento-tutorial');
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const { width: W, height: H, fps } = plan.video;

const BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
const BG = '0x14161a';
const TXT = join(OUT, 'text');
const BUILD = join(OUT, 'build');
mkdirSync(TXT, { recursive: true });
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

const txt = (name, content) => {
  const p = join(TXT, name);
  writeFileSync(p, content);
  return p;
};
/** single-quote-safe drawtext text path (ffmpeg needs ':' and ',' escaped inside the filter graph) */
const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

let srtTime = 0;
const srt = [];
const NICE = (i, t) => `${String(i).padStart(2, '0')}:${t.slice(3, 6)}:${t.slice(6, 12).replace('.', ',')}`;
const srtStamp = (seconds) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};

const scenes = timeline.scenes;
console.log(`building ${scenes.length} scenes → ${BUILD}`);
const parts = [];

// ── title + end cards ───────────────────────────────────────────────────────
// Rendered as PNGs by cards.mjs (a real browser, real fonts). An earlier drawtext-only version
// failed silently: no title card appeared and the end card came out solid black.
mkdirSync(join(OUT, 'cards'), { recursive: true });
{
  const needed = ['title.png', 'end.png'].filter((f) => !existsSync(join(OUT, 'cards', f)));
  if (needed.length) {
    console.log(`rendering card PNGs (${needed.join(', ')})…`);
    try {
      execFileSync('node', [join(root, 'scripts/tutorial-video/cards.mjs'), OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch (e) {
      console.error('✘ card rendering failed:', String(e.message).slice(0, 200));
    }
  }
  const silent = '-f lavfi -i anullsrc=r=44100:cl=stereo';
  for (const [file, dur] of [['title.png', 4.5], ['end.png', 5.5]]) {
    const png = join(OUT, 'cards', file);
    if (!existsSync(png)) { console.error(`✘ missing card ${png}`); continue; }
    const out = join(BUILD, `${file.replace('.png', '')}.mp4`);
    ff(['-loop', '1', '-t', String(dur), '-i', png, ...silent.split(' '),
        '-vf', `scale=${W}:${H},format=yuv420p`,
        '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-r', String(fps), out], `card ${file}`);
    if (file === 'title.png') { parts.push(out); srtTime += dur; } else { parts.push(out); }
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
  const target = dNarr + 1.0;                       // a beat of silence at the end
  const stretch = Math.min(1.5, Math.max(1.0, target / dClip));
  const stretched = dClip * stretch;
  const pad = Math.max(0, target - stretched);

  const badge = txt(`${scene.id}-badge.txt`, `Step ${scene.step} · ${scene.title}`);
  const filters = [
    `setpts=PTS*${stretch.toFixed(4)}`,
    `fps=${fps}`,
    ...(pad > 0.05 ? [`tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}`] : []),
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG}`,
    `drawtext=fontfile=${BOLD}:textfile=${esc(badge)}:x=36:y=30:fontsize=38:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=16`,
  ];
  if (scene.url) {
    const u = txt(`${scene.id}-url.txt`, scene.url);
    filters.push(`drawtext=fontfile=${MONO}:textfile=${esc(u)}:x=36:y=${H - 208}:fontsize=27:fontcolor=0x8fc0ff:box=1:boxcolor=black@0.62:boxborderw=12:enable='between(t,1.0,${target.toFixed(2)})'`);
  }
  // captions: split the scene's length evenly across its lines, weighted by length
  const caps = scene.captions || [];
  const weights = caps.map((c) => c.length + 12);
  const wTotal = weights.reduce((s, x) => s + x, 0) || 1;
  let t0 = 0.8;
  caps.forEach((cap, i) => {
    const span = ((target - 1.0) * weights[i]) / wTotal;
    const file = txt(`${scene.id}-cap${i}.txt`, cap);
    filters.push(`drawtext=fontfile=${BOLD}:textfile=${esc(file)}:x=(w-text_w)/2:y=${H - 104}:fontsize=33:fontcolor=white:box=1:boxcolor=black@0.66:boxborderw=14:enable='between(t,${t0.toFixed(2)},${(t0 + span).toFixed(2)})'`);
    srt.push({ start: srtTime + t0, end: srtTime + t0 + span, text: cap });
    t0 += span;
  });

  const out = join(BUILD, `${scene.id}.mp4`);
  ff(['-i', clip, '-i', narration,
      '-filter_complex', `[0:v]${filters.join(',')}[v];[1:a]adelay=500|500,apad[a]`,
      '-map', '[v]', '-map', '[a]', '-t', target.toFixed(2),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', out], scene.id);
  console.log(`  ${scene.id}: clip ${dClip.toFixed(1)}s × ${stretch.toFixed(2)} + ${pad.toFixed(1)}s pad → ${target.toFixed(1)}s (narration ${dNarr.toFixed(1)}s)`);
  parts.push(out);
  srtTime += target;
}

// ── end card ─────────────────────────────────────────────────────────────────
{
  const out = join(BUILD, '99-end.mp4');
  const a = txt('end-a.txt', 'Start a board of your own');
  const b = txt('end-b.txt', 'wikibento.toolforge.org   ·   ?config=<your wiki page>');
  const c = txt('end-c.txt', 'Written guide: docs/TUTORIAL.md   ·   Ask box: describe what you want');
  ff(['-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:d=5.5:r=${fps}`,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-vf', [
        `drawtext=fontfile=${BOLD}:textfile=${esc(a)}:x=(w-text_w)/2:y=(h/2)-80:fontsize=64:fontcolor=white`,
        `drawtext=fontfile=${REG}:textfile=${esc(b)}:x=(w-text_w)/2:y=(h/2)+30:fontsize=36:fontcolor=0x8fc0ff`,
        `drawtext=fontfile=${REG}:textfile=${esc(c)}:x=(w-text_w)/2:y=(h/2)+110:fontsize=28:fontcolor=0xb9c2cf`,
      ].join(','), '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-r', String(fps), out], 'end card');
  parts.push(out);
}

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
