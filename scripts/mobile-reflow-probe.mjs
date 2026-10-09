/**
 * The mobile reflow probe — what moves when a card above the reader changes size.
 *
 * Andrew, 2026-10-09: with a text card before the picture the page is "more jumpy" than with the picture first. This
 * measures it: a note, a zone picture and a consumer below it, on an iPhone viewport, sampling every ~16ms while the
 * bitmap arrives and then while a zone click fills the consumer. What it prints is what a READER sees — viewport-relative
 * tops and the position of the element that actually scrolls — because document-absolute coordinates hide the effect
 * (`docs/research/MOBILE-RESIZE-STABILITY.md` holds the numbers and the options).
 *
 *   node scripts/mobile-reflow-probe.mjs                     # production
 *   node scripts/mobile-reflow-probe.mjs --base http://localhost:4173
 *   node scripts/mobile-reflow-probe.mjs --engine chromium
 *   node scripts/mobile-reflow-probe.mjs --only shipped       # skip the reserved variant
 */
import { chromium, webkit } from 'playwright';
const ZONES = ['12,76,10,7 | Biosphere | article | en:Biosphere | send','8,60,12,7 | Ecosystem | article | en:Ecosystem | send','30,14,10,8 | Cell | article | en:Cell (biology) | send'].join('\n');
const board = {
  version: 1, params: {}, widgets: [
    { id: 'note', widgetType: 'markdown', name: 'Context', config: { text: '# Levels of organisation\n\nEvery label in the diagram below is a **door**. This is the text a reader wants *before* the picture — the case that jumps.\n\n- one\n- two\n- three\n\nThe card under the picture is the consumer: it fills in when you click a zone. It is tall enough to matter.' } },
    { id: 'img', widgetType: 'gallery', name: 'Biosphere diagram', config: { from: 'list', files: 'File:XBio illustration – Biosphere.png', displayMode: 'single', imageFit: 'contain', hotspotStyle: 'subtle', zones: ZONES } },
    { id: 'cons', widgetType: 'excerpt', name: 'The article', config: { article: '{{widget:img#zones}}' } },
  ],
  layout: [{ i: 'note', x: 0, y: 0, w: 12, h: 4 }, { i: 'img', x: 0, y: 4, w: 12, h: 6 }, { i: 'cons', x: 0, y: 10, w: 12, h: 4 }],
};
const b64 = Buffer.from(JSON.stringify(board), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const URL = `${arg('--base') || 'https://wikibento.toolforge.org'}/#/d/${b64}${process.env.LEAN ? '&lean=1' : ''}`;

/** What the READER sees: viewport-relative tops, plus the position of the element that actually scrolls. */
const sampler = (page, ms) => page.evaluate((m) => new Promise((res) => {
  const out = [], t0 = performance.now();
  const q = (id) => document.querySelector('[data-widget-id="' + id + '"]');
  const scrollable = (el) => { if (!el) return null; let n = el; while (n && n !== document.body) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return n; n = n.parentElement; } return document.scrollingElement; };
  const r = (el, sc) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), doc: Math.round(b.top + (sc ? sc.scrollTop : window.scrollY)) }; };
  const snap = () => {
    const sc = scrollable(q('cons'));
    out.push({ t: Math.round(performance.now() - t0), scroll: Math.round(sc ? sc.scrollTop : window.scrollY), doc: Math.round(sc ? sc.scrollHeight : document.documentElement.scrollHeight),
      note: r(q('note'), sc), img: r(q('img'), sc), cons: r(q('cons'), sc) });
  };
  const iv = setInterval(snap, 16); snap();
  setTimeout(() => { clearInterval(iv); res(out); }, m);
}), ms);

