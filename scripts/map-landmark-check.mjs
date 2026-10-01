/**
 * The map geometry checked against real rendered maps (ISSUE-132): two phases, one command.
 *
 * **Phase 1 — the projection, in image space.** The map backlog rests on one claim: *a static map is a Mercator window*,
 * so any coordinate maps to a pixel and points, paths, polygons, icons and labels can be our own SVG, with no map
 * library. Arithmetic can be self-consistently wrong (a mirrored latitude, a factor of two, a centre treated as a
 * corner), so this phase asks the image: for each case it fetches a real static map, predicts where a landmark should
 * be, and classifies the pixels there — water or land — from the style's own palette. The landmarks are lakes (water)
 * with an island, a town or a mountain beside them (land), each coordinate taken from Wikidata P625, so the expectation
 * is a *geographic* fact rather than an output of the projection under test.
 *
 * **Phase 2 — the same landmarks on a card.** A card's aspect is usually **not** the image's, because the size ladder
 * quantises the two dimensions independently (486×296 asks for 640×320); CSS `object-fit` then crops or letterboxes,
 * and the overlay SVG mirrors it with `preserveAspectRatio` (see `src/lib/mapOverlay.js`). Phase 2 builds that card for
 * real — the same image, a box of a deliberately different shape, the marker drawn in the image's pixel space — and
 * checks three things per marker: that the browser put the ink where `overlayForPlaces` says it would (within a pixel),
 * that the pixels under that point *in a screenshot of the card* are the landmark's (water/land — which fails if the
 * maths is wrong in a way both sides share), and that a point the crop takes away is off the card.
 *
 * **Both phases must be able to fail.** Every image-space case is re-run through a mirrored and a doubled projection,
 * and phase 2 re-runs each card through a "stretch each axis to the box" transform — the mistake `mapOverlay.js` exists
 * to prevent. If nothing notices, the run fails: a check that cannot fail is agreement with itself, not evidence.
 * Measured 2026-09-30: the island-in-a-lake cases catch both image-space distortions (a small land feature surrounded
 * by water is exactly what a wrong offset misses), while a probe that only proves "not water" catches neither, which is
 * printed per case rather than hidden.
 *
 *   node scripts/map-landmark-check.mjs [--force] [--only crater-lake]
 *
 * Polite by construction: four images, at least 1.2 s apart, cached under `cache/maps/` (cache-first), an identifying
 * User-Agent on every request, and `Retry-After` honoured if the service ever says 429. Phase 2 downloads nothing — it
 * re-uses those four images. Nothing here runs in `npm test`: it is a deliberate, network-touching check whose verdict
 * belongs in the docs.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const CACHE = join(root, 'cache/maps');
mkdirSync(CACHE, { recursive: true });
const FORCE = process.argv.includes('--force');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx === -1 ? null : process.argv[onlyIdx + 1];

const UA = process.env.WIKIMEDIA_USER_AGENT
  || 'WikiBento/0.1 (https://wikibento.toolforge.org/; User:Fuzheado) map-landmark-check';

/**
 * Every coordinate below is a Wikidata P625, named with its item, so the water/land expectation is a fact about the
 * world rather than an output of the projection under test. The *centre* is always the first probe's item.
 */
