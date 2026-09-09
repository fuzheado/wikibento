/**
 * Widget-to-widget dataflow constitution (ISSUE-51) — the contracts the
 * interactivity chain depends on:
 *  - resolveParams resolves {{widget:id}} against the output registry at the
 *    STRING level (arrays join with \n so a list can feed a textarea field),
 *    unknown refs are left literal and never break a board;
 *  - stringifyOutput / extractWidgetRefs contracts;
 *  - dataflow helpers: toLines / countOf / resolveSourceValue /
 *    widgetOutputSignature (content-based → identical re-emits are no-ops);
 *  - the four Dataflow widgets transform + emit correctly, and the canonical
 *    chain List → Filter → Count → Echo yields the expected numbers;
 *  - validateDashboard warns (never errors) on a `source` pointing off-board;
 *  - ISSUE-58: the Article Excerpt emitter, and the unresolved-reference guard
 *    (findUnresolvedRefs / describeUnresolvedRefs) that stops a fetch widget
 *    from sending a literal `{{widget:id}}`/`{{param}}` placeholder upstream.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveParams, stringifyOutput, extractWidgetRefs, findUnresolvedRefs, describeUnresolvedRefs, selectParamNames } from '../src/lib/params.js';
import { toLines, countOf, resolveSourceValue, widgetOutputSignature, renameWidgetRefs, findWidgetRefs, countWidgetTokens } from '../src/lib/dataflow.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

// ── interpolation (params.js) ─────────────────────────────────

test('resolveParams: {{widget:id}} substitutes the emitted output', () => {
  const outputs = { list: ['Ada Lovelace', 'Albert Einstein'] };
  const cfg = { articles: '{{widget:list}}', note: 'x {{widget:list}} y' };
  const resolved = resolveParams(cfg, {}, outputs);
  assert.equal(resolved.articles, 'Ada Lovelace\nAlbert Einstein'); // arrays join with \n
  assert.equal(resolved.note, 'x Ada Lovelace\nAlbert Einstein y');
});

test('resolveParams: scalars interpolate as strings; params still win', () => {
  const outputs = { count: 3 };
  assert.equal(resolveParams({ n: '{{widget:count}}' }, {}, outputs).n, '3');
  // board params take the SAME syntax and are unaffected
  assert.equal(resolveParams({ p: '{{cat}}' }, { cat: 'Met' }, outputs).p, 'Met');
  // param + widget can coexist in one field
  assert.equal(resolveParams({ both: '{{cat}}/{{widget:count}}' }, { cat: 'Met' }, outputs).both, 'Met/3');
});

test('resolveParams: unknown widget refs left LITERAL, no error', () => {
  const cfg = { a: '{{widget:nope}}', b: '{{widget:list}}' };
  const out = resolveParams(cfg, {}, { list: 'L' });
  assert.equal(out.a, '{{widget:nope}}');
  assert.equal(out.b, 'L');
});

test('resolveParams: identity preserved when nothing resolves', () => {
  const cfg = { n: 6, flag: true };
  assert.equal(resolveParams(cfg, {}, {}), cfg);
});

test('stringifyOutput: primitives / arrays / objects', () => {
  assert.equal(stringifyOutput(3), '3');
  assert.equal(stringifyOutput('x'), 'x');
  assert.equal(stringifyOutput(null), '');
  assert.equal(stringifyOutput(['a', 'b']), 'a\nb');
  assert.equal(stringifyOutput(['a', 2, true]), 'a\n2\ntrue');
  assert.equal(stringifyOutput({ kind: 'x' }), '{"kind":"x"}');
  assert.equal(stringifyOutput([{ a: 1 }, 2]), JSON.stringify([{ a: 1 }, 2])); // non-primitive array → JSON
});

test('extractWidgetRefs: deep, deduped, order-preserving', () => {
  assert.deepEqual(
    extractWidgetRefs({ a: '{{widget:x}}', b: ['{{widget:y}}', '{{widget:x}}'], c: { d: 'plain {{widget:z}}' } }),
    ['x', 'y', 'z'],
  );
  assert.deepEqual(extractWidgetRefs({ a: 'no refs' }), []);
});

// ── dataflow helpers ─────────────────────────────────────────

test('toLines: normalizes any emitted output to lines', () => {
  assert.deepEqual(toLines(['a', 'b']), ['a', 'b']);
  assert.deepEqual(toLines('a\n b \n\n'), ['a', 'b']); // trimmed, blanks dropped
  assert.deepEqual(toLines(42), ['42']);
  assert.deepEqual(toLines(undefined), []);
  assert.deepEqual(toLines({ a: 1 }), [JSON.stringify({ a: 1 })]);
});

test('countOf: elements/lines per output shape', () => {
  assert.equal(countOf(['a', 'b', 'c']), 3);
  assert.equal(countOf('a\nb\n\n c '), 3); // non-empty lines
  assert.equal(countOf(7), 1);
  assert.equal(countOf({ a: 1 }), 1);
  assert.equal(countOf(undefined), 0);
  assert.equal(countOf([]), 0);
});

test('resolveSourceValue: reads the config source field', () => {
  const outputs = { list: ['L'] };
  assert.deepEqual(resolveSourceValue({ source: 'list' }, outputs), ['L']);
  assert.equal(resolveSourceValue({ source: 'ghost' }, outputs), undefined);
  assert.equal(resolveSourceValue({}, outputs), undefined);
  assert.equal(resolveSourceValue({ source: 'list' }, undefined), undefined);
});

test('widgetOutputSignature: content-based, stable for identical re-emits', () => {
  const outputs = { list: ['a', 'b'], count: 2 };
  const sig = widgetOutputSignature({ source: 'list', note: '{{widget:count}}' }, outputs);
  assert.equal(sig, widgetOutputSignature({ source: 'list', note: '{{widget:count}}' }, { ...outputs, count: 2 }));
  // a changed value CHANGES the signature — the reload trigger
  assert.notEqual(sig, widgetOutputSignature({ source: 'list', note: '{{widget:count}}' }, { list: ['a', 'b'], count: 3 }));
  assert.notEqual(sig, widgetOutputSignature({ source: 'list' }, outputs)); // dropped ref changes it
  assert.equal(widgetOutputSignature({ source: 'list' }, undefined), null); // no registry → no signal
  assert.equal(widgetOutputSignature({}, outputs), null); // nothing referenced
});

// ── the four Dataflow widgets + the canonical chain ─────────

const chainConfigs = {
  listSource: { title: 'Astronauts', items: 'Ada Lovelace\nAlbert Einstein\nAlan Turing' },
  filterLines: { source: 'src', title: 'Matching', pattern: 'ei', match: 'contains', caseSensitive: false },
  lineCount: { source: 'src', label: 'matches' },
  echo: { source: 'src', title: 'Final' },
};

test('registry: the four Dataflow widgets exist, are static, and emit', () => {
  for (const id of ['listSource', 'filterLines', 'lineCount', 'echo']) {
    const def = WIDGET_TYPES[id];
    assert.ok(def, `registry missing ${id}`);
    assert.ok(!def.fetch, `${id} should be static (no fetch)`);
    assert.ok(typeof def.emit === 'function', `${id} must declare emit`);
    assert.equal(def.timeScope, 'point');
    assert.equal(def.category, 'Dataflow');
  }
  // consumers expose a source picker; the producer (listSource) feeds via interpolation
  for (const id of ['filterLines', 'lineCount', 'echo']) {
    assert.ok(WIDGET_TYPES[id].configFields.some((f) => f.type === 'source'), `${id} should expose a source picker`);
  }
  assert.ok(!WIDGET_TYPES.listSource.configFields.some((f) => f.type === 'source'), 'listSource is a producer — no source picker');
});

test('chain: Text List → Filter → Count → Echo', () => {
  const list = WIDGET_TYPES.listSource.transform(null, chainConfigs.listSource);
  assert.deepEqual(list.lines, ['Ada Lovelace', 'Albert Einstein', 'Alan Turing']);
  assert.equal(WIDGET_TYPES.listSource.emit(list), list.lines);

  const filtered = WIDGET_TYPES.filterLines.transform(null, chainConfigs.filterLines, { sourceOutput: list.lines });
  assert.deepEqual(filtered.lines, ['Albert Einstein']);
  assert.equal(filtered.subtitle, '1 of 3 lines match “ei”');
  assert.deepEqual(WIDGET_TYPES.filterLines.emit(filtered), ['Albert Einstein']);

  const counted = WIDGET_TYPES.lineCount.transform(null, chainConfigs.lineCount, { sourceOutput: filtered.lines });
  assert.equal(counted.count, 1);
  assert.equal(counted.value, '1');
  assert.equal(WIDGET_TYPES.lineCount.emit(counted), 1);

  const echo = WIDGET_TYPES.echo.transform(null, chainConfigs.echo, { sourceOutput: counted.count });
  assert.equal(echo.kind, 'value');
  assert.equal(echo.value, 1);
  assert.equal(WIDGET_TYPES.echo.emit(echo), 1);
});

test('chain: empty pattern keeps everything; no source → zero/skip states', () => {
  const all = WIDGET_TYPES.filterLines.transform(null, { ...chainConfigs.filterLines, pattern: '' }, { sourceOutput: ['a', 'b'] });
  assert.deepEqual(all.lines, ['a', 'b']);
  const none = WIDGET_TYPES.filterLines.transform(null, chainConfigs.filterLines, { sourceOutput: undefined });
  assert.deepEqual(none.lines, []);
  const z = WIDGET_TYPES.lineCount.transform(null, chainConfigs.lineCount, { sourceOutput: undefined });
  assert.equal(z.count, 0);
  const empty = WIDGET_TYPES.echo.transform(null, chainConfigs.echo, { sourceOutput: undefined });
  assert.equal(empty.kind, 'none');
  assert.equal(WIDGET_TYPES.echo.emit(empty), undefined); // echo passes nothing through when empty
});

test('filterLines: match modes + case sensitivity', () => {
  const t = (cfg, out) => WIDGET_TYPES.filterLines.transform(null, cfg, { sourceOutput: out }).lines;
  const lines = ['Ada Lovelace', 'ALBERT EINSTEIN', 'Ada Bryson'];
  assert.deepEqual(t({ source: 's', pattern: 'ADA', match: 'contains', caseSensitive: false }, lines), ['Ada Lovelace', 'Ada Bryson']);
  assert.deepEqual(t({ source: 's', pattern: 'ADA', match: 'contains', caseSensitive: true }, lines), []); // 'ADA' ≠ 'Ada'
  assert.deepEqual(t({ source: 's', pattern: 'ALBERT', match: 'starts', caseSensitive: true }, lines), ['ALBERT EINSTEIN']);
  assert.deepEqual(t({ source: 's', pattern: 'EINSTEIN', match: 'ends', caseSensitive: false }, lines), ['ALBERT EINSTEIN']);
  assert.deepEqual(t({ source: 's', pattern: 'Ada Lovelace', match: 'equals' }, lines), ['Ada Lovelace']);
});

// ── ISSUE-53: instance names + rename resolution ───────────

test('renameWidgetRefs: repoints source fields and {{widget:id}} tokens deep', () => {
  const cfg = {
    source: 'flow-list',
    articles: '{{widget:flow-list}} and {{ widget:flow-list }}',
    nested: { deep: ['x {{widget:flow-list}} y'] },
    untouched: { n: 6, flag: true, other: '{{widget:flow-other}}', obj: { b: 1 } },
  };
  const out = renameWidgetRefs(cfg, 'flow-list', 'my-list');
  assert.equal(out.source, 'my-list');
  assert.equal(out.articles, '{{widget:my-list}} and {{widget:my-list}}'); // whitespace variant normalized
  assert.deepEqual(out.nested.deep, ['x {{widget:my-list}} y']);
  assert.deepEqual(out.untouched, { n: 6, flag: true, other: '{{widget:flow-other}}', obj: { b: 1 } }); // foreign refs + values untouched
});

test('renameWidgetRefs: scalar/array passthrough, regex-special ids escaped', () => {
  assert.equal(renameWidgetRefs(42, 'a', 'b'), 42);
  assert.equal(renameWidgetRefs(undefined, 'a', 'b'), undefined);
  assert.deepEqual(renameWidgetRefs(['{{widget:l}}', '{{widget:l}}'], 'l', 'L'), ['{{widget:L}}', '{{widget:L}}']);
  // an id containing regex chars is treated as a literal token name
  assert.equal(renameWidgetRefs('{{widget:a.b}}', 'a.b', 'x'), '{{widget:x}}');
});

test('findWidgetRefs: counts source + interpolation refs, excludes self', () => {
  const widgets = [
    { id: 'src', widgetType: 'listSource', config: {} },
    { id: 'f', widgetType: 'filterLines', config: { source: 'src' } },
    { id: 'c', widgetType: 'lineCount', config: { source: 'f' } },
    { id: 'al', widgetType: 'articleList', config: { articles: '{{widget:src}}' } },
    { id: 'md', widgetType: 'markdown', config: { text: 'see {{widget:src}} and {{ widget:src }}' } },
  ];
  const hits = findWidgetRefs(widgets, 'src');
  assert.deepEqual(hits.map((h) => h.id).sort(), ['al', 'f', 'md']); // self excluded, c not referencing src
  const f = hits.find((h) => h.id === 'f');
  assert.equal(f.refs, 1);
  const md = hits.find((h) => h.id === 'md');
  assert.equal(md.refs, 2);
  assert.deepEqual(findWidgetRefs(widgets, 'nobody'), []);
});

test('countWidgetTokens: counts tokens per value', () => {
  assert.equal(countWidgetTokens('{{widget:x}} {{widget:x}}', 'x'), 2);
  assert.equal(countWidgetTokens({ a: ['{{widget:x}}'], b: '{{widget:y}}' }, 'x'), 1);
  assert.equal(countWidgetTokens(3, 'x'), 0);
});

// ── config validation ────────────────────────────────────────

test('validateDashboard: a source pointing at a board widget is fine', () => {
  const dash = {
    version: 1,
    widgets: [
      { id: 'list', widgetType: 'listSource', config: { items: 'a\nb' } },
      { id: 'count', widgetType: 'lineCount', config: { source: 'list', label: 'x' } },
    ],
    layout: [
      { i: 'list', x: 0, y: 0, w: 3, h: 3 },
      { i: 'count', x: 3, y: 0, w: 3, h: 3 },
    ],
  };
  const r = validateDashboard(JSON.stringify(dash));
  assert.ok(r.valid, `expected valid: ${r.errors.join('; ')}`);
  assert.ok(!r.warnings.some((w) => w.includes('flow-note') || w.includes('"source"')), `unexpected warn: ${r.warnings}`);
});

test('validateDashboard: a source pointing off-board warns but imports', () => {
  const dash = {
    version: 1,
    widgets: [
      { id: 'count', widgetType: 'lineCount', config: { source: 'ghost' } },
    ],
    layout: [{ i: 'count', x: 0, y: 0, w: 3, h: 3 }],
  };
  const r = validateDashboard(JSON.stringify(dash));
  assert.ok(r.valid, 'import must NOT be blocked');
  assert.ok(r.warnings.some((w) => w.includes('ghost')), `expected a warning naming "ghost": ${r.warnings}`);
});

test('validateDashboard: warns (never errors) on an unreferrable id format', () => {
  const dash = {
    version: 1,
    widgets: [{ id: 'my list!', widgetType: 'listSource', config: { items: 'a' } }],
    layout: [{ i: 'my list!', x: 0, y: 0, w: 3, h: 3 }],
  };
  const r = validateDashboard(JSON.stringify(dash));
  assert.ok(r.valid, 'import must NOT be blocked');
  assert.ok(r.warnings.some((w) => w.includes('my list!')), `expected a warning naming the id: ${r.warnings}`);
});

test('validateDashboard: `source` is a known key on consumer widgets (no unknown-key warning)', () => {
  const dash = {
    version: 1,
    widgets: [
      { id: 'src', widgetType: 'listSource', config: { items: 'a' } },
      { id: 'f', widgetType: 'filterLines', config: { source: 'src', pattern: 'a' } },
    ],
    layout: [
      { i: 'src', x: 0, y: 0, w: 3, h: 3 },
      { i: 'f', x: 3, y: 0, w: 3, h: 3 },
    ],
  };
  const r = validateDashboard(JSON.stringify(dash));
  assert.ok(r.valid, r.errors.join('; '));
  assert.ok(!r.warnings.some((w) => w.includes('unknown config key "source"')), `unexpected warn: ${r.warnings}`);
});

test('validateDashboard: the shipped flow demo is valid', async () => {
  const dash = JSON.parse(await readFile('public/flow-demo.json', 'utf8'));
  const r = validateDashboard(JSON.stringify(dash));
  assert.ok(r.valid, `flow-demo must be valid: ${r.errors.join('; ')}`);
});
// ── ISSUE-58: producer emitter + unresolved-reference guard ──

test('registry: Article Excerpt declares emit and emits its extract text', () => {
  const def = WIDGET_TYPES.excerpt;
  assert.ok(def, 'excerpt registry entry missing');
  assert.equal(typeof def.emit, 'function', 'excerpt must declare emit');
  const view = def.transform({ title: 'T', description: 'D', extract: 'The extract.', thumbnailUrl: 'u', pageUrl: 'p' });
  assert.equal(def.emit(view), 'The extract.');
  // a summary without an extract (edge) must not throw and must emit undefined
  assert.equal(def.emit(def.transform({ title: 'T' })), undefined);
});

test('findUnresolvedRefs: detects {{widget:id}} and {{param}} deeply, deduped', () => {
  const cfg = {
    text: '{{widget:excerpt-1}} and {{widget:excerpt-1}}',
    nested: { list: ['ok', '{{topic}}'] },
    n: 3,
  };
  const refs = findUnresolvedRefs(cfg);
  assert.equal(refs.length, 2, JSON.stringify(refs));
  assert.deepEqual(refs.map((r) => r.kind).sort(), ['param', 'widget']);
  assert.deepEqual(refs.find((r) => r.kind === 'widget'), { raw: '{{widget:excerpt-1}}', kind: 'widget', name: 'excerpt-1' });
  assert.deepEqual(refs.find((r) => r.kind === 'param'), { raw: '{{topic}}', kind: 'param', name: 'topic' });
});

test('findUnresolvedRefs: empty once resolveParams has substituted everything', () => {
  const cfg = { text: '{{widget:excerpt-1}}', article: '{{topic}}' };
  const resolved = resolveParams(cfg, { topic: 'Albert Einstein' }, { 'excerpt-1': 'The extract.' });
  assert.deepEqual(findUnresolvedRefs(resolved), []);
  // an emitted EMPTY string is resolved too (no placeholder left)
  const empty = resolveParams({ text: 'x{{widget:e}}y' }, {}, { e: '' });
  assert.deepEqual(findUnresolvedRefs(empty), []);
});

test('findUnresolvedRefs: unknown refs stay literal AND are reported (the guard case)', () => {
  const resolved = resolveParams({ text: '{{widget:missing}}' }, {}, { other: 'v' });
  assert.equal(resolved.text, '{{widget:missing}}'); // unchanged, visible
  const refs = findUnresolvedRefs(resolved);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].name, 'missing');
});

test('describeUnresolvedRefs: names the widget/param and why', () => {
  const msg = describeUnresolvedRefs([
    { raw: '{{widget:excerpt-1}}', kind: 'widget', name: 'excerpt-1' },
    { raw: '{{topic}}', kind: 'param', name: 'topic' },
  ]);
  assert.match(msg, /widget output “excerpt-1”/);
  assert.match(msg, /board param “topic”/);
  assert.equal(describeUnresolvedRefs([]), '');
});

// ── ISSUE-59: per-card board-param scoping ──

test('registry: Board Controls declares the params picker (key `show`)', () => {
  const def = WIDGET_TYPES.boardControls;
  const field = def.configFields.find((f) => f.key === 'show');
  assert.ok(field, 'boardControls must declare a `show` config field');
  assert.equal(field.type, 'params');
  // transform carries the allow-list to the renderer (default = empty = all)
  assert.equal(def.transform(null, { title: 'T' }).show, '');
  assert.equal(def.transform(null, { title: 'T', show: 'topic' }).show, 'topic');
});

test('selectParamNames: empty/missing = every declared param (backward compatible)', () => {
  const specs = { topic: {}, targetLang: {} };
  assert.deepEqual(selectParamNames(specs, ''), ['topic', 'targetLang']);
  assert.deepEqual(selectParamNames(specs, undefined), ['topic', 'targetLang']);
  assert.deepEqual(selectParamNames(specs, '   '), ['topic', 'targetLang']);
  assert.deepEqual(selectParamNames({}, 'topic'), []);
  assert.deepEqual(selectParamNames(null, 'topic'), []);
});

test('selectParamNames: scopes to the allow-list in declaration order, ignores unknown names', () => {
  const specs = { topic: {}, targetLang: {}, month: {} };
  assert.deepEqual(selectParamNames(specs, 'targetLang'), ['targetLang']);
  assert.deepEqual(selectParamNames(specs, 'month,topic'), ['topic', 'month']); // declaration order, not input order
  assert.deepEqual(selectParamNames(specs, ' topic , targetLang '), ['topic', 'targetLang']);
  assert.deepEqual(selectParamNames(specs, 'nope,topic'), ['topic']); // unknown ignored
  assert.deepEqual(selectParamNames(specs, 'nope'), []); // nothing valid → empty card
});
