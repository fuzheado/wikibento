#!/usr/bin/env node
/**
 * Cross-browser matrix test (Firefox / Chromium / WebKit) — the browser
 * constitution for WikiBento.
 *
 * WHY THIS EXISTS (2026-09-03): a `User-Agent` header on every browser fetch
 * made Firefox and WebKit preflight every RESTBase/CIM request — Wikimedia's
 * REST endpoints reject `user-agent` in the preflight allow-list (and the CIM
 * service 405s OPTIONS outright) — so ~10 widgets died with NetworkError in
 * Firefox and "Load failed" in Safari while Chrome worked. Chromium strips the
 * forbidden header pre-preflight (spec-compliant), masking the bug. See
 * docs/BUG-REPORT-ios-safari-fetch.md + docs/ISSUES.md ISSUE-48-era notes.
 *
 * WHAT IT DOES: loads a dashboard URL in each engine, waits, then reports
 * per engine: widgets rendered, widget error frames, console/page errors.
 * Exit code 1 if any engine shows widget errors or console errors.
 *
 * USAGE:
 *   node scripts/browser-matrix.mjs [options]
 *     --url <url>      dashboard to load (default: prod + params-demo.json)
 *     --wait <ms>      settle time after load (default 15000)
 *     --engines <list> comma list (default: chromium,firefox,webkit)
 *
 * REQUIRES: engines installed once with the SAME playwright-core that runs this
 *   script (it is a devDependency here) — installing with a different
 *   playwright-core is the #1 cause of "Executable doesn't exist", because each
 *   copy pins its own engine revisions:
 *     node node_modules/playwright-core/cli.js install firefox webkit chromium
 *   NOT `playwright-cli install-browser …`: that global CLI takes ONE engine per
 *   invocation and installs ITS revisions (2026-09-11, this machine: the repo's
 *   playwright-core 1.59.1 wants chromium-1217 / firefox-1511 / webkit-2272,
 *   while the global @playwright/cli bundles 1.61.0-alpha wanting chromium-1224 /
 *   firefox-1522 / webkit-2287 — following the global-CLI form leaves the matrix
 *   still broken). Also NEVER `npx playwright install <subset>`: it prunes the
 *   engines you did not name.
 *
 * ENV:
 *   PW_WS_ENDPOINTS   run an engine on another host (see scripts/remote-browser-daemon.mjs)
 *   PW_WS_HOST        rewrite the localhost a remote daemon advertises
 *   PW_EXECUTABLE_<ENGINE>
 *                     launch that engine through an explicit executable instead of the
 *                     bundled launcher. Example: WebKit on Debian 13 arm64 runs from a
 *                     userspace dependency prefix via a launcher script, because the
 *                     bundle's own wrapper overwrites LD_LIBRARY_PATH:
 *                       PW_EXECUTABLE_WEBKIT=/opt/data/browser-test/webkit-launcher.sh \
 *                         node scripts/browser-matrix.mjs --engines webkit
 *                     Scope it to the single command (or a wrapper script) — do NOT
 *                     export browser env globally; it leaks into other sessions.
 *                     Works on any host, not just the Debian/arm64 case above —
 *                     verified on macOS by pointing it at system Chrome:
 *                       PW_EXECUTABLE_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *                         node scripts/browser-matrix.mjs --engines chromium
 */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

// Resolve playwright-core: repo node_modules first (devDependency), then the
// global playwright-cli bundle.
let chromium, firefox, webkit, devices;
try {
  ({ chromium, firefox, webkit, devices } = require('playwright-core'));
} catch {
  const cliPath = '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core';
  ({ chromium, firefox, webkit, devices } = require(cliPath));
}

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const URL_TO_TEST = arg('url', 'https://wikibento.toolforge.org/?config=https://wikibento.toolforge.org/params-demo.json');
const WAIT_MS = parseInt(arg('wait', '15000'), 10);
const ENGINES = arg('engines', 'chromium,firefox,webkit').split(',').map((s) => s.trim());

