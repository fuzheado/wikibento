/**
 * The retired widget ids — every one of them — must keep working.
 *
 * `AGENTS.md` states the rule: "A retired widget type id must keep resolving (`widgetDef`), and its config must keep
 * meaning what it meant." On 2026-10-08 a board proved the rule was only half kept: `widgetDef` did resolve
 * `cimSnapshot` → `cimStats`, and the *renderer* was fine, but five places in `WidgetFrame.jsx` (and ten in `App.jsx`)
 * decided what a widget *is* — does it fetch? what are its fields? is it an emitter? — by reading
 * `WIDGET_TYPES[widget.widgetType]`, the raw stored id. A retired id is not a key in that table, so `undefined?.fetch`
 * read as "static": the card never fetched, its `emit` was handed `null`, and the shaper that reads
 * `data.category` threw before anything could be drawn. Nothing caught it, because nothing *renders* a retired id:
 * the fixtures that mention them are unit and doctor tests, and every demo board has been migrated to current ids.
 *
 * So this file holds three things: the resolution invariants per retired id, the contract that an `emit` is never the
 * thing that throws, and a text gate that stops the raw-table habit coming back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGET_TYPES, widgetDef } from '../src/widgets/index.js';
import { LEGACY_CIM_IDS } from '../src/lib/cimFamily.js';
import { LEGACY_GALLERY_IDS } from '../src/lib/gallerySource.js';

// The suite runs from the repo root (and bundling puts this file there too), which is how the sibling tests
// reach repo files — see tests/manifest-compliance.test.mjs.
const root = process.cwd();
const RETIRED = [...Object.keys(LEGACY_CIM_IDS), ...Object.keys(LEGACY_GALLERY_IDS)];

test('every retired id resolves, to a type that exists and can be rendered', () => {
  assert.ok(RETIRED.length >= 10, `the retired ids are the two families: ${RETIRED.join(', ')}`);
  const cases = new Set([...readFileSync(join(root, 'src/widgets/WidgetFrame.jsx'), 'utf8')
    .matchAll(/case\s+'(\w+)':/g)].map((m) => m[1]));
  for (const id of RETIRED) {
    assert.equal(WIDGET_TYPES[id], undefined, `${id} must NOT be a registry key — the Add panel would list it twice`);
    const def = widgetDef(id);
    assert.ok(def, `${id} resolves`);
    assert.ok(WIDGET_TYPES[def.id], `${id} resolves to a type that exists (${def.id})`);
    assert.ok(cases.has(def.renderer), `${id} → ${def.id} resolves to renderer ${def.renderer}, which the frame handles`);
    assert.ok(def.configFields?.length, `${id} keeps its fields through the resolution`);
  }
});

test('a retired id takes the same path its target takes — fetching included (ISSUE-142)', () => {
  // The regression in one assertion: the renderer used to ask the *raw* table whether a widget fetches, so a retired
  // id read as "static" and the card never loaded. Whatever the resolved definition says about `fetch` and `transform`
  // is what the widget must do, because that is the decision the frame now makes.
  for (const id of RETIRED) {
    const def = widgetDef(id);
    const target = WIDGET_TYPES[def.id];
    assert.equal(def.fetch, target.fetch, `${id} must fetch exactly when ${def.id} does`);
    assert.equal(def.transform, target.transform, `${id} must transform exactly as ${def.id} does`);
    assert.equal(def.renderer, target.renderer, `${id} must render as ${def.id} does`);
  }
});

test('a retired id keeps the meaning it had — the target\'s defaults plus the id\'s own implied config', () => {
  for (const id of RETIRED) {
    const def = widgetDef(id);
    const target = WIDGET_TYPES[def.id];
    assert.deepEqual(def.configFields, target.configFields, `${id}: same fields as ${def.id}`);
    for (const [key, value] of Object.entries(def.defaults || {})) {
      if (key in (target.defaults || {})) continue;      // the target's own default, unchanged
      assert.equal(value, (LEGACY_CIM_IDS[id]?.config || {})[key],
        `${id}: a default that ${def.id} does not declare must come from the retired id's implied config`);
    }
  }
  // The two the family merge promised, spelled out so a wrong merge cannot pass silently.
  assert.equal(widgetDef('cimSnapshot').defaults.subject, 'category');
  assert.equal(widgetDef('cimFileSpotlight').defaults.subject, 'file');
  assert.equal(widgetDef('cimTopPages').defaults.facet, 'pages');
});

test('no module looks a widget up by its stored id — the raw table is the registry\'s own business', () => {
  // This is the habit that broke ISSUE-142. `widgetDef()` is the only way in from outside the registry module, and it
  // costs the same to call. Files are read as text because a reviewer cannot be relied on to remember this — the gate
  // can. (Comments are skipped: this file's own explanations name the table.)
  const walk = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry) ? [full] : [];
  });
  const offenders = [];
  for (const file of walk(join(root, 'src'))) {
    if (file.endsWith(join('widgets', 'index.js'))) continue;         // the table's own module
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/\bWIDGET_TYPES\s*\[/.test(code)) offenders.push(`${file.slice(root.length + 1)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    'use widgetDef(widget.widgetType) — or the definition the frame already resolved — instead of the raw table');
});

test('no emit throws when it is handed nothing (the static pass can have no data)', () => {
  // The loader documents that `emit` runs in both the static and the fetch paths; ISSUE-142 is what happens when the
  // value is `null` and an emit reads a property off it. An emit returns nothing for nothing — that is the contract.
  const emitters = Object.values(WIDGET_TYPES).filter((d) => d.emit);
  assert.ok(emitters.length >= 12, `found ${emitters.length} emitters`);
  for (const def of emitters) {
    for (const empty of [null, undefined]) {
      try {
        def.emit(empty, { ...(def.defaults || {}) });
      } catch (e) {
        assert.fail(`${def.id}.emit(${String(empty)}) threw: ${e.message}`);
      }
    }
  }
});
