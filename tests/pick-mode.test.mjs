import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../src/widgets/index.js';
import { KIND_IDS, kindFields, brushableTypes, typesForKind, brushConfig, alreadyPlaced } from '../src/lib/pickMode.js';
import { projectFromUrl, pickFromUrl, PICKABLE_RENDERERS, minimalConfig } from '../src/lib/pickMode.js';
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
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, board, 'excerpt', cfg, 'article'), true);
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, board, 'excerpt', brushConfig(WIDGET_TYPES.excerpt, 'article', 'Another'), 'article'), false);
  assert.equal(alreadyPlaced(WIDGET_TYPES.gallery, board, 'gallery', cfg, 'article'), false, 'a different type is a different card');
  assert.equal(alreadyPlaced(WIDGET_TYPES.excerpt, [], 'excerpt', cfg, 'article'), false);
});

// Reported by Andrew, 2026-09-24: pick an article gallery, click a second article, get "Albert Einstein is already
// on the board". A gallery declares four kinds (article, page, category, files) and brushConfig starts from the
// registry defaults, so the two configs agreed on every field EXCEPT the one that mattered — and the first version
// of alreadyPlaced compared all of them.
test('two different items of the same kind are two different cards, even for a widget with many kinds', () => {
  const def = WIDGET_TYPES.gallery;
  assert.ok(kindFields(def).length >= 4, 'the gallery is the multi-kind case this guards');
  const ada = brushConfig(def, 'article', 'Ada Lovelace', { project: 'en.wikipedia' });
  const albert = brushConfig(def, 'article', 'Albert Einstein', { project: 'en.wikipedia' });
  const board = [{ id: 'g1', widgetType: 'gallery', config: ada }];
  assert.equal(alreadyPlaced(def, board, 'gallery', ada, 'article'), true, 'the same article is a twin');
  assert.equal(alreadyPlaced(def, board, 'gallery', albert, 'article'), false, 'a different article is not');
  // The other kinds say nothing about this one: an article gallery and a category gallery coexist.
  const cat = brushConfig(def, 'commons-category', 'Featured pictures');
  assert.equal(alreadyPlaced(def, board, 'gallery', cat, 'commons-category'), false, 'a different kind is a different card');
  // A blank pick is not a duplicate of another blank pick.
  assert.equal(alreadyPlaced(def, board, 'gallery', { ...albert, article: '' }, 'article'), false);
});