const CASES = [
  {
    slug: 'crater-lake',
    name: 'Crater Lake, Oregon — an island in a lake (west, northern hemisphere)',
    center: { lat: 42.943611111111, lon: -122.10666666667 },   // Q329266
    zoom: 13, width: 800, height: 640,
    probes: [
      { what: 'Crater Lake centre (Q329266)', lat: 42.943611111111, lon: -122.10666666667, expect: 'water' },
      { what: 'Wizard Island (Q3593259)', lat: 42.93888888888889, lon: -122.14583333333333, expect: 'land' },
    ],
  },
  {
    slug: 'lake-bled',
    name: 'Lake Bled, Slovenia — a town beside a small lake (both axes, small feature)',
    center: { lat: 46.364444444444, lon: 14.094722222222 },     // Q648902
    zoom: 13, width: 800, height: 640,
    probes: [
      { what: 'Lake Bled centre (Q648902)', lat: 46.364444444444, lon: 14.094722222222, expect: 'water' },
      { what: 'Bled town (Q202852)', lat: 46.36833333333333, lon: 14.114722222222222, expect: 'land' },
    ],
  },
  {
    slug: 'lake-rotorua',
    name: 'Lake Rotorua, Aotearoa — an island in a lake, southern hemisphere',
    center: { lat: -38.083333333333, lon: 176.26944444444 },    // Q1192621
    zoom: 13, width: 800, height: 640,
    probes: [
      { what: 'Lake Rotorua centre (Q1192621)', lat: -38.083333333333, lon: 176.26944444444, expect: 'water' },
      { what: 'Mokoia Island (Q1074225)', lat: -38.08, lon: 176.287, expect: 'land' },
    ],
  },
  {
    slug: 'fiji-samoa',
    // Across the date line, which is the only reason this case exists: with an unwrapped longitude both islands fall
    // thousands of pixels off the image, so a pass here is the wrap being right. The centre is the midpoint (the fit's
    // own answer), and everything is water in between.
    name: 'Fiji and Samoa — across the date line (a longitude that must wrap)',
    center: { lat: -15.7, lon: -177.2 },                        // midpoint of the two islands
    zoom: 6, width: 800, height: 640,
    probes: [
      { what: 'Viti Levu (Q208198)', lat: -17.8, lon: 178.0, expect: 'land' },
      { what: 'open Pacific between them', lat: -15.7, lon: -177.2, expect: 'water' },
      { what: "Savai'i (Q337519)", lat: -13.583333333333, lon: -172.41666666667, expect: 'land' },
    ],
  },
  {
    slug: 'pragser-wildsee',
    name: 'Pragser Wildsee, Dolomites — a small lake and a peak (lower zoom)',
    center: { lat: 46.69361111111111, lon: 12.085 },            // Q445369
    zoom: 12, width: 800, height: 640,
    probes: [
      { what: 'Pragser Wildsee centre (Q445369)', lat: 46.69361111111111, lon: 12.085, expect: 'water' },
      { what: 'Hochalpenkopf (Q31668552)', lat: 46.71241, lon: 12.04509, expect: 'land' },
    ],
  },
];

/** Wrong projections for phase 1, applied to already-predicted image pixels. */
const DISTORTIONS = [
  { name: 'latitude mirrored', at: (p, c) => ({ x: p.x, y: c.height - p.y }) },
  { name: 'scale doubled', at: (p, c) => ({ x: c.width / 2 + (p.x - c.width / 2) * 2, y: c.height / 2 + (p.y - c.height / 2) * 2 }) },
];

/**
 * The cards phase 2 renders each case on. The image is 800×640 (aspect 1.25), so all three are a different shape by a
 * wide margin — a card shaped like its image would crop nothing and test nothing. `cover` crops; `contain` letterboxes.
 */
const CARDS = [
  { name: 'wide-cover', boxWidth: 520, boxHeight: 260, fit: 'cover' },
  { name: 'tall-cover', boxWidth: 260, boxHeight: 520, fit: 'cover' },
  { name: 'square-contain', boxWidth: 420, boxHeight: 420, fit: 'contain' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastFetch = 0;
async function fetchCached(url, file) {
  if (!FORCE && existsSync(file)) return readFileSync(file);
  const wait = 1200 - (Date.now() - lastFetch);
  if (wait > 0) await sleep(wait);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    lastFetch = Date.now();
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after')) || 5 * (attempt + 1);
      console.log(`  · 429 from the map service — waiting ${retry}s (it is asking for less traffic)`);
      await sleep(retry * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`the map service answered ${res.status} for ${url}`);
    const body = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, body);
    return body;
  }
  throw new Error(`the map service kept answering 429 for ${url}`);
}

const { mercatorPixel } = await import('../src/lib/mapImage.js');
const { overlayForPlaces, preserveAspectRatioFor, mapFit, projectGeometry } = await import('../src/lib/mapOverlay.js');
const { toFeatureCollection, boundsOf, vertexCount } = await import('../src/lib/geojson.js');

/**
 * Read pixels back out of an image in the page: water / land / outside for each point, over a square box of
 * `half` pixels each way. ±4 px (≈ ±25 m at zoom 13) survives a label or a road crossing the point and still misses a
 * feature the size of an island or a small town if the maths is off; phase 2 uses ±2 px, inside the marker's ring.
 */
