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
 *   9. Andrew's reported case (2026-10-07): a gallery reading an ARTICLE is offered NO prose producer, and the
 *      card NEVER renders `Article not found: <prose>` — asserted on the card both before and after the panel is
 *      used, so a symptom that only settles in later is caught too. The value-form axis (`outputs.denotes`: what a
 *      value IS, not only what it is about) is what removes the offer; a control shows the empty side is the rule
 *      and not a panel that renders nothing.
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

/**
 * A one-card board: the demo's gallery, forced to read an ARTICLE (the reported case, ISSUE-96). Built from
 * public/dashboard.json's own gallery widget so it cannot drift from the real defaults, and pasted through the
 * app's ⬆ Import panel (AGENTS.md: a scratch board goes through Import, never a file in public/ or dist/).
 */
const galleryBoard = (over = {}) => {
  const dash = JSON.parse(readFileSync(join(process.cwd(), 'public/dashboard.json'), 'utf8'));
  const w = dash.widgets.find((x) => x.widgetType === 'gallery');
  const widgets = [{ ...w, config: { ...w.config, from: 'article', article: 'Albert Einstein', displayMode: 'grid', ...over } }];
  const layout = (dash.layout || []).filter((l) => l.i === w.id);
  return JSON.stringify({ ...dash, widgets, layout });
};

