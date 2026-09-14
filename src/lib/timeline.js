/**
 * Timeline layout — the maths behind the SPARQL widget's `timeline` render mode (ISSUE-73).
 *
 * The mode is for time-shaped results: one row per event, a date column, and (optionally) a column
 * naming whose lane the event belongs to. Two people on one axis is the motivating case — "Anne Frank
 * and Martin Luther King Jr. were both born in 1929" — but nothing here assumes a person: a lane is
 * just a group of dated rows.
 *
 * Pure module (no React, no DOM) so the axis arithmetic is unit-testable. Ticks, padded bounds,
 * percentage positions and the overlap window are exactly the things that look right in a screenshot
 * and are wrong at the edges: one lane, one event, two events on the same day, a mountain of undated
 * rows.
 */

/** Parse an xsd:dateTime / xsd:date literal — or a bare year — into calendar parts. */
export function parseTimelineDate(value) {
  if (value == null || typeof value === 'object') return null;
  const s = String(value).trim();
  if (!s || s === '—') return null;
  // 1942-07-06T00:00:00Z · 1942-07-06 · -0044-03-15T00:00:00Z
  const full = /^(-?\d{1,4})-(\d{2})-(\d{2})/.exec(s);
  if (full) {
    const [year, month, day] = [Number(full[1]), Number(full[2]), Number(full[3])];
    if (!Number.isFinite(year) || !month || !day) return null;
    // Wikidata writes a year-precision date as 1 January, so Jan 1 is *probably* a year and only
    // maybe a real day. Callers show the year either way (see formatTimelineEvent).
    const precise = month !== 1 || day !== 1;
    return { year, month, day, precision: precise ? (day === 1 ? 'month' : 'day') : 'year' };
  }
  const bareYear = /^(-?\d{3,4})$/.exec(s);
  if (bareYear) return { year: Number(bareYear[1]), month: null, day: null, precision: 'year' };
  return null;
}

/** "1942" · "July 1942" · "6 July 1942" — never more precision than the source asserted. */
export function formatTimelineEvent(ev) {
  if (!ev) return '';
  if (ev.precision === 'year' || !ev.month) return String(ev.year);
  const month = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][ev.month - 1] || ev.month;
  return ev.precision === 'day' ? `${ev.day} ${month} ${ev.year}` : `${month} ${ev.year}`;
}

/** Fractional year for positioning: 1942-07-06 → 1942.51. Keeps same-year events apart. */
export function fractionalYear(ev) {
  if (!ev) return null;
  if (!ev.month) return ev.year;
  const dayFrac = ev.precision === 'day' ? (ev.day - 1) / 30 : 0;
  return ev.year + (ev.month - 1 + dayFrac) / 12;
}

const TIME_NAME = /^(date|time|datetime|when|point|year|start|startdate)$/i;
const SERIES_NAME = /^(series|who|person|people|subject|group|lane|item|entity|wiki|story)$/i;
const LABEL_NAME = /^(event|what|label|title|name|thing)$/i;
const KIND_NAME = /^(kind|verb|type|action|relation|prop|property|eventtype)$/i;

const distinct = (rows, v) => new Set(rows.map((r) => r?.[v]).filter((x) => x != null && x !== '')).size;
const dateShare = (rows, v) => {
  const vals = rows.map((r) => r?.[v]).filter((x) => x != null && x !== '');
  if (!vals.length) return 0;
  return vals.filter((x) => parseTimelineDate(x)).length / vals.length;
};
const isNumericVar = (rows, v) => rows.some((r) => r?.[v] != null) &&
  rows.every((r) => r?.[v] == null || typeof r[v] === 'number' || !Number.isNaN(Number(r[v])));

/**
 * Which variable holds the time? Prefer a conventional name whose values actually parse, then fall
 * back to the variable that looks most like dates (≥80% parseable).
 *
 * Note what is deliberately *not* required: more than one distinct date. Two lives on one day (both
 * born on 15 January 1929) is a legitimate timeline, and demanding variety here made the renderer
 * reject it and fall back to a table.
 */
export function findTimeVar(vars, rows) {
  const candidates = vars.filter((v) => dateShare(rows, v) >= 0.8 && rows.some((r) => parseTimelineDate(r?.[v])));
  if (!candidates.length) return null;
  return candidates.find((v) => TIME_NAME.test(v)) || candidates[0];
}

