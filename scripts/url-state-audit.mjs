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
  check('C1b: Share hands over the CURRENT board, not the stale ?config=',
    /#\/[dz]\//.test(link),   // either embedded form; ISSUE-89 makes a real board use the compressed one
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

  // ── 3b. the same rule through a different handler: a board PARAM ─────────────────────────────────
  // The claim-drop is one mechanism (a fingerprint effect), so one trace per *class* of edit is the right
  // amount of evidence — removing a widget proves the widget path, and this proves the params path.
  await page.keyboard.press('Escape');
  await page.goto(`${BASE}/?config=/params-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.board-param-btn', { timeout: 30000 });
  await sleep(1500);
  check('C1: an untouched parameterised board keeps its claim', urlOf(page).includes('config='), urlOf(page));
  await page.locator('.board-param-btn').nth(1).click();
  await sleep(900);
  rows.push(['change a board parameter', urlOf(page), 'claim dropped']);
  check('C1: changing a board param drops the claim too', !urlOf(page).includes('config='), urlOf(page));

  // ── 3c. and the third class: a real drag (a mount-time auto-placement is NOT an edit; a gesture is) ──
  await page.goto(`${BASE}/?config=/params-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(1800);
  check('C1: a board whose layout had gaps keeps its claim on load (placement is not an edit)',
    urlOf(page).includes('config='), urlOf(page));
  const card = page.locator('[data-widget-id]').first();
  const handle = card.locator('.widget-header').first();
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await sleep(900);
  rows.push(['drag a card', urlOf(page), 'claim dropped by the gesture']);
  check('C1: a drag drops the claim', !urlOf(page).includes('config='), urlOf(page));
  await page.keyboard.press('Escape');

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

  // ── 4b. ISSUE-89: a big board must FIT IN A QR, because it is compressed before it is embedded ────
  // The reported failure: a 4,012-character board link and a refusal that told the user to trim their board.
  // Measured in the app, not in a unit test: load a board whose plain link is too long, adopt it (so Share
  // embeds rather than reusing ?config=), and check the link Share hands over.
  await page.goto(`${BASE}/?config=/glam-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(2200);
  await page.locator('[data-widget-id] .widget-btn-remove').first().click();   // adopt: the claim goes stale
  await sleep(1800);
  await page.click('button[title^="Share via QR"]');
  await page.waitForSelector('.share-link-input', { timeout: 15000 });
  await sleep(1500);   // the compressed link is built asynchronously
  const bigLink = await page.inputValue('.share-link-input');
  const qrCount = await page.locator('.share-qr-card svg').count();
  rows.push(['Share a big board', `#/${bigLink.split('#/')[1]?.slice(0, 1) || '?'}… ${bigLink.length} chars`,
    qrCount ? 'QR rendered' : 'no QR']);
  check('ISSUE-89: a big board is embedded compressed', bigLink.includes('#/z/'), bigLink.slice(0, 60));
  check('ISSUE-89: and therefore renders a QR at all', qrCount === 1);
  check('ISSUE-89: the link is inside the QR ceiling', bigLink.length <= 1500, `${bigLink.length} chars`);
  check('ISSUE-89: no "too long for a QR" refusal is shown',
    (await page.locator('.share-noqr').count()) === 0);
  await page.keyboard.press('Escape');

  // ── 5. ISSUE-88: a shared link borrows a board; it does not adopt one ─────────────────────────────
  // The bug this guards, reproduced before it was fixed: seed the visitor's board, click a link, visit the
  // plain URL — and the demo followed them home. Now the visitor's board must survive all of it, until they
  // edit, and even then it must be recoverable.
  const STORE = 'wikibento-layout';
  const STASH_KEY = 'wikibento-previous-board';
  const savedIds = () => page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = parsed.payload || parsed;
    return (payload.widgets || []).map((w) => w.id).join(',') || '(empty board)';
  }, STORE);
  const stashIds = () => page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed.payload.widgets || []).map((w) => w.id).join(',') || '(empty board)';
  }, STASH_KEY);
  const noticeKind = () => page.evaluate(() => {
    const el = document.querySelector('[data-notice]');
    return el ? el.getAttribute('data-notice') : null;
  });
  const MINE = {
    version: 1,
    widgets: [{ id: 'MY-BOARD', widgetType: 'pageviews', config: {} }],
    layout: [{ i: 'MY-BOARD', x: 0, y: 0, w: 3, h: 4 }],
    params: null,
  };

  // a first-time visitor has nothing at stake, so must see nothing at all
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => { localStorage.clear(); localStorage.removeItem(k); }, STASH_KEY);
  await page.goto(`${BASE}/?config=/glam-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(2500);
  rows.push(['first visit, shared link', urlOf(page), 'no notice']);
  check('ISSUE-88: a first-time visitor sees no notice', (await noticeKind()) === null,
    'nothing saved is not a board to lose');

  // a visitor WITH a board: the link must not touch it
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((a) => { localStorage.setItem(a.k, JSON.stringify(a.b)); localStorage.removeItem(a.s); },
    { k: STORE, b: MINE, s: STASH_KEY });
  await page.goto(`${BASE}/?config=/glam-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(2500);
  rows.push(['visitor opens a shared link', urlOf(page), `notice: ${await noticeKind()}`]);
  check("ISSUE-88: opening a link leaves the saved board untouched", (await savedIds()) === "MY-BOARD",
    `saved: ${await savedIds()}`);
  check('ISSUE-88: the borrowed notice is shown, and names the board',
    (await noticeKind()) === 'borrowed' && /GLAM/.test(await page.locator('[data-notice]').innerText()),
    (await page.locator('[data-notice]').innerText()).replace(/\s+/g, ' ').slice(0, 70));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2200);
  rows.push(['next visit, plain URL', urlOf(page), 'own board again']);
  check('ISSUE-88: the saved board is still there on the next visit',
    (await savedIds()) === 'MY-BOARD' && (await cards(page)) === 1, `saved: ${await savedIds()}`);

  // [Back to my board]
  await page.goto(`${BASE}/?config=/glam-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(2200);
  await page.click('button:has-text("Back to my board")');
  await sleep(2200);
  rows.push(['[Back to my board]', urlOf(page), 'claim dropped, own board back']);
  check('ISSUE-88: Back to my board restores the saved board and clears the claim',
    urlOf(page) === '/' && (await page.locator('[data-widget-id]').first().getAttribute('data-widget-id')) === 'MY-BOARD'
      && (await noticeKind()) === null,
    `url ${urlOf(page)}, first card ${await page.locator('[data-widget-id]').first().getAttribute('data-widget-id')}`);

  // editing the borrowed board adopts it — and keeps the displaced board recoverable
  await page.goto(`${BASE}/?config=/glam-demo.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await sleep(2200);
  const borrowedCount = await cards(page);
  await page.locator('[data-widget-id] .widget-btn-remove').first().click();
  await sleep(2000);
  rows.push(['edit the borrowed board', urlOf(page), `adopted, ${await noticeKind()}`]);
  check('ISSUE-88: the first edit adopts the borrowed board',
    (await cards(page)) === borrowedCount - 1 && (await savedIds()) !== 'MY-BOARD',
    `saved: ${(await savedIds())?.slice(0, 40)}`);
  check('ISSUE-88: the displaced board is kept for recovery', (await stashIds()) === 'MY-BOARD',
    `stash: ${await stashIds()}`);
  check('ISSUE-88: the notice switches to recovery', (await noticeKind()) === 'recover');

  await page.click('button:has-text("Restore my board")');
  await sleep(2200);
  rows.push(['[Restore my board]', urlOf(page), 'the displaced board comes back']);
  check('ISSUE-88: Restore puts the displaced board back',
    (await savedIds()) === 'MY-BOARD' && (await noticeKind()) === null
      && (await page.locator('[data-widget-id]').first().getAttribute('data-widget-id')) === 'MY-BOARD',
    `saved: ${await savedIds()}`);
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
