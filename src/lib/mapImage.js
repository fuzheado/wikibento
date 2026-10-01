/**
 * Static maps, the no-JavaScript way (ISSUE-130 research, ISSUE-131 build).
 *
 * Kartographer's static map service draws a styled PNG of a coordinate, so a map needs no tiles, no Leaflet and no
 * layer of our own — and because it is a *single image* it survives 🖨️ Print and ⛶ Export → PNG, where a tiled map
 * rasterises badly. Verified 2026-09-29: `200`, `image/png`, `Access-Control-Allow-Origin: *`, and `?lang=de`
 * localises the labels. Wikimedia's Maps Terms of Use permit this tool — they allow *"a tool for Wikipedia editors"* —
 * with their light-use ask: no bulk download, no prefetch. One image per card, at the size the card actually is, is
 * inside that.
 *
 * Two things the service does NOT do, found by looking at the returned image rather than trusting the endpoint: it
 * draws **no marker** at the centre and carries **no attribution text**. Both are ours — the centre *is* the coordinate
 * we passed, so the pin is an overlay we control, and the credit line belongs to the card (and is never hidden by
 * edge-to-edge, because a licence is not decoration).
 */

export const MAP_STYLE = 'osm-intl';
export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 19;
export const MAP_DEFAULT_ZOOM = 13;
/** The service renders any size; the card's pixels are asked for at this multiple on a retina screen, so the map is
 *  crisp without a second asset. */
export const MAP_HI_DPI = 2;

/**
 * The sizes we are willing to ask for. This matters more than it looks.
 *
 * A map URL is one image per distinct `{w}x{h}`, and a browser caches by URL — so asking for the card's exact pixel
 * size and re-asking on every frame of a resize turns dragging a card's corner into dozens of requests against a
 * service whose terms say *"please respect our limited services and resources"* and forbid excessive downloading.
 * Measured the hard way on 2026-09-29: while building this the service started answering **403** to everything, then
 * answered 200 again after a pause. Quantising to this ladder means one URL per card, reused as the card is resized,
 * and cached by the browser afterwards.
 */
export const MAP_SIZE_LADDER = [320, 480, 640, 800, 1024, 1280, 1600, 2000];

/** The smallest ladder size that still covers `px`, so the map is never upscaled, and never asked for twice in a row. */
export function legalMapSize(px, min = 240) {
  const want = Math.max(min, Math.round(Number(px) || 0));
  return MAP_SIZE_LADDER.find((size) => size >= want) || MAP_SIZE_LADDER[MAP_SIZE_LADDER.length - 1];
}

const round6 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(6) : '0.000000';
};

export function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return MAP_DEFAULT_ZOOM;
  return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, Math.round(n)));
}

/** A two-letter code the service understands: `de-AT` → `de`, `FR_fr` → `fr`, nonsense → `en`. */
export function mapLanguage(value) {
  const code = String(value || '').toLowerCase().split(/[-_]/)[0].replace(/[^a-z]/g, '');
  return code.length === 2 || code === 'mul' ? code : 'en';
}

/**
 * The static map image. `width`/`height` are the card's own CSS pixels; `scale` multiplies them for the request, and
 * the caller displays the result at 1× — that is the whole retina story here.
 */
export function staticMapUrl({
  lat, lon, zoom = MAP_DEFAULT_ZOOM, width = 800, height = 500, lang = 'en', style = MAP_STYLE,
} = {}) {
  const z = clampZoom(zoom);
  // Both dimensions land on the ladder, so a card keeps one URL while it is dragged around (see MAP_SIZE_LADDER).
  const w = legalMapSize(width, 240);
  const h = legalMapSize(height, 180);
  return `https://maps.wikimedia.org/img/${style},${z},${round6(lat)},${round6(lon)},${w}x${h}.png?lang=${mapLanguage(lang)}`;
}

/** Where a click goes: the same place on OpenStreetMap, pinned at the coordinate the card drew. */
export function osmUrl(lat, lon, zoom = MAP_DEFAULT_ZOOM) {
  return `https://www.openstreetmap.org/?mlat=${round6(lat)}&mlon=${round6(lon)}`
    + `#map=${clampZoom(zoom)}/${round6(lat)}/${round6(lon)}`;
}

/** OpenStreetMap's licence requires visible attribution, so this is content, not chrome. */
export const OSM_ATTRIBUTION = { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' };

/**
 * What the `place` field means, decided in ONE place so the card, the fetcher and the tests agree.
 *
 * Returns one of:
 *   { kind: 'coordinate', lat, lon }   `48.8584, 2.2945` · `48.8584° N, 2.2945° E` · `48,2` · `-33.86; 151.21`
 *   { kind: 'item', id }               `Q64` · `http://www.wikidata.org/entity/Q64`
 *   { kind: 'title', title }           anything else — a page title, `_` → space
 *   { kind: 'invalid', reason }        numbers that are not a place on Earth
 *   { kind: 'empty' }
 */
export function parsePlace(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { kind: 'empty' };

  const qid = raw.match(/(?:^|\/entity\/)([Qq]\d{1,12})$/);
  if (qid) return { kind: 'item', id: qid[1].toUpperCase() };

  // Numeric-looking input only — a place name has no shape like this. Note that a bare number is INVALID, not a
  // title: `48.8584` is someone who forgot the longitude, and letting it through as a page title would render a
  // "page does not exist" card instead of saying what is wrong. (My own test caught this, which is why it is pinned.)
  const looksNumeric = /^[-+0-9.,;°\sNSEWnsew]+$/.test(raw) && /[0-9]/.test(raw);
  if (looksNumeric && !/[,;]/.test(raw)) {
    return { kind: 'invalid', reason: `${raw} needs two numbers: latitude, longitude` };
  }
  if (looksNumeric) {
    const parts = raw.replace(/°/g, ' ').trim().split(/\s*[,;]\s*/);
    if (parts.length === 2) {
      const one = (s, neg, pos) => {
        const t = s.trim().toUpperCase();
        const n = Number(t.replace(/[NSEW]/g, '').trim());
        if (!Number.isFinite(n)) return NaN;
        if (t.includes(neg)) return -n;
        if (t.includes(pos)) return n;
        return n;
      };
      const lat = one(parts[0], 'S', 'N');
      const lon = one(parts[1], 'W', 'E');
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { kind: 'coordinate', lat, lon };
        return { kind: 'invalid', reason: `${raw} is not a place on Earth (latitude ±90, longitude ±180)` };
      }
      return { kind: 'invalid', reason: `could not read ${raw} as a coordinate` };
    }
    return { kind: 'invalid', reason: `${raw} needs two numbers: latitude, longitude` };
  }

  return { kind: 'title', title: raw.replace(/_/g, ' ') };
}

