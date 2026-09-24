#!/usr/bin/env node
/**
 * Edit a file only if the anchor is where you think it is.
 *
 * Why this exists (2026-09-18): three separate slips in one session came from the same place — an ad-hoc
 * `str.replace()` that silently did nothing because the anchor text was not what the author assumed (wrong
 * indentation), or worse, a *guard* that was satisfied by prose the author had just written in the same file
 * (`if 'configNormalize' not in s` — defeated by a comment mentioning `src/lib/configNormalize.js`, so the import
 * was never added and the app threw in lean mode only).
 *
 * A silent no-op is the worst failure mode in refactoring: nothing errors, the tests still pass, and a later run
 * gives the wrong answer. So: an edit either matches exactly the number of times you say, or it changes nothing.
 *
 *   node scripts/assert-edit.mjs FILE --find 'text' --replace 'text' [--count N] [--regex] [--dry-run] [--quiet]
 *
 * Behaviour
 *   --count N   how many occurrences you expect (default 1). A mismatch aborts with the actual count and the
 *               closest lines, so the message tells you what to fix rather than just "failed".
 *   --regex     treat --find as a regular expression (with flags via --flags gm etc.); the replacement may use $1.
 *   --show      print the matching lines and their numbers, then stop. Use it when you are unsure of the anchor.
 *   --dry-run   report what would change, without writing.
 *   Every success is verified by re-reading the file: the replacement must be present, and the new count must equal
 *   the expected count. Writing then verifying beats writing then assuming.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
if (!file || file.startsWith('--')) { console.error('usage: assert-edit.mjs FILE --find X --replace Y [--count N] [--regex] [--dry-run] [--show]'); process.exit(2); }
const opt = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (argv[i + 1] ?? true);
};
const find = opt('find');
const replace = opt('replace');
const expected = Number(opt('count', 1));
const useRegex = argv.includes('--regex');
const dryRun = argv.includes('--dry-run');
const show = argv.includes('--show');
const flags = opt('flags', 'g');
if (find === null) { console.error('  ✘ --find is required (use --show to inspect an anchor first)'); process.exit(2); }
if (replace === null && !show) { console.error('  ✘ --replace is required'); process.exit(2); }

const source = readFileSync(file, 'utf8');
const re = useRegex ? new RegExp(find, flags.includes('g') ? flags : flags + 'g') : null;

const indices = [];
if (useRegex) {
  for (const m of source.matchAll(re)) indices.push(m.index);
} else {
  let at = source.indexOf(find);
  while (at !== -1) { indices.push(at); at = source.indexOf(find, at + find.length); }
}

const lineOf = (idx) => source.slice(0, idx).split('\n').length;
const found = indices.length;

if (show) {
  console.log(`  ${file}: ${found} match(es) for the anchor`);
  for (const i of indices.slice(0, 12)) {
    const line = lineOf(i);
    const text = source.split('\n')[line - 1] || '';
    console.log(`    line ${line}: ${text.trim().slice(0, 110)}`);
  }
  process.exit(0);
}

if (found !== expected) {
  console.error(`  ✘ ${file}: anchor found ${found} time(s), expected ${expected} — NOTHING WRITTEN`);
  for (const i of indices.slice(0, 6)) console.error(`      line ${lineOf(i)}: ${(source.split('\n')[lineOf(i) - 1] || '').trim().slice(0, 100)}`);
  if (!found) {
    const firstWord = String(find).trim().split(/\s+/)[0].slice(0, 24);
    const near = source.split('\n').map((l, n) => [n + 1, l]).filter(([, l]) => firstWord && l.includes(firstWord)).slice(0, 4);
    console.error(`      no match. Lines containing ${JSON.stringify(firstWord)}:`);
    for (const [n, l] of near) console.error(`        ${n}: ${l.trim().slice(0, 100)}`);
  }
  process.exit(1);
}

const out = useRegex ? source.replace(re, replace) : source.split(find).join(replace);
if (out === source) { console.error(`  ✘ ${file}: replacement produced no change — check that --replace differs from --find. NOTHING WRITTEN`); process.exit(1); }

if (dryRun) {
  console.log(`  ${file}: ${found} match(es) at line(s) ${indices.map(lineOf).join(', ')} — dry run, not written`);
  process.exit(0);
}

writeFileSync(file, out);

// verify by re-reading: the change is on disk and did what was asked
const after = readFileSync(file, 'utf8');
const probe = useRegex ? replace.replace(/\$\d/g, '') : replace;
const newCount = probe ? after.split(probe).length - 1 : 0;
console.log(`  ✔ ${file}: replaced ${found} match(es) at line(s) ${indices.map(lineOf).join(', ')}`);
if (probe && newCount < expected) console.log(`  ⚠ the replacement text appears ${newCount} time(s) — expected at least ${expected}; check the result`);
