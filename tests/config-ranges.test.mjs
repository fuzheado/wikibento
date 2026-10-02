/**
 * Config range validation (2026-08-17) — and, since 2026-10-02, the severity of a mistyped VALUE (ISSUE-134).
 *
 * The range half: a widget whose registry `configFields` declare min/max gets a non-fatal warning when out of range,
 * naming the value it will be clamped to — and since 2026-10-02 the clamp actually happens for every intake path
 * (`coerceFieldValue`), where before the message was a promise nothing kept.
 *
 * The type half was REVERSED by the owner's decision on ISSUE-134: a mistyped value used to *block* the import, while
 * `docs/JSON-FORMAT.md` has always called it **Repairable** ("normalise silently, and report it if it changed
 * anything") and AGENTS.md says to coerce by the field's declared type. It is now a **repair**: the board loads, the
 * app reads the value its own coercer can read, and the reader is told. What still refuses a board is structural —
 * an unknown widget type, a malformed board, `params` that is not an object.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDashboard } from '../src/lib/dashboardConfig.js';
import { MIN_REFRESH_SECONDS } from '../src/lib/configNormalize.js';
import { coerceFieldValue, normalizeConfigForDef } from '../src/lib/configNormalize.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

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
  assert.match(ws[0], /clamped to 30000/, 'the message names what the value becomes');
});

test('the clamp the message promises is real (the coercer applies min/max on every intake path)', () => {
  // Before 2026-10-02 "will be clamped" was a claim with nothing behind it for most fields. `normalizeConfigForDef`
  // enforces it now, which is what makes accepting an out-of-range board safe.
  const def = WIDGET_TYPES.glamorgan;
  assert.equal(coerceFieldValue({ key: 'fileBudget', type: 'number', min: 50, max: 30000 }, 90000), 30000);
  assert.equal(normalizeConfigForDef({ category: 'C', fileBudget: 90000, refreshSeconds: 5 }, def).fileBudget, 30000);
  assert.equal(normalizeConfigForDef({ category: 'C', refreshSeconds: 5 }, def).refreshSeconds, MIN_REFRESH_SECONDS);
});

test('fileBudget below the declared min warns', () => {
  const ws = warningsFor({ category: 'C', fileBudget: 10 }, 'fileBudget');
  assert.equal(ws.length, 1);
  assert.match(ws[0], /out of range 50–30000/);
});

test('a mistyped VALUE is repaired and reported, not refused (ISSUE-134, owner\'s call 2026-10-02)', () => {
  // `"many"` cannot be read as a number, so the app leaves it exactly as written and says so — the documented model.
  const r = validateDashboard(glam({ category: 'C', fileBudget: 'many' }));
  assert.equal(r.valid, true, 'a mistyped value must not block the board');
  assert.equal(r.errors.length, 0);
  assert.ok(r.repairs.find((x) => x.includes('fileBudget') && x.includes('not a number')), r.repairs.join(' | '));

  // …and one it CAN read is read, out loud: this is the case the Ask door meets, because a chat writes `"200"`.
  const stringy = validateDashboard(glam({ category: 'C', fileBudget: '2000' }));
  assert.equal(stringy.valid, true);
  assert.ok(stringy.repairs.find((x) => x.includes('read as the number 2000')), stringy.repairs.join(' | '));
  assert.equal(stringy.warnings.filter((x) => x.includes('fileBudget')).length, 0, 'a readable value is a repair, not a warning');
});

test('depth and topN ranges warn too (registry min/max applies to every number field)', () => {
  const ws = warningsFor({ category: 'C', depth: 99, topN: 99 }, 'out of range');
  assert.ok(ws.some((x) => x.includes('"depth" is 99')));
  assert.ok(ws.some((x) => x.includes('"topN" is 99')));
});

test('missing config falls back to defaults, and says so as a repair', () => {
  const r = validateDashboard({ widgets: [{ id: 'g1', widgetType: 'glamorgan' }], layout: [] });
  assert.equal(r.valid, true);
  assert.ok(r.repairs.find((x) => x.includes('missing "config"')), r.repairs.join(' | '));
});
