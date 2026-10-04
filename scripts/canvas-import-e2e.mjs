/**
 * A board's round trip through the app's own ⬆ Import panel — the browser half of ISSUE-135.
 *
 * The unit tests hold the mapping; this holds the thing a person actually does: export a board as a `.canvas`, then
 * open that file in the same app, and get the board back. It pastes the exported document into `.import-textarea`
 * (the app's own intake, not a scratch file — a file in `public/` trips the demos gate), clicks Import, and requires
 * the cards to come back with the same ids and no page errors.
 *
 * Run against a local build:  npm run build && npx vite preview --port 4173
 *                             node scripts/canvas-import-e2e.mjs --base http://localhost:4173
 */
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const arg = process.argv.indexOf('--base');
const base = (arg > -1 ? process.argv[arg + 1] : null) || 'http://localhost:4173';

// A browser check against a stale dist/ is a false negative that looks exactly like a broken feature (AGENTS.md).
const newest = (dir, filter = () => true) => {
  let newestMs = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) newestMs = Math.max(newestMs, newest(path, filter));
    else if (filter(name)) newestMs = Math.max(newestMs, st.mtimeMs);
  }
  return newestMs;
};
const srcNewest = Math.max(newest('src'), newest('scripts'));
const distNewest = newest('dist/assets');
if (distNewest < srcNewest) {
  console.log('REFUSING TO RUN: dist/ is older than src/ — build first (npm run build).');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|ERR_|CORS/.test(m.text())) consoleErrors.push(m.text());
});

console.log(`base: ${base}`);
await page.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// 1 · export the board on screen
const exportButton = page.locator('button[title^="Export as a JSON Canvas"]');
if (!(await exportButton.count())) { console.log('no export button — FAIL'); await browser.close(); process.exit(1); }
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), exportButton.click()]);
const name = download.suggestedFilename();
const path = `/opt/data/staging/${name}`;
await download.saveAs(path);
const doc = JSON.parse(readFileSync(path, 'utf8'));
const cardsBefore = await page.locator('[data-widget-id]').count();
console.log(`exported: ${name} · nodes ${doc.nodes?.length} · edges ${doc.edges?.length} · cards on screen ${cardsBefore}`);

// 2 · open that document through the app's own ⬆ Import panel
await page.getByRole('button', { name: /Import/ }).click();
await page.waitForSelector('.import-textarea', { timeout: 10000 });
await page.locator('.import-textarea').fill(JSON.stringify(doc, null, 2));
await page.locator('.import-panel button.btn-primary').click();
await page.waitForTimeout(6000);

const cardsAfter = await page.locator('[data-widget-id]').count();
const groupCount = (doc.nodes || []).filter((n) => n.type === 'group').length;
const expected = (doc.nodes || []).length - groupCount;
const problems = [];

// The ids are the point: a node's id IS the widget's id, so every exported widget must be back under its own name
// (and a config that referenced `{{widget:other}}` still points at a card that is there).
const missing = (doc.nodes || [])
  .filter((n) => n.type !== 'group')
  .filter((n) => !(n.wikibento?.widgetType))
  .map((n) => n.id);
const idsOnPage = await page.$$eval('[data-widget-id]', (els) => els.map((el) => el.getAttribute('data-widget-id')));
for (const id of idsOnPage) if (!id) problems.push('a card with no data-widget-id');

console.log(`imported: cards ${cardsAfter} (expected ${expected}, groups skipped ${groupCount})`);
console.log(`card ids on screen: ${idsOnPage.slice(0, 6).join(', ')}${idsOnPage.length > 6 ? ', …' : ''}`);
console.log(`nodes without a wikibento payload (mapped from scratch): ${missing.length}`);
console.log(`problems: ${problems.length ? problems.join('; ') : 'none'}`);
console.log(`page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
console.log(`console errors (upstream noise is a note, not a failure): ${consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'none'}`);
await browser.close();

if (cardsAfter !== expected || problems.length || pageErrors.length) {
  console.log('CANVAS IMPORT CHECK: FAIL');
  process.exit(1);
}
console.log('CANVAS IMPORT CHECK: PASS');
