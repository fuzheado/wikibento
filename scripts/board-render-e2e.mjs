#!/usr/bin/env node
/**
 * The board-render check — does a board that came from OUTSIDE actually draw?
 *
 * What this replaces. The Ask audit's render probe (`tests/probe-ask-render.mjs`) was throwaway by design, and the
 * audit's own finding is why the check has to be permanent: the ⬆ Import panel silently dropped a board's `params`,
 * so every `{{param}}` card sat waiting for a value — and **no check drove Import with a params board**,
 * which is exactly why it survived. `npm test` runs the offline half of the same contract
 * (`tests/assembly-contract.test.mjs`: the validator's verdict on frozen model replies); this is the half that needs a
 * browser, because "validates" and "renders" are different claims.
 *
 * Two kinds of board, because there are two ways one arrives:
 *
 *   1. a board on this deployment (`?config=/params-demo.json` …) — loaded the way a reader loads it;
 *   2. a board from a MODEL — the frozen assembly replies (`tests/assembly-fixtures.mjs`), converted to the Import
 *      envelope the way `App.handleAddAssembly` does it (a layout built from the widget's own `w`/`h`) and pasted
 *      through the app's own ⬆ Import panel. No scratch file: a file in `public/` trips the demos gate, and a file in
 *      `dist/` is not loadable as a board.
 *
 * What it asserts, for each: one card per widget by id, no card left waiting for a value, and no page or
 * console error (a report-only CSP note and a failed subresource are the environment talking — same policy as
 * `smoke-built.mjs`).
 *
 * Usage: npm run build && npm run smoke:boards        (needs a built dist/, and refuses a stale one)
 *        npm run smoke:boards -- --base https://wikibento.toolforge.org   (verify a DEPLOYMENT: no local dist to
 *        compare, so the stale-build guard is skipped and the boards are the check)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { ASSEMBLY_REPLIES } from '../tests/assembly-fixtures.mjs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install first');
  process.exit(2);
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── refuse a stale dist/ (the false negative that looks exactly like a broken feature) ────────────────────────────
function assertFreshBuild() {
  const newest = (dir) => {
    let ms = 0;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      ms = Math.max(ms, fs.statSync(path.join(entry.parentPath || entry.path || path.join(root, dir), entry.name)).mtimeMs);
    }
    return ms;
  };
  if (newest('src') > newest('dist/assets')) {
    console.error('  ✘ dist/ is older than src/ — the built app is stale.');
    console.error('    Run `npx vite build` first (a browser check against a stale dist/ reports a broken feature).');
    process.exit(2);
  }
}
// The stale-build guard runs in the local branch below: a --base sweep measures a deployment, which has no local
// dist to compare against.

// `--base` points the sweep at a DEPLOYMENT (the deploy check): there is no local dist to be stale, so that guard is
// skipped and the boards themselves are the verification. Without it the sweep builds its own server from dist/.
const baseArg = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? String(process.argv[i + 1] || '').trim() : '';
})();
let base;
let server = null;
if (baseArg) {
  base = baseArg.replace(/\/$/, '');
  console.log(`  checking ${base} (a deployment — the local dist/ is not what is being measured)\n`);
} else {
  assertFreshBuild();
  const port = await new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
  base = `http://127.0.0.1:${port}`;
  server = spawn('python3', ['-m', 'http.server', String(port), '--directory', path.join(root, 'dist')], { stdio: 'ignore' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${base}/index.html`)).ok) break; } catch { /* not up yet */ }
    await wait(250);
  }
}

// ── the boards ────────────────────────────────────────────────────────────────────────────────────────────────────
// Our own: chosen because between them they carry a params switcher, a dataflow chain and a gallery.
const HOSTED = ['params-demo.json', 'flow-demo.json', 'article-switcher-demo.json'];

/** The Import envelope for a model fragment — exactly what `handleAddAssembly` builds from one. */
const asBoard = (board) => ({
  version: 1,
  params: board.params || {},
  widgets: board.widgets,
  layout: board.widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 4, w: w.w ?? 6, h: w.h ?? 4 })),
});

