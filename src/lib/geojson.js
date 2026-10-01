/**
 * Geometry, the standard way: **GeoJSON (RFC 7946)**, in and out (ISSUE-132).
 *
 * Everything here is one convention with a lot of prior art behind it, so that paths and polygons are not a WikiBento
 * dialect:
 *
 *   - **The wire value is a `FeatureCollection`** — never a bare geometry — because properties need a home, areas and
 *     paths can travel together, and a consumer then has exactly one shape to handle.
 *   - **Coordinates are `[longitude, latitude]` in WGS84 degrees**, the RFC's order, *not* our internal `{lat, lon}`.
 *     That order is the thing that goes wrong quietly (WKT is lon-first too, and a swapped pair is still a plausible
 *     coordinate), so the conversion happens in exactly two places: this module and `mapOverlay.js`.
 *   - **Time is a foreign member on `properties`, named the way STAC and OGC API–Features name it**:
 *     `datetime` (an instant), `start_datetime`/`end_datetime` (an interval). For a *moving* path — a track, a trip —
 *     `properties.times` carries one time per vertex, which is KML's `gx:Track` and GPX's `<trkpt><time>` in the form
 *     every animation layer already takes. OGC's MF-JSON (Moving Features) is the formal standard for that; this is
 *     the same idea, simplified.
 *   - **Precision is never fabricated.** Wikidata's year-precision dates stay `"1944"`, not `1944-01-01T00:00:00Z` —
 *     `src/lib/timeline.js` already reads dates that way and says so ("never more precision than the source asserted"),
 *     so a map's dates feed a timeline without conversion.
 *   - **Intake is liberal, the wire is canonical** (Postel, bounded): `when`/`date`/`time`/`timestamp` are accepted for
 *     `datetime`, `begin`/`end` for the interval, an unclosed ring is closed, a bare geometry or Feature is wrapped, a
 *     third position (altitude) is dropped, a 2-element ring is repaired. Every repair is *reported* — the
 *     `docs/JSON-FORMAT.md` severity model, applied to geometry.
 *   - **Refused, not guessed**: coordinates outside WGS84 when they are not a simple axis swap (a projected CRS — someone
 *     pasted EPSG:3857), an unknown geometry type, a ring with fewer than four positions, positions that are not numbers.
 *
 * Sizes are measured, not assumed (2026-10-01): Berlin's mapdata outline is 484 vertices / 13.6 KB, Germany's 948 / 26 KB,
 * a Wikdata geoline 422 / 11.9 KB — so the caps below are a safety net for a pasted country outline, not the normal path.
 * They exist because an emitted value is copied into board state, persisted in `localStorage` and `?config=` URLs, and
 * hashed for change detection (see the Emitter Contract in `docs/WIDGET-DEVELOPMENT.md`).
 */

/** RFC 7946 §1.4 — the seven geometry types. We render all of them except `GeometryCollection`, which is flattened into
 *  its members on intake (it is legal GeoJSON but it is a container, not a shape). */
export const GEOMETRY_TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];

/** The size/transfer policy the Emitter Contract asks of every emitting kind. */
export const GEOJSON_LIMITS = {
  features: 200,
  verticesPerFeature: 2000,
  bytes: 256 * 1024,
  /** Douglas–Peucker's first try, in degrees (≈ 1.1 km at the equator) — a *safety net*, and real mapdata is far under. */
  simplifyStepDeg: 0.01,
};

/** The properties this app reads. Everything else in a feature's `properties` passes through untouched. */
export const READ_PROPERTIES = ['label', 'wikidata', 'role', 'datetime', 'start_datetime', 'end_datetime', 'times'];

/** Accepted on intake, emitted canonically. `when` is KML's word; `date`/`time`/`timestamp` are what most exports use. */
const TIME_ALIASES = { when: 'datetime', date: 'datetime', time: 'datetime', timestamp: 'datetime', begin: 'start_datetime', end: 'end_datetime' };
const TIME_KEYS = ['datetime', 'start_datetime', 'end_datetime'];

