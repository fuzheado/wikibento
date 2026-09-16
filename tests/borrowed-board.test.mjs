/**
 * Borrowed boards (ISSUE-88) — the rules that stop a shared link from overwriting the visitor's own board.
 *
 * The behaviour these guard was reproduced before it was fixed: seeding a visitor's board, clicking
 * `?config=/document-reader-demo.json`, then visiting the plain URL showed the *demo* — the visitor's board
 * was gone. Measured, not inferred (the repro is now part of `npm run smoke:url`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STASH_KEY, STASH_TTL_MS, boardLabelFromConfig, stashPayload, readStash, stashIsLive, noticeState,
} from '../src/lib/borrowedBoard.js';

const board = (ids = ['a']) => ({ widgets: ids.map((id) => ({ id, type: 'note' })), layout: [], params: null });

// ── naming the board the notice talks about ───────────────────────────────────────────────────────

test('boardLabelFromConfig names the board from the config path', () => {
  assert.equal(boardLabelFromConfig('/document-reader-demo.json'), 'Document Reader');
  assert.equal(boardLabelFromConfig('/glam-demo.json'), 'GLAM');
  assert.equal(boardLabelFromConfig('/anne-frank-mlk-demo.json'), 'Anne Frank MLK');
  assert.equal(boardLabelFromConfig('demos.json'), 'Demos');
  assert.equal(boardLabelFromConfig('/internet-archive-demo.json?v=2'), 'Internet Archive');
});

test('boardLabelFromConfig refuses to invent a name for a wiki page or an unknown value', () => {
  // A w.wiki link or an on-wiki page says nothing about the board behind it — better to say so than to
  // print a URL fragment and imply it means something.
  assert.equal(boardLabelFromConfig('https://w.wiki/TR9R'), 'a shared board');
  assert.equal(boardLabelFromConfig('https://en.wikipedia.org/wiki/User:Fuzheado/Boards/demo'), 'a shared board');
  assert.equal(boardLabelFromConfig(''), 'a shared board');
  assert.equal(boardLabelFromConfig(null), 'a shared board');
  assert.equal(boardLabelFromConfig('/.json'), 'a shared board');
});

// ── the one-deep recovery slot ────────────────────────────────────────────────────────────────────

test('a displaced board round-trips through the stash, and keeps its params', () => {
  const payload = { widgets: [{ id: 'mine' }], layout: [{ i: 'mine' }], params: { q: 'x' } };
  const stash = readStash(JSON.stringify(stashPayload(payload, 1000)));
  assert.deepEqual(stash.payload, payload);
  assert.equal(stash.at, 1000);
  assert.notEqual(STASH_KEY, 'wikibento-layout', 'the stash must not share the board share key');
});

test('readStash treats anything unexpected as "nothing to recover"', () => {
  for (const raw of ['', null, undefined, 'not json', '{}', '[]', '{"payload":{}}',
    JSON.stringify({ payload: { widgets: [], layout: [] }, at: 'yesterday' })]) {
    assert.equal(readStash(raw), null, `expected null for ${JSON.stringify(raw)}`);
  }
  // a board the visitor legitimately emptied is still a board
  const empty = readStash(JSON.stringify(stashPayload({ widgets: [], layout: [], params: null }, 5)));
  assert.deepEqual(empty.payload, { widgets: [], layout: [], params: null });
});

test('readStash normalises a missing params field to null, matching savedBoardPayload', () => {
  const stash = readStash(JSON.stringify({ payload: { widgets: [], layout: [] }, at: 7 }));
  assert.equal(stash.payload.params, null);
});

test('the recovery offer expires — a stale one cannot nag forever', () => {
  const stash = stashPayload(board(), 1_000_000);
  assert.equal(stashIsLive(stash, 1_000_000 + STASH_TTL_MS - 1), true);
  assert.equal(stashIsLive(stash, 1_000_000 + STASH_TTL_MS), false);
  assert.equal(stashIsLive(null), false);
});

// ── when the notice appears at all ────────────────────────────────────────────────────────────────

test('noticeState is silent when there is nothing at stake', () => {
  const saved = 'fingerprint-of-my-board';
  // a first-time visitor: a borrowed board, but no saved board to lose
  assert.equal(noticeState({ borrowed: {}, savedFingerprint: null, borrowedFingerprint: 'f' }), null);
  // the visitor's board is the board the link points at — nothing would change
  assert.equal(noticeState({ borrowed: {}, savedFingerprint: saved, borrowedFingerprint: saved }), null);
  // nothing borrowed and nothing displaced
  assert.equal(noticeState({ borrowed: null, savedFingerprint: saved, borrowedFingerprint: null, stash: null }), null);
});

test('noticeState offers the borrow notice only for a borrowed board that differs from the saved one', () => {
  const state = { borrowed: { label: 'Document Reader' }, savedFingerprint: 'mine', borrowedFingerprint: 'theirs' };
  assert.equal(noticeState(state), 'borrowed');
});

test('noticeState offers recovery after an adoption, and stops when dismissed or expired', () => {
  const stash = stashPayload(board(), Date.now());
  assert.equal(noticeState({ borrowed: null, stash }), 'recover');
  assert.equal(noticeState({ borrowed: null, stash, dismissed: true }), null);
  assert.equal(noticeState({ borrowed: null, stash: stashPayload(board(), Date.now() - STASH_TTL_MS - 1) }), null);
});

test('a borrowed board with a live stash still reads as borrowed — the current question wins', () => {
  const stash = stashPayload(board(), Date.now());
  assert.equal(
    noticeState({ borrowed: {}, savedFingerprint: 'mine', borrowedFingerprint: 'theirs', stash }),
    'borrowed',
  );
});
