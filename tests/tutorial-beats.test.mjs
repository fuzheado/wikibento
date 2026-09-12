/**
 * SCRIPT.md is the shooting script and, as of 2026-09-11, the pipeline's actual input: beats.mjs turns
 * it into beats, the voiceover is synthesized one clip per beat, and the recorder times its actions
 * and fx from the measured offsets. These tests are what keeps that claim true — the script is prose
 * written by a human, so the parser has to be told exactly what it may rely on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript, narrationOf, captionsOf, parseFx } from '../scripts/tutorial-video/beats.mjs';

// process.cwd() rather than import.meta.url: the test runner bundles each test file with esbuild, so
// import.meta.url points at the bundle rather than at this file (the repo's other tests do the same).
const DIR = join(process.cwd(), 'scripts/tutorial-video');
const SCRIPT = readFileSync(join(DIR, 'SCRIPT.md'), 'utf8');
const PLAN = JSON.parse(readFileSync(join(DIR, 'scenes.json'), 'utf8'));
const { scenes, warnings } = parseScript(SCRIPT, { knownSceneIds: PLAN.scenes.map((s) => s.id) });
const byId = new Map(scenes.map((s) => [s.id, s]));

test('the real SCRIPT.md parses without warnings', () => {
  assert.deepEqual(warnings, []);
});

test('every scene the recorder knows has words in the script', () => {
  for (const s of PLAN.scenes) {
    const scene = byId.get(s.id);
    assert.ok(scene, `${s.id} missing from SCRIPT.md`);
    assert.ok(scene.beats.length > 0, `${s.id} has no beats`);
    assert.ok(narrationOf(scene).length > 40, `${s.id} has almost no narration`);
  }
});

test('beat metadata is read: step, title, starting state, target length', () => {
  const s = byId.get('03-reset');
  assert.equal(s.step, 3);
  assert.equal(s.title, 'Clear it and start your own');
  assert.match(s.start, /starter board/);
  assert.equal(s.targetSeconds, 16);
});

test('narration is the beats joined, in order', () => {
  const s = byId.get('01-what');
  assert.equal(narrationOf(s), s.beats.filter((b) => b.text && !b.silent).map((b) => b.text).join(' '));
  assert.match(narrationOf(s), /^Every box here is a widget/);
});

test('the opening line is spoken over the title card, so the video starts talking', () => {
  // five silent seconds over a logo was a reviewer's first note on the finished take
  const t = byId.get('00-title');
  assert.ok(t, 'SCRIPT.md should carry a 00-title card section');
  assert.equal(t.start, null, 'a card has no starting state — it is not a recorded scene');
  assert.match(narrationOf(t), /^WikiBento is a dashboard you build yourself/);
  assert.equal(captionsOf(t).length, 1, 'the opening line is a caption too');
  assert.equal(narrationOf(byId.get('01-what')).includes('WikiBento is a dashboard'), false,
    'the opening line must not be said twice');
});

test('captions are per beat: the spoken line, unless 📝 overrides it', () => {
  const s = byId.get('01-what');
  assert.equal(captionsOf(s).length, s.beats.filter((b) => b.text && !b.silent).length);
  assert.equal(captionsOf(s)[0], s.beats[0].text);              // default: the spoken line
  assert.equal(captionsOf(s).at(-1), 'Live data · no login · no server');  // 📝 override on the last beat
});

test('a marker with @target is machine-readable; one without is prose only', () => {
  const beat = parseFx('zoom', '🔍 1.6× @ .grid-item .widget-frame — the four icons are ~20px each');
  assert.equal(beat.scale, 1.6);
  assert.equal(beat.selector, '.grid-item .widget-frame');
  assert.match(beat.prose, /four icons/);

  const prose = parseFx('ring', 'ring each icon as its name is spoken');
  assert.equal(prose.selector, null);      // nothing can draw this yet, and beats.mjs counts it
  assert.equal(prose.scale, null);
});

test('scene 1 addresses widgets by name, not by grid position', () => {
  const s = byId.get('01-what');
  const zooms = s.beats.flatMap((b) => b.zoom);
  const rings = s.beats.flatMap((b) => b.ring);
  assert.equal(zooms.length, 1);
  assert.equal(zooms[0].scale, 1.2);
  // `:nth-child(3)` silently points at whatever card happens to be third; a widget id cannot drift
  assert.match(zooms[0].selector, /^\[data-widget-id="[^"]+"\]$/);
  for (const r of rings) assert.match(r.selector, /^\[data-widget-id="[^"]+"\]$/);
});

test('hear something, see something: every widget scene 1 highlights exists on its board', () => {
  // The scene used to promise "a pageview count, a table, a chart, a gallery" over a board that showed
  // none of them. Now every noun in the narration has a widget, and this asserts the highlights point at
  // widgets the board actually has — so a rewrite of the board cannot leave a marker aiming at nothing.
  const scene = byId.get('01-what');
  // the operational start state lives in scenes.json (what the recorder navigates to); the script's
  // "starts from:" line is prose. Assert both, so one cannot quietly drift from the other.
  const planStart = PLAN.scenes.find((x) => x.id === '01-what').start;
  assert.equal(planStart, 'config:/article-vitals-demo.json', 'scene 1 should demo the Article vitals board');
  assert.match(scene.start || '', /article-vitals-demo\.json/, 'the script should name the board it starts from');
  const board = JSON.parse(readFileSync(join(process.cwd(), 'public/article-vitals-demo.json'), 'utf8'));
  const ids = new Set(board.widgets.map((w) => w.id));
  const targeted = [...scene.beats.flatMap((b) => [...b.zoom, ...b.ring])]
    .map((f) => (f.selector || '').match(/\[data-widget-id="([^"]+)"\]/))
    .filter(Boolean)
    .map((m) => m[1]);
  assert.ok(targeted.length >= 6, `expected several widgets to be highlighted, found ${targeted.length}`);
  for (const id of targeted) {
    assert.ok(ids.has(id), `scene 1 highlights "${id}", which is not a widget on article-vitals-demo.json`);
  }
  // and the words must name what is highlighted: a chart, a table, a gallery, the article, quality, history
  const spoken = narrationOf(scene).toLowerCase();
  for (const word of ['chart', 'table', 'gallery', 'article', 'quality', 'history']) {
    assert.ok(spoken.includes(word), `the narration should name the ${word} it shows`);
  }
});

test('the script only ever calls a widget a widget', () => {
  // the video says "widget" throughout, because that is what the product calls them; "card" is left for
  // the video's own title and closing screens. This guards the sweep that made it consistent.
  const speech = parseScript(SCRIPT).scenes
    .flatMap((s) => s.beats)
    .flatMap((b) => [b.text, b.caption].filter(Boolean))
    .join(' ');
  const hits = [...speech.matchAll(/.{0,28}\bcards?\b.{0,28}/gi)].map((m) => m[0]);
  assert.deepEqual(hits, [], `the narration still says "card": ${JSON.stringify(hits)}`);
});

test('a silent beat (the end card) contributes no narration and no caption', () => {
  const end = byId.get('99-end');
  assert.ok(end, 'the end card section should parse as a scene');
  assert.equal(narrationOf(end), '');
  assert.deepEqual(captionsOf(end), []);
});

test('a card section with no starting state is not reported as a scene/scenes.json mismatch', () => {
  assert.equal(byId.get('99-end').start, null);
  assert.ok(!warnings.some((w) => /99-end/.test(w)));
});
