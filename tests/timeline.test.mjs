import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimelineDate,
  formatTimelineEvent,
  fractionalYear,
  detectTimeline,
  tickStep,
  buildTimeline,
  assignLabelSlots,
  shortTimelineLabel,
} from '../src/lib/timeline.js';

/**
 * Timeline layout — the axis arithmetic behind the SPARQL widget's `timeline` render mode (ISSUE-73).
 *
 * The motivating case is two people on one axis (Anne Frank 1929–1945 and Martin Luther King Jr.
 * 1929–1968, both born in 1929), and the shape of the real query's result is what the detection tests
 * pin: ?who ?whoLabel ?date ?kind ?whatLabel.
 *
 * The edges are where this breaks, so they are the tests: a single lane, a single event, two events on
 * one day, undated rows mixed in, a span of one year, and rows whose date column is prose.
 */

// ── the real preset's result shape (rows copied from a verified live WDQS run) ──────────────────
const VARS = ['who', 'whoLabel', 'date', 'kind', 'whatLabel'];
const ROW = (whoLabel, date, kind, whatLabel = null) => ({
  who: `${whoLabel} (Q…)`, whoLabel, date, kind, whatLabel,
});
const LIVES = [
  ROW('Anne Frank', '1929-06-12T00:00:00Z', 'born'),
  ROW('Anne Frank', '1942-07-06T00:00:00Z', 'lived in', 'annex Prinsengracht 263'),
  ROW('Anne Frank', '1945-02-01T00:00:00Z', 'died'),
  ROW('Martin Luther King Jr.', '1929-01-15T00:00:00Z', 'born'),
  ROW('Martin Luther King Jr.', '1944-01-01T00:00:00Z', 'studied at', 'Morehouse College'),
  ROW('Martin Luther King Jr.', '1964-01-01T00:00:00Z', 'awarded', 'Nobel Peace Prize'),
  ROW('Martin Luther King Jr.', '1968-04-04T00:00:00Z', 'died'),
];

test('parseTimelineDate: xsd:dateTime, xsd:date, bare year — and honest nulls', () => {
  assert.deepEqual(parseTimelineDate('1942-07-06T00:00:00Z'), { year: 1942, month: 7, day: 6, precision: 'day' });
  assert.deepEqual(parseTimelineDate('1942-07-06'), { year: 1942, month: 7, day: 6, precision: 'day' });
  assert.deepEqual(parseTimelineDate('1942-07-01'), { year: 1942, month: 7, day: 1, precision: 'month' });
  assert.deepEqual(parseTimelineDate('1942-01-01T00:00:00Z'), { year: 1942, month: 1, day: 1, precision: 'year' });
  assert.deepEqual(parseTimelineDate('1942'), { year: 1942, month: null, day: null, precision: 'year' });
  assert.equal(parseTimelineDate(null), null);
  assert.equal(parseTimelineDate(''), null);
  assert.equal(parseTimelineDate('—'), null);
  assert.equal(parseTimelineDate('circa 1942'), null);
  // A year returned as a NUMBER is a legitimate time column (SELECT ?year, or YEAR(?date)) — the
  // axis needs no date literal to work, only an integer it can place.
  assert.deepEqual(parseTimelineDate(1942), { year: 1942, month: null, day: null, precision: 'year' });
});

test('formatTimelineEvent: never more precision than the source asserted', () => {
  assert.equal(formatTimelineEvent(parseTimelineDate('1942-01-01T00:00:00Z')), '1942');
  assert.equal(formatTimelineEvent(parseTimelineDate('1942-07-01T00:00:00Z')), 'July 1942');
  assert.equal(formatTimelineEvent(parseTimelineDate('1942-07-06T00:00:00Z')), '6 July 1942');
  assert.equal(formatTimelineEvent(parseTimelineDate('1929')), '1929');
});

test('fractionalYear: same-year events keep their order on the axis', () => {
  const jan = fractionalYear(parseTimelineDate('1968-01-15')), apr = fractionalYear(parseTimelineDate('1968-04-04'));
  assert.ok(jan < apr, 'January must sit left of April');
  assert.ok(apr > 1968 && apr < 1969, 'still inside 1968');
});

