import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toFeatureCollection, fromPoints, fromWkt, timesOf, labelOf, roleOf, vertexCount, collectionVertices,
  boundsOf, lengthKm, timeRange, toRows, featuresToRows, normalizeTime, simplifyGeometry,
  geojsonPayload, readGeojsonPayload, describeCollection, GEOJSON_LIMITS, GEOMETRY_TYPES,
} from '../src/lib/geojson.js';
import { buildTimeline, detectTimeline } from '../src/lib/timeline.js';

/**
 * Geometry as a standard, not a dialect (ISSUE-132).
 *
 * The decisions these tests pin are the ones that go wrong quietly: RFC 7946's `[longitude, latitude]` order (a swapped
 * pair is still a plausible coordinate, so only the *impossible* cases can be repaired), rings that must close, time
 * named the way STAC and OGC name it, precision never fabricated, sizes capped, and intake that repairs rather than
 * refuses — while never mutating the value a *producer* emitted.
 */

const MUSEUM_ISLAND = {   // the real shape of Wikidata's mapdata for Q151963: a MultiPolygon
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { label: 'Museum Island', wikidata: 'Q151963', role: 'area' },
    geometry: { type: 'MultiPolygon', coordinates: [[[[13.392, 52.518], [13.401, 52.518], [13.401, 52.523], [13.392, 52.518]]]] },
  }],
};

test('toFeatureCollection: a bare geometry, a Feature, an array or a JSON string all arrive shape-canonical', () => {
  const bare = toFeatureCollection({ type: 'Point', coordinates: [13.4, 52.5] });
  assert.equal(bare.error, null);
  assert.equal(bare.collection.type, 'FeatureCollection');
  assert.equal(bare.collection.features.length, 1);
  assert.equal(bare.collection.features[0].type, 'Feature');
  assert.deepEqual(bare.collection.features[0].properties, {});

  assert.equal(toFeatureCollection(MUSEUM_ISLAND).collection.features.length, 1);
  assert.equal(toFeatureCollection(JSON.stringify(MUSEUM_ISLAND)).collection.features.length, 1, 'a pasted string');
  assert.equal(toFeatureCollection([{ type: 'Point', coordinates: [1, 2] }, MUSEUM_ISLAND.features[0]]).collection.features.length, 2, 'an array');
  // An emitter's envelope unwraps, so a consumer accepts the payload or its contents.
  assert.equal(toFeatureCollection(geojsonPayload(MUSEUM_ISLAND)).collection.features.length, 1);
  // Nothing at all is not an error.
  assert.deepEqual(toFeatureCollection('').collection.features, []);
  assert.deepEqual(toFeatureCollection(null).collection.features, []);
  assert.equal(toFeatureCollection('').error, null);
});

test('toFeatureCollection: the unusable cases are refused by name, never guessed', () => {
  assert.match(toFeatureCollection('{"this is": "not json').error, /not JSON/);
  assert.match(toFeatureCollection({ type: 'Polygon' }).error, /with no coordinates/, 'a shape with no coordinates is refused, not drawn');
  assert.match(toFeatureCollection({ type: 'Feature', geometry: { type: 'Banana', coordinates: [] } }).error, /not one of the seven RFC 7946 geometry types/);
  // A projected CRS: coordinates in the millions. This is the pasted-EPSG:3857 case.
  const projected = toFeatureCollection({ type: 'Point', coordinates: [1480000, 6890000] });
  assert.match(projected.error, /WGS84/);
  assert.match(projected.error, /projected CRS/);
});

test('degenerate shapes are dropped with a report, and the rest of the board still renders', () => {
  const r = toFeatureCollection({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[1, 2]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0]]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [3, 4] } },
    ],
  });
  assert.equal(r.error, null, 'the board is not refused over one degenerate shape');
  assert.equal(r.collection.features.length, 1, 'the point survives');
  assert.match(r.warnings.join(' '), /too few positions/);
  // A triangle is the smallest legal ring: three corners plus the closing repeat.
  const triangle = toFeatureCollection({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] });
  assert.equal(triangle.collection.features.length, 1);
  assert.equal(triangle.collection.features[0].geometry.coordinates[0].length, 4);
});

