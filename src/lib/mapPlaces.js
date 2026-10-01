/**
 * Places, from what a person typed or what a query returned (ISSUE-132).
 *
 * The Map widget's `place` field already has a vocabulary — a coordinate (`48.8584, 2.2945`), a Wikidata item (`Q64`),
 * or a page title — and the *list* of points uses the same one, one per line (`parsePlaceLines`). The SPARQL widget's
 * map renderer reads the other shape: a query result, where coordinates arrive either as a WKT `Point(lon lat)` literal
 * (`wdt:P625` on WDQS, and note the order — **longitude first**, which is the classic way to put Berlin in the Indian
 * Ocean) or as a pair of numeric columns.
 *
 * Everything here is pure: no fetch, no DOM. The network half is `fetchMapPoints`/`fetchMapView` in
 * `../widgets/dataSources.js`; the geometry is in `./mapOverlay.js`.
 */

import { parsePlace } from './mapImage.js';

/** The most places a card will resolve: one batch of 50 ids plus one of 50 titles is two requests each way, and a
 *  hundred dots is already more than a card can show without clustering. Extra lines are reported, not ignored. */
export const MAX_MAP_POINTS = 100;

/**
 * A textarea of places → `{ entries, skipped }`, each entry `{ input, parsed }` with `parsed` from `parsePlace`
 * (coordinate / item / title / invalid / empty). Blank lines and `#` comments are dropped; the first
 * `MAX_MAP_POINTS` are kept and the rest counted in `skipped`, so the card can say so rather than silently
 * dropping half of someone's list.
 */
export function parsePlaceLines(text) {
  const lines = String(text ?? '').split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const kept = lines.slice(0, MAX_MAP_POINTS);
  return {
    entries: kept.map((input) => ({ input, parsed: parsePlace(input) })),
    skipped: Math.max(0, lines.length - kept.length),
  };
}

/**
 * `Point(13.405 52.52)` → `{ lon: 13.405, lat: 52.52 }`. WKT says **longitude first** (x, y), so this deliberately
 * returns them in that order and the caller must not swap them by habit. A `SRID`/`CRS` prefix is tolerated, and
 * anything that is not a point returns null.
 */
export function parseWktPoint(value) {
  const m = String(value ?? '').match(/<[^>]*>\s*point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)|^\s*point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!m) return null;
  const lon = Number(m[1] ?? m[3]);
  const lat = Number(m[2] ?? m[4]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

const LAT_RE = /^(?:lat|latitude)$/i;
const LON_RE = /^(?:lon|lng|long|longitude)$/i;
const COORD_RE = /coord|location|point|geo/i;

/**
 * A query result → the places it contains, if any.
 *
 * Two shapes are recognised, and both are what the endpoints actually return:
 *   - a WKT column — `?coord` / `?location` / `?point` holding `Point(lon lat)`;
 *   - a lat/lon column pair — `?lat` + `?lon`, `?latitude` + `?longitude`.
 *
 * Returns `{ points, latVar, lonVar, labelVar, shape }` where `shape` is `'wkt' | 'pair' | null` and `points` is
 * `[{ lat, lon, label, row }]` — only rows with usable coordinates, so `points.length < rows.length` is a fact the
 * card can state rather than a silent loss. `labelVar` is the conventional `…Label` column when there is one,
 * otherwise the first non-numeric column that is not itself a coordinate.
 */
export function placesFromRows(vars, rows = []) {
  const list = Array.isArray(vars) ? vars : [];
  const numeric = (v) => rows.length > 0 && typeof rows[0][v] === 'number';
  const wktVar = list.find((v) => COORD_RE.test(v) && !numeric(v) && rows.some((r) => parseWktPoint(r[v])));
  const latVar = list.find((v) => LAT_RE.test(v));
  const lonVar = list.find((v) => LON_RE.test(v));
  const shape = wktVar ? 'wkt' : (latVar && lonVar ? 'pair' : null);
  if (!shape) return { points: [], latVar: null, lonVar: null, labelVar: null, shape: null };

  const labelVar = list.find((v) => /label$/i.test(v) && !numeric(v))
    || list.find((v) => !numeric(v) && v !== wktVar && v !== latVar && v !== lonVar);
  const points = [];
  rows.forEach((row, index) => {
    const at = shape === 'wkt' ? parseWktPoint(row[wktVar]) : { lat: Number(row[latVar]), lon: Number(row[lonVar]) };
    if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) return;
    if (at.lat < -90 || at.lat > 90 || at.lon < -180 || at.lon > 180) return;
    points.push({ lat: at.lat, lon: at.lon, label: labelVar ? String(row[labelVar] ?? '') : '', row: index });
  });
  return { points, latVar: latVar || null, lonVar: lonVar || null, labelVar: labelVar || null, shape };
}

/** Does this result draw a map? (What the SPARQL widget's `auto` renderer asks.) */
export function hasPlaces(vars, rows) {
  return placesFromRows(vars, rows).points.length > 0;
}
