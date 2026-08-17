/**
 * Intent→widget benchmark — LIVE LLM tier (ISSUE-44 constitution, item 6).
 *
 * Scores the exact /api/ask prompt (ASK_SYSTEM + ASK_RULES from
 * deploy/server.js — the same prompt the deployed relay sends) against the
 * ground-truth fixtures in tests/intent-fixtures.mjs, calling the LiftWing
 * chat-completions endpoint directly (anonymous, no key — same as the
 * server's relay). Every output is run through the same validateOptions()
 * sanitizer the relay applies, so the score measures what the UI would
 * actually offer.
 *
 * Usage:
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs            # all fixtures
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --limit 5  # first 5
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --model llm-qwen3-14b
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask.mjs --gate 0.8 --out bench.json
 *     # exit 1 unless top-3 rate ≥ 0.8; write machine-readable JSON
 *
 * Etiquette: paces requests (--pace ms, default 1500) — the anonymous
 * LiftWing tier is limited to ~100 req/h per client. This is a manual
 * benchmark, NOT part of `npm test` (live dependency, no SLA).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.WIKIBENTO_TEST = '1'; // must precede the server.js import (no listen)

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(argVal('--limit', '0'), 10) || 0;
const MODEL = argVal('--model', 'llm-qwen36-27b');
const PACE_MS = parseInt(argVal('--pace', '1500'), 10) || 1500;
const GATE = parseFloat(argVal('--gate', '0'));
const OUT = argVal('--out', '');
const FIXTURE_PATH = argVal('--fixtures', './tests/intent-fixtures.mjs');
const ASK_UA = 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) benchmark';
const UPSTREAM = `https://api.wikimedia.org/service/lw/inference/v1/models/${MODEL}/openai/v1/chat/completions`;

const { ASK_SYSTEM, ASK_RULES, validateOptions, manifestIds } = await import('../deploy/server.js');
const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = manifestIds(manifest);
const { INTENT_FIXTURES } = await import(pathToFileURL(resolve(process.cwd(), FIXTURE_PATH)).href);
const { scoreOptions, printScorecard, summarizeScorecard } = await import('../tests/intent-benchmark-lib.mjs');

const stripThink = (s) => String(s).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixtures = LIMIT ? INTENT_FIXTURES.slice(0, LIMIT) : INTENT_FIXTURES;
const system = ASK_SYSTEM(manifest) + ASK_RULES;
console.log(`Benchmark: ${MODEL} · ${fixtures.length} fixtures · system prompt ${system.length.toLocaleString()} chars`);

const callLlm = async (user) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ASK_UA },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        max_tokens: 700,
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
    const data = await r.json();
    return stripThink(data?.choices?.[0]?.message?.content || '');
  } finally {
    clearTimeout(timer);
  }
};

const rows = [];
for (let i = 0; i < fixtures.length; i++) {
  const f = fixtures[i];
  process.stdout.write(`[${i + 1}/${fixtures.length}] ${f.id} … `);
  let options = [];
  let error = null;
  try {
    const content = await callLlm(f.prompt);
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* non-JSON → no options */ }
    options = validateOptions(parsed, defs);
  } catch (e) {
    error = e.message;
  }
  const score = scoreOptions(f, options);
  rows.push({ fixture: f, score, error, options });
  process.stdout.write(`${error ? `ERROR ${error}` : `top1:${score.top1 ? '✓' : '✗'} top3:${score.top3 ? '✓' : '✗'} → ${score.ids.slice(0, 3).join(', ') || '(none)'}`}\n`);
  if (i < fixtures.length - 1) await sleep(PACE_MS);
}

printScorecard(rows, `LIVE LLM TIER (${MODEL}) — benchmark`);
const s = summarizeScorecard(rows);
if (OUT) await writeFile(OUT, JSON.stringify({ model: MODEL, at: new Date().toISOString(), fixtures: rows.map((r) => {
  const matched = r.options.find((o) => o.widgetType === r.fixture.expected.widgetType) || null;
  return { id: r.fixture.id, prompt: r.fixture.prompt, expected: r.fixture.expected, ...r.score, matchedOption: matched, error: r.error || null };
}), summary: s }, null, 2));

if (GATE > 0) {
  const pass = s.top3Rate >= GATE;
  console.log(`\nGATE top3 ≥ ${GATE}: ${pass ? 'PASS' : 'FAIL'} (${(s.top3Rate * 100).toFixed(0)}%)`);
  process.exit(pass ? 0 : 1);
}
