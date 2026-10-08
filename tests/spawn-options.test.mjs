/**
 * spawnOptions / wireConfig — the menu's content, both directions of widget composition (ISSUE-96).
 *
 * Pure unit tests: the registry is passed in, never imported by the module under test (AGENTS.md's cycle rule).
 * The cases are the design brief's checklist: a pure producer, a pure consumer, a chainable type, a type that
 * publishes nothing, a genuinely empty side that says so, and wireConfig choosing the field the registry declares
 * for a channel.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnOptions, wireConfig } from '../src/lib/spawnOptions.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const REG = WIDGET_TYPES;
const opts = (id, config = {}) => spawnOptions(id, config, REG);

test('spawnOptions: a type with no inputs and no outputs carries one note per empty side', () => {
  const { feeds, feedsTo, notes } = opts('topPages');
  assert.equal(feeds.length, 0);
  assert.equal(feedsTo.length, 0);
  assert.equal(notes.length, 2, notes.join(' | '));
  assert.ok(notes.some((n) => /no inputs/i.test(n)), `a side is empty because it takes nothing: ${notes.join(' | ')}`);
  assert.ok(notes.some((n) => /publishes nothing/i.test(n)), `a side is empty because it emits nothing: ${notes.join(' | ')}`);
});

test('spawnOptions: a pure producer offers its output channel and says who can read it (cimRanking)', () => {
  const { feeds, feedsTo, notes } = opts('cimRanking');
  // RIGHT: three consumer source fields accept `lines`
  assert.deepEqual(feedsTo.map((f) => f.channel), ['lines']);
  assert.deepEqual(
    feedsTo[0].types.map((t) => `${t.type}.${t.field}`).sort(),
    ['filterLines.source', 'lineCount.source', 'speaker.source'],
  );
  assert.equal(notes.length, 0, notes.join(' | '));
  // LEFT: it wants a cim-category, so the CIM emitters that publish one can feed it (a second ranking card too —
  // the same TYPE is a valid neighbour, which is what makes map→map and filterLines→filterLines chainable).
  const about = feeds.find((f) => f.subject === 'cim-category');
  assert.ok(about, `a feed about a cim-category exists: ${JSON.stringify(feeds)}`);
  assert.ok(about.types.some((t) => t.type === 'cimStats'));
  assert.ok(about.kind, 'a feed carries the shape of the value that would arrive');
});

test('spawnOptions: a pure consumer can be fed but feeds nothing (pageviews)', () => {
  const { feeds, feedsTo, notes } = opts('pageviews');
  assert.equal(feedsTo.length, 0);
  assert.ok(notes.some((n) => /publishes nothing/i.test(n)), notes.join(' | '));
  // The Article Excerpt is the only producer whose value is ABOUT an article — but what it publishes is PROSE
  // about the article, not the article's NAME, and the pageviews card's `article` field resolves a title. So it is
  // refused (2026-10-07), and the empty side says what it wanted instead of offering the wrong thing.
  assert.ok(!feeds.some((f) => f.types.some((t) => t.type === 'excerpt')),
    `the prose producer must not be offered to a name field: ${JSON.stringify(feeds)}`);
  assert.deepEqual(feeds, [], `nothing publishes a name for an article yet: ${JSON.stringify(feeds)}`);
  assert.ok(notes.some((n) => /a name for article/.test(n)), `the empty side names what it wanted: ${notes.join(' | ')}`);
});

test('spawnOptions: a chainable type offers both directions (lineCount)', () => {
  const { feeds, feedsTo } = opts('lineCount');
  // consumes channels
  assert.ok(feeds.some((f) => f.kind === 'lines'), 'accepts lines');
  assert.ok(feeds.some((f) => f.kind === 'count'), 'accepts a count');
  assert.ok(feeds.some((f) => f.kind === 'value'), 'accepts a value');
  // publishes one, which the Line Count itself can read again
  assert.equal(feedsTo[0].channel, 'count');
  assert.ok(feedsTo[0].types.some((t) => t.type === 'lineCount' && t.field === 'source'));
});

test('spawnOptions: a genuinely empty side names the thing it wanted', () => {
  // Category Size takes a Commons category; no producer declares that as a subject — the CIM family publishes a
  // cim-category, which is a narrower vocabulary the field does not accept. So the left side is empty, and the note
  // says what it was looking for rather than leaving a blank.
  const { feeds, notes } = opts('categorySize');
  assert.equal(feeds.length, 0);
  assert.ok(notes.some((n) => /commons-category/.test(n)), `the note names the wanted kind: ${notes.join(' | ')}`);
});

test('spawnOptions: an unknown type is a note, not a throw', () => {
  const { feeds, feedsTo, notes } = spawnOptions('nope', {}, REG);
  assert.deepEqual(feeds, []);
  assert.deepEqual(feedsTo, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /nope/);
});

test('wireConfig: the reference goes in the field the registry says consumes the channel', () => {
  // The Translator's speech channel is declared accepted by the Speaker's `source` field — a plain id#channel,
  // NOT the braced form (a source field is read as an id; {{…}} is for text fields).
  assert.deepEqual(wireConfig(WIDGET_TYPES.speaker, { fromId: 'tr', channel: 'speech' }).config, { source: 'tr#speech' });
  // A bare id (the producer's default output): the same source field, no channel suffix.
  assert.deepEqual(wireConfig(WIDGET_TYPES.speaker, { fromId: 'tr' }).config, { source: 'tr' });
  // No source field: the thing (`kind`) field takes the {{widget:id}} reference, which resolveParams substitutes.
  assert.deepEqual(wireConfig(WIDGET_TYPES.pageviews, { fromId: 'ex' }).config, { article: '{{widget:ex}}' });
  assert.deepEqual(wireConfig(WIDGET_TYPES.pageviews, { fromId: 'ex', channel: 'reference' }).config, { article: '{{widget:ex#reference}}' });
  // Nothing to wire into, and no fromId, both yield a REFUSAL rather than a guess.
  assert.equal(wireConfig(WIDGET_TYPES.topPages, { fromId: 'x' }).refused, true);
  assert.equal(wireConfig(WIDGET_TYPES.speaker, {}).refused, true);
  assert.equal(wireConfig(null, { fromId: 'x' }).refused, true);
});

test('wireConfig: a subject selects the field the SAME way the menu offered the pair (kindsAccepting + denotes)', () => {
  // A producer whose value is a NAME about an article fills the gallery's `article` field — and ONLY that field, so
  // it reports which field it chose. `changedSource` is false: the card was already reading `article`.
  const r = wireConfig(WIDGET_TYPES.gallery, { fromId: 'x', subject: 'article', denotes: 'name', config: { ...WIDGET_TYPES.gallery.defaults } });
  assert.equal(r.refused, false);
  assert.equal(r.field, 'article');
  // `showIf` is applied, so the selector the field depends on is written too (here it is already `article`).
  assert.deepEqual(r.config, { from: 'article', article: '{{widget:x}}' });
  assert.equal(r.changedSource, false, 'from:article already reads the article field');

  // A PROSE value about an article is REFUSED — it is not the article's name, and the card resolves what it is
  // given (the reported bug: the paragraph landed in the title slot).
  const prose = wireConfig(WIDGET_TYPES.gallery, { fromId: 'ex', subject: 'article', denotes: 'prose', config: { ...WIDGET_TYPES.gallery.defaults } });
  assert.equal(prose.refused, true);
  assert.match(prose.reason, /prose/);
  assert.deepEqual(prose.config, {}, 'a refusal writes nothing');
  // …and a subject with NO value-form refuses too: the third axis is REQUIRED, not optional.
  assert.equal(wireConfig(WIDGET_TYPES.gallery, { fromId: 'ex', subject: 'article', config: { ...WIDGET_TYPES.gallery.defaults } }).refused, true);

  // A Commons-file NAME may NOT land in the article slot. The gallery does read a `files` field (a textarea), so
  // the wire MOVES the source to `list` and reports it — it does not silently fill `article` with a File: URL.
  const moved = wireConfig(WIDGET_TYPES.gallery, { fromId: 'doc', subject: 'commons-file', denotes: 'name', config: { ...WIDGET_TYPES.gallery.defaults } });
  assert.equal(moved.refused, false);
  assert.equal(moved.field, 'files', 'never the article slot');
  assert.equal(moved.changedSource, true);
  assert.match(moved.reason, /moves the card/);

  // A subject NO field's kind accepts is refused outright, with a reason.
  const none = wireConfig(WIDGET_TYPES.gallery, { fromId: 'x', subject: 'wikidata-item', denotes: 'name', config: { ...WIDGET_TYPES.gallery.defaults } });
  assert.equal(none.refused, true);
  assert.deepEqual(none.config, {});
  assert.match(none.reason, /wikidata-item/);
});

test('wireConfig: writing into a showIf field moves the source selector, and says so', () => {
  // The gallery reading a pasted file list: the `files` field is the one a commons-file producer fills. Wiring a
  // gallery whose `from` was `article` would have to move the source to `list` — the patch does that, and reports
  // the move rather than writing into a field the card was not reading.
  const cfg = { ...WIDGET_TYPES.gallery.defaults, from: 'article' };
  const r = wireConfig(WIDGET_TYPES.gallery, { fromId: 'doc', subject: 'commons-file', denotes: 'name', config: cfg });
  assert.equal(r.refused, false);
  assert.equal(r.field, 'files');
  assert.equal(r.config.from, 'list', 'the selector moves so the card reads the files field');
  assert.equal(r.config.files, '{{widget:doc}}');
  assert.equal(r.changedSource, true, 'the source changed and the caller is told');
  assert.match(r.reason, /moves the card/);
});

test('regression (ISSUE-96): a gallery reading an ARTICLE is never offered a Commons-file producer, nor a prose one', () => {
  // The reported cases: gallery { from: 'article', article: 'Albert Einstein' } offered Document Reader (a File:
  // URL, written into the `article` slot → "Article not found: <URL>") and then, after that was fixed, the Article
  // Excerpt (a paragraph about the article, written into the same slot → "Article not found: <the paragraph>").
  // The field the config does not read cannot attract a producer; the field it DOES read resolves a NAME, not prose.
  const { feeds, notes } = opts('gallery', { from: 'article', article: 'Albert Einstein' });
  const types = feeds.flatMap((f) => f.types.map((t) => t.type));
  assert.ok(!types.includes('documentReader'), `documentReader must not be offered: ${JSON.stringify(feeds)}`);
  assert.ok(!types.includes('excerpt'), `the prose producer must not be offered: ${JSON.stringify(feeds)}`);
  // Every offer would have to be a NAME about an article or a page; the registry has none, so the side is empty.
  for (const f of feeds) {
    assert.ok(['article', 'page'].includes(f.subject), `only article/page subjects may feed it, saw ${f.subject}`);
    assert.equal(f.denotes, 'name', `and only a NAME, saw ${f.denotes}`);
  }
  assert.deepEqual(feeds, [], `no name producer for an article exists yet: ${JSON.stringify(feeds)}`);
  assert.ok(notes.some((n) => /a name for article/.test(n)), `the side says what it wanted: ${notes.join(' | ')}`);
});

test('spawnOptions: only the source the config reads is a demand (a gallery on `list` offers documentReader)', () => {
  // The mirror of the bug: the same gallery reading a pasted file list DOES read the `files` field, so the
  // commons-file producer is offered — against that field.
  const { feeds } = opts('gallery', { from: 'list', ...WIDGET_TYPES.gallery.defaults, from: 'list' });
  const docFeed = feeds.find((f) => f.types.some((t) => t.type === 'documentReader'));
  assert.ok(docFeed, `documentReader feeds a list gallery: ${JSON.stringify(feeds)}`);
  assert.equal(docFeed.field, 'files');
  assert.equal(docFeed.subject, 'commons-file');
  // and the article-subject producer is NOT offered, because the article field is hidden for from:'list'.
  assert.ok(!feeds.some((f) => f.subject === 'article'), `no article feeder for a list gallery: ${JSON.stringify(feeds)}`);
});
