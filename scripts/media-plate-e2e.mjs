#!/usr/bin/env node
/**
 * The media plate, in a browser (issue #111) — `npm run smoke:plate`.
 *
 * The unit half (`tests/media-plate.test.mjs`) proves the choice normalizes and that a vector URL is recognised.
 * What only a browser can answer is whether the plate is actually PAINTED: whether the frame carries the class,
 * whether the image gets one of its own under `auto`, and what the computed background ends up being. That last
 * one is the whole point of the change — a picture's backdrop was `#0f1117`, and black line art on it is invisible.
 *
 * Three cards, one board, loaded through the app's own `#/d/` share payload (no file in `public/`, which would
 * trip the demos gate, and no scratch file in `dist/`, which is not loadable as a board — both learned in this
 * repo the hard way):
 *
 *   1. `auto` (the default) with FOUR files in one gallery: a vector, two transparent PNGs (one with dark ink,
 *      one with white ink) and an opaque JPEG. The vector gets a white plate from its URL; the transparent
 *      PNGs get their plate from a corner-alpha readback AND the readback decides the DIRECTION — dark ink
 *      takes the white plate, white ink keeps the dark card background (a white plate under white line art is
 *      the mirror of the bug); the opaque JPEG keeps the card background. This is the assertion that keeps
 *      `auto` per-IMAGE: a per-card light plate would give every photo gallery a white letterbox.
 *   2. `none` — the vector, no plate. The card's own background shows through, which is what `none` means, and
 *      no readback should be able to add one.
 *   3. `light` — the JPEG gets a white plate too, because there is no way to detect anything about a card the
 *      user has already decided about.
 *
 * Usage: npm run build && node scripts/media-plate-e2e.mjs [--port 8993]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install first');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8993;

if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

/** Refuse to measure a stale build (the trap that made a fixed feature look broken twice, 2026-09-24). */
function assertFreshBuild() {
  const newest = (dir) => {
    let ms = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!e.isFile()) continue;
      const full = path.join(e.parentPath || e.path || dir, e.name);
      ms = Math.max(ms, fs.statSync(full).mtimeMs);
    }
    return ms;
  };
  const src = newest(path.join(root, 'src'));
  const dist = newest(path.join(root, 'dist'));
  if (src > dist) {
    console.error('dist/ is older than src/ — run npm run build first (this check measures the BUILT app)');
    process.exit(2);
  }
}
assertFreshBuild();

const SVG = 'File:Symbol question.svg';              // black line art on transparency — the reported case
const PNG_DARK_INK = 'File:Cscr-featured.png';       // transparent RASTER, DARK ink (measured luminance 131.9)
const PNG_LIGHT_INK = 'File:Globe Icon White.png';   // transparent RASTER, LIGHT ink (measured luminance 255.0)
const RASTER = 'File:Albert Einstein Head.jpg';      // opaque, and must stay unplated under `auto`

const board = (mediaBackground) => ({
  version: 1,
  layout: [{ i: 'plate-gallery', x: 0, y: 0, w: 10, h: 10, minW: 3, minH: 3 }],
  widgets: [
    {
      id: 'plate-gallery',
      widgetType: 'gallery',
      config: { title: `plate ${mediaBackground}`, from: 'list', files: `${SVG}\n${PNG_DARK_INK}\n${PNG_LIGHT_INK}\n${RASTER}`, displayMode: 'grid', showCaptions: false, mediaBackground },
    },
  ],
});

/** UTF-8-safe base64url, the same encoding as `src/lib/share.js#encodeDashboardHash`. */
const hashFor = (json) => '#' + '/d/' + Buffer.from(json, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const waitPort = (port, tries = 60) => new Promise((resolve, reject) => {
  const tick = (n) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(); });
    s.once('error', () => { s.destroy(); if (n <= 1) reject(new Error(`preview server never came up on ${port}`)); else setTimeout(() => tick(n - 1), 250); });
  };
  tick(tries);
});

const vite = path.join(root, 'node_modules/.bin/vite');
const server = spawn(vite, ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });

