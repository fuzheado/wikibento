#!/usr/bin/env node
/**
 * docs-facts constitution — the docs may not contradict the code.
 *
 * WikiBento gates code↔artifact agreement with constitutions (manifest
 * compliance, temporal scope, panel reachability, trend axis, demos). Docs were
 * the one artifact class with no gate, and prose drifted from the registry
 * twice: "37 widget types" while the registry held 38, and
 * "32 data-driven + 5 static" while the real split was 29 + 9. HANDOFF also
 * carried a stale `main = afd308a` and byte counts from a previous toolchain.
 *
 * The rule this encodes: **state volatile facts by reference, never by value.**
 *
 *   - Counts are DERIVED here from the registry and the catalog, so adding a
 *     widget fails this gate until the prose is updated. That is the point —
 *     it is a reminder, not a nuisance. Checked in README + HANDOFF *and* in the
 *     board configs under public/ (a markdown card can carry a stale count too).
 *   - Byte sizes are BOUND-checked in magnitude, never pinned to decimals: exact
 *     bytes change with every source change, and a README number would need
 *     hand-maintenance on each build. (Corollary, learned the hard way: never
 *     diagnose an artifact diff without pinning the commit that built it.)
 *   - Mutable state (the deployed bundle) is verified against production with
 *     `--live` instead of being frozen in prose and left to rot.
 *
 * Usage:
 *   node scripts/docs-facts.mjs          # offline checks (wired into `npm test`,
 *                                        #   hence into `npm run build`)
 *   node scripts/docs-facts.mjs --live   # + compare the bundle HANDOFF claims is
 *                                        #   deployed against what production serves
 *
 * Not checked (deliberately): docs/DEPLOYMENTS.md and docs/ISSUES.md are LOGS —
 * they legitimately cite commit hashes and historical counts, so the
 * volatile-facts rules apply only to the present-tense docs (README, HANDOFF).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');
const PROD_URL = 'https://wikibento.toolforge.org/';

// ── helpers ──────────────────────────────────────────────────────────────────

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
}

const fail = (msg) => {
  throw new Error(msg);
};

// ── derived truth (never hand-maintained) ────────────────────────────────────

const registrySource = read('src/widgets/index.js');
const idMatches = [...registrySource.matchAll(/^\s{4}id:\s*'([A-Za-z0-9]+)'/gm)];
const registry = idMatches.map((m, i) => {
  const body = registrySource.slice(m.index, idMatches[i + 1]?.index ?? registrySource.length);
  const name = body.match(/name:\s*'([^']*)'/);
  return {
    id: m[1],
    // a registry entry with a fetch fn is data-driven; without one it renders
    // from config (static/output widgets)
    fetching: /^\s{4}fetch[:(]/m.test(body),
    name: name ? name[1] : m[1],
  };
});
const REGISTRY = registry.length;
const FETCHING = registry.filter((w) => w.fetching).length;
const STATIC = REGISTRY - FETCHING;

const catalog = JSON.parse(read('public/dashboard.json'));
const catalogWidgets = catalog.widgets || [];
const CATALOG_WIDGETS = catalogWidgets.length;
const catalogTypes = new Set(catalogWidgets.map((w) => w.widgetType));
const CATALOG_TYPES = catalogTypes.size;
// smoke:panels measures ⚙ + ⓘ at 1440/1024/600 for every widget in the catalog
const PANEL_MEASUREMENTS = 2 * 3 * CATALOG_WIDGETS;

/** Widget types deliberately absent from the showcase catalog — each needs a reason. */
const CATALOG_EXCLUSIONS = {
  // (empty: the catalog shows every registered type; keep it that way)
};

/** docs/*.md not linked from the README — each needs a reason. */
const INTERNAL_DOCS = {
  // (empty: every doc is part of the public documentation index)
};

const DOCS = ['README.md', 'HANDOFF.md'];
const prose = Object.fromEntries(DOCS.map((d) => [d, read(d)]));

