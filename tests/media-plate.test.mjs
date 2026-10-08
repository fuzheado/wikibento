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
  MEDIA_PLATE_DEFAULT, MEDIA_PLATE_OPTIONS,
  bodyPlateClass, imagePlateClass, isVectorMedia, plateChoice, plateColor,
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
