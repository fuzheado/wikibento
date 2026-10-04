/**
 * A JSON Canvas document read as a board (ISSUE-135).
 *
 * These tests hold the six acceptance criteria of the issue: a round trip is identity, each node type maps to a card,
 * the `wikibento` payload beats a URL, a malformed document is *reported* rather than thrown, unknown fields survive,
 * and the whole thing goes through the board validator rather than around it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isJsonCanvas, canvasToBoard, fromCanvasBox } from '../src/lib/canvasImport.js';
import { boardToCanvas, toCanvasBox } from '../src/lib/jsonCanvas.js';
import { typesForKind } from '../src/lib/pickMode.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { validateDashboard } from '../src/lib/dashboardConfig.js';

const W = (id, type, x, y, w = 3, h = 4) => ({ i: id, x, y, w, h });

const widgetOf = (board, id) => board.widgets.find((w) => w.id === id);

/** The first config value that equals `value` — used where the *field* name is the registry's business, not ours. */
const configHolding = (widget, value) => Object.values(widget.config || {}).includes(value);

test('a document is a canvas when it has nodes and is not a board', () => {
  assert.equal(isJsonCanvas({ nodes: [] }), true);
  assert.equal(isJsonCanvas('{"nodes":[],"edges":[]}'), true);
  assert.equal(isJsonCanvas({ widgets: [] }), false, 'a board is not a canvas');
  assert.equal(isJsonCanvas({ widgets: [], nodes: [] }), false, 'a board that mentions nodes is still a board');
  assert.equal(isJsonCanvas('not json'), false);
  assert.equal(isJsonCanvas([{ type: 'text' }]), false);
  assert.equal(isJsonCanvas(null), false);
});

test('a text node becomes a Text card, verbatim', () => {
  const board = canvasToBoard({ nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 300, height: 100, text: '## Hello\n\n- one' }] });
  const w = widgetOf(board, 'n1');
  assert.equal(w.widgetType, 'markdown');
  assert.equal(w.config.text, '## Hello\n\n- one');
});

test('a link becomes the card the brush would place for it, for each kind the app can read', () => {
  const cases = [
    ['https://en.wikipedia.org/wiki/Marie_Curie', 'article', 'Marie Curie'],
    ['https://commons.wikimedia.org/wiki/File:Dogs_(Plate_XI).jpg', 'commons-file', 'File:Dogs (Plate XI).jpg'],
  ];
  for (const [url, kind, value] of cases) {
    const board = canvasToBoard({ nodes: [{ id: 'l', type: 'link', x: 0, y: 0, width: 300, height: 200, url }] });
    const w = widgetOf(board, 'l');
    const accepting = typesForKind(kind, WIDGET_TYPES).map((t) => t.type);
    assert.ok(accepting.includes(w.widgetType), `${url} → ${w.widgetType}, which does not accept a ${kind}`);
    assert.ok(configHolding(w, value), `${url} → the card does not carry "${value}": ${JSON.stringify(w.config)}`);
  }
});

test('a Commons category link names a category card, not a text card', () => {
  const board = canvasToBoard({ nodes: [{ id: 'c', type: 'link', x: 0, y: 0, width: 300, height: 200, url: 'https://commons.wikimedia.org/wiki/Category:Images_from_Wiki_Loves_Monuments_2024' }] });
  const w = widgetOf(board, 'c');
  assert.ok(typesForKind('commons-category', WIDGET_TYPES).map((t) => t.type).includes(w.widgetType));
  assert.ok(configHolding(w, 'Category:Images from Wiki Loves Monuments 2024'));
  assert.equal(w.config.from, 'category', 'a category pick also points the source selector at the category');
});

test('a WDQS link is a query, and the query is the card', () => {
  const board = canvasToBoard({ nodes: [{ id: 'q', type: 'link', x: 0, y: 0, width: 300, height: 200, url: 'https://query.wikidata.org/?query=SELECT%20%3Fitem%20WHERE%20%7B%7D' }] });
  const w = widgetOf(board, 'q');
  assert.equal(w.widgetType, 'sparql');
  assert.ok(configHolding(w, 'SELECT ?item WHERE {}'), JSON.stringify(w.config));
});

