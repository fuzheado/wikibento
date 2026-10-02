#!/usr/bin/env node
/**
 * Repack board layouts — make the file say what the browser was already showing.
 *
 * WHY. react-grid-layout compacts a layout the moment it renders it (`compactType: 'vertical'`, the app's default):
 * items rise to fill gaps and overlapping items are pushed apart. So a demo board whose *authored* rectangles overlap
 * renders fine — and passes the demos sweep — while the file itself contradicts itself. That is how three boards came
 * to carry twelve overlapping pairs between them (measured 2026-10-02: `dashboard.json` 9, `glam-demo.json` 2,
 * `front-page-demo.json` 1 — up from the 7/2/1 measured on 2026-09-18, i.e. new tiles kept being added into
 * collisions), and why nothing noticed: the renderer was quietly repairing them.
 *
 * WHAT THIS DOES. Reimplements rgl's own vertical compaction for a layout with collisions and writes the result back.
 * The rendered board does not change — the same rule the browser applies on mount is applied once, here, and stored.
 * Verified by measuring rendered card geometry before and after (`scripts/probe-repack-geometry.mjs`, deleted once it
 * had done its job, as this repository's probes are).
 *
 * The invariant it establishes is asserted by `tests/demos.test.mjs`: no two items in a board's layout may overlap.
 *
 * Usage:
 *   node scripts/repack-layout.mjs                 # repack every public/*.json that carries a layout
 *   node scripts/repack-layout.mjs public/x.json   # just these files
 *   node scripts/repack-layout.mjs --check         # report overlaps, change nothing, exit 1 if any (the gate's shape)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const files = args.filter((a) => !a.startsWith('--'));

// ── rgl's vertical compaction, on a layout that may collide ───────────────────────────────────────────────────────
const collides = (a, b) =>
  a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bottom = (items) => items.reduce((m, l) => Math.max(m, l.y + l.h), 0);

/**
 * `compactItem`, then `compact`, from react-grid-layout: sort by (y, x), and for each item start it at
 * `min(bottom(placed), y)` — never lower than what is already placed — then push it below anything it collides with.
 * Static items keep their place (none of the demo boards has one, but the rule is the rule).
 */
function compactVertical(layout) {
  const placed = [];
  const yById = new Map();
  for (const orig of [...layout].sort((a, b) => (a.y - b.y) || (a.x - b.x))) {
    const l = { ...orig };
    if (l.static) { placed.push(l); yById.set(l.i, l.y); continue; }
    l.y = Math.min(bottom(placed), l.y);
    let hits = 0;
    let hit;
    while ((hit = placed.find((p) => collides(p, l)))) {
      l.y = hit.y + hit.h;
      if (++hits > 1000) throw new Error(`cannot settle ${l.i} — a cycle in the layout?`);
    }
    placed.push(l);
    yById.set(l.i, l.y);
  }
  // Returned as a MAP, and the caller rebuilds the array in the FILE's own order: a repack moves y values, and
  // re-sorting the array turned a nine-coordinate fix into a 900-line diff of moved blocks. Only `y` ever changes —
  // rgl's vertical compaction never touches x, w or h.
  return yById;
}

const overlappingPairs = (layout) => {
  const out = [];
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) if (collides(layout[i], layout[j])) out.push([layout[i].i, layout[j].i]);
  }
  return out;
};

const inPublic = readdirSync(join(root, 'public')).filter((f) => f.endsWith('.json')).map((f) => `public/${f}`);
const targets = (files.length ? files : inPublic).map((f) => f.replace(/^\.\//, ''));

let changed = 0;
let problems = 0;
for (const file of targets) {
  let board;
  let raw;
  try {
    raw = await readFile(join(root, file), 'utf8');
    board = JSON.parse(raw);
  } catch { continue; }
  if (!board || !Array.isArray(board.layout) || !board.layout.length) continue;
  const before = overlappingPairs(board.layout);
  if (!before.length) continue;
  problems += before.length;
  const yById = compactVertical(board.layout);
  const packed = board.layout.map((l) => (yById.get(l.i) === l.y ? l : { ...l, y: yById.get(l.i) }));
  const after = overlappingPairs(packed);
  console.log(`${file}: ${before.length} overlapping pair(s) → ${after.length}`);
  for (const [a, b] of before) console.log(`    ${a} × ${b}`);
  if (after.length) {
    console.error(`  ✘ still overlapping after compaction — refusing to write an unfixed file`);
    process.exitCode = 1;
    continue;
  }
  // A repack must not lose or invent items.
  const ids = (l) => l.map((x) => x.i).sort().join('|');
  if (ids(board.layout) !== ids(packed)) {
    console.error(`  ✘ item ids changed — refusing to write`);
    process.exitCode = 1;
    continue;
  }
  if (!CHECK) {
    // Preserve the file's OWN formatting. `dashboard.json` has been one-space indented since it was written, and the
    // first version of this script rewrote it at two spaces: 900 lines of whitespace diff for nine coordinates moved
    // — a change nobody can review, which is exactly what the repack is meant to avoid.
    const indented = raw.match(/\n(\s+)\S/);
    const indent = indented ? indented[1].length : 2;
    const tail = (raw.match(/\s*$/) || [''])[0];
    // Keep characters as the file had them: JSON.stringify turns "🏛️" into "\ud83c\udfdb\ufe0f", which is the same
    // string and a different file.
    const text = JSON.stringify({ ...board, layout: packed }, null, indent)
      .replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    await writeFile(join(root, file), text + tail);
    changed++;
  }
}

if (CHECK) {
  if (problems) {
    console.error(`✘ ${problems} overlapping layout pair(s) — run \`npm run repack:layouts\` to store what the browser already renders`);
    process.exit(1);
  }
  console.log('✔ no board layout overlaps itself');
} else {
  console.log(changed ? `✔ repacked ${changed} board(s)` : '✔ nothing to do — no board overlaps itself');
}
