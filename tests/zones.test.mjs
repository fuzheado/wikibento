/**
 * Clickable zones — the MVP's parser and its wiring (ISSUE-138, slice A).
 *
 * Zones are how a picture becomes something a reader can act on: a click publishes a value that another card consumes,
 * which is the same emitter contract a gallery tile or a Wiki Box link already uses. The value on the wire is what
 * matters here — a zone click must be indistinguishable from any other selection to a consumer.
 *
 * This file holds the parts that are pure: the text grammar, its round trip, the reference→URL rule `open` zones use,
 * and the two registry facts the renderer depends on (the field exists and applies to the single-image mode; the
 * transform carries parsed zones and their problems).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseZones, serialiseZones, emittingZones, zoneUrl, ZONE_ACTIONS } from '../src/lib/zones.js';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const NOTES = `# the real notes on File:Scuol-Motta Naluns — six peaks, percentages of the picture
26.5,23.8,0.8,1.3 | Piz Sursass | article | de:Piz Sursass | send
21.0,27.0,0.8,1.3 | Piz Nuna | article | de:Piz Nuna | send
15.2,14.3,0.6,1.4 | Piz Mezdi | article | de:Piz Mezdi | open
30,30,5,5 | - | - | - | -`;

test('a zone line is geometry | label | kind | value | action, and `-` means absent', () => {
  const { zones, problems } = parseZones(NOTES);
  assert.deepEqual(problems, []);
  assert.equal(zones.length, 4);
  assert.deepEqual(zones[1], { line: 3, label: 'Piz Nuna', kind: 'article', value: 'de:Piz Nuna', action: 'send',
    geometry: 'box', x: 21, y: 27, w: 0.8, h: 1.3 });
  assert.equal(zones[0].label, 'Piz Sursass');
  assert.equal(zones[2].action, 'open');
  // The fourth line is a box with no label, no value and no action: a reveal, and a `send` that publishes nothing.
  assert.equal(zones[3].label, '');
  assert.equal(zones[3].value, '');
  assert.equal(zones[3].action, 'send');
  assert.equal(zones[3].x, 30);
});

test('two fields are enough, and the rest default — because a person types these by hand', () => {
  const { zones, problems } = parseZones('10,20,30,40 | Something');
  assert.deepEqual(problems, []);
  assert.deepEqual({ ...zones[0] }, { line: 1, label: 'Something', kind: '', value: '', action: 'send',
    geometry: 'box', x: 10, y: 20, w: 30, h: 40 });
});

test('a malformed line is REPORTED with its number — never dropped in silence', () => {
  const { zones, problems } = parseZones([
    'not-a-box | Label',                                // 1: geometry that is not four numbers
    '200,10,5,5 | Off the picture',                      // 2: x past 100
    '10,10,0,5 | No width',                              // 3: no size
    '10,10,95,5 | Runs past the right edge',             // 4: x + w > 100
    '10,10,5,5 | Bad action | article | de:X | dance',   // 5: an action that is not send/open
    'at -100,20 | Pitch out of range',                   // 6: pitch outside ±90
    '10,10,5,5 | Fine',                                  // 7: the one good line
  ].join('\n'));
  assert.equal(zones.length, 1);
  assert.equal(zones[0].label, 'Fine');
  assert.equal(problems.length, 6);
  for (const [i, text] of problems.entries()) {
    assert.match(text, new RegExp(`^line ${i + 1}:`), `problem ${i + 1} names its line: ${text}`);
  }
  assert.match(problems[1], /between 0 and 100/);        // a box is refused, not silently moved
  assert.match(problems[3], /not clamped/);              // …and so is one that runs off the edge
  assert.match(problems[4], /send, open/);
});

test('a sphere direction parses too, in the engine\'s own convention', () => {
  const { zones, problems } = parseZones('at -2,300 | Mauna Kea | article | en:Mauna Kea');
  assert.deepEqual(problems, []);
  assert.equal(zones[0].geometry, 'at');
  assert.equal(zones[0].pitch, -2);
  assert.equal(zones[0].yaw, -60);                       // (300 + 540) % 360 - 180 — what getYaw() returns
});

test('the text round-trips, so the editor (slice B) can write what it read', () => {
  const { zones } = parseZones(NOTES);
  // `line` is where a zone sits in the *text*, so a round trip renumbers it — everything else must survive.
  const bare = (zs) => zs.map(({ line, ...rest }) => rest);
  const text = serialiseZones(zones);
  assert.deepEqual(bare(parseZones(text).zones), bare(zones));
  assert.deepEqual(bare(parseZones(serialiseZones(parseZones(text).zones)).zones), bare(zones));
  assert.equal(text.split('\n').length, zones.length, 'one line per zone');
});

test('only a zone with a value can emit; a label-only zone is a reveal', () => {
  const { zones } = parseZones('10,10,5,5 | Emitter | article | de:X\n20,20,5,5 | Label only');
  assert.deepEqual(emittingZones(zones).map((z) => z.value), ['de:X']);
});

test('an `open` zone\'s reference becomes a wiki URL — language codes and dbnames both', () => {
  assert.equal(zoneUrl('de:Piz Nuna'), 'https://de.wikipedia.org/wiki/Piz_Nuna');
  assert.equal(zoneUrl('commonswiki:File:Dogs, jackals.jpg'),
    'https://commons.wikimedia.org/wiki/File:Dogs,_jackals.jpg');
  assert.equal(zoneUrl('Category:Birds'), 'https://commons.wikimedia.org/wiki/Category:Birds');   // a namespace prefix
  assert.equal(zoneUrl('Birds'), null);                   // a bare title has no wiki to open it on
  assert.equal(zoneUrl('Nonsense:Thing'), null);          // not a wiki, not a language: refused, not guessed
  assert.equal(zoneUrl('en:Marie Curie'), 'https://en.wikipedia.org/wiki/Marie_Curie');
  assert.equal(zoneUrl('fr:Paris'), 'https://fr.wikipedia.org/wiki/Paris');
});

test('the registry offers the field, only where it applies, and carries the parse into the renderer', () => {
  const def = WIDGET_TYPES.gallery;
  // A picture publishes TWO kinds of thing: the file it shows (its own click → `selection`) and the things its zones
  // name (→ `zones`). One channel each — the first live demo collided them, and an article consumer said
  // "Article not found: File:Scuol-…jpg".
  assert.equal(def.outputs.zones, 'value', 'the gallery declares the channel its zones publish on');
  assert.equal(def.outputs.selection, 'value', 'and keeps the one its own click uses');
  assert.equal(def.primary, 'lines', 'the bare id still means its lines');
  const field = (def.configFields || []).find((f) => f.key === 'zones');
  assert.ok(field, 'the gallery declares a zones field');
  assert.equal(field.type, 'textarea', 'zones are text — no new field type (the map\'s precedent)');
  assert.deepEqual(field.showIf, { displayMode: 'single' }, 'it appears only for the single-image mode');
  const data = def.transform({ rows: [{ title: 'X.jpg', width: 100, height: 50 }] },
    { ...def.defaults, displayMode: 'single', zones: '10,10,20,20 | Z | article | de:X' });
  assert.equal(data.zones.length, 1, 'the parsed zones ride on the data the renderer already has');
  assert.deepEqual(data.zoneProblems, []);
  const broken = def.transform({ rows: [] }, { ...def.defaults, zones: 'nonsense | Z' });
  assert.equal(broken.zones.length, 0);
  assert.equal(broken.zoneProblems.length, 1, 'and the problems travel with them, so the card can say so');
});

test('the demo board\'s zones parse, and every one names something a consumer can resolve', () => {
  const board = JSON.parse(readFileSync('public/zone-demo.json', 'utf8'));
  const zonesField = board.widgets.find((w) => w.id === 'zones-image').config.zones;
  const { zones, problems } = parseZones(zonesField);
  assert.deepEqual(problems, [], 'the shipped demo has no unreadable line');
  assert.ok(zones.length >= 5, `the demo draws the file's notes (${zones.length} zones)`);
  for (const z of zones) {
    assert.equal(z.geometry, 'box');
    assert.ok(z.label, 'every zone is labelled, or a reader cannot tell what it is');
    assert.equal(z.kind, 'article');
    assert.match(z.value, /^[a-z-]+:/, `${z.label}: the value is a reference, so the consumer knows the wiki`);
    assert.ok(ZONE_ACTIONS.includes(z.action));
  }
  // …and the consumer really is wired to the producer's ZONE channel, not to the one a picture click uses.
  const excerpt = board.widgets.find((w) => w.id === 'zones-excerpt');
  assert.match(excerpt.config.article, /\{\{widget:zones-image#zones\}\}/);
  assert.doesNotMatch(excerpt.config.article, /#selection/,
    'the picture click publishes the FILE it shows on selection — an article consumer must not be wired there');
});
