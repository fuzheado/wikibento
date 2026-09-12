/**
 * Parse `SCRIPT.md` — the shooting script — into machine-readable beats.
 *
 * Until now every reword in the script had to be copied by hand into `scenes.json` before it could
 * reach the video, and the 🔍/⭕/🔊 markers were read by nothing at all. This makes the script the
 * actual input: each scene's beats carry their spoken line, the caption, the on-screen action and the
 * fx markers, and everything downstream is derived from them.
 *
 * What SCRIPT.md owns, and what it does not:
 *   SCRIPT.md   the words (per beat), the captions, the fx markers, the beat order
 *   scenes.json only the operational setup the prose cannot express — the starting state a scene is
 *               recorded from (`start`), its step number and its title
 *   beats.json  this parser's output: the above, plus derived narration and captions
 *
 * Beat format (see the header of SCRIPT.md):
 *   1. 🗣 "the spoken line"          starts a beat; the line is also its default caption
 *      🖱 what happens while it is spoken
 *      🔍 / ⭕ / 🔊 / 📝               fx and caption overrides for that beat
 *
 * A scene's narration is its beats' lines joined; its captions are per beat (the 📝 override when
 * present, otherwise the line itself), which is what the script's own header promises: 🗣 is
 * "voiceover + burnt-in caption".
 *
 * Usage:
 *   node pipeline/beats.mjs [--config video/demo.config.mjs] [--out DIR]   parse → <out>/beats.json
 *   node pipeline/beats.mjs --check                                        validate only, exit 1 on a problem
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOut, arg, loadConfig, cfgPath } from './paths.mjs';

// Paths are resolved inside main(), not at module top level: importing this module (the tests bundle
// it) must not touch the filesystem, and under bundling import.meta.url points at the bundle anyway.
const KINDS = { '🗣': 'say', '🖱': 'action', '🔍': 'zoom', '⭕': 'ring', '🔊': 'sound', '📝': 'caption' };
// An alternation, NOT a character class: emoji inside [...] are treated as individual UTF-16 code
// units, so the class matches half of one and KINDS[half] is undefined.
const MARKER_RE = new RegExp(`^\\s*(${Object.keys(KINDS).join('|')})\\s*(.*)$`);

/**
 * A marker becomes machine-readable when it names a target with `@ <css selector>`:
 *
 *   🔍 1.2× @ .chart-card — the one zoom in this scene
 *   ⭕ @ [data-item-id="views"] .item-title — as its name is spoken
 *
 * The em dash separates the spec from the prose explaining it, so the words after it are free text.
 * A marker with no `@` is intent only: the parser reports it as prose and the recorder skips it, which
 * is how you can see at a glance how much of the script is still waiting to be made mechanical.
 */
export function parseFx(kind, raw) {
  const at = raw.match(/@\s*([^—]+?)\s*(?:—|$)/);
  const scale = kind === 'zoom' ? Number((raw.match(/([\d.]+)\s*×/) || [])[1] ?? 0) || null : null;
  const emDash = raw.indexOf('—');
  return {
    kind,
    raw: raw.trim(),
    selector: at ? at[1].trim() : null,
    scale,
    prose: emDash > -1 ? raw.slice(emDash + 1).trim() : null,
  };
}

/** Split markdown into `## ` sections. */
function sections(md) {
  const out = [];
  let cur = null;
  for (const raw of md.split('\n')) {
    const h = raw.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = { heading: h[1], body: [] }; out.push(cur); continue; }
    if (cur) cur.body.push(raw);
  }
  return out;
}

/**
 * SCRIPT.md → scenes with beats. Pure, so it can be tested directly.
 * @returns {{scenes: Array, warnings: string[]}}
 */
