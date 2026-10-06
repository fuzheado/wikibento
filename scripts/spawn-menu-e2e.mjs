#!/usr/bin/env node
/**
 * ISSUE-96 acceptance check — spawn a neighbour from a card, end to end, in a real browser against the
 * BUILT app.
 *
 * Run: npx vite build && node scripts/spawn-menu-e2e.mjs
 *  or: npx vite preview --port 4182  … then  node scripts/spawn-menu-e2e.mjs --base http://localhost:4182
 *
 * What it proves, and why each check is here:
 *   1. the card's ⇄ control opens the two-sided panel, and at least one side offers a NON-EMPTY list;
 *   2. a right-click on a card opens the SAME panel, and a card with no inputs and no outputs shows the
 *      HUMAN-READABLE note on the empty side(s) instead of a blank list; Escape closes it;
 *   3. clicking a candidate creates exactly ONE new card, through the Add-widget path;
 *   4. the new card is ALREADY WIRED — its config references the parent card's id (the "use this card's
 *      value" side writes `source: <parentId>`);
 *   5. its layout slot is ADJACENT to the parent's (beside when the 12 columns allow, else directly below);
 *   6. it is the highlighted "keep chaining" card, and there are no page errors and no non-upstream console
 *      errors.
 *
 * Two repo rules are baked in, both from AGENTS.md. First: a browser check refuses to run against a stale
 * `dist/` (twice on 2026-09-24 a fixed feature measured as broken because the build was old). Second: an
 * exception thrown inside a React event handler reaches the CONSOLE, not `pageerror`, so both are listened
 * to — upstream `Failed to load resource` / CSP / iframe-autofocus reports are notes, everything else is
 * fatal (the pageviews card walks candidate dates back from today, so an upstream 404 is normal here; a CORS-refused archive.org call from the local origin is that same kind of note, not a signal).
 */
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { join } from 'node:path';

/** Refuse to measure a stale build (copied from scripts/pick-mode-e2e.mjs). */
function assertFreshBuild() {
  const newest = (dir) => {
    let ms = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      // `recursive: true` gives entries whose real path is parentPath/name, not dir/name.
      const full = join(entry.parentPath || entry.path || dir, entry.name);
      ms = Math.max(ms, statSync(full).mtimeMs);
    }
    return ms;
  };
  const src = newest('src');
  const dist = newest('dist/assets');
  if (src > dist) {
    console.error(`  ✘ dist/ is older than src/ by ${Math.round((src - dist) / 1000)}s — the built app is stale.`);
    console.error('    Run `npx vite build` first (a browser check against a stale dist/ reports a broken feature).');
    process.exit(1);
  }
}
assertFreshBuild();

// `--base URL` checks a server you already have (production, or a preview you started); otherwise start one.
const fixed = process.argv.indexOf('--base');
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const port = fixed === -1 ? await freePort() : null;
const base = fixed === -1 ? `http://127.0.0.1:${port}` : process.argv[fixed + 1];
const srv = fixed === -1
  ? spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  : null;
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }

console.log(`  base: ${base}`);

const results = [];
const ok = (m) => { results.push(0); console.log('  ✔ ' + m); };
const bad = (m) => { results.push(1); console.log('  ✘ ' + m); };

// The parent card: the CIM Snapshot sits at x:0 in public/dashboard.json's layout, so its default-width
// neighbour fits in the remaining columns and lands BESIDE it — the branch this check asserts.
const PARENT = 'cimstats';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 120)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const full = m.text();
  if (/Failed to load resource|Access to fetch at|blocked by CORS|Content Security Policy|violates the following|Blocked autofocusing|ERR_/.test(full)) return;
  errs.push('console: ' + full.slice(0, 120));
});

