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
      assert.ok(ids.has(ref), `${f}: {{widget:${ref}}} points off-board`);
    }
    const blob = JSON.stringify(configs);
    for (const m of blob.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\s*\}\}/g)) {
      const name = m[1];
      if (name === 'widget') continue; // covered by extractWidgetRefs above
      assert.ok(params.has(name), `${f}: {{${name}}} is not a declared param`);
    }
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