async function sample(page, dataUrl, points, half = 4) {
  return page.evaluate(async ({ src, list, radius }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    // The style's own palette, read off a real image before this script was written: water is (185,212,238)-ish,
    // land is (248,244,240)-ish with greens (216,232,200) — so “blue enough” separates them cleanly.
    const isWater = (r, g, b) => b > r + 20 && b > 170;
    const probes = list.map((p) => {
      if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return { water: 0, sample: [0, 0, 0], total: 0, outside: true };
      let water = 0;
      let total = 0;
      const colours = [];
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = Math.round(p.x + dx);
          const y = Math.round(p.y + dy);
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const d = ctx.getImageData(x, y, 1, 1).data;
          total += 1;
          if (isWater(d[0], d[1], d[2])) water += 1;
          colours.push([d[0], d[1], d[2]]);
        }
      }
      colours.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      return { water: total ? water / total : 0, sample: colours[Math.floor(colours.length / 2)], total, outside: false };
    });
    return { width: canvas.width, height: canvas.height, probes };
  }, { src: dataUrl, list: points, radius: half });
}

/** Water points must be mostly water; land points must not be meaningfully water. The gaps allow a label, a road or an
 *  anti-aliased shoreline inside the box without hand-waving the verdict. */
const verdictOf = (result, expect) => {
  if (result.outside) return false;
  return expect === 'water' ? result.water >= 0.5 : result.water <= 0.25;
};

/**
 * Phase 2 for one case: render the same image on a card of a different aspect, draw a marker at each predicted point in
 * the image's own pixel space (letting `preserveAspectRatio` do what `object-fit` does), then compare the browser's
 * result with ours — and with the map's actual content, read out of a screenshot of that card.
 */
