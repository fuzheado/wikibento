/**
 * The widths Wikimedia actually pre-renders. Asking for anything else is either wasteful or a 404-class error.
 *
 * Measured 2026-09-18 (after reading `commons-vibe`'s benchmark/thumb-metrics.md — a sister project of the same
 * author, where this cost real users bandwidth):
 *
 *   iiurlwidth=<anything>            → SAFE. The API quantizes upward to the next bucket and hands back a legal
 *                                      `thumburl`; it only *reports* the width you asked for (`thumbwidth`), so
 *                                      480 costs you the 500px bucket — 4% of nothing.
 *   hand-built `…/700px-<file>`      → HTTP 400. This is the trap, because a page thumbnail has no API endpoint:
 *                                      `documentSource.derivePageTemplate()` substitutes `{w}` into a template, and
 *                                      `{w}` must therefore be a width that exists.
 *
 * Proof (curl, 2026-09-18, page1 of File:Mujeres en wikipedia.pdf): 330/500/960/1280 → 200; 400/700/1000/1400 → 400.
 *
 * `$wgThumbnailSteps = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840]` (T360589); the endpoints are moving
 * from upload.wikimedia.org to thumb.wikimedia.org with the ladder enforced at the edge (T427465, T402792).
 */
export const THUMB_LADDER = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/** Is this width one the pre-renderer already has? */
export function isLegalThumbWidth(width) {
  return THUMB_LADDER.includes(Number(width));
}

/**
 * Snap a width to the nearest legal one, rounded UP — the same direction Wikimedia's own quantizer rounds, so a
 * request never returns a smaller image than the caller asked for. Widths above the top step stay at the top step
 * (the API clamps to the original file size itself).
 */
export function legalThumbWidth(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return THUMB_LADDER[THUMB_LADDER.length - 1];
  for (const step of THUMB_LADDER) if (step >= w) return step;
  return THUMB_LADDER[THUMB_LADDER.length - 1];
}

/**
 * Snap a width DOWN to a legal one — for a *ceiling* rather than a request. A source that supports up to 700px must
 * not be rendered at 960px because 960 is the next bucket up; the largest width that both exists and fits is 500.
 */
export function floorThumbWidth(width) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return THUMB_LADDER[0];
  let out = THUMB_LADDER[0];
  for (const step of THUMB_LADDER) if (step <= w) out = step;
  return out;
}
