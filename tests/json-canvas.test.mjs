import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardToCanvas, toCanvasBox, subjectUrl, canvasFilename, CANVAS_GRID } from '../src/lib/jsonCanvas.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { EXAMPLE_DASHBOARD } from '../src/lib/dashboardConfig.js';

/**
 * A board as a JSON Canvas document (jsoncanvas.org, spec 1.0).
 *
 * Two kinds of test here, and they check different things:
 *
 *  - **Spec conformance** (`assertValidCanvas`) over a real board — the one-of-every-widget-type example — so the
 *    export cannot quietly start emitting something no canvas tool will open: required fields, integer geometry,
 *    unique ids, edges that name nodes that exist, enumerations where the spec fixes them.
 *  - **The projection rules** over a synthetic registry, because they are judgements, not mechanics: which card
 *    becomes a `link` and which a `text` node, that a URL only comes from a *declared and applicable* field, that
 *    `{{widget:id}}` references (and `source` fields) become edges, and that foreign top-level keys ride along
 *    without ever shadowing `nodes`/`edges`.
 */

const NODE_TYPES = new Set(['text', 'file', 'link', 'group']);
const SIDES = new Set(['top', 'right', 'bottom', 'left']);
const ENDS = new Set(['none', 'arrow']);

function assertValidCanvas(doc) {
  assert.ok(Array.isArray(doc.nodes), 'nodes must be an array');
  assert.ok(Array.isArray(doc.edges), 'edges must be an array');
  const ids = new Set();
  for (const n of doc.nodes) {
    assert.equal(typeof n.id, 'string', 'every node needs a string id');
    assert.ok(!ids.has(n.id), `duplicate node id: ${n.id}`);
    ids.add(n.id);
    assert.ok(NODE_TYPES.has(n.type), `unknown node type: ${n.type}`);
    for (const k of ['x', 'y', 'width', 'height']) {
      assert.ok(Number.isInteger(n[k]), `${n.id}.${k} must be an integer (spec: integer, in pixels)`);
    }
    assert.ok(n.width > 0 && n.height > 0, `${n.id} has no area`);
    if (n.type === 'link') assert.equal(typeof n.url, 'string', `${n.id} link node needs a url`);
    if (n.type === 'text') assert.equal(typeof n.text, 'string', `${n.id} text node needs text`);
  }
  const edgeIds = new Set();
  for (const e of doc.edges) {
    assert.ok(typeof e.id === 'string' && !edgeIds.has(e.id), `edge id problem: ${e.id}`);
    edgeIds.add(e.id);
    assert.ok(ids.has(e.fromNode), `${e.id} starts at a node that is not in the document`);
    assert.ok(ids.has(e.toNode), `${e.id} ends at a node that is not in the document`);
    if (e.fromSide) assert.ok(SIDES.has(e.fromSide), `bad fromSide: ${e.fromSide}`);
    if (e.toSide) assert.ok(SIDES.has(e.toSide), `bad toSide: ${e.toSide}`);
    if (e.fromEnd) assert.ok(ENDS.has(e.fromEnd), `bad fromEnd: ${e.fromEnd}`);
    if (e.toEnd) assert.ok(ENDS.has(e.toEnd), `bad toEnd: ${e.toEnd}`);
  }
  return { nodes: doc.nodes.length, edges: doc.edges.length };
}

// A tiny stand-in registry: the projection rules are about *declarations*, so the test declares them.
const DEFS = {
  note: { name: 'Note', defaults: {}, configFields: [{ key: 'text', label: 'Text' }] },
  count: { name: 'Count', defaults: {}, configFields: [{ key: 'source', label: 'Input source', type: 'source' }] },
  gallery: {
    name: 'Gallery',
    defaults: { from: 'article' },
    configFields: [
      { key: 'from', label: 'Source' },
      { key: 'category', label: 'Category', showIf: { from: 'category' } },
      { key: 'page', label: 'Page', showIf: { from: 'page' } },
    ],
  },
};

const wid = (id, widgetType, config = {}) => ({ id, widgetType, config });
const lay = (i, x = 0, y = 0, w = 3, h = 3) => ({ i, x, y, w, h });
const canvas = (widgets, layout, extras) => boardToCanvas({ widgets, layout, defs: DEFS, extras });

