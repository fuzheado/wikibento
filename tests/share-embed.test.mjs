/**
 * Self-contained share links — the plain `#/d/…` form and the compressed `#/z/…` form (ISSUE-89).
 *
 * The problem these measure: the link *is* the payload, so a board you built has to fit in a QR code as text.
 * Andrew hit the refusal at 4,012 characters, and the app's answer was to tell him to trim the board. Measured
 * across the boards in `public/`, plain base64url fits a QR for 1 of 15 of them and the compressed form for
 * 13 — same board, different encoding. These tests hold that number down, including the boards that still do
 * not fit (the app must keep refusing rather than render an unscannable code).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  encodeDashboardHash, decodeDashboardHash, buildShareLink, buildCompactShareLink,
  encodeCompressedDashboardHash, decodeCompressedDashboardHash,
} from '../src/lib/share.js';
import { QR_MAX_CHARS, fitEcLevel, QR_BYTE_CAPACITY } from '../src/lib/qr.js';

const board = (name) => readFileSync(join(process.cwd(), 'public', name), 'utf8');
const urlLength = (hashAndPayload) => 'https://wikibento.toolforge.org/'.length + hashAndPayload.length;
const payloadOf = (url) => url.slice(url.indexOf('#/') + 2);   // 'z/<b64>' — form, then payload

// ── both forms round-trip ─────────────────────────────────────────────────────────────────────────

test('the plain form round-trips, exactly (regression: #/d/ links keep working)', () => {
  const json = JSON.stringify({ version: 1, widgets: [{ id: 'a', widgetType: 'pageviews', config: {} }] });
  assert.equal(decodeDashboardHash(encodeDashboardHash(json)), json);
});

test('the readable is consumed BEFORE the writer closes — the browser backpressure trap', async () => {
  // A CompressionStream backpressures. Closing the writer first deadlocks for any payload large enough to
  // fill its queue — which is every real board, and none of a 15-byte test string. Node does not reproduce
  // it, so this guards the *order* in the source as well as the behaviour below.
  const src = readFileSync(join(process.cwd(), 'src', 'lib', 'share.js'), 'utf8');
  for (const fn of ['encodeCompressedDashboardHash', 'decodeCompressedDashboardHash']) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const next = body.indexOf('export ', 40);
    const text = next > 0 ? body.slice(0, next) : body;
    const consumed = text.indexOf('new Response(');
    const closed = text.indexOf('.close()');
    assert.ok(consumed >= 0, `${fn} should consume the stream`);
    assert.ok(closed > consumed, `${fn} must start reading before closing the writer, or a big board hangs`);
  }
});

test('a large payload settles in reasonable time (the deadlock was silent, not an error)', async () => {
  // The widget manifest is the biggest board-shaped thing we have (39 KB of JSON → ~8.7 KB of gzip).
  const big = readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8');
  const payload = await Promise.race([
    encodeCompressedDashboardHash(big),
    new Promise((_, reject) => setTimeout(() => reject(new Error('encoder did not settle — backpressure deadlock?')), 5000)),
  ]);
  assert.equal(await decodeCompressedDashboardHash(payload), big);
});

test('the compressed form round-trips, including non-ASCII', async () => {
  const json = JSON.stringify({ note: 'Mərie Curie — 100% ünïcode ✓', emoji: '🍱', q: 'a,b|c' });
  const payload = await encodeCompressedDashboardHash(json);
  assert.equal(await decodeCompressedDashboardHash(payload), json);
});

test('a compressed payload is URL-safe (no +, / or = to be mangled by chat apps)', async () => {
  const payload = await encodeCompressedDashboardHash(board('glam-demo.json'));
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
});

// ── the measured win: a board that could not be scanned now can be ────────────────────────────────

test('a 4,000-char board becomes scannable: the ISSUE-89 case', async () => {
  const json = board('glam-demo.json');
  const plain = encodeDashboardHash(json);
  const compressed = await encodeCompressedDashboardHash(json);
  // the reported failure: this board's plain link was 4,012 characters and SharePanel refused it
  assert.ok(urlLength('#/d/' + plain) > QR_MAX_CHARS, `plain should still be too long (${urlLength('#/d/' + plain)})`);
  assert.ok(urlLength('#/z/' + compressed) <= QR_MAX_CHARS,
    `compressed should fit (${urlLength('#/z/' + compressed)})`);
  // and it fits with error correction *better* than the weakest level, so it is not merely "scannable"
  assert.equal(fitEcLevel('#/z/' + compressed, 'M'), 'M');
});

test('compression is worth ~3x, and always shorter than plain for a real board', async () => {
  for (const name of ['glam-demo.json', 'document-reader-demo.json', 'article-vitals-demo.json']) {
    const json = board(name);
    const plain = encodeDashboardHash(json).length;
    const compressed = (await encodeCompressedDashboardHash(json)).length;
    assert.ok(compressed < plain * 0.5, `${name}: ${compressed} should be well under half of ${plain}`);
  }
});

test('the boards that still do NOT fit a QR are known, and stay refused', async () => {
  // Honesty about the limit: compression is not magic. The 42-widget catalogue and the widget manifest exceed
  // even a version-40 QR at the weakest error correction, so the app must keep saying so rather than render a
  // dense unreadable code.
  const catalogue = await encodeCompressedDashboardHash(board('dashboard.json'));
  assert.ok(urlLength('#/z/' + catalogue) > QR_BYTE_CAPACITY.L,
    `the full catalogue should exceed even EC L (${urlLength('#/z/' + catalogue)} vs ${QR_BYTE_CAPACITY.L})`);
  assert.equal(fitEcLevel('#/z/' + catalogue, 'M'), null, 'no QR is possible for it, at any level');
});

test('the compressed link fits at the strongest level that still holds it', async () => {
  const small = await encodeCompressedDashboardHash(board('article-vitals-demo.json'));
  const level = fitEcLevel('#/z/' + small, 'M');
  assert.ok(['H', 'Q', 'M'].includes(level), `a small board should still get good error correction (got ${level})`);
});

// ── choosing between the forms ────────────────────────────────────────────────────────────────────

test('buildCompactShareLink prefers the compressed form when it is genuinely shorter', async () => {
  const realWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://wikibento.toolforge.org', pathname: '/' } };
  try {
    const big = board('document-reader-demo.json');
    const chosen = await buildCompactShareLink(big);
    assert.ok(chosen.includes('#/z/'), 'a real board should be shared compressed');
    assert.ok(chosen.length < buildShareLink(big).length);
  } finally {
    globalThis.window = realWindow;
  }
});

test('a tiny board may stay plain — the gzip header is a real cost', async () => {
  const realWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://wikibento.toolforge.org', pathname: '/' } };
  try {
    const tiny = JSON.stringify({ version: 1, widgets: [] });
    const chosen = await buildCompactShareLink(tiny);
    assert.ok(chosen.includes('#/d/'), `tiny board should not pay for a gzip header (${chosen})`);
  } finally {
    globalThis.window = realWindow;
  }
});

test('with no CompressionStream the plain form is used, not an error', async () => {
  const realWindow = globalThis.window;
  const realCS = globalThis.CompressionStream;
  globalThis.window = { location: { origin: 'https://example.org', pathname: '/' } };
  delete globalThis.CompressionStream;
  try {
    const chosen = await buildCompactShareLink(board('glam-demo.json'));
    assert.ok(chosen.startsWith('https://example.org/#/d/'), chosen.slice(0, 40));
  } finally {
    globalThis.CompressionStream = realCS;
    globalThis.window = realWindow;
  }
});

test('a pre-2023 browser gets a readable error, not a silent failure', async () => {
  const realDS = globalThis.DecompressionStream;
  delete globalThis.DecompressionStream;
  try {
    await assert.rejects(
      () => decodeCompressedDashboardHash('abc'),
      /cannot read compressed share links.*\?config=/s,
    );
  } finally {
    globalThis.DecompressionStream = realDS;
  }
});

test('a damaged compressed payload reports damage rather than throwing something arcane', async () => {
  await assert.rejects(() => decodeCompressedDashboardHash('not-actually-gzip'), /looks damaged/);
});

test('the payload the QR encodes is the payload the panel copies', async () => {
  // One value feeds the QR, the copy button and the visible field — this guards the shape of that value.
  const realWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://wikibento.toolforge.org', pathname: '/' } };
  try {
    const link = await buildCompactShareLink(board('glam-demo.json'));
    const payload = payloadOf(link);
    assert.match(payload, /^[dz]\/[A-Za-z0-9_-]+$/, payload.slice(0, 20));
    const decoded = payload.startsWith('z/')
      ? await decodeCompressedDashboardHash(payload.slice(2))
      : decodeDashboardHash(payload.slice(2));
    // Semantically, not byte-for-byte: the panel shares a re-serialisation of its own state (that is what
    // `shareJson` is), so whitespace and key order legitimately differ from the file on disk.
    assert.deepEqual(JSON.parse(decoded), JSON.parse(board('glam-demo.json')),
      'the link must reproduce the board');
  } finally {
    globalThis.window = realWindow;
  }
});
