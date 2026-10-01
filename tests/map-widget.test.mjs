/**
 * The static map widget's pure half (ISSUE-131): what a `place` string means, and the URLs the card builds from it.
 *
 * Worth pinning here rather than in a browser check, because these are the parts that fail *silently*: a zoom of 44,
 * a `de-AT` language code the map service does not know, a coordinate written `48.8584° N, 2.2945° E` pasted from a
 * map page, or an out-of-range pair that would otherwise ask for a map of nowhere and render a plausible grey tile.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAP_SIZE_LADDER, staticMapUrl, relayMapUrl, osmUrl, parsePlace, placeSubtitle, clampZoom, mapLanguage, legalMapSize, MAP_DEFAULT_ZOOM, OSM_ATTRIBUTION, mercatorPixel,
} from '../src/lib/mapImage.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { mapFit, imagePixelInCard, overlayForPlaces, visibleCount, preserveAspectRatioFor, fitPlaces } from '../src/lib/mapOverlay.js';
import { parsePlaceLines, parseWktPoint, placesFromRows, hasPlaces, MAX_MAP_POINTS } from '../src/lib/mapPlaces.js';

test('staticMapUrl: the documented shape, at the card’s own size', () => {
  // both dimensions land on the ladder (800 is a rung; 500 rounds up to 640)
  assert.equal(
    staticMapUrl({ lat: 48.8584, lon: 2.2945, zoom: 14, width: 800, height: 500, lang: 'en' }),
    'https://maps.wikimedia.org/img/osm-intl,14,48.858400,2.294500,800x640.png?lang=en',
  );
  // the request lands on the size ladder, whatever the card measured: one URL per bucket, cached by the browser
  assert.match(staticMapUrl({ lat: 1, lon: 2, width: 486, height: 296 }), /640x320\.png/);
  assert.match(staticMapUrl({ lat: 1, lon: 2, width: 972, height: 592 }), /1024x640\.png/);   // a retina 486x296
  assert.equal(legalMapSize(100), 320, 'never smaller than the first rung');
  assert.equal(legalMapSize(1900), 2000, 'and never larger than the last');
  assert.equal(legalMapSize(640), 640, 'a size already on the ladder is left alone');
});

test('staticMapUrl: clamps what the service would reject or render as nowhere', () => {
  assert.match(staticMapUrl({ lat: 0, lon: 0, zoom: 44 }), /osm-intl,19,/);          // above the max
  assert.match(staticMapUrl({ lat: 0, lon: 0, zoom: -3 }), /osm-intl,1,/);           // below the min
  assert.equal(clampZoom('nonsense'), MAP_DEFAULT_ZOOM);
  assert.equal(clampZoom(13.6), 14);                                                 // rounds
  assert.match(staticMapUrl({ lat: 0, lon: 0, width: 4, height: 2 }), /320x320\.png/);       // the first rung, not a 0-pixel image
  assert.match(staticMapUrl({ lat: 0, lon: 0, width: 99999, height: 99999 }), /2000x2000\.png/); // the last
});

test('staticMapUrl: only a language the map service knows reaches it', () => {
  assert.equal(mapLanguage('de-AT'), 'de');
  assert.equal(mapLanguage('FR_fr'), 'fr');
  assert.equal(mapLanguage(''), 'en');
  assert.equal(mapLanguage('klingon'), 'en');
  assert.equal(mapLanguage('mul'), 'mul');
  assert.match(staticMapUrl({ lat: 1, lon: 2, lang: 'pt-BR' }), /\?lang=pt$/);
});

test('osmUrl: the same place, pinned, for the click-through', () => {
  const u = osmUrl(48.8584, 2.2945, 14);
  assert.match(u, /^https:\/\/www\.openstreetmap\.org\/\?mlat=48\.858400&mlon=2\.294500#map=14\/48\.858400\/2\.294500$/);
});

test('parsePlace: a coordinate, however a person writes it', () => {
  for (const input of ['48.8584, 2.2945', '48.8584;2.2945', '48.8584,2.2945', '48.8584° N, 2.2945° E', '-33.86, 151.21']) {
    const p = parsePlace(input);
    assert.equal(p.kind, 'coordinate', input);
    assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon), input);
  }
  assert.deepEqual(parsePlace('48.8584° N, 2.2945° E'), { kind: 'coordinate', lat: 48.8584, lon: 2.2945 });
  assert.deepEqual(parsePlace('33.86° S, 151.21° W'), { kind: 'coordinate', lat: -33.86, lon: -151.21 }, 'S and W are negative');
  // out of range must be refused, not passed on: the service would render a grey field and look broken
  assert.equal(parsePlace('120, 200').kind, 'invalid');
  assert.equal(parsePlace('48.8584').kind, 'invalid', 'one number is not a place');
});

test('parsePlace: an item, a page title, or nothing', () => {
  assert.deepEqual(parsePlace('Q64'), { kind: 'item', id: 'Q64' });
  assert.deepEqual(parsePlace('q64'), { kind: 'item', id: 'Q64' });
  assert.deepEqual(parsePlace('http://www.wikidata.org/entity/Q64'), { kind: 'item', id: 'Q64' });
  assert.deepEqual(parsePlace('Eiffel_Tower'), { kind: 'title', title: 'Eiffel Tower' });
  assert.deepEqual(parsePlace('  Brandenburg Gate '), { kind: 'title', title: 'Brandenburg Gate' });
  assert.equal(parsePlace('').kind, 'empty');
  assert.equal(parsePlace(null).kind, 'empty');
  // a title that merely starts with a Q is a title, not an item id
  assert.equal(parsePlace('Queensland').kind, 'title');
});

test('placeSubtitle: names the place when it has a name, and the coordinate always', () => {
  assert.equal(placeSubtitle('Berlin', 52.52, 13.405), 'Berlin · 52.5200, 13.4050');
  assert.equal(placeSubtitle('', 48.8584, 2.2945), '48.8584, 2.2945');
  assert.equal(placeSubtitle(null, -33.8688, 151.2093), '-33.8688, 151.2093');
});

test('the attribution is the one OpenStreetMap asks for, and it links to the licence', () => {
  assert.match(OSM_ATTRIBUTION.text, /OpenStreetMap/);
  assert.match(OSM_ATTRIBUTION.href, /^https:\/\/www\.openstreetmap\.org\/copyright$/);
});

test('relayMapUrl: the card asks our own server, with the same laddered numbers', () => {
  const u = relayMapUrl({ lat: 48.8584, lon: 2.2945, zoom: 14, width: 486, height: 296, lang: 'de-AT' });
  assert.match(u, /^\/api\/staticmap\?/);
  const q = new URLSearchParams(u.split('?')[1]);
  assert.equal(q.get('z'), '14');
  assert.equal(q.get('lat'), '48.858400');
  assert.equal(q.get('lon'), '2.294500');
  assert.equal(q.get('w'), '640');        // the ladder, not 486
  assert.equal(q.get('h'), '320');
  assert.equal(q.get('lang'), 'de');      // and the two-letter code the service understands
  // It must not be possible to aim the relay at another host: it takes no URL.
  assert.ok(!u.includes('http'), 'the relay URL is relative and carries no upstream address');
});

test('the server and the widget agree about the size ladder', () => {
  // The relay refuses anything off its ladder and the widget asks only for ladder sizes, so if the two lists ever
  // differ the map cards quietly stop rendering. deploy/server.js cannot import from src/ (it sits next to dist/ on
  // the deployment), so the duplication is deliberate and this is what keeps it honest.
  const server = readFileSync('deploy/server.js', 'utf8');
  const m = server.match(/const MAP_LADDER = \[([^\]]+)\]/);
  assert.ok(m, 'deploy/server.js must define MAP_LADDER');
  assert.deepEqual(m[1].split(',').map((n) => Number(n.trim())), MAP_SIZE_LADDER);
});

/**
 * The spine the map backlog rests on (ISSUE-132): a static map is a Mercator window, so any coordinate maps to a
 * pixel of the image. These tests pin the arithmetic against the tile-pyramid formula the services draw with, keep
 * the hemispheres honest, and understand `inside`. What they *cannot* do is check the formula against a rendered
 * image — that is `scripts/map-landmark-check.mjs` (four maps, eight landmarks, water/land classified by pixel),
 * whose verdict is recorded in docs/VERIFIED-WORKING.md and docs/ISSUES.md (ISSUE-132).
 */
