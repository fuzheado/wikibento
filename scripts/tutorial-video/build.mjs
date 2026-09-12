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
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveOut, arg } from './paths.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolveOut(arg('out', null));
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));
const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const { width: W, height: H, fps } = plan.video;

// Parse SCRIPT.md first: captions now come from the script's beats rather than from a hand-kept copy
// in scenes.json. Cheap (no browser) and it fails loudly if the script and scenes.json disagree.
execFileSync('node', [join(root, 'scripts/tutorial-video/beats.mjs'), '--out', OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
const beatsDoc = JSON.parse(readFileSync(join(OUT, 'beats.json'), 'utf8'));
/** the line SCRIPT.md writes over the title card (it is not a recorded scene, so it is not in the timeline) */
const TITLE_LINE = (beatsDoc.scenes.find((sc) => sc.id === '00-title') || {}).narration || '';

// Beat offsets, measured from the voiceover (narration/timing.json). Absent until the scene has been
// narrated, in which case captions fall back to splitting the scene across its caption lines.
let TIMING = null;
try { TIMING = JSON.parse(readFileSync(join(OUT, 'narration', 'timing.json'), 'utf8')); }
catch { /* not narrated yet */ }

const BG = '0x14161a';
const BUILD = join(OUT, 'build');
mkdirSync(BUILD, { recursive: true });

const ff = (args, label) => {
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    console.error(`✘ ${label} failed:`, String(e.stderr || e.message).slice(0, 400));
    throw e;
  }
};
const probe = (file, entries = 'format=duration') => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', file],
  { encoding: 'utf8' }).trim());

/**
 * Incremental build — the video is a set of chapters, and only the chapters whose inputs changed are
 * encoded again.
 *
 * Each scene already records independently (`record.mjs --only`), narration is cached per beat, and
 * overlays by content hash. The last piece is here: a scene's encoded part is keyed by everything that
 * went into it — the clip bytes, its narration, its captions, the note, the badge text, and the timing
 * maths — so editing one line re-encodes one scene instead of all eight. `build/manifest.json` records
 * what each part was built from.
 *
 * Rules of thumb this enables: changing WORDS needs no re-recording at all (the clip is stretched to the
 * new narration), changing ACTIONS or fx means re-recording that scene only, and changing a caption or a
 * note needs neither — just a rebuild.
 */
const MANIFEST = join(BUILD, 'manifest.json');
const built = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const stampOf = (f) => { try { const st = statSync(f); return `${st.size}:${Math.round(st.mtimeMs)}`; } catch { return 'missing'; } };
const keyOf = (id, fields) => createHash('sha256').update(`${id}|${JSON.stringify(fields)}`).digest('hex').slice(0, 16);
const reusable = (id, key) => built[id]?.key === key && existsSync(join(BUILD, `${id}.mp4`));
const remember = (id, key, note) => {
  built[id] = { key, note, at: new Date().toISOString() };
  writeFileSync(MANIFEST, `${JSON.stringify(built, null, 2)}\n`);
};
let reusedCount = 0, builtCount = 0;

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
const cardPart = (png, dur, voice = null) => {
  const out = join(BUILD, `${png.replace('.png', '')}-card.mp4`);
  // Finite streams throughout (see the note on the scene graph): the image is looped only for `dur`, and
  // a spoken line is padded with `atrim` rather than an endless `apad`.
  const hasVoice = voice && existsSync(voice);
  const audio = hasVoice ? ['-i', voice] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const graph = hasVoice
    ? `[0:v]scale=${W}:${H},format=yuv420p[v];[1:a]apad,atrim=end=${dur.toFixed(3)},asetpts=PTS-STARTPTS[a]`
    : `[0:v]scale=${W}:${H},format=yuv420p[v];[1:a]anull,atrim=end=${dur.toFixed(3)},asetpts=PTS-STARTPTS[a]`;
  ff(['-loop', '1', '-t', String(dur), '-i', join(OUT, 'cards', png), ...audio,
      '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-r', String(fps), out], `card ${png}`);
  return out;
};