/** The card's subtitle: the label and the coordinate, or the coordinate alone when the place has no name. */
export function placeSubtitle(label, lat, lon) {
  const at = `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`;
  return label ? `${label} · ${at}` : at;
}

/**
 * The same map, through this app's own server (`/api/staticmap`).
 *
 * The card uses this rather than the absolute URL above, and the reason is a browser limitation rather than a
 * preference: the map service refuses a request that looks like a browser's — measured 2026-09-29, it answers 403
 * with an HTML error page, which the browser then rejects as a cross-origin image (`net::ERR_BLOCKED_BY_ORB`) and
 * shows as a blank card. A page cannot set its own User-Agent; our server can, and the relay also caches. The
 * numbers are identical, so the service sees exactly the laddered sizes and nothing else.
 */
export function relayMapUrl({ lat, lon, zoom = MAP_DEFAULT_ZOOM, width = 800, height = 500, lang = 'en' } = {}) {
  const params = new URLSearchParams({
    z: String(clampZoom(zoom)),
    lat: round6(lat),
    lon: round6(lon),
    w: String(legalMapSize(width, 240)),
    h: String(legalMapSize(height, 180)),
    lang: mapLanguage(lang),
  });
  return `/api/staticmap?${params}`;
}

/** Web Mercator is only defined between these latitudes, where the projection runs to infinity. The map service
 *  renders nothing beyond them, so a point outside is clamped rather than producing `Infinity`. */
export const MAP_LAT_LIMIT = 85.05112878;

/**
 * The spine for every overlay the Map card will grow: **a static map is a Mercator window** (ISSUE-132).
 *
 * Given the centre, the zoom and the image size, any coordinate lands at a pixel by the same Web Mercator formula the
 * tile services draw with — so points, paths, polygons, icons and labels can be our own SVG over one static image,
 * with no map library, no tiles, and layers we can toggle. `x`/`y` are pixels in the *requested image* (the laddered
 * `w`×`h` from `staticMapUrl`), not in the card's CSS box: `object-fit: cover|contain` decides how that image meets the
 * box afterwards, so an overlay drawn in this space needs the same `viewBox`, not the card's measurements.
 *
 * The maths, stated once: at zoom `z` the world is `256 · 2^z` pixels square; longitude maps linearly across it —
 * and **longitude is circular**, so the difference from the centre is taken modulo the world: a set that spans the date
 * line is drawn on one map rather than flung 16,000 px off-screen, which is what an unwrapped subtraction does (found
 * by the auto-fit probe for a Fiji/Samoa pair, 2026-09-30). Latitude maps through the Mercator ordinate
 * `asinh(tan φ)`. That is the whole formula — which is exactly why it is worth checking against a real image rather
 * than trusting it, and `scripts/map-landmark-check.mjs` does: it fetches maps of known lakes and islands, predicts
 * where each landmark should be, and classifies the pixels there as water or land. An off-centre, mirrored or
 * mis-scaled projection fails it; so does a missing wrap, since a probe across the date line then falls outside the
 * image. Verified 2026-09-30 on five maps across both hemispheres — see that script's output in
 * `docs/VERIFIED-WORKING.md`.
 */
export function mercatorPixel({
  lat, lon, centerLat, centerLon, zoom = MAP_DEFAULT_ZOOM, width = 800, height = 500,
} = {}) {
  const z = clampZoom(zoom);
  const world = 256 * 2 ** z;
  const xOf = (v) => ((Number(v) + 180) / 360) * world;
  const yOf = (v) => {
    const clamped = Math.max(-MAP_LAT_LIMIT, Math.min(MAP_LAT_LIMIT, Number(v)));
    return ((1 - Math.asinh(Math.tan((clamped * Math.PI) / 180)) / Math.PI) / 2) * world;
  };
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  // Longitude is a circle: the shortest way round from the centre, in world pixels. Without this, a point at 178°E on a
  // map centred at 177°W is 355° away instead of 5°, which is a blank card rather than a Pacific one.
  const wrapWorld = (dx) => (((dx + world / 2) % world) + world) % world - world / 2;
  const x = wrapWorld(xOf(lon) - xOf(centerLon)) + w / 2;
  const y = yOf(lat) - yOf(centerLat) + h / 2;
  return { x, y, inside: x >= 0 && y >= 0 && x <= w && y <= h };
}