const TYPE_OF_FEATURE = (f) => (f && typeof f === 'object' && f.type === 'Feature' ? (f.geometry || {}).type : null);
const warn = (list, message) => { list.push(message); };

/**
 * Wikidata's time to ISO 8601, **truncated to the precision the source claims**.
 *
 * Wikidata writes `+1944-06-06T00:00:00Z` with a precision code (9 = year, 10 = month, 11 = day); a year-precision date
 * is written as 1 January. Truncating here is what stops a fabricated midnight: `1944` is a fact, `1944-01-01` is not.
 * Without a precision code the value is kept as it is (minus Wikidata's leading `+`), and `timeline.js` applies its own
 * (equivalent) reading.
 */
export function normalizeTime(value, precision) {
  const s = String(value ?? '').trim().replace(/^\+/, '');
  if (!s) return '';
  const m = /^(-?\d{1,4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;                                   // a bare year, or something we do not understand — kept as-is
  const [year, month, day] = [m[1], m[2], m[3]];
  if (precision === 9) return year;
  if (precision === 10) return `${year}-${month}`;
  return s;                                           // day precision or better: keep whatever detail came with it
}

/** A coordinate pair, sanity-checked. */
function isPosition(v) {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(Number(v[0])) && Number.isFinite(Number(v[1]));
}

/** Every `[lon, lat]` position inside a geometry, in traversal order. */
function positionsOf(geometry) {
  const flat = [];
  const walk = (node) => {
    if (isPosition(node)) flat.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
  };
  walk(geometry?.coordinates);
  return flat;
}

/** Can any y-position be a latitude? If not, the axes are the other way round (or the file is projected). */
function axisVerdict(collection) {
  let yTooBig = false;
  let xTooBig = false;
  for (const f of collection.features) {
    for (const p of positionsOf(f.geometry)) {
      if (Math.abs(Number(p[1])) > 90.0000001) yTooBig = true;
      if (Math.abs(Number(p[0])) > 180.0000001) xTooBig = true;
    }
  }
  if (!yTooBig) return xTooBig ? 'out-of-range' : 'ok';
  return xTooBig ? 'out-of-range' : 'swapped';
}

/**
 * Any GeoJSON-ish input → a canonical FeatureCollection, with the repairs RFC 7946 lets us make and a report of what
 * they were. Returns `{ collection, warnings, error }`: `error` is set only for the *unusable* cases, and then nothing
 * is guessed — the caller shows it (the severity model in `docs/JSON-FORMAT.md`).
 *
 * Accepts: a FeatureCollection, a Feature, a bare geometry, an **array** of any of those, or a **JSON string** of any of
 * them (which is what `{{widget:id}}` interpolation and a pasted textarea produce).
 */
export function toFeatureCollection(value) {
  const warnings = [];
  let input = value;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { collection: emptyCollection(), warnings, error: null };
    try {
      input = JSON.parse(text);
    } catch {
      return { collection: emptyCollection(), warnings, error: 'not JSON — a geometry field takes GeoJSON (or a {{widget:id}} that emits it)' };
    }
  }
  if (input == null) return { collection: emptyCollection(), warnings, error: null };
  if (typeof input !== 'object') return { collection: emptyCollection(), warnings, error: 'GeoJSON must be an object or a JSON string' };

  // An envelope from another widget ({ type: 'geojson', data }) is unwrapped here, so a consumer can accept either the
  // payload or its contents.
  const payload = readGeojsonPayload(input);
  if (payload) input = payload;

  const collected = collect(input, warnings);
  if (collected.error) return { collection: emptyCollection(), warnings, error: collected.error };
  const features = collected.features;
  if (!features.length) return { collection: emptyCollection(), warnings, error: null };
  // Structural problems are *unusable*: a shape with no coordinates is usually the wrong key or a pasted fragment, and
  // drawing nothing quietly would hide that (the severity model in docs/JSON-FORMAT.md).
  const structural = features.map(geometryProblem).find(Boolean);
  if (structural) return { collection: emptyCollection(), warnings, error: structural };

  const repaired = features.map((f) => repairFeature(f, warnings));
  const shaped = repaired.filter(Boolean);
  const verdict = axisVerdict({ features: shaped });
  if (verdict === 'swapped') {
    warn(warnings, 'longitude and latitude looked swapped (a latitude above 90 is impossible) — swapped back');
    for (const f of shaped) f.geometry.coordinates = swapPositions(f.geometry.coordinates);
  } else if (verdict === 'out-of-range') {
    return {
      collection: emptyCollection(),
      warnings,
      error: 'coordinates outside WGS84 (±180 longitude, ±90 latitude) — GeoJSON is degrees, so this looks like a projected CRS (EPSG:3857?) or a corrupted geometry',
    };
  }

  let collection = { type: 'FeatureCollection', features: shaped };
  collection = enforceLimits(collection, warnings);
  return { collection, warnings, error: null };
}

function emptyCollection() { return { type: 'FeatureCollection', features: [] }; }

/** What is wrong with a geometry before we try to repair it — or null when it is at least shaped like GeoJSON. */
function geometryProblem(feature) {
  const g = feature?.geometry;
  if (!g || typeof g !== 'object') return 'a feature with no geometry';
  if (!GEOMETRY_TYPES.includes(g.type)) return `${JSON.stringify(g.type)} is not one of the seven RFC 7946 geometry types`;
  if (g.type === 'GeometryCollection') return null;
  if (!Array.isArray(g.coordinates) || !g.coordinates.length) return `a ${g.type} with no coordinates (the key is missing or empty)`;
  if (positionsOf(g).length === 0) return `a ${g.type} whose coordinates hold no positions`;
  return null;
}

/** Too few positions to be a shape at all (a line needs two, a ring three): repaired by dropping it, with a report. */
function minimumShapeOk(g) {
  const okLine = (line) => Array.isArray(line) && line.length >= 2;
  // RFC 7946 §3.1.6: a linear ring has *four* or more positions (three corners plus the closing repeat).
  const okRing = (ring) => Array.isArray(ring) && ring.length >= 4;
  const okAll = (list, ok) => Array.isArray(list) && list.length > 0 && list.every(ok);
  if (g.type === 'LineString') return okLine(g.coordinates);
  if (g.type === 'MultiLineString') return okAll(g.coordinates, okLine);
  if (g.type === 'Polygon') return okAll(g.coordinates, okRing);
  if (g.type === 'MultiPolygon') return okAll(g.coordinates, (poly) => okAll(poly, okRing));
  return true;
}

/** FeatureCollection | Feature | geometry | array → an array of features (plus the GeometryCollection flattening). */
function collect(input, warnings) {
  const out = [];
  const pushGeojson = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'FeatureCollection') { (Array.isArray(node.features) ? node.features : []).forEach((f) => out.push(f)); return true; }
    if (node.type === 'Feature') { out.push(node); return true; }
    if (GEOMETRY_TYPES.includes(node.type)) {
      if (node.type === 'GeometryCollection') {
        const parts = Array.isArray(node.geometries) ? node.geometries : [];
        warn(warnings, 'a GeometryCollection was flattened into its parts (we draw shapes, not containers)');
        parts.forEach((g) => out.push({ type: 'Feature', properties: {}, geometry: g }));
      } else {
        out.push({ type: 'Feature', properties: {}, geometry: node });
      }
      return true;
    }
    return false;
  };
  if (Array.isArray(input)) {
    // One call per element, not a short-circuiting iteration: a `some()` stops at the first truthy result, which
    // silently kept only the FIRST feature of an array — the shape a board or another widget most often hands us.
    input.forEach(pushGeojson);
    if (!out.length) return { error: 'an array of GeoJSON objects, a Feature, a geometry — none of them looked like GeoJSON' };
    return { features: out };
  }
  if (!pushGeojson(input)) {
    return { error: `not GeoJSON — no FeatureCollection, Feature or geometry type (found ${JSON.stringify(input.type ?? Object.keys(input).slice(0, 3))})` };
  }
  return { features: out };
}

