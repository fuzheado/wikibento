/**
 * Record a project's tutorial: one video clip per scene, driven by real browser interaction.
 *
 * Per-scene recording (rather than one long take) means a step can be re-recorded on its own, and
 * the narration can be aligned exactly: each clip is padded to the length of its voiceover at
 * build time.
 *
 * Usage:  node pipeline/record.mjs [--config video/demo.config.mjs] [--only 03-reset] [--out DIR]
 * Env:    PLAYWRIGHT_BROWSERS_PATH (scoped to the command — never exported globally)
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveOut, arg, loadConfig, cfgPath, playwrightCacheWithFfmpeg } from './paths.mjs';
import { settle, glide, clickHuman, typeHuman, fxBox, dataUrl, escHtml, setClock, at, spread, elapsed,
  revealSelector } from './primitives.mjs';

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

const cfg = await loadConfig(arg('config', null));
const plan = JSON.parse(readFileSync(cfgPath(cfg, cfg.plan), 'utf8'));
const OUT = resolveOut(arg('out', null), cfg);
const ONLY = arg('only', null);
const app = cfg.actions;                                  // the project's startState + steps
if (!app || typeof app.startState !== 'function' || !app.steps) {
  console.error(`✘ ${cfg.__path}.actions must export { startState, steps } — see pipeline/README.md`);
  process.exit(2);
}
if (typeof app.configure === 'function') app.configure({ out: OUT, base: cfg.base, config: cfg });
const { width, height } = cfg.video;

mkdirSync(join(OUT, 'clips'), { recursive: true });
console.log(`  clips → ${OUT}`);

/** the four buttons in a card's top bar, left to right (the ⓘ ⚙ ↻ ✕ the script names) */