/* ── the demo sweep (ISSUE-100) ───────────────────────────────────────────────────────────────────────────
 * WHY: this script used to load ONE board — `params-demo.json` — on three engines, so "we test in three
 * browsers" was true of exactly one demo, at one width, and nothing else. A phone-only failure therefore had
 * nowhere to show up (`?config=/click-through-demo.json` renders an empty 📰 box on iOS: the phone stack
 * collapsed every card body to zero height, and Wikipedia strips navboxes for mobile clients).
 *
 *   node scripts/browser-matrix.mjs --demos                       # every public/*-demo.json + the hub
 *   node scripts/browser-matrix.mjs --demos --base http://localhost:5199
 *   node scripts/browser-matrix.mjs --demos --viewports phone --engines webkit
 *   node scripts/browser-matrix.mjs --demos --require-relay        # sweeping a host that has /api/proxy
 *
 * Each (board × engine × viewport) is checked for: a card per widget in the board, no error frames, no console
 * errors, and **no collapsed card** — a body whose content renders at zero height (the phone-stack bug).
 * `--require-relay` additionally fails a card that fell back to the "Wikipedia reduced this for phones" notice,
 * which is correct behaviour on a host with no relay and a regression on one that has it.
 */
const DEMOS = args.includes('--demos');
const BASE = arg('base', 'https://wikibento.toolforge.org').replace(/\/$/, '');
const VIEWPORTS = arg('viewports', 'desktop,phone').split(',').map((s) => s.trim());
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4'), 10));
const REQUIRE_RELAY = args.includes('--require-relay');
const ONLY_BOARDS = (arg('boards', '') || '').split(',').map((s2) => s2.trim()).filter(Boolean);
const DEMO_WAIT = parseInt(arg('wait', String(WAIT_MS)), 10);

const PHONE = { ...(devices['iPhone 14'] || { viewport: { width: 390, height: 844 } }) };
const VIEWPORT_SETTINGS = { desktop: {}, phone: PHONE }

// Remote-engine support: PW_WS_ENDPOINTS="webkit=ws://host:port/…,chromium=ws://…"
// When an engine has a ws endpoint here, connect() to it instead of launching
// locally — lets the WebKit leg run on a Mac/other host (see
// scripts/remote-browser-daemon.mjs).
const WS_ENDPOINTS = Object.fromEntries(
  (process.env.PW_WS_ENDPOINTS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq > 0 ? [pair.slice(0, eq).trim(), pair.slice(eq + 1).trim()] : null;
    }).filter(Boolean),
);
// launchServer endpoints advertise localhost/127.0.0.1 (the daemon's own
// loopback) — a REMOTE client must point the host at the daemon machine.
// Set PW_WS_HOST to the daemon's reachable address to rewrite it.
const WS_HOST = process.env.PW_WS_HOST || '';

// Per-engine executable override: PW_EXECUTABLE_WEBKIT=/path/to/launcher.sh
// (the variable name is PW_EXECUTABLE_ + the upper-cased engine). Needed where the
// bundled browser wrapper cannot be used as-is — e.g. WebKit on Debian 13 arm64, which
// runs from a userspace dependency prefix through a launcher script. Unset for an
// engine = the bundled launcher, i.e. exactly the previous behaviour.
const EXECUTABLES = Object.fromEntries(
  ENGINES.map((e) => [e, process.env[`PW_EXECUTABLE_${e.toUpperCase()}`] || '']),
);
const remoteWs = (engine) => {
  let url = WS_ENDPOINTS[engine];
  if (WS_HOST && /^ws:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(url)) {
    url = url.replace(/^ws:\/\/(localhost|127\.0\.0\.1)/, `ws://${WS_HOST}`);
  }
  return url;
};

