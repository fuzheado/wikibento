/**
 * GLAM PetScan relay — LIVE parity verification (ISSUE-46).
 *
 * Runs BOTH acquisition paths for the ISSUE-45/XBio repro case (depth 1,
 * 2026-07) with REAL data and asserts the results match the glamtools
 * reference (518 files · 38 used · 38 viewed · 40 pages · 2 wikis ·
 * 110,092 views — as measured 2026-08-16):
 *
 *   1. RELAY path   — PetScan via buildPetscanUrl/normalizePetscanPages
 *                     (the exact server relay logic) + aggregateGlamStats.
 *   2. SELF-WALK    — fetchGlamStats with default deps; the relative
 *                     /api/petscan fetch fails in node, exercising the
 *                     fallback exactly as a browser would when the relay
 *                     is down.
 *
 * Usage: WIKIBENTO_TEST=1 node scripts/verify-glam.mjs
 * NOTE: Commons changes over time, so the reference numbers drift; the
 * assert is a parity check, not a permanent contract — update the expected
 * values by running glamtools (or this script's printed reference) when it
 * legitimately changes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

process.env.WIKIBENTO_TEST = '1';

const CFG = { category: 'Images from XBio', depth: 1, year: 2026, month: 7, negcats: '', negdepth: 0, fileBudget: 1000, topN: 10, showDetail: true };
const UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) verify-glam';
const REF = { files: 518, usedFiles: 38, viewedFiles: 38, pages: 40, wikis: 2, totalViews: 110092 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { buildPetscanUrl, normalizePetscanPages } = await import('../deploy/server.js');

// Bundle dataSources.js (extensionless imports need esbuild; same pattern as npm test).
import { build } from 'esbuild';
const outfile = join(process.cwd(), '.glam-verify-bundle.mjs');
await build({ entryPoints: ['src/widgets/dataSources.js'], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' });
const { fetchGlamStats } = await import(`${outfile}?t=${Date.now()}`);

// ── path 1: relay (real PetScan + real views via injection) ──
const realRelay = async ({ category, depth, negcats, negdepth, budget }) => {
  const url = buildPetscanUrl({ cats: category, depth, negcats, negdepth, budget });
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  const d = await r.json();
  if (!r.ok) throw new Error(`PetScan HTTP ${r.status}`);
  await sleep(1500); // pace
  return { source: 'petscan', ...normalizePetscanPages(d.pages, budget) };
};
const relayOut = await fetchGlamStats(CFG, { relay: realRelay });

// ── path 2: self-walk fallback (default deps; relative relay URL fails in node) ──
const walkOut = await fetchGlamStats(CFG);

const fmt = (o) => `${o.files} files · ${o.usedFiles} used · ${o.viewedFiles} viewed · ${o.pages} pages · ${o.wikis} wikis · ${o.totalViews.toLocaleString()} views`;
console.log('reference (glamtools):', `${REF.files} files · ${REF.usedFiles} used · ${REF.viewedFiles} viewed · ${REF.pages} pages · ${REF.wikis} wikis · ${REF.totalViews.toLocaleString()} views`);
console.log('RELAY path           :', fmt(relayOut), `[${relayOut.source}${relayOut.cappedFiles ? ', capped' : ''}]`);
console.log('SELF-WALK path       :', fmt(walkOut), `[${walkOut.source}${walkOut.cappedFiles ? ', capped' : ''}]`);

const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
  return ok;
};
let pass = true;
for (const [k, v] of Object.entries(REF)) {
  pass = check(`relay ${k}`, relayOut[k], v) && pass;
  pass = check(`walk  ${k}`, walkOut[k], v) && pass;
}
if (relayOut.totalViews !== walkOut.totalViews) {
  console.log('  ⚠ relay and self-walk views differ — pageview volatility between runs is expected (view counts are live)');
}
try { await import('node:fs/promises').then((fs) => fs.unlink(outfile)); } catch { /* best effort */ }
console.log(pass ? '\nPARITY OK' : '\nPARITY FAILED');
process.exit(pass ? 0 : 1);
