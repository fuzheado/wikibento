/**
 * References — a page plus the wiki it is on (ISSUE-92).
 *
 * The rule these tests hold down: a value that names a page carries its project, and a value that does not is
 * still a valid title. Everything the app emitted before this existed must keep meaning exactly what it meant.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dbnameOf, projectSite, projectRef, parseRef, titleOf, projectOf, withProject,
  resolvePageConfig, resolveRefLines, projectConfigOf,
} from '../src/lib/reference.js';

// ── the canonical name ────────────────────────────────────────────────────────────────────────────

test('every way this app writes a project maps to one dbname', () => {
  assert.equal(dbnameOf('en.wikipedia'), 'enwiki');
  assert.equal(dbnameOf('de.wikipedia'), 'dewiki');
  assert.equal(dbnameOf('commons.wikimedia'), 'commonswiki');
  assert.equal(dbnameOf('en.wikisource'), 'enwikisource');
  assert.equal(dbnameOf('fr.wiktionary'), 'frwiktionary');
  assert.equal(dbnameOf('www.wikidata'), 'wikidata');
  assert.equal(dbnameOf('en.wikipedia.org'), 'enwiki');
  assert.equal(dbnameOf('https://de.wikipedia.org/'), 'dewiki');
});

test('a dbname is already canonical, and the difficult ones survive', () => {
  for (const db of ['enwiki', 'dewiki', 'commonswiki', 'wikidata', 'enwikisource', 'zh_min_nanwiki', 'be_x_oldwiki']) {
    assert.equal(dbnameOf(db), db, db);
  }
});

test('an unreadable project is null rather than a guess', () => {
  for (const bad of ['', '   ', null, undefined, 'wikipedia', 'en', 'not a project']) {
    assert.equal(dbnameOf(bad), null, String(bad));
  }
});

test('the site gives a host, a family and a language', () => {
  assert.deepEqual(projectSite('en.wikipedia'), { dbname: 'enwiki', host: 'en.wikipedia.org', family: 'wikipedia', lang: 'en' });
  assert.deepEqual(projectSite('enwikisource'), { dbname: 'enwikisource', host: 'en.wikisource.org', family: 'wikisource', lang: 'en' });
  assert.equal(projectSite('commonswiki').host, 'commons.wikimedia.org');
  assert.equal(projectSite('wikidata').host, 'www.wikidata.org');
  assert.equal(projectSite('en.wikipedia').lang, 'en');
  assert.equal(projectSite('commons.wikimedia').lang, null);
});

// ── the wire form ─────────────────────────────────────────────────────────────────────────────────

test('a reference carries the project and the title', () => {
  assert.equal(projectRef('en.wikipedia', 'Weddell Sea'), 'enwiki:Weddell Sea');
  assert.equal(projectRef('dewiki', 'Weddellmeer'), 'dewiki:Weddellmeer');
  assert.equal(projectRef('commons.wikimedia', 'File:KM Virgo.jpg'), 'commonswiki:File:KM Virgo.jpg');
});

test('a project we cannot read yields the bare title, never a broken prefix', () => {
  assert.equal(projectRef('', 'Weddell Sea'), 'Weddell Sea');
  assert.equal(projectRef('nonsense', 'Weddell Sea'), 'Weddell Sea');
  assert.equal(projectRef('enwiki', ''), '');
});

test('parsing a reference is unambiguous, including namespaced titles', () => {
  assert.deepEqual(parseRef('enwiki:Weddell Sea'), { project: 'enwiki', title: 'Weddell Sea', isRef: true });
  assert.deepEqual(parseRef('commonswiki:File:KM Virgo.jpg'),
    { project: 'commonswiki', title: 'File:KM Virgo.jpg', isRef: true });
  assert.deepEqual(parseRef('wikidata:Q1094710'), { project: 'wikidata', title: 'Q1094710', isRef: true });
});

test('a bare title is a title — the whole reason nothing old changes meaning', () => {
  assert.deepEqual(parseRef('Weddell Sea'), { project: null, title: 'Weddell Sea', isRef: false });
  // a namespace is not a project: `File:` and `Category:` must not be eaten as one
  assert.deepEqual(parseRef('File:KM Virgo.jpg'), { project: null, title: 'File:KM Virgo.jpg', isRef: false });
  assert.deepEqual(parseRef('Help:Introduction'), { project: null, title: 'Help:Introduction', isRef: false });
  // prose is not a reference either
  assert.equal(parseRef('Grace Coolidge (1879–1957) was the first lady…').isRef, false);
});

test('titleOf and projectOf read either form', () => {
  assert.equal(titleOf('enwiki:Weddell Sea'), 'Weddell Sea');
  assert.equal(titleOf('Weddell Sea'), 'Weddell Sea');
  assert.equal(projectOf('enwiki:Weddell Sea'), 'enwiki');
  assert.equal(projectOf('Weddell Sea'), null);
});

test('a resolved page carries both names for the same wiki', () => {
  // The wire form is the dbname; the app's own fetchers build `https://${project}.org` from the dotted form.
  // Handing a dbname to a fetcher produced `https://enwiki.org` for every converted widget at once (2026-09-16),
  // which is why the resolver returns both and why this test exists.
  assert.deepEqual(resolvePageConfig({ article: 'enwiki:Weddell Sea' }, { field: 'article' }),
    { project: 'enwiki', projectConfig: 'en.wikipedia', title: 'Weddell Sea', isRef: true });
  assert.equal(projectConfigOf('commonswiki'), 'commons.wikimedia');
  assert.equal(projectConfigOf('enwikisource'), 'en.wikisource');
  assert.equal(projectConfigOf('wikidata'), 'www.wikidata');
  assert.equal(projectConfigOf('en.wikipedia'), 'en.wikipedia', 'already dotted: unchanged');
  assert.deepEqual(resolveRefLines('dewiki:Bar', 'en.wikipedia')[0].projectConfig, 'de.wikipedia');
});

test('a widget resolves a page field in one call, reference first', () => {
  // The reference beats the configured project: a value that says where it is from is better evidence than a field.
  assert.deepEqual(resolvePageConfig({ article: 'enwiki:Weddell Sea', project: 'de.wikipedia' }, { field: 'article' }),
    { project: 'enwiki', projectConfig: 'en.wikipedia', title: 'Weddell Sea', isRef: true });
  assert.deepEqual(resolvePageConfig({ article: 'Weddell Sea', project: 'de.wikipedia' }, { field: 'article' }),
    { project: 'dewiki', projectConfig: 'de.wikipedia', title: 'Weddell Sea', isRef: false });
  assert.deepEqual(resolvePageConfig({ page: 'Foo' }, { field: 'page', fallbackProject: 'commons.wikimedia' }),
    { project: 'commonswiki', projectConfig: 'commons.wikimedia', title: 'Foo', isRef: false });
  // a category is a page too, and its namespace must survive
  assert.equal(resolvePageConfig({ category: 'commonswiki:Category:Seas' }, { field: 'category' }).title, 'Category:Seas');
});

test('a list of pages may mix references and bare titles', () => {
  assert.deepEqual(resolveRefLines('enwiki:Foo\ndewiki:Bar\nBaz', 'en.wikipedia'), [
    { project: 'enwiki', projectConfig: 'en.wikipedia', title: 'Foo', isRef: true },
    { project: 'dewiki', projectConfig: 'de.wikipedia', title: 'Bar', isRef: true },
    { project: 'enwiki', projectConfig: 'en.wikipedia', title: 'Baz', isRef: false },
  ]);
  // The boundary, deliberately: a bare language code is NOT a reference. `de:Bar` is a title, because the
  // convention is the dbname (`dewiki`) — the form every Wikimedia API already uses. Accepting `de:` would mean
  // knowing the language list at parse time, which is ISSUE-93's job (`sitematrix`), not this module's guess.
  assert.deepEqual(resolveRefLines('de:Bar', 'en.wikipedia'),
    [{ project: 'enwiki', projectConfig: 'en.wikipedia', title: 'de:Bar', isRef: false }]);
  assert.deepEqual(resolveRefLines('', 'en.wikipedia'), []);
  assert.deepEqual(resolveRefLines('  \n \n', 'en.wikipedia'), []);
});

test('a consumer can re-aim a reference at its own wiki', () => {
  assert.equal(withProject('enwiki:Weddell Sea', 'de.wikipedia'), 'dewiki:Weddell Sea');
  assert.equal(withProject('Weddell Sea', 'en.wikipedia'), 'enwiki:Weddell Sea');
  assert.equal(withProject('enwiki:Weddell Sea', ''), 'enwiki:Weddell Sea', 'no project given: keep the one it has');
});
