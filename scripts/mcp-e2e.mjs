#!/usr/bin/env node
/**
 * The MCP endpoint, spoken to — `scripts/mcp-e2e.mjs`.
 *
 * The Model Context Protocol is a *protocol*, so the only useful check is one that speaks it: start the real server and
 * drive `/mcp` the way a client does — `initialize`, `notifications/initialized`, `tools/list`, then a `tools/call` for
 * each of the four tools, with the refusals a client will hit (an unknown method, an unknown tool, a GET, an oversized
 * body, a bad Origin). Nothing here reaches the network beyond localhost: the tools read this deployment's own manifest,
 * guide and validator.
 *
 * Why it exists in this repository's style: an endpoint nobody drives is an endpoint nobody knows is broken. The
 * `/api/validate` checks in `scripts/relay-guard-e2e.mjs` were ran the first time and found a rate-limit budget that
 * was too small for its own test — this file exists so the MCP surface gets the same treatment before a reader
 * connects Claude to it.
 *
 * Usage: npm test (it runs there, after the build) · or `node scripts/mcp-e2e.mjs --base https://wikibento.toolforge.org`
 * for the read-only half against a deployment.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import net from 'node:net';

const fixed = process.argv.indexOf('--base');
const LOCAL = fixed === -1;
const port = LOCAL ? await new Promise((res, rej) => {
  const s = net.createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
}) : null;
const base = LOCAL ? `http://127.0.0.1:${port}` : process.argv[fixed + 1];

const problems = [];
const ok = (label, detail) => console.log(`  ✅ ${label.padEnd(34)} ${detail}`);
const bad = (label, detail) => { problems.push(`${label}: ${detail}`); console.log(`  ❌ ${label.padEnd(34)} ${detail}`); };

let server = null;
let serverLog = '';
if (LOCAL) {
  if (!statSync('dist/index.html', { throwIfNoEntry: false })) {
    console.error('  ✘ no dist/ — run `npx vite build` first (this check starts the real server)');
    process.exit(2);
  }
  server = spawn('node', ['deploy/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WIKIBENTO_ROOT: 'dist', PORT: String(port), MCP_PER_MIN: '40', MCP_MAX_BYTES: '4000' },
  });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${base}/`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const rpc = (method, params, { id = 1, origin } = {}) => fetch(`${base}/mcp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
});
const callTool = async (name, args = {}) => {
  const r = await rpc('tools/call', { name, arguments: args });
  const body = await r.json().catch(() => null);
  const text = body?.result?.content?.[0]?.text || '';
  return { status: r.status, body, text, structured: body?.result?.structuredContent };
};

// ── the handshake ────────────────────────────────────────────────────────────────────────────────────────────────
{
  const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-e2e', version: '1' } });
  const b = await r.json().catch(() => null);
  const res = b?.result;
  if (r.status !== 200 || !res?.protocolVersion) bad('initialize', `HTTP ${r.status} ${JSON.stringify(b).slice(0, 90)}`);
  else if (!res.capabilities?.tools) bad('initialize: capabilities', JSON.stringify(res.capabilities));
  else if (res.serverInfo?.name !== 'wikibento') bad('initialize: serverInfo', JSON.stringify(res.serverInfo));
  else if (!res.instructions || res.instructions.length > 512) bad('initialize: instructions', `${(res.instructions || '').length} chars (ChatGPT reads the first 512 and nothing after)`);
  else ok('initialize', `${res.protocolVersion} · instructions ${res.instructions.length} chars`);

  // A client sends its own revision; an unknown one gets ours (the spec lets the client decide whether to continue).
  const older = await rpc('initialize', { protocolVersion: '2024-11-05' }, { id: 2 });
  const ob = await older.json().catch(() => null);
  ob?.result?.protocolVersion === '2024-11-05'
    ? ok('initialize: echoes a known revision', ob.result.protocolVersion)
    : bad('initialize: revision negotiation', JSON.stringify(ob?.result?.protocolVersion));

  // A notification has no id, and gets 202 with no body — not a JSON-RPC response.
  const note = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  note.status === 202 ? ok('notifications/initialized', 'HTTP 202, no body') : bad('notification', `HTTP ${note.status}`);
}

// ── the tool list ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const r = await rpc('tools/list', {}, { id: 3 });
  const b = await r.json().catch(() => null);
  const tools = b?.result?.tools || [];
  const names = tools.map((t) => t.name).sort();
  const want = ['get_board_guide', 'get_catalog', 'make_board_url', 'validate_board'];
  if (JSON.stringify(names) !== JSON.stringify(want)) bad('tools/list', `got ${names.join(', ')}`);
  else if (!tools.every((t) => t.description && t.inputSchema?.type === 'object')) bad('tools/list: schemas', 'a tool is missing a description or an object schema');
  else ok('tools/list', `${tools.length} tools: ${names.join(', ')}`);
}

// ── the tools themselves ────────────────────────────────────────────────────────────────────────────────────────
const goodBoard = JSON.stringify({
  version: 1,
  params: { article: { label: 'Article', type: 'buttons', options: ['Albert Einstein'], value: 'Albert Einstein' } },
  widgets: [
    { id: 'lede', widgetType: 'excerpt', config: { article: '{{article}}' } },
    { id: 'controls', widgetType: 'boardControls', config: { title: 'Choose' } },
  ],
  layout: [{ i: 'lede', x: 0, y: 0, w: 8, h: 4 }, { i: 'controls', x: 0, y: 4, w: 12, h: 3 }],
});
{
  const cat = await callTool('get_catalog');
  let parsed = null;
  try { parsed = JSON.parse(cat.text); } catch { /* reported below */ }
  parsed?.widgets?.length === 42
    ? ok('get_catalog', `${parsed.widgets.length} widget types, ${(cat.text.length / 1024).toFixed(0)} KB`)
    : bad('get_catalog', `no manifest: ${cat.text.slice(0, 80)}`);

  const envelope = await callTool('get_board_guide', { section: 'envelope' });
  const all = await callTool('get_board_guide');
  envelope.text.includes('layout') && envelope.text.includes('widgetType') && envelope.text.length < all.text.length
    ? ok('get_board_guide(section)', `§1 ${(envelope.text.length / 1024).toFixed(1)} KB of ${(all.text.length / 1024).toFixed(0)} KB`)
    : bad('get_board_guide(section)', `envelope ${envelope.text.length} chars, all ${all.text.length}`);

  const badSection = await callTool('get_board_guide', { section: 'nonsense' });
  badSection.body?.error?.code === -32602
    ? ok('get_board_guide(bad section)', 'JSON-RPC -32602, naming the alternatives')
    : bad('get_board_guide(bad section)', JSON.stringify(badSection.body).slice(0, 80));

  const good = await callTool('validate_board', { board: goodBoard });
  good.structured?.verdict === 'clean' && good.structured.counts.widgets === 2
    ? ok('validate_board: a good board', `${good.structured.verdict} · ${good.structured.counts.widgets} widgets`)
    : bad('validate_board: a good board', good.text.slice(0, 90));

  const broken = await callTool('validate_board', { board: { version: 1, widgets: [{ id: 's', widgetType: 'speaker', config: { text: '{{widget:nope}}' } }], layout: [{ i: 's', x: 0, y: 0, w: 4, h: 3 }] } });
  broken.structured?.verdict === 'unusable' && /nope/.test(broken.text)
    ? ok('validate_board: a broken board', 'unusable, and the message names the missing card')
    : bad('validate_board: a broken board', broken.text.slice(0, 90));

  const link = await callTool('make_board_url', { board: goodBoard });
  const s = link.structured;
  s?.shareUrl?.includes('#/d/') && s?.compressedShareUrl?.includes('#/z/') && s.qrFits === true && s.qrMaxChars === 1500
    ? ok('make_board_url', `#/d/ ${s.shareUrl.length} chars · #/z/ ${s.compressedShareUrl.length} · QR fits`)
    : bad('make_board_url', JSON.stringify(s).slice(0, 120));

  // A board that cannot load must not be handed back as a link — the reader would just see the failure.
  const linkBad = await callTool('make_board_url', { board: { widgets: [{ id: 'x', widgetType: 'nope' }], layout: [] } });
  /does not import yet/.test(linkBad.text)
    ? ok('make_board_url: refuses a broken board', 'says why instead of producing a link')
    : bad('make_board_url: broken board', linkBad.text.slice(0, 90));
}