export function parseScript(md, { knownSceneIds = [] } = {}) {
  const warnings = [];
  const scenes = [];

  for (const s of sections(md)) {
    const body = s.body.join('\n');
    const idMatch = body.match(/`scene\s+([0-9A-Za-z][0-9A-Za-z-]*)`/);
    if (!idMatch) continue;                       // a prose section, not a scene
    const id = idMatch[1];

    const startMatch = body.match(/starts from:\s*([^·\n]+?)\s*(?:·|\n|$)/);
    const targetMatch = body.match(/target\s*~?\s*(\d+(?:\.\d+)?)\s*s/);
    const stepMatch = s.heading.match(/^(\d+)\./);

    const beats = [];
    let cur = null;
    const newBeat = (n, text, silent = false) => {
      cur = { n, text, silent, caption: null, action: [], zoom: [], ring: [], sound: [] };
      beats.push(cur);
      return cur;
    };

    for (const raw of s.body) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) continue;
      if (/^\s*`scene\s/.test(line)) continue;          // the metadata line
      if (/^---\s*$/.test(line.trim())) continue;

      // number + 🗣 starts a beat
      const bead = line.match(/^(\d+)\.\s*🗣\s*"(.*)"\s*$/);
      if (bead) { newBeat(Number(bead[1]), bead[2]); continue; }

      // an unnumbered marker line (the end card is written this way)
      const mark = line.match(MARKER_RE);
      if (mark) {
        const kind = KINDS[mark[1]];
        const val = mark[2].trim();
        const beat = cur || newBeat(beats.length + 1, '', kind === 'say');
        if (kind === 'say') {
          // an unnumbered 🗣 — "silent" means the end card has no voiceover
          const silent = /^silent\b/i.test(val);
          beat.text = silent ? '' : val.replace(/^"|"$/g, '');
          beat.silent = silent;
        } else if (kind === 'caption') {
          beat.caption = val.replace(/^"|"$/g, '');
        } else {
          beat[kind].push(parseFx(kind, val));
        }
        continue;
      }
      // anything else in a scene body is prose for the human (notes, take notes, recipes)
    }

    for (const b of beats) {
      if (!b.text && !b.silent) warnings.push(`${id}: beat ${b.n} has no spoken line`);
    }
    if (!beats.length) warnings.push(`${id}: no beats found`);
    if (!targetMatch) warnings.push(`${id}: no "target ~Ns" in the metadata line`);

    scenes.push({
      id,
      step: stepMatch ? Number(stepMatch[1]) : null,
      title: s.heading.replace(/^\d+\.\s*/, '').trim(),
      start: startMatch ? startMatch[1].trim() : null,
      targetSeconds: targetMatch ? Number(targetMatch[1]) : null,
      beats,
    });
  }

  // the script and the recorder's plan must describe the same set of scenes.
  // A section with no `starts from:` is a card, not a recorded scene (the end card is written that
  // way), so it is expected to be absent from scenes.json and must not be reported as a mismatch.
  const recorded = scenes.filter((s) => s.start);
  const fromScript = recorded.map((s) => s.id);
  for (const id of fromScript) if (knownSceneIds.length && !knownSceneIds.includes(id)) {
    warnings.push(`${id}: recorded in SCRIPT.md but not in scenes.json (the recorder has no starting state for it)`);
  }
  for (const id of knownSceneIds) if (!fromScript.includes(id)) {
    warnings.push(`${id}: in scenes.json but not in SCRIPT.md (no words for it)`);
  }
  const dup = fromScript.filter((id, i) => fromScript.indexOf(id) !== i);
  for (const id of dup) warnings.push(`${id}: appears twice in SCRIPT.md`);

  return { scenes, warnings };
}

/** The scene's narration = its beats' spoken lines, in order. */
export const narrationOf = (scene) =>
  scene.beats.filter((b) => b.text && !b.silent).map((b) => b.text).join(' ');

/** Captions are per beat: the 📝 override when the beat has one, else the spoken line. */
export const captionsOf = (scene) =>
  scene.beats.filter((b) => b.text && !b.silent).map((b) => b.caption || b.text);

async function main() {
  const cfg = await loadConfig(arg('config', null));
  const md = readFileSync(cfgPath(cfg, cfg.script), 'utf8');
  const plan = JSON.parse(readFileSync(cfgPath(cfg, cfg.plan), 'utf8'));
  const known = plan.scenes.map((s) => s.id);
  const { scenes, warnings } = parseScript(md, { knownSceneIds: known });

  const fx = scenes.flatMap((s) => s.beats).reduce((a, b) => ({
    zoom: a.zoom + b.zoom.length, ring: a.ring + b.ring.length, sound: a.sound + b.sound.length,
  }), { zoom: 0, ring: 0, sound: 0 });
  const beats = scenes.reduce((n, s) => n + s.beats.length, 0);
  // how much of the script's fx is machine-readable yet (has an `@ selector`) rather than prose
  const all = scenes.flatMap((s) => s.beats);
  const fxOf = (kind) => all.flatMap((b) => b[kind]);
  const wired = (kind) => fxOf(kind).filter((f) => f.selector).length;
  const fxLine = `${fx.zoom} 🔍 (${wired('zoom')} with a @target) · ${fx.ring} ⭕ (${wired('ring')} with a @target) · ${fx.sound} 🔊`;

  if (process.argv.includes('--check')) {
    console.log(`SCRIPT.md: ${scenes.length} scenes · ${beats} beats · ${fxLine}`);
    for (const w of warnings) console.error(`  ⚠ ${w}`);
    if (warnings.length) process.exit(1);
    console.log('  ✓ parses cleanly and matches scenes.json');
    return;
  }

  const out = resolveOut(arg('out', null), cfg);
  mkdirSync(out, { recursive: true });
  const dest = join(out, 'beats.json');
  writeFileSync(dest, `${JSON.stringify({
    generated: `from ${cfg.script} by beats.mjs — do not edit by hand`,
    scenes: scenes.map((s) => ({ ...s, narration: narrationOf(s), captions: captionsOf(s) })),
  }, null, 2)}\n`);

  console.log(`SCRIPT.md → ${dest}`);
  console.log(`  ${scenes.length} scenes · ${beats} beats · ${fxLine}`);
  for (const s of scenes) {
    const n = narrationOf(s);
    console.log(`    ${s.id.padEnd(12)} ${String(s.beats.length).padStart(2)} beats · ${captionsOf(s).length} captions · ${n.length} chars · target ~${s.targetSeconds}s`);
  }
  for (const w of warnings) console.error(`  ⚠ ${w}`);
}

// Only run when invoked directly. Deliberately not `import.meta.url === process.argv[1]`: when this
// module is bundled (the tests bundle it with esbuild) import.meta.url becomes the bundle's URL, which
// made the guard fire and sent main() looking for SCRIPT.md next to the bundle.
const invokedAs = (process.argv[1] || '').replace(/\\/g, '/');
if (invokedAs.endsWith('beats.mjs')) await main();