test('mercatorPixel: the centre is the middle, and it agrees with the tile-pyramid formula', () => {
  assert.deepEqual(
    mercatorPixel({ lat: 52.52, lon: 13.405, centerLat: 52.52, centerLon: 13.405, zoom: 11, width: 800, height: 640 }),
    { x: 400, y: 320, inside: true },
    'the coordinate the map was centred on lands in the middle of the image',
  );
  // The same world expressed independently: world = 256·2^z pixels, longitude linear across it, latitude through
  // the Mercator ordinate. A sign, a factor of 2 or a 256-vs-512 tile size shows up as a mismatch here.
  const TILE = 256;
  const tileX = (lon, z) => ((Number(lon) + 180) / 360) * 2 ** z;
  const tileY = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
  const cases = [
    { lat: 52.5219, lon: 13.4132, centerLat: 52.516666666667, centerLon: 13.383333333333, zoom: 11, width: 800, height: 640 },
    { lat: -33.8688, lon: 151.2093, centerLat: -33.88, centerLon: 151.245, zoom: 13, width: 480, height: 480 },
    { lat: 46.71241, lon: 12.04509, centerLat: 46.693611, centerLon: 12.085, zoom: 12, width: 640, height: 320 },
  ];
  for (const c of cases) {
    const got = mercatorPixel(c);
    assert.ok(Math.abs(got.x - ((tileX(c.lon, c.zoom) - tileX(c.centerLon, c.zoom)) * TILE + c.width / 2)) < 1e-6, `x for ${JSON.stringify(c)}`);
    assert.ok(Math.abs(got.y - ((tileY(c.lat, c.zoom) - tileY(c.centerLat, c.zoom)) * TILE + c.height / 2)) < 1e-6, `y for ${JSON.stringify(c)}`);
  }
});

