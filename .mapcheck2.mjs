import { spawn } from 'node:child_process';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
// freshness guard: refuse to judge a bundle older than the source it should contain (the repo's own rule for e2e probes)
const bundle = readFileSync('dist/index.html', 'utf8').match(/index-[A-Za-z0-9_-]+\.js/)?.[0];
if (!bundle || !readFileSync(`dist/assets/${bundle}`, 'utf8').includes('MapCard')) {
  console.error('  ✘ dist is stale — refusing to test it'); process.exit(2);
}
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = await freePort(); const base = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
await new Promise((res) => { const t = setInterval(async () => { try { if ((await fetch(base)).ok) { clearInterval(t); res(); } } catch {} }, 250); });
const board = { version: 1, widgets: [
  { id: 'm-qid',   widgetType: 'map', config: { place: 'Q243', zoom: 6 } },
  { id: 'm-page',  widgetType: 'map', config: { place: 'Brandenburg Gate', zoom: 15 } },
  { id: 'm-coord', widgetType: 'map', config: { place: '35.3606, 138.7274', zoom: 12 } },
  { id: 'm-bare',  widgetType: 'map', config: { place: 'Q64', zoom: 12, edgeToEdge: true } },
], layout: [{ i: 'm-qid', x: 0, y: 0, w: 3, h: 5 }, { i: 'm-page', x: 3, y: 0, w: 3, h: 5 }, { i: 'm-coord', x: 6, y: 0, w: 3, h: 5 }, { i: 'm-bare', x: 9, y: 0, w: 3, h: 5 }] };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 90)));
const requests = []; page.on('response', (r) => { const u = r.url(); if (u.includes('maps.wikimedia.org/img/')) requests.push(`${r.status()} ${u.split('/img/')[1]}`); });
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Import/ }).click();
await page.waitForSelector('.import-textarea');
await page.locator('.import-textarea').fill(JSON.stringify(board));
await page.locator('.import-panel button.btn-primary').click();
await page.waitForSelector('.map-img', { timeout: 30000 });
await page.waitForTimeout(9000);
const state = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.grid-item')];
  return ['m-qid', 'm-page', 'm-coord', 'm-bare'].map((id) => {
    const el = cards.find((c) => (c.querySelector('.widget-id-chip') || {}).textContent === id);
    if (!el) return { id, missing: true };
    const img = el.querySelector('.map-img'); const r = img.getBoundingClientRect();
    const header = el.querySelector('.widget-header');
    return { id, img: `${Math.round(r.width)}x${Math.round(r.height)}`,
      natural: img.naturalWidth ? `${img.naturalWidth}x${img.naturalHeight}` : 'NOT LOADED',
      pin: !!el.querySelector('.map-pin'),
      chrome: header ? getComputedStyle(header).opacity : 'none',
      title: (el.querySelector('.widget-title') || {}).textContent?.trim().slice(0, 34) || '',
      credit: (el.querySelector('.map-credit') || {}).textContent || '' };
  });
});
console.log('');
for (const r of state) console.log(`   ${r.id.padEnd(8)} ${String(r.img).padEnd(10)} natural ${String(r.natural).padEnd(11)} pin ${r.pin ? 'yes' : 'no '} chrome ${String(r.chrome).padEnd(4)} ${r.title} · ${r.credit.slice(0, 28)}`);
console.log('\n   map images requested:', requests.length, '·', requests.slice(0, 3).join(' | '));
console.log('   page errors:', errors.length ? errors : 'none');
for (const [id, file] of [['m-page', '/tmp/map-brandenburg.png'], ['m-bare', '/tmp/map-berlin-bare.png']]) {
  const card = page.locator('.grid-item').filter({ has: page.locator('.widget-id-chip', { hasText: id }) });
  await card.screenshot({ path: file });
}
await browser.close(); server.kill();
const bad = state.filter((r) => r.missing || r.natural === 'NOT LOADED' || !r.pin || !r.credit.includes('OpenStreetMap'));
console.log(bad.length ? `   ✘ ${bad.map((b) => b.id + ' ' + (b.natural || '')).join(' · ')}` : '   ✔ four maps loaded, pinned, credited, one of them edge to edge');
process.exit(bad.length || errors.length ? 1 : 0);
