import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedBoard, savedBoardPayload } from '../src/lib/savedBoard.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

/**
 * Restoring a saved board — the rule that decides whether the app comes back with what the user had,
 * with the three-card starter set, or with nothing at all.
 *
 * The cases that matter are the empty ones: "start with a blank board" is a choice the user can make
 * from the Reset dialog, and a blank board has zero widgets. Treating an empty save as "nothing
 * saved" would quietly resurrect the starter cards on the next reload.
 */

const w = (id) => ({ id, widgetType: 'pageview', config: {} });
const l = (id) => ({ i: id, x: 0, y: 0, w: 3, h: 3 });

test('readSavedBoard: no save at all → null (caller falls back to the starter set)', () => {
  assert.equal(readSavedBoard(null), null);
  assert.equal(readSavedBoard(''), null);
  assert.equal(readSavedBoard(undefined), null);
});

test('readSavedBoard: corrupt JSON → null, never a throw', () => {
  assert.equal(readSavedBoard('{not json'), null);
  assert.equal(readSavedBoard('[]'), null);          // an array is not a board
  assert.equal(readSavedBoard('"a string"'), null);
  assert.equal(readSavedBoard('null'), null);
});

test('readSavedBoard: a blob missing the arrays is not restorable', () => {
  assert.equal(readSavedBoard('{"widgets":[]}'), null);                 // no layout
  assert.equal(readSavedBoard('{"layout":[]}'), null);                  // no widgets
  assert.equal(readSavedBoard('{"params":{"a":1}}'), null);
  assert.equal(readSavedBoard('{"widgets":{},"layout":[]}'), null);     // wrong type
});

test('readSavedBoard: a deliberately BLANK board is honoured, not replaced by the starter set', () => {
  const blank = readSavedBoard(JSON.stringify({ widgets: [], layout: [], params: null }));
  assert.deepEqual(blank, { widgets: [], layout: [], params: null });
});

test('readSavedBoard: an empty layout with real widgets is still restorable', () => {
  // widgets auto-place, so layout: [] is legal on a populated board
  const board = readSavedBoard(JSON.stringify({ widgets: [w('a')], layout: [] }));
  assert.equal(board.widgets.length, 1);
  assert.deepEqual(board.layout, []);
});

test('readSavedBoard: a populated board round-trips with its params block', () => {
  const board = readSavedBoard(JSON.stringify({
    widgets: [w('a'), w('b')], layout: [l('a'), l('b')],
    params: { category: { label: 'Museum', type: 'buttons', options: ['X'], value: 'X' } },
  }));
  assert.equal(board.widgets.length, 2);
  assert.equal(board.params.category.value, 'X');
});

test('readSavedBoard: missing params normalizes to null, never undefined', () => {
  const board = readSavedBoard(JSON.stringify({ widgets: [], layout: [] }));
  assert.equal(board.params, null);
  assert.ok(Object.keys(board).includes('params'));
});

test('savedBoardPayload: normalizes params and survives a round-trip through JSON', () => {
  const empty = savedBoardPayload([], [], undefined);
  assert.deepEqual(empty, { widgets: [], layout: [], params: null });
  const back = readSavedBoard(JSON.stringify(empty));
  assert.deepEqual(back, { widgets: [], layout: [], params: null });

  const withParams = savedBoardPayload([w('a')], [], { p: { type: 'text', value: 'x' } });
  assert.equal(readSavedBoard(JSON.stringify(withParams)).params.p.value, 'x');
});

// Andrew exported a board and found a gallery whose source is an article still carrying the DEFAULTS of its other
// three sources ("files": "File:The Earth seen from Apollo 17.jpg\n…"). A spawn no longer writes them (pickMode's
// minimalConfig), and this is the other half: a board is written compacted wherever it is written — the share link,
// localStorage, and now ⬇ Export, which used to stringify `widgets` verbatim.
test('a written board drops fields that only repeat a registry default', () => {
  // The real shape: a board stored with every registry default plus the one field the card reads. (A value that
  // DIFFERS from its default carries information and is kept — that is the point of the rule, not a hole in it.)
  const g = WIDGET_TYPES.gallery;
  const gallery = {
    id: 'gallery-1', widgetType: 'gallery',
    config: { ...g.defaults, from: 'article', article: 'Hunter Museum of American Art', project: 'en.wikipedia' },
  };
  const cfg = savedBoardPayload([gallery], [], null).widgets[0].config;
  for (const dead of ['page', 'category', 'files', 'displayMode', 'iconSize']) {
    assert.equal(dead in cfg, false, `${dead} only repeated a default and should not be written`);
  }
  // What carries information stays, including the field this card actually reads.
  assert.equal(cfg.article, 'Hunter Museum of American Art');
  assert.equal(cfg.project, 'en.wikipedia');
});

// ── Foreign top-level keys (2026-10-03) ────────────────────────────────────────────────────────────────────────
// The rule comes from JSON Canvas's extension contract: a reader retains what it does not model, because a save
// that keeps only the fields you understand is a silent pruning — the file stays valid, opens, and something is
// missing. Already true here at config level and widget level; these are the board-level cases.

test('foreign top-level keys survive a round trip through savedBoardPayload', () => {
  const raw = JSON.stringify({
    version: 1, widgets: [w('q1')], layout: [l('q1')], params: null,
    pluginState: { z: 1 }, notes: ['a', 'b'],
  });
  const board = readSavedBoard(raw);
  assert.deepEqual(board.extras, { pluginState: { z: 1 }, notes: ['a', 'b'] });

  const payload = savedBoardPayload(board.widgets, board.layout, board.params, board.extras);
  assert.deepEqual(payload.pluginState, { z: 1 });
  assert.deepEqual(payload.notes, ['a', 'b']);
  // …and reading it back gives the identical board, which is the whole point.
  assert.deepEqual(readSavedBoard(JSON.stringify(payload)).extras, board.extras);
});

test('a board with nothing foreign keeps exactly the shape it always had', () => {
  const board = readSavedBoard(JSON.stringify({ widgets: [], layout: [], params: null }));
  assert.deepEqual(Object.keys(board), ['widgets', 'layout', 'params']);
  assert.deepEqual(Object.keys(savedBoardPayload([], [], null)), ['widgets', 'layout', 'params']);
  assert.deepEqual(Object.keys(savedBoardPayload([], [], null, null)), ['widgets', 'layout', 'params']);
  assert.deepEqual(Object.keys(savedBoardPayload([], [], null, {})), ['widgets', 'layout', 'params']);
});

test('a foreign key can never shadow the board’s own — carrying through is additive', () => {
  const payload = savedBoardPayload([w('q1')], [l('q1')], null, { widgets: 'rogue', layout: 'rogue', params: 'rogue' });
  assert.ok(Array.isArray(payload.widgets), 'our widgets win');
  assert.ok(Array.isArray(payload.layout));
  assert.equal(payload.params, null);
});