const engineName = arg('--engine') || process.env.ENGINE || 'webkit';
const engine = engineName === 'chromium' ? chromium : webkit;
const browser = await engine.launch();
const run = async (label, patch) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  if (patch) await page.addInitScript(patch);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id="cons"]', { timeout: 30000 });
  // The reader is at the bottom (reading the card under the picture) while the bitmap is still arriving.
  await page.evaluate(() => { const els = document.querySelectorAll('[data-widget-id]'); let n = els[els.length - 1]; while (n && n !== document.body) { if (n.scrollHeight > n.clientHeight + 4) { n.scrollTop = n.scrollHeight; break; } n = n.parentElement; } window.scrollTo(0, document.documentElement.scrollHeight); });
  const load = await sampler(page, 6000);
  await page.waitForSelector('[data-widget-id="img"] .zone', { timeout: 60000 });
  await page.waitForTimeout(500);
  const box = await page.evaluate(() => { const b = document.querySelector('[data-widget-id="img"] .zone'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  const pre = await sampler(page, 120);
  await page.mouse.click(box.x, box.y);
  const after = await sampler(page, 4000);
  const drift = (rows, key) => { const v = rows.map((s) => s[key]).filter((x) => x !== null); return v.length ? { first: v[0].top, min: Math.min(...v.map((x) => x.top)), max: Math.max(...v.map((x) => x.top)), h: [v[0].h, v.at(-1).h], docTop: [v[0].doc, v.at(-1).doc] } : null; };
  const sc = (rows) => ({ scroll: [rows[0].scroll, Math.min(...rows.map((s) => s.scroll)), Math.max(...rows.map((s) => s.scroll)), rows.at(-1).scroll], doc: [rows[0].doc, rows.at(-1).doc] });
  console.log(`\n  ── ${label} ──`);
  const L = drift(load, 'cons');
  console.log(`  LOAD, reader parked at the bottom  ·  consumer on screen: top ${L.first} → ${L.max - L.min}px of wobble (min ${L.min}, max ${L.max}), height ${L.h[0]}→${L.h[1]}px`);
  console.log(`  LOAD  ·  scroller: scroll ${sc(load).scroll[0]} → wobble ${sc(load).scroll[1]}…${sc(load).scroll[2]} → end ${sc(load).scroll[3]} · content ${sc(load).doc[0]}→${sc(load).doc[1]}px`);
  const A = drift(after, 'cons');
  console.log(`  CLICK ·  consumer on screen: top ${A.first} → wobble ${A.min}…${A.max}, height ${A.h[0]}→${A.h[1]}px, docTop ${A.docTop[0]}→${A.docTop[1]}`);
  console.log(`  CLICK ·  scroller: scroll ${sc(pre).scroll[0]} → wobble ${sc(after).scroll[1]}…${sc(after).scroll[2]} → end ${sc(after).scroll[3]} · content ${sc(pre).doc[0]}→${sc(after).doc[1]}px`);
  const cssBox = await page.evaluate(() => { const el = document.querySelector('.gallery-single-img'); if (!el) return null; const s = getComputedStyle(el); return { ar: s.aspectRatio, h: Math.round(el.getBoundingClientRect().height), display: s.display, tag: el.tagName.toLowerCase(), src: !!el.getAttribute('src') }; });
  console.log(`  picture box: <${cssBox?.tag}> aspect-ratio ${cssBox?.ar}, ${cssBox?.h}px, real bitmap: ${cssBox?.src}`);
  const rng = (rows, key, f) => { const v = rows.map((s) => s[key]).filter(Boolean).map(f); return v.length ? `${Math.min(...v)}…${Math.max(...v)}` : '—'; };
  console.log(`  heights while loading:  note ${rng(load, 'note', (x) => x.h)} · picture ${rng(load, 'img', (x) => x.h)} · consumer ${rng(load, 'cons', (x) => x.h)}`);
  console.log(`  on-screen tops:         note ${rng(load, 'note', (x) => x.top)} · picture ${rng(load, 'img', (x) => x.top)} · consumer ${rng(load, 'cons', (x) => x.top)}`);
  // WHEN the picture grew — the frame and the size of the biggest single step, which names the mechanism
  const steps = load.map((s, i) => (i && s.img && load[i - 1].img ? { t: s.t, d: s.img.h - load[i - 1].img.h } : null)).filter((x) => x && Math.abs(x.d) > 4);
  console.log(`  the picture's steps:    ${steps.length ? steps.map((x) => `${x.d > 0 ? '+' : ''}${x.d}px@${x.t}ms`).join(' ') : 'none'}`);
  await page.close();
};
console.log(`\n${engineName} · iPhone 390×844${process.env.LEAN ? ' · lean' : ''}`);
const reserve = `(() => {
  const css = document.createElement('style');
  css.textContent = '.gallery-single .gallery-single-img, .gallery-single-link .gallery-single-img { aspect-ratio: 3 / 2 !important; height: auto !important; width: 100% !important; } .react-grid-item { overflow-anchor: none; }';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
})()`;
if (!arg('--only') || arg('--only') === 'shipped') {
  console.log('\n— the jumpy case: text first —');
  await run('as shipped', null);
  await run('reserved (aspect-ratio 3:2 !important) + overflow-anchor:none', reserve);
}
if (arg('--only') === 'first') {
  console.log('\n— the arrangement that works: picture first —');
  const FIRST = process.env.ONLY;
  await run('as shipped, picture first', null);
  await run('reserved, picture first', reserve);
}
await browser.close();
