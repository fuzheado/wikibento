/**
 * The media plate (issue #111) — the unit half of the gate.
 *
 * The bug: every image site painted the card's own `var(--bg)` behind its media, and Commons renders SVG files
 * and transparent PNGs onto TRANSPARENCY, so black diagram line art arrived as black on `#0f1117`. The fix is a
 * background the *media* carries rather than the card: `mediaBackground: auto | light | dark | none`, with `auto`
 * decided per IMAGE (a vector gets a light plate, an opaque photograph is left alone).
 *
 * What this file can prove without a browser: the choice normalizes, a vector URL is recognised (including the
 * `….svg.png` thumb form), the class fragments are right, and — the part that rots first — every registry type
 * that offers the field ALSO defaults it, so the ⚙ panel cannot show an empty box while the card renders a
 * plate. The browser half is `scripts/media-plate-e2e.mjs` (`npm run smoke:plate`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WIDGET_TYPES } from '../src/widgets/index.js';
import {
  ALPHA_CORNER_THRESHOLD, LIGHT_INK_LUMINANCE, MAX_ALPHA_IN_FLIGHT,
  MEDIA_PLATE_DEFAULT, MEDIA_PLATE_OPTIONS,
  alphaCacheSize, bodyPlateClass, cornersImplyPlate, imagePlateClass, inkIsLight, isVectorMedia,
  mayHaveAlpha, plateChoice, plateClassFromSample, plateColor, plateRasterNeedsCheck, rasterPlateClass,
  resetAlphaCache,
} from '../src/lib/mediaPlate.js';

test('plateChoice: the four settings, and anything else means auto', () => {
  for (const v of ['auto', 'light', 'dark', 'none']) {
    assert.equal(plateChoice(v), v, v);
    assert.equal(plateChoice(v.toUpperCase()), v, `${v} is case-insensitive`);
    assert.equal(plateChoice(`  ${v}  `), v, `${v} survives stray whitespace from a hand-written board`);
  }
  // A typo must degrade to the default rather than to "no plate": the field's whole job is legibility.
  assert.equal(plateChoice('white'), MEDIA_PLATE_DEFAULT);
  assert.equal(plateChoice(''), MEDIA_PLATE_DEFAULT);
  assert.equal(plateChoice(undefined), MEDIA_PLATE_DEFAULT);
  assert.equal(plateChoice(null), MEDIA_PLATE_DEFAULT);
  assert.equal(plateChoice('#ffcc00'), MEDIA_PLATE_DEFAULT, 'a colour we do not support yet is not a plate');
});

test('isVectorMedia: Commons keeps the file name in the thumb URL', () => {
  assert.ok(isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/e/e0/Symbol_question.svg'));
  assert.ok(isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Symbol_question.svg/250px-Symbol_question.svg.png'));
  assert.ok(isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Thing.SVG/500px-Thing.SVG.png'));
  assert.ok(isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/thumb/x/xx/A.svg/500px-A.svg.png?utm_source=commons.wikimedia.org'));

  assert.ok(!isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Albert_Einstein_Head.jpg/330px-Albert_Einstein_Head.jpg'));
  assert.ok(!isVectorMedia('https://upload.wikimedia.org/wikipedia/commons/c/cf/Cscr-featured.png'));
  assert.ok(!isVectorMedia(''), 'no URL is not a vector');
  assert.ok(!isVectorMedia(undefined));
  assert.ok(!isVectorMedia('https://example.org/svg/thing.png'), 'the word svg in a path is not the file\'s type');
});

test('bodyPlateClass: a class fragment with its own space, or nothing for auto', () => {
  assert.equal(bodyPlateClass('auto'), '', 'auto leaves the decision to each image');
  assert.equal(bodyPlateClass('light'), ' plate-light');
  assert.equal(bodyPlateClass('dark'), ' plate-dark');
  assert.equal(bodyPlateClass('none'), ' plate-none');
  assert.equal(bodyPlateClass('nonsense'), '', 'an unknown value is auto, which is no frame class');
  // The fragments are concatenated straight into a className, so a missing leading space would silently glue
  // the class onto `widget-frame` — assert the shape rather than trusting it.
  for (const v of ['light', 'dark', 'none']) assert.match(bodyPlateClass(v), /^ plate-[a-z]+$/);
});

test('imagePlateClass: only auto is per image, and only for vectors', () => {
  const svg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Q.svg/250px-Q.svg.png';
  const jpg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/P.jpg/330px-P.jpg';

  assert.equal(imagePlateClass('auto', svg), ' plate-vector');
  assert.equal(imagePlateClass('auto', jpg), '', 'a photograph keeps the card background — this is why auto is per image');

  // An explicit choice is already on the frame; `none` must not be overruled by one vector in a card.
  for (const v of ['light', 'dark', 'none']) {
    assert.equal(imagePlateClass(v, svg), '', `${v} is the card's decision, not the image's`);
  }
});

test('plateColor: the value behind each class', () => {
  assert.equal(plateColor('light'), '#ffffff');
  assert.equal(plateColor('dark'), 'var(--bg)');
  assert.equal(plateColor('none'), 'transparent');
  assert.equal(plateColor('auto'), 'var(--bg)', 'auto on a raster is the old behaviour');
});

test('every type that offers mediaBackground also defaults it (one place decides)', () => {
  const offering = [];
  for (const [id, def] of Object.entries(WIDGET_TYPES)) {
    const fields = def.configFields || [];
    const field = fields.find((f) => f && f.key === 'mediaBackground');
    if (!field) {
      // The trap this test exists for: a field added to configFields but not to defaults leaves the ⚙ box
      // EMPTY while the card renders a plate — the same "rendered vs input" lie configFieldValue was fixed for.
      assert.equal(def.defaults?.mediaBackground, undefined, `${id} defaults mediaBackground without offering the field`);
      continue;
    }
    offering.push(id);
    assert.equal(field.type, 'select', `${id}: the plate is a choice`);
    assert.deepEqual(field.options, MEDIA_PLATE_OPTIONS, `${id}: the wording comes from MEDIA_PLATE_OPTIONS, not a copy`);
    assert.equal(def.defaults?.mediaBackground, MEDIA_PLATE_DEFAULT, `${id} must default the field it offers`);
  }
  assert.ok(offering.length >= 5, `expected the picture-bearing types to offer it, found ${offering.join(', ')}`);
  for (const id of ['gallery', 'mediaPlayer', 'wikiPage', 'documentReader', 'articleList']) {
    assert.ok(offering.includes(id), `${id} shows pictures, so it should offer the plate`);
  }
});

test('the transforms hand the choice to the renderer', () => {
  const gallery = WIDGET_TYPES.gallery;
  const base = { ...gallery.defaults };
  assert.equal(gallery.transform({ rows: [] }, base).mediaPlate, 'auto', 'the default reaches the renderer');
  assert.equal(gallery.transform({ rows: [] }, { ...base, mediaBackground: 'light' }).mediaPlate, 'light');
  assert.equal(
    gallery.transform({ rows: [] }, { ...base, mediaBackground: 'LIGHT' }).mediaPlate, 'light',
    'the transform normalizes too, because a board may carry any spelling',
  );

  const player = WIDGET_TYPES.mediaPlayer;
  const view = player.transform({ rows: [], missing: 0 }, { ...player.defaults });
  assert.equal(view.mediaPlate, 'auto');
});

/* ── the transparent-raster half ─────────────────────────────────────────────────────────────────────
   A vector is visible in the URL; a transparent PNG is not, so `auto` reads the corners of the decoded
   pixels. What can be tested here (no DOM in node) is the decision, the caching and the queueing — the
   readback itself is a browser fact and is asserted by `npm run smoke:plate` against a real Commons PNG. */