// Known-benign console errors (checked 2026-09-03): top.hatnote.com has no CORS —
// the widget tries direct, gets blocked, and falls back to the WMF endpoint /
// same-origin proxy (docs/DATA-SOURCES.md §8); bare 404 resource loads are
// missing thumbnails/optional probes. These are reported but don't fail the run.
const BENIGN_CONSOLE = [
  /top\.hatnote\.com/,               // no-CORS source — widget falls back to proxy/WMF endpoint
  /net::ERR_FAILED/,                 // companion log of the blocked hatnote request
  /Failed to load resource.*404/,    // missing optional thumbnails / expected 404 probes
  /the server responded with a status of 404/,
  /the server responded with a status of 50[23]/, // transient upstream gateway errors — fetchTextWithRetry retries; widget-level errors gate this suite
  /Refused to connect.*top\.hatnote\.com/,                       // WebKit CSP-report phrasing of the hatnote block
  /is not allowed by Access-Control-Allow-Origin\. Status code: 404/, // WebKit phrasing of a 404 probe
  // WebKit's own media controls, phone profile only ("invalid-placard" is an internal WebKit resource name):
  // it is the engine failing to draw its own native controls, not the app.
  /Button failed to load, iconName =/,
  // `allow-presentation` IS a valid sandbox token in the HTML spec; WebKit has not implemented it and says so on
  // every iOS/WebKit load of the 📄 document reader's iframe. Pinned to the app's own sandbox value.
  /sandbox. attribute: 'allow-presentation' is an invalid sandbox flag/,
  // Toolforge itself sends `content-security-policy-report-only` listing Wikimedia hosts only (report-uri
  // csp-report.toolforge.org), while this app deliberately talks to Internet Archive and hatnote. REPORT-ONLY
  // means nothing is blocked — WebKit logs one line per violation, for connect-src, media-src, img-src, frame-src
  // alike. The boundary that matters: `[Report Only]` is the platform's advisory, so it is allowed here; a
  // refusal WITHOUT that marker is an enforced policy and still fails the run.
  /\[Report Only\] Refused to /,
  // A 429 from WDQS/Commons, provoked by the sweep's own concurrency (64 page loads against one endpoint). The
  // app's retry layer is the documented handling, and the OUTCOME stays checked separately: a widget that fails
  // to load is caught by the error-frame assertion, which does not depend on console counts. Not benign in
  // general — only as a console line here.
  /the server responded with a status of 429/,
];

/** Upstream 500s (archive.org's media CDN served one during a sweep) are not ours to fix, and the console line
 *  carries no URL to scope by. So they are demoted AFTER the fact, and only when nothing actually broke: no error
 *  frame, no collapsed card, and the expected number of cards. A 500 from OUR server that mattered would fail one
 *  of those three checks — which is how the duplicate-import blank page was caught in the first place. */
const isUpstream500 = (text) => /status of 500\b/.test(text);
const isBenignConsole = (text) => BENIGN_CONSOLE.some((re) => re.test(text));

const LAUNCHERS = { chromium, firefox, webkit };

/** One board in one engine at one viewport, with the checks that matter for a *demo*: every card present,
 *  nothing collapsed, no errors, and (optionally) no relay-degraded box. */
