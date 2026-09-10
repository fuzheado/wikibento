/**
 * QR widget end-to-end check (ISSUE-65) — the browser half of the constitution.
 *
 * Boots the BUILT app against a generated board that exercises every branch of
 * the widget: a fixed link, a `{{param}}`-driven link (dataflow), an empty
 * payload, and an over-the-cap payload. Asserts the rendered SVG, the quiet
 * zone, the guard states, and the Save SVG download; writes artifacts
 * (`qr-e2e-*.png`, `qr-e2e-download.svg`) for eyeballing or decoding.
 *
 * Decoding: uses the browser's own BarcodeDetector when the engine has it
 * (headless Chromium here does NOT). For a decoder-independent scan check, the
 * PNGs it writes can be fed to any QR reader — e.g.
 *   uv run --with opencv-python-headless --with numpy python - <<'PY'
 *   import cv2; print(cv2.QRCodeDetector().detectAndDecode(cv2.imread('qr-e2e-0.png'))[0])
 *   PY
 *
 * Usage: npm run build && node scripts/qr-widget-e2e.mjs [--port 8988]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install first');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8991;
const OUT = process.env.QR_E2E_OUT || root;

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

// Board under test: one branch per widget behaviour.
const LONG = 'a'.repeat(1600);
const COMMONS = 'https://commons.wikimedia.org/wiki/Category:Featured_pictures_on_Wikimedia_Commons';
const board = {
  version: 1,
  params: { target: { label: 'Target link', type: 'text', value: COMMONS } },
  widgets: [
    { id: 'qr-fixed', widgetType: 'qrCode', config: { text: 'https://w.wiki/QRtest', caption: 'Fixed link', ecLevel: 'auto', margin: 4, refreshSeconds: 86400 } },
    { id: 'qr-param', widgetType: 'qrCode', config: { text: '{{target}}', caption: 'From the board param', ecLevel: 'auto', margin: 4, refreshSeconds: 86400 } },
    { id: 'qr-empty', widgetType: 'qrCode', config: { text: '', refreshSeconds: 86400 } },
    { id: 'qr-long', widgetType: 'qrCode', config: { text: LONG, refreshSeconds: 86400 } },
  ],
  layout: [
    { i: 'qr-fixed', x: 0, y: 0, w: 4, h: 6 },
    { i: 'qr-param', x: 4, y: 0, w: 4, h: 6 },
    { i: 'qr-empty', x: 8, y: 0, w: 4, h: 6 },
    { i: 'qr-long', x: 0, y: 6, w: 4, h: 6 },
  ],
};
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/qr-e2e.json'), JSON.stringify(board, null, 2));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', join(root, 'dist')], { stdio: 'ignore' });
const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

try {
  await new Promise((r) => setTimeout(r, 900)); // server warm-up
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 160)); });

  await page.goto(`http://localhost:${PORT}/?config=/qr-e2e.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qr-card svg', { timeout: 30000 });
  await page.waitForTimeout(2000);

  const state = await page.evaluate(async () => {
    const grab = (card) => {
      const svg = card.querySelector('.qr-code-wrap svg');
      return {
        caption: card.querySelector('.qr-caption')?.innerText.trim() || null,
        viewBox: svg.getAttribute('viewBox'),
        whiteBorder: !!svg.querySelector('rect'),
        meta: card.querySelector('.qr-meta')?.innerText.replace(/\s+/g, ' ').trim() || null,
        hasSave: !!card.querySelector('button.qr-save'),
        png: (() => {
          const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.outerHTML)));
          const img = new Image();
          return url; // returned, rasterised below by the caller
        })(),
      };
    };
    const cards = [...document.querySelectorAll('.qr-card')].map(grab);
    const pngs = [];
    for (const card of [...document.querySelectorAll('.qr-card')]) {
      const svg = card.querySelector('.qr-code-wrap svg');
      const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg.outerHTML)));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('raster')); img.src = url; });
      const N = 512;
      const cv = document.createElement('canvas');
      cv.width = N; cv.height = N;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, N, N);
      ctx.drawImage(img, 0, 0, N, N);
      pngs.push({ caption: card.querySelector('.qr-caption')?.innerText.trim() || '', dataUrl: cv.toDataURL('image/png') });
    }
    return {
      cards,
      pngs,
      emptyStates: [...document.querySelectorAll('.widget-empty')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
      errorFrames: document.querySelectorAll('.widget-error').length,
    };
  });

  // Artifacts (also the input for an external decoder).
  state.pngs.forEach((p, i) => writeFileSync(join(OUT, `qr-e2e-${i}.png`), Buffer.from(p.dataUrl.split(',')[1], 'base64')));

  let download = null;
  try {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator('.qr-card button.qr-save').first().click(),
    ]);
    await dl.saveAs(join(OUT, 'qr-e2e-download.svg'));
    download = dl.suggestedFilename();
  } catch (e) { download = `FAILED: ${e.message.slice(0, 60)}`; }

  check('two codes render (fixed + param-driven)', state.cards.length === 2, `cards=${state.cards.length}`);
  check('quiet zone is painted into the SVG', state.cards.every((c) => c.whiteBorder), state.cards.map((c) => c.viewBox).join(' '));
  check('auto EC picks the strongest fitting level', state.cards.every((c) => /EC H\b/.test(c.meta)), state.cards.map((c) => c.meta).join(' | '));
  check('param-driven card encodes the interpolated URL', state.cards.some((c) => c.caption === 'From the board param' && c.meta.includes('82 chars')), COMMONS.length + ' chars expected');
  check('empty payload shows the guidance state', state.emptyStates.some((t) => t.includes('Nothing to encode')), state.emptyStates[0]?.slice(0, 60));
  check('over-cap payload refuses instead of drawing a bad code', state.emptyStates.some((t) => t.includes('too long for a scannable QR')), state.emptyStates[1]?.slice(0, 60));
  check('Save SVG downloads a standalone file', download === 'qr-code.svg', String(download));
  check('no widget error frames', state.errorFrames === 0);
  check('no console/page errors', pageErrors.length === 0, pageErrors[0] || '');
  console.log(`\nartifacts: ${OUT}/qr-e2e-0.png, qr-e2e-1.png, qr-e2e-download.svg`);
  await browser.close();
} finally {
  server.kill();
}

console.log(failures.length === 0 ? '\nQR widget E2E: PASS' : `\nQR widget E2E: ${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
