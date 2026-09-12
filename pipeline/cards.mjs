/**
 * Render the project's cards — at minimum a title and a closing card — as PNGs in a real browser, at the
 * video's own resolution.
 *
 * The cards come from the project config (`cards: [{ id, file, html }]`), so this file holds no words of
 * its own. Rendering them in a browser is what lets the pipeline avoid ffmpeg's text support entirely:
 * guaranteed fonts, no drawtext escaping traps, and it works on a machine whose ffmpeg has no freetype.
 *
 * Usage: node pipeline/cards.mjs [--config video/demo.config.mjs] [--out DIR]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, resolveOut, arg } from './paths.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const cfg = await loadConfig(arg('config', null));
const OUT = resolveOut(arg('out', null), cfg);
const { width: W, height: H } = cfg.video;
const cards = cfg.cards || [];
if (!cards.length) {
  console.error(`✘ ${cfg.__path} defines no cards — add at least a title and a closing card`);
  process.exit(2);
}

mkdirSync(join(OUT, 'cards'), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
for (const { file, html } of cards) {
  const body = `<html><body style="margin:0;width:${W}px;height:${H}px;background:#14161a;color:#e8e8ea;
     font-family:system-ui,-apple-system,'Segoe UI',Roboto,'DejaVu Sans',sans-serif;
     display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
     ${html}</body></html>`;
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(body)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'cards', file) });
  console.log('wrote', join(OUT, 'cards', file));
}
await browser.close();
