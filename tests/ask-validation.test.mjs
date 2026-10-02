/**
 * Ask-relay validation tests (ISSUE-44) — the constitution for the /api/ask
 * sanitizer: model output must never produce configs that break widgets.
 * Covers: hallucinated ids, unknown config keys, invalid select values,
 * near-miss project aliases (commons.org), Category:/File: prefix rules,
 * bare domains, https URLs, number/boolean coercion, displayMode validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, validateOptions, ASK_SYSTEM, askManual, ASK_RULES, ASK_RULES_BOARD, ASK_ASSEMBLY_MANUAL } from '../deploy/server.js';

// Widget definitions straight from the build-generated manifest (the same
// file the server prompts with) — single source of truth. Tests run from the
// repo root (npm test), so resolve via cwd (esbuild bundling breaks
// import.meta.url-relative paths).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = new Map(manifest.widgets.map((w) => [w.id, w]));

/**
 * The static prompt has a **constitution**, not a habit (the Ask audit's fix #4, 2026-10-01).
 *
 * The fallback model binds: `llm-qwen36-27b` has a 32K window but `llm-qwen3-14b` has 16K, so a prompt that outgrows
 * the budget turns a primary-model outage into a 502. The first version of this budget used the `chars / 3.5` rule of
 * thumb, which over-estimated by ~15% (it read "at the ceiling" when there were ~3.5K tokens of room); the ratio below
 * is **measured** — the API reported `usage.prompt_tokens: 11,386` for the 47,066-character suggest prompt.
 */
test('the static prompt stays inside its measured token budget (the 16K fallback binds)', () => {
  const CHARS_PER_TOKEN = 4.13;   // measured 2026-10-01 (API usage.prompt_tokens), not the 3.5 heuristic
  const CEILING_TOKENS = 12600;   // ≤ 14K design ceiling, leaving room for the user prompt + 700 output in 16K
  const tokenCount = (s) => Math.round(String(s).length / CHARS_PER_TOKEN);
  const catalog = ASK_SYSTEM(manifest);
  const manual = askManual(manifest);
  const valueRules = ASK_RULES.slice(ASK_RULES.indexOf('\n\nVALUE RULES (critical'), ASK_RULES.indexOf('\n\nOUTPUT SCHEMA:'));
  const modes = {
    suggest: `${catalog}${manual}${ASK_RULES}`,
    board: `${catalog}${manual}${ASK_ASSEMBLY_MANUAL}${ASK_RULES_BOARD}${valueRules}`,
  };
  for (const [mode, prompt] of Object.entries(modes)) {
    const tokens = tokenCount(prompt);
    assert.ok(tokens <= CEILING_TOKENS,
      `${mode} prompt is ~${tokens} tokens (cap ${CEILING_TOKENS}). Blocks: catalog ${tokenCount(catalog)}`
      + ` · manual ${tokenCount(manual)} · rules ${tokenCount(mode === 'board' ? ASK_ASSEMBLY_MANUAL + ASK_RULES_BOARD + valueRules : ASK_RULES)}`
      + ' — the block that grew is the one to trim (docs/ASK-ARCHITECTURE.md, "How to re-measure")');
  }
});

/**
 * The CIM allow-list gate (the Ask audit's fix #6, 2026-10-02).
 *
 * Nine widget types read Commons Impact Metrics, which a monthly job PRE-COMPUTES for a curated allow list of
 * Commons categories only — so a cim* card for a general, niche or brand-new category cannot load: it fails with
 * the request process (the app is honest; the *advice* was not). The audit found the advisor proposing two such
 * cards on a switcher board.
 *
 * This asserts the gate reaches every reader that can state it: the advisor's manual (both modes — it lives in
 * `askManual`, which board mode also includes), the suggest-mode intent rule, and the human's ⚙ panel via the
 * field hint that travels through the manifest. It is derived from the manifest, so a CIM widget added later is
 * covered without editing this test — and it fails if the hint stops reaching the manifest (which is how a `//`
 * comment inside a shared config-field constant silently dropped it: see the note in src/widgets/index.js).
 */