mkdirSync(join(OUT, 'cards'), { recursive: true });
let srtTime = 0;
const srt = [];
// The title card is no longer scenery: SCRIPT.md's `00-title` scene speaks over it (the line that used
// to open scene 1), so its length follows that line. Silence over a logo wastes the moment attention is
// highest — five silent seconds was the reviewer's first note on the finished take.
const TITLE_VOICE = join(OUT, 'narration', '00-title.ogg');
const TITLE_DUR = existsSync(TITLE_VOICE) ? Math.max(2.5, probe(TITLE_VOICE) + 0.8) : 2.5;
const END_DUR = 3.0;
// Always re-render the cards. They are cheap and static, and a stale one is invisible until somebody
// notices the wrong words on screen — the same reason overlays.mjs caches by content hash.
execFileSync('node', [join(root, 'scripts/tutorial-video/cards.mjs'), OUT], { stdio: ['ignore', 'inherit', 'inherit'] });
// The card PNGs are re-rendered on every build (cheap, and it stops a stale card surviving), so their
// mtime always changes. Key them by the thing that produces them — cards.mjs — plus the length and the
// voice, so an unchanged build does not re-encode them.
const cardKey = (name, dur, voice) => keyOf(`card-${name}`, {
  src: stampOf(join(root, 'scripts/tutorial-video/cards.mjs')),
  name, dur: dur.toFixed(2), voice: stampOf(voice || ''),
});
const cardPartCached = (name, dur, voice) => {
  const id = `${name.replace('.png', '')}-card`;   // must match the file cardPart writes: title-card.mp4
  const key = cardKey(name, dur, voice);
  if (reusable(id, key)) { reusedCount += 1; return join(BUILD, `${name.replace('.png', '')}-card.mp4`); }
  const out = cardPart(name, dur, voice);
  builtCount += 1;
  remember(id, key, `${name} ${dur.toFixed(1)}s`);
  return out;
};
if (existsSync(join(OUT, 'cards', 'title.png'))) {
  parts.push(cardPartCached('title.png', TITLE_DUR, TITLE_VOICE));
  // the opening line belongs in the subtitles too, so a reader gets the whole narration
  if (TITLE_LINE) srt.push({ start: 0.3, end: TITLE_DUR - 0.2, text: TITLE_LINE });
  srtTime += TITLE_DUR;
  if (existsSync(TITLE_VOICE)) console.log(`title card: speaking over it (${TITLE_DUR.toFixed(1)}s)`);
}
else console.error('✘ missing cards/title.png');
// the end card is appended AFTER the scenes — it used to be pushed here alongside the title, which
// put a closing card immediately after the opening one; the drawtext end card that followed it has
// been dropped in favour of this single browser-rendered one.
const endCard = existsSync(join(OUT, 'cards', 'end.png')) ? cardPartCached('end.png', END_DUR, null)
  : (console.error('✘ missing cards/end.png'), null);

/** takes that assembled, but look wrong — reported at the end so a broken clip cannot ship unnoticed */
const suspects = [];

// ── browser-rendered per-scene overlays (badge / url / captions) ─────────────
const OVL = join(OUT, 'overlays');
const ov = (name) => join(OVL, name);
// Always invoked: overlays.mjs decides for itself what is current (content-hash manifest) and exits
// immediately when nothing changed. Gating it here on "is a PNG missing?" was a bug — an edited
// caption left the old PNG on disk, so the fresh narration played under the previous take's words
// (found 2026-09-11 by reading a frame of the rebuilt scene 3).
execFileSync('node', [join(root, 'scripts/tutorial-video/overlays.mjs'), '--out', OUT], { stdio: ['ignore', 'inherit', 'inherit'] });

