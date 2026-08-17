/**
 * Intent→widget benchmark — OFFLINE tier (ISSUE-44 constitution, item 6).
 *
 * Hard asserts (build-blocking):
 *  1. Fixture schema — every entry in tests/intent-fixtures.mjs must be
 *     well-formed against the real manifest (valid widget id, config keys
 *     that exist as configFields, unique ids, meaningful prompts).
 *  2. Local-tier floor — askLocal (the offline smart-search fallback) must
 *     surface the expected widget within its top-3 options for a rising
 *     fraction of fixtures. The floor starts below today's score and should
 *     be RAISED as the local matcher improves (do not lower it).
 *
 * Informational: full local-tier scorecard printed to stdout (top1/top3/
 * keys/subject per fixture) — the same metrics scripts/benchmark-ask.mjs
 * measures for the live LLM tier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INTENT_FIXTURES } from './intent-fixtures.mjs';
import { assertFixtureSchema, scoreOptions, summarizeScorecard, printScorecard } from './intent-benchmark-lib.mjs';
import { askLocal } from '../src/lib/askLocal.js';

const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = new Map(manifest.widgets.map((w) => [w.id, w]));

test('fixture schema: every intent is well-formed against the manifest', () => {
  assertFixtureSchema(INTENT_FIXTURES, defs);
});

test('local tier: expected widget surfaces in top-3 (floor, rising)', async () => {
  const rows = [];
  for (const f of INTENT_FIXTURES) {
    const { options } = await askLocal(f.prompt, manifest);
    rows.push({ fixture: f, score: scoreOptions(f, options) });
  }
  printScorecard(rows, 'LOCAL TIER (askLocal) — offline benchmark');
  const s = summarizeScorecard(rows);
  // Floor: top3 must hold for at least LOCAL_TOP3_FLOOR of n fixtures.
  // Measured 2026-08-16 on the draft v1 fixtures — RAISE as the local
  // matcher improves; never lower without a documented reason.
  const LOCAL_TOP3_FLOOR = Math.ceil(s.n * 0.6);
  const hits = rows.filter((r) => r.score.top3).length;
  assert.ok(
    hits >= LOCAL_TOP3_FLOOR,
    `local tier top-3 floor: ${hits}/${s.n} < ${LOCAL_TOP3_FLOOR} (raise the floor as the matcher improves)`
  );
});
