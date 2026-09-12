/**
 * Record the WikiBento tutorial: one video clip per scene, driven by real browser interaction.
 *
 * Per-scene recording (rather than one long take) means a step can be re-recorded on its own, and
 * the narration can be aligned exactly: each clip is padded to the length of its voiceover at
 * build time.
 *
 * Usage:  node scripts/tutorial-video/record.mjs [--only 03-reset] [--out /path/to/dir]
 * Env:    PLAYWRIGHT_BROWSERS_PATH (scoped to the command — never exported globally)
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveOut, arg, playwrightCacheWithFfmpeg } from './paths.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

// ── preflight: recordVideo needs Playwright's OWN ffmpeg build, not the system one ──
// The cache probe lives in paths.mjs (it is the same resolution Playwright itself does: the env
// var, then the platform default) — checking ONLY the env var made this fail on a machine where
// ffmpeg-1011 was installed at ~/Library/Caches/ms-playwright (found + fixed 2026-09-11).
{
  if (!playwrightCacheWithFfmpeg()) {
    console.error(
      '✘ Playwright recording ffmpeg is missing.\n' +
      '  Looked for an ffmpeg-* directory in PLAYWRIGHT_BROWSERS_PATH (if set) and the\n' +
      '  platform default cache (~/Library/Caches/ms-playwright on macOS, ~/.cache/ms-playwright on Linux).\n' +
      '  recordVideo cannot work without it; the system ffmpeg is not used. One-time fix:\n' +
      '      node node_modules/playwright-core/cli.js install ffmpeg\n' +
      '  (install the ffmpeg build belonging to THIS repo’s playwright-core, and name every\n' +
      '   engine you still need — `npx playwright install <subset>` prunes the others.)');
    process.exit(2);
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const plan = JSON.parse(readFileSync(join(root, 'scripts/tutorial-video/scenes.json'), 'utf8'));
const OUT = resolveOut(arg('out', null));
const ONLY = arg('only', null);
const BASE = 'https://wikibento.toolforge.org';
const { width, height } = plan.video;

mkdirSync(join(OUT, 'clips'), { recursive: true });
console.log(`  clips → ${OUT}`);

// ── human-ish interaction helpers ───────────────────────────────────────────
const settle = (page, ms) => page.waitForTimeout(ms);
async function glide(page, x, y, steps = 22) {
  const from = page.__mouse || { x: width / 2, y: height / 2 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
  }
  page.__mouse = { x, y };
}
async function clickHuman(page, selectorOrBox, opts = {}) {
  const raw = selectorOrBox.x !== undefined
    ? selectorOrBox
    : await (await page.$(selectorOrBox)).boundingBox();
  const bw = raw.width ?? raw.w ?? 0;
  const bh = raw.height ?? raw.h ?? 0;
  const x = raw.x + (opts.dx === undefined ? bw / 2 : opts.dx);
  const y = raw.y + (opts.dy === undefined ? bh / 2 : opts.dy);
  if (![x, y].every(Number.isFinite)) throw new Error(`bad click target: ${JSON.stringify(raw)} → ${x},${y}`);
  await glide(page, x, y);
  await settle(page, 250);
  await page.mouse.down();
  await settle(page, 90);
  await page.mouse.up();
  return { x, y };
}
async function typeHuman(page, text, delay = 85) {
  await page.keyboard.type(text, { delay });
}
const cards = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.grid-item')).map((t) => {
  const title = t.querySelector('.widget-title');
  const r = t.getBoundingClientRect();
  return {
    title: title ? title.innerText.replace(/\s+/g, ' ').trim().slice(0, 48) : null,
    value: (t.querySelector('.stat-value') || {}).innerText || null,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
}));

/** a data: URL for a locally built page (the recorder shows a few of these) */
const dataUrl = (html) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
const escHtml = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/** the four buttons in a card's top bar, left to right (the ⓘ ⚙ ↻ ✕ the script names) */
const topBarButtons = (page, index = 0) => page.evaluate((i) => {
  const card = document.querySelectorAll('.grid-item')[i];
  if (!card) return [];
  const cr = card.getBoundingClientRect();
  return [...card.querySelectorAll('button')]
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
               top: r.y - cr.y, title: b.title || '' };
    })
    .filter((b) => b.top >= 0 && b.top < 40)
    .sort((a, b) => a.x - b.x);
}, index);

