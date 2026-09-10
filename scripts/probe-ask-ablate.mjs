/**
 * Ask prompt ABLATION probe (2026-09-09) — how much of the system prompt is
 * load-bearing? Trims manifest fields the advisor arguably doesn't need and
 * scores the single-widget suite per trim. Motivation: the catalog grows with
 * every widget; the 16K-context fallback (llm-qwen3-14b) is the constraint.
 *
 *   WIKIBENTO_TEST=1 node scripts/probe-ask-ablate.mjs                # all ablations, 15 fixtures each
 *   WIKIBENTO_TEST=1 node scripts/probe-ask-ablate.mjs --14b          # against the fallback model
 *
 * Ablations:
 *   full        — shipped manifest (control)
 *   displayless — drop defaults + placeholders + hints (display-only fields)
 *   nodesc      — displayless + drop widget descriptions (aggressive)
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.WIKIBENTO_TEST = '1';

const args = process.argv.slice(2);
const MODEL = args.includes('--14b') ? 'llm-qwen3-14b' : 'llm-qwen36-27b';
const PACE_MS = parseInt(args[args.indexOf('--pace') + 1] || '300', 10);
const SSH_TARGET = process.env.TOOLFORGE_SSH || `${process.env.USER || 'alih'}@dev.toolforge.org`;
const ASK_UA = process.env.WIKIMEDIA_USER_AGENT || 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) ablation';
const UPSTREAM = `https://api.wikimedia.org/service/lw/inference/v1/models/${MODEL}/openai/v1/chat/completions`;

const { ASK_SYSTEM, askManual, ASK_RULES } = await import('../deploy/server.js');
const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const { INTENT_FIXTURES } = await import(pathToFileURL(resolve(process.cwd(), 'tests/intent-fixtures.mjs')).href);
const { scoreOptions, summarizeScorecard } = await import('../tests/intent-benchmark-lib.mjs');
const stripThink = (s) => String(s).replace(/\u232b[\s\S]*?<\/think>/g, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stripFields = (obj, keys) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k)) out[k] = v;
  return out;
};
const VARIANTS = [
  { name: 'full', manifest },
  {
    name: 'displayless',
    manifest: {
      ...manifest,
      widgets: manifest.widgets.map((w) => ({
        ...stripFields(w, ['defaults', 'icon', 'intensity', 'experimental']),
        configFields: (w.configFields || []).map((f) => stripFields(f, ['placeholder', 'hint'])),
      })),
    },
  },
  {
    name: 'nodesc',
    manifest: {
      ...manifest,
      widgets: manifest.widgets.map((w) => stripFields({ ...w, configFields: (w.configFields || []).map((f) => stripFields(f, ['placeholder', 'hint'])) }, ['description', 'defaults', 'icon', 'intensity', 'experimental'])),
    },
  },
];

function callLlm(system, user) {
  const payload = Buffer.from(JSON.stringify({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: 700, temperature: 0.3, response_format: { type: 'json_object' },
  }), 'utf8').toString('base64');
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const remote = `bash -s -- ${q(payload)} ${q(ASK_UA)} ${q(UPSTREAM)}`;
  const script = `b64="$1"; UA="$2"; URL="$3"\npayload=$(echo "$b64" | base64 -d)\ncurl -sS -A "$UA" -H 'Content-Type: application/json' -d "$payload" "$URL"\n`;
  const out = execFileSync('ssh', [SSH_TARGET, remote], { input: script, encoding: 'utf8', timeout: 90_000, maxBuffer: 10e6 });
  return stripThink(JSON.parse(out).choices?.[0]?.message?.content || '');
}

const summary = {};
for (const v of VARIANTS) {
  const system = ASK_SYSTEM(v.manifest) + askManual(v.manifest) + ASK_RULES;
  const rows = [];
  for (const f of INTENT_FIXTURES) {
    let options = [];
    let error = null;
    try {
      const parsed = JSON.parse(callLlm(system, f.prompt));
      options = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.options) ? parsed.options : [];
    } catch (e) {
      error = e.message.slice(0, 80);
    }
    const score = scoreOptions(f, options);
    rows.push({ fixture: f, score, error });
    process.stdout.write(`  [${v.name}] ${f.id} → top1:${score.top1 ? '✓' : '✗'} keys:${score.keysOk ? '✓' : '✗'} subject:${f.requireSubject ? (score.subjectOk ? '✓' : '✗') : '—'}${error ? ` ERR ${error}` : ''}\n`);
    await sleep(PACE_MS);
  }
  const s = summarizeScorecard(rows);
  const pct = (r) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`);
  summary[v.name] = { chars: system.length, top1: pct(s.top1Rate), keys: pct(s.keysRate), subject: pct(s.subjectRate) };
  console.log(`  → ${v.name}: ${system.length.toLocaleString()} chars · top1 ${summary[v.name].top1} · keys ${summary[v.name].keys} · subject ${summary[v.name].subject}\n`);
}
console.log('ABLATION COMPARISON');
for (const [name, s] of Object.entries(summary)) console.log(`  ${name.padEnd(12)} ${String(s.chars).padStart(7)} chars · top1 ${s.top1} · keys ${s.keys} · subject ${s.subject}`);
