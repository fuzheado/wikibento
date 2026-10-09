import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const url = readFileSync('/tmp/tour-url.txt', 'utf8').trim();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
const shot = (id) => page.evaluate((w) => {
  const el = document.querySelector(`[data-widget-id="${w}"]`);
  const img = el?.querySelector('img.gallery-single-img');
  const src = img?.currentSrc || img?.src || '';
  return { image: (src.match(/(\d\d)\.jpg/) || [null])[0],          // 21 / 26 / 29 — the bit that distinguishes them
           waiting: !!el?.querySelector('.widget-waiting'),
           waiting: (el?.querySelector('.widget-waiting')?.innerText || '').split('\n')[0] || null,
           zones: [...(el?.querySelectorAll('.zone') || [])].map((b) => b.getAttribute('aria-label')) };
}, id);
const click = async (card, label) => {
  await page.click(`[data-widget-id="${card}"] .zone[aria-label="${label}"]`);
  await page.waitForFunction((c) => !!document.querySelector(`[data-widget-id="${c}"] img.gallery-single-img`), card, { timeout: 30000 });
  await page.waitForTimeout(1200);
};
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-widget-id="tour-a"] .zone', { timeout: 60000 });
await page.waitForTimeout(800);
console.log('  at load:');
for (const c of ['tour-a', 'tour-b', 'tour-c']) console.log(`    ${c}`, JSON.stringify(await shot(c)));
await click('tour-a', 'Next view →');
console.log('  after A → Next view:');
for (const c of ['tour-a', 'tour-b', 'tour-c']) console.log(`    ${c}`, JSON.stringify(await shot(c)));
await click('tour-b', 'Next view →');
console.log('  after B → Next view:');
for (const c of ['tour-b', 'tour-c']) console.log(`    ${c}`, JSON.stringify(await shot(c)));
await click('tour-c', '◀ Back');
console.log('  after C → ◀ Back:');
console.log('    tour-b', JSON.stringify(await shot('tour-b')));
await page.screenshot({ path: 'cache/tour-demo.png' });
console.log('  page errors:', errors.length ? errors : 'none');
await browser.close();