async function runOne(launch, engine, boardName, viewportName, expectedCards) {
  const row = { engine, board: boardName, viewport: viewportName, cards: 0, expected: expectedCards,
    collapsed: [], consoleErrors: 0, benignConsole: 0, errors: [], notes: [] };
  let browser; let context;
  try {
    const exe = EXECUTABLES[engine];
    if (WS_ENDPOINTS[engine]) browser = await launch.connect(remoteWs(engine));
    else browser = await launch.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    context = await browser.newContext(VIEWPORT_SETTINGS[viewportName] || {});
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      if (isBenignConsole(msg.text())) row.benignConsole += 1;
      else { row.consoleErrors += 1; if (row.errors.length < 3) row.errors.push(msg.text().slice(0, 120)); }
    });
    page.on('pageerror', (e) => {
      row.consoleErrors += 1;
      if (row.errors.length < 3) row.errors.push('PAGEERROR: ' + String(e.message).slice(0, 110));
    });
    await page.goto(`${BASE}/?config=/${boardName}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(DEMO_WAIT);
    const seen = await page.evaluate(() => {
      const out = { cards: 0, collapsed: [], degraded: [], errorFrames: [], placeholders: [] };
      const frames = [...document.querySelectorAll('.widget-frame')];
      out.cards = frames.length;
      for (const f of frames) {
        const id = f.closest('[data-widget-id]')?.getAttribute('data-widget-id') || '?';
        const body = f.querySelector('.widget-body');
        if (!body) continue;
        // A collapsed card: content exists in the DOM but paints at zero height. The phone-stack bug left the
        // body at 0px while the data was fully rendered — invisible to a text-only assertion.
        if (body.scrollHeight < 20 && body.querySelector('*')) out.collapsed.push(`${id}:${body.scrollHeight}px`);
        if (/reduced version of this box/i.test(body.textContent || '')) out.degraded.push(id);
        // A card that renders its EMPTY state instead of data: no error, no collapse, nothing in the console —
        // just "—" where a number belongs. This is how the pageviews default-mode bug survived (2026-09-18): the
        // renderer drew a trend payload as a stat card, so the demos looked fine to every other check here.
        const statValue = body.querySelector('.stat-value');
        if (statValue && /^[—–-]+$/.test((statValue.textContent || '').trim())) out.placeholders.push(id);
        if (/Retry|Load failed|NetworkError|fetch failed/i.test(f.textContent || '')) out.errorFrames.push(id);
      }
      return out;
    });
    Object.assign(row, seen);
  } catch (e) {
    row.errors.push('LAUNCH/NAV: ' + String(e.message).slice(0, 110));
    row.cards = -1;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return row;
}

async function readDemoBoards() {
  const dir = new URL('../public/', import.meta.url);
  const { readdirSync, readFileSync } = await import('node:fs');
  return readdirSync(dir)
    .filter((f) => /-demo\.json$/.test(f) || f === 'demos.json')
    .sort()
    .map((f) => {
      let count = 0;
      try { count = (JSON.parse(readFileSync(new URL(f, dir), 'utf8')).widgets || []).length; } catch { /* reported on load */ }
      return { name: f, count };
    });
}

if (DEMOS) {
  const all = await readDemoBoards();
  const boards = ONLY_BOARDS.length
    ? all.filter((b) => ONLY_BOARDS.some((q) => b.name.includes(q)))
    : all;
  const jobs = [];
  for (const { name, count } of boards) {
    for (const engine of ENGINES) {
      const launch = LAUNCHERS[engine];
      if (!launch) continue;
      for (const viewport of VIEWPORTS) jobs.push({ launch, engine, name, count, viewport });
    }
  }
  console.log(`Demo sweep: ${boards.length} boards × ${ENGINES.length} engines × ${VIEWPORTS.length} viewports = ${jobs.length} runs (${CONCURRENCY} at a time)\n`);

  const rows = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      const row = await runOne(job.launch, job.engine, job.name, job.viewport, job.count);
      const problems = [];
      if (row.cards < 0) problems.push('did not load');
      else if (row.expected && row.cards !== row.expected) problems.push(`cards ${row.cards}≠${row.expected}`);
      if (row.collapsed.length) problems.push(`collapsed: ${row.collapsed.join(', ')}`);
      // …see isUpstream500: a console 500 with nothing broken is an upstream CDN hiccup, not a regression.
      if (row.consoleErrors && row.errors.length && row.errors.every(isUpstream500)
          && !row.errorFrames.length && !row.collapsed.length && row.cards === row.expected) {
        row.benignConsole += row.consoleErrors;
        row.consoleErrors = 0;
        row.notes.push('upstream 500 (nothing failed)');
      }
      if (row.errorFrames.length) problems.push(`error frames: ${row.errorFrames.join(', ')}`);
      if (row.placeholders.length) problems.push(`shows no value: ${row.placeholders.join(', ')}`);
      if (row.consoleErrors) problems.push(`${row.consoleErrors} console error(s)`);
      if (REQUIRE_RELAY && row.degraded.length) problems.push(`no-relay fallback: ${row.degraded.join(', ')}`);
      row.status = problems.length ? '❌' : '✅';
      row.why = problems.join(' · ');
      rows.push(row);
      console.log(`${row.status} ${row.board.padEnd(28)} ${row.engine.padEnd(9)} ${row.viewport.padEnd(8)} cards=${String(row.cards).padStart(2)}${row.why ? '  ' + row.why : ''}${!row.why && row.degraded.length ? '  (relay degraded: ' + row.degraded.join(',') + ')' : ''}`);
      for (const e of row.errors.slice(0, 2)) console.log(`      └ ${e}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const failed = rows.filter((r) => r.status === '❌');
  const degraded = rows.filter((r) => !r.status.startsWith('❌') && r.degraded.length);
  console.log(`\nDemo sweep summary: ${rows.length - failed.length}/${rows.length} clean · ${failed.length} failing · ${degraded.length} with a relay-degraded box`);
  if (degraded.length) {
    console.log('  (a relay-degraded box is correct on a host with no /api/proxy — pass --require-relay when sweeping one that has it)');
  }
  process.exit(failed.length ? 1 : 0);
}

