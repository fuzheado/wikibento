/**
 * Click the ⬇ Canvas button in a real browser and check the file it produces.
 *
 * The unit tests (tests/json-canvas.test.mjs) prove the *projection*; this proves the *wiring* — that the button
 * exists, that clicking it downloads a `.canvas` file, and that the bytes are a valid JSON Canvas document made from
 * the board on screen. Run against a built dist/ (see docs/BROWSER-TESTING.md):
 *
 *   PLAYWRIGHT_BROWSERS_PATH=… npx vite preview --port 4173 &
 *   PLAYWRIGHT_BROWSERS_PATH=… node scripts/canvas-export-e2e.mjs --base http://localhost:4173
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const arg = process.argv.indexOf('--base');
const base = (arg > -1 ? process.argv[arg + 1] : null) || 'http://localhost:4173';
const NODE_TYPES = new Set(['text', 'file', 'link', 'group']);

const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);   // let the cards fetch, so the board has content to project

const button = page.locator('button[title^="Export as a JSON Canvas"]');
const present = await button.count();
console.log(`canvas button present: ${present}`);

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  button.click(),
]);
const name = download.suggestedFilename();
const path = `/opt/data/staging/${name}`;
await download.saveAs(path);
console.log(`downloaded: ${name}`);

const doc = JSON.parse(readFileSync(path, 'utf8'));
const ids = new Set();
const problems = [];
for (const n of doc.nodes || []) {
  if (ids.has(n.id)) problems.push(`duplicate node id ${n.id}`);
  ids.add(n.id);
  if (!NODE_TYPES.has(n.type)) problems.push(`bad node type ${n.type}`);
  for (const k of ['x', 'y', 'width', 'height']) {
    if (!Number.isInteger(n[k])) problems.push(`${n.id}.${k} not an integer`);
  }
}
for (const e of doc.edges || []) {
  if (!ids.has(e.fromNode) || !ids.has(e.toNode)) problems.push(`edge ${e.id} names a missing node`);
}
const cardsOnPage = await page.locator('[data-widget-id]').count();
console.log(`nodes: ${doc.nodes?.length} · edges: ${doc.edges?.length} · link nodes: ${doc.nodes?.filter((n) => n.type === 'link').length} · cards on the page: ${cardsOnPage}`);
console.log(`problems: ${problems.length ? problems.join('; ') : 'none'}`);
console.log(`page errors: ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
console.log(`console errors (upstream noise is a note, not a failure): ${consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'none'}`);
await browser.close();

if (!present || problems.length || pageErrors.length || !doc.nodes?.length) {
  console.log('CANVAS EXPORT CHECK: FAIL');
  process.exit(1);
}
console.log('CANVAS EXPORT CHECK: PASS');
