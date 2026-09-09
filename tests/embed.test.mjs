/**
 * Custom-URL embed constitution (ISSUE-62).
 *
 * The Wiki Page widget can embed any http(s) page (Objectium 3D models, maps…)
 * via a `url` config field. Contract: http(s) only, bare domains get https://,
 * unsafe schemes are rejected with a visible error state, and the wiki-page
 * mode is unchanged when no URL is set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const t = (config) => WIDGET_TYPES.wikiPage.transform(null, { project: 'en.wikipedia', ...config });

test('wikiPage: a custom https URL embeds as an external frame', () => {
  const r = t({ url: 'https://objectium.toolforge.org/uploads/213' });
  assert.equal(r.url, 'https://objectium.toolforge.org/uploads/213');
  assert.equal(r.external, true);
  assert.equal(r.page, 'objectium.toolforge.org'); // iframe title / label
});

test('wikiPage: a bare domain gets https:// prepended', () => {
  assert.equal(t({ url: 'objectium.toolforge.org/uploads/213' }).url, 'https://objectium.toolforge.org/uploads/213');
});

test('wikiPage: unsafe or malformed URLs are rejected with an error state', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://example.org/x', 'not a url']) {
    const r = t({ url: bad });
    assert.equal(r.url, null, `${bad} must not embed`);
    assert.match(r.error, /http\(s\) URL/);
  }
});

test('wikiPage: the custom URL wins over the wiki page fields', () => {
  const r = t({ url: 'https://example.org/x', page: 'Albert Einstein', project: 'de.wikipedia', mobile: true, fragment: 'Bio' });
  assert.equal(r.url, 'https://example.org/x');
  assert.equal(r.external, true);
});

test('wikiPage: wiki mode is unchanged (regression)', () => {
  const r = t({ page: 'Albert Einstein', project: 'en.wikipedia', fragment: 'Biography' });
  assert.equal(r.url, 'https://en.wikipedia.org/wiki/Albert_Einstein#Biography');
  assert.ok(!r.external, 'wiki pages are not sandboxed');
  assert.equal(t({ page: 'Help:Introduction', mobile: true }).url, 'https://en.wikipedia.org/wiki/Help:Introduction?useformat=mobile');
  assert.equal(t({ page: '' }).url, null);
});

test('wikiPage: labelFromConfig shows the host for a URL, the page otherwise', () => {
  assert.equal(WIDGET_TYPES.wikiPage.labelFromConfig({ url: 'https://objectium.toolforge.org/uploads/213' }), 'objectium.toolforge.org');
  assert.equal(WIDGET_TYPES.wikiPage.labelFromConfig({ page: 'Albert_Einstein' }), 'Albert Einstein');
});