function swapPositions(coords) {
  if (!Array.isArray(coords)) return coords;
  if (isPosition(coords)) return [Number(coords[1]), Number(coords[0]), ...coords.slice(2)];
  return coords.map(swapPositions);
}

/** Close rings, drop altitude, move time aliases to their canonical names. */
function repairFeature(feature, warnings) {
  if (!feature || feature.type !== 'Feature' || !feature.geometry || typeof feature.geometry !== 'object') return null;
  // Cloned, because a geometry may have arrived from another widget's emitted value: repairs must never reach back into
  // the producer's board state.
  const geometry = typeof structuredClone === 'function'
    ? structuredClone(feature.geometry)
    : JSON.parse(JSON.stringify(feature.geometry));
  if (!GEOMETRY_TYPES.includes(geometry.type)) return null;
  const properties = { ...(feature.properties && typeof feature.properties === 'object' ? feature.properties : {}) };

  for (const [alias, canonical] of Object.entries(TIME_ALIASES)) {
    if (properties[canonical] === undefined && properties[alias] !== undefined) {
      properties[canonical] = properties[alias];
      delete properties[alias];
      warn(warnings, `“${alias}” was read as ${canonical} (the STAC/OGC name; ${alias} is KML/exports)`);
    }
  }
  for (const key of TIME_KEYS) {
    if (properties[key] !== undefined && typeof properties[key] !== 'string') properties[key] = String(properties[key]);
  }
  if (properties.times !== undefined) {
    const times = Array.isArray(properties.times) ? properties.times.map((t) => String(t)) : null;
    const count = vertexCount(geometry);
    if (!times) { delete properties.times; warn(warnings, '`times` was not an array — dropped'); }
    else if (times.length !== count) {
      delete properties.times;
      warn(warnings, `\`times\` has ${times.length} entries for ${count} vertices — dropped rather than guess which vertex each time belongs to`);
    }
  }

  const trim = (coords) => {
    if (isPosition(coords)) return [Number(coords[0]), Number(coords[1])];
    return Array.isArray(coords) ? coords.map(trim) : coords;
  };
  geometry.coordinates = trim(geometry.coordinates);

  // A ring must be closed (RFC 7946 §3.1.6) and needs four positions.
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  for (const polygon of rings) {
    for (const ring of Array.isArray(polygon) ? polygon : []) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
        warn(warnings, 'a polygon ring was not closed — closed it (RFC 7946 §3.1.6)');
      }
    }
  }
  if (!minimumShapeOk(geometry)) {
    warn(warnings, `a ${geometry.type} with too few positions was dropped (a line needs two, a ring four — RFC 7946 §3.1.6)`);
    return null;
  }
  return { type: 'Feature', properties, geometry };
}