test('a link nothing can place is kept as text, and said so', () => {
  const board = canvasToBoard({ nodes: [{ id: 'x', type: 'link', x: 0, y: 0, width: 300, height: 200, url: 'https://example.com/a-page' }] });
  const w = widgetOf(board, 'x');
  assert.equal(w.widgetType, 'markdown');
  assert.equal(w.config.text, 'https://example.com/a-page');
  assert.ok(board.report.some((r) => /named nothing the app can place/.test(r)), board.report.join(' | '));
});

test('the wikibento payload wins over whatever the URL would infer', () => {
  const node = {
    id: 'p', type: 'link', x: 0, y: 0, width: 300, height: 200,
    url: 'https://en.wikipedia.org/wiki/Marie_Curie',
    wikibento: { widgetType: 'cimRanking', config: { facet: 'files', category: 'Files from the Biodiversity Heritage Library', topN: 10 }, title: 'Top files' },
  };
  const w = widgetOf(canvasToBoard({ nodes: [node] }), 'p');
  assert.equal(w.widgetType, 'cimRanking');
  assert.equal(w.config.facet, 'files');
  assert.equal(w.config.category, 'Files from the Biodiversity Heritage Library');
});

test('a payload naming a type this build does not have falls back to reading the link, and says so', () => {
  const board = canvasToBoard({
    nodes: [{
      id: 'p2', type: 'link', x: 0, y: 0, width: 300, height: 200,
      url: 'https://en.wikipedia.org/wiki/Kohat',
      wikibento: { widgetType: 'canvasFromTheFuture', config: {} },
    }],
  });
  const w = widgetOf(board, 'p2');
  assert.ok(typesForKind('article', WIDGET_TYPES).map((t) => t.type).includes(w.widgetType));
  assert.ok(board.report.some((r) => /canvasFromTheFuture/.test(r)), board.report.join(' | '));
});

test('a vault path is quoted, not turned into a URL; a Commons file is a file', () => {
  const vault = canvasToBoard({ nodes: [{ id: 'f', type: 'file', x: 0, y: 0, width: 300, height: 200, file: 'attachments/scan.jpg' }] });
  const vaultCard = widgetOf(vault, 'f');
  assert.equal(vaultCard.widgetType, 'markdown');
  assert.equal(vaultCard.config.text, 'attachments/scan.jpg');
  assert.ok(vault.report.some((r) => /vault/.test(r)), vault.report.join(' | '));

  const commons = canvasToBoard({ nodes: [{ id: 'f2', type: 'file', x: 0, y: 0, width: 300, height: 200, file: 'https://commons.wikimedia.org/wiki/File:Kohat.jpg' }] });
  const fileCard = widgetOf(commons, 'f2');
  assert.ok(typesForKind('commons-file', WIDGET_TYPES).map((t) => t.type).includes(fileCard.widgetType));
});

test('groups and edges are skipped on purpose, counted, and reported', () => {
  const board = canvasToBoard({
    nodes: [
      { id: 'g', type: 'group', x: 0, y: 0, width: 400, height: 400, label: 'A group' },
      { id: 'a', type: 'text', x: 0, y: 0, width: 300, height: 100, text: 'one' },
    ],
    edges: [{ id: 'e1', fromNode: 'a', toNode: 'g' }],
  });
  assert.equal(board.widgets.length, 1, 'the group is not a card');
  assert.equal(board.widgets[0].id, 'a');
  assert.equal(board.layout.length, 1, 'and it has no layout slot either');
  assert.ok(board.report.some((r) => /1 edge ignored/.test(r)), board.report.join(' | '));
  assert.ok(board.report.some((r) => /1 group ignored/.test(r)), board.report.join(' | '));
});

test('an unknown node type is quoted rather than dropped', () => {
  const board = canvasToBoard({ nodes: [{ id: 'u', type: 'mermaid', x: 0, y: 0, width: 300, height: 200, code: 'graph TD;' }] });
  const w = widgetOf(board, 'u');
  assert.equal(w.widgetType, 'markdown');
  assert.match(w.config.text, /mermaid/);
});

test('unknown fields are carried, at both levels', () => {
  const board = canvasToBoard({
    'x-my-tool': { zoom: 2 },
    nodes: [{ id: 'k', type: 'text', x: 0, y: 0, width: 300, height: 100, text: 'hi', color: '4', shape: 'diamond' }],
  });
  assert.deepEqual(board.extras, { 'x-my-tool': { zoom: 2 } });
  assert.deepEqual(widgetOf(board, 'k').canvas, { color: '4', shape: 'diamond' });
});