async function cardPhase(page, c, png, card) {
  const problems = [];
  const caught = [];
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  const view = {
    centerLat: c.center.lat, centerLon: c.center.lon, zoom: c.zoom,
    imageWidth: c.width, imageHeight: c.height,
    boxWidth: card.boxWidth, boxHeight: card.boxHeight, fit: card.fit,
  };
  const placed = overlayForPlaces(
    c.probes.map((p, i) => ({ index: i, id: p.what, expect: p.expect, lat: p.lat, lon: p.lon })),
    view,
  );

  // The premise of this phase: a card shaped like its image crops nothing.
  if (Math.abs(c.width / c.height - card.boxWidth / card.boxHeight) < 0.01) {
    problems.push(`${c.slug}/${card.name}: the card has the image's aspect ratio, so this phase tests nothing`);
  }

  // The card, exactly as the widget builds it: an <img> with object-fit, an <svg> with the matching
  // preserveAspectRatio, markers in the image's pixel space.
  const rects = await page.evaluate(async (cfg) => {
    document.body.innerHTML = '';
    const box = document.createElement('div');
    box.id = 'landmark-card';
    Object.assign(box.style, {
      position: 'relative', width: `${cfg.boxWidth}px`, height: `${cfg.boxHeight}px`, background: '#101010', overflow: 'hidden',
    });
    const img = document.createElement('img');
    Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: cfg.fit });
    img.src = cfg.dataUrl;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${cfg.imageWidth} ${cfg.imageHeight}`);
    svg.setAttribute('preserveAspectRatio', cfg.preserveAspectRatio);
    Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const circles = cfg.markers.map((m) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', m.x);
      circle.setAttribute('cy', m.y);
      circle.setAttribute('r', '10');
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#ff2d95');
      circle.setAttribute('stroke-width', '2');
      circle.dataset.index = String(m.index);
      svg.appendChild(circle);
      return circle;
    });
    box.append(img, svg);
    document.body.appendChild(box);
    await img.decode();
    await new Promise((r) => requestAnimationFrame(r));
    // Card space, not viewport space: the page's body carries a default margin, and mixing the two is exactly the
    // kind of silent 8px error this phase exists to catch.
    const origin = box.getBoundingClientRect();
    return circles.map((circle) => {
      const r = circle.getBoundingClientRect();
      return {
        index: Number(circle.dataset.index),
        cx: r.left - origin.left + r.width / 2,
        cy: r.top - origin.top + r.height / 2,
      };
    });
  }, {
    dataUrl,
    fit: card.fit,
    preserveAspectRatio: preserveAspectRatioFor(card.fit),
    imageWidth: c.width,
    imageHeight: c.height,
    boxWidth: card.boxWidth,
    boxHeight: card.boxHeight,
    markers: placed.map((p) => ({ index: p.index, x: p.image.x, y: p.image.y })),
  });

  const shotFile = join(CACHE, `landmark-${c.slug}-card-${card.name}.png`);
  const shot = await page.locator('#landmark-card').screenshot({ path: shotFile });
  const shotUrl = `data:image/png;base64,${shot.toString('base64')}`;
  const { width: shotWidth, height: shotHeight, probes: under } = await sample(
    page, shotUrl, placed.map((p) => p.card), 2,
  );

  // A screenshot at any scale other than 1:1 would move every sample silently.
  if (shotWidth !== card.boxWidth || shotHeight !== card.boxHeight) {
    problems.push(`${c.slug}/${card.name}: the card screenshot is ${shotWidth}×${shotHeight}, not ${card.boxWidth}×${card.boxHeight} — the samples below would be meaningless`);
  }

  for (let i = 0; i < placed.length; i += 1) {
    const p = placed[i];
    const rect = rects.find((r) => r.index === i);
    const onScreen = !!rect
      && rect.cx >= 0 && rect.cy >= 0 && rect.cx <= card.boxWidth && rect.cy <= card.boxHeight;
    const label = `${p.id} on ${card.name}`;
    if (!p.card.visible) {
      if (onScreen) {
        problems.push(`${c.slug}: ${label} — our maths says the crop takes it away, the browser drew it at ${rect.cx.toFixed(1)}, ${rect.cy.toFixed(1)}`);
      } else {
        console.log(`  · card ${card.name.padEnd(14)} ${p.id.padEnd(34)} cropped away by the fit — and the browser agrees`);
      }
      continue;
    }
    if (!onScreen) {
      problems.push(`${c.slug}: ${label} — our maths says it is on the card, the browser put it off-screen`);
      continue;
    }
    const dx = Math.abs(rect.cx - p.card.x);
    const dy = Math.abs(rect.cy - p.card.y);
    const ok = dx <= 1.5 && dy <= 1.5 && verdictOf(under[i], p.expect);
    console.log(`  ${ok ? '✔' : '✖'} card ${card.name.padEnd(14)} ${p.id.padEnd(34)} expected ${p.expect.padEnd(5)}`
      + ` at card (${p.card.x.toFixed(1).padStart(6)}, ${p.card.y.toFixed(1).padStart(6)})`
      + ` · browser drew it ${dx.toFixed(2)}px, ${dy.toFixed(2)}px away · water ${(under[i].water * 100).toFixed(0)}%`
      + ` · rgb(${under[i].sample.join(',')})`);
    if (!ok) {
      problems.push(`${c.slug}: ${label} — browser off by ${dx.toFixed(2)},${dy.toFixed(2)} px, water ${(under[i].water * 100).toFixed(0)}%, expected ${p.expect}`);
    }

    // The control: "stretch each axis to the box", the mistake this module exists to prevent. Run for every point,
    // including the ones the crop takes away — there the disagreement is about *visibility*, which is the point of
    // computing the crop at all.
    const naive = { x: (p.image.x / c.width) * card.boxWidth, y: (p.image.y / c.height) * card.boxHeight };
    const naiveVisible = p.image.inside
      && naive.x >= 0 && naive.y >= 0 && naive.x <= card.boxWidth && naive.y <= card.boxHeight;
    if (naiveVisible !== p.card.visible) {
      caught.push(`${card.name}: ${p.id} (the crop)`);
    } else if (naiveVisible) {
      const { probes: naiveUnder } = await sample(page, shotUrl, [naive], 2);
      if (verdictOf(naiveUnder[0], p.expect) !== verdictOf(under[i], p.expect)) {
        caught.push(`${card.name}: ${p.id}`);
      }
    }
  }

  return { problems, caught, shotFile };
}

const cases = CASES.filter((c) => !ONLY || c.slug === ONLY);
if (!cases.length) { console.error(`no case named "${ONLY}"`); process.exit(2); }

const failures = [];
/** Which cases notice which wrong projection — a case may legitimately be blind to one (a probe that can only say
 *  "not water"), but the check as a whole must be able to fail, or the pixels are agreeing with us out of politeness. */
const caughtBy = new Map(DISTORTIONS.map((d) => [d.name, []]));
const cardCaught = [];
const shapeCaught = [];
let browser = null;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const c of cases) {
    const url = `https://maps.wikimedia.org/img/osm-intl,${c.zoom},${c.center.lat.toFixed(6)},${c.center.lon.toFixed(6)},${c.width}x${c.height}.png?lang=en`;
    const file = join(CACHE, `landmark-${c.slug}.png`);
    const png = await fetchCached(url, file);
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
    console.log(`\n${c.name}\n  ${c.zoom}/${c.center.lat},${c.center.lon} · ${c.width}×${c.height} · ${file}`);

    // ── Phase 1: the projection, in image space ──
    const probes = c.probes.map((p) => {
      const at = mercatorPixel({
        lat: p.lat, lon: p.lon,
        centerLat: c.center.lat, centerLon: c.center.lon,
        zoom: c.zoom, width: c.width, height: c.height,
      });
      return { ...p, x: at.x, y: at.y, inside: at.inside };
    });
    if (probes.some((p) => !p.inside)) {
      failures.push(`${c.slug}: a probe is outside the image — the case is misconfigured, or the projection is (a missing date-line wrap looks exactly like this)`);
      console.log('  ✖ a probe falls outside the image — either the case is misconfigured, or the projection is (this is what a missing date-line wrap looks like)');
      continue;
    }

    const { probes: results } = await sample(page, dataUrl, probes);
    probes.forEach((p, i) => {
      const ok = verdictOf(results[i], p.expect);
      const r = results[i];
      console.log(`  ${ok ? '✔' : '✖'} ${p.what.padEnd(34)} expected ${p.expect.padEnd(5)} at pixel (${p.x.toFixed(1).padStart(6)}, ${p.y.toFixed(1).padStart(6)})`
        + ` · water ${(r.water * 100).toFixed(0)}% · sample rgb(${r.sample.join(',')})`);
      if (!ok) failures.push(`${c.slug}: ${p.what} predicted at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) is ${(r.water * 100).toFixed(0)}% water, expected ${p.expect}`);
    });

    for (const d of DISTORTIONS) {
      const moved = probes.map((p) => d.at(p, c));
      const { probes: bent } = await sample(page, dataUrl, moved);
      const caught = probes.filter((p, i) => verdictOf(bent[i], p.expect) !== verdictOf(results[i], p.expect));
      if (caught.length === 0) {
        console.log(`  · sensitivity: this case did not notice “${d.name}” (a probe that only proves "not water" cannot)`);
      } else {
        caughtBy.get(d.name).push(c.slug);
        console.log(`  · sensitivity: “${d.name}” was caught by ${caught.map((p) => p.what).join(', ')}`);
      }
    }

    // Draw the predictions onto a copy of the image, so the verdict has a picture beside it.
    const annotated = await page.evaluate(async ({ src, list }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const out = document.createElement('canvas');
      out.width = img.naturalWidth;
      out.height = img.naturalHeight;
      const ctx = out.getContext('2d');
      ctx.drawImage(img, 0, 0);
      for (const p of list) {
        ctx.strokeStyle = '#ff2d95';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 11, p.y);
        ctx.lineTo(p.x + 11, p.y);
        ctx.moveTo(p.x, p.y - 11);
        ctx.lineTo(p.x, p.y + 11);
        ctx.stroke();
        const label = `${p.expect}: ${p.what}`;
        ctx.font = '12px sans-serif';
        const w = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(p.x + 10, p.y - 26, w, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, p.x + 14, p.y - 14);
      }
      return out.toDataURL('image/png');
    }, { src: dataUrl, list: probes });
    const annotatedFile = join(CACHE, `landmark-${c.slug}-annotated.png`);
    writeFileSync(annotatedFile, Buffer.from(annotated.split(',')[1], 'base64'));
    console.log(`  · annotated: ${annotatedFile}`);

    // ── Phase 2: the same landmarks on cards whose aspect is not the image's ──
    for (const card of CARDS) {
      const { problems, caught, shotFile } = await cardPhase(page, c, png, card);
      failures.push(...problems);
      cardCaught.push(...caught);
      console.log(`  · card: ${shotFile}`);
    }
  }
  // Phase 3 runs once, after the per-case work: a live geoshape, drawn and checked against the map underneath it.
  const shapeResult = await shapePhase(page);
  failures.push(...shapeResult.problems);
  shapeCaught.push(...(shapeResult.caught || []));
} finally {
  if (browser) await browser.close().catch(() => {});
}