test('the export of a real board — one of every widget type — is a valid JSON Canvas 1.0 document', () => {
  const widgets = EXAMPLE_DASHBOARD.widgets || [];
  const doc = boardToCanvas({ widgets, layout: EXAMPLE_DASHBOARD.layout || [], defs: WIDGET_TYPES });
  assert.ok(widgets.length > 10, 'the example board should exercise many types');
  assertValidCanvas(doc);
  assert.equal(doc.nodes.length, widgets.length, 'every card must appear exactly once');
  assert.deepEqual(
    doc.nodes.map((n) => n.id).sort(),
    widgets.map((w) => w.id).sort(),
    'the node ids are the widget ids',
  );
  // Everything the app knows about the card travels as a foreign field, which is what a future import would read.
  for (const n of doc.nodes) {
    assert.ok(n.wikibento && typeof n.wikibento.widgetType === 'string', `${n.id} carries its widget payload`);
    assert.equal(n.wikibento.widgetType, widgets.find((w) => w.id === n.id).widgetType);
  }
});

test('grid units become pixels on the app’s own grid (12 columns, rowHeight 80, margin 12)', () => {
  assert.deepEqual(CANVAS_GRID, { cols: 12, cellWidth: 110, rowHeight: 80, gap: 12 });
  assert.deepEqual(toCanvasBox({ x: 0, y: 0, w: 1, h: 1 }), { x: 0, y: 0, width: 110, height: 80 });
  assert.deepEqual(toCanvasBox({ x: 1, y: 2, w: 2, h: 1 }), { x: 122, y: 184, width: 232, height: 80 });
  // Missing or nonsense geometry never produces a zero-area node: a card occupies at least one cell.
  for (const bad of [{}, { x: 'nope', y: -4, w: 0, h: null }]) {
    const box = toCanvasBox(bad);
    assert.ok(Number.isInteger(box.x) && box.x >= 0 && box.width >= 110 && box.height >= 80, JSON.stringify(box));
  }
  // A placed card keeps its place, and the layout round-trips: the same grid box yields the same pixels.
  const doc = canvas([wid('q1', 'note')], [lay('q1', 4, 1, 6, 3)]);
  assert.deepEqual(toCanvasBox(lay('q1', 4, 1, 6, 3)), { x: 488, y: 92, width: 720, height: 264 });
  assert.deepEqual({ x: doc.nodes[0].x, y: doc.nodes[0].y, width: doc.nodes[0].width, height: doc.nodes[0].height },
    { x: 488, y: 92, width: 720, height: 264 });
});

test('a card that is about something with a URL is a link node; a card that is not, is a text node', () => {
  const [cat, page, none] = canvas([
    wid('q1', 'gallery', { from: 'category', category: 'Images_from_the_Met' }),
    wid('q2', 'gallery', { from: 'page', page: 'Marie Curie' }),
    wid('q3', 'note', { text: 'just some words' }),
  ], [lay('q1'), lay('q2', 3), lay('q3', 6)]).nodes;

  assert.equal(cat.type, 'link');
  assert.equal(cat.url, 'https://commons.wikimedia.org/wiki/Category:Images%20from%20the%20Met');
  assert.equal(page.type, 'link');
  assert.equal(page.url, 'https://en.wikipedia.org/wiki/Marie_Curie');
  assert.equal(none.type, 'text');
  assert.match(none.text, /Note/);
});

test('a URL comes only from a DECLARED field that APPLIES to this config — a hidden field cannot link', () => {
  // `category` applies only when `from` is 'category': a gallery switched to an article keeps no stale category
  // that would quietly point the canvas at the wrong place. A wrong URL is worse than no URL.
  assert.equal(subjectUrl(DEFS.gallery, { from: 'category', category: 'X' }).key, 'category');
  assert.equal(subjectUrl(DEFS.gallery, { from: 'page', category: 'Stale', page: 'Fresh' }).key, 'page');
  assert.equal(subjectUrl(DEFS.gallery, { from: 'article', category: 'Stale', page: 'Stale' }), null);
  // …and an undeclared key is never a URL, however plausible its name.
  assert.equal(subjectUrl(DEFS.note, { category: 'Not A Field Here' }), null);
  assert.equal(subjectUrl(undefined, { category: 'X' }), null);
});