/** move the real pointer onto an element (so hover states actually fire) */

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
    const shift = (min, max, size, margin) => {
      const a = margin - min, b = size - margin - max;   // the allowed range for the translation
      // Target bigger than the viewport (a document, a long list): anchor its TOP-LEFT. Centring it
      // instead shows the middle with the left edge clipped — which is what a zoom on a JSON file's
      // <pre> did: the viewer saw line endings and no beginnings. Text starts at the top left, so that
      // is what must stay on screen.
      if (a > b) return a;
      return Math.min(Math.max(0, a), b);
    };
    const minX = cx + (rect.x - cx) * factor, maxX = cx + (rect.x + rect.width - cx) * factor;
    const minY = cy + (rect.y - cy) * factor, maxY = cy + (rect.y + rect.height - cy) * factor;
    const tx = shift(minX, maxX, window.innerWidth, 24);
    const ty = shift(minY, maxY, window.innerHeight, 24);
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
  // A pill showing the URL the board was loaded from, with the ?config= part wrapped in
  // .fx-url-config so a marker can ring exactly that. The recorder draws it because a browser's own
  // address bar is NOT part of a Playwright recording — the frame is the page viewport only, so two
  // of the script's markers ("ring the ?config= part", in scenes 2 and 8) had no target at all until
  // this existed. It also happens to be the point of both scenes: the URL is the board.
  urlChip(url) {
    document.querySelectorAll('.fx-url').forEach((n) => n.remove());
    const wrap = document.createElement('div');
    wrap.className = 'fx-url';
    wrap.style.cssText = 'position:fixed;left:24px;top:18px;z-index:2147483646;display:flex;' +
      'align-items:center;gap:10px;background:#1b1e23;border:1px solid #2a2f37;border-radius:999px;' +
      'padding:10px 18px;font:500 22px/1 ui-monospace,Menlo,Consolas,monospace;color:#b9c2cf;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.45)';
    const lock = document.createElement('span');
    lock.textContent = '🔒';
    lock.style.cssText = 'font-size:17px;opacity:.65';
    const text = document.createElement('span');
    // Show the address DECODED — ?config=https://w.wiki/TR9R rather than %3A%2F%2F — because the escaping
    // is what makes the link work, not what makes it readable. Parsed with URL() rather than matched with
    // a regex, which also steps around a template-literal trap: a single backslash before ? is swallowed
    // when this string is injected, and an invalid regex here silently killed EVERY fx marker in a take
    // (the calls use optional chaining), so the recorder now checks that the fx layer installed.
    let head = String(url), cfgText = null;
    try {
      const u = new URL(url);
      const cfg = u.searchParams.get('config');
      if (cfg) { head = u.origin + u.pathname; cfgText = '?config=' + decodeURIComponent(cfg); }
    } catch { /* not a URL we can parse — show it as it came */ }
    text.textContent = head;
    if (cfgText) {
      const cfg = document.createElement('span');
      cfg.className = 'fx-url-config';
      cfg.textContent = cfgText;
      cfg.style.cssText = 'color:#8fc0ff;background:rgba(143,192,255,.12);border-radius:6px;' +
        'padding:3px 8px;margin-left:2px';
      text.appendChild(cfg);
    }
    wrap.append(lock, text);
    document.body.appendChild(wrap);
  },
  hideUrlChip() { document.querySelectorAll('.fx-url').forEach((n) => n.remove()); },
};
'ok';
`;
let TIMING = null;
try { TIMING = JSON.parse(readFileSync(join(OUT, 'narration', 'timing.json'), 'utf8')); }
catch { /* not narrated yet — fx and beat timing are simply unavailable */ }
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
      await revealSelector(page, z.selector);          // a zoom on something off screen zooms nothing
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
      await revealSelector(page, r.selector);          // scroll first: a ring drawn pre-scroll lands wrong
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
// ── run the project's steps on the beat clock ───────────────────────────────
// A project's steps (in its actions module) each name the beat whose words describe them. The runner
// waits for that beat, runs the step, and reports one that finishes after its beat has ended — the
// script's rule ("every action must finish before the beat that describes it ends") as a log line
// instead of something to spot in the finished video.

/**
 * Run a scene's steps on the beat clock, and report any step that finishes after its beat has ended.
 * That overrun warning is the script's rule ("every action must finish before the beat that describes
 * it ends") turned into something you can see in the log instead of in the finished video.
 */
async function runSteps(page, scene) {
  const steps = app.steps[scene.id];
  if (!steps) { console.log(`   (no steps defined for ${scene.id})`); return; }
  const beats = TIMING?.scenes?.[scene.id]?.beats || [];
  let overruns = 0, failures = 0;
  for (const step of steps) {
    const b = beats.find((x) => x.n === step.beat);
    if (b) await at(b.start);
    console.log(`   ▸ beat ${step.beat}${b ? ` @${b.start.toFixed(1)}s` : ''} — ${step.label}`);
    try {
      await step.run(page, b);
    } catch (e) {
      // loud, and counted: a step that throws means the take does not show what the script claims, and a
      // stale identifier in an app module once failed every step of a scene while the log scrolled past
      failures += 1;
      console.log(`   ✘ STEP FAILED — ${step.label}: ${String(e.message).slice(0, 140)}`);
      continue;
    }
    if (b) {
      const now = elapsed();
      if (now > b.end + 0.4) {
        overruns += 1;
        console.log(`   ⚠ beat ${step.beat} ends at ${b.end.toFixed(1)}s but the action finished at ${now.toFixed(1)}s ` +
          `(${(now - b.end).toFixed(1)}s over) — give this beat more words, or make the action shorter`);
      }
    }
  }
  if (overruns) console.log(`   ⚠ ${overruns} action(s) overran their beat`);
  if (failures) console.log(`   ✘ ${failures} step(s) FAILED in ${scene.id} — this take does not show what the script says`);
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
    await app.startState(page, scene.start);
    await settle(page, 900);
    // the beat clock starts here: everything before this is the app loading, which build.mjs trims.
    // Measured rather than guessed, so the trim and the offsets agree exactly.
    leadIn = (Date.now() - ctxStart) / 1000;
    setClock(Date.now());
    // The fx calls use optional chaining, so a broken fx layer is silent — and a single bad escape in
    // the injected script once disabled every marker in a whole take (found 2026-09-11). Say so.
    if (!(await page.evaluate(() => typeof window.__fx === 'object'))) {
      console.log('   ⚠ fx layer did not install in the page — zoom and ring markers will be skipped');
    }
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
