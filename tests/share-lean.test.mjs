/**
 * Share-mode URL tests (ISSUE-67).
 *
 * The Share panel encodes an explicit presentation mode: `Lean` adds `?lean=1`
 * (chrome-free), `Full` carries neither present-mode param. These tests pin the
 * normalization rules that keep the presenter's own mode from leaking into a
 * shared link, and keep the QR and the copyable link the same artifact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentModeUrl, LEAN_PARAM, KIOSK_PARAM } from '../src/lib/share.js';

const BASE = 'https://wikibento.toolforge.org/?config=https%3A%2F%2Fexample.org%2Fdash.json';

test('lean mode adds lean=1', () => {
  const out = presentModeUrl(BASE, 'lean');
  const u = new URL(out);
  assert.equal(u.searchParams.get(LEAN_PARAM), '1');
  assert.ok(out.includes('lean=1'), out);
});

test('full mode carries neither present-mode param', () => {
  const out = presentModeUrl(BASE, 'full');
  const u = new URL(out);
  assert.equal(u.searchParams.has(LEAN_PARAM), false);
  assert.equal(u.searchParams.has(KIOSK_PARAM), false);
});

test('the ?config= param survives mode normalization', () => {
  const u = new URL(presentModeUrl(BASE, 'lean'));
  assert.equal(u.searchParams.get('config'), 'https://example.org/dash.json');
});

test('a presenter in lean mode does not leak lean into a Full link', () => {
  const leanUrl = 'https://wikibento.toolforge.org/?config=x.json&lean=1';
  const out = presentModeUrl(leanUrl, 'full');
  assert.equal(new URL(out).searchParams.has(LEAN_PARAM), false, out);
});

test('a presenter in kiosk mode does not leak kiosk (and never encodes it)', () => {
  const kioskUrl = 'https://wikibento.toolforge.org/?kiosk=1&config=x.json';
  for (const mode of ['full', 'lean']) {
    const out = presentModeUrl(kioskUrl, mode);
    assert.equal(new URL(out).searchParams.has(KIOSK_PARAM), false, `${mode}: ${out}`);
  }
});

test('switching lean → full is a round trip (idempotent per mode)', () => {
  const lean = presentModeUrl(BASE, 'lean');
  const full = presentModeUrl(lean, 'full');
  assert.equal(full, presentModeUrl(BASE, 'full'));
  assert.equal(presentModeUrl(lean, 'lean'), lean);
  assert.equal(presentModeUrl(presentModeUrl(BASE, 'full'), 'full'), presentModeUrl(BASE, 'full'));
});

test('re-applying lean does not duplicate the param', () => {
  const once = presentModeUrl(BASE, 'lean');
  const twice = presentModeUrl(once, 'lean');
  assert.equal(twice, once);
  assert.equal(twice.split('lean=1').length - 1, 1, twice);
});

test('hash-form share links keep the payload and put the param before the hash', () => {
  const hashUrl = 'https://wikibento.toolforge.org/#/d/eyJ2ZXJzaW9uIjoxfQ';
  const out = presentModeUrl(hashUrl, 'lean');
  assert.ok(out.includes('#/d/eyJ2ZXJzaW9uIjoxfQ'), out);
  assert.ok(out.indexOf('lean=1') < out.indexOf('#'), out);
  assert.equal(new URL(out).hash, '#/d/eyJ2ZXJzaW9uIjoxfQ');
});

test('unrelated query params are preserved (and ordering stays stable)', () => {
  const url = 'https://wikibento.toolforge.org/?config=x.json&board=demo';
  const out = presentModeUrl(url, 'lean');
  const u = new URL(out);
  assert.equal(u.searchParams.get('board'), 'demo');
  assert.equal(u.searchParams.get('config'), 'x.json');
  assert.equal(u.searchParams.get('lean'), '1');
});

test('the lean url actually carries the param the app boots on', () => {
  // App.jsx reads exactly `params.get('lean') === '1'`.
  const u = new URL(presentModeUrl(BASE, 'lean'));
  assert.equal(u.searchParams.get('lean'), '1');
});