test('a reference arrives with its project — a title alone is ambiguous once a board crosses languages', () => {
  const doc = canvas([
    wid('q1', 'gallery', { from: 'page', page: 'dewiki:Berlin', project: 'en.wikipedia' }),
  ], [lay('q1')]);
  assert.equal(doc.nodes[0].url, 'https://de.wikipedia.org/wiki/Berlin');
});

test('references become edges, labelled with their channel, and only between cards that exist', () => {
  const doc = canvas([
    wid('q1', 'note', { text: 'producer' }),
    wid('q2', 'note', { text: 'reads {{widget:q1}} and speaks {{widget:q1#speech}}, and not itself {{widget:q2}}' }),
    wid('q3', 'count', { source: 'q1' }),
    wid('q4', 'note', { text: '{{widget:missing}}' }),
  ], [lay('q1'), lay('q2', 3), lay('q3', 6), lay('q4', 9)]);
  assertValidCanvas(doc);
  const byId = Object.fromEntries(doc.edges.map((e) => [e.id, e]));
  assert.deepEqual(Object.keys(byId).sort(), ['e-q1-q2', 'e-q1-q2-speech', 'e-q1-q3']);
  assert.equal(byId['e-q1-q2'].fromNode, 'q1');
  assert.equal(byId['e-q1-q2'].toNode, 'q2');
  assert.equal(byId['e-q1-q2'].label, undefined, 'the bare reference carries no channel label');
  assert.equal(byId['e-q1-q2-speech'].label, 'speech');
  assert.equal(byId['e-q1-q3'].label, undefined, 'a source field is a connection, not a channel');
  assert.equal(doc.edges.some((e) => e.fromNode === 'q4' || e.toNode === 'q4'), false, 'a dangling reference draws nothing');
  assert.equal(doc.edges.some((e) => e.fromNode === e.toNode), false, 'no self-edges');
  assert.equal(doc.edges.every((e) => e.toEnd === 'arrow'), true);
});

test('a card with no layout entry is placed rather than dropped, and never overlaps a placed one', () => {
  const doc = canvas([
    wid('q1', 'note'), wid('q2', 'note'), wid('q3', 'note'), wid('q4', 'note'),
  ], [lay('q9', 0, 0)]);   // layout names a card that is not in the widgets — it is simply ignored
  assertValidCanvas(doc);
  assert.equal(doc.nodes.length, 4);
  const boxes = doc.nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(boxes).size, 4, 'auto-placed cards get distinct positions');
});

test('the export is deterministic, and foreign top-level keys ride along without shadowing nodes or edges', () => {
  const widgets = [wid('q1', 'note', { text: 'a' }), wid('q2', 'count', { source: 'q1' })];
  const layout = [lay('q1'), lay('q2', 3)];
  const a = canvas(widgets, layout);
  const b = canvas(widgets, layout);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'two exports of one board are byte-identical');

  const withForeign = canvas(widgets, layout, { pluginState: { z: 1 }, nodes: 'not ours' });
  assert.ok(Array.isArray(withForeign.nodes), 'a foreign `nodes` key can never replace ours');
  assert.ok(Array.isArray(withForeign.edges));
  assert.deepEqual(withForeign.pluginState, { z: 1 });
});

test('a board with nothing in it exports an empty, valid canvas rather than blowing up', () => {
  const doc = boardToCanvas({ widgets: [], layout: [], defs: DEFS });
  assertValidCanvas(doc);
  assert.deepEqual(doc, { nodes: [], edges: [] });
  assert.deepEqual(boardToCanvas({}).nodes, []);
});

test('the download name is stable, dated and filesystem-safe', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  assert.equal(canvasFilename({ label: 'CIM Snapshot', now }), 'cim-snapshot-wikibento-2026-10-03.canvas');
  assert.equal(canvasFilename({ now }), 'wikibento-2026-10-03.canvas');
  assert.equal(canvasFilename({ label: '../../etc/passwd', now }), 'etc-passwd-wikibento-2026-10-03.canvas');
});
