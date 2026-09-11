/**
 * Render the tutorial's title and end cards as PNGs in the browser (guaranteed fonts, no drawtext
 * escaping pitfalls), at the video's own resolution.
 */
import { createRequire } from 'node:module';
import { resolveOut } from './paths.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = resolveOut(process.argv[2] || null);
const W = 1920, H = 1080;

const card = (id, html, name) => () => ({ id, html, name });
const cards = [
  card('title', `
    <div style="font-size:112px;font-weight:700;letter-spacing:-2px">WikiBento</div>
    <div style="font-size:40px;color:#b9c2cf;margin-top:26px">Build a dashboard from live Wikimedia data — in four minutes</div>
    <div style="font-size:33px;color:#8fc0ff;margin-top:34px;font-family:ui-monospace,Menlo,monospace">wikibento.toolforge.org</div>`,
    'title.png'),
  card('end', `
    <div style="font-size:66px;font-weight:700">Start a board of your own</div>
    <div style="font-size:38px;color:#8fc0ff;margin-top:34px;font-family:ui-monospace,Menlo,monospace">wikibento.toolforge.org&nbsp;&nbsp;·&nbsp;&nbsp;?config=&lt;your wiki page&gt;</div>
    <div style="font-size:29px;color:#b9c2cf;margin-top:44px">Written guide: docs/TUTORIAL.md&nbsp;&nbsp;·&nbsp;&nbsp;Ask box: describe what you want</div>`,
    'end.png'),
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
for (const make of cards) {
  const { html, name } = make();
  const body = `<html><body style="margin:0;width:${W}px;height:${H}px;background:#14161a;color:#e8e8ea;
     font-family:system-ui,-apple-system,'Segoe UI',Roboto,'DejaVu Sans',sans-serif;
     display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
     ${html}</body></html>`;
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(body)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/cards/${name}` });
  console.log('wrote', `${OUT}/cards/${name}`);
}
await browser.close();
