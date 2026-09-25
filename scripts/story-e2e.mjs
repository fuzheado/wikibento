#!/usr/bin/env node
/**
 * Story mode acceptance (ISSUE-119) — the continuous-scroll presentation of an article's images, in a real browser,
 * against the BUILT app.
 *
 * Run: npx vite build && node scripts/story-e2e.mjs [--base https://wikibento.toolforge.org]
 *
 * The board is a single story card for the Metropolitan Museum of Art, pasted in through the app's own ⬆ Import panel:
 * a scratch board in public/ would trip the demos gate, and one in dist/ is not loadable as a board at all.
 *
 * What it checks, and why each one is here:
 *   · the panel MIX — the whole technique is "the image's own shape picks the panel", so a mix dominated by one kind
 *     means the dimensions never arrived (this is exactly how the first version failed: 90 of 93 full-bleed, because
 *     a lookup keyed by the API's title never matched media-list's title — 3 rows of 93 had dimensions);
 *   · most panels carry a real caption, not a file name (an article's {{gallery}} images arrive caption-less from
 *     media-list; without the join, 63 of 93 panels showed "File:…jpg");
 *   · chapters, from the article's own section structure;
 *   · the progress bar moves with the card's own scroll;
 *   · no page errors, and a screenshot of the hero, the middle and the end.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright';

function assertFreshBuild() {
  const newest = (dir) => {
    let ms = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!e.isFile()) continue;
      ms = Math.max(ms, fs.statSync(path.join(e.parentPath || e.path || dir, e.name)).mtimeMs);
    }
    return ms;
  };
  const [srcMs, distMs] = [newest('src'), newest('dist/assets')];
  if (srcMs > distMs) {
    console.error(`  ✘ dist/ is older than src/ by ${Math.round((srcMs - distMs) / 1000)}s — run \`npx vite build\` first.`);
    process.exit(1);
  }
}
assertFreshBuild();

const ARTICLE = process.env.STORY_ARTICLE || 'Metropolitan Museum of Art';
const PROJECT = process.env.STORY_PROJECT || 'en.wikipedia';
const fixed = process.argv.indexOf('--base');
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = fixed === -1 ? await freePort() : null;
const base = fixed === -1 ? `http://127.0.0.1:${port}` : process.argv[fixed + 1];
const srv = fixed === -1
  ? spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  : null;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }

const board = JSON.stringify({
  version: 1,
  widgets: [{ id: 'story', widgetType: 'gallery', config: {
    from: 'article', article: ARTICLE, project: PROJECT,
    displayMode: 'story', maxItems: 0, minSize: 200, hideDecorative: true, refreshSeconds: 3600 } }],
  layout: [{ i: 'story', x: 0, y: 0, w: 4, h: 10, minW: 2, minH: 4 }],
});

const results = [];
const ok = (m) => { results.push(0); console.log('  ✔ ' + m); };
const bad = (m) => { results.push(1); console.log('  ✘ ' + m); };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const full = m.text();
    if (/Failed to load resource|Content Security Policy|violates the following|Blocked autofocusing/.test(full)) return;
    errs.push('console: ' + full.slice(0, 120));
  });

  await page.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
  await page.getByRole('button', { name: /Import/ }).click();
  await page.waitForSelector('.import-textarea', { timeout: 10000 });
  await page.locator('.import-textarea').fill(board);
  await page.locator('.import-panel button.btn-primary').click();
  await page.waitForSelector('.story-panel', { timeout: 120000 });
  await page.waitForTimeout(5000);

  const s = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.story-panel')];
    const mix = panels.reduce((a, p) => { const k = p.className.match(/story-(full|plate|split)/)?.[1] || '?'; a[k] = (a[k] || 0) + 1; return a; }, {});
    const captioned = panels.filter((p) => {
      const c = (p.querySelector('.story-caption')?.textContent || '').trim();
      return c && !/\.(jpe?g|png|gif|svg|tiff?|webp)$/i.test(c);
    }).length;
    const markup = panels
      .map((p) => (p.querySelector('.story-caption')?.textContent || '').trim())
      .filter((c) => /\{\{|\}\}|\[\[|&#\d+;|&[a-z]+;|<[a-z/]/.test(c));
    return { panels: panels.length, mix, captioned, markup, chapters: document.querySelectorAll('.story-chapter').length,
      title: document.querySelector('.story-title')?.textContent?.trim(),
      subtitle: document.querySelector('.story-sub')?.textContent?.trim(),
      hero: !!document.querySelector('.story-cover-bg') };
  });

  console.log(`  · "${s.title}" — ${s.subtitle}`);
  s.panels >= 60 ? ok(`${s.panels} panels`) : bad(`only ${s.panels} panels`);
  const kinds = ['full', 'plate', 'split'].filter((k) => s.mix[k] > 0);
  kinds.length === 3
    ? ok(`the mix uses all three panel kinds: ${JSON.stringify(s.mix)}`)
    : bad(`panels are dominated by one kind: ${JSON.stringify(s.mix)} — the shape data is missing (see the header)`);
  s.captioned / Math.max(s.panels, 1) >= 0.8
    ? ok(`${s.captioned} of ${s.panels} panels carry a caption rather than a file name`)
    : bad(`only ${s.captioned} of ${s.panels} panels are captioned`);
  // Andrew, 2026-09-24: "Sphinx, Greece, {{circa|530 BCE}}". A caption that came from a gallery is wikitext until the
  // API renders it, and the rendered HTML carries numeric entities; a reader must see neither.
  s.markup.length === 0
    ? ok('no caption shows template syntax or an HTML entity')
    : bad(`${s.markup.length} captions still carry markup, e.g. ${JSON.stringify(s.markup[0])}`);
  s.chapters >= 5 ? ok(`${s.chapters} chapters`) : bad(`${s.chapters} chapters`);
  s.hero ? ok('the cover has a blurred backdrop') : bad('no cover backdrop');

  await page.screenshot({ path: '/tmp/story-hero.png' });
  const scroller = page.locator('.story-scroll').first();
  const readProgress = () => page.locator('.story-progress').first()
    .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--story-progress')) || 0);
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.3; });
  await page.waitForTimeout(600);
  const p1 = await readProgress();
  await page.screenshot({ path: '/tmp/story-mid.png' });
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.75; });
  await page.waitForTimeout(600);
  const p2 = await readProgress();
  await page.screenshot({ path: '/tmp/story-late.png' });
  (p1 > 5 && p2 > p1) ? ok(`the progress bar tracks the scroll (${p1}% → ${p2}%)`) : bad(`progress bar: ${p1} → ${p2}`);

  errs.length ? bad(`errors: ${errs[0]}`) : ok('0 page errors and 0 console errors');

  // The demo board is a shipped artifact — `?config=/story-demo.json` — so it is checked rather than assumed:
  // a gallery config that drifts out of story mode would leave a grid where the board promises a story.
  const demo = await ctx.newPage();
  const demoErrs = [];
  demo.on('pageerror', (e) => demoErrs.push(String(e.message).slice(0, 110)));
  await demo.goto(`${base}/?config=/story-demo.json`, { waitUntil: 'domcontentloaded' });
  await demo.waitForSelector('.story-panel', { timeout: 120000 });
  await demo.waitForTimeout(4000);
  const d = await demo.evaluate(() => ({
    cards: document.querySelectorAll('[data-widget-id]').length,
    panels: document.querySelectorAll('.story-panel').length,
    lede: /An article as a story/.test(document.body.innerText),
  }));
  (d.panels >= 60 && d.lede && demoErrs.length === 0)
    ? ok(`the demo board (?config=/story-demo.json) is a story: ${d.cards} cards, ${d.panels} panels, lede rendered`)
    : bad(`demo board: ${JSON.stringify(d)}, errors ${demoErrs[0] || 'none'}`);
  await demo.screenshot({ path: '/tmp/story-demo-board.png' });
  await demo.close();

  // The presentation path: a story given the whole screen. No third view mode was added for this — kiosk and lean are
  // the axes — so the combination is an invariant: with the chrome gone, the panels must still be there.
  const kiosk = await ctx.newPage();
  const kioskErrs = [];
  kiosk.on('pageerror', (e) => kioskErrs.push(String(e.message).slice(0, 110)));
  kiosk.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|Content Security Policy|violates the following|Blocked autofocusing/.test(m.text())) kioskErrs.push('console: ' + m.text().slice(0, 110)); });
  await kiosk.goto(`${base}/?config=/story-demo.json&kiosk=1`, { waitUntil: 'domcontentloaded' });
  await kiosk.waitForSelector('.story-panel', { timeout: 120000 });
  await kiosk.waitForTimeout(4000);
  const k = await kiosk.evaluate(() => ({
    panels: document.querySelectorAll('.story-panel').length,
    // Kiosk hides the chrome with CSS, so the buttons are in the DOM and merely invisible — count the VISIBLE ones.
    chrome: [...document.querySelectorAll('.app-actions button')].filter((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0).length,
    height: document.querySelector('.story-scroll')?.clientHeight || 0,
  }));
  (k.panels >= 60 && k.chrome === 0 && kioskErrs.length === 0)
    ? ok(`kiosk: ${k.panels} panels with no editing chrome, in a ${k.height}px column`)
    : bad(`kiosk: ${JSON.stringify(k)}, errors ${kioskErrs[0] || 'none'}`);
  await kiosk.screenshot({ path: '/tmp/story-kiosk.png' });
  console.log('  screenshots: /tmp/story-demo-board.png · /tmp/story-kiosk.png');
  console.log('  screenshots: /tmp/story-hero.png · /tmp/story-mid.png · /tmp/story-late.png');
} catch (e) {
  bad('harness: ' + String(e.message).slice(0, 150));
} finally {
  await browser.close();
  if (srv) srv.kill('SIGTERM');
}
const fails = results.reduce((a, b) => a + b, 0);
console.log(`\n  ${fails ? 'FAILED' : 'STORY OK'} — ${results.length - fails}/${results.length} checks`);
process.exit(fails ? 1 : 0);
