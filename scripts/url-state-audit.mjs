/**
 * URL-state audit (ISSUE-87) — does the address bar still tell the truth after each action?
 *
 *   npm run smoke:url
 *
 * `docs/URL-STATE.md` decides, action by action, whether a thing belongs in the URL. This script is how
 * that decision stops being prose: it drives the real app, records the address bar and the board before
 * and after each action, and fails when the two disagree.
 *
 * The three invariants it enforces:
 *   C1  a board loaded from `?config=` keeps its claim while untouched, and LOSES it the moment the board
 *       is replaced (↺ Reset, ✨ Example, ⬆ Import) — otherwise the next reload resurrects a board the
 *       user threw away, which is the bug this started from;
 *   C1b a Share link always describes the board ON SCREEN — after an edit it must embed the board as
 *       `#/d/<payload>`, never echo a `?config=` that no longer matches;
 *   C2  present mode is opt-in and reversible: Exit strips the param, and entering present mode from a
 *       plain URL does not invent one (the *shared* link carries the mode — see presentModeUrl).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const candidate of ['playwright', '@playwright/test', join(process.cwd(), 'node_modules/playwright')]) {
    try { return require(candidate); } catch { /* keep looking */ }
  }
  throw new Error('playwright not found — npm i -D playwright');
}
const { chromium } = loadPlaywright();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8979;
// AUDIT_BASE=https://wikibento.toolforge.org npm run smoke:url — run the same invariants against a deploy
// (the audit only touches localStorage in the browser; it writes nothing to the server).
const REMOTE = process.env.AUDIT_BASE && process.env.AUDIT_BASE.replace(/\/$/, '');
const BASE = REMOTE || `http://localhost:${PORT}`;
const DEMO = '/document-reader-demo.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const rows = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}
const urlOf = (page) => {
  const u = new URL(page.url());
  return `${u.pathname}${u.search}${u.hash}`.replace(/^\/(?=\?|$|#)/, '/');
};
const cards = (page) => page.locator('[data-widget-id]').count();

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const server = REMOTE ? null : spawn('node', ['deploy/server.js'], {
  cwd: root,
  env: { ...process.env, WIKIBENTO_ROOT: join(root, 'dist'), PORT: String(PORT), WIKIBENTO_ASK_DISABLED: '1' },
  stdio: 'ignore',
});

let browser;
try {
  await sleep(1200);
  browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXECUTABLE_CHROMIUM || undefined });
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

  // ── 1. a URL-loaded board keeps its claim while untouched ────────────────────────────────────────
  await page.goto(`${BASE}/?config=${DEMO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(1200);
  const loadedCards = await cards(page);
  rows.push(['load ?config=<demo>', urlOf(page), `${loadedCards} cards`]);
  check('C1: an untouched ?config= board keeps its claim', urlOf(page).includes(`config=${DEMO}`), urlOf(page));
  check('the demo really loaded', loadedCards >= 5, `${loadedCards} cards`);

  // A quiet load must not count as an edit. This is the trap: react-grid-layout may normalize the layout on
  // mount, which would move the fingerprint and drop the claim on arrival — the demo URL would evaporate
  // before the user touched anything. Wait long enough for any such adjustment to have happened.
  await sleep(3000);
  check('C1: the claim survives a quiet load (no phantom "edit" on mount)',
    urlOf(page).includes(`config=${DEMO}`), urlOf(page));

  // ── 2. ↺ Reset must drop the claim (the reported bug) ────────────────────────────────────────────
  await page.click('button.btn-danger');
  await page.waitForSelector('button:has-text("Blank board")');
  await page.click('button:has-text("Blank board")');
  await sleep(900);
  const afterReset = urlOf(page);
  rows.push(['↺ Reset → Blank board', afterReset, `${await cards(page)} cards`]);
  check('C1: Reset drops the ?config= claim', !afterReset.includes('config='), afterReset);
  check('C1: Reset actually blanked the board', (await cards(page)) === 0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1800);
  rows.push(['reload after Reset', urlOf(page), `${await cards(page)} cards`]);
  check('C1: the blank board survives a reload (reset sticks)', (await cards(page)) === 0,
    'this was the reported symptom: the URL resurrected the board');

  // ── 3. the Share half: a link must describe the board on screen ──────────────────────────────────
  await page.goto(`${BASE}/?config=${DEMO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(1200);
  const before = await cards(page);
  await page.locator('[data-widget-id] .widget-btn-remove').first().click();
  await sleep(900);
  const removed = await cards(page);
  rows.push(['remove a widget', urlOf(page), `${before} → ${removed} cards`]);
  check('the board really changed', removed === before - 1, `${before} → ${removed}`);
  check('C1: editing the board drops the now-false claim', !urlOf(page).includes('config='), urlOf(page));

  await page.click('button[title^="Share via QR"]');
  await page.waitForSelector('.share-link-input', { timeout: 15000 });
  const link = await page.inputValue('.share-link-input');
  rows.push(['Share after editing', link.replace(BASE, '').slice(0, 46) + (link.length > 60 ? '…' : ''), `${link.length} chars`]);
  check('C1b: Share hands over the CURRENT board, not the stale ?config=', link.includes('#/d/'),
    link.includes('config=') ? 'echoed the stale claim ✗' : '');

  // an untouched board may still share the short ?config= URL
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/?config=${DEMO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(1200);
  await page.click('button[title^="Share via QR"]');
  await page.waitForSelector('.share-link-input', { timeout: 15000 });
  const shortLink = await page.inputValue('.share-link-input');
  rows.push(['Share an untouched board', shortLink.replace(BASE, '').slice(0, 46), `${shortLink.length} chars`]);
  check('C1b: an untouched board may share its short ?config= URL', shortLink.includes('config='), shortLink.slice(0, 80));

  // ── 4. present mode (C2) ─────────────────────────────────────────────────────────────────────────
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/?lean=1`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  rows.push(['load ?lean=1', urlOf(page), 'present mode']);
  const leanKiosk = await page.locator('.kiosk-exit').count();
  check('C2: ?lean=1 lands in present mode', leanKiosk > 0);
  await page.click('.kiosk-exit');
  await sleep(700);
  rows.push(['Exit present mode', urlOf(page), 'param stripped']);
  check('C2: Exit strips ?lean=', !urlOf(page).includes('lean='), urlOf(page));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.click('button[title^="Presentation mode"]');
  await sleep(700);
  rows.push(['enter Present from a plain URL', urlOf(page), 'no param invented']);
  check('C2: entering present mode does not invent a URL param', !/kiosk=|lean=/.test(urlOf(page)), urlOf(page));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

console.log('\n  action                            address bar                              note');
console.log('  ' + '─'.repeat(96));
for (const [what, url, note] of rows) console.log(`  ${what.padEnd(33)} ${url.padEnd(40)} ${note}`);
console.log();
if (failures.length) {
  console.error(`URL-STATE AUDIT FAILED — ${failures.length} issue(s):\n  · ${failures.join('\n  · ')}`);
  process.exit(1);
}
console.log(`URL-STATE AUDIT PASS — ${rows.length} actions traced, 0 invariants broken`);
