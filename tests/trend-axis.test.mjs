/**
 * ISSUE-42 — TrendCard Y-axis helpers (src/lib/format.js).
 *
 * The sparkline is min–max scaled (NOT zero-based — a zero baseline would
 * flatten pageview-type series far from zero); these tests pin the tick
 * contract the card's HTML y-labels and SVG gridlines both draw from:
 *  - top tick = max, bottom tick = min, at the known viewBox fractions
 *  - middle tick = half-way value (dropped for a flat series)
 *  - compactNum renders the 254K / 1.2M / 12.5B vocabulary both charts use
 *  - y(v) round-trips: the max value maps to TREND_Y_TOP, min to TREND_Y_BOT
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactNum, trendYScale, TREND_Y_TOP, TREND_Y_BOT } from '../src/lib/format.js';

test('compactNum: B/M/K tiers match the FileTrafficCard format', () => {
  assert.equal(compactNum(1_250_000_000), '1.3B');
  assert.equal(compactNum(5_200_000), '5.2M');
  assert.equal(compactNum(254_000), '254K');
  assert.equal(compactNum(999), '999');
  assert.equal(compactNum(0), '0');
});

test('trendYScale: top tick = max, bottom = min, mid = (min+max)/2', () => {
  const { ticks } = trendYScale([100, 200, 300, 400]);
  assert.equal(ticks[0].v, 400);
  assert.equal(ticks[1].v, 250); // (min + max) / 2
  assert.equal(ticks[2].v, 100);
  assert.equal(ticks[0].y, TREND_Y_TOP);
  assert.equal(ticks[2].y, TREND_Y_BOT);
});

test('trendYScale: tick y positions are the documented viewBox fractions', () => {
  const { ticks } = trendYScale([1, 2]);
  assert.equal(ticks[1].y, (TREND_Y_TOP + TREND_Y_BOT) / 2);
  assert.ok(ticks[0].y < ticks[1].y && ticks[1].y < ticks[2].y);
});

test('trendYScale: mapping is linear and inverted (max at top, min at bottom)', () => {
  const { vAt } = trendYScale([100, 500]);
  assert.equal(vAt(TREND_Y_TOP), 500);
  assert.equal(vAt(TREND_Y_BOT), 100);
  assert.equal(vAt((TREND_Y_TOP + TREND_Y_BOT) / 2), 300);
});

test('trendYScale: flat series keeps only top+bottom ticks (no triple duplicate)', () => {
  const { ticks, min, max } = trendYScale([7, 7, 7]);
  assert.equal(min, 7);
  assert.equal(max, 7);
  assert.equal(ticks.length, 2);
  assert.ok(ticks.every((t) => t.v === 7));
});

test('trendYScale: tolerates unsorted / non-finite inputs', () => {
  const { min, max } = trendYScale([500, 'x', 100, null, 300]);
  assert.equal(min, 100);
  assert.equal(max, 500);
});

test('trendYScale: empty values still produce a valid two-tick scale', () => {
  const { ticks, min, max } = trendYScale([]);
  assert.equal(min, 0);
  assert.equal(max, 0);
  assert.equal(ticks.length, 2);
});

test('trendYScale: single-point series behaves like a flat series', () => {
  const { ticks } = trendYScale([42]);
  assert.equal(ticks.length, 2);
  assert.ok(ticks.every((t) => t.v === 42));
});