try {
  await page.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-widget-id="${PARENT}"]`, { timeout: 45000 });

  const beforeIds = await page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
  console.log(`  board loaded: ${beforeIds.length} cards`);

  // ── 1 · the ⇄ control opens the panel, both sides measured ──────────────────────────────────────────
  await page.locator(`[data-widget-id="${PARENT}"] button.spawn-btn`).click();
  await page.waitForSelector('.spawn-panel', { timeout: 5000 });
  const left = await page.locator('.spawn-side-left .spawn-item').count();
  const right = await page.locator('.spawn-side-right .spawn-item').count();
  (left + right > 0)
    ? ok(`⇄ opened the panel for "${PARENT}" — ${left} candidate(s) on the "feed this card" side, ${right} on the "use this card's value" side`)
    : bad(`the panel offers nothing on either side (left ${left}, right ${right})`);

  // ── 4/5 · choose a candidate and assert the card, the wire and the slot ─────────────────────────────
  const chosenName = (await page.locator('.spawn-side-right .spawn-item').first().textContent())?.trim() || '(unnamed)';
  await page.locator('.spawn-side-right .spawn-item').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length > n, beforeIds.length, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(400);

  const afterIds = await page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
  const added = afterIds.filter((id) => !beforeIds.includes(id));
  (afterIds.length === beforeIds.length + 1 && added.length === 1)
    ? ok(`one choice → one card: ${beforeIds.length} → ${afterIds.length}, new id "${added[0]}" (${chosenName})`)
    : bad(`expected exactly one new card, got ${afterIds.length - beforeIds.length} (${added.join(', ') || 'none'})`);
  (await page.locator('.spawn-panel').count()) === 0 ? ok('the panel closed on choosing') : bad('the panel stayed open after choosing');

  // The board is read back from localStorage — the same snapshot the "is this saved?" fingerprint uses.
  const board = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('wikibento-layout') || 'null'); } catch { return null; } });
  const newId = added[0];
  const newWidget = board?.widgets?.find((w) => w.id === newId);
  if (!newWidget) {
    bad('the new card is not in the saved board — cannot check its config or slot');
  } else {
    // ── 4 · already wired: the new card's config names the parent ─────────────────────────────────────
    const wired = JSON.stringify(newWidget.config).includes(PARENT);
    wired
      ? ok(`the new "${newWidget.widgetType}" card is ALREADY WIRED: config ${JSON.stringify(newWidget.config)} references "${PARENT}"`)
      : bad(`the new card's config does not reference "${PARENT}": ${JSON.stringify(newWidget.config)}`);

    // ── 5 · adjacent placement ────────────────────────────────────────────────────────────────────────
    const parentItem = board.layout.find((l) => l.i === PARENT);
    const newItem = board.layout.find((l) => l.i === newId);
    if (!parentItem || !newItem) {
      bad(`no layout item for parent or child (parent ${!!parentItem}, child ${!!newItem})`);
    } else {
      const beside = newItem.x === parentItem.x + parentItem.w;
      const below = newItem.x === parentItem.x && newItem.y >= parentItem.y + parentItem.h;
      const shape = (it) => `{x:${it.x}, y:${it.y}, w:${it.w}, h:${it.h}}`;
      (beside || below)
        ? ok(`adjacent slot: parent ${shape(parentItem)} → child ${shape(newItem)} (${beside ? 'beside, to the right' : 'directly below'})`)
        : bad(`not adjacent: parent ${shape(parentItem)} → child ${shape(newItem)}`);
    }

    // ── 6 · selected for chaining ─────────────────────────────────────────────────────────────────────
    const focused = await page.$$eval('.grid-item[data-spawn-focused="true"]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
    (focused.length === 1 && focused[0] === newId)
      ? ok(`the new card is the highlighted "keep chaining" card: ${focused[0]}`)
      : bad(`expected [${newId}] highlighted, got [${focused.join(', ')}]`);
  }

  // ── 8 · the OTHER direction: "feed this card" wires the PARENT to read the new card ─────────────────
  const rightIds = await page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
  await page.locator(`[data-widget-id="${PARENT}"] button.spawn-btn`).click();
  await page.waitForSelector('.spawn-panel', { timeout: 5000 });
  const feedName = (await page.locator('.spawn-side-left .spawn-item').first().textContent())?.trim() || '(unnamed)';
  await page.locator('.spawn-side-left .spawn-item').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length > n, rightIds.length, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const afterFeed = await page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
  const feedAdded = afterFeed.filter((id) => !rightIds.includes(id));
  const board2 = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('wikibento-layout') || 'null'); } catch { return null; } });
  const parentNow = board2?.widgets?.find((w) => w.id === PARENT);
  (feedAdded.length === 1 && JSON.stringify(parentNow?.config).includes(feedAdded[0]))
    ? ok(`"feed this card" (${feedName}) rewired the PARENT: "${PARENT}" now references "${feedAdded[0]}" — ${JSON.stringify(parentNow?.config)}`)
    : bad(`the feed side created ${feedAdded.length} card(s) but the parent does not read it: ${JSON.stringify(parentNow?.config)}`);

  // ── 2 · right-click opens the same panel; an all-empty card shows its NOTE; Escape closes ───────────
  await page.locator('[data-widget-id="toppages"] .widget-header').click({ button: 'right' });
  await page.waitForSelector('.spawn-panel', { timeout: 5000 });
  const forType = await page.locator('.spawn-panel').getAttribute('data-spawn-for');
  const empties = await page.locator('.spawn-empty').allTextContents();
  (forType === 'topPages' && empties.length === 2)
    ? ok(`right-click opened the panel for "topPages"; both empty sides carry a note — "${empties[0].slice(0, 60)}…"`)
    : bad(`right-click panel: data-spawn-for="${forType}", ${empties.length} note(s) on an all-empty card`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  (await page.locator('.spawn-panel').count()) === 0 ? ok('Escape closes the panel') : bad('Escape did not close the panel');

  // ── 7 · the errors ──────────────────────────────────────────────────────────────────────────────────
  errs.length ? bad(`errors: ${errs.slice(0, 2).join(' | ')}`) : ok('0 page errors and 0 non-upstream console errors');
} catch (e) {
  bad('harness: ' + String(e.message).slice(0, 160));
} finally {
  await browser.close();
  if (srv) srv.kill('SIGTERM');
}

const fails = results.reduce((a, b) => a + b, 0);
console.log(`\n  ${fails ? 'FAILED' : 'SPAWN MENU OK'} — ${results.length - fails}/${results.length} checks`);
process.exit(fails ? 1 : 0);
