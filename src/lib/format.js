/**
 * Shared formatting helpers (ISSUE-42).
 *
 * `compactNum` — the compact Y-tick format used by chart cards
 * (1.2M / 254K / 12.5B); shared by TrendCard and FileTrafficCard so both
 * charts speak the same numeric language.
 *
 * `trendYScale(values)` — the Y mapping for the TrendCard sparkline.
 * Deliberately NOT zero-based: pageview-type series live far from zero, so a
 * zero baseline would flatten them into an unreadable band (the sparkline has
 * always been min–max normalized — ISSUE-42 just makes that scale explicit).
 * Returns the tick positions (viewBox y units, top → bottom) and the values
 * they stand for (max / mid / min), so the HTML tick labels align with the
 * SVG gridlines drawn in the same viewBox units.
 */

export function compactNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x >= 1e9 ? `${(x / 1e9).toFixed(1)}B`
    : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M`
      : x >= 1e3 ? `${(x / 1e3).toFixed(0)}K`
        : String(x);
}

/** SVG viewBox constants for the TrendCard plot (a 0–100 box, non-uniformly
 *  scaled — the band is inset so the top tick label and bottom baseline have
 *  breathing room inside the card). */
export const TREND_Y_TOP = 12;
export const TREND_Y_BOT = 96;

/** Tick spec for a min–max-scaled trend: { min, max, vAt, ticks: [{ y, v }] }.
 *  y runs top → bottom in viewBox units; v is the value that gridline stands
 *  for. A flat series (max === min) keeps only the top and bottom ticks —
 *  three identical numbers would be noise. */
export function trendYScale(values) {
  const nums = (values || [])
    .filter((v) => v !== null && v !== undefined && v !== '' && v !== false)
    .map(Number)
    .filter(Number.isFinite);
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;
  const range = max - min || 1;
  const vAt = (y) => min + ((TREND_Y_BOT - y) / (TREND_Y_BOT - TREND_Y_TOP)) * range;
  const mid = (max + min) / 2;
  const ticks = [
    { y: TREND_Y_TOP, v: max },
    { y: (TREND_Y_TOP + TREND_Y_BOT) / 2, v: mid },
    { y: TREND_Y_BOT, v: min },
  ];
  return {
    min,
    max,
    vAt,
    ticks: max === min ? [ticks[0], ticks[2]] : ticks,
  };
}
