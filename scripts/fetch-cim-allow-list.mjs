#!/usr/bin/env node
/**
 * Refresh the BUNDLED Commons Impact Metrics allow-list snapshot.
 *
 * WHY: the lookup param (`cim-category`, ISSUE-68) wants instant, validated
 * suggestions for "which institutions will actually produce data". The
 * authoritative list is a TSV published by WMF Data Engineering, but it sends no
 * CORS headers — so in the browser it was only reachable through the deployment's
 * `/api/proxy` relay, which means the instant suggestions existed on Toolforge and
 * nowhere else (a local `vite preview`, a mirror, or any third-party host got
 * search-only suggestions).
 *
 * Bundling the parsed list into `public/` fixes that: it is same-origin, instant,
 * offline-capable, and identical on every host. It is a SNAPSHOT, which is safe
 * here because the snapshot is only the *suggestion seed* — the live CIM probe
 * remains the authority for whether a category really has data (subcategories
 * have data without being listed at all), so a stale entry costs nothing and a
 * missing one is still findable through the CirrusSearch fallback.
 *
 * USAGE:
 *   npm run update:cim-allow-list          # fetch + rewrite the snapshot
 *   node scripts/fetch-cim-allow-list.mjs --check   # verify it is present/sane
 *
 * Deliberately NOT part of `npm run build`: a build should not need the network,
 * and a failed fetch must never break a deploy. The committed snapshot is the
 * source of truth for builds; refresh it when you want (month-end is when the
 * upstream list changes).
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIM_ALLOW_LIST_URL, CIM_ALLOW_LIST_MAX_AGE_DAYS, parseAllowList, parseAllowListSnapshot } from '../src/lib/cimAllowList.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'cim-allow-list.json');
const SOURCE = CIM_ALLOW_LIST_URL;

const check = process.argv.includes('--check');

if (check) {
  if (!existsSync(OUT)) {
    console.error(`✘ ${OUT} is missing — run: npm run update:cim-allow-list`);
    process.exit(1);
  }
  const snap = parseAllowListSnapshot(readFileSync(OUT, 'utf8'));
  const ageDays = (Date.now() - Date.parse(snap.fetchedAt)) / 86400000;
  console.log(`  ${snap.categories.length} categories · fetched ${snap.fetchedAt || 'unknown'} (${ageDays.toFixed(0)} days ago)`);
  if (!Number.isFinite(ageDays) || ageDays > CIM_ALLOW_LIST_MAX_AGE_DAYS) {
    console.error(`✘ the snapshot is older than ${CIM_ALLOW_LIST_MAX_AGE_DAYS} days — run: npm run update:cim-allow-list`);
    process.exit(1);
  }
  process.exit(0);
}

const userAgent =
  process.env.WIKIMEDIA_USER_AGENT || 'WikiBento allow-list fetcher (https://github.com/fuzheado/wikibento)';
const res = await fetch(SOURCE, { headers: { 'User-Agent': userAgent } });
if (!res.ok) {
  console.error(`✘ ${res.status} ${res.statusText} fetching the allow list`);
  process.exit(1);
}
const categories = parseAllowList(await res.text());
if (categories.length < 100) {
  // Guard against a truncated download or an upstream format change silently
  // replacing a good snapshot with 3 categories.
  console.error(`✘ parsed only ${categories.length} categories — refusing to overwrite the snapshot`);
  process.exit(1);
}
writeFileSync(OUT, `${JSON.stringify({ source: SOURCE, fetchedAt: new Date().toISOString(), count: categories.length, categories }, null, 0)}\n`);
console.log(`✔ wrote ${OUT} — ${categories.length} categories`);
