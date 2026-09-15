/**
 * IA Book widget end-to-end check (ISSUE-25 media family, 2026-09-15).
 *
 * Boots the BUILT app on a generated board of three IA Book cards and asserts what the browser
 * actually painted:
 *
 *   1. a real scanned book ('goodytwoshoes00newyiala') — manifest-driven page count, a page image
 *      that actually LOADED (naturalWidth > 0, not merely referenced), the thumbnail strip, page
 *      turning, search-inside with a hit that jumps to a page and shows the word's crop, the page's
 *      OCR text, and the PDF/EPUB/OCR links;
 *   2. a page-less text item ('policy_20191010', whose manifest 500s) — the card must
 *      explain itself rather than render an empty viewer;
 *   3. a bad identifier — a friendly message, not a stack trace.
 *
 * Live data changes, so assertions are shape-based (page counts as ranges, hit counts as ≥ 1),
 * never pinned to today's manifest.
 *
 * Usage: npm run build && node scripts/ia-book-e2e.mjs [--port 8996]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
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
    { id: 'iabook-live', widgetType: 'iaBook', config: { identifier: 'goodytwoshoes00newyiala', refreshSeconds: 86400 } },
    { id: 'iabook-notext', widgetType: 'iaBook', config: { identifier: 'policy_20191010', refreshSeconds: 86400 } },
    { id: 'iabook-bad', widgetType: 'iaBook', config: { identifier: 'wikibento-definitely-not-a-real-item-xyz', refreshSeconds: 86400 } },
    { id: 'iabook-rtl', widgetType: 'iaBook', config: { identifier: 'DarsENizami_DarjaAula_1stYear', refreshSeconds: 86400 } },
    { id: 'iabook-spread', widgetType: 'iaBook', config: { identifier: 'goodytwoshoes00newyiala', spread: 'on', refreshSeconds: 86400 } },
  ],
  layout: [
    { i: 'iabook-live', x: 0, y: 0, w: 5, h: 9 },
    { i: 'iabook-notext', x: 5, y: 0, w: 4, h: 6 },
    { i: 'iabook-bad', x: 9, y: 0, w: 3, h: 6 },
    { i: 'iabook-rtl', x: 0, y: 9, w: 6, h: 9 },
    { i: 'iabook-spread', x: 6, y: 9, w: 3, h: 9 },
  ],
};
writeFileSync(join(dist, 'iabook-e2e.json'), JSON.stringify(cfg, null, 2));

const results = [];
const check = (name, ok, detail = '') => {
  // Printed as it happens: a crash later must not hide the assertions that already ran.
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? `  — ${detail}` : ''}`);
  results.push({ name, ok, detail });
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', dist], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const pageErrors = [];
  const jsErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(`${BASE}/?config=/iabook-e2e.json`, { waitUntil: 'domcontentloaded' });

  // ── 1. the scanned book ───────────────────────────────────────────────────────
  const card = '[data-widget-id="iabook-live"]';
  await page.waitForSelector(`${card} img.pv-page`, { timeout: 45000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('img.pv-page');
    return img && img.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 45000 });
  check('the page image loaded (naturalWidth > 0, not just referenced)', true);

  const countText = await page.locator(`${card} .pv-count`).first().innerText();
  const m = countText.match(/page\s+(\S+)\s+of\s+(\d+)/i);
  check('the page counter reads "page N of M"', Boolean(m), countText);
  const total = m ? Number(m[2]) : 0;
  check('the page count comes from the manifest (8–80 pages here, not the metadata\'s 20)',
    total >= 8 && total <= 80, `M = ${total}`);

  const src1 = await page.locator(`${card} img.pv-page`).first().getAttribute('src');
  check('the image comes from the IIIF image API, not a hand-built $N URL',
    /iiif\.archive\.org\/image\/iiif\/3\//.test(src1) && !/\$\d+\/full/.test(src1), String(src1).slice(0, 90));

  // page turning
  await page.locator(`${card} .pv-toolbar button`).nth(1).click();   // ◀ ▶ are the first two buttons
  await page.waitForFunction((prev) => {
    const img = document.querySelector('img.pv-page');
    return img && img.getAttribute('src') !== prev;
  }, src1, { timeout: 30000 });
  const countText2 = await page.locator(`${card} .pv-count`).first().innerText();
  check('turning the page changes the counter', countText2 !== countText, `${countText} → ${countText2}`);

  // the thumbnail strip
  const thumbs = await page.locator(`${card} .pv-thumb`).count();
  check('the page strip rendered thumbnails', thumbs >= 5, `${thumbs} thumbnails`);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.pv-thumb img')];
    return imgs.length > 0 && imgs.some((i) => i.complete && i.naturalWidth > 0);
  }, undefined, { timeout: 40000 });
  check('strip thumbnails loaded', true);

  // search inside the book
  await page.locator(`${card} .pv-input`).fill('goody');
  await page.locator(`${card} .pv-search button`).click();
  await page.waitForSelector(`${card} .pv-hit-row`, { timeout: 40000 });
  const hits = await page.locator(`${card} .pv-hit-row`).count();
  check('search-inside returned hits (IIIF Content Search)', hits >= 1, `${hits} hits`);
  const hitPage = await page.locator(`${card} .pv-hit-row`).first().innerText();
  check('each hit names its page', /p\.\s*\S+/.test(hitPage), hitPage.replace(/\s+/g, ' ').slice(0, 70));

  const before = await page.locator(`${card} .pv-count`).first().innerText();
  await page.locator(`${card} .pv-hit-row`).first().click();
  await page.waitForSelector(`${card} .pv-hit-crop`, { timeout: 30000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.pv-hit-crop');
    return img && img.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 40000 });
  check('clicking a hit jumps to its page and the word\'s crop loads', true);
  const cropSrc = await page.locator(`${card} .pv-hit-crop`).getAttribute('src');
  check('the crop is a IIIF region request (x,y,w,h)', /\/\d+,\d+,\d+,\d+\/\d+,/.test(String(cropSrc)), String(cropSrc).slice(0, 84));
  const after = await page.locator(`${card} .pv-count`).first().innerText();
  check('the jump moved the page counter', before !== after, `${before} → ${after}`);

  // page OCR text
  await page.locator(`${card} .pv-toolbar button`).last().click();   // ¶
  // Wait for the WORDS, not for the container: the panel exists a frame before its text arrives, so
  // asserting on the element is a race (and on a slow page it reads an empty string).
  await page.waitForFunction((sel) => {
    const body = document.querySelector(`${sel} .pv-text-body`);
    return body && body.innerText.trim().length > 100;
  }, `[data-widget-id="iabook-live"]`, { timeout: 60000 });
  const text = (await page.locator(`${card} .pv-text-body`).first().innerText()).trim();
  check('the page text panel has OCR text', text.length > 100, `${text.length} chars`);

  // links out
  const hrefs = await page.locator(`${card} .pv-links a`).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('derivative links point at archive.org/download', hrefs.some((h) => /archive\.org\/download/.test(String(h))), hrefs.join(' '));

  // ── a BOARD can open a book as facing pages (the ⚙ Reading mode default) ─────
  // This card is deliberately narrow: 'auto' would never spread at this width, so a spread here can only
  // come from the board's `spread: 'on'`. Leaf 0 stands alone everywhere (it is a cover), so the proof is
  // the pressed toggle plus the pair that appears on the next step.
  const narrow = '[data-widget-id="iabook-spread"]';
  await page.waitForSelector(`${narrow} img.pv-page`, { state: 'attached', timeout: 90000 });
  await page.waitForFunction(() => !!document.querySelector('[data-widget-id="iabook-spread"] .pv-btn[data-pv="facing"]'), undefined, { timeout: 60000 });
  const stageW = await page.evaluate(() => document.querySelector('[data-widget-id="iabook-spread"] .pv-stage').clientWidth);
  const pressed = await page.locator(`${narrow} .pv-btn[data-pv="facing"]`).getAttribute('aria-pressed');
  check('a narrow card still opens in the board-set spread mode', stageW < 820 && pressed === 'true',
    `stage ${stageW}px (auto needs 820), aria-pressed=${pressed}`);
  await page.evaluate(() => document.querySelectorAll('[data-widget-id="iabook-spread"] .pv-toolbar button')[1].click());
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="iabook-spread"] .pv-leaf').length === 2, undefined, { timeout: 40000 });
  const narrowCount = (await page.locator(`${narrow} .pv-count`).innerText()).replace(/\s+/g, ' ');
  check('…and it shows a real pair in a card too narrow for auto', /^pages 2\u20133 of 16$/i.test(narrowCount), narrowCount);

  // ── PNG export (ISSUE-80): the page image's host sends CORS, so the canvas stays clean ──
  await page.locator(`${card} .widget-menu-wrap button`).first().click();
  const pngItem = page.locator(`${card} .widget-menu-item`, { hasText: 'PNG' });
  await pngItem.waitFor({ timeout: 10000 });
  const pngDisabled = await pngItem.isDisabled();
  check('the export menu offers PNG for a IIIF page image', !pngDisabled,
    await pngItem.getAttribute('title') || '');
  if (!pngDisabled) {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      pngItem.click(),
    ]);
    const name = download.suggestedFilename();
    const path = await download.path();
    const bytes = path ? readFileSync(path).length : 0;
    check('clicking PNG downloads a real raster of the page',
      /\.png$/i.test(name) && bytes > 5000, `${name}, ${bytes} bytes`);
  }

  // ── facing pages (ISSUE-81) ──────────────────────────────────────────────────
  const num = (v) => Number(String(v).replace(/\D+/g, ''));
  const firstNum = (v) => Number((String(v).match(/(\d+)/) || [0, 0])[1]);
  const spreadToggle = page.locator(`${card} .pv-btn[data-pv="facing"]`);
  check('the reader offers a facing-pages toggle', (await spreadToggle.count()) === 1);
  // The default follows the card's width, so ENSURE the state rather than assuming it.
  if ((await spreadToggle.getAttribute('aria-pressed')) !== 'true') await spreadToggle.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="iabook-live"] .pv-leaf').length === 2, undefined, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-widget-id="iabook-live"] .pv-leaf img')]
    .every((i) => i.complete && i.naturalWidth > 0), undefined, { timeout: 60000 });
  check('a spread shows two pages, both loaded', true);
  const spreadText = (await page.locator(`${card} .pv-count`).innerText()).replace(/\s+/g, ' ');
  check('the counter names the spread in reading order', /^pages \d+\u2013\d+ of 16/.test(spreadText), spreadText);
  const leftAlt = await page.locator(`${card} .pv-leaf.is-left img`).getAttribute('alt');
  const rightAlt = await page.locator(`${card} .pv-leaf.is-right img`).getAttribute('alt');
  check('left-to-right: the earlier page sits on the left', num(leftAlt) < num(rightAlt), `${leftAlt} | ${rightAlt}`);
  check('the strip highlights the whole spread', (await page.locator(`${card} .pv-thumb.is-current`).count()) === 2);

  // navigation moves a SPREAD at a time, not a page
  const beforeSpread = firstNum(spreadText.replace(/^pages?\s*/, ''));
  await page.locator(`${card} .pv-toolbar button`).nth(1).click();
  await page.waitForFunction((prev) => document.querySelector('[data-widget-id="iabook-live"] .pv-count').innerText !== prev, spreadText, { timeout: 30000 });
  const afterSpread = firstNum((await page.locator(`${card} .pv-count`).innerText()).replace(/^pages?\s*/, ''));
  check('▶ advances by a spread, not by a page', afterSpread === beforeSpread + 2, `${beforeSpread} → ${afterSpread}`);

  // the shift control re-pairs the first leaf (offset 1 pairs it with leaf 2)
  const counter = () => page.locator(`${card} .pv-count`).innerText().then((t) => t.replace(/\s+/g, ' ').trim());
  await page.locator(`${card} .pv-thumb`).first().click();          // back to the first spread
  await page.waitForFunction(() => /^(page|pages) 1/.test(document.querySelector('[data-widget-id="iabook-live"] .pv-count').innerText), undefined, { timeout: 30000 });
  const beforeShift = await counter();
  await page.locator(`${card} .pv-btn[data-pv="shift"]`).click();
  await page.waitForFunction((prev) => document.querySelector('[data-widget-id="iabook-live"] .pv-count').innerText !== prev, beforeShift, { timeout: 30000 });
  const afterShift = await counter();
  check('the shift control re-pairs the first leaf', /^(page|pages) 1/.test(beforeShift) && afterShift !== beforeShift,
    `${beforeShift} → ${afterShift}`);

  // ── right-to-left (measured: Arabic, Hebrew and Yiddish scans) ───────────────
  const rtl = '[data-widget-id="iabook-rtl"]';
  // below the fold, so 'attached' rather than 'visible' — Playwright's default would wait forever
  await page.waitForSelector(`${rtl} img.pv-page`, { state: 'attached', timeout: 90000 });
  await page.waitForFunction(() => !!document.querySelector('[data-widget-id="iabook-rtl"] .pv-btn[data-pv="facing"]'), undefined, { timeout: 90000 });
  // This card is below the fold, so a coordinate click lands off-screen (and `force` skips the scroll
  // that would fix it). Drive it through the DOM instead: React's listener is at the container, so a
  // synthetic click bubbles to it exactly like a real one — and this test is about behaviour, not
  // clickability.
  const rtlPressed = await page.locator(`${rtl} .pv-btn[data-pv="facing"]`).getAttribute('aria-pressed');
  if (rtlPressed !== 'true') {
    await page.evaluate(() => document.querySelector('[data-widget-id="iabook-rtl"] .pv-btn[data-pv="facing"]').click());
    await page.waitForFunction(() => document.querySelector('[data-widget-id="iabook-rtl"] .pv-btn[data-pv="facing"]')
      .getAttribute('aria-pressed') === 'true', undefined, { timeout: 20000 });
  }
  // Leaf 0 is a cover, so it is a spread of ONE until we advance — that is the rule, not a bug.
  const rtlFirstSpread = await page.locator(`${rtl} .pv-leaf`).count();
  check('a right-to-left book also opens on a single cover leaf', rtlFirstSpread === 1, `${rtlFirstSpread} leaf`);
  await page.evaluate(() => document.querySelectorAll('[data-widget-id="iabook-rtl"] .pv-toolbar button')[1].click());
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="iabook-rtl"] .pv-leaf').length === 2, undefined, { timeout: 40000 });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-widget-id="iabook-rtl"] .pv-leaf img')]
    .every((i) => i.complete && i.naturalWidth > 0), undefined, { timeout: 60000 });
  const rtlLeft = await page.locator(`${rtl} .pv-leaf.is-left img`).getAttribute('alt');
  const rtlRight = await page.locator(`${rtl} .pv-leaf.is-right img`).getAttribute('alt');
  const rtlCount = (await page.locator(`${rtl} .pv-count`).innerText()).replace(/\s+/g, ' ');
  check('right-to-left: the LATER page sits on the left', num(rtlLeft) > num(rtlRight), `${rtlLeft} | ${rtlRight}`);
  check('…and its counter still reads in reading order', /^pages \d+\u2013\d+ of \d+/.test(rtlCount), rtlCount);

  await page.locator(`${card} img.pv-page`).first().screenshot({ path: join(root, 'docs/screenshots/wikibento-2026-09-15-ia-book.png') }).catch(() => {});
  await page.locator(card).screenshot({ path: join(root, 'docs/screenshots/wikibento-2026-09-15-ia-book-card.png') }).catch(() => {});
  check('screenshots written', true);

  // ── 2. a text-only item says so ───────────────────────────────────────────────
  const textCard = '[data-widget-id="iabook-notext"]';
  await page.waitForSelector(`${textCard} .widget-empty`, { timeout: 45000 });
  const notice = await page.locator(`${textCard}`).innerText();
  const noViewer = await page.locator(`${textCard} img.pv-page`).count();
  check('a text-only item explains itself instead of showing an empty viewer',
    noViewer === 0 && /no page images/i.test(notice), notice.replace(/\s+/g, ' ').slice(0, 90));

  // ── 3. a bad identifier is friendly ───────────────────────────────────────────
  const badCard = '[data-widget-id="iabook-bad"]';
  await page.waitForFunction(() => {
    const bad = document.querySelector('[data-widget-id="iabook-bad"]');
    return bad && /No Internet Archive item|not found|Error|💥/i.test(bad.innerText);
  }, undefined, { timeout: 45000 });
  const badText = await page.locator(badCard).first().innerText().catch(() => '');
  check('a bad identifier shows a friendly message', /No Internet Archive item/i.test(badText), badText.replace(/\s+/g, ' ').slice(0, 90));

  // ── 4. nothing threw ──────────────────────────────────────────────────────────
  // Uncaught JS errors are never acceptable. Console *resource* errors are not: card 3 asks for a
  // deliberately nonexistent item, and IA answers 400 — the friendly message is the expected path.
  check('no uncaught JS errors', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  // 400 is IA refusing the deliberately missing identifier; 500 is the page-less fixture's manifest,
  // which is the exact failure the "no page images" notice is built around. Anything else is a bug.
  const unexpected = consoleErrors.filter((e) => !/status of (400|404|500)|favicon|net::ERR/i.test(e));
  check('no unexpected console errors (only the fixtures\' deliberate 400/500)',
    unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

  await browser.close();
  rmSync(join(dist, 'iabook-e2e.json'), { force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? '✘ FAIL' : '✔ PASS'} — ${results.length - failed.length}/${results.length} assertions`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('e2e crashed:', err && err.message);
  stop();
  process.exit(1);
});
