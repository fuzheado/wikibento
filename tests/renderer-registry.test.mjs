import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