test('nodes with no id, or a repeated one, are placed under a unique id and reported', () => {
  const board = canvasToBoard({
    nodes: [
      { type: 'text', x: 0, y: 0, width: 300, height: 100, text: 'a' },
      { id: 'dup', type: 'text', x: 0, y: 2, width: 300, height: 100, text: 'b' },
      { id: 'dup', type: 'text', x: 0, y: 4, width: 300, height: 100, text: 'c' },
    ],
  });
  assert.equal(new Set(board.widgets.map((w) => w.id)).size, 3);
  assert.equal(new Set(board.layout.map((l) => l.i)).size, 3);
  assert.equal(board.report.filter((r) => /already used/.test(r)).length, 2, board.report.join(' | '));
});

test('pixels and grid units are inverses, and a wild position is pulled inside the grid', () => {
  for (const box of [{ id: 'a', x: 0, y: 0, w: 3, h: 4 }, { id: 'b', x: 9, y: 12, w: 3, h: 2 }, { id: 'c', x: 5, y: 1, w: 7, h: 1 }]) {
    const back = fromCanvasBox({ ...toCanvasBox(box), id: box.id });
    assert.deepEqual(back, { x: box.x, y: box.y, w: box.w, h: box.h }, 'round trip');
  }
  const wild = fromCanvasBox({ x: 9999, y: -50, width: 4000, height: 40 });
  assert.ok(wild.x >= 0 && wild.x + wild.w <= 12, JSON.stringify(wild));
  assert.ok(wild.y >= 0 && wild.h >= 1);
});

test('an exported board comes back as the same board — the round trip is identity', () => {
  const widgets = [
    { id: 'note', widgetType: 'markdown', config: { text: 'hello' } },
    { id: 'views', widgetType: 'pageviews', config: { page: 'Marie Curie', project: 'en.wikipedia' } },
    { id: 'rank', widgetType: 'cimRanking', config: { facet: 'files', category: 'Files from the Biodiversity Heritage Library', topN: 10 } },
    { id: 'echo', widgetType: 'echo', config: { source: 'rank' } },
  ];
  const layout = [W('note', null, 0, 0, 12, 3), W('views', null, 0, 3, 6, 5), W('rank', null, 6, 3, 6, 5), W('echo', null, 0, 8, 4, 4)];
  const doc = boardToCanvas({ widgets, layout });

  const back = canvasToBoard(doc);
  assert.deepEqual(back.widgets.map((w) => w.id), widgets.map((w) => w.id));
  assert.deepEqual(back.widgets.map((w) => w.widgetType), widgets.map((w) => w.widgetType));
  assert.deepEqual(back.widgets.map((w) => w.config), widgets.map((w) => w.config));
  assert.deepEqual(back.layout, layout, 'and the grid boxes come back unchanged');
  assert.ok(back.report.some((r) => /restored from the wikibento payload/.test(r)), back.report.join(' | '));
});

test('what the import produces is a board the app accepts — through the validator, not around it', () => {
  const board = canvasToBoard({
    nodes: [
      { id: 'note', type: 'text', x: 0, y: 0, width: 792, height: 184, text: 'A canvas, read.' },
      { id: 'page', type: 'link', x: 0, y: 200, width: 400, height: 300, url: 'https://en.wikipedia.org/wiki/Kohat' },
      { id: 'weird', type: 'text', x: 500, y: 200, width: 400, height: 300, text: 'x', color: '2' },
    ],
  });
  const result = validateDashboard(JSON.stringify(board));
  assert.equal(result.valid, true, (result.errors || []).join(' | '));
  assert.equal(result.widgets.length, 3);
  assert.deepEqual(result.errors, []);
});

test('a malformed canvas is reported, not thrown', () => {
  assert.deepEqual(canvasToBoard('{ not json').widgets, []);
  assert.deepEqual(canvasToBoard(null).widgets, []);
  assert.deepEqual(canvasToBoard({ nodes: 'lots' }).widgets, [], 'a non-array nodes list is not a crash');
  const empty = canvasToBoard({ nodes: [], edges: [] });
  assert.deepEqual(empty.widgets, []);
  assert.ok(empty.report.length >= 1, 'an empty canvas still says what happened');
});