/** Which variable splits the lanes? A name match, else the least-fragmented non-time text column. */
export function findSeriesVar(vars, rows, timeVar, labelVar) {
  const pool = vars.filter((v) => v !== timeVar && v !== labelVar && dateShare(rows, v) < 0.8);
  if (!pool.length) return null;
  // "who" is the better *grouping* key, but "whoLabel" is the better *label* — prefer the labelled
  // twin whenever the query provides one (it is what a reader should see on the axis).
  const labelled = pool.find((v) => /label$/i.test(v) && SERIES_NAME.test(v.replace(/label$/i, '')));
  const named = labelled || pool.find((v) => SERIES_NAME.test(v));
  if (named) return named;
  // A lane split wants few distinct values (2–12); a label column wants many. Only adopt an
  // unnamed column as the series if it looks like a grouping and not like free text.
  const grouping = pool
    .map((v) => ({ v, n: distinct(rows, v) }))
    .filter(({ n }) => n >= 2 && n <= 12 && n <= rows.length / 2)
    .sort((a, b) => a.n - b.n);
  return grouping.length ? grouping[0].v : null;
}

/** Which variable labels an event? Prefer `<series>Label`-style names, then the richest text column. */
export function findLabelVar(vars, rows, timeVar, seriesVar) {
  const pool = vars.filter((v) => v !== timeVar && v !== seriesVar && dateShare(rows, v) < 0.8 && !isNumericVar(rows, v));
  if (!pool.length) return null;
  return pool.find((v) => LABEL_NAME.test(v.replace(/label$/i, ''))) ||
    pool.find((v) => /label$/i.test(v) && distinct(rows, v) > 1) ||
    pool.sort((a, b) => distinct(rows, b) - distinct(rows, a))[0];
}

/** An optional verb column ("studied at", "awarded") that reads well in front of the label. */
export function findKindVar(vars, rows, timeVar, seriesVar, labelVar) {
  return (vars || []).find((v) => v !== timeVar && v !== seriesVar && v !== labelVar &&
    KIND_NAME.test(v.replace(/label$/i, '')) && dateShare(rows, v) < 0.8) || null;
}

/** Detect the roles a timeline needs. Null when the result is not time-shaped. */
export function detectTimeline(rows, vars) {
  const timeVar = findTimeVar(vars || [], rows || []);
  if (!timeVar) return null;
  const labelVar = findLabelVar(vars || [], rows || [], timeVar, null);
  const seriesVar = findSeriesVar(vars || [], rows || [], timeVar, labelVar);
  const finalLabel = findLabelVar(vars || [], rows || [], timeVar, seriesVar) || labelVar;
  const kindVar = findKindVar(vars || [], rows || [], timeVar, seriesVar, finalLabel);
  return { timeVar, seriesVar, labelVar: finalLabel, kindVar };
}

/**
 * Vertical slots for event labels — where a timeline is won or lost.
 *
 * Dots must stay on the line, so a label that would collide moves up or down instead of sideways.
 * A *cycling* scheme is not enough: MLK's 1963–1966 award cluster puts five events within 10% of the
 * axis, so slots 0–3 fill and the fifth lands back on the first, overlapping it.
 *
 * So this is greedy per slot: each event takes the first slot whose previous occupant is at least
 * `minGapPct` away, and an event that fits in no slot is *hidden* rather than drawn on top of
 * another. Hidden labels are not lost — every dot carries its full text as a tooltip (and the count
 * per lane is printed under it). Measured on the Anne Frank × MLK preset: 7/7 and 12/14 labels fit.
 */
export const LABEL_BANDS = 4;
export function assignLabelSlots(events, minGapPct = 9) {
  const lastX = new Array(LABEL_BANDS).fill(-Infinity);
  const place = (e, force) => {
    let slot = -1;
    for (let b = 0; b < LABEL_BANDS; b += 1) {
      if (e.x - lastX[b] >= minGapPct) { slot = b; break; }
    }
    // A lane's first and last events (birth and death) are the anchors of a life: if the cluster
    // around them leaves no free slot, take one anyway. A slightly tight label beats a timeline that
    // hides the year someone died.
    if (slot === -1 && force) slot = 0;
    if (slot === -1) {
      e.band = 0;
      e.labelVisible = false;
      return;
    }
    e.band = slot;
    e.labelVisible = true;
    lastX[slot] = e.x;
  };
  // Anchors claim their slots first, in time order, then everything else fills in around them.
  for (const e of events.filter((x) => x.critical)) place(e, true);
  for (const e of events.filter((x) => !x.critical)) place(e, false);
  return events;
}

/**
 * The on-canvas label: short enough to fit a slot, with the exact date and full text kept in the
 * tooltip. "1966 — awarded Jawaharlal Nehru Award for International Understanding" is a sentence, not
 * an axis label.
 */
export function shortTimelineLabel(ev, max = 36) {
  const when = formatTimelineEvent(ev);
  const what = [ev.kind, ev.label].filter(Boolean).join(' ');
  if (!what) return when;
  const clipped = what.length > max ? `${what.slice(0, max - 1).trimEnd()}…` : what;
  return `${when} · ${clipped}`;
}

/** Tick spacing that yields 3–7 ticks for a span. */
export function tickStep(span) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => span / s <= 7) || 1000;
}

/**
 * Build the renderer's model.
 *
 * `opts.seriesLabel` names the single lane when the result has no series column (a one-lane timeline
 * is a legitimate shape — e.g. one person's life).
 */
