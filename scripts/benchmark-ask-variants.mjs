/**
 * Ask advisor prompt variant benchmark — compares different system prompt
 * configurations against the same ground-truth fixtures.
 *
 * Usage:
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --limit 5
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --model llm-qwen3-14b
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --out 2026-09-10-run.json
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --gate 0.8
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --via toolforge   # bypass the public 100 req/h cap
 *   WIKIBENTO_TEST=1 node scripts/benchmark-ask-variants.mjs --temp 0.0        # determinism check
 *
 * Variants tested:
 *   1. baseline   — current prompt (manifest + ASK_MANUAL + ASK_RULES)
 *   2. compact    — current prompt + compact wiring reference (from BOARD-COMPOSITION.md)
 *   3. expanded   — current prompt + expanded ASK_MANUAL with more wiring patterns
 *
 * Each variant is scored against the same fixtures and results are compared.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.WIKIBENTO_TEST = '1';

const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(argVal('--limit', '0'), 10) || 0;
const MODEL = argVal('--model', 'llm-qwen36-27b');
const PACE_MS = parseInt(argVal('--pace', '1500'), 10) || 1500;
const TEMP = parseFloat(argVal('--temp', '0.3'));
const OUT = argVal('--out', '');
// Results land in bench/results/ by convention — a bare --out filename is
// joined with that directory (an absolute or slash-bearing path is honored).
const OUT_PATH = OUT && !OUT.includes('/') ? join('bench/results', OUT) : OUT;
const ONLY = argVal('--only', ''); // comma-separated fixture ids (diagnostic re-runs)
const BOARDS = args.includes('--boards'); // board-construction fixtures (chain scoring)
const ONLY_VARIANTS = argVal('--variants', ''); // comma list; e.g. --variants baseline (rate-limit-friendly)
const FIXTURE_PATH = argVal('--fixtures', './tests/intent-fixtures.mjs');
const ASK_UA = process.env.WIKIMEDIA_USER_AGENT || 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) benchmark';
const VIA = argVal('--via', 'direct'); // direct (local IP, 100 req/h cap) | toolforge (high tier, ~unlimited)
const SSH_TARGET = process.env.TOOLFORGE_SSH || `${process.env.USER || 'alih'}@dev.toolforge.org`;
const UPSTREAM = `https://api.wikimedia.org/service/lw/inference/v1/models/${MODEL}/openai/v1/chat/completions`;

process.env.WIKIBENTO_TEST = '1';

const { ASK_SYSTEM, ASK_MANUAL, ASK_RULES, validateOptions, manifestIds } = await import('../deploy/server.js');
const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = manifestIds(manifest);
const { INTENT_FIXTURES } = await import(pathToFileURL(resolve(process.cwd(), FIXTURE_PATH)).href);
const { BOARD_FIXTURES } = await import('../tests/board-fixtures.mjs');
const { scoreOptions, summarizeScorecard, scoreChainOptions, summarizeChain, assertBoardFixtureSchema } = await import('../tests/intent-benchmark-lib.mjs');

const stripThink = (s) => String(s).replace(/\u232b[\s\S]*?<\/think>/g, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixtures = LIMIT ? (BOARDS ? BOARD_FIXTURES : INTENT_FIXTURES).slice(0, LIMIT) : (BOARDS ? BOARD_FIXTURES : INTENT_FIXTURES);
const onlySet = ONLY ? new Set(ONLY.split(',').map((s) => s.trim())) : null;
const selected = onlySet ? fixtures.filter((f) => onlySet.has(f.id)) : fixtures;

// Board fixtures are schema-checked against the real manifest once, up front.
if (BOARDS) assertBoardFixtureSchema(fixtures, defs);

// LiftWing-respectful fetch: one 429 retry honoring Retry-After (min 10 s).
// --via toolforge sends the SAME request from the Toolforge bastion
// (higher rate tier — see the wikimedia-ml-services skill); payload is
// base64-encoded so SSH/shell quoting can never break the JSON.
function callUpstreamToolforge(bodyObj) {
  const payload = Buffer.from(JSON.stringify(bodyObj), 'utf8').toString('base64');
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const remote = `bash -s -- ${q(payload)} ${q(ASK_UA)} ${q(UPSTREAM)}`;
  const remoteScript = `b64="$1"; UA="$2"; URL="$3"
payload=$(echo "$b64" | base64 -d)
curl -sS -w '\n[HTTP %{http_code}]\n' -A "$UA" -H 'Content-Type: application/json' -d "$payload" "$URL"\n`;
  const out = execFileSync('ssh', [SSH_TARGET, remote], {
    input: remoteScript,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const m = out.match(/\[HTTP (\d+)\]\s*$/);
  const body = out.replace(/\n\[HTTP \d+\]\s*$/, '');
  return { status: m ? parseInt(m[1], 10) : 0, body };
}

async function callLlmJson(system, user) {
  const bodyObj = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 700,
    temperature: TEMP,
    response_format: { type: 'json_object' },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (VIA === 'toolforge') {
      try {
        const { status, body } = callUpstreamToolforge(bodyObj);
        if (status === 200) return { raw: JSON.parse(body).choices?.[0]?.message?.content || '' };
        return { error: `HTTP ${status}: ${body.slice(0, 120)}` };
      } catch (e) {
        return { error: `toolforge: ${e.message.slice(0, 140)}` };
      }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': ASK_UA },
        body: JSON.stringify(bodyObj),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (r.status === 429 && attempt === 0) {
        const ra = parseInt(r.headers.get('retry-after'), 10);
        const waitMs = (Number.isFinite(ra) ? Math.min(ra, 60) : 15) * 1000;
        console.log(`    … 429 — honoring Retry-After, waiting ${Math.round(waitMs / 1000)}s`);
        await sleep(waitMs);
        continue;
      }
      if (!r.ok) {
        const t = await r.text();
        return { error: `HTTP ${r.status}: ${t.slice(0, 120)}` };
      }
      const data = await r.json();
      return { raw: data.choices?.[0]?.message?.content || '' };
    } catch (e) {
      clearTimeout(timer);
      return { error: e.message.slice(0, 150) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: '429 (exhausted retries)' };
}

// ── Variant 1: baseline (current prompt) ──
function systemBaseline(m) {
  return ASK_SYSTEM(m) + ASK_MANUAL + ASK_RULES;
}

// ── Variant 2: compact wiring reference ──
// Distilled from BOARD-COMPOSITION.md — the key wiring patterns in ~500 tokens
const COMPACT_REFERENCE = `
WIRING PATTERNS (how widgets connect):

1. PARAMS (shared inputs): declare in the board's "params" block. Any widget config field can reference a param as {{paramName}}. Board Controls widgets render the UI.

2. EMITTER → CONSUMER (dataflow):
   - Emitters (produce output): excerpt (text), listSource (lines), filterLines (filtered lines), lineCount (number), echo (pass-through).
   - Consumers receive output via: (a) "source" config field (structured), or (b) {{widget:<id>}} interpolation in any text field.
   - Consumers re-fetch when the source value changes. Identical re-emits are no-ops.
   - A fetching widget never sends unresolved {{widget:id}} upstream — it shows "Waiting for a reference."

3. COMMON CHAINS:
   - Article deep-dive: excerpt → translate + speaker + gallery + quality + edithistory
   - Curated list: listSource → filterLines → articleList/fileGallery → excerpt → translate + speaker
   - Templated collection: boardControls (params) → CIM family + GLAM + gallery
   - Annotated listening: excerpt → translate + speaker + mediaPlayer + gallery

4. BOARDS are JSON configs with version, params, widgets[], layout[]. Widgets reference each other via {{param}} and {{widget:<id>}}.`;

function systemCompact(m) {
  return ASK_SYSTEM(m) + ASK_MANUAL + COMPACT_REFERENCE + ASK_RULES;
}

// ── Variant 3: expanded ASK_MANUAL ──
// More detailed wiring patterns than the current ASK_MANUAL
const EXPANDED_MANUAL = `
HOW WIKIBENTO WIDGETS CONNECT (dataflow) — expanded:

PARAMS (shared inputs):
- Declared in the board's top-level "params" block: { name: { label, type, options, value } }
- Types: buttons (click to set), select (dropdown), text (free input), number (with min/max/step), month (date stepper)
- Reference anywhere in widget configs: {{name}}
- Board Controls widget renders the UI for params
- Per-card param scoping: a Board Controls card can render a subset of params via the "show" field

INTERPOLATION ({{widget:<id>}}):
- Any string config field can embed another widget's output as {{widget:<id>}}
- Arrays join with newlines (so a Text List's lines can feed an Article List's titles field)
- The producer must emit; consumers re-fetch when the source value changes
- A widget that fetches never sends unresolved {{widget:id}} upstream — it shows "Waiting for a reference"

SOURCE FIELDS (structured consumption):
- Widgets with a "source" config field (type: source) consume another widget's output
- The source picker shows all emitting widgets on the board
- Output arrives as opts.sourceOutput to transform/fetch
- Consumers: filterLines, lineCount, echo

EMITTERS (widgets that produce output):
- excerpt → emits the article's first paragraph (kind: extract)
- listSource → emits its pasted lines as an array (kind: lines)
- filterLines → emits its filtered lines (kind: lines)
- lineCount → emits a number (kind: count)
- echo → passes a value through (kind: value)

MULTI-STEP WIRING:
- "Take article X's text, filter it, translate it to French": recommend excerpt → filterLines → translate
  - Connect via {{widget:<id>}} interpolation in the translate's text field
  - Or use the source picker on filterLines to consume from excerpt
- "Show me images from a category, then pick the most-viewed one":
  - cimSnapshot → cimTopFiles → fileUsage (for cross-wiki usage)
- "Compare two institutions":
  - boardControls (buttons param) → CIM snapshot + trend + top files for each institution

NODE KINDS:
- source: fetches from Wikimedia APIs (pageviews, excerpt, categorySize, etc.)
- controller: writes params (boardControls)
- transformer: consumes one feed, emits a filtered/transformed feed (filterLines)
- reducer: feed → one count/stat (lineCount)
- display: renders static/embedded content (markdown, wikiPage)
- effector: speaks text aloud (speaker)
- ai: machine translation (translate)

WIRING ANTI-PATTERNS:
- Don't use {{param}} in a widget that doesn't support it (only text/textarea/select fields)
- Don't emit article titles without labeling — use excerpt as the emitter
- Don't forget refreshSeconds on fetch widgets (≥ 30s)
- Don't use source on a non-emitting widget
- Don't overlap widget ids`;

function systemExpanded(m) {
  return ASK_SYSTEM(m) + EXPANDED_MANUAL + ASK_RULES;
}

const VARIANTS = [
  { name: 'baseline', system: systemBaseline },
  { name: 'compact', system: systemCompact },
  { name: 'expanded', system: systemExpanded },
].filter((v) => !ONLY_VARIANTS || ONLY_VARIANTS.split(',').map((s) => s.trim()).includes(v.name));

const allResults = {};

for (const variant of VARIANTS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`VARIANT: ${variant.name}`);
  console.log(`${'='.repeat(60)}`);

  const system = variant.system(manifest);
  console.log(`System prompt: ${system.length.toLocaleString()} chars`);

  const results = [];
  const run = onlySet ? selected : fixtures;
  for (let i = 0; i < run.length; i++) {
    const fixture = run[i];

    const { raw, error } = await callLlmJson(system, fixture.prompt);
    if (error) {
      console.log(`  [${i + 1}/${run.length}] ${fixture.id} → ERROR ${error.slice(0, 100)}`);
      results.push({ fixture, score: BOARDS ? scoreChainOptions(fixture, []) : scoreOptions(fixture, []), error, options: [] });
      await sleep(PACE_MS);
      continue;
    }

    const cleaned = stripThink(raw);
    let options;
    try {
      options = JSON.parse(cleaned);
    } catch {
      console.log(`  [${i + 1}/${run.length}] ${fixture.id} → PARSE ERROR`);
      results.push({ fixture, score: BOARDS ? scoreChainOptions(fixture, []) : scoreOptions(fixture, []), error: 'parse error', raw: raw.slice(0, 200), options: [] });
      await sleep(PACE_MS);
      continue;
    }

    const validated = validateOptions(options, defs);
    const score = BOARDS ? scoreChainOptions(fixture, validated) : scoreOptions(fixture, validated);
    results.push({ fixture, score, error: null, options: validated });

    const returnedIds = validated.map((o) => o.widgetType).join(', ') || '(none)';
    if (BOARDS) {
      console.log(
        `  [${i + 1}/${run.length}] ${fixture.id} → chain:${score.chainOk ? '✓' : '✗'} keys:${score.keysOk ? '✓' : '✗'} subject:${fixture.requireSubject ? (score.subjectOk ? '✓' : '✗') : '—'} → ${returnedIds}`,
      );
    } else {
      console.log(
        `  [${i + 1}/${run.length}] ${fixture.id} → top1:${score.top1 ? '✓' : '✗'} top3:${score.top3 ? '✓' : '✗'} keys:${score.keysOk ? '✓' : '✗'} subject:${fixture.requireSubject ? (score.subjectOk ? '✓' : '✗') : '—'} → ${returnedIds}`,
      );
    }

    await sleep(PACE_MS);
  }

  const summary = BOARDS ? summarizeChain(results) : summarizeScorecard(results);
  const pct = (rate) => (rate === null ? 'n/a' : `${Math.round(rate * 100)}%`);
  const metricsLine = BOARDS
    ? `chain ${pct(summary.chainRate)} · keys ${pct(summary.keysRate)} · subject ${pct(summary.subjectRate)}`
    : `top1 ${pct(summary.top1Rate)} · top3 ${pct(summary.top3Rate)} · keys ${pct(summary.keysRate)} · subject ${pct(summary.subjectRate)}`;
  console.log(`\n  ${variant.name} summary: ${metricsLine}`);

  // Informational: did the model volunteer {{widget:…}} wiring tokens anyway?
  const wiringTokens = results.reduce((n, r) => n + (r.options || []).filter((o) => JSON.stringify(o.config || {}).includes('{{widget:')).length, 0);
  if (BOARDS) console.log(`  wiring tokens volunteered: ${wiringTokens} (informational — ASK_MANUAL says never invent ids)`);

  allResults[variant.name] = {
    systemPromptLength: system.length,
    results: results.map((r) => ({
      id: r.fixture.id,
      prompt: r.fixture.prompt,
      expected: r.fixture.expected,
      ...r.score,
      matchedOption: (r.options || []).find((o) => o.widgetType === (BOARDS ? r.score.ids[0] : r.fixture.expected.widgetType)) || null,
      error: r.error,
      returned: (r.options || []).map((o) => o.widgetType).join(', ') || '(none)',
    })),
    summary,
  };
}

// ── Comparison ──
console.log(`\n${'='.repeat(60)}`);
console.log('COMPARISON');
console.log(`${'='.repeat(60)}`);

const pct = (rate) => (rate === null ? 'n/a' : `${Math.round(rate * 100)}%`);
const headers = BOARDS ? ['Variant', 'System Chars', 'chain', 'keys', 'subject'] : ['Variant', 'System Chars', 'top1', 'top3', 'keys', 'subject'];
const rows = VARIANTS.map((v) => {
  const r = allResults[v.name];
  return BOARDS
    ? [v.name, r.systemPromptLength.toLocaleString(), pct(r.summary.chainRate), pct(r.summary.keysRate), pct(r.summary.subjectRate)]
    : [v.name, r.systemPromptLength.toLocaleString(), pct(r.summary.top1Rate), pct(r.summary.top3Rate), pct(r.summary.keysRate), pct(r.summary.subjectRate)];
});

// Simple table
const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmtRow = (row) => row.map((cell, i) => String(cell).padEnd(colWidths[i])).join(' | ');
console.log(fmtRow(headers));
console.log(headers.map((_, i) => '-'.repeat(colWidths[i])).join('-+-'));
rows.forEach((row) => console.log(fmtRow(row)));

// Save
if (OUT_PATH) {
  const outPath = resolve(process.cwd(), OUT_PATH);
  await writeFile(outPath, JSON.stringify(allResults, null, 2));
  console.log(`\nSaved to ${outPath}`);
}
