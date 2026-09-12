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
  assert.match(narrationOf(s), /^WikiBento is a dashboard you build yourself/);
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

test('scene 1 fx is wired: one 1.2× zoom and three rings, each with a target', () => {
  const s = byId.get('01-what');
  const zooms = s.beats.flatMap((b) => b.zoom);
  const rings = s.beats.flatMap((b) => b.ring);
  assert.equal(zooms.length, 1);
  assert.equal(zooms[0].scale, 1.2);
  assert.equal(zooms[0].selector, '.grid-item:nth-child(3)');
  assert.equal(rings.length, 3);
  for (const r of rings) assert.match(r.selector, /^\.grid-item:nth-child\(\d\) \.widget-title$/);
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