test('detectTimeline: reads the roles out of the real preset result', () => {
  const det = detectTimeline(LIVES, VARS);
  assert.equal(det.timeVar, 'date');
  assert.equal(det.seriesVar, 'whoLabel', 'the labelled twin is the lane name, not the QID-bearing cell');
  assert.equal(det.labelVar, 'whatLabel');
  assert.equal(det.kindVar, 'kind');
});

test('detectTimeline: a table with no date column is not a timeline', () => {
  const rows = [{ label: 'Met', count: 12 }, { label: 'Rijks', count: 9 }];
  assert.equal(detectTimeline(rows, ['label', 'count']), null);
  assert.equal(buildTimeline(rows, ['label', 'count']), null, 'and the renderer must fall back, not crash');
});

test('buildTimeline: lanes, ticks and the overlap window of two lives', () => {
  const tl = buildTimeline(LIVES, VARS);
  assert.equal(tl.lanes.length, 2, 'one lane per person');
  assert.deepEqual(tl.lanes.map((l) => l.label), ['Anne Frank', 'Martin Luther King Jr.'], 'query order is kept');
  const [anne, mlk] = tl.lanes;
  assert.equal(anne.count, 3);
  assert.equal(mlk.count, 4);
  assert.equal(anne.span, '1929–1945');
  assert.equal(mlk.span, '1929–1968');
  // Axis bounds land on tick boundaries, and ticks are evenly spaced across them.
  assert.equal(tl.from, 1920);
  assert.equal(tl.to, 1970);
  assert.equal(tl.step, 10);
  assert.deepEqual(tl.ticks.map((t) => t.year), [1920, 1930, 1940, 1950, 1960, 1970]);
  assert.equal(tl.ticks[0].x, 0);
  assert.equal(tl.ticks.at(-1).x, 100);
  // 12 June 1929 is 9.45 years into a 50-year axis: months *and* days of a year-precision-free date
  // shift the dot, so mid-year events sit mid-year rather than snapped onto the tick.
  assert.ok(Math.abs(anne.events[0].x - 18.89) < 0.05, `12 June 1929 should sit at 18.9%, got ${anne.events[0].x}`);
  assert.ok(anne.events[0].x > 15, 'and never on the 1920 tick');
  // The overlap is the comparison's point: here it is Anne's whole documented life.
  assert.deepEqual({ from: tl.overlap.from, to: tl.overlap.to }, { from: 1929, to: 1945 });
});

test('buildTimeline: event text is readable and composed from kind + label', () => {
  const tl = buildTimeline(LIVES, VARS);
  const texts = tl.lanes.flatMap((l) => l.events.map((e) => e.text));
  assert.ok(texts.includes('12 June 1929 — born'), 'full precision when the source has it');
  assert.ok(texts.includes('1944 — studied at Morehouse College'), 'year precision, verb + object');
  assert.ok(texts.includes('1964 — awarded Nobel Peace Prize'));
  assert.ok(texts.includes('6 July 1942 — lived in annex Prinsengracht 263'), 'day precision from Wikidata');
  assert.ok(texts.includes('February 1945 — died'), 'month precision, when the day is not asserted');
});

test('buildTimeline: one lane needs no series column', () => {
  const rows = [{ date: '1929-06-12', event: 'born' }, { date: '1945-02-01', event: 'died' }];
  const tl = buildTimeline(rows, ['date', 'event'], { seriesLabel: 'Anne Frank' });
  assert.equal(tl.lanes.length, 1);
  assert.equal(tl.lanes[0].label, 'Anne Frank');
  assert.equal(tl.overlap, null, 'a single lane has no overlap to show');
});

test('buildTimeline: one event is a valid timeline (zero-width bar, no NaN)', () => {
  const tl = buildTimeline([{ date: '1929', whoLabel: 'A', whatLabel: 'born' }], ['date', 'whoLabel', 'whatLabel']);
  assert.equal(tl.lanes[0].count, 1);
  assert.equal(tl.lanes[0].x1, tl.lanes[0].x2);
  assert.ok(Number.isFinite(tl.lanes[0].x1));
  assert.ok(Number.isFinite(tl.from) && Number.isFinite(tl.to) && tl.to > tl.from, 'a one-year span still has an axis');
});

