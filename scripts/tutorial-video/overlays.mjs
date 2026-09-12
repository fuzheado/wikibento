/**
 * Render every on-screen overlay — the step badge, the URL card, and each caption line — as a
 * TRANSPARENT FULL-CANVAS PNG in a real browser, for `build.mjs` to composite with ffmpeg's
 * `overlay` filter.
 *
 * Why not drawtext, which is what this replaced (found + fixed 2026-09-11):
 *
 *   · The Homebrew ffmpeg on the macOS dev machine has NO text filters at all — no drawtext, no
 *     subtitles, no ass, and no --enable-libfreetype — so the entire caption path failed there.
 *   · build.mjs pointed drawtext at Debian's /usr/share/fonts/truetype/dejavu/*.ttf, which does
 *     not exist on macOS. Even a freetype-enabled ffmpeg would have found no font.
 *   · Text in a filter graph needs its own escaping (':' and ',' inside textfile= paths).
 *
 * Rendering in the browser removes all three problems at once, and it is the same machinery the
 * cards already used: real fonts, real CSS, real line-breaking, no escaping, and the caption text
 * is legible at 1080p because a browser laid it out rather than a font shim.
 *
 * Each PNG is a full 1920x1080 transparent canvas, so build.mjs only ever needs `overlay=0:0` —
 * the browser owns the positioning, ffmpeg owns the timing.
 *
 * Usage: node scripts/tutorial-video/overlays.mjs [--out DIR] [--force]
 * Input:  <out>/timeline.json   (written by record.mjs)
 * Output: <out>/overlays/<scene-id>-{badge,note,cap0,cap1,...}.png
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolveOut, arg } from './paths.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolveOut(arg('out', null));
const FORCE = process.argv.includes('--force');
const DIR = join(OUT, 'overlays');
const timeline = JSON.parse(readFileSync(join(OUT, 'timeline.json'), 'utf8'));
const { width: W, height: H } = timeline.video;

// Captions come from SCRIPT.md's beats (beats.mjs), not from scenes.json's hand-kept copies — one
// caption per beat, with 📝 overriding the spoken line. Falls back to the timeline's captions for a
// scene the script does not describe.
let scriptScenes = null;
try {
  const doc = JSON.parse(readFileSync(join(OUT, 'beats.json'), 'utf8'));
  scriptScenes = new Map(doc.scenes.map((s) => [s.id, s]));
} catch { /* no beats.json — use whatever the timeline carries */ }
const captionsOf = (scene) => scriptScenes?.get(scene.id)?.captions || scene.captions || [];
/** the badge's step number and title come from SCRIPT.md too — the badge is on screen, so a copy left
 *  behind in scenes.json would show a stale title the moment the script's heading changed. */
