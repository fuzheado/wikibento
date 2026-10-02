/**
 * The board doctor — the constitution for `src/lib/boardDoctor.js` (the door's checker).
 *
 * What this file is for. The Ask audit measured the gap it closes: an outside producer given the catalog alone picked
 * the right widget 93% of the time and produced a usable envelope **0%** of the time. The doctor turns that from a
 * measurement into a diagnostic — and a diagnostic is only worth having if it fires on the right things, which is why
 * every check below is tested in BOTH directions: a case that must be reported, and a case that must NOT be (the
 * control). A check that only proves it can complain is a check that complains about everything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnoseBoard } from '../src/lib/boardDoctor.js';

const allowList = new Set(
  JSON.parse(readFileSync('public/cim-allow-list.json', 'utf8')).categories
    .map((c) => String(c).replace(/_/g, ' ').trim().toLowerCase()),
);
const codes = (report, kind) => report[kind].map((x) => x.code);
const messages = (report, kind) => report[kind].map((x) => x.message).join(' | ');
/** A board is `params` + `widgets` + a `layout` whose `i` values match the widget ids — nothing more. */
const board = (widgets, layout = widgets.map((w, i) => ({ i: w.id, x: 0, y: i * 4, w: 6, h: 4 })), params = {}) =>
  ({ version: 1, params, widgets, layout });

// ── the happy path, and text input ────────────────────────────────────────────────────────────────────────────────

test('a well-formed board is clean, whether it arrives as an object or as text', () => {
  const b = board([{ id: 'lede', widgetType: 'excerpt', config: { article: 'Albert Einstein' } }]);
  for (const input of [b, JSON.stringify(b)]) {
    const r = diagnoseBoard(input, { allowList });
    assert.equal(r.verdict, 'clean', messages(r, 'errors') + messages(r, 'warnings'));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.repairs, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.counts.widgets, 1);
  }
});

test('the ADVISOR FRAGMENT shape is named for what it is, not as a generic missing key', () => {
  // The commonest miss in the wild: the Ask relay returns widgets carrying their own `w`/`h`. ⬆ Import wants a separate
  // `layout` array, and "layout must be an array" alone does not tell an author that.
  const r = diagnoseBoard({ params: {}, widgets: [{ id: 'lede', widgetType: 'excerpt', config: { article: 'X' }, w: 8, h: 4 }] });
  assert.equal(r.verdict, 'unusable');
  assert.ok(codes(r, 'errors').includes('fragment-not-board'), messages(r, 'errors'));
  assert.match(messages(r, 'errors'), /layout/);
});

test('malformed input is refused with the app\'s own words', () => {
  const r = diagnoseBoard('{ "widgets": [ }', { allowList });
  assert.equal(r.verdict, 'unusable');
  assert.equal(r.widgets, null);
  assert.match(messages(r, 'errors'), /JSON/i);
});

test('an unregistered widget type is unusable', () => {
  const r = diagnoseBoard(board([{ id: 'x', widgetType: 'video_player', config: {} }]), { allowList });
  assert.equal(r.verdict, 'unusable');
  assert.match(messages(r, 'errors'), /video_player/);
});

// ── references: ids, channels, params ─────────────────────────────────────────────────────────────────────────────

test('a reference to a card that is not on the board is an error — and a real one is not', () => {
  const dangling = diagnoseBoard(board([
    { id: 's', widgetType: 'speaker', config: { text: '{{widget:nope}}' } },
  ]), { allowList });
  assert.equal(dangling.verdict, 'unusable');
  assert.ok(codes(dangling, 'errors').includes('dangling-widget-ref'), messages(dangling, 'errors'));
  assert.match(messages(dangling, 'errors'), /nope/);
  assert.match(messages(dangling, 'errors'), /The ids here are: s/, 'the message should list what IS on the board');

  // CONTROL: the same board with the producer present, wired through a real channel, is clean.
  const wired = diagnoseBoard(board([
    { id: 'lede', widgetType: 'excerpt', config: { article: 'Albert Einstein' } },
    { id: 'fr', widgetType: 'translate', config: { text: '{{widget:lede}}', to: 'fr' } },
    { id: 'say', widgetType: 'speaker', config: { text: '{{widget:fr#speech}}', lang: 'fr' } },
  ]), { allowList });
  assert.deepEqual(wired.errors, [], messages(wired, 'errors'));
  assert.deepEqual(wired.warnings, [], messages(wired, 'warnings'));
});