test('mayHaveAlpha: a .jpg cannot carry a transparent corner, so it is never read back', () => {
  assert.equal(mayHaveAlpha('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Einstein.jpg/500px-Einstein.jpg'), false);
  assert.equal(mayHaveAlpha('…/500px-Foo.JPEG'), false);
  assert.equal(mayHaveAlpha('…/500px-Foo.PNG'), true, 'case matters on the web only in the extension we read');
  assert.equal(mayHaveAlpha('…/500px-Logo.png'), true);
  assert.equal(mayHaveAlpha('…/500px-Anim.gif'), true);
  assert.equal(mayHaveAlpha('…/500px-Scan.tiff.png'), true, 'a TIFF thumb arrives as a PNG');
  assert.equal(mayHaveAlpha('…/500px-Thing.png?lang=en'), true, 'a query string does not hide the extension');
  assert.equal(mayHaveAlpha(''), true, 'an unknown URL is worth a look, not an assumption');
});

test('cornersImplyPlate: the threshold, and nothing else', () => {
  assert.equal(cornersImplyPlate([0, 0, 0, 0]), true, 'fully transparent');
  assert.equal(cornersImplyPlate([255, 255, 255, 255]), false, 'opaque');
  assert.equal(cornersImplyPlate([255, 255, ALPHA_CORNER_THRESHOLD, 255]), true, 'exactly at the threshold counts');
  assert.equal(cornersImplyPlate([255, 255, ALPHA_CORNER_THRESHOLD + 1, 255]), false, 'one above it does not');
  assert.equal(cornersImplyPlate([255, 0, 255, 255]), true, 'one transparent corner is enough (a rounded tile, a cut-out)');
  assert.equal(cornersImplyPlate([]), false);
  assert.equal(cornersImplyPlate(undefined), false, 'junk means no plate, never a crash');
});