test('toFeatureCollection: RFC order in, and only an impossible latitude is treated as a swap', () => {
  // 152.5 as a latitude is impossible, so the axes are the other way round — repairable.
  const swapped = toFeatureCollection({ type: 'Point', coordinates: [13.4, 152.5] });
  assert.deepEqual(swapped.collection.features[0].geometry.coordinates, [152.5, 13.4]);
  assert.match(swapped.warnings.join(' '), /swapped/);
  // [52.5, 13.4] is *ambiguous*: the RFC reads it as lon 52.5, lat 13.4 (Somalia), and so do we — documented, not guessed.
  assert.deepEqual(toFeatureCollection({ type: 'Point', coordinates: [52.5, 13.4] }).collection.features[0].geometry.coordinates, [52.5, 13.4]);
  // A longitude over 90 is perfectly legal and must not be touched.
  assert.deepEqual(toFeatureCollection({ type: 'Point', coordinates: [151.2, -33.86] }).collection.features[0].geometry.coordinates, [151.2, -33.86]);
});

test('toFeatureCollection: rings close, altitude goes, aliases resolve, a bad `times` is dropped', () => {
  const unclosed = toFeatureCollection({ type: 'Polygon', coordinates: [[[13.4, 52.5, 34], [13.5, 52.5], [13.5, 52.6]]] });
  const ring = unclosed.collection.features[0].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'the ring is closed');
  assert.equal(ring[0].length, 2, 'altitude dropped');
  assert.match(unclosed.warnings.join(' '), /not closed/);

  const timed = toFeatureCollection({
    type: 'Feature',
    properties: { when: '1944-08-04', end: '1945-04-15', times: ['a', 'b'] },
    geometry: { type: 'LineString', coordinates: [[13.4, 52.5], [13.5, 52.6], [13.6, 52.7]] },
  });
  const props = timed.collection.features[0].properties;
  assert.equal(props.datetime, '1944-08-04', 'KML’s `when` becomes the STAC/OGC name');
  assert.equal(props.end_datetime, '1945-04-15');
  assert.equal(props.when, undefined);
  assert.equal(props.times, undefined, '3 vertices but 2 times: dropped rather than guessed');
  assert.match(timed.warnings.join(' '), /times/);

  // A GeometryCollection is flattened into its parts.
  const flattened = toFeatureCollection({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, { type: 'Point', coordinates: [3, 4] }] });
  assert.equal(flattened.collection.features.length, 2);
  assert.match(flattened.warnings.join(' '), /flattened/);
});

test('toFeatureCollection never mutates the value a producer emitted', () => {
  // The map can be a *consumer* of another widget's geometry; a repair must not reach back into that widget's state.
  const emitted = JSON.parse(JSON.stringify({ type: 'Polygon', coordinates: [[[13.4, 52.5], [13.5, 52.5], [13.5, 52.6]]] }));
  const snapshot = JSON.stringify(emitted);
  const result = toFeatureCollection(emitted);
  assert.equal(JSON.stringify(emitted), snapshot, 'the input is untouched');
  assert.equal(result.collection.features[0].geometry.coordinates[0].length, 4, 'while our copy is repaired');
});

test('normalizeTime: Wikidata precision decides how much of the date is a fact', () => {
  assert.equal(normalizeTime('+1944-06-06T00:00:00Z', 9), '1944', 'a year-precision date is a year, not 1 January');
  assert.equal(normalizeTime('+1944-06-06T00:00:00Z', 10), '1944-06');
  assert.equal(normalizeTime('+1944-06-06T00:00:00Z', 11), '1944-06-06T00:00:00Z', 'day precision keeps what it has');
  assert.equal(normalizeTime('1944'), '1944');
  assert.equal(normalizeTime('-0044-03-15T00:00:00Z', 11), '-0044-03-15T00:00:00Z');
  assert.equal(normalizeTime(''), '');
});

