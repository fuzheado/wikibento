/**
 * WikiBento's tutorial: what happens on screen, and where each scene starts.
 *
 * This is the app-specific half of the video pipeline. The engine in ../pipeline/ knows about beats,
 * voiceover, overlays, encoding and review bundles; it knows nothing about WikiBento — no URLs, no
 * selectors, no widget names. Everything that would have to change for another app lives here, and the
 * engine reaches it through `video/demo.config.mjs`.
 *
 * Primitives (mouse, typing, the beat clock) come from ../pipeline/primitives.mjs, so both halves share one
 * implementation.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  settle, glide, clickHuman, typeHuman, fxBox, dataUrl, escHtml, at, spread,
} from '../pipeline/primitives.mjs';

/** set by the engine before any scene runs, so this module knows where to write and what to drive */
export const context = { out: null, base: null, config: null };
export function configure(ctx) { Object.assign(context, ctx); }

const cards = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.grid-item')).map((t) => {
  const title = t.querySelector('.widget-title');
  const r = t.getBoundingClientRect();
  return {
    title: title ? title.innerText.replace(/\s+/g, ' ').trim().slice(0, 48) : null,
    value: (t.querySelector('.stat-value') || {}).innerText || null,
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
  };
}));

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

let PRE_APPLY_VALUE = null;

/** move the pointer onto a widget named by its id — the same names the script's markers use */
async function hoverWidget(page, id) {
  const box = await fxBox(page, `[data-widget-id="${id}"]`);
  if (!box) { console.log(`   ⚠ no widget "${id}" on this board`); return false; }
  await glide(page, box.x + Math.round(box.width / 2), box.y + 24);
  return true;
}

