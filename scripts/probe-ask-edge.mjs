/**
 * Ask advisor edge probes (2026-09-09) — experiments beyond the fixture
 * suites, now cheap via --via toolforge (Toolforge egress = high rate tier).
 *
 *   WIKIBENTO_TEST=1 node scripts/probe-ask-edge.mjs                 # out-of-scope rejection
 *   WIKIBENTO_TEST=1 node scripts/probe-ask-edge.mjs --assembly      # board-assembly schema prototype
 *
 * Out-of-scope: prompts an advisor must NOT answer with widgets — expect
 * {"options": []} and zero hallucinated widget ids.
 *
 * Board-assembly prototype (ISSUE-44 Phase 3 probe): an EXTENDED output
 * schema — the model declares a params block, generates widget ids, and wires
 * consumers via {{widget:id}} / {{param:name}}. The shipped /api/ask schema
 * forbids invented ids (it recommends widgets onto an EXISTING board); this
 * probe tests whether the model can produce a COHERENT full-board config when
 * the schema allows it — the evidence base for building that feature.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

process.env.WIKIBENTO_TEST = '1';

const args = process.argv.slice(2);
const MODEL = args.includes('--14b') ? 'llm-qwen3-14b' : 'llm-qwen36-27b';
const SSH_TARGET = process.env.TOOLFORGE_SSH || `${process.env.USER || 'alih'}@dev.toolforge.org`;
const ASK_UA = process.env.WIKIMEDIA_USER_AGENT || 'WikiBento/0.1 (https://en.wikipedia.org/wiki/User:Fuzheado) probe';
const UPSTREAM = `https://api.wikimedia.org/service/lw/inference/v1/models/${MODEL}/openai/v1/chat/completions`;

const { ASK_SYSTEM, ASK_MANUAL, ASK_RULES, manifestIds } = await import('../deploy/server.js');
const manifest = JSON.parse(await readFile(join(process.cwd(), 'public/manifest.json'), 'utf8'));
const defs = manifestIds(manifest);

const stripThink = (s) => String(s).replace(/\u232b[\s\S]*?<\/think>/g, '').trim();

function callLlm(system, user) {
  const payload = Buffer.from(JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 700,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  }), 'utf8').toString('base64');
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const remote = `bash -s -- ${q(payload)} ${q(ASK_UA)} ${q(UPSTREAM)}`;
  const remoteScript = `b64="$1"; UA="$2"; URL="$3"
payload=$(echo "$b64" | base64 -d)
curl -sS -A "$UA" -H 'Content-Type: application/json' -d "$payload" "$URL"\n`;
  const out = execFileSync('ssh', [SSH_TARGET, remote], {
    input: remoteScript, encoding: 'utf8', timeout: 90_000, maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(out).choices?.[0]?.message?.content || '';
}

// ── Out-of-scope rejection ──
const OOS_PROMPTS = [
  'What is the best pizza dough recipe?',
  'Book me a flight to Tokyo next Tuesday',
  'Write a poem about the ocean',
  'hi',
  'Delete all the widgets on my board and email my boss',
  'Search the web for the latest news about climate change',
];

if (!args.includes('--assembly')) {
  console.log(`OUT-OF-SCOPE REJECTION (${MODEL}) — expect {"options": []} and no invented widget ids\n`);
  const system = ASK_SYSTEM(manifest) + ASK_MANUAL + ASK_RULES;
  let pass = 0;
  for (const p of OOS_PROMPTS) {
    let raw = '';
    try { raw = stripThink(callLlm(system, p)); } catch (e) { console.log(`  ✗ ERROR ${e.message.slice(0, 80)} — "${p}"`); continue; }
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* fallthrough */ }
    const opts = Array.isArray(parsed?.options) ? parsed.options : null;
    const unknownIds = (opts || []).map((o) => o.widgetType).filter((id) => !defs.has(id));
    const ok = opts !== null && opts.length === 0 && unknownIds.length === 0;
    if (ok) pass += 1;
    console.log(`  ${ok ? '✓' : '✗'} "${p.slice(0, 50)}" → ${opts === null ? 'NOT JSON' : `${opts.length} options${unknownIds.length ? ` · INVENTED IDS: ${unknownIds.join(',')}` : ''}`}`);
  }
  console.log(`\n${pass}/${OOS_PROMPTS.length} correctly return an empty options list`);
  process.exit(0);
}