test('a channel the producer does not publish is an error, and the real channels are named', () => {
  const r = diagnoseBoard(board([
    { id: 'fr', widgetType: 'translate', config: { to: 'fr', text: 'bonjour' } },
    { id: 'say', widgetType: 'speaker', config: { text: '{{widget:fr#voice}}' } },
  ]), { allowList });
  assert.equal(r.verdict, 'unusable');
  assert.ok(codes(r, 'errors').includes('unknown-channel'), messages(r, 'errors'));
  assert.match(messages(r, 'errors'), /#speech/, 'the message must name a channel that DOES exist');
  assert.match(messages(r, 'errors'), /#translation/);
});

test('a bare id on a multi-channel producer is a NOTE (it means one specific channel)', () => {
  const r = diagnoseBoard(board([
    { id: 'g', widgetType: 'gallery', config: { from: 'category', category: 'Images from XBio' } },
    { id: 't', widgetType: 'translate', config: { text: '{{widget:g}}', to: 'fr' } },
  ]), { allowList });
  assert.ok(codes(r, 'notes').includes('bare-id-means-primary'), messages(r, 'notes'));
  assert.match(messages(r, 'notes'), /#lines/);
  assert.match(messages(r, 'notes'), /g#selection/, 'the note should say how to reach the other channel');
});

test('consuming a widget that publishes nothing is a warning, not an error', () => {
  const r = diagnoseBoard(board([
    { id: 'note', widgetType: 'markdown', config: { text: 'hello' } },
    { id: 'fr', widgetType: 'translate', config: { text: '{{widget:note}}', to: 'fr' } },
  ]), { allowList });
  assert.ok(codes(r, 'warnings').includes('consumer-not-publisher'), messages(r, 'warnings'));
  assert.deepEqual(r.errors, []);
});

test('an undeclared {{param}} is a warning — and a declared one is silent', () => {
  const undeclared = diagnoseBoard(board(
    [{ id: 'q', widgetType: 'qrCode', config: { text: 'see {{topic}}' } }],
    undefined, { other: { label: 'Other', type: 'text', value: 'x' } },
  ), { allowList });
  assert.ok(codes(undeclared, 'warnings').includes('undeclared-param'), messages(undeclared, 'warnings'));
  assert.match(messages(undeclared, 'warnings'), /missing from the params|not declared/);

  const declared = diagnoseBoard(board(
    [{ id: 'q', widgetType: 'qrCode', config: { text: 'see {{topic}}' } }],
    undefined, { topic: { label: 'Topic', type: 'text', value: 'x' } },
  ), { allowList });
  assert.deepEqual(declared.warnings.filter((w) => w.code === 'undeclared-param'), []);
});

// ── fields the card will ignore, and the gates ───────────────────────────────────────────────────────────────────

test('a field that does not apply to the current source mode is reported (`showIf`)', () => {
  const r = diagnoseBoard(board([
    { id: 'g', widgetType: 'gallery', config: { from: 'article', article: 'Albert Einstein', category: 'Images from XBio' } },
  ]), { allowList });
  assert.ok(codes(r, 'warnings').includes('ignored-field'), messages(r, 'warnings'));
  assert.match(messages(r, 'warnings'), /`category` is ignored while `from` is `article`/);
  // CONTROL: the same field WITH the matching mode is fine.
  const ok = diagnoseBoard(board([
    { id: 'g', widgetType: 'gallery', config: { from: 'category', category: 'Images from XBio' } },
  ]), { allowList });
  assert.deepEqual(ok.warnings.filter((w) => w.code === 'ignored-field'), []);
});

test('the CIM gate fires for a category that is not on the allow list — and not for one that is', () => {
  const listed = [...allowList][0];
  const ok = diagnoseBoard(board([{ id: 'c', widgetType: 'cimSnapshot', config: { category: listed } }]), { allowList });
  assert.deepEqual(ok.warnings.filter((w) => w.code === 'cim-not-listed'), []);

  const unlisted = diagnoseBoard(board([{ id: 'c', widgetType: 'cimSnapshot', config: { category: 'Albert Einstein' } }]), { allowList });
  assert.ok(codes(unlisted, 'warnings').includes('cim-not-listed'), messages(unlisted, 'warnings'));
  assert.match(messages(unlisted, 'warnings'), /glamorgan|categorySize/, 'the warning must name the live alternatives');

  // Without the snapshot the check degrades to a note instead of a wrong verdict.
  const noList = diagnoseBoard(board([{ id: 'c', widgetType: 'cimSnapshot', config: { category: 'Albert Einstein' } }]));
  assert.deepEqual(noList.warnings.filter((w) => w.code === 'cim-not-listed'), []);
  assert.ok(codes(noList, 'notes').includes('cim-unknown'), messages(noList, 'notes'));
});

test('relay-needing and experimental types are notes (they are legal, not wrong)', () => {
  const r = diagnoseBoard(board([
    { id: 'm', widgetType: 'map', config: { place: 'Q64' } },
    { id: 'w', widgetType: 'waybackGallery', config: { url: 'https://wikipedia.org', dates: '2010-01-01' } },
  ]), { allowList });
  assert.deepEqual(r.errors, []);
  const notes = messages(r, 'notes');
  assert.match(notes, /relay/, notes);
  assert.match(notes, /experimental/, notes);
});

// ── board-level observations, and the severity model's middle row ────────────────────────────────────────────────

test('params with nothing to drive them, and controls with nothing to drive, are both reported', () => {
  const noControls = diagnoseBoard(board(
    [{ id: 'lede', widgetType: 'excerpt', config: { article: '{{article}}' } }],
    undefined, { article: { label: 'Article', type: 'buttons', options: ['A'], value: 'A' } },
  ), { allowList });
  assert.ok(codes(noControls, 'notes').includes('params-without-controls'), messages(noControls, 'notes'));

  const noParams = diagnoseBoard(board([
    { id: 'controls', widgetType: 'boardControls', config: {} },
    { id: 'lede', widgetType: 'excerpt', config: { article: 'X' } },
  ]), { allowList });
  assert.ok(codes(noParams, 'notes').includes('controls-without-params'), messages(noParams, 'notes'));
});

test('a repair the app will make silently is reported as a repair, not an error', () => {
  // The severity model's middle row. An UNKNOWN config key is the clean example: `validateDashboard` reports it as a
  // warning ("ignored"), the board imports, and the author is told what was dropped.
  const r = diagnoseBoard(board([
    { id: 'e', widgetType: 'echo', config: { source: '{{widget:e}}', topic: 'not a field of echo' } },
  ]), { allowList });
  assert.deepEqual(r.errors, [], messages(r, 'errors'));
  assert.ok(r.repairs.length >= 1, `expected a repair, got ${JSON.stringify(r)}`);
  assert.match(messages(r, 'repairs'), /unknown config key/);
  assert.equal(r.verdict, 'importable', 'a board with repairs is importable, not clean');
});

test('a mistyped value is a REPAIR, not a refusal (ISSUE-134 resolved 2026-10-02, the documented model)', () => {
  // The app's own docs called this *Repairable* while the validator refused the board — and a chat writes `"200"` all
  // the time, so the door was refusing exactly its own traffic. Fixed in favour of the docs: the board imports, the
  // coercer reads the value, and the reader is told. The doctor delegates, so it reports a repair.
  const r = diagnoseBoard(board([
    { id: 't', widgetType: 'topPages', config: { topN: '200' } },
  ]), { allowList });
  assert.deepEqual(r.errors, []);
  assert.equal(r.verdict, 'importable');
  assert.match(messages(r, 'repairs'), /topN.*read as the number 200/);

  // And the value it cannot read is still reported, as a repair with the consequence spelled out.
  const unreadable = diagnoseBoard(board([
    { id: 't', widgetType: 'topPages', config: { topN: 'twelve' } },
  ]), { allowList });
  assert.deepEqual(unreadable.errors, []);
  assert.match(messages(unreadable, 'repairs'), /not a number/);
});