/**
 * Wait until no card is left in the "waiting for a reference" state — it is TRANSIENT by design: a consumer card waits
 * until its producer has fetched and emitted, and the producer fetches from a live API. A fixed sleep turned this into a
 * flaky check (it failed under `npm test` load on a board whose producer was still in flight and passed standalone).
 * Returns null when it settles, or the string to report when it does not.
 */
async function waitUntilWired(page, ms = 25000) {
  try {
    await page.waitForFunction(() => !document.querySelector('.widget-waiting'), null, { timeout: ms, polling: 250 });
    return null;
  } catch {
    return `a card is still waiting for a value after ${ms / 1000}s — its producer never emitted`;
  }
}

/**
 * Click a zone BY ITS CENTRE COORDINATES, the way a reader does.
 *
 * Not `page.click(selector)`: two of this photograph's notes sit ~28px apart, so their 30px markers overlap and
 * Playwright (rightly) refuses to click a point another element covers. The app resolves a click by geometry — inside a
 * box wins, else the nearest centre — so clicking the coordinate is both the honest test and the thing that must work.
 */
const clickZone = async (page, label) => {
  const point = await page.evaluate((wanted) => {
    const frame = document.querySelector('[data-widget-id="zones-image"] .zone-frame');
    const button = document.querySelector(`[data-widget-id="zones-image"] .zone[aria-label="${wanted}"]`);
    const item = button.parentElement;                                  // the data box the marker is centred on
    const f = frame.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), frame: { w: Math.round(f.width) } };
  }, label);
  await page.mouse.click(point.x, point.y);
};

const problems = [];
const results = [];
const ok = (name, detail) => results.push(`  ✅ ${name.padEnd(34)} ${detail}`);
const bad = (name, detail) => { problems.push(`${name}: ${detail}`); results.push(`  ❌ ${name.padEnd(34)} ${detail}`); };