/** move the real pointer onto an element (so hover states actually fire) */
async function hoverSelector(page, selector) {
  const box = await fxBox(page, selector);
  if (!box) return false;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

// ── fx layer: zoom and highlight, applied INSIDE the page ───────────────────
//
// Drawn in-page rather than in post-production, for two reasons: a CSS transform on #root magnifies
// real text (the browser re-renders it, so it stays crisp where upscaling pixels in ffmpeg cannot),
// and the effect is simply part of the recording. Proved by fx-proof.mjs (1.80x measured on a card),
// wired in here 2026-09-11.
//
// Installed with addInitScript so it survives the navigations some scenes perform (07-store goes to a
// data: card and back, 02-read loads a ?config= URL).
const FX = `
window.__fx = {
  zoom(rect, factor, ms) {
    const root = document.getElementById('root') || document.body;
    root.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.33, 0, 0.2, 1)';
    root.style.willChange = 'transform';
    if (factor <= 1.001) { root.style.transform = 'none'; return; }
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    root.style.transformOrigin = cx + 'px ' + cy + 'px';
    // Magnify about the target's centre, then shift the minimum amount needed to keep the whole
    // target on screen. Scaling about a point on the left edge pushes half the card off screen (a
    // 1.2x push on the leftmost card lost its title), while always centring the target pans the whole
    // board for a subtle push. Clamping gives the gentle move without either problem.
    const shift = (lo, hi, min, max, size, margin) => {
      const a = margin - min, b = size - margin - max;   // allowed range for the translation
      if (a > b) return (a + b) / 2;                      // target bigger than the viewport: centre it
      return Math.min(Math.max(0, a), b);
    };
    const minX = cx + (rect.x - cx) * factor, maxX = cx + (rect.x + rect.width - cx) * factor;
    const minY = cy + (rect.y - cy) * factor, maxY = cy + (rect.y + rect.height - cy) * factor;
    const tx = shift(0, 0, minX, maxX, window.innerWidth, 24);
    const ty = shift(0, 0, minY, maxY, window.innerHeight, 24);
    root.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + factor + ')';
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

/** the on-screen box of a selector, or null if it is not there (or has no size) */
const fxBox = (page, selector) => page.evaluate((sel) => {
  let el = null;
  try { el = document.querySelector(sel); } catch { return null; }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}, selector);

// ── the beat clock ──────────────────────────────────────────────────────────
// Beat offsets come from the measured voiceover (narration/timing.json), so an action can be made to
// land on the words describing it — which is what the script's ⚠ notes ask for and what a whole-clip
// stretch could never do.
let TIMING = null;
try { TIMING = JSON.parse(readFileSync(join(OUT, 'narration', 'timing.json'), 'utf8')); }
catch { /* not narrated yet — fx and beat timing are simply unavailable */ }

let T0 = Date.now();
const at = async (seconds) => {
  const waitMs = seconds * 1000 - (Date.now() - T0);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
};

/**
 * Play a scene's fx from its beat markers, on the beat clock.
 *
 * Runs concurrently with the scene's actions rather than before or after them: it is a schedule of its
 * own, and the page can be driven while a zoom is easing. Markers with no `@selector` are intent only
 * and are skipped (beats.mjs counts how many are still prose). Several rings in one beat are staggered
 * evenly across it, which is how the script describes "ring each card as it is named".
 */
async function playFx(page, scene) {
  const beats = TIMING?.scenes?.[scene.id]?.beats;
  if (!beats) return;
  let played = 0;
  for (const b of beats) {
    const zooms = (b.zoom || []).filter((z) => z.selector);
    const rings = (b.ring || []).filter((r) => r.selector);
    if (!zooms.length && !rings.length) continue;

    // Zoom IN first and let the transition settle before anything is drawn over the page: a ring
    // positioned while the camera is still moving lands in the wrong place (its coordinates are read
    // from the live DOM, and the transform is still animating).
    for (const z of zooms) {
      await at(b.start);
      const box = await fxBox(page, z.selector);
      if (!box) { console.log(`   ⚠ fx: no element for ${z.selector}`); continue; }
      await page.evaluate(([r, f]) => window.__fx?.zoom(r, f, 600), [box, z.scale || 1.2]);
      await settle(page, 750);
      console.log(`   fx zoom ${z.scale}× ${z.selector}`);
      played += 1;
    }
    // then the rings, staggered across what is left of the beat
    const ringStart = zooms.length ? 0.75 : 0;
    for (const [i, r] of rings.entries()) {
      const span = Math.max(0.1, b.duration - ringStart);
      await at(b.start + ringStart + (span * i) / Math.max(1, rings.length));
      const box = await fxBox(page, r.selector);
      if (!box) { console.log(`   ⚠ fx: no element for ${r.selector}`); continue; }
      await page.evaluate(([rect, ms]) => window.__fx?.ring(rect, ms), [box, 1100]);
      console.log(`   fx ring ${r.selector}`);
      played += 1;
    }
    // and zoom back out at the end of the beat, after the rings have faded
    if (zooms.length) {
      await at(b.end - 0.2);
      await page.evaluate(() => window.__fx?.zoom({ x: 0, y: 0, width: 1, height: 1 }, 1, 500));
    }
  }
  if (played) console.log(`   fx: ${played} marker(s) played`);
}

// ── start states: how each scene begins, deterministically ─────────────────
/** open the Add Widget picker */
async function openPicker(page) {
  await clickHuman(page, 'button:has-text("Add Widget")');
  await settle(page, 900);
}

/** type into the picker's search field (React-safe: native setter + input event) */
async function pickerType(page, term) {
  return page.evaluate((t) => {
    const inp = document.querySelector('.add-widget-search input, input[placeholder*="Search widgets"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, t);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, term);
}

/** open + search in one go (used when establishing a scene's starting state) */
async function setPickerSearch(page, term) {
  await openPicker(page);
  const typed = await pickerType(page, term);
  await settle(page, 1300);
  return typed;
}
async function addArticlePageviews(page, article) {
  await setPickerSearch(page, 'pageviews');
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Add Article Pageviews"]');
    if (el) el.click();
  });
  await settle(page, 1000);
  await page.keyboard.press('Escape');
  await settle(page, 4500);
  // configure: open the new card's gear and set the article (the first text field holds Main_Page)
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.grid-item'));
    const gear = all[all.length - 1].querySelector('button[title="Configure"]');
    if (gear) gear.click();
  });
  await settle(page, 1200);
  await page.evaluate((a) => {
    const all = Array.from(document.querySelectorAll('.grid-item'));
    const cfg = all[all.length - 1].querySelector('.widget-config');
    const inputs = Array.from(cfg.querySelectorAll('input[type="text"], textarea'));
    const target = inputs.find((f) => (f.value || '').trim() === 'Main_Page') || inputs[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(target, a);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }, article);
  await settle(page, 5500);
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.grid-item'));
    const gear = all[all.length - 1].querySelector('button[title="Configure"]');
    if (gear) gear.click(); // close the panel again
  });
  await settle(page, 600);
}
async function applyStart(page, spec) {
  if (spec.startsWith('config:')) {
    await page.goto(`${BASE}/?config=${encodeURIComponent(spec.slice(7))}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 9000);
  } else if (spec.startsWith('wikiPage:')) {
    await page.goto(`${spec.slice(9)}?action=raw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 4000);
  } else {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 7000);
    if (spec === 'home-addpageviews') await addArticlePageviews(page, 'Marie Curie');
  }
}

// ── what each scene actually does on screen ─────────────────────────────────
// ── what each scene does on screen, timed to the beats ──────────────────────
//
// A step names the beat whose words describe it. The runner waits for that beat before running the
// step, and says so when a step finishes after its beat has ended — the script's own rule ("every
// action must finish before the beat that describes it ends"), checked by machine instead of by eye.
// Without a narrated beat timeline the steps still run, just back to back.
//
// Sub-actions inside a single beat are spread across its window with spread(b, i, n): four hovers
// "as each icon is named" are four points inside the beat, not four clicks in a row.

/** when the i-th of n sub-actions within beat b should happen */
const spread = (b, i, n) => (b ? b.start + ((b.end - b.start) * i) / n : 0);

/** the "where should the JSON live" card scene 7 cuts to (and back from) */
const HOST_CARD = `<html><body style="margin:0;background:#14161a;color:#e8e8ea;font:20px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="padding:64px 80px">
    <div style="font-size:34px;font-weight:700;margin-bottom:28px">Where the JSON should live</div>
    <div style="margin-bottom:18px"><span style="color:#8fc0ff">✓ A wiki page (easiest)</span> — read through the CORS-enabled MediaWiki API, and it keeps the wiki's history and permissions.</div>
    <div style="margin-bottom:18px"><span style="color:#8fc0ff">✓ Any host that sends</span> <code style="background:#20242b;padding:2px 8px;border-radius:4px">Access-Control-Allow-Origin</code>.</div>
    <div style="margin-top:36px;padding:20px 24px;border-left:4px solid #d9a13b;background:#1b1e23">
      <div style="color:#d9a13b;font-weight:700;margin-bottom:6px">If the browser is not allowed to read it</div>
      <div style="color:#b9c2cf">⚠ Could not load dashboard from URL: Failed to fetch — and the board falls back to the starter set.</div>
    </div>
  </div></body></html>`;

const STEPS = {
  '01-what': [
    { beat: 2, label: 'drift across the board', run: async (page) => { await glide(page, 1400, 300); } },
    { beat: 3, label: 'point at each card as it is named', run: async (page, b) => {
      const c = await cards(page);
      for (const [i, card] of c.entries()) {
        if (!card) continue;
        await at(spread(b, i, c.length));
        await clickHuman(page, card.box, { dy: 16 });
      }
    } },
    { beat: 4, label: 'pointer away from the cards', run: async (page) => { await glide(page, 1500, 900); } },
  ],

  '02-read': [
    { beat: 1, label: 'rest on the first card top bar', run: async (page) => {
      const c = await cards(page);
      if (c[0]) await clickHuman(page, { x: c[0].box.x, y: c[0].box.y, width: c[0].box.w, height: 34 }, { dx: 60, dy: 16 });
    } },
    { beat: 2, label: '(the board is already built)', run: async () => {} },
    { beat: 3, label: 'hover the four icons in order', run: async (page, b) => {
      const btns = await topBarButtons(page, 0);
      console.log(`   top bar buttons: ${btns.map((x) => x.title || '?').join(' · ')}`);
      for (const [i, btn] of btns.entries()) {
        await at(spread(b, i, Math.max(1, btns.length)));
        await glide(page, btn.x, btn.y);
      }
    } },
    { beat: 4, label: 'hover the name chip', run: async (page) => {
      const c = await cards(page);
      if (c[1]) await clickHuman(page, c[1].box, { dx: 90, dy: 16 });
    } },
  ],

  '03-reset': [
    { beat: 1, label: 'click Reset — the dialog opens', run: async (page) => {
      await clickHuman(page, 'button[title="Reset to defaults"]');
      await settle(page, 600);
      const open = await page.locator('.confirm-panel').count();
      console.log(open ? '   reset dialog is open (Cancel · Blank board · Starter set)'
                       : '   ⚠ no reset dialog — is the deployed app older than 2026-09-11?');
    } },
    { beat: 2, label: 'hold on the dialog (the warning)', run: async () => {} },
    { beat: 3, label: 'choose Starter set', run: async (page) => {
      const chose = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.confirm-actions button'));
        const wanted = btns.find((b) => /starter set/i.test((b.innerText || '').trim()));
        if (wanted) { wanted.click(); return wanted.innerText.trim(); }
        return null;
      });
      console.log(chose ? `   reset dialog → "${chose}"` : '   ⚠ no Starter set button');
      await settle(page, 1200);
      const c = await cards(page);
      console.log('   reset → cards:', c.map((x) => x.title).join(' | '));
    } },
  ],

  '04-add': [
    { beat: 1, label: 'click + Add Widget', run: async (page) => { await openPicker(page); } },
    { beat: 2, label: 'scroll the categories', run: async (page, b) => {
      for (const [i, px] of [180, 180, 180].entries()) {
        await at(spread(b, i, 3));
        await page.evaluate((y) => { const p = document.querySelector('.add-widget-panel'); if (p) p.scrollBy({ top: y, behavior: 'smooth' }); }, px);
      }
    } },
    { beat: 3, label: 'search for pageviews and add Article Pageviews', run: async (page) => {
      const typed = await pickerType(page, 'pageviews');
      await settle(page, 900);
      const list = await page.evaluate(() => Array.from(document.querySelectorAll('.add-widget-item'))
        .map((e) => (e.querySelector('.add-widget-name') || {}).innerText || '').slice(0, 4));
      console.log(`   search typed: ${typed} · results: ${JSON.stringify(list)}`);
      await page.evaluate(() => {
        const el = document.querySelector('[aria-label="Add Article Pageviews"]');
        if (el) el.click();
      });
      await settle(page, 900);
    } },
    { beat: 4, label: 'the card appears; close the picker', run: async (page) => {
      await page.keyboard.press('Escape');
      await settle(page, 700);
    } },
    { beat: 5, label: 'open its gear and set the article', run: async (page) => {
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('.grid-item'));
        const gear = all[all.length - 1].querySelector('button[title="Configure"]');
        if (gear) gear.click();
      });
      await settle(page, 900);
      // Two earlier versions of this failed silently: one clicked at a computed offset (box.x + 40)
      // which landed outside the input, so focus went to the panel and every keystroke was lost; the
      // other used elementHandle.click(), which times out because the field sits in a clipped config
      // panel and never becomes "actionable". The narration promises "type or paste the exact article
      // title" and "the data fills in for that article" — with the field left empty the card kept
      // Main_Page and the promise was false. So: click the live coordinates, check that focus really
      // landed, and fall back to a React-safe programmatic set. The field's value is always logged.
      const spot = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('.grid-item'));
        const cfg = all[all.length - 1].querySelector('.widget-config');
        if (!cfg) return null;
        const inputs = Array.from(cfg.querySelectorAll('input[type="text"], textarea'));
        const f = inputs.find((x) => (x.value || '').trim() === 'Main_Page') || inputs[0];
        if (!f) return null;
        f.scrollIntoView({ block: 'center' });
        const r = f.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      let typed = false;
      if (spot) {
        await clickHuman(page, { x: spot.x, y: spot.y });
        typed = await page.evaluate(() => {
          const a = document.activeElement;
          return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
        });
      }
      if (typed) {
        const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';  // Control+A is not select-all on macOS
        await page.keyboard.press(`${MOD}+A`);
        await typeHuman(page, 'Marie Curie', 90);
        await page.keyboard.press('Enter');
      } else {
        console.log('   (field not focusable by click — setting the value directly)');
        await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('.grid-item'));
          const cfg = all[all.length - 1].querySelector('.widget-config');
          const inputs = Array.from(cfg.querySelectorAll('input[type="text"], textarea'));
          const f = inputs.find((x) => (x.value || '').trim() === 'Main_Page') || inputs[0];
          const proto = f.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(f, 'Marie Curie');
          f.dispatchEvent(new Event('input', { bubbles: true }));
          f.focus();
        });
        await page.keyboard.press('Enter');
      }
      const fields = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('.grid-item'));
        const cfg = all[all.length - 1].querySelector('.widget-config');
        return Array.from(cfg.querySelectorAll('input[type="text"], textarea')).map((x) => (x.value || '').trim());
      });
      console.log(`   subject set (${typed ? 'typed' : 'set directly'}) → fields: ${JSON.stringify(fields)}`);
    } },
    { beat: 6, label: 'the data lands for that article', run: async (page) => {
      await settle(page, 1200);        // the card is fetching; this beat is "watch it fill in"
    } },
    { beat: 7, label: 'close the panel', run: async (page) => {
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('.grid-item'));
        const gear = all[all.length - 1].querySelector('button[title="Configure"]');
        if (gear) gear.click();
      });
      await settle(page, 700);
    } },
  ],

  '05-move': [
    { beat: 1, label: 'drag the card by its top bar', run: async (page, b) => {
      // Measured recipe (1920x1080, the 3-card starter board): 10 x 30px of travel moves the first card
      // one column (x 20 -> 335). The increments are spread across the beat so the card is still moving
      // while the clause about the board reflowing is spoken — the script's ⚠ note asks for exactly that.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const before = await cards(page);
      const card = before[0];
      const from = { x: card.box.x + 60, y: card.box.y + 16 };
      console.log(`   card 0 before ${JSON.stringify(card.box)} — grab at ${from.x},${from.y}`);
      await glide(page, from.x, from.y);
      await page.mouse.down();
      const end = b ? Math.max(b.start + 1.5, b.end - 0.6) : null;
      for (let i = 1; i <= 10; i++) {
        if (end) await at(b.start + ((end - b.start) * i) / 10);
        await page.mouse.move(from.x + i * 30, from.y + i * 16, { steps: 4 });
      }
      const dragging = await page.evaluate(() => document.querySelectorAll('.react-draggable-dragging').length);
      await page.mouse.up();
      console.log(`   dragging-class: ${dragging}`);
      await settle(page, 800);
      const after = await cards(page);
      console.log(`   after ${JSON.stringify(after[0] && after[0].box)} | moved:`,
        JSON.stringify(after[0] && after[0].box) !== JSON.stringify(card.box));
    } },
    { beat: 2, label: 'resize from the corner handle', run: async (page, b) => {
      const handle = await page.evaluate(() => {
        const t = document.querySelectorAll('.grid-item')[0];
        const h = t && t.querySelector('.react-resizable-handle');
        if (!h) return null;
        const r = h.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!handle) { console.log('   (no resize handle found)'); return; }
      await glide(page, handle.x, handle.y);
      await page.mouse.down();
      const end = b ? Math.max(b.start + 1.0, b.end - 0.3) : null;
      for (let i = 1; i <= 6; i++) {
        if (end) await at(b.start + ((end - b.start) * i) / 6);
        await page.mouse.move(handle.x + i * 30, handle.y + i * 18, { steps: 4 });
      }
      await page.mouse.up();
      await settle(page, 700);
      const now = await cards(page);
      console.log(`   resize → ${JSON.stringify(now[0] && now[0].box)}`);
    } },
    { beat: 3, label: 'let it settle (the grid minimum)', run: async (page) => { await glide(page, 1200, 800); } },
  ],

  '06-export': [
    { beat: 1, label: 'click Export', run: async (page) => {
      // The download event never fires in this headless setup (reproduced, diagnosed 2026-09-11), so
      // the wait is short: it used to hold 20s and made this take four times longer than its narration.
      const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
      await clickHuman(page, 'button[title="Export dashboard config as JSON"]');
      const download = await dl;
      if (download) {
        const saved = join(OUT, 'exported-dashboard.json');
        await download.saveAs(saved);
        console.log(`   exported ${download.suggestedFilename()} — ${readFileSync(saved, 'utf8').length} bytes`);
      } else {
        console.log('   no download event (known: headless Chromium does not fire it) — will render the board JSON instead');
      }
    } },
    { beat: 2, label: 'show the exported JSON', run: async (page) => {
      // Prefer the file Playwright captured; otherwise render the board's own JSON, which after the
      // 2026-09-11 export fix is exactly what the file contains (cards, layout and params). Without
      // this the scene showed nothing here, because the download never arrives.
      let json = null;
      try { json = readFileSync(join(OUT, 'exported-dashboard.json'), 'utf8'); } catch { /* fall back */ }
      if (!json) {
        json = await page.evaluate(() => localStorage.getItem('wikibento-layout'));
        console.log('   rendering the board JSON from localStorage (nothing to download)');
      }
      const pretty = JSON.stringify(JSON.parse(json), null, 2).slice(0, 2200);
      await page.goto(dataUrl(`<html><body style="margin:0;background:#14161a;color:#e8e8ea;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace"><div style="padding:18px 24px;border-bottom:1px solid #2a2f37;color:#9aa4b2">dashboard.json — the whole board: cards, settings, positions, params</div><pre style="padding:18px 24px;margin:0;white-space:pre-wrap">${escHtml(pretty)}</pre></body></html>`), { waitUntil: 'domcontentloaded' });
      console.log(`   showed ${pretty.length} chars of JSON`);
    } },
    { beat: 3, label: 'scroll the JSON a little', run: async (page) => {
      await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
    } },
  ],

  '07-store': [
    { beat: 1, label: 'the raw wiki JSON on screen', run: async (page) => { await glide(page, 900, 140); } },
    { beat: 2, label: 'scroll the page slowly', run: async (page, b) => {
      const steps = [220, 240, 280, 300, 240];
      for (const [i, px] of steps.entries()) {
        await at(spread(b, i, steps.length));
        await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px);
      }
    } },
    { beat: 3, label: 'cut to the "where the JSON should live" card', run: async (page) => {
      await page.goto(dataUrl(HOST_CARD), { waitUntil: 'domcontentloaded' });
    } },
    { beat: 4, label: 'back to the raw page', run: async (page) => { await page.goBack().catch(() => {}); } },
    { beat: 5, label: 'the card again (the CORS warning)', run: async (page) => {
      await page.goto(dataUrl(HOST_CARD), { waitUntil: 'domcontentloaded' });
    } },
  ],

  '08-reload': [
    { beat: 1, label: 'hover the first card, URL in view', run: async (page) => {
      const c = await cards(page);
      if (c[0]) await clickHuman(page, c[0].box, { dy: 16 });
    } },
    { beat: 2, label: 'let the board breathe', run: async (page) => { await glide(page, 1200, 700); } },
    { beat: 3, label: 'open the Share panel (QR)', run: async (page) => {
      await page.evaluate(() => {
        const b = document.querySelector('button[title*="Share"]');
        if (b) b.click();
      });
      await settle(page, 900);
    } },
  ],
};

/**
 * Run a scene's steps on the beat clock, and report any step that finishes after its beat has ended.
 * That overrun warning is the script's rule ("every action must finish before the beat that describes
 * it ends") turned into something you can see in the log instead of in the finished video.
 */
async function runSteps(page, scene) {
  const steps = STEPS[scene.id];
  if (!steps) { console.log(`   (no steps defined for ${scene.id})`); return; }
  const beats = TIMING?.scenes?.[scene.id]?.beats || [];
  let overruns = 0;
  for (const step of steps) {
    const b = beats.find((x) => x.n === step.beat);
    if (b) await at(b.start);
    console.log(`   ▸ beat ${step.beat}${b ? ` @${b.start.toFixed(1)}s` : ''} — ${step.label}`);
    try {
      await step.run(page, b);
    } catch (e) {
      console.log(`   ✘ ${step.label}: ${String(e.message).slice(0, 140)}`);
      continue;
    }
    if (b) {
      const now = (Date.now() - T0) / 1000;
      if (now > b.end + 0.4) {
        overruns += 1;
        console.log(`   ⚠ beat ${step.beat} ends at ${b.end.toFixed(1)}s but the action finished at ${now.toFixed(1)}s ` +
          `(${(now - b.end).toFixed(1)}s over) — give this beat more words, or make the action shorter`);
      }
    }
  }
  if (overruns) console.log(`   ⚠ ${overruns} action(s) overran their beat`);
}


// ── record each scene ───────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const timelinePath = join(OUT, 'timeline.json');
// Re-recording a single scene (--only) must not discard the other scenes' durations: merge into
// the existing timeline, keeping the plan's scene order.
let existing = [];
try { existing = JSON.parse(readFileSync(timelinePath, 'utf8')).scenes || []; } catch { /* first run */ }
const timeline = [];
for (const scene of plan.scenes) {
  if (ONLY && scene.id !== ONLY) continue;
  const clipDir = join(OUT, 'clips', scene.id);
  rmSync(clipDir, { recursive: true, force: true });
  mkdirSync(clipDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: clipDir, size: { width, height } },
  });
  await ctx.addInitScript(FX);           // survives the navigations some scenes perform
  const ctxStart = Date.now();           // ≈ when the video starts rolling
  const page = await ctx.newPage();
  page.__mouse = { x: width / 2, y: height / 2 };
  console.log(`\n▶ ${scene.id} — ${scene.title}`);
  let leadIn = 0;
  try {
    await applyStart(page, scene.start);
    await settle(page, 900);
    // the beat clock starts here: everything before this is the app loading, which build.mjs trims.
    // Measured rather than guessed, so the trim and the offsets agree exactly.
    leadIn = (Date.now() - ctxStart) / 1000;
    T0 = Date.now();
    const fx = playFx(page, scene);      // its own schedule, concurrent with the actions below
    await runSteps(page, scene);
    await fx.catch((e) => console.log(`   ⚠ fx error: ${String(e.message).slice(0, 120)}`));
    await settle(page, 1400);            // tail so the build can breathe
  } catch (e) {
    console.log(`   ✘ action error: ${String(e.message).slice(0, 160)}`);
  }
  const video = page.video();
  await ctx.close();
  const videoPath = await video.path();
  const dest = join(OUT, 'clips', `${scene.id}.webm`);
  try { execFileSync('cp', [videoPath, dest]); } catch { /* ignore */ }
  let duration = 0;
  try {
    duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', dest], { encoding: 'utf8' }).trim());
  } catch { /* ffprobe missing */ }
  console.log(`   clip: ${dest} — ${duration.toFixed(2)}s${leadIn ? ` (${leadIn.toFixed(1)}s lead-in)` : ''}`);
  timeline.push({ ...scene, clip: dest, duration, leadIn: Number(leadIn.toFixed(3)) });
}
await browser.close();

// merge with any scenes not re-recorded in this pass
const byId = new Map(existing.map((s) => [s.id, s]));
for (const s of timeline) byId.set(s.id, s);
const merged = plan.scenes.map((s) => byId.get(s.id)).filter(Boolean);
writeFileSync(timelinePath, JSON.stringify({ video: plan.video, scenes: merged }, null, 2));
console.log(`\ntimeline: ${timelinePath} (${merged.length} scenes)`);
console.log(`total clip time: ${merged.reduce((s, x) => s + x.duration, 0).toFixed(1)}s`);