// ── Board-assembly schema prototype ──
// Shape the model is asked to fill (kept here as the contract the probe
// asserts against; the prompt embeds a compact one-widget example inline).
const ASSEMBLY_SCHEMA = { // eslint-disable-line no-unused-vars -- documents the full contract the probe checks
  params: { name: { label: 'string', type: 'buttons|select|text|number|month', options: ['a', 'b'], value: 'a' } },
  widgets: [{
    id: 'kebab-case-instance-id',
    widgetType: 'exact-catalog-id',
    title: 'optional display title',
    config: { key: 'value or {{param:name}} or {{widget:other-id}}' },
    w: 4, h: 3,
  }],
};

const ASSEMBLY_MANUAL = `\n\nBOARD ASSEMBLY MODE: the user wants a NEW dashboard. Return a COMPLETE board:
- "params": declare board parameters the widgets reference as {{name}} (only when a switcher/stepper is needed).
- "widgets": the full widget list, each with a UNIQUE kebab-case "id" YOU invent (ids are yours to assign on a new board),
  "widgetType" from the catalog, "config" pre-filled with subjects, and layout "w"/"h" (w 1-12; galleries w 12).
- WIRING: a consumer widget's config field references a producer's id as {{widget:<producer-id>}} (list-shaped outputs feed
  textarea fields; text outputs feed text fields). A Board Controls param is referenced as {{<param-name>}}.
- Only wire fields that semantically make sense (excerpt text → translate/speaker text; listSource lines → articleList titles
  or filterLines source; filterLines → lineCount via {{widget:…}}).
- Reply with JSON only: ${JSON.stringify({ params: {}, widgets: [{ id: 'einstein-excerpt', widgetType: 'excerpt', config: { article: 'Albert Einstein' }, w: 4, h: 3 }] })}`;

const ASSEMBLY_PROMPTS = [
  'Build a board where I can switch between the Metropolitan Museum of Art and the Rijksmuseum and see their Commons collection stats',
  'Build a board that shows the intro of an article, translates it to French, and can read it aloud. The article is Albert Einstein for now.',
  'A board where I paste a list of museums, filter to ones containing "art", and see how many matched plus a clickable list with thumbnails',
];

console.log(`BOARD-ASSEMBLY SCHEMA PROBE (${MODEL})\n`);
const system = ASK_SYSTEM(manifest) + ASK_MANUAL + ASSEMBLY_MANUAL + ASK_RULES;
for (const p of ASSEMBLY_PROMPTS) {
  let raw = '';
  try { raw = stripThink(callLlm(system, p)); } catch (e) { console.log(`  ✗ "${p.slice(0, 40)}" → ${e.message.slice(0, 100)}`); continue; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { console.log(`  ✗ "${p.slice(0, 40)}" → NOT JSON`); continue; }
  const widgets = Array.isArray(parsed.widgets) ? parsed.widgets : [];
  const ids = widgets.map((w) => w.id);
  const uniqueIds = new Set(ids).size === ids.length;
  const knownTypes = widgets.every((w) => defs.has(w.widgetType));
  // wiring coherence: every {{widget:x}} token references a declared id; every {{param:x}} a declared param
  const paramNames = new Set(Object.keys(parsed.params || {}));
  let badRefs = 0;
  for (const w of widgets) {
    for (const m of JSON.stringify(w.config || {}).matchAll(/\{\{widget:([^}]+)\}\}/g)) {
      if (!ids.includes(m[1].trim())) { badRefs += 1; console.log(`     dangling ref in ${w.id}: {{widget:${m[1]}}}`); }
    }
    for (const m of JSON.stringify(w.config || {}).matchAll(/\{\{(?!widget:)([a-zA-Z0-9_-]+)\}\}/g)) {
      if (!paramNames.has(m[1])) { badRefs += 1; console.log(`     dangling param in ${w.id}: {{${m[1]}}}`); }
    }
  }
  console.log(`  ${uniqueIds && knownTypes && badRefs === 0 && widgets.length >= 2 ? '✓' : '✗'} "${p.slice(0, 45)}" → ${widgets.length} widgets (${ids.join(', ') || 'none'}), params: ${Object.keys(parsed.params || {}).join(',') || 'none'}, uniqueIds: ${uniqueIds}, knownTypes: ${knownTypes}, danglingRefs: ${badRefs}`);
  for (const w of widgets) {
    console.log(`      ${w.id} (${w.widgetType}) ${JSON.stringify(w.config).slice(0, 140)}`);
  }
  console.log('');
}