// Board configs carry user-visible prose too (markdown cards, board titles) and
// drift the same way: the demo hub's markdown claimed "37 widget types" while
// the registry held 38, and nothing checked it because it lives in JSON. Count
// claims are verified there as well; the volatile-facts rules are not (a board
// may legitimately embed a hash in a QR payload or a URL).
const COUNT_SOURCES = [
  ...Object.entries(prose),
  ...readdirSync(join(ROOT, 'public'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [`public/${f}`, read(`public/${f}`)]),
];

console.log('\ndocs-facts constitution — docs may not contradict the code\n');
console.log(
  `derived: ${REGISTRY} registry types (${FETCHING} data-driven + ${STATIC} static) · ` +
    `${CATALOG_WIDGETS} catalog widgets covering ${CATALOG_TYPES} types · ` +
    `${PANEL_MEASUREMENTS} panel measurements\n`
);

// ── 1. registry ⇄ prose counts ───────────────────────────────────────────────
// Each rule pins a claim to the derived number it describes. Ratio forms
// ("21/35 widget types", a historical audit figure) are deliberately skipped.
const COUNT_RULES = [
  {
    re: /(?<![/\d])(\d+)\s+widget types\b/g,
    expect: () => [REGISTRY],
    why: `registry types (${REGISTRY})`,
  },
  {
    re: /All (\d+) data-driven widget types/g,
    expect: () => [FETCHING],
    why: `${FETCHING} data-driven types`,
  },
  {
    re: /(\d+)\s+static ones\b/g,
    expect: () => [STATIC],
    why: `${STATIC} static types`,
  },
  {
    re: /(\d+)\s+widget types on one board/g,
    expect: () => [CATALOG_TYPES],
    why: `${CATALOG_TYPES} distinct catalog types`,
  },
  {
    re: /\ball (\d+) widgets\b/gi,
    expect: () => [REGISTRY, CATALOG_TYPES, CATALOG_WIDGETS],
    why: `registry/catalog counts (${REGISTRY}/${CATALOG_TYPES}/${CATALOG_WIDGETS})`,
  },
  {
    re: /(\d+) measurements\b/g,
    expect: () => [PANEL_MEASUREMENTS],
    why: `${PANEL_MEASUREMENTS} panel measurements`,
  },
  {
    re: /× (\d+) widgets at w3 h3/g,
    expect: () => [CATALOG_WIDGETS],
    why: `${CATALOG_WIDGETS} catalog widgets`,
  },
];

check('claimed widget counts match the registry and catalog', () => {
  const bad = [];
  for (const [doc, text] of COUNT_SOURCES) {
    for (const rule of COUNT_RULES) {
      for (const m of text.matchAll(rule.re)) {
        const claimed = Number(m[1]);
        if (!rule.expect().includes(claimed)) {
          bad.push(`${doc} claims "${m[0]}" but truth is ${rule.why}`);
        }
      }
    }
  }
  if (bad.length) fail(bad.join('\n    '));
  return `${COUNT_SOURCES.length} sources (docs + board configs) agree with ${REGISTRY} types / ${CATALOG_WIDGETS} catalog widgets`;
});

// ── 2. the prose static-widget list names every static widget ────────────────
check('the README static-widget list matches the registry exactly', () => {
  const m = prose['README.md'].match(/static ones\s*\(([^)]*)\)/);
  if (!m) fail('README no longer names its static widgets ("the N static ones (…)" not found)');
  const listed = m[1]
    .split(',')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // "Text / Markdown" → "Text/Markdown", "Speaker (text-to-speech)" → "Speaker"
  const normalize = (s) =>
    s.replace(/\(.*?\)/g, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim().toLowerCase();
  const want = registry.filter((w) => !w.fetching).map((w) => normalize(w.name));
  const have = listed.map(normalize);
  const missing = want.filter((n) => !have.includes(n));
  const extra = have.filter((n) => !want.includes(n));
  if (listed.length !== STATIC || missing.length || extra.length) {
    fail(
      `README lists ${listed.length} static widgets, registry has ${STATIC}` +
        (missing.length ? `\n    missing from README: ${missing.join(', ')}` : '') +
        (extra.length ? `\n    not a static widget: ${extra.join(', ')}` : '')
    );
  }
  return `${STATIC} static widgets named: ${listed.join(', ')}`;
});

// ── 2b. prose counts derivable from a board config ──────────────────────────
// The glam demo's prose states how many institutions it switches between, and
// the number of options in its `collection` param states how many there are.
// README said "six institutions" while the param held five.
check("the glam demo's institution count matches its collection param", () => {
  const glam = JSON.parse(read('public/glam-demo.json'));
  const options = glam?.params?.collection?.options;
  if (!Array.isArray(options) || !options.length) {
    fail('public/glam-demo.json no longer declares a collection param with options');
  }
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const bad = [];
  for (const [doc, text] of COUNT_SOURCES) {
    for (const m of text.matchAll(/([A-Za-z]+)\s+(?:CIM-registered\s+)?institutions\b/gi)) {
      const n = WORDS[m[1].toLowerCase()];
      if (n === undefined) continue; // e.g. the literal placeholder "N institutions"
      if (n !== options.length) {
        bad.push(`${doc} claims "${m[0]}" but the collection param has ${options.length} options`);
      }
    }
  }
  if (bad.length) fail(bad.join('\n    '));
  return `prose agrees with the ${options.length} collection options`;
});

// ── 3. the showcase catalog really shows every widget type ───────────────────
check('the showcase catalog covers every registered widget type', () => {
  const excluded = Object.keys(CATALOG_EXCLUSIONS);
  for (const [type, reason] of Object.entries(CATALOG_EXCLUSIONS)) {
    if (!reason || !String(reason).trim()) fail(`CATALOG_EXCLUSIONS['${type}'] needs a reason`);
    if (!registry.some((w) => w.id === type)) fail(`CATALOG_EXCLUSIONS['${type}'] is not a widget type`);
  }
  const missing = registry.filter((w) => !catalogTypes.has(w.id) && !excluded.includes(w.id));
  if (missing.length) {
    fail(
      `catalog is missing ${missing.length} type(s): ${missing.map((w) => w.id).join(', ')}` +
        `\n    add each to public/dashboard.json, or to CATALOG_EXCLUSIONS with a reason`
    );
  }
  const unknown = [...catalogTypes].filter((t) => !registry.some((w) => w.id === t));
  if (unknown.length) fail(`catalog has unknown widget types: ${unknown.join(', ')}`);
  return `${CATALOG_TYPES}/${REGISTRY} types present in ${CATALOG_WIDGETS} widgets`;
});

// ── 4. every doc is in the README index ─────────────────────────────────────
check('every docs/*.md is linked from the README', () => {
  const files = readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
  const missing = files.filter(
    (f) => !prose['README.md'].includes(f) && !(f in INTERNAL_DOCS)
  );
  if (missing.length) {
    fail(
      `not linked from README.md: ${missing.join(', ')}` +
        `\n    add it to the Documentation list, or to INTERNAL_DOCS with a reason`
    );
  }
  for (const [file, reason] of Object.entries(INTERNAL_DOCS)) {
    if (!reason || !String(reason).trim()) fail(`INTERNAL_DOCS['${file}'] needs a reason`);
  }
  return `${files.length} docs indexed`;
});

// ── 5. no volatile facts in the present-tense docs ─────────────────────────
// These are the exact shapes that rotted: a frozen git SHA, a running test
// total, and decimal-precise build sizes.
const VOLATILE_RULES = [
  {
    re: /(?<![0-9a-zA-Z_-])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![0-9a-zA-Z_-])/g,
    what: 'a bare git SHA (commit refs belong in docs/DEPLOYMENTS.md, which is a log)',
  },
  {
    re: /\bnpm test\b[^.\n]{0,40}\b\d{2,4}\b/g,
    what: 'a running test total (the suite grows; run `npm test` for the number)',
  },
  {
    re: /\b\d{2,3}\.\d{2} KB\b/g,
    what: 'decimal-precise build bytes (they change with the source — quote a magnitude instead)',
  },
];

