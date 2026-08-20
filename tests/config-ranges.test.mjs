/**
 * Config range validation (2026-08-17) — the import validator must never
 * silently accept a number the fetcher will clamp. Widgets whose registry
 * configFields declare min/max get a non-fatal warning when out of range
 * (same philosophy as the layout "w out of range 1-12 — will be clamped"
 * warning); type errors still block the import. The fetcher's clamp stays
 * the last line of defense.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const glam = (config) => ({
  widgets: [{ id: 'g1', widgetType: 'glamorgan', config }],
  layout: [{ i: 'g1', x: 0, y: 0, w: 6, h: 4 }],
});

const warningsFor = (config, key) => {
  const r = validateDashboard(glam(config));
  return r.warnings.filter((x) => x.includes(key));
};

test('fileBudget within the declared range imports clean', () => {
  for (const v of [50, 500, 5000, 10000, 30000]) {
    const r = validateDashboard(glam({ category: 'C', fileBudget: v }));
    assert.equal(r.valid, true, `fileBudget ${v} should be valid`);
    assert.equal(r.errors.length, 0);
    assert.equal(r.warnings.length, 0, `fileBudget ${v} should have no warnings`);
  }
});

test('fileBudget above the declared max warns (fetcher will clamp)', () => {
  const ws = warningsFor({ category: 'C', fileBudget: 50000 }, 'fileBudget');
  assert.equal(ws.length, 1, 'expected exactly one fileBudget warning');
  assert.match(ws[0], /out of range 50–30000/);
  assert.match(ws[0], /will be clamped/);
});

test('fileBudget below the declared min warns', () => {
  const ws = warningsFor({ category: 'C', fileBudget: 10 }, 'fileBudget');
  assert.equal(ws.length, 1);
  assert.match(ws[0], /out of range 50–30000/);
});

test('non-number config values still block the import (errors, not warnings)', () => {
  const r = validateDashboard(glam({ category: 'C', fileBudget: 'many' }));
  assert.equal(r.valid, false);
  assert.ok(r.errors.find((x) => x.includes('fileBudget') && x.includes('must be a number')));
});

test('depth and topN ranges warn too (registry min/max applies to every number field)', () => {
  const ws = warningsFor({ category: 'C', depth: 99, topN: 99 }, 'out of range');
  assert.ok(ws.some((x) => x.includes('"depth" is 99')));
  assert.ok(ws.some((x) => x.includes('"topN" is 99')));
});

test('missing config falls back to defaults without warnings', () => {
  const r = validateDashboard({ widgets: [{ id: 'g1', widgetType: 'glamorgan' }], layout: [] });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.find((x) => x.includes('missing "config"')));
});
