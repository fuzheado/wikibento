/**
 * Demo-suite constitution (ISSUE-63).
 *
 * The demo boards are the front door. They must stay valid, self-consistent
 * (every {{widget:id}} and {{param}} resolves inside the board), and the hub's
 * links must point at boards that actually exist. Also covers the markdown
 * same-origin links the hub relies on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { validateDashboard } from '../src/lib/dashboardConfig.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { extractWidgetRefs } from '../src/lib/params.js';
import { renderMarkdown } from '../src/lib/markdown.js';

const DIR = 'public';
const demoFiles = readdirSync(DIR).filter((f) => f.endsWith('-demo.json')).sort();
const boards = [...demoFiles, 'dashboard.json', 'demos.json'];
const read = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));

test('demos: every board validates (format v1, known types, layout matches)', () => {
  for (const f of boards) {
    const r = validateDashboard(readFileSync(`${DIR}/${f}`, 'utf8'));
    assert.ok(r.valid, `${f}: ${r.errors.join('; ')}`);
  }
});

test("the served board guide's example imports cleanly (the door must be copyable)", () => {
  // public/board-guide.md is assembled by scripts/board-guide.mjs and its §1 example is the first thing an outside
  // producer copies. An example that does not import would teach the failure the guide exists to prevent — the
  // 2026-10-01 audit measured 48/48 envelope misses from a model given the catalog alone.
  const guide = readFileSync(`${DIR}/board-guide.md`, 'utf8');
  const block = (guide.match(/```json\n([\s\S]*?)\n```/) || [])[1];
  assert.ok(block, 'the board guide has no ```json example to check');
  const r = validateDashboard(block);
  assert.ok(r.valid, `the guide's example does not import: ${r.errors.join('; ')}`);
  assert.deepEqual(r.warnings, [], `the guide's example imports with warnings: ${r.warnings.join('; ')}`);
  for (const w of r.widgets) assert.ok(WIDGET_TYPES[w.widgetType], `the guide's example uses the unregistered type ${w.widgetType}`);
  const ids = new Set(r.widgets.map((w) => w.id));
  for (const l of r.layout) assert.ok(ids.has(l.i), `the guide's example has a layout item naming no widget: ${l.i}`);
  assert.ok(r.params?.article, 'the guide\'s example lost its params block');
});

test('demos: ids are unique and every widgetType is registered', () => {
  for (const f of boards) {
    const d = read(f);
    const ids = d.widgets.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, `${f}: duplicate widget ids`);
    for (const w of d.widgets) {
      assert.ok(WIDGET_TYPES[w.widgetType], `${f}: unknown widgetType "${w.widgetType}"`);
    }
    assert.equal(d.layout.length, d.widgets.length, `${f}: layout/widget count mismatch`);
  }
});

test('demos: every {{widget:id}} and {{param}} resolves inside the board', () => {
  for (const f of boards) {
    const d = read(f);
    const ids = new Set(d.widgets.map((w) => w.id));
    const params = new Set(Object.keys(d.params || {}));
    const configs = d.widgets.map((w) => w.config);
    for (const ref of extractWidgetRefs(configs)) {
      // A reference may name a channel (ISSUE-91): `id#selection`. The widget must exist, and a named
      // channel must be declared — a typo in a channel is as broken as a typo in an id.
      const [refId, channel] = ref.split('#');
      assert.ok(ids.has(refId), `${f}: {{widget:${ref}}} points off-board`);
      if (channel) {
        const def = WIDGET_TYPES[d.widgets.find((w) => w.id === refId).widgetType];
        assert.ok(channel in (def.outputs || {}), `${f}: {{widget:${ref}}} names an undeclared channel`);
      }
    }
    const blob = JSON.stringify(configs);
    for (const m of blob.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?(?:#([a-zA-Z0-9_-]+))?\s*\}\}/g)) {
      const name = m[1];
      if (name === 'widget') continue; // covered by extractWidgetRefs above
      assert.ok(params.has(name), `${f}: {{${name}}} is not a declared param`);
    }
  }
});

test('demos: no board layout overlaps itself (a file must not contradict the renderer)', () => {
  // react-grid-layout compacts vertically on mount, so self-overlapping rectangles render fine — which is how three
  // boards came to carry twelve overlapping pairs between them while every sweep passed: the renderer was quietly
  // repairing the files (measured 2026-10-02; dashboard.json had grown from 7 pairs on 2026-09-18 to 9, because a new
  // tile was added into a collision and nothing said so). The invariant belongs to the FILE. `npm run repack:layouts`
  // stores what the browser already draws — verified render-neutral by measuring every card's rendered geometry
  // before and after (43 + 9 + 6 cards, zero differences).
  for (const f of boards) {
    const layout = read(f).layout || [];
    const hits = [];
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i];
        const b = layout[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) hits.push(`${a.i} × ${b.i}`);
      }
    }
    assert.deepEqual(hits, [], `${f}: ${hits.length} overlapping layout pair(s) — ${hits.join(', ')} · run \`npm run repack:layouts\``);
  }
});

test('demos: the hub links every board and each link exists', () => {
  const hub = read('demos.json');
  const md = hub.widgets.find((w) => w.widgetType === 'markdown');
  assert.ok(md, 'hub must have a markdown index card');
  const links = [...md.config.text.matchAll(/\]\(\?config=([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 5, `hub should link the suite (found ${links.length})`);
  for (const href of links) {
    assert.ok(existsSync(`${DIR}${href}`), `hub link ${href} does not exist`);
  }
  // every demo board is reachable from the hub
  for (const f of demoFiles) {
    assert.ok(links.includes(`/${f}`), `hub does not link ${f}`);
  }
});

test('markdown: same-origin links navigate in place; absolute open a new tab; unsafe stay text', () => {
  const html = renderMarkdown('[rel](?config=/x.json) [path](/demos.json) [abs](https://example.org) [pr](//evil.com) [js](javascript:alert(1))');
  assert.match(html, /<a href="\?config=\/x\.json">rel<\/a>/);
  assert.match(html, /<a href="\/demos\.json">path<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.org" target="_blank" rel="noopener noreferrer">abs<\/a>/);
  assert.ok(!/<a[^>]+evil\.com/.test(html), 'protocol-relative URLs must not become links');
  assert.ok(!/<a[^>]+javascript/i.test(html), 'javascript: URLs must not become links');
});
