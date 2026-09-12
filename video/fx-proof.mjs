/**
 * Proof of the tutorial's "fx" layer: smooth zoom onto a target, a red ring drawn around a small
 * element, and typing with per-keystroke click sounds + a large typed-text chip.
 *
 * Everything is driven from inside the page (a CSS transform on the app root), which keeps text
 * crisp when magnified and lets the browser do the easing smoothly, instead of upscaling pixels in
 * ffmpeg. Keystroke times are recorded to events.json so the assembler can lay the click track.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOut, arg } from './paths.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const OUT = resolveOut(arg('out', null), { sub: 'fx-proof' });
const APP = 'https://wikibento.toolforge.org/';
mkdirSync(OUT, { recursive: true });

// ── in-page fx ──────────────────────────────────────────────────────────────
const FX = `
window.__fx = {
  zoom(rect, factor, ms) {
    const root = document.getElementById('root') || document.body;
    root.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.33, 0, 0.2, 1)';
    root.style.transformOrigin = '50% 50%';
    root.style.willChange = 'transform';
    if (factor <= 1.001) { root.style.transform = 'none'; return; }
    // centre the target in the viewport, then magnify about that point
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const tx = (window.innerWidth / 2 - cx) * factor + cx - cx;
    const ty = (window.innerHeight / 2 - cy) * factor + cy - cy;
    root.style.transformOrigin = cx + 'px ' + cy + 'px';
    root.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + factor + ')';
  },
  ring(rect, ms, label) {
    document.querySelectorAll('.fx-ring').forEach((n) => n.remove());
    const pad = 8;
    const el = document.createElement('div');
    el.className = 'fx-ring';
    el.style.cssText = 'position:fixed;left:' + (rect.x - pad) + 'px;top:' + (rect.y - pad) + 'px;' +
      'width:' + (rect.width + pad * 2) + 'px;height:' + (rect.height + pad * 2) + 'px;' +
      'border:3px solid #ff2d2d;border-radius:999px;box-shadow:0 0 0 3px rgba(255,45,45,.20);' +
      'pointer-events:none;z-index:2147483647;opacity:0;transition:opacity 220ms ease-out';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    if (label) {
      const t = document.createElement('div');
      t.className = 'fx-ring';
      t.textContent = label;
      t.style.cssText = 'position:fixed;left:' + (rect.x - pad) + 'px;top:' + (rect.y + rect.height + 10) + 'px;' +
        'font:600 22px system-ui,sans-serif;color:#ff2d2d;background:rgba(20,22,26,.86);padding:4px 10px;' +
        'border-radius:6px;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity 220ms';
      document.body.appendChild(t);
      requestAnimationFrame(() => { t.style.opacity = '1'; });
    }
    setTimeout(() => {
      document.querySelectorAll('.fx-ring').forEach((n) => {
        n.style.opacity = '0';
        setTimeout(() => n.remove(), 400);
      });
    }, ms);
  },
};
'ok';
`;

const box = (page, ...sels) => page.evaluate((list) => {
  for (const s of list) {
    let el = null;
    try { el = document.querySelector(s); } catch { continue; }   // ':has-text()' is not CSS
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) {
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }
  }
  return null;
}, sels);

/** Find the smallest visible element whose text matches, e.g. an "Add Widget" button. */
const boxByText = (page, src) => page.evaluate((s) => {
  const rx = new RegExp(s, 'i');
  const hits = [...document.querySelectorAll('button, a, [role="button"], div, span')]
    .filter((e) => rx.test(e.textContent || '') && e.offsetParent !== null);
  if (!hits.length) return null;
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  const r = hits[0].getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
           text: (hits[0].textContent || '').trim().slice(0, 40) };
}, src);

const settle = (page, ms) => page.waitForTimeout(ms);

async function glide(page, x, y, steps = 20) {
  const cur = await page.evaluate(() => ({ x: window.__mx ?? 960, y: window.__my ?? 540 }));
  for (let i = 1; i <= steps; i++) {
    const nx = cur.x + ((x - cur.x) * i) / steps;
    const ny = cur.y + ((y - cur.y) * i) / steps;
    await page.mouse.move(nx, ny);
    await page.waitForTimeout(18);
  }
  await page.evaluate(([a, b]) => { window.__mx = a; window.__my = b; }, [x, y]);
}

// ── the take ────────────────────────────────────────────────────────────────
const events = { keystrokes: [], rings: [], zooms: [] };
const t0 = Date.now();
const at = () => (Date.now() - t0) / 1000;

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await settle(page, 3500);
await page.evaluate(FX);

// 1. ring the Add Widget button, then click it
const addBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /^\+\s*Add Widget/i.test((e.textContent || '').trim()));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), text: b.textContent.trim() };
});
console.log('add button box:', JSON.stringify(addBtn));
if (addBtn) {
  await glide(page, addBtn.x + addBtn.width / 2, addBtn.y + addBtn.height / 2);
  await page.evaluate(([r, ms, l]) => window.__fx.ring(r, ms, l), [addBtn, 1400, 'Add Widget']);
  events.rings.push({ t: at(), target: 'add-widget' });
  await settle(page, 1500);
  await page.mouse.click(addBtn.x + addBtn.width / 2, addBtn.y + addBtn.height / 2);
}
await settle(page, 1600);

// 2. zoom onto the picker's search field and ring it
const input = await box(page, '.widget-picker input') || await box(page, 'input[type="search"]') || await box(page, 'input');
console.log('search input box:', JSON.stringify(input));
if (input) {
  await page.evaluate(([r, f, ms]) => window.__fx.zoom(r, f, ms), [input, 1.8, 700]);
  events.zooms.push({ t: at(), target: 'search', factor: 1.8 });
  await settle(page, 900);
  const zoomed = (await box(page, '.add-widget-search')) || input;
  await page.evaluate(([r, ms, l]) => window.__fx.ring(r, ms, l), [zoomed, 9000, 'search the picker']);
  events.rings.push({ t: at(), target: 'search' });
  await settle(page, 400);
  await page.mouse.click(zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2);
  await settle(page, 300);

  // 3. type with per-keystroke timing
  const text = 'pageviews';
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    events.keystrokes.push({ ch, t: at() });
    await settle(page, 95);
  }
  await settle(page, 1400);
  const typed = await page.evaluate(() => document.querySelector('.add-widget-search')?.value);
  const results = await page.evaluate(() => document.querySelectorAll('.add-widget-add').length);
  console.log('FIELD VALUE:', JSON.stringify(typed), '| result rows:', results, typed === 'pageviews' ? '✔ typing landed in the field' : '✘ typing did not reach the field');
  await page.evaluate(() => window.__fx.zoom(null, 1, 600));
  await settle(page, 900);
}
await settle(page, 600);
const video = page.video();
await page.close();
await ctx.close();
await browser.close();
const src = await video.path();
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ src, events, duration: at() }, null, 2));
console.log('clip:', src);
console.log('keystrokes:', events.keystrokes.length, '| last at', events.keystrokes.at(-1)?.t.toFixed(2), 's');