// ── the refusals ────────────────────────────────────────────────────────────────────────────────────────────────
{
  const unknownMethod = await rpc('resources/list', {}, { id: 9 });
  const um = await unknownMethod.json().catch(() => null);
  um?.error?.code === -32601 ? ok('unknown method', '-32601 method not found') : bad('unknown method', JSON.stringify(um).slice(0, 80));

  const unknownTool = await callTool('make_me_a_sandwich');
  unknownTool.body?.error?.code === -32602
    ? ok('unknown tool', '-32602, listing the four that exist')
    : bad('unknown tool', JSON.stringify(unknownTool.body).slice(0, 80));

  const get = await fetch(`${base}/mcp`);
  get.status === 405 ? ok('GET /mcp', 'HTTP 405 (stateless: no stream, no session)') : bad('GET /mcp', `HTTP ${get.status}`);

  if (LOCAL) {
    const badOrigin = await rpc('tools/list', {}, { id: 10, origin: 'https://evil.example' });
    badOrigin.status === 403 ? ok('Origin check', 'HTTP 403 for a foreign Origin') : bad('Origin check', `HTTP ${badOrigin.status}`);

    const huge = await fetch(`${base}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'validate_board', arguments: { board: 'x'.repeat(6000) } } }),
    });
    huge.status === 413 ? ok('oversized body', 'HTTP 413, the cap named') : bad('oversized body', `HTTP ${huge.status}`);
  }
}

if (server) server.kill('SIGTERM');
console.log(problems.length
  ? `\n  ✘ MCP FAILED — ${problems.length} problem(s):\n${problems.map((p) => `    ✘ ${p}`).join('\n')}`
  : '\n  ✔ MCP: handshake, four tools, and every refusal behave as a client expects');
process.exit(problems.length ? 1 : 0);
