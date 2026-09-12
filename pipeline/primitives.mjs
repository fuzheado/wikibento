/**
 * Primitives shared by the engine and by an app's actions module: human-ish mouse and keyboard input, a
 * selector-box helper, a data: URL builder, and the beat clock.
 *
 * They live in their own module so an app module can `import` them without importing the recorder — which
 * imports the app module, and a cycle between the two would be a trap for whoever reads it next.
 *
 * The beat clock is module state on purpose: `record.mjs` starts it when a scene's actions begin, and the
 * app's step functions call `at(seconds)` to wait for the voiceover to reach a beat. One clock per run, set
 * through `setClock()`.
 */
import { tmpdir } from 'node:os';

export const settle = (page, ms) => page.waitForTimeout(ms);

/** move the pointer to a point the way a hand would, rather than teleporting it */
export async function glide(page, x, y, steps = 22) {
  const from = page.__mouse || { x: 0, y: 0 };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;   // ease in-out
    await page.mouse.move(from.x + (x - from.x) * ease, from.y + (y - from.y) * ease);
    await page.waitForTimeout(8);
  }
  page.__mouse = { x, y };
}

/**
 * Click a selector, or a box, with a small human wobble.
 *
 * Selectors go through Playwright's locator first, so engine-specific syntax works (`:has-text("Add
 * Widget")`, `text=…`) as well as CSS — a project's actions are allowed to use either, and going straight to
 * `document.querySelector` silently broke a scene that clicked a button by its text. The raw mouse is still
 * what does the clicking: a synthetic `.click()` would not move the pointer, and the pointer is part of the
 * demo.
 */
export async function clickHuman(page, selectorOrBox, opts = {}) {
  const { dx = 0, dy = 0 } = opts;
  let box = selectorOrBox;
  if (typeof selectorOrBox === 'string') {
    try {
      const b = await page.locator(selectorOrBox).first().boundingBox({ timeout: 5000 });
      if (b) box = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    } catch { /* not a Playwright selector, or not there yet — try CSS below */ }
    if (!box || typeof box === 'string') box = await fxBox(page, selectorOrBox);
    if (!box) throw new Error(`clickHuman: no element for ${selectorOrBox}`);
  }
  const x = Math.round((box.x ?? 0) + (box.width ?? box.w ?? 0) / 2 + dx);
  const y = Math.round((box.y ?? 0) + (box.height ?? box.h ?? 0) / 2 + dy);
  if (![x, y].every(Number.isFinite)) throw new Error(`clickHuman: bad target ${JSON.stringify(selectorOrBox)}`);
  await glide(page, x, y);
  await settle(page, 120);
  await page.mouse.down();
  await settle(page, 90);
  await page.mouse.up();
  page.__mouse = { x, y };
  return { x, y };
}

/** type like a person: character by character, with a delay */
export async function typeHuman(page, text, delay = 85) {
  await page.keyboard.type(text, { delay });
}

/**
 * The on-screen box of a selector, or null if it never appears.
 *
 * Retries, because fx is scheduled on the beat clock and some targets only exist moments later (a scene
 * that navigates during the same beat that highlights something) — failing immediately would silently drop
 * a marker.
 */
export async function fxBox(page, selector, { tries = 10, delayMs = 250 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const box = await page.evaluate((sel) => {
      let el = null;
      try { el = document.querySelector(sel); } catch { return null; }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    }, selector);
    if (box) return box;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/** move the pointer onto an element (so hover states actually fire) */
export async function hoverSelector(page, selector) {
  const box = await fxBox(page, selector);
  if (!box) return false;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

/** a data: URL for a locally built page (the recorder shows a few of these) */
export const dataUrl = (html) => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
export const escHtml = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/**
 * Bring a selector into view before anything is drawn on it, and wait for the scroll to settle.
 *
 * A highlight is only a highlight if the viewer can see the thing — and a board, a document or a long page is
 * routinely taller than the viewport, so the widget being named can be below the fold. (This was a real note
 * on the finished take: the narration said "a gallery of images" while the gallery was off screen.) Drawing a
 * ring at coordinates read before a scroll also lands it in the wrong place, so the order is always
 * reveal → settle → measure → draw.
 */
export async function revealSelector(page, selector, { block = 'center', margin = 60, settleMs = 650 } = {}) {
  const moved = await page.evaluate(([sel, blk, m]) => {
    let el = null;
    try { el = document.querySelector(sel); } catch { return false; }
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight, vw = window.innerWidth;
    const off = r.bottom > vh - m || r.top < m || r.right > vw - 40 || r.left < 40;
    if (!off) return false;
    el.scrollIntoView({ block: blk, inline: 'nearest', behavior: 'smooth' });
    return true;
  }, [selector, block, margin]);
  if (moved) await settle(page, settleMs);
  return moved;
}

// ── the beat clock ──────────────────────────────────────────────────────────
let T0 = Date.now();

/** start the clock: called once per scene, when its actions begin */
export const setClock = (ms) => { T0 = ms; };

/** wait until the beat clock reaches `seconds` (never goes backwards) */
export const at = async (seconds) => {
  const waitMs = seconds * 1000 - (Date.now() - T0);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
};

/** when the i-th of n sub-actions inside beat b should happen */
export const spread = (b, i, n) => (b ? b.start + ((b.end - b.start) * i) / n : 0);

/** how far the clock has run, in seconds */
export const elapsed = () => (Date.now() - T0) / 1000;

export { tmpdir };