/** Positions in a geometry (a Point counts as one). */
export function vertexCount(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).reduce((n, g) => n + vertexCount(g), 0);
  return positionsOf(geometry).length;
}

/** The `{lat, lon}` list a view needs — for framing a map on a shape (`fitPlaces` takes exactly this). */
export function collectionVertices(collection) {
  const out = [];
  for (const f of collection?.features || []) {
    for (const p of positionsOf(f.geometry)) out.push({ lon: Number(p[0]), lat: Number(p[1]) });
  }
  return out;
}

export function boundsOf(collection) {
  const points = collectionVertices(collection);
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
}

/** Great-circle distance through every line, in km (for an area this is its perimeter — said so by the caller's label). */
export function lengthKm(collection) {
  const R = 6371.0088;
  const rad = (d) => (d * Math.PI) / 180;
  const segment = (a, b) => {
    const dLat = rad(b[1] - a[1]);
    const dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  let total = 0;
  const walkLine = (line) => {
    for (let i = 1; i < line.length; i += 1) {
      if (isPosition(line[i - 1]) && isPosition(line[i])) total += segment(line[i - 1], line[i]);
    }
  };
  for (const f of collection?.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') walkLine(g.coordinates);
    else if (g.type === 'MultiLineString') (g.coordinates || []).forEach(walkLine);
    else if (g.type === 'Polygon') (g.coordinates || []).forEach(walkLine);
    else if (g.type === 'MultiPolygon') (g.coordinates || []).forEach((poly) => (poly || []).forEach(walkLine));
  }
  return Math.round(total * 10) / 10;
}

/** `{ start, end }` across every feature's time, or null. ISO 8601 sorts lexicographically, so this needs no parser. */
export function timeRange(collection) {
  const stamps = [];
  for (const f of collection?.features || []) {
    const p = f.properties || {};
    const start = p.start_datetime || p.datetime;
    const end = p.end_datetime || p.datetime;
    if (start) stamps.push(start);
    if (end) stamps.push(end);
    const times = Array.isArray(p.times) ? p.times : [];
    if (times.length) { stamps.push(times[0]); stamps.push(times[times.length - 1]); }
  }
  if (!stamps.length) return null;
  stamps.sort();
  return { start: stamps[0], end: stamps[stamps.length - 1] };
}

export function timesOf(feature) {
  const t = feature?.properties?.times;
  return Array.isArray(t) ? t : [];
}

export function labelOf(feature) {
  const p = feature?.properties || {};
  return String(p.label || p.title || p.name || '').trim();
}

export function roleOf(feature) {
  const role = feature?.properties?.role;
  if (role === 'path' || role === 'area' || role === 'stop') return role;
  const type = TYPE_OF_FEATURE(feature);
  if (type === 'Point' || type === 'MultiPoint') return 'stop';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'area';
  return 'path';
}

/**
 * The size policy: too many vertices → **simplify** (Douglas–Peucker, the standard algorithm, with a tolerance that
 * grows until it fits) and say so; too many features → keep the first `features` and say so. A board the reader typed is
 * never silently redrawn — every change here is in the returned warnings.
 */
function enforceLimits(collection, warnings) {
  let features = collection.features;
  if (features.length > GEOJSON_LIMITS.features) {
    warn(warnings, `${features.length} features — showing the first ${GEOJSON_LIMITS.features} (the cap keeps a board saveable and shareable)`);
    features = features.slice(0, GEOJSON_LIMITS.features);
  }
  let simplified = 0;
  let removed = 0;
  features = features.map((f) => {
    const before = vertexCount(f.geometry);
    if (before <= GEOJSON_LIMITS.verticesPerFeature) return f;
    let geometry = f.geometry;
    for (let tolerance = GEOJSON_LIMITS.simplifyStepDeg; tolerance <= 4; tolerance *= 2) {
      geometry = simplifyGeometry(geometry, tolerance);
      if (vertexCount(geometry) <= GEOJSON_LIMITS.verticesPerFeature) break;
    }
    const after = vertexCount(geometry);
    simplified += 1;
    removed += Math.max(0, before - after);
    if (Array.isArray(f.properties?.times) && f.properties.times.length !== after) {
      const { times, ...rest } = f.properties;
      warn(warnings, `simplifying ${labelOf(f) || 'a feature'} dropped per-vertex times (${times.length} → ${after} vertices)`);
      return { ...f, properties: rest, geometry };
    }
    return { ...f, geometry };
  });
  if (simplified) warn(warnings, `simplified ${simplified} feature${simplified === 1 ? '' : 's'} (${removed} vertices removed) to stay under ${GEOJSON_LIMITS.verticesPerFeature} per feature`);
  return { type: 'FeatureCollection', features };
}

/** Douglas–Peucker over one line (open or closed). Standard, and deliberately tolerance-in-degrees: this is display
 *  simplification, so a degrees tolerance is honest about what it is (≈111 km per degree of latitude). */
function simplifyLine(line, tolerance) {
  if (!Array.isArray(line) || line.length <= 2) return line;
  const closed = line.length > 3 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
  const keep = new Array(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;
  const sq = (a, b, p) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    if (!len) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx;
    const y = a[1] + t * dy;
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  const tol2 = tolerance * tolerance;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let worst = -1;
    let at = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = sq(line[start], line[end], line[i]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol2 && at > 0) {
      keep[at] = true;
      stack.push([start, at], [at, end]);
    }
  }
  const out = line.filter((_, i) => keep[i]);
  // A ring must stay closed and keep ≥ 4 positions; a line must keep ≥ 2.
  if (closed) {
    if (out.length < 4) return line;
    out[out.length - 1] = [out[0][0], out[0][1]];
    return out;
  }
  return out.length >= 2 ? out : line;
}

export function simplifyGeometry(geometry, tolerance) {
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return { ...geometry, coordinates: geometry.type === 'LineString' ? simplifyLine(geometry.coordinates, tolerance) : geometry.coordinates.map((l) => simplifyLine(l, tolerance)) };
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const rings = (polygon) => (polygon || []).map((ring) => simplifyLine(ring, tolerance));
    return { ...geometry, coordinates: geometry.type === 'Polygon' ? rings(geometry.coordinates) : geometry.coordinates.map(rings) };
  }
  return geometry;
}

