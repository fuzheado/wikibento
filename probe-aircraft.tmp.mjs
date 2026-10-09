import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const url = readFileSync('/tmp/aircraft-url.txt', 'utf8').trim();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 130)));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-widget-id="aircraft-chart"] .zone', { timeout: 60000 });
await page.waitForTimeout(800);
const zones = await page.evaluate(() => [...document.querySelectorAll('[data-widget-id="aircraft-chart"] .zone')].map((b) => b.getAttribute('aria-label')));
console.log('  zones:', zones.length, JSON.stringify(zones));
const click = async (label) => {
  await page.click(`[data-widget-id="aircraft-chart"] .zone[aria-label="${label}"]`);
  await page.waitForTimeout(3000);
  return page.evaluate(() => ({
    article: (document.querySelector('[data-widget-id="aircraft-article"]')?.innerText || '').replace(/\s+/g, ' ').slice(-60),
    traffic: (document.querySelector('[data-widget-id="aircraft-traffic"]')?.innerText || '').replace(/\s+/g, ' ').slice(-60),
  }));
};
for (const z of ['F-14 Tomcat', 'B-52 Stratofortress', 'Extended Life']) console.log(`  click "${z}":`, JSON.stringify(await click(z)));
await page.screenshot({ path: 'cache/aircraft-board.png' });
console.log('  errors:', errors.length ? errors : 'none');
await browser.close();
