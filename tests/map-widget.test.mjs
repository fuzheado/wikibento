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
  MAP_SIZE_LADDER, staticMapUrl, relayMapUrl, osmUrl, parsePlace, placeSubtitle, clampZoom, mapLanguage, legalMapSize, MAP_DEFAULT_ZOOM, OSM_ATTRIBUTION,
} from '../src/lib/mapImage.js';

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
