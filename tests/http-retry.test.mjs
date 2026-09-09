/**
 * HTTP rate-limit constitution (ISSUE-61).
 *
 * A throttled IP must not be hammered: retries honor `Retry-After`, the pacer
 * caps concurrency, a 429 raises the gap for every subsequent request, and an
 * exhausted 429 fails with an actionable message instead of a bare "HTTP 429".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRetryAfter,
  fetchTextWithRetry,
  resetPacerForTests,
  pacerState,
  MAX_RETRY_WAIT_MS,
} from '../src/lib/httpRetry.js';

test('parseRetryAfter: seconds, HTTP-date, invalid, cap', () => {
  assert.equal(parseRetryAfter('5'), 5000);
  assert.equal(parseRetryAfter('0'), 0);
  assert.equal(parseRetryAfter('120'), MAX_RETRY_WAIT_MS); // capped
  const when = new Date(Date.now() + 3000).toUTCString();
  const ms = parseRetryAfter(when);
  assert.ok(ms > 1000 && ms <= 3200, `date form → ${ms}`);
  assert.equal(parseRetryAfter('garbage'), null);
  assert.equal(parseRetryAfter(''), null);
  assert.equal(parseRetryAfter(null), null);
});

test('fetchTextWithRetry: concurrency is capped (no stampede)', async () => {
  resetPacerForTests();
  const orig = globalThis.fetch;
  let active = 0, maxActive = 0;
  globalThis.fetch = async () => {
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 40));
    active -= 1;
    return new Response('ok', { status: 200 });
  };
  try {
    await Promise.all(Array.from({ length: 12 }, () => fetchTextWithRetry('https://example.org/x')));
    assert.ok(maxActive <= 4, `maxActive=${maxActive}`);
    assert.equal(active, 0);
  } finally {
    globalThis.fetch = orig;
    resetPacerForTests();
  }
});

test('fetchTextWithRetry: a 429 retries (honoring Retry-After) then succeeds, and paces the rest', async () => {
  resetPacerForTests();
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } })
      : new Response('{"ok":true}', { status: 200 });
  };
  try {
    assert.equal(await fetchTextWithRetry('https://example.org/y'), '{"ok":true}');
    assert.equal(calls, 2, 'one retry');
    assert.ok(pacerState().gapMs >= 500, 'a 429 raises the pacing gap for later requests');
  } finally {
    globalThis.fetch = orig;
    resetPacerForTests();
  }
});

test('fetchTextWithRetry: exhausted 429 → actionable terminal message (with retryAfterMs)', async () => {
  resetPacerForTests();
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('nope', { status: 429, headers: { 'retry-after': '1' } }); };
  try {
    await assert.rejects(
      () => fetchTextWithRetry('https://example.org/z', { retries: 1 }),
      (e) => /^HTTP 429/.test(e.message)
        && /rate-limiting this browser/.test(e.message)
        && /wait ~1s, then Retry/.test(e.message)
        && e.retryAfterMs === 1000,
    );
    assert.equal(calls, 2, 'bounded retries: initial + 1');
  } finally {
    globalThis.fetch = orig;
    resetPacerForTests();
  }
});

test('fetchTextWithRetry: 4xx other than 429 stays terminal (no retry)', async () => {
  resetPacerForTests();
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('missing', { status: 404 }); };
  try {
    await assert.rejects(() => fetchTextWithRetry('https://example.org/404', { retries: 2 }), /HTTP 404/);
    assert.equal(calls, 1, '404 must not be retried');
  } finally {
    globalThis.fetch = orig;
    resetPacerForTests();
  }
});
