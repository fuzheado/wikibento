/**
 * The Map card in a real browser — its two rough edges from ISSUE-131, and the relay behind both.
 *
 * Why a browser check and not only unit tests: both edges are *rendering* behaviour. A header cannot show a resolved
 * place name until the fetch returns, and a failed `<img>` says nothing at all — the card has to ask the relay why and
 * say it. `tests/widget-title.test.mjs` pins the priority order and `tests/map-widget.test.mjs` the arithmetic;
 * neither can see a title bar or an error panel.
 *
 * What it asserts, on the real demo boards:
 *   1. the header names the place the fetch resolved (`Q64` → "Berlin"), not the query the board was given
 *   2. a failing relay shows the RELAY'S OWN REASON (its first answer is mocked 502), with no broken image
 *   3. Try again re-requests, the map arrives, and the credit line comes back with it
 *   4. the pin the card draws contains the coordinate the map was centred on
 *   5. **points** (ISSUE-132): the `map-points` card draws one marker per place, inside the card, spread across it
 *      (the set is framed, not a world view), with an honest count on the card and no centre pin (framing a set
 *      computes a centre nobody chose) — and the `map-museums` card, a SPARQL result with coordinates, does the same
 *
 * Usage:
 *   npm run build && node scripts/map-e2e.mjs                 # starts deploy/server.js (the real relay) over dist/
 *   node scripts/map-e2e.mjs --base http://localhost:4173     # any server; without a relay the no-relay state is checked
 *   node scripts/map-e2e.mjs --base https://wikibento.toolforge.org   # production, read-only
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error('playwright-core not resolvable — run npm install first');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? null : process.argv[i + 1]; };
const FIXED_BASE = arg('base');
const LOCAL = !FIXED_BASE;
const RELAY_ERROR = 'the map service answered 403 (text/html)';   // distinctive: the card must repeat it verbatim
// Q64's P625, which the widget sends at six decimals — distinct from the demo's Brandenburg Gate (52.516300).
const BERLIN_REQUEST = /lat=52\.516667/;

/** A browser check against a stale `dist/` reports a broken feature that is actually fixed (2026-09-24, twice). */
if (LOCAL) {
  const newest = (dir) => {
    let ms = 0;
    for (const entry of (existsSync(dir) ? readdirSync(dir, { withFileTypes: true, recursive: true }) : [])) {
      if (!entry.isFile()) continue;
      ms = Math.max(ms, statSync(join(entry.parentPath || entry.path || dir, entry.name)).mtimeMs);
    }
    return ms;
  };
  if (!existsSync(join(root, 'dist/index.html'))) { console.error('  ✘ no dist/ — run `npx vite build` first'); process.exit(2); }
  const src = newest(join(root, 'src'));
  const dist = newest(join(root, 'dist/assets'));
  if (src > dist) {
    console.error(`  ✘ dist/ is older than src/ by ${Math.round((src - dist) / 1000)}s — the built app is stale.`);
    console.error('    Run `npx vite build` first (a browser check against a stale dist/ reports a broken feature).');
    process.exit(2);
  }
}

const failures = [];
const notes = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const base = FIXED_BASE || `http://127.0.0.1:${await new Promise((res, rej) => {
  const s = net.createServer(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
})}`;
console.log(`map e2e · base ${base}${LOCAL ? ' (started here, real relay)' : ''}`);