test('sizes and shapes: the caps simplify, and say what they did', () => {
  const dense = { type: 'LineString', coordinates: Array.from({ length: 3000 }, (_, i) => [13.4 + i * 0.0001, 52.5 + Math.sin(i / 40) * 0.01]) };
  const big = toFeatureCollection(dense);
  const vertices = vertexCount(big.collection.features[0].geometry);
  assert.ok(vertices <= GEOJSON_LIMITS.verticesPerFeature, `${vertices} ≤ ${GEOJSON_LIMITS.verticesPerFeature}`);
  assert.ok(vertices >= 2);
  assert.match(big.warnings.join(' '), /simplified/);

  const many = toFeatureCollection(Array.from({ length: GEOJSON_LIMITS.features + 40 }, (_, i) => ({
    type: 'Point', coordinates: [-150 + (i % 300) * 0.6, -60 + (i % 120) * 0.5],
  })));
  assert.equal(many.collection.features.length, GEOJSON_LIMITS.features);
  assert.match(many.warnings.join(' '), /first 200/);

  // Simplification that changes the vertex count must not leave a `times` array describing the old one.
  const track = toFeatureCollection({
    type: 'Feature',
    properties: { times: Array.from({ length: 3000 }, (_, i) => `2020-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`) },
    geometry: dense,
  });
  assert.equal(track.collection.features[0].properties.times, undefined);
  assert.match(track.warnings.join(' '), /dropped per-vertex times/);
});

test('geometry maths: vertices, bounds, great-circle length, time range', () => {
  assert.equal(vertexCount(MUSEUM_ISLAND.features[0].geometry), 4);
  const bounds = boundsOf(MUSEUM_ISLAND);
  assert.deepEqual({ minLon: Math.round(bounds.minLon * 1000) / 1000, maxLat: Math.round(bounds.maxLat * 1000) / 1000 }, { minLon: 13.392, maxLat: 52.523 });
  assert.equal(collectionVertices(MUSEUM_ISLAND).length, 4);
  // One degree of latitude is ~111 km anywhere.
  assert.ok(Math.abs(lengthKm(fromPoints([{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }])) - 111.2) < 0.5);
  const timed = toFeatureCollection({
    type: 'Feature',
    properties: { datetime: '1944-08-04', start_datetime: '1942-07-06' },
    geometry: { type: 'Point', coordinates: [4.9, 52.4] },
  });
  assert.deepEqual(timeRange(timed.collection), { start: '1942-07-06', end: '1944-08-04' });
  assert.deepEqual(timeRange(MUSEUM_ISLAND), null);
});

test('rows: one per vertex for CSV/animation, one per feature for a timeline — in the timeline’s own shape', () => {
  const track = toFeatureCollection({
    type: 'Feature',
    properties: { label: 'The journey', role: 'path', times: ['1942-07-06', '1942-07-09', '1942-08-04'] },
    geometry: { type: 'LineString', coordinates: [[13.4, 52.5], [13.5, 52.6], [13.6, 52.7]] },
  });
  const rows = toRows(track.collection);
  assert.deepEqual(rows.map((r) => r.time), ['1942-07-06', '1942-07-09', '1942-08-04']);
  assert.deepEqual(rows.map((r) => r.index), [0, 1, 2]);
  assert.equal(rows[0].part, null, 'a line has no ring');
  assert.deepEqual([rows[0].lat, rows[0].lon], [52.5, 13.4], 'rows are lat/lon, not the wire order');

  // A polygon's rows carry the ring index.
  const rings = toRows(toFeatureCollection({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]], [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]]] }).collection);
  assert.deepEqual([...new Set(rings.map((r) => r.part))], [0, 1]);

  // The timeline hand-off: the rows and vars go straight into the real builder, with no conversion anywhere.
  const dated = toFeatureCollection([
    { type: 'Feature', properties: { label: 'Born', datetime: '1929-06-12', group: 'Anne Frank' }, geometry: { type: 'Point', coordinates: [4.9, 52.4] } },
    { type: 'Feature', properties: { label: 'Died', datetime: '1945-03', group: 'Anne Frank' }, geometry: { type: 'Point', coordinates: [9.9, 53.5] } },
    { type: 'Feature', properties: { label: 'March on Washington', datetime: '1963-08-28', group: 'MLK' }, geometry: { type: 'Point', coordinates: [-77.0, 38.9] } },
  ]);
  const { rows: timelineRows, vars } = featuresToRows(dated.collection);
  assert.deepEqual(vars, ['when', 'what', 'group']);
  assert.deepEqual(detectTimeline(timelineRows, vars), { timeVar: 'when', seriesVar: 'group', labelVar: 'what', kindVar: null });
  const tl = buildTimeline(timelineRows, vars);
  assert.deepEqual(tl.lanes.map((l) => l.label), ['Anne Frank', 'MLK']);
  assert.equal(tl.lanes[0].count, 2);
  assert.equal(tl.lanes[0].span, '1929–1945', 'reduced precision survives as reduced text');

  // With no group property there is one lane, and the column is not declared at all.
  const ungrouped = featuresToRows(toFeatureCollection(MUSEUM_ISLAND).collection);
  assert.deepEqual(ungrouped.vars, ['when', 'what'], 'an always-empty series column would name every lane “—”');
  assert.deepEqual(ungrouped.rows, [], 'and a shape with no time contributes no events');
});

