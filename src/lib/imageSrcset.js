/**
 * `srcset` + `sizes` for Commons thumbnails — the part that decides which bytes a card actually fetches.
 *
 * The problem this solves: a gallery requested ONE thumbnail width for every tile, so a 110px tile and a 250px tile
 * fetched the same bytes — and the browser had no way to pick better, because an `<img src>` with no `srcset` is a
 * take-it-or-leave-it offer. Two things fix it:
 *
 *   1. a width-descriptor `srcset` built from URLs the API hands us (`thumburl` + `responsiveUrls` — the sanctioned
 *      2× rendition, so no string surgery), declaring the width each one is *served* at;
 *   2. `sizes`, the width the image will actually occupy, so the browser can choose.
 *
 * The width a thumbnail is served at is NOT the width asked for: `iiurlwidth=480` reports `thumbwidth: 480` and
 * serves 500px, because `thumb.wikimedia.org` quantizes up to a pre-rendered bucket. So descriptors are parsed out of
 * the URL rather than assumed. See `src/lib/thumbWidths.js` for the ladder and `docs/THUMBNAILS.md` for the
 * measurements — including the 607 KB → 197 KB this pattern produced in a sister project.
 */

/** The width a thumbnail URL is actually served at: `…/500px-Foo.jpg`, `…/page1-330px-Book.pdf.jpg`. */
export function servedThumbWidth(url) {
  const m = /(?:page\d+-)?(\d+)px-/.exec(String(url || ''));
  return m ? Number(m[1]) : null;
}

/** Strip the tracking params the API now appends (`?utm_source=…`); they defeat nothing but are noise. */
export function cleanMediaUrl(url) {
  return url ? String(url).split('?')[0] : '';
}

/**
 * A width-descriptor `srcset` from the base thumbnail and the API's `responsiveUrls`.
 *
 * Candidates are described by their SERVED width, not by the DPR key, so a `"2"` entry that happens to be 960px for a
 * 330px base is declared as `960w` — the truth — and the browser picks by real pixels. Unparseable entries are
 * dropped rather than guessed at; a single candidate makes `srcset` pointless, so it returns '' and the caller keeps
 * a plain `src`.
 */
export function thumbSrcset(thumbUrl, responsiveUrls) {
  const entries = new Map();
  const push = (rawUrl) => {
    const url = cleanMediaUrl(rawUrl);
    const w = servedThumbWidth(url);
    if (url && w) entries.set(w, url);
  };
  push(thumbUrl);
  for (const key of Object.keys(responsiveUrls || {})) push(responsiveUrls[key]);
  if (entries.size < 2) return '';
  return [...entries.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, url]) => `${url} ${w}w`)
    .join(', ');
}

/**
 * The width one tile occupies in a CSS `grid-template-columns: repeat(auto-fill, minmax(minPx, 1fr))` grid with
 * `gap` between columns — the same arithmetic the layout engine does, so `sizes` describes the truth rather than an
 * approximation. Pass the CONTENT box: `.gallery-grid` has 2px of padding, and on a real card that 4px decides
 * whether the slot is 193 or 194. Returns 0 when the element has not been measured yet (the caller then omits `sizes`).
 */
export function slotWidthPx(gridWidthPx, minColumnPx, gapPx = 8) {
  const w = Number(gridWidthPx);
  const min = Number(minColumnPx);
  const gap = Number(gapPx);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(min) || min <= 0) return 0;
  const cols = Math.max(1, Math.floor((w + gap) / (min + gap)));
  return Math.max(1, Math.round((w - gap * (cols - 1)) / cols));
}

/** The CSS min column width per gallery size — the same numbers as `.gallery-{small,medium,large}` in App.css. */
export const GALLERY_MIN_COLUMN = { small: 110, medium: 170, large: 250 };

/**
 * The width to REQUEST for each gallery size — the `iiurlwidth` that becomes the low candidate in the `srcset`.
 *
 * Chosen from what the API serves, measured 2026-09-18 (base → the `responsiveUrls` "2" rendition):
 *
 *   small  250 → 500    a ~110-130px slot needs 250 at 1×, 500 at 2×   (before: a flat 400 → the 500px bucket)
 *   medium 330 → 960    a ~170-193px slot needs 330 at 1×, 960 at 2×
 *   large  500 → 1280   a ~250px slot needs 500 at 1×, 1280 at 2×
 *
 * The win is the low candidate: the small density used to fetch the 500px bucket for every tile because one width
 * served all three sizes. Requests are always ladder widths, so nothing is quantized up a bucket for nothing.
 */
export const GALLERY_BASE_WIDTH = { small: 250, medium: 330, large: 500 };

/**
 * Should the larger (usually 2×) rendition be offered at all?
 *
 * On a retina screen the 2× candidate is correct: it is the difference between a sharp tile and an upscaled one. It
 * also costs roughly double the bytes — measured on a 36-tile board, 1442 KB at 1× versus 5765 KB at 2× — and most
 * phones are retina, so this is a real mobile cost rather than a desktop nicety.
 *
 * Two things therefore suppress it: the browser's own "save data" preference, and a very slow connection. Both are
 * the user telling us they would rather have fewer bytes; a `srcset` that ignores them is a `srcset` arguing with the
 * person holding the phone.
 */
export function allowHiDpi(nav = typeof navigator === 'undefined' ? null : navigator) {
  const conn = nav && nav.connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  const slow = ['slow-2g', '2g'];
  return !slow.includes(String(conn.effectiveType || ''));
}

/** The candidates to offer for a tile: the base, plus the API's larger rendition when it is worth offering. */
export function thumbSrcsetFor(thumbUrl, responsiveUrls, { hiDpi = true } = {}) {
  if (hiDpi) return thumbSrcset(thumbUrl, responsiveUrls);
  const base = cleanMediaUrl(thumbUrl);
  return servedThumbWidth(base) ? `${base} ${servedThumbWidth(base)}w` : '';
}
