/**
 * Grid geometry smoke test — the safety net for silently-ignored props.
 *
 * react-grid-layout 2.x has twice silently dropped props (dragConfig,
 * gridConfig): the board renders fine but at the WRONG sizes, with no
 * error or warning. This script boots the built app and asserts the
 * MEASURED pixel geometry against the intended formulas, so any future
 * dependency drift surfaces as a red exit instead of a mystery.
 *
 * Drives the globally installed playwright-cli (the project's documented
 * browser tool — see AGENTS.md). Requires: dist/ built, network for the
 * live widget APIs, playwright-cli installed.
 *
 * Checks:
 *  1. Starter widget density: h:4 item must measure 4×80 + 3×12 = 356px
 *     (RGL's defaults — 150px rows — would measure 630px → fail).
 *  2. New Article Gallery: lands at w:12 (full container width).
 *  3. Auto-height fit: persisted h within clamp 3..14 and the rendered
 *     height matches h×80 + (h−1)×12 (rowHeight 80 + margin 12 reached
 *     the grid).
 *
 * Usage: npm run smoke
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8977;
const BASE = `http://localhost:${PORT}`;
const itemHeight = (h) => h * 80 + (h - 1) * 12;

const cli = (args) => {
  const out = execFileSync('playwright-cli', args, { encoding: 'utf8', timeout: 60000 });
  return out;
};

// Extract the JSON result from `playwright-cli eval` output (between the
// "### Result" marker and the next "###" section).
const evalJson = (expression) => {
  const out = cli(['eval', expression]);
  const m = out.match(/### Result\s*\n([\s\S]*?)(\n### |\n```|$)/);
  if (!m) throw new Error(`no Result in eval output: ${out.slice(0, 200)}`);
  return JSON.parse(m[1].trim());
};

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ missing — run npm run build first');
  process.exit(2);
}

const server = spawn('node', ['deploy/server.js'], {
  cwd: root,
  env: { ...process.env, WIKIBENTO_ROOT: join(root, 'dist'), PORT: String(PORT), WIKIBENTO_ASK_DISABLED: '1' },
  stdio: 'ignore',
});

try {
  await sleep(1200);
  cli(['open']); // headless browser session for the CLI daemon
  cli(['goto', `${BASE}/?smoke=${Date.now()}`]);
  await sleep(2000);
  // Fresh board: clear the saved layout, then reload.
  evalJson(`(function(){ localStorage.removeItem('wikibento-layout'); location.reload(); return true; })()`);
  await sleep(3500);

  // ── Check 1: starter widget density (the rowHeight-ignored detector) ──
  const starter = evalJson(`(function(){
    const el = [...document.querySelectorAll('.react-grid-item')].find((g) => g.textContent.includes('Main Page'));
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  })()`);
  check('starter widget renders at intended density (h:4 = 356px)',
    starter !== null && Math.abs(starter - 356) <= 2,
    starter === null ? 'not found' : `${starter}px`);

  // ── Add an Article Gallery through the real UI ──
  evalJson(`(function(){ [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Add Widget')).click(); return true; })()`);
  await sleep(1200);
  evalJson(`(function(){
    [...document.querySelectorAll('.add-widget-item')].find((x) => x.textContent.includes('Article Gallery')).click();
    return true;
  })()`);
  // wait for images + auto-fit settle (gallery fetch can take several seconds)
  await sleep(9000);

  const g = evalJson(`(function(){
    const el = [...document.querySelectorAll('.react-grid-item')].find((x) => x.textContent.includes('Albert Einstein'));
    const layout = JSON.parse(localStorage.getItem('wikibento-layout') || '{"layout":[]}').layout || [];
    const li = [...layout].reverse().find((x) => String(x.i).includes('gallery'));
    if (!el || !li) return null;
    const r = el.getBoundingClientRect();
    const container = document.querySelector('.react-grid-layout').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cw: Math.round(container.width), lw: li.w, lh: li.h };
  })()`);

  if (g) {
    check('new gallery lands full-width (w:12)', g.lw === 12, `layout w:${g.lw}`);
    check('gallery width fills the container', Math.abs(g.w - g.cw) <= 2, `${g.w} vs ${g.cw}px`);
    check('auto-fit height within clamp 3..14', g.lh >= 3 && g.lh <= 14, `h:${g.lh}`);
    check('rendered height matches h×80+(h−1)×12 (rowHeight reaches the grid)',
      Math.abs(g.h - itemHeight(g.lh)) <= 2, `${g.h}px vs ${itemHeight(g.lh)}px`);
  } else {
    check('new gallery found and measured', false, 'widget or layout not found');
  }
} catch (e) {
  console.error('smoke run failed:', e.message);
  failures.push('run');
} finally {
  server.kill();
}

if (failures.length) {
  console.error(`\nSMOKE FAILED (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nSMOKE PASS — grid geometry matches the intended formulas.');
process.exit(0);
