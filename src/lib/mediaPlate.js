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
  { value: 'auto', label: 'Automatic (SVG line art gets a plate)' },
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

/** The CSS colour for a plate — for tests, and for anything that needs the value rather than the class. */
export function plateColor(choice) {
  switch (plateChoice(choice)) {
    case 'light': return '#ffffff';
    case 'dark': return 'var(--bg)';
    case 'none': return 'transparent';
    default: return 'var(--bg)';   // `auto` on a raster is today's behaviour
  }
}
