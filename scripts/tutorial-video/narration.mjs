/**
 * Synthesize the voiceover, one clip PER BEAT, and measure it so the rest of the pipeline knows when
 * every beat happens.
 *
 * Why per beat rather than per scene: the video's oldest defect is that actions land several seconds
 * away from the words describing them. A single audio clip per scene can only be stretched to fit, so
 * nothing can be timed against it — `SCRIPT.md` marks eight beats with "⚠ the action lands after the
 * words" for exactly this reason. One clip per beat gives every beat a measured offset, which the
 * recorder uses to time its actions and the assembler uses to place captions and fx.
 *
 * Beats come from `SCRIPT.md` (via beats.mjs), so editing the script changes the voiceover.
 *
 * Outputs, under <out>/narration/:
 *   <scene>-b<n>.ogg    one clip per beat (content-hash cached — an untouched line is never re-sent)
 *   <scene>.ogg         the scene's track: its beats in order, separated by GAP seconds of silence
 *   timing.json         { scenes: { <id>: { total, beats: [{ n, text, caption, start, end }] } } }
 *
 * Providers: edge (default; free, no API key), say (macOS, zero install), piper (offline).
 *
 * Usage: node scripts/tutorial-video/narration.mjs [--only 03-reset] [--out DIR]
 *        [--provider edge|say|piper] [--voice NAME] [--rate -10%] [--force]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolveOut, arg } from './paths.mjs';
import { parseScript, captionsOf } from './beats.mjs';

/** silence between beats — long enough to breathe, short enough not to sag */
const GAP = 0.35;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = join(root, 'scripts/tutorial-video/SCRIPT.md');
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));
const { scenes, warnings } = parseScript(readFileSync(scriptPath, 'utf8'),
  { knownSceneIds: plan.scenes.map((s) => s.id) });
for (const w of warnings) console.error(`  ⚠ ${w}`);

const OUT = resolveOut(arg('out', null));
const ONLY = arg('only', null);
const PROVIDER = arg('provider', process.env.WIKIBENTO_TTS_PROVIDER || 'edge');
const FORCE = process.argv.includes('--force');
const NARR = join(OUT, 'narration');
const MANIFEST = join(NARR, 'manifest.json');
const TIMING = join(NARR, 'timing.json');

const PROVIDERS = {
  edge:  { bin: 'edge-tts', voice: 'en-US-AvaNeural' },
  say:   { bin: 'say',      voice: 'Samantha' },
  piper: { bin: 'piper',    voice: 'en_US-amy-medium' },
};
const P = PROVIDERS[PROVIDER];
if (!P) {
  console.error(`✘ unknown --provider "${PROVIDER}" — use one of: ${Object.keys(PROVIDERS).join(', ')}`);
  process.exit(2);
}
const VOICE = arg('voice', P.voice);
const RATE = arg('rate', null);

const onPath = (cmd) => {
  try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; }
};
if (!onPath(P.bin)) {
  const fix = {
    edge: 'uv tool install edge-tts      (or: pip install edge-tts — then ensure ~/.local/bin is on PATH)',
    say: 'macOS only. On Linux use --provider edge.',
    piper: 'pip install piper-tts        (then download a voice, e.g. en_US-amy-medium)',
  }[PROVIDER];
  console.error(
    `✘ TTS provider "${PROVIDER}" needs \`${P.bin}\`, which is not on PATH.\n` +
    `  Install it with:  ${fix}\n` +
    `  Or pick another:  --provider ${PROVIDER === 'edge' ? 'say (zero-install on macOS)' : 'edge (free, no key, 100+ languages)'}`);
  process.exit(2);
}

mkdirSync(NARR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const ffprobeDur = (file) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
  { encoding: 'utf8' }).trim());

/**
 * Pick an Ogg audio encoder this ffmpeg actually has. Homebrew's build ships `libopus` but NOT
 * `libvorbis` (only the experimental native Vorbis); Debian is the other way round. Probing beats
 * assuming: a hardcoded encoder fails on one host or the other.
 */
function pickOggEncoder() {
  const lines = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim());
  const has = (name) => lines.some((l) => l.startsWith('A') && l.split(/\s+/)[1] === name);
  if (has('libopus')) return ['-c:a', 'libopus', '-b:a', '48k', '-ar', '48000'];
  if (has('libvorbis')) return ['-c:a', 'libvorbis', '-q:a', '4'];
  if (has('vorbis')) return ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '4'];
  console.error('✘ this ffmpeg has no Ogg audio encoder (tried libopus, libvorbis, vorbis)');
  process.exit(2);
}
const OGG = pickOggEncoder();

const toOgg = (src, dest) => execFileSync('ffmpeg',
  ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', ...OGG, dest],
  { stdio: ['ignore', 'pipe', 'pipe'] });

