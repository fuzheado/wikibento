import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_STAGGER_MS, TILE_SLOW_MS, TILE_TIMEOUT_MS,
  urlVariants, formatCount, tilePhase, tileLabel, tileCanRetry, tileMountDelay,
} from '../src/lib/waybackTiles.js';

const avail = (extra = {}) => ({ date: '2015-06-01', available: true, withinTolerance: true, diffDays: 3, ...extra });

test('urlVariants asks about both forms — the availability API is URL-form sensitive', () => {
  assert.deepEqual(urlVariants('nytimes.com'), ['nytimes.com', 'www.nytimes.com']);
  assert.deepEqual(urlVariants('www.nytimes.com'), ['www.nytimes.com', 'nytimes.com']);
  assert.deepEqual(urlVariants('https://example.org/'), ['example.org', 'www.example.org']);
  assert.deepEqual(urlVariants('en.wikipedia.org/wiki/Wikipedia'),
    ['en.wikipedia.org/wiki/Wikipedia', 'www.en.wikipedia.org/wiki/Wikipedia']);
  assert.deepEqual(urlVariants(''), []);
  assert.deepEqual(urlVariants('   '), []);
});

test('urlVariants keeps the path when stripping/adding www', () => {
  assert.deepEqual(urlVariants('www.example.org/a/b?c=1'), ['www.example.org/a/b?c=1', 'example.org/a/b?c=1']);
});

test('tilePhase: lookup outcome dominates — an absent capture is not "loading"', () => {
  assert.equal(tilePhase({ row: null }), 'queued');
  assert.equal(tilePhase({ row: { available: false } }), 'no-capture');
  assert.equal(tilePhase({ row: { available: false, lookupFailed: true } }), 'lookup-failed');
  assert.equal(tilePhase({ row: avail(), elapsedMs: 100 }), 'loading');
  assert.equal(tilePhase({ row: avail(), elapsedMs: 999_999 }), 'timed-out'); // waiting has a ceiling
});

test('tilePhase: loaded wins over any elapsed time', () => {
  assert.equal(tilePhase({ row: avail(), loaded: true, elapsedMs: TILE_TIMEOUT_MS * 3 }), 'loaded');
});

test('tilePhase: boundaries are exactly where the docs say', () => {
  const at = (ms) => tilePhase({ row: avail(), elapsedMs: ms });
  assert.equal(at(TILE_SLOW_MS - 1), 'loading');
  assert.equal(at(TILE_SLOW_MS), 'slow');
  assert.equal(at(TILE_TIMEOUT_MS - 1), 'slow');
  assert.equal(at(TILE_TIMEOUT_MS), 'timed-out');
  assert.equal(at(0), 'loading');
});

test('tilePhase: a tile that has not mounted yet is queued, not loading', () => {
  assert.equal(tilePhase({ row: avail(), mounted: false, elapsedMs: 5000 }), 'queued');
});

test('tileCanRetry offers an escape only where it helps', () => {
  assert.equal(tileCanRetry('slow'), true);
  assert.equal(tileCanRetry('timed-out'), true);
  assert.equal(tileCanRetry('lookup-failed'), true);
  for (const p of ['queued', 'loading', 'loaded', 'no-capture']) assert.equal(tileCanRetry(p), false, p);
});

test('tileLabel: elapsed time is always visible while waiting', () => {
  assert.match(tileLabel('loading', { elapsedMs: 4000 }), /4 s/);
  assert.match(tileLabel('slow', { elapsedMs: 18_400 }), /18 s/);
  assert.match(tileLabel('slow', {}), /20–30 s/);          // sets expectations, doesn't just spin
  assert.match(tileLabel('timed-out', {}), /75 s/);
  assert.equal(tileLabel('loaded', {}), '');               // silence when it worked
});

test('tileLabel: a miss is distinguished from an empty archive when we know the totals', () => {
  const none = tileLabel('no-capture', { captureCount: 0, toleranceDays: 30 });
  assert.match(none, /no capture within ±30 days/);
  const some = tileLabel('no-capture', { captureCount: 12480, row: {}, toleranceDays: 30 });
  assert.match(some, /12,480 captures for this URL/);
  assert.doesNotMatch(some, /no captures on record/);      // the old, misleading string is gone
  assert.match(tileLabel('lookup-failed', {}), /retry/i);
});

test('formatCount is defensive', () => {
  assert.equal(formatCount(1234), '1,234');
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(-1), '');
  assert.equal(formatCount(undefined), '');
  assert.equal(formatCount('nope'), '');
});

test('tiles are staggered — 4 tiles never hit the archive at once', () => {
  assert.equal(tileMountDelay(0), 0);
  assert.equal(tileMountDelay(1), TILE_STAGGER_MS);
  assert.equal(tileMountDelay(3), 3 * TILE_STAGGER_MS);
  assert.equal(tileMountDelay(-2), 0);
});
