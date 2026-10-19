#!/usr/bin/env node
/**
 * render-board — the second half of "a board is not done until both halves pass".
 *
 * `npm run check:board -- board.json` proves the SHAPE: it runs the app's own validator offline and reports what blocks
 * the import, what is repaired and what is ignored. It cannot tell you whether the board's *subjects* exist — a category
 * name, a file name or an article title that is not there imports with **zero warnings** and draws an empty card, which
 * is the most common way a board looks finished and is not.
 *
 * This is the world half: it pastes the board through the app's own ⬆ Import panel, loads it in a real browser and
 * reports, per card, what actually appeared — plus a screenshot, so zone labels and empty rankings are visible.
 *
 * The board is pasted, never copied into `public/` or `dist/`: a file in `public/` trips the demos gate, and a file in
 * `dist/` is not loadable as a board at all.
 *
 *   npm run render:board -- boards/my.json                                  # serves dist/ itself (refuses a stale build)
 *   npm run render:board -- boards/my.json --base https://wikibento.toolforge.org
 *   npm run render:board -- boards/my.json --out cache/render --strict       # a waiting card fails too
 *   npm run render:board -- boards/my.json --headed                          # embeds: headless cannot paint a PDF
 *
 * Exit code: 1 when a card is in its **error** state (or, with `--strict`, waiting/loading). A card that is simply
 * waiting is not a failure by default — on a tour or a pick-a-subject board that is the designed state, and ISSUE-145
 * gave it honest copy rather than a complaint.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const take = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv.splice(i, 2)[1]; };
const baseArg = take('--base');
const outDir = take('--out') || 'cache/render';
const strict = argv.includes('--strict');
// Headed is for EMBEDS: headless Chromium has no PDF viewer, so a PDF card screenshots as a blank frame there and looks
// broken when it is not (measured while building ISSUE-153). Everything else is cheaper headless.
const headed = argv.includes('--headed');
const file = argv.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('usage: npm run render:board -- board.json [--base URL] [--out DIR] [--strict] [--headed]');
  process.exit(2);
}
let board;
try {
  board = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`  ✘ ${file} is not readable JSON: ${e.message}`);
  process.exit(2);
}

/** The stale-build guard the other browser checks use: never measure the previous bundle. */
const newest = (dir) => {
  let ms = 0;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full); else ms = Math.max(ms, fs.statSync(full).mtimeMs);
    }
  };
  walk(dir);
  return ms;
};

let server = null;
let base = baseArg;
if (!base) {
  const src = newest('src');
  const dist = newest('dist/assets');
  if (!dist) { console.error('  ✘ dist/assets is missing — run `npx vite build` first.'); process.exit(1); }
  if (src > dist) {
    console.error('  ✘ src/ is newer than dist/assets — this would measure the PREVIOUS build.\n    Run `npx vite build`, or pass --base to measure a deployment.');
    process.exit(1);
  }
  const port = await new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
}

let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('  ✘ playwright-core not resolvable — run `npm install` first.');
  if (server) server.kill();
  process.exit(1);
}

const widgets = board.widgets?.length ?? 0;
console.log(`\n  rendering ${path.basename(file)} — ${widgets} widget(s) — against ${base}${baseArg ? ' (a deployment)' : ' (the local build)'}\n`);

const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message.slice(0, 120)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = String(m.text());
  if (/Content Security Policy|Failed to load resource|violates the following/.test(t)) return;
  problems.push(`console: ${t.slice(0, 110)}`);
});

let cards = [];
try {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Import/ }).click();
  await page.waitForSelector('.import-textarea', { timeout: 20000 });
  await page.locator('.import-textarea').fill(JSON.stringify(board));
  await page.locator('.import-panel button.btn-primary').click();
  await page.waitForTimeout(2500);
  // Give the fetch layer a moment: a card that is going to draw usually has by now.
  await page.waitForTimeout(3000);
  cards = await page.evaluate(() => [...document.querySelectorAll('[data-widget-id]')].map((el) => {
    const id = el.getAttribute('data-widget-id');
    const body = el.querySelector('.widget-body');
    const error = el.querySelector('.widget-error');
    const waiting = el.querySelector('.widget-waiting');
    const loading = el.querySelector('.widget-loading');
    // The freshness footer ("⏱ updated … auto-refresh 1h") is text too, and it defeated the first version of the `empty`
    // test: a card reading "No image found" plus a clock looked populated. Measure the card's *content*.
    const text = (body?.innerText || '').split('\n').map((l) => l.trim())
      .filter((l) => l && !/⏱|auto-refresh/.test(l))          // the freshness footer is text too
      .join(' ').trim();
    const inside = (sel) => (el.querySelector(sel)?.innerText || '').replace(/\s+/g, ' ').trim();
    // Heuristic, and said so: a card that drew but holds nothing. The app's own empty-state phrases are recognised
    // because "No image found" is 14 characters and would otherwise pass as content.
    const EMPTY = /^(no image found|no images?|no data|no results?|no files?|nothing( to show)?|none|not found|—+)$/i;
    // An embed (an iframe — a PDF, a wiki page) has no text of its own, so the `empty` heuristic reads it as blank. It is
    // neither a failure nor proof: the frame's content is a separate document, cross-origin, and its text is not ours to
    // read. Report it as its own state, with the screenshot as the evidence — that is how the PDF card's sandbox
    // question was settled (ISSUE-153: sandboxed = broken icon, unsandboxed = the real viewer).
    const embed = !error && !waiting && !loading && text.length < 12 && !!el.querySelector('iframe');
    const empty = !error && !waiting && !loading && !embed && (text.length < 12 || EMPTY.test(text));
    return {
      id,
      state: error ? 'error' : waiting ? 'waiting' : loading ? 'loading' : embed ? 'embed' : empty ? 'empty' : 'drawn',
      detail: error ? inside('.widget-error').slice(0, 90)
        : waiting ? inside('.widget-waiting').slice(0, 90)
          : embed ? 'an iframe — the screenshot is the evidence'
            : text.slice(0, 70) || '(no text — check the screenshot)',
    };
  }));
  fs.mkdirSync(outDir, { recursive: true });
  const shot = path.join(outDir, `${path.basename(file, '.json')}.png`);
  await page.screenshot({ path: shot });          // viewport-clipped, never fullPage (it re-mounts lazy cards)
  console.log(`  screenshot: ${shot}`);
} catch (e) {
  problems.push(String(e).slice(0, 140));
} finally {
  await browser.close();
  if (server) server.kill();
}

const count = (s) => cards.filter((c) => c.state === s).length;
const icon = { drawn: '✅', waiting: '⏳', loading: '…', empty: '␀', embed: '▭', error: '❌' };
for (const c of cards) console.log(`  ${icon[c.state]} ${c.id.padEnd(20)} ${c.state.padEnd(7)} ${c.detail}`);
if (cards.length < widgets) console.log(`  ⚠ ${widgets - cards.length} widget(s) never appeared as a card at all`);
console.log(`\n  ${cards.length}/${widgets} card(s) — ${count('drawn')} drawn · ${count('embed')} embed · ${count('empty')} empty · ${count('waiting')} waiting · ${count('loading')} loading · ${count('error')} errored`);
for (const p of problems.slice(0, 5)) console.log(`  ! ${p}`);

const failed = count('error') > 0 || cards.length < widgets || problems.length > 0 || (strict && (count('waiting') || count('loading')));
if (failed) console.log('\n  the import is clean; the RENDER is not — fix what is listed above and run again\n');
else console.log('\n  every card drew\n');
process.exit(failed ? 1 : 0);