test('mercatorPixel: the worked case, the hemispheres, and the edge of the window', () => {
  // Alexanderplatz (52.5219, 13.4132) on a Berlin-centred (Q64's P625) 800×640 map at zoom 11 — 2.1 km away, which
  // is the example the map backlog quotes. (The figure written down when Tier 1 shipped, "(432, 312)", was
  // approximate; these are the numbers the formula and the rendered image agree on.)
  const p = mercatorPixel({ lat: 52.5219, lon: 13.4132, centerLat: 52.516666666667, centerLon: 13.383333333333, zoom: 11, width: 800, height: 640 });
  assert.ok(Math.abs(p.x - 443.5) < 0.1, `x = ${p.x}`);
  assert.ok(Math.abs(p.y - 307.5) < 0.1, `y = ${p.y}`);
  assert.equal(p.inside, true);

  const east = mercatorPixel({ lat: 0, lon: 10, centerLat: 0, centerLon: 0, zoom: 8, width: 1000, height: 1000 });
  assert.ok(east.x > 500, 'east of centre is to the right');
  assert.equal(east.y, 500, 'and no further down');
  const south = mercatorPixel({ lat: -10, lon: 0, centerLat: 0, centerLon: 0, zoom: 8, width: 1000, height: 1000 });
  assert.ok(south.y > 500, 'south of centre is below — one formula serves both hemispheres');
  assert.equal(south.x, 500);

  const far = mercatorPixel({ lat: 40, lon: -30, centerLat: 52.52, centerLon: 13.405, zoom: 11, width: 800, height: 640 });
  assert.equal(far.inside, false, 'a point outside the window says so rather than being drawn at a wrong pixel');
  assert.ok(far.x < 0 && far.y > 0, 'west and south of a Berlin window');
  assert.deepEqual(
    mercatorPixel({ lat: 1, lon: 2, centerLat: 1, centerLon: 2, zoom: 11, width: 0, height: 0 }),
    { x: 0, y: 0, inside: true },
    'a zero-sized image still answers, at its single point',
  );
  const pole = mercatorPixel({ lat: -90, lon: 0, centerLat: -90, centerLon: 0, zoom: 3, width: 100, height: 100 });
  assert.ok(Number.isFinite(pole.x) && Number.isFinite(pole.y), 'the poles clamp instead of reaching Infinity');
});

test('map: the header names the place once it is resolved (labelFromData)', () => {
  // The card is given `Q64` and only the fetch knows that means "Berlin". While loading, the config label answers,
  // so the header says `Q64` rather than something invented (ISSUE-131's first rough edge).
  const def = WIDGET_TYPES.map;
  assert.equal(def.labelFromConfig({ place: 'Q64' }), 'Q64');
  assert.equal(def.labelFromData(null), null, 'no data yet → the config label answers');
  assert.equal(def.labelFromData({}), null);
  assert.equal(def.labelFromData({ title: 'Berlin' }), 'Berlin');
  assert.equal(def.labelFromData({ title: '48.8584, 2.2945' }), '48.8584, 2.2945', 'a bare coordinate is a name too');
});