/**
 * One row per vertex — the shape CSV and animation layers (kepler.gl's Trip layer, deck.gl's TripsLayer) want, and a
 * `times` array turns into a per-row `time`.
 */
export function toRows(collection) {
  const rows = [];
  let index = 0;
  const walk = (feature) => {
    const times = timesOf(feature);
    // `part` is the ring index for a polygon and the line index for a MultiLineString — null where the concept does not
    // apply, rather than a 0 that reads like a real ring.
    const push = (p, part) => {
      const at = index;
      index += 1;
      rows.push({ index: at, part, lat: Number(p[1]), lon: Number(p[0]), time: times[at] ?? '' });
    };
    const g = feature.geometry;
    if (!g) return;
    if (g.type === 'Point') push(g.coordinates, null);
    else if (g.type === 'MultiPoint') g.coordinates.forEach((p) => push(p, null));
    else if (g.type === 'LineString') g.coordinates.forEach((p) => push(p, null));
    else if (g.type === 'MultiLineString') g.coordinates.forEach((line, i) => line.forEach((p) => push(p, i)));
    else if (g.type === 'Polygon') g.coordinates.forEach((ring, i) => ring.forEach((p) => push(p, i)));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly) => poly.forEach((ring, i) => ring.forEach((p) => push(p, i))));
  };
  (collection?.features || []).forEach(walk);
  return rows;
}

