/**
 * The media plate — what sits BEHIND a picture (issue #111, 2026-10-08).
 *
 * Every image site used to paint the app's own dark background behind its media (`background: var(--bg)`,
 * `#0f1117`). Commons renders **SVG files and transparent PNGs onto transparency**, and diagram line art is
 * usually **black**, so the drawing arrived as black on near-black: present, and unreadable. Measured
 * 2026-10-08, with the pixels read back rather than assumed:
 *
 *   · `File:Symbol_question.svg` standard thumb → RGBA, corner `(0,0,0,0)`, drawing black.
 *   · the same file as `…Symbol_question.svg.jpg` → `200`, **RGB, corner `(0,0,0,255)`**: Commons flattens
 *     vector → JPEG onto BLACK, so the obvious "just ask for a JPEG" trick makes it worse. Do not use it.
 *   · a transparent PNG (`File:Cscr-featured.png`) → RGBA, corners transparent; its `.jpg` variant → **404**.
 *     There is no server-side white-flatten for PNGs either.
 *   · `…svg.png?bgcolor=white` → byte-identical to the plain request; the parameter is ignored.
 *   · a `200` thumbnail carries `access-control-allow-origin: *`, so a client-side canvas readback is
 *     possible — that is the route to detecting a transparent *raster* (`auto` cannot today; see below).
 *
 * So the plate has to come from the app, and it is a property of the **media**, not of the user's theme:
 * a dark-mode user still needs a light plate behind a diagram.
 *
 * `auto` (the default) is decided **per image, not per card**, because a light plate is harmless behind an
 * opaque photograph but would repaint the letterbox of every photo gallery white. The signal is the file
 * itself: a Commons thumb URL keeps the source file's name, so a vector reads as `….svg.png` — no request
 * needed. A transparent *raster* cannot be told from an opaque one by URL, which is what `light` is for.
 */

/** The settings the ⚙ panel offers. Shared as one object so the field's wording cannot drift per widget. */
export const MEDIA_PLATE_OPTIONS = [
  { value: 'auto', label: 'Automatic (a plate where the picture is transparent)' },
  { value: 'light', label: 'Light (every image)' },
  { value: 'dark', label: 'Dark (the old behaviour)' },
  { value: 'none', label: 'None (the card shows through)' },
];

/** The registry default, and the fallback for anything a hand-written board puts in the field. */
export const MEDIA_PLATE_DEFAULT = 'auto';

const PLATES = ['auto', 'light', 'dark', 'none'];

/** Normalize whatever is in the config: unknown values (a typo, a colour we do not support yet) mean `auto`. */
export function plateChoice(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return PLATES.includes(v) ? v : MEDIA_PLATE_DEFAULT;
}

/**
 * Does this URL point at a vector file? Commons keeps the source name in the thumb URL, so an SVG reads as
 * `…/thumb/d/d5/Thing.svg/500px-Thing.svg.png` and the raw file as `…/Thing.svg`. Case-insensitive, and it
 * must survive a query string (`?utm_source=…`, which the API appends).
 */
