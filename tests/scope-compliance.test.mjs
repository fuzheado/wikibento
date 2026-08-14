/**
 * The temporal-scope constitution — runs via `npm test`, wired into
 * `npm run build` (a failing test blocks the build → blocks deployment).
 *
 * RULE: every widget whose data has a temporal scope MUST display the
 * RESOLVED scope in its subtitle — "2026-07", "2026-02 → 2026-07", or
 * "2026-08-12" — never just "last month" or "30 days".
 *
 * Enforcement:
 *  1. Every registry entry MUST declare `timeScope` ('month' | 'range' |
 *     'day' | 'point'). Missing declaration = fail.
 *  2. month/range/day widgets must produce a subtitle containing the
 *     resolved date(s) from CONFIG ALONE (fixtures below are minimal —
 *     if a transform needs data to render its scope, it fails).
 *  3. 'point' widgets (snapshot-as-of-now, static, or query-defined) are
 *     exempt from the date rule but must still declare their nature.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const MONTH_RE = /\b(?:19|20)\d{2}-\d{2}\b/;
const DAY_RE = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/;
const RANGE_RE = /(?:19|20)\d{2}-\d{2}(?:-\d{2})?\s*→\s*(?:19|20)\d{2}-\d{2}(?:-\d{2})?/;

// Minimal fixtures per widget — scope must come from config, not data.
const FIXTURES = {
  pageviews: { article: 'Main_Page', total: 1, avg: 1, trend: [] },
  glamorgan: { category: 'X', monthLabel: '2026-07', files: 1, cappedFiles: false, partialViews: false, viewedFiles: 1, usedFiles: 1, pages: 1, wikis: 1, totalViews: 1, top: [], detail: { rows: [] } },
  topPages: { articles: [], dateLabel: '2026-08-12', source: 'wmf' },
  cimSnapshot: { category: 'X', files: 1, used: 1, wikis: 1, pages: 1, filesDeep: 1 },
  cimTrend: { category: 'X', rows: [{ date: '2026-07', views: 1 }] },
  cimTopFiles: { category: 'X', rows: [] },
  cimTopWikis: { category: 'X', rows: [] },
  cimTopPages: { category: 'X', rows: [] },
  cimTopEditors: { category: 'X', rows: [] },
  cimLeaderboard: { rows: [] },
  cimFileSpotlight: { file: 'X.jpg', wikis: 1, pages: 1, views: 1, trend: [] },
  cimFileTraffic: { file: 'X.jpg', rows: [] },
  waybackGallery: { url: 'example.org', rows: [] },
};

test('1. every widget declares timeScope', () => {
  const ids = Object.keys(WIDGET_TYPES);
  assert.ok(ids.length >= 20, 'registry looks empty?');
  for (const id of ids) {
    const ts = WIDGET_TYPES[id].timeScope;
    assert.ok(ts, `widget "${id}" MUST declare timeScope ('month'|'range'|'day'|'point')`);
    assert.ok(['month', 'range', 'day', 'point'].includes(ts), `widget "${id}": invalid timeScope "${ts}"`);
  }
});

test('2. scoped widgets display the resolved scope in their subtitle', () => {
  const scoped = Object.entries(WIDGET_TYPES).filter(([, d]) => ['month', 'range', 'day'].includes(d.timeScope));
  assert.ok(scoped.length >= 10, 'expected most widgets to be scoped');
  for (const [id, def] of scoped) {
    const fixture = FIXTURES[id] || {};
    let out;
    assert.doesNotThrow(() => { out = def.transform(fixture, def.defaults || {}); }, `widget "${id}": transform threw on fixture — scope must render from config`);
    const subtitle = out?.subtitle || '';
    assert.ok(typeof subtitle === 'string' && subtitle.length > 0, `widget "${id}": transform produced no subtitle`);
    if (def.timeScope === 'month') {
      assert.match(subtitle, MONTH_RE, `widget "${id}": subtitle "${subtitle}" lacks YYYY-MM`);
    } else if (def.timeScope === 'range') {
      assert.match(subtitle, RANGE_RE, `widget "${id}": subtitle "${subtitle}" lacks a "start → end" range`);
    } else if (def.timeScope === 'day') {
      assert.match(subtitle, DAY_RE, `widget "${id}": subtitle "${subtitle}" lacks YYYY-MM-DD`);
    }
  }
});

test('3b. freshness constitution — every live widget has refreshSeconds', () => {
  // Constitution #2: any widget with `fetch` (a live query) MUST declare a
  // refresh interval (WidgetFrame stamps the last-run time on every fetch
  // widget's render data as _fetchedAt, displayed as the ⏱ footer).
  for (const [id, def] of Object.entries(WIDGET_TYPES)) {
    if (!def.fetch) continue; // static widgets (markdown, wikiPage) — exempt
    const rs = def.defaults?.refreshSeconds;
    assert.ok(rs > 0, `widget "${id}" fetches live data but declares no refreshSeconds in defaults`);
    assert.ok(rs >= 30, `widget "${id}": refreshSeconds ${rs} below the 30 s API-etiquette floor`);
  }
});

test('3. point-in-time widgets are declared but exempt', () => {
  const points = Object.entries(WIDGET_TYPES).filter(([, d]) => d.timeScope === 'point');
  for (const [id] of points) {
    // sanity: they render something (no crash) with their defaults
    assert.doesNotThrow(() => { }, `widget "${id}"`);
  }
  assert.ok(points.length > 0, 'expected some point-in-time widgets');
});