// ── scenes ───────────────────────────────────────────────────────────────────
for (const scene of scenes) {
  const clip = scene.clip;
  const narration = join(OUT, 'narration', `${scene.id}.ogg`);
  if (!existsSync(clip)) { console.error(`✘ missing clip for ${scene.id}`); continue; }
  if (!existsSync(narration)) { console.error(`✘ missing narration for ${scene.id}`); continue; }
  const dClip = probe(clip);
  const dNarr = probe(narration);
  const buf = sampleClip(clip);
  // Prefer the recorder's own measurement of the pre-action lead-in: it knows exactly when the beat
  // clock started (scene 1 = 10.6s of the board loading, which the pixel heuristic trimmed only ~1s
  // of, leaving nine seconds of loading in the take). The heuristic remains for older clips.
  const lead = typeof scene.leadIn === 'number' ? scene.leadIn : leadInFrames(buf) / fps;
  const blank = blankFraction(buf);
  const dEff = Math.max(0.5, dClip - lead);
  const target = dNarr + 0.35;                      // a short beat of silence at the end (was 1.0s, then 0.5s)
  const stretch = Math.min(1.5, Math.max(1.0, target / dEff));
  const stretched = dEff * stretch;
  const pad = Math.max(0, target - stretched);

  // the scene's beat windows (with the fx markers attached to them), or undefined if not narrated
  const beats = TIMING?.scenes?.[scene.id]?.beats;

  const inputs = ['-i', clip, '-i', narration];
  // Every stream in this graph is FINITE, and the output is cut by trimming rather than by `-t`.
  //
  // Why that matters: with `-t` plus endless `-loop 1` image inputs, ffmpeg deadlocked on shutdown
  // roughly half the time — it would encode to within 0.1s of the target, the overlay inputs would
  // report "All consumers of this stream are done", and the process would sit there forever with the
  // CPU frozen and the output file half-written. It looked like a hang in the recorder, then like an
  // orphaned process; running the exact command by hand failed too (3/8 runs), and watching it with
  // `-loglevel verbose` showed the graph being torn down mid-shutdown. Making everything finite —
  // clone-then-trim the video to exactly the target, pad-then-atrim the audio to the same length, and
  // give each image input an explicit duration — took it to 8/8. Recorded because it cost hours and
  // presented as a mystery hang.
  const head = lead > 0.05
    ? `[0:v]trim=start=${lead.toFixed(2)},setpts=(PTS-STARTPTS)*${stretch.toFixed(4)}`
    : `[0:v]setpts=PTS*${stretch.toFixed(4)}`;
  const filters = [[
    head,
    `fps=${fps}`,
    `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG}`,
    `tpad=stop_mode=clone:stop_duration=${(pad + 1).toFixed(2)}`,   // clone the last frame to cover any shortfall
    `trim=end=${target.toFixed(3)},setpts=PTS-STARTPTS`,           // ...then cut to exactly the target
  ].join(',') + '[base]'];
  let last = 'base';
  let idx = 2;
  const overlay = (png, window) => {
    inputs.push('-loop', '1', '-t', (target + 1).toFixed(2), '-i', png);   // finite, not endless
    const tag = `o${idx}`;
    const enable = window ? `:enable='between(t,${window[0].toFixed(2)},${window[1].toFixed(2)})'` : '';
    filters.push(`[${last}][${idx}:v]overlay=0:0:eof_action=repeat${enable}[${tag}]`);
    last = tag;
    idx += 1;
  };

  overlay(ov(`${scene.id}-badge.png`));                                  // whole scene
  // The lower-left note is a static burn-in of the scene's address (or of a one-line process hint —
  // `note` in scenes.json is both). Skip it for a scene that rings `.fx-url-config`, because the
  // recorder drew a live URL pill there: the real href, in-page, with the ?config= part ringable.
  // Burning the text a second time would just repeat it on screen.
  const drawsUrlChip = beats?.some((b) => (b.ring || []).some((r) => r.selector === '.fx-url-config'));
  if (scene.note && !drawsUrlChip) overlay(ov(`${scene.id}-note.png`), [1.0, target]);

  // Captions. With a beat timeline each caption sits under the beat that speaks it — the offsets are
  // relative to the beat clock, which is exactly where the clip starts once the lead-in is trimmed,
  // so they need no adjustment. Text comes from SCRIPT.md (per beat; 📝 overrides the spoken line).
  const caps = scene.captions || [];
  if (beats?.length) {
    // text from SCRIPT.md (so editing a caption needs only a rebuild), window from the measured timeline
    const scriptBeats = (beatsDoc.scenes.find((sc) => sc.id === scene.id) || {}).beats || [];
    beats.forEach((b, i) => {
      const cap = scriptBeats[i]?.caption || scriptBeats[i]?.text || b.caption || b.text;
      if (!cap) return;
      if (existsSync(ov(`${scene.id}-cap${i}.png`))) overlay(ov(`${scene.id}-cap${i}.png`), [b.start, b.end]);
      else console.error(`✘ missing overlay ${scene.id}-cap${i}.png`);
      srt.push({ start: srtTime + b.start, end: srtTime + b.end, text: cap });
    });
  } else {
    // fallback for a scene without a narrated beat timeline: split the scene across its caption lines
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
  }

  // decide before encoding: everything that shaped this part, so an unchanged scene is reused as-is
  const partKeyValue = keyOf(scene.id, {
    clip: stampOf(clip), narration: stampOf(narration),
    captions: ((beatsDoc.scenes.find((sc) => sc.id === scene.id) || {}).beats || []).map((b) => b.caption || b.text),
    note: scene.note || null,   // the badge's own PNG stamp is in `overlays` below
    overlays: [ 'badge', ...(scene.note && !drawsUrlChip ? ['note'] : []), ...(beats || []).map((_, i) => `cap${i}`) ]
      .map((n) => stampOf(join(OUT, 'overlays', `${scene.id}-${n}.png`))),
    video: [W, H, fps], timing: [target.toFixed(3), stretch.toFixed(4), lead.toFixed(3), pad.toFixed(3)],
  });
  if (built[scene.id] && built[scene.id].key !== partKeyValue) {
    console.log(`   (${scene.id} changed: ${built[scene.id].note} → ${target.toFixed(1)}s)`);
  }
  if (reusable(scene.id, partKeyValue)) {
    reusedCount += 1;
    console.log(`  ${scene.id}: reused (unchanged since ${built[scene.id].at.slice(11, 16)})`);
    parts.push(join(BUILD, `${scene.id}.mp4`));
    srtTime += target;
    continue;
  }

  filters.push(`[1:a]adelay=500|500,apad,atrim=end=${target.toFixed(3)},asetpts=PTS-STARTPTS[a]`);
  const out = join(BUILD, `${scene.id}.mp4`);
  ff([...inputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${last}]`, '-map', '[a]',            // no -t: both streams already end at the target
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', out], scene.id);
  builtCount += 1;
  remember(scene.id, partKeyValue, `${target.toFixed(1)}s`);
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

console.log(`\n✔ ${final}   (${reusedCount} chapter(s) reused, ${builtCount} encoded)`);
console.log(`  duration ${probe(final).toFixed(1)}s · ${(statSync(final).size / 1048576).toFixed(1)} MB · ${W}x${H}@${fps}`);
console.log(`  captions: ${join(OUT, 'wikibento-tutorial.srt')}`);
if (suspects.length) {
  console.warn(`\n⚠ ${suspects.length} clip(s) assembled but look wrong: ${suspects.join(', ')}`);
  console.warn(`  The video is complete; re-record those scenes and rebuild before publishing.\n`);
}