const results = [];
let hadFailure = false;

for (const engine of ENGINES) {
  const launch = LAUNCHERS[engine];
  if (!launch) {
    console.log(`⚠ ${engine}: unknown engine, skipping`);
    continue;
  }
  const row = { engine, url: URL_TO_TEST, widgets: 0, widgetErrors: 0, consoleErrors: 0, benignConsole: 0, samples: [], consoleSamples: [], remote: Boolean(WS_ENDPOINTS[engine]) };
  let browser;
  try {
    if (WS_ENDPOINTS[engine]) {
      browser = await launch.connect(remoteWs(engine)); // remote engine (daemon host)
    } else {
      const exe = EXECUTABLES[engine];
      browser = await launch.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) });
    }
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        if (isBenignConsole(msg.text())) row.benignConsole += 1;
        else {
          row.consoleErrors += 1;
          if (row.consoleSamples.length < 5) row.consoleSamples.push(msg.text().slice(0, 140));
        }
      }
    });
    page.on('pageerror', (e) => {
      row.consoleErrors += 1;
      if (row.consoleSamples.length < 5) row.consoleSamples.push(`PAGEERROR: ${String(e.message).slice(0, 140)}`);
    });
    await page.goto(URL_TO_TEST, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(WAIT_MS);
    row.widgets = await page.evaluate(() => document.querySelectorAll('.widget-frame').length);
    row.widgetErrors = await page.evaluate(() =>
      [...document.querySelectorAll('.widget-frame')]
        .filter((f) => /Retry|Load failed|NetworkError|fetch failed/i.test(f.textContent)).length,
    );
    row.samples = await page.evaluate(() =>
      [...document.querySelectorAll('.widget-frame')]
        .filter((f) => /Retry|Load failed|NetworkError|fetch failed/i.test(f.textContent))
        .map((f) => (f.querySelector('.widget-title')?.textContent || '').trim().slice(0, 40)),
    );
  } catch (e) {
    row.widgetErrors = -1;
    row.samples = [`LAUNCH/NAV ERROR: ${String(e.message).slice(0, 120)}`];
  } finally {
    await browser?.close().catch(() => {});
  }

  const ok = row.widgets > 0 && row.widgetErrors === 0 && row.consoleErrors === 0;
  if (!ok) hadFailure = true;
  const status = ok ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}  ${engine.padEnd(9)} widgets=${row.widgets}  widgetErrors=${row.widgetErrors}  consoleErrors=${row.consoleErrors}${row.benignConsole ? ` (+${row.benignConsole} benign)` : ''}`);
  for (const s of row.samples) console.log(`          └ ${s}`);
  for (const s of row.consoleSamples) console.log(`          └ console: ${s}`);
  results.push(row);
}

console.log('\nBrowser matrix summary:');
console.table(results.map(({ engine, widgets, widgetErrors, consoleErrors, benignConsole }) => ({ engine, widgets, widgetErrors, consoleErrors, benignConsole })));
process.exit(hadFailure ? 1 : 0);
