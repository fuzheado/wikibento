/**
 * Wayback tile states end-to-end check.
 *
 * Boots the BUILT app *with the repo's own server* (so /api/wayback-gallery is exercised, not the
 * static-host fallback), renders a board whose only card is a 4-date waybackGallery, and asserts
 * what a user can actually see while the archive is slow:
 *
 *   · the capture-count line (from the server's best-effort sparkline total)
 *   · an elapsed-time clock while a tile waits (the archive exposes no progress signal)
 *   · tiles mounting one at a time, not four at once
 *   · an escape hatch ("Open in Wayback ↗") on every waiting tile, with no dead ends
 *   · every tile ending in a terminal state (loaded / gave up / proven absent)
 *
 * Nothing here is pinned to a specific capture date or duration: the archive is variable by nature
 * (cdx.remote measured 7.8 s → 66.2 s for comparable captures — docs/WAYBACK-REPLAY-LATENCY.md).
 *
 * Usage: npm run build && node scripts/wayback-states-e2e.mjs [--port 8996]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install first');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8996;
const BASE = `http://127.0.0.1:${PORT}`;
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const cfg = {
  version: 1,
  widgets: [
    {
      id: 'wb-e2e',
      widgetType: 'waybackGallery',
      config: {
        title: 'Wayback states E2E',
        url: 'en.wikipedia.org/wiki/Wikipedia',
        dates: '2010-01-01\n2015-01-01\n2020-01-01\n2024-01-01',
        toleranceDays: 30,
        refreshSeconds: 86400,
      },
    },
  ],
  layout: [{ i: 'wb-e2e', x: 0, y: 0, w: 12, h: 10 }],
};
const cfgPath = join(dist, 'wayback-e2e.json');
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('node', [join(root, 'deploy', 'server.js')], {
  cwd: root, stdio: 'ignore',
  env: { ...process.env, PORT: String(PORT), WIKIBENTO_ROOT: dist },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${BASE}/index.html`)).ok) { up = true; break; } } catch { /* not up yet */ }
  await wait(250);
}
if (!up) { console.error('server never came up'); server.kill(); process.exit(2); }

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  // Archived pages throw their own errors (a 2010 Wikipedia snapshot references jQuery and
  // addOnloadHook that no longer resolve), and Playwright reports them here. Only OUR errors
  // count: attribute each one by origin so the archive's noise can't mask a real bug.
  const errors = [];
  const archivedErrors = [];
  page.on('pageerror', (e) => {
    const where = `${e.stack || ''}`;
    const bucket = where.includes('127.0.0.1') || where.includes('/assets/') ? errors : archivedErrors;
    bucket.push(e.message.slice(0, 120));
  });

  await page.goto(`${BASE}/?config=wayback-e2e.json`, { waitUntil: 'domcontentloaded' });

  // The lookup runs server-side first (measured 7–35 s depending on the archive), so wait for the
  // card to exist at all, then watch the tiles.
  await page.waitForSelector('.wayback-card', { timeout: 120000 });
  await page.waitForSelector('.wayback-tile', { timeout: 60000 });

  const counts = await page.evaluate(() => {
    const el = document.querySelector('.wayback-counts');
    return el ? el.innerText.trim() : null;
  });
  check('capture-count line shows the archive total', Boolean(counts && /\d/.test(counts)), counts || 'missing');

  // Staggering: right after the card appears, the tiles beyond the first must not have mounted.
  const earlyFrames = await page.evaluate(() => document.querySelectorAll('.wayback-shot iframe').length);
  check('tiles mount one at a time (not all four at once)', earlyFrames < 4, `${earlyFrames} iframe(s) at first paint`);

  const status1 = await page.evaluate(() => {
    const el = document.querySelector('.wayback-status .wayback-status-text');
    return el ? el.innerText.trim() : null;
  });
  const hasClock1 = Boolean(status1 && /\d+\s*s/.test(status1));
  await page.waitForTimeout(3200);
  const status2 = await page.evaluate(() => {
    const el = document.querySelector('.wayback-status .wayback-status-text');
    return el ? el.innerText.trim() : null;
  });
  const secs = (s) => (s ? Number((s.match(/(\d+)\s*s/) || [])[1] || -1) : -1);
  check('a waiting tile shows an elapsed clock', hasClock1 || secs(status2) > 0,
    `"${status1 || '(none)'}" → "${status2 || '(none)'}"`);
  check('the clock advances (the wait is visibly alive)', secs(status2) > secs(status1),
    `${secs(status1)} s → ${secs(status2)} s`);

  const escape = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.wayback-status a.wayback-btn-link'));
    return links.map((a) => a.getAttribute('href'));
  });
  check('every waiting tile offers an escape hatch to the archive',
    escape.length > 0 && escape.every((h) => /^https:\/\/web\.archive\.org\/web\//.test(h || '')),
    `${escape.length} link(s)${escape[0] ? `, e.g. ${escape[0].slice(0, 62)}…` : ''}`);

  // Watch until every tile is terminal (loaded, or an overlay that offers a way out), max 120 s.
  const deadline = Date.now() + 120000;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('.wayback-tile'));
      return tiles.map((t) => {
        const overlay = t.querySelector('.wayback-status');
        const text = overlay ? (overlay.querySelector('.wayback-status-text') || {}).innerText || '' : '';
        return {
          loaded: Boolean(t.querySelector('.wayback-shot iframe')) && !overlay,
          overlay: text.trim(),
          missing: Boolean(t.querySelector('.wayback-missing')),
          retry: Boolean(t.querySelector('.wayback-status button.wayback-btn')),
        };
      });
    });
    const settled = snapshot.filter((t) => t.loaded || t.missing || /still loading|gave up|retry/i.test(t.overlay));
    if (settled.length === snapshot.length && snapshot.length === 4) break;
    await wait(3000);
  }

  const loaded = snapshot.filter((t) => t.loaded).length;
  const missing = snapshot.filter((t) => t.missing).length;
  const waiting = snapshot.filter((t) => t.overlay && !t.loaded);
  console.log(`   ↳ tiles: ${loaded} loaded · ${missing} no-capture · ${waiting.length} still waiting`);
  for (const t of waiting) console.log(`     waiting: "${t.overlay}"${t.retry ? ' [retry offered]' : ''}`);
  check('no tile is a dead end (loaded, absent, or offers retry / escape)',
    snapshot.every((t) => t.loaded || t.missing || t.retry),
    `${snapshot.length} tiles inspected`);
  check('at least one tile actually rendered a capture', loaded > 0, `${loaded}/4 loaded`);
  check('no page errors from our own code', errors.length === 0, errors.join(' | ').slice(0, 160) || 'none');
  if (archivedErrors.length) {
    console.log(`   ↳ (${archivedErrors.length} error(s) from inside the archived pages themselves — expected: ` +
      `${archivedErrors[0].slice(0, 70)}…)`);
  }

  await page.screenshot({ path: join(root, 'wayback-states-e2e.png'), fullPage: false });
  console.log('   ↳ screenshot: wayback-states-e2e.png');
} finally {
  await browser.close();
  server.kill('SIGTERM');
  rmSync(cfgPath, { force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length ? '✘' : '✔'} ${failed.length ? 'FAIL' : 'PASS'} — ${results.length - failed.length}/${results.length} assertions`);
process.exit(failed.length ? 1 : 0);
