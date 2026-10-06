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
  // the Article Excerpt is the only producer whose value is about an article
  const about = feeds.find((f) => f.subject === 'article');
  assert.ok(about, `a feed about an article exists: ${JSON.stringify(feeds)}`);
  assert.deepEqual(about.types.map((t) => t.type), ['excerpt']);
  assert.equal(about.kind, 'extract', 'the value that would arrive is the excerpt prose');
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
  assert.deepEqual(wireConfig(WIDGET_TYPES.speaker, { fromId: 'tr', channel: 'speech' }), { source: 'tr#speech' });
  // A bare id (the producer's default output): the same source field, no channel suffix.
  assert.deepEqual(wireConfig(WIDGET_TYPES.speaker, { fromId: 'tr' }), { source: 'tr' });
  // No source field: the thing (`kind`) field takes the {{widget:id}} reference, which resolveParams substitutes.
  assert.deepEqual(wireConfig(WIDGET_TYPES.pageviews, { fromId: 'ex' }), { article: '{{widget:ex}}' });
  assert.deepEqual(wireConfig(WIDGET_TYPES.pageviews, { fromId: 'ex', channel: 'reference' }), { article: '{{widget:ex#reference}}' });
  // Nothing to wire into, and no fromId, both yield an empty patch rather than a guess.
  assert.deepEqual(wireConfig(WIDGET_TYPES.topPages, { fromId: 'x' }), {});
  assert.deepEqual(wireConfig(WIDGET_TYPES.speaker, {}), {});
});