function synthesize(text, dest) {
  const tmp = join(tmpdir(), `tts-${randomUUID()}`);
  if (PROVIDER === 'edge') {
    const textFile = `${tmp}.txt`;
    writeFileSync(textFile, text);
    const args = ['--voice', VOICE, '--file', textFile, '--write-media', `${tmp}.mp3`];
    if (RATE) args.push(`--rate=${RATE}`);
    try { execFileSync('edge-tts', args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    finally { rmSync(textFile, { force: true }); }
    toOgg(`${tmp}.mp3`, dest);
    rmSync(`${tmp}.mp3`, { force: true });
  } else if (PROVIDER === 'say') {
    execFileSync('say', ['-v', VOICE, '-o', `${tmp}.aiff`, text], { stdio: ['ignore', 'pipe', 'pipe'] });
    toOgg(`${tmp}.aiff`, dest);
    rmSync(`${tmp}.aiff`, { force: true });
  } else if (PROVIDER === 'piper') {
    const wav = `${tmp}.wav`;
    execFileSync('sh', ['-c', `piper --model ${VOICE} --output_file ${JSON.stringify(wav)}`],
      { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
    toOgg(wav, dest);
    rmSync(wav, { force: true });
  }
}

/** a reusable silence clip, used between beats */
const gapFile = join(NARR, '_gap.ogg');
if (!existsSync(gapFile)) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
    '-i', 'anullsrc=r=48000:cl=mono', '-t', String(GAP), '-ac', '1', ...OGG, gapFile],
    { stdio: ['ignore', 'pipe', 'pipe'] });
}

/** concatenate the beats (and gaps) into the scene's single track */
function assembleScene(files, dest) {
  const list = join(NARR, `.concat-${randomUUID()}.txt`);
  const entries = [];
  files.forEach((f, i) => { if (i) entries.push(gapFile); entries.push(f); });
  writeFileSync(list, entries.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat',
      '-safe', '0', '-i', list, '-c', 'copy', dest], { stdio: ['ignore', 'pipe', 'pipe'] });
  } finally { rmSync(list, { force: true }); }
}

const targets = scenes.filter((s) => s.beats.some((b) => b.text && !b.silent))
  .filter((s) => !ONLY || s.id === ONLY);
if (!targets.length) { console.error(`✘ no narratable scene matches --only ${ONLY}`); process.exit(2); }

console.log(`narrating ${targets.length} scene(s) with ${PROVIDER}/${VOICE} → ${NARR}`);
const timing = existsSync(TIMING) ? JSON.parse(readFileSync(TIMING, 'utf8')) : { gap: GAP, scenes: {} };

let synthesized = 0, cached = 0, failed = 0, spokenTotal = 0;
for (const scene of targets) {
  const beats = scene.beats.filter((b) => b.text && !b.silent);
  const captions = captionsOf(scene);
  const files = [];
  const marks = [];
  let t = 0;

  for (const [i, beat] of beats.entries()) {
    const dest = join(NARR, `${scene.id}-b${beat.n}.ogg`);
    const text = beat.text.trim();
    const hash = createHash('sha256').update(`${PROVIDER}|${VOICE}|${RATE || ''}|${text}`).digest('hex').slice(0, 16);
    const prev = manifest[`${scene.id}-b${beat.n}`];
    const upToDate = !FORCE && prev && prev.hash === hash && existsSync(dest);

    let dur;
    if (upToDate) {
      dur = ffprobeDur(dest);
      cached += 1;
    } else {
      try {
        synthesize(text, dest);
        dur = ffprobeDur(dest);
        manifest[`${scene.id}-b${beat.n}`] = {
          hash, provider: PROVIDER, voice: VOICE, rate: RATE || null,
          duration: Number(dur.toFixed(3)), chars: text.length, at: new Date().toISOString(),
        };
        writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
        synthesized += 1;
      } catch (e) {
        const msg = String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 180);
        console.error(`  ✘ ${scene.id} beat ${beat.n}: ${msg}`);
        failed += 1;
        continue;
      }
      // the TTS endpoint is a shared service like any other: one request at a time, politely spaced
      if (PROVIDER === 'edge' && beats.length > 1) execFileSync('sleep', ['1']);
    }

    files.push(dest);
    marks.push({
      n: beat.n, text, caption: captions[i] ?? beat.text,
      start: Number(t.toFixed(3)), end: Number((t + dur).toFixed(3)), duration: Number(dur.toFixed(3)),
      zoom: beat.zoom, ring: beat.ring, sound: beat.sound, action: beat.action,
    });
    spokenTotal += dur;
    t += dur + GAP;
  }

  if (!files.length) { console.error(`  ✘ ${scene.id}: nothing synthesized`); continue; }
  const track = join(NARR, `${scene.id}.ogg`);
  assembleScene(files, track);
  const total = ffprobeDur(track);
  timing.scenes[scene.id] = {
    total: Number(total.toFixed(3)),
    gap: GAP,
    beats: marks,
    offsetsFrom: 'start of the scene audio track',
  };
  writeFileSync(TIMING, `${JSON.stringify(timing, null, 2)}\n`);
  console.log(`  ${scene.id.padEnd(12)} ${marks.length} beats · ${spokenTotal.toFixed(1)}s spoken` +
    ` + ${(marks.length - 1) * GAP}s gaps → ${total.toFixed(1)}s track`);
  for (const m of marks) {
    const fx = [m.zoom.length && '🔍', m.ring.length && '⭕', m.sound.length && '🔊'].filter(Boolean).join('');
    console.log(`      b${String(m.n).padStart(2)}  ${m.start.toFixed(1).padStart(6)}–${m.end.toFixed(1)}s` +
      `  ${fx.padEnd(3)} ${m.text.slice(0, 52)}`);
  }
}

console.log(`\n${synthesized} synthesized · ${cached} cached · ${failed} failed · ${spokenTotal.toFixed(1)}s of speech`);
console.log(`beat timing → ${TIMING}`);
if (failed) process.exit(1);
console.log(`next: node scripts/tutorial-video/record.mjs --out ${OUT}   (actions are timed from this)`);