/**
 * One row per feature, in the exact shape `buildTimeline` reads (`vars` + row objects) — which is how a shape becomes a
 * timeline: the dates need no conversion, because `parseTimelineDate` already reads ISO 8601 and reduced precision.
 */
export function featuresToRows(collection) {
  const rows = [];
  for (const f of collection?.features || []) {
    const p = f.properties || {};
    const times = timesOf(f);
    const when = p.datetime || p.start_datetime || (times.length ? times[0] : '');
    if (!when) continue;
    // `group` only when the data says so: a route's stops belong on ONE lane, and a set of features that each carried a
    // Wikidata id would otherwise become one lane each.
    rows.push({ when, what: labelOf(f) || `${roleOf(f)} (${vertexCount(f.geometry)} vertices)`, group: p.group == null ? '' : String(p.group) });
  }
  // `group` is only declared as a column when something actually carries one: an always-empty series column would make
  // `buildTimeline` name every lane "—" instead of using its own single-lane default.
  const grouped = rows.some((r) => r.group);
  return { rows, vars: grouped ? ['when', 'what', 'group'] : ['when', 'what'] };
}

/**
 * The map's own ordered list of places → one LineString (or a Polygon when `closed`), which is what turns "these stops,
 * in this order" into geometry without either side inventing a format.
 */