/** remove the widget at an index via its ✕ on the top bar */
async function removeWidget(page, index = 0) {
  const clicked = await page.evaluate((i) => {
    const card = document.querySelectorAll('.grid-item')[i];
    const b = card && card.querySelector('button[title="Remove"]');
    if (b) { b.click(); return true; }
    return false;
  }, index);
  await settle(page, clicked ? 700 : 200);
  return clicked;
}

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
export async function startState(page, spec) {
  if (spec.startsWith('config:')) {
    await page.goto(`${context.base}/?config=${encodeURIComponent(spec.slice(7))}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 9000);
  } else if (spec.startsWith('wikiPage:')) {
    await page.goto(`${spec.slice(9)}?action=raw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 4000);
  } else {
    await page.goto(`${context.base}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 7000);
    if (spec === 'home-addpageviews') await addArticlePageviews(page, 'Marie Curie');
  }
}

export const steps = {
  '01-what': [
    // The rings and the zoom come from the script's markers; these steps just move the pointer to what is
    // being named, so the scene reads as someone showing you around rather than a slideshow.
    { beat: 1, label: 'drift across the board', run: async (page) => { await glide(page, 1500, 320); } },
    { beat: 2, label: 'the chart, the table, the gallery', run: async (page, b) => {
      for (const [i, id] of ['views', 'assessments', 'images'].entries()) {
        await at(spread(b, i, 3));
        await hoverWidget(page, id);
      }
    } },
    { beat: 3, label: 'the article, its quality, its history', run: async (page, b) => {
      for (const [i, id] of ['excerpt', 'quality', 'edits'].entries()) {
        await at(spread(b, i, 3));
        await hoverWidget(page, id);
      }
    } },
    { beat: 4, label: 'the card that sets the subject', run: async (page) => {
      await hoverWidget(page, 'pick');
    } },
    { beat: 5, label: 'pointer away', run: async (page) => { await glide(page, 1500, 950); } },
  ],

  '02-read': [
    { beat: 1, label: 'rest on the first card top bar', run: async (page) => {
      // show the URL the board was loaded from, so "the entire configuration is in the link" is
      // something the viewer can see (the browser's own address bar is not recorded)
      await page.evaluate(() => window.__fx?.urlChip(location.href));
      await settle(page, 300);
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
    { beat: 1, label: 'remove the first widget with its ✕', run: async (page) => {
      const before = await cards(page);
      await removeWidget(page, 0);
      const after = await cards(page);
      console.log(`   removed "${before[0]?.title || '?'}" → ${after.length} widget(s) left`);
    } },
    { beat: 2, label: 'remove the rest — a clean slate', run: async (page) => {
      // always index 0: the grid re-flows after each removal, so "the last one" would move
      let guard = 8;
      while ((await cards(page)).length && guard--) await removeWidget(page, 0);
      console.log(`   board cleared → ${(await cards(page)).length} widget(s)`);
      await settle(page, 500);
    } },
    { beat: 3, label: 'click + Add Widget', run: async (page) => { await openPicker(page); } },
    { beat: 4, label: 'scroll the categories', run: async (page, b) => {
      for (const [i, px] of [180, 180, 180].entries()) {
        await at(spread(b, i, 3));
        await page.evaluate((y) => { const p = document.querySelector('.add-widget-panel'); if (p) p.scrollBy({ top: y, behavior: 'smooth' }); }, px);
      }
    } },
    { beat: 5, label: 'search for pageviews and add Article Pageviews', run: async (page) => {
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
    { beat: 6, label: 'the widget appears; close the picker', run: async (page) => {
      await page.keyboard.press('Escape');
      await settle(page, 700);
    } },
    { beat: 7, label: 'open its gear, set the subject, and apply it', run: async (page, b) => {
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('.grid-item'));
        const gear = all[all.length - 1].querySelector('button[title="Configure"]');
        if (gear) gear.click();
      });
      await settle(page, 900);
      // Three earlier versions of this failed, all silently: a click at a computed offset that landed
      // outside the input (keystrokes lost), elementHandle.click() (times out — the field sits in a
      // clipped panel), and setting the field without committing it. The narration promises "watch it
      // fetch real data for that article", so the value must be set AND committed, and the fetch waited
      // for (beat 8) — the first take set the field, moved on, and left Main Page's figure on screen.
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
      // remember what the widget shows BEFORE the subject is applied: beat 8 has to prove the figure
      // changed, and reading the baseline after applying proves nothing (the first attempt did that and
      // reported "the fetch did not land" while the value had in fact already changed to Marie Curie's).
      PRE_APPLY_VALUE = await page.evaluate(() => {
        const all = [...document.querySelectorAll('.grid-item')];
        const l = all[all.length - 1];
        return ((l && l.querySelector('.stat-value')) || {}).innerText || null;
      });
      console.log(`   before applying: "${(PRE_APPLY_VALUE || '?').trim()}"`);
      let typed = false;
      if (spot) {
        await clickHuman(page, { x: spot.x, y: spot.y });
        typed = await page.evaluate(() => {
          const a = document.activeElement;
          return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
        });
      }
      if (typed) {
        const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';   // Control+A is not select-all on macOS
        await page.keyboard.press(`${MOD}+A`);
        await typeHuman(page, 'Marie Curie', 90);
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
      }
      console.log(`   subject set (${typed ? 'typed' : 'set directly'})`);
      // Apply at the END of the beat, and do not press Enter: the field is in a form, so Enter submits
      // it and the panel closes — which took the project-selector ring's target away mid-beat.
      await at(Math.max((Date.now() - T0) / 1000 + 1.5, b ? b.end - 0.8 : 0));
      const applied = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.widget-config button, .add-widget-panel button')];
        const b = btns.find((x) => /apply\s*&?\s*reload/i.test(x.innerText || ''));
        if (b) { b.click(); return b.innerText.trim(); }
        return null;
      });
      console.log(applied ? `   clicked "${applied}"` : '   ⚠ no Apply & Reload button found — Enter only');
    } },
    { beat: 8, label: 'WAIT for the figure to actually change', run: async (page, b) => {
      const read = async () => {
        const c = await cards(page);
        const last = c[c.length - 1] || {};
        return { title: (last.title || '').trim(), value: (last.value || '').trim() };
      };
      const before = (PRE_APPLY_VALUE || '').trim();
      // give the fetch the beat it was written for, plus a few seconds — but do not stretch the take
      // for a fetch that is not coming
      const budget = Math.min(20, Math.max(6, (b ? b.duration : 4) + 4));
      const started = Date.now();
      let now = await read();
      for (let i = 0; i < Math.ceil((budget * 1000) / 400); i += 1) {
        await settle(page, 400);
        now = await read();
        if (before && now.value && now.value !== before) break;
      }
      const waited = ((Date.now() - started) / 1000).toFixed(1);
      if (before && now.value && now.value !== before) {
        console.log(`   figure changed after ${waited}s: "${before}" → "${now.value}" (${now.title})`);
        if (!/marie curie/i.test(now.title)) console.log(`   ⚠ the widget is titled "${now.title}" — expected Marie Curie`);
      } else {
        console.log(`   ⚠ still "${now.value}" after ${waited}s (was "${before}") — the fetch did not land`);
      }
    } },
    { beat: 9, label: 'close the panel', run: async (page) => {
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
      const b0 = card.box, b1 = (after[0] || {}).box || {};
      // Compare x/y, not the whole box: the first version compared JSON and passed on a 1px width
      // rounding while the widget had not moved at all — so the take shipped a "move" that never moved,
      // and only a human watching it noticed.
      const movedX = Math.abs((b1.x ?? b0.x) - b0.x) >= 20;
      const movedY = Math.abs((b1.y ?? b0.y) - b0.y) >= 20;
      console.log(`   after ${JSON.stringify(b1)} | moved: ${movedX || movedY}` +
        ` (dx ${(b1.x ?? b0.x) - b0.x}, dy ${(b1.y ?? b0.y) - b0.y})`);
      if (!movedX && !movedY) {
        console.log('   ⚠ the widget did NOT move — the drag did not take (check for fx running during the gesture)');
      }
      if (!dragging) console.log('   ⚠ react-draggable never reported a drag (no .react-draggable-dragging)');
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
      // the wait is short: it used to hold 20s, which made this take four times longer than its
      // narration, and 4s still overran beat 1 (0-2.9s) in the recorder's own overrun report.
      const dl = page.waitForEvent('download', { timeout: 1500 }).catch(() => null);
      await clickHuman(page, 'button[title="Export dashboard config as JSON"]');
      const download = await dl;
      if (download) {
        const saved = join(context.out, 'exported-dashboard.json');
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
      try { json = readFileSync(join(context.out, 'exported-dashboard.json'), 'utf8'); } catch { /* fall back */ }
      if (!json) {
        json = await page.evaluate(() => localStorage.getItem('wikibento-layout'));
        console.log('   rendering the board JSON from localStorage (nothing to download)');
      }
      const pretty = JSON.stringify(JSON.parse(json), null, 2).slice(0, 2200);
      // The header and the text are wrapped in .json-doc, which is what the script's zoom targets: a
      // zoom on the <pre> alone would be a zoom on something taller than the viewport. white-space:
      // pre-wrap plus overflow-wrap keeps long values from running off the right edge, so the file reads
      // from its top-left corner like a file should.
      await page.goto(dataUrl(`<html><body style="margin:0;background:#14161a;color:#e8e8ea;font:16px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace"><div class="json-doc" style="padding:0"><div class="json-head" style="padding:18px 24px;border-bottom:1px solid #2a2f37;color:#9aa4b2">dashboard.json — the whole board: widgets, settings, positions, params</div><pre style="padding:18px 24px;margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${escHtml(pretty)}</pre></div></body></html>`), { waitUntil: 'domcontentloaded' });
      console.log(`   showed ${pretty.length} chars of JSON`);
    } },
    { beat: 3, label: 'scroll the JSON a little', run: async (page) => {
      // gently, and not far: the header and the first widget should stay on screen so the file still reads
      // as a file rather than as an anonymous wall of text
      await page.evaluate(() => window.scrollBy({ top: 150, behavior: 'smooth' }));
    } },
  ],

  '07-store': [
    { beat: 1, label: 'the raw JSON file on screen', run: async (page) => {
      // the scene starts ON the file (start: wikiPage:...), so this is just the pointer and a beat of
      // stillness: the narration is explaining what the thing on screen is
      await glide(page, 900, 140);
      await settle(page, 400);
    } },
    { beat: 2, label: 'scroll the file slowly', run: async (page, b) => {
      const steps = [220, 240, 280, 300, 240];
      for (const [i, px] of steps.entries()) {
        await at(spread(b, i, steps.length));
        await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px);
      }
    } },
  ],

  '08-reload': [
    { beat: 1, label: 'the board, with the URL in view', run: async (page) => {
      await page.evaluate(() => window.__fx?.urlChip(location.href));   // the callback to scene 2
      await settle(page, 300);
      const c = await cards(page);
      if (c[0]) await clickHuman(page, c[0].box, { dy: 16 });
    } },
    { beat: 2, label: 'open the Share panel (the QR)', run: async (page) => {
      await page.evaluate(() => {
        const b = document.querySelector('button[title*="Share"]');
        if (b) b.click();
      });
      await settle(page, 900);
      const qr = await fxBox(page, '.share-qr-card svg', { tries: 6, delayMs: 200 });
      console.log(qr ? '   share panel open, QR present' : '   ⚠ share panel opened but no QR found');
      await settle(page, 500);
    } },
  ],

};

