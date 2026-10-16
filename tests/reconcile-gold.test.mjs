/**
 * The ImageNote audit's numbers, pinned to the data they came from.
 *
 * Two reports prepared for this project (2026-10-07 and 2026-10-08, archived in `docs/research/`) quote a set of measured
 * figures — 9,643 files, 30,032 notes, an 11.6 % stale-geometry rate, a 100-note gold set, and a threshold sweep that
 * recommends publishing at ≥0.80 for 95.8 % precision. This test holds those numbers to their inputs: the shipped
 * `audit_summary.json`, `gold_labels.json` and `matcher_evaluation.json` from the audit package, which reproduces
 * byte-for-byte offline (see `npm run audit:verify`, ~45 s).
 *
 * What it is for, in this repo's terms: the reconciliation work (ISSUE-143) is now specified by *measurements*, and a
 * measurement that lives in prose drifts. If someone edits a fixture, or re-runs the pipeline against newer data and
 * drops the result in, the report it was quoted from stops being true — and this fails instead of that happening
 * silently. It asserts relationships (bindable + abstain = 100) rather than only constants, so it says *which* input
 * moved.
 *
 * It reads the fixtures by path rather than bundling them because the suite's esbuild step rewrites `import.meta.url`;
 * a bundled test would look for the fixtures in the wrong directory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = (name) => JSON.parse(readFileSync(`tests/fixtures/reconcile/${name}`, 'utf8'));

test('the audited corpus matches what the report quotes', () => {
  const s = fixture('audit_summary.json');
  assert.equal(s.audited.files, 9643, `files audited (report: 9,643) — got ${s.audited.files}`);
  assert.equal(s.audited.notes, 30032, `notes parsed (report: 30,032) — got ${s.audited.notes}`);
  assert.equal(s.geometry.stale, 1117, `stale boxes (report: 1,117 = 11.6 %) — got ${s.geometry.stale}`);
  assert.equal(s.geometry.match, 8526, 'current boxes (report: 8,526 = 88.4 %)');
  assert.equal(s.sdc.has_depicts, 4817, 'files with a depicts (report: 4,817 = 50.0 %)');
  assert.equal(s.sdc.depicts_with_position, 13, 'files with a position-qualified depicts (report: 13)');
  // The geometry split is a share, so a change in either half is a change in the claim: 1117/(1117+8526) = 11.6 %.
  const share = s.geometry.stale / (s.geometry.stale + s.geometry.match);
  assert.ok(Math.abs(share - 0.116) < 0.001, `stale share drifted to ${(share * 100).toFixed(1)} % (report: 11.6 %)`);
});

test('the gold set is 100 hand-adjudicated notes, and a third of them should not be bound', () => {
  const gold = fixture('gold_labels.json');
  assert.equal(gold.length, 100, 'the gold set is the 100-note stratified sample');
  const kind = (k) => gold.filter((g) => g.kind === k).length;
  // The report's distribution, re-derived from the labels rather than trusted as a total.
  assert.deepEqual(
    { OK: kind('OK'), OK_TOP3: kind('OK_TOP3'), MISS: kind('MISS'), AMBIG: kind('AMBIG'), NOITEM: kind('NOITEM'), NOTENTITY: kind('NOTENTITY') },
    { OK: 37, OK_TOP3: 8, MISS: 21, AMBIG: 9, NOITEM: 9, NOTENTITY: 16 },
    'the gold distribution moved — the report quotes 37 · 8 · 21 · 9 · 9 · 16',
  );
  // Bindable = a Wikidata answer exists (found or missed). Abstain = no answer should be bound at all.
  const bindable = kind('OK') + kind('OK_TOP3') + kind('MISS');
  const abstain = kind('AMBIG') + kind('NOITEM') + kind('NOTENTITY');
  assert.equal(bindable, 66, 'report: 66 of 100 notes have a bindable answer');
  assert.equal(abstain, 34, 'report: 34 should not be bound at all');
  assert.equal(bindable + abstain, 100);

  const micro = fixture('gold_micro.json');
  assert.equal(micro.length, 36, 'the link-rich micro-gold set is 36 notes (the ceiling a demo would show)');
});

test('the matcher evaluation reproduces the report, including the publish gate', () => {
  const e = fixture('matcher_evaluation.json');
  assert.equal(e.gold_notes, 100);
  assert.equal(e.gold_bindable, 66, 'bindable notes the matcher was scored against');
  assert.equal(e.gold_should_abstain, 34);
  assert.equal(e.overall.top1_correct, 37, 'report: 37 correct top-1');
  assert.equal(e.overall.top3_contains_gold, 45, 'report: 45 correct within top-3');
  assert.equal(e.overall.missed, 21, 'report: 21 missed');
  assert.ok(Array.isArray(e.threshold_sweep) && e.threshold_sweep.length >= 4, 'the threshold sweep is the calibration');

  // The gate's claim, tested as a property rather than by key names: somewhere near 0.80 a rung must buy ≥95 % precision
  // while publishing a quarter or more of the gold set. If a re-run moves that, the recommendation in the docs is void.
  const numeric = (o, lo, hi) => Object.values(o).filter((v) => typeof v === 'number' && v >= lo && v <= hi);
  let best = null;
  for (const rung of e.threshold_sweep) {
    const t = numeric(rung, 0.4, 0.99)[0];               // the threshold-like value
    const precision = numeric(rung, 0.4, 1)[1];          // the precision-like value
    const published = numeric(rung, 1, 100)[0];          // how many it would publish
    if (t !== undefined && precision !== undefined && precision >= 0.95) {
      if (!best || t > best.t) best = { t, precision, published };
    }
  }
  assert.ok(best, 'no rung of the sweep reaches 95 % precision — the publish gate has no support in this data');
  assert.ok(best.t <= 0.85, `the 95 %-precision rung sits at ${best.t} — higher than the documented gate`);
});
