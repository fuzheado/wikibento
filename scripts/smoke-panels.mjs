#!/usr/bin/env node
/**
 * Panel reachability — audit + constitution (ISSUE-54).
 *
 * The ⚙ config panel and ⓘ info panel live inside a fixed-height grid cell
 * (`.grid-item { height:100%; overflow:hidden }`). Before the ISSUE-54 fix,
 * a panel taller than its card was guillotined at the card edge: no
 * scrollbar, no way to reach the fields below the fold, and the bottom
 * action ("Apply & Reload" / "Copy debug info") simply invisible — the
 * user had to resize the widget to finish configuring it.
 *
 * This script opens both panels on every widget of a dashboard and measures
 * whether the bottom action is inside the card's clip box, so the regression
 * is caught by a red exit instead of by a user.
 *
 * Modes:
 *   audit (default)  – print a per-widget table for one size/panel/viewport
 *   --assert         – the constitution: every widget × {⚙, ⓘ} ×
 *                      {1440, 1024, 600}px, all cards forced to w3 h3 (the
 *                      size a widget lands at when added). Exit 1 on any clip.
 *
 * Sizing: --small rewrites every layout item to w3 h3 (clamped to the item's
 * own minW/minH). That is the stress case — a freshly added widget — and the
 * size the pre-fix audit failed 21/35 at.
 *
 * Usage:
 *   node scripts/smoke-panels.mjs                          # audit (needs dist/ or --base)
 *   node scripts/smoke-panels.mjs --base http://localhost:5173   # audit the dev server
 *   node scripts/smoke-panels.mjs --panel info --small
 *   node scripts/smoke-panels.mjs --assert                 # npm run smoke:panels
 *   node scripts/smoke-panels.mjs --config public/params-demo.json --small
 *   node scripts/smoke-panels.mjs --json > audit.json
 *   node scripts/smoke-panels.mjs --fix css                # prove a candidate fix
 *   node scripts/smoke-panels.mjs --assert --engine firefox # cross-engine spot check
 */
import { chromium, firefox, webkit } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (n) => args.includes(n);
const getArg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};
const BASE = getArg('--base', '');
const URL_ = getArg('--url', '');
const CONFIG_FILE = getArg('--config', '');
const SMALL = has('--small');
const AS_JSON = has('--json');
const ASSERT = has('--assert');
const FIX = has('--fix') ? getArg('--fix', 'css') : null;
const ROW_PITCH = 92; // h×80 + (h−1)×12, per scripts/smoke-grid.mjs
const PORT = 8978;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// In --assert mode the matrix is fixed and requests to Wikimedia are blocked,
// so the run is deterministic and offline (auto-height can't grow a card to
// mask a too-tall panel, and nothing waits on the network).
const ASSERT_WIDTHS = [1440, 1024, 600];
const ASSERT_PANELS = ['config', 'info'];
const OFFLINE = has('--offline') || ASSERT;
const ENGINE = getArg('--engine', 'chromium');
const width = parseInt(getArg('--width', '1440'), 10);
const height = parseInt(getArg('--height', '900'), 10);
const PANEL = getArg('--panel', 'config');

let server = null;
let base = BASE;
if (!base) {
  if (!existsSync(join(root, 'dist/index.html'))) {
    console.error('dist/ missing — run npm run build first, or pass --base <dev server>');
    process.exit(2);
  }
  server = spawn('node', ['deploy/server.js'], {
    cwd: root,
    env: { ...process.env, WIKIBENTO_ROOT: join(root, 'dist'), PORT: String(PORT), WIKIBENTO_ASK_DISABLED: '1' },
    stdio: 'ignore',
  });
  await sleep(1200);
  base = `http://localhost:${PORT}`;
}

