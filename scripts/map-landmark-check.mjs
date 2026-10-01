/**
 * The off-centre landmark test (ISSUE-132's first item): does `mercatorPixel` really predict where a place lands
 * inside a *rendered* static map?
 *
 * The map backlog rests on one claim — **a static map is a Mercator window**, so any coordinate maps to a pixel and
 * points, paths, polygons, icons and labels can be our own SVG, with no map library. The arithmetic is pinned by unit
 * tests, but arithmetic can be self-consistently wrong: a mirrored latitude, a factor of two in the scale, a centre
 * treated as a corner would all pass a test that only checks the formula against itself.
 *
 * So this check asks the image. For each case it fetches a real static map, predicts where a landmark should be, and
 * classifies the pixels there — water or land — from the style's own palette. The landmarks are lakes (water) with an
 * island, a town or a mountain beside them (land), each coordinate taken from Wikidata P625, so the expectation is a
 * *geographic* fact rather than a projection output.
 *
 * **And the check must be able to fail.** Every case is re-run through deliberately wrong projections — latitude
 * mirrored, scale doubled — and the run fails if no probe notices. Without that control the pixels could be agreeing
 * with us out of politeness; with it, the sensitivity is measured rather than assumed. Measured 2026-09-30: the two
 * island-in-a-lake cases catch the mirror (a small land feature surrounded by water is exactly what a wrong offset
 * misses), while a town probe merely proves "not water" and does not. That asymmetry is printed, not hidden.
 *
 *   node scripts/map-landmark-check.mjs [--force] [--only crater-lake]
 *
 * Polite by construction: four images, at least 1.2 s apart, cached under `cache/maps/` (cache-first), an identifying
 * User-Agent on every request, and `Retry-After` honoured if the service ever says 429. Nothing here runs in
 * `npm test` — it is a deliberate, network-touching check whose verdict belongs in the docs.
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

/** The two ways a projection most plausibly goes wrong. Both are applied to already-predicted pixels. */
const DISTORTIONS = [
  { name: 'latitude mirrored', at: (p, c) => ({ x: p.x, y: c.height - p.y }) },
  { name: 'scale doubled', at: (p, c) => ({ x: c.width / 2 + (p.x - c.width / 2) * 2, y: c.height / 2 + (p.y - c.height / 2) * 2 }) },
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

/** water / land / outside, for one probe at one pixel. A 9×9 box: ±4 px ≈ ±25 m at zoom 13, which survives a label
 *  or a road crossing the point and still misses a feature the size of an island or a small town if the maths is off. */
async function classify(page, dataUrl, probeList) {
  return page.evaluate(async ({ src, list }) => {
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
    return list.map((p) => {
      if (p.x < 0 || p.y < 0 || p.x >= canvas.width || p.y >= canvas.height) return { water: 0, sample: [0, 0, 0], total: 0, outside: true };
      let water = 0;
      let total = 0;
      const colours = [];
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
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
  }, { src: dataUrl, list: probeList });
}

/** Water probes must be mostly water; land probes must not be meaningfully water. The gaps allow a label, a road or
 *  an anti-aliased shoreline inside the box without hand-waving the verdict. */
const verdictOf = (result, expect) => {
  if (result.outside) return false;
  return expect === 'water' ? result.water >= 0.5 : result.water <= 0.25;
};

const cases = CASES.filter((c) => !ONLY || c.slug === ONLY);
if (!cases.length) { console.error(`no case named "${ONLY}"`); process.exit(2); }

const failures = [];
/** Which cases notice which wrong projection — a case may legitimately be blind to one (a town probe can only say
 *  "not water"), but the check as a whole must be able to fail, or the pixels are agreeing with us out of politeness. */
const caughtBy = new Map(DISTORTIONS.map((d) => [d.name, []]));
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

    const probes = c.probes.map((p) => {
      const at = mercatorPixel({
        lat: p.lat, lon: p.lon,
        centerLat: c.center.lat, centerLon: c.center.lon,
        zoom: c.zoom, width: c.width, height: c.height,
      });
      return { ...p, x: at.x, y: at.y, inside: at.inside };
    });
    if (probes.some((p) => !p.inside)) {
      failures.push(`${c.slug}: a probe is outside the image — the case is misconfigured, not the map`);
      console.log('  ✖ a probe falls outside the image; fix the case before reading anything into the pixels');
      continue;
    }

    const results = await classify(page, dataUrl, probes);
    probes.forEach((p, i) => {
      const ok = verdictOf(results[i], p.expect);
      const r = results[i];
      console.log(`  ${ok ? '✔' : '✖'} ${p.what.padEnd(34)} expected ${p.expect.padEnd(5)} at pixel (${p.x.toFixed(1).padStart(6)}, ${p.y.toFixed(1).padStart(6)})`
        + ` · water ${(r.water * 100).toFixed(0)}% · sample rgb(${r.sample.join(',')})`);
      if (!ok) failures.push(`${c.slug}: ${p.what} predicted at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) is ${(r.water * 100).toFixed(0)}% water, expected ${p.expect}`);
    });

    // The control: the same image and the same probes, through a projection we know is wrong. At least one probe has
    // to notice, or this whole exercise is agreement with itself. Reported per distortion so the sensitivity of each
    // case is visible rather than assumed.
    for (const d of DISTORTIONS) {
      const moved = probes.map((p) => d.at(p, c));
      const bent = await classify(page, dataUrl, moved);
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
  }
} finally {
  if (browser) await browser.close().catch(() => {});
}

// The control, summed up: a wrong projection has to be caught *somewhere*. If no case notices a distortion, the
// check has stopped being evidence and the summary says so.
for (const [name, slugs] of caughtBy) {
  if (slugs.length === 0) {
    failures.push(`no case noticed a ${name} projection — the check can no longer fail`);
    console.log(`\n✖ sensitivity: NO case noticed “${name}” — the check can no longer fail`);
  } else {
    console.log(`\nsensitivity: “${name}” was caught by ${slugs.join(', ')}`);
  }
}

if (failures.length) {
  console.error(`\n✖ map landmark check: ${failures.length} failed`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('\n✔ map landmark check: every predicted pixel landed on its feature, and every case can fail');