check('present-tense docs carry no volatile facts', () => {
  const bad = [];
  for (const [doc, text] of Object.entries(prose)) {
    for (const rule of VOLATILE_RULES) {
      for (const m of text.matchAll(rule.re)) {
        const line = text.slice(0, m.index).split('\n').length;
        bad.push(`${doc}:${line} has ${rule.what}: "${m[0]}"`);
      }
    }
  }
  if (bad.length) fail(bad.join('\n    '));
  return `no frozen SHAs, test totals, or byte-precision in ${DOCS.join('/')}`;
});

// ── 6. build size stays in the documented magnitude ────────────────────────
check('built bundle is within the documented size magnitude', () => {
  const dir = join(ROOT, 'dist/assets');
  if (!existsSync(dir)) return 'skipped (no dist/ — run `npm run build`)';
  let raw = 0;
  let gz = 0;
  for (const f of readdirSync(dir)) {
    const buf = readFileSync(join(dir, f));
    if (!statSync(join(dir, f)).isFile() || /\.map$/.test(f)) continue;
    raw += buf.length;
    gz += gzipSync(buf, { level: 9 }).length;
  }
  const kb = (n) => Math.round(n / 1024);
  if (raw < 300 * 1024 || raw > 1536 * 1024) {
    fail(`raw bundle ${kb(raw)} KB outside the documented magnitude (300–1536 KB) — update README's figure`);
  }
  if (gz < 80 * 1024 || gz > 400 * 1024) {
    fail(`gzipped bundle ${kb(gz)} KB outside the documented magnitude (80–400 KB) — update README's figure`);
  }
  return `${kb(raw)} KB raw / ${kb(gz)} KB gzip — within the documented magnitude`;
});