test('plateRasterNeedsCheck: only `auto`, and never for a vector or a .jpg', () => {
  assert.equal(plateRasterNeedsCheck('auto', '…/500px-Logo.png'), true);
  assert.equal(plateRasterNeedsCheck(undefined, '…/500px-Logo.png'), true, 'a card with no field is auto');
  assert.equal(plateRasterNeedsCheck('auto', '…/500px-Thing.svg.png'), false, 'the URL already settled this vector');
  assert.equal(plateRasterNeedsCheck('auto', '…/500px-Photo.jpg'), false, 'no decode is spent on a .jpg');
  assert.equal(plateRasterNeedsCheck('light', '…/500px-Logo.png'), false, 'the user decided; do not measure');
  assert.equal(plateRasterNeedsCheck('none', '…/500px-Logo.png'), false);
});

test('inkIsLight: the boundary, and junk means "not light"', () => {
  assert.equal(inkIsLight(255), true, 'white line art');
  assert.equal(inkIsLight(LIGHT_INK_LUMINANCE), true, 'exactly at the threshold');
  assert.equal(inkIsLight(LIGHT_INK_LUMINANCE - 1), false, 'one below it is dark ink');
  assert.equal(inkIsLight(20), false, 'a black diagram');
  assert.equal(inkIsLight(null), false, 'nothing sampled is not light ink');
  assert.equal(inkIsLight(undefined), false);
});

test('plateClassFromSample: the direction of the plate, from one readback', () => {
  assert.equal(plateClassFromSample({ transparent: false, inkLuminance: 40 }), '',
    'an opaque picture keeps the card background, whatever its ink');
  assert.equal(plateClassFromSample({ transparent: true, inkLuminance: 131.9 }), ' plate-alpha',
    'transparent with dark ink (measured: File:Cscr-featured.png) → white plate');
  assert.equal(plateClassFromSample({ transparent: true, inkLuminance: 255 }), ' plate-alpha-dark',
    'transparent with light ink (measured: File:Globe Icon White.png) → the dark background back');
  assert.equal(plateClassFromSample({ transparent: true, inkLuminance: null }), ' plate-alpha',
    'nothing opaque enough to judge: the light plate is the harmless default (an empty tile)');
  assert.equal(plateClassFromSample(null), '', 'a failed readback is not a plate');
  assert.equal(plateClassFromSample(undefined), '');
});

test('rasterPlateClass caches per URL — one readback for a tile drawn twice', async () => {
  resetAlphaCache();
  let calls = 0;
  const loader = async () => { calls += 1; return { transparent: true, inkLuminance: 10 }; };
  const [a, b] = await Promise.all([rasterPlateClass('…/A.png', loader), rasterPlateClass('…/A.png', loader)]);
  assert.equal(a, ' plate-alpha');
  assert.equal(b, ' plate-alpha');
  assert.equal(calls, 1, 'the second ask is served from the cache');
  assert.equal(alphaCacheSize(), 1);
  assert.equal(await rasterPlateClass('…/A.png', async () => null), ' plate-alpha',
    'a later ask still gets the cached answer, not the new loader');
});

test('rasterPlateClass queues: a 40-tile gallery cannot start 40 decodes at once', async () => {
  resetAlphaCache();
  let inFlight = 0;
  let peak = 0;
  const loader = () => new Promise((resolve) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => { inFlight -= 1; resolve({ transparent: true, inkLuminance: 5 }); }, 5);
  });
  const urls = Array.from({ length: 40 }, (_, i) => `…/tile-${i}.png`);
  const results = await Promise.all(urls.map((u) => rasterPlateClass(u, loader)));
  assert.equal(results.filter((r) => r === ' plate-alpha').length, 40, 'every tile still gets its answer');
  assert.ok(peak <= MAX_ALPHA_IN_FLIGHT, `peak ${peak} readbacks in flight, cap ${MAX_ALPHA_IN_FLIGHT}`);
  assert.ok(peak > 1, 'but they do run in parallel — a serial queue would be needlessly slow');
});

test('a failing readback means no plate, and never an unhandled rejection', async () => {
  resetAlphaCache();
  assert.equal(await rasterPlateClass('…/throws.png', () => { throw new Error('boom'); }), '');
  assert.equal(await rasterPlateClass('…/rejects.png', async () => { throw new Error('boom'); }), '');
  assert.equal(await rasterPlateClass('…/null.png', async () => null), '');
  assert.equal(await rasterPlateClass('…/opaque.png', async () => ({ transparent: false, inkLuminance: 3 })), '');
  assert.equal(await rasterPlateClass(''), '', 'no URL, no work');
});
