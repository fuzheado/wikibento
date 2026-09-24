#!/usr/bin/env node
/**
 * ISSUE-114 acceptance check — pick mode ("shop and pick"), end to end, in a real browser against the BUILT app.
 *
 * Run: npx vite build && node scripts/pick-mode-e2e.mjs     (it starts its own preview server)
 *
 * What it proves, and why each check is here:
 *   1. one click in pick mode places exactly ONE card, and the toast names the item that was clicked;
 *   2. clicking the same item twice does not make a twin (the ISSUE-114 dedupe rule);
 *   3. the spawn toast's Undo takes that card back off the board;
 *   4. a brush whose kind does not match the clicked item refuses, and places nothing (the kind gate);
 *   5. a brush whose kind DOES match places a card for a gallery tile (the Commons-file half);
 *   6. in ?lean=1 and ?kiosk=1 there is no pick control, a click places nothing, and no page errors.
 *
 * Two lessons are baked into this script. First: **the brush persists across clicks** — that is the feature, so every
 * step below says which brush it expects to be armed rather than assuming a fresh board. Second: it listens to
 * *console* errors as well as page errors, because an exception thrown inside a React event handler reaches the
 * console and NOT `pageerror`; a check that only listens for the latter can pass while every click is broken.
 *
 * A `Failed to load resource: 404` is recorded as a NOTE, not a failure: the pageviews card walks candidate dates
 * back from today (14 of them, `topPageCandidates`), and today's top-pages dataset is often unpublished, so the
 * first candidate legitimately 404s and the next succeeds. Every other console error is fatal here.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { chromium } from 'playwright';

const ARTICLE_BRUSH = 'Article Excerpt';
const FILE_BRUSH = 'File Spotlight';

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// `--base URL` checks a server you already have — the deployed one, after a release.
const fixed = process.argv.indexOf('--base');
const port = fixed === -1 ? await freePort() : null;
const base = fixed === -1 ? `http://127.0.0.1:${port}` : process.argv[fixed + 1];
const srv = fixed === -1
  ? spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  : null;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }

const results = [];
const ok = (m) => { results.push(0); console.log('  ✔ ' + m); };
const bad = (m) => { results.push(1); console.log('  ✘ ' + m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const noise = [];
const notes = [];
// Failing responses are recorded WITH their URL: a count alone ("43 × Failed to load resource") cannot tell a
// pageviews candidate-date 404 from a 502 on our own /api/petscan proxy, and the latter is the interesting one.
const failures = [];
const freshPage = async () => {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 110)));
  p.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url().slice(0, 110)}`); });
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const full = m.text();
    const text = full.slice(0, 110);
    // Environment noise is not this feature's error; see the note at the top of this file. These are all browser
    // reports about an EMBED — a report-only CSP violation, a subresource that failed, or Chromium refusing an
    // autofocus inside a cross-origin subframe (the Wayback iframe does this on production): nothing is blocked and
    // the widgets render. Test the FULL message: slicing first once cut "Content Security Policy" down to "…Polic",
    // and the note silently became a failure.
    if (/Failed to load resource|Content Security Policy|violates the following|Blocked autofocusing/.test(full)) notes.push(text);
    else errs.push('console: ' + text);
  });
  p.errs = errs;
  return p;
};
const cards = (p) => p.locator('[data-widget-id]').count();
const toast = async (p) => (await p.locator('.assembly-toast-msg').textContent().catch(() => ''))?.trim() || '';
const arm = async (p, name) => {
  await p.getByRole('button', { name: /🖌/ }).click();
  await p.waitForSelector('.pick-menu', { timeout: 5000 });
  await p.locator('.pick-menu-item', { hasText: name }).first().click();
  await p.waitForSelector('.btn-picking', { timeout: 4000 });
};

try {
  // ── the article half, on the default board ────────────────────────────────────────────────────────────────
  const page = await freshPage();
  await page.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.article-list-row', { timeout: 45000 });
  const before = await cards(page);
  const row = page.locator('.article-list-row').first();
  const article = (await row.locator('.article-list-title').textContent())?.trim();
  ok(`board loaded: ${before} cards · first list row "${article}"`);

  await page.getByRole('button', { name: /🖌 Pick/ }).click();
  await page.waitForSelector('.pick-menu', { timeout: 5000 });
  const offered = (await page.locator('.pick-menu-item').allTextContents()).map((s) => s.trim());
  offered.length >= 5 ? ok(`menu offers ${offered.length} types — ${offered.slice(0, 3).join(' · ')} …`) : bad(`menu offers ${offered.length}`);
  await page.screenshot({ path: '/tmp/pick-menu-live.png' });

  await arm(page, ARTICLE_BRUSH);
  ok(`brush armed: "${(await page.locator('.btn-picking').textContent())?.trim()}"`);
  await page.screenshot({ path: '/tmp/pick-armed.png' });

  // 1. one click, one card, named
  await row.click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length > n, before, { timeout: 8000 });
  const after = await cards(page);
  const t1 = await toast(page);
  (after === before + 1 && t1.includes(article))
    ? ok(`one click → one card (${before} → ${after}), toast: "${t1}"`)
    : bad(`one click → ${before} → ${after}, toast: "${t1}"`);
  await page.screenshot({ path: '/tmp/pick-after-click.png' });

  // 2. no twins
  await row.click();
  await page.waitForTimeout(1000);
  const after2 = await cards(page);
  const t2 = await toast(page);
  (after2 === after && /already/.test(t2))
    ? ok(`clicking the same row again adds nothing — "${t2}"`)
    : bad(`twin check: ${after} → ${after2}, toast "${t2}"`);

  // 3. undo — a DIFFERENT row, because the row above now correctly refuses (a refusal carries no undo)
  const row2 = page.locator('.article-list-row').nth(1);
  await row2.click();
  await page.waitForTimeout(900);
  const added = await cards(page);
  const undo = page.locator('.assembly-toast-btn');
  if (await undo.count()) {
    await undo.click();
    await page.waitForTimeout(600);
    const back = await cards(page);
    back === added - 1 ? ok(`Undo removes the spawned card (${added} → ${back})`) : bad(`undo: ${added} → ${back}`);
  } else bad(`no Undo button on the spawn toast ("${await toast(page)}")`);

  // ── the Commons-file half, on a board that is mostly galleries ────────────────────────────────────────────
  const gp = await freshPage();
  await gp.goto(`${base}/?config=/gallery-demo.json`, { waitUntil: 'domcontentloaded' });
  await gp.waitForSelector('.gallery-grid .gallery-item', { timeout: 40000 });
  const tile = gp.locator('.gallery-grid .gallery-item').first();
  const file = (await tile.getAttribute('title')) || '';

  // 4. the kind gate: an ARTICLE brush, a file clicked
  await arm(gp, ARTICLE_BRUSH);
  const g0 = await cards(gp);
  await tile.click();
  await gp.waitForTimeout(1200);
  const t4 = await toast(gp);
  const g1 = await cards(gp);
  (/does not take/.test(t4) && g1 === g0)
    ? ok(`kind gate: an article brush refuses a file — "${t4}"`)
    : bad(`kind gate: ${g0} → ${g1}, toast "${t4}"`);

  // 5. the matching brush places a card for the tile
  await arm(gp, FILE_BRUSH);
  await tile.click();
  await gp.waitForTimeout(1800);
  const g2 = await cards(gp);
  const t5 = await toast(gp);
  g2 === g1 + 1 ? ok(`a file brush places a card for a tile (${g1} → ${g2}): "${t5}"`) : bad(`file brush: ${g1} → ${g2}, toast "${t5}"`);
  await gp.screenshot({ path: '/tmp/pick-file-spawn.png' });

  // ── presentation modes ────────────────────────────────────────────────────────────────────────────────────
  for (const mode of ['lean', 'kiosk']) {
    const p2 = await freshPage();
    await p2.goto(`${base}/?config=/dashboard.json&${mode}=1`, { waitUntil: 'domcontentloaded' });
    let list = true;
    try { await p2.waitForSelector('.article-list-row', { timeout: 30000 }); } catch { list = false; }
    const controls = await p2.locator('.btn-picking, .pick-menu').count();
    const n1 = await cards(p2);
    if (list) await p2.locator('.article-list-row').first().click({ timeout: 4000 }).catch(() => {});
    await p2.waitForTimeout(1200);
    const n2 = await cards(p2);
    (n1 > 0 && n2 === n1 && controls === 0 && p2.errs.length === 0)
      ? ok(`${mode}: ${n1} cards, no pick control, a click adds nothing, 0 errors`)
      : bad(`${mode}: cards ${n1}→${n2}, pick controls ${controls}, errors ${p2.errs[0] || 'none'}`);
    await p2.close();
  }

  page.errs.length ? bad(`errors in normal mode: ${page.errs[0]}`) : ok('0 page errors and 0 console errors in normal mode');
  gp.errs.length ? bad(`errors on the gallery board: ${gp.errs[0]}`) : ok('0 errors on the gallery board');
} catch (e) {
  bad('harness: ' + String(e.message).slice(0, 150));
} finally {
  await browser.close();
  if (srv) srv.kill('SIGTERM');
}
if (failures.length) {
  console.log('\n  notes: non-2xx responses (upstream, not pick mode) —');
  const byUrl = new Map();
  for (const f of failures) { const k = f.replace(/[?&].*$/, ''); byUrl.set(k, (byUrl.get(k) || 0) + 1); }
  for (const [k, n] of [...byUrl].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${n}× ${k}`);
}
const fails = results.reduce((a, b) => a + b, 0);
console.log(`\n  ${fails ? 'FAILED' : 'PICK MODE OK'} — ${results.length - fails}/${results.length} checks`);
process.exit(fails ? 1 : 0);
