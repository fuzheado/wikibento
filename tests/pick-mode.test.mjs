import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { KIND_IDS, kindFields, brushableTypes, typesForKind, brushConfig, alreadyPlaced } from '../src/lib/pickMode.js';
const registry = WIDGET_TYPES;

/**
 * Shop-and-pick (ISSUE-114): a registry field can declare WHAT it consumes (`kind: 'article'`), which is what makes
 * "click this article and place a card for it" possible at all. Before the annotation, gallery.article,
 * excerpt.article and pageviews.article were all `type: 'text'` and nothing could answer the question.
 */

test('every declared kind is one this app can resolve', () => {
  const bad = [];
  for (const [type, def] of Object.entries(WIDGET_TYPES)) {
    for (const { field, kind } of kindFields(def)) {
      if (!KIND_IDS.includes(kind)) bad.push(`${type}.${field.key} → ${kind}`);
    }
  }
  assert.deepEqual(bad, [], 'kinds that paramSources.js cannot validate');
});

test('the article consumers are findable — that is the whole point', () => {
  const types = typesForKind('article', registry).map((t) => t.type);
  for (const expected of ['excerpt', 'gallery', 'quality', 'pageviews', 'edithistory', 'assessments', 'articleList']) {
    assert.ok(types.includes(expected), `${expected} should accept an article`);
  }
  // …and a widget that consumes something else is not offered for an article
  assert.ok(!types.includes('fileUsage'));
  assert.ok(typesForKind('commons-file', registry).map((t) => t.type).includes('fileUsage'));
  assert.deepEqual(typesForKind('no-such-kind', registry), []);
});

test('a brush click produces the config the widget needs, and only for a kind it consumes', () => {
  const excerpt = WIDGET_TYPES.excerpt;
  const cfg = brushConfig(excerpt, 'article', 'Neon Museum', { project: 'en.wikipedia' });
  assert.equal(cfg.article, 'Neon Museum');
  assert.equal(cfg.project, 'en.wikipedia');
  assert.equal(cfg.refreshSeconds, excerpt.defaults.refreshSeconds, 'registry defaults come along');
  assert.equal(brushConfig(excerpt, 'commons-file', 'File:X.jpg'), null, 'a kind this widget cannot consume');

  // a list-taking field gets one item: a spawn is one card for one item
  const list = brushConfig(WIDGET_TYPES.articleList, 'article', 'Ada Lovelace');
  assert.equal(list.articles, 'Ada Lovelace');
});

test('clicking the same item twice does not make a twin', () => {
  const cfg = brushConfig(WIDGET_TYPES.excerpt, 'article', 'Neon Museum', { project: 'en.wikipedia' });
  const board = [{ id: 'e1', widgetType: 'excerpt', config: cfg }];
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, board, 'excerpt', cfg), true);
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, board, 'excerpt', brushConfig(WIDGET_TYPES.excerpt, 'article', 'Another')), false);
  assert.equal(alreadyPlaced(WIDGET_TYPES.gallery, board, 'gallery', cfg), false, 'a different type is a different card');
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, [], 'excerpt', cfg), false);
});

test('every brushable type can place something, and the brush list is sorted by name', () => {
  const brushable = brushableTypes(registry);
  assert.ok(brushable.length >= 15, `expected a healthy brush list, got ${brushable.length}`);
  for (const { type, kinds } of brushable) {
    assert.ok(kinds.length > 0, `${type} is listed with no kind`);
    assert.ok(kinds.every((k) => KIND_IDS.includes(k)), `${type} has an unknown kind`);
  }
  const names = brushable.map((t) => t.def.name);
  assert.deepEqual(names, [...names].sort((a, b) => String(a).localeCompare(String(b))));
});