export function isVectorMedia(url) {
  const path = String(url || '').split(/[?#]/)[0];
  return /\.svg$/i.test(path) || /\.svg\./i.test(path);
}

/**
 * The plate fragment for a CARD, from its `mediaBackground` value.
 *
 * Returns a class fragment **with its leading space**, or `''` — so a call site concatenates it with no
 * ternary of its own. `auto` returns `''` because the decision belongs to each image; the other three are
 * card-wide, and `dark` is explicit so a board can restore the old behaviour after the default changed.
 */
export function bodyPlateClass(value) {
  const choice = plateChoice(value);
  return choice === 'auto' ? '' : ` plate-${choice}`;
}

/**
 * The plate fragment for one IMAGE, given the card's setting and the image's URL.
 *
 * Only `auto` is per image: a vector gets the light plate, everything else is left to the card. An explicit
 * `light` / `dark` / `none` is already on the frame, so this contributes nothing (otherwise a `none` card
 * with an SVG in it would plate that one image, which is not what `none` means).
 */
export function imagePlateClass(value, url) {
  return plateChoice(value) === 'auto' && isVectorMedia(url) ? ' plate-vector' : '';
}

/* ── Transparent RASTERS ─────────────────────────────────────────────────────────────────────────
   A vector is visible in the URL; a transparent PNG is not. No Commons parameter produces a white-backed
   rendition of one (measured: the forced `.jpg` variant of a transparent PNG is a 404, and
   `?bgcolor=white` is byte-identical to the plain request), so the app finds out for itself — by looking at
   the pixels it has already downloaded. A thumbnail arrives with `access-control-allow-origin: *`
   (measured), which is what makes a canvas readback legal instead of a tainted-canvas SecurityError.

   The check is narrow on purpose: the four corners of a tiny (8×8) scaled draw. An opaque picture — every
   JPEG, scans, screenshots — answers "no" at the first corner, and a picture with transparent corners is
   exactly the letterbox an `object-fit: contain` tile fills with the card's own background. Two bounds keep
   it honest and cheap: a format that cannot carry alpha (`.jpg`) is never fetched again (see
   `mayHaveAlpha`, which is what keeps photo galleries free of the extra decode), and the readback is
   best-effort — an error, a tainted canvas or a missing 2D context means "no plate", never a broken image.
   Answers are cached per URL and queued (`MAX_ALPHA_IN_FLIGHT`) so a 40-tile gallery cannot start 40
   decodes at once.

   And the plate has a DIRECTION. Transparency alone does not mean "needs a white background": white line art
   designed for a dark page is just as transparent, and a white plate would swallow it — the mirror of the bug
   this whole module exists for. So the same readback also measures the INK: the mean luminance of the pixels
   that are not transparent. Dark ink gets the light plate; light ink gets the dark card background back, which
   is what `plate-alpha-dark` says. (Measured on real files, 2026-10-08: `File:Cscr-featured.png` ink 131.9 ->
   light plate; `File:Globe Icon White.png` ink 255.0 -> dark plate.) */

/** Alpha at or below this (out of 255) counts as transparent. Anti-aliased edges sit well above it. */
export const ALPHA_CORNER_THRESHOLD = 64;

/** The readback is a scaled draw at this size — corners are corners at any resolution. */
export const ALPHA_SAMPLE_SIZE = 8;

/** How many readbacks may be in flight at once. */
export const MAX_ALPHA_IN_FLIGHT = 4;

/** Can this file even carry a transparent corner? A `.jpg` cannot — and skipping it is what keeps the
 *  detection free for the common case, because most of a typical board is photographs. */
export function mayHaveAlpha(url) {
  const name = (String(url || '').split(/[?#]/)[0].split('/').pop() || '').toLowerCase();
  return !/\.jpe?g$/.test(name);
}

/** The decision, given the four corner alphas. Exported because it IS the heuristic. */
export function cornersImplyPlate(corners) {
  return Array.isArray(corners) && corners.some((a) => typeof a === 'number' && a <= ALPHA_CORNER_THRESHOLD);
}

/** Is this an image `auto` should look at, as opposed to a vector the URL already settled? */
export function plateRasterNeedsCheck(value, url) {
  return plateChoice(value) === 'auto' && !isVectorMedia(url) && mayHaveAlpha(url);
}

/** Mean ink luminance at or above this (0-255) reads as LIGHT ink — a white plate would swallow it. */
export const LIGHT_INK_LUMINANCE = 192;

/** Below this alpha a sample is a ghost of the downscale rather than ink. */
export const INK_ALPHA_FLOOR = 32;

/** Is the ink light? (i.e. does it need the dark card background rather than a white plate) */
export function inkIsLight(luminance) {
  return typeof luminance === 'number' && luminance >= LIGHT_INK_LUMINANCE;
}

/** Read the corners AND the ink of an image the browser has already decoded. Never throws.
 *  Returns `{ transparent, inkLuminance }` — `inkLuminance` is null when nothing opaque enough was sampled. */
export function sampleImage(imgEl, doc = typeof document === 'undefined' ? null : document) {
  const nothing = { transparent: false, inkLuminance: null };
  if (!imgEl || !doc) return nothing;
  try {
    const size = ALPHA_SAMPLE_SIZE;
    const canvas = doc.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return nothing;
    ctx.drawImage(imgEl, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const corners = [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]
      .map(([x, y]) => data[(y * size + x) * 4 + 3]);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < INK_ALPHA_FLOOR) continue;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count += 1;
    }
    return {
      transparent: cornersImplyPlate(corners),
      inkLuminance: count ? sum / count : null,
    };
  } catch {
    // A tainted canvas (a source that sends no CORS header) or no 2D context: no plate, no error.
    return nothing;
  }
}

/** The plate a sample calls for: '' · ' plate-alpha' (light plate) · ' plate-alpha-dark' (light ink). */
export function plateClassFromSample(sample) {
  if (!sample || sample.transparent !== true) return '';
  return inkIsLight(sample.inkLuminance) ? ' plate-alpha-dark' : ' plate-alpha';
}

/** The default readback: ask for the thumbnail again (from cache) as a CORS request, then sample it. */
async function loadPlateFromUrl(url) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  const loaded = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  return loaded ? sampleImage(img) : null;
}

const alphaCache = new Map();
let alphaInFlight = 0;
const alphaWaiting = [];

/** Forget what was measured (tests, and a board reload). */
export function resetAlphaCache() {
  alphaCache.clear();
  alphaWaiting.length = 0;
  alphaInFlight = 0;
}

/** How many URLs have been measured — a number a check can assert on. */
export function alphaCacheSize() {
  return alphaCache.size;
}

/** Which plate does this raster need? The class fragment, cached per URL, queued, never rejecting.
 *  `''` means the card's own background stays — an opaque picture, or light ink that a white plate would hide. */
export function rasterPlateClass(url, loader = loadPlateFromUrl) {
  const key = String(url || '');
  if (!key) return Promise.resolve('');
  if (alphaCache.has(key)) return alphaCache.get(key);
  const run = () => {
    alphaInFlight += 1;
    let work;
    try {
      work = Promise.resolve(loader(key));
    } catch {
      work = Promise.resolve(null);
    }
    const done = work.catch(() => null).then((sample) => {
      alphaInFlight -= 1;
      const next = alphaWaiting.shift();
      if (next) next();
      return plateClassFromSample(sample);
    });
    alphaCache.set(key, done);
    return done;
  };
  if (alphaInFlight < MAX_ALPHA_IN_FLIGHT) return run();
  return new Promise((resolve) => {
    alphaWaiting.push(() => resolve(run()));
  });
}

/** The CSS colour for a plate — for tests, and for anything that needs the value rather than the class. */
export function plateColor(choice) {
  switch (plateChoice(choice)) {
    case 'light': return '#ffffff';
    case 'dark': return 'var(--bg)';
    case 'none': return 'transparent';
    default: return 'var(--bg)';   // `auto` on a raster is today's behaviour
  }
}
