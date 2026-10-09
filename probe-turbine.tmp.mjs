import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const url = readFileSync('/tmp/turbine-url.txt', 'utf8').trim();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 130)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|CSP/.test(m.text())) errors.push('console: ' + m.text().slice(0, 110)); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-widget-id="turbine-diagram"] .zone', { timeout: 60000 });
await page.waitForTimeout(600);
const zones = await page.evaluate(() => [...document.querySelectorAll('[data-widget-id="turbine-diagram"] .zone')].map((b) => b.getAttribute('aria-label')));
console.log('  zones on the diagram:', zones.length, JSON.stringify(zones));
const click = async (label) => {
  await page.click(`[data-widget-id="turbine-diagram"] .zone[aria-label="${label}"]`);
  await page.waitForTimeout(3000);
  return page.evaluate(() => ({
    article: (document.querySelector('[data-widget-id="turbine-article"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
    traffic: (document.querySelector('[data-widget-id="turbine-traffic"]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  }));
};
for (const z of ['Steam Turbine', 'Boiler', 'Warm water out']) console.log(`  click "${z}":`, JSON.stringify(await click(z)));
await page.screenshot({ path: 'cache/turbine-board.png' });
console.log('  errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