test('fromPoints: the map’s own ordered list becomes a path, or an area when closed', () => {
  const line = fromPoints([{ lat: 52.5, lon: 13.4, label: 'A' }, { lat: 52.6, lon: 13.5, label: 'B' }]);
  assert.equal(line.features[0].geometry.type, 'LineString');
  assert.equal(roleOf(line.features[0]), 'path');
  const area = fromPoints([{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 1, lon: 1 }], { closed: true, properties: { label: 'Triangle' } });
  assert.equal(area.features[0].geometry.type, 'Polygon');
  assert.equal(roleOf(area.features[0]), 'area');
  assert.equal(labelOf(area.features[0]), 'Triangle');
  const ring = area.features[0].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'the ring is closed');
  assert.deepEqual(fromPoints([]).features, []);
  assert.deepEqual(fromPoints([{ lat: 1, lon: 2 }]).features, [], 'one point is not a path');
  assert.deepEqual(fromPoints([{ lat: 'x', lon: 'y' }]).features, []);
});

test('the typed envelope is strict, exactly like `speech`', () => {
  const collection = fromPoints([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]);
  const payload = geojsonPayload(collection);
  assert.equal(payload.type, 'geojson');
  assert.deepEqual(readGeojsonPayload(payload), collection);
  assert.equal(readGeojsonPayload(collection), null, 'a bare FeatureCollection is not our payload');
  assert.equal(readGeojsonPayload({ type: 'geojson' }), null);
  assert.equal(readGeojsonPayload('geojson'), null);
  assert.equal(readGeojsonPayload({ type: 'other', data: collection }), null);
  assert.equal(geojsonPayload({ type: 'FeatureCollection', features: [] }), undefined, 'nothing to emit, nothing emitted');
});

test('describeCollection: the honest one-liner the card shows', () => {
  assert.match(describeCollection(MUSEUM_ISLAND), /^1 shape · 4 vertices/);
  const note = describeCollection(MUSEUM_ISLAND, ['a polygon ring was not closed — closed it']);
  assert.match(note, /not closed/);
  assert.equal(describeCollection({ type: 'FeatureCollection', features: [] }), '');
});

test('WKT arrives from WDQS, longitude first, and becomes GeoJSON', () => {
  assert.deepEqual(fromWkt('Point(13.405 52.52)').features[0].geometry, { type: 'Point', coordinates: [13.405, 52.52] });
  const line = fromWkt('LINESTRING(13.4 52.5, 13.5 52.6)');
  assert.equal(line.features[0].geometry.type, 'LineString');
  assert.deepEqual(line.features[0].geometry.coordinates, [[13.4, 52.5], [13.5, 52.6]]);
  const poly = fromWkt('POLYGON((0 0, 1 0, 1 1, 0 0))');
  assert.equal(poly.features[0].geometry.type, 'Polygon');
  assert.equal(poly.features[0].geometry.coordinates[0].length, 4);
  assert.equal(fromWkt('LINESTRING(13.4 52.5, 13.5 52.6)').features[0].properties.role, 'path');
  assert.deepEqual(fromWkt('nonsense').features, []);
  assert.deepEqual(fromWkt('').features, []);
});

test('every geometry type we accept is one RFC 7946 names', () => {
  for (const t of GEOMETRY_TYPES) assert.ok(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(t));
  // The ones the upstreams actually return round-trip.
  for (const geometry of [
    { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] },
    { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]], [[5, 6], [7, 8]]] },
    { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] },
  ]) {
    const { collection, error } = toFeatureCollection(geometry);
    assert.equal(error, null, geometry.type);
    assert.equal(collection.features[0].geometry.type, geometry.type);
    assert.ok(vertexCount(collection.features[0].geometry) > 0);
  }
});