/**
 * The overlay geometry (ISSUE-132's first slice): where a place lands on a *card*, whose aspect is usually not the
 * image's, because the size ladder quantises the two dimensions independently (486×296 asks for 640×320).
 *
 * These are the numbers the future renderer's hit-testing and labels rely on, and they are the same transform the
 * browser applies — `object-fit: cover` is `preserveAspectRatio="xMidYMid slice"`. The browser half is
 * `npm run check:map-landmarks`, whose card phase renders each landmark on cards of a different aspect and checks both
 * where the ink lands and what the map shows underneath it. Arithmetic that agrees with itself is not evidence; that
 * check is.
 */
test('mapFit: cover crops to fill, contain letterboxes, and each names its SVG twin', () => {
  // The tall card (260×520, aspect 0.5) against an 800×640 image (1.25): cover scales by the height and crops the
  // sides; contain scales by the width and leaves margins above and below.
  const cover = mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 260, boxHeight: 520, fit: 'cover' });
  assert.equal(cover.scale, 0.8125);
  assert.equal(cover.drawWidth, 650);
  assert.equal(cover.drawHeight, 520);
  assert.equal(cover.offsetX, -195, 'a crop offsets the image out of the box');
  assert.equal(cover.offsetY, 0);
  assert.equal(cover.preserveAspectRatio, 'xMidYMid slice');

  const contain = mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 260, boxHeight: 520, fit: 'contain' });
  assert.equal(contain.scale, 0.325);
  assert.equal(contain.drawWidth, 260);
  assert.equal(contain.drawHeight, 208);
  assert.equal(contain.offsetX, 0);
  assert.equal(contain.offsetY, 156, 'a letterbox offsets the image into the box');
  assert.equal(contain.preserveAspectRatio, 'xMidYMid meet');

  // The pairing the overlay depends on, and the default for anything unexpected.
  assert.equal(preserveAspectRatioFor('cover'), 'xMidYMid slice');
  assert.equal(preserveAspectRatioFor('contain'), 'xMidYMid meet');
  assert.equal(preserveAspectRatioFor(undefined), 'xMidYMid slice');
  assert.equal(mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 100, boxHeight: 50 }).mode, 'cover');

  // A card with no measured box yet (`ResizeObserver` has not run) has nothing to show, and says so.
  const unmeasured = mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 0, boxHeight: 0 });
  assert.equal(unmeasured.scale, 0);
  assert.equal(imagePixelInCard({ x: 400, y: 320 }, unmeasured).visible, false);
  assert.equal(imagePixelInCard(undefined, undefined).visible, false);
});

test('imagePixelInCard: the crop is what takes a point off the card', () => {
  // The tall card shows image columns 240…560 of 800 — Wizard Island (image x ≈ 172) is cropped away.
  const tall = mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 260, boxHeight: 520, fit: 'cover' });
  assert.deepEqual(imagePixelInCard({ x: 400, y: 320 }, tall), { x: 130, y: 260, visible: true });
  assert.equal(imagePixelInCard({ x: 171.8, y: 357.6 }, tall).visible, false, 'the island is outside a tall card');

  // The wide card crops vertically instead, and the island survives — at a y the naive implementation gets wrong.
  const wide = mapFit({ imageWidth: 800, imageHeight: 640, boxWidth: 520, boxHeight: 260, fit: 'cover' });
  const island = imagePixelInCard({ x: 171.8, y: 357.6 }, wide);
  assert.equal(island.visible, true);
  assert.ok(Math.abs(island.x - 111.7) < 0.1 && Math.abs(island.y - 154.4) < 0.1, `island at ${island.x}, ${island.y}`);
  const naive = { x: (171.8 / 800) * 520, y: (357.6 / 640) * 260 };   // "stretch each axis to the box"
  assert.ok(Math.abs(naive.y - island.y) > 8, 'the two transforms disagree by enough to land on different content');
});

