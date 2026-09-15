/**
 * Document Reader end-to-end check (ISSUE-82, 2026-09-15).
 *
 * Boots the BUILT app on a generated board of four documents and asserts what the browser actually painted,
 * against real Commons files:
 *
 *   File:PDF metadata.pdf                2 pages   — the fast fixture, and the clamp cases
 *   File:The Three Hostages (1924).pdf   329 pages — the widget's default, and a long document
 *   File:Mozart Sonate (manuscript).djvu  96 pages — DjVu, which is the same code path as PDF
 *   File:Example.jpg                     a JPEG    — must be refused politely, not paged
 *
 * The traps it exists for (docs/DOCUMENT-VIEWER.md), none of which fails loudly on its own:
 *   · a page past the end is CLAMPED by the server (page 189 of 188 returned page 188, byte for byte), so
 *     typed input has to clamp too;
 *   · document renders have a 960 px ceiling (asked 1200 and 2000, both came back 960), so the zoom ladder
 *     must stop — otherwise the + button climbs to a step the server cannot serve;
 *   · hand-built thumb URLs 400 (a 50 MB report refused every one we constructed), so the URL must come from
 *     the API — asserted by checking the src is a *page* render on the API's host.
 *
 * Usage: npm run build && node scripts/document-reader-e2e.mjs [--port 8989]
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
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8989;
const BASE = `http://127.0.0.1:${PORT}`;
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const cfg = {
  version: 1,
  widgets: [
    { id: 'doc-pdf', widgetType: 'documentReader', config: { file: 'File:PDF metadata.pdf', project: 'commons.wikimedia', spread: 'off', refreshSeconds: 86400 } },
    { id: 'doc-book', widgetType: 'documentReader', config: { file: 'File:The Three Hostages (1924).pdf', project: 'commons.wikimedia', refreshSeconds: 86400 } },
    { id: 'doc-djvu', widgetType: 'documentReader', config: { file: 'https://commons.wikimedia.org/wiki/File:Mozart_Sonate_(manuscript).djvu', project: 'commons.wikimedia', refreshSeconds: 86400 } },
    { id: 'doc-image', widgetType: 'documentReader', config: { file: 'File:Example.jpg', project: 'commons.wikimedia', refreshSeconds: 86400 } },
    { id: 'doc-ws', widgetType: 'documentReader', config: { file: 'File:"Homo Sum" being a letter to an anti-suffragist from an anthropologist.djvu', project: 'commons.wikimedia', refreshSeconds: 86400 } },
  ],
  layout: [
    { i: 'doc-pdf', x: 0, y: 0, w: 6, h: 9 },
    { i: 'doc-book', x: 6, y: 0, w: 6, h: 9 },
    { i: 'doc-djvu', x: 0, y: 9, w: 6, h: 9 },
    { i: 'doc-image', x: 6, y: 9, w: 6, h: 9 },
    { i: 'doc-ws', x: 0, y: 18, w: 6, h: 9 },
  ],
};
writeFileSync(join(dist, 'document-reader-e2e.json'), JSON.stringify(cfg, null, 2));

const results = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✔' : '✘'} ${name}${detail ? `  — ${detail}` : ''}`);
  results.push({ name, ok, detail });
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', dist], { stdio: 'ignore' });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', stop);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const jsErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => jsErrors.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(`${BASE}/?config=/document-reader-e2e.json`, { waitUntil: 'domcontentloaded' });
  check('five cards on the board', (await page.locator('.react-grid-item').count()) === 5,
    `${await page.locator('.react-grid-item').count()} cards`);

  const counter = (id) => page.locator(`[data-widget-id="${id}"] .pv-count`).innerText().then((t) => t.replace(/\s+/g, ' ').trim());
  const imgSrc = (id) => page.locator(`[data-widget-id="${id}"] img.pv-page`).first().getAttribute('src');
  const jumpTo = async (id, n) => {
    await page.locator(`[data-widget-id="${id}"] .pv-jump-input`).fill(String(n));
    await page.locator(`[data-widget-id="${id}"] .pv-jump-input`).press('Enter');
    await page.waitForTimeout(1200);
  };

  // ── a 2-page PDF: the page count comes from imageinfo, and the render is the API's ──
  await page.waitForSelector('[data-widget-id="doc-pdf"] img.pv-page', { timeout: 60000 });
  await page.waitForFunction(() => {
    const i = document.querySelector('[data-widget-id="doc-pdf"] img.pv-page');
    return i && i.complete && i.naturalWidth > 0;
  }, undefined, { timeout: 60000 });
  check('the PDF page image loaded', true);
  check('the counter reads the file\'s own page count', /^page 1 of 2$/.test(await counter('doc-pdf')), await counter('doc-pdf'));
  const pdfSrc = await imgSrc('doc-pdf');
  check('the image is a page render on the API\'s host (never a hand-built URL)',
    /(thumb|upload)\.wikimedia\.org/.test(String(pdfSrc)) && /page1-\d+px-/.test(String(pdfSrc)) && /PDF_metadata\.pdf/.test(String(pdfSrc)),
    String(pdfSrc).slice(0, 96));

  // ── the jump control, and the clamp (the trap) ──
  await jumpTo('doc-pdf', 2);
  check('typing a page number jumps to it', /^page 2 of 2$/.test(await counter('doc-pdf')), await counter('doc-pdf'));
  check('…and it really loaded page 2', /page2-\d+px-/.test(String(await imgSrc('doc-pdf'))), String(await imgSrc('doc-pdf')).slice(0, 90));
  await jumpTo('doc-pdf', 999);
  check('a page past the end CLAMPS to the last page (as the server does)', /^page 2 of 2$/.test(await counter('doc-pdf')), await counter('doc-pdf'));

  // ── a 329-page book: one API call, and the last page reachable ──
  await page.waitForSelector('[data-widget-id="doc-book"] img.pv-page', { timeout: 120000 });
  check('the 329-page book reports its page count', /^page 1 of 329$/.test(await counter('doc-book')), await counter('doc-book'));
  await jumpTo('doc-book', 329);
  check('…and any page is reachable by typing its number', /^page 329 of 329$/.test(await counter('doc-book')), await counter('doc-book'));

  // ── the 960 px ceiling: the ladder must stop where the server does ──
  const plus = page.locator('[data-widget-id="doc-book"] .pv-zoom button').nth(1);
  for (let i = 0; i < 4 && !(await plus.isDisabled()); i += 1) { await plus.click(); await page.waitForTimeout(150); }
  const widest = (await page.locator('[data-widget-id="doc-book"] .pv-w').innerText()).trim();
  check('the zoom ladder stops at the source\'s 960 px ceiling', widest === '960px' && (await plus.isDisabled()), widest);

  // ── DjVu is the same source (given as a URL, not a file name) ──
  await page.waitForSelector('[data-widget-id="doc-djvu"] img.pv-page', { timeout: 90000 });
  check('a DjVu works identically, even pasted as a URL', /^page 1 of 96$/.test(await counter('doc-djvu')), await counter('doc-djvu'));
  check('…and its renders name the .djvu file', /\.djvu\.jpg/.test(String(await imgSrc('doc-djvu'))), String(await imgSrc('doc-djvu')).slice(0, 88));
  // The last page of a long document: Wikimedia generates a page render ON DEMAND, so this is generous —
  // and if the render is refused or slow, the card must SAY so rather than show a blank hole.
  await jumpTo('doc-djvu', 96);
  const lastLoaded = await page.waitForFunction(() => {
    const i = document.querySelector('[data-widget-id="doc-djvu"] img.pv-page');
    return i && i.complete && i.naturalWidth > 0 && /page96-/.test(i.getAttribute('src') || '');
  }, undefined, { timeout: 90000 }).then(() => true).catch(() => false);
  const djvuText = (await page.locator('[data-widget-id="doc-djvu"]').innerText()).replace(/\s+/g, ' ');
  check('the LAST page of a 96-page DjVu renders (or the card says why it could not)',
    lastLoaded || /did not load/.test(djvuText),
    lastLoaded ? `page 96 of 96 loaded · ${(await counter('doc-djvu'))}` : djvuText.slice(0, 90));

  // ── facing pages, the same rules as the IA reader (on the lighter DjVu: page renders are generated
  //    on demand, so two new pages of a 34 MB PDF is a lot to ask of the archive in one test run) ──
  const facing = page.locator('[data-widget-id="doc-djvu"] .pv-btn[data-pv="facing"]');
  if ((await facing.getAttribute('aria-pressed')) !== 'true') await facing.click();
  await jumpTo('doc-djvu', 2);
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="doc-djvu"] .pv-leaf').length === 2, undefined, { timeout: 40000 });
  const pairLoaded = await page.waitForFunction(() => [...document.querySelectorAll('[data-widget-id="doc-djvu"] .pv-leaf img')]
    .every((i) => i.complete && i.naturalWidth > 0), undefined, { timeout: 90000 }).then(() => true).catch(() => false);
  const pairText = (await page.locator('[data-widget-id="doc-djvu"]').innerText()).replace(/\s+/g, ' ');
  check('a document reads as facing pages too', /^pages 2\u20133 of 96$/.test(await counter('doc-djvu')), await counter('doc-djvu'));
  check('…with both leaves loaded (or the card saying why not)',
    pairLoaded || /did not load/.test(pairText), pairLoaded ? 'both leaves loaded' : pairText.slice(0, 80));
  check('…and the strip highlights the pair', (await page.locator('[data-widget-id="doc-djvu"] .pv-thumb.is-current').count()) === 2);

  // ── the credit and the way out ──
  const links = await page.locator('[data-widget-id="doc-djvu"] .pv-links a').evaluateAll((as) => as.map((a) => ({ t: a.textContent, h: a.getAttribute('href') })));
  check('there is a link to the file page and to the original',
    links.some((l) => /File page/.test(l.t) && /commons\.wikimedia\.org\/wiki\/File:/.test(l.h))
    && links.some((l) => /original/i.test(l.t) && /upload\.wikimedia\.org/.test(l.h)),
    links.map((l) => `${l.t}→${String(l.h).replace(/^https:\/\//, '').slice(0, 22)}`).join(' '));
  const subtitle = await page.locator('[data-widget-id="doc-djvu"] .pv-sub').innerText();
  check('the header carries pages, format and size', /^96 pages · DjVu · 17\.6 MB/.test(subtitle), subtitle);

  // ── PNG export: Wikimedia's page renders send CORS, so this reader gets it too ──
  await page.locator('[data-widget-id="doc-djvu"] .widget-menu-wrap button').first().click();
  const png = page.locator('[data-widget-id="doc-djvu"] .widget-menu-item', { hasText: 'PNG' });
  await png.waitFor({ timeout: 10000 });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('.widget-menu-item')].find((b) => /PNG/.test(b.textContent));
    return el && (el.getAttribute('title') || '').length > 0;
  }, undefined, { timeout: 10000 });
  check('PNG export is offered for a document page',
    !(await png.isDisabled()) && /CORS/.test(String(await png.getAttribute('title'))),
    String(await png.getAttribute('title')));
  await page.keyboard.press('Escape');

  // ── a JPEG is refused politely, with its links ──
  await page.waitForFunction(() => /not a PDF or DjVu document/.test(document.querySelector('[data-widget-id="doc-image"]')?.innerText || ''), undefined, { timeout: 60000 });
  const imgCard = (await page.locator('[data-widget-id="doc-image"]').innerText()).replace(/\s+/g, ' ');
  check('a JPEG is refused politely, not paged', /not a PDF or DjVu document/.test(imgCard) && (await page.locator('[data-widget-id="doc-image"] img.pv-page').count()) === 0,
    imgCard.slice(0, 80));
  check('…and it still offers the way out', (await page.locator('[data-widget-id="doc-image"] .pv-links a').count()) >= 1);

  // ── the Wikisource text layer (v1.1): text AND its proofreading grade ─────────
  await page.waitForSelector('[data-widget-id="doc-ws"] img.pv-page', { state: 'attached', timeout: 150000 });
  check('a transcribed document reports its own page count', /^page 1 of 38$/.test(await counter('doc-ws')), await counter('doc-ws'));
  const wsText = page.locator('[data-widget-id="doc-ws"] .pv-btn[data-pv="text"]');
  check('a file WITH a transcription offers the ¶ button', (await wsText.count()) === 1);
  check('a file WITHOUT one does not', (await page.locator('[data-widget-id="doc-djvu"] .pv-btn[data-pv="text"]').count()) === 0,
    'the Mozart DjVu is not transcribed anywhere');
  // jump to a page we know is transcribed and read it
  await jumpTo('doc-ws', 19);   // a page this work has fully validated
  await wsText.click();
  await page.waitForSelector('[data-widget-id="doc-ws"] .pv-text-body', { timeout: 60000 });
  const panel = await page.evaluate(() => {
    const card = document.querySelector('[data-widget-id="doc-ws"]');
    return { note: card.querySelector('.pv-text-note')?.innerText || '', body: card.querySelector('.pv-text-body')?.innerText || '',
             href: card.querySelector('.pv-text-note a')?.getAttribute('href') || '' };
  });
  check('the text panel carries the words from Wikisource', panel.body.length > 500, `${panel.body.length} chars · "${panel.body.slice(0, 60)}…"`);
  check('…and says how proofread it is (this work is validated, not OCR)', /Validated/i.test(panel.note), panel.note);
  check('…and links to the transcription it came from',
    /^https:\/\/en\.wikisource\.org\/wiki\/Page:%22Homo_Sum%22.*\.djvu\/19$/.test(panel.href), panel.href);
  check('no raw markup leaked into the text', !/[{}]|noinclude|pagequality/.test(panel.body), panel.body.slice(0, 60));

  await page.screenshot({ path: join(root, 'docs/screenshots/wikibento-2026-09-15-document-reader.png'), fullPage: true });
  check('board screenshot written', true);
  check('no uncaught JS errors', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  const unexpected = consoleErrors.filter((e) => !/status of (400|404|429|500|503)|favicon|net::ERR/i.test(e));
  check('no unexpected console errors', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  rmSync(join(dist, 'document-reader-e2e.json'), { force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed ? '✘ FAIL' : '✔ PASS'} — ${results.length - failed}/${results.length} assertions`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('e2e crashed:', err && err.message);
  stop();
  process.exit(1);
});
