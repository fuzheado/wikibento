/**
 * Config-URL loading constitution (ISSUE-60) — the friendly-error contract.
 *
 * A `?config=<url>` that returns an HTML page (SPA fallback, error page)
 * must be reported as such, never as a JSON syntax error ("Unexpected token
 * '<'"). fetchRemoteConfig classifies the body before App's validator sees it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHtml, fetchRemoteConfig } from '../src/lib/share.js';

test('looksLikeHtml: detects doctype / html documents', () => {
  assert.equal(looksLikeHtml('<!doctype html>\n<html lang="en">'), true);
  assert.equal(looksLikeHtml('<!DOCTYPE HTML>'), true);
  assert.equal(looksLikeHtml('  <html lang="en">'), true);
  assert.equal(looksLikeHtml('<html>'), true);
});

test('looksLikeHtml: JSON, wikitext and plain text are not HTML', () => {
  assert.equal(looksLikeHtml('{"version":1}'), false);
  assert.equal(looksLikeHtml('\n  {"widgets":[]}'), false);
  assert.equal(looksLikeHtml('Not found'), false);
  assert.equal(looksLikeHtml(''), false);
  assert.equal(looksLikeHtml(undefined), false);
});

test('fetchRemoteConfig: an HTML response throws the friendly error, not a parse error', async () => {
  const origFetch = globalThis.fetch;
  const origWindow = globalThis.window;
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
  globalThis.fetch = async () => new Response('<!doctype html><html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
  try {
    await assert.rejects(
      () => fetchRemoteConfig('/nope.json'),
      (e) => /returned an HTML page, not JSON/.test(e.message) && /nope\.json/.test(e.message),
    );
  } finally {
    globalThis.fetch = origFetch;
    globalThis.window = origWindow;
  }
});

test('fetchRemoteConfig: valid JSON passes through untouched', async () => {
  const origFetch = globalThis.fetch;
  const origWindow = globalThis.window;
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
  const body = '{"version":1,"widgets":[],"layout":[]}';
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    assert.equal(await fetchRemoteConfig('/dashboard.json'), body);
  } finally {
    globalThis.fetch = origFetch;
    globalThis.window = origWindow;
  }
});

test('fetchRemoteConfig: a 404 reports the missing path, not a JSON error', async () => {
  const origFetch = globalThis.fetch;
  const origWindow = globalThis.window;
  globalThis.window = { location: { origin: 'http://localhost:5173' } };
  globalThis.fetch = async () => new Response('Not found', { status: 404 });
  try {
    await assert.rejects(
      () => fetchRemoteConfig('/nope.json'),
      (e) => /config not found \(HTTP 404\)/.test(e.message) && /nope\.json/.test(e.message),
    );
  } finally {
    globalThis.fetch = origFetch;
    globalThis.window = origWindow;
  }
});
