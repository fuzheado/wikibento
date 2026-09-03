/**
 * CIM shallow-vs-deep gap indicator (Issue #5) — the constitution:
 *  1. When deep scope and the tree dwarfs the direct count (ratio ≥ 10× and
 *     ≥ 10k deep files), the card gets a `gap` chip: { direct, tree, ratio }.
 *  2. Flat/tight trees (BHL-style) get NO gap chip — no noise on legit cards.
 *  3. Deep scope shows the DEEP numbers in stats (fixes the latent mislabel:
 *     shallow keys were rendered under a "deep" label); shallow keys used as
 *     fallback when a fixture omits -deep keys.
 *  4. Subtitle discloses the direct count whenever it differs from deep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_TYPES } from '../src/widgets/index.js';

const transform = WIDGET_TYPES.cimSnapshot.transform;

test('extreme diffusion (UNESCO-like) → gap chip with direct/tree/ratio', () => {
  const out = transform(
    { category: 'UNESCO', resolvedMonth: { year: 2026, month: 3 }, files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: 'deep', month: 3 },
  );
  assert.equal(out.gap.direct, 575);
  assert.equal(out.gap.tree, 16414373);
  assert.equal(out.gap.ratio, 28547); // round(16414373 / 575)
});

test('deep scope shows DEEP numbers in stats (latent mislabel fixed)', () => {
  const out = transform(
    { category: 'UNESCO', files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: 'deep' },
  );
  assert.equal(out.stats[0].value, '16,414,373');
  assert.equal(out.stats[0].sub, 'deep');
  assert.equal(out.subtitle.includes('direct: 575 files'), true);
});

test('shallow scope shows shallow numbers, no gap chip', () => {
  const out = transform(
    { category: 'UNESCO', files: 575, filesDeep: 16414373, used: 125, usedDeep: 1215949, wikis: 84, wikisDeep: 814, pages: 361, pagesDeep: 4603614 },
    { scope: 'shallow' },
  );
  assert.equal(out.stats[0].value, '575');
  assert.equal(out.stats[0].sub, 'shallow');
  assert.equal(out.gap, null);
});

test('flat tree (BHL-style, shallow == deep) → no gap chip, stats unchanged', () => {
  const out = transform(
    { category: 'BHL', files: 305868, filesDeep: 305868, used: 14434, usedDeep: 14434, wikis: 252, wikisDeep: 252, pages: 41819, pagesDeep: 41819 },
    { scope: 'deep' },
  );
  assert.equal(out.gap, null);
  assert.equal(out.stats[0].value, '305,868');
});

test('below threshold (ratio < 10× or < 10k deep files) → no gap chip', () => {
  const tight = transform({ category: 'X', files: 500000, filesDeep: 516000 }, { scope: 'deep' });
  assert.equal(tight.gap, null); // ratio 1.03 — tight tree
  const small = transform({ category: 'Y', files: 5, filesDeep: 5000 }, { scope: 'deep' });
  assert.equal(small.gap, null); // ratio 1000× but below the 10k-file floor
});