// ── 7. --live: the claimed deployed bundle is what production serves ───────
if (LIVE) {
  const LIVE_NAME = 'the bundle HANDOFF claims is deployed is what production serves';
  try {
    const claimedMatch = prose['HANDOFF.md'].match(
      // tolerate prose, "=" / ":", and markdown table cells (| production bundle | `index-….js` |)
      /production bundle[^A-Za-z0-9]{0,8}(index-[A-Za-z0-9_-]+\.js)/i
    );
    if (!claimedMatch) {
      fail('HANDOFF does not state a current production bundle (expected "production bundle = index-….js")');
    }
    const claimed = claimedMatch[1];
    const res = await fetch(PROD_URL, {
      headers: {
        'User-Agent':
          process.env.WIKIMEDIA_USER_AGENT ||
          'WikiBento docs-facts check (https://github.com/fuzheado/wikibento)',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status !== 200) fail(`production returned HTTP ${res.status}`);
    const html = await res.text();
    const served = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    if (!served) fail('could not find a bundle reference in production HTML');
    if (served[1] !== claimed) {
      fail(`HANDOFF claims ${claimed}, production serves ${served[1]} — update HANDOFF (or deploy)`);
    }
    results.push({ name: LIVE_NAME, ok: true, detail: `${claimed} — matches production (HTTP 200)` });
  } catch (err) {
    results.push({ name: LIVE_NAME, ok: false, detail: `could not verify against production: ${err.message}` });
  }
}

// ── report ──────────────────────────────────────────────────────────────────

for (const r of results) {
  console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(
  `\n${failed.length ? 'DOCS-FACTS FAIL' : 'DOCS-FACTS PASS'} — ${results.length - failed.length}/${results.length} checks` +
    (LIVE ? ' (incl. --live)' : '')
);
if (failed.length) process.exitCode = 1;