export function buildTimeline(rows, vars, opts = {}) {
  const det = detectTimeline(rows || [], vars || []);
  if (!det) return null;
  const { timeVar, seriesVar, labelVar, kindVar } = det;

  const events = [];
  let undated = 0;
  for (const row of rows || []) {
    const parsed = parseTimelineDate(row?.[timeVar]);
    if (!parsed) { undated += 1; continue; }
    const series = seriesVar ? String(row?.[seriesVar] ?? '—') : (opts.seriesLabel || 'Timeline');
    const rawLabel = labelVar ? row?.[labelVar] : null;
    const rawKind = kindVar ? row?.[kindVar] : null;
    events.push({
      series,
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      precision: parsed.precision,
      at: fractionalYear(parsed),
      kind: rawKind == null || rawKind === '' ? '' : String(rawKind),
      label: rawLabel == null || rawLabel === '' ? '' : String(rawLabel),
      text: '',
    });
  }
  if (!events.length) return null;
  for (const e of events) {
    const when = formatTimelineEvent(e);
    const what = [e.kind, e.label].filter(Boolean).join(' ');
    e.text = what ? `${when} — ${what}` : when;
    e.short = shortTimelineLabel(e);
  }

  // Lanes, in order of first appearance (stable for the reader: the query's ORDER BY decides).
  const lanes = [];
  for (const e of events) {
    let lane = lanes.find((l) => l.label === e.series);
    if (!lane) {
      lane = { label: e.series, events: [], first: e.at, last: e.at, firstYear: e.year, lastYear: e.year };
      lanes.push(lane);
    }
    lane.events.push(e);
    lane.first = Math.min(lane.first, e.at);
    lane.last = Math.max(lane.last, e.at);
    lane.firstYear = Math.min(lane.firstYear, e.year);
    lane.lastYear = Math.max(lane.lastYear, e.year);
  }
  for (const lane of lanes) {
    lane.events.sort((a, b) => a.at - b.at);
    lane.count = lane.events.length;
    // Birth and death: the two dates a reader will look for first, and the two the label allocator
    // must never hide (see assignLabelSlots).
    lane.events[0].critical = true;
    lane.events[lane.events.length - 1].critical = true;
    lane.span = lane.lastYear === lane.firstYear ? String(lane.firstYear) : `${lane.firstYear}–${lane.lastYear}`;
  }

  const minYear = Math.floor(Math.min(...lanes.map((l) => l.first)));
  const maxYear = Math.ceil(Math.max(...lanes.map((l) => l.last)));
  const step = tickStep(Math.max(maxYear - minYear, 1));
  const from = Math.floor(minYear / step) * step;
  // A life inside a single tick still needs an axis: widen it rather than divide by a zero span.
  const to = Math.max(Math.ceil(maxYear / step) * step, from + step);
  const span = Math.max(to - from, 1);
  const x = (value) => Math.min(100, Math.max(0, ((value - from) / span) * 100));

  const ticks = [];
  for (let y = from; y <= to; y += step) ticks.push({ year: y, x: x(y) });
  for (const lane of lanes) {
    lane.x1 = x(lane.first);
    lane.x2 = x(lane.last);
    for (const e of lane.events) {
      e.x = x(e.at);
      // A centred label at either extreme hangs outside the plot (the death dot of a life ending at
      // the edge of the axis). Anchor those to the dot's outer side instead.
      e.anchor = e.x < 6 ? 'start' : e.x > 94 ? 'end' : 'center';
    }
    assignLabelSlots(lane.events);
  }

  // The window where every lane is documented — for two lives, the years they were both alive and
  // recorded. This is the comparison's whole point, so it is computed rather than eyeballed.
  //
  // Two values, deliberately: the *drawn* edges are fractional (a band that starts in June 1929 or
  // ends in February 1945 must not snap to the year boundary), while the *label* uses whole years
  // (a death in February 1945 documents 1945 — rounding its position up would caption the window 1946).
  let overlap = null;
  if (lanes.length >= 2) {
    const lo = Math.max(...lanes.map((l) => l.first));
    const hi = Math.min(...lanes.map((l) => l.last));
    const fromYear = Math.max(...lanes.map((l) => l.firstYear));
    const toYear = Math.min(...lanes.map((l) => l.lastYear));
    if (lo <= hi && fromYear <= toYear) overlap = { from: fromYear, to: toYear, x1: x(lo), x2: x(hi) };
  }

  return {
    from,
    to,
    step,
    ticks,
    lanes,
    overlap,
    undated,
    total: events.length,
    // A caption the renderer can show without inventing words: "2 lives · 21 events · 1920–1970".
    summary: `${lanes.length} ${lanes.length === 1 ? 'lane' : 'lanes'} · ${events.length} events · ${from}–${to}`,
  };
}
