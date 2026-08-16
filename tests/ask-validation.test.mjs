/**
 * Ask-relay validation tests (ISSUE-44) — the constitution for the /api/ask
 * sanitizer: model output must never produce configs that break widgets.
 * Covers: hallucinated ids, unknown config keys, invalid select values,
 * near-miss project aliases (commons.org), Category:/File: prefix rules,
 * bare domains, https URLs, number/boolean coercion, displayMode validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, validateOptions } from '../deploy/server.js';

// Widget definitions straight from the build-generated manifest (the same
// file the server prompts with) — single source of truth. Tests run from the
// repo root (npm test), so resolve via cwd (esbuild bundling breaks
// import.meta.url-relative paths).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = new Map(manifest.widgets.map((w) => [w.id, w]));
const categorySize = defs.get('categorySize');
const fileGallery = defs.get('fileGallery');
const topPages = defs.get('topPages');
const linkcount = defs.get('linkcount');

test('hallucinated widget ids are dropped', () => {
  const out = validateOptions({ options: [{ widgetType: 'video_player', config: {} }, { widgetType: 'categorySize', config: { category: 'X' } }] }, defs);
  assert.equal(out.length, 1);
  assert.equal(out[0].widgetType, 'categorySize');
});

test('unknown config keys are dropped, known keys kept', () => {
  const out = normalizeConfig({ category: 'Featured pictures', inventedKey: 'nope', sampleCount: 6 }, categorySize);
  assert.deepEqual(out, { category: 'Featured pictures', sampleCount: 6 });
});

test('category values: Category: prefix stripped, quotes dropped', () => {
  const out = normalizeConfig({ category: '"Category:Featured pictures"' }, categorySize);
  assert.equal(out.category, 'Featured pictures');
});

test('select values: invalid options dropped, aliases resolved', () => {
  // commons.org → commons.wikimedia (near-miss alias)
  assert.equal(normalizeConfig({ wiki: 'commons.org' }, categorySize).wiki, 'commons.wikimedia');
  // Commons → commons.wikimedia (case-insensitive)
  assert.equal(normalizeConfig({ wiki: 'Commons' }, categorySize).wiki, 'commons.wikimedia');
  // fully invalid → dropped (widget default applies)
  assert.deepEqual(normalizeConfig({ wiki: 'mars.wikipedia' }, categorySize), {});
  // en.wikipedia.org → en.wikipedia
  assert.equal(normalizeConfig({ project: 'en.wikipedia.org' }, defs.get('pageviews')).project, 'en.wikipedia');
});

test('file values: File: prefix added, per line for lists', () => {
  assert.equal(normalizeConfig({ filename: 'Example.jpg' }, defs.get('fileUsage')).filename, 'File:Example.jpg');
  const files = normalizeConfig({ files: 'Example1.webm\nExample2.webm' }, fileGallery).files;
  assert.equal(files, 'File:Example1.webm\nFile:Example2.webm');
  // already-prefixed lines untouched
  assert.equal(normalizeConfig({ files: 'File:Example1.webm\nExample2.webm' }, fileGallery).files, 'File:Example1.webm\nFile:Example2.webm');
});

test('domain values: protocol + www stripped', () => {
  assert.equal(normalizeConfig({ domain: 'https://www.example.org/' }, linkcount).domain, 'example.org');
});

test('url values: non-URLs dropped, https kept', () => {
  assert.equal(normalizeConfig({ url: 'not a url' }, defs.get('waybackGallery')).url, undefined);
  assert.equal(normalizeConfig({ url: 'https://example.org/page' }, defs.get('waybackGallery')).url, 'https://example.org/page');
});

test('number fields coerced; junk dropped', () => {
  assert.equal(normalizeConfig({ sampleCount: '12' }, categorySize).sampleCount, 12);
  assert.deepEqual(normalizeConfig({ sampleCount: 'twelve' }, categorySize), {});
});

test('boolean fields coerced from strings', () => {
  assert.equal(normalizeConfig({ filterNoise: 'false' }, topPages).filterNoise, false);
  assert.equal(normalizeConfig({ filterNoise: true }, topPages).filterNoise, true);
});

test('mode validated against the widget displayMode options', () => {
  // fileGallery displayMode options: grid | list
  const good = validateOptions({ options: [{ widgetType: 'fileGallery', config: { files: 'File:A.jpg' }, mode: 'grid' }] }, defs);
  assert.equal(good[0].mode, 'grid');
  const bad = validateOptions({ options: [{ widgetType: 'fileGallery', config: { files: 'File:A.jpg' }, mode: 'slideshow' }] }, defs);
  assert.equal(bad[0].mode, undefined);
});

test('full pipeline: the user-reported failure cases', () => {
  // Model output as observed in the bug report: fileGallery with a category key
  const out = validateOptions({ options: [{ widgetType: 'fileGallery', config: { category: 'Category:Featured pictures on Wikimedia Commons' } }] }, defs);
  // the category key is unknown for fileGallery → dropped; widget still offered
  assert.deepEqual(out[0].config, {});
  // categorySize with prefixed category + commons.org wiki → both fixed
  const out2 = validateOptions({ options: [{ widgetType: 'categorySize', config: { category: 'Category:Featured pictures on Wikimedia Commons', wiki: 'commons.org' } }] }, defs);
  assert.deepEqual(out2[0].config, { category: 'Featured pictures on Wikimedia Commons', wiki: 'commons.wikimedia' });
});