test('the advisor is warned off CIM for categories that are not on the allow list', () => {
  const cimIds = manifest.widgets.filter((w) => String(w.dataSource || '').startsWith('CIM ')).map((w) => w.id);
  assert.ok(cimIds.length >= 9, `expected the CIM family in the manifest, found ${cimIds.length}`);

  const manual = askManual(manifest);
  for (const id of cimIds) assert.ok(manual.includes(id), `the manual does not name the gated type ${id}`);
  assert.match(manual, /CIM GATE: [\s\S]*?ALLOW LIST/, 'the manual states the allow-list gate');
  assert.match(manual, /prefer glamorgan or categorySize/, 'the manual names the live alternatives');

  const catalog = ASK_SYSTEM(manifest);
  const valueRules = ASK_RULES.slice(ASK_RULES.indexOf('\n\nVALUE RULES (critical'), ASK_RULES.indexOf('\n\nOUTPUT SCHEMA:'));
  const modes = {
    suggest: `${catalog}${manual}${ASK_RULES}`,
    board: `${catalog}${manual}${ASK_ASSEMBLY_MANUAL}${ASK_RULES_BOARD}${valueRules}`,
  };
  for (const [mode, prompt] of Object.entries(modes)) {
    assert.match(prompt, /CIM GATE:/, `${mode} prompt does not carry the CIM gate`);
  }
  assert.match(modes.suggest, /cim\* is GATED/, 'the suggest prompt does not qualify its own "prefer … cim*" rule');

  // The ⚙-panel half: every category-taking CIM widget's field carries the sentence.
  const hinted = manifest.widgets
    .filter((w) => cimIds.includes(w.id))
    .flatMap((w) => (w.configFields || []).filter((f) => f.key === 'category').map((f) => ({ id: w.id, hint: String(f.hint || '') })));
  assert.ok(hinted.length >= 6, `expected the six category-taking CIM types, found ${hinted.length}`);
  for (const { id, hint } of hinted) {
    assert.match(hint, /ALLOW LIST/, `the category field of ${id} carries no allow-list hint`);
    assert.match(hint, /GLAM Category Usage|Category Size/, `the hint on ${id} names no live alternative`);
  }
});

