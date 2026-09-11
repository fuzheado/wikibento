import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedBoard, savedBoardPayload } from '../src/lib/savedBoard.js';

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
