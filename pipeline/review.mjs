/**
 * Build the review bundle: the three artifacts a human needs to check a take without hunting for
 * anything. Run it after `tutorial:build`.
 *
 *   <name>.mp4                  the finished take, with picture and sound
 *   <name>-narration.m4a       the same audio alone — a few minutes to listen to while walking
 *   <name>-transcript.txt      every beat with its position in the VIDEO, to follow along in either
 *
 * The timings in the transcript are video positions, not narration positions: the scene audio is muxed
 * 0.5s into each scene, so a reader watching the video and a reader listening to the audio land on the
 * same line. Generated rather than hand-kept, because a stale transcript is worse than none.
 *
 * **Every run writes a NEW, timestamped version and never overwrites an old one**, so takes can be
 * compared side by side (that is how "the move does not move" and a scene that had gone white were both
 * caught). A `-latest` symlink points at the newest of each, for convenience.
 *
 * Usage: node pipeline/review.mjs [--config video/demo.config.mjs] [--out DIR] [--dest ~/Movies] [--label v3]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, symlinkSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { resolveOut, arg, loadConfig, cfgPath } from './paths.mjs';

const cfg = await loadConfig(arg('config', null));
const OUT = resolveOut(arg('out', null), cfg);
const DEST = arg('dest', join(homedir(), 'Movies'));
const VIDEO = join(OUT, `${cfg.name}.mp4`);
if (!existsSync(VIDEO)) {
  console.error(`✘ no finished video at ${VIDEO}\n  run: node pipeline/build.mjs --config ${cfg.__path} --out ${OUT}`);
  process.exit(2);
}

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim());

const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const beatsDoc = JSON.parse(readFileSync(join(OUT, 'beats.json'), 'utf8'));
const plan = JSON.parse(readFileSync(cfgPath(cfg, cfg.plan), 'utf8'));
const titles = new Map(plan.scenes.map((s) => [s.id, s.title]));   // fallback only: beats.json owns them

let timing = null;
try { timing = JSON.parse(readFileSync(join(OUT, 'narration', 'timing.json'), 'utf8')); }
catch { /* no beat timing: the transcript falls back to scene headings only */ }

mkdirSync(DEST, { recursive: true });

// where each scene begins in the finished video (title card first, end card last)
const starts = new Map();
let t = dur(join(OUT, 'build', 'title-card.mp4'));
for (const scene of timeline.scenes) {
  starts.set(scene.id, t);
  const part = join(OUT, 'build', `${scene.id}.mp4`);
  if (existsSync(part)) t += dur(part);
}

// 1. the video + its subtitles
// a stamp per run: either --label v3 (a name you choose) or the local date and time
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const STAMP = arg('label', null) || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `-${pad(now.getHours())}${pad(now.getMinutes())}`;
const named = (what, ext) => join(DEST, `${cfg.name}${what ? `-${what}` : ''}-${STAMP}${ext}`);

const videoOut = named('', '.mp4');
copyFileSync(VIDEO, videoOut);
let srtOut = null;
if (existsSync(join(OUT, `${cfg.name}.srt`))) {
  srtOut = named('', '.srt');
  copyFileSync(join(OUT, `${cfg.name}.srt`), srtOut);
}

// 2. the narration alone, taken from the video's own audio track: it is already muxed correctly, so
//    there is no packet-level surgery on Ogg Opus boundaries (which glitches)
const audioOut = named('narration', '.m4a');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', VIDEO,
  '-vn', '-c:a', 'aac', '-b:a', '96k', audioOut], { stdio: ['ignore', 'pipe', 'pipe'] });

// 3. the transcript, on the video's clock
const lines = [
  cfg.transcriptTitle || `${cfg.name} — narration transcript`,
  '',
  `Timings are positions in the VIDEO (${cfg.name}.mp4), so the same line numbers work whether`,
  'you watch the take or listen to the audio alone. Text comes from SCRIPT.md via beats.mjs; the',
  'per-beat timings come from the measured voiceover (narration/timing.json).',
  '',
];
for (const scene of timeline.scenes) {
  const at = starts.get(scene.id) ?? 0;
  lines.push(`── ${String(scene.step ?? '').padStart(2, ' ')}. ${titles.get(scene.id) || scene.id}` +
    `   (${scene.id} · starts ${Math.floor(at / 60)}:${String(Math.round(at % 60)).padStart(2, '0')})`);
  const beats = timing?.scenes?.[scene.id]?.beats;
  if (beats) {
    for (const b of beats) {
      const s = at + 0.5 + b.start;                      // the scene audio is delayed 0.5s
      const mark = `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
      const onScreen = new Set([...(b.zoom || []), ...(b.ring || [])].filter((x) => x.selector).map((x) => x.selector));
      lines.push(`[${mark}]  ${String(b.n).padStart(2)}  ${b.text}${onScreen.size ? `   ⟨on screen: ${[...onScreen].join(', ')}⟩` : ''}`);
    }
  } else {
    const b = beatsDoc.scenes.find((s) => s.id === scene.id);
    for (const beat of b?.beats || []) lines.push(`         ${String(beat.n).padStart(2)}  ${beat.text}`);
  }
  lines.push('');
}
const textOut = named('transcript', '.txt');
writeFileSync(textOut, lines.join('\n'));

const beats = (timing ? Object.values(timing.scenes) : []).reduce((n, s) => n + s.beats.length, 0);
// a -latest symlink for each artifact, so the newest is always easy to open without hunting
for (const [suffix, target] of [['.mp4', videoOut], ['-narration.m4a', audioOut],
                              ['-transcript.txt', textOut], ...(srtOut ? [['.srt', srtOut]] : [])]) {
  const ext = suffix.match(/\.\w+$/)[0];
  const l = join(DEST, `${cfg.name}${suffix.replace(/\.\w+$/, '')}-latest${ext}`);
  rmSync(l, { force: true });
  try { symlinkSync(target, l); } catch { /* symlinks are a convenience, not a requirement */ }
}

console.log(`review bundle (version ${STAMP}) — nothing to hunt for:`);
console.log(`  watch      ${videoOut}   (${dur(videoOut).toFixed(0)}s, with picture)`);
if (srtOut) console.log(`  subtitles  ${srtOut}`);
console.log(`  listen     ${audioOut}   (${dur(audioOut).toFixed(0)}s, voice only)`);
console.log(`  follow     ${textOut}   (${beats} beats, timestamped to the video)`);

// list the versions so takes can be compared, newest first
const versions = readdirSync(DEST)
  .filter((f) => f.startsWith(`${cfg.name}-`) && f.endsWith('.mp4') && !f.includes('-latest'))
  .sort().reverse();
if (versions.length > 1) {
  console.log(`\n  other versions in ${DEST} (newest first):`);
  for (const v of versions) {
    const p = join(DEST, v);
    console.log(`    ${v}   ${dur(p).toFixed(0)}s${v === `${cfg.name}-${STAMP}.mp4` ? '   ← this run' : ''}`);
  }
}