// The other half of the same rule: the picked kind decides which SOURCE the spawned card reads from. A field's own
// `showIf` says which selector value makes it visible, so a pick cannot silently fill a field the card ignores —
// picking a category must not spawn an article gallery (found with the above, 2026-09-24).
test('a pick points the widget at the source that reads it', () => {
  const g = WIDGET_TYPES.gallery;
  assert.equal(brushConfig(g, 'article', 'Albert Einstein').from, 'article');
  assert.equal(brushConfig(g, 'commons-category', 'Featured pictures').from, 'category');
  assert.equal(brushConfig(g, 'commons-gallery', 'The Venetian Macao').from, 'page');
  const files = brushConfig(g, 'commons-file', 'File:Airplane vortex edit.jpg');
  assert.equal(files.from, 'list');
  assert.equal(files.files, 'File:Airplane vortex edit.jpg');
  // A widget whose field has no `showIf` keeps whatever its defaults say — single-source widgets are unaffected.
  const e = brushConfig(WIDGET_TYPES.excerpt, 'article', 'Neon Museum');
  assert.equal(e.article, 'Neon Museum');
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

test('a click knows which wiki the item came from — the ISSUE-99 rule, applied to a click', () => {
  assert.equal(projectFromUrl('https://en.wikipedia.org/wiki/Marie_Curie'), 'en.wikipedia');
  assert.equal(projectFromUrl('https://de.wikipedia.org/wiki/Weddellmeer'), 'de.wikipedia');
  assert.equal(projectFromUrl('https://commons.wikimedia.org/wiki/File:X.jpg'), 'commons.wikimedia');
  assert.equal(projectFromUrl('https://en.wikisource.org/wiki/Page:X'), 'en.wikisource');
  // Anything that is not a Wikimedia article URL leaves the widget's own default alone.
  for (const bad of ['/wiki/X', 'http://localhost:3000/x', 'https://archive.org/details/x', '', null, undefined]) {
    assert.equal(projectFromUrl(bad), undefined, `${bad} should not name a project`);
  }
});

test('a link says what it is — the row-derived kind', () => {
  assert.deepEqual(pickFromUrl('https://en.wikipedia.org/wiki/Marie_Curie'),
    { kind: 'article', value: 'Marie Curie', label: 'Marie Curie', project: 'en.wikipedia' });
  // Underscores and percent-escapes both come back as a title you could paste into a widget.
  assert.equal(pickFromUrl('https://de.wikipedia.org/wiki/Weddellmeer').value, 'Weddellmeer');
  assert.equal(pickFromUrl('https://en.wikipedia.org/wiki/P%C3%A8re_Lachaise_Cemetery').value, 'Père Lachaise Cemetery');
  assert.deepEqual(pickFromUrl('https://commons.wikimedia.org/wiki/File:Airplane_vortex_edit.jpg'),
    { kind: 'commons-file', value: 'File:Airplane vortex edit.jpg', label: 'Airplane vortex edit.jpg', project: 'commons.wikimedia' });
  // A namespace page is a page, not an article, and not a kind this vocabulary can place.
  for (const bad of [
    'https://en.wikipedia.org/wiki/Category:Physicists',
    'https://en.wikipedia.org/wiki/Talk:Marie_Curie',
    'https://commons.wikimedia.org/wiki/Category:Featured_pictures',
    'https://en.wikipedia.org/wiki/Special:Random',
    '/wiki/Marie_Curie', 'https://archive.org/details/x', '', null, undefined,
  ]) {
    assert.equal(pickFromUrl(bad), null, `${bad} should not name a pickable thing`);
  }
});

test('the publisher list is a contract: real renderers, known kinds', () => {
  // process.cwd(), not import.meta.url: the tests are bundled elsewhere (the repo root, or a scratch dir for a
  // single-file run) and the bundle's own location says nothing about where the sources are.
  const src = fs.readFileSync(path.join(process.cwd(), 'src/widgets/WidgetFrame.jsx'), 'utf8');
  const cases = new Set([...src.matchAll(/case '([A-Za-z]+Card)':/g)].map((m) => m[1]));
  for (const [renderer, kind] of Object.entries(PICKABLE_RENDERERS)) {
    assert.ok(cases.has(renderer), `${renderer} is declared pickable but nothing renders it`);
    if (kind !== 'derived') assert.ok(KIND_IDS.includes(kind), `${renderer} declares kind "${kind}"`);
  }
  // The two the app renders but deliberately does NOT offer, so a future pass adds them on purpose.
  for (const held of ['SparqlCard', 'ListSourceCard', 'WikiPageCard', 'AssessmentsCard']) {
    assert.equal(PICKABLE_RENDERERS[held], undefined, `${held} is deliberately not a publisher yet`);
  }
});

test('a spawned config carries only what the card reads', () => {
  const g = WIDGET_TYPES.gallery;
  const article = brushConfig(g, 'article', 'Hunter Museum of American Art', { project: 'en.wikipedia' });
  assert.equal(article.from, 'article');
  assert.equal(article.article, 'Hunter Museum of American Art');
  for (const other of ['page', 'category', 'files']) {
    assert.equal(other in article, false, `${other} belongs to another source and must not ride along`);
  }
  // Shared fields have no showIf, so nothing hides them and they stay.
  assert.equal(article.displayMode, g.defaults.displayMode);
  assert.ok('refreshSeconds' in article);

  // A list pick is the mirror image: the pasted list stays, the article goes, and `project` is hidden for that source.
  const list = brushConfig(g, 'commons-file', 'File:Dogs, jackals.jpg');
  assert.equal(list.from, 'list');
  assert.equal(list.files, 'File:Dogs, jackals.jpg');
  assert.equal('article' in list, false);
  assert.equal('project' in list, false, 'project is hidden when the source is a pasted list');
});

test('minimalConfig keeps keys it does not recognise', () => {
  assert.equal(minimalConfig(WIDGET_TYPES.gallery, { from: 'article', article: 'X', somethingNew: 1 }).somethingNew, 1);
});