const browser = await chromium.launch({ headless: true });
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

  // ── 9 · the reported cases (ISSUE-96): a gallery reading an ARTICLE must be offered NEITHER a Commons-file
  // producer NOR the Article Excerpt ────────────────────────────────────────────────────────────────────────────
  // Bug 1: gallery { from: 'article' } offered Document Reader, whose File: URL was written into the gallery's
  // ARTICLE slot ("Article not found: <URL>"). Bug 2 (2026-10-07): it then offered the Article Excerpt, whose value
  // is a PARAGRAPH about the article, not the article's NAME — the paragraph landed in the title slot
  // ("Article not found: <the paragraph>"). The emitter model gained a third axis (`outputs.denotes`) for this:
  // the menu matches on what a value IS, not only what it is about, so both producers are gone and the empty feed
  // side says what it wanted.
  {
    const gp = await ctx.newPage();
    const gerrs = [];
    gp.on('pageerror', (e) => gerrs.push('pageerror: ' + String(e.message).slice(0, 120)));
    gp.on('console', (m) => {
      if (m.type() !== 'error') return;
      const full = m.text();
      if (/Failed to load resource|Access to fetch at|blocked by CORS|Content Security Policy|violates the following|Blocked autofocusing|ERR_/.test(full)) return;
      gerrs.push('console: ' + full.slice(0, 120));
    });

    await gp.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
    await gp.waitForSelector('[data-widget-id]', { timeout: 45000 });
    await gp.getByRole('button', { name: /Import/ }).click();
    await gp.waitForSelector('.import-textarea', { timeout: 10000 });
    await gp.locator('.import-textarea').fill(galleryBoard());
    await gp.locator('.import-panel button.btn-primary').click();
    await gp.waitForSelector('[data-widget-id="commons-gallery"]', { timeout: 20000 });
    await gp.waitForTimeout(1000);

    // The card as it renders. The reported symptom is `Article not found: <the excerpt paragraph>` — a LONG value
    // in the error slot. A title (or no error at all) is short, so a length threshold catches the prose without
    // hard-coding API text; a URL (the earlier symptom) is the same shape.
    const cardText = await gp.locator('[data-widget-id="commons-gallery"]').innerText();

    await gp.locator('[data-widget-id="commons-gallery"] button.spawn-btn').click();
    await gp.waitForSelector('.spawn-panel', { timeout: 5000 });
    const leftNames = (await gp.locator('.spawn-side-left .spawn-item-name').allTextContents()).map((s) => s.trim());
    const rightNames = (await gp.locator('.spawn-side-right .spawn-item-name').allTextContents()).map((s) => s.trim());

    // (a) no Commons-file producer is offered on the "feed this card" side.
    leftNames.some((n) => /document reader|iarchive|internet archive/i.test(n))
      ? bad(`the article gallery IS offered a Commons-file producer on the feed side: ${leftNames.join(', ')}`)
      : ok(`the article gallery offers no Commons-file producer on the feed side (offers: ${leftNames.join(', ') || 'none'})`);
    // (b) …and the Article Excerpt is NOT offered either: its value is PROSE about the article, not the article's
    // NAME, so it fills no field this card reads (2026-10-07). The whole feed side is empty, and says so.
    leftNames.some((n) => /article excerpt/i.test(n))
      ? bad(`the article-PROSE producer IS offered to a name field: ${leftNames.join(', ')}`)
      : ok(`the article gallery offers no prose producer on the feed side (offers: ${leftNames.join(', ') || 'none'})`);
    const leftNotes = await gp.locator('.spawn-side-left .spawn-empty').allTextContents();
    (leftNames.length === 0 && leftNotes.some((n) => /a name for article/i.test(n)))
      ? ok(`the feed side is empty and names what it wanted: "${(leftNotes[0] || '').slice(0, 70)}…"`)
      : bad(`expected an empty feed side with a note naming "a name for article", got ${leftNames.length} offer(s), notes ${JSON.stringify(leftNotes)}`);

    // (c) the reported SYMPTOM can never render: `Article not found: <prose>`. Assert on the CARD's own text. The
    // error echoes whatever is in the slot, so a TITLE (~40 chars) stays, while the excerpt's PARAGRAPH (~250) or a
    // File: URL does not — an 80-char threshold separates the two without hard-coding API text. (The check does not
    // demand zero errors: the article-gallery fetch can fail in a sandbox, and a short failure is not the bug.)
    const errLine = (cardText.match(/Article not found[^\n]*/) || [''])[0];
    (errLine.length >= 80)
      ? bad(`the card shows "Article not found: <prose/URL>" — the reported symptom: ${errLine.slice(0, 120)}`)
      : ok(`the card never shows "Article not found: <prose>" (error line: ${JSON.stringify(errLine.slice(0, 60)) || 'none'})`);
    // (d) …because nothing prose-shaped reached the slot: the gallery's `article` is still the title (or its
    // trimmed default), never a `{{widget:…}}` reference to the excerpt.
    const boardA = await gp.evaluate(() => { try { return JSON.parse(localStorage.getItem('wikibento-layout') || 'null'); } catch { return null; } });
    const cfgA = boardA?.widgets?.find((w) => w.id === 'commons-gallery')?.config || {};
    (typeof cfgA.article === 'string' && cfgA.article.includes('{{widget:'))
      ? bad(`the article slot was written with a widget reference: ${JSON.stringify(cfgA.article)}`)
      : ok(`the article slot holds the title, not a prose reference (article: ${JSON.stringify(cfgA.article ?? '(default Albert Einstein)')})`);

    // choose a valid neighbour on the "use this card's value" side — the gallery publishes `lines`, which filter/
    // count/speaker read — so the old invalid feeder is not needed for chaining.
    const g0 = await gp.$$eval('[data-widget-id]', (els) => els.length);
    if (rightNames.length) {
      await gp.locator('.spawn-side-right .spawn-item').first().click();
      await gp.waitForFunction((n) => document.querySelectorAll('[data-widget-id]').length > n, g0, { timeout: 8000 }).catch(() => {});
      await gp.waitForTimeout(1000);
      const g1 = await gp.$$eval('[data-widget-id]', (els) => els.length);
      g1 === g0 + 1
        ? ok(`choosing a valid neighbour (${rightNames[0]}) added one card (${g0} → ${g1})`)
        : bad(`after choosing ${rightNames[0]}: cards ${g0} → ${g1}`);
    } else {
      bad('the gallery panel offers no "use this card\'s value" candidate to choose');
    }

    // (f) re-read the card AFTER the panel has been used, so a symptom that only renders once the board settles is
    // caught too — (c) is a snapshot taken before the interaction, and the slot only ever changes through the panel,
    // so the pair of reads brackets the whole interaction. Same length rule as (c): a title (or no error) is short,
    // the excerpt's paragraph or a File: URL is not.
    const cardTextAfter = await gp.locator('[data-widget-id="commons-gallery"]').innerText();
    const errLineAfter = (cardTextAfter.match(/Article not found[^\n]*/) || [''])[0];
    (errLineAfter.length >= 80)
      ? bad(`after using the panel the card shows "Article not found: <prose/URL>": ${errLineAfter.slice(0, 120)}`)
      : ok(`after using the panel the card never shows "Article not found: <prose>" (error line: ${JSON.stringify(errLineAfter.slice(0, 50)) || 'none'})`);

    // (e) CONTROL — the same panel on a gallery that DOES read a file list still offers producers, so the empty
    // feed side above is the value-form rule and NOT a panel that renders nothing on any gallery.
    await gp.goto(`${base}/?config=/dashboard.json`, { waitUntil: 'domcontentloaded' });
    await gp.waitForSelector('[data-widget-id]', { timeout: 45000 });
    await gp.getByRole('button', { name: /Import/ }).click();
    await gp.waitForSelector('.import-textarea', { timeout: 10000 });
    await gp.locator('.import-textarea').fill(galleryBoard({ from: 'list' }));
    await gp.locator('.import-panel button.btn-primary').click();
    await gp.waitForSelector('[data-widget-id="commons-gallery"]', { timeout: 20000 });
    await gp.waitForTimeout(800);
    await gp.locator('[data-widget-id="commons-gallery"] button.spawn-btn').click();
    await gp.waitForSelector('.spawn-panel', { timeout: 5000 });
    const listNames = (await gp.locator('.spawn-side-left .spawn-item-name').allTextContents()).map((s) => s.trim());
    listNames.length
      ? ok(`control: a gallery reading a LIST still offers producers (${listNames.join(', ')}) — the empty article side is the rule`)
      : bad('control failed: a list-reading gallery offers nothing either, so the empty side may be a broken panel, not the rule');

    gerrs.length ? bad(`errors on the gallery-spawn check: ${gerrs[0]}`) : ok('0 errors on the gallery-spawn check');
    await gp.close();
  }

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
