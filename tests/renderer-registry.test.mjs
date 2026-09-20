import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TYPES } from '../src/widgets/index.js';

/**
 * Every renderer the registry names must exist as a component.
 *
 * This guard exists because a real bug shipped: rewriting a region of WidgetFrame.jsx deleted `BarCard`
 * while the SPARQL widget's registry entry still pointed at it, so every bar-rendered SPARQL query threw
 * `ReferenceError: BarCard is not defined` — caught by the ErrorBoundary and shown as "💥 Try Again",
 * with a green test suite behind it. Nothing in the suite ever compared the registry to the components.
 */
const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');

// The `sparql` widget reuses the `renderer` key for its MODE ('auto' | 'stat' | 'bar' | 'line' |
// 'table' | 'timeline') rather than to name a component — those values are not renderers.
const MODE_VALUES = new Set(['auto', 'stat', 'bar', 'line', 'table', 'timeline']);

test('every renderer named in the widget registry is defined', () => {
  const registry = read('src/widgets/index.js');
  const frame = read('src/widgets/WidgetFrame.jsx');
  const renderers = [...new Set([...registry.matchAll(/renderer:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))]
    .filter((name) => !MODE_VALUES.has(name));
  assert.ok(renderers.length > 10, `expected the registry to name many renderers, found ${renderers.length}`);
  const missing = renderers.filter((name) => !new RegExp(`function\\s+${name}\\s*\\(`).test(frame));
  assert.deepEqual(missing, [], `registry points at renderers that do not exist: ${missing.join(', ')}`);
});

test('every renderer the content dispatcher switches on is defined too', () => {
  const frame = read('src/widgets/WidgetFrame.jsx');
  const cases = [...new Set([...frame.matchAll(/case\s+'([A-Za-z0-9_]+)':\s*return\s*</g)].map((m) => m[1]))];
  assert.ok(cases.length > 10, `expected the dispatcher to switch on many cards, found ${cases.length}`);
  const missing = cases.filter((name) => !new RegExp(`function\\s+${name}\\s*\\(`).test(frame));
  assert.deepEqual(missing, [], `dispatcher renders cards that do not exist: ${missing.join(', ')}`);
});

test('a widget\'s renderer and its transform agree on what an ABSENT display mode means', () => {
  // A real bug, found only because a demo relied on the registry default (2026-09-18): `getRenderer` read
  // "not 'trend' ⇒ StatCard" while `transform` read "not 'stat' ⇒ the trend payload". A board that omitted
  // `displayMode` got a trend payload drawn by the StatCard — title, date range, and "—" where the count
  // belongs. Every shipped board set the field, so nothing caught it.
  const def = WIDGET_TYPES.pageviews;
  const fetched = {
    article: 'Marie Curie', total: 12345, avg: 411,
    latest: 380, trend: [{ date: '20260819', views: 400 }, { date: '20260820', views: 420 }],
  };
  // no config at all → the renderer says StatCard, so the transform must produce a StatCard payload
  assert.equal(def.getRenderer({}), 'StatCard');
  const stat = def.transform(fetched, {});
  assert.equal(stat.value, '12,345');
  assert.equal(stat.detail, '~411/day');
  assert.ok(Array.isArray(stat.trend) && stat.trend.length === 2, 'a stat card still carries its sparkline');
  // and the explicit trend mode still works, with the payload the TrendCard needs
  assert.equal(def.getRenderer({ displayMode: 'trend' }), 'TrendCard');
  const trend = def.transform(fetched, { displayMode: 'trend' });
  assert.deepEqual(trend.chartData, fetched.trend);
  assert.equal(trend.chartKey, 'views');
  assert.equal(trend.value, undefined, 'the trend payload is not the stat payload');
  // an unknown value is the default, in both — never a third state
  assert.equal(def.getRenderer({ displayMode: 'nonsense' }), 'StatCard');
  assert.equal(def.transform(fetched, { displayMode: 'nonsense' }).value, '12,345');
  // the registry default and the two functions must name the same mode
  assert.equal(def.getRenderer({ displayMode: def.defaults.displayMode }), 'StatCard');
});

test('every renderer named in the registry is REACHABLE from the content dispatcher', () => {
  // Existence was not enough. `PanoramaCard` was defined, named by the `panorama360` widget and never given a
  // `case` in `WidgetContent`, so every 360° card fell through to `default: StatCard` and rendered an empty "—".
  // It shipped that way until a demo sweep noticed the placeholder (2026-09-18). This asserts routing, which is
  // the thing that actually decides what a user sees.
  const registry = read('src/widgets/index.js');
  const frame = read('src/widgets/WidgetFrame.jsx');
  const named = [...new Set([...registry.matchAll(/renderer:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]))]
    .filter((name) => !MODE_VALUES.has(name));
  const routed = new Set([...frame.matchAll(/case '([A-Za-z0-9_]+)':/g)].map((m) => m[1]));
  const unrouted = named.filter((name) => !routed.has(name));
  assert.deepEqual(unrouted, [], `renderers with no case in WidgetContent (they fall through to StatCard): ${unrouted.join(', ')}`);
});