export function fromPoints(points, { mode = null, closed = false, properties = {} } = {}) {
  const clean = (Array.isArray(points) ? points : [])
    .filter((p) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)));
  const kind = mode || (closed ? 'area' : 'path');
  const list = clean.map((p) => [Number(p.lon), Number(p.lat)]);
  const label = (p, i) => String(p?.label ?? '').trim() || `Point ${i + 1}`;

  if (kind === 'markers') {
    // One Point feature per place, each with its own label — so a map publishes *places*, and a consumer can show
    // which is which. A single place is still a legal collection of one.
    const features = clean.map((p, i) => ({
      type: 'Feature',
      properties: { role: 'stop', label: label(p, i), ...(p?.kind === 'item' && p?.item ? { wikidata: p.item } : {}) },
      geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] },
    }));
    return features.length ? { type: 'FeatureCollection', features } : emptyCollection();
  }
  if (list.length < 2) return emptyCollection();
  if (kind === 'area' && list.length >= 3) {
    const ring = [...list, [list[0][0], list[0][1]]];
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'area', ...properties }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'path', ...properties }, geometry: { type: 'LineString', coordinates: list } }] };
}

/**
 * WKT → GeoJSON (the one-way door the SPARQL path needs: WDQS returns `wdt:P625` as a WKT literal).
 *
 * **WKT is longitude first too** (`Point(13.405 52.52)`), so nothing is swapped here — both formats agree on the order,
 * which is exactly why a mistake is invisible. Accepted: the six geometry types, an optional `SRID=4326;` or `<uri>`
 * prefix, `Z`/`M`/`ZM` dimensionality (the third ordinate is dropped, as everywhere else), and both spellings of
 * MULTIPOINT. Anything unparseable returns an empty collection: a broken literal is "no geometry", not a guess.
 *
 * The grammar matters and is easy to get wrong: **whitespace separates the ordinates of one position, and a comma
 * separates positions** — `LINESTRING(13.4 52.5, 13.5 52.6)` is two positions, not four numbers. Parentheses group
 * positions, and the *depth* of that grouping is what the type declares (a position, a list of positions, a list of
 * rings, …), so the reader checks the depth against the type rather than guessing.
 */
export function fromWkt(text) {
  const raw = String(text ?? '').trim().replace(/^<[^>]*>\s*/, '').replace(/^SRID=\d+;/i, '').trim();
  const head = /^(MULTIPOLYGON|MULTILINESTRING|MULTIPOINT|LINESTRING|POLYGON|POINT)\s*(?:Z|M|ZM)?\s*\(/i.exec(raw);
  if (!head) return emptyCollection();
  const type = { POINT: 'Point', MULTIPOINT: 'MultiPoint', LINESTRING: 'LineString', MULTILINESTRING: 'MultiLineString', POLYGON: 'Polygon', MULTIPOLYGON: 'MultiPolygon' }[head[1].toUpperCase()];
  let parsed;
  try {
    // Everything inside the type's own parentheses; nested parentheses stay, and group positions.
    parsed = parseNestedWkt(raw.slice(head[0].length, raw.lastIndexOf(')')));
  } catch {
    return emptyCollection();
  }
  const coordinates = wktCoordinates(type, parsed);
  if (!coordinates) return emptyCollection();
  const role = type === 'Point' || type === 'MultiPoint' ? 'stop' : (type === 'Polygon' || type === 'MultiPolygon' ? 'area' : 'path');
  // Through the same intake as everything else, so a WKT literal is repaired (rings closed, ordinates trimmed) and
  // capped like a pasted file.
  return toFeatureCollection({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role }, geometry: { type, coordinates } }] }).collection;
}

/** `(1 2, 3 4)` → nested arrays: positions are the leaves, parentheses group them, commas separate positions,
 *  whitespace only ends a number. */
