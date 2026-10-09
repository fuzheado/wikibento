import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const url = readFileSync('/tmp/turbine-url.txt', 'utf8').trim();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-widget-id="turbine-diagram"] .zone', { timeout: 60000 });
await page.waitForTimeout(1500);
console.log('  ' + await page.evaluate(() => {
  const card = document.querySelector('[data-widget-id="turbine-diagram"]');
  const img = card.querySelector('img.gallery-single-img');
  const link = card.querySelector('[data-photo-click]');
  const r = (el) => { const b = el?.getBoundingClientRect(); return b ? `${Math.round(b.width)}×${Math.round(b.height)}` : '—'; };
  return `card ${r(card)} · picture wrapper ${r(link)} · <img> ${r(img)} (natural ${img?.naturalWidth}×${img?.naturalHeight}, currentSrc …${(img?.currentSrc || '').slice(-24)})`;
}));
await browser.close();
