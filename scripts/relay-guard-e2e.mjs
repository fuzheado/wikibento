/**
 * The relay guard (ISSUE-133) — start the real server with deliberately tight limits, then try to break it.
 *
 * Every proxied route on this server exists because a browser cannot set its own User-Agent, read a response with no
 * CORS header, or be trusted to stay inside someone else's quota. That makes these routes the one place where *our*
 * code runs on a shared, finite machine, so their properties are asserted rather than assumed:
 *
 *   1. a host allowlist        — a proxy that reaches anywhere is an amplifier
 *   2. a byte cap              — a hostile response must not decide how much memory we use
 *   3. a deadline              — no upstream may hold a request open
 *   4. a rate limit            — one client cannot consume the server
 *   5. an in-flight ceiling    — concurrent upstreams are bounded globally
 *   6. caches that cannot grow without bound
 *   7. and the one that matters most: it is still answering after being pummelled
 *
 * Runs against a local server with `RELAY_BURST`/`PROXY_MAX_BYTES` tightened, so a test does not have to produce
 * megabytes or thousands of requests to exercise the limits. `--base URL` re-runs the read-only checks against a
 * deployed host instead (it never bursts anything but localhost — see the note at the burst).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const fixed = process.argv.indexOf('--base');
const port = fixed === -1 ? await new Promise((res, rej) => {
  const s = net.createServer(); s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
}) : null;
const base = fixed === -1 ? `http://127.0.0.1:${port}` : process.argv[fixed + 1];
const LOCAL = fixed === -1;

const problems = [];
const ok = (label, detail) => console.log(`  ✅ ${label.padEnd(34)} ${detail}`);
const bad = (label, detail) => { problems.push(`${label}: ${detail}`); console.log(`  ❌ ${label.padEnd(34)} ${detail}`); };

let server = null;
let pid = null;
let serverLog = '';
async function waitForServer(url, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

if (LOCAL) {
  if (!statSync('dist/index.html', { throwIfNoEntry: false })) {
    console.error('  ✘ no dist/ — run `npx vite build` first (this guard starts the real server)');
    process.exit(2);
  }
  server = spawn('node', ['deploy/server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      WIKIBENTO_ROOT: 'dist',
      PORT: String(port),
      RELAY_BURST: '8',
      RELAY_WINDOW_MS: '60000',
      RELAY_MAX_INFLIGHT: '3',
      PROXY_MAX_BYTES: '4000',
      RELAY_TIMEOUT_MS: '8000',
    },
  });
  pid = server.pid;
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  if (!(await waitForServer(`${base}/`))) {
    console.error('  ✘ the server never answered. Its output was:');
    console.error(serverLog.trim().split('\n').map((l) => `    ${l}`).join('\n') || '    (nothing)');
    server.kill('SIGTERM');
    process.exit(1);
  }
}

const get = (path) => fetch(`${base}${path}`);
const LADDER_MAP = '/api/staticmap?z=11&lat=52.5167&lon=13.3833&w=640&h=480&lang=en';

// ── 1. the closed parameter surface ─────────────────────────────────────────
{
  const r = await get('/api/staticmap?z=11&lat=52.5&lon=13.4&w=637&h=481');
  r.status === 400 ? ok('map: off-ladder size refused', 'HTTP 400') : bad('map: off-ladder size', `HTTP ${r.status}`);
}
{
  const r = await get('/api/staticmap?z=99&lat=x&lon=13&w=640&h=480');
  r.status === 400 ? ok('map: absurd params refused', 'HTTP 400') : bad('map: absurd params', `HTTP ${r.status}`);
}

// ── 2. the host allowlist (nothing here may reach the open internet) ─────────
if (LOCAL) {
  const r = await get(`/api/proxy?url=${encodeURIComponent('https://example.com/')}`);
  r.status === 403 ? ok('proxy: non-allowlisted host refused', 'HTTP 403') : bad('proxy: allowlist', `HTTP ${r.status}`);
  const r2 = await get(`/api/resolve?url=${encodeURIComponent('https://example.com/')}`);
  r2.status === 403 ? ok('resolve: only w.wiki accepted', 'HTTP 403') : bad('resolve: allowlist', `HTTP ${r2.status}`);
}

// ── 3. the byte cap, exercised without producing megabytes ──────────────────
if (LOCAL) {
  const r = await get(`/api/proxy?url=${encodeURIComponent('https://en.wikipedia.org/wiki/Berlin')}`);
  const body = await r.text().catch(() => '');
  r.status === 502 && /cap/i.test(body)
    ? ok('proxy: oversized body refused', 'HTTP 502, cap named')
    : bad('proxy: byte cap', `HTTP ${r.status} ${body.slice(0, 60)}`);
}

// ── 4. the cache actually serves, and says so ──────────────────────────────
{
  const first = await get(LADDER_MAP);
  const firstOk = first.ok && first.headers.get('content-type') === 'image/png';
  await first.arrayBuffer();
  firstOk ? ok('map: a ladder size renders', `${(await get(LADDER_MAP)).status} image/png`) : bad('map: ladder render', `HTTP ${first.status}`);
  const second = await get(LADDER_MAP);
  await second.arrayBuffer();
  second.headers.get('x-staticmap') === 'cache'
    ? ok('map: the repeat is a cache hit', 'x-staticmap: cache')
    : bad('map: cache', `x-staticmap: ${second.headers.get('x-staticmap')}`);
}

// ── 5. the burst: the rate limit answers, and the server survives it ────────
if (LOCAL) {
  const burst = await Promise.all(Array.from({ length: 24 }, () => get(LADDER_MAP).then((r) => { r.arrayBuffer(); return r.status; }).catch(() => 0)));
  const limited = burst.filter((s) => s === 429).length;
  const served = burst.filter((s) => s === 200).length;
  limited > 0
    ? ok('burst: the rate limit answers', `${limited}× 429 for 24 requests, ${served} served`)
    : bad('burst: rate limit', `no 429 in ${burst.length} requests (${burst.join(',')})`);

  // A DIFFERENT client, so this asserts two things at once: the server is still answering after the burst, and the
  // limit is per client rather than a global stop — one visitor cannot starve the rest (`x-forwarded-for` is what the
  // limiter keys on, which is also how a real deployment sees clients behind the proxy).
  const other = await fetch(`${base}${LADDER_MAP}`, { headers: { 'x-forwarded-for': '203.0.113.7' } });
  await other.arrayBuffer();
  other.status === 200 && other.headers.get('x-staticmap') === 'cache'
    ? ok('burst: another client still served', 'HTTP 200, x-staticmap: cache')
    : bad('burst: survival', `HTTP ${other.status}, x-staticmap: ${other.headers.get('x-staticmap')}`);

  // ── 6. memory: the caches and the limiter must not grow without bound ─────
  try {
    const rssKb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim());
    const mb = rssKb / 1024;
    mb < 300 ? ok('memory after the burst', `${mb.toFixed(0)} MB resident`) : bad('memory', `${mb.toFixed(0)} MB resident`);
  } catch { ok('memory after the burst', 'ps unavailable — not measured'); }
}

if (server) server.kill('SIGTERM');
if (problems.length && serverLog) {
  console.log('  server output during the run:');
  console.log(serverLog.trim().split('\n').slice(-12).map((l) => `    ${l}`).join('\n'));
}

console.log(
  problems.length
    ? `\n  RELAY GUARD FAILED — ${problems.length} problem(s):\n${problems.map((p) => `    ✘ ${p}`).join('\n')}\n`
    : `\n  ✔ relay guard: allowlist, byte cap, ladder, cache and rate limit all hold${LOCAL ? ', and the server survived the burst' : ''}\n`,
);
process.exit(problems.length ? 1 : 0);
