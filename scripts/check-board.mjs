#!/usr/bin/env node
/**
 * `npm run check:board` — the board doctor, for a board that came from somewhere else.
 *
 * Point it at a JSON file from a chat, a notebook or another tool and it prints the same four verdicts the app's own
 * ⬆ Import panel would produce, in the order that matters: what stops the board loading, what the app will silently
 * repair, what it will load but not do, and what is merely worth knowing. The logic is `src/lib/boardDoctor.js` — the
 * app's own validators, shared with the `/api/validate` route the door will serve — so this is not a second opinion
 * about the app; it is the app, run before you paste.
 *
 * Usage:
 *   npm run check:board -- board.json          # a file
 *   pbpaste | npm run check:board              # from the clipboard (stdin)
 *   npm run check:board -- board.json --json   # machine-readable report
 *   npm run --silent check:board -- board.json --json | jq   # npm's own banner is not JSON — `--silent` drops it
 *   npm run check:board -- --quiet board.json  # exit code only (0 = importable)
 *
 * Exit: 0 when the board is importable, 1 when it is not, 2 when the input could not be read at all.
 */
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const JSON_OUT = flag('--json');
const QUIET = flag('--quiet');
const target = args.find((a) => !a.startsWith('--'));

// ── the doctor's logic, bundled on demand ─────────────────────────────────────────────────────────────────────────
// `src/lib/boardDoctor.js` is app code — the registry it reads uses directory imports (`from '../widgets'`) that node's
// ESM loader will not resolve, so it is bundled first. Same trick npm test uses for every src-touching test file, and
// the prototype of the artefact the validator service will ship beside server.js.
const cacheDir = join(root, 'node_modules', '.cache');
await mkdir(cacheDir, { recursive: true });
const bundle = join(cacheDir, 'board-doctor.mjs');
const esbuild = join(root, 'node_modules', '.bin', 'esbuild');
const EB_ARGS = ['src/lib/boardDoctor.js', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=error'];
try {
  if (existsSync(esbuild)) execFileSync(esbuild, EB_ARGS, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  else execFileSync('npx', ['esbuild', ...EB_ARGS], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
} catch {
  console.error('✘ could not build the doctor (esbuild) — run `npm install` first');
  process.exit(2);
}
const { diagnoseBoard } = await import(pathToFileURL(bundle).href);

// ── input ─────────────────────────────────────────────────────────────────────────────────────────────────────────
let text;
if (target && target !== '-') {
  const path = resolve(process.cwd(), target);
  if (!existsSync(path)) {
    console.error(`✘ no such file: ${path}`);
    process.exit(2);
  }
  text = await readFile(path, 'utf8');
} else {
  text = await readFile(0, 'utf8');   // stdin — `pbpaste | npm run check:board`
}
if (!text.trim()) {
  console.error('✘ nothing to check — pass a file, or pipe the board in');
  process.exit(2);
}

// A board out of a chat usually arrives wrapped in a markdown fence, which is not JSON. Strip it and say so, rather
// than reporting a syntax error about backticks (the message it produced before 2026-10-02).
let body = text.trim();
const fenced = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
let strippedFence = false;
if (fenced) {
  body = fenced[1];
  strippedFence = true;
}

// The CIM snapshot, so the doctor can say a category is not on the allow list before the card shows nothing. Optional:
// without it the check degrades to a note.
let allowList = null;
try {
  const snap = JSON.parse(await readFile(join(root, 'public', 'cim-allow-list.json'), 'utf8'));
  if (Array.isArray(snap.categories)) {
    allowList = new Set(snap.categories.map((c) => String(c).replace(/_/g, ' ').trim().toLowerCase()));
  }
} catch { /* no snapshot → the CIM check reports a note instead */ }

const report = diagnoseBoard(body, { allowList, source: target && target !== '-' ? target : 'stdin' });

if (JSON_OUT) {
  console.log(JSON.stringify({ ...report, strippedFence }, null, 2));
} else if (QUIET) {
  // `--quiet` is for scripting: the exit code carries the verdict, and nothing is written at all.
} else {
  const line = (icon, label, items, pad = 9) => {
    if (!items.length) return;
    console.log(`\n${icon} ${label} (${items.length})`);
    for (const i of items) console.log(`   • ${i.message}`);
  };
  console.log(`\n🩺 board doctor — ${report.source}${strippedFence ? ' (markdown fence stripped)' : ''}`);
  line('✘', 'ERRORS — this board will not load', report.errors);
  line('⚠', 'REPAIRS — it loads, and the app will fix these silently', report.repairs);
  line('⚠', 'WARNINGS — it loads, but probably not as you meant', report.warnings);
  line('ℹ', 'NOTES — fine, worth knowing', report.notes);
  console.log(`\n${report.summary}`);
  if (report.verdict !== 'clean') {
    console.log(`   rule for each class: ${report.guide} (§1 shape, §3 gates, §5 references, §6 checking)`);
  }
  if (report.verdict !== 'unusable') console.log('   next: paste it into the app\'s ⬆ Import panel — this is the same verdict it will give.');
}

process.exit(report.errors.length ? 1 : 0);
