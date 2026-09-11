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
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

// ── preflight: recordVideo needs Playwright's OWN ffmpeg build ───────────────
// Not the system ffmpeg. Playwright keeps it in its browser cache as ffmpeg-<rev>/
// — PLAYWRIGHT_BROWSERS_PATH when set, otherwise the platform default. Checking
// only the env var made this fail on a machine where ffmpeg-1011 WAS installed at
// ~/Library/Caches/ms-playwright, and told the user to run an install that would
// have pruned other engines (found + fixed 2026-09-11).
function playwrightCacheWithFfmpeg() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
    join(homedir(), '.cache', 'ms-playwright'),            // Linux/XDG
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),  // Windows
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((d) => d.startsWith('ffmpeg-'))) return dir;
    } catch { /* not this one */ }
  }
  return null;
}
{
  const cache = playwrightCacheWithFfmpeg();
  if (!cache) {
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
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const OUT = arg('out', process.env.WIKIBENTO_TUTORIAL_OUT
  || (existsSync('/opt/data/staging') ? '/opt/data/staging/wikibento-tutorial' : join(tmpdir(), 'wikibento-tutorial')));
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

// ── start states: how each scene begins, deterministically ─────────────────
async function setPickerSearch(page, term) {
  await clickHuman(page, 'button:has-text("Add Widget")');
  await settle(page, 900);
  const typed = await page.evaluate((t) => {
    const inp = document.querySelector('.add-widget-search input, input[placeholder*="Search widgets"]');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, t);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, term);
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
    if (spec === 'home-addpageviews') await addArticlePageviews(page, 'Albert Einstein');
  }
}

// ── what each scene actually does on screen ─────────────────────────────────
const ACTIONS = {
  async '01-what'(page) {
    const c = await cards(page);
    if (c[2]) await clickHuman(page, c[2].box, { dy: 16 });        // hover the Top-10 card's header
    await settle(page, 900);
    await glide(page, 1400, 300);                                   // trace across the second card
    await settle(page, 1200);
    const c2 = await cards(page);
    if (c2[0]) await clickHuman(page, c2[0].box, { dy: c2[0].box.h - 60 });  // hover the pageviews card body
    await settle(page, 1500);
  },
  async '02-read'(page) {
    const c = await cards(page);
    const header = { x: c[0].box.x, y: c[0].box.y, width: c[0].box.w, height: 34 };
    await clickHuman(page, header, { dx: 60, dy: 16 });
    await settle(page, 2000);                                       // title tooltip
    await page.evaluate(() => {
      const b = document.querySelector('.grid-item button[title="About this widget"]');
      if (b) b.click();
    });
    await settle(page, 3500);                                       // the ⓘ provenance panel
    await page.keyboard.press('Escape');
    await settle(page, 900);
    if (c[1]) {
      await clickHuman(page, c[1].box, { dx: 90, dy: 16 });          // hover the name chip
      await settle(page, 1800);
    }
  },
  async '03-reset'(page) {
    await clickHuman(page, 'button[title="Reset to defaults"]');
    await settle(page, 1500);
    // tolerate a confirmation dialog whether or not it exists yet
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const yes = btns.find((b) => /^(clear all|yes|confirm|reset)$/i.test((b.innerText || '').trim()));
      if (yes) yes.click();
    });
    await settle(page, 3500);
    const c = await cards(page);
    console.log('   reset → cards:', c.map((x) => x.title).join(' | '));
  },
  async '04-add'(page) {
    await setPickerSearch(page, 'pageviews');
    const list = await page.evaluate(() => Array.from(document.querySelectorAll('.add-widget-item'))
      .map((e) => (e.querySelector('.add-widget-name') || {}).innerText || '').slice(0, 4));
    console.log('   picker results:', JSON.stringify(list));
    await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Add Article Pageviews"]');
      if (el) el.click();
    });
    await settle(page, 1400);
    await page.keyboard.press('Escape');
    await settle(page, 4500);
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('.grid-item'));
      const gear = all[all.length - 1].querySelector('button[title="Configure"]');
      if (gear) gear.click();
    });
    await settle(page, 1600);
    // type into the article field, like a person would
    const box = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('.grid-item'));
      const cfg = all[all.length - 1].querySelector('.widget-config');
      const inputs = Array.from(cfg.querySelectorAll('input[type="text"], textarea'));
      const target = inputs.find((f) => (f.value || '').trim() === 'Main_Page') || inputs[0];
      const r = target.getBoundingClientRect();
      target.focus();
      target.select();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    await clickHuman(page, box, { dx: 40 });
    await page.keyboard.press('Control+A');
    await typeHuman(page, 'Albert Einstein', 90);
    await page.keyboard.press('Enter');
    await settle(page, 6500);                                        // the data arrives
  },
  async '05-move'(page) {
    // Proven gesture (measured at 1920x1080 on the 3-card starter board): dragging the first card's
    // header right by 10 x 30 px moves it one column (x 20 -> 335). Keep this scene on the plain
    // starter board — with an extra card added the wide bottom card refuses to shift.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await settle(page, 1200);
    const before = await cards(page);
    const idx = 0;
    const card = before[idx];
    const from = { x: card.box.x + 60, y: card.box.y + 16 };
    console.log(`   card ${idx} before: ${JSON.stringify(card.box)} | grab at ${from.x},${from.y}`);
    await glide(page, from.x, from.y);
    await settle(page, 400);
    await page.mouse.down();
    await settle(page, 250);
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from.x + i * 30, from.y + i * 16, { steps: 5 });
      await settle(page, 115);
    }
    const sawDragging = await page.evaluate(() => document.querySelectorAll('.react-draggable-dragging').length);
    await page.mouse.up();
    await settle(page, 2000);
    const moved = await cards(page);
    console.log(`   dragging-class: ${sawDragging} | after: ${JSON.stringify(moved[idx] && moved[idx].box)}`,
      `| moved: ${JSON.stringify(moved[idx] && moved[idx].box) !== JSON.stringify(card.box)}`);

    // resize that same card from its bottom-right handle (this gesture is reliable)
    const handle = await page.evaluate((i) => {
      const t = document.querySelectorAll('.grid-item')[i];
      const h = t && t.querySelector('.react-resizable-handle');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }, idx);
    if (handle) {
      const hx = handle.x + Math.round(handle.w / 2);
      const hy = handle.y + Math.round(handle.h / 2);
      await glide(page, hx, hy);
      await settle(page, 350);
      await page.mouse.down();
      await settle(page, 300);
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(hx + i * 30, hy + i * 18, { steps: 5 });
        await settle(page, 125);
      }
      await page.mouse.up();
      await settle(page, 1900);
      const resized = await cards(page);
      console.log('   resize:', JSON.stringify(moved[idx] && moved[idx].box), '→',
        JSON.stringify(resized[idx] && resized[idx].box));
    } else {
      console.log('   (no resize handle found)');
    }
  },
  async '06-export'(page) {
    const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await clickHuman(page, 'button[title="Export dashboard config as JSON"]');
    const download = await dl;
    if (!download) { console.log('   no download event'); await settle(page, 2000); return; }
    const saved = join(OUT, 'exported-dashboard.json');
    await download.saveAs(saved);
    const json = readFileSync(saved, 'utf8');
    console.log('   exported:', download.suggestedFilename(), json.length, 'bytes');
    await settle(page, 1500);
    // show what the file looks like — dark, pretty-printed, as a real page
    const pretty = JSON.stringify(JSON.parse(json), null, 2).slice(0, 2200);
    const html = `<html><body style="margin:0;background:#14161a;color:#e8e8ea;font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace"><div style="padding:18px 24px;border-bottom:1px solid #2a2f37;color:#9aa4b2">dashboard.json — the whole board: cards, settings, positions</div><pre style="padding:18px 24px;margin:0;white-space:pre-wrap">${pretty.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre></body></html>`;
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 4500);
  },
  async '07-store'(page) {
    // (a) the raw JSON of the page that backs the demo board, scrolled slowly
    for (const px of [220, 240, 280, 300, 240]) {
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px);
      await settle(page, 1500);
    }
    // (b) an explanatory card for the two rules the narration states
    const card = `<html><body style="margin:0;background:#14161a;color:#e8e8ea;font:20px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
      <div style="padding:64px 80px">
        <div style="font-size:34px;font-weight:700;margin-bottom:28px">Where the JSON should live</div>
        <div style="margin-bottom:18px"><span style="color:#8fc0ff">✓ A wiki page (easiest)</span> — read through the CORS-enabled MediaWiki API, and it keeps the wiki's history and permissions.</div>
        <div style="margin-bottom:18px"><span style="color:#8fc0ff">✓ Any host that sends</span> <code style="background:#20242b;padding:2px 8px;border-radius:4px">Access-Control-Allow-Origin</code>.</div>
        <div style="margin-top:36px;padding:20px 24px;border-left:4px solid #d9a13b;background:#1b1e23">
          <div style="color:#d9a13b;font-weight:700;margin-bottom:6px">If the browser is not allowed to read it</div>
          <div style="color:#b9c2cf">⚠ Could not load dashboard from URL: Failed to fetch — and the board falls back to the starter set.</div>
        </div>
      </div></body></html>`;
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(card)}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 11000);
    // (c) back to the page itself
    await page.goBack().catch(() => {});
    await settle(page, 5000);
  },
  async '08-reload'(page) {
    const c = await cards(page);
    if (c[0]) await clickHuman(page, c[0].box, { dy: 16 });
    await settle(page, 1500);
    await page.evaluate(() => {
      const b = document.querySelector('button[title*="Share"]');
      if (b) b.click();
    });
    await settle(page, 4000);
  },
};

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
  const page = await ctx.newPage();
  page.__mouse = { x: width / 2, y: height / 2 };
  console.log(`\n▶ ${scene.id} — ${scene.title}`);
  try {
    await applyStart(page, scene.start);
    await settle(page, 900);
    await ACTIONS[scene.id]?.(page);
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
  console.log(`   clip: ${dest} — ${duration.toFixed(2)}s`);
  timeline.push({ ...scene, clip: dest, duration });
}
await browser.close();

// merge with any scenes not re-recorded in this pass
const byId = new Map(existing.map((s) => [s.id, s]));
for (const s of timeline) byId.set(s.id, s);
const merged = plan.scenes.map((s) => byId.get(s.id)).filter(Boolean);
writeFileSync(timelinePath, JSON.stringify({ video: plan.video, scenes: merged }, null, 2));
console.log(`\ntimeline: ${timelinePath} (${merged.length} scenes)`);
console.log(`total clip time: ${merged.reduce((s, x) => s + x.duration, 0).toFixed(1)}s`);