// ── Resolve the dashboard config (file, ?config= target, or /dashboard.json) ──
let config;
let configSource;
if (CONFIG_FILE) {
  config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  configSource = CONFIG_FILE;
} else {
  const target = URL_.includes('config=') ? new URL(URL_).searchParams.get('config') : '/dashboard.json';
  const cfgUrl = target.startsWith('http') ? target : base + target;
  config = await (await fetch(cfgUrl)).json();
  configSource = target;
}
let url = URL_ || `${base}/?config=/dashboard.json`;
if (SMALL || ASSERT) {
  config.layout = (config.layout || []).map((l) => ({
    ...l,
    w: clamp(3, l.minW ?? 2, l.maxW ?? 12),
    h: clamp(3, l.minH ?? 2, l.maxH ?? 99),
  }));
  const b64 = Buffer.from(JSON.stringify(config), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  url = `${base}/#/d/${b64}`;
}

const browser = await ({
  chromium, firefox, webkit,
}[ENGINE] || (() => { console.error(`unknown --engine ${ENGINE} (chromium | firefox | webkit)`); process.exit(2); })()).launch();

/** Open one panel on every widget and measure reachability. */
async function runOnce({ width: w, height: h, panel, fix, offline }) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  if (offline) {
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') route.continue();
      else route.abort();
    });
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.widget-frame', { timeout: 20000 });
  await page.waitForTimeout(offline ? 700 : 2500);

  const glyph = panel === 'info' ? 'ⓘ' : '⚙';
  const sel = panel === 'info' ? '.widget-info' : '.widget-config';

  if (fix === 'css') {
    await page.addStyleTag({ content: `
      .widget-config, .widget-info { flex-shrink: 1; min-height: 0; overflow-y: auto; }
      .widget-config > .widget-btn-apply,
      .widget-info > .widget-info-actions {
        position: sticky; bottom: 0; z-index: 1;
        background-color: var(--surface);
        background-image: linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.15));
        border-top: 1px solid var(--border);
        padding-top: 6px; margin-top: 6px;
      }
    ` });
  }

  const count = await page.locator('.widget-frame').count();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const frame = page.locator('.grid-item').nth(i);
    const meta = await frame.evaluate((el) => {
      const t = el.querySelector('.widget-title');
      const chip = el.querySelector('.widget-id-chip');
      return { full: t ? t.textContent.trim() : '', id: chip ? chip.textContent.trim() : '' };
    });
    await frame.evaluate((el, g) => {
      for (const b of el.querySelectorAll('.widget-header .widget-btn')) if (b.textContent.trim() === g) { b.click(); return; }
    }, glyph);
    await page.waitForTimeout(100);
    const m = await frame.evaluate((el, s) => {
      const cfg = el.querySelector(s);
      if (!cfg) return { error: 'no panel' };
      const action = cfg.querySelector('.widget-btn-apply');
      if (!action) return { error: 'no action button' };
      const box = el.getBoundingClientRect();
      const cb = cfg.getBoundingClientRect();
      const ab = action.getBoundingClientRect();
      return {
        frameH: Math.round(box.height),
        panelH: Math.round(cb.height),
        panelScrolls: cfg.scrollHeight > cfg.clientHeight + 1,
        panelClipPx: Math.round(cb.bottom - box.bottom),
        actionClipPx: Math.round(ab.bottom - box.bottom),
        actionReachable: ab.bottom <= box.bottom + 0.5,
      };
    }, sel);
    rows.push({ id: meta.id, title: meta.full.slice(0, 42), ...m });
    await frame.evaluate((el, g) => {
      for (const b of el.querySelectorAll('.widget-header .widget-btn')) if (b.textContent.trim() === g) { b.click(); return; }
    }, glyph);
    await page.waitForTimeout(40);
  }
  await page.close();
  return rows;
}

// ── Constitution mode ─────────────────────────────────────────────────────
if (ASSERT) {
  const failures = [];
  let total = 0;
  console.log(`\nPanel reachability constitution — ${configSource} [cards forced to w3 h3, offline]\n`);
  for (const w of ASSERT_WIDTHS) {
    for (const panel of ASSERT_PANELS) {
      const rows = await runOnce({ width: w, height: 900, panel, offline: true });
      const bad = rows.filter((r) => r.error || r.actionReachable === false);
      total += rows.length;
      const label = `${panel === 'info' ? 'ⓘ' : '⚙'} @ ${String(w).padStart(4)}px`;
      if (bad.length) {
        failures.push(`${label}: ${bad.length}/${rows.length}`);
        console.log(`✖ ${label} — ${bad.length}/${rows.length} clipped: ${bad.slice(0, 6).map((r) => r.id || r.title || r.error).join(', ')}${bad.length > 6 ? ', …' : ''}`);
      } else {
        console.log(`✔ ${label} — ${rows.length}/${rows.length} widgets reachable`);
      }
    }
  }
  await browser.close();
  server?.kill();
  if (failures.length) {
    console.error(`\nPANEL SMOKE FAILED — ${failures.join(' · ')}`);
    console.error('A panel is taller than its card and its bottom action is clipped (ISSUE-54).');
    process.exit(1);
  }
  console.log(`\nPANEL SMOKE PASS — ${total} panel measurements, every action reachable.`);
  process.exit(0);
}

// ── Audit mode ────────────────────────────────────────────────────────────
const rows = await runOnce({ width, height, panel: PANEL, fix: FIX, offline: OFFLINE });
await browser.close();
server?.kill();

if (AS_JSON) {
  console.log(JSON.stringify({ url, configSource, small: SMALL, fix: FIX, panel: PANEL, viewport: { width, height }, rows }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const bad = rows.filter((r) => r.error || r.actionReachable === false);
console.log(`\n${PANEL === 'info' ? 'ⓘ info' : '⚙ config'}-panel reachability — ${configSource}${SMALL ? '  [all items forced to w3 h3]' : ''}${FIX ? `  [--fix ${FIX} injected]` : ''}`);
console.log(`viewport ${width}×${height} · ${rows.length} widgets · row pitch ${ROW_PITCH}px\n`);
console.log(pad('id', 18) + padL('frameH', 7) + padL('panelH', 7) + padL('scrolls', 8) + padL('clip', 6) + padL('actionClip', 11) + '  verdict');
console.log('-'.repeat(92));
for (const r of rows) {
  const label = PANEL === 'info' ? 'Copy' : 'Apply';
  const v = r.error ? r.error : r.actionReachable ? 'ok' : `CLIPPED — ${label} unreachable`;
  console.log(
    pad(r.id || r.title, 18) +
    padL(r.frameH ?? '?', 7) + padL(r.panelH ?? '?', 7) +
    padL(r.panelScrolls === undefined ? '?' : r.panelScrolls ? 'yes' : 'no', 8) +
    padL(r.panelClipPx ?? '?', 6) + padL(r.actionClipPx ?? '?', 11) + '  ' + v
  );
}
console.log('-'.repeat(92));
console.log(`${bad.length}/${rows.length} widgets clip the panel's bottom action at this size/viewport.`);
if (bad.length) {
  const worst = [...bad].filter((r) => !r.error).sort((a, b) => b.actionClipPx - a.actionClipPx)[0];
  if (worst) console.log(`Worst: ${worst.id} — action is ${worst.actionClipPx}px below the card.`);
}
