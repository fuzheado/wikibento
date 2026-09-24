#!/usr/bin/env node
/**
 * Load the BUILT app, not just build it.
 *
 * Why this exists (2026-09-24, ISSUE-114): a feature was written, unit-tested, built successfully — and then reverted,
 * because in the *built* bundle it threw `ReferenceError: Cannot access '…' before initialization`. A
 * module-initialisation cycle is a bundle-time property: the test suite passes, `node --check` passes, `vite build`
 * prints "built in 179ms", and the dev server renders. Only loading the built output sees it. Every gate we had
 * stopped one step short of the artefact we actually ship.
 *
 * So: build, then LOAD. Start a preview server, open a board in a real browser, and require that the app rendered
 * cards and logged nothing. That is the smallest check that would have caught it.
 *
 *   node scripts/smoke-built.mjs                        # build must already exist; one light board
 *   node scripts/smoke-built.mjs --boards demos.json,glam-demo.json
 *   node scripts/smoke-built.mjs --base http://localhost:4173   # use a server you started yourself
 *   node scripts/smoke-built.mjs --engine webkit --port 4400
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { chromium, firefox, webkit } from 'playwright';

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const BOARDS = String(arg('boards', 'demos.json')).split(',').map((s) => s.trim()).filter(Boolean);
const ENGINE = arg('engine', 'chromium');
const FIXED_BASE = arg('base', null);
const TIMEOUT_MS = Number(arg('timeout', 45000));

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.on('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

async function waitForServer(base, timeoutMs = 30000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(base, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

let server = null;
let base = FIXED_BASE;
const problems = [];
try {
  if (!base) {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    // Bind the family we probe: `vite preview` defaults to `localhost`, which resolves to ::1 first on macOS,
    // so polling 127.0.0.1 never sees the server. (A shell-mangled comment once swallowed the line below.)
    server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', () => {});
    server.stderr.on('data', (d) => { const t = String(d); if (/error/i.test(t)) problems.push(`preview: ${t.slice(0, 120)}`); });
    if (!(await waitForServer(base))) {
      console.error(`  ✘ preview server never answered at ${base}`);
      process.exit(1);
    }
  }

  // Is there actually a build to load? A missing dist/ is a real failure here, not a skip.
  const index = await fetch(`${base}/`);
  if (!index.ok) problems.push(`index.html: HTTP ${index.status}`);
  const html = await index.text();
  const bundle = (html.match(/assets\/index-[\w-]+\.js/) || [])[0];
  if (!bundle) problems.push('index.html references no bundle');

  const engines = { chromium, firefox, webkit };
  const browser = await engines[ENGINE].launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 120)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text().slice(0, 110)}`); });

    for (const board of BOARDS) {
      pageErrors.length = 0;
      const url = `${base}/?config=/${board}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-widget-id]', { timeout: TIMEOUT_MS });
      } catch (e) {
        problems.push(`${board}: ${/Timeout/.test(String(e)) ? 'no cards rendered within the timeout' : String(e).slice(0, 100)}`);
      }
      const cards = await page.locator('[data-widget-id]').count().catch(() => 0);
      if (!cards) problems.push(`${board}: 0 cards`);
      // The first error is the one that matters; the rest are usually its cascade.
      if (pageErrors.length) problems.push(`${board}: ${pageErrors[0]}`);
      console.log(`  ${cards && !pageErrors.length ? '✅' : '❌'} ${board.padEnd(30)} ${String(cards).padStart(3)} cards · ${pageErrors.length ? pageErrors[0] : 'no page errors'}`);
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  problems.push(`harness: ${String(e.message || e).slice(0, 140)}`);
} finally {
  if (server) server.kill('SIGTERM');
}

if (problems.length) {
  console.error(`\n  BUILT-ARTEFACT SMOKE FAILED — the build is not a working app:`);
  for (const p of new Set(problems)) console.error(`    ✘ ${p}`);
  console.error('    (this is the check that catches bundle-time failures: cycles, use-before-init, bad imports)');
  process.exit(1);
}
console.log(`  ✔ built artefact loads: ${BOARDS.length} board(s) rendered, no page errors`);