function parseNestedWkt(text) {
  const stack = [[]];
  let number = '';
  let position = [];
  const endNumber = () => {
    if (number.trim() === '') { number = ''; return; }
    const n = Number(number);
    if (!Number.isFinite(n)) throw new Error('bad number');
    position.push(n);
    number = '';
  };
  const endPosition = () => {
    endNumber();
    if (position.length) {
      stack[stack.length - 1].push(position.length === 1 ? position[0] : position);
      position = [];
    }
  };
  for (const ch of text) {
    if (/[0-9+\-.eE]/.test(ch)) { number += ch; continue; }
    if (ch === '(') { endPosition(); const child = []; stack[stack.length - 1].push(child); stack.push(child); continue; }
    if (ch === ')') { endPosition(); if (stack.length === 1) throw new Error('unbalanced'); stack.pop(); continue; }
    if (ch === ',') { endPosition(); continue; }
    if (/\s/.test(ch)) { endNumber(); continue; }
    throw new Error('unexpected token');
  }
  endPosition();
  if (stack.length !== 1) throw new Error('unbalanced');
  return stack[0];
}

const isWktPosition = (node) => Array.isArray(node) && node.length >= 2 && node.every((v) => typeof v === 'number');

/** 0 = one position, 1 = a list of positions, 2 = a list of lists, … — `-1` when the shape is ragged. */
function wktShapeDepth(node) {
  if (isWktPosition(node)) return 0;
  if (!Array.isArray(node) || !node.length) return -1;
  const depths = node.map(wktShapeDepth);
  return depths.every((d) => d === depths[0]) && depths[0] >= 0 ? depths[0] + 1 : -1;
}

/** Every position under a node, in order — what a MultiPoint is, however it was parenthesised. */
function wktPositions(node) {
  if (isWktPosition(node)) return [[node[0], node[1]]];
  return Array.isArray(node) ? node.flatMap(wktPositions) : [];
}

const normaliseWktPositions = (node) => (isWktPosition(node) ? [node[0], node[1]] : node.map(normaliseWktPositions));

/** The depth each type declares (RFC 7946's nesting, which is WKT's too). */
const WKT_DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

function wktCoordinates(type, parsed) {
  // A MultiPoint is a list of positions whatever the brackets do: both `((1 2),(3 4))` spellings are legal.
  if (type === 'MultiPoint') {
    const points = wktPositions(parsed);
    return points.length ? points : null;
  }
  let node = parsed;
  let depth = wktShapeDepth(node);
  // Unwrap any single-wrapper level the literal added (`Polygon((…))` needs its ring brackets; a redundant outer pair
  // does not), then insist the depth matches the type.
  while (depth > WKT_DEPTH[type] && Array.isArray(node) && node.length === 1) {
    node = node[0];
    depth = wktShapeDepth(node);
  }
  if (depth !== WKT_DEPTH[type]) return null;
  const coordinates = normaliseWktPositions(node);
  // A LineString needs two positions, a ring three; anything shorter is not a shape.
  if (type === 'LineString' && coordinates.length < 2) return null;
  if (type === 'Polygon' && coordinates.some((ring) => !Array.isArray(ring) || ring.length < 3)) return null;
  return coordinates;
}

/** The wire value: a typed envelope, so a plain object in a text field is not mistaken for an emitter's geometry
 *  (`readSpeechPayload`'s rule, for the same reason). */
export function geojsonPayload(collection) {
  if (!collection || !Array.isArray(collection.features) || !collection.features.length) return undefined;
  return { type: 'geojson', data: collection };
}

export function readGeojsonPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.type !== 'geojson') return null;
  const data = value.data;
  if (!data || typeof data !== 'object') return null;
  if (data.type !== 'FeatureCollection' && data.type !== 'Feature' && !GEOMETRY_TYPES.includes(data.type)) return null;
  return data;
}

/** A short, honest summary for the card's note. */
export function describeCollection(collection, warnings = []) {
  const features = collection?.features || [];
  if (!features.length) return '';
  const vertices = features.reduce((n, f) => n + vertexCount(f.geometry), 0);
  const parts = [`${features.length} shape${features.length === 1 ? '' : 's'}`, `${vertices} vertices`];
  const range = timeRange(collection);
  if (range) parts.push(range.start === range.end ? range.start : `${range.start} → ${range.end}`);
  if (warnings.length) parts.push(warnings[0]);
  return parts.join(' · ');
}