/**
 * Phase 3 — a **real Wikidata geoshape**, drawn and checked against the map underneath it.
 *
 * Phases 1 and 2 prove the projection and the card transform with points. This proves the *shape* path end to end: fetch
 * a geoshape from Wikidata's mapdata service (**Museum Island**, Q151963 — an island in the Spree, so its interior is
 * land and everything just outside its shoreline is water), project it with `projectGeometry`, draw it on a card whose
 * aspect is deliberately not the image's, and then classify the map pixels **inside** the shape and **just outside** it.
 * A mirrored, mis-scaled or off-by-a-tile geometry flips that classification, which the control at the end re-checks by
 * drawing a deliberately wrong projection of the same shape.
 *
 * The shape is drawn with a stroke and no fill, so the map shows through the sample points: the check is about where the
 * geometry *is*, not about our own paint. The drawn path's bounding box is compared with our arithmetic separately.
 */
async function shapePhase(page) {
  const problems = [];
  const caught = [];
  const source = { url: 'https://maps.wikimedia.org/geoshape?getgeojson=1&ids=Q151963', file: join(CACHE, 'shape-museum-island.geojson') };
  const mapImage = { width: 1024, height: 512, zoom: 16, url: '', file: join(CACHE, 'shape-museum-island-map.png') };
  let body;
  if (!FORCE && existsSync(source.file)) {
    body = readFileSync(source.file).toString('utf8');
  } else {
    const wait = 1200 - (Date.now() - lastFetch);
    if (wait > 0) await sleep(wait);
    const res = await fetch(source.url, { headers: { 'User-Agent': UA } });
    lastFetch = Date.now();
    if (!res.ok) return { problems: [`the geoshape service answered ${res.status} for ${source.url}`], caught: [] };
    body = await res.text();
    writeFileSync(source.file, body);
  }
  const { collection, error } = toFeatureCollection(body);
  if (error) return { problems: [`the live geoshape did not validate: ${error}`], caught: [] };
  const bounds = boundsOf(collection);
  const centre = { lat: (bounds.minLat + bounds.maxLat) / 2, lon: (bounds.minLon + bounds.maxLon) / 2 };
  mapImage.url = `https://maps.wikimedia.org/img/osm-intl,${mapImage.zoom},${centre.lat.toFixed(6)},${centre.lon.toFixed(6)},${mapImage.width}x${mapImage.height}.png?lang=en`;
  const imageUrl = await fetchImageAsDataUrl(mapImage.url, mapImage.file);
  if (!imageUrl) return { problems: [`could not fetch the map for the shape phase (${mapImage.url})`], caught: [] };

  const card = { boxWidth: 420, boxHeight: 300, fit: 'cover' };
  const view = {
    centerLat: centre.lat, centerLon: centre.lon, zoom: mapImage.zoom,
    imageWidth: mapImage.width, imageHeight: mapImage.height,
    boxWidth: card.boxWidth, boxHeight: card.boxHeight, fit: card.fit,
  };
  const fit = mapFit(view);
  const toCard = (p) => ({ x: fit.offsetX + p.x * fit.scale, y: fit.offsetY + p.y * fit.scale });
  const pathDataOf = (shapes) => shapes.map((shape) => shape.groups.map((lines) => lines.map((line) => (
    `M${line[0].x.toFixed(1)} ${line[0].y.toFixed(1)}` + line.slice(1).map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z'
  )).join(' ')).join(' '));

  const shapes = projectGeometry(collection, view);
  if (!shapes.length) return { problems: ['projectGeometry returned no shapes for a live geoshape'], caught: [] };
  const ring = shapes[0].groups[0][0];
  const centroid = { x: ring.reduce((n, p) => n + p.x, 0) / ring.length, y: ring.reduce((n, p) => n + p.y, 0) / ring.length };
  // Just outside the shoreline, using the **local** outward normal (the centroid direction points into the island at a
  // concave vertex — around the harbour, and along the Spree's arms). 10 image pixels ≈ 15 m at this zoom: inside the
  // river, and clear of the 3 px stroke. Eight samples, and the check asks for most of them rather than all: a bridge
  // or the narrowest arm (the Kupfergraben is ~25 m) can legitimately put one on stone.
  const outward = (index) => {
    const n = ring.length;
    const here = ring[index % n];
    const next = ring[(index + 1) % n];
    const prev = ring[(index - 1 + n) % n];
    const dir = { x: next.x - prev.x, y: next.y - prev.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const normal = { x: -dir.y / len, y: dir.x / len };
    // Two candidates; the outward one is the one that lands farther from the polygon's centre.
    const away = { x: here.x + normal.x * 10, y: here.y + normal.y * 10 };
    const toward = { x: here.x - normal.x * 10, y: here.y - normal.y * 10 };
    const dist = (p) => Math.hypot(p.x - centroid.x, p.y - centroid.y);
    return dist(away) >= dist(toward) ? away : toward;
  };
  const outside = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => outward(Math.round((i * ring.length) / 8)));
  const probes = [centroid, ...outside];

  const render = async (d, suffix) => {
    const rect = await page.evaluate(async (cfg) => {
      document.body.innerHTML = '';
      const box = document.createElement('div');
      box.id = 'shape-card';
      Object.assign(box.style, { position: 'relative', width: `${cfg.boxWidth}px`, height: `${cfg.boxHeight}px`, overflow: 'hidden', background: '#101010' });
      const img = document.createElement('img');
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: cfg.fit });
      img.src = cfg.imageUrl;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${cfg.imageWidth} ${cfg.imageHeight}`);
      svg.setAttribute('preserveAspectRatio', cfg.preserveAspectRatio);
      Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', cfg.d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#ff2d95');
      path.setAttribute('stroke-width', '3');
      svg.appendChild(path);
      box.append(img, svg);
      document.body.appendChild(box);
      await img.decode();
      await new Promise((r) => requestAnimationFrame(r));
      const origin = box.getBoundingClientRect();
      const r = path.getBoundingClientRect();
      return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
    }, {
      imageUrl, d, fit: card.fit, preserveAspectRatio: preserveAspectRatioFor(card.fit),
      imageWidth: mapImage.width, imageHeight: mapImage.height, boxWidth: card.boxWidth, boxHeight: card.boxHeight,
    });
    const shot = await page.locator('#shape-card').screenshot({ path: join(CACHE, `map-landmark-shape${suffix}.png`) });
    return { rect, shot };
  };

  console.log(`\nMuseum Island, as a live geoshape (${vertexCount(collection.features[0].geometry)} vertices)`);
  const real = await render(pathDataOf(shapes), '');
  const read = await sample(page, `data:image/png;base64,${real.shot.toString('base64')}`, probes.map(toCard), 2);
  const insideLand = read.probes[0].water <= 0.25;
  const wet = read.probes.slice(1).filter((r) => r.water >= 0.75).length;
  const outsideWater = wet >= 6;
  console.log(`  ${insideLand ? '✔' : '✖'} the shape’s interior is the island: water ${(read.probes[0].water * 100).toFixed(0)}% · rgb(${read.probes[0].sample.join(',')})`);
  if (!insideLand) problems.push(`the geoshape’s interior sampled ${(read.probes[0].water * 100).toFixed(0)}% water — the shape is not where the map puts the island`);
  console.log(`  ${outsideWater ? '✔' : '✖'} just outside its shoreline is the Spree: ${wet}/${read.probes.length - 1} samples in water`
    + ` (${read.probes.slice(1).map((r) => `${(r.water * 100).toFixed(0)}%`).join(', ')})`);
  if (!outsideWater) problems.push(`only ${wet} of ${read.probes.length - 1} samples just outside the geoshape were water — the shape does not follow the shoreline`);

  const expected = {
    left: fit.offsetX + Math.min(...ring.map((p) => p.x)) * fit.scale,
    top: fit.offsetY + Math.min(...ring.map((p) => p.y)) * fit.scale,
  };
  const dx = Math.abs(real.rect.left - expected.left);
  const dy = Math.abs(real.rect.top - expected.top);
  const rectOk = dx <= 2 && dy <= 2;
  console.log(`  ${rectOk ? '✔' : '✖'} the drawn path starts where the projection says (${dx.toFixed(1)}, ${dy.toFixed(1)} px off)`);
  if (!rectOk) problems.push(`the drawn shape's bounding box is ${dx.toFixed(1)}, ${dy.toFixed(1)} px from the projected one`);

  // The control: the same shape through a deliberately wrong transform — scaled 1.3× about the image centre, which is
  // what a stale box or a wrong zoom looks like. Its paint must then sit where our maths does NOT say, which is exactly
  // the assertion this phase makes. (A mirror would be a poor control here: the map is centred on the shape, so mirroring
  // puts the island almost exactly back onto itself — measured, and the reason this is a scale error instead.)
  const stretched = shapes.map((shape) => ({
    ...shape,
    groups: shape.groups.map((lines) => lines.map((line) => line.map((p) => ({
      x: mapImage.width / 2 + (p.x - mapImage.width / 2) * 1.3,
      y: mapImage.height / 2 + (p.y - mapImage.height / 2) * 1.3,
    })))),
  }));
  const bent = await render(pathDataOf(stretched), '-stretched');
  const bentOffBy = Math.max(Math.abs(bent.rect.left - expected.left), Math.abs(bent.rect.top - expected.top));
  if (bentOffBy > 2) {
    caught.push(`a projection scaled 1.3× (it would paint ${bentOffBy.toFixed(0)} px from where the maths puts it)`);
    console.log(`  · sensitivity: a mis-scaled projection lands ${bentOffBy.toFixed(0)} px from the projected position — this phase can fail`);
  } else {
    console.log('  · sensitivity: nothing noticed a mis-scaled projection — read this phase with care');
  }
  console.log(`  · screenshots: ${join(CACHE, 'map-landmark-shape.png')} · ${join(CACHE, 'map-landmark-shape-stretched.png')}`);
  return { problems, caught };
}

/** A URL into a data URL, from the cache when it is there (so a re-run costs nothing). */
async function fetchImageAsDataUrl(url, file) {
  let bytes;
  if (!FORCE && existsSync(file)) {
    bytes = readFileSync(file);
  } else {
    const wait = 1200 - (Date.now() - lastFetch);
    if (wait > 0) await sleep(wait);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    lastFetch = Date.now();
    if (!res.ok) return null;
    bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, bytes);
  }
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

// The controls, summed up: a wrong projection has to be caught *somewhere*. If no case notices a distortion, the check
// has stopped being evidence and the summary says so.
for (const [name, slugs] of caughtBy) {
  if (slugs.length === 0) {
    failures.push(`no case noticed a ${name} projection — the check can no longer fail`);
    console.log(`\n✖ sensitivity: NO case noticed “${name}” — the check can no longer fail`);
  } else {
    console.log(`\nsensitivity: “${name}” was caught by ${slugs.join(', ')}`);
  }
}
if (shapeCaught.length === 0) {
  failures.push('the shape phase noticed nothing when the projection was deliberately wrong — it can no longer fail');
  console.log('✖ sensitivity: the shape phase cannot fail (a mis-scaled geoshape was not caught)');
} else {
  console.log(`sensitivity: the shape phase caught ${shapeCaught.join(', ')}`);
}
if (cardCaught.length === 0) {
  failures.push('no card noticed a "stretch each axis to the box" transform — the card phase can no longer fail');
  console.log('✖ sensitivity: NO card noticed the naive stretch transform — the card phase can no longer fail');
} else {
  console.log(`sensitivity: the naive stretch transform was caught by ${cardCaught.join(', ')}`);
}

if (failures.length) {
  console.error(`\n✖ map landmark check: ${failures.length} failed`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('\n✔ map landmark check: every predicted pixel landed on its feature, on the image and on the card, and every phase can fail');