test('overlayForPlaces: a list of places becomes image pixels and card coordinates', () => {
  const view = {
    centerLat: 42.943611111111, centerLon: -122.10666666667, zoom: 13,
    imageWidth: 800, imageHeight: 640, boxWidth: 520, boxHeight: 260, fit: 'cover',
  };
  const [lake, island, far] = overlayForPlaces([
    { id: 'lake', lat: 42.943611111111, lon: -122.10666666667 },
    { id: 'island', lat: 42.93888888888889, lon: -122.14583333333333 },
    { id: 'far', lat: 0, lon: 0 },
  ], view);
  assert.equal(lake.image.inside, true);
  assert.equal(Math.round(lake.card.x), 260, 'the map centre is the card centre');
  assert.equal(Math.round(lake.card.y), 130);
  assert.equal(lake.card.visible, true);
  assert.equal(island.card.visible, true, 'the island is on this card');
  assert.equal(Math.round(island.card.x), 112);
  assert.equal(far.image.inside, false, 'a place on another continent is not on this map');
  assert.equal(far.card.visible, false);
  assert.equal(visibleCount([lake, island, far]), 2);

  // A caller's own fields travel with the geometry.
  assert.equal(lake.id, 'lake');
  // Nothing to draw, and nothing to crash on.
  assert.deepEqual(overlayForPlaces([], view), []);
  assert.deepEqual(overlayForPlaces(null, view), []);
  assert.equal(overlayForPlaces([{ lat: 1, lon: 2 }], { ...view, boxWidth: 0, boxHeight: 0 })[0].card.visible, false);
  assert.equal(overlayForPlaces([{ lat: 42.95, lon: -122.11 }], view)[0].card.visible, true, 'a place in the window is visible');
});

/**
 * Places from input (ISSUE-132): a textarea of places, and a query result's coordinates.
 *
 * Both shapes are the ones the endpoints really return, and both hide a trap worth pinning: WKT says *longitude first*
 * (`Point(13.405 52.52)` — swap those two and Berlin moves to the Indian Ocean), and a result may have coordinates in
 * only some rows, which the card has to be able to say out loud.
 */
test('parsePlaceLines: one place per line, in the same vocabulary as `place`', () => {
  const { entries, skipped } = parsePlaceLines('\nQ64\n\n# a comment\n48.8584, 2.2945\n  Brandenburg Gate  \n120, 200\n');
  assert.equal(skipped, 0);
  assert.deepEqual(entries.map((e) => e.input), ['Q64', '48.8584, 2.2945', 'Brandenburg Gate', '120, 200']);
  // Letters make it a page title, however odd it looks; two numbers out of range are invalid and say why.
  assert.deepEqual(entries.map((e) => e.parsed.kind), ['item', 'coordinate', 'title', 'invalid']);
  assert.match(entries[3].parsed.reason, /not a place on Earth/);
  assert.equal(parsePlaceLines('').entries.length, 0);
  assert.equal(parsePlaceLines(null).entries.length, 0);
  assert.deepEqual(parsePlaceLines('Berlin\nQ64').entries[0].parsed, { kind: 'title', title: 'Berlin' });

  // The cap is reported, not silent: a hundred is already more than a card can show without clustering.
  const many = parsePlaceLines(Array.from({ length: MAX_MAP_POINTS + 7 }, (_, i) => `Q${i + 1}`).join('\n'));
  assert.equal(many.entries.length, MAX_MAP_POINTS);
  assert.equal(many.skipped, 7);
});

test('parseWktPoint: WKT is longitude first, and only a point on Earth is a place', () => {
  assert.deepEqual(parseWktPoint('Point(13.405 52.52)'), { lat: 52.52, lon: 13.405 });
  assert.deepEqual(parseWktPoint('point(-122.106667 42.943611)'), { lat: 42.943611, lon: -122.106667 });
  // The CRS84 form WDQS actually returns for wdt:P625.
  assert.deepEqual(
    parseWktPoint('<http://www.opengis.net/def/crs/OGC/1.3/CRS84> Point(13.405 52.52)'),
    { lat: 52.52, lon: 13.405 },
  );
  assert.equal(parseWktPoint('LINESTRING(0 0, 1 1)'), null);
  assert.equal(parseWktPoint('Q64'), null);
  assert.equal(parseWktPoint(''), null);
  assert.equal(parseWktPoint(undefined), null);
  assert.equal(parseWktPoint('Point(13.405 120)'), null, 'no latitude above 90, however the query phrased it');
  assert.equal(parseWktPoint('Point(200 52)'), null);
  // The order trap, stated: 2.2945 must be read as the LONGITUDE.
  assert.deepEqual(parseWktPoint('Point(2.2945 48.8584)'), { lat: 48.8584, lon: 2.2945 });
});

