/**
 * Shared scoring for the intent→widget benchmark (ISSUE-44 constitution).
 * Used by the offline scorecard (tests/intent-benchmark.test.mjs) and the
 * live LLM scorer (scripts/benchmark-ask.mjs) so both tiers are measured
 * identically.
 *
 * Scoring semantics (deliberately lenient where the tier is weak, strict
 * where it must be strong):
 *  - top1 / top3: expected widgetType is options[0] / within options[0..2].
 *    The local tier is only expected to reach top3 (discovery); the LLM tier
 *    should reach top1.
 *  - keysOk: the first option matching the expected widgetType carries ALL
 *    expected config keys.
 *  - subjectOk (only meaningful when requireSubject): for each expected
 *    config value that is a real subject (≥ 3 chars), the returned value
 *    contains a significant token of it (case-insensitive; stopwords and
 *    the File:/https: scaffolding ignored). Short values (< 3 chars, e.g.
 *    lang 'de') must match exactly. Placeholders are never accepted when
 *    requireSubject is set.
 */
import assert from 'node:assert/strict';

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'from', 'in', 'on', 'at', 'with', 'how', 'what', 'want', 'can', 'me', 'my', 'i', 'show', 'see', 'like', 'some', 'that', 'this', 'it', 'is', 'are', 'do', 'does']);
const significantTokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));

export function subjectMatches(expectedValue, actualValue) {
  const e = String(expectedValue);
  const a = String(actualValue ?? '').toLowerCase();
  if (e.length < 3) return a === e.toLowerCase();
  return significantTokens(e).every((t) => a.includes(t));
}

export function scoreOptions(fixture, options) {
  const expectedId = fixture.expected.widgetType;
  const ids = (options || []).map((o) => o.widgetType);
  const top1 = ids[0] === expectedId;
  const top3 = ids.slice(0, 3).includes(expectedId);
  const match = (options || []).find((o) => o.widgetType === expectedId);
  let keysOk = false;
  let subjectOk = false;
  if (match) {
    const cfg = match.config || {};
    const expectedKeys = Object.keys(fixture.expected.config || {});
    keysOk = expectedKeys.length > 0 ? expectedKeys.every((k) => k in cfg) : true;
    if (fixture.requireSubject) {
      subjectOk = expectedKeys.length > 0
        ? expectedKeys.every((k) => subjectMatches(fixture.expected.config[k], cfg[k]))
        : false; // required subject but fixture declares no config → can't verify
    }
  }
  return { top1, top3, keysOk, subjectOk, matched: !!match, ids };
}

export function summarizeScorecard(rows) {
  const n = rows.length;
  const rate = (fn) => rows.filter(fn).length / n;
  const subjectRows = rows.filter((r) => r.fixture.requireSubject);
  return {
    n,
    top1Rate: rate((r) => r.score.top1),
    top3Rate: rate((r) => r.score.top3),
    keysRate: rate((r) => r.score.keysOk),
    subjectRate: subjectRows.length ? subjectRows.filter((r) => r.score.subjectOk).length / subjectRows.length : null,
  };
}

export function printScorecard(rows, title) {
  console.log(`\n=== ${title} ===`);
  console.table(rows.map((r) => ({
    id: r.fixture.id,
    top1: r.score.top1 ? '✓' : '✗',
    top3: r.score.top3 ? '✓' : '✗',
    keys: r.score.keysOk ? '✓' : '✗',
    subject: r.fixture.requireSubject ? (r.score.subjectOk ? '✓' : '✗') : '—',
    returned: r.score.ids.slice(0, 3).join(', '),
  })));
  const s = summarizeScorecard(rows);
  const subj = s.subjectRate === null ? 'n/a' : `${(s.subjectRate * 100).toFixed(0)}%`;
  console.log(`top1 ${(s.top1Rate * 100).toFixed(0)}% · top3 ${(s.top3Rate * 100).toFixed(0)}% · keys ${(s.keysRate * 100).toFixed(0)}% · subject ${subj} (n=${rows.length})`);
}

// Schema constitution: every fixture must be well-formed against the real
// manifest — a malformed fixture is a build failure, not a score.
export function assertFixtureSchema(fixtures, defs) {
  const seen = new Set();
  for (const f of fixtures) {
    assert.ok(f.id && /^[a-z0-9-]+$/.test(f.id), `fixture id must be kebab-case: ${JSON.stringify(f?.id)}`);
    assert.ok(!seen.has(f.id), `duplicate fixture id: ${f.id}`);
    seen.add(f.id);
    assert.ok(typeof f.prompt === 'string' && f.prompt.length >= 10, `${f.id}: prompt too short`);
    const w = f.expected?.widgetType;
    assert.ok(w && defs.has(w), `${f.id}: unknown widgetType "${w}"`);
    const def = defs.get(w);
    const validKeys = new Set((def.configFields || []).map((cf) => cf.key));
    for (const key of Object.keys(f.expected.config || {})) {
      assert.ok(validKeys.has(key), `${f.id}: config key "${key}" is not a configField of "${w}"`);
    }
  }
}
