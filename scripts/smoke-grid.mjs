#!/usr/bin/env node
/**
 * Grid-geometry smoke test — boots the built app and asserts the rendered grid
 * matches the intended formulas, so a silent dependency drift (react-grid-layout
 * moving a prop into an object, e.g. `rowHeight`/`dragConfig`/`gridConfig`)
 * surfaces as a red exit instead of a mystery.
 *
 * Drives **playwright-core** directly (the repo devDependency), the same way
 * scripts/browser-matrix.mjs and scripts/smoke-panels.mjs do. It used to drive the
 * globally installed `playwright-cli`, which made this suite depend on a global
 * tool being present *and* able to launch its own engine build — on a machine
 * where the global CLI's bundled Chromium revision is absent it silently falls
 * back to system Google Chrome, so "chromium" meant different binaries across
 * suites (fixed 2026-09-11). PW_EXECUTABLE_CHROMIUM still overrides the binary.
 *
 * Requires: dist/ built (npm run build), network for the live widget APIs.
 *
 * Checks:
 *  1. Starter widget density: h:4 item must measure 4×80 + 3×12 = 356px
 *  2. A gallery added through the real Add Widget UI lands full-width (w:12)
 *  3. Its auto-fit height lands inside the documented clamp (3..14)
 *  4. Rendered height matches h×80 + (h−1)×12 — i.e. rowHeight really reaches
 *     the grid, which is the exact drift this guards
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Resolve playwright-core: repo node_modules first (devDependency), then the
// global playwright-cli bundle (see scripts/browser-matrix.mjs for the same
// fallback rationale).
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  const candidates = [
    process.env.PLAYWRIGHT_CORE_PATH,
    '/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core',
    '/usr/local/lib/node_modules/@playwright/cli/node_modules/playwright-core',
    join(process.env.HOME || '', '.npm-global/lib/node_modules/@playwright/cli/node_modules/playwright-core'),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error('playwright-core not found — run npm install (it is a devDependency)');
    process.exit(2);
  }
  ({ chromium } = require(found));
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8977;
const BASE = `http://localhost:${PORT}`;
const itemHeight = (h) => h * 80 + (h - 1) * 12;

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const server = spawn('node', ['deploy/server.js'], {
  cwd: root,
  env: { ...process.env, WIKIBENTO_ROOT: join(root, 'dist'), PORT: String(PORT), WIKIBENTO_ASK_DISABLED: '1' },
  stdio: 'ignore',
});

let browser;
try {
  await sleep(1200);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PW_EXECUTABLE_CHROMIUM || undefined,
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/?smoke=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(2000);
  // Fresh board: clear the saved layout, then reload.
  await page.evaluate(() => localStorage.removeItem('wikibento-layout'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3500);

  // ── Check 1: starter widget density (the rowHeight-ignored detector) ──
  const starter = await page.evaluate(`(function(){
    const el = [...document.querySelectorAll('.react-grid-item')].find((g) => g.textContent.includes('Main Page'));
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  })()`);
  check('starter widget renders at intended density (h:4 = 356px)',
    starter !== null && Math.abs(starter - 356) <= 2,
    starter === null ? 'not found' : `${starter}px`);

  // ── Add an Article Gallery through the real UI ──
  await page.evaluate(`(function(){ [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Add Widget')).click(); return true; })()`);
  await sleep(1200);
  await page.evaluate(`(function(){
    [...document.querySelectorAll('.add-widget-item')].find((x) => x.textContent.includes('Article Gallery')).click();
    return true;
  })()`);
  // wait for images + auto-fit settle (gallery fetch can take several seconds)
  await sleep(9000);

  const g = await page.evaluate(`(function(){
    const el = [...document.querySelectorAll('.react-grid-item')].find((x) => x.textContent.includes('Albert Einstein'));
    const layout = JSON.parse(localStorage.getItem('wikibento-layout') || '{"layout":[]}').layout || [];
    const li = [...layout].reverse().find((x) => String(x.i).includes('gallery'));
    if (!el || !li) return null;
    const r = el.getBoundingClientRect();
    const container = document.querySelector('.react-grid-layout').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cw: Math.round(container.width), lw: li.w, lh: li.h };
  })()`);

  if (g) {
    check('new gallery lands full-width (w:12)', g.lw === 12, `layout w:${g.lw}`);
    check('gallery width fills the container', Math.abs(g.w - g.cw) <= 2, `${g.w} vs ${g.cw}px`);
    check('auto-fit height within clamp 3..14', g.lh >= 3 && g.lh <= 14, `h:${g.lh}`);
    check('rendered height matches h×80+(h−1)×12 (rowHeight reaches the grid)',
      Math.abs(g.h - itemHeight(g.lh)) <= 2, `${g.h}px vs ${itemHeight(g.lh)}px`);
  } else {
    check('new gallery found and measured', false, 'widget or layout not found');
  }
} catch (e) {
  console.error('smoke run failed:', e.message);
  failures.push('run');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

if (failures.length) {
  console.error(`\nSMOKE FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nSMOKE PASS — grid geometry matches the intended formulas.');
process.exit(0);