const browser = await chromium.launch({ headless: true });
try {
  for (const file of HOSTED) {
    const board = JSON.parse(fs.readFileSync(path.join(root, 'public', file), 'utf8'));
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = String(m.text());
      if (/Content Security Policy|Failed to load resource|violates the following/.test(text)) return;
      errors.push(`console: ${text.slice(0, 110)}`);
    });
    await page.goto(`${base}/?config=/${file}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
    const stuck = await waitUntilWired(page);
    const state = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-widget-id]')].map((el) => el.getAttribute('data-widget-id')),
      waiting: !!document.querySelector('.widget-waiting'),
    }));
    const expect = board.widgets.map((w) => w.id);
    const missing = expect.filter((id) => !state.cards.includes(id));
    if (state.cards.length !== expect.length) bad(file, `${state.cards.length} cards, expected ${expect.length}`);
    else if (missing.length) bad(file, `missing cards: ${missing.join(', ')}`);
    else if (stuck || state.waiting) bad(file, stuck || 'a card is still waiting for a value');
    else if (errors.length) bad(file, errors[0]);
    else ok(file, `${state.cards.length} cards, wired, no errors`);
    await page.close();
  }

  /**
   * Paste a board through the app's own ⬆ Import panel and check what it drew.
   *
   * This is the path a board from OUTSIDE takes, and it is where the audit's second defect lived: Import dropped the
   * `params` block, so every `{{param}}` card sat waiting for a value. The first version of this script pasted
   * only model boards — and every frozen reply that parsed happened to carry `params: {}` — so restoring the defect
   * changed nothing and the check passed. Coverage, not intent, is what makes a check bite: the boards we host are
   * pasted too (below), and one of them is a params switcher.
   */
  const pasteAndCheck = async (board, name, extra) => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = String(m.text());
      if (/Content Security Policy|Failed to load resource|violates the following/.test(text)) return;
      errors.push(`console: ${text.slice(0, 110)}`);
    });
    try {
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id]', { timeout: 30000 });
      await page.getByRole('button', { name: /Import/ }).click();
      await page.waitForSelector('.import-textarea', { timeout: 15000 });
      await page.locator('.import-textarea').fill(JSON.stringify(board));
      await page.locator('.import-panel button.btn-primary').click();
      await page.waitForSelector('[data-widget-id]', { timeout: 20000 });
      const stuck = await waitUntilWired(page);
      const state = await page.evaluate(() => ({
        cards: [...document.querySelectorAll('[data-widget-id]')].map((el) => el.getAttribute('data-widget-id')),
        waiting: !!document.querySelector('.widget-waiting'),
        importErrors: [...document.querySelectorAll('.import-errors')].map((el) => el.innerText.trim()),
      }));
      const expect = board.widgets.map((w) => w.id);
      const missing = expect.filter((id) => !state.cards.includes(id));
      const extraProblem = extra ? await extra(page) : null;
      if (state.importErrors.length) bad(name, `Import refused it: ${state.importErrors[0].slice(0, 90)}`);
      else if (state.cards.length !== expect.length) bad(name, `${state.cards.length} cards, expected ${expect.length}`);
      else if (missing.length) bad(name, `missing cards: ${missing.join(', ')}`);
      else if (stuck || state.waiting) bad(name, stuck || 'a card is still waiting for a value')
      else if (errors.length) bad(name, errors[0]);
      else if (extraProblem) bad(name, extraProblem);
      else ok(name, `${state.cards.length} cards pasted through Import, no errors`);
    } catch (e) {
      bad(name, String(e).slice(0, 110));
    }
    await page.close();
  };

  // The same boards again, but through ⬆ Import: that is where a `params` block is most fragile, and `params-demo.json`
  // is a switcher board — without it this check cannot see the defect it was written for.
  for (const file of HOSTED) {
    const board = JSON.parse(fs.readFileSync(path.join(root, 'public', file), 'utf8'));
    await pasteAndCheck(board, `pasted: ${file.slice(0, 24)}`);
  }

  // And the boards from a model: the frozen replies, converted to the Import envelope.
  const usable = ASSEMBLY_REPLIES.filter((r) => r.parses).map((r) => {
    try { return { ...r, board: JSON.parse(r.raw)?.board }; } catch { return { ...r, board: null }; }
  }).filter((r) => r.board?.widgets?.length);
  if (usable.length < 4) {
    bad('frozen model replies', `only ${usable.length} usable — the fixture or the validator changed`);
  }
  for (const reply of usable.slice(0, 6)) {
    await pasteAndCheck(asBoard(reply.board), `model: ${reply.id.slice(0, 22)}`);
  }

  /**
   * The RETIRED ids — the boards in the wild that carry one (ISSUE-142).
   *
   * Every demo board was migrated when the CIM family and the galleries merged, so no check rendered a retired id at
   * all — and the frame decided static-vs-fetch from the *raw* registry table, where a retired id is simply an absent
   * key. The card therefore looked static: it never fetched, its `emit` was handed `null`, and the shaper that reads
   * `data.category` threw before anything drew. One id from each retired family, with the assertion that each card
   * actually DREW something — a card that silently fetches nothing passes "no errors" and fails this.
   */
  const RETIRED_BOARD = {
    version: 1,
    params: {},
    widgets: [
      // cimSnapshot → cimStats { subject: 'category' }; the category is the family's own default, so it is a tracked one.
      { id: 'legacy-cim', widgetType: 'cimSnapshot',
        config: { subject: 'category', category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0 } },
      // cimTopPages → cimRanking { facet: 'pages' } — no facet in the config, so the id's meaning has to supply it.
      { id: 'legacy-rank', widgetType: 'cimTopPages',
        config: { category: 'Files from the Biodiversity Heritage Library', scope: 'deep', month: 0 } },
      // commonsGallery → gallery { from: 'page' } — the page the gallery demo proves has a <gallery> tag, so the arm
        // really fetches; the id only supplies the source, the way the merge promised.
      { id: 'legacy-gallery', widgetType: 'commonsGallery',
        config: { page: 'The Venetian Macao', displayMode: 'grid', maxItems: 12 } },
    ],
  };
  await pasteAndCheck(asBoard(RETIRED_BOARD), 'retired ids (cim + gallery)', async (page) => {
    // Wait for DATA from both arms, not merely for cards: the whole failure mode was a card that stayed empty, and a
    // fixed sleep here is the flake this script's own `waitUntilWired` comment warns about (the gallery's Commons
    // parse and the CIM query settle at different times).
    const settled = await page.waitForFunction(() => {
      const cim = document.querySelector('[data-widget-id="legacy-cim"]')?.innerText || '';
      const images = document.querySelectorAll('[data-widget-id="legacy-gallery"] img').length;
      return /\d/.test(cim) && images > 0;
    }, null, { timeout: 45000, polling: 400 }).then(() => true).catch(() => false);
    const drawn = await page.evaluate(() => ({
      cim: document.querySelector('[data-widget-id="legacy-cim"]')?.innerText || '',
      rank: document.querySelector('[data-widget-id="legacy-rank"]')?.innerText || '',
      galleryImgs: document.querySelectorAll('[data-widget-id="legacy-gallery"] img').length,
    }));
    if (!settled) {
      if (!/\d/.test(drawn.cim)) return 'the retired cimSnapshot card never fetched — no value in 45s (ISSUE-142)';
      return 'the retired commonsGallery card never fetched — no images in 45s (ISSUE-142)';
    }
    if (!/Biodiversity/.test(drawn.cim)) return 'the retired cimSnapshot card drew a value but not its subject';
    if (drawn.rank.trim().length < 20) return 'the retired cimTopPages card drew nothing';
    return null;
  });

  /**
   * The clickable zones demo — the MVP's own check (ISSUE-138, slice A).
   *
   * A picture that emits is only worth anything if the value actually travels, so this clicks a zone and waits for the
   * consumer card to become the article that zone named. a waiting card is the CORRECT state until then —
   * the app's own contract for a consumer whose producer has not emitted — which is why this board is not in HOSTED,
   * whose check requires every card to settle wired before anything is touched.
   */
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = String(m.text());
      if (/Content Security Policy|Failed to load resource|violates the following/.test(text)) return;
      errors.push(`console: ${text.slice(0, 110)}`);
    });
    try {
      await page.goto(`${base}/?config=/zone-demo.json`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id="zones-image"] .zone', { timeout: 30000 });
      const drawn = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[data-widget-id="zones-image"] .zone')];
        return {
          zones: buttons.length,
          labels: buttons.map((z) => z.getAttribute('aria-label')),
          // The marker is at least 30px whatever the note's own box measures: the file's notes on this photograph are
          // ~5px wide, and Andrew's first test found them impossible to aim at. Sizes are asserted, not assumed.
          smallest: Math.min(...buttons.map((z) => {
            const r = z.getBoundingClientRect();
            return Math.min(r.width, r.height);
          })),
        };
      });
      // FIRST, the collision Andrew's test found: a click on the picture itself publishes the FILE it shows on the
      // card's `selection` channel, and that must NOT reach an article consumer wired to `zones`. Click the middle of
      // the photograph (away from every zone) and assert the excerpt has not moved.
      const frame = await page.evaluate(() => {
        const layer = document.querySelector('[data-widget-id="zones-image"] .zone-layer');
        const r = layer.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height * 0.88) };
      });
      await page.mouse.click(frame.x, frame.y);
      await page.waitForTimeout(1200);
      const afterPictureClick = await page.evaluate(() => {
        const el = document.querySelector('[data-widget-id="zones-excerpt"]');
        return { text: (el?.innerText || '').slice(0, 80), waiting: !!el?.querySelector('.widget-waiting') };
      });
      if (!afterPictureClick.waiting) {
        bad('zones: the picture click stays out of it', `the excerpt moved on a plain picture click: ${JSON.stringify(afterPictureClick.text)}`);
      } else {
        ok('zones: picture click stays out', 'clicking the photograph publishes the file on `selection`; the article consumer did not move');
      }
      // THEN, by name, not by index: the demo's order is the file's own note order, and a reordered board must not
      // quietly point this check at a different mountain.
      await clickZone(page, 'Piz Nuna');
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-widget-id="zones-excerpt"]')?.innerText || '';
        return /Piz Nuna/i.test(text) && !document.querySelector('.widget-waiting');
      }, null, { timeout: 30000, polling: 250 });
      const after = await page.evaluate(() =>
        (document.querySelector('[data-widget-id="zones-excerpt"]')?.innerText || '').split('\n')[0].slice(0, 60));
      // Hover must agree with the click: move the pointer to a crowded zone's centre and assert the RESOLVED highlight
      // is that zone — not the neighbour whose marker happens to overlap it.
      const agree = await page.evaluate(() => {
        const item = document.querySelector('[data-widget-id="zones-image"] .zone[aria-label="Piz Nuna"]').parentElement;
        const b = item.getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
      });
      await page.mouse.move(agree.x, agree.y);
      await page.waitForTimeout(250);
      const highlighted = await page.evaluate(() => {
        const on = document.querySelector('[data-widget-id="zones-image"] .zone-item.is-hovered .zone');
        const chip = document.querySelector('[data-widget-id="zones-image"] .zone-item.is-hovered .zone-label');
        return { label: on?.getAttribute('aria-label') || null, chip: chip?.textContent || null };
      });
      if (highlighted.label !== 'Piz Nuna') {
        bad('zones: hover agrees with the click', `pointing at Piz Nuna highlighted ${JSON.stringify(highlighted.label)}`);
      } else {
        ok('zones: hover agrees with the click', `pointing at Piz Nuna highlights it and shows ${JSON.stringify(highlighted.chip)}, though a neighbour's marker overlaps`);
      }

      // A SECOND zone, and deliberately one whose target used to 404: Andrew's report named "Piz Macun" and
      // "Piz d'Arpiglias", whose articles did not exist on de.wikipedia, so the demo's targets are now found by search
      // — and this is the guard that keeps them found. A click must never leave the consumer on "Article not found".
      await clickZone(page, 'Piz Macun');
      const second = await page.waitForFunction(() => {
        const text = document.querySelector('[data-widget-id="zones-excerpt"]')?.innerText || '';
        return /Macun/i.test(text) && !/not found/i.test(text) && !document.querySelector('.widget-waiting');
      }, null, { timeout: 30000, polling: 250 }).then(() => null)
        .catch(async () => `the second zone left the consumer at ${JSON.stringify(
          (await page.evaluate(() => (document.querySelector('[data-widget-id="zones-excerpt"]')?.innerText || '').slice(0, 70))))}`);
      if (second) bad('zones: a second target', second);
      else ok('zones: a second target', 'clicked "Piz Macun" (its article did not exist before) → the excerpt followed');
      if (drawn.smallest < 30) bad('zones: click → excerpt', `the smallest zone target is ${Math.round(drawn.smallest)}px — a note's own box is tiny and must be padded to at least 30`);
      else if (drawn.zones < 5) bad('zones: click → excerpt', `only ${drawn.zones} zone buttons drawn`);
      else if (!drawn.labels.includes('Piz Nuna')) bad('zones: click → excerpt', `no zone labelled Piz Nuna (${drawn.labels.join(', ')})`);
      else if (errors.length) bad('zones: click → excerpt', errors[0]);
      else ok('zones: click → excerpt', `${drawn.zones} zones · clicked "Piz Nuna" → the excerpt reads ${JSON.stringify(after)}`);
    } catch (e) {
      bad('zones: click → excerpt', String(e).slice(0, 130));
    }
    await page.close();
  }
  /**
   * The OCR-read diagram — the TEXT case (ISSUE-138).
   *
   * Here the zones ARE the visible thing: every label the reader can see is a clickable zone, so the board asks for the
   * subtle style and there must be no ring on any of them (a ring per word would be noise; a dashed box around each word
   * would be worse). The acceptance list is the four words the request named, and the click is by COORDINATE like a
   * reader's — the word's own box centre — because the highlight, not a marker, is the affordance.
   */
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = String(m.text());
      if (/Content Security Policy|Failed to load resource|violates the following/.test(text)) return;
      errors.push(`console: ${text.slice(0, 110)}`);
    });
    try {
      await page.goto(`${base}/?config=/biosphere-demo.json`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id="xbio-image"] .zone', { timeout: 30000 });
      const drawn = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('[data-widget-id="xbio-image"] .zone')];
        return {
          labels: buttons.map((b) => b.getAttribute('aria-label')),
          ringed: buttons.filter((b) => parseFloat(getComputedStyle(b).borderTopWidth) > 0).length,
        };
      });
      const missing = ['cell', 'tissue', 'organ', 'molecules'].filter((w) => !drawn.labels.includes(w));
      const point = await page.evaluate(() => {
        const b = document.querySelector('[data-widget-id="xbio-image"] .zone[aria-label="cell"]');
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-widget-id="xbio-excerpt"]')?.innerText || '';
        return /Cell/i.test(text) && !document.querySelector('.widget-waiting');
      }, null, { timeout: 30000, polling: 250 });
      const after = await page.evaluate(() => (document.querySelector('[data-widget-id="xbio-excerpt"]')?.innerText || '').split('\n')[0].slice(0, 60));
      if (missing.length) bad('zones: text diagram (OCR)', `the OCR labels this check needs are missing: ${missing.join(', ')}`);
      else if (drawn.ringed) bad('zones: text diagram (OCR)', `${drawn.ringed} zones still draw a ring — the subtle style is meant to have none`);
      else if (errors.length) bad('zones: text diagram (OCR)', errors[0]);
      else ok('zones: text diagram (OCR)', `${drawn.labels.length} words clickable, no rings · clicked "cell" → the excerpt reads ${JSON.stringify(after)}`);
    } catch (e) {
      bad('zones: text diagram (OCR)', String(e).slice(0, 130));
    }
    await page.close();
  }

  /**
   * ISSUE-146 — the picture is not a link any more.
   *
   * Andrew, on a phone: aiming at a zone inside the Biosphere diagram and missing visited the file on Commons, which
   * was "usually not useful" — so the default is now a no-op ("like clicking on glass"). The check is two-fold: the
   * card SAYS what a click does (`data-photo-click`, a state hook, not a sentence), and a click on the picture's own
   * background neither navigates nor opens a tab. The point is chosen away from every zone on purpose: clicking a
   * *zone* is the check above.
   */
  {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const opened = [];
    page.context().on('page', (p) => opened.push(p.url()));
    let errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
    try {
      await page.goto(`${base}/?config=/biosphere-demo.json`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id="xbio-image"] .zone', { timeout: 30000 });
      const before = page.url();
      const card = await page.evaluate(() => {
        const el = document.querySelector('[data-widget-id="xbio-image"] [data-photo-click]');
        return { value: el?.getAttribute('data-photo-click'), tag: el?.tagName.toLowerCase(), href: el?.getAttribute('href') || '' };
      });
      // A spot INSIDE the picture that is outside every zone's own box — found, not guessed, so a label that happens to
      // sit in a corner cannot make this check pass for the wrong reason.
      const point = await page.evaluate(() => {
        const el = document.querySelector('[data-widget-id="xbio-image"] [data-photo-click]');
        const r = el.getBoundingClientRect();
        const boxes = [...document.querySelectorAll('[data-widget-id="xbio-image"] .zone-item')].map((b) => b.getBoundingClientRect());
        const candidates = [
          { x: r.left + r.width * 0.97, y: r.top + r.height * 0.03 },
          { x: r.left + r.width * 0.97, y: r.top + r.height * 0.97 },
          { x: r.left + r.width * 0.03, y: r.top + r.height * 0.97 },
          { x: r.left + r.width * 0.5, y: r.top + r.height * 0.97 },
        ];
        const free = candidates.find((c) => !boxes.some((b) => c.x >= b.left - 6 && c.x <= b.right + 6 && c.y >= b.top - 6 && c.y <= b.bottom + 6));
        return free ? { x: Math.round(free.x), y: Math.round(free.y) } : null;
      });
      if (!point) bad('a picture click does nothing', 'every corner of the picture is inside a zone box — this check needs a spot that misses them all');
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => (document.querySelector('[data-widget-id="xbio-excerpt"]')?.innerText || '').split('\n')[0].slice(0, 40));
      if (card.value !== 'nothing') bad('a picture click does nothing', `the card says a click does ${JSON.stringify(card.value)} — a board that does not ask for the file page must read "nothing"`);
      else if (card.tag !== 'div' || card.href) bad('a picture click does nothing', `the picture is still a link (${card.tag}${card.href ? ` href=${card.href.slice(0, 40)}` : ''}) — nothing clicked must not be an anchor`);
      else if (page.url() !== before) bad('a picture click does nothing', `the click navigated to ${page.url().slice(0, 70)}`);
      else if (opened.length) bad('a picture click does nothing', `the click opened ${opened.length} tab(s), e.g. ${String(opened[0]).slice(0, 60)}`);
      else if (errors.length) bad('a picture click does nothing', errors[0]);
      else ok('a picture click does nothing', `the picture is a <${card.tag}> with no href — a click that missed every zone went nowhere (excerpt still ${JSON.stringify(after)})`);
    } catch (e) {
      bad('a picture click does nothing', String(e).slice(0, 130));
    }
    await page.close();
  }

  /**
   * The opt-in still works: a card that ASKS for the file page is still a link. This is a default, not a removal — so a
   * board built for clicking through (the image-tile and dashboard demos, and anyone who sets the field) must keep it,
   * keyboard included. Aborted at the network so the check never leaves the machine.
   */
  {
    const board = {
      version: 1, params: {},
      widgets: [{ id: 'pic', widgetType: 'gallery', name: 'Picture', config: {
        from: 'list', files: 'File:XBio illustration – Biosphere.png', displayMode: 'single', linkAction: 'new tab' } }],
      layout: [{ i: 'pic', x: 0, y: 0, w: 6, h: 5 }],
    };
    const b64 = Buffer.from(JSON.stringify(board), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const opened = [];
    page.context().on('page', (p) => opened.push(p.url()));
    // Only the FILE PAGE is aborted. The first version aborted every commons.wikimedia.org request and the gallery
    // never got its rows — so the card rendered "No image found", there was nothing to click, and the check failed for
    // a reason that had nothing to do with the thing it was measuring.
    await page.context().route('**://commons.wikimedia.org/**',
      (r) => (r.request().resourceType() === 'document' ? r.abort() : r.continue()));
    try {
      await page.goto(`${base}/#/d/${b64}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id="pic"] [data-photo-click="new tab"]', { timeout: 30000 });
      const link = await page.evaluate(() => {
        const el = document.querySelector('[data-widget-id="pic"] [data-photo-click]');
        return { tag: el.tagName.toLowerCase(), href: el.getAttribute('href') || '' };
      });
      const point = await page.evaluate(() => {
        const r = document.querySelector('[data-widget-id="pic"] [data-photo-click]').getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(1800);
      if (link.tag !== 'a' || !/commons\.wikimedia\.org/.test(link.href)) bad('the opt-in still opens the file page', `asked for "new tab" but the picture is a <${link.tag}> with href ${JSON.stringify(link.href.slice(0, 44))}`);
      else if (!opened.length) bad('the opt-in still opens the file page', 'asked for "new tab" and the click opened nothing');
      else ok('the opt-in still opens the file page', `asked for it and got it — the picture is an <a> and the click opened a tab (aborted before Commons)`);
    } catch (e) {
      bad('the opt-in still opens the file page', String(e).slice(0, 130));
    }
    await page.context().unroute('**://commons.wikimedia.org/**');
    await page.close();
  }

  /**
   * The reader's place survives a reload — the mobile jump (ISSUE-144, reported from an iPhone).
   *
   * The cause was measured, not guessed: when the consumer card replaced its article it emptied itself first, and a
   * 34px "Loading…" line shrank the document to exactly the viewport height — so the browser clamped the scroll to 0,
   * 304px above where the reader was, and it stayed there when the new article arrived. Neither disabling scroll
   * anchoring nor a CSS floor helped; the card has to keep its size.
   *
   * What this asserts, with the reader scrolled to the bottom of a stacked (mobile, lean) board: the card never falls
   * below 60% of its height while the new value is in flight, the document never collapses to the viewport, and the
   * scroll moves only by what a genuinely shorter article has to take (measured here at 35px; it was 304).
   */
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 110)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = String(m.text());
      if (/Content Security Policy|Failed to load resource|violates the following/.test(text)) return;
      errors.push(`console: ${text.slice(0, 100)}`);
    });
    try {
      await page.goto(`${base}/?config=/biosphere-demo.json&lean=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-widget-id="xbio-image"] .zone', { timeout: 30000 });
      await page.waitForTimeout(2000);
      const tap = (word) => page.evaluate((w) => {
        // A tap on a zone, dispatched where it is — no scrolling first, so the measurement is about the update itself.
        document.querySelector(`[data-widget-id="xbio-image"] .zone[aria-label="${w}"]`)
          .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }, word);
      const read = () => page.evaluate(() => ({
        scroll: Math.round(document.scrollingElement.scrollTop),
        docH: Math.round(document.scrollingElement.scrollHeight),
        cardH: Math.round(document.querySelector('[data-widget-id="xbio-excerpt"]').getBoundingClientRect().height),
      }));
      await tap('cell');                                    // a tall article first, so the next one shrinks it
      await page.waitForTimeout(3000);
      await page.evaluate(() => { const s = document.scrollingElement; s.scrollTop = s.scrollHeight - innerHeight - 20; });
      await page.waitForTimeout(400);
      const before = await read();
      await page.evaluate(() => {
        window.__frames = [];
        const card = document.querySelector('[data-widget-id="xbio-excerpt"]');
        let n = 0;
        const tick = () => {
          window.__frames.push({ docH: Math.round(document.scrollingElement.scrollHeight),
            scroll: Math.round(document.scrollingElement.scrollTop),
            cardH: Math.round(card.getBoundingClientRect().height) });
          if (++n < 200) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await tap('molecules');                               // shorter: the case that used to throw the reader away
      await page.waitForTimeout(3500);
      const after = await read();
      const frames = await page.evaluate(() => window.__frames);
      const minCard = Math.min(...frames.map((f) => f.cardH));
      const minDoc = Math.min(...frames.map((f) => f.docH));
      const least = Math.min(...frames.map((f) => f.scroll));
      const detail = `card ${before.cardH}→${after.cardH}px, never below ${minCard} · page never below ${minDoc}px (viewport 844) · scroll ${before.scroll}→${after.scroll}, least ${least}`;
      if (minCard < before.cardH * 0.6) bad('reader holds their place', `the card emptied itself while loading — ${detail}`);
      else if (minDoc <= 844 + 20) bad('reader holds their place', `the page collapsed to the viewport, which clamps the scroll — ${detail}`);
      // A genuinely shorter article still costs the reader something — the page really is shorter — measured at 52px in
      // Chromium and 71px in WebKit. The old behaviour was 304px *to the top of the page*, which is what this catches.
      else if (Math.abs(before.scroll - least) > 120) bad('reader holds their place', `the scroll was thrown ${Math.abs(before.scroll - least)}px — ${detail}`);
      else if (errors.length) bad('reader holds their place', errors[0]);
      else ok('reader holds their place', `a reload no longer empties the card — ${detail}`);
    } catch (e) {
      bad('reader holds their place', String(e).slice(0, 130));
    }
    await page.close();
  }

} finally {
  await browser.close();
  server?.kill();
}

console.log(results.join('\n'));
if (problems.length) {
  console.error(`\n  BOARD RENDER FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`    ✘ ${p}`);
  process.exit(1);
}
console.log(`\n  ✔ board render: ${results.length} check(s) passed — every board drew each card, no page errors`);
