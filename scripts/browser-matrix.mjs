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
 * REQUIRES: engines installed once via the playwright CLI
 *   (`playwright-cli install-browser firefox webkit`), playwright-core is a
 *   devDependency.
 */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

// Resolve playwright-core: repo node_modules first (devDependency), then the
// global playwright-cli bundle.
let chromium, firefox, webkit;
try {
  ({ chromium, firefox, webkit } = require('playwright-core'));
} catch {
  const cliPath = '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core';
  ({ chromium, firefox, webkit } = require(cliPath));
}

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const URL_TO_TEST = arg('url', 'https://wikibento.toolforge.org/?config=https://wikibento.toolforge.org/params-demo.json');
const WAIT_MS = parseInt(arg('wait', '15000'), 10);
const ENGINES = arg('engines', 'chromium,firefox,webkit').split(',').map((s) => s.trim());

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
];
const isBenignConsole = (text) => BENIGN_CONSOLE.some((re) => re.test(text));

const LAUNCHERS = { chromium, firefox, webkit };

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
      browser = await launch.launch({ headless: true });
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
