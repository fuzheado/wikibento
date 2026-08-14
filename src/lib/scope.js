/**
 * Temporal-scope helpers — the "constitutional" rule:
 *
 *   EVERY widget whose data has a temporal scope (a specific month, a date
 *   window, a single day) MUST display the RESOLVED scope in its subtitle —
 *   not "last month" but "2026-07", not "30 days" but "2026-07-15 → 2026-08-13".
 *   A widget that omits its scope is useless: viewers can't tell what they're
 *   looking at.
 *
 *   Enforcement: every registry entry declares `timeScope` ('month' | 'range'
 *   | 'day' | 'point') and `npm test` (wired into `npm run build`) fails any
 *   scoped widget whose transform subtitle lacks the date. New widgets MUST
 *   declare timeScope — the test fails on a missing declaration.
 *
 *   Format conventions:
 *     month  → 2026-07
 *     range  → 2026-02 → 2026-07   (or 2026-07-15 → 2026-08-13 for day ranges)
 *     day    → 2026-08-12
 */

/** Previous calendar month — the default "last complete month" for monthly
 *  widgets (current month's data is incomplete; CIM lags ~1–2 days). */
export function prevMonth(d = new Date()) {
  return {
    year: d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(),
    month: d.getMonth() === 0 ? 12 : d.getMonth(),
  };
}

/** Resolve a config month value (0/blank = previous calendar month). */
export function resolveMonth(configMonth, d = new Date()) {
  const p = prevMonth(d);
  const m = parseInt(configMonth);
  if (!m) return p;
  if (m < 1 || m > 12) return p;
  // A month number > current month must refer to the PREVIOUS year
  // (config "7" in August 2026 means 2026-07; config "12" in March means last December).
  const year = m > d.getMonth() + 1 ? p.year : d.getFullYear();
  return { year, month: m };
}

/** Shift a {year, month} by delta months. */
export function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** 2026-07 */
export function fmtMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 2026-02 → 2026-07 */
export function fmtMonthRange(y1, m1, y2, m2) {
  return `${fmtMonth(y1, m1)} → ${fmtMonth(y2, m2)}`;
}

/** 2026-08-12 (from ISO or y/m/d) */
export function fmtDay(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 2026-07-15 → 2026-08-13 */
export function fmtDayRange(y1, m1, d1, y2, m2, d2) {
  return `${fmtDay(y1, m1, d1)} → ${fmtDay(y2, m2, d2)}`;
}

/** Yesterday's {year, month, day} — the end of "the last N days" windows. */
export function yesterday(d = new Date()) {
  const y = new Date(d);
  y.setDate(y.getDate() - 1);
  return { year: y.getFullYear(), month: y.getMonth() + 1, day: y.getDate() };
}

/** The last N days ending yesterday, as {start, end} day triples. */
export function dayWindow(n, d = new Date()) {
  const end = yesterday(d);
  const start = new Date(Date.UTC(end.year, end.month - 1, end.day - (n - 1)));
  return {
    start: { year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, day: start.getUTCDate() },
    end,
  };
}