test('buildTimeline: two events on the same day do not collide into one', () => {
  const rows = [
    { date: '1964-01-01', whoLabel: 'MLK', whatLabel: 'Nobel Peace Prize' },
    { date: '1964-01-01', whoLabel: 'MLK', whatLabel: 'Gandhi Peace Award' },
  ];
  const tl = buildTimeline(rows, ['date', 'whoLabel', 'whatLabel']);
  assert.equal(tl.lanes[0].count, 2, 'both events survive');
  assert.equal(tl.lanes[0].events[0].x, tl.lanes[0].events[1].x, 'and they share an x — the renderer staggers them');
});

test('buildTimeline: undated rows are counted, never silently dropped', () => {
  const rows = [...LIVES, { whoLabel: 'Anne Frank', date: null, kind: 'awarded', whatLabel: 'something undated' }];
  const tl = buildTimeline(rows, VARS);
  assert.equal(tl.undated, 1);
  assert.equal(tl.total, LIVES.length, 'undated rows are excluded from the axis');
});

test('labels at the extremes anchor inward, so they cannot leave the plot', () => {
  // A death dot at 96.5% is the real case: MLK's lane ends near the right edge of a 1920–1970 axis,
  // and a centred label there hangs outside the widget.
  const lives = buildTimeline(LIVES, VARS);
  const mlk = lives.lanes.find((l) => l.label.startsWith('Martin'));
  assert.equal(mlk.events.at(-1).anchor, 'end', 'the 1968 death dot hangs inward');
  assert.equal(lives.lanes[0].events[0].anchor, 'center', '1929 sits 18% in — nothing to fix');

  // And the boundary case, where an event really is on the axis edge.
  const edge = buildTimeline([ROW('A', '1900-01-01', 'born'), ROW('A', '1999-01-01', 'died')], VARS);
  assert.deepEqual(edge.lanes[0].events.map((e) => e.anchor), ['start', 'end']);
});

test('label slots: crowded events take separate slots, and an unplaceable label is hidden', () => {
  const tl = buildTimeline([
    ROW('MLK', '1929-01-15', 'born'),
    // six events inside four years — more than the four slots
    ROW('MLK', '1963-01-01', 'awarded', 'Time Person of the Year'),
    ROW('MLK', '1964-01-01', 'awarded', 'Nobel Peace Prize'),
    ROW('MLK', '1964-06-01', 'awarded', 'Gandhi Peace Award'),
    ROW('MLK', '1965-01-01', 'awarded', 'Pacem in Terris Award'),
    ROW('MLK', '1966-01-01', 'awarded', 'Nehru Award'),
    ROW('MLK', '1966-06-01', 'awarded', 'Margaret Sanger Awards'),
  ], VARS);
  const events = tl.lanes[0].events;
  const visible = events.filter((e) => e.labelVisible);
  assert.equal(events[0].band, 0, 'the born event is decades from anything and sits in the first slot');
  assert.ok(visible.length >= 4, `at least the four slots get used (got ${visible.length} of ${events.length})`);
  // The guarantee that matters: no two *visible* labels share a slot within the gap.
  const bySlot = {};
  for (const e of visible) (bySlot[e.band] ||= []).push(e.x);
  for (const [slot, xs] of Object.entries(bySlot)) {
    for (let i = 1; i < xs.length; i += 1) {
      assert.ok(xs[i] - xs[i - 1] >= 9, `slot ${slot}: labels ${xs[i - 1].toFixed(1)}% and ${xs[i].toFixed(1)}% are too close`);
    }
  }
  const hidden = events.filter((e) => !e.labelVisible);
  assert.equal(hidden.length, 2, 'the two events with no free slot are hidden, not drawn on top');
  assert.ok(hidden.every((e) => e.text && e.text.length > 10), 'but every hidden one still has its tooltip text');
});

