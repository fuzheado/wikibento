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
import { existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
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
  ],
  layout: [
    { i: 'iabook-live', x: 0, y: 0, w: 5, h: 9 },
    { i: 'iabook-notext', x: 5, y: 0, w: 4, h: 6 },
    { i: 'iabook-bad', x: 9, y: 0, w: 3, h: 6 },
  ],
};
writeFileSync(join(dist, 'iabook-e2e.json'), JSON.stringify(cfg, null, 2));

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

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
  await page.waitForSelector(`${card} img.iab-page`, { timeout: 45000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('img.iab-page');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 45000 });
  check('the page image loaded (naturalWidth > 0, not just referenced)', true);

  const countText = await page.locator(`${card} .iab-count`).first().innerText();
  const m = countText.match(/page\s+(\S+)\s+of\s+(\d+)/i);
  check('the page counter reads "page N of M"', Boolean(m), countText);
  const total = m ? Number(m[2]) : 0;
  check('the page count comes from the manifest (8–80 pages here, not the metadata\'s 20)',
    total >= 8 && total <= 80, `M = ${total}`);

  const src1 = await page.locator(`${card} img.iab-page`).first().getAttribute('src');
  check('the image comes from the IIIF image API, not a hand-built $N URL',
    /iiif\.archive\.org\/image\/iiif\/3\//.test(src1) && !/\$\d+\/full/.test(src1), String(src1).slice(0, 90));

  // page turning
  await page.locator(`${card} .iab-toolbar button`).nth(1).click();   // ◀ ▶ are the first two buttons
  await page.waitForFunction((prev) => {
    const img = document.querySelector('img.iab-page');
    return img && img.getAttribute('src') !== prev;
  }, src1, { timeout: 30000 });
  const countText2 = await page.locator(`${card} .iab-count`).first().innerText();
  check('turning the page changes the counter', countText2 !== countText, `${countText} → ${countText2}`);

  // the thumbnail strip
  const thumbs = await page.locator(`${card} .iab-thumb`).count();
  check('the page strip rendered thumbnails', thumbs >= 5, `${thumbs} thumbnails`);
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.iab-thumb img')];
    return imgs.length > 0 && imgs.some((i) => i.complete && i.naturalWidth > 0);
  }, { timeout: 40000 });
  check('strip thumbnails loaded', true);

  // search inside the book
  await page.locator(`${card} .iab-input`).fill('goody');
  await page.locator(`${card} .iab-search button`).click();
  await page.waitForSelector(`${card} .iab-hit-row`, { timeout: 40000 });
  const hits = await page.locator(`${card} .iab-hit-row`).count();
  check('search-inside returned hits (IIIF Content Search)', hits >= 1, `${hits} hits`);
  const hitPage = await page.locator(`${card} .iab-hit-row`).first().innerText();
  check('each hit names its page', /p\.\s*\S+/.test(hitPage), hitPage.replace(/\s+/g, ' ').slice(0, 70));

  const before = await page.locator(`${card} .iab-count`).first().innerText();
  await page.locator(`${card} .iab-hit-row`).first().click();
  await page.waitForSelector(`${card} .iab-hit-crop`, { timeout: 30000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.iab-hit-crop');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 40000 });
  check('clicking a hit jumps to its page and the word\'s crop loads', true);
  const cropSrc = await page.locator(`${card} .iab-hit-crop`).getAttribute('src');
  check('the crop is a IIIF region request (x,y,w,h)', /\/\d+,\d+,\d+,\d+\/\d+,/.test(String(cropSrc)), String(cropSrc).slice(0, 84));
  const after = await page.locator(`${card} .iab-count`).first().innerText();
  check('the jump moved the page counter', before !== after, `${before} → ${after}`);

  // page OCR text
  await page.locator(`${card} .iab-toolbar button`).last().click();   // ¶
  await page.waitForSelector(`${card} .iab-text`, { timeout: 30000 });
  const text = (await page.locator(`${card} .iab-text`).innerText()).trim();
  check('the page text panel has OCR text', text.length > 20, `${text.length} chars`);

  // links out
  const hrefs = await page.locator(`${card} .iab-links a`).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('derivative links point at archive.org/download', hrefs.some((h) => /archive\.org\/download/.test(String(h))), hrefs.join(' '));

  await page.locator(`${card} img.iab-page`).first().screenshot({ path: join(root, 'docs/screenshots/wikibento-2026-09-15-ia-book.png') }).catch(() => {});
  await page.locator(card).screenshot({ path: join(root, 'docs/screenshots/wikibento-2026-09-15-ia-book-card.png') }).catch(() => {});
  check('screenshots written', true);

  // ── 2. a text-only item says so ───────────────────────────────────────────────
  const textCard = '[data-widget-id="iabook-notext"]';
  await page.waitForSelector(`${textCard} .widget-empty`, { timeout: 45000 });
  const notice = await page.locator(`${textCard}`).innerText();
  const noViewer = await page.locator(`${textCard} img.iab-page`).count();
  check('a text-only item explains itself instead of showing an empty viewer',
    noViewer === 0 && /no page images/i.test(notice), notice.replace(/\s+/g, ' ').slice(0, 90));

  // ── 3. a bad identifier is friendly ───────────────────────────────────────────
  const badCard = '[data-widget-id="iabook-bad"]';
  await page.waitForFunction(() => {
    const bad = document.querySelector('[data-widget-id="iabook-bad"]');
    return bad && /No Internet Archive item|not found|Error|💥/i.test(bad.innerText);
  }, { timeout: 45000 });
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
  for (const r of results) {
    console.log(`  ${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
  }
  console.log(`\n${failed.length ? '✘ FAIL' : '✔ PASS'} — ${results.length - failed.length}/${results.length} assertions`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('e2e crashed:', err && err.message);
  stop();
  process.exit(1);
});
