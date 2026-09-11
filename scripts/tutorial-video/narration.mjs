/**
 * Synthesize each scene's voiceover → <out>/narration/<scene-id>.ogg — the step that `build.mjs`
 * has always expected and that nothing in this repo produced.
 *
 * Text comes from `scenes.json` (the same file `record.mjs` reads, so words and pictures cannot
 * drift apart the way they could with two narration sources).
 *
 * Providers, in the order the graft research recommended them:
 *   edge  — edge-tts, Microsoft's neural voices: free, no API key, broadcast-quality, 100+
 *           languages. The default. Needs the network.   `uv tool install edge-tts`
 *   say   — macOS `say`: zero-install placeholder, enough to prove the assembler end to end.
 *   piper — local, offline, CPU-only neural TTS (pip install piper-tts), if it is on PATH.
 *
 * Unchanged lines are never re-synthesized: results are keyed by a content hash of
 * (provider, voice, rate, text), so editing one beat re-renders one line and a re-run costs
 * nothing. (Same caching behaviour the Ultrademo and Tutorial Forge projects converged on.)
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));

const OUT = resolveOut(arg('out', null));
const ONLY = arg('only', null);
const PROVIDER = arg('provider', process.env.WIKIBENTO_TTS_PROVIDER || 'edge');
const FORCE = process.argv.includes('--force');
const NARR = join(OUT, 'narration');
const MANIFEST = join(NARR, 'manifest.json');

/** provider → the binary it really needs ("edge" is `edge-tts`) and its default voice */
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

// ── preflight: name the provider we are missing, and how to get it ───────────
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

const probe = (file) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
  { encoding: 'utf8' }).trim());

/**
 * Pick an Ogg audio encoder this ffmpeg actually has. Homebrew's build ships `libopus` but NOT
 * `libvorbis` (only the experimental native Vorbis, which needs -strict -2); the Debian build is
 * the other way round. Probing beats assuming: a hardcoded encoder fails on one host or the other.
 */
function pickOggEncoder() {
  const lines = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
    .split('\n').map((l) => l.trim());
  const has = (name) => lines.some((l) => l.startsWith('A') && l.split(/\s+/)[1] === name);
  if (has('libopus')) return ['-c:a', 'libopus', '-b:a', '48k', '-ar', '48000'];
  if (has('libvorbis')) return ['-c:a', 'libvorbis', '-q:a', '4'];
  if (has('vorbis')) return ['-c:a', 'vorbis', '-strict', '-2', '-q:a', '4'];   // experimental
  console.error('✘ this ffmpeg has no Ogg audio encoder (tried libopus, libvorbis, vorbis)');
  process.exit(2);
}
const OGG = pickOggEncoder();

/** encode whatever the provider gave us into the .ogg that build.mjs muxes (mono speech is plenty) */
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
    try {
      execFileSync('edge-tts', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } finally { rmSync(textFile, { force: true }); }
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

const scenes = (plan.scenes || []).filter((s) => !ONLY || s.id === ONLY);
if (!scenes.length) { console.error(`✘ no scene matches --only ${ONLY}`); process.exit(2); }
console.log(`narrating ${scenes.length} scene(s) with ${PROVIDER}/${VOICE} → ${NARR}`);

let synthesized = 0, cached = 0, failed = 0, total = 0;
for (const scene of scenes) {
  const text = (scene.narration || '').trim();
  const dest = join(NARR, `${scene.id}.ogg`);
  if (!text) { console.error(`✘ ${scene.id}: no narration text in scenes.json`); failed++; continue; }

  const hash = createHash('sha256').update(`${PROVIDER}|${VOICE}|${RATE || ''}|${text}`).digest('hex').slice(0, 16);
  const prev = manifest[scene.id];
  const upToDate = !FORCE && prev && prev.hash === hash && existsSync(dest);

  if (upToDate) {
    const d = probe(dest);
    console.log(`  = ${scene.id.padEnd(12)} ${d.toFixed(1)}s  cached`);
    cached++; total += d; continue;
  }

  try {
    synthesize(text, dest);
    const d = probe(dest);
    manifest[scene.id] = { hash, provider: PROVIDER, voice: VOICE, rate: RATE || null,
                           duration: Number(d.toFixed(3)), bytes: statSync(dest).size,
                           chars: text.length, at: new Date().toISOString() };
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`  + ${scene.id.padEnd(12)} ${d.toFixed(1)}s  synthesized (${text.length} chars)`);
    synthesized++; total += d;
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200);
    console.error(`  ✘ ${scene.id}: ${msg}`);
    failed++;
  }
  // the TTS endpoint is a shared service like any other: one request at a time, politely spaced
  if (PROVIDER === 'edge' && scenes.length > 1) execFileSync('sleep', ['1']);
}

console.log(`\n${synthesized} synthesized · ${cached} cached · ${failed} failed · ${total.toFixed(1)}s of narration`);
if (failed) process.exit(1);
console.log(`next: node scripts/tutorial-video/build.mjs --out ${OUT}`);