const badgeOf = (scene) => {
  const fromScript = scriptScenes?.get(scene.id);
  return { step: fromScript?.step ?? scene.step, title: fromScript?.title ?? scene.title };
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** a translucent rounded plate around the text — the look the drawtext boxes produced */
const plate = (extra, text) =>
  `<span style="display:inline-block;background:rgba(0,0,0,.62);padding:14px 20px;border-radius:8px;${extra}">${esc(text)}</span>`;
const at = (style, text) => `<div style="position:absolute;${style}">${plate('', text)}</div>`;

const FONT = `font-family:system-ui,-apple-system,'Segoe UI',Roboto,'DejaVu Sans',sans-serif`;
const MONO = `font-family:ui-monospace,Menlo,Consolas,monospace`;
const page_ = (inner) =>
  `<html><body style="margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden;${FONT}">${inner}</body></html>`;

// positions mirror the drawtext coordinates they replace (badge x=36/y=30, note y=H-208, caption y=H-104)
const badgeHtml = (s) => { const { step, title } = badgeOf(s); return page_(at(`left:36px;top:26px;font-size:38px;font-weight:700;color:#fff`, `Step ${step} · ${title}`)); };
const noteHtml = (s) => page_(at(`left:36px;top:856px;font-size:27px;color:#8fc0ff;${MONO}`, s.note));
const capHtml = (t) =>
  page_(`<div style="position:absolute;left:0;right:0;top:958px;display:flex;justify-content:center">
           ${plate(`background:rgba(0,0,0,.68);font-size:33px;font-weight:700;color:#fff;padding:14px 22px`, t)}</div>`);

// ── plan every overlay before launching a browser ────────────────────────────
const dirSafe = (d) => { try { return readdirSync(d); } catch { return []; } };

/**
 * Overlays are cached by a hash of their markup, not by filename.
 *
 * "Skip it if the file exists" is wrong here: edit a caption in scenes.json and the PNG for that
 * caption is still on disk from the previous build, so the old words are composited over the new
 * narration — the two disagree and nothing says so. (This shipped once: a rebuilt scene 3 carried
 * the previous take's caption. Found 2026-09-11.) Same content-hash idea as narration.mjs.
 */
const MANIFEST = join(DIR, 'manifest.json');
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const hashOf = (html) => createHash('sha256').update(html).digest('hex').slice(0, 16);

/**
 * Is this a PNG with an alpha channel?
 *
 * These overlays are full-canvas and mostly empty, so the ONLY thing that makes them overlays is their
 * transparency. A screenshot without alpha is an opaque white rectangle that whites out the whole
 * scene — and because renders are cached by content hash, a bad render is cached as current and keeps
 * doing it. That happened: five of scene 3's PNGs came back rgb24 and blank, so that scene played as
 * 17 seconds of white while everything said it was fine (found 2026-09-12 by looking at the take).
 * Colour type 6 in the IHDR chunk is RGBA; 2 is RGB.
 */
const isRgbaPng = (file) => {
  try {
    const b = Buffer.alloc(26);
    const fd = openSync(file, 'r');
    try { readSync(fd, b, 0, 26, 0); } finally { closeSync(fd); }
    return b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(12) === 0x49484452 && b[25] === 6;
  } catch { return false; }
};

const jobs = [];
for (const scene of timeline.scenes) {
  jobs.push({ file: `${scene.id}-badge.png`, html: badgeHtml(scene) });
  if (scene.note) jobs.push({ file: `${scene.id}-note.png`, html: noteHtml(scene) });
  const caps = captionsOf(scene);
  caps.forEach((c, i) => jobs.push({ file: `${scene.id}-cap${i}.png`, html: capHtml(c) }));
}

// drop caption PNGs (and manifest entries) left over from a longer earlier cut, or they linger in
// <out>/overlays and can be picked up by a stale build
const planned = new Set(jobs.map((j) => j.file));
for (const scene of timeline.scenes) {
  const n = captionsOf(scene).length;
  for (const f of dirSafe(DIR)) {
    const m = f.match(new RegExp(`^${scene.id}-cap(\\d+)\\.png$`));
    if (m && Number(m[1]) >= n) { rmSync(join(DIR, f), { force: true }); delete manifest[f]; }
  }
}
for (const f of Object.keys(manifest)) if (!planned.has(f)) delete manifest[f];

for (const job of jobs) job.hash = hashOf(job.html);
// Re-render when the file is missing, when the markup changed, or when the file on disk is not a
// transparent PNG — a cached bad render must never be treated as current
const todo = FORCE ? jobs : jobs.filter((j) => {
  const f = join(DIR, j.file);
  return !existsSync(f) || manifest[j.file] !== j.hash || !isRgbaPng(f);
});
const suspect = jobs.filter((j) => existsSync(join(DIR, j.file)) && !isRgbaPng(join(DIR, j.file)));
if (suspect.length) console.log(`re-rendering ${suspect.length} overlay(s) that lost their transparency: ${suspect.map((j) => j.file).join(', ')}`);
if (!todo.length) {
  console.log(`overlays up to date (${jobs.length}) → ${DIR}`);
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
for (const job of todo) {
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(job.html)}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // make sure there is something painted and laid out before the shot: a screenshot of an unpainted
    // page is blank, and blank plus opaque is exactly what whited out scene 3
    const painted = await page.evaluate(() => {
      const el = document.querySelector('body *');
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return Math.round(r.width) + Math.round(r.height) + (document.body.innerText || '').trim().length;
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: join(DIR, job.file), omitBackground: true });
    ok = isRgbaPng(join(DIR, job.file)) && painted > 0;
    if (!ok) console.log(`   ⚠ ${job.file} came back without transparency (painted=${painted}) — retrying`);
  }
  if (!ok) {
    console.error(`✘ ${job.file}: could not render a transparent overlay — refusing to cache it. ` +
      `An opaque one whites out the whole scene.`);
    process.exit(1);
  }
  manifest[job.file] = job.hash;
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}
await browser.close();
console.log(`rendered ${todo.length}/${jobs.length} overlays → ${DIR}`);