const failures = [];
const checks = [];
const check = (ok, label, extra = '') => {
  checks.push(`${ok ? '✔' : '✖'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

let browser;
try {
  await waitPort(PORT);
  browser = await chromium.launch({ headless: true });
  const pageErrors = [];
  let page;

  /** Load a board and read back what the browser actually painted.
   *
   *  A FRESH page per case, deliberately: the app boots its board from the URL once (`urlState.js` — `?config=`
   *  → `#/d/` → localStorage), and a hash-only change on a live document does not re-claim it. Reusing one page
   *  measured the previous case's plate three times, which is exactly the kind of confident wrong answer this
   *  check exists to prevent. */
  const inspect = async (mediaBackground) => {
    if (page) await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    const json = JSON.stringify(board(mediaBackground));
    await page.goto(`http://127.0.0.1:${PORT}/?case=${encodeURIComponent(mediaBackground)}${hashFor(json)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gallery-item img, .gallery-thumb', { timeout: 30000 });
    // Give the imageinfo fetch a chance to resolve the two files, then measure.
    await page.waitForFunction(() => document.querySelectorAll('img.gallery-thumb[src]').length >= 1, null, { timeout: 30000 })
      .catch(() => {});
    // The transparent-PNG decision is asynchronous by design (it waits for decoded pixels), so wait for the
    // class rather than for a stopwatch. The timeout is the honest bound: if detection never lands, this check
    // fails instead of quietly passing on a timer.
    await page.waitForSelector('img.gallery-thumb.plate-alpha-dark', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return page.evaluate(() => {
      const frame = document.querySelector('.widget-frame');
      const imgs = [...document.querySelectorAll('img.gallery-thumb')].map((el) => ({
        src: el.getAttribute('src') || '',
        plateVector: el.classList.contains('plate-vector'),
        plateAlpha: el.classList.contains('plate-alpha'),
        plateAlphaDark: el.classList.contains('plate-alpha-dark'),
        background: getComputedStyle(el).backgroundColor,
      }));
      return { frameClass: frame ? frame.className : '', imgs };
    });
  };

  const svgOf = (r) => r.imgs.find((i) => /\.svg/i.test(i.src));
  const pngOf = (r, slug) => r.imgs.find((i) => i.src.includes(slug));
  const rasterOf = (r) => r.imgs.find((i) => /\.jpe?g$/i.test(i.src)) || r.imgs.find((i) => !/\.svg/i.test(i.src));

  // ── 1 · auto ──────────────────────────────────────────────────────────────────────────────────
  const auto = await inspect('auto');
  check(!/(plate-light|plate-dark|plate-none)/.test(auto.frameClass), 'auto puts no class on the frame (each image decides)', `frame="${auto.frameClass}"`);
  check(auto.imgs.length >= 4, 'the gallery rendered all four files', `${auto.imgs.length} tile(s)`);
  const svg1 = svgOf(auto); const raster1 = rasterOf(auto);
  check(!!svg1, 'the vector file is on the board');
  if (svg1) {
    check(svg1.plateVector, 'the SVG tile carries plate-vector under auto');
    check(svg1.background === 'rgb(255, 255, 255)', 'the SVG tile paints a LIGHT plate', svg1.background);
  }
  const png1 = pngOf(auto, 'Cscr-featured');
  check(!!png1, 'the transparent PNG with DARK ink is on the board');
  if (png1) {
    check(png1.plateAlpha, 'it was DETECTED as transparent (a pixel readback, no URL signal)');
    check(png1.background === 'rgb(255, 255, 255)', 'dark ink gets the WHITE plate', png1.background);
  }
  const pngWhite = pngOf(auto, 'Globe_Icon_White');
  check(!!pngWhite, 'the transparent PNG with LIGHT (white) ink is on the board');
  if (pngWhite) {
    check(pngWhite.plateAlphaDark, 'it was DETECTED as transparent AND as light ink (the plate has a direction)');
    check(pngWhite.background === 'rgb(15, 17, 23)', 'white ink keeps the DARK background — a white plate would swallow it', pngWhite.background);
    check(!pngWhite.plateAlpha, 'and it is NOT given the white plate that would hide it');
  }
  check(!!raster1, 'the raster file is on the board');
  if (raster1) {
    check(!raster1.plateVector && !raster1.plateAlpha, 'the opaque JPEG gets no plate under auto (no decode spent on a .jpg)');
    check(raster1.background !== 'rgb(255, 255, 255)', 'the photograph keeps the card background', raster1.background);
  }

  // ── 2 · none ─────────────────────────────────────────────────────────────────────────────────
  const none = await inspect('none');
  check(/\bplate-none\b/.test(none.frameClass), 'none puts plate-none on the frame', `frame="${none.frameClass}"`);
  const svg2 = svgOf(none);
  check(!!svg2 && !svg2.plateVector, 'under none, even a vector gets no image-level plate');
  const png2 = pngOf(none, 'Cscr-featured');
  if (png2) check(!png2.plateAlpha, 'under none the readback adds no plate either (the choice wins over detection)');
  const png2w = pngOf(none, 'Globe_Icon_White');
  if (png2w) check(!png2w.plateAlphaDark, 'under none, light ink gets no plate class either');
  if (svg2) check(svg2.background === 'rgba(0, 0, 0, 0)', 'under none the tile is transparent (the card shows through)', svg2.background);

  // ── 3 · light ────────────────────────────────────────────────────────────────────────────────
  const light = await inspect('light');
  check(/\bplate-light\b/.test(light.frameClass), 'light puts plate-light on the frame', `frame="${light.frameClass}"`);
  const raster3 = rasterOf(light);
  if (raster3) check(raster3.background === 'rgb(255, 255, 255)', 'under light the photograph is plated too', raster3.background);

  check(pageErrors.length === 0, 'no page errors while switching the plate', pageErrors.join(' | '));

  await page.screenshot({ path: path.join(root, 'media-plate-e2e.png'), fullPage: false });
} catch (err) {
  failures.push(`threw: ${err && err.message ? err.message : err}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}

for (const line of checks) console.log(`  ${line}`);
console.log('');
if (failures.length) {
  console.error(`  MEDIA PLATE FAILED — ${failures.length} check(s): ${failures.join('; ')}`);
  process.exit(1);
}
console.log(`  MEDIA PLATE OK — ${checks.length}/${checks.length} checks · media-plate-e2e.png written`);