let server = null;
let serverLog = '';
async function waitForServer(url, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

if (LOCAL) {
  server = spawn('node', ['deploy/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WIKIBENTO_ROOT: 'dist', PORT: new URL(base).port },
  });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  if (!(await waitForServer(`${base}/`))) {
    console.error('  ✘ the local server never came up:\n' + serverLog.slice(-1200));
    server.kill();
    process.exit(2);
  }
}

// Is there a relay on this base? Ask it a deliberately invalid request: the route answers 400 JSON *before* it talks
// to the map service, so the probe costs nothing upstream and cannot be satisfied by a cached image.
let relayPresent = false;
try {
  const probe = await fetch(`${base}/api/staticmap?z=99&lat=0&lon=0&w=320&h=320`);
  relayPresent = probe.status === 400 && (probe.headers.get('content-type') || '').includes('json');
} catch { /* no relay */ }
console.log(`  · relay on this base: ${relayPresent ? 'yes' : 'no'}`);

mkdirSync(join(root, 'cache/maps'), { recursive: true });
let browser = null;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text().slice(0, 200);
    // Upstream weather and the mocked 502 are notes; anything else is ours.
    if (/Failed to load resource|ERR_BLOCKED_BY_ORB|net::/i.test(text)) notes.push(text);
    else pageErrors.push(text);
  });

  // The Berlin card's FIRST relay answer fails; every answer after it is the real one. That is the user's story:
  // a relay failure, a reason on the card, Try again, a map.
  let failing = true;          // while true the Berlin relay is "broken" — both the image and the card's why-ask
  let berlinRequests = 0;
  await page.route(/\/api\/staticmap\?/, async (route) => {
    const url = route.request().url();
    if (!BERLIN_REQUEST.test(url)) { await route.continue(); return; }
    berlinRequests += 1;
    if (failing) {
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: RELAY_ERROR }) });
    } else {
      await route.continue();
    }
  });

  await page.goto(`${base}/?config=/map-demo.json`, { waitUntil: 'domcontentloaded' });

  const card = page.locator('[data-widget-id="map-berlin"]');
  await card.waitFor({ state: 'visible', timeout: 30000 });
  check('the board loads with the map card', true, 'map-berlin');

  // 1. The header, which before this change read `Q64` forever. The fetch behind it is a Wikidata call; give it room.
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-widget-id="map-berlin"] .widget-title');
    return /Berlin/.test(el ? el.textContent : '');
  }, undefined, { timeout: 45000 }).catch(() => {});
  // The chip inside the title span is the instance name, not the title: read the element's own text nodes.
  const header = (await card.locator('.widget-title').evaluate((el) => [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent)
    .join('')).catch(() => '')) || '';
  check('header names the resolved place (Q64 → Berlin)', /Berlin/.test(header), JSON.stringify(header.trim()));

  // 2. The mocked failure: the relay's own reason, no image, and no credit line (a licence on a blank card would be
  //    attributing something nobody is looking at).
  await card.locator('.map-error-text').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  const errorText = (await card.locator('.map-error-text').textContent().catch(() => '')) || '';
  check('a failed relay shows the relay’s own reason', errorText.includes(RELAY_ERROR), JSON.stringify(errorText.trim()));
  check('no broken image behind the message', (await card.locator('img.map-img').count()) === 0);
  check('no map, no attribution', (await card.locator('.map-credit').count()) === 0);
  await card.screenshot({ path: join(root, 'cache/maps/map-e2e-error.png') }).catch(() => {});

  // 3. Try again re-requests — and now the real relay answers, so the map must arrive. (The relay comes "back" first,
  //    because a Try again that fails again proves nothing about recovery.)
  failing = false;
  await card.locator('.map-error .widget-btn', { hasText: 'Try again' }).click();
  if (relayPresent) {
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-widget-id="map-berlin"] img.map-img');
      return !!(img && img.naturalWidth > 0);
    }, undefined, { timeout: 45000 }).catch(() => {});
    const width = await card.locator('img.map-img').evaluate((el) => el.naturalWidth).catch(() => 0);
    check('Try again re-requests and the map arrives', width > 0, `naturalWidth ${width}`);
    check('the reason is gone', (await card.locator('.map-error').count()) === 0);
    check('the credit line comes back with the map', (await card.locator('.map-credit').count()) === 1);
    check('the relay was asked again', berlinRequests >= 2, `${berlinRequests} Berlin requests`);

    // The pin is our own overlay, so its honesty is ours too: the coordinate the map was centred on must lie inside
    // the teardrop's footprint. (The tip is the point; the shape is drawn above it, which is why this is containment
    // rather than a centre-to-centre comparison.)
    const pinContainsCentre = await card.evaluate((el) => {
      const map = el.querySelector('.map-img');
      const pin = el.querySelector('.map-pin');
      if (!map || !pin) return null;
      const m = map.getBoundingClientRect();
      const b = pin.getBoundingClientRect();
      const cx = m.left + m.width / 2;
      const cy = m.top + m.height / 2;
      return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
    });
    check('the pin covers the coordinate it was centred on', pinContainsCentre === true, pinContainsCentre === null ? 'pin or image missing' : '');
    await card.screenshot({ path: join(root, 'cache/maps/map-e2e-loaded.png') }).catch(() => {});
  } else {
    const after = (await card.locator('.map-error-text').textContent().catch(() => '')) || '';
    check('without a relay the card names that, rather than showing a broken image', /no map relay/.test(after), JSON.stringify(after.trim()));
  }

  // 4. **Points** (ISSUE-132): a list of places, framed. The markers are our own SVG in the image's pixel space, so
  //    what matters is that they are there, one per place, inside the card, and spread across it — a map that failed to
  //    frame the set would put them in a corner of a world view.
  const pointsCard = page.locator('[data-widget-id="map-points"]');
  await pointsCard.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-widget-id="map-points"]');
    return !!card && card.querySelectorAll('.map-overlay circle').length >= 4;
  }, undefined, { timeout: 45000 }).catch(() => {});
  const marks = await pointsCard.evaluate((el) => {
    const card = el.getBoundingClientRect();
    return [...el.querySelectorAll('.map-overlay circle')].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2 - card.left, y: r.top + r.height / 2 - card.top, w: card.width, h: card.height };
    });
  });
  check('a list of places draws one marker each', marks.length === 4, `${marks.length} markers for 4 places`);
  check('every marker is inside the card', marks.every((m) => m.x >= 0 && m.y >= 0 && m.x <= m.w && m.y <= m.h));
  const spreadX = marks.length ? Math.max(...marks.map((m) => m.x)) - Math.min(...marks.map((m) => m.x)) : 0;
  const spreadY = marks.length ? Math.max(...marks.map((m) => m.y)) - Math.min(...marks.map((m) => m.y)) : 0;
  check('the set is framed, not a world view', marks.length === 4 && spreadX > marks[0].w * 0.3 && spreadY > marks[0].h * 0.2,
    `markers span ${Math.round(spreadX)}×${Math.round(spreadY)} of ${Math.round(marks[0]?.w || 0)}×${Math.round(marks[0]?.h || 0)}`);
  const pointsNote = (await pointsCard.locator('.map-points-note').textContent().catch(() => '')) || '';
  check('the card says how many points it is showing', /4 points/.test(pointsNote), JSON.stringify(pointsNote.trim()));
  check('a framed set has no centre pin (nobody chose that centre)', (await pointsCard.locator('.map-pin').count()) === 0);
  check('the markers do not swallow the map link', await pointsCard.evaluate((el) => {
    const svg = el.querySelector('.map-overlay');
    return !!svg && getComputedStyle(svg).pointerEvents === 'none';
  }));
  // Markers appear as soon as the box is measured; the image arrives after the relay has fetched it. A screenshot
  // taken in between shows dots on an empty card, which is exactly the sort of half-truth this check exists to avoid.
  if (relayPresent) {
    await page.waitForFunction((sel) => {
      const img = document.querySelector(sel);
      return !!(img && img.naturalWidth > 0);
    }, '[data-widget-id="map-points"] img.map-img', { timeout: 45000 }).catch(() => {});
    const w = await pointsCard.locator('img.map-img').evaluate((el) => el.naturalWidth).catch(() => 0);
    check('the framed map arrives under the markers', w > 0, `naturalWidth ${w}`);
  }
  await pointsCard.screenshot({ path: join(root, 'cache/maps/map-e2e-points.png') }).catch(() => {});

  // 5. **Shapes** (ISSUE-132): the same list can draw a path or an area, geometry can arrive from another widget, and a
  //    pasted GeoJSON draws too — with the honest note that says what was drawn and how big it is. Asserted on the map
  //    board, before this script switches boards for the SPARQL map.
  const areaCard = page.locator('[data-widget-id="map-area"]');
  await areaCard.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="map-area"] .map-shape.map-area').length >= 1, undefined, { timeout: 45000 }).catch(() => {});
  check('a list of places can draw an area', (await areaCard.locator('.map-shape.map-area').count()) >= 1);
  const areaNote = (await areaCard.locator('.map-points-note').textContent().catch(() => '')) || '';
  check('the area card says what it drew', /1 shape/.test(areaNote) && !/outside this view/.test(areaNote), JSON.stringify(areaNote.trim()));
  const areaBox = await areaCard.evaluate((el) => {
    const card = el.getBoundingClientRect();
    const path = el.querySelector('.map-shape.map-area');
    if (!path) return null;
    const r = path.getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      inside: r.left >= card.left - 1 && r.top >= card.top - 1 && r.right <= card.right + 1 && r.bottom <= card.bottom + 1,
      cardW: card.width,
      cardH: card.height,
    };
  });
  // Framed means it fills the box along at least one axis — and the honest floor is ~40%, not 100%: the fit uses the
  // *floor* of the fitting zoom (so `zoom + 1` cannot overflow) on top of its 12% padding, which leaves a fitted shape
  // occupying as little as ~44%. A world view would leave a few per cent, which is what this catches. A tall shape
  // correctly leaves the sides empty, hence the *larger* of the two ratios rather than both.
  check('the area is framed inside the card', !!areaBox && areaBox.inside
    && Math.max(areaBox.w / areaBox.cardW, areaBox.h / areaBox.cardH) > 0.4,
    areaBox ? `${Math.round(areaBox.w)}×${Math.round(areaBox.h)} of ${Math.round(areaBox.cardW)}×${Math.round(areaBox.cardH)}` : 'no path');

  const wireCard = page.locator('[data-widget-id="map-wire"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="map-wire"] .map-shape').length >= 1, undefined, { timeout: 45000 }).catch(() => {});
  const wiredNote = (await wireCard.locator('.map-points-note').textContent().catch(() => '')) || '';
  check('geometry travels from one map to another (source)', (await wireCard.locator('.map-shape').count()) >= 1, JSON.stringify(wiredNote.trim()));

  const pastedCard = page.locator('[data-widget-id="map-pasted"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-id="map-pasted"] .map-shape.map-path').length >= 1, undefined, { timeout: 45000 }).catch(() => {});
  const pastedNote = (await pastedCard.locator('.map-points-note').textContent().catch(() => '')) || '';
  check('a pasted GeoJSON path draws, with its date', (await pastedCard.locator('.map-shape.map-path').count()) >= 1 && /1944-08/.test(pastedNote), JSON.stringify(pastedNote.trim()));
  await areaCard.screenshot({ path: join(root, 'cache/maps/map-e2e-area.png') }).catch(() => {});
  await pastedCard.screenshot({ path: join(root, 'cache/maps/map-e2e-pathed.png') }).catch(() => {});
  // The map image has to arrive *under* the shapes too, or the screenshots are dots on a dark card (which is exactly what
  // the first run of this check produced — the shapes were asserted before the relay had answered).
  if (relayPresent) {
    for (const [id, card2] of [['map-area', areaCard], ['map-pasted', pastedCard]]) {
      await page.waitForFunction((sel) => {
        const img = document.querySelector(sel);
        return !!(img && img.naturalWidth > 0);
      }, `[data-widget-id="${id}"] img.map-img`, { timeout: 45000 }).catch(() => {});
      const w = await card2.locator('img.map-img').evaluate((el) => el.naturalWidth).catch(() => 0);
      check(`the map arrives under the shapes (${id})`, w > 0, `naturalWidth ${w}`);
    }
    await areaCard.screenshot({ path: join(root, 'cache/maps/map-e2e-area.png') }).catch(() => {});
    await pastedCard.screenshot({ path: join(root, 'cache/maps/map-e2e-pathed.png') }).catch(() => {});
  }

  // 6. The same machinery for a query result: a SPARQL result with a WKT coordinate column becomes a map.
  await page.goto(`${base}/?config=/sparql-demo.json`, { waitUntil: 'domcontentloaded' });
  const queryCard = page.locator('[data-widget-id="map-museums"]');
  await queryCard.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-widget-id="map-museums"]');
    return !!card && card.querySelectorAll('.map-overlay circle').length >= 10;
  }, undefined, { timeout: 60000 }).catch(() => {});
  const queryMarks = await queryCard.locator('.map-overlay circle').count();
  check('a SPARQL result with coordinates draws a map', queryMarks >= 10, `${queryMarks} markers from the query`);
  const queryNote = (await queryCard.locator('.map-points-note').textContent().catch(() => '')) || '';
  check('the query map counts its places', /\d+ points/.test(queryNote), JSON.stringify(queryNote.trim()));
  if (relayPresent) {
    await page.waitForFunction((sel) => {
      const img = document.querySelector(sel);
      return !!(img && img.naturalWidth > 0);
    }, '[data-widget-id="map-museums"] img.map-img', { timeout: 45000 }).catch(() => {});
    const w = await queryCard.locator('img.map-img').evaluate((el) => el.naturalWidth).catch(() => 0);
    check('the query map has a map under it too', w > 0, `naturalWidth ${w}`);
  }
  await queryCard.screenshot({ path: join(root, 'cache/maps/map-e2e-sparql-map.png') }).catch(() => {});

  check('no page errors from our code', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'none');
  if (notes.length) console.log(`  · notes (upstream weather): ${notes.length}`);
  console.log('  · screenshots: cache/maps/map-e2e-error.png'
    + `${relayPresent ? ', cache/maps/map-e2e-loaded.png' : ''}`
    + ', cache/maps/map-e2e-points.png, cache/maps/map-e2e-area.png, cache/maps/map-e2e-pathed.png, cache/maps/map-e2e-sparql-map.png');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
}

if (failures.length) {
  console.error(`\n✖ map e2e: ${failures.length} failed — ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\n✔ map e2e: all checks passed');
