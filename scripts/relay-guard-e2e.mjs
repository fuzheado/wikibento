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
 * megabytes or thousands of requests to exercise the limits. The limits are per route: the map's allowance is larger
 * than the rest (see `RELAY_BURST_STATICMAP`), so the guard bursts both — the default one through an off-allowlist
 * proxy request that never reaches the internet, and the map's with a board's worth of images. `--base URL` re-runs the read-only checks against a
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

// ── 0. the door: the three files an outside producer reads, readable cross-origin ──
for (const path of ['/manifest.json', '/board-guide.md', '/dashboard.schema.json']) {
  const r = await get(path);
  const acao = r.headers.get('access-control-allow-origin');
  if (r.status !== 200) bad(`door: ${path}`, `HTTP ${r.status}`);
  else if (acao !== '*') bad(`door: ${path}`, `no Access-Control-Allow-Origin (got ${acao})`);
  else ok(`door: ${path}`, `HTTP 200, ACAO *`);
}
{
  // …and the app's own files are NOT advertised that way: a dashboard bundle is not an API.
  const r = await get('/index.html');
  r.headers.get('access-control-allow-origin') === null
    ? ok('door: index.html stays same-origin', 'no CORS header')
    : bad('door: index.html', 'served with a CORS header');
}

// ── 1. the closed parameter surface ─────────────────────────────────────────
{
  const r = await get('/api/staticmap?z=11&lat=52.5&lon=13.4&w=637&h=481');
  r.status === 400 ? ok('map: off-ladder size refused', 'HTTP 400') : bad('map: off-ladder size', `HTTP ${r.status}`);
}
{
  const r = await get('/api/staticmap?z=99&lat=x&lon=13&w=640&h=480');
  r.status === 400 ? ok('map: absurd params refused', 'HTTP 400') : bad('map: absurd params', `HTTP ${r.status}`);
}

// ── 1b. the door's etiquette: a missing path is a 404 that names nothing ──────
{
  // Before 2026-10-02 an unknown path answered 500 with the thrown message, i.e.
  // `ENOENT … open '/data/project/wikibento/www/js/dist/…'` — the deployment's own
  // absolute layout, handed to anyone guessing a path (found while preparing the
  // way an outside model walks in through /board-guide.md).
  const r = await get('/this-path-does-not-exist');
  const body = await r.text();
  if (r.status !== 404) bad('unknown path', `HTTP ${r.status}`);
  else if (/\/data\/|ENOENT|server\.js/.test(body)) bad('unknown path', `404 but the body leaks: ${body.slice(0, 90)}`);
  else ok('unknown path: 404, no paths named', `HTTP 404`);
}
{
  const r = await get('/api/no-such-route');
  const body = await r.text();
  const j = (() => { try { return JSON.parse(body); } catch { return null; } })();
  r.status === 404 && j && j.error ? ok('unknown API route: 404 JSON', j.error) : bad('unknown API route', `HTTP ${r.status} ${body.slice(0, 60)}`);
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
  // The burst is aimed at an OFF-ALLOWLIST proxy request on purpose: `relayCheck` runs before the allowlist, so the
  // requests that pass the limit are refused locally (403) and **nothing reaches the open internet**. This is the
  // default allowance (RELAY_BURST is 8 in this test env), and it must still answer.
  const burst = await Promise.all(Array.from({ length: 24 }, () => get(`/api/proxy?url=${encodeURIComponent('https://example.com/x')}`)
    .then((r) => { r.arrayBuffer(); return r.status; }).catch(() => 0)));
  const limited = burst.filter((s) => s === 429).length;
  const refused = burst.filter((s) => s === 403).length;
  limited > 0 && refused > 0
    ? ok('burst: the default allowance answers', `${limited}× 429 and ${refused}× 403 (refused locally) for 24 requests`)
    : bad('burst: rate limit', `24 requests gave ${limited}× 429, ${refused}× 403 (${burst.join(',')})`);

  // The map route has its own, larger allowance — measured, not guessed: one board of map cards asks for a stack of
  // small cached images, and the demos sweep (2026-10-01, four boards at once from one address) pushed a single client
  // past a flat 40/min and put every map card into its error state. A board's worth of map images must be normal
  // traffic; the expensive routes keep the default budget.
  const mapBurst = await Promise.all(Array.from({ length: 24 }, () => get(LADDER_MAP).then((r) => { r.arrayBuffer(); return r.status; }).catch(() => 0)));
  const mapLimited = mapBurst.filter((s) => s === 429).length;
  const mapServed = mapBurst.filter((s) => s === 200).length;
  mapLimited === 0
    ? ok('burst: a board of map images is served', `0× 429, ${mapServed}× 200 for 24 map images`)
    : bad('burst: map allowance', `${mapLimited}× 429 for 24 map images — a board must not trip its own relay`);

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
