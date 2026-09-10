/**
 * Share-mode end-to-end check (ISSUE-67).
 *
 * Proves the whole journey, not just the string: open a board, hit Share, flip
 * the mode toggle, read the URL the panel hands out, screenshot the QR that is
 * actually rendered, then BOOT the URL the QR encodes and assert the app lands
 * in the right mode (lean = no editor chrome, full = editable).
 *
 * Usage: npm run build && node scripts/share-lean-e2e.mjs [--port 8994]
 * The PNG written here (`share-qr-lean.png`) can be decoded with any QR reader,
 * e.g.  uv run --with opencv-python-headless --with numpy python -c \
 *         "import cv2;print(cv2.QRCodeDetector().detectAndDecode(cv2.imread('share-qr-lean.png'))[0])"
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
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
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8994;
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', join(root, 'dist')],
  { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(`${BASE}/index.html`)).ok) break;
  } catch { /* not up yet */ }
  await wait(250);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));

  // A hosted ?config= board is the realistic case: the QR encodes the short URL.
  await page.goto(`${BASE}/?config=params-demo.json`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.grid-item', { timeout: 15000 });

  const headerVisibleFull = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.app-header')).display !== 'none');
  check('baseline: board loads with editor chrome', headerVisibleFull);

  await page.click('button[title^="Share via QR"]');
  await page.waitForSelector('.share-panel');

  const fullUrl = await page.inputValue('.share-link-input');
  check('share panel defaults to Full (no lean param)', !fullUrl.includes('lean=1'), fullUrl.slice(0, 90));
  check('QR rendered for the full link', await page.locator('.share-qr-card svg').count() === 1,
    `${fullUrl.length} chars`);

  // Flip to Lean.
  await page.click('.share-mode-btn:nth-of-type(2)');
  await page.waitForTimeout(150);
  const leanUrl = await page.inputValue('.share-link-input');
  check('lean toggle rewrites the copyable link', leanUrl.includes('lean=1'), leanUrl.slice(0, 110));
  check('lean link keeps the ?config= target',
    new URL(leanUrl).searchParams.get('config') === 'params-demo.json');
  check('full and lean links differ', fullUrl !== leanUrl);
  check('QR re-rendered for the lean link', await page.locator('.share-qr-card svg').count() === 1);
  const hint = await page.textContent('.share-qr-hint');
  check('QR caption names the mode it encodes', /lean/i.test(hint), hint.trim().slice(0, 70));
  const modeHint = await page.textContent('.share-mode-hint');
  check('mode hint explains how to leave lean', /exit|esc/i.test(modeHint), modeHint.trim().slice(0, 70));

  const qrPng = join(root, 'share-qr-lean.png');
  await page.locator('.share-qr-card').screenshot({ path: qrPng });
  console.log(`   ↳ QR image written: ${qrPng}`);

  // THE test: boot the URL the QR encodes.
  await page.goto(leanUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.grid-item', { timeout: 15000 });
  const lean = await page.evaluate(() => ({
    cls: document.querySelector('.app').className,
    headerDisplay: getComputedStyle(document.querySelector('.app-header')).display,
    exitVisible: !!document.querySelector('.kiosk-exit')
      && getComputedStyle(document.querySelector('.kiosk-exit')).display !== 'none',
  }));
  check('scanned link boots in lean mode', /\blean\b/.test(lean.cls), `class="${lean.cls}"`);
  check('lean hides the editor toolbar (no Share/Add buttons)', lean.headerDisplay === 'none',
    `app-header display: ${lean.headerDisplay}`);
  check('lean shows the ✕ Exit way out', lean.exitVisible);

  // And the Full link must NOT land anyone in a presentation mode.
  await page.goto(fullUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('.grid-item', { timeout: 15000 });
  const fullState = await page.evaluate(() => ({
    cls: document.querySelector('.app').className,
    headerDisplay: getComputedStyle(document.querySelector('.app-header')).display,
  }));
  check('full link boots editable (chrome visible)',
    !/\blean\b/.test(fullState.cls) && fullState.headerDisplay !== 'none', `class="${fullState.cls}"`);

  check('no page errors', errors.length === 0, errors.join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? '✘ FAIL' : '✔ PASS'} — ${results.length - failed.length}/${results.length} assertions`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
}