test('the manual names every publisher — including the ones that publish CHANNELS', () => {
  // `askManual` writes "only these N produce output", so the list has to be every widget that publishes. It counted
  // only `outputs.kind` until 2026-10-02, which silently omitted the four channel publishers — excerpt, gallery,
  // wikiBox and the Translator, i.e. the middle of the chain this very prompt recommends. Derived from the manifest,
  // so a channel publisher added later is covered without editing this test.
  const manual = askManual(manifest);
  const publishers = manifest.widgets.filter((w) => w.outputs).map((w) => w.id);
  assert.ok(publishers.length >= 13, `expected the publisher set in the manifest, found ${publishers.length}`);
  const emittersLine = (manual.match(/- EMITTERS \(only these [\s\S]*?(?=\n- )/) || [])[0] || '';
  assert.ok(emittersLine, 'the manual has no EMITTERS line');
  for (const id of publishers) assert.ok(emittersLine.includes(id), `the EMITTERS line omits the publisher ${id}`);
  for (const id of ['translate', 'gallery', 'excerpt', 'wikiBox']) {
    assert.match(emittersLine, new RegExp(`${id} emits channels:`), `${id} publishes channels — the manual should say so`);
  }
  assert.match(emittersLine, /#speech/, 'the Translator\'s speech channel is what the canonical chain consumes');
});

const categorySize = defs.get('categorySize');
const gallery = defs.get('gallery');
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

test('project values: near misses resolve, unknown wikis are kept (ISSUE-93)', () => {
  // Near misses an Ask prompt produces still resolve.
  assert.equal(normalizeConfig({ wiki: 'commons.org' }, categorySize).wiki, 'commons.wikimedia');
  assert.equal(normalizeConfig({ wiki: 'Commons' }, categorySize).wiki, 'commons.wikimedia');
  assert.equal(normalizeConfig({ project: 'en.wikipedia.org' }, defs.get('pageviews')).project, 'en.wikipedia');
  // A *spoken* language name becomes a project.
  assert.equal(normalizeConfig({ project: 'German' }, defs.get('pageviews')).project, 'de.wikipedia');
  // What is gone: dropping a project the registry cannot enumerate. 364 wikis live in the site matrix, so an
  // unrecognised value passes through — the widget's own error state is the guard, and the picker keeps the UI
  // honest (ISSUE-93).
  assert.equal(normalizeConfig({ wiki: 'zh.wikipedia' }, categorySize).wiki, 'zh.wikipedia');
  assert.equal(normalizeConfig({ wiki: 'mars.wikipedia' }, categorySize).wiki, 'mars.wikipedia');
});

test('a language field takes a language, not a wiki', () => {
  const wikistats = defs.get('wikistats');
  assert.equal(normalizeConfig({ lang: 'German' }, wikistats).lang, 'de');
  assert.equal(normalizeConfig({ lang: 'en.wikipedia' }, wikistats).lang, 'en');
  assert.equal(normalizeConfig({ lang: 'zh' }, wikistats).lang, 'zh');
});

test('file values: File: prefix added, per line for lists', () => {
  assert.equal(normalizeConfig({ filename: 'Example.jpg' }, defs.get('fileUsage')).filename, 'File:Example.jpg');
  const files = normalizeConfig({ files: 'Example1.webm\nExample2.webm' }, gallery).files;
  assert.equal(files, 'File:Example1.webm\nFile:Example2.webm');
  // already-prefixed lines untouched
  assert.equal(normalizeConfig({ files: 'File:Example1.webm\nExample2.webm' }, gallery).files, 'File:Example1.webm\nFile:Example2.webm');
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
  // the gallery widget's displayMode options: grid | list
  const good = validateOptions({ options: [{ widgetType: 'gallery', config: { files: 'File:A.jpg' }, mode: 'grid' }] }, defs);
  assert.equal(good[0].mode, 'grid');
  const bad = validateOptions({ options: [{ widgetType: 'gallery', config: { files: 'File:A.jpg' }, mode: 'slideshow' }] }, defs);
  assert.equal(bad[0].mode, undefined);
});

test('full pipeline: the user-reported failure cases', () => {
  // Model output as observed in the bug report: a gallery with a category key
  const out = validateOptions({ options: [{ widgetType: 'gallery', config: { category: 'Category:Featured pictures on Wikimedia Commons' } }] }, defs);
  // 2026-09-18: `category` USED to be unknown for the file gallery, and dropping it WAS the fix for this exact
  // model output. A gallery can now take its file list from a category, so the key is real — the model's
  // instinct to pair a gallery with a category turned out to be the feature. (The Category: prefix is fine:
  // cleanCategoryName strips it in the fetcher.)
  // The Category: prefix is normalised away by key name (the same rule categorySize's `category` gets),
  // so a model that says either form lands on the same config.
  assert.deepEqual(out[0].config, { category: 'Featured pictures on Wikimedia Commons' });
  // …and a genuinely unknown key is still dropped, so the invariant this test exists for is intact.
  const junk = validateOptions({ options: [{ widgetType: 'gallery', config: { nonsense: 'x', category: 'Foo' } }] }, defs);
  assert.deepEqual(junk[0].config, { category: 'Foo' });
  // categorySize with prefixed category + commons.org wiki → both fixed
  const out2 = validateOptions({ options: [{ widgetType: 'categorySize', config: { category: 'Category:Featured pictures on Wikimedia Commons', wiki: 'commons.org' } }] }, defs);
  assert.deepEqual(out2[0].config, { category: 'Featured pictures on Wikimedia Commons', wiki: 'commons.wikimedia' });
});
