/**
 * IA Item widget end-to-end check (ISSUE-25).
 *
 * Boots the BUILT app on a generated board of three IA Item cards — a live
 * collection ('nasa'), a real digitised text, and a deliberately bad
 * identifier — then asserts what the browser actually painted: the title and
 * details link, the thumbnail (loaded, not just referenced), the four stat
 * tiles, and the friendly not-found message.
 *
 * Live data changes, so assertions are shape-based (digits/commas), never
 * pinned to today's view counts.
 *
 * Usage: npm run build && node scripts/ia-item-e2e.mjs [--port 8995]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
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
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : 8995;
const BASE = `http://127.0.0.1:${PORT}`;
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const cfg = {
  version: 1,
  widgets: [
    { id: 'ia-live', widgetType: 'iaItem', config: { identifier: 'nasa', refreshSeconds: 86400 } },
    { id: 'ia-text', widgetType: 'iaItem', config: { identifier: 'in.ernet.dli.2015.136553', refreshSeconds: 86400 } },
    { id: 'ia-bad', widgetType: 'iaItem', config: { identifier: 'wikibento-definitely-not-a-real-item-xyz', refreshSeconds: 86400 } },
  ],
  layout: [
    { i: 'ia-live', x: 0, y: 0, w: 6, h: 6 },
    { i: 'ia-text', x: 6, y: 0, w: 6, h: 6 },
    { i: 'ia-bad', x: 0, y: 6, w: 6, h: 5 },
  ],
};
writeFileSync(join(dist, 'ia-e2e.json'), JSON.stringify(cfg, null, 2));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', dist], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${BASE}/index.html`)).ok) break; } catch { /* not up yet */ }
  await wait(250);
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));

  await page.goto(`${BASE}/?config=ia-e2e.json`, { waitUntil: 'networkidle' });
  // the live IA lookup takes a moment; wait for a title to appear
  await page.waitForSelector('.glam-card .stat-title', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.grid-item')).map((el) => {
    const titleEl = el.querySelector('.glam-card .stat-title');
    const img = el.querySelector('.card-image img');
    const subEl = el.querySelector('.glam-card .stat-subtitle');
    return {
      text: (el.innerText || '').slice(0, 400),
      title: titleEl ? titleEl.innerText.trim() : null,
      subtitle: subEl ? subEl.innerText.trim() : null,
      href: titleEl && titleEl.querySelector('a') ? titleEl.querySelector('a').getAttribute('href') : null,
      imgSrc: img ? img.getAttribute('src') : null,
      imgLoaded: img ? img.naturalWidth > 0 : false,
      // read each tile as a unit — subs are only rendered when non-empty
      tiles: Array.from(el.querySelectorAll('.glam-stat')).map((t) => ({
        label: (t.querySelector('.glam-stat-label') || {}).innerText || '',
        value: (t.querySelector('.glam-stat-value') || {}).innerText || '',
        sub: (t.querySelector('.glam-stat-sub') || {}).innerText || '',
      })),
    };
  }));

  const live = cards[0] || {};
  const text = cards[1] || {};
  const bad = cards[2] || {};

  check('live item renders its title', live.title === 'NASA', String(live.title));
  check('title links to the archive.org details page', /archive\.org\/details\/nasa$/.test(live.href || ''), String(live.href));
  check('thumbnail is wired to services/img and actually loaded',
    /services\/img\/nasa/.test(live.imgSrc || '') && live.imgLoaded === true,
    `${live.imgSrc} loaded=${live.imgLoaded}`);
  check('four stat tiles with the documented labels',
    live.tiles?.length === 4 && live.tiles[0].label.includes('views') && live.tiles[3].label === 'files',
    JSON.stringify((live.tiles || []).map((t) => t.label)));
  check('views tile shows a real number (not a dash)',
    /^[\d,]{3,}$/.test(live.tiles?.[0]?.value || ''), String(live.tiles?.[0]?.value));
  check('views are labelled as IA engagement, not pageviews',
    /IA engagement/.test(live.tiles?.[0]?.sub || ''), String(live.tiles?.[0]?.sub));
  check('subtitle shows creator/year/mediatype context',
    /NASA|collection|movies/.test(live.subtitle || ''), String(live.subtitle));

  check('a digitised text item renders too', !!text.title && text.title.length > 3, String(text.title));
  check('its thumbnail loads as well', text.imgLoaded === true, `${text.imgSrc} loaded=${text.imgLoaded}`);
  check('a real text item reports its file size',
    /(B|kB|MB|GB|TB)$/.test(text.tiles?.[3]?.sub || ''), `files sub="${text.tiles?.[3]?.sub}"`);

  check('a bad identifier shows the friendly not-found message',
    /No Internet Archive item/i.test(bad.text || ''), (bad.text || '').replace(/\s+/g, ' ').slice(0, 90));
  check('the bad card keeps a Retry affordance', /retry/i.test(bad.text || ''));
  check('no page errors', errors.length === 0, errors.join(' | '));

  await page.screenshot({ path: join(root, 'ia-item-e2e.png'), fullPage: false });
  console.log(`   ↳ screenshot: ${join(root, 'ia-item-e2e.png')}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? '✘ FAIL' : '✔ PASS'} — ${results.length - failed.length}/${results.length} assertions`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
  rmSync(join(dist, 'ia-e2e.json'), { force: true });
}