test('placesFromRows: a WKT column, a lat/lon pair, or nothing', () => {
  const wkt = placesFromRows(
    ['item', 'itemLabel', 'coord'],
    [
      { item: 'Q82425', itemLabel: 'Brandenburg Gate', coord: 'Point(13.377722 52.516272)' },
      { item: 'Q151356', itemLabel: 'Fernsehturm Berlin', coord: 'Point(13.409444 52.520833)' },
      { item: 'Q151963', itemLabel: 'Museum Island', coord: '' },
    ],
  );
  assert.equal(wkt.shape, 'wkt');
  assert.equal(wkt.points.length, 2, 'a row with no coordinate is not a place');
  assert.equal(wkt.labelVar, 'itemLabel');
  assert.equal(wkt.points[0].label, 'Brandenburg Gate');
  assert.ok(Math.abs(wkt.points[1].lat - 52.520833) < 1e-6, 'the second landmark is the Fernsehturm');
  assert.deepEqual(wkt.points.map((p) => p.row), [0, 1], 'the row index travels, so a caller can say which rows were dropped');

  const pair = placesFromRows(['label', 'lat', 'longitude', 'count'], [{ label: 'X', lat: 52.5, longitude: 13.4, count: 3 }]);
  assert.equal(pair.shape, 'pair');
  assert.equal(pair.points.length, 1);
  assert.equal(pair.points[0].label, 'X', 'a numeric column is never the label');

  // Out of range, and a table with no coordinates at all.
  assert.equal(placesFromRows(['label', 'lat', 'lon'], [{ label: 'X', lat: 120, lon: 13 }]).points.length, 0);
  assert.equal(placesFromRows(['label', 'count'], [{ label: 'X', count: 3 }]).shape, null);
  assert.equal(placesFromRows([], []).points.length, 0);
  assert.equal(hasPlaces(['coord'], [{ coord: 'Point(1 2)' }]), true);
  assert.equal(hasPlaces(['label', 'count'], [{ label: 'X', count: 1 }]), false);
});

test('fitPlaces: the largest zoom that still fits, and the shortest way round the globe', () => {
  const W = 800;
  const H = 640;
  const inside = (list, fit, zoom) => list.every(({ lat, lon }) => mercatorPixel({
    lat, lon, centerLat: fit.centerLat, centerLon: fit.centerLon, zoom, width: W, height: H,
  }).inside);

  const cities = [{ lat: 52.52, lon: 13.405 }, { lat: 48.8566, lon: 2.3522 }];
  const fit = fitPlaces(cities, { imageWidth: W, imageHeight: H });
  assert.ok(inside(cities, fit, fit.zoom), 'every point fits at the chosen zoom');
  assert.ok(!inside(cities, fit, fit.zoom + 1), 'and one more level would push a point outside — that is what "fits" means');
  assert.ok(fit.centerLat > 48.8 && fit.centerLat < 52.6 && fit.centerLon > 2.3 && fit.centerLon < 13.5, 'centred between them');

  // Across the date line: the centre is on the line, not halfway around the world from both islands.
  const pacific = [{ lat: -17.8, lon: 178.0 }, { lat: -13.583333, lon: -172.416667 }];
  const pacFit = fitPlaces(pacific, { imageWidth: W, imageHeight: H });
  assert.ok(pacFit.centerLon < -170 && pacFit.centerLon > -180, `centre on the date line, not ${pacFit.centerLon}`);
  assert.ok(inside(pacific, pacFit, pacFit.zoom), 'both islands fit — which is what the longitude wrap is for');
  assert.ok(!inside(pacific, pacFit, pacFit.zoom + 1));

  // One point has no extent: the caller's own zoom is the honest answer.
  assert.deepEqual(
    fitPlaces([{ lat: 52.52, lon: 13.405 }], { imageWidth: W, imageHeight: H }),
    { centerLat: 52.52, centerLon: 13.405, zoom: null, single: true, spanLon: 0, spanLat: 0 },
  );
  // A degenerate set is still a view, clamped rather than infinite.
  assert.equal(fitPlaces([{ lat: 52.52, lon: 13.405 }, { lat: 52.52, lon: 13.405 }], { imageWidth: W, imageHeight: H }).zoom, 17);
  assert.equal(fitPlaces([], { imageWidth: W, imageHeight: H }), null);
  assert.equal(fitPlaces(null, { imageWidth: W, imageHeight: H }), null);
  assert.equal(fitPlaces([{ lat: 'x', lon: 'y' }], { imageWidth: W, imageHeight: H }), null);
});