test('the anchors of a life are never hidden, even inside a crowded cluster', () => {
  const tl = buildTimeline([
    ROW('MLK', '1929-01-15', 'born'),
    ROW('MLK', '1963-01-01', 'awarded', 'Time Person of the Year'),
    ROW('MLK', '1964-01-01', 'awarded', 'Nobel Peace Prize'),
    ROW('MLK', '1964-06-01', 'awarded', 'Gandhi Peace Award'),
    ROW('MLK', '1965-01-01', 'awarded', 'Pacem in Terris Award'),
    ROW('MLK', '1966-01-01', 'awarded', 'Nehru Award'),
    ROW('MLK', '1968-04-04', 'died'),
  ], VARS);
  const events = tl.lanes[0].events;
  assert.equal(events[0].critical, true);
  assert.equal(events.at(-1).critical, true);
  assert.equal(events[0].labelVisible, true, 'the birth year is always readable');
  assert.equal(events.at(-1).labelVisible, true, 'and so is the death');
  const middle = events.slice(1, -1).filter((e) => !e.labelVisible);
  assert.ok(middle.length > 0, 'the middle of a cluster is what gets sacrificed');
  assert.ok(middle.every((e) => e.text.length > 10), 'sacrificed labels still have tooltips');
});

test('shortTimelineLabel: an axis label, not a sentence', () => {
  const e = buildTimeline([ROW('MLK', '1966-01-01', 'awarded', 'Jawaharlal Nehru Award for International Understanding')], VARS).lanes[0].events[0];
  assert.ok(e.short.length <= 36 + 6, `short form stays brief: "${e.short}"`);
  assert.ok(e.short.includes('1966'), 'the year survives');
  assert.ok(e.short.endsWith('…'), 'and the clipping is visible');
  assert.ok(e.text.length > e.short.length, 'the full text is what the tooltip shows');
});

test('assignLabelSlots: fills the first free slot — spreading only when it must', () => {
  // 10% apart with a 9% gap: nothing collides, so everything stays on one row (no needless raggedness)
  const roomy = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 10 }));
  assignLabelSlots(roomy, 9);
  assert.deepEqual(roomy.map((e) => e.band), [0, 0, 0, 0, 0, 0]);

  // 5% apart: each label now collides with the previous one, so it alternates between two slots
  const tight = [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 5 }));
  assignLabelSlots(tight, 9);
  assert.deepEqual(tight.map((e) => e.band), [0, 1, 0, 1, 0, 1]);
  assert.ok(tight.every((e) => e.labelVisible));
});

test('tickStep: a readable number of ticks whatever the span', () => {
  for (const span of [2, 3, 7, 12, 39, 60, 150, 400, 900]) {
    const n = Math.floor(span / tickStep(span)) + 1;
    assert.ok(n >= 3 && n <= 8, `span ${span} → ${n} ticks (step ${tickStep(span)})`);
  }
  // A one-year span cannot show three ticks without lying about the precision, so it shows two.
  assert.equal(Math.floor(1 / tickStep(1)) + 1, 2);
});

test('buildTimeline: a 900-year span still renders a sane axis', () => {
  const tl = buildTimeline([
    { date: '1100', whoLabel: 'A', whatLabel: 'x' },
    { date: '2000', whoLabel: 'B', whatLabel: 'y' },
  ], ['date', 'whoLabel', 'whatLabel']);
  assert.ok(tl.ticks.length >= 3 && tl.ticks.length <= 8);
  assert.ok(tl.ticks.every((t) => Number.isFinite(t.x) && t.x >= 0 && t.x <= 100));
});

test('buildTimeline: positions stay inside 0–100 and are monotonic', () => {
  const tl = buildTimeline(LIVES, VARS);
  for (const lane of tl.lanes) {
    let last = -1;
    for (const e of lane.events) {
      assert.ok(e.x >= 0 && e.x <= 100, `${e.text} at ${e.x}%`);
      assert.ok(e.x >= last, 'events keep chronological order');
      last = e.x;
    }
  }
});
